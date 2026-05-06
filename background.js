// Offiqa Background Service Worker
importScripts('i18n/en.js', 'i18n/es.js', 'i18n/vi.js', 'shared/dexie.min.js', 'shared/idb.js');

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
  }

  await syncReminderAlarms();
  await ensureSmartReminderHeartbeat();
  await runSmartReminderEngineInBackground();
});

const EXTENSION_PREFIX = `chrome-extension://${chrome.runtime.id}/`;
const BLOCKED_URL_PREFIXES = ['chrome://', 'edge://', 'about:', 'devtools://'];
const HIDDEN_SESSION_KEY = 'hidden_bookmark_session';
const HIDDEN_BOOKMARK_OVERLAY_REQUEST_KEY = 'hidden_bookmark_overlay_request';
const AUTO_DELETE_SMART_BOOKMARKS_KEY = 'auto_delete_smart_bookmarks';
const REMINDER_ALARM_PREFIX = 'reminder_';
const DEFAULT_REMINDER_HOUR = 9;
const CLIPBOARD_STORAGE_KEY = 'clipboard_items';
const ENABLE_CLIPBOARD_KEY = 'enable_clipboard';
const MAX_CLIPBOARD_HISTORY = 250;
const MAX_CLIPBOARD_TEXT_LENGTH = 12000;
const FOCUS_TIMER_RUNTIME_KEY = 'focus_timer_runtime';
const SMART_REMINDERS_CONFIG_KEY = 'smart_reminders_config';
const SMART_REMINDERS_RUNTIME_KEY = 'smart_reminders_runtime';
const SMART_REMINDER_TICK_ALARM = 'smart_reminder_tick';
const SMART_REMINDER_POPUP_URL = chrome.runtime.getURL('reminder-popup/reminder-popup.html');
const SMART_REMINDER_POPUP_WIDTH = 420;
const SMART_REMINDER_POPUP_HEIGHT = 280;
const BOOKMARK_SHORTCUT_POPUP_URL = chrome.runtime.getURL('popup/popup.html?shortcut=hidden-bookmarks#bookmarks');
const BOOKMARK_SHORTCUT_OVERLAY_URL = chrome.runtime.getURL('popup/popup.html?shortcut=hidden-bookmarks&embedded=1#bookmarks');
const BOOKMARK_SHORTCUT_POPUP_WIDTH = 460;
const BOOKMARK_SHORTCUT_POPUP_HEIGHT = 720;
const QUICK_NOTE_POPUP_URL = chrome.runtime.getURL('quick-note-popup/quick-note-popup.html');
const QUICK_NOTE_POPUP_WIDTH = 520;
const QUICK_NOTE_POPUP_HEIGHT = 650;
const QUICK_NOTE_OVERLAY_FILES = [
  'content/quick-note-overlay.js'
];
const PAGE_NOTE_BADGE_FILES = [
  'i18n/en.js',
  'i18n/es.js',
  'i18n/vi.js',
  'content/page-note-badge.js'
];
const SMART_REMINDER_RESHOW_CAP_MINUTES = 30;
const SMART_REMINDER_DEFAULT_TYPES = ['standing', 'water', 'eye_break'];
const SMART_REMINDER_PRIORITY = ['standing', 'eye_break', 'water'];

function getBackgroundI18n(language = 'en') {
  const packs = globalThis.OFFIQA_I18N_PACKS || {};
  return packs[language]?.background?.smartReminderOverlay
    || packs.en?.background?.smartReminderOverlay
    || {
      doneLabel: 'Done',
      suppressTodayLabel: 'Do not show again today',
      closeLabel: 'Close',
      reminderTitle: 'Offiqa Reminder',
      notificationTitle: 'Offiqa Reminder',
      genericReminder: 'Reminder',
      units: {
        minutes: 'minute(s)',
        hours: 'hour(s)',
        days: 'day(s)',
        before: '{value} {unit} before'
      }
    };
}

const SMART_REMINDER_DEFAULT_INTERVALS = {
  standing: 60,
  water: 120,
  eye_break: 45
};
const TIMER_STATES = {
  IDLE: 'idle',
  RUNNING_FOCUS: 'running_focus',
  PAUSED_FOCUS: 'paused_focus',
  COMPLETED_FOCUS: 'completed_focus',
  RUNNING_BREAK: 'running_break',
  PAUSED_BREAK: 'paused_break',
  COMPLETED_BREAK: 'completed_break'
};
let lastHiddenBookmarkShortcutHandledAt = 0;
let lastQuickNoteShortcutHandledAt = 0;

function isTrackableTab(tab) {
  const url = tab?.url || '';
  return isTrackableUrl(url);
}

function isTrackableUrl(url) {
  return Boolean(
    url &&
    !url.startsWith(EXTENSION_PREFIX) &&
    !BLOCKED_URL_PREFIXES.some((prefix) => url.startsWith(prefix))
  );
}

function isInjectablePageUrl(url) {
  try {
    const parsed = new URL(url || '');
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function cacheLastContextTab(tab) {
  if (!isTrackableTab(tab)) return;
  chrome.storage.local.set({
    last_context_tab: {
      id: tab.id,
      title: tab.title || '',
      url: tab.url,
      windowId: tab.windowId,
      updated: Date.now()
    }
  });
}

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(values) {
  return new Promise((resolve) => chrome.storage.local.set(values, resolve));
}

function storageRemove(keys) {
  return new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
}

function getLastFocusedWindow() {
  return new Promise((resolve) => chrome.windows.getLastFocused({}, resolve));
}

function createPopupWindow(options) {
  return new Promise((resolve) => chrome.windows.create(options, resolve));
}

function removeTabs(tabIds) {
  return new Promise((resolve) => {
    if (!tabIds.length) {
      resolve();
      return;
    }
    chrome.tabs.remove(tabIds, () => resolve());
  });
}

function removeWindow(windowId) {
  return new Promise((resolve) => {
    if (!windowId) {
      resolve();
      return;
    }
    chrome.windows.remove(windowId, () => resolve());
  });
}

function createQuickNotePopupUrl({ embedded = false, pageTitle = '', pageUrl = '' } = {}) {
  const url = new URL(QUICK_NOTE_POPUP_URL);
  if (embedded) url.searchParams.set('embedded', '1');
  if (pageTitle) url.searchParams.set('pageTitle', pageTitle);
  if (pageUrl) url.searchParams.set('pageUrl', pageUrl);
  return url.toString();
}

function getAllAlarms() {
  return new Promise((resolve) => chrome.alarms.getAll(resolve));
}

function getAlarm(name) {
  return new Promise((resolve) => chrome.alarms.get(name, resolve));
}

function clearAlarm(name) {
  return new Promise((resolve) => chrome.alarms.clear(name, resolve));
}

function createAlarm(name, info) {
  return new Promise((resolve) => {
    chrome.alarms.create(name, info);
    resolve();
  });
}

function queryTabs(queryInfo) {
  return new Promise((resolve) => chrome.tabs.query(queryInfo, resolve));
}

function updateTab(tabId, updateProperties) {
  return new Promise((resolve) => chrome.tabs.update(tabId, updateProperties, resolve));
}

function updateWindow(windowId, updateInfo) {
  return new Promise((resolve) => chrome.windows.update(windowId, updateInfo, resolve));
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(response || null);
    });
  });
}

function sendRuntimeMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(response || null);
    });
  });
}

function getReminderDueTimestamp(memory) {
  const due = memory?.due || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return null;

  const [year, month, day] = due.split('-').map(Number);
  const time = /^\d{2}:\d{2}$/.test(memory?.dueTime || '') ? memory.dueTime : `${String(DEFAULT_REMINDER_HOUR).padStart(2, '0')}:00`;
  const [hour, minute] = time.split(':').map(Number);
  const dueDate = new Date(year, month - 1, day, hour, minute, 0, 0);
  return Number.isNaN(dueDate.getTime()) ? null : dueDate.getTime();
}

function getReminderAdvanceMs(memory) {
  const value = Math.floor(Number(memory?.advanceValue));
  if (!Number.isFinite(value) || value <= 0) return 0;
  const unit = ['minutes', 'hours', 'days'].includes(memory?.advanceUnit) ? memory.advanceUnit : 'minutes';
  const minuteMs = 60 * 1000;
  if (unit === 'hours') return value * 60 * minuteMs;
  if (unit === 'days') return value * 24 * 60 * minuteMs;
  return value * minuteMs;
}

function getReminderAdvanceLabel(memory, language = 'en') {
  const value = Math.floor(Number(memory?.advanceValue));
  if (!Number.isFinite(value) || value <= 0) return '';
  const unit = ['minutes', 'hours', 'days'].includes(memory?.advanceUnit) ? memory.advanceUnit : 'minutes';
  const copy = getBackgroundI18n(language);
  const units = copy.units || {};
  const label = units[unit] || unit;
  return String(units.before || '{value} {unit} before')
    .replace('{value}', value)
    .replace('{unit}', label);
}

function executeScriptOnTab(tabId, files) {
  return new Promise((resolve) => {
    if (!chrome.scripting?.executeScript || !tabId) {
      resolve(false);
      return;
    }

    chrome.scripting.executeScript({ target: { tabId }, files }, () => {
      resolve(!chrome.runtime.lastError);
    });
  });
}

async function refreshPageNoteBadgeInTab(tab) {
  if (!isInjectablePageUrl(tab?.url) || typeof tab?.id !== 'number') return false;

  const response = await sendTabMessage(tab.id, { type: 'offiqa:refresh-page-note-badge' });
  if (response?.ok) return true;
  return executeScriptOnTab(tab.id, PAGE_NOTE_BADGE_FILES);
}

