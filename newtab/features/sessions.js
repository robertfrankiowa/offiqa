// ===== SESSIONS =====
let sessionsCache = [];

async function loadSessions() {
  const data = await store.get(['sessions']);
  const sessions = data.sessions || [];
  sessionsCache = sessions;
  const el = document.getElementById('session-list');
  const onboarding = document.getElementById('session-onboarding');

  if (sessions.length === 0) {
    if (onboarding) onboarding.style.display = '';
    // Remove any session items if re-rendering
    el.querySelectorAll('.session-item').forEach(n => n.remove());
    return;
  }

  if (onboarding) onboarding.style.display = 'none';

  // Keep onboarding in DOM, only update session items
  const existingItems = el.querySelectorAll('.session-item');
  existingItems.forEach(n => n.remove());
  const fragment = document.createDocumentFragment();
  sessions.forEach((s, i) => {
    const div = document.createElement('div');
    div.className = 'session-item';
    div.dataset.index = i;
    div.innerHTML = `
      <span class="session-icon">${s.icon || '💼'}</span>
      <span class="session-name">${escHtml(s.name)}</span>
      <span class="session-count">${s.tabs?.length || 0} ${currentLanguage === 'es' ? 'pestañas' : currentLanguage === 'en' ? 'tabs' : 'tab'}</span>
      <button type="button" class="session-delete-btn" data-action="delete-session" data-index="${i}" style="border:none;background:none;cursor:pointer;color:#9ca3af;font-size:16px">×</button>
    `;
    fragment.appendChild(div);
  });
  el.appendChild(fragment);
}

window.openSession = async (i) => {
  const data = await store.get(['sessions']);
  const s = (data.sessions || [])[i];
  if (!s) return;
  s.tabs?.forEach(tab => chrome.tabs.create({ url: tab.url }));
};

window.deleteSession = async (i) => {
  const data = await store.get(['sessions']);
  const sessions = data.sessions || [];
  sessions.splice(i, 1);
  await store.set({ sessions });
  await loadSessions();
  renderMorningBrief();
};

// Session v2 listener is attached later.

async function saveCurrentSession() {
  const tabs = await new Promise(r => chrome.tabs.query({ currentWindow: true }, r));
  const defaultSessionName = currentLanguage === 'es'
    ? `Sesión ${new Date().toLocaleTimeString(getLanguageLocale())}`
    : currentLanguage === 'en'
      ? `Session ${new Date().toLocaleTimeString(getLanguageLocale())}`
      : `Phiên ${new Date().toLocaleTimeString(getLanguageLocale())}`;
  const name = prompt(localizeNewTabPromptLabel('Tên phiên:'), defaultSessionName);
  if (!name) return;
  const data = await store.get(['sessions']);
  const sessions = data.sessions || [];
  sessions.unshift({
    id: Date.now().toString(),
    name,
    icon: '💼',
    tabs: tabs.map(t => ({ url: t.url, title: t.title })),
    created: Date.now()
  });
  await store.set({ sessions });
  await loadSessions();
  renderMorningBrief();
}

document.getElementById('session-list').addEventListener('click', (e) => {
  const deleteBtn = e.target.closest('[data-action="delete-session"]');
  if (deleteBtn) {
    deleteSession(Number(deleteBtn.dataset.index));
    return;
  }

  const sessionItem = e.target.closest('.session-item[data-index]');
  if (sessionItem) {
    openSession(Number(sessionItem.dataset.index));
  }
});

// ===== SESSION V2 =====
const SESSION_STORAGE_KEY = 'sessions';
const ACTIVE_SESSION_KEY = 'active_session_id';
let pendingResumeSessionId = null;
let pendingResumeMode = 'resume';
let resumeCountdownTimer = null;
let resumeCountdownRemaining = 0;
let pendingResumeTabs = [];
let sessionSaveDraftTabs = [];
let sessionSaveDraftWindowCount = 1;
let sessionLoadRequestId = 0;

function formatSessionDefaultName(date = new Date()) {
  return currentLanguage === 'es'
    ? `Sesión ${date.toLocaleTimeString(getLanguageLocale(), { hour: '2-digit', minute: '2-digit' })}`
    : currentLanguage === 'en'
      ? `Session ${date.toLocaleTimeString(getLanguageLocale(), { hour: '2-digit', minute: '2-digit' })}`
      : `Phiên ${date.toLocaleTimeString(getLanguageLocale(), { hour: '2-digit', minute: '2-digit' })}`;
}

