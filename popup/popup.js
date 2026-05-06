// Offiqa Popup JS

const store = {
  async get(keys) {
    return new Promise(resolve => {
      const result = chrome.storage.local.get(keys, resolve);
      if (result?.then) result.then(resolve);
    });
  },
  async set(obj) {
    return new Promise(resolve => {
      const result = chrome.storage.local.set(obj, resolve);
      if (result?.then) result.then(resolve);
    });
  }
};

const popupParams = new URLSearchParams(window.location.search);
const isEmbedded = popupParams.get('embedded') === '1';
const isHiddenBookmarkShortcut = popupParams.get('shortcut') === 'hidden-bookmarks';
const MEMORY_FILTERS = ['all', 'note', 'plan', 'checklist', 'reminder'];
const EMBEDDED_PANEL_ROUTES = ['memory-personal', 'focus-today', 'meetings-sidebar', 'sessions-sidebar'];
const CLIPBOARD_STORAGE_KEY = 'clipboard_items';
const ENABLE_CLIPBOARD_KEY = 'enable_clipboard';
const ENABLE_MEDIA_AUTOPLAY_KEY = 'enable_media_autoplay';
const QUICK_SNIPPETS_STORAGE_KEY = 'quick_text_snippets';
const ENABLE_QUICK_SNIPPETS_KEY = 'enable_quick_snippets';
const SESSION_STORAGE_KEY = 'sessions';
const ACTIVE_SESSION_KEY = 'active_session_id';
const MAX_CLIPBOARD_HISTORY = 250;
const SUPPORTED_LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'vi', label: 'Tiếng Việt' }
];
const POPUP_I18N = Object.fromEntries(Object.entries(globalThis.OFFIQA_I18N_PACKS || {}).map(([lang, pack]) => [lang, pack.popup || {}]));
const POPUP_TEXT_I18N = Object.fromEntries(Object.entries(globalThis.OFFIQA_I18N_PACKS || {}).map(([lang, pack]) => [lang, pack.popupText || {}]));
const POPUP_UI_I18N = Object.fromEntries(Object.entries(globalThis.OFFIQA_I18N_PACKS || {}).map(([lang, pack]) => [lang, pack.popupUi || {}]));
let currentMemoryFilter = MEMORY_FILTERS.includes(popupParams.get('memoryFilter')) ? popupParams.get('memoryFilter') : 'all';
let clipboardItems = [];
let clipboardSearchQuery = '';
let clipboardSortOrder = 'newest';
let cleanupButtonState = 'idle';
let cleanupButtonTimer = null;
let cleanupButtonMessage = '';
let cleanupExceptionAutoValue = '';
let cleanupEstimateTimer = null;
let cleanupEstimateRequestId = 0;
let cleanupEstimate = {
  status: 'idle',
  knownCount: 0,
  knownLabels: [],
  unknownLabels: []
};
let quickSnippets = [];
let quickSnippetSearchQuery = '';
let editingQuickSnippetId = '';
let currentLanguage = 'en';
if (isEmbedded) {
  document.body.classList.add('embedded');
}
if (isHiddenBookmarkShortcut) {
  document.body.classList.add('hidden-bookmark-shortcut');
}

function normalizeLanguageOptions(preferredLanguage) {
  return SUPPORTED_LANGUAGE_OPTIONS.some((option) => option.value === preferredLanguage)
    ? preferredLanguage
    : 'en';
}

function getPopupCopy(lang = currentLanguage) {
  return POPUP_I18N[lang] || POPUP_I18N.en;
}

function getPopupUi(lang = currentLanguage) {
  return POPUP_UI_I18N[lang] || POPUP_UI_I18N.en || {};
}

function getPopupUiValue(path, lang = currentLanguage) {
  const segments = String(path || '').split('.').filter(Boolean);
  const read = (source) => segments.reduce((value, segment) => value?.[segment], source);
  const localized = read(getPopupUi(lang));
  return localized == null ? read(getPopupUi('en')) : localized;
}

function popupUiText(path, replacements = {}) {
  const value = getPopupUiValue(path);
  if (value == null) return '';
  return String(value).replace(/\{(\w+)\}/g, (_, key) => (
    Object.prototype.hasOwnProperty.call(replacements, key) ? replacements[key] : ''
  ));
}

function setPopupText(selector, path, replacements = {}) {
  const element = typeof selector === 'string' ? document.querySelector(selector) : selector;
  if (element) element.textContent = popupUiText(path, replacements);
}