async function refreshPageNoteBadgesInOpenTabs() {
  const tabs = await queryTabs({});
  await Promise.all(
    tabs
      .filter((tab) => isInjectablePageUrl(tab?.url))
      .map((tab) => refreshPageNoteBadgeInTab(tab))
  );
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function getLocalDateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function getNextLocalDayStartTimestamp(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function sanitizeSmartReminderText(value, fallback = '') {
  return String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, 80);
}

function isValidSmartReminderType(type) {
  return typeof type === 'string' && /^[a-z][a-z0-9_]{1,48}$/.test(type);
}

function getSmartReminderDefaultRule(type) {
  const def = (globalThis.OFFIQA_I18N_PACKS || {}).en?.reminder?.defs?.[type] || {};
  const fallback = getBackgroundI18n('en').genericReminder;
  return {
    enabled: true,
    label: def.label || fallback,
    message: def.message || def.label || fallback,
    compactMessage: def.message || def.label || fallback,
    intervalMinutes: SMART_REMINDER_DEFAULT_INTERVALS[type] || 60,
    createdAt: 0
  };
}

function normalizeSmartReminderRule(type, rawRule = {}) {
  const fallback = getSmartReminderDefaultRule(type);
  const label = sanitizeSmartReminderText(rawRule.label, fallback.label) || fallback.label;
  const message = sanitizeSmartReminderText(rawRule.message, fallback.message || label) || label;
  return {
    ...fallback,
    ...rawRule,
    enabled: rawRule.enabled !== false,
    label,
    message,
    compactMessage: sanitizeSmartReminderText(rawRule.compactMessage, fallback.compactMessage || message) || message,
    intervalMinutes: clampNumber(rawRule.intervalMinutes, 1, 240, fallback.intervalMinutes),
    createdAt: Number.isFinite(rawRule.createdAt) ? rawRule.createdAt : (fallback.createdAt || Date.now())
  };
}

function getSmartReminderTypes(config) {
  const rules = config?.rules || {};
  const types = Object.keys(rules).filter(isValidSmartReminderType);
  return [...new Set([...SMART_REMINDER_DEFAULT_TYPES, ...types])]
    .filter((type) => rules[type])
    .sort((a, b) => getSmartReminderPriority(config, a) - getSmartReminderPriority(config, b));
}

function createDefaultSmartRemindersConfig() {
  return {
    enabled: true,
    workHoursOnly: true,
    workHoursStart: '08:30',
    workHoursEnd: '17:30',
    rules: {
      standing: normalizeSmartReminderRule('standing', { createdAt: 1 }),
      water: normalizeSmartReminderRule('water', { createdAt: 2 }),
      eye_break: normalizeSmartReminderRule('eye_break', { createdAt: 3 })
    }
  };
}

function createDefaultSmartReminderRuntimeItem(now = Date.now()) {
  return {
    enabledAt: now,
    lastShownAt: null,
    lastDoneAt: null,
    snoozedUntil: null,
    forcedDueAt: null,
    doneCountToday: 0
  };
}

function createDefaultSmartRemindersRuntime(now = Date.now()) {
  return {
    dateKey: getLocalDateKey(),
    activeReminderId: '',
    deferredReminderIds: [],
    byType: {
      standing: createDefaultSmartReminderRuntimeItem(now),
      water: createDefaultSmartReminderRuntimeItem(now),
      eye_break: createDefaultSmartReminderRuntimeItem(now)
    }
  };
}

function createDefaultTimerRuntime() {
  return {
    currentState: TIMER_STATES.IDLE
  };
}

function normalizeSmartRemindersConfig(raw) {
  const base = createDefaultSmartRemindersConfig();
  const rawRules = raw?.rules && typeof raw.rules === 'object' ? raw.rules : {};
  const deletedRuleTypes = Array.isArray(raw?.deletedRuleTypes)
    ? raw.deletedRuleTypes.filter((type) => SMART_REMINDER_DEFAULT_TYPES.includes(type))
    : [];
  const defaultRuleTypes = SMART_REMINDER_DEFAULT_TYPES.filter((type) => !deletedRuleTypes.includes(type));
  const ruleTypes = [...new Set([...defaultRuleTypes, ...Object.keys(rawRules).filter(isValidSmartReminderType)])]
    .filter((type) => !deletedRuleTypes.includes(type));
  const rules = {};
  ruleTypes.forEach((type) => {
    rules[type] = normalizeSmartReminderRule(type, {
      ...(base.rules[type] || {}),
      ...(rawRules[type] || {})
    });
  });

  const config = {
    ...base,
    ...(raw || {}),
    deletedRuleTypes,
    rules
  };

  config.workHoursOnly = config.workHoursOnly !== false;
  config.workHoursStart = typeof config.workHoursStart === 'string' ? config.workHoursStart : base.workHoursStart;
  config.workHoursEnd = typeof config.workHoursEnd === 'string' ? config.workHoursEnd : base.workHoursEnd;
  config.enabled = getSmartReminderTypes(config).some((type) => config.rules[type].enabled);
  return config;
}

function normalizeSmartRemindersRuntime(raw, config = createDefaultSmartRemindersConfig()) {
  const now = Date.now();
  const base = createDefaultSmartRemindersRuntime(now);
  const runtimeTypes = [...new Set([
    ...getSmartReminderTypes(config),
    ...Object.keys(raw?.byType || {}).filter(isValidSmartReminderType)
  ])];
  const byType = {};
  runtimeTypes.forEach((type) => {
    byType[type] = {
      ...(base.byType[type] || createDefaultSmartReminderRuntimeItem(now)),
      ...(raw?.byType?.[type] || {})
    };
  });

  const runtime = {
    ...base,
    ...(raw || {}),
    byType
  };

  runtime.dateKey = typeof runtime.dateKey === 'string' ? runtime.dateKey : getLocalDateKey();
  const validTypes = getSmartReminderTypes(config);
  runtime.activeReminderId = validTypes.includes(runtime.activeReminderId) ? runtime.activeReminderId : '';
  runtime.deferredReminderIds = Array.isArray(runtime.deferredReminderIds)
    ? runtime.deferredReminderIds.filter((type) => validTypes.includes(type))
    : [];

  runtimeTypes.forEach((type) => {
    const item = runtime.byType[type];
    item.enabledAt = Number.isFinite(item.enabledAt) ? item.enabledAt : now;
    item.lastShownAt = Number.isFinite(item.lastShownAt) ? item.lastShownAt : null;
    item.lastDoneAt = Number.isFinite(item.lastDoneAt) ? item.lastDoneAt : null;
    item.snoozedUntil = Number.isFinite(item.snoozedUntil) ? item.snoozedUntil : null;
    item.forcedDueAt = Number.isFinite(item.forcedDueAt) ? item.forcedDueAt : null;
    item.doneCountToday = Math.max(0, Math.floor(Number(item.doneCountToday) || 0));
  });

  if (runtime.dateKey !== getLocalDateKey()) {
    const nextRuntime = createDefaultSmartRemindersRuntime(now);
    runtimeTypes.forEach((type) => {
      if (!nextRuntime.byType[type]) {
        nextRuntime.byType[type] = createDefaultSmartReminderRuntimeItem(now);
      }
      nextRuntime.byType[type].enabledAt = runtime.byType[type].enabledAt || now;
      nextRuntime.byType[type].lastShownAt = runtime.byType[type].lastShownAt;
      nextRuntime.byType[type].lastDoneAt = runtime.byType[type].lastDoneAt;
      nextRuntime.byType[type].snoozedUntil = runtime.byType[type].snoozedUntil;
      nextRuntime.byType[type].forcedDueAt = runtime.byType[type].forcedDueAt;
    });
    return nextRuntime;
  }

  return runtime;
}

function normalizeTimerRuntime(raw) {
  const base = createDefaultTimerRuntime();
  const runtime = { ...base, ...(raw || {}) };
  runtime.currentState = Object.values(TIMER_STATES).includes(runtime.currentState)
    ? runtime.currentState
    : TIMER_STATES.IDLE;
  return runtime;
}

function parseClockMinutes(timeString) {
  if (!timeString || typeof timeString !== 'string') return null;
  const [hour, minute] = timeString.split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function isWithinReminderWorkHours(config, now = new Date()) {
  if (!config.workHoursOnly) return true;
  const startMinutes = parseClockMinutes(config.workHoursStart);
  const endMinutes = parseClockMinutes(config.workHoursEnd);
  if (startMinutes == null || endMinutes == null) return true;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }
  return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}

function isBreakState(state = TIMER_STATES.IDLE) {
  return state === TIMER_STATES.RUNNING_BREAK
    || state === TIMER_STATES.PAUSED_BREAK
    || state === TIMER_STATES.COMPLETED_BREAK;
}

function isSmartReminderSuppressedByState(timerRuntime, type) {
  if (!isBreakState(timerRuntime.currentState)) return false;
  return type === 'standing';
}

function getSmartReminderPriority(config, type) {
  const defaultIndex = SMART_REMINDER_PRIORITY.indexOf(type);
  if (defaultIndex >= 0) return defaultIndex;
  const createdAt = config?.rules?.[type]?.createdAt;
  return 1000 + (Number.isFinite(createdAt) ? createdAt / 10000000000000 : 1);
}

function sortSmartReminderIds(ids, config) {
  return [...new Set(ids)].sort((a, b) => getSmartReminderPriority(config, a) - getSmartReminderPriority(config, b));
}

function queueDeferredSmartReminder(config, runtime, type) {
  if (!getSmartReminderTypes(config).includes(type)) return false;
  const next = sortSmartReminderIds([...runtime.deferredReminderIds, type], config);
  const changed = next.join('|') !== runtime.deferredReminderIds.join('|');
  runtime.deferredReminderIds = next;
  return changed;
}

function removeDeferredSmartReminder(runtime, type) {
  const next = runtime.deferredReminderIds.filter((item) => item !== type);
  const changed = next.length !== runtime.deferredReminderIds.length;
  runtime.deferredReminderIds = next;
  return changed;
}

function clearActiveSmartReminder(runtime) {
  if (!runtime.activeReminderId) return false;
  runtime.activeReminderId = '';
  return true;
}

function getSmartReminderDueAt(config, runtime, type) {
  const rule = config.rules[type];
  const runtimeItem = runtime.byType[type];
  if (!config.enabled || !rule?.enabled || !runtimeItem) return null;

  if (runtimeItem.snoozedUntil) return runtimeItem.snoozedUntil;
  if (runtimeItem.forcedDueAt) return runtimeItem.forcedDueAt;
  if (runtimeItem.lastDoneAt) return runtimeItem.lastDoneAt + rule.intervalMinutes * 60000;
  if (runtimeItem.lastShownAt) {
    return runtimeItem.lastShownAt + Math.min(rule.intervalMinutes, SMART_REMINDER_RESHOW_CAP_MINUTES) * 60000;
  }
  return runtimeItem.enabledAt + rule.intervalMinutes * 60000;
}

function isSmartReminderDue(config, runtime, timerRuntime, type, now = Date.now()) {
  const dueAt = getSmartReminderDueAt(config, runtime, type);
  if (!dueAt) return false;
  if (!isWithinReminderWorkHours(config, new Date(now))) return false;
  if (isSmartReminderSuppressedByState(timerRuntime, type)) return false;
  return now >= dueAt;
}

function sanitizeDeferredSmartReminders(config, runtime, timerRuntime) {
  runtime.deferredReminderIds = sortSmartReminderIds(
    runtime.deferredReminderIds.filter((type) => {
      const rule = config.rules[type];
      if (!rule?.enabled) return false;
      if (isSmartReminderSuppressedByState(timerRuntime, type)) return false;
      return true;
    }),
    config
  );
}

async function persistSmartRemindersRuntime(runtime) {
  await storageSet({ [SMART_REMINDERS_RUNTIME_KEY]: runtime });
}

async function ensureSmartReminderHeartbeat() {
  if (!chrome.alarms?.create) return;
  const heartbeat = await getAlarm(SMART_REMINDER_TICK_ALARM);
  if (heartbeat?.periodInMinutes === 1) return;
  chrome.alarms.create(SMART_REMINDER_TICK_ALARM, { periodInMinutes: 1 });
}

async function getSmartReminderPopupTabs() {
  return queryTabs({ url: `${SMART_REMINDER_POPUP_URL}*` });
}

function getSmartReminderOverlayCopy(language = 'en') {
  const copy = getBackgroundI18n(language);
  return {
    doneLabel: copy.doneLabel,
    suppressTodayLabel: copy.suppressTodayLabel,
    closeLabel: copy.closeLabel
  };
}

function getSmartReminderOverlayPayload(config, type, language = 'en') {
  const rule = config.rules[type] || getSmartReminderDefaultRule(type);
  const copy = getBackgroundI18n(language);
  return {
    reminderType: type,
    title: rule.label || copy.genericReminder,
    message: rule.message || rule.label || copy.genericReminder,
    ...getSmartReminderOverlayCopy(language)
  };
}

function canShowSmartReminderOverlay(tab) {
  const url = tab?.url || '';
  return Boolean(
    tab?.id &&
    url &&
    !url.startsWith('chrome://') &&
    !url.startsWith('edge://') &&
    !url.startsWith('about:') &&
    !url.startsWith('chrome-extension://')
  );
}

function isOffiqaExtensionPage(tab) {
  const url = tab?.url || '';
  return url.startsWith(chrome.runtime.getURL(''));
}

async function getActiveSmartReminderTab() {
  const tabs = await queryTabs({ active: true, lastFocusedWindow: true });
  return tabs[0] || null;
}

async function sendSmartReminderOverlayMessage(tab, payload) {
  if (!canShowSmartReminderOverlay(tab)) return false;
  const response = await sendTabMessage(tab.id, {
    type: 'offiqa:smart-reminder-overlay-show',
    payload
  });
  if (response?.handled) return true;

  const injected = await executeScriptOnTab(tab.id, ['content/smart-reminder-overlay.js']);
  if (!injected) return false;
  const retryResponse = await sendTabMessage(tab.id, {
    type: 'offiqa:smart-reminder-overlay-show',
    payload
  });
  return Boolean(retryResponse?.handled);
}

async function showSmartReminderOverlay(type, config, language) {
  const tab = await getActiveSmartReminderTab();
  const payload = getSmartReminderOverlayPayload(config, type, language);
  if (isOffiqaExtensionPage(tab)) {
    const response = await sendRuntimeMessage({
      type: 'offiqa:smart-reminder-overlay-show',
      payload,
      onlyVisible: true
    });
    return Boolean(response?.handled);
  }
  return sendSmartReminderOverlayMessage(tab, payload);
}

function getScheduledReminderOverlayPayload(memory, language = 'en') {
  const copy = getSmartReminderOverlayCopy(language);
  const backgroundCopy = getBackgroundI18n(language);
  const advanceLabel = getReminderAdvanceLabel(memory, language);
  const title = backgroundCopy.reminderTitle;
  const prefix = advanceLabel ? `${advanceLabel}: ` : '';

  return {
    reminderId: memory.id,
    actionMessageType: 'offiqa:scheduled-reminder-action',
    title,
    message: `${prefix}${memory.text || ''}`.trim(),
    doneLabel: copy.doneLabel,
    closeLabel: copy.closeLabel,
    showSuppressToday: false
  };
}

async function showScheduledReminderOverlay(memory, language = 'en') {
  const tab = await getActiveSmartReminderTab();
  const payload = getScheduledReminderOverlayPayload(memory, language);
  if (isOffiqaExtensionPage(tab)) {
    const response = await sendRuntimeMessage({
      type: 'offiqa:smart-reminder-overlay-show',
      payload,
      onlyVisible: true
    });
    return Boolean(response?.handled);
  }
  return sendSmartReminderOverlayMessage(tab, payload);
}

async function closeSmartReminderOverlays() {
  await sendRuntimeMessage({
    type: 'offiqa:smart-reminder-overlay-hide',
    reason: 'inactive'
  });
  const tabs = await queryTabs({});
  await Promise.all(tabs.map((tab) => {
    if (!canShowSmartReminderOverlay(tab)) return Promise.resolve(null);
    return sendTabMessage(tab.id, {
      type: 'offiqa:smart-reminder-overlay-hide',
      reason: 'inactive'
    });
  }));
}

async function focusSmartReminderPopup(tab) {
  if (!tab?.id || !tab?.windowId) return;
  await updateWindow(tab.windowId, { focused: true });
  await updateTab(tab.id, { active: true });
}

async function ensureSmartReminderPopup(type, { focusExisting = false } = {}) {
  if (!type) {
    await closeSmartReminderPopup();
    return;
  }

  const existingTabs = await getSmartReminderPopupTabs();
  if (existingTabs.length) {
    if (focusExisting) {
      await focusSmartReminderPopup(existingTabs[0]);
    }
    return;
  }

  const currentWindow = await getLastFocusedWindow();
  const baseWidth = currentWindow?.width || 1280;
  const baseHeight = currentWindow?.height || 900;
  const width = Math.min(SMART_REMINDER_POPUP_WIDTH, Math.max(360, Math.round(baseWidth * 0.34)));
  const height = Math.min(SMART_REMINDER_POPUP_HEIGHT, Math.max(240, Math.round(baseHeight * 0.34)));
  const left = Math.max(0, Math.round((currentWindow?.left || 0) + (baseWidth - width) / 2));
  const top = Math.max(0, Math.round((currentWindow?.top || 0) + (baseHeight - height) / 2));

  await createPopupWindow({
    url: `${SMART_REMINDER_POPUP_URL}?type=${encodeURIComponent(type)}&openedAt=${Date.now()}`,
    type: 'popup',
    focused: true,
    width,
    height,
    left,
    top
  });
}

async function closeSmartReminderPopup() {
  const existingTabs = await getSmartReminderPopupTabs();
  const windowIds = [...new Set(existingTabs.map((tab) => tab.windowId).filter(Boolean))];
  await Promise.all(windowIds.map((windowId) => removeWindow(windowId)));
}

async function runSmartReminderEngineInBackground({ focusPopup = false } = {}) {
  const data = await storageGet([
    SMART_REMINDERS_CONFIG_KEY,
    SMART_REMINDERS_RUNTIME_KEY,
    FOCUS_TIMER_RUNTIME_KEY,
    'language'
  ]);
  const config = normalizeSmartRemindersConfig(data[SMART_REMINDERS_CONFIG_KEY]);
  const runtime = normalizeSmartRemindersRuntime(data[SMART_REMINDERS_RUNTIME_KEY], config);
  const timerRuntime = normalizeTimerRuntime(data[FOCUS_TIMER_RUNTIME_KEY]);
  const language = ['en', 'es', 'vi'].includes(data.language) ? data.language : 'en';
  const now = Date.now();
  const isRunningFocus = timerRuntime.currentState === TIMER_STATES.RUNNING_FOCUS;

  sanitizeDeferredSmartReminders(config, runtime, timerRuntime);

  if (!config.enabled) {
    const changed = clearActiveSmartReminder(runtime) || runtime.deferredReminderIds.length > 0;
    runtime.deferredReminderIds = [];
    if (changed) {
      await persistSmartRemindersRuntime(runtime);
    }
    await closeSmartReminderOverlays();
    await closeSmartReminderPopup();
    return;
  }

  let changed = false;
  let newlyActivatedType = '';
  const reminderTypes = getSmartReminderTypes(config);
  const activeType = reminderTypes.includes(runtime.activeReminderId) ? runtime.activeReminderId : '';

  if (activeType && isRunningFocus) {
    changed = queueDeferredSmartReminder(config, runtime, activeType) || changed;
    changed = clearActiveSmartReminder(runtime) || changed;
  }

  if (activeType && !isRunningFocus) {
    const rule = config.rules[activeType];
    if (!rule?.enabled || !isWithinReminderWorkHours(config, new Date(now)) || isSmartReminderSuppressedByState(timerRuntime, activeType)) {
      changed = clearActiveSmartReminder(runtime) || changed;
    }
  }

  const dueCandidates = sortSmartReminderIds(
    reminderTypes.filter((type) => isSmartReminderDue(config, runtime, timerRuntime, type, now)),
    config
  );

  if (isRunningFocus) {
    dueCandidates.forEach((type) => {
      changed = queueDeferredSmartReminder(config, runtime, type) || changed;
    });
  } else if (!runtime.activeReminderId) {
    const deferredCandidate = runtime.deferredReminderIds.find((type) => isSmartReminderDue(config, runtime, timerRuntime, type, now));
    const nextType = deferredCandidate || dueCandidates[0];
    if (nextType) {
      runtime.activeReminderId = nextType;
      runtime.byType[nextType].lastShownAt = now;
      runtime.byType[nextType].forcedDueAt = null;
      removeDeferredSmartReminder(runtime, nextType);
      newlyActivatedType = nextType;
      changed = true;
    }
  }

  if (changed) {
    await persistSmartRemindersRuntime(runtime);
  }

  const currentActiveType = reminderTypes.includes(runtime.activeReminderId) ? runtime.activeReminderId : '';
  if (currentActiveType) {
    await showSmartReminderOverlay(currentActiveType, config, language);
    await closeSmartReminderPopup();
    return;
  }

  await closeSmartReminderOverlays();
  await closeSmartReminderPopup();
}

async function handleSmartReminderOverlayAction(action, type, { suppressToday = false } = {}) {
  const data = await storageGet([SMART_REMINDERS_CONFIG_KEY, SMART_REMINDERS_RUNTIME_KEY]);
  const config = normalizeSmartRemindersConfig(data[SMART_REMINDERS_CONFIG_KEY]);
  const runtime = normalizeSmartRemindersRuntime(data[SMART_REMINDERS_RUNTIME_KEY], config);
  const reminderTypes = getSmartReminderTypes(config);
  const activeType = reminderTypes.includes(runtime.activeReminderId) ? runtime.activeReminderId : '';
  const targetType = reminderTypes.includes(type) ? type : activeType;
  if (!targetType || !runtime.byType[targetType]) {
    await closeSmartReminderOverlays();
    await closeSmartReminderPopup();
    return { ok: false, reason: 'missing_reminder' };
  }

  const now = Date.now();
  const item = runtime.byType[targetType];
  item.lastShownAt = now;
  item.forcedDueAt = null;
  item.lastDoneAt = now;
  item.snoozedUntil = suppressToday ? getNextLocalDayStartTimestamp(new Date(now)) : null;
  if (action === 'done') {
    item.doneCountToday = (item.doneCountToday || 0) + 1;
  }

  if (runtime.activeReminderId === targetType) {
    runtime.activeReminderId = '';
  }
  removeDeferredSmartReminder(runtime, targetType);
  await persistSmartRemindersRuntime(runtime);
  await closeSmartReminderOverlays();
  await closeSmartReminderPopup();
  return { ok: true };
}

function sanitizeClipboardText(text) {
  if (typeof text !== 'string') return '';
  const cleaned = text.replace(/\u0000/g, '').trim();
  if (!cleaned) return '';
  return cleaned.slice(0, MAX_CLIPBOARD_TEXT_LENGTH);
}

function sanitizeClipboardUrl(url) {
  if (!isTrackableUrl(url)) return '';
  return url;
}

function getClipboardDomain(url) {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

function createClipboardItemId(created, text, url, salt = 0) {
  const base = `${created}_${text.length}_${url.length}_${salt}`;
  return `clip_${base}`;
}

function normalizeClipboardItem(item, index = 0) {
  if (!item) return null;

  if (typeof item === 'string') {
    const text = sanitizeClipboardText(item);
    if (!text) return null;
    const created = Date.now() - index;
    return {
      id: createClipboardItemId(created, text, '', index),
      text,
      url: '',
      title: '',
      domain: '',
      source: 'manual',
      created
    };
  }

  const text = sanitizeClipboardText(item.text);
  if (!text) return null;

  const created = Number.isFinite(item.created) ? item.created : Date.now() - index;
  const url = sanitizeClipboardUrl(item.url || item.pageUrl || '');
  const title = typeof item.title === 'string'
    ? item.title.trim()
    : typeof item.pageTitle === 'string'
      ? item.pageTitle.trim()
      : '';

  return {
    id: typeof item.id === 'string' && item.id ? item.id : createClipboardItemId(created, text, url, index),
    text,
    url,
    title,
    domain: typeof item.domain === 'string' && item.domain ? item.domain : getClipboardDomain(url),
    source: item.source === 'auto' ? 'auto' : 'manual',
    created
  };
}

function normalizeClipboardItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index) => normalizeClipboardItem(item, index))
    .filter(Boolean)
    .sort((a, b) => b.created - a.created)
    .slice(0, MAX_CLIPBOARD_HISTORY);
}