function normalizeSession(raw, index = 0) {
  const created = Number(raw?.created) || Date.now() - index;
  const updatedAt = Number(raw?.updatedAt) || created;
  const lastOpenedAt = Number(raw?.lastOpenedAt) || updatedAt;
  const tabs = Array.isArray(raw?.tabs)
    ? raw.tabs.filter((tab) => tab?.url).map((tab) => ({
        url: tab.url,
        title: tab.title || tab.url,
        favIconUrl: tab.favIconUrl || '',
        pinned: Boolean(tab.pinned)
      }))
    : [];

  return {
    id: raw?.id || `session-${created}-${index}`,
    name: raw?.name || formatSessionDefaultName(new Date(created)),
    icon: raw?.icon || '💼',
    tabs,
    created,
    updatedAt,
    lastOpenedAt,
    handoffNote: String(raw?.handoffNote || raw?.handoff || '').trim(),
    nextStep: String(raw?.nextStep || '').trim(),
    windowCount: Number(raw?.windowCount) || 1,
    autoSnapshot: Boolean(raw?.autoSnapshot),
    snapshotType: raw?.snapshotType || 'manual'
  };
}

function isOffiqaUrl(url = '') {
  return typeof url === 'string' && (
    url.startsWith(chrome.runtime.getURL('')) ||
    url.startsWith('chrome-extension://')
  );
}

function isCapturableTab(tab) {
  const url = tab?.url || tab?.pendingUrl || '';
  const title = String(tab?.title || '').trim().toLowerCase();
  if (!url) return false;
  if (isOffiqaUrl(url)) return false;
  if (url.includes('/newtab/newtab.html')) return false;
  if (title === 'offiqa home' || title === 'offiqa') return false;
  return !(
    url.startsWith('chrome://') ||
    url.startsWith('chrome-search://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('devtools://')
  );
}

async function getSessionsState() {
  const data = await store.get([SESSION_STORAGE_KEY, ACTIVE_SESSION_KEY]);
  const rawSessions = Array.isArray(data[SESSION_STORAGE_KEY]) ? data[SESSION_STORAGE_KEY] : [];
  const sessions = rawSessions.map(normalizeSession);
  const needsMigration = rawSessions.some((raw, index) => {
    const normalized = sessions[index];
    return raw?.id !== normalized.id
      || raw?.updatedAt !== normalized.updatedAt
      || raw?.lastOpenedAt !== normalized.lastOpenedAt
      || raw?.handoffNote !== normalized.handoffNote
      || raw?.nextStep !== normalized.nextStep
      || raw?.windowCount !== normalized.windowCount;
  });

  if (needsMigration) {
    await store.set({ [SESSION_STORAGE_KEY]: sessions });
  }

  return {
    sessions,
    activeSessionId: data[ACTIVE_SESSION_KEY] || ''
  };
}

async function persistSessions(sessions, activeSessionId) {
  const payload = { [SESSION_STORAGE_KEY]: sessions };
  if (typeof activeSessionId !== 'undefined') {
    payload[ACTIVE_SESSION_KEY] = activeSessionId;
  }
  await store.set(payload);
}

async function captureSessionTabs({ allWindows = false } = {}) {
  const tabs = await new Promise((resolve) => chrome.tabs.query(allWindows ? {} : { currentWindow: true }, resolve));
  const captured = tabs
    .filter(isCapturableTab)
    .map((tab) => ({
      url: tab.url,
      title: tab.title || tab.url,
      favIconUrl: tab.favIconUrl || '',
      pinned: Boolean(tab.pinned),
      windowId: tab.windowId
    }));

  return {
    tabs: captured.map(({ windowId, ...tab }) => tab),
    windowCount: Math.max(1, new Set(captured.map((tab) => tab.windowId)).size),
    tabCount: captured.length
  };
}

function truncateSessionText(text, max = 90) {
  const clean = String(text || '').trim();
  if (!clean) return '';
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function simplifyTabUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  } catch {
    return String(url || '');
  }
}

function normalizeSessionComparableUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).href;
  } catch {
    return raw;
  }
}

function buildSessionUrlCountMap(tabs = []) {
  const counts = new Map();
  tabs.forEach((tab) => {
    const url = normalizeSessionComparableUrl(tab?.url);
    if (!url) return;
    counts.set(url, (counts.get(url) || 0) + 1);
  });
  return counts;
}

