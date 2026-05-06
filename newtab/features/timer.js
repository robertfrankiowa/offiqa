// ===== FOCUS TIMER =====
const FOCUS_TIMER_RUNTIME_KEY = 'focus_timer_runtime';
const FOCUS_TIMER_STATS_KEY = 'focus_timer_stats';
const SMART_REMINDERS_CONFIG_KEY = 'smart_reminders_config';
const SMART_REMINDERS_RUNTIME_KEY = 'smart_reminders_runtime';
const TIMER_PRESETS = [10, 15, 25, 50];
const SHORT_BREAK_MINUTES = 5;
const LONG_BREAK_MINUTES = 15;
const LONG_BREAK_INTERVAL = 4;
const NEAR_END_SECONDS = 5 * 60;
const AUTO_BREAK_DELAY_MS = 1500;
const SMART_REMINDER_RESHOW_CAP_MINUTES = 30;
const CIRCUMFERENCE = 2 * Math.PI * 30;
const SMART_REMINDER_DEFAULT_TYPES = ['standing', 'water', 'eye_break'];
const SMART_REMINDER_PRIORITY = ['standing', 'eye_break', 'water'];
const SMART_REMINDER_CUSTOM_PREFIX = 'custom_';
const SMART_REMINDER_DEFS = {
  standing: {
    label: 'Đứng lên',
    message: 'Đến lúc đứng lên 1–2 phút',
    compactMessage: 'Đứng lên 1–2 phút nhé',
    defaultIntervalMinutes: 60
  },
  water: {
    label: 'Uống nước',
    message: 'Uống chút nước nhé',
    compactMessage: 'Uống chút nước rồi quay lại nhé',
    defaultIntervalMinutes: 120
  },
  eye_break: {
    label: 'Nghỉ mắt',
    message: 'Nghỉ mắt 20 giây thôi',
    compactMessage: 'Nhìn xa một chút để mắt đỡ mỏi',
    defaultIntervalMinutes: 45
  }
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

let focusTimerRuntime = createDefaultTimerRuntime();
let focusTimerStats = createDefaultTimerStats();
let focusTimerInterval = null;
let focusTimerAutoBreakTimer = null;
let focusTaskSuggestionHideTimer = null;
let lastFocusTimerTickKey = '';
let smartRemindersConfig = createDefaultSmartRemindersConfig();
let smartRemindersRuntime = createDefaultSmartRemindersRuntime();
let smartReminderPanelOpen = false;
let smartReminderCheckInterval = null;
let smartReminderEditingType = '';

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
  const def = SMART_REMINDER_DEFS[type] || {};
  return {
    enabled: true,
    label: def.label || 'Nhắc nhở',
    message: def.message || def.label || 'Nhắc nhở',
    compactMessage: def.compactMessage || def.message || def.label || 'Nhắc nhở',
    intervalMinutes: def.defaultIntervalMinutes || 60,
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

function getSmartReminderTypes(config = smartRemindersConfig) {
  const rules = config?.rules || {};
  const types = Object.keys(rules).filter(isValidSmartReminderType);
  return [...new Set([...SMART_REMINDER_DEFAULT_TYPES, ...types])]
    .filter((type) => rules[type])
    .sort((a, b) => getSmartReminderPriority(a) - getSmartReminderPriority(b));
}

function getSmartReminderDisplay(type) {
  const rule = smartRemindersConfig.rules[type] || getSmartReminderDefaultRule(type);
  return {
    label: rule.label || SMART_REMINDER_DEFS[type]?.label || 'Nhắc nhở',
    message: rule.message || rule.label || SMART_REMINDER_DEFS[type]?.message || 'Nhắc nhở',
    compactMessage: rule.compactMessage || rule.message || rule.label || SMART_REMINDER_DEFS[type]?.compactMessage || 'Nhắc nhở'
  };
}

function createDefaultTimerRuntime() {
  return {
    mode: 'countdown',
    selectedDurationMinutes: 25,
    selectedPresetKey: '25',
    customDurationMinutes: 30,
    contextText: '',
    linkedTaskId: '',
    linkedTaskTitle: '',
    currentState: TIMER_STATES.IDLE,
    startedAt: null,
    endsAt: null,
    pausedAt: null,
    remainingSeconds: 25 * 60,
    currentDurationSeconds: 25 * 60,
    elapsedSeconds: 0,
    isAutoBreakEnabled: true,
    breakDurationMinutes: SHORT_BREAK_MINUTES,
    lastSessionSummary: null,
    lastCompletedAt: null
  };
}

function createDefaultTimerStats() {
  return {
    dateKey: getLocalDateKey(),
    focusMinutesToday: 0,
    focusSessionsCompletedToday: 0,
    completedSessionsToday: [],
    completedCycleCountToday: 0
  };
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

function normalizeSmartRemindersRuntime(raw, config = smartRemindersConfig) {
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
  runtime.mode = runtime.mode === 'pomodoro' ? 'countdown' : (runtime.mode === 'stopwatch' ? 'stopwatch' : 'countdown');
  runtime.selectedDurationMinutes = clampNumber(runtime.selectedDurationMinutes, 1, 180, base.selectedDurationMinutes);
  runtime.customDurationMinutes = clampNumber(runtime.customDurationMinutes, 1, 180, base.customDurationMinutes);
  runtime.selectedPresetKey = runtime.selectedPresetKey === 'custom'
    ? 'custom'
    : String(clampNumber(runtime.selectedPresetKey || runtime.selectedDurationMinutes, 1, 180, runtime.selectedDurationMinutes));
  runtime.contextText = String(runtime.contextText || '');
  runtime.linkedTaskId = String(runtime.linkedTaskId || '');
  runtime.linkedTaskTitle = String(runtime.linkedTaskTitle || '');
  runtime.currentState = Object.values(TIMER_STATES).includes(runtime.currentState) ? runtime.currentState : TIMER_STATES.IDLE;
  runtime.startedAt = Number.isFinite(runtime.startedAt) ? runtime.startedAt : null;
  runtime.endsAt = Number.isFinite(runtime.endsAt) ? runtime.endsAt : null;
  runtime.pausedAt = Number.isFinite(runtime.pausedAt) ? runtime.pausedAt : null;
  runtime.remainingSeconds = Math.max(0, Math.floor(Number(runtime.remainingSeconds) || 0));
  runtime.currentDurationSeconds = Math.max(0, Math.floor(Number(runtime.currentDurationSeconds) || 0));
  runtime.elapsedSeconds = Math.max(0, Math.floor(Number(runtime.elapsedSeconds) || 0));
  runtime.isAutoBreakEnabled = runtime.isAutoBreakEnabled !== false;
  runtime.breakDurationMinutes = clampNumber(runtime.breakDurationMinutes, SHORT_BREAK_MINUTES, LONG_BREAK_MINUTES, SHORT_BREAK_MINUTES);
  runtime.lastCompletedAt = Number.isFinite(runtime.lastCompletedAt) ? runtime.lastCompletedAt : null;
  runtime.lastSessionSummary = runtime.lastSessionSummary && typeof runtime.lastSessionSummary === 'object'
    ? runtime.lastSessionSummary
    : null;

  if (runtime.mode === 'countdown' && runtime.currentState === TIMER_STATES.IDLE && runtime.currentDurationSeconds <= 0) {
    runtime.currentDurationSeconds = runtime.selectedDurationMinutes * 60;
    runtime.remainingSeconds = runtime.currentDurationSeconds;
  }

  if (runtime.mode === 'stopwatch' && runtime.currentState === TIMER_STATES.IDLE) {
    runtime.remainingSeconds = 0;
    runtime.currentDurationSeconds = 0;
    runtime.elapsedSeconds = 0;
  }

  return runtime;
}

function normalizeTimerStats(raw, legacyToday, legacyDate) {
  const todayKey = getLocalDateKey();
  const base = createDefaultTimerStats();
  const stats = { ...base, ...(raw || {}) };
  stats.dateKey = typeof stats.dateKey === 'string' ? stats.dateKey : todayKey;

  if (!raw && legacyDate === new Date().toDateString() && Number.isFinite(legacyToday)) {
    stats.focusSessionsCompletedToday = legacyToday;
    stats.focusMinutesToday = legacyToday * 25;
    stats.completedCycleCountToday = legacyToday;
  }

  if (stats.dateKey !== todayKey) {
    return createDefaultTimerStats();
  }

  stats.focusMinutesToday = Math.max(0, Math.floor(Number(stats.focusMinutesToday) || 0));
  stats.focusSessionsCompletedToday = Math.max(0, Math.floor(Number(stats.focusSessionsCompletedToday) || 0));
  stats.completedCycleCountToday = Math.max(0, Math.floor(Number(stats.completedCycleCountToday) || 0));
  stats.completedSessionsToday = Array.isArray(stats.completedSessionsToday) ? stats.completedSessionsToday : [];
  return stats;
}

function isCountdownMode() {
  return focusTimerRuntime.mode === 'countdown';
}

function isRunningState(state = focusTimerRuntime.currentState) {
  return state === TIMER_STATES.RUNNING_FOCUS || state === TIMER_STATES.RUNNING_BREAK;
}

function isPausedState(state = focusTimerRuntime.currentState) {
  return state === TIMER_STATES.PAUSED_FOCUS || state === TIMER_STATES.PAUSED_BREAK;
}

function isBreakState(state = focusTimerRuntime.currentState) {
  return state === TIMER_STATES.RUNNING_BREAK
    || state === TIMER_STATES.PAUSED_BREAK
    || state === TIMER_STATES.COMPLETED_BREAK;
}

function isFocusState(state = focusTimerRuntime.currentState) {
  return state === TIMER_STATES.RUNNING_FOCUS
    || state === TIMER_STATES.PAUSED_FOCUS
    || state === TIMER_STATES.COMPLETED_FOCUS;
}

function isCompletedState(state = focusTimerRuntime.currentState) {
  return state === TIMER_STATES.COMPLETED_FOCUS || state === TIMER_STATES.COMPLETED_BREAK;
}

function getSelectedDurationMinutes() {
  return focusTimerRuntime.selectedPresetKey === 'custom'
    ? focusTimerRuntime.customDurationMinutes
    : clampNumber(focusTimerRuntime.selectedDurationMinutes, 1, 180, 25);
}

function getPreviewEndTime() {
  if (!isCountdownMode()) return '';
  const seconds = getIdleCountdownSeconds();
  return seconds > 0 ? formatTimerClockTime(Date.now() + seconds * 1000) : '';
}

function getIdleCountdownSeconds() {
  const minutes = getSelectedDurationMinutes();
  return Math.max(60, minutes * 60);
}

function getTimerDisplaySeconds(now = Date.now()) {
  if (isCountdownMode()) {
    if (isRunningState()) {
      return Math.max(0, Math.ceil((focusTimerRuntime.endsAt - now) / 1000));
    }
    return Math.max(0, focusTimerRuntime.remainingSeconds);
  }

  if (focusTimerRuntime.currentState === TIMER_STATES.RUNNING_FOCUS && focusTimerRuntime.startedAt) {
    return focusTimerRuntime.elapsedSeconds + Math.max(0, Math.floor((now - focusTimerRuntime.startedAt) / 1000));
  }

  return Math.max(0, focusTimerRuntime.elapsedSeconds);
}

function getCurrentDurationSeconds() {
  if (!isCountdownMode()) return 0;
  return Math.max(1, focusTimerRuntime.currentDurationSeconds || getIdleCountdownSeconds());
}

function formatTimerDisplay(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return hours > 0 ? `${hours}:${pad2(minutes)}:${pad2(secs)}` : `${pad2(minutes)}:${pad2(secs)}`;
}

function formatTimerClockTime(timestamp) {
  if (!timestamp) return '';
  return new Intl.DateTimeFormat(getLanguageLocale(), {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp));
}

function formatFocusMinutes(minutes) {
  if (currentLanguage === 'es') return `Hoy: ${minutes} minutos de enfoque`;
  if (currentLanguage === 'vi') return `Hôm nay: ${minutes} phút tập trung`;
  return `Today: ${minutes} minutes focused`;
}

function getNextBreakDurationMinutes(completedCount = focusTimerStats.focusSessionsCompletedToday) {
  return completedCount > 0 && completedCount % LONG_BREAK_INTERVAL === 0
    ? LONG_BREAK_MINUTES
    : SHORT_BREAK_MINUTES;
}

function clearFocusTimerAutoBreak() {
  clearTimeout(focusTimerAutoBreakTimer);
  focusTimerAutoBreakTimer = null;
}

function persistFocusTimerRuntime() {
  return store.set({ [FOCUS_TIMER_RUNTIME_KEY]: focusTimerRuntime });
}

function persistFocusTimerStats() {
  return store.set({ [FOCUS_TIMER_STATS_KEY]: focusTimerStats });
}

async function ensureFocusTimerStatsCurrent() {
  const todayKey = getLocalDateKey();
  if (focusTimerStats.dateKey === todayKey) return;
  focusTimerStats = createDefaultTimerStats();
  await persistFocusTimerStats();
}

function persistSmartRemindersConfig() {
  return store.set({ [SMART_REMINDERS_CONFIG_KEY]: smartRemindersConfig });
}

function persistSmartRemindersRuntime() {
  return store.set({ [SMART_REMINDERS_RUNTIME_KEY]: smartRemindersRuntime });
}

async function ensureSmartRemindersRuntimeCurrent() {
  const todayKey = getLocalDateKey();
  if (smartRemindersRuntime.dateKey === todayKey) return;
  smartRemindersRuntime = normalizeSmartRemindersRuntime(smartRemindersRuntime, smartRemindersConfig);
  await persistSmartRemindersRuntime();
}

function parseClockMinutes(timeString) {
  if (!timeString || typeof timeString !== 'string') return null;
  const [hour, minute] = timeString.split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function isWithinReminderWorkHours(now = new Date()) {
  if (!smartRemindersConfig.workHoursOnly) return true;
  const startMinutes = parseClockMinutes(smartRemindersConfig.workHoursStart);
  const endMinutes = parseClockMinutes(smartRemindersConfig.workHoursEnd);
  if (startMinutes == null || endMinutes == null) return true;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }
  return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}

function getSmartReminderRule(type) {
  return smartRemindersConfig.rules[type];
}

function getSmartReminderRuntimeItem(type) {
  return smartRemindersRuntime.byType[type];
}

function isSmartReminderSuppressedByState(type) {
  if (!isBreakState()) return false;
  return type === 'standing';
}

function getSmartReminderDueAt(type) {
  const rule = getSmartReminderRule(type);
  const runtimeItem = getSmartReminderRuntimeItem(type);
  if (!smartRemindersConfig.enabled || !rule?.enabled || !runtimeItem) return null;

  if (runtimeItem.snoozedUntil) {
    return runtimeItem.snoozedUntil;
  }

  if (runtimeItem.forcedDueAt) {
    return runtimeItem.forcedDueAt;
  }

  if (runtimeItem.lastDoneAt) {
    return runtimeItem.lastDoneAt + rule.intervalMinutes * 60000;
  }

  if (runtimeItem.lastShownAt) {
    return runtimeItem.lastShownAt + Math.min(rule.intervalMinutes, SMART_REMINDER_RESHOW_CAP_MINUTES) * 60000;
  }

  return runtimeItem.enabledAt + rule.intervalMinutes * 60000;
}

function isSmartReminderDue(type, now = Date.now()) {
  const dueAt = getSmartReminderDueAt(type);
  if (!dueAt) return false;
  if (!isWithinReminderWorkHours(new Date(now))) return false;
  if (isSmartReminderSuppressedByState(type)) return false;
  return now >= dueAt;
}

function getSmartReminderPriority(type) {
  const defaultIndex = SMART_REMINDER_PRIORITY.indexOf(type);
  if (defaultIndex >= 0) return defaultIndex;
  const createdAt = smartRemindersConfig?.rules?.[type]?.createdAt;
  return 1000 + (Number.isFinite(createdAt) ? createdAt / 10000000000000 : 1);
}

function sortSmartReminderIds(ids) {
  return [...new Set(ids)].sort((a, b) => getSmartReminderPriority(a) - getSmartReminderPriority(b));
}

function queueDeferredSmartReminder(type) {
  if (!getSmartReminderTypes().includes(type)) return false;
  const next = sortSmartReminderIds([...smartRemindersRuntime.deferredReminderIds, type]);
  const changed = next.join('|') !== smartRemindersRuntime.deferredReminderIds.join('|');
  smartRemindersRuntime.deferredReminderIds = next;
  return changed;
}

function removeDeferredSmartReminder(type) {
  const next = smartRemindersRuntime.deferredReminderIds.filter((item) => item !== type);
  const changed = next.length !== smartRemindersRuntime.deferredReminderIds.length;
  smartRemindersRuntime.deferredReminderIds = next;
  return changed;
}

function clearActiveSmartReminder() {
  if (!smartRemindersRuntime.activeReminderId) return false;
  smartRemindersRuntime.activeReminderId = '';
  return true;
}

function getSmartReminderSummaryText() {
  if (!smartRemindersConfig.enabled) return 'Đang tắt';
  const enabledRules = getSmartReminderTypes().filter((type) => smartRemindersConfig.rules[type]?.enabled);
  if (enabledRules.length === 0) return 'Đang tắt';
  if (enabledRules.length >= 3) return `${enabledRules.length} nhắc nhở đang bật`;
  return enabledRules.map((type) => `${getSmartReminderDisplay(type).label} ${smartRemindersConfig.rules[type].intervalMinutes}'`).join(' • ');
}

function createSmartReminderType() {
  return `${SMART_REMINDER_CUSTOM_PREFIX}${Date.now().toString(36)}`;
}

function renderSmartReminderRuleList() {
  const list = document.getElementById('smart-reminder-rules');
  if (!list) return;
  list.replaceChildren();

  const types = getSmartReminderTypes();
  if (!types.length) {
    const empty = document.createElement('div');
    empty.className = 'smart-reminder-empty';
    empty.textContent = 'Chưa có nhắc nhở nào.';
    list.appendChild(empty);
    return;
  }

  types.forEach((type) => {
    const rule = smartRemindersConfig.rules[type];
    if (!rule) return;

    const row = document.createElement('div');
    row.className = 'smart-reminder-rule';
    row.dataset.reminderType = type;

    const main = document.createElement('label');
    main.className = 'smart-reminder-rule-main';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = rule.enabled;
    checkbox.dataset.action = 'toggle-smart-reminder';
    checkbox.dataset.reminderType = type;

    const label = document.createElement('span');
    label.textContent = rule.label;

    main.append(checkbox, label);

    const minuteWrap = document.createElement('label');
    minuteWrap.className = 'smart-reminder-minute-wrap';

    const minuteInput = document.createElement('input');
    minuteInput.type = 'number';
    minuteInput.className = 'smart-reminder-minute-input';
    minuteInput.min = '1';
    minuteInput.max = '240';
    minuteInput.step = '1';
    minuteInput.inputMode = 'numeric';
    minuteInput.value = String(rule.intervalMinutes);
    minuteInput.disabled = !rule.enabled;
    minuteInput.dataset.action = 'update-smart-reminder-interval';
    minuteInput.dataset.reminderType = type;

    const suffix = document.createElement('span');
    suffix.className = 'smart-reminder-minute-suffix';
    suffix.textContent = 'phút';

    minuteWrap.append(minuteInput, suffix);

    const actions = document.createElement('div');
    actions.className = 'smart-reminder-rule-actions';

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'smart-reminder-icon-btn';
    editButton.dataset.action = 'edit-smart-reminder';
    editButton.dataset.reminderType = type;
    editButton.title = 'Sửa nhắc nhở';
    editButton.textContent = '✎';

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'smart-reminder-icon-btn is-danger';
    deleteButton.dataset.action = 'delete-smart-reminder';
    deleteButton.dataset.reminderType = type;
    deleteButton.title = 'Xóa nhắc nhở';
    deleteButton.textContent = '×';

    actions.append(editButton, deleteButton);
    row.append(main, minuteWrap, actions);
    list.appendChild(row);
  });
}

function renderSmartReminderEditor() {
  const editor = document.getElementById('smart-reminder-editor');
  const nameInput = document.getElementById('smart-reminder-name-input');
  const intervalInput = document.getElementById('smart-reminder-editor-interval');
  if (!editor || !nameInput || !intervalInput) return;

  editor.hidden = !smartReminderEditingType;
  if (!smartReminderEditingType) return;

  const rule = smartRemindersConfig.rules[smartReminderEditingType] || {
    label: '',
    intervalMinutes: 60
  };
  if (document.activeElement !== nameInput) {
    nameInput.value = rule.label || '';
  }
  if (document.activeElement !== intervalInput) {
    intervalInput.value = String(rule.intervalMinutes || 60);
  }
}

function renderSmartReminderControls() {
  const toggle = document.getElementById('smart-reminder-toggle');
  const panel = document.getElementById('smart-reminder-panel');
  document.getElementById('smart-reminder-summary').textContent = getSmartReminderSummaryText();
  toggle.setAttribute('aria-expanded', smartReminderPanelOpen ? 'true' : 'false');
  panel.hidden = !smartReminderPanelOpen;

  renderSmartReminderRuleList();
  renderSmartReminderEditor();
  document.getElementById('reminder-work-hours-only').checked = smartRemindersConfig.workHoursOnly;
  document.getElementById('reminder-work-hours-start').value = smartRemindersConfig.workHoursStart;
  document.getElementById('reminder-work-hours-end').value = smartRemindersConfig.workHoursEnd;
  document.getElementById('reminder-work-hours-start').disabled = !smartRemindersConfig.workHoursOnly;
  document.getElementById('reminder-work-hours-end').disabled = !smartRemindersConfig.workHoursOnly;
}

function getActiveSmartReminderType() {
  return getSmartReminderTypes().includes(smartRemindersRuntime.activeReminderId)
    ? smartRemindersRuntime.activeReminderId
    : '';
}

function renderSmartReminderSurfaces() {
  const activeType = getActiveSmartReminderType();
  const reminderCard = document.getElementById('smart-reminder-card');
  const postReminder = document.getElementById('timer-post-reminder');
  reminderCard.hidden = true;
  postReminder.hidden = true;

  if (!activeType || focusTimerRuntime.currentState === TIMER_STATES.RUNNING_FOCUS) return;

  const def = getSmartReminderDisplay(activeType);
  const message = isBreakState() ? def.compactMessage : def.message;

  if (focusTimerRuntime.currentState === TIMER_STATES.COMPLETED_FOCUS) {
    postReminder.hidden = false;
    postReminder.innerHTML = `
      <span class="timer-post-reminder-text">${message}</span>
      <span class="timer-post-reminder-actions">
        <button type="button" class="btn-timer-inline is-success" data-reminder-action="done" data-reminder-type="${activeType}">Đã làm</button>
        <label class="smart-reminder-suppress">
          <input type="checkbox" data-reminder-suppress-today="${activeType}">
          <span>Không hiển thị lại hôm nay</span>
        </label>
      </span>
    `;
    return;
  }

  reminderCard.hidden = false;
  document.getElementById('smart-reminder-card-kicker').textContent = def.label;
  document.getElementById('smart-reminder-card-message').textContent = message;
}

function renderSmartReminderUI() {
  renderSmartReminderControls();
  renderSmartReminderSurfaces();
}

function getDueSmartReminderCandidates(now = Date.now()) {
  return sortSmartReminderIds(
    getSmartReminderTypes().filter((type) => isSmartReminderDue(type, now))
  );
}

function sanitizeDeferredSmartReminders() {
  smartRemindersRuntime.deferredReminderIds = sortSmartReminderIds(
    smartRemindersRuntime.deferredReminderIds.filter((type) => {
      const rule = getSmartReminderRule(type);
      if (!rule?.enabled) return false;
      if (isSmartReminderSuppressedByState(type)) return false;
      return true;
    })
  );
}

async function runSmartReminderEngine() {
  await ensureSmartRemindersRuntimeCurrent();
  sanitizeDeferredSmartReminders();
  const now = Date.now();
  const isRunningFocus = focusTimerRuntime.currentState === TIMER_STATES.RUNNING_FOCUS;

  if (!smartRemindersConfig.enabled) {
    clearActiveSmartReminder();
    smartRemindersRuntime.deferredReminderIds = [];
    await persistSmartRemindersRuntime();
    renderSmartReminderUI();
    return;
  }

  let changed = false;
  const activeType = getActiveSmartReminderType();
  if (activeType && isRunningFocus) {
    changed = queueDeferredSmartReminder(activeType) || changed;
    changed = clearActiveSmartReminder() || changed;
  }

  if (activeType && !isRunningFocus) {
    const rule = getSmartReminderRule(activeType);
    if (!rule?.enabled || !isWithinReminderWorkHours(new Date(now)) || isSmartReminderSuppressedByState(activeType)) {
      changed = clearActiveSmartReminder() || changed;
    }
  }

  const dueCandidates = getDueSmartReminderCandidates(now);
  if (isRunningFocus) {
    dueCandidates.forEach((type) => {
      changed = queueDeferredSmartReminder(type) || changed;
    });
  } else if (!getActiveSmartReminderType()) {
    const deferredCandidate = smartRemindersRuntime.deferredReminderIds.find((type) => isSmartReminderDue(type, now));
    const nextType = deferredCandidate || dueCandidates[0];
    if (nextType) {
      smartRemindersRuntime.activeReminderId = nextType;
      smartRemindersRuntime.byType[nextType].lastShownAt = now;
      smartRemindersRuntime.byType[nextType].forcedDueAt = null;
      removeDeferredSmartReminder(nextType);
      changed = true;
    }
  }

  if (changed) {
    await persistSmartRemindersRuntime();
  }

  renderSmartReminderUI();
}

async function loadSmartReminders() {
  const data = await store.get([SMART_REMINDERS_CONFIG_KEY, SMART_REMINDERS_RUNTIME_KEY]);
  smartRemindersConfig = normalizeSmartRemindersConfig(data[SMART_REMINDERS_CONFIG_KEY]);
  smartRemindersRuntime = normalizeSmartRemindersRuntime(data[SMART_REMINDERS_RUNTIME_KEY], smartRemindersConfig);
  renderSmartReminderUI();
}

function ensureSmartReminderTicking() {
  clearInterval(smartReminderCheckInterval);
  smartReminderCheckInterval = setInterval(() => {
    runSmartReminderEngine();
  }, 60000);
}

async function updateSmartReminderRule(type, patch) {
  if (!getSmartReminderTypes().includes(type)) return;
  const wasEnabled = smartRemindersConfig.rules[type]?.enabled;
  smartRemindersConfig.rules[type] = normalizeSmartReminderRule(type, {
    ...smartRemindersConfig.rules[type],
    ...patch
  });
  smartRemindersConfig = normalizeSmartRemindersConfig(smartRemindersConfig);
  smartRemindersRuntime = normalizeSmartRemindersRuntime(smartRemindersRuntime, smartRemindersConfig);
  if (!wasEnabled && smartRemindersConfig.rules[type].enabled) {
    if (!smartRemindersRuntime.byType[type]) {
      smartRemindersRuntime.byType[type] = createDefaultSmartReminderRuntimeItem(Date.now());
    }
    smartRemindersRuntime.byType[type].enabledAt = Date.now();
    smartRemindersRuntime.byType[type].lastShownAt = null;
    smartRemindersRuntime.byType[type].lastDoneAt = null;
    smartRemindersRuntime.byType[type].snoozedUntil = null;
    smartRemindersRuntime.byType[type].forcedDueAt = null;
    await persistSmartRemindersRuntime();
  }
  await persistSmartRemindersConfig();
  renderSmartReminderUI();
  await runSmartReminderEngine();
}

function handleSmartReminderIntervalInput(type, input) {
  const fallback = smartRemindersConfig.rules[type]?.intervalMinutes || getSmartReminderDefaultRule(type).intervalMinutes;
  const nextValue = clampNumber(input.value, 1, 240, fallback);
  input.value = String(nextValue);
  updateSmartReminderRule(type, { intervalMinutes: nextValue });
}

async function saveSmartReminderFromEditor() {
  const nameInput = document.getElementById('smart-reminder-name-input');
  const intervalInput = document.getElementById('smart-reminder-editor-interval');
  const label = sanitizeSmartReminderText(nameInput?.value, 'Nhắc nhở mới');
  const intervalMinutes = clampNumber(intervalInput?.value, 1, 240, 60);
  const type = smartReminderEditingType && smartRemindersConfig.rules[smartReminderEditingType]
    ? smartReminderEditingType
    : createSmartReminderType();

  smartRemindersConfig.rules[type] = normalizeSmartReminderRule(type, {
    ...(smartRemindersConfig.rules[type] || {}),
    enabled: smartRemindersConfig.rules[type]?.enabled !== false,
    label,
    message: label,
    compactMessage: label,
    intervalMinutes,
    createdAt: smartRemindersConfig.rules[type]?.createdAt || Date.now()
  });
  smartRemindersConfig = normalizeSmartRemindersConfig(smartRemindersConfig);
  smartRemindersRuntime = normalizeSmartRemindersRuntime(smartRemindersRuntime, smartRemindersConfig);
  if (!smartRemindersRuntime.byType[type]) {
    smartRemindersRuntime.byType[type] = createDefaultSmartReminderRuntimeItem(Date.now());
  }
  smartReminderEditingType = '';
  await persistSmartRemindersConfig();
  await persistSmartRemindersRuntime();
  renderSmartReminderUI();
  await runSmartReminderEngine();
}

async function deleteSmartReminderRule(type) {
  if (!smartRemindersConfig.rules[type]) return;
  delete smartRemindersConfig.rules[type];
  if (SMART_REMINDER_DEFAULT_TYPES.includes(type)) {
    smartRemindersConfig.deletedRuleTypes = [...new Set([...(smartRemindersConfig.deletedRuleTypes || []), type])];
  }
  delete smartRemindersRuntime.byType[type];
  if (smartRemindersRuntime.activeReminderId === type) {
    smartRemindersRuntime.activeReminderId = '';
  }
  smartRemindersRuntime.deferredReminderIds = smartRemindersRuntime.deferredReminderIds.filter((item) => item !== type);
  if (smartReminderEditingType === type) {
    smartReminderEditingType = '';
  }
  smartRemindersConfig = normalizeSmartRemindersConfig(smartRemindersConfig);
  smartRemindersRuntime = normalizeSmartRemindersRuntime(smartRemindersRuntime, smartRemindersConfig);
  await persistSmartRemindersConfig();
  await persistSmartRemindersRuntime();
  renderSmartReminderUI();
  await runSmartReminderEngine();
}

async function updateSmartReminderWorkHours(patch) {
  smartRemindersConfig = normalizeSmartRemindersConfig({
    ...smartRemindersConfig,
    ...patch
  });
  await persistSmartRemindersConfig();
  renderSmartReminderUI();
  await runSmartReminderEngine();
}

function isSmartReminderSuppressTodayChecked(type, scope = document) {
  const cardCheckbox = scope.querySelector?.('#smart-reminder-suppress-today');
  const inlineCheckbox = scope.querySelector?.(`[data-reminder-suppress-today="${type}"]`);
  return Boolean(cardCheckbox?.checked || inlineCheckbox?.checked);
}

async function markSmartReminderDone(type, { suppressToday = false } = {}) {
  if (!getSmartReminderTypes().includes(type)) return;
  const runtimeItem = getSmartReminderRuntimeItem(type);
  const now = Date.now();
  runtimeItem.lastDoneAt = now;
  runtimeItem.lastShownAt = now;
  runtimeItem.snoozedUntil = suppressToday ? getNextLocalDayStartTimestamp(new Date(now)) : null;
  runtimeItem.forcedDueAt = null;
  runtimeItem.doneCountToday = (runtimeItem.doneCountToday || 0) + 1;
  removeDeferredSmartReminder(type);
  clearActiveSmartReminder();
  await persistSmartRemindersRuntime();
  await runSmartReminderEngine();
}

async function triggerSmartReminder(type) {
  if (!getSmartReminderTypes().includes(type) || !smartRemindersConfig.rules[type]?.enabled) return;
  getSmartReminderRuntimeItem(type).forcedDueAt = Date.now();
  await persistSmartRemindersRuntime();
  await runSmartReminderEngine();
}

async function handleTimerAwareSmartReminders({ completedFully = false, plannedMinutes = 0 } = {}) {
  if (completedFully && focusTimerStats.focusSessionsCompletedToday > 0 && focusTimerStats.focusSessionsCompletedToday % 2 === 0) {
    await triggerSmartReminder('standing');
  }

  if (plannedMinutes >= 50) {
    await triggerSmartReminder('eye_break');
  }
}

function syncFocusContextInput() {
  const input = document.getElementById('focus-context-input');
  if (!input) return;
  if (document.activeElement !== input) {
    input.value = focusTimerRuntime.contextText || '';
  }
}

function syncTimerCustomInput() {
  const input = document.getElementById('timer-custom-input');
  if (!input) return;
  if (document.activeElement !== input) {
    input.value = String(focusTimerRuntime.customDurationMinutes);
  }
}

function renderFocusTaskSuggestions(forceOpen = false) {
  const input = document.getElementById('focus-context-input');
  const suggestionsEl = document.getElementById('focus-task-suggestions');
  if (!input || !suggestionsEl) return;

  const query = normalizeComparableText(input.value);
  const suggestionTasks = tasks
    .filter((task) => task && !task.done)
    .filter((task) => !query || normalizeComparableText(task.text).includes(query))
    .slice(0, 5);

  const shouldShow = (forceOpen || document.activeElement === input) && suggestionTasks.length > 0;
  if (!shouldShow) {
    suggestionsEl.hidden = true;
    suggestionsEl.innerHTML = '';
    return;
  }

  suggestionsEl.hidden = false;
  suggestionsEl.innerHTML = suggestionTasks.map((task) => `
    <button type="button" class="focus-task-suggestion" data-task-id="${escHtml(task.id)}" data-task-title="${escHtml(task.text)}">
      <strong>${escHtml(task.text)}</strong>
      <span class="focus-task-suggestion-meta">${task.pinned ? 'Ưu tiên' : 'Hôm nay'}</span>
    </button>
  `).join('');
}

function hideFocusTaskSuggestionsSoon() {
  clearTimeout(focusTaskSuggestionHideTimer);
  focusTaskSuggestionHideTimer = setTimeout(() => renderFocusTaskSuggestions(false), 120);
}

function updateFocusLinkedTaskFromText(text) {
  const normalized = normalizeComparableText(text);
  const matchedTask = tasks.find((task) => !task.done && normalizeComparableText(task.text) === normalized);
  if (matchedTask) {
    focusTimerRuntime.linkedTaskId = matchedTask.id;
    focusTimerRuntime.linkedTaskTitle = matchedTask.text;
    return;
  }

  if (normalized !== normalizeComparableText(focusTimerRuntime.linkedTaskTitle || '')) {
    focusTimerRuntime.linkedTaskId = '';
    focusTimerRuntime.linkedTaskTitle = '';
  }
}

function renderFocusTimerStats() {
  document.getElementById('pomodoro-count').textContent = formatFocusMinutes(focusTimerStats.focusMinutesToday);
  const completed = focusTimerStats.focusSessionsCompletedToday;
  const cycleCount = completed % LONG_BREAK_INTERVAL || (completed > 0 && completed % LONG_BREAK_INTERVAL === 0 ? LONG_BREAK_INTERVAL : 0);
  for (let i = 1; i <= LONG_BREAK_INTERVAL; i++) {
    document.getElementById(`sd${i}`).classList.toggle('done', i <= cycleCount);
  }
}

function renderFocusTimer() {
  const now = Date.now();
  const card = document.getElementById('focus-timer-card');
  const display = document.getElementById('timer-display');
  const ring = document.getElementById('timer-ring');
  const primary = document.getElementById('btn-timer-primary');
  const resetBtn = document.getElementById('btn-timer-reset');
  const secondaryRow = document.getElementById('timer-actions-secondary');
  const secondaryBtn = document.getElementById('btn-timer-secondary');
  const tertiaryBtn = document.getElementById('btn-timer-tertiary');
  const postSession = document.getElementById('timer-post-session');
  const postBreakBtn = document.getElementById('btn-timer-start-break');
  const statePill = document.getElementById('timer-state-pill');
  const contextLabel = document.getElementById('timer-context-label');
  const supportingText = document.getElementById('timer-supporting-text');
  const presetRow = document.getElementById('timer-preset-row');
  const customWrap = document.getElementById('timer-custom-wrap');
  const autoBreakToggle = document.getElementById('timer-autobreak-toggle');
  const customPresetBtn = presetRow?.querySelector('[data-preset="custom"]');

  syncFocusContextInput();
  syncTimerCustomInput();
  document.querySelectorAll('.timer-mode-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === focusTimerRuntime.mode);
  });
  document.querySelectorAll('.timer-preset-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.preset === focusTimerRuntime.selectedPresetKey);
  });

  const displaySeconds = getTimerDisplaySeconds(now);
  const isNearEnd = isCountdownMode() && isFocusState() && displaySeconds > 0 && displaySeconds <= NEAR_END_SECONDS;
  const onBreak = isBreakState();
  const paused = isPausedState();
  const completed = isCompletedState();

  card.classList.toggle('is-near-end', isNearEnd);
  card.classList.toggle('is-break', onBreak);
  card.classList.toggle('is-paused', paused);
  card.classList.toggle('is-complete', completed);

  display.textContent = formatTimerDisplay(displaySeconds);

  if (isCountdownMode()) {
    const total = getCurrentDurationSeconds();
    const remaining = Math.max(0, Math.min(displaySeconds, total));
    const progress = 1 - (remaining / total);
    ring.style.strokeDashoffset = CIRCUMFERENCE * (1 - progress);
  } else {
    ring.style.strokeDashoffset = 0;
  }

  presetRow.hidden = !isCountdownMode();
  customWrap.hidden = !(isCountdownMode() && focusTimerRuntime.selectedPresetKey === 'custom');
  if (customPresetBtn) {
    customPresetBtn.hidden = isCountdownMode() && focusTimerRuntime.selectedPresetKey === 'custom';
  }
  autoBreakToggle.checked = focusTimerRuntime.isAutoBreakEnabled;

  let pillText = '';
  if (focusTimerRuntime.currentState === TIMER_STATES.RUNNING_FOCUS) pillText = isCountdownMode() && isNearEnd ? 'Sắp hết giờ' : (isCountdownMode() ? 'Đang tập trung' : 'Đang bấm giờ');
  if (focusTimerRuntime.currentState === TIMER_STATES.PAUSED_FOCUS) pillText = 'Tạm dừng';
  if (focusTimerRuntime.currentState === TIMER_STATES.COMPLETED_FOCUS) pillText = 'Xong phiên';
  if (focusTimerRuntime.currentState === TIMER_STATES.RUNNING_BREAK) pillText = 'Đang nghỉ';
  if (focusTimerRuntime.currentState === TIMER_STATES.PAUSED_BREAK) pillText = 'Nghỉ tạm dừng';
  if (focusTimerRuntime.currentState === TIMER_STATES.COMPLETED_BREAK) pillText = 'Sẵn sàng quay lại';

  statePill.hidden = !pillText;
  statePill.textContent = pillText;

  const contextText = focusTimerRuntime.contextText.trim();
  if (contextText) {
    let prefix = 'Phiên này:';
    if (focusTimerRuntime.currentState === TIMER_STATES.RUNNING_FOCUS) prefix = 'Đang làm:';
    if (focusTimerRuntime.currentState === TIMER_STATES.PAUSED_FOCUS) prefix = 'Đã tạm dừng:';
    if (focusTimerRuntime.currentState === TIMER_STATES.COMPLETED_FOCUS) prefix = 'Vừa xong:';
    if (focusTimerRuntime.currentState === TIMER_STATES.RUNNING_BREAK || focusTimerRuntime.currentState === TIMER_STATES.PAUSED_BREAK) prefix = 'Phiên trước:';
    if (focusTimerRuntime.currentState === TIMER_STATES.COMPLETED_BREAK) prefix = 'Sắp quay lại:';
    contextLabel.hidden = false;
    contextLabel.textContent = `${prefix} ${contextText}`;
  } else {
    contextLabel.hidden = true;
    contextLabel.textContent = '';
  }

  const previewBreakMinutes = focusTimerRuntime.breakDurationMinutes || SHORT_BREAK_MINUTES;
  let supportText = '';
  if (isCountdownMode()) {
    if (focusTimerRuntime.currentState === TIMER_STATES.IDLE) {
      supportText = currentLanguage === 'es' ? `Termina a las ${getPreviewEndTime()}` : currentLanguage === 'vi' ? `Xong lúc ${getPreviewEndTime()}` : `Finishes at ${getPreviewEndTime()}`;
    } else if (focusTimerRuntime.currentState === TIMER_STATES.RUNNING_FOCUS || focusTimerRuntime.currentState === TIMER_STATES.PAUSED_FOCUS) {
      supportText = currentLanguage === 'es' ? `Termina a las ${formatTimerClockTime((focusTimerRuntime.currentState === TIMER_STATES.RUNNING_FOCUS ? focusTimerRuntime.endsAt : Date.now() + displaySeconds * 1000))}` : currentLanguage === 'vi' ? `Xong lúc ${formatTimerClockTime((focusTimerRuntime.currentState === TIMER_STATES.RUNNING_FOCUS ? focusTimerRuntime.endsAt : Date.now() + displaySeconds * 1000))}` : `Finishes at ${formatTimerClockTime((focusTimerRuntime.currentState === TIMER_STATES.RUNNING_FOCUS ? focusTimerRuntime.endsAt : Date.now() + displaySeconds * 1000))}`;
    } else if (focusTimerRuntime.currentState === TIMER_STATES.RUNNING_BREAK || focusTimerRuntime.currentState === TIMER_STATES.PAUSED_BREAK) {
      supportText = `Quay lại lúc ${formatTimerClockTime((focusTimerRuntime.currentState === TIMER_STATES.RUNNING_BREAK ? focusTimerRuntime.endsAt : Date.now() + displaySeconds * 1000))}`;
    } else if (focusTimerRuntime.currentState === TIMER_STATES.COMPLETED_FOCUS) {
      supportText = focusTimerRuntime.isAutoBreakEnabled && focusTimerRuntime.lastSessionSummary?.completedFully
        ? `Tự vào nghỉ ${previewBreakMinutes} phút ngay sau đây`
        : `Bắt đầu nghỉ ${previewBreakMinutes} phút hoặc quay lại khi sẵn sàng`;
    } else if (focusTimerRuntime.currentState === TIMER_STATES.COMPLETED_BREAK) {
      supportText = 'Bạn có thể bắt đầu phiên mới bất cứ lúc nào';
    }
  } else {
    if (focusTimerRuntime.currentState === TIMER_STATES.IDLE) supportText = currentLanguage === 'es' ? 'Cronómetro flexible para cuando necesitas empezar' : currentLanguage === 'vi' ? 'Bấm giờ linh hoạt cho khi bạn cần bắt tay vào việc' : 'Flexible stopwatch for when you need to get started';
    if (focusTimerRuntime.currentState === TIMER_STATES.RUNNING_FOCUS) supportText = 'Theo dõi thời gian đã tập trung';
    if (focusTimerRuntime.currentState === TIMER_STATES.PAUSED_FOCUS) supportText = 'Tiếp tục khi bạn sẵn sàng';
    if (focusTimerRuntime.currentState === TIMER_STATES.COMPLETED_FOCUS) supportText = 'Bạn có thể lưu note nhanh trước khi bắt đầu lại';
  }
  supportingText.textContent = supportText;

  primary.hidden = false;
  primary.classList.remove('is-muted');
  resetBtn.hidden = false;
  secondaryRow.hidden = true;
  secondaryBtn.hidden = true;
  tertiaryBtn.hidden = true;
  postSession.hidden = focusTimerRuntime.currentState !== TIMER_STATES.COMPLETED_FOCUS;
  document.getElementById('timer-note-editor').hidden = true;
  if (focusTimerRuntime.currentState === TIMER_STATES.COMPLETED_FOCUS) {
    postBreakBtn.textContent = `Bắt đầu nghỉ ${previewBreakMinutes} phút`;
  }

  if (focusTimerRuntime.currentState === TIMER_STATES.IDLE) {
    primary.textContent = 'Bắt đầu';
  } else if (focusTimerRuntime.currentState === TIMER_STATES.RUNNING_FOCUS) {
    primary.textContent = 'Tạm dừng';
    resetBtn.hidden = true;
    secondaryRow.hidden = false;
    if (isCountdownMode()) {
      secondaryBtn.hidden = false;
      secondaryBtn.textContent = '+5 phút';
    }
    tertiaryBtn.hidden = false;
    tertiaryBtn.textContent = isCountdownMode() ? 'Kết thúc sớm' : 'Kết thúc';
  } else if (focusTimerRuntime.currentState === TIMER_STATES.PAUSED_FOCUS) {
    primary.textContent = 'Tiếp tục';
    primary.classList.add('is-muted');
    secondaryRow.hidden = false;
    if (isCountdownMode()) {
      secondaryBtn.hidden = false;
      secondaryBtn.textContent = '+5 phút';
    }
    tertiaryBtn.hidden = false;
    tertiaryBtn.textContent = isCountdownMode() ? 'Kết thúc sớm' : 'Kết thúc';
  } else if (focusTimerRuntime.currentState === TIMER_STATES.COMPLETED_FOCUS) {
    primary.textContent = 'Bắt đầu lại';
  } else if (focusTimerRuntime.currentState === TIMER_STATES.RUNNING_BREAK) {
    primary.textContent = 'Bắt đầu lại';
    secondaryRow.hidden = false;
    secondaryBtn.hidden = false;
    secondaryBtn.textContent = 'Tạm dừng';
    tertiaryBtn.hidden = false;
    tertiaryBtn.textContent = 'Bỏ qua nghỉ';
    resetBtn.hidden = true;
  } else if (focusTimerRuntime.currentState === TIMER_STATES.PAUSED_BREAK) {
    primary.textContent = 'Tiếp tục nghỉ';
    primary.classList.add('is-muted');
    secondaryRow.hidden = false;
    secondaryBtn.hidden = false;
    secondaryBtn.textContent = 'Bắt đầu lại';
    tertiaryBtn.hidden = false;
    tertiaryBtn.textContent = 'Bỏ qua nghỉ';
  } else if (focusTimerRuntime.currentState === TIMER_STATES.COMPLETED_BREAK) {
    primary.textContent = 'Bắt đầu lại';
  }

  renderFocusTimerStats();
  renderSmartReminderSurfaces();
  updateTimerTopBar();
}

function reconcileFocusTimerAfterLoad() {
  const now = Date.now();
  if (focusTimerRuntime.currentState === TIMER_STATES.RUNNING_FOCUS && isCountdownMode() && focusTimerRuntime.endsAt && focusTimerRuntime.endsAt <= now) {
    completeFocusTimerFromClock(true);
    return;
  }

  if (focusTimerRuntime.currentState === TIMER_STATES.RUNNING_BREAK && focusTimerRuntime.endsAt && focusTimerRuntime.endsAt <= now) {
    completeBreakTimerFromClock();
    return;
  }

  renderFocusTimer();
  ensureFocusTimerTicking();
}

async function loadTimer() {
  const data = await store.get([FOCUS_TIMER_RUNTIME_KEY, FOCUS_TIMER_STATS_KEY, 'pomodoro_today', 'pomodoro_date']);
  focusTimerRuntime = normalizeTimerRuntime(data[FOCUS_TIMER_RUNTIME_KEY]);
  focusTimerStats = normalizeTimerStats(data[FOCUS_TIMER_STATS_KEY], data.pomodoro_today, data.pomodoro_date);
  await ensureFocusTimerStatsCurrent();
  focusTimerRuntime.breakDurationMinutes = getNextBreakDurationMinutes(focusTimerStats.focusSessionsCompletedToday);
  reconcileFocusTimerAfterLoad();
}

function ensureFocusTimerTicking() {
  clearInterval(focusTimerInterval);
  focusTimerInterval = null;
  lastFocusTimerTickKey = '';
  if (!isRunningState()) return;
  focusTimerInterval = setInterval(() => tickFocusTimer(), 1000);
}

function tickFocusTimer() {
  const now = Date.now();
  const tickKey = `${focusTimerRuntime.currentState}:${getTimerDisplaySeconds(now)}`;
  if (tickKey === lastFocusTimerTickKey) return;
  lastFocusTimerTickKey = tickKey;

  if (isCountdownMode() && focusTimerRuntime.currentState === TIMER_STATES.RUNNING_FOCUS && getTimerDisplaySeconds(now) <= 0) {
    completeFocusTimerFromClock(true);
    return;
  }

  if (focusTimerRuntime.currentState === TIMER_STATES.RUNNING_BREAK && getTimerDisplaySeconds(now) <= 0) {
    completeBreakTimerFromClock();
    return;
  }

  renderFocusTimer();
}

async function resetTimerRuntimeToIdle({ keepContext = true } = {}) {
  clearFocusTimerAutoBreak();
  const contextText = keepContext ? focusTimerRuntime.contextText : '';
  const linkedTaskId = keepContext ? focusTimerRuntime.linkedTaskId : '';
  const linkedTaskTitle = keepContext ? focusTimerRuntime.linkedTaskTitle : '';
  const nextRuntime = createDefaultTimerRuntime();
  nextRuntime.mode = focusTimerRuntime.mode;
  nextRuntime.selectedDurationMinutes = focusTimerRuntime.selectedDurationMinutes;
  nextRuntime.selectedPresetKey = focusTimerRuntime.selectedPresetKey;
  nextRuntime.customDurationMinutes = focusTimerRuntime.customDurationMinutes;
  nextRuntime.isAutoBreakEnabled = focusTimerRuntime.isAutoBreakEnabled;
  nextRuntime.breakDurationMinutes = getNextBreakDurationMinutes(focusTimerStats.focusSessionsCompletedToday);
  nextRuntime.contextText = contextText;
  nextRuntime.linkedTaskId = linkedTaskId;
  nextRuntime.linkedTaskTitle = linkedTaskTitle;
  if (nextRuntime.mode === 'countdown') {
    nextRuntime.currentDurationSeconds = getSelectedDurationMinutes() * 60;
    nextRuntime.remainingSeconds = nextRuntime.currentDurationSeconds;
  }
  focusTimerRuntime = nextRuntime;
  await persistFocusTimerRuntime();
  renderFocusTimer();
  ensureFocusTimerTicking();
  await runSmartReminderEngine();
}

async function setTimerMode(mode) {
  if (isRunningState()) return;
  clearFocusTimerAutoBreak();
  focusTimerRuntime.mode = mode;
  focusTimerRuntime.currentState = TIMER_STATES.IDLE;
  focusTimerRuntime.startedAt = null;
  focusTimerRuntime.endsAt = null;
  focusTimerRuntime.pausedAt = null;
  focusTimerRuntime.elapsedSeconds = 0;
  if (mode === 'countdown') {
    focusTimerRuntime.selectedDurationMinutes = clampNumber(focusTimerRuntime.selectedDurationMinutes, 1, 180, 25);
    focusTimerRuntime.currentDurationSeconds = getSelectedDurationMinutes() * 60;
    focusTimerRuntime.remainingSeconds = focusTimerRuntime.currentDurationSeconds;
  } else {
    focusTimerRuntime.currentDurationSeconds = 0;
    focusTimerRuntime.remainingSeconds = 0;
  }
  focusTimerRuntime.lastSessionSummary = null;
  await persistFocusTimerRuntime();
  renderFocusTimer();
  ensureFocusTimerTicking();
}

async function setTimerPreset(presetKey) {
  if (!isCountdownMode() || isRunningState() || isPausedState() || focusTimerRuntime.currentState === TIMER_STATES.COMPLETED_FOCUS) return;
  focusTimerRuntime.selectedPresetKey = presetKey;
  focusTimerRuntime.selectedDurationMinutes = presetKey === 'custom'
    ? focusTimerRuntime.customDurationMinutes
    : clampNumber(presetKey, 1, 180, 25);
  focusTimerRuntime.currentDurationSeconds = getSelectedDurationMinutes() * 60;
  focusTimerRuntime.remainingSeconds = focusTimerRuntime.currentDurationSeconds;
  await persistFocusTimerRuntime();
  renderFocusTimer();
}

async function updateCustomTimerMinutes(rawValue) {
  const nextCustom = clampNumber(rawValue, 1, 180, focusTimerRuntime.customDurationMinutes);
  focusTimerRuntime.customDurationMinutes = nextCustom;
  if (focusTimerRuntime.selectedPresetKey === 'custom') {
    focusTimerRuntime.selectedDurationMinutes = nextCustom;
    if (!isRunningState() && !isPausedState() && focusTimerRuntime.currentState !== TIMER_STATES.COMPLETED_FOCUS) {
      focusTimerRuntime.currentDurationSeconds = nextCustom * 60;
      focusTimerRuntime.remainingSeconds = focusTimerRuntime.currentDurationSeconds;
    }
  }
  await persistFocusTimerRuntime();
  renderFocusTimer();
}

async function updateFocusTimerContext(text) {
  focusTimerRuntime.contextText = String(text || '');
  updateFocusLinkedTaskFromText(focusTimerRuntime.contextText);
  await persistFocusTimerRuntime();
  renderFocusTimer();
}

async function setAutoBreakEnabled(enabled) {
  focusTimerRuntime.isAutoBreakEnabled = Boolean(enabled);
  await persistFocusTimerRuntime();
  renderFocusTimer();
}

async function startFocusTimer() {
  await ensureFocusTimerStatsCurrent();
  clearFocusTimerAutoBreak();
  focusTimerRuntime.lastSessionSummary = null;
  focusTimerRuntime.lastCompletedAt = null;
  focusTimerRuntime.breakDurationMinutes = getNextBreakDurationMinutes(focusTimerStats.focusSessionsCompletedToday);
  if (isCountdownMode()) {
    const durationSeconds = getSelectedDurationMinutes() * 60;
    focusTimerRuntime.currentState = TIMER_STATES.RUNNING_FOCUS;
    focusTimerRuntime.currentDurationSeconds = durationSeconds;
    focusTimerRuntime.remainingSeconds = durationSeconds;
    focusTimerRuntime.startedAt = Date.now();
    focusTimerRuntime.endsAt = Date.now() + durationSeconds * 1000;
    focusTimerRuntime.pausedAt = null;
    focusTimerRuntime.elapsedSeconds = 0;
  } else {
    focusTimerRuntime.currentState = TIMER_STATES.RUNNING_FOCUS;
    focusTimerRuntime.startedAt = Date.now();
    focusTimerRuntime.pausedAt = null;
    focusTimerRuntime.endsAt = null;
    focusTimerRuntime.elapsedSeconds = 0;
    focusTimerRuntime.currentDurationSeconds = 0;
    focusTimerRuntime.remainingSeconds = 0;
  }
  await persistFocusTimerRuntime();
  renderFocusTimer();
  ensureFocusTimerTicking();
  await runSmartReminderEngine();
}

async function pauseCurrentTimer() {
  clearFocusTimerAutoBreak();
  if (focusTimerRuntime.currentState === TIMER_STATES.RUNNING_FOCUS) {
    if (isCountdownMode()) {
      focusTimerRuntime.remainingSeconds = getTimerDisplaySeconds();
      focusTimerRuntime.endsAt = null;
    } else {
      focusTimerRuntime.elapsedSeconds = getTimerDisplaySeconds();
    }
    focusTimerRuntime.startedAt = null;
    focusTimerRuntime.pausedAt = Date.now();
    focusTimerRuntime.currentState = TIMER_STATES.PAUSED_FOCUS;
  } else if (focusTimerRuntime.currentState === TIMER_STATES.RUNNING_BREAK) {
    focusTimerRuntime.remainingSeconds = getTimerDisplaySeconds();
    focusTimerRuntime.startedAt = null;
    focusTimerRuntime.endsAt = null;
    focusTimerRuntime.pausedAt = Date.now();
    focusTimerRuntime.currentState = TIMER_STATES.PAUSED_BREAK;
  }
  await persistFocusTimerRuntime();
  renderFocusTimer();
  ensureFocusTimerTicking();
  await runSmartReminderEngine();
}

async function resumeCurrentTimer() {
  clearFocusTimerAutoBreak();
  if (focusTimerRuntime.currentState === TIMER_STATES.PAUSED_FOCUS) {
    focusTimerRuntime.currentState = TIMER_STATES.RUNNING_FOCUS;
    focusTimerRuntime.startedAt = Date.now();
    focusTimerRuntime.pausedAt = null;
    if (isCountdownMode()) {
      focusTimerRuntime.endsAt = Date.now() + focusTimerRuntime.remainingSeconds * 1000;
    }
  } else if (focusTimerRuntime.currentState === TIMER_STATES.PAUSED_BREAK) {
    focusTimerRuntime.currentState = TIMER_STATES.RUNNING_BREAK;
    focusTimerRuntime.startedAt = Date.now();
    focusTimerRuntime.pausedAt = null;
    focusTimerRuntime.endsAt = Date.now() + focusTimerRuntime.remainingSeconds * 1000;
  }
  await persistFocusTimerRuntime();
  renderFocusTimer();
  ensureFocusTimerTicking();
  await runSmartReminderEngine();
}

async function addFiveMinutesToFocus() {
  if (!isCountdownMode()) return;
  if (!(focusTimerRuntime.currentState === TIMER_STATES.RUNNING_FOCUS || focusTimerRuntime.currentState === TIMER_STATES.PAUSED_FOCUS)) return;
  focusTimerRuntime.currentDurationSeconds += 5 * 60;
  focusTimerRuntime.remainingSeconds = getTimerDisplaySeconds() + 5 * 60;
  if (focusTimerRuntime.currentState === TIMER_STATES.RUNNING_FOCUS) {
    focusTimerRuntime.endsAt = Date.now() + focusTimerRuntime.remainingSeconds * 1000;
  }
  await persistFocusTimerRuntime();
  renderFocusTimer();
}

function getActualFocusSecondsForCurrentSession() {
  if (isCountdownMode()) {
    return Math.max(0, focusTimerRuntime.currentDurationSeconds - getTimerDisplaySeconds());
  }
  return getTimerDisplaySeconds();
}

function createCompletedSessionSummary({ actualSeconds, completedFully }) {
  return {
    mode: focusTimerRuntime.mode,
    contextText: focusTimerRuntime.contextText.trim(),
    linkedTaskId: focusTimerRuntime.linkedTaskId,
    linkedTaskTitle: focusTimerRuntime.linkedTaskTitle,
    actualMinutes: actualSeconds > 0 ? Math.max(1, Math.round(actualSeconds / 60)) : 0,
    actualSeconds,
    plannedMinutes: isCountdownMode() ? Math.round(focusTimerRuntime.currentDurationSeconds / 60) : null,
    completedFully,
    endedAt: Date.now(),
    breakDurationMinutes: focusTimerRuntime.breakDurationMinutes
  };
}

async function recordCompletedFocusSession({ actualSeconds, completedFully }) {
  await ensureFocusTimerStatsCurrent();
  const actualMinutes = actualSeconds > 0 ? Math.max(1, Math.round(actualSeconds / 60)) : 0;
  const summary = createCompletedSessionSummary({ actualSeconds, completedFully });
  const plannedMinutes = isCountdownMode() ? Math.round(focusTimerRuntime.currentDurationSeconds / 60) : 0;

  if (actualMinutes > 0) {
    focusTimerStats.focusMinutesToday += actualMinutes;
  }

  if (completedFully && isCountdownMode()) {
    focusTimerStats.focusSessionsCompletedToday += 1;
    focusTimerStats.completedCycleCountToday += 1;
  }

  if (actualMinutes > 0 || completedFully) {
    focusTimerStats.completedSessionsToday = [
      summary,
      ...focusTimerStats.completedSessionsToday
    ].slice(0, 20);
  }

  focusTimerRuntime.currentState = TIMER_STATES.COMPLETED_FOCUS;
  focusTimerRuntime.startedAt = null;
  focusTimerRuntime.endsAt = null;
  focusTimerRuntime.pausedAt = null;
  focusTimerRuntime.elapsedSeconds = isCountdownMode() ? 0 : actualSeconds;
  focusTimerRuntime.remainingSeconds = 0;
  focusTimerRuntime.lastCompletedAt = Date.now();
  focusTimerRuntime.lastSessionSummary = summary;
  focusTimerRuntime.breakDurationMinutes = completedFully
    ? getNextBreakDurationMinutes(focusTimerStats.focusSessionsCompletedToday)
    : SHORT_BREAK_MINUTES;

  await Promise.all([persistFocusTimerStats(), persistFocusTimerRuntime()]);
  renderFocusTimer();
  ensureFocusTimerTicking();

  if (completedFully && isCountdownMode()) {
    showPomodoroToast(focusTimerStats.focusSessionsCompletedToday, Math.round(focusTimerRuntime.currentDurationSeconds / 60));
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Offiqa', {
        body: `🎉 Xong ${Math.round(focusTimerRuntime.currentDurationSeconds / 60)} phút tập trung.`,
        icon: '../icons/icon48.png'
      });
    }
  }

  if (completedFully && isCountdownMode()) {
    playGentleTimerChime();
  }

  if (completedFully && focusTimerRuntime.isAutoBreakEnabled && isCountdownMode()) {
    clearFocusTimerAutoBreak();
    focusTimerAutoBreakTimer = setTimeout(() => {
      if (focusTimerRuntime.currentState === TIMER_STATES.COMPLETED_FOCUS && focusTimerRuntime.isAutoBreakEnabled) {
        startBreakTimer(focusTimerRuntime.breakDurationMinutes);
      }
    }, AUTO_BREAK_DELAY_MS);
  }

  await handleTimerAwareSmartReminders({ completedFully, plannedMinutes });
  await runSmartReminderEngine();
}