async function saveClipboardItem(payload, sender) {
  const config = await storageGet([ENABLE_CLIPBOARD_KEY]);
  if (config[ENABLE_CLIPBOARD_KEY] === false) {
    return { ok: false, reason: 'clipboard_disabled' };
  }

  const text = sanitizeClipboardText(payload?.text);
  if (!text) {
    return { ok: false, reason: 'empty_text' };
  }

  const created = Number.isFinite(payload?.created) ? payload.created : Date.now();
  const senderTab = sender?.tab;
  const url = sanitizeClipboardUrl(payload?.url || senderTab?.url || '');
  const title = typeof payload?.title === 'string' && payload.title.trim()
    ? payload.title.trim()
    : typeof senderTab?.title === 'string'
      ? senderTab.title.trim()
      : '';

  const item = normalizeClipboardItem({
    id: createClipboardItemId(created, text, url, created),
    text,
    url,
    title,
    domain: getClipboardDomain(url),
    source: payload?.source === 'manual' ? 'manual' : 'auto',
    created
  });

  const data = await storageGet([CLIPBOARD_STORAGE_KEY]);
  const items = normalizeClipboardItems([item, ...(data[CLIPBOARD_STORAGE_KEY] || [])]);
  await storageSet({ [CLIPBOARD_STORAGE_KEY]: items });

  if (senderTab && isTrackableTab(senderTab)) {
    cacheLastContextTab(senderTab);
  }

  return { ok: true, item, total: items.length };
}