function setPopupHtml(selector, path, replacements = {}) {
  const element = typeof selector === 'string' ? document.querySelector(selector) : selector;
  if (element) element.innerHTML = popupUiText(path, replacements);
}

function setPopupPlaceholder(selector, path, replacements = {}) {
  const element = typeof selector === 'string' ? document.querySelector(selector) : selector;
  if (element) element.placeholder = popupUiText(path, replacements);
}

function getMemoryTypeLabels(lang = currentLanguage) {
  return getPopupCopy(lang).memoryTypes || POPUP_I18N.en.memoryTypes;
}

function getMemoryEmptyLabel(filter = currentMemoryFilter) {
  const labels = getMemoryTypeLabels();
  const label = labels[filter] || filter;
  if (filter === 'all') {
    if (currentLanguage === 'vi') return 'Chưa có ghi nhớ cá nhân nào';
    if (currentLanguage === 'es') return 'Aún no hay notas personales';
    return 'No personal memory yet';
  }
  if (currentLanguage === 'vi') return `Chưa có mục ${label} nào`;
  if (currentLanguage === 'es') return `Aún no hay ${label.toLowerCase()}`;
  return `No ${label.toLowerCase()} items yet`;
}

function getPopupLanguageLocale(lang = currentLanguage) {
  if (lang === 'es') return 'es-ES';
  if (lang === 'vi') return 'vi-VN';
  return 'en-US';
}

function translatePopupDynamicTextValue(text) {
  const value = String(text || '');
  if (currentLanguage === 'vi' || !value) return value;

  const patterns = currentLanguage === 'es'
    ? [
        [/^Đã mở (\d+) trang từ nhóm "(.+)"$/, 'Se abrieron $1 páginas del grupo "$2"'],
        [/^Đã xóa nhóm "(.+)"$/, 'Se eliminó el grupo "$1"'],
        [/^Đã lưu vào "(.+)"$/, 'Guardado en "$1"'],
        [/^Xóa nhóm "(.+)" và (\d+) dấu trang trong nhóm này\?$/, '¿Eliminar el grupo "$1" y sus $2 marcadores?'],
        [/^Xóa nhóm "(.+)"\?$/, '¿Eliminar el grupo "$1"?'],
        [/^Xóa (\d+) ghi nhớ\?$/, '¿Eliminar $1 notas?'],
        [/^Xóa toàn bộ (\d+) mục đã sao chép\?$/, '¿Eliminar los $1 elementos copiados?'],
        [/^Bỏ qua (\d+) loại dữ liệu chưa được hỗ trợ$/, 'Se omitieron $1 tipos de datos que aún no son compatibles'],
        [/^Trong (\d+) phut$/, 'En $1 min'],
        [/^Trong (\d+)g (\d+)p$/, 'En $1 h $2 min'],
        [/^Đã có (\d+) ghi chú cho (trang này|toàn domain)\. Ghi thêm sẽ tạo mục mới\.$/, 'Ya hay $1 notas para $2. Agregar una más creará una nota nueva.'],
        [/^Chưa có ghi chú cho (trang này|toàn domain)\.$/, 'Aún no hay notas para $1.'],
        [/^Đang sửa 1 ghi chú của (trang này|toàn domain)\.$/, 'Editando 1 nota de $1.'],
        [/^Đang thêm ghi chú mới cho (trang này|toàn domain)\.$/, 'Agregando una nota nueva para $1.'],
        [/^Sẵn sàng lưu trang hiện tại vào nhóm đã chọn\.$/, 'Listo para guardar la página actual en el grupo seleccionado.']
      ]
    : [
        [/^Đã mở (\d+) trang từ nhóm "(.+)"$/, 'Opened $1 pages from group "$2"'],
        [/^Đã xóa nhóm "(.+)"$/, 'Deleted group "$1"'],
        [/^Đã lưu vào "(.+)"$/, 'Saved to "$1"'],
        [/^Xóa nhóm "(.+)" và (\d+) dấu trang trong nhóm này\?$/, 'Delete group "$1" and its $2 bookmarks?'],
        [/^Xóa nhóm "(.+)"\?$/, 'Delete group "$1"?'],
        [/^Xóa (\d+) ghi nhớ\?$/, 'Delete $1 notes?'],
        [/^Xóa toàn bộ (\d+) mục đã sao chép\?$/, 'Delete all $1 copied items?'],
        [/^Bỏ qua (\d+) loại dữ liệu chưa được hỗ trợ$/, 'Skipped $1 data types that are not supported yet'],
        [/^Trong (\d+) phut$/, 'In $1 min'],
        [/^Trong (\d+)g (\d+)p$/, 'In $1h $2m'],
        [/^Đã có (\d+) ghi chú cho (trang này|toàn domain)\. Ghi thêm sẽ tạo mục mới\.$/, 'There are already $1 notes for $2. Adding another one will create a new note.'],
        [/^Chưa có ghi chú cho (trang này|toàn domain)\.$/, 'No notes yet for $1.'],
        [/^Đang sửa 1 ghi chú của (trang này|toàn domain)\.$/, 'Editing 1 note for $1.'],
        [/^Đang thêm ghi chú mới cho (trang này|toàn domain)\.$/, 'Adding a new note for $1.'],
        [/^Sẵn sàng lưu trang hiện tại vào nhóm đã chọn\.$/, 'Ready to save the current page to the selected group.']
      ];

  let nextValue = value;
  patterns.forEach(([pattern, replacement]) => {
    nextValue = nextValue.replace(pattern, replacement);
  });

  return nextValue
    .replaceAll('trang này', currentLanguage === 'es' ? 'esta página' : 'this page')
    .replaceAll('toàn domain', currentLanguage === 'es' ? 'todo el dominio' : 'the whole domain');
}

