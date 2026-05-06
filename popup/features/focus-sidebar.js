// ===== FOCUS SIDEBAR =====
let focusSidebarTasks = [];
let focusSidebarCarryovers = [];
let focusSidebarGroupState = {};
const TASK_CARRYOVER_QUEUE_KEY = 'tasks_carryover_queue';

function normalizeFocusTaskDateKey(value) {
  const normalized = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
}

function normalizeFocusTaskRecord(raw, fallbackTimestamp = Date.now()) {
  const created = Number(raw?.created) || Number(raw?.createdAt) || Number(raw?.id) || fallbackTimestamp;
  const updatedAt = Number(raw?.updatedAt) || created;
  const done = Boolean(raw?.done);
  const completedAt = done
    ? (Number(raw?.completedAt) || updatedAt || created)
    : 0;

  return {
    id: String(raw?.id || created),
    text: String(raw?.text || '').trim(),
    done,
    pinned: Boolean(raw?.pinned),
    carriedOver: Boolean(raw?.carriedOver || raw?.carryOverFromDateKey),
    created,
    updatedAt,
    completedAt,
    source: raw?.source || '',
    meetingId: raw?.meetingId || '',
    taskDateKey: normalizeFocusTaskDateKey(raw?.taskDateKey),
    carryOverFromDateKey: normalizeFocusTaskDateKey(raw?.carryOverFromDateKey)
  };
}

function formatTaskSidebarTime(timestamp) {
  const ts = Number(timestamp);
  if (!ts) return '';
  return new Intl.DateTimeFormat(getPopupLanguageLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit'
  }).format(new Date(ts));
}

