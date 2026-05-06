// ===== TASKS =====
let tasks = [];
let pendingTaskCarryovers = [];
const TASK_CARRYOVER_QUEUE_KEY = 'tasks_carryover_queue';

function normalizeTaskDateKey(value) {
  const normalized = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
}

function parseTaskDateKey(dateKey) {
  const [year, month, day] = normalizeTaskDateKey(dateKey).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function isCurrentTaskDate(storedValue, date = new Date()) {
  const normalized = String(storedValue || '').trim();
  return normalized === getLocalDateKey(date) || normalized === date.toDateString();
}

function formatTaskDateKeyLabel(dateKey) {
  const normalized = normalizeTaskDateKey(dateKey);
  if (!normalized) return 'trước đó';
  const todayKey = getLocalDateKey(new Date());
  if (normalized === todayKey) return 'hôm nay';

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (normalized === getLocalDateKey(yesterday)) return 'hôm qua';

  const parsed = parseTaskDateKey(normalized);
  if (!parsed) return normalized;
  return new Intl.DateTimeFormat(getLanguageLocale(), {
    day: '2-digit',
    month: '2-digit'
  }).format(parsed);
}

function normalizeTaskRecord(raw, fallbackTimestamp = Date.now()) {
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
    taskDateKey: normalizeTaskDateKey(raw?.taskDateKey),
    carryOverFromDateKey: normalizeTaskDateKey(raw?.carryOverFromDateKey)
  };
}

function normalizePendingCarryoverTasks(rawTasks = []) {
  return rawTasks
    .map((task) => normalizeTaskRecord(task))
    .filter((task) => task.text && !task.done)
    .map((task) => ({
      ...task,
      taskDateKey: '',
      carryOverFromDateKey: normalizeTaskDateKey(task.carryOverFromDateKey)
        || normalizeTaskDateKey(task.taskDateKey)
        || getLocalDateKey(new Date(task.created || Date.now())),
      carriedOver: false,
      completedAt: 0
    }));
}

function mergePendingCarryoverTasks(existingTasks = [], newTasks = []) {
  const merged = [];
  const seenIds = new Set();

  [...newTasks, ...existingTasks].forEach((task) => {
    if (!task?.text || task.done || seenIds.has(task.id)) return;
    seenIds.add(task.id);
    merged.push(task);
  });

  return merged;
}

async function persistTaskState() {
  await store.set({
    tasks,
    tasks_date: getLocalDateKey(new Date()),
    [TASK_CARRYOVER_QUEUE_KEY]: pendingTaskCarryovers
  });
  renderTasks();
}

async function loadTasks() {
  const today = new Date();
  const todayKey = getLocalDateKey(today);
  const data = await store.get(['tasks', 'tasks_date', TASK_CARRYOVER_QUEUE_KEY]);
  const rawTasks = Array.isArray(data.tasks) ? data.tasks : [];
  const rawCarryovers = Array.isArray(data[TASK_CARRYOVER_QUEUE_KEY]) ? data[TASK_CARRYOVER_QUEUE_KEY] : [];
  const normalizedCarryovers = normalizePendingCarryoverTasks(rawCarryovers);

  if (!isCurrentTaskDate(data.tasks_date, today)) {
    const prevTasks = rawTasks
      .map((task) => normalizeTaskRecord(task))
      .filter((task) => task.text && !task.done)
      .map((task) => ({
        ...task,
        taskDateKey: '',
        carryOverFromDateKey: normalizeTaskDateKey(task.taskDateKey)
          || normalizeTaskDateKey(task.carryOverFromDateKey)
          || getLocalDateKey(new Date(task.created || Date.now())),
        carriedOver: false,
        updatedAt: Date.now(),
        completedAt: 0
      }));

    tasks = [];
    pendingTaskCarryovers = mergePendingCarryoverTasks(normalizedCarryovers, prevTasks);
    await store.set({
      tasks,
      tasks_date: todayKey,
      [TASK_CARRYOVER_QUEUE_KEY]: pendingTaskCarryovers
    });
  } else {
    tasks = rawTasks
      .map((task) => normalizeTaskRecord(task))
      .filter((task) => task.text)
      .map((task) => ({
        ...task,
        taskDateKey: todayKey
      }));
    pendingTaskCarryovers = normalizedCarryovers;

    if (
      data.tasks_date !== todayKey
      || JSON.stringify(rawTasks) !== JSON.stringify(tasks)
      || JSON.stringify(rawCarryovers) !== JSON.stringify(pendingTaskCarryovers)
    ) {
      await store.set({
        tasks,
        tasks_date: todayKey,
        [TASK_CARRYOVER_QUEUE_KEY]: pendingTaskCarryovers
      });
    }
  }
  renderTasks();
}