function translatePopupTextValue(value) {
  const text = String(value || '');
  const map = POPUP_TEXT_I18N[currentLanguage] || {};
  return translatePopupDynamicTextValue(map[text] || text);
}

function applyPopupRuntimeTranslations(root = document.body) {
  if (!root) return;

  if (root.nodeType === Node.ELEMENT_NODE) {
    const element = root;
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      if (element.placeholder) {
        element.placeholder = translatePopupTextValue(element.placeholder);
      }
      const ariaLabel = element.getAttribute('aria-label');
      if (ariaLabel) element.setAttribute('aria-label', translatePopupTextValue(ariaLabel));
      const title = element.getAttribute('title');
      if (title) element.setAttribute('title', translatePopupTextValue(title));
    }
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const trimmed = String(node.nodeValue || '').trim();
    if (trimmed) {
      const translated = translatePopupTextValue(trimmed);
      if (translated !== trimmed) {
        node.nodeValue = node.nodeValue.replace(trimmed, translated);
      }
    }
    node = walker.nextNode();
  }

  root.querySelectorAll?.('[placeholder],[aria-label],[title]').forEach((element) => {
    if (element.hasAttribute('placeholder')) {
      element.setAttribute('placeholder', translatePopupTextValue(element.getAttribute('placeholder')));
    }
    if (element.hasAttribute('aria-label')) {
      element.setAttribute('aria-label', translatePopupTextValue(element.getAttribute('aria-label')));
    }
    if (element.hasAttribute('title')) {
      element.setAttribute('title', translatePopupTextValue(element.getAttribute('title')));
    }
  });
}

let popupI18nObserver = null;

function ensurePopupLanguageObserver() {
  if (popupI18nObserver) return;
  popupI18nObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'characterData' && mutation.target?.parentElement) {
        applyPopupRuntimeTranslations(mutation.target.parentElement);
        return;
      }
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          applyPopupRuntimeTranslations(node);
        } else if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
          applyPopupRuntimeTranslations(node.parentElement);
        }
      });
    });
  });
  popupI18nObserver.observe(document.body, { childList: true, characterData: true, subtree: true });
}

