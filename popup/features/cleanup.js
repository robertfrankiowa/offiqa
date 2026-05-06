function getCleanupSince() {
  const hours = parseInt(document.getElementById('cleanup-time').value, 10);
  return hours === 0 ? 0 : Date.now() - hours * 3600 * 1000;
}

function getCleanupExceptionOrigins() {
  const hosts = Array.from(new Set(exceptions.map(normalizeCleanupException).filter(Boolean)));
  const origins = [];

  hosts.forEach((host) => {
    const hostVariants = [host];
    if (!host.startsWith('www.') && host.split('.').length === 2) {
      hostVariants.push(`www.${host}`);
    }

    hostVariants.forEach((hostVariant) => {
      ['https:', 'http:'].forEach((protocol) => {
        try {
          origins.push(new URL(`${protocol}//${hostVariant}`).origin);
        } catch {
          // Ignore malformed manual entries instead of blocking cleanup.
        }
      });
    });
  });

  return Array.from(new Set(origins));
}

function buildCleanupOptions({ includeExceptions = false } = {}) {
  const options = { since: getCleanupSince() };
  if (includeExceptions) {
    const excludeOrigins = getCleanupExceptionOrigins();
    if (excludeOrigins.length > 0) {
      options.excludeOrigins = excludeOrigins;
    }
  }
  return options;
}

function getCleanupTasks() {
  const tasks = [];
  const baseOptions = buildCleanupOptions();
  const siteDataOptions = buildCleanupOptions({ includeExceptions: true });
  const addTask = (key, label, methodName, options = baseOptions, dataToRemove = null) => {
    if (tasks.some((task) => task.key === key)) return;
    tasks.push({ key, label, methodName, options, dataToRemove });
  };

  const wantsSiteData = document.getElementById('cb-cookies').checked;
  const wantsCache = document.getElementById('cb-cache').checked;
  const wantsHistory = document.getElementById('cb-history').checked;
  const wantsDownloads = document.getElementById('cb-downloads').checked;
  const wantsLocalStorage = document.getElementById('cb-localstorage').checked;
  const wantsSessions = document.getElementById('cb-sessions').checked;

  if (wantsSiteData) {
    addTask('siteData', 'dữ liệu trang', 'remove', siteDataOptions, {
      cacheStorage: true,
      fileSystems: true,
      indexedDB: true,
      serviceWorkers: true
    });
  }
  if (wantsCache) {
    addTask('cache', 'bộ nhớ đệm', 'removeCache', siteDataOptions);
  }
  if (wantsHistory) addTask('history', 'lịch sử duyệt web', 'removeHistory');
  if (wantsDownloads) addTask('downloads', 'lịch sử tải xuống', 'removeDownloads');
  if (wantsLocalStorage) addTask('localStorage', 'bộ nhớ cục bộ', 'removeLocalStorage', siteDataOptions);
  if (wantsSessions) addTask('sessions', 'phiên đăng nhập', 'removeCookies', siteDataOptions);

  return tasks;
}

function formatCleanupCount(value, noun = 'mục') {
  return `${Number(value || 0).toLocaleString('vi-VN')} ${noun}`;
}

async function countCleanupHistoryItems(options) {
  if (typeof chrome?.history?.search !== 'function') {
    throw new Error('history API unavailable');
  }

  const items = await chrome.history.search({
    text: '',
    startTime: Number(options?.since || 0),
    endTime: Date.now(),
    maxResults: 100000
  });
  return Array.isArray(items) ? items.length : 0;
}

async function countCleanupDownloadItems(options) {
  if (typeof chrome?.downloads?.search !== 'function') {
    throw new Error('downloads API unavailable');
  }

  const query = {
    startedBefore: new Date().toISOString(),
    limit: 100000
  };
  const since = Number(options?.since || 0);
  if (since > 0) {
    query.startedAfter = new Date(since).toISOString();
  }

  const items = await chrome.downloads.search(query);
  return Array.isArray(items) ? items.length : 0;
}

function renderCleanupEstimate() {
  const el = document.getElementById('cleanup-estimate');
  if (!el) return;

  const taskCount = getCleanupTasks().length;
  if (taskCount === 0) {
    el.textContent = 'Chưa chọn dữ liệu để dọn.';
    return;
  }

  if (cleanupEstimate.status === 'loading') {
    el.textContent = 'Đang ước tính số mục có thể đếm...';
    return;
  }

  if (cleanupEstimate.status === 'error') {
    el.textContent = 'Chưa thể ước tính số mục sẽ xóa.';
    return;
  }

  const knownCount = cleanupEstimate.knownCount || 0;
  const knownLabels = cleanupEstimate.knownLabels || [];
  const unknownLabels = cleanupEstimate.unknownLabels || [];

  if (knownLabels.length === 0 && unknownLabels.length > 0) {
    el.textContent = `${unknownLabels.join(', ')} không thể đếm trước do giới hạn của Chrome.`;
    return;
  }

  const knownText = `Đếm được ${formatCleanupCount(knownCount)} (${knownLabels.join(', ')})`;
  if (unknownLabels.length > 0) {
    el.textContent = `${knownText}; ${unknownLabels.join(', ')} không thể đếm trước.`;
    return;
  }

  el.textContent = knownCount > 0
    ? knownText
    : 'Không tìm thấy mục có thể đếm trong khoảng thời gian này.';
}