function getReminderAlarmTime(memory) {
  const dueAt = getReminderDueTimestamp(memory);
  if (!dueAt) return null;

  const [year, month, day] = memory.due.split('-').map(Number);
  const startOfDueDate = new Date(year, month - 1, day);
  if (Number.isNaN(startOfDueDate.getTime())) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (startOfDueDate.getTime() < today.getTime()) return null;

  const scheduled = dueAt - getReminderAdvanceMs(memory);
  if (scheduled <= Date.now() && dueAt >= Date.now()) {
    return Date.now() + 60 * 1000;
  }

  if (startOfDueDate.getTime() === today.getTime() && scheduled <= Date.now()) {
    return Date.now() + 60 * 1000;
  }

  return scheduled;
}

async function syncReminderAlarms() {
  if (!chrome.alarms?.getAll) return;

  const data = await storageGet(['memories']);
  const memories = data.memories || [];
  const alarms = await getAllAlarms();

  await Promise.all(
    alarms
      .filter((alarm) => alarm.name.startsWith(REMINDER_ALARM_PREFIX))
      .map((alarm) => clearAlarm(alarm.name))
  );

  const reminders = memories.filter((memory) => memory?.type === 'reminder' && memory?.id && memory?.due);
  await Promise.all(reminders.map(async (memory) => {
    const when = getReminderAlarmTime(memory);
    if (!when) return;
    await createAlarm(`${REMINDER_ALARM_PREFIX}${memory.id}`, { when });
  }));
}