async function completeFocusTimerFromClock(completedFully) {
  const actualSeconds = completedFully && isCountdownMode()
    ? focusTimerRuntime.currentDurationSeconds
    : getActualFocusSecondsForCurrentSession();
  await recordCompletedFocusSession({ actualSeconds, completedFully });
}

async function completeBreakTimerFromClock() {
  clearFocusTimerAutoBreak();
  focusTimerRuntime.currentState = TIMER_STATES.COMPLETED_BREAK;
  focusTimerRuntime.startedAt = null;
  focusTimerRuntime.endsAt = null;
  focusTimerRuntime.pausedAt = null;
  focusTimerRuntime.remainingSeconds = 0;
  await persistFocusTimerRuntime();
  renderFocusTimer();
  ensureFocusTimerTicking();
  await runSmartReminderEngine();
}

async function startBreakTimer(durationMinutes = SHORT_BREAK_MINUTES) {
  clearFocusTimerAutoBreak();
  const now = Date.now();
  if (smartRemindersRuntime.activeReminderId === 'standing') {
    smartRemindersRuntime.byType.standing.snoozedUntil = now + SHORT_BREAK_MINUTES * 60000;
    smartRemindersRuntime.byType.standing.lastShownAt = now;
    clearActiveSmartReminder();
    removeDeferredSmartReminder('standing');
    await persistSmartRemindersRuntime();
  }
  const breakMinutes = clampNumber(durationMinutes, SHORT_BREAK_MINUTES, LONG_BREAK_MINUTES, SHORT_BREAK_MINUTES);
  const totalSeconds = breakMinutes * 60;
  focusTimerRuntime.breakDurationMinutes = breakMinutes;
  focusTimerRuntime.currentState = TIMER_STATES.RUNNING_BREAK;
  focusTimerRuntime.currentDurationSeconds = totalSeconds;
  focusTimerRuntime.remainingSeconds = totalSeconds;
  focusTimerRuntime.startedAt = Date.now();
  focusTimerRuntime.endsAt = Date.now() + totalSeconds * 1000;
  focusTimerRuntime.pausedAt = null;
  await persistFocusTimerRuntime();
  renderFocusTimer();
  ensureFocusTimerTicking();
  await triggerSmartReminder('water');
}

