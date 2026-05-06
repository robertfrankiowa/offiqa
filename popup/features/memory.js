// ===== GHI NHỚ =====
let currentScope = 'page';
let currentUrl = '';
let currentDomain = '';
let editingPageNoteId = '';
let activePageContext = buildPageContext(null);
let pageContextRefreshQueued = false;

function updateBookmarkSaveState() {
  const saveBtn = document.getElementById('btn-save-current');
  const groupSelect = document.getElementById('bm-target-group');
  const statusEl = document.getElementById('bookmark-context-status');
  if (!saveBtn || !groupSelect || !statusEl) return;

  const hasGroups = getBookmarkSaveGroups().length > 0;
  const hasValidPage = activePageContext.isValid;

  groupSelect.disabled = !hasValidPage || !hasGroups;
  saveBtn.disabled = !hasValidPage || !hasGroups;
  saveBtn.textContent = popupUiText('bookmarks.saveThisPage');

  if (!hasValidPage) {
    statusEl.textContent = popupUiText('bookmarks.invalidPage');
    return;
  }

  if (!hasGroups) {
    statusEl.textContent = popupUiText('bookmarks.needGroup');
    return;
  }

  statusEl.textContent = popupUiText('bookmarks.ready');
}

function renderPageContextPreview(prefix) {
  const container = document.getElementById(`${prefix}-context`);
  const titleEl = document.getElementById(`${prefix}-context-title`);
  const metaEl = document.getElementById(`${prefix}-context-meta`);
  if (!container || !titleEl || !metaEl) return;

  if (!activePageContext.isValid) {
    container.hidden = true;
    titleEl.textContent = '';
    metaEl.textContent = '';
    return;
  }

  titleEl.textContent = activePageContext.title || activePageContext.domain || activePageContext.url;
  metaEl.textContent = activePageContext.domain || activePageContext.url;
  container.hidden = false;
}

async function refreshActivePageContext({ resetNoteEditor = false } = {}) {
  activePageContext = buildPageContext(await getContextTab());

  if (resetNoteEditor) {
    editingPageNoteId = '';
  }

  if (resetNoteEditor || !editingPageNoteId || !activePageContext.isValid) {
    currentUrl = activePageContext.url;
    currentDomain = activePageContext.domain;
  }

  renderPageContextPreview('page-note');
  renderPageContextPreview('bookmark-page');
  updateBookmarkSaveState();
  await syncCurrentNoteEditor();
}

function queuePageContextRefresh(options = {}) {
  if (pageContextRefreshQueued) return;
  pageContextRefreshQueued = true;
  setTimeout(async () => {
    pageContextRefreshQueued = false;
    await refreshActivePageContext(options);
  }, 0);
}

async function initMemoryTab() {
  await refreshActivePageContext({ resetNoteEditor: true });
}

function getNoteKey(scope = currentScope) {
  return scope === 'page' ? currentUrl : currentDomain;
}

function getNoteId(note) {
  return note?.id || `${note?.scope || ''}::${note?.key || ''}::${Number(note?.created || note?.updated || 0)}`;
}

function setActiveNoteScope(scope) {
  currentScope = scope === 'domain' ? 'domain' : 'page';
  document.querySelectorAll('.scope-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.scope === currentScope);
  });
}

function sortNotesByNewest(notes) {
  return [...notes].sort((a, b) => Number(b?.updated || 0) - Number(a?.updated || 0));
}

