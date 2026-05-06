// ===== QUICK SNIPPETS =====
function createQuickSnippetId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `snippet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeQuickSnippetKeyword(value) {
  return String(value || '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/\s+/g, '-')
    .toLowerCase();
}

function normalizeQuickSnippet(snippet, index = 0) {
  if (!snippet) return null;

  const keyword = normalizeQuickSnippetKeyword(snippet.keyword || snippet.shortcut || '');
  const content = typeof snippet.content === 'string'
    ? snippet.content.trim()
    : typeof snippet.text === 'string'
      ? snippet.text.trim()
      : '';
  if (!keyword || !content) return null;

  const created = Number.isFinite(snippet.created) ? snippet.created : Date.now() - index;
  const updated = Number.isFinite(snippet.updated) ? snippet.updated : created;
  const label = typeof snippet.label === 'string' && snippet.label.trim()
    ? snippet.label.trim()
    : typeof snippet.title === 'string' && snippet.title.trim()
      ? snippet.title.trim()
      : keyword;

  return {
    id: typeof snippet.id === 'string' && snippet.id ? snippet.id : createQuickSnippetId(),
    keyword,
    label,
    content,
    created,
    updated
  };
}

function normalizeQuickSnippets(items) {
  if (!Array.isArray(items)) return [];

  const seenKeywords = new Set();
  return items
    .map((item, index) => normalizeQuickSnippet(item, index))
    .filter((item) => {
      if (!item) return false;
      if (seenKeywords.has(item.keyword)) return false;
      seenKeywords.add(item.keyword);
      return true;
    })
    .sort((a, b) => Number(b.updated || 0) - Number(a.updated || 0));
}

function formatQuickSnippetTime(timestamp) {
  if (!Number.isFinite(timestamp)) return '';
  try {
    return new Intl.DateTimeFormat(getPopupLanguageLocale(), {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(timestamp);
  } catch {
    return new Date(timestamp).toLocaleString();
  }
}

function getFilteredQuickSnippets() {
  const query = quickSnippetSearchQuery.trim().toLowerCase();
  if (!query) return quickSnippets;

  return quickSnippets.filter((snippet) => (
    [snippet.keyword, snippet.label, snippet.content]
      .some((value) => String(value || '').toLowerCase().includes(query))
  ));
}

function setQuickSnippetFormState({ editingId = '', keyword = '', content = '', status = '' } = {}) {
  editingQuickSnippetId = editingId || '';

  const keywordInput = document.getElementById('snippet-keyword');
  const contentInput = document.getElementById('snippet-content');
  const titleEl = document.getElementById('snippet-form-title');
  const cancelButton = document.getElementById('btn-cancel-snippet-edit');
  const statusEl = document.getElementById('snippet-form-status');

  if (keywordInput) keywordInput.value = keyword;
  if (contentInput) contentInput.value = content;
  if (titleEl) titleEl.textContent = editingQuickSnippetId ? popupUiText('snippets.formTitleEdit') : popupUiText('snippets.formTitleAdd');
  if (cancelButton) cancelButton.hidden = !editingQuickSnippetId;
  if (statusEl) {
    statusEl.innerHTML = status || popupUiText('snippets.formStatusHtml');
  }
}

function renderQuickSnippets() {
  const listEl = document.getElementById('snippet-list');
  const badgeEl = document.getElementById('snippet-count-badge');
  if (!listEl || !badgeEl) return;

  const items = getFilteredQuickSnippets();
  badgeEl.textContent = String(quickSnippets.length);

  if (quickSnippets.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⌨</div>${escapeHtml(popupUiText('snippets.empty'))}</div>`;
    return;
  }

  if (items.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">\u{1F50E}</div>${escapeHtml(popupUiText('snippets.emptySearch'))}</div>`;
    return;
  }

  listEl.innerHTML = items.map((snippet) => `
    <div class="quick-snippet-item" data-id="${escapeHtml(snippet.id)}">
      <div class="quick-snippet-head">
        <div class="quick-snippet-main">
          <div class="quick-snippet-trigger">//${escapeHtml(snippet.keyword)}</div>
          <div class="quick-snippet-meta">${escapeHtml(popupUiText('snippets.updated', { time: formatQuickSnippetTime(snippet.updated) }))}</div>
        </div>
        <div class="quick-snippet-actions">
          <button type="button" class="quick-snippet-action" data-action="edit-snippet" data-id="${escapeHtml(snippet.id)}">${escapeHtml(popupUiText('snippets.edit'))}</button>
          <button type="button" class="quick-snippet-action quick-snippet-delete" data-action="delete-snippet" data-id="${escapeHtml(snippet.id)}">${escapeHtml(popupUiText('snippets.delete'))}</button>
        </div>
      </div>
      <div class="quick-snippet-content">${escapeHtml(snippet.content).replace(/\n/g, '<br>')}</div>
    </div>
  `).join('');
}