function scheduleCleanupEstimate() {
  cleanupEstimateRequestId += 1;
  const requestId = cleanupEstimateRequestId;

  if (cleanupEstimateTimer) {
    clearTimeout(cleanupEstimateTimer);
    cleanupEstimateTimer = null;
  }

  const tasks = getCleanupTasks();
  if (tasks.length === 0) {
    cleanupEstimate = { status: 'idle', knownCount: 0, knownLabels: [], unknownLabels: [] };
    renderCleanupEstimate();
    return;
  }

  cleanupEstimate = { status: 'loading', knownCount: 0, knownLabels: [], unknownLabels: [] };
  renderCleanupEstimate();

  cleanupEstimateTimer = setTimeout(async () => {
    const knownLabels = [];
    const unknownLabels = [];
    let knownCount = 0;

    await Promise.all(tasks.map(async (task) => {
      try {
        if (task.key === 'history') {
          knownCount += await countCleanupHistoryItems(task.options);
          knownLabels.push('mục lịch sử');
          return;
        }

        if (task.key === 'downloads') {
          knownCount += await countCleanupDownloadItems(task.options);
          knownLabels.push('mục tải xuống');
          return;
        }

        unknownLabels.push(task.label);
      } catch {
        unknownLabels.push(task.label);
      }
    }));

    if (requestId !== cleanupEstimateRequestId) return;

    cleanupEstimate = {
      status: 'ready',
      knownCount,
      knownLabels,
      unknownLabels
    };
    renderCleanupEstimate();
    renderCleanupButton();
  }, 250);
}

function setCleanupButtonState(state, message = '') {
  cleanupButtonState = state;
  cleanupButtonMessage = message;
  if (cleanupButtonTimer) {
    clearTimeout(cleanupButtonTimer);
    cleanupButtonTimer = null;
  }

  if (state === 'confirming') {
    cleanupButtonTimer = setTimeout(() => {
      cleanupButtonState = 'idle';
      cleanupButtonMessage = '';
      cleanupButtonTimer = null;
      renderCleanupButton();
    }, 4500);
  }

  if (state === 'success' || state === 'error') {
    cleanupButtonTimer = setTimeout(() => {
      cleanupButtonState = 'idle';
      cleanupButtonMessage = '';
      cleanupButtonTimer = null;
      renderCleanupButton();
    }, 3200);
  }

  renderCleanupButton();
}

function renderCleanupButton() {
  const button = document.getElementById('btn-cleanup');
  const title = document.getElementById('cleanup-button-title');
  const subtitle = document.getElementById('cleanup-button-subtitle');
  const count = document.getElementById('cleanup-count');
  if (!button || !title || !subtitle) return;

  const taskCount = getCleanupTasks().length;
  if (count) count.textContent = taskCount;
  button.classList.toggle('is-confirming', cleanupButtonState === 'confirming' && taskCount > 0);
  button.classList.toggle('is-running', cleanupButtonState === 'running');
  button.classList.toggle('is-success', cleanupButtonState === 'success');
  button.classList.toggle('is-error', cleanupButtonState === 'error');
  renderCleanupEstimate();

  const buildSubtitle = (suffix) => {
    const knownCount = cleanupEstimate.status === 'ready' ? cleanupEstimate.knownCount : 0;
    const hasKnownCount = cleanupEstimate.status === 'ready' && (cleanupEstimate.knownLabels || []).length > 0;
    if (hasKnownCount && knownCount > 0) {
      return `${formatCleanupCount(knownCount)} đếm được; ${taskCount} loại dữ liệu ${suffix}`;
    }
    return `${taskCount} loại dữ liệu ${suffix}`;
  };

  if (cleanupButtonState === 'confirming' && taskCount > 0) {
    title.textContent = 'Xác nhận? Nhấn lần nữa';
    subtitle.textContent = buildSubtitle('sẽ được dọn');
    return;
  }

  if (cleanupButtonState === 'running') {
    title.textContent = 'Đang dọn dẹp...';
    subtitle.textContent = buildSubtitle('đang được xử lý');
    return;
  }

  if (cleanupButtonState === 'success') {
    title.textContent = 'Xong! Trình duyệt đã được dọn.';
    subtitle.textContent = '';
    return;
  }

  if (cleanupButtonState === 'error') {
    title.textContent = 'Chưa dọn dẹp được';
    subtitle.textContent = cleanupButtonMessage || 'Vui lòng thử lại';
    return;
  }

  title.textContent = 'Dọn dẹp ngay';
  subtitle.textContent = buildSubtitle('sẽ được dọn');
}