function createPageNoteId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `page_note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePageNote(note) {
  const created = Number(note?.created || note?.updated || Date.now());
  const updated = Number(note?.updated || created);
  return {
    ...note,
    id: note?.id || `${note?.scope || ''}::${note?.key || ''}::${created}`,
    key: typeof note?.key === 'string' ? note.key : '',
    scope: note?.scope === 'domain' ? 'domain' : 'page',
    text: typeof note?.text === 'string' ? note.text.trim() : '',
    url: typeof note?.url === 'string' ? note.url : '',
    domain: typeof note?.domain === 'string' ? note.domain : '',
    created,
    updated
  };
}

function normalizePageNotes(notes) {
  return (Array.isArray(notes) ? notes : [])
    .map(normalizePageNote)
    .filter((note) => note.key && note.text);
}

function getNotesForContext(notes, scope = currentScope, key = getNoteKey(scope)) {
  return sortNotesByNewest(
    normalizePageNotes(notes).filter((note) => note.scope === scope && note.key === key)
  );
}

function formatNoteUpdated(timestamp) {
  if (!timestamp) return '';
  try {
    return new Intl.DateTimeFormat(getPopupLanguageLocale(), {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit'
    }).format(timestamp);
  } catch {
    return new Date(timestamp).toLocaleString();
  }
}

function findNoteByScopeAndKey(notes, scope, key) {
  return notes.find((note) => note?.scope === scope && note?.key === key) || null;
}

function getNoteScopeLabel() {
  return currentScope === 'domain' ? popupUiText('pageNote.domainScope') : popupUiText('pageNote.pageScope');
}

async function syncCurrentNoteEditor() {
  const noteInput = document.getElementById('page-note-text');
  const statusEl = document.getElementById('page-note-status');
  const saveBtn = document.getElementById('btn-save-note');
  const resetBtn = document.getElementById('btn-reset-note-editor');
  const gotoBtn = document.getElementById('btn-goto-page');
  const scopeButtons = Array.from(document.querySelectorAll('.scope-btn'));
  if (!noteInput || !statusEl || !saveBtn || !resetBtn || !gotoBtn) return;

  const key = getNoteKey();
  if (!activePageContext.isValid || !key) {
    noteInput.value = '';
    noteInput.disabled = true;
    saveBtn.disabled = true;
    saveBtn.textContent = popupUiText('pageNote.saveAdd');
    gotoBtn.disabled = true;
    scopeButtons.forEach((button) => {
      button.disabled = true;
    });
    statusEl.textContent = popupUiText('pageNote.invalidPage');
    resetBtn.hidden = true;
    return;
  }

  const data = await store.get(['page_notes']);
  const notes = normalizePageNotes(data.page_notes || []);
  const contextNotes = getNotesForContext(notes, currentScope, key);
  const editingNote = notes.find((note) => getNoteId(note) === editingPageNoteId) || null;

  noteInput.disabled = false;
  saveBtn.disabled = false;
  gotoBtn.disabled = false;
  scopeButtons.forEach((button) => {
    button.disabled = false;
  });
  if (editingNote) {
    noteInput.value = editingNote.text || '';
    saveBtn.textContent = popupUiText('pageNote.saveUpdate');
    statusEl.textContent = popupUiText('pageNote.editingStatus', { scope: getNoteScopeLabel() });
    resetBtn.hidden = false;
    resetBtn.textContent = popupUiText('pageNote.cancelEdit');
    return;
  }

  noteInput.value = '';
  saveBtn.textContent = popupUiText('pageNote.saveAdd');
  statusEl.textContent = contextNotes.length > 0
    ? popupUiText('pageNote.existingStatus', { count: contextNotes.length, scope: getNoteScopeLabel() })
    : popupUiText('pageNote.emptyForScope', { scope: getNoteScopeLabel() });
  resetBtn.hidden = true;
  resetBtn.textContent = popupUiText('pageNote.reset');
}

document.getElementById('btn-goto-page').addEventListener('click', async () => {
  const tab = await getContextTab();
  const targetUrl = tab?.url || currentUrl;
  if (!isTrackableUrl(targetUrl)) {
    showToast(popupUiText('pageNote.toastOpenMissing'));
    return;
  }

  if (typeof tab?.id === 'number') {
    chrome.tabs.update(tab.id, { active: true, url: targetUrl });
    if (typeof tab.windowId === 'number' && chrome.windows?.update) {
      chrome.windows.update(tab.windowId, { focused: true });
    }
    return;
  }

  chrome.tabs.create({ url: targetUrl });
});

document.querySelectorAll('.scope-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    setActiveNoteScope(btn.dataset.scope);
    editingPageNoteId = '';
    await syncCurrentNoteEditor();
  });
});

document.getElementById('btn-reset-note-editor').addEventListener('click', () => {
  const noteInput = document.getElementById('page-note-text');
  const statusEl = document.getElementById('page-note-status');
  const saveBtn = document.getElementById('btn-save-note');
  const resetBtn = document.getElementById('btn-reset-note-editor');
  if (!noteInput || !statusEl || !saveBtn || !resetBtn) return;

  editingPageNoteId = '';
  noteInput.value = '';
  noteInput.focus();
  saveBtn.textContent = popupUiText('pageNote.saveAdd');
  resetBtn.hidden = true;
  statusEl.textContent = popupUiText('pageNote.addingStatus', { scope: getNoteScopeLabel() });
});

function sendPageNoteBadgeRefresh(tabId) {
  return new Promise((resolve) => {
    if (!chrome.tabs?.sendMessage || typeof tabId !== 'number') {
      resolve(false);
      return;
    }

    chrome.tabs.sendMessage(tabId, { type: 'offiqa:refresh-page-note-badge' }, (response) => {
      if (chrome.runtime.lastError) {
        resolve(false);
        return;
      }
      resolve(Boolean(response?.ok));
    });
  });
}

function injectPageNoteBadge(tabId) {
  return new Promise((resolve) => {
    if (!chrome.scripting?.executeScript || typeof tabId !== 'number') {
      resolve(false);
      return;
    }

    chrome.scripting.executeScript({
      target: { tabId },
      files: [
        'i18n/en.js',
        'i18n/es.js',
        'i18n/vi.js',
        'content/page-note-badge.js'
      ]
    }, () => {
      resolve(!chrome.runtime.lastError);
    });
  });
}

async function refreshPageNoteBadgeOnActivePage(tab = activePageContext.tab) {
  const tabId = tab?.id;
  const tabUrl = tab?.url || currentUrl;
  if (typeof tabId !== 'number' || !isSupportedPageUrl(tabUrl)) return;

  const refreshed = await sendPageNoteBadgeRefresh(tabId);
  if (!refreshed) {
    await injectPageNoteBadge(tabId);
  }
}

document.getElementById('btn-save-note').addEventListener('click', async () => {
  const text = document.getElementById('page-note-text').value.trim();
  if (!text) return;

  await refreshActivePageContext();
  if (!activePageContext.isValid) {
    showToast(popupUiText('pageNote.toastUnsupported'));
    return;
  }

  const data = await store.get(['page_notes']);
  const notes = normalizePageNotes(data.page_notes || []);
  const key = getNoteKey();
  if (!key) {
    showToast(popupUiText('pageNote.toastMissingUrl'));
    return;
  }
  const existing = notes.findIndex((note) => getNoteId(note) === editingPageNoteId);
  if (existing >= 0) {
    notes[existing] = {
      ...notes[existing],
      text,
      updated: Date.now()
    };
  } else {
    notes.push({
      id: createPageNoteId(),
      key,
      scope: currentScope,
      text,
      url: currentUrl,
      domain: currentDomain,
      created: Date.now(),
      updated: Date.now()
    });
  }
  await store.set({ page_notes: notes });
  await refreshPageNoteBadgeOnActivePage();
  editingPageNoteId = '';
  await syncCurrentNoteEditor();
  await loadNotes();
  showToast(existing >= 0 ? popupUiText('pageNote.toastUpdated') : popupUiText('pageNote.toastAdded'));
});

async function loadNotes() {
  const data = await store.get(['page_notes', 'memories']);
  const notes = normalizePageNotes(data.page_notes || []);
  const sortedNotes = sortNotesByNewest(notes);
  const el = document.getElementById('saved-notes-list');
  
  if (sortedNotes.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">\u{1F4DD}</div>${escapeHtml(popupUiText('pageNote.savedEmpty'))}</div>`;
  } else {
    el.innerHTML = sortedNotes.map((n) => `
      <div class="note-item">
        <div class="note-item-main">
          <div class="note-item-meta">
            <span class="note-scope-badge note-scope-badge-${n.scope === 'domain' ? 'domain' : 'page'}">${escapeHtml(n.scope === 'domain' ? popupUiText('pageNote.domainScope') : popupUiText('pageNote.pageScope'))}</span>
            <div class="note-item-url">${n.scope === 'domain' ? '\u{1F310} ' : '\u{1F517} '}${escapeHtml((n.key || '').substring(0, 40))}</div>
            <div class="note-item-updated">${escapeHtml(formatNoteUpdated(n.updated))}</div>
          </div>
          <div class="note-item-text">${escapeHtml(n.text)}</div>
        </div>
        <div class="note-item-actions">
          <button type="button" class="btn note-item-edit" data-action="edit-note" data-note-id="${encodeURIComponent(getNoteId(n))}">${escapeHtml(popupUiText('common.edit'))}</button>
          <button type="button" class="note-item-del" data-action="delete-note" data-note-id="${encodeURIComponent(getNoteId(n))}">&times;</button>
        </div>
      </div>
    `).join('');
  }

  const memories = data.memories || [];
  renderMemories(memories);
}