function countExactOpenSessionTabs(sessionTabs = [], openUrlCounts = new Map()) {
  const remainingCounts = new Map(openUrlCounts);
  let matchedCount = 0;

  sessionTabs.forEach((tab) => {
    const url = normalizeSessionComparableUrl(tab?.url);
    if (!url) return;

    const remaining = remainingCounts.get(url) || 0;
    if (remaining <= 0) return;

    matchedCount += 1;
    if (remaining === 1) remainingCounts.delete(url);
    else remainingCounts.set(url, remaining - 1);
  });

  return matchedCount;
}

async function getSessionRuntimeState(sessions, activeSessionId = '') {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return {
      openSessionId: '',
      liveTabCountBySessionId: {}
    };
  }

  const capture = await captureSessionTabs({ allWindows: false });
  const openUrlCounts = buildSessionUrlCountMap(capture.tabs);
  const liveTabCountBySessionId = {};

  sessions.forEach((session) => {
    liveTabCountBySessionId[session.id] = countExactOpenSessionTabs(session.tabs, openUrlCounts);
  });

  let openSessionId = '';

  if (activeSessionId && (liveTabCountBySessionId[activeSessionId] || 0) > 0) {
    openSessionId = activeSessionId;
  } else {
    const bestMatch = sessions.reduce((best, session) => {
      const matchedCount = liveTabCountBySessionId[session.id] || 0;
      if (matchedCount <= 0) return best;

      const coverage = session.tabs.length > 0 ? matchedCount / session.tabs.length : 0;
      if (!best) return { id: session.id, matchedCount, coverage };
      if (matchedCount > best.matchedCount) return { id: session.id, matchedCount, coverage };
      if (matchedCount === best.matchedCount && coverage > best.coverage) {
        return { id: session.id, matchedCount, coverage };
      }
      return best;
    }, null);

    openSessionId = bestMatch?.id || '';
  }

  return {
    openSessionId,
    liveTabCountBySessionId
  };
}

function formatSessionRelativeTime(timestamp) {
  if (!timestamp) return 'Chưa cập nhật';
  const then = new Date(timestamp);
  const now = new Date();
  const sameDay = then.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const time = then.toLocaleTimeString(getLanguageLocale(), { hour: '2-digit', minute: '2-digit' });

  if (sameDay) return `hôm nay ${time}`;
  if (then.toDateString() === yesterday.toDateString()) return `hôm qua ${time}`;

  const diffDays = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(then.getFullYear(), then.getMonth(), then.getDate())) / 86400000);
  if (diffDays > 1 && diffDays < 7) return `${diffDays} ngày trước`;
  return then.toLocaleDateString(getLanguageLocale(), { day: '2-digit', month: '2-digit' });
}

function buildSessionContextLine(label, value, emptyText) {
  const content = value
    ? escHtml(truncateSessionText(value))
    : `<span style="color:#9ca3af">${escHtml(emptyText)}</span>`;
  return `<div class="session-context-line"><span class="session-context-label">${label}</span>${content}</div>`;
}

function renderSessionList(sessions, activeSessionId, runtimeState = {}) {
  const el = document.getElementById('session-list');
  const onboarding = document.getElementById('session-onboarding');
  const existingItems = el.querySelectorAll('.session-item');
  existingItems.forEach((node) => node.remove());

  if (sessions.length === 0) {
    if (onboarding) onboarding.style.display = '';
    return;
  }

  if (onboarding) onboarding.style.display = 'none';

  const fragment = document.createDocumentFragment();
  const openSessionId = runtimeState.openSessionId || '';
  const liveTabCountBySessionId = runtimeState.liveTabCountBySessionId || {};
  sessions.forEach((session, index) => {
    const isOpenNow = session.id === openSessionId;
    const matchedOpenTabCount = liveTabCountBySessionId[session.id] || 0;
    const displayTabCount = isOpenNow ? matchedOpenTabCount : session.tabs.length;
    const div = document.createElement('div');
    div.className = `session-item${isOpenNow ? ' is-active' : ''}`;
    div.dataset.index = index;
    div.dataset.sessionId = session.id;
    div.innerHTML = `
      <span class="session-icon">${session.icon}</span>
      <div class="session-body">
        <div class="session-topline">
          <span class="session-name">${escHtml(session.name)}</span>
          ${isOpenNow ? '<span class="session-chip">Đang mở</span>' : ''}
          ${session.autoSnapshot ? '<span class="session-chip">Tự lưu</span>' : ''}
          <span class="session-count">${displayTabCount} tab</span>
          ${session.windowCount > 1 ? `<span class="session-window-count">${session.windowCount} cửa sổ</span>` : ''}
        </div>
        <div class="session-context">
          ${buildSessionContextLine('Đang dở:', session.handoffNote, 'Chưa ghi handoff')}
          ${buildSessionContextLine('Tiếp theo:', session.nextStep, 'Chưa có bước tiếp theo')}
        </div>
        <div class="session-meta-row">
          <span>Lần cuối: ${escHtml(formatSessionRelativeTime(session.lastOpenedAt || session.updatedAt))}</span>
          <span>Cập nhật: ${escHtml(formatSessionRelativeTime(session.updatedAt))}</span>
        </div>
      </div>
      <button type="button" class="session-delete-btn" data-action="delete-session" data-index="${index}" title="Xóa phiên">×</button>
    `;
    fragment.appendChild(div);
  });

  el.appendChild(fragment);
}