async function addCarryoverTaskToToday(taskId) {
  const carryoverIndex = pendingTaskCarryovers.findIndex((task) => task.id === taskId);
  if (carryoverIndex === -1) return;

  const carryoverTask = pendingTaskCarryovers[carryoverIndex];
  pendingTaskCarryovers.splice(carryoverIndex, 1);

  const todayKey = getLocalDateKey(new Date());
  const nextTask = {
    ...carryoverTask,
    done: false,
    carriedOver: true,
    taskDateKey: todayKey,
    carryOverFromDateKey: normalizeTaskDateKey(carryoverTask.carryOverFromDateKey)
      || getLocalDateKey(new Date(carryoverTask.created || Date.now())),
    updatedAt: Date.now(),
    completedAt: 0
  };

  const existingTaskIndex = tasks.findIndex((task) => task.id === nextTask.id);
  if (existingTaskIndex === -1) tasks.unshift(nextTask);
  else tasks[existingTaskIndex] = { ...tasks[existingTaskIndex], ...nextTask };

  await persistTaskState();
}

async function dismissCarryoverTask(taskId) {
  const nextCarryovers = pendingTaskCarryovers.filter((task) => task.id !== taskId);
  if (nextCarryovers.length === pendingTaskCarryovers.length) return;
  pendingTaskCarryovers = nextCarryovers;
  await persistTaskState();
}

async function addAllCarryoverTasksToToday() {
  const queue = [...pendingTaskCarryovers];
  for (const task of queue) {
    await addCarryoverTaskToToday(task.id);
  }
}

async function dismissAllCarryoverTasks() {
  if (!pendingTaskCarryovers.length) return;
  pendingTaskCarryovers = [];
  await persistTaskState();
}