function applyPopupStaticUi() {
  setPopupText('#page-notes-card .card-title', 'pageNote.cardTitle');
  setPopupText('#page-notes-card .card-desc', 'pageNote.cardDesc');
  setPopupText('#btn-goto-page', 'pageNote.gotoPage');
  document.getElementById('btn-goto-page')?.setAttribute('title', popupUiText('pageNote.gotoPage'));
  setPopupText('.scope-btn[data-scope="page"]', 'pageNote.scopePage');
  setPopupText('.scope-btn[data-scope="domain"]', 'pageNote.scopeDomain');
  setPopupPlaceholder('#page-note-text', 'pageNote.placeholder');
  setPopupText('#btn-save-note', 'pageNote.saveAdd');
  setPopupText('#btn-reset-note-editor', 'pageNote.reset');
  setPopupText('#page-notes-card .hint', 'pageNote.noteHint');
  setPopupText('#saved-page-notes-card .card-title', 'pageNote.savedTitle');
  setPopupText('#saved-page-notes-card .card-desc', 'pageNote.savedDesc');

  setPopupText('#tab-bookmarks #bm-view-main > .card:first-child .card-title', 'bookmarks.smartTitle');
  setPopupText('#tab-bookmarks #bm-view-main > .card:first-child .card-desc', 'bookmarks.smartDesc');
  setPopupText('#btn-save-current', 'bookmarks.saveThisPage');
  setPopupPlaceholder('#bm-search', 'bookmarks.searchPlaceholder');
  setPopupText('#tab-bookmarks .new-group-form > .card-title', 'bookmarks.newGroupTitle');
  setPopupText('#tab-bookmarks .new-group-form > .card-desc', 'bookmarks.newGroupDesc');
  setPopupPlaceholder('#new-group-name', 'bookmarks.groupNamePlaceholder');
  setPopupText('label[for="new-group-hidden"], #new-group-hidden + .checkbox-label', 'bookmarks.hiddenGroup');
  setPopupText('#btn-create-group', 'bookmarks.createGroup');
  setPopupText('#auto-delete-on-close + .checkbox-label', 'bookmarks.autoDelete');
  setPopupText('#btn-set-pin', 'bookmarks.setPin');
  setPopupText('#tab-bookmarks .new-group-form .hint', 'bookmarks.shortcutHint');
  setPopupText('#bookmark-group-card-title', 'bookmarks.groupList');
  setPopupText('#btn-show-hidden', 'bookmarks.openHiddenGroups');
  setPopupText('#bookmark-group-card-desc', 'bookmarks.dragHint');
  setPopupText('#btn-open-group-detail', 'bookmarks.openAll');
  setPopupText('#btn-delete-group-detail', 'bookmarks.deleteGroup');
  setPopupText('.pin-key[data-key="C"]', 'bookmarks.pinClear');
  if (isHiddenBookmarkShortcut) {
    setPopupText('#bookmark-group-card-title', 'bookmarks.groupList');
    setPopupText('#bookmark-group-card-desc', 'bookmarks.dragHint');
  }

  setPopupText('#tab-data .clipboard-intro', 'clipboard.intro');
  setPopupPlaceholder('#clipboard-search', 'clipboard.searchPlaceholder');
  document.getElementById('clipboard-sort')?.setAttribute('aria-label', popupUiText('clipboard.sortLabel'));
  const sortCopy = getPopupUiValue('clipboard.sort') || {};
  Array.from(document.getElementById('clipboard-sort')?.options || []).forEach((option) => {
    if (sortCopy[option.value]) option.textContent = sortCopy[option.value];
  });
  setPopupText('#btn-clear-clipboard', 'clipboard.clearAll');
  setPopupPlaceholder('#clipboard-input', 'clipboard.inputPlaceholder');

  setPopupText('#tab-snippets > .card:first-child .card-title', 'snippets.introTitle');
  setPopupHtml('#tab-snippets > .card:first-child .card-desc', 'snippets.descriptionHtml');
  setPopupHtml('#tab-snippets .snippet-usage-note', 'snippets.usageNoteHtml');
  setPopupText('#snippet-form-title', editingQuickSnippetId ? 'snippets.formTitleEdit' : 'snippets.formTitleAdd');
  setPopupPlaceholder('#snippet-keyword', 'snippets.keywordPlaceholder');
  setPopupPlaceholder('#snippet-content', 'snippets.contentPlaceholder');
  setPopupText('#btn-save-snippet', 'snippets.save');
  setPopupText('#btn-cancel-snippet-edit', 'snippets.cancelEdit');
  setPopupHtml('#snippet-form-status', 'snippets.formStatusHtml');
  setPopupText('#tab-snippets .card:nth-of-type(3) .card-title', 'snippets.listTitle');
  setPopupText('#tab-snippets .card:nth-of-type(3) .card-desc', 'snippets.listDesc');
  setPopupPlaceholder('#snippet-search', 'snippets.searchPlaceholder');

  setPopupText('.memory-advance-label', 'memory.reminderAdvanceLabel');
  document.getElementById('memory-advance-input')?.setAttribute('aria-label', popupUiText('memory.reminderAdvanceAria'));
  const advanceUnit = document.getElementById('memory-advance-unit');
  const unitOptions = getPopupUiValue('memory.unitOptions') || {};
  Array.from(advanceUnit?.options || []).forEach((option) => {
    if (unitOptions[option.value]) option.textContent = unitOptions[option.value];
  });
}

