// ===== SESSIONS SIDEBAR =====
let sessionSidebarItems = [];
let activeSidebarSessionId = '';

function normalizeSessionSidebarRecord(raw, index = 0) {
  const created = Number(raw?.created) || Date.now() - index;
  const updatedAt = Number(raw?.updatedAt) || created;
  const lastOpenedAt = Number(raw?.lastOpenedAt) || updatedAt;
  const tabs = Array.isArray(raw?.tabs)
    ? raw.tabs.filter((tab) => tab?.url).map((tab) => ({
        url: String(tab.url || ''),
        title: String(tab.title || tab.url || ''),
        favIconUrl: String(tab.favIconUrl || ''),
        pinned: Boolean(tab.pinned)
      }))
    : [];

  return {
    id: String(raw?.id || `session-${created}-${index}`),
    name: String(raw?.name || `Phiên ${index + 1}`).trim(),
    icon: String(raw?.icon || '💼'),
    tabs,
    created,
    updatedAt,
    lastOpenedAt,
    handoffNote: String(raw?.handoffNote || raw?.handoff || '').trim(),
    nextStep: String(raw?.nextStep || '').trim(),
    windowCount: Number(raw?.windowCount) || 1,
    autoSnapshot: Boolean(raw?.autoSnapshot)
  };
}

function truncateSessionSidebarText(text, max = 92) {
  const clean = String(text || '').trim();
  if (!clean) return '';
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function simplifySessionSidebarUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  } catch {
    return String(url || '');
  }
}

function formatSessionSidebarRelativeTime(timestamp) {
  if (!timestamp) return 'Chưa cập nhật';
  const then = new Date(timestamp);
  const now = new Date();
  const sameDay = then.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const time = then.toLocaleTimeString(getPopupLanguageLocale(), { hour: '2-digit', minute: '2-digit' });

  if (sameDay) return `hôm nay ${time}`;
  if (then.toDateString() === yesterday.toDateString()) return `hôm qua ${time}`;

  const diffDays = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(then.getFullYear(), then.getMonth(), then.getDate())) / 86400000);
  if (diffDays > 1 && diffDays < 7) return `${diffDays} ngày trước`;
  return then.toLocaleDateString(getPopupLanguageLocale(), { day: '2-digit', month: '2-digit' });
}

async function loadSessionsSidebar() {
  const data = await store.get([SESSION_STORAGE_KEY, ACTIVE_SESSION_KEY]);
  const rawSessions = Array.isArray(data[SESSION_STORAGE_KEY]) ? data[SESSION_STORAGE_KEY] : [];
  sessionSidebarItems = rawSessions
    .map(normalizeSessionSidebarRecord)
    .filter((session) => session.name && session.tabs.length > 0)
    .sort((a, b) => (b.lastOpenedAt || b.updatedAt) - (a.lastOpenedAt || a.updatedAt));
  activeSidebarSessionId = data[ACTIVE_SESSION_KEY] || '';
  renderSessionsSidebar();
}

function renderSessionsSidebar() {
  const badge = document.getElementById('sessions-sidebar-badge');
  const summary = document.getElementById('sessions-sidebar-summary');
  const list = document.getElementById('sessions-sidebar-list');
  if (!badge || !summary || !list) return;

  const totalTabs = sessionSidebarItems.reduce((sum, session) => sum + session.tabs.length, 0);
  const autoCount = sessionSidebarItems.filter((session) => session.autoSnapshot).length;

  badge.textContent = `${sessionSidebarItems.length} phiên`;
  summary.innerHTML = [
    `<span class="sidebar-summary-chip">${sessionSidebarItems.length} phiên</span>`,
    `<span class="sidebar-summary-chip">${totalTabs} tab</span>`,
    autoCount ? `<span class="sidebar-summary-chip">${autoCount} tự lưu</span>` : ''
  ].filter(Boolean).join('');

  if (!sessionSidebarItems.length) {
    list.className = 'scroll-area sidebar-panel-scroll';
    list.innerHTML = `<div class="sidebar-empty-state">${escapeHtml(popupUiText('sessions.empty'))}</div>`;
    return;
  }

  list.className = 'scroll-area sidebar-panel-scroll session-sidebar-list';
  list.innerHTML = sessionSidebarItems.map((session) => {
    const isActive = session.id === activeSidebarSessionId;
    const previewTabs = session.tabs.slice(0, 3);
    const hiddenTabs = Math.max(0, session.tabs.length - previewTabs.length);
    const handoff = session.handoffNote || 'Chưa ghi handoff';
    const nextStep = session.nextStep || popupUiText('sessions.noNextStep');

    return `
      <article class="session-sidebar-item ${isActive ? 'is-active' : ''}" data-session-id="${escapeHtml(session.id)}">
        <div class="session-sidebar-head">
          <div class="session-sidebar-title-row">
            <span class="session-sidebar-icon">${escapeHtml(session.icon)}</span>
            <div class="session-sidebar-title">${escapeHtml(session.name)}</div>
          </div>
          ${isActive ? '<span class="session-sidebar-status">Đang mở</span>' : ''}
        </div>
        <div class="session-sidebar-context">
          <div><span>Đang dở:</span> ${escapeHtml(truncateSessionSidebarText(handoff))}</div>
          <div><span>Tiếp theo:</span> ${escapeHtml(truncateSessionSidebarText(nextStep))}</div>
        </div>
        <div class="session-sidebar-tabs">
          ${previewTabs.map((tab) => `<span class="session-sidebar-tab">${escapeHtml(truncateSessionSidebarText(tab.title || simplifySessionSidebarUrl(tab.url), 42))}</span>`).join('')}
          ${hiddenTabs ? `<span class="session-sidebar-tab">+${hiddenTabs} tab</span>` : ''}
        </div>
        <div class="session-sidebar-meta">
          <span>${session.tabs.length} tab${session.windowCount > 1 ? ` · ${session.windowCount} cửa sổ` : ''}</span>
          <span>Lần cuối: ${escapeHtml(formatSessionSidebarRelativeTime(session.lastOpenedAt || session.updatedAt))}</span>
        </div>
        <div class="session-sidebar-actions">
          <button type="button" class="btn btn-primary btn-sm" data-action="open-session-sidebar" data-session-id="${escapeHtml(session.id)}">Mở phiên</button>
          <button type="button" class="btn btn-sm" data-action="delete-session-sidebar" data-session-id="${escapeHtml(session.id)}">Xóa</button>
        </div>
      </article>
    `;
  }).join('');
}

