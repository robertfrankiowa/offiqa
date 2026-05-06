// Offiqa New Tab JS

const store = {
  async get(keys) {
    return new Promise((resolve) => {
      const result = chrome.storage.local.get(keys, resolve);
      if (result?.then) result.then(resolve);
    });
  },
  async set(obj) {
    return new Promise((resolve) => {
      const result = chrome.storage.local.set(obj, resolve);
      if (result?.then) result.then(resolve);
    });
  }
};

const sidebar = document.getElementById('offiqa-sidebar');
const sidebarBackdrop = document.getElementById('offiqa-sidebar-backdrop');
const sidebarFrame = document.getElementById('offiqa-sidebar-frame');
const sidebarCloseButton = document.getElementById('offiqa-sidebar-close');
const bookmarkTreeSidebar = document.getElementById('bookmark-tree-sidebar');
const bookmarkTreeSidebarBody = document.getElementById('bookmark-tree-sidebar-body');
const bookmarkTreeSearchInput = document.getElementById('bookmark-tree-search');
const bookmarkTreeOpenPopupButton = document.getElementById('bookmark-tree-open-popup');
const bookmarkShelfTrack = document.getElementById('bookmark-shelf-track');
const bookmarkShelfMore = document.getElementById('bookmark-shelf-more');
const bookmarkShelfFlyout = document.getElementById('bookmark-shelf-flyout');
const bookmarkShelfOverflowButton = document.getElementById('bookmark-shelf-overflow-btn');
const bookmarkShelfFullButton = document.getElementById('bookmark-shelf-full-btn');
const sidebarPopupUrl = chrome.runtime.getURL('popup/popup.html');
let sidebarLoaded = false;
let sidebarMode = 'iframe';
let homeBookmarkGroups = [];
let bookmarkGroupsLockedByPin = false;
let bookmarkTreeQuery = '';
let expandedBookmarkGroupIds = new Set();
let bookmarkShelfFlyoutTimer = null;
const SUPPORTED_LANGUAGE_OPTIONS = ['en', 'es', 'vi'];
const NEWTAB_I18N_PACKS = globalThis.OFFIQA_I18N_PACKS || {};
const NEWTAB_STATIC_I18N = Object.fromEntries(Object.entries(NEWTAB_I18N_PACKS).map(([lang, pack]) => [lang, pack.newtab?.static || {}]));
const NEWTAB_TEXT_I18N = Object.fromEntries(Object.entries(NEWTAB_I18N_PACKS).map(([lang, pack]) => [lang, pack.newtab?.text || {}]));
let currentLanguage = 'en';
const MEMORY_TYPE_META = {
  note: { emoji: '📝', label: 'Note' },
  reminder: { emoji: '⏰', label: 'Reminder' },
  checklist: { emoji: '☑️', label: 'Checklist' },
  plan: { emoji: '🗓', label: 'Plan' }
};

function normalizeLanguage(lang) {
  return SUPPORTED_LANGUAGE_OPTIONS.includes(lang) ? lang : 'en';
}

async function loadCurrentLanguage() {
  const data = await store.get(['language']);
  currentLanguage = normalizeLanguage(data.language);
  return currentLanguage;
}

function getLanguageLocale() {
  if (currentLanguage === 'es') return 'es-ES';
  if (currentLanguage === 'vi') return 'vi-VN';
  return 'en-US';
}

function getNewTabCopy() {
  return NEWTAB_STATIC_I18N[currentLanguage] || NEWTAB_STATIC_I18N.en;
}

function getQuickNoteTypeLabels() {
  return getNewTabCopy().noteTypeLabels || NEWTAB_STATIC_I18N.en.noteTypeLabels;
}

function getQuickNoteTypeMeta(type) {
  const base = MEMORY_TYPE_META[type] || MEMORY_TYPE_META.note;
  const labels = getQuickNoteTypeLabels();
  return { ...base, label: labels[type] || base.label };
}

function setElementText(selector, value) {
  const el = document.querySelector(selector);
  if (el) el.textContent = value;
}

function setElementAttr(selector, attr, value) {
  const el = document.querySelector(selector);
  if (el) el.setAttribute(attr, value);
}

function applyNewTabStaticLanguage() {
  const copy = getNewTabCopy();
  document.documentElement.lang = currentLanguage;

  setElementText('.topbar-tag', copy.topbarTag);
  setElementText('.bookmark-shelf-label', copy.bookmarkShelfLabel);
  setElementAttr('#bookmark-shelf-overflow-btn', 'aria-label', copy.bookmarkShelfOverflowAria);
  setElementText('#bookmark-shelf-full-btn', copy.bookmarkShelfFull);
  setElementText('.status-badge span', copy.status);
  setElementText('#btn-toggle-search', `🔍 ${copy.toggleSearch}`);
  setElementAttr('#btn-toggle-search', 'title', copy.toggleSearchTitle);
  setElementText('#btn-toggle-search-menu', copy.toggleSearch);
  setElementAttr('#btn-toggle-search-menu', 'title', copy.toggleSearchTitle);
  setElementText('#btn-open-offiqa', copy.openOffiqa);
  document.getElementById('search-input')?.setAttribute('placeholder', copy.searchPlaceholder);
  document.querySelector('#tab-meetings .card-title') && (document.querySelector('#tab-meetings .card-title').textContent = copy.meetingTitle);
  setElementText('#btn-add-meeting', copy.meetingAdd);
  const meetingKindInput = document.getElementById('meeting-kind-input');
  if (meetingKindInput?.options?.[0]) meetingKindInput.options[0].text = copy.meetingKindMeeting;
  if (meetingKindInput?.options?.[1]) meetingKindInput.options[1].text = copy.meetingKindAppointment;
  document.getElementById('meeting-title-input')?.setAttribute('placeholder', copy.meetingTitlePlaceholder);
  document.getElementById('meeting-link-input')?.setAttribute('placeholder', copy.meetingLinkPlaceholder);
  setElementText('#meeting-form-hint', copy.meetingFormHint);
  setElementText('#meeting-save-btn', copy.meetingSave);
  setElementText('#meeting-cancel-btn', copy.meetingCancel);
  setElementText('#meeting-open-sidebar', copy.viewAll);
  document.querySelector('.focus-card .card-title') && (document.querySelector('.focus-card .card-title').textContent = copy.todayFocus);
  document.getElementById('task-input')?.setAttribute('placeholder', copy.taskPlaceholder);
  setElementText('#task-open-sidebar', copy.viewAll);
  document.querySelector('.note-card .card-title') && (document.querySelector('.note-card .card-title').textContent = copy.quickNotes);
  setElementText('#note-save-btn', copy.noteSave);
  document.querySelectorAll('.note-type-pill[data-type]').forEach((button) => {
    const meta = getQuickNoteTypeMeta(button.dataset.type);
    button.textContent = `${meta.emoji} ${meta.label}`;
  });
  setElementAttr('#note-due-input', 'aria-label', copy.noteDueDateAria);
  setElementAttr('#note-time-input', 'aria-label', copy.noteDueTimeAria);
  document.getElementById('quick-note')?.setAttribute('placeholder', copy.quickNotePlaceholder.replace('\\n', '\n'));
  setElementText('#home-memory-list-label', copy.sameType);
  const scopeButtons = document.querySelectorAll('.home-memory-scope-btn');
  if (scopeButtons[0]) scopeButtons[0].textContent = copy.sameType;
  if (scopeButtons[1]) scopeButtons[1].textContent = copy.recent;
  if (scopeButtons[2]) scopeButtons[2].textContent = copy.all;
  setElementText('#note-content-state', copy.noContent);
  setElementText('#note-save-state', copy.saved);
  setElementText('#note-open-memory', copy.viewAll);
  document.querySelector('#tab-sessions .card-title') && (document.querySelector('#tab-sessions .card-title').textContent = copy.resumeSession);
  setElementText('#btn-save-session', copy.newSession);
  setElementText('#session-open-sidebar', copy.viewAll);
  document.querySelector('#focus-timer-card .card-title') && (document.querySelector('#focus-timer-card .card-title').textContent = copy.focusTimer);
  const timerModeButtons = document.querySelectorAll('.timer-mode-btn');
  if (timerModeButtons[0]) timerModeButtons[0].textContent = copy.countdown;
  if (timerModeButtons[1]) timerModeButtons[1].textContent = copy.stopwatch;
  document.querySelector('.focus-context-caption') && (document.querySelector('.focus-context-caption').textContent = copy.sessionGoal);
  document.getElementById('focus-context-input')?.setAttribute('placeholder', copy.focusContextPlaceholder);
  const customPreset = document.querySelector('.timer-preset-btn-custom');
  if (customPreset) customPreset.textContent = copy.custom;
  setElementText('.timer-custom-label', copy.minutes);
  const autoBreakLabel = document.querySelector('.timer-autobreak-toggle span');
  if (autoBreakLabel) autoBreakLabel.textContent = copy.autoBreak;
  setElementText('.smart-reminder-label', copy.smartReminders);
  setElementText('#smart-reminder-card-kicker', copy.reminderKicker);
  setElementAttr('#offiqa-sidebar-close', 'aria-label', copy.closeOffiqaAria);
  setElementText('.bookmark-tree-sidebar-title', copy.bookmarkTreeTitle);
  setElementText('.bookmark-tree-sidebar-desc', copy.bookmarkTreeDesc);
  setElementText('#bookmark-tree-open-popup', copy.bookmarkTreeOpen);
  document.getElementById('bookmark-tree-search')?.setAttribute('placeholder', copy.bookmarkTreeSearchPlaceholder);
  setElementAttr('#session-resume-close', 'aria-label', copy.sessionResumeCloseAria);
  setElementAttr('#session-save-close', 'aria-label', copy.sessionSaveCloseAria);
  document.getElementById('session-save-name')?.setAttribute('placeholder', copy.sessionNamePlaceholder);
  document.getElementById('session-save-current')?.setAttribute('placeholder', copy.sessionCurrentPlaceholder);
  document.getElementById('session-save-next')?.setAttribute('placeholder', copy.sessionNextPlaceholder);
}

