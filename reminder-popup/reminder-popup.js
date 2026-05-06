const SMART_REMINDERS_RUNTIME_KEY = 'smart_reminders_runtime';
const SMART_REMINDERS_CONFIG_KEY = 'smart_reminders_config';
const SMART_REMINDER_DEFAULT_TYPES = ['standing', 'water', 'eye_break'];
const SUPPORTED_LANGUAGE_OPTIONS = ['en', 'es', 'vi'];
const REMINDER_I18N = Object.fromEntries(Object.entries(globalThis.OFFIQA_I18N_PACKS || {}).map(([lang, pack]) => [lang, pack.reminder || {}]));

let currentLanguage = 'en';

function normalizeLanguage(lang) {
  return SUPPORTED_LANGUAGE_OPTIONS.includes(lang) ? lang : 'en';
}

function getCopy(lang = currentLanguage) {
  return REMINDER_I18N[lang] || REMINDER_I18N.en;
}

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(values) {
  return new Promise((resolve) => chrome.storage.local.set(values, resolve));
}

function getNextLocalDayStartTimestamp(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
}

function sanitizeSmartReminderText(value, fallback = '') {
  return String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, 80);
}

function isValidSmartReminderType(type) {
  return typeof type === 'string' && /^[a-z][a-z0-9_]{1,48}$/.test(type);
}

function createDefaultSmartRemindersConfig() {
  const copy = getCopy();
  return {
    rules: {
      standing: { enabled: true, label: copy.defs.standing.label, message: copy.defs.standing.message, intervalMinutes: 60, createdAt: 1 },
      water: { enabled: true, label: copy.defs.water.label, message: copy.defs.water.message, intervalMinutes: 120, createdAt: 2 },
      eye_break: { enabled: true, label: copy.defs.eye_break.label, message: copy.defs.eye_break.message, intervalMinutes: 45, createdAt: 3 }
    }
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
    const fallback = base.rules[type] || { enabled: true, label: 'Reminder', message: 'Reminder', intervalMinutes: 60, createdAt: Date.now() };
    const rawRule = rawRules[type] || {};
    const label = sanitizeSmartReminderText(rawRule.label, fallback.label);
    rules[type] = {
      ...fallback,
      ...rawRule,
      enabled: rawRule.enabled !== false,
      label,
      message: sanitizeSmartReminderText(rawRule.message, fallback.message || label) || label,
      intervalMinutes: Number.isFinite(Number(rawRule.intervalMinutes)) ? Number(rawRule.intervalMinutes) : fallback.intervalMinutes,
      createdAt: Number.isFinite(rawRule.createdAt) ? rawRule.createdAt : fallback.createdAt
    };
  });
  return { ...base, ...(raw || {}), deletedRuleTypes, rules };
}

function getSmartReminderTypes(config) {
  return Object.keys(config?.rules || {}).filter(isValidSmartReminderType);
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
    activeReminderId: '',
    deferredReminderIds: [],
    byType: {
      standing: createDefaultSmartReminderRuntimeItem(now),
      water: createDefaultSmartReminderRuntimeItem(now),
      eye_break: createDefaultSmartReminderRuntimeItem(now)
    }
  };
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

  const validTypes = getSmartReminderTypes(config);
  runtime.activeReminderId = validTypes.includes(runtime.activeReminderId) ? runtime.activeReminderId : '';
  runtime.deferredReminderIds = Array.isArray(runtime.deferredReminderIds)
    ? runtime.deferredReminderIds.filter((type) => validTypes.includes(type))
    : [];
  return runtime;
}

async function loadState() {
  const data = await storageGet([SMART_REMINDERS_CONFIG_KEY, SMART_REMINDERS_RUNTIME_KEY]);
  const config = normalizeSmartRemindersConfig(data[SMART_REMINDERS_CONFIG_KEY]);
  return {
    config,
    runtime: normalizeSmartRemindersRuntime(data[SMART_REMINDERS_RUNTIME_KEY], config)
  };
}

async function saveRuntime(runtime) {
  await storageSet({ [SMART_REMINDERS_RUNTIME_KEY]: runtime });
}

function getActiveReminderType(runtime, config) {
  return getSmartReminderTypes(config).includes(runtime.activeReminderId) ? runtime.activeReminderId : '';
}

function applyReminderLanguage() {
  const copy = getCopy();
  document.documentElement.lang = currentLanguage;
  document.title = copy.title;
  document.getElementById('reminder-done').textContent = copy.done;
  document.getElementById('reminder-suppress-label').textContent = copy.suppressToday;
  document.getElementById('reminder-close')?.setAttribute('aria-label', copy.close || 'Close');
}

function renderReminder(type, config = createDefaultSmartRemindersConfig()) {
  const titleEl = document.getElementById('reminder-title');
  const messageEl = document.getElementById('reminder-message');
  const metaEl = document.getElementById('reminder-meta');
  const copy = getCopy();

  if (!type) {
    titleEl.textContent = copy.idleTitle;
    messageEl.textContent = copy.idleMessage;
    metaEl.textContent = copy.idleMeta;
    setTimeout(() => window.close(), 250);
    return;
  }

  const savedRule = config.rules[type];
  const def = copy.defs[type] || {};
  titleEl.textContent = savedRule?.label || def.label || copy.title;
  messageEl.textContent = savedRule?.message || savedRule?.label || def.message || copy.metaAction;
  metaEl.textContent = copy.metaAction;
}

function shouldSuppressToday() {
  return Boolean(document.getElementById('reminder-suppress-today')?.checked);
}

async function markReminderDone({ countDone = true } = {}) {
  const { config, runtime } = await loadState();
  const type = getActiveReminderType(runtime, config);
  if (!type) {
    window.close();
    return;
  }

  const now = Date.now();
  const item = runtime.byType[type];
  item.lastDoneAt = now;
  item.lastShownAt = now;
  item.snoozedUntil = shouldSuppressToday() ? getNextLocalDayStartTimestamp(new Date(now)) : null;
  item.forcedDueAt = null;
  if (countDone) {
    item.doneCountToday = (item.doneCountToday || 0) + 1;
  }
  runtime.activeReminderId = '';
  runtime.deferredReminderIds = runtime.deferredReminderIds.filter((entry) => entry !== type);
  await saveRuntime(runtime);
  window.close();
}

async function init() {
  const settings = await storageGet(['language']);
  currentLanguage = normalizeLanguage(settings.language);
  applyReminderLanguage();
  const { config, runtime } = await loadState();
  renderReminder(getActiveReminderType(runtime, config), config);
}

document.getElementById('reminder-done').addEventListener('click', () => {
  markReminderDone();
});

document.getElementById('reminder-close').addEventListener('click', () => {
  markReminderDone({ countDone: false });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;

  if (changes.language) {
    currentLanguage = normalizeLanguage(changes.language.newValue);
    applyReminderLanguage();
    loadState().then(({ config, runtime }) => renderReminder(getActiveReminderType(runtime, config), config));
  }

  if (changes[SMART_REMINDERS_RUNTIME_KEY] || changes[SMART_REMINDERS_CONFIG_KEY]) {
    loadState().then(({ config, runtime }) => renderReminder(getActiveReminderType(runtime, config), config));
  }
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    markReminderDone({ countDone: false });
  }
});

init();