async function loadSessions() {
  const requestId = ++sessionLoadRequestId;
  const { sessions, activeSessionId } = await getSessionsState();
  const runtimeState = await getSessionRuntimeState(sessions, activeSessionId);
  if (requestId !== sessionLoadRequestId) return;
  sessionsCache = sessions;
  renderSessionList(sessions, activeSessionId, runtimeState);
}

let sessionRuntimeRefreshTimer = null;

function scheduleSessionRuntimeRefresh() {
  clearTimeout(sessionRuntimeRefreshTimer);
  sessionRuntimeRefreshTimer = setTimeout(() => {
    loadSessions();
  }, 120);
}

function renderSessionSaveTabDraft() {
  const list = document.getElementById('session-save-tab-list');
  const meta = document.getElementById('session-save-tab-meta');
  const confirmBtn = document.getElementById('session-save-confirm');
  if (!list || !meta || !confirmBtn) return;

  const tabCount = sessionSaveDraftTabs.length;
  meta.textContent = `${tabCount} tab${sessionSaveDraftWindowCount > 1 ? ` · ${sessionSaveDraftWindowCount} cua so` : ''}`;
  confirmBtn.disabled = tabCount === 0;

  if (tabCount === 0) {
    list.innerHTML = '<div class="session-save-tab-empty">Không còn tab nào để lưu. Hãy giữ lại ít nhất 1 tab công việc.</div>';
    return;
  }

  list.innerHTML = sessionSaveDraftTabs.map((tab, index) => `
    <div class="session-save-tab-item">
      <span class="session-save-tab-index">${index + 1}</span>
      <div class="session-save-tab-body">
        <div class="session-save-tab-name">${escHtml(truncateSessionText(tab.title || tab.url, 90))}</div>
        <div class="session-save-tab-url">${escHtml(simplifyTabUrl(tab.url))}</div>
      </div>
      <button
        type="button"
        class="session-save-tab-remove"
        data-action="remove-session-draft-tab"
        data-index="${index}"
        title="Gỡ tab này khỏi phiên"
        aria-label="Gỡ tab này khỏi phiên"
      >×</button>
    </div>
  `).join('');
}

function formatSessionResumeConfirmLabel(tabCount, remaining = 0) {
  if (tabCount <= 0) return 'Không còn tab để mở';
  if (remaining > 0) return `Mở ${tabCount} tab (${remaining}s)`;
  return `Mở ${tabCount} tab`;
}