async function maybeClearSmartBookmarksOnStartup() {
  const data = await storageGet([AUTO_DELETE_SMART_BOOKMARKS_KEY]);
  if (!data[AUTO_DELETE_SMART_BOOKMARKS_KEY]) return;

  await storageRemove(['bookmark_groups', HIDDEN_SESSION_KEY]);
}

async function setHiddenSessionState(patch) {
  const data = await storageGet([HIDDEN_SESSION_KEY]);
  const current = data[HIDDEN_SESSION_KEY] || {};
  await storageSet({
    [HIDDEN_SESSION_KEY]: {
      ...current,
      ...patch,
      updatedAt: Date.now()
    }
  });
}

async function getHiddenBookmarkPayload() {
  const data = await storageGet(['bookmark_groups', 'pin_hash']);
  const groups = data.bookmark_groups || [];
  const hiddenGroups = groups.filter((group) => group.hidden);
  const hiddenBookmarks = hiddenGroups.flatMap((group) =>
    (group.bookmarks || [])
      .filter((bookmark) => bookmark?.url)
      .map((bookmark) => ({
        ...bookmark,
        groupId: group.id,
        groupName: group.name
      }))
  );

  return {
    hiddenGroups,
    hiddenBookmarks,
    hasPin: Boolean(data.pin_hash)
  };
}

async function openBookmarkShortcutPopup(reason, hiddenGroupCount, bookmarkCount) {
  const currentWindow = await getLastFocusedWindow();
  const baseWidth = currentWindow?.width || 1280;
  const baseHeight = currentWindow?.height || 900;
  const width = Math.min(BOOKMARK_SHORTCUT_POPUP_WIDTH, Math.max(380, Math.round(baseWidth * 0.42)));
  const height = Math.min(BOOKMARK_SHORTCUT_POPUP_HEIGHT, Math.max(560, Math.round(baseHeight * 0.82)));
  const left = Math.max(0, Math.round((currentWindow?.left || 0) + (baseWidth - width) / 2));
  const top = Math.max(0, Math.round((currentWindow?.top || 0) + (baseHeight - height) / 2));
  const popupWindow = await createPopupWindow({
    url: BOOKMARK_SHORTCUT_POPUP_URL,
    type: 'popup',
    focused: true,
    left,
    top,
    width,
    height
  });

  await setHiddenSessionState({
    active: true,
    reason,
    tabIds: [],
    windowId: popupWindow?.id || null,
    hiddenGroupCount,
    bookmarkCount
  });
}

async function openQuickNoteShortcutPopup({ pageTitle = '', pageUrl = '' } = {}) {
  const currentWindow = await getLastFocusedWindow();
  const baseWidth = currentWindow?.width || 1280;
  const baseHeight = currentWindow?.height || 900;
  const width = Math.min(QUICK_NOTE_POPUP_WIDTH, Math.max(380, Math.round(baseWidth * 0.42)));
  const height = Math.min(QUICK_NOTE_POPUP_HEIGHT, Math.max(560, Math.round(baseHeight * 0.76)));
  const left = Math.max(0, Math.round((currentWindow?.left || 0) + (baseWidth - width) / 2));
  const top = Math.max(0, Math.round((currentWindow?.top || 0) + (baseHeight - height) / 2));

  await createPopupWindow({
    url: createQuickNotePopupUrl({ pageTitle, pageUrl }),
    type: 'popup',
    focused: true,
    left,
    top,
    width,
    height
  });
}

async function openQuickNoteFromShortcut() {
  const [activeTab] = await queryTabs({ active: true, lastFocusedWindow: true });
  const pageTitle = activeTab?.title || '';
  const pageUrl = activeTab?.url || '';

  if (activeTab?.id && (isInjectablePageUrl(pageUrl) || isOffiqaExtensionPage(activeTab))) {
    const overlayMessage = {
      type: 'offiqa:quick-note-overlay-toggle',
      onlyVisible: true,
      url: createQuickNotePopupUrl({
        embedded: true,
        pageTitle,
        pageUrl
      })
    };
    let response = await sendTabMessage(activeTab.id, overlayMessage);
    if (response?.handled) return;

    if (isInjectablePageUrl(pageUrl)) {
      const injected = await executeScriptOnTab(activeTab.id, QUICK_NOTE_OVERLAY_FILES);
      if (injected) {
        response = await sendTabMessage(activeTab.id, overlayMessage);
      }
    }

    if (response?.handled) return;
  }

  await openQuickNoteShortcutPopup({ pageTitle, pageUrl });
}