window.deleteNote = async (noteId) => {
  const data = await store.get(['page_notes']);
  const notes = normalizePageNotes(data.page_notes || []);
  const targetId = decodeURIComponent(noteId);
  const nextNotes = notes.filter((note) => getNoteId(note) !== targetId);
  if (nextNotes.length === notes.length) return;
  if (editingPageNoteId === targetId) editingPageNoteId = '';
  await store.set({ page_notes: nextNotes });
  await syncCurrentNoteEditor();
  await loadNotes();
};

window.editNote = async (noteId) => {
  const data = await store.get(['page_notes']);
  const notes = data.page_notes || [];
  const targetId = decodeURIComponent(noteId);
  const note = notes.find((item) => getNoteId(item) === targetId);
  if (!note) return;

  currentUrl = note.scope === 'page' ? (note.key || note.url || currentUrl) : (note.url || currentUrl);
  currentDomain = note.scope === 'domain' ? (note.key || note.domain || currentDomain) : (note.domain || currentDomain);
  setActiveNoteScope(note.scope);
  editingPageNoteId = getNoteId(note);
  await syncCurrentNoteEditor();
  document.getElementById('page-note-text').focus();
  document.getElementById('page-notes-card')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
};

function renderMemories(memories) {
  const el = document.getElementById('memory-list');
  if (memories.length === 0) {
    el.innerHTML = '';
    return;
  }
  const typeEmoji = { note: '\u{1F4DD}', reminder: '\u23F0', checklist: '\u2611\uFE0F', plan: '\u{1F5D3}' };
  const typeLabel = getMemoryTypeLabels();
  el.innerHTML = memories.filter(m => !m.deleted).map((m, i) => `
    <div class="memory-item">
      <div class="memory-item-header">
        <span class="memory-type-badge">${typeEmoji[m.type] || '\u{1F4DD}'} ${typeLabel[m.type] || 'Note'}</span>
        ${m.due ? `<span class="memory-item-due">\u{1F4C5} ${m.due}</span>` : ''}
        <button type="button" class="note-item-del" data-action="delete-memory" data-index="${i}">&times;</button>
      </div>
      <div style="font-size:12.5px">${escapeHtml(m.text)}</div>
    </div>
  `).join('');
}