async function finishCurrentSessionEarly() {
  clearFocusTimerAutoBreak();
  await completeFocusTimerFromClock(false);
}

async function skipBreakTimer() {
  await resetTimerRuntimeToIdle({ keepContext: true });
}

async function restartFocusTimerSession() {
  clearFocusTimerAutoBreak();
  if (focusTimerRuntime.currentState === TIMER_STATES.RUNNING_BREAK
    || focusTimerRuntime.currentState === TIMER_STATES.PAUSED_BREAK
    || focusTimerRuntime.currentState === TIMER_STATES.COMPLETED_BREAK) {
    await resetTimerRuntimeToIdle({ keepContext: true });
    return startFocusTimer();
  }

  await resetTimerRuntimeToIdle({ keepContext: true });
  return startFocusTimer();
}

async function completeLinkedTaskIfPossible() {
  if (!focusTimerRuntime.linkedTaskId) return;
  const taskIndex = tasks.findIndex((task) => task.id === focusTimerRuntime.linkedTaskId);
  if (taskIndex === -1) return;
  tasks[taskIndex].done = true;
  tasks[taskIndex].updatedAt = Date.now();
  tasks[taskIndex].completedAt = tasks[taskIndex].updatedAt;
  await persistTaskState();
  focusTimerRuntime.linkedTaskId = '';
}