function updateCleanupCount() {
  if (cleanupButtonState !== 'running') {
    setCleanupButtonState('idle');
  }
  scheduleCleanupEstimate();
}

async function runBrowsingDataTask(task) {
  const { methodName, options, dataToRemove } = task;
  const method = chrome.browsingData?.[methodName];
  if (typeof method !== 'function') {
    throw new Error(`Trình duyệt không hỗ trợ ${methodName}`);
  }

  const result = dataToRemove
    ? method.call(chrome.browsingData, options, dataToRemove)
    : method.call(chrome.browsingData, options);
  if (!result || typeof result.then !== 'function') {
    throw new Error(`API ${methodName} không trả về Promise`);
  }
  await result;
}

document.querySelectorAll('#tab-cleanup input[type="checkbox"]').forEach(cb => {
  cb.addEventListener('change', updateCleanupCount);
});

document.getElementById('cleanup-time')?.addEventListener('change', updateCleanupCount);

// Exceptions
let exceptions = [];

function normalizeCleanupException(value) {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./i, '')
    .toLowerCase();
}

async function loadExceptions() {
  const data = await store.get(['cleanup_exceptions']);
  exceptions = Array.from(new Set((data.cleanup_exceptions || []).map(normalizeCleanupException).filter(Boolean)));
  renderExceptions();
}

async function refreshCleanupExceptionInput({ force = false } = {}) {
  const input = document.getElementById('exception-input');
  if (!input) return;

  const currentValue = input.value.trim();
  const previousAutoValue = cleanupExceptionAutoValue;
  const canReplace = force || !currentValue || currentValue === previousAutoValue;
  if (!canReplace) return;

  const context = buildPageContext(await getActiveTab());
  cleanupExceptionAutoValue = context.isValid ? context.domain : '';
  input.value = cleanupExceptionAutoValue;
}

function renderExceptions() {
  const el = document.getElementById('exceptions-list');
  if (exceptions.length === 0) {
    el.innerHTML = '<span style="color:#9ca3af;font-size:12px">Ch&#432;a c&#243; ngo&#7841;i l&#7879;</span>';
    return;
  }
  el.innerHTML = exceptions.map((e, i) => `
    <span class="exception-item">
      ${e}
      <button type="button" data-action="remove-exception" data-index="${i}">&times;</button>
    </span>
  `).join('');
}

window.removeException = async (i) => {
  exceptions.splice(i, 1);
  await store.set({ cleanup_exceptions: exceptions });
  renderExceptions();
};

document.getElementById('btn-add-exception').addEventListener('click', async () => {
  const val = normalizeCleanupException(document.getElementById('exception-input').value);
  if (!val) return;
  if (exceptions.includes(val)) {
    document.getElementById('exception-input').value = val;
    cleanupExceptionAutoValue = val;
    return;
  }
  exceptions.push(val);
  await store.set({ cleanup_exceptions: exceptions });
  document.getElementById('exception-input').value = '';
  cleanupExceptionAutoValue = '';
  refreshCleanupExceptionInput({ force: true });
  renderExceptions();
  showToast('\u0110\u00e3 th\u00eam ngo\u1ea1i l\u1ec7');
});

document.getElementById('btn-cleanup').addEventListener('click', async () => {
  if (cleanupButtonState === 'running') return;

  const tasks = getCleanupTasks();

  if (tasks.length === 0) {
    setCleanupButtonState('idle');
    return;
  }

  if (cleanupButtonState !== 'confirming') {
    setCleanupButtonState('confirming');
    return;
  }

  try {
    setCleanupButtonState('running');
    const skippedTasks = [];
    for (const task of tasks) {
      try {
        await runBrowsingDataTask(task);
      } catch (e) {
        const message = String(e?.message || e || '');
        if (/not supported|not implemented|kh\u00F4ng \u0111\u01B0\u1EE3c h\u1ED7 tr\u1EE3/i.test(message)) {
          skippedTasks.push(task.label);
          continue;
        }
        throw new Error(`${task.label}: ${message}`);
      }
    }

    if (skippedTasks.length > 0) {
      setCleanupButtonState('error', `Bỏ qua ${skippedTasks.length} loại dữ liệu chưa được hỗ trợ`);
      return;
    }

    setCleanupButtonState('success');
  } catch (e) {
    console.warn('Cleanup failed:', e);
    setCleanupButtonState('error', 'Có lỗi xảy ra, vui lòng thử lại');
  }
});