function setMemoryFilter(filter, { syncSelect = false } = {}) {
  currentMemoryFilter = MEMORY_FILTERS.includes(filter) ? filter : 'all';
  document.querySelectorAll('.memory-filter-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.filter === currentMemoryFilter);
  });

  if (syncSelect && currentMemoryFilter !== 'all') {
    const select = document.getElementById('memory-type');
    if (select) select.value = currentMemoryFilter;
  }
}

function renderMemories(memories) {
  const el = document.getElementById('memory-list');
  const visibleMemories = (memories || [])
    .map((memory, index) => ({ memory, index }))
    .filter(({ memory }) => memory && !memory.deleted)
    .filter(({ memory }) => currentMemoryFilter === 'all' || memory.type === currentMemoryFilter);

  if (visibleMemories.length === 0) {
    el.innerHTML = `<div class="memory-empty-state">${getMemoryEmptyLabel()}</div>`;
    return;
  }
  const typeEmoji = { note: '\u{1F4DD}', reminder: '\u23F0', checklist: '\u2611\uFE0F', plan: '\u{1F5D3}' };
  const typeLabel = getMemoryTypeLabels();
  el.innerHTML = visibleMemories.map(({ memory: m, index }) => `
    <div class="memory-item">
      <div class="memory-item-header">
        <span class="memory-type-badge">${typeEmoji[m.type] || '\u{1F4DD}'} ${typeLabel[m.type] || 'Note'}</span>
        ${m.due ? `<span class="memory-item-due">\u{1F4C5} ${m.due}</span>` : ''}
        <button type="button" class="note-item-del" data-action="delete-memory" data-index="${index}">&times;</button>
      </div>
      <div style="font-size:12.5px">${escapeHtml(m.text)}</div>
    </div>
  `).join('');
}