async function handleQuickNoteShortcutCommand() {
  const now = Date.now();
  if (now - lastQuickNoteShortcutHandledAt < 350) return;
  lastQuickNoteShortcutHandledAt = now;

  try {
    await openQuickNoteFromShortcut();
  } catch (error) {
    console.warn('[Offiqa] Quick note shortcut failed:', error);
  }
}

async function openHiddenBookmarkSession() {
  const { hiddenGroups, hiddenBookmarks, hasPin } = await getHiddenBookmarkPayload();

  if (hiddenGroups.length === 0) {
    await openBookmarkShortcutPopup('no_hidden_groups', 0, 0);
    return;
  }

  if (hasPin) {
    await openBookmarkShortcutPopup('blocked_by_pin', hiddenGroups.length, hiddenBookmarks.length);
    return;
  }

  if (hiddenBookmarks.length === 0) {
    await openBookmarkShortcutPopup('no_hidden_bookmarks', hiddenGroups.length, 0);
    return;
  }

  const currentWindow = await getLastFocusedWindow();
  const baseWidth = currentWindow?.width || 1280;
  const baseHeight = currentWindow?.height || 900;
  const width = Math.max(900, Math.min(1240, Math.round(baseWidth * 0.78)));
  const height = Math.max(640, Math.min(900, Math.round(baseHeight * 0.82)));
  const left = Math.max(0, Math.round((currentWindow?.left || 0) + (baseWidth - width) / 2));
  const top = Math.max(0, Math.round((currentWindow?.top || 0) + (baseHeight - height) / 2));
  const popupWindow = await createPopupWindow({
    url: hiddenBookmarks.map((bookmark) => bookmark.url),
    type: 'popup',
    focused: true,
    left,
    top,
    width,
    height
  });

  const tabIds = (popupWindow?.tabs || [])
    .map((tab) => tab.id)
    .filter((id) => typeof id === 'number');

  await setHiddenSessionState({
    active: true,
    reason: 'opened',
    tabIds,
    windowId: popupWindow?.id || null,
    hiddenGroupCount: hiddenGroups.length,
    bookmarkCount: hiddenBookmarks.length
  });
}

async function closeHiddenBookmarkSession(reason = 'closed_by_shortcut') {
  const data = await storageGet([HIDDEN_SESSION_KEY]);
  const session = data[HIDDEN_SESSION_KEY] || {};
  const tabIds = Array.isArray(session.tabIds) ? session.tabIds : [];

  if (tabIds.length) {
    await removeTabs(tabIds);
  } else if (session.windowId) {
    await removeWindow(session.windowId);
  }

  await setHiddenSessionState({
    active: false,
    reason,
    tabIds: [],
    windowId: null
  });
}

async function toggleHiddenBookmarkOverlay(activeTab) {
  if (!activeTab?.id) return false;

  const isOffiqaPage = isOffiqaExtensionPage(activeTab);
  const message = {
    type: 'offiqa:hidden-bookmark-overlay-toggle',
    url: BOOKMARK_SHORTCUT_OVERLAY_URL,
    onlyVisible: isOffiqaPage
  };

  let response = isOffiqaPage
    ? await sendRuntimeMessage(message)
    : await sendTabMessage(activeTab.id, message);

  if (!response?.handled && isOffiqaPage) {
    await storageSet({
      [HIDDEN_BOOKMARK_OVERLAY_REQUEST_KEY]: {
        type: 'toggle',
        url: BOOKMARK_SHORTCUT_OVERLAY_URL,
        extensionPageOnly: true,
        requestedAt: Date.now()
      }
    });
    response = { handled: true, active: true, reason: 'overlay_requested' };
  }

  if (!response?.handled && !isOffiqaPage) {
    const injected = await executeScriptOnTab(activeTab.id, ['content/hidden-bookmark-overlay.js']);
    if (injected) {
      response = await sendTabMessage(activeTab.id, message);
    }
  }

  if (!response?.handled) return false;

  if (response.active) {
    const { hiddenGroups, hiddenBookmarks, hasPin } = await getHiddenBookmarkPayload();
    let reason = 'overlay_opened';
    if (hiddenGroups.length === 0) {
      reason = 'no_hidden_groups';
    } else if (hasPin) {
      reason = 'blocked_by_pin';
    } else if (hiddenBookmarks.length === 0) {
      reason = 'no_hidden_bookmarks';
    }

    await setHiddenSessionState({
      active: false,
      reason,
      tabIds: [],
      windowId: null,
      hiddenGroupCount: hiddenGroups.length,
      bookmarkCount: hiddenBookmarks.length
    });
  } else {
    await setHiddenSessionState({
      active: false,
      reason: response.reason || 'closed_by_shortcut',
      tabIds: [],
      windowId: null
    });
  }

  return true;
}

async function toggleHiddenBookmarksFromShortcut() {
  const data = await storageGet([HIDDEN_SESSION_KEY]);
  const session = data[HIDDEN_SESSION_KEY] || {};
  const hasOpenSession = Boolean(
    session.active &&
    ((Array.isArray(session.tabIds) && session.tabIds.length) || session.windowId)
  );

  if (hasOpenSession) {
    await closeHiddenBookmarkSession();
    return;
  }

  const [activeTab] = await queryTabs({ active: true, lastFocusedWindow: true });
  if (isTrackableTab(activeTab) || isOffiqaExtensionPage(activeTab)) {
    const overlayHandled = await toggleHiddenBookmarkOverlay(activeTab);
    if (overlayHandled) return;
  }

  const { hiddenGroups, hiddenBookmarks } = await getHiddenBookmarkPayload();
  await openBookmarkShortcutPopup('popup_fallback', hiddenGroups.length, hiddenBookmarks.length);
}

async function handleHiddenBookmarkShortcutCommand() {
  const now = Date.now();
  if (now - lastHiddenBookmarkShortcutHandledAt < 350) return;
  lastHiddenBookmarkShortcutHandledAt = now;

  try {
    await setHiddenSessionState({
      lastCommandAt: Date.now(),
      lastError: null
    });
    await toggleHiddenBookmarksFromShortcut();
  } catch (error) {
    await setHiddenSessionState({
      active: false,
      reason: 'error',
      tabIds: [],
      windowId: null,
      lastError: error?.message || String(error)
    });
  }
}

if (chrome.tabs?.onActivated) {
  chrome.tabs.onActivated.addListener(({ tabId }) => {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) return;
      cacheLastContextTab(tab);
    });
  });
}

if (chrome.tabs?.onUpdated) {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' || changeInfo.url) {
      cacheLastContextTab(tab);
      if (isInjectablePageUrl(tab?.url)) {
        refreshPageNoteBadgeInTab(tab);
      }
    }
  });
}

if (chrome.commands?.onCommand) {
  chrome.commands.onCommand.addListener((command) => {
    if (command === 'toggle-hidden-bookmarks') {
      setTimeout(() => {
        handleHiddenBookmarkShortcutCommand();
      }, 100);
    }
    if (command === 'open-quick-note') {
      setTimeout(() => {
        handleQuickNoteShortcutCommand();
      }, 100);
    }
  });
}

