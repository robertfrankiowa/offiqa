// ===== CLIPBOARD =====
async function loadClipboard() {
  const data = await store.get([CLIPBOARD_STORAGE_KEY]);
  const rawItems = Array.isArray(data[CLIPBOARD_STORAGE_KEY]) ? data[CLIPBOARD_STORAGE_KEY] : [];
  clipboardItems = normalizeClipboardItems(rawItems);
  renderClipboard();
  updateStorageBar(clipboardItems);
  updateClipboardSummary(getFilteredClipboardItems().length);

  const needsMigration = rawItems.some((item) =>
    typeof item === 'string' ||
    !item?.id ||
    typeof item?.domain === 'undefined' ||
    typeof item?.source === 'undefined'
  );

  if (needsMigration || clipboardItems.length !== rawItems.length) {
    await store.set({ [CLIPBOARD_STORAGE_KEY]: clipboardItems });
  }
}

function createClipboardId(created, text, url, salt = 0) {
  return `clip_${created}_${text.length}_${url.length}_${salt}`;
}

function normalizeClipboardText(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/\u0000/g, '').trim();
}

function getClipboardDomain(url) {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

function normalizeClipboardItem(item, index = 0) {
  if (!item) return null;

  if (typeof item === 'string') {
    const text = normalizeClipboardText(item);
    if (!text) return null;
    const created = Date.now() - index;
    return {
      id: createClipboardId(created, text, '', index),
      text,
      url: '',
      title: '',
      domain: '',
      source: 'manual',
      created
    };
  }

  const text = normalizeClipboardText(item.text);
  if (!text) return null;

  const created = Number.isFinite(item.created) ? item.created : Date.now() - index;
  const url = isTrackableUrl(item.url || item.pageUrl || '') ? (item.url || item.pageUrl || '') : '';
  return {
    id: typeof item.id === 'string' && item.id ? item.id : createClipboardId(created, text, url, index),
    text,
    url,
    title: typeof item.title === 'string'
      ? item.title.trim()
      : typeof item.pageTitle === 'string'
        ? item.pageTitle.trim()
        : '',
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

function getFilteredClipboardItems() {
  const query = clipboardSearchQuery.trim().toLowerCase();
  const filtered = clipboardItems.filter((item) => {
    if (!query) return true;
    return [item.text, item.title, item.url, item.domain]
      .some((value) => String(value || '').toLowerCase().includes(query));
  });

  filtered.sort((a, b) => {
    if (clipboardSortOrder === 'oldest') return a.created - b.created;
    if (clipboardSortOrder === 'az') return a.text.localeCompare(b.text, 'vi', { sensitivity: 'base' });
    if (clipboardSortOrder === 'site') {
      const siteCompare = (a.domain || a.url || '').localeCompare(b.domain || b.url || '', 'vi', { sensitivity: 'base' });
      return siteCompare || (b.created - a.created);
    }
    return b.created - a.created;
  });

  return filtered;
}

function formatClipboardTime(timestamp) {
  if (!Number.isFinite(timestamp)) return '';

  const diff = Date.now() - timestamp;
  if (diff < 60 * 1000) return popupUiText('clipboard.justNow');
  if (diff < 60 * 60 * 1000) return popupUiText('clipboard.minutesAgo', { count: Math.floor(diff / (60 * 1000)) });
  if (diff < 24 * 60 * 60 * 1000) return popupUiText('clipboard.hoursAgo', { count: Math.floor(diff / (60 * 60 * 1000)) });
  if (diff < 7 * 24 * 60 * 60 * 1000) return popupUiText('clipboard.daysAgo', { count: Math.floor(diff / (24 * 60 * 60 * 1000)) });

  return new Intl.DateTimeFormat(getPopupLanguageLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(timestamp);
}

function updateClipboardSummary(visibleCount) {
  const el = document.getElementById('clipboard-summary');
  if (!el) return;

  if (clipboardItems.length === 0) {
    el.textContent = popupUiText('clipboard.summaryEmpty');
    return;
  }

  if (clipboardSearchQuery.trim()) {
    el.textContent = popupUiText('clipboard.summaryFiltered', { visible: visibleCount, total: clipboardItems.length });
    return;
  }

  el.textContent = popupUiText(clipboardItems.length === 1 ? 'clipboard.summaryOne' : 'clipboard.summary', { count: clipboardItems.length });
}

function renderClipboard() {
  const el = document.getElementById('clipboard-list');
  const items = getFilteredClipboardItems();
  if (clipboardItems.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">\u{1F4CB}</div>${escapeHtml(popupUiText('clipboard.empty'))}</div>`;
    return;
  }
  el.innerHTML = items.map((item, i) => `
    <div class="clipboard-item" data-index="${i}">
      <span class="clipboard-item-text">${escapeHtml(item.text)}</span>
      <button type="button" class="clipboard-item-del" data-action="delete-clip" data-index="${i}">&times;</button>
    </div>
  `).join('');
}

function updateStorageBar(items) {
  const total = items.reduce((a, b) => a + b.text.length, 0);
  const pct = Math.min(100, (total / 50000) * 100);
  document.getElementById('storage-fill').style.width = pct + '%';
}

window.copyToClipboard = async (i) => {
  const data = await store.get(['clipboard_items']);
  const items = data.clipboard_items || [];
  await navigator.clipboard.writeText(items[i].text);
  showToast(popupUiText('clipboard.copied'));
};

window.deleteClip = async (i) => {
  const data = await store.get(['clipboard_items']);
  const items = data.clipboard_items || [];
  items.splice(i, 1);
  await store.set({ clipboard_items: items });
  renderClipboard(items);
  updateStorageBar(items);
};

document.getElementById('btn-add-clipboard').addEventListener('click', addClipboardItem);
document.getElementById('clipboard-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') addClipboardItem();
});

async function addClipboardItem() {
  const input = document.getElementById('clipboard-input');
  const text = input.value.trim();
  if (!text) return;
  const data = await store.get(['clipboard_items']);
  const items = data.clipboard_items || [];
  items.unshift({ text, created: Date.now() });
  await store.set({ clipboard_items: items });
  input.value = '';
  renderClipboard(items);
  updateStorageBar(items);
}

async function saveClipboardItems(items) {
  clipboardItems = normalizeClipboardItems(items);
  await store.set({ [CLIPBOARD_STORAGE_KEY]: clipboardItems });
  renderClipboard();
  updateStorageBar(clipboardItems);
}

function renderClipboard() {
  const el = document.getElementById('clipboard-list');
  const items = getFilteredClipboardItems();

  if (clipboardItems.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">\u{1F4CB}</div>${escapeHtml(popupUiText('clipboard.empty'))}</div>`;
    updateClipboardSummary(0);
    return;
  }

  if (items.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">\u{1F50E}</div>${escapeHtml(popupUiText('clipboard.emptySearch'))}</div>`;
    updateClipboardSummary(0);
    return;
  }

  el.innerHTML = items.map((item) => `
    <div class="clipboard-item" data-id="${escapeHtml(item.id)}">
      <div class="clipboard-item-body">
        <div class="clipboard-item-text">${escapeHtml(item.text)}</div>
        <div class="clipboard-item-meta">
          <span class="clipboard-chip">${escapeHtml(item.source === 'auto' ? popupUiText('clipboard.sourceAuto') : popupUiText('clipboard.sourceManual'))}</span>
          ${item.domain ? `<span>${escapeHtml(item.domain)}</span>` : ''}
          <span>${escapeHtml(formatClipboardTime(item.created))}</span>
        </div>
        ${item.url ? `<div class="clipboard-item-source">${escapeHtml(item.title || item.url)}</div>` : ''}
      </div>
      <div class="clipboard-item-actions">
        ${item.url ? `<button type="button" class="clipboard-item-action" data-action="open-clip-url" data-url="${encodeURIComponent(item.url)}">${escapeHtml(popupUiText('clipboard.reopen'))}</button>` : ''}
        <button type="button" class="clipboard-item-action" data-action="copy-clip" data-id="${escapeHtml(item.id)}">${escapeHtml(popupUiText('clipboard.copy'))}</button>
        <button type="button" class="clipboard-item-del" data-action="delete-clip" data-id="${escapeHtml(item.id)}">&times;</button>
      </div>
    </div>
  `).join('');
  updateClipboardSummary(items.length);
}

async function loadClipboard() {
  const data = await store.get([CLIPBOARD_STORAGE_KEY]);
  const rawItems = Array.isArray(data[CLIPBOARD_STORAGE_KEY]) ? data[CLIPBOARD_STORAGE_KEY] : [];
  clipboardItems = normalizeClipboardItems(rawItems);
  renderClipboard();
  updateStorageBar(clipboardItems);
  updateClipboardSummary(getFilteredClipboardItems().length);

  const needsMigration = rawItems.some((item) =>
    typeof item === 'string' ||
    !item?.id ||
    typeof item?.domain === 'undefined' ||
    typeof item?.source === 'undefined'
  );

  if (needsMigration || clipboardItems.length !== rawItems.length) {
    await store.set({ [CLIPBOARD_STORAGE_KEY]: clipboardItems });
  }
}

window.copyToClipboard = async (id) => {
  const item = clipboardItems.find((entry) => entry.id === id);
  if (!item) return;
  await navigator.clipboard.writeText(item.text);
  showToast(popupUiText('clipboard.copied'));
};

window.openClipboardUrl = (encodedUrl) => {
  chrome.tabs.create({ url: decodeURIComponent(encodedUrl) });
};

window.deleteClip = async (id) => {
  const items = clipboardItems.filter((item) => item.id !== id);
  await saveClipboardItems(items);
};

async function clearAllClipboardItems() {
  if (clipboardItems.length === 0) {
    showToast(popupUiText('clipboard.clearEmpty'));
    return;
  }

  const shouldClear = confirm(popupUiText('clipboard.clearConfirm', { count: clipboardItems.length }));
  if (!shouldClear) return;

  await saveClipboardItems([]);
  showToast(popupUiText('clipboard.clearDone'));
}

async function addClipboardItem() {
  const input = document.getElementById('clipboard-input');
  const text = input.value.trim();
  if (!text) return;

  const contextTab = await getContextTab();
  const created = Date.now();
  const item = normalizeClipboardItem({
    id: createClipboardId(created, text, contextTab?.url || '', created),
    text,
    url: contextTab?.url || '',
    title: contextTab?.title || '',
    source: 'manual',
    created
  });

  await saveClipboardItems([item, ...clipboardItems]);
  input.value = '';
  showToast(popupUiText('clipboard.saved'));
}