function renderMemories(memories) {
  const el = document.getElementById('memory-list');
  const visibleMemories = (memories || [])
    .map((memory, index) => ({ memory, index }))
    .filter(({ memory }) => memory && !memory.deleted)
    .filter(({ memory }) => currentMemoryFilter === 'all' || memory.type === currentMemoryFilter);

  if (visibleMemories.length === 0) {
    el.innerHTML = `<div class="memory-empty-state">${getMemoryEmptyLabel()}</div>`;
    return;
  }

  const typeLabel = getMemoryTypeLabels();
  el.innerHTML = visibleMemories.map(({ memory: m, index }) => `
    <div class="memory-item">
      <div class="memory-item-header">
        <span class="memory-type-badge">${typeLabel[m.type] || 'Note'}</span>
        ${m.due ? `<span class="memory-item-due">${m.due}</span>` : ''}
        <button type="button" class="note-item-del" data-action="delete-memory" data-index="${index}">&times;</button>
      </div>
      <div style="font-size:12.5px">${escapeHtml(m.text)}</div>
    </div>
  `).join('');
}

function getChecklistItems(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]+|\[[ xX]?\]|[0-9]+[.)]|[a-zA-Z][.)]|☐|☑|✓|✔)\s*/, '').trim())
    .filter(Boolean);
}

function normalizeMemoryText(type, text) {
  if (type !== 'checklist') return String(text || '').trim();
  return getChecklistItems(text).join('\n');
}

function normalizeReminderAdvanceUnit(unit) {
  return ['minutes', 'hours', 'days'].includes(unit) ? unit : 'minutes';
}

function normalizeReminderAdvanceValue(value) {
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric) || numeric <= 0) return '';
  return String(Math.min(numeric, 999));
}

function getReminderAdvanceLabel(memory) {
  if (!memory || memory.type !== 'reminder') return '';
  const value = normalizeReminderAdvanceValue(memory.advanceValue);
  if (!value) return '';
  const unit = normalizeReminderAdvanceUnit(memory.advanceUnit);
  const units = getPopupUiValue('memory.units') || {};
  const unitLabel = units[unit] || unit;
  return popupUiText('memory.reminderAdvanceTemplate', { value, unit: unitLabel });
}

function renderChecklistHtml(items, { compact = false } = {}) {
  const visibleItems = compact ? items.slice(0, 6) : items;
  const moreCount = items.length - visibleItems.length;

  return `
    <div class="memory-checklist${compact ? ' is-compact' : ''}">
      ${visibleItems.map((item) => `
        <div class="memory-checklist-item">
          <span class="memory-checklist-box" aria-hidden="true"></span>
          <span class="memory-checklist-label">${escapeHtml(item)}</span>
        </div>
      `).join('')}
      ${moreCount > 0 ? `<div class="memory-checklist-more">+${moreCount} more</div>` : ''}
    </div>
  `;
}

function renderMemoryBody(memory, { compact = false } = {}) {
  if (memory.type === 'checklist') {
    const items = getChecklistItems(memory.text);
    if (items.length) return renderChecklistHtml(items, { compact });
  }

  return `<div class="memory-body-text">${escapeHtml(memory.text || '').replace(/\n/g, '<br>')}</div>`;
}

function applyMemoryComposerMode() {
  const type = document.getElementById('memory-type')?.value || 'note';
  const textarea = document.getElementById('memory-text');
  const scheduleRow = document.getElementById('memory-schedule-row');
  const advanceRow = document.getElementById('memory-advance-row');
  if (!textarea) return;

  const isChecklist = type === 'checklist';
  const showSchedule = type === 'reminder' || type === 'plan';
  textarea.classList.toggle('checklist-editor', isChecklist);
  textarea.rows = isChecklist ? 6 : 3;
  textarea.placeholder = isChecklist
    ? 'One task per line\nCall customer\nUpdate CRM\nSend follow-up'
    : 'Write something to remember...';
  if (scheduleRow) scheduleRow.hidden = !showSchedule;
  if (advanceRow) advanceRow.hidden = type !== 'reminder';
}