function localizeNewTabPromptLabel(label) {
  if (currentLanguage === 'vi') return label;
  const labels = {
    en: {
      'Tên phiên:': 'Session name:',
      'URL (vd: https://notion.so):': 'URL (example: https://notion.so):',
      'Tên hiển thị:': 'Display name:',
      'Emoji (để trống = 🔗):': 'Emoji (leave blank = 🔗):',
      'URL:': 'URL:',
      'Emoji:': 'Emoji:'
    },
    es: {
      'Tên phiên:': 'Nombre de la sesión:',
      'URL (vd: https://notion.so):': 'URL (ejemplo: https://notion.so):',
      'Tên hiển thị:': 'Nombre visible:',
      'Emoji (để trống = 🔗):': 'Emoji (vacío = 🔗):',
      'URL:': 'URL:',
      'Emoji:': 'Emoji:'
    }
  };
  return (labels[currentLanguage] || labels.en)[label] || label;
}

function localizeNewTabText(text) {
  const labels = {
    en: {
      'Link tài liệu chưa hợp lệ.': 'Document link is not valid.',
      'Đã copy agenda': 'Agenda copied',
      'Đã copy địa điểm': 'Location copied',
      'Agenda đã đủ 6 mục': 'Agenda already has 6 items'
    },
    es: {
      'Link tài liệu chưa hợp lệ.': 'El enlace del documento no es válido.',
      'Đã copy agenda': 'Agenda copiada',
      'Đã copy địa điểm': 'Ubicación copiada',
      'Agenda đã đủ 6 mục': 'La agenda ya tiene 6 puntos'
    }
  };
  return (labels[currentLanguage] || labels.en)[text] || text;
}

function localizeNewTabDynamicText(text) {
  const value = String(text || '');
  if (currentLanguage === 'vi' || !value) return value;

  const patterns = currentLanguage === 'es'
    ? [
        [/^Gần đây: (.+)$/, 'Reciente: $1'],
        [/^trong (\d+) phút$/, 'en $1 minutos'],
        [/^ngay bây giờ$/, 'ahora mismo'],
        [/^Tự vào nghỉ (\d+) phút ngay sau đây$/, 'Entrar automáticamente al descanso de $1 minutos a continuación']
      ]
    : [
        [/^Gần đây: (.+)$/, 'Recent: $1'],
        [/^trong (\d+) phút$/, 'in $1 minutes'],
        [/^ngay bây giờ$/, 'right now'],
        [/^Tự vào nghỉ (\d+) phút ngay sau đây$/, 'Automatically start a $1 minute break next']
      ];

  let nextValue = value;
  patterns.forEach(([pattern, replacement]) => {
    nextValue = nextValue.replace(pattern, replacement);
  });
  return nextValue;
}

function translateNewTabTextNodeValue(value) {
  const map = NEWTAB_TEXT_I18N[currentLanguage] || {};
  return localizeNewTabDynamicText(map[value] || value);
}

function applyNewTabRuntimeTranslations(root = document.body) {
  if (!root) return;

  const translateAttrs = (element) => {
    if (!element?.hasAttribute) return;
    ['placeholder', 'aria-label', 'title'].forEach((attr) => {
      if (element.hasAttribute(attr)) {
        element.setAttribute(attr, translateNewTabTextNodeValue(element.getAttribute(attr)));
      }
    });
  };

  if (root.nodeType === Node.ELEMENT_NODE) translateAttrs(root);
  root.querySelectorAll?.('[placeholder],[aria-label],[title]').forEach(translateAttrs);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const original = String(node.nodeValue || '').trim();
    if (original) {
      const translated = translateNewTabTextNodeValue(original);
      if (translated !== original) {
        node.nodeValue = node.nodeValue.replace(original, translated);
      }
    }
    node = walker.nextNode();
  }
}

let newTabI18nObserver = null;

function ensureNewTabLanguageObserver() {
  if (newTabI18nObserver) return;
  newTabI18nObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'characterData' && mutation.target?.parentElement) {
        applyNewTabRuntimeTranslations(mutation.target.parentElement);
        return;
      }
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          applyNewTabRuntimeTranslations(node);
        } else if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
          applyNewTabRuntimeTranslations(node.parentElement);
        }
      });
    });
  });
  newTabI18nObserver.observe(document.body, { childList: true, characterData: true, subtree: true });
}

function setSidebarMode(mode) {
  sidebarMode = mode;
  const showBookmarkTree = mode === 'bookmarks';
  bookmarkTreeSidebar.hidden = !showBookmarkTree;
  sidebarFrame.hidden = showBookmarkTree;
  sidebar.dataset.mode = mode;
}

function revealSidebar() {
  sidebarBackdrop.hidden = false;
  document.body.classList.add('sidebar-open');
  sidebar.setAttribute('aria-hidden', 'false');
}

function openOffiqaSidebar(targetTab = '', options = {}) {
  setSidebarMode('iframe');
  const params = new URLSearchParams({ embedded: '1' });
  if (options.memoryFilter) params.set('memoryFilter', options.memoryFilter);
  const url = `${sidebarPopupUrl}?${params.toString()}${targetTab ? `#${targetTab}` : ''}`;
  if (!sidebarLoaded || sidebarFrame.src !== url) {
    sidebarFrame.src = url;
    sidebarLoaded = true;
  }
  revealSidebar();
}

function openBookmarkSidebar(options = {}) {
  setSidebarMode('bookmarks');
  if (options.focusGroupId) {
    expandedBookmarkGroupIds.add(options.focusGroupId);
  }
  renderBookmarkTreeSidebar();
  revealSidebar();
  if (options.focusGroupId) {
    requestAnimationFrame(() => {
      document.querySelector(`.bookmark-tree-group[data-group-id="${CSS.escape(options.focusGroupId)}"]`)?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      });
    });
  }
}

function closeOffiqaSidebar() {
  document.body.classList.remove('sidebar-open');
  sidebar.setAttribute('aria-hidden', 'true');
  sidebarBackdrop.hidden = true;
  hideBookmarkShelfFlyout(true);
}

sidebarBackdrop.addEventListener('click', closeOffiqaSidebar);
sidebarCloseButton.addEventListener('click', closeOffiqaSidebar);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('sidebar-open')) {
    closeOffiqaSidebar();
  }
});

function normalizeBookmarkRecord(raw) {
  if (!raw?.url) return null;
  return {
    url: raw.url,
    title: String(raw.title || raw.url).trim() || raw.url,
    saved: Number(raw.saved) || Date.now()
  };
}

function normalizeBookmarkGroup(raw, index = 0) {
  const created = Number(raw?.created) || Date.now() - index;
  return {
    id: String(raw?.id || `bookmark-group-${created}-${index}`),
    name: String(raw?.name || `Nhom ${index + 1}`).trim() || `Nhom ${index + 1}`,
    icon: String(raw?.icon || '📁').trim() || '📁',
    hidden: Boolean(raw?.hidden),
    bookmarks: Array.isArray(raw?.bookmarks) ? raw.bookmarks.map(normalizeBookmarkRecord).filter(Boolean) : [],
    created
  };
}