async function markFocusSessionDone() {
  clearFocusTimerAutoBreak();
  await completeLinkedTaskIfPossible();
  await resetTimerRuntimeToIdle({ keepContext: true });
}

async function saveTimerSessionNote() {
  const input = document.getElementById('timer-note-input');
  const text = input.value.trim();
  if (!text) return;
  const context = focusTimerRuntime.lastSessionSummary?.contextText || focusTimerRuntime.contextText.trim();
  const noteText = context ? `[Focus] ${context} — ${text}` : text;
  const data = await store.get(['memories']);
  const memories = data.memories || [];
  memories.unshift({
    id: Date.now().toString(),
    type: 'note',
    text: noteText,
    due: '',
    created: Date.now()
  });
  await store.set({ memories });
  renderHomeMemories(memories);
  input.value = '';
  document.getElementById('timer-note-editor').hidden = true;
}

function openTimerNoteEditor() {
  clearFocusTimerAutoBreak();
  const editor = document.getElementById('timer-note-editor');
  editor.hidden = false;
  document.getElementById('timer-note-input').focus();
}

function closeTimerNoteEditor() {
  const editor = document.getElementById('timer-note-editor');
  editor.hidden = true;
  document.getElementById('timer-note-input').value = '';
}

function playGentleTimerChime() {
  try {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;
    const audioCtx = new AudioContextCtor();
    const oscillator = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(660, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.22);
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.035, audioCtx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.5);
    oscillator.connect(gain);
    gain.connect(audioCtx.destination);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.52);
    oscillator.onended = () => audioCtx.close().catch(() => {});
  } catch {}
}