function parseLocalDateKey(dateKey) {
  const [year, month, day] = normalizeFocusTaskDateKey(dateKey).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function isCurrentFocusTaskDate(storedValue, date = new Date()) {
  const normalized = String(storedValue || '').trim();
  return normalized === getLocalDateKey(date) || normalized === date.toDateString();
}

function formatFocusSidebarDateLabel(dateKey) {
  const normalized = normalizeFocusTaskDateKey(dateKey);
  const date = parseLocalDateKey(normalized);
  if (!date) return dateKey;

  const today = getLocalDateKey(new Date());
  if (normalized === today) return 'Hôm nay';

  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  if (normalized === getLocalDateKey(yesterdayDate)) return 'Hôm qua';

  return new Intl.DateTimeFormat(getPopupLanguageLocale(), {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit'
  }).format(date);
}

function sortFocusTasksWithinDay(tasks) {
  return [
    ...tasks.filter((task) => task.pinned && !task.done),
    ...tasks.filter((task) => !task.pinned && !task.done),
    ...tasks.filter((task) => task.done)
  ];
}

function ensureFocusSidebarGroupState(dateKeys) {
  const todayKey = getLocalDateKey(new Date());
  const nextState = {};
  dateKeys.forEach((dateKey) => {
    nextState[dateKey] = Object.prototype.hasOwnProperty.call(focusSidebarGroupState, dateKey)
      ? focusSidebarGroupState[dateKey]
      : dateKey === todayKey;
  });
  focusSidebarGroupState = nextState;
}

function normalizeFocusSidebarCarryovers(rawTasks = []) {
  return rawTasks
    .map((task) => normalizeFocusTaskRecord(task))
    .filter((task) => task.text && !task.done)
    .map((task) => ({
      ...task,
      taskDateKey: '',
      carryOverFromDateKey: normalizeFocusTaskDateKey(task.carryOverFromDateKey)
        || normalizeFocusTaskDateKey(task.taskDateKey)
        || getLocalDateKey(new Date(task.created || Date.now())),
      carriedOver: false,
      completedAt: 0
    }));
}

function mergeFocusSidebarCarryovers(existingTasks = [], newTasks = []) {
  const merged = [];
  const seenIds = new Set();

  [...newTasks, ...existingTasks].forEach((task) => {
    if (!task?.text || task.done || seenIds.has(task.id)) return;
    seenIds.add(task.id);
    merged.push(task);
  });

  return merged;
}

function renderFocusSidebarTaskItem(task) {
  const taskIndex = focusSidebarTasks.indexOf(task);
  const tags = [];
  tags.push(`<span class="focus-sidebar-tag">Tạo ${escapeHtml(formatTaskSidebarTime(task.created))}</span>`);
  if (task.done && task.completedAt) {
    tags.push(`<span class="focus-sidebar-tag">Xong ${escapeHtml(formatTaskSidebarTime(task.completedAt))}</span>`);
  }
  if (task.pinned && !task.done) tags.push('<span class="focus-sidebar-tag priority">Ưu tiên</span>');
  if (task.carriedOver && !task.done) {
    tags.push(`<span class="focus-sidebar-tag">Từ ${escapeHtml(formatFocusSidebarDateLabel(task.carryOverFromDateKey))}</span>`);
  }

  return `
    <div class="focus-sidebar-item ${task.done ? 'is-done' : ''} ${task.pinned && !task.done ? 'is-pinned' : ''}">
      <div class="focus-sidebar-main">
        <input type="checkbox" class="focus-sidebar-check" data-action="toggle-focus-task" data-index="${taskIndex}" ${task.done ? 'checked' : ''}>
        <div>
          <div class="focus-sidebar-text">${escapeHtml(task.text || '')}</div>
          ${tags.length ? `<div class="focus-sidebar-meta">${tags.join('')}</div>` : ''}
        </div>
      </div>
      <div class="focus-sidebar-actions">
        <button type="button" class="focus-sidebar-icon-btn ${task.pinned ? 'is-active' : ''}" data-action="pin-focus-task" data-index="${taskIndex}" title="${task.pinned ? 'Bỏ ưu tiên' : 'Đánh dấu ưu tiên'}">${task.pinned ? '★' : '☆'}</button>
        <button type="button" class="focus-sidebar-icon-btn" data-action="delete-focus-task" data-index="${taskIndex}" title="Xóa task">×</button>
      </div>
    </div>
  `;
}

async function syncFocusSidebarTasksFromStore() {
  const today = new Date();
  const todayKey = getLocalDateKey(today);
  const data = await store.get(['tasks', 'tasks_date', TASK_CARRYOVER_QUEUE_KEY]);
  const rawTasks = Array.isArray(data.tasks) ? data.tasks : [];
  const rawCarryovers = Array.isArray(data[TASK_CARRYOVER_QUEUE_KEY]) ? data[TASK_CARRYOVER_QUEUE_KEY] : [];
  const normalizedCarryovers = normalizeFocusSidebarCarryovers(rawCarryovers);

  if (!isCurrentFocusTaskDate(data.tasks_date, today)) {
    const prevTasks = rawTasks
      .map((task) => normalizeFocusTaskRecord(task))
      .filter((task) => task.text && !task.done)
      .map((task) => ({
        ...task,
        taskDateKey: '',
        carryOverFromDateKey: normalizeFocusTaskDateKey(task.taskDateKey)
          || normalizeFocusTaskDateKey(task.carryOverFromDateKey)
          || getLocalDateKey(new Date(task.created || Date.now())),
        carriedOver: false,
        updatedAt: Date.now(),
        completedAt: 0
      }));

    focusSidebarTasks = [];
    focusSidebarCarryovers = mergeFocusSidebarCarryovers(normalizedCarryovers, prevTasks);
    await store.set({
      tasks: focusSidebarTasks,
      tasks_date: todayKey,
      [TASK_CARRYOVER_QUEUE_KEY]: focusSidebarCarryovers
    });
    return;
  }
  focusSidebarTasks = rawTasks
    .map((task) => normalizeFocusTaskRecord(task))
    .filter((task) => task.text)
    .map((task) => ({
      ...task,
      taskDateKey: todayKey
    }));
  focusSidebarCarryovers = normalizedCarryovers;

  if (
    data.tasks_date !== todayKey
    || JSON.stringify(rawTasks) !== JSON.stringify(focusSidebarTasks)
    || JSON.stringify(rawCarryovers) !== JSON.stringify(focusSidebarCarryovers)
  ) {
    await store.set({
      tasks: focusSidebarTasks,
      tasks_date: todayKey,
      [TASK_CARRYOVER_QUEUE_KEY]: focusSidebarCarryovers
    });
  }
}

async function persistFocusSidebarTaskState() {
  await store.set({
    tasks: focusSidebarTasks,
    tasks_date: getLocalDateKey(new Date()),
    [TASK_CARRYOVER_QUEUE_KEY]: focusSidebarCarryovers
  });
  renderFocusSidebar();
}

async function addFocusSidebarCarryoverTask(taskId) {
  const carryoverIndex = focusSidebarCarryovers.findIndex((task) => task.id === taskId);
  if (carryoverIndex === -1) return;

  const carryoverTask = focusSidebarCarryovers[carryoverIndex];
  focusSidebarCarryovers.splice(carryoverIndex, 1);

  const nextTask = {
    ...carryoverTask,
    done: false,
    carriedOver: true,
    taskDateKey: getLocalDateKey(new Date()),
    carryOverFromDateKey: normalizeFocusTaskDateKey(carryoverTask.carryOverFromDateKey)
      || getLocalDateKey(new Date(carryoverTask.created || Date.now())),
    updatedAt: Date.now(),
    completedAt: 0
  };

  const existingTaskIndex = focusSidebarTasks.findIndex((task) => task.id === nextTask.id);
  if (existingTaskIndex === -1) focusSidebarTasks.unshift(nextTask);
  else focusSidebarTasks[existingTaskIndex] = { ...focusSidebarTasks[existingTaskIndex], ...nextTask };

  await persistFocusSidebarTaskState();
}

async function dismissFocusSidebarCarryoverTask(taskId) {
  const nextCarryovers = focusSidebarCarryovers.filter((task) => task.id !== taskId);
  if (nextCarryovers.length === focusSidebarCarryovers.length) return;
  focusSidebarCarryovers = nextCarryovers;
  await persistFocusSidebarTaskState();
}

async function addAllFocusSidebarCarryovers() {
  const queue = [...focusSidebarCarryovers];
  for (const task of queue) {
    await addFocusSidebarCarryoverTask(task.id);
  }
}

async function dismissAllFocusSidebarCarryovers() {
  if (!focusSidebarCarryovers.length) return;
  focusSidebarCarryovers = [];
  await persistFocusSidebarTaskState();
}

function renderFocusSidebar() {
  const badge = document.getElementById('focus-sidebar-badge');
  const summary = document.getElementById('focus-sidebar-summary');
  const list = document.getElementById('focus-sidebar-list');
  if (!badge || !summary || !list) return;

  const remaining = focusSidebarTasks.filter((task) => !task.done).length;
  const done = focusSidebarTasks.filter((task) => task.done).length;
  const pinned = focusSidebarTasks.filter((task) => task.pinned && !task.done).length;
  const carryoverCount = focusSidebarCarryovers.length;

  badge.textContent = remaining === 0 && focusSidebarTasks.length > 0
    ? 'Xong hết'
    : pinned > 0
      ? `${pinned} ưu tiên`
      : focusSidebarTasks.length === 0 && carryoverCount > 0
        ? `Nhắc ${carryoverCount}`
        : `${remaining} còn lại`;

  summary.innerHTML = [
    `<span class="sidebar-summary-chip">${focusSidebarTasks.length} task</span>`,
    `<span class="sidebar-summary-chip">${remaining} đang làm</span>`,
    `<span class="sidebar-summary-chip">${done} đã xong</span>`,
    carryoverCount > 0 ? `<span class="sidebar-summary-chip">${carryoverCount} chờ chọn lại</span>` : ''
  ].filter(Boolean).join('');

  const renderCarryoverReview = () => {
    if (!focusSidebarCarryovers.length) return '';

    return `
      <section class="focus-sidebar-review">
        <div class="focus-sidebar-review-head">
          <div>
            <div class="focus-sidebar-review-title">Việc chưa xong từ ngày trước</div>
            <div class="focus-sidebar-review-desc">Thêm lại vào hôm nay nếu bạn muốn tiếp tục, hoặc bỏ qua để dọn gọn danh sách.</div>
          </div>
          <div class="focus-sidebar-review-bulk">
            <button type="button" class="focus-sidebar-review-btn" data-action="add-all-carryover-tasks">Thêm tất cả</button>
            <button type="button" class="focus-sidebar-review-btn is-ghost" data-action="dismiss-all-carryover-tasks">Bỏ qua hết</button>
          </div>
        </div>
        <div class="focus-sidebar-review-list">
          ${focusSidebarCarryovers.map((task) => `
            <div class="focus-sidebar-review-item">
              <div class="focus-sidebar-review-main">
                <div class="focus-sidebar-review-text">${escapeHtml(task.text || '')}</div>
                <div class="focus-sidebar-meta">
                  <span class="focus-sidebar-tag">Chưa xong từ ${escapeHtml(formatFocusSidebarDateLabel(task.carryOverFromDateKey))}</span>
                  ${task.pinned ? '<span class="focus-sidebar-tag priority">Ưu tiên cũ</span>' : ''}
                </div>
              </div>
              <div class="focus-sidebar-review-actions">
                <button type="button" class="focus-sidebar-review-btn" data-action="add-carryover-task" data-task-id="${escapeHtml(task.id)}">Thêm hôm nay</button>
                <button type="button" class="focus-sidebar-review-btn is-ghost" data-action="dismiss-carryover-task" data-task-id="${escapeHtml(task.id)}">Bỏ qua</button>
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  };

  if (!focusSidebarTasks.length && !carryoverCount) {
    list.className = 'scroll-area sidebar-panel-scroll';
    list.innerHTML = `<div class="sidebar-empty-state">${escapeHtml(popupUiText('focus.empty'))}</div>`;
    return;
  }

  if (!focusSidebarTasks.length) {
    list.className = 'scroll-area sidebar-panel-scroll focus-sidebar-groups';
    list.innerHTML = renderCarryoverReview();
    return;
  }

  const groupedTasks = focusSidebarTasks.reduce((acc, task) => {
    const dateKey = normalizeFocusTaskDateKey(task.taskDateKey) || getLocalDateKey(new Date());
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(task);
    return acc;
  }, {});

  const dateKeys = Object.keys(groupedTasks).sort((a, b) => b.localeCompare(a));
  ensureFocusSidebarGroupState(dateKeys);

  list.className = 'scroll-area sidebar-panel-scroll focus-sidebar-groups';
  list.innerHTML = [
    renderCarryoverReview(),
    ...dateKeys.map((dateKey) => {
      const tasksInGroup = sortFocusTasksWithinDay(groupedTasks[dateKey]);
      const isOpen = Boolean(focusSidebarGroupState[dateKey]);
      const remainingCount = tasksInGroup.filter((task) => !task.done).length;
      const doneCount = tasksInGroup.length - remainingCount;

      return `
        <section class="focus-sidebar-group ${isOpen ? 'is-open' : ''}" data-date-key="${dateKey}">
          <button
            type="button"
            class="focus-sidebar-group-toggle"
            data-action="toggle-focus-group"
            data-date-key="${dateKey}"
            aria-expanded="${isOpen ? 'true' : 'false'}"
          >
            <div class="focus-sidebar-group-heading">
              <span class="focus-sidebar-group-title">${escapeHtml(formatFocusSidebarDateLabel(dateKey))}</span>
              <span class="focus-sidebar-group-subtitle">${escapeHtml(dateKey)}</span>
            </div>
            <div class="focus-sidebar-group-summary">
              <span class="focus-sidebar-group-count">${tasksInGroup.length} task</span>
              <span class="focus-sidebar-group-meta">${remainingCount} đang làm${doneCount > 0 ? ` · ${doneCount} đã xong` : ''}</span>
              <span class="focus-sidebar-group-caret">${isOpen ? '▾' : '▸'}</span>
            </div>
          </button>
          <div class="focus-sidebar-group-body" ${isOpen ? '' : 'hidden'}>
            ${tasksInGroup.map((task) => renderFocusSidebarTaskItem(task)).join('')}
          </div>
        </section>
      `;
    })
  ].join('');
}

async function loadFocusSidebar() {
  await syncFocusSidebarTasksFromStore();
  renderFocusSidebar();
}

document.getElementById('focus-sidebar-add')?.addEventListener('click', async () => {
  const input = document.getElementById('focus-sidebar-input');
  const text = String(input?.value || '').trim();
  if (!text) return;
  const now = Date.now();
  focusSidebarTasks.push({
    id: now.toString(),
    text,
    done: false,
    created: now,
    updatedAt: now,
    completedAt: 0,
    taskDateKey: getLocalDateKey(new Date()),
    carryOverFromDateKey: ''
  });
  if (input) input.value = '';
  await persistFocusSidebarTaskState();
});

document.getElementById('focus-sidebar-input')?.addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  document.getElementById('focus-sidebar-add')?.click();
});