function applyPopupLanguage(lang = currentLanguage) {
  currentLanguage = POPUP_I18N[lang] ? lang : 'en';
  document.documentElement.lang = currentLanguage;

  const copy = getPopupCopy();
  const tabButtons = {
    memory: document.querySelector('.tab-btn[data-tab="memory"]'),
    bookmarks: document.querySelector('.tab-btn[data-tab="bookmarks"]'),
    data: document.querySelector('.tab-btn[data-tab="data"]'),
    snippets: document.querySelector('.tab-btn[data-tab="snippets"]'),
    cleanup: document.querySelector('.tab-btn[data-tab="cleanup"]'),
    settings: document.querySelector('.tab-btn[data-tab="settings"]')
  };
  Object.entries(tabButtons).forEach(([key, element]) => {
    if (element) element.textContent = copy.tabs[key];
  });

  const settingsGroupTitles = document.querySelectorAll('#tab-settings .settings-group-title');
  copy.settings.groups.forEach((value, index) => {
    if (settingsGroupTitles[index]) settingsGroupTitles[index].textContent = value;
  });

  const settingsRows = document.querySelectorAll('#tab-settings .settings-row');
  copy.settings.labels.forEach((value, index) => {
    const label = settingsRows[index]?.querySelector('.settings-label');
    if (label) label.textContent = value;
  });

  const checkboxLabels = [
    settingsRows[1]?.querySelector('.checkbox-label'),
    settingsRows[2]?.querySelector('.checkbox-label'),
    settingsRows[3]?.querySelector('.checkbox-label'),
    settingsRows[4]?.querySelector('.checkbox-label')
  ];
  copy.settings.toggles.forEach((value, index) => {
    if (checkboxLabels[index]) checkboxLabels[index].textContent = value;
  });

  const privacyNote = document.querySelector('#tab-settings .privacy-note');
  if (privacyNote) privacyNote.innerHTML = copy.settings.privacyNote;

  const backupCopy = copy.settings.backup || {};
  const backupDescription = document.getElementById('backup-copy');
  if (backupDescription && backupCopy.description) backupDescription.textContent = backupCopy.description;
  const backupExportButton = document.getElementById('btn-backup-export');
  if (backupExportButton && backupCopy.exportButton) backupExportButton.textContent = backupCopy.exportButton;
  const backupRestoreButton = document.getElementById('btn-backup-restore');
  if (backupRestoreButton && backupCopy.restoreButton) backupRestoreButton.textContent = backupCopy.restoreButton;

  const resetButton = document.getElementById('btn-reset-all');
  if (resetButton) resetButton.textContent = copy.settings.resetButton;

  const memoryTypeLabels = getMemoryTypeLabels();
  const memoryTypeSelect = document.getElementById('memory-type');
  if (memoryTypeSelect) {
    Array.from(memoryTypeSelect.options).forEach((option) => {
      if (memoryTypeLabels[option.value]) option.textContent = memoryTypeLabels[option.value];
    });
  }
  document.querySelectorAll('.memory-filter-btn[data-filter]').forEach((button) => {
    const label = memoryTypeLabels[button.dataset.filter];
    if (label) button.textContent = label;
  });

  applyPopupStaticUi();
  try {
    if (typeof updateBookmarkSaveState === 'function') updateBookmarkSaveState();
    if (typeof renderTargetGroupOptions === 'function') renderTargetGroupOptions();
    if (typeof renderGroups === 'function') renderGroups();
    if (typeof renderHiddenShortcutStatus === 'function') renderHiddenShortcutStatus();
    if (typeof renderClipboard === 'function') renderClipboard();
    if (typeof renderQuickSnippets === 'function') renderQuickSnippets();
    if (typeof syncCurrentNoteEditor === 'function') syncCurrentNoteEditor();
  } catch (error) {
    console.warn('[Offiqa] Could not refresh localized popup state:', error);
  }
  applyPopupRuntimeTranslations();
}

function normalizeTabRoute(tab) {
  if (tab === 'memory-personal') return 'memory';
  return tab;
}

function applyEmbeddedRoute(tab) {
  const isEmbeddedPanelOnly = isEmbedded && EMBEDDED_PANEL_ROUTES.includes(tab);
  document.body.classList.toggle('embedded-panel-only', isEmbeddedPanelOnly);
  const isPersonalMemoryOnly = isEmbedded && tab === 'memory-personal';
  document.body.classList.toggle('memory-personal-only', isPersonalMemoryOnly);
}