function getBookmarkShelfLimit() {
  if (window.innerWidth < 720) return 2;
  if (window.innerWidth < 1040) return 3;
  if (window.innerWidth < 1320) return 4;
  return 5;
}

function getBookmarkGroupsByVisibility() {
  return {
    visibleGroups: homeBookmarkGroups.filter((group) => !group.hidden),
    hiddenGroups: homeBookmarkGroups.filter((group) => group.hidden)
  };
}

function getBookmarkHostLabel(url = '') {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
}

function renderBookmarkShelfPreview(group) {
  const previewItems = group.bookmarks.slice(0, 6);
  if (!previewItems.length) {
    return `
      <div class="bookmark-shelf-preview">
        <div class="bookmark-shelf-preview-empty">Nhom nay chua co link nao.</div>
      </div>
    `;
  }

  return `
    <div class="bookmark-shelf-preview">
      <div class="bookmark-shelf-preview-head">
        <span class="bookmark-shelf-preview-title">${escHtml(group.name)}</span>
        <span class="bookmark-shelf-preview-meta">${group.bookmarks.length} link</span>
      </div>
      <div class="bookmark-shelf-preview-list">
        ${previewItems.map((bookmark) => `
          <button
            type="button"
            class="bookmark-shelf-preview-link"
            data-action="open-bookmark-url"
            data-url="${escAttr(bookmark.url)}"
            title="${escAttr(bookmark.title)}"
          >
            <img
              class="bookmark-shelf-preview-favicon"
              src="https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(bookmark.url)}&sz=64"
              alt=""
            >
            <span class="bookmark-shelf-preview-main">
              <span class="bookmark-shelf-preview-link-title">${escHtml(bookmark.title)}</span>
              <span class="bookmark-shelf-preview-link-url">${escHtml(getBookmarkHostLabel(bookmark.url))}</span>
            </span>
            <span class="bookmark-shelf-preview-arrow">↗</span>
          </button>
        `).join('')}
      </div>
      ${group.bookmarks.length > previewItems.length ? '<div class="bookmark-shelf-preview-foot">Hover vao nhom de xem nhanh, bam pill de mo full tree.</div>' : ''}
    </div>
  `;
}

function renderBookmarkShelfChip(group, extraClass = '') {
  return `
    <div class="bookmark-shelf-chip-wrap">
      <button
        type="button"
        class="bookmark-shelf-chip${extraClass ? ` ${extraClass}` : ''}"
        data-action="open-bookmark-sidebar"
        data-group-id="${escAttr(group.id)}"
        title="${escAttr(group.name)}"
      >
        <span class="bookmark-shelf-chip-icon">${group.icon}</span>
        <span class="bookmark-shelf-chip-label">${escHtml(group.name)}</span>
        <span class="bookmark-shelf-chip-count">${group.bookmarks.length}</span>
      </button>
      ${renderBookmarkShelfPreview(group)}
    </div>
  `;
}

function renderBookmarkShelfFlyout(overflowGroups, hiddenGroups) {
  const sections = [];
  if (overflowGroups.length) {
    sections.push('<div class="bookmark-shelf-flyout-title">Nhom khac</div>');
    sections.push(overflowGroups.map((group) => renderBookmarkShelfChip(group)).join(''));
  }

  if (hiddenGroups.length) {
    sections.push('<div class="bookmark-shelf-flyout-title">Nhom an</div>');
    if (bookmarkGroupsLockedByPin) {
      sections.push(`
        <button type="button" class="bookmark-shelf-chip is-hidden" data-action="open-bookmark-sidebar">
          <span class="bookmark-shelf-chip-icon">🔒</span>
          <span class="bookmark-shelf-chip-label">${hiddenGroups.length} nhom an dang khoa</span>
        </button>
      `);
    } else {
      sections.push(hiddenGroups.map((group) => renderBookmarkShelfChip(group, 'is-hidden')).join(''));
    }
  }

  bookmarkShelfFlyout.innerHTML = sections.join('');
}

function showBookmarkShelfFlyout() {
  if (bookmarkShelfMore.hidden || !bookmarkShelfFlyout.innerHTML.trim()) return;
  clearTimeout(bookmarkShelfFlyoutTimer);
  bookmarkShelfFlyout.hidden = false;
  bookmarkShelfOverflowButton.setAttribute('aria-expanded', 'true');
}

function hideBookmarkShelfFlyout(immediate = false) {
  clearTimeout(bookmarkShelfFlyoutTimer);
  const hide = () => {
    bookmarkShelfFlyout.hidden = true;
    bookmarkShelfOverflowButton?.setAttribute('aria-expanded', 'false');
  };
  if (immediate) {
    hide();
    return;
  }
  bookmarkShelfFlyoutTimer = setTimeout(hide, 120);
}

function renderBookmarkShelf() {
  const { visibleGroups, hiddenGroups } = getBookmarkGroupsByVisibility();
  const limit = getBookmarkShelfLimit();
  const pinnedGroups = visibleGroups.slice(0, limit);
  const overflowGroups = visibleGroups.slice(limit);

  bookmarkShelfTrack.innerHTML = '';

  if (!homeBookmarkGroups.length) {
    bookmarkShelfTrack.innerHTML = '<div class="bookmark-shelf-empty">Chưa có nhóm nào. Tạo nhóm trong Offiqa để hiển thị tại đây.</div>';
  } else if (!visibleGroups.length && hiddenGroups.length) {
    bookmarkShelfTrack.innerHTML = `
      <button type="button" class="bookmark-shelf-chip is-hidden" data-action="open-bookmark-sidebar">
        <span class="bookmark-shelf-chip-icon">🔒</span>
        <span class="bookmark-shelf-chip-label">${hiddenGroups.length} nhom an</span>
        <span class="bookmark-shelf-chip-count">${hiddenGroups.reduce((total, group) => total + group.bookmarks.length, 0)}</span>
      </button>
    `;
  } else {
    bookmarkShelfTrack.innerHTML = pinnedGroups.map((group) => renderBookmarkShelfChip(group)).join('');
  }

  renderBookmarkShelfFlyout(overflowGroups, hiddenGroups);
  const hasFlyout = overflowGroups.length > 0 || hiddenGroups.length > 0;
  bookmarkShelfMore.hidden = !hasFlyout;
  bookmarkShelfFullButton.hidden = homeBookmarkGroups.length === 0;
  if (!hasFlyout) hideBookmarkShelfFlyout(true);
}

function filterBookmarkGroups(groups, query) {
  const normalizedQuery = normalizeComparableText(query);
  if (!normalizedQuery) return groups;

  return groups
    .map((group) => {
      const groupMatch = normalizeComparableText(group.name).includes(normalizedQuery);
      const matchingBookmarks = group.bookmarks.filter((bookmark) => {
        return normalizeComparableText(bookmark.title).includes(normalizedQuery)
          || normalizeComparableText(bookmark.url).includes(normalizedQuery);
      });

      if (!groupMatch && !matchingBookmarks.length) return null;
      return {
        ...group,
        bookmarks: groupMatch ? group.bookmarks : matchingBookmarks
      };
    })
    .filter(Boolean);
}

function renderBookmarkTreeGroup(group, options = {}) {
  const queryActive = Boolean(normalizeComparableText(options.query));
  const isExpanded = queryActive || expandedBookmarkGroupIds.has(group.id);
  const bookmarkItems = group.bookmarks.length
    ? group.bookmarks.map((bookmark) => `
        <button
          type="button"
          class="bookmark-tree-bookmark"
          data-action="open-bookmark-url"
          data-url="${escAttr(bookmark.url)}"
          title="${escAttr(bookmark.title)}"
        >
          <img
            class="bookmark-tree-bookmark-favicon"
            src="https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(bookmark.url)}&sz=64"
            alt=""
          >
          <span class="bookmark-tree-bookmark-main">
            <span class="bookmark-tree-bookmark-title">${escHtml(bookmark.title)}</span>
            <span class="bookmark-tree-bookmark-url">${escHtml(getBookmarkHostLabel(bookmark.url))}</span>
          </span>
          <span class="bookmark-tree-bookmark-arrow">↗</span>
        </button>
      `).join('')
    : '<div class="bookmark-tree-empty">Nhom nay chua co bookmark nao.</div>';

  return `
    <section class="bookmark-tree-group" data-group-id="${escAttr(group.id)}">
      <div class="bookmark-tree-group-header">
        <button
          type="button"
          class="bookmark-tree-toggle"
          data-action="toggle-bookmark-group"
          data-group-id="${escAttr(group.id)}"
          aria-expanded="${isExpanded ? 'true' : 'false'}"
        >
          <span class="bookmark-tree-caret">${isExpanded ? '▾' : '▸'}</span>
          <span class="bookmark-tree-group-icon">${group.icon}</span>
          <span class="bookmark-tree-group-main">
            <span class="bookmark-tree-group-name">${escHtml(group.name)}</span>
            <span class="bookmark-tree-group-subtitle">${group.hidden ? 'Nhom an' : 'Nhom thuong'} · ${group.bookmarks.length} bookmark</span>
          </span>
        </button>
        <span class="bookmark-tree-group-actions">
          <span class="bookmark-tree-group-count">${group.bookmarks.length}</span>
          ${group.bookmarks.length ? `<button type="button" class="bookmark-tree-open-all" data-action="open-bookmark-group" data-group-id="${escAttr(group.id)}">Mở tất cả</button>` : ''}
        </span>
      </div>
      <div class="bookmark-tree-body" ${isExpanded ? '' : 'hidden'}>
        ${bookmarkItems}
      </div>
    </section>
  `;
}