function renderSessionResumeDraft(session) {
  const tabs = document.getElementById('session-resume-tabs');
  const meta = document.getElementById('session-resume-meta');
  const confirmBtn = document.getElementById('session-resume-confirm');
  if (!tabs || !meta || !confirmBtn || !session) return;

  const tabCount = pendingResumeTabs.length;
  meta.textContent = `Lan cuoi: ${formatSessionRelativeTime(session.lastOpenedAt || session.updatedAt)} · ${tabCount} tab${session.windowCount > 1 ? ` · ${session.windowCount} cua so` : ''}`;

  if (tabCount === 0) {
    tabs.innerHTML = '<div class="session-modal-tab-empty">Không còn tab nào trong phiên này. Bạn có thể đóng modal và xóa phiên nếu không còn cần nữa.</div>';
  } else {
    tabs.innerHTML = pendingResumeTabs.map((tab, index) => `
      <div class="session-modal-tab-item">
        <span class="session-modal-tab-index">${index + 1}</span>
        <div class="session-modal-tab-body">
          <div class="session-modal-tab-name">${escHtml(truncateSessionText(tab.title || tab.url, 90))}</div>
          <div class="session-modal-tab-url">${escHtml(simplifyTabUrl(tab.url))}</div>
        </div>
        <button
          type="button"
          class="session-modal-tab-remove"
          data-action="remove-session-resume-tab"
          data-index="${index}"
          title="${tabCount === 1 ? 'Cần giữ lại ít nhất 1 tab trong phiên' : 'Gỡ tab này khỏi phiên'}"
          aria-label="${tabCount === 1 ? 'Cần giữ lại ít nhất 1 tab trong phiên' : 'Gỡ tab này khỏi phiên'}"
          ${tabCount === 1 ? 'disabled' : ''}
        >×</button>
      </div>
    `).join('');
  }

  confirmBtn.disabled = tabCount === 0 || resumeCountdownRemaining > 0;
  confirmBtn.textContent = formatSessionResumeConfirmLabel(tabCount, resumeCountdownRemaining);
}

function startSessionResumeCountdown(session) {
  resumeCountdownRemaining = 3;
  renderSessionResumeDraft(session);
  if (resumeCountdownTimer) clearInterval(resumeCountdownTimer);
  resumeCountdownTimer = setInterval(() => {
    resumeCountdownRemaining -= 1;
    if (resumeCountdownRemaining > 0) {
      renderSessionResumeDraft(session);
      return;
    }
    clearInterval(resumeCountdownTimer);
    resumeCountdownTimer = null;
    resumeCountdownRemaining = 0;
    renderSessionResumeDraft(session);
  }, 1000);
}

function toggleSessionSavePanel(show, defaults = {}) {
  const modal = document.getElementById('session-save-modal');
  const backdrop = document.getElementById('session-modal-backdrop');
  const nameInput = document.getElementById('session-name-input');
  const handoffInput = document.getElementById('session-handoff-input');
  const nextStepInput = document.getElementById('session-next-step-input');
  const feedback = document.getElementById('session-save-feedback');
  if (!modal || !backdrop || !nameInput || !handoffInput || !nextStepInput || !feedback) return;

  modal.hidden = !show;
  modal.setAttribute('aria-hidden', show ? 'false' : 'true');
  backdrop.hidden = !show ? backdrop.hidden : false;
  feedback.textContent = '';
  feedback.className = 'session-save-feedback';

  if (show) {
    backdrop.hidden = false;
    nameInput.value = defaults.name || '';
    handoffInput.value = defaults.handoffNote || '';
    nextStepInput.value = defaults.nextStep || '';
    sessionSaveDraftTabs = Array.isArray(defaults.tabs) ? defaults.tabs.map((tab) => ({ ...tab })) : [];
    sessionSaveDraftWindowCount = Number(defaults.windowCount) || 1;
    renderSessionSaveTabDraft();
    setTimeout(() => nameInput.focus(), 0);
    return;
  }

  nameInput.value = '';
  handoffInput.value = '';
  nextStepInput.value = '';
  sessionSaveDraftTabs = [];
  sessionSaveDraftWindowCount = 1;
  renderSessionSaveTabDraft();
  closeSessionModalBackdropIfIdle();
}

async function openSessionSavePanel() {
  const capture = await captureSessionTabs({ allWindows: false });
  toggleSessionSavePanel(true, {
    tabs: capture.tabs,
    windowCount: capture.windowCount
  });
}

function setSessionSaveFeedback(message, tone = '') {
  const feedback = document.getElementById('session-save-feedback');
  if (!feedback) return;
  feedback.textContent = message;
  feedback.className = `session-save-feedback${tone ? ` is-${tone}` : ''}`;
}