function renderTasks() {
  const el = document.getElementById('task-list');
  const remaining = tasks.filter(t => !t.done).length;
  const total = tasks.length;
  const pinnedRemaining = tasks.filter(t => t.pinned && !t.done).length;
  const carryoverCount = pendingTaskCarryovers.length;
  const badge = document.getElementById('task-remaining-badge');
  const taskItems = tasks.map((task, index) => ({ ...task, _orig: index }));

  badge.textContent = remaining === 0 && total > 0
    ? `✓ Xong hết`
    : pinnedRemaining > 0
      ? `⭐ ${pinnedRemaining} ưu tiên`
      : total === 0 && carryoverCount > 0
        ? `Nhắc ${carryoverCount}`
        : `${remaining} còn lại`;
  badge.className = 'card-badge';
  if (total === 0 && carryoverCount === 0) badge.classList.add('badge-neutral');
  else if (remaining === 0) badge.classList.add('badge-done');
  else if (pinnedRemaining > 0) badge.classList.add('badge-warn');
  else if (remaining >= total * 0.6) badge.classList.add('badge-warn');
  else badge.classList.add('badge-progress');

  const pinnedTasks = taskItems.filter((task) => task.pinned && !task.done);
  const topPriorityTasks = pinnedTasks.slice(0, 3);
  const extraPriorityTasks = pinnedTasks.slice(3);
  const otherTasks = taskItems.filter((task) => !task.done && !task.pinned);
  const completedTasks = taskItems.filter((task) => task.done);

  const renderTaskItem = (task, options = {}) => {
    const taskIndex = task._orig;
    const tags = [];

    if (options.priority) {
      if (options.priorityRank === 0 && !options.extraPriority) {
        tags.push('<span class="task-tag task-tag-priority">Làm ngay</span>');
      }
    } else if (task.pinned && !task.done) {
      tags.push('<span class="task-tag task-tag-important">Quan trọng</span>');
    }

    if (task.carriedOver && !task.done) {
      tags.push(`<span class="task-tag task-tag-carry">Từ ${escHtml(formatTaskDateKeyLabel(task.carryOverFromDateKey))}</span>`);
    }

    return `
      <div class="task-item ${options.priority ? 'task-priority' : ''} ${options.priority && options.priorityRank === 0 && !options.extraPriority ? 'task-priority-top' : ''} ${task.pinned && !task.done ? 'task-pinned' : ''} ${task.done ? 'task-completed' : ''}">
        <button
          type="button"
          class="task-pin-btn ${task.pinned ? 'pinned' : ''}"
          data-action="pin-task"
          data-index="${taskIndex}"
          title="${task.pinned ? 'Bỏ ưu tiên' : 'Đánh dấu ưu tiên'}"
          aria-label="${task.pinned ? 'Bỏ ưu tiên' : 'Đánh dấu ưu tiên'}"
        >${task.pinned ? '★' : '○'}</button>
        <input type="checkbox" class="task-check" data-index="${taskIndex}" ${task.done ? 'checked' : ''}>
        <div class="task-content">
          <span class="task-text ${task.done ? 'done' : ''}" data-index="${taskIndex}">${escHtml(task.text)}</span>
          ${tags.length ? `<div class="task-tags">${tags.join('')}</div>` : ''}
        </div>
        <button type="button" class="task-del" data-action="delete-task" data-index="${taskIndex}" aria-label="Xóa task">×</button>
      </div>`;
  };

  const renderTaskSection = (title, items, sectionClass, options = {}) => {
    if (!items.length) return '';

    return `
      <section class="task-section ${sectionClass}">
        <div class="task-section-head">
          <h4 class="task-section-title">${title}</h4>
          <span class="task-section-count">${items.length}</span>
        </div>
        <div class="task-section-list">
          ${items.map((task, index) => renderTaskItem(task, { ...options, priorityRank: index })).join('')}
        </div>
      </section>`;
  };

  const renderCarryoverReview = () => {
    if (!pendingTaskCarryovers.length) return '';

    return `
      <section class="task-review-panel">
        <div class="task-review-head">
          <div>
            <h4 class="task-review-title">Việc chưa xong từ ngày trước</h4>
            <p class="task-review-desc">Chọn việc nào bạn muốn đưa lại vào hôm nay, hoặc bỏ qua để giữ danh sách gọn hơn.</p>
          </div>
          <div class="task-review-bulk-actions">
            <button type="button" class="task-review-bulk-btn" data-action="add-all-carryover-tasks">Thêm tất cả</button>
            <button type="button" class="task-review-bulk-btn is-ghost" data-action="dismiss-all-carryover-tasks">Bỏ qua hết</button>
          </div>
        </div>
        <div class="task-review-list">
          ${pendingTaskCarryovers.map((task) => `
            <div class="task-review-item">
              <div class="task-review-main">
                <div class="task-review-text">${escHtml(task.text)}</div>
                <div class="task-review-tags">
                  <span class="task-tag task-tag-carry">Chưa xong từ ${escHtml(formatTaskDateKeyLabel(task.carryOverFromDateKey))}</span>
                  ${task.pinned ? '<span class="task-tag task-tag-important">Ưu tiên cũ</span>' : ''}
                </div>
              </div>
              <div class="task-review-actions">
                <button type="button" class="task-review-action-btn" data-action="add-carryover-task" data-task-id="${escAttr(task.id)}">Thêm hôm nay</button>
                <button type="button" class="task-review-action-btn is-ghost" data-action="dismiss-carryover-task" data-task-id="${escAttr(task.id)}">Bỏ qua</button>
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  };

  const sections = [
    renderCarryoverReview(),
    renderTaskSection('Ưu tiên hàng đầu', topPriorityTasks, 'task-section-priority', { priority: true }),
    renderTaskSection('Ưu tiên thêm', extraPriorityTasks, 'task-section-priority-extra', { priority: true, extraPriority: true }),
    renderTaskSection('Các việc khác', otherTasks, 'task-section-other'),
    renderTaskSection('Đã xong hôm nay', completedTasks, 'task-section-done', { completed: true })
  ].filter(Boolean);

  if (!sections.length) {
    sections.push('<div class="card-empty">Chưa có task nào cho hôm nay.</div>');
  }

  el.innerHTML = sections.join('');

  if (typeof renderFocusTaskSuggestions === 'function') {
    renderFocusTaskSuggestions(document.activeElement === document.getElementById('focus-context-input'));
  }
}