async function openSessionSidebar(sessionId) {
  const data = await store.get([SESSION_STORAGE_KEY]);
  const rawSessions = Array.isArray(data[SESSION_STORAGE_KEY]) ? data[SESSION_STORAGE_KEY] : [];
  const sessions = rawSessions.map(normalizeSessionSidebarRecord);
  const session = sessions.find((item) => item.id === sessionId);
  if (!session || !session.tabs.length) return;

  const [activeTab] = await new Promise((resolve) => chrome.tabs.query({ active: true, currentWindow: true }, resolve));
  for (let index = 0; index < session.tabs.length; index += 1) {
    const tab = session.tabs[index];
    const createOptions = {
      url: tab.url,
      active: index === 0
    };
    if (activeTab?.windowId) createOptions.windowId = activeTab.windowId;
    await new Promise((resolve) => chrome.tabs.create(createOptions, resolve));
  }

  const updatedAt = Date.now();
  const nextSessions = sessions.map((item) => item.id === sessionId
    ? { ...item, lastOpenedAt: updatedAt }
    : item);
  await store.set({ [SESSION_STORAGE_KEY]: nextSessions, [ACTIVE_SESSION_KEY]: sessionId });
  showToast('Đã mở phiên');
  await loadSessionsSidebar();
}

async function deleteSessionSidebar(sessionId) {
  const data = await store.get([SESSION_STORAGE_KEY, ACTIVE_SESSION_KEY]);
  const sessions = (Array.isArray(data[SESSION_STORAGE_KEY]) ? data[SESSION_STORAGE_KEY] : []).map(normalizeSessionSidebarRecord);
  const session = sessions.find((item) => item.id === sessionId);
  if (!session) return;
  if (!confirm(translatePopupTextValue(`Xóa phiên "${session.name}"?`))) return;

  const nextSessions = sessions.filter((item) => item.id !== sessionId);
  await store.set({
    [SESSION_STORAGE_KEY]: nextSessions,
    [ACTIVE_SESSION_KEY]: data[ACTIVE_SESSION_KEY] === sessionId ? '' : data[ACTIVE_SESSION_KEY]
  });
  showToast('Đã xóa phiên');
  await loadSessionsSidebar();
}

document.getElementById('sessions-sidebar-list')?.addEventListener('click', async (e) => {
  const actionEl = e.target.closest('[data-action][data-session-id]');
  if (!actionEl) return;

  if (actionEl.dataset.action === 'open-session-sidebar') {
    await openSessionSidebar(actionEl.dataset.sessionId);
    return;
  }

  if (actionEl.dataset.action === 'delete-session-sidebar') {
    await deleteSessionSidebar(actionEl.dataset.sessionId);
  }
});

if (chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (!changes[SESSION_STORAGE_KEY] && !changes[ACTIVE_SESSION_KEY]) return;
    const sessionsTab = document.getElementById('tab-sessions-sidebar');
    if (!sessionsTab?.classList.contains('active')) return;
    loadSessionsSidebar();
  });
}