function getInitialPopupRoute() {
  if (isHiddenBookmarkShortcut) return 'bookmarks';
  return window.location.hash.replace('#', '') || 'cleanup';
}

async function handlePopupRouteChange() {
  const route = getInitialPopupRoute();
  await activateTab(route);
  if (isEmbedded && route === 'memory-personal') {
    const filterRow = document.getElementById('memory-filter-row');
    if (filterRow) filterRow.scrollIntoView({ block: 'start' });
  }
}

function getBookmarkGroupsForCurrentView() {
  if (hiddenShortcutLockedByPin && !hiddenShortcutUnlocked) {
    return [];
  }

  return bookmarkGroups;
}

function getBookmarkSaveGroups() {
  if (hiddenShortcutLockedByPin && !hiddenShortcutUnlocked) {
    return [];
  }

  return bookmarkGroups;
}

function isTrackableUrl(url) {
  if (!url) return false;
  const blockedPrefixes = [
    `chrome-extension://${chrome.runtime.id}/`,
    'chrome://',
    'edge://',
    'about:',
    'devtools://'
  ];
  return !blockedPrefixes.some((prefix) => url.startsWith(prefix));
}

function isSupportedPageUrl(url) {
  if (!isTrackableUrl(url)) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

async function getActiveTab() {
  const [activeTab] = await new Promise((resolve) => chrome.tabs.query({ active: true, currentWindow: true }, resolve));
  return activeTab || null;
}

function buildPageContext(tab) {
  const rawUrl = typeof tab?.url === 'string' ? tab.url : '';
  if (!isSupportedPageUrl(rawUrl)) {
    return {
      tab,
      isValid: false,
      url: '',
      domain: '',
      title: tab?.title || ''
    };
  }

  try {
    const parsed = new URL(rawUrl);
    return {
      tab,
      isValid: true,
      url: parsed.href,
      domain: parsed.hostname,
      title: tab?.title || ''
    };
  } catch {
    return {
      tab,
      isValid: false,
      url: '',
      domain: '',
      title: tab?.title || ''
    };
  }
}

async function getContextTab() {
  const activeTab = await getActiveTab();
  if (activeTab && isTrackableUrl(activeTab.url)) {
    return activeTab;
  }

  const data = await store.get(['last_context_tab']);
  return data.last_context_tab || activeTab || null;
}

const POPUP_FEATURES = {
  cleanup: ['features/cleanup.js'],
  memory: ['features/memory.js'],
  bookmarks: ['features/bookmarks.js'],
  data: ['features/data.js'],
  snippets: ['features/snippets.js'],
  settings: ['features/settings.js'],
  'focus-today': ['features/focus-sidebar.js'],
  'meetings-sidebar': ['features/meetings-sidebar.js'],
  'sessions-sidebar': ['features/sessions-sidebar.js']
};
const POPUP_FEATURE_DEPS = {
  bookmarks: ['memory']
};
const popupFeaturePromises = new Map();

function getPopupFeatureForRoute(tab) {
  return POPUP_FEATURES[normalizeTabRoute(tab)] ? normalizeTabRoute(tab) : '';
}

function loadPopupScript(src) {
  const url = new URL(src, document.baseURI).href;
  if (popupFeaturePromises.has(url)) return popupFeaturePromises.get(url);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Unable to load popup feature: ${src}`));
    document.head.appendChild(script);
  });
  popupFeaturePromises.set(url, promise);
  return promise;
}

async function ensurePopupFeature(tab) {
  const feature = getPopupFeatureForRoute(tab);
  if (!feature) return;
  for (const dependency of POPUP_FEATURE_DEPS[feature] || []) {
    await ensurePopupFeature(dependency);
  }
  await Promise.all((POPUP_FEATURES[feature] || []).map(loadPopupScript));
}

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    activateTab(btn.dataset.tab);
  });
});

async function activateTab(tab) {
  const normalizedTab = normalizeTabRoute(tab);
  applyEmbeddedRoute(tab);

  const button = document.querySelector(`.tab-btn[data-tab="${normalizedTab}"]`);
  const content = document.getElementById(`tab-${normalizedTab}`);
  if (!content) return;
  await ensurePopupFeature(normalizedTab);

  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
  if (button) button.classList.add('active');
  content.classList.add('active');

  if (normalizedTab === 'bookmarks' && typeof loadBookmarks === 'function') loadBookmarks();
  if (normalizedTab === 'data' && typeof loadClipboard === 'function') loadClipboard();
  if (normalizedTab === 'snippets' && typeof loadQuickSnippets === 'function') loadQuickSnippets();
  if (normalizedTab === 'memory' && typeof loadNotes === 'function') loadNotes();
  if (normalizedTab === 'focus-today' && typeof loadFocusSidebar === 'function') loadFocusSidebar();
  if (normalizedTab === 'meetings-sidebar' && typeof loadMeetingsSidebar === 'function') loadMeetingsSidebar();
  if (normalizedTab === 'sessions-sidebar' && typeof loadSessionsSidebar === 'function') loadSessionsSidebar();
  if (normalizedTab === 'settings' && typeof loadSettings === 'function') loadSettings();
  if (normalizedTab === 'cleanup') {
    if (typeof updateCleanupCount === 'function') updateCleanupCount();
    if (typeof refreshCleanupExceptionInput === 'function') refreshCleanupExceptionInput();
  }
}

document.getElementById('exceptions-list').addEventListener('click', (e) => {
  const button = e.target.closest('[data-action="remove-exception"]');
  if (button) {
    removeException(Number(button.dataset.index));
  }
});

document.getElementById('saved-notes-list').addEventListener('click', (e) => {
  const editButton = e.target.closest('[data-action="edit-note"]');
  if (editButton) {
    editNote(editButton.dataset.noteId);
    return;
  }

  const button = e.target.closest('[data-action="delete-note"]');
  if (button) {
    deleteNote(button.dataset.noteId);
  }
});

document.getElementById('memory-list').addEventListener('click', (e) => {
  const button = e.target.closest('[data-action="delete-memory"]');
  if (button) {
    deleteMemory(Number(button.dataset.index));
  }
});

document.getElementById('group-list').addEventListener('click', (e) => {
  const deleteBtn = e.target.closest('[data-action="delete-group"]');
  if (deleteBtn) {
    deleteGroup(deleteBtn.dataset.groupId);
    return;
  }

  const groupItem = e.target.closest('.group-item[data-group-id]');
  if (groupItem) {
    openGroup(groupItem.dataset.groupId);
  }
});

document.getElementById('bm-bookmark-list').addEventListener('click', (e) => {
  const deleteBtn = e.target.closest('[data-action="delete-bookmark"]');
  if (deleteBtn) {
    deleteBookmark(deleteBtn.dataset.groupId, Number(deleteBtn.dataset.index));
    return;
  }

  const title = e.target.closest('.bookmark-title[data-url]');
  if (title) {
    openBookmark(title.dataset.url);
  }
});

document.getElementById('clipboard-list').addEventListener('click', (e) => {
  const actionButton = e.target.closest('[data-action]');
  if (actionButton) {
    const action = actionButton.dataset.action;
    if (action === 'delete-clip') {
      deleteClip(actionButton.dataset.id);
      return;
    }
    if (action === 'copy-clip') {
      copyToClipboard(actionButton.dataset.id);
      return;
    }
    if (action === 'open-clip-url') {
      openClipboardUrl(actionButton.dataset.url);
      return;
    }
  }

  const item = e.target.closest('.clipboard-item[data-id]');
  if (item) {
    copyToClipboard(item.dataset.id);
    return;
  }
});

document.getElementById('btn-save-snippet')?.addEventListener('click', async () => {
  await submitQuickSnippet();
});

document.getElementById('btn-cancel-snippet-edit')?.addEventListener('click', () => {
  setQuickSnippetFormState();
});

document.getElementById('snippet-list')?.addEventListener('click', (e) => {
  const actionButton = e.target.closest('[data-action]');
  if (!actionButton) return;

  const id = actionButton.dataset.id;
  if (actionButton.dataset.action === 'edit-snippet') {
    startEditQuickSnippet(id);
    return;
  }

  if (actionButton.dataset.action === 'delete-snippet') {
    deleteQuickSnippet(id);
  }
});

// ===== HELPERS =====
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

document.getElementById('clipboard-search')?.addEventListener('input', (e) => {
  clipboardSearchQuery = e.target.value || '';
  renderClipboard();
});

document.getElementById('clipboard-sort')?.addEventListener('change', (e) => {
  clipboardSortOrder = e.target.value || 'newest';
  renderClipboard();
});

document.getElementById('snippet-search')?.addEventListener('input', (e) => {
  quickSnippetSearchQuery = e.target.value || '';
  renderQuickSnippets();
});

document.getElementById('snippet-content')?.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    submitQuickSnippet();
  }
});

['snippet-keyword'].forEach((id) => {
  document.getElementById(id)?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitQuickSnippet();
    }
  });
});

document.getElementById('btn-clear-clipboard')?.addEventListener('click', async () => {
  await clearAllClipboardItems();
});

if (chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName !== 'local') return;

    if (changes.language) {
      const normalizedLanguage = normalizeLanguageOptions(changes.language.newValue);
      applyPopupLanguage(normalizedLanguage);
    }

    if (changes[CLIPBOARD_STORAGE_KEY]) {
      if (typeof normalizeClipboardItems === 'function') {
        clipboardItems = normalizeClipboardItems(changes[CLIPBOARD_STORAGE_KEY].newValue || []);
        if (typeof updateStorageBar === 'function') updateStorageBar(clipboardItems);
        if (typeof renderClipboard === 'function') renderClipboard();
      }
    }

    if (changes[QUICK_SNIPPETS_STORAGE_KEY]) {
      if (typeof normalizeQuickSnippets === 'function') {
        quickSnippets = normalizeQuickSnippets(changes[QUICK_SNIPPETS_STORAGE_KEY].newValue || []);
        if (typeof renderQuickSnippets === 'function') renderQuickSnippets();
      }
    }
  });
}

if (chrome.tabs?.onActivated) {
  chrome.tabs.onActivated.addListener(() => {
    if (typeof queuePageContextRefresh === 'function') queuePageContextRefresh({ resetNoteEditor: true });
    if (typeof refreshCleanupExceptionInput === 'function') refreshCleanupExceptionInput();
  });
}

if (chrome.tabs?.onUpdated) {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!tab?.active) return;
    if (changeInfo.status === 'complete' || changeInfo.url) {
      if (typeof queuePageContextRefresh === 'function') queuePageContextRefresh({ resetNoteEditor: true });
      if (typeof refreshCleanupExceptionInput === 'function') refreshCleanupExceptionInput();
    }
  });
}

window.addEventListener('focus', () => {
  if (typeof queuePageContextRefresh === 'function') queuePageContextRefresh({ resetNoteEditor: true });
  if (typeof refreshCleanupExceptionInput === 'function') refreshCleanupExceptionInput();
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    if (typeof queuePageContextRefresh === 'function') queuePageContextRefresh({ resetNoteEditor: true });
    if (typeof refreshCleanupExceptionInput === 'function') refreshCleanupExceptionInput();
  }
});

// ===== INIT =====
async function init() {
  const initialSettings = await store.get(['language']);
  const normalizedLanguage = normalizeLanguageOptions(initialSettings.language);
  applyPopupLanguage(normalizedLanguage);
  ensurePopupLanguageObserver();
  if (initialSettings.language !== normalizedLanguage) {
    await store.set({ language: normalizedLanguage });
  }
  await handlePopupRouteChange();
}

window.addEventListener('hashchange', () => {
  handlePopupRouteChange();
});

if (isHiddenBookmarkShortcut) {
  document.addEventListener('keydown', (event) => {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if ((event.key || '').toLowerCase() !== 'b') return;
    event.preventDefault();
    event.stopPropagation();
    chrome.runtime.sendMessage({ type: 'offiqa:hidden-bookmark-hotkey' });
  }, true);
}

init();

// ===== OFFIQA I18N HARDENING PASS =====
// Final runtime normalizer: removes mixed-language UI fragments left by legacy hardcoded HTML/JS.
(() => {
  const normalize = (lang) => ['en', 'es', 'vi'].includes(lang) ? lang : 'en';
  const GUARD_PASS1 = Object.fromEntries(Object.entries(globalThis.OFFIQA_I18N_PACKS || {}).map(([lang, pack]) => [lang, pack.popupRuntimeGuard?.pass1 || {}]));
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
  const EXTRA_COVERAGE = Object.fromEntries(Object.entries(globalThis.OFFIQA_I18N_PACKS || {}).map(([lang, pack]) => [lang, pack.popupExtraCoverage || {}]));
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

  const packs = Object.fromEntries(Object.entries(globalThis.OFFIQA_I18N_PACKS || {}).map(([lang, pack]) => [lang, pack.popupRuntimeGuard?.pass2 || {}]));

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