document.getElementById('focus-sidebar-list')?.addEventListener('click', async (e) => {
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  if (actionEl.dataset.action === 'toggle-focus-group') {
    const dateKey = actionEl.dataset.dateKey || '';
    if (!dateKey) return;
    focusSidebarGroupState[dateKey] = !focusSidebarGroupState[dateKey];
    renderFocusSidebar();
    return;
  }
  if (actionEl.dataset.action === 'add-carryover-task') {
    await addFocusSidebarCarryoverTask(actionEl.dataset.taskId || '');
    return;
  }
  if (actionEl.dataset.action === 'dismiss-carryover-task') {
    await dismissFocusSidebarCarryoverTask(actionEl.dataset.taskId || '');
    return;
  }
  if (actionEl.dataset.action === 'add-all-carryover-tasks') {
    await addAllFocusSidebarCarryovers();
    return;
  }
  if (actionEl.dataset.action === 'dismiss-all-carryover-tasks') {
    await dismissAllFocusSidebarCarryovers();
    return;
  }
  const taskIndex = Number(actionEl.dataset.index);
  if (Number.isNaN(taskIndex) || !focusSidebarTasks[taskIndex]) return;

  if (actionEl.dataset.action === 'pin-focus-task') {
    focusSidebarTasks[taskIndex].pinned = !focusSidebarTasks[taskIndex].pinned;
    focusSidebarTasks[taskIndex].updatedAt = Date.now();
    await persistFocusSidebarTaskState();
    return;
  }

  if (actionEl.dataset.action === 'delete-focus-task') {
    focusSidebarTasks.splice(taskIndex, 1);
    await persistFocusSidebarTaskState();
  }
});

document.getElementById('focus-sidebar-list')?.addEventListener('change', async (e) => {
  const checkbox = e.target.closest('[data-action="toggle-focus-task"]');
  if (!checkbox) return;
  const taskIndex = Number(checkbox.dataset.index);
  if (Number.isNaN(taskIndex) || !focusSidebarTasks[taskIndex]) return;
  focusSidebarTasks[taskIndex].done = checkbox.checked;
  focusSidebarTasks[taskIndex].updatedAt = Date.now();
  focusSidebarTasks[taskIndex].completedAt = checkbox.checked ? focusSidebarTasks[taskIndex].updatedAt : 0;
  await persistFocusSidebarTaskState();
});

if (chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (!changes.tasks && !changes.tasks_date && !changes[TASK_CARRYOVER_QUEUE_KEY]) return;
    const focusTodayTab = document.getElementById('tab-focus-today');
    if (!focusTodayTab?.classList.contains('active')) return;
    loadFocusSidebar();
  });
}

if (chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes.memories) return;
    const memoryTab = document.getElementById('tab-memory');
    if (!memoryTab?.classList.contains('active')) return;
    renderMemories(changes.memories.newValue || []);
  });
}