async function saveQuickSnippets(items) {
  quickSnippets = normalizeQuickSnippets(items);
  await store.set({ [QUICK_SNIPPETS_STORAGE_KEY]: quickSnippets });
  renderQuickSnippets();
}

async function loadQuickSnippets() {
  const data = await store.get([QUICK_SNIPPETS_STORAGE_KEY]);
  const rawItems = Array.isArray(data[QUICK_SNIPPETS_STORAGE_KEY]) ? data[QUICK_SNIPPETS_STORAGE_KEY] : [];
  quickSnippets = normalizeQuickSnippets(rawItems);
  renderQuickSnippets();

  if (quickSnippets.length !== rawItems.length) {
    await store.set({ [QUICK_SNIPPETS_STORAGE_KEY]: quickSnippets });
  }
}

function startEditQuickSnippet(id) {
  const snippet = quickSnippets.find((item) => item.id === id);
  if (!snippet) return;

  setQuickSnippetFormState({
    editingId: snippet.id,
    keyword: snippet.keyword,
    content: snippet.content,
    status: popupUiText('snippets.editingStatusHtml')
  });
}

async function deleteQuickSnippet(id) {
  const nextItems = quickSnippets.filter((item) => item.id !== id);
  if (nextItems.length === quickSnippets.length) return;

  await saveQuickSnippets(nextItems);
  if (editingQuickSnippetId === id) {
    setQuickSnippetFormState();
  }
  showToast(popupUiText('snippets.toastDeleted'));
}

async function submitQuickSnippet() {
  const keywordInput = document.getElementById('snippet-keyword');
  const contentInput = document.getElementById('snippet-content');
  if (!keywordInput || !contentInput) return;

  const keyword = normalizeQuickSnippetKeyword(keywordInput.value);
  const content = String(contentInput.value || '').trim();

  if (!keyword) {
    setQuickSnippetFormState({
      editingId: editingQuickSnippetId,
      keyword: keywordInput.value,
      content,
      status: popupUiText('snippets.keywordRequired')
    });
    keywordInput.focus();
    return;
  }

  if (!content) {
    setQuickSnippetFormState({
      editingId: editingQuickSnippetId,
      keyword,
      content,
      status: popupUiText('snippets.contentRequired')
    });
    contentInput.focus();
    return;
  }

  const duplicate = quickSnippets.find((item) => item.keyword === keyword && item.id !== editingQuickSnippetId);
  if (duplicate) {
    setQuickSnippetFormState({
      editingId: editingQuickSnippetId,
      keyword,
      content,
      status: escapeHtml(popupUiText('snippets.duplicateKeyword', { keyword }))
    });
    keywordInput.focus();
    keywordInput.select();
    return;
  }

  const now = Date.now();
  let nextItems;
  if (editingQuickSnippetId) {
    nextItems = quickSnippets.map((item) => item.id === editingQuickSnippetId ? {
      ...item,
      keyword,
      label: keyword,
      content,
      updated: now
    } : item);
  } else {
    nextItems = [{
      id: createQuickSnippetId(),
      keyword,
      label: keyword,
      content,
      created: now,
      updated: now
    }, ...quickSnippets];
  }

  const wasEditing = Boolean(editingQuickSnippetId);
  await saveQuickSnippets(nextItems);
  setQuickSnippetFormState({
    status: popupUiText('snippets.savedStatusHtml')
  });
  showToast(wasEditing ? popupUiText('snippets.toastUpdated') : popupUiText('snippets.toastAdded'));
}

function normalizeLanguageOptions(preferredLanguage) {
  const select = document.getElementById('lang-select');
  if (!select) return 'en';

  select.innerHTML = SUPPORTED_LANGUAGE_OPTIONS.map((option) => (
    `<option value="${option.value}">${option.label}</option>`
  )).join('');

  const normalizedLanguage = SUPPORTED_LANGUAGE_OPTIONS.some((option) => option.value === preferredLanguage)
    ? preferredLanguage
    : 'en';

  select.value = normalizedLanguage;
  return normalizedLanguage;
}