async function saveCurrentSession(options = {}) {
  const {
    allWindows = false,
    defaultName = formatSessionDefaultName(),
    handoffNote = '',
    nextStep = '',
    autoSnapshot = false,
    snapshotType = 'manual',
    existingSessionId = '',
    activate = true,
    silent = false
  } = options;

  const name = String(options.name || defaultName).trim();
  const capture = options.tabs
    ? {
        tabs: Array.isArray(options.tabs) ? options.tabs.map((tab) => ({ ...tab })) : [],
        windowCount: Number(options.windowCount) || 1,
        tabCount: Array.isArray(options.tabs) ? options.tabs.length : 0
      }
    : await captureSessionTabs({ allWindows });

  if (!capture.tabCount) {
    if (!silent) setSessionSaveFeedback('Không có tab công việc để lưu.', 'error');
    return null;
  }

  const { sessions, activeSessionId } = await getSessionsState();
  const previous = existingSessionId ? sessions.find((item) => item.id === existingSessionId) : null;
  const timestamp = Date.now();
  const session = normalizeSession({
    ...previous,
    id: existingSessionId || timestamp.toString(),
    name: name || previous?.name || formatSessionDefaultName(new Date(timestamp)),
    icon: '💼',
    tabs: capture.tabs,
    created: previous?.created || timestamp,
    updatedAt: timestamp,
    lastOpenedAt: previous?.lastOpenedAt || timestamp,
    handoffNote,
    nextStep,
    windowCount: capture.windowCount,
    autoSnapshot,
    snapshotType
  });

  const existingIndex = sessions.findIndex((item) => item.id === session.id);
  if (existingIndex >= 0) sessions[existingIndex] = session;
  else sessions.unshift(session);

  await persistSessions(sessions, activate ? session.id : activeSessionId);
  await loadSessions();
  renderMorningBrief();

  if (!silent) {
    setSessionSaveFeedback('Đã lưu phiên và handoff note.', 'success');
  }

  return session;
}

async function pauseCurrentWorkspace(targetSessionId = '') {
  const { sessions, activeSessionId } = await getSessionsState();
  const capture = await captureSessionTabs({ allWindows: false });
  if (!capture.tabCount) return activeSessionId;
  if (activeSessionId && activeSessionId === targetSessionId) return activeSessionId;

  const timestamp = Date.now();

  if (activeSessionId && activeSessionId !== targetSessionId) {
    const currentIndex = sessions.findIndex((item) => item.id === activeSessionId);
    if (currentIndex >= 0) {
      sessions[currentIndex] = normalizeSession({
        ...sessions[currentIndex],
        tabs: capture.tabs,
        updatedAt: timestamp,
        windowCount: capture.windowCount
      });
      await persistSessions(sessions, activeSessionId);
      return activeSessionId;
    }
  }

  const autoSession = normalizeSession({
    id: `auto-${timestamp}`,
    name: currentLanguage === 'es'
      ? `Pausa ${new Date(timestamp).toLocaleTimeString(getLanguageLocale(), { hour: '2-digit', minute: '2-digit' })}`
      : currentLanguage === 'en'
        ? `Break ${new Date(timestamp).toLocaleTimeString(getLanguageLocale(), { hour: '2-digit', minute: '2-digit' })}`
        : `Tạm dừng ${new Date(timestamp).toLocaleTimeString(getLanguageLocale(), { hour: '2-digit', minute: '2-digit' })}`,
    icon: '💼',
    tabs: capture.tabs,
    created: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: timestamp,
    handoffNote: '',
    nextStep: '',
    windowCount: capture.windowCount,
    autoSnapshot: true,
    snapshotType: 'switch'
  });
  sessions.unshift(autoSession);
  await persistSessions(sessions, autoSession.id);
  return autoSession.id;
}

async function loadSessionIntoCurrentWindow(session) {
  const [currentTab] = await new Promise((resolve) => chrome.tabs.query({ active: true, currentWindow: true }, resolve));
  const currentTabs = await new Promise((resolve) => chrome.tabs.query({ currentWindow: true }, resolve));
  const windowId = currentTab?.windowId || currentTabs[0]?.windowId;
  const existingWorkTabIds = currentTabs
    .filter((tab) => tab.id !== currentTab?.id && isCapturableTab(tab))
    .map((tab) => tab.id)
    .filter(Boolean);

  for (let index = 0; index < session.tabs.length; index += 1) {
    const tab = session.tabs[index];
    await new Promise((resolve) => chrome.tabs.create({
      windowId,
      url: tab.url,
      active: index === 0
    }, resolve));
  }

  if (existingWorkTabIds.length > 0) {
    await new Promise((resolve) => chrome.tabs.remove(existingWorkTabIds, () => resolve()));
  }
}