function renderBookmarkTreeSection(title, groups, meta = '') {
  if (!groups.length) return '';
  return `
    <section class="bookmark-tree-section">
      <div class="bookmark-tree-section-head">
        <div class="bookmark-tree-section-title">${escHtml(title)}</div>
        ${meta ? `<div class="bookmark-tree-section-meta">${escHtml(meta)}</div>` : ''}
      </div>
      <div class="bookmark-tree-list">
        ${groups.map((group) => renderBookmarkTreeGroup(group, { query: bookmarkTreeQuery })).join('')}
      </div>
    </section>
  `;
}

function renderBookmarkTreeSidebar() {
  const { visibleGroups, hiddenGroups } = getBookmarkGroupsByVisibility();
  const filteredVisible = filterBookmarkGroups(visibleGroups, bookmarkTreeQuery);
  const filteredHidden = filterBookmarkGroups(hiddenGroups, bookmarkTreeQuery);

  if (!homeBookmarkGroups.length) {
    bookmarkTreeSidebarBody.innerHTML = '<div class="bookmark-tree-empty">Chưa có nhóm nào trong Offiqa. Tạo nhóm trong popup rồi quay lại đây để xem dạng cây.</div>';
    return;
  }

  const sections = [];

  if (filteredVisible.length) {
    sections.push(renderBookmarkTreeSection('Nhom thuong', filteredVisible, `${filteredVisible.length} nhom`));
  }

  if (hiddenGroups.length) {
    if (bookmarkGroupsLockedByPin) {
      sections.push(`
        <section class="bookmark-tree-section">
          <div class="bookmark-tree-section-head">
            <div class="bookmark-tree-section-title">Nhom an</div>
            <div class="bookmark-tree-section-meta">${hiddenGroups.length} nhom</div>
          </div>
          <div class="bookmark-tree-lock-card">
            <div class="bookmark-tree-lock-title">Đang khóa bằng PIN</div>
            <div class="bookmark-tree-lock-desc">Nhóm ẩn vẫn được giữ riêng. Mở popup Offiqa để xác thực rồi quay lại đây nếu bạn muốn xem chi tiết.</div>
          </div>
        </section>
      `);
    } else if (filteredHidden.length) {
      sections.push(renderBookmarkTreeSection('Nhom an', filteredHidden, `${filteredHidden.length} nhom`));
    }
  }

  if (!sections.length) {
    bookmarkTreeSidebarBody.innerHTML = '<div class="bookmark-tree-empty">Không tìm thấy nhóm hoặc dấu trang nào khớp với từ khóa này.</div>';
    return;
  }

  bookmarkTreeSidebarBody.innerHTML = sections.join('');
}

async function loadBookmarkGroupsShelf() {
  const data = await store.get(['bookmark_groups', 'pin_hash']);
  homeBookmarkGroups = Array.isArray(data.bookmark_groups)
    ? data.bookmark_groups.map(normalizeBookmarkGroup)
    : [];
  bookmarkGroupsLockedByPin = Boolean(data.pin_hash);

  const availableIds = new Set(homeBookmarkGroups.map((group) => group.id));
  [...expandedBookmarkGroupIds].forEach((groupId) => {
    if (!availableIds.has(groupId)) expandedBookmarkGroupIds.delete(groupId);
  });
  if (!expandedBookmarkGroupIds.size) {
    const firstVisibleGroup = homeBookmarkGroups.find((group) => !group.hidden) || homeBookmarkGroups[0];
    if (firstVisibleGroup) expandedBookmarkGroupIds.add(firstVisibleGroup.id);
  }

  renderBookmarkShelf();
  if (sidebarMode === 'bookmarks') {
    renderBookmarkTreeSidebar();
  }
}

// ===== CLOCK =====
function pad2(n) { return String(n).padStart(2,'0'); }

function updateClock() {
  const now = new Date();
  document.getElementById('clock-h').textContent = pad2(now.getHours());
  document.getElementById('clock-m').textContent = pad2(now.getMinutes());
  document.getElementById('clock-s').textContent = pad2(now.getSeconds());
  document.getElementById('date-label').textContent = new Intl.DateTimeFormat(getLanguageLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(now);
}

updateClock();
setInterval(updateClock, 1000);

// ===== SEARCH =====
const DEFAULT_ENGINE_ICON = chrome.runtime.getURL('icons/icon16.png');
let currentEngine = { name:'Google', url:'https://www.google.com/search?q=', icon:'https://www.google.com/favicon.ico' };

async function loadSearchEngine() {
  const data = await store.get(['search_engine']);
  if (data.search_engine) {
    currentEngine = data.search_engine;
  }
  updateEngineUI();
}

function updateEngineUI() {
  document.getElementById('engine-name').textContent = currentEngine.name;
  const favicon = document.getElementById('engine-favicon');
  favicon.style.display = 'block';
  favicon.onerror = () => {
    favicon.onerror = null;
    favicon.src = DEFAULT_ENGINE_ICON;
  };
  favicon.src = currentEngine.icon || DEFAULT_ENGINE_ICON;
}

document.getElementById('engine-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('engine-dropdown').classList.toggle('open');
});

document.querySelectorAll('.engine-option').forEach(opt => {
  opt.addEventListener('click', async () => {
    currentEngine = {
      name: opt.dataset.engine.charAt(0).toUpperCase() + opt.dataset.engine.slice(1),
      url: opt.dataset.url,
      icon: opt.dataset.icon
    };
    await store.set({ search_engine: currentEngine });
    updateEngineUI();
    document.getElementById('engine-dropdown').classList.remove('open');
  });
});

document.addEventListener('click', () => {
  document.getElementById('engine-dropdown').classList.remove('open');
});

bookmarkShelfTrack?.addEventListener('click', (e) => {
  const bookmarkLink = e.target.closest('[data-action="open-bookmark-url"]');
  if (bookmarkLink?.dataset.url) {
    e.stopPropagation();
    chrome.tabs.create({ url: bookmarkLink.dataset.url });
    return;
  }
  const trigger = e.target.closest('[data-action="open-bookmark-sidebar"]');
  if (!trigger) return;
  openBookmarkSidebar({ focusGroupId: trigger.dataset.groupId || '' });
});

bookmarkShelfFlyout?.addEventListener('click', (e) => {
  const bookmarkLink = e.target.closest('[data-action="open-bookmark-url"]');
  if (bookmarkLink?.dataset.url) {
    e.stopPropagation();
    hideBookmarkShelfFlyout(true);
    chrome.tabs.create({ url: bookmarkLink.dataset.url });
    return;
  }
  const trigger = e.target.closest('[data-action="open-bookmark-sidebar"]');
  if (!trigger) return;
  hideBookmarkShelfFlyout(true);
  openBookmarkSidebar({ focusGroupId: trigger.dataset.groupId || '' });
});

bookmarkShelfFullButton?.addEventListener('click', () => {
  openBookmarkSidebar();
});

bookmarkShelfMore?.addEventListener('mouseenter', showBookmarkShelfFlyout);
bookmarkShelfMore?.addEventListener('mouseleave', () => hideBookmarkShelfFlyout());
bookmarkShelfMore?.addEventListener('focusin', showBookmarkShelfFlyout);
bookmarkShelfMore?.addEventListener('focusout', () => {
  setTimeout(() => {
    if (!bookmarkShelfMore.contains(document.activeElement)) {
      hideBookmarkShelfFlyout();
    }
  }, 0);
});