document.querySelectorAll('.timer-mode-btn').forEach((btn) => {
  btn.addEventListener('click', () => setTimerMode(btn.dataset.mode));
});

document.querySelectorAll('.timer-preset-btn').forEach((btn) => {
  btn.addEventListener('click', () => setTimerPreset(btn.dataset.preset));
});

document.getElementById('timer-custom-input').addEventListener('input', (e) => {
  updateCustomTimerMinutes(e.target.value);
});

document.getElementById('timer-autobreak-toggle').addEventListener('change', (e) => {
  setAutoBreakEnabled(e.target.checked);
});

document.getElementById('focus-context-input').addEventListener('input', (e) => {
  updateFocusTimerContext(e.target.value);
  renderFocusTaskSuggestions(true);
});

document.getElementById('focus-context-input').addEventListener('focus', () => {
  clearTimeout(focusTaskSuggestionHideTimer);
  renderFocusTaskSuggestions(true);
});

document.getElementById('focus-context-input').addEventListener('blur', hideFocusTaskSuggestionsSoon);

document.getElementById('focus-task-suggestions').addEventListener('mousedown', (e) => {
  const button = e.target.closest('.focus-task-suggestion[data-task-id]');
  if (!button) return;
  e.preventDefault();
});

document.getElementById('focus-task-suggestions').addEventListener('click', async (e) => {
  const button = e.target.closest('.focus-task-suggestion[data-task-id]');
  if (!button) return;
  focusTimerRuntime.contextText = button.dataset.taskTitle || '';
  focusTimerRuntime.linkedTaskId = button.dataset.taskId || '';
  focusTimerRuntime.linkedTaskTitle = button.dataset.taskTitle || '';
  await persistFocusTimerRuntime();
  renderFocusTimer();
  renderFocusTaskSuggestions(false);
});