function renderMemories(memories) {
  const el = document.getElementById('memory-list');
  const visibleMemories = (memories || [])
    .map((memory, index) => ({ memory, index }))
    .filter(({ memory }) => memory && !memory.deleted)
    .filter(({ memory }) => currentMemoryFilter === 'all' || memory.type === currentMemoryFilter);

  if (visibleMemories.length === 0) {
    el.innerHTML = `<div class="memory-empty-state">${getMemoryEmptyLabel()}</div>`;
    return;
  }

  const typeLabel = getMemoryTypeLabels();
  el.innerHTML = visibleMemories.map(({ memory, index }) => `
    <div class="memory-item memory-item-${memory.type}">
      <div class="memory-item-header">
        <div class="memory-item-meta">
          <span class="memory-type-badge">${typeLabel[memory.type] || 'Note'}</span>
          ${memory.due ? `<span class="memory-item-due">${memory.due}</span>` : ''}
          ${memory.dueTime ? `<span class="memory-item-due">${memory.dueTime}</span>` : ''}
          ${getReminderAdvanceLabel(memory) ? `<span class="memory-item-due">${escapeHtml(getReminderAdvanceLabel(memory))}</span>` : ''}
        </div>
        <button type="button" class="note-item-del" data-action="delete-memory" data-index="${index}">&times;</button>
      </div>
      ${renderMemoryBody(memory)}
    </div>
  `).join('');
}

function attachNativeDatePicker(input) {
  if (!input || input.dataset.datePickerBound === '1') return;
  input.dataset.datePickerBound = '1';

  const openPicker = () => {
    if (input.disabled || typeof input.showPicker !== 'function') return;
    try {
      input.showPicker();
    } catch (_) {}
  };

  input.addEventListener('click', openPicker);
  input.addEventListener('keydown', (e) => {
    const shouldOpen = e.key === 'Enter' || e.key === ' ' || (e.key === 'ArrowDown' && e.altKey);
    if (!shouldOpen) return;
    e.preventDefault();
    openPicker();
  });
}

attachNativeDatePicker(document.getElementById('memory-due'));
setMemoryFilter(currentMemoryFilter, { syncSelect: true });
applyMemoryComposerMode();

document.getElementById('btn-save-memory').addEventListener('click', async () => {
  const type = document.getElementById('memory-type').value;
  const text = normalizeMemoryText(type, document.getElementById('memory-text').value);
  if (!text) return;
  const showSchedule = type === 'reminder' || type === 'plan';
  const due = showSchedule ? document.getElementById('memory-due').value.trim() : '';
  const dueTime = showSchedule ? document.getElementById('memory-due-time').value.trim() : '';
  const advanceValue = normalizeReminderAdvanceValue(document.getElementById('memory-advance-input').value);
  const advanceUnit = normalizeReminderAdvanceUnit(document.getElementById('memory-advance-unit').value);
  const data = await store.get(['memories']);
  const memories = data.memories || [];
  memories.push({
    id: Date.now().toString(),
    type,
    text,
    due,
    dueTime,
    ...(type === 'reminder' ? { advanceValue, advanceUnit } : {}),
    created: Date.now()
  });
  await store.set({ memories });
  document.getElementById('memory-text').value = '';
  document.getElementById('memory-due').value = '';
  document.getElementById('memory-due-time').value = '';
  document.getElementById('memory-advance-input').value = '';
  document.getElementById('memory-advance-unit').value = 'minutes';
  renderMemories(memories);
  showToast('Đã lưu');
});

document.getElementById('memory-type').addEventListener('change', () => {
  applyMemoryComposerMode();
});

document.getElementById('btn-memory-trash').addEventListener('click', async () => {
  const data = await store.get(['memories']);
  const memories = (data.memories || []).filter(m => !m.deleted);
  if (memories.length === 0) { showToast('Không có gì để xóa'); return; }
  if (confirm(translatePopupTextValue(`Xóa ${memories.length} ghi nhớ?`))) {
    await store.set({ memories: [] });
    renderMemories([]);
    showToast('Đã xóa');
  }
});

window.deleteMemory = async (i) => {
  const data = await store.get(['memories']);
  const memories = data.memories || [];
  memories.splice(i, 1);
  await store.set({ memories });
  renderMemories(memories);
};

document.getElementById('memory-filter-row').addEventListener('click', async (e) => {
  const button = e.target.closest('.memory-filter-btn[data-filter]');
  if (!button) return;
  setMemoryFilter(button.dataset.filter);
  const data = await store.get(['memories']);
  renderMemories(data.memories || []);
});