async function openSessionById(sessionId, mode = 'resume', tabsOverride = null) {
  const { sessions } = await getSessionsState();
  const session = sessions.find((item) => item.id === sessionId);
  if (!session) return;

  const tabsToOpen = Array.isArray(tabsOverride) && tabsOverride.length
    ? tabsOverride.map((tab) => ({ ...tab }))
    : session.tabs;
  if (!tabsToOpen.length) return;

  await pauseCurrentWorkspace(sessionId);

  const { sessions: latestSessions } = await getSessionsState();
  const refreshedSession = latestSessions.find((item) => item.id === sessionId) || session;
  const sessionToOpen = normalizeSession({
    ...refreshedSession,
    tabs: tabsToOpen
  });
  await loadSessionIntoCurrentWindow(sessionToOpen);
  const updatedSessions = latestSessions.map((item) => item.id === sessionId
    ? normalizeSession({
        ...item,
        tabs: sessionToOpen.tabs,
        updatedAt: item.tabs.length !== sessionToOpen.tabs.length ? Date.now() : item.updatedAt,
        lastOpenedAt: Date.now()
      })
    : item);
  await persistSessions(updatedSessions, sessionId);
  closeSessionResumeModal();
  await loadSessions();
  renderMorningBrief();
}

function closeSessionModalBackdropIfIdle() {
  const resumeModal = document.getElementById('session-resume-modal');
  const saveModal = document.getElementById('session-save-modal');
  const backdrop = document.getElementById('session-modal-backdrop');
  if (!resumeModal || !saveModal || !backdrop) return;
  if (!resumeModal.hidden || !saveModal.hidden) return;
  backdrop.hidden = true;
}

function closeSessionSaveModal() {
  toggleSessionSavePanel(false);
}

function closeSessionResumeModal() {
  const modal = document.getElementById('session-resume-modal');
  const confirmBtn = document.getElementById('session-resume-confirm');
  if (!modal || !confirmBtn) return;
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  pendingResumeSessionId = null;
  pendingResumeMode = 'resume';
  pendingResumeTabs = [];
  if (resumeCountdownTimer) {
    clearInterval(resumeCountdownTimer);
    resumeCountdownTimer = null;
  }
  resumeCountdownRemaining = 0;
  confirmBtn.disabled = false;
  confirmBtn.textContent = 'Mở phiên';
  closeSessionModalBackdropIfIdle();
}

function showSessionResumeModal(sessionId, mode = 'resume') {
  const session = sessionsCache.find((item) => item.id === sessionId);
  if (!session) return;

  const backdrop = document.getElementById('session-modal-backdrop');
  const modal = document.getElementById('session-resume-modal');
  const kicker = document.getElementById('session-resume-kicker');
  const title = document.getElementById('session-resume-title');
  const handoff = document.getElementById('session-resume-handoff');
  const nextStep = document.getElementById('session-resume-next-step');
  if (!backdrop || !modal || !kicker || !title || !handoff || !nextStep) return;

  pendingResumeSessionId = sessionId;
  pendingResumeMode = mode;
  pendingResumeTabs = Array.isArray(session.tabs) ? session.tabs.map((tab) => ({ ...tab })) : [];
  backdrop.hidden = false;
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  kicker.textContent = 'Tiếp tục phiên';
  title.textContent = session.name;
  handoff.textContent = session.handoffNote || 'Chưa có handoff note. Bạn sẽ quay lại với đúng bộ tab, nhưng context chưa được ghi lại.';
  nextStep.textContent = session.nextStep || 'Chưa có bước tiếp theo. Có thể thêm khi lưu phiên tiếp theo.';
  startSessionResumeCountdown(session);
}

async function saveEndOfDaySnapshot() {
  const today = new Date();
  const id = `snapshot-${todayStr()}`;
  const name = currentLanguage === 'es'
    ? `Snapshot final del día ${today.toLocaleDateString(getLanguageLocale(), { day: '2-digit', month: '2-digit' })}`
    : currentLanguage === 'en'
      ? `End-of-day snapshot ${today.toLocaleDateString(getLanguageLocale(), { day: '2-digit', month: '2-digit' })}`
      : `Snapshot cuối ngày ${today.toLocaleDateString(getLanguageLocale(), { day: '2-digit', month: '2-digit' })}`;
  const saved = await saveCurrentSession({
    allWindows: true,
    name,
    defaultName: name,
    existingSessionId: id,
    activate: false,
    autoSnapshot: true,
    snapshotType: 'end_of_day',
    silent: true
  });

  if (saved) {
    const feedback = document.getElementById('morning-brief');
    if (feedback) {
      feedback.dataset.eodSavedAt = String(Date.now());
    }
  }
}