document.getElementById('btn-timer-primary').addEventListener('click', async () => {
  const state = focusTimerRuntime.currentState;
  if (state === TIMER_STATES.IDLE) return startFocusTimer();
  if (state === TIMER_STATES.RUNNING_FOCUS || state === TIMER_STATES.RUNNING_BREAK) return pauseCurrentTimer();
  if (state === TIMER_STATES.PAUSED_FOCUS || state === TIMER_STATES.PAUSED_BREAK) return resumeCurrentTimer();
  if (state === TIMER_STATES.COMPLETED_FOCUS || state === TIMER_STATES.COMPLETED_BREAK) return restartFocusTimerSession();
});

document.getElementById('btn-timer-secondary').addEventListener('click', async () => {
  const label = document.getElementById('btn-timer-secondary').textContent;
  if (label === '+5 phút') return addFiveMinutesToFocus();
  if (label === 'Tạm dừng') return pauseCurrentTimer();
  if (label === 'Bắt đầu lại') return restartFocusTimerSession();
});

document.getElementById('btn-timer-tertiary').addEventListener('click', async () => {
  const label = document.getElementById('btn-timer-tertiary').textContent;
  if (label === 'Bỏ qua nghỉ') return skipBreakTimer();
  return finishCurrentSessionEarly();
});