bookmarkTreeSidebarBody?.addEventListener('click', async (e) => {
  const openGroupButton = e.target.closest('[data-action="open-bookmark-group"]');
  if (openGroupButton) {
    e.stopPropagation();
    const group = homeBookmarkGroups.find((item) => item.id === openGroupButton.dataset.groupId);
    if (!group?.bookmarks.length) return;
    group.bookmarks.forEach((bookmark) => chrome.tabs.create({ url: bookmark.url, active: false }));
    return;
  }

  const toggleButton = e.target.closest('[data-action="toggle-bookmark-group"]');
  if (toggleButton) {
    const { groupId } = toggleButton.dataset;
    if (!groupId) return;
    if (expandedBookmarkGroupIds.has(groupId)) {
      expandedBookmarkGroupIds.delete(groupId);
    } else {
      expandedBookmarkGroupIds.add(groupId);
    }
    renderBookmarkTreeSidebar();
    return;
  }

  const bookmarkButton = e.target.closest('[data-action="open-bookmark-url"]');
  if (bookmarkButton?.dataset.url) {
    chrome.tabs.create({ url: bookmarkButton.dataset.url });
  }
});

bookmarkTreeSearchInput?.addEventListener('input', (e) => {
  bookmarkTreeQuery = e.target.value || '';
  renderBookmarkTreeSidebar();
});

bookmarkTreeOpenPopupButton?.addEventListener('click', () => {
  openOffiqaSidebar('bookmarks');
});

window.addEventListener('resize', () => {
  renderBookmarkShelf();
});

function doSearch() {
  const q = document.getElementById('search-input').value.trim();
  if (!q) return;
  const url = q.startsWith('http') ? q : currentEngine.url + encodeURIComponent(q);
  chrome.tabs.create({ url });
}

document.getElementById('search-btn').addEventListener('click', doSearch);
document.getElementById('search-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') doSearch();
});

window.offiqaNewtabFeatureInitializers = window.offiqaNewtabFeatureInitializers || {};
const newtabAssetPromises = new Map();
const newtabFeaturePromises = new Map();
const NEWTAB_FEATURES = {
  sessions: { scripts: ['features/sessions.js'], styles: ['styles/sessions.css'] },
  tasks: { scripts: ['features/tasks.js'], styles: ['styles/tasks.css'] },
  quickNotes: { scripts: ['features/quick-notes.js'], styles: ['styles/quick-notes.css'] },
  timer: { scripts: ['features/timer.js'], styles: ['styles/timer.css'], deps: ['tasks'] },
  meetings: { scripts: ['features/meetings.js'], styles: ['styles/meetings.css'] },
  quickLinks: { scripts: ['features/quick-links.js'], styles: ['styles/quick-links.css'], deps: ['sessions', 'meetings'] },
  brief: { scripts: ['features/brief.js'], deps: ['sessions', 'tasks', 'meetings'] },
  clientFollowup: { scripts: ['client-followup.js'], styles: ['styles/workspace.css'] },
  campaignContent: { scripts: ['campaign-content.js'], styles: ['styles/workspace.css'] },
  designAsset: { scripts: ['design-asset.js'], styles: ['styles/workspace.css'] },
  freelancerProjects: { scripts: ['freelancer-projects.js'], styles: ['styles/workspace.css'] },
  professionalDesks: { scripts: ['professional-desks.js'], styles: ['styles/workspace.css'] },
  waitingOn: { scripts: ['waiting-on.js'], styles: ['styles/workspace.css'] },
  workRequests: { scripts: ['work-requests.js'], styles: ['styles/workspace.css'] },
  deadlineRadar: { scripts: ['deadline-radar.js'], styles: ['styles/workspace.css'] },
  routineChecklist: { scripts: ['routine-checklist.js'], styles: ['styles/workspace.css'] },
  keyLinks: { scripts: ['key-links.js'], styles: ['styles/workspace.css'] },
  updateBuilder: { scripts: ['update-builder.js'], styles: ['styles/workspace.css'] },
  handoffPack: { scripts: ['handoff-pack.js'], styles: ['styles/workspace.css'] }
};
const NEWTAB_FEATURE_TARGETS = [
  ['#morning-brief', 'brief'],
  ['#tab-sessions', 'sessions'],
  ['.focus-card', 'tasks'],
  ['.note-card', 'quickNotes'],
  ['#focus-timer-card', 'timer'],
  ['#tab-meetings', 'meetings'],
  ['#tab-quick-links', 'quickLinks'],
  ['#client-followup-card', 'clientFollowup'],
  ['#campaign-content-card', 'campaignContent'],
  ['#design-asset-card', 'designAsset'],
  ['#freelancer-projects-card', 'freelancerProjects'],
  ['#sales-followup-desk-card', 'professionalDesks'],
  ['#marketing-campaign-desk-card', 'professionalDesks'],
  ['#design-review-desk-card', 'professionalDesks'],
  ['#accounting-client-desk-card', 'professionalDesks'],
  ['#hr-operations-desk-card', 'professionalDesks'],
  ['#purchasing-operations-desk-card', 'professionalDesks'],
  ['#logistics-operations-desk-card', 'professionalDesks'],
  ['#customer-care-desk-card', 'professionalDesks'],
  ['#rd-experiment-desk-card', 'professionalDesks'],
  ['#developer-flow-desk-card', 'professionalDesks'],
  ['#assistant-command-desk-card', 'professionalDesks'],
  ['#recruiting-pipeline-desk-card', 'professionalDesks'],
  ['#product-decision-desk-card', 'professionalDesks'],
  ['#qa-release-desk-card', 'professionalDesks'],
  ['#it-support-desk-card', 'professionalDesks'],
  ['#office-operations-desk-card', 'professionalDesks'],
  ['#teaching-operations-desk-card', 'professionalDesks'],
  ['#student-study-desk-card', 'professionalDesks'],
  ['#waiting-on-card', 'waitingOn'],
  ['#work-requests-card', 'workRequests'],
  ['#deadline-radar-card', 'deadlineRadar'],
  ['#routine-checklist-card', 'routineChecklist'],
  ['#key-links-card', 'keyLinks'],
  ['#update-builder-card', 'updateBuilder'],
  ['#handoff-pack-card', 'handoffPack']
];

function loadNewtabStyle(href) {
  const url = new URL(href, document.baseURI).href;
  if (newtabAssetPromises.has(url)) return newtabAssetPromises.get(url);
  const promise = new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.onload = resolve;
    link.onerror = () => reject(new Error(`Unable to load newtab style: ${href}`));
    document.head.appendChild(link);
  });
  newtabAssetPromises.set(url, promise);
  return promise;
}