window.openSession = async (index) => {
  const session = sessionsCache[index];
  if (!session) return;
  showSessionResumeModal(session.id, 'resume');
};

window.deleteSession = async (index) => {
  const { sessions, activeSessionId } = await getSessionsState();
  const target = sessions[index];
  if (!target) return;
  const nextSessions = sessions.filter((_, i) => i !== index);
  await persistSessions(nextSessions, activeSessionId === target.id ? '' : activeSessionId);
  await loadSessions();
  renderMorningBrief();
};

document.getElementById('btn-save-session')?.addEventListener('click', () => {
  openSessionSavePanel();
});

document.getElementById('btn-onboarding-save')?.addEventListener('click', () => {
  openSessionSavePanel();
});

document.getElementById('session-save-tab-list')?.addEventListener('click', (e) => {
  const removeBtn = e.target.closest('[data-action="remove-session-draft-tab"]');
  if (!removeBtn) return;
  const index = Number(removeBtn.dataset.index);
  if (Number.isNaN(index)) return;
  sessionSaveDraftTabs.splice(index, 1);
  setSessionSaveFeedback('');
  renderSessionSaveTabDraft();
});

document.getElementById('session-resume-tabs')?.addEventListener('click', async (e) => {
  const removeBtn = e.target.closest('[data-action="remove-session-resume-tab"]');
  if (!removeBtn || !pendingResumeSessionId || removeBtn.disabled) return;

  const index = Number(removeBtn.dataset.index);
  if (Number.isNaN(index) || pendingResumeTabs.length <= 1) return;

  pendingResumeTabs.splice(index, 1);

  const { sessions, activeSessionId } = await getSessionsState();
  const updatedAt = Date.now();
  const nextSessions = sessions.map((session) => session.id === pendingResumeSessionId
    ? normalizeSession({
        ...session,
        tabs: pendingResumeTabs,
        updatedAt
      })
    : session);

  await persistSessions(nextSessions, activeSessionId);
  sessionsCache = nextSessions;

  const updatedSession = nextSessions.find((session) => session.id === pendingResumeSessionId);
  if (updatedSession) {
    renderSessionResumeDraft(updatedSession);
  }

  await loadSessions();
  renderMorningBrief();
});

document.getElementById('session-save-confirm')?.addEventListener('click', async () => {
  const name = document.getElementById('session-name-input').value.trim();
  const handoffNote = document.getElementById('session-handoff-input').value.trim();
  const nextStep = document.getElementById('session-next-step-input').value.trim();

  if (sessionSaveDraftTabs.length === 0) {
    setSessionSaveFeedback('Hãy giữ lại ít nhất 1 tab trước khi lưu phiên.', 'error');
    return;
  }

  const { sessions, activeSessionId } = await getSessionsState();
  const activeSession = sessions.find((session) => session.id === activeSessionId);
  const existingSessionId = activeSession && normalizeComparableText(activeSession.name) === normalizeComparableText(name)
    ? activeSession.id
    : '';

  const saved = await saveCurrentSession({
    name,
    handoffNote,
    nextStep,
    existingSessionId,
    tabs: sessionSaveDraftTabs,
    windowCount: sessionSaveDraftWindowCount
  });
  if (saved) {
    toggleSessionSavePanel(false);
  }
});

document.getElementById('session-modal-backdrop')?.addEventListener('click', () => {
  closeSessionSaveModal();
  closeSessionResumeModal();
});

document.getElementById('session-save-close')?.addEventListener('click', closeSessionSaveModal);
document.getElementById('session-save-cancel')?.addEventListener('click', closeSessionSaveModal);
document.getElementById('session-resume-close')?.addEventListener('click', closeSessionResumeModal);
document.getElementById('session-resume-cancel')?.addEventListener('click', closeSessionResumeModal);

document.getElementById('session-resume-confirm')?.addEventListener('click', async () => {
  if (!pendingResumeSessionId) return;
  await openSessionById(pendingResumeSessionId, pendingResumeMode, pendingResumeTabs);
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  closeSessionSaveModal();
  closeSessionResumeModal();
});



window.offiqaNewtabFeatureInitializers = window.offiqaNewtabFeatureInitializers || {};
window.offiqaNewtabFeatureInitializers.sessions = async () => {
  await loadSessions();
};