document.getElementById('btn-timer-reset').addEventListener('click', () => {
  resetTimerRuntimeToIdle({ keepContext: true });
});

document.getElementById('btn-timer-complete-task').addEventListener('click', () => {
  markFocusSessionDone();
});

document.getElementById('btn-timer-open-note').addEventListener('click', () => {
  openTimerNoteEditor();
});

document.getElementById('btn-timer-start-break').addEventListener('click', () => {
  startBreakTimer(focusTimerRuntime.breakDurationMinutes || SHORT_BREAK_MINUTES);
});

document.getElementById('btn-timer-save-note').addEventListener('click', () => {
  saveTimerSessionNote();
});

document.getElementById('btn-timer-cancel-note').addEventListener('click', () => {
  closeTimerNoteEditor();
});

document.getElementById('smart-reminder-toggle').addEventListener('click', () => {
  smartReminderPanelOpen = !smartReminderPanelOpen;
  renderSmartReminderUI();
});

document.getElementById('smart-reminder-add').addEventListener('click', () => {
  smartReminderEditingType = createSmartReminderType();
  renderSmartReminderUI();
  document.getElementById('smart-reminder-name-input')?.focus();
});

document.getElementById('smart-reminder-cancel').addEventListener('click', () => {
  smartReminderEditingType = '';
  renderSmartReminderUI();
});