function loadNewtabScript(src) {
  const url = new URL(src, document.baseURI).href;
  if (newtabAssetPromises.has(url)) return newtabAssetPromises.get(url);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Unable to load newtab feature: ${src}`));
    document.head.appendChild(script);
  });
  newtabAssetPromises.set(url, promise);
  return promise;
}

function isNewtabFeatureLoaded(name) {
  return Boolean(newtabFeaturePromises.get(name)?.loaded);
}

async function loadNewtabFeature(name) {
  const feature = NEWTAB_FEATURES[name];
  if (!feature) return;
  if (newtabFeaturePromises.has(name)) return newtabFeaturePromises.get(name).promise;
  const state = { loaded: false, promise: null };
  state.promise = (async () => {
    for (const dependency of feature.deps || []) {
      await loadNewtabFeature(dependency);
    }
    await Promise.all((feature.styles || []).map(loadNewtabStyle));
    await Promise.all((feature.scripts || []).map(loadNewtabScript));
    const initializer = window.offiqaNewtabFeatureInitializers?.[name];
    if (typeof initializer === 'function') await initializer();
    state.loaded = true;
    applyNewTabStaticLanguage();
    applyNewTabRuntimeTranslations();
  })().catch((error) => {
    console.warn('[Offiqa] Failed to load new tab feature:', name, error);
  });
  newtabFeaturePromises.set(name, state);
  return state.promise;
}

function setupLazyNewtabFeatures() {
  const seen = new Set();
  const loadForElement = (element) => {
    const feature = element?.dataset?.offiqaFeature;
    if (!feature || seen.has(feature)) return;
    seen.add(feature);
    loadNewtabFeature(feature);
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      loadForElement(entry.target);
    });
  }, { rootMargin: '180px 0px' });

  NEWTAB_FEATURE_TARGETS.forEach(([selector, feature]) => {
    const element = document.querySelector(selector);
    if (!element) return;
    element.dataset.offiqaFeature = feature;
    observer.observe(element);
    ['pointerenter', 'focusin', 'click'].forEach((eventName) => {
      element.addEventListener(eventName, () => loadForElement(element), { once: true });
    });
  });
}

function renderMorningBrief() {}
function checkMeetingAlert() {}

// ===== QUICK ACTIONS =====
document.getElementById('btn-open-offiqa').addEventListener('click', () => {
  openOffiqaSidebar();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;

  if (changes.language) {
    const nextLanguage = normalizeLanguage(changes.language.newValue);
    if (nextLanguage !== currentLanguage) {
      currentLanguage = nextLanguage;
      window.location.reload();
      return;
    }
  }

  if (changes.quick_note_drafts) {
    if (typeof mergeQuickNoteDrafts === 'function') {
      quickNoteDrafts = mergeQuickNoteDrafts(changes.quick_note_drafts.newValue, quickNoteDrafts.note || '');
      hydrateQuickNoteComposer();
      updateNoteSaveUI(hasQuickNoteDraftContent() ? 'draft' : 'idle');
    }
  }

  if (changes.quick_note_due_drafts) {
    if (typeof mergeQuickNoteScheduleDrafts === 'function') {
      quickNoteScheduleDrafts = mergeQuickNoteScheduleDrafts(changes.quick_note_due_drafts.newValue);
      hydrateQuickNoteComposer();
    }
  }

  if (changes.memories) {
    if (typeof renderHomeMemories === 'function') {
      quickNoteMemories = changes.memories.newValue || [];
      renderHomeMemories(quickNoteMemories);
      renderNoteHintChip(document.getElementById('quick-note').value || '');
    }
  }

  if (changes.quick_links || changes.quick_links_migrated) {
    if (typeof loadQuickLinks === 'function') loadQuickLinks();
  }

  if (changes.bookmark_groups || changes.pin_hash) {
    loadBookmarkGroupsShelf();
  }

  if (changes.quick_link_usage) {
    if (typeof normalizeQuickLinkUsage === 'function') {
      quickLinksUsage = normalizeQuickLinkUsage(changes.quick_link_usage.newValue);
      renderQuickLinks();
    }
  }

  if (changes.sessions || changes.active_session_id) {
    if (typeof loadSessions === 'function') loadSessions();
    if (typeof renderMorningBrief === 'function') renderMorningBrief();
    if (typeof refreshQuickLinksContext === 'function') refreshQuickLinksContext().then(() => renderQuickLinks());
  }

  if (changes.tasks || changes.tasks_date || changes.tasks_carryover_queue) {
    if (typeof loadTasks === 'function') loadTasks().then(() => renderMorningBrief());
  }

  if (changes.meetings_v2) {
    if (typeof normalizeMeetingRecordV2 === 'function') {
      meetings = (changes.meetings_v2.newValue || []).map(normalizeMeetingRecordV2).sort(sortMeetingsAscendingV2);
      renderMeetings();
      renderMorningBrief();
      checkMeetingAlert();
      if (typeof refreshQuickLinksContext === 'function') refreshQuickLinksContext().then(() => renderQuickLinks());
    }
  }

  if (changes.focus_timer_runtime) {
    if (typeof normalizeTimerRuntime === 'function') {
      focusTimerRuntime = normalizeTimerRuntime(changes.focus_timer_runtime.newValue);
      renderFocusTimer();
      ensureFocusTimerTicking();
    }
  }

  if (changes.focus_timer_stats) {
    if (typeof normalizeTimerStats === 'function') {
      focusTimerStats = normalizeTimerStats(changes.focus_timer_stats.newValue);
      renderFocusTimer();
    }
  }

  if (changes.smart_reminders_config) {
    if (typeof normalizeSmartRemindersConfig === 'function') {
      smartRemindersConfig = normalizeSmartRemindersConfig(changes.smart_reminders_config.newValue);
      smartRemindersRuntime = normalizeSmartRemindersRuntime(smartRemindersRuntime, smartRemindersConfig);
      renderSmartReminderUI();
      runSmartReminderEngine();
    }
  }

  if (changes.smart_reminders_runtime) {
    if (typeof normalizeSmartRemindersRuntime === 'function') {
      smartRemindersRuntime = normalizeSmartRemindersRuntime(changes.smart_reminders_runtime.newValue, smartRemindersConfig);
      renderSmartReminderUI();
    }
  }
});

if (chrome.tabs?.onCreated) {
  chrome.tabs.onCreated.addListener(() => {
    if (typeof scheduleSessionRuntimeRefresh === 'function') scheduleSessionRuntimeRefresh();
  });
}

if (chrome.tabs?.onRemoved) {
  chrome.tabs.onRemoved.addListener(() => {
    if (typeof scheduleSessionRuntimeRefresh === 'function') scheduleSessionRuntimeRefresh();
  });
}

if (chrome.tabs?.onAttached) {
  chrome.tabs.onAttached.addListener(() => {
    if (typeof scheduleSessionRuntimeRefresh === 'function') scheduleSessionRuntimeRefresh();
  });
}

if (chrome.tabs?.onDetached) {
  chrome.tabs.onDetached.addListener(() => {
    if (typeof scheduleSessionRuntimeRefresh === 'function') scheduleSessionRuntimeRefresh();
  });
}

if (chrome.tabs?.onUpdated) {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url || changeInfo.status === 'complete') {
      if (typeof scheduleSessionRuntimeRefresh === 'function') scheduleSessionRuntimeRefresh();
    }
  });
}

const topbarMenuBtn = document.getElementById('topbar-menu-btn');
const topbarMenuDropdown = document.getElementById('topbar-menu-dropdown');
if (topbarMenuBtn && topbarMenuDropdown) {
  topbarMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    topbarMenuDropdown.classList.toggle('hidden');
    if (!topbarMenuDropdown.classList.contains('hidden')) {
      setTimeout(() => topbarMenuDropdown.classList.add('show'), 10);
    } else {
      topbarMenuDropdown.classList.remove('show');
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.topbar-menu-wrapper')) {
      topbarMenuDropdown.classList.remove('show');
      setTimeout(() => topbarMenuDropdown.classList.add('hidden'), 200);
    }
  });

  document.getElementById('btn-customize-newtab')?.addEventListener('click', () => {
    // Customize flow is not fully implemented yet, redirecting to settings as placeholder
    chrome.tabs.create({ url: 'chrome://settings/' });
  });
}

// ===== HELPERS =====
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escAttr(str) {
  return escHtml(str)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeComparableText(str) {
  return String(str || '')
    .normalize('NFC')
    .trim()
    .toLowerCase();
}

// ===== SEARCH TOGGLE =====
async function loadSearchVisibility() {
  const data = await store.get(['search_hidden']);
  const hidden = data.search_hidden !== false;
  applySearchVisibility(hidden);
}

function applySearchVisibility(hidden) {
  const wrap = document.getElementById('search-wrap');
  const btn = document.getElementById('btn-toggle-search');
  const menuBtn = document.getElementById('btn-toggle-search-menu');
  const buttons = [btn, menuBtn].filter(Boolean);
  const icon = hidden ? 'Show' : 'Hide';
  const title = hidden ? 'Show the search bar' : 'Hide the search bar';
  if (!wrap) return;
  if (hidden) {
    wrap.classList.add('search-hidden');
    btn.classList.add('hidden-active');
    btn.innerHTML = '🔍 Hiện tìm kiếm';
    btn.title = 'Click để hiện thanh tìm kiếm';
  } else {
    wrap.classList.remove('search-hidden');
    btn.classList.remove('hidden-active');
    btn.innerHTML = '🙈 Ẩn tìm kiếm';
    btn.title = 'Click để ẩn thanh tìm kiếm (dùng thanh địa chỉ Chrome)';
  }
  buttons.forEach((button) => {
    button.classList.toggle('hidden-active', hidden);
    button.textContent = `${icon} search`;
    button.title = title;
  });
}

document.getElementById('btn-toggle-search').addEventListener('click', async () => {
  const data = await store.get(['search_hidden']);
  const currentlyHidden = data.search_hidden !== false;
  const nowHidden = !currentlyHidden;
  await store.set({ search_hidden: nowHidden });
  applySearchVisibility(nowHidden);
});

document.getElementById('btn-toggle-search-menu')?.addEventListener('click', async () => {
  topbarMenuDropdown?.classList.remove('show');
  setTimeout(() => topbarMenuDropdown?.classList.add('hidden'), 120);
  const data = await store.get(['search_hidden']);
  const currentlyHidden = data.search_hidden !== false;
  const nowHidden = !currentlyHidden;
  await store.set({ search_hidden: nowHidden });
  applySearchVisibility(nowHidden);
});

// ===== ONBOARDING SAVE BUTTON =====
// Session v2 listener is attached later.


// ===== INIT =====
async function init() {
  await loadCurrentLanguage();
  applyNewTabStaticLanguage();

  await loadSearchEngine();
  await loadBookmarkGroupsShelf();
  await loadSearchVisibility();
  setupLazyNewtabFeatures();

  applyNewTabStaticLanguage();
  applyNewTabRuntimeTranslations();
  ensureNewTabLanguageObserver();

  // Refresh brief + alert every minute
  setInterval(() => {
    if (typeof renderMorningBrief === 'function') renderMorningBrief();
    if (typeof checkMeetingAlert === 'function') checkMeetingAlert();
    applyNewTabRuntimeTranslations();
  }, 60000);

  // Request notification permission
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

window.addEventListener('pageshow', () => {
  if (typeof resetMeetingFormState === 'function') resetMeetingFormState();
  if (typeof refreshQuickLinksContext === 'function') refreshQuickLinksContext().then(() => renderQuickLinks());
});

window.addEventListener('focus', () => {
  if (typeof refreshQuickLinksContext === 'function') refreshQuickLinksContext().then(() => renderQuickLinks());
});

init();


// ===== OFFIQA I18N HARDENING PASS =====
// Final runtime normalizer: removes mixed-language UI fragments left by legacy hardcoded HTML/JS.
(() => {
  const normalize = (lang) => ['en', 'es', 'vi'].includes(lang) ? lang : 'en';
  const GUARD_PASS1 = Object.fromEntries(Object.entries(globalThis.OFFIQA_I18N_PACKS || {}).map(([lang, pack]) => [lang, pack.newtabRuntimeGuard?.pass1 || {}]));
  const PACKS = Object.fromEntries(Object.entries(GUARD_PASS1).map(([lang, pack]) => [lang, pack.map || {}]));
  const FRAGMENTS = Object.fromEntries(Object.entries(GUARD_PASS1).map(([lang, pack]) => [lang, pack.fragments || []]));

  function langNow() {
    try {
      if (typeof currentLanguage === 'string') return normalize(currentLanguage);
    } catch (_) {}
    return normalize(document.documentElement.lang);
  }

  function plural(lang, count, singular, pluralForm) {
    const n = Number(count);
    if (lang === 'en') return `${count} ${n === 1 ? singular : pluralForm}`;
    return `${count} ${pluralForm}`;
  }

  function applyPatterns(text, lang) {
    if (lang === 'en') {
      return text
        .replace(/^(\d+)\s*còn lại$/i, '$1 left')
        .replace(/^(\d+)\s*task$/i, '$1 tasks')
        .replace(/^(\d+)\s*đang làm$/i, '$1 in progress')
        .replace(/^(\d+)\s*đã xong$/i, '$1 done')
        .replace(/^(\d+)\s*mục$/i, '$1 items')
        .replace(/^(\d+)\s*hôm nay$/i, '$1 today')
        .replace(/^(\d+)\s*sắp tới$/i, '$1 upcoming')
        .replace(/^(\d+)\s*phiên$/i, '$1 sessions')
        .replace(/^(\d+)\s*tab$/i, '$1 tabs')
        .replace(/^(\d+)\s*app$/i, '$1 apps')
        .replace(/^(\d+)\s*\/\s*(\d+)\s*app ưu tiên$/i, '$1 / $2 priority apps')
        .replace(/^(\d+)\s*nhắc nhở đang bật$/i, '$1 reminders active')
        .replace(/^(\d+)\s*loại dữ liệu sẽ được dọn$/i, '$1 data types will be cleaned')
        .replace(/^Hôm nay:\s*(\d+)\s*phút tập trung$/i, 'Today: $1 minutes focused')
        .replace(/^Xong lúc\s+(.+)$/i, 'Finishes at $1')
        .replace(/^(.+)\s+vừa kết thúc$/i, '$1 just ended')
        .replace(/^(.+)\s+bắt đầu trong\s+(\d+)\s+phút$/i, '$1 starts in $2 minutes')
        .replace(/^(.+)\s+bắt đầu ngay bây giờ$/i, '$1 starts right now')
        .replace(/^📅\s*(\d+)\s*lịch hôm nay$/i, '📅 $1 events today')
        .replace(/^✅\s*(\d+)\s*task còn lại$/i, '✅ $1 tasks left')
        .replace(/^⭐\s*(\d+)\s*task ưu tiên$/i, '⭐ $1 priority tasks')
        .replace(/^📌\s*Đang dở:\s*/i, '📌 In progress: ');
    }
    if (lang === 'es') {
      return text
        .replace(/^(\d+)\s*còn lại$/i, '$1 pendientes')
        .replace(/^(\d+)\s*task$/i, '$1 tareas')
        .replace(/^(\d+)\s*đang làm$/i, '$1 en curso')
        .replace(/^(\d+)\s*đã xong$/i, '$1 hechas')
        .replace(/^(\d+)\s*mục$/i, '$1 elementos')
        .replace(/^(\d+)\s*hôm nay$/i, '$1 hoy')
        .replace(/^(\d+)\s*sắp tới$/i, '$1 próximas')
        .replace(/^(\d+)\s*phiên$/i, '$1 sesiones')
        .replace(/^(\d+)\s*tab$/i, '$1 pestañas')
        .replace(/^(\d+)\s*app$/i, '$1 apps')
        .replace(/^(\d+)\s*\/\s*(\d+)\s*app ưu tiên$/i, '$1 / $2 apps prioritarias')
        .replace(/^(\d+)\s*nhắc nhở đang bật$/i, '$1 recordatorios activos')
        .replace(/^(\d+)\s*loại dữ liệu sẽ được dọn$/i, 'Se limpiarán $1 tipos de datos')
        .replace(/^Hôm nay:\s*(\d+)\s*phút tập trung$/i, 'Hoy: $1 minutos de enfoque')
        .replace(/^Xong lúc\s+(.+)$/i, 'Termina a las $1')
        .replace(/^(.+)\s+vừa kết thúc$/i, '$1 acaba de terminar')
        .replace(/^(.+)\s+bắt đầu trong\s+(\d+)\s+phút$/i, '$1 empieza en $2 minutos')
        .replace(/^(.+)\s+bắt đầu ngay bây giờ$/i, '$1 empieza ahora mismo')
        .replace(/^📅\s*(\d+)\s*lịch hôm nay$/i, '📅 $1 eventos hoy')
        .replace(/^✅\s*(\d+)\s*task còn lại$/i, '✅ $1 tareas pendientes')
        .replace(/^⭐\s*(\d+)\s*task ưu tiên$/i, '⭐ $1 tareas prioritarias')
        .replace(/^📌\s*Đang dở:\s*/i, '📌 En curso: ');
    }
    return text;
  }

  function translate(raw) {
    const lang = langNow();
    const pack = PACKS[lang] || PACKS.en;
    const value = String(raw ?? '');
    const match = value.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const leading = match?.[1] || '';
    const body = match?.[2] || value.trim();
    const trailing = match?.[3] || '';
    if (!body) return value;
    let next = pack[body] || body;
    if (next === body) {
      for (const [src, dst] of (FRAGMENTS[lang] || [])) {
        next = next.split(src).join(dst);
      }
      next = applyPatterns(next, lang);
    }
    return leading + next + trailing;
  }

  function shouldSkipTextNode(node) {
    const parent = node?.parentElement;
    if (!parent) return true;
    return !!parent.closest('script,style,noscript,textarea,input,[contenteditable="true"],.user-content,.clipboard-item-text,.snippet-preview,.memory-card-text,.bookmark-title,.session-title,.task-text,.meeting-title-text');
  }

  function translateNodeText(node) {
    if (shouldSkipTextNode(node)) return;
    const original = node.nodeValue;
    const translated = translate(original);
    if (translated !== original) node.nodeValue = translated;
  }

  function translateAttributes(el) {
    if (!el?.getAttribute) return;
    ['placeholder', 'title', 'aria-label'].forEach((attr) => {
      const original = el.getAttribute(attr);
      if (!original) return;
      const translated = translate(original);
      if (translated !== original) el.setAttribute(attr, translated);
    });
  }

  function apply(root = document.body) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      translateNodeText(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
    if (root.nodeType === Node.ELEMENT_NODE) translateAttributes(root);
    root.querySelectorAll?.('[placeholder],[title],[aria-label]').forEach(translateAttributes);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      translateNodeText(node);
      node = walker.nextNode();
    }
  }

  let scheduled = false;
  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; apply(document.body); }, 0);
  }

  apply(document.body);
  setTimeout(() => apply(document.body), 50);
  setTimeout(() => apply(document.body), 250);
  setTimeout(() => apply(document.body), 1000);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        translateNodeText(mutation.target);
      } else if (mutation.addedNodes?.length) {
        scheduleApply();
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  try {
    chrome?.storage?.onChanged?.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.language) setTimeout(() => apply(document.body), 0);
    });
  } catch (_) {}

  globalThis.offiqaForceI18nNormalize = apply;
})();

// ===== OFFIQA I18N EXTRA COVERAGE =====
(() => {
  const EXTRA_COVERAGE = Object.fromEntries(Object.entries(globalThis.OFFIQA_I18N_PACKS || {}).map(([lang, pack]) => [lang, pack.newtabExtraCoverage || {}]));
  function langNow() { try { if (typeof currentLanguage === 'string') return ['en','es','vi'].includes(currentLanguage) ? currentLanguage : 'en'; } catch (_) {} return ['en','es','vi'].includes(document.documentElement.lang) ? document.documentElement.lang : 'en'; }
  function mapForLang() { return EXTRA_COVERAGE[langNow()] || EXTRA_COVERAGE.en || {}; }
  function tr(value) { const raw = String(value ?? ''); const trimmed = raw.trim(); if (!trimmed) return raw; const mapped = mapForLang()[trimmed]; return mapped ? raw.replace(trimmed, mapped) : raw; }
  function apply(root = document.body) {
    if (!root) return;
    const visitText = (node) => { if (!node?.parentElement || node.parentElement.closest('script,style,noscript,textarea,input,[contenteditable="true"]')) return; const next = tr(node.nodeValue); if (next !== node.nodeValue) node.nodeValue = next; };
    if (root.nodeType === Node.TEXT_NODE) { visitText(root); return; }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
    const attrs = (el) => ['placeholder','title','aria-label'].forEach((attr) => { const old = el.getAttribute?.(attr); if (!old) return; const next = tr(old); if (next !== old) el.setAttribute(attr, next); });
    if (root.nodeType === Node.ELEMENT_NODE) attrs(root);
    root.querySelectorAll?.('[placeholder],[title],[aria-label]').forEach(attrs);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) { visitText(node); node = walker.nextNode(); }
  }
  setTimeout(apply, 0); setTimeout(apply, 100); setTimeout(apply, 500); setTimeout(apply, 1200);
  const observer = new MutationObserver(() => setTimeout(apply, 0));
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();

// Offiqa final i18n guard v3: fixes late-rendered legacy text, placeholders, and mixed strings.
(() => {
  if (window.__offiqaFinalI18nGuardV3) return;
  window.__offiqaFinalI18nGuardV3 = true;

  const supported = ['en', 'es', 'vi'];
  let storedLanguage = '';
  const normalizeLang = (lang) => supported.includes(lang) ? lang : 'en';
  const getLang = () => {
    try {
      if (typeof currentLanguage === 'string' && supported.includes(currentLanguage)) return currentLanguage;
    } catch (_) {}
    if (storedLanguage) return normalizeLang(storedLanguage);
    return normalizeLang(document.documentElement.lang);
  };

  try {
    chrome?.storage?.local?.get?.(['language'], (data) => {
      storedLanguage = normalizeLang(data?.language);
      document.documentElement.lang = storedLanguage;
      scheduleApply();
    });
    chrome?.storage?.onChanged?.addListener?.((changes, areaName) => {
      if (areaName === 'local' && changes.language) {
        storedLanguage = normalizeLang(changes.language.newValue);
        document.documentElement.lang = storedLanguage;
        scheduleApply();
      }
    });
  } catch (_) {}

  const packs = Object.fromEntries(Object.entries(globalThis.OFFIQA_I18N_PACKS || {}).map(([lang, pack]) => [lang, pack.newtabRuntimeGuard?.pass2 || {}]));

  function applyPatterns(text, lang) {
    if (lang === 'en') {
      return text
        .replace(/^(\d+)\s*(?:muc|mục)$/i, '$1 items')
        .replace(/^(\d+)\s*(?:hom nay|hôm nay)$/i, '$1 today')
        .replace(/^(\d+)\s*(?:sap toi|sắp tới)$/i, '$1 upcoming')
        .replace(/^(\d+)\s*(?:phien|phiên)$/i, '$1 sessions')
        .replace(/^Hôm nay:\s*(\d+)\s*(?:phút tập trung|minutes focused)$/i, 'Today: $1 minutes focused')
        .replace(/^Xong lúc\s+(.+)$/i, 'Finishes at $1')
        .replace(/^Còn\s+(\d+)\s+phút$/i, '$1 minutes left')
        .replace(/^Còn\s+(\d+)g(\d+p)?$/i, '$1h $2 left')
        .replace(/^Đã xong$/i, 'Done')
        .replace(/^Đang diễn ra$/i, 'In progress');
    }
    if (lang === 'es') {
      return text
        .replace(/^(\d+)\s*(?:muc|mục)$/i, '$1 elementos')
        .replace(/^(\d+)\s*(?:hom nay|hôm nay)$/i, '$1 hoy')
        .replace(/^(\d+)\s*(?:sap toi|sắp tới)$/i, '$1 próximas')
        .replace(/^(\d+)\s*(?:phien|phiên)$/i, '$1 sesiones')
        .replace(/^Hôm nay:\s*(\d+)\s*(?:phút tập trung|minutes focused)$/i, 'Hoy: $1 minutos de enfoque')
        .replace(/^Xong lúc\s+(.+)$/i, 'Termina a las $1')
        .replace(/^Còn\s+(\d+)\s+phút$/i, 'Quedan $1 minutos')
        .replace(/^Còn\s+(\d+)g(\d+p)?$/i, 'Quedan $1h $2')
        .replace(/^Đã xong$/i, 'Hecho')
        .replace(/^Đang diễn ra$/i, 'En curso');
    }
    return text
      .replace(/^Today:\s*(\d+)\s*minutes focused$/i, 'Hôm nay: $1 phút tập trung')
      .replace(/^Finishes at\s+(.+)$/i, 'Xong lúc $1')
      .replace(/^(\d+)\s*items$/i, '$1 mục')
      .replace(/^(\d+)\s*today$/i, '$1 hôm nay')
      .replace(/^(\d+)\s*upcoming$/i, '$1 sắp tới')
      .replace(/^(\d+)\s*sessions$/i, '$1 phiên');
  }

  function translateValue(value) {
    const original = String(value ?? '');
    if (!original.trim()) return original;
    const lang = getLang();
    const pack = packs[lang] || EN;
    const leading = original.match(/^\s*/)?.[0] || '';
    const trailing = original.match(/\s*$/)?.[0] || '';
    const body = original.trim();
    let translated = pack[body] || body;
    translated = applyPatterns(translated, lang);
    return leading + translated + trailing;
  }

  function translateElementAttributes(el) {
    if (!el?.getAttribute) return;
    ['placeholder', 'title', 'aria-label', 'value'].forEach((attr) => {
      if (!el.hasAttribute(attr)) return;
      const current = el.getAttribute(attr);
      const next = translateValue(current);
      if (next !== current) el.setAttribute(attr, next);
    });
    if ((el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) && typeof el.value === 'string') {
      const nextValue = translateValue(el.value);
      if (nextValue !== el.value) el.value = nextValue;
    }
  }

  function shouldSkipText(node) {
    const parent = node?.parentElement;
    if (!parent) return true;
    return !!parent.closest('script,style,noscript,[contenteditable="true"],.user-content,.clipboard-item-text,.snippet-preview,.memory-card-text,.bookmark-title,.session-title,.task-text,.meeting-title-text');
  }

  function apply(root = document.body) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      if (!shouldSkipText(root)) {
        const next = translateValue(root.nodeValue);
        if (next !== root.nodeValue) root.nodeValue = next;
      }
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
    if (root.nodeType === Node.ELEMENT_NODE) translateElementAttributes(root);
    root.querySelectorAll?.('[placeholder],[title],[aria-label],[value],input,textarea,button,option').forEach(translateElementAttributes);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (!shouldSkipText(node)) {
        const next = translateValue(node.nodeValue);
        if (next !== node.nodeValue) node.nodeValue = next;
      }
      node = walker.nextNode();
    }
  }

  let scheduled = false;
  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      apply(document.body);
    }, 0);
  }

  window.offiqaApplyFinalI18nGuard = () => apply(document.body);
  [0, 50, 150, 350, 800, 1500, 3000].forEach((delay) => setTimeout(() => apply(document.body), delay));
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        translateElementAttributes(mutation.target);
      } else if (mutation.type === 'characterData') {
        apply(mutation.target);
      } else if (mutation.addedNodes?.length) {
        scheduleApply();
      }
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['placeholder', 'title', 'aria-label', 'value']
  });
})();