window.toggleTask = async (i) => {
  tasks[i].done = !tasks[i].done;
  tasks[i].updatedAt = Date.now();
  tasks[i].completedAt = tasks[i].done ? tasks[i].updatedAt : 0;
  await persistTaskState();
};

window.pinTask = async (i) => {
  tasks[i].pinned = !tasks[i].pinned;
  tasks[i].updatedAt = Date.now();
  await persistTaskState();
};

window.deleteTask = async (i) => {
  tasks.splice(i, 1);
  await persistTaskState();
};

window.editTask = (i) => {
  const el = document.querySelector(`.task-text[data-index="${i}"]`);
  if (!el) return;
  const input = document.createElement('input');
  input.className = 'task-inline-edit';
  input.value = tasks[i].text;
  el.replaceWith(input);
  input.focus();
  input.select();
  input.addEventListener('blur', async () => {
    tasks[i].text = input.value.trim() || tasks[i].text;
    tasks[i].updatedAt = Date.now();
    await persistTaskState();
  });
  input.addEventListener('keydown', e => { if (e.key==='Enter') input.blur(); });
};

async function addTask() {
  const input = document.getElementById('task-input');
  const text = input.value.trim();
  if (!text) return;
  const now = Date.now();
  tasks.push({
    id: now.toString(),
    text,
    done: false,
    created: now,
    updatedAt: now,
    completedAt: 0,
    taskDateKey: getLocalDateKey(new Date()),
    carryOverFromDateKey: ''
  });
  await persistTaskState();
  input.value = '';
}

document.getElementById('btn-add-task').addEventListener('click', addTask);
document.getElementById('task-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') addTask();
});

document.getElementById('task-list').addEventListener('change', (e) => {
  if (e.target.matches('.task-check[data-index]')) {
    toggleTask(Number(e.target.dataset.index));
  }
});

document.getElementById('task-list').addEventListener('click', (e) => {
  const carryoverActionBtn = e.target.closest('[data-action="add-carryover-task"], [data-action="dismiss-carryover-task"], [data-action="add-all-carryover-tasks"], [data-action="dismiss-all-carryover-tasks"]');
  if (carryoverActionBtn) {
    const taskId = carryoverActionBtn.dataset.taskId || '';
    if (carryoverActionBtn.dataset.action === 'add-carryover-task') { addCarryoverTaskToToday(taskId); return; }
    if (carryoverActionBtn.dataset.action === 'dismiss-carryover-task') { dismissCarryoverTask(taskId); return; }
    if (carryoverActionBtn.dataset.action === 'add-all-carryover-tasks') { addAllCarryoverTasksToToday(); return; }
    if (carryoverActionBtn.dataset.action === 'dismiss-all-carryover-tasks') { dismissAllCarryoverTasks(); return; }
  }
  const pinBtn = e.target.closest('[data-action="pin-task"]');
  if (pinBtn) { pinTask(Number(pinBtn.dataset.index)); return; }
  const deleteBtn = e.target.closest('[data-action="delete-task"]');
  if (deleteBtn) { deleteTask(Number(deleteBtn.dataset.index)); }
});

document.getElementById('task-list').addEventListener('dblclick', (e) => {
  const taskText = e.target.closest('.task-text[data-index]');
  if (taskText) {
    editTask(Number(taskText.dataset.index));
  }
});


window.offiqaNewtabFeatureInitializers = window.offiqaNewtabFeatureInitializers || {};
window.offiqaNewtabFeatureInitializers.tasks = async () => {
  await loadTasks();
};