document.getElementById('smart-reminder-editor').addEventListener('submit', (e) => {
  e.preventDefault();
  saveSmartReminderFromEditor();
});

document.getElementById('smart-reminder-rules').addEventListener('click', (e) => {
  const actionTarget = e.target.closest('[data-action][data-reminder-type]');
  if (!actionTarget) return;
  const type = actionTarget.dataset.reminderType;
  if (actionTarget.dataset.action === 'edit-smart-reminder') {
    smartReminderEditingType = type;
    renderSmartReminderUI();
    document.getElementById('smart-reminder-name-input')?.focus();
    return;
  }
  if (actionTarget.dataset.action === 'delete-smart-reminder') {
    deleteSmartReminderRule(type);
  }
});

document.getElementById('smart-reminder-rules').addEventListener('change', (e) => {
  const actionTarget = e.target.closest('[data-action][data-reminder-type]');
  if (!actionTarget) return;
  const type = actionTarget.dataset.reminderType;
  if (actionTarget.dataset.action === 'toggle-smart-reminder') {
    updateSmartReminderRule(type, { enabled: actionTarget.checked });
    return;
  }
  if (actionTarget.dataset.action === 'update-smart-reminder-interval') {
    handleSmartReminderIntervalInput(type, actionTarget);
  }
});

document.getElementById('reminder-work-hours-only').addEventListener('change', (e) => {
  updateSmartReminderWorkHours({ workHoursOnly: e.target.checked });
});

document.getElementById('reminder-work-hours-start').addEventListener('change', (e) => {
  updateSmartReminderWorkHours({ workHoursStart: e.target.value || '08:30' });
});

document.getElementById('reminder-work-hours-end').addEventListener('change', (e) => {
  updateSmartReminderWorkHours({ workHoursEnd: e.target.value || '17:30' });
});

document.getElementById('smart-reminder-done').addEventListener('click', () => {
  const type = getActiveSmartReminderType();
  if (type) {
    markSmartReminderDone(type, {
      suppressToday: isSmartReminderSuppressTodayChecked(type)
    });
  }
});

document.getElementById('timer-post-reminder').addEventListener('click', (e) => {
  const actionTarget = e.target.closest('[data-reminder-action][data-reminder-type]');
  if (!actionTarget) return;
  const type = actionTarget.dataset.reminderType;
  if (actionTarget.dataset.reminderAction === 'done') {
    markSmartReminderDone(type, {
      suppressToday: isSmartReminderSuppressTodayChecked(type, document.getElementById('timer-post-reminder'))
    });
    return;
  }
});


// ===== POMODORO TOAST =====
let pomodoroToastTimer = null;

function showPomodoroToast(sessionCount, minutes) {
  const messages = currentLanguage === 'es'
    ? [
        `🎉 Sesión ${sessionCount} lista · ${minutes} min de enfoque`,
        `⚡ ${minutes} min de enfoque · Sesión ${sessionCount} completada`,
        `✅ Sesión ${sessionCount} lista. Tómate 5 min de descanso`,
        `🔥 ${sessionCount} sesiones hoy · Ya tomaste ritmo`,
      ]
    : currentLanguage === 'en'
      ? [
          `🎉 Session ${sessionCount} done · ${minutes} minutes focused`,
          `⚡ ${minutes} focused minutes · Session ${sessionCount} completed`,
          `✅ Session ${sessionCount} done. Take a 5 minute break`,
          `🔥 ${sessionCount} sessions today · You are in the groove`,
        ]
      : [
          `🎉 Xong phiên ${sessionCount} · ${minutes} phút tập trung`,
          `⚡ ${minutes} phút tập trung · Phiên ${sessionCount} hoàn thành`,
          `✅ Phiên ${sessionCount} done! Nghỉ 5 phút nhé`,
          `🔥 ${sessionCount} phiên hôm nay · Đang vào guồng rồi!`,
        ];
  const msg = sessionCount >= 4
    ? currentLanguage === 'es'
      ? `🏆 ${sessionCount} sesiones. Productividad top hoy`
      : currentLanguage === 'en'
        ? `🏆 ${sessionCount} sessions. Peak productivity today`
        : `🏆 ${sessionCount} phiên! Năng suất đỉnh hôm nay`
    : messages[(sessionCount - 1) % messages.length];

  let toast = document.getElementById('pomodoro-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'pomodoro-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = 'pomodoro-toast show';
  clearTimeout(pomodoroToastTimer);
  pomodoroToastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 4000);
}

// ===== TIMER TOP BAR =====
function updateTimerTopBar() {
  const bar = document.getElementById('timer-top-bar');
  if (!bar) return;
  const runningCountdown = isCountdownMode() && (
    focusTimerRuntime.currentState === TIMER_STATES.RUNNING_FOCUS
    || focusTimerRuntime.currentState === TIMER_STATES.RUNNING_BREAK
  );
  if (!runningCountdown) {
    bar.hidden = true;
    bar.classList.remove('is-break', 'is-near-end');
    return;
  }
  bar.hidden = false;
  const pct = (getTimerDisplaySeconds() / getCurrentDurationSeconds()) * 100;
  bar.classList.toggle('is-break', isBreakState());
  bar.classList.toggle('is-near-end', !isBreakState() && isFocusState() && getTimerDisplaySeconds() <= NEAR_END_SECONDS);
  bar.innerHTML = `<div class="timer-top-bar-fill" style="width:${pct}%"></div>`;
}


window.offiqaNewtabFeatureInitializers = window.offiqaNewtabFeatureInitializers || {};
window.offiqaNewtabFeatureInitializers.timer = async () => {
  await loadTimer();
  await loadSmartReminders();
  await runSmartReminderEngine();
  ensureSmartReminderTicking();
};