if (chrome.runtime?.onStartup) {
  chrome.runtime.onStartup.addListener(async () => {
    await maybeClearSmartBookmarksOnStartup();
    await syncReminderAlarms();
    await ensureSmartReminderHeartbeat();
    await runSmartReminderEngineInBackground();
  });
}

if (chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.page_notes) {
      await refreshPageNoteBadgesInOpenTabs();
    }

    if (changes.memories) {
      await syncReminderAlarms();
    }

    if (changes[SMART_REMINDERS_RUNTIME_KEY]) {
      const configData = await storageGet([SMART_REMINDERS_CONFIG_KEY, 'language']);
      const config = normalizeSmartRemindersConfig(configData[SMART_REMINDERS_CONFIG_KEY]);
      const language = ['en', 'es', 'vi'].includes(configData.language) ? configData.language : 'en';
      const previousRuntime = normalizeSmartRemindersRuntime(changes[SMART_REMINDERS_RUNTIME_KEY].oldValue, config);
      const nextRuntime = normalizeSmartRemindersRuntime(changes[SMART_REMINDERS_RUNTIME_KEY].newValue, config);
      const previousActive = previousRuntime.activeReminderId;
      const nextActive = nextRuntime.activeReminderId;

      if (nextActive) {
        await showSmartReminderOverlay(nextActive, config, language);
        await closeSmartReminderPopup();
      } else if (previousActive) {
        await closeSmartReminderOverlays();
        await closeSmartReminderPopup();
      }
    }

    if (changes[SMART_REMINDERS_CONFIG_KEY] || changes[FOCUS_TIMER_RUNTIME_KEY]) {
      await ensureSmartReminderHeartbeat();
      await runSmartReminderEngineInBackground();
    }
  });
}

if (chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'offiqa:clipboard-capture') {
      saveClipboardItem(message.payload, sender)
        .then((result) => sendResponse(result))
        .catch((error) => {
          sendResponse({
            ok: false,
            reason: error?.message || String(error)
          });
        });

      return true;
    }

    if (message?.type === 'offiqa:hidden-bookmark-overlay-state' && message.active === false) {
      setHiddenSessionState({
        active: false,
        reason: message.reason || 'overlay_closed',
        tabIds: [],
        windowId: null
      })
        .then(() => {
          sendResponse({ ok: true });
        })
        .catch((error) => {
          sendResponse({
            ok: false,
            reason: error?.message || String(error)
          });
        });
      return true;
    }

    if (message?.type === 'offiqa:hidden-bookmark-hotkey-local-handled') {
      lastHiddenBookmarkShortcutHandledAt = Date.now();
      setHiddenSessionState({
        active: false,
        reason: message.reason || 'overlay_opened',
        tabIds: [],
        windowId: null,
        lastCommandAt: Date.now(),
        lastError: null
      })
        .then(() => sendResponse({ ok: true }))
        .catch((error) => {
          sendResponse({
            ok: false,
            reason: error?.message || String(error)
          });
        });
      return true;
    }

    if (message?.type === 'offiqa:quick-note-hotkey-local-handled') {
      lastQuickNoteShortcutHandledAt = Date.now();
      sendResponse({ ok: true });
      return true;
    }

    if (message?.type === 'offiqa:smart-reminder-action') {
      handleSmartReminderOverlayAction(message.action, message.reminderType, {
        suppressToday: Boolean(message.suppressToday)
      })
        .then((result) => sendResponse(result))
        .catch((error) => {
          sendResponse({
            ok: false,
            reason: error?.message || String(error)
          });
        });
      return true;
    }

    if (message?.type === 'offiqa:scheduled-reminder-action') {
      sendResponse({
        ok: true,
        action: message.action || 'close',
        reminderId: message.reminderId || ''
      });
      return true;
    }

    if (message?.type === 'offiqa:hidden-bookmark-hotkey') {
      handleHiddenBookmarkShortcutCommand()
        .then(() => sendResponse({ ok: true }))
        .catch((error) => {
          sendResponse({
            ok: false,
            reason: error?.message || String(error)
          });
        });
      return true;
    }

    if (message?.type === 'offiqa:quick-note-hotkey') {
      openQuickNoteShortcutPopup({
        pageTitle: message.pageTitle || sender?.tab?.title || '',
        pageUrl: message.pageUrl || sender?.tab?.url || ''
      })
        .then(() => sendResponse({ ok: true }))
        .catch((error) => {
          sendResponse({
            ok: false,
            reason: error?.message || String(error)
          });
        });
      return true;
    }
  });
}

if (chrome.tabs?.onRemoved) {
  chrome.tabs.onRemoved.addListener(async (tabId) => {
    const data = await storageGet([HIDDEN_SESSION_KEY]);
    const session = data[HIDDEN_SESSION_KEY];
    if (!session?.active || !Array.isArray(session.tabIds) || !session.tabIds.includes(tabId)) return;

    const remainingTabIds = session.tabIds.filter((id) => id !== tabId);
    await setHiddenSessionState({
      active: remainingTabIds.length > 0,
      reason: remainingTabIds.length > 0 ? 'opened' : 'closed_after_tabs_removed',
      tabIds: remainingTabIds,
      windowId: remainingTabIds.length > 0 ? session.windowId : null
    });
  });
}

if (chrome.windows?.onRemoved) {
  chrome.windows.onRemoved.addListener(async (windowId) => {
    const data = await storageGet([HIDDEN_SESSION_KEY]);
    const session = data[HIDDEN_SESSION_KEY];
    if (!session || session.windowId !== windowId) return;

    await setHiddenSessionState({
      active: false,
      reason: 'closed_after_window_removed',
      tabIds: [],
      windowId: null
    });
  });
}

// Handle alarm-based reminders when the alarms API is available.
if (chrome.alarms?.onAlarm) {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === SMART_REMINDER_TICK_ALARM) {
      await ensureSmartReminderHeartbeat();
      await runSmartReminderEngineInBackground();
      return;
    }

    if (!alarm.name.startsWith(REMINDER_ALARM_PREFIX)) return;

    const id = alarm.name.replace(REMINDER_ALARM_PREFIX, '');
    chrome.storage.local.get(['memories', 'language'], async (data) => {
      const memories = data.memories || [];
      const memory = memories.find((item) => item.id === id);
      if (!memory) return;

      const language = ['en', 'es', 'vi'].includes(data.language) ? data.language : 'en';
      let overlayShown = false;
      try {
        overlayShown = await showScheduledReminderOverlay(memory, language);
      } catch (_) {
        overlayShown = false;
      }
      if (overlayShown || !chrome.notifications?.create) return;

      const title = getBackgroundI18n(language).notificationTitle;
      const advanceLabel = getReminderAdvanceLabel(memory, language);
      chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon48.png'),
        title,
        message: advanceLabel ? `${advanceLabel}: ${memory.text}` : memory.text
      });
    });
  });
}

ensureSmartReminderHeartbeat();
