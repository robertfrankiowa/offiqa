(() => {
  const READY_KEY = '__OFFIQA_PAGE_NOTE_BADGE_READY__';
  const READY_VERSION = '2026-04-29-page-note-badge-v4';
  const REFRESH_EVENT = 'offiqa:page-notes-refresh';
  if (globalThis[READY_KEY] === READY_VERSION) {
    window.dispatchEvent(new Event(REFRESH_EVENT));
    return;
  }
  globalThis[READY_KEY] = READY_VERSION;

  const ROOT_ID = 'offiqa-page-note-badge-root';
  const PAGE_NOTE_I18N = Object.fromEntries(Object.entries(globalThis.OFFIQA_I18N_PACKS || {}).map(([lang, pack]) => [lang, pack.content?.pageNote || {}]));
  const FALLBACK_COPY = {
    addLabel: 'Add note',
    cancel: 'Cancel',
    save: 'Save',
    createStatus: 'Add a new note for the current item.',
    editStatus: 'Editing the selected note.',
    titlePage: 'Offiqa page note',
    titleDomain: 'Offiqa site note',
    edit: 'Edit',
    deleteAria: 'Delete note',
    collapseLabel: 'Collapse notes',
    expandLabel: 'Expand notes',
    emptyContent: 'Note content cannot be empty.',
    saving: 'Saving...',
    updateMissing: 'Could not find the note to update.',
    countTemplate: '{count} notes, newest first'
  };

  let editingNoteId = '';
  let isCreatingNote = false;
  let isCollapsed = false;
  let activeScope = 'page';
  let currentLanguage = 'en';

  function normalizeLanguage(lang) {
    return ['en', 'es', 'vi'].includes(lang) ? lang : 'en';
  }

  function getCopy() {
    return PAGE_NOTE_I18N[currentLanguage] || PAGE_NOTE_I18N.en || FALLBACK_COPY;
  }

  function getLanguageLocale() {
    if (currentLanguage === 'es') return 'es-ES';
    if (currentLanguage === 'vi') return 'vi-VN';
    return 'en-US';
  }

  function getStorage(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  }

  function setStorage(data) {
    return new Promise((resolve) => chrome.storage.local.set(data, resolve));
  }

  function getCurrentContext() {
    return {
      url: window.location.href,
      domain: window.location.hostname
    };
  }

  function normalizeUrlForMatch(url) {
    try {
      const parsed = new URL(url);
      parsed.hash = '';
      parsed.hostname = parsed.hostname.toLowerCase();
      const normalized = parsed.href;
      return normalized.endsWith('/') && parsed.pathname === '/' && !parsed.search
        ? normalized.slice(0, -1)
        : normalized;
    } catch {
      return String(url || '').replace(/#.*$/, '').replace(/\/$/, '').toLowerCase();
    }
  }

  function normalizeDomainForMatch(domain) {
    return String(domain || '').trim().toLowerCase().replace(/^www\./, '');
  }

  function isPageNoteMatch(note, currentUrl) {
    return note.scope === 'page' && normalizeUrlForMatch(note.key || note.url) === normalizeUrlForMatch(currentUrl);
  }

  function isDomainNoteMatch(note, currentDomain) {
    if (note.scope !== 'domain') return false;
    const noteDomain = normalizeDomainForMatch(note.key || note.domain);
    const pageDomain = normalizeDomainForMatch(currentDomain);
    return Boolean(
      noteDomain &&
      pageDomain &&
      (noteDomain === pageDomain || pageDomain.endsWith(`.${noteDomain}`) || noteDomain.endsWith(`.${pageDomain}`))
    );
  }

  function getNoteId(note) {
    return note?.id || `${note?.scope || ''}::${note?.key || ''}::${Number(note?.created || note?.updated || 0)}`;
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

  function sortNotesByNewest(notes) {
    return [...notes].sort((a, b) => Number(b?.updated || 0) - Number(a?.updated || 0));
  }

  function findMatchingNotes(notes) {
    const { url, domain } = getCurrentContext();
    const normalizedNotes = normalizePageNotes(notes);
    const pageNotes = sortNotesByNewest(normalizedNotes.filter((note) => isPageNoteMatch(note, url)));
    if (pageNotes.length > 0) return pageNotes;
    return sortNotesByNewest(normalizedNotes.filter((note) => isDomainNoteMatch(note, domain)));
  }

  function formatNoteUpdated(timestamp) {
    if (!timestamp) return '';
    try {
      return new Intl.DateTimeFormat(getLanguageLocale(), {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit'
      }).format(timestamp);
    } catch {
      return new Date(timestamp).toLocaleString();
    }
  }

  function ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (root) return root;

    root = document.createElement('div');
    root.id = ROOT_ID;
    root.style.all = 'initial';
    root.style.position = 'fixed';
    root.style.right = '12px';
    root.style.bottom = '12px';
    root.style.zIndex = '2147483647';

    const copy = getCopy();
    const shadow = root.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        .badge {
          display: grid;
          gap: 9px;
          width: min(330px, calc(100vw - 24px));
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(20, 83, 45, 0.16);
          background: rgba(248, 255, 250, 0.98);
          box-shadow: 0 12px 30px rgba(22, 101, 52, 0.16);
          backdrop-filter: blur(10px);
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: #14532d;
        }

        .badge.collapsed {
          width: min(255px, calc(100vw - 24px));
          padding: 9px 10px;
          border-radius: 999px;
          border-color: rgba(22, 163, 74, 0.34);
          background: linear-gradient(135deg, rgba(240, 253, 244, 0.99), rgba(236, 253, 245, 0.99));
          box-shadow: 0 14px 34px rgba(22, 101, 52, 0.24);
          gap: 0;
        }

        .badge.collapsed .note-list,
        .badge.collapsed .editor,
        .badge.collapsed [data-action="create"],
        .badge.collapsed .count {
          display: none !important;
        }

        .top {
          display: flex;
          gap: 8px;
          align-items: flex-start;
        }

        .badge.collapsed .top {
          align-items: center;
        }

        .badge.collapsed .icon {
          background: #bbf7d0;
          box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.16);
        }

        .icon {
          flex: 0 0 auto;
          width: 24px;
          height: 24px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          background: #dcfce7;
          font-size: 13px;
        }

        .content {
          min-width: 0;
          flex: 1;
        }

        .title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .title-wrap {
          display: flex;
          align-items: center;
          gap: 7px;
          min-width: 0;
        }

        .title-actions {
          display: flex;
          align-items: center;
          gap: 5px;
          flex: 0 0 auto;
        }

        .title {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0;
          text-transform: uppercase;
          color: #166534;
        }

        .note-count-badge {
          display: none;
          flex: 0 0 auto;
          min-width: 20px;
          height: 20px;
          padding: 0 7px;
          border-radius: 999px;
          background: #16a34a;
          color: #ffffff;
          font-size: 11px;
          font-weight: 800;
          line-height: 20px;
          text-align: center;
          box-shadow: 0 6px 14px rgba(22, 163, 74, 0.28);
        }

        .badge.collapsed .note-count-badge {
          display: inline-block;
        }

        .count {
          margin-top: 2px;
          font-size: 10.5px;
          color: #4b5563;
        }

        .btn {
          border: 1px solid rgba(22, 101, 52, 0.16);
          background: #ffffff;
          color: #166534;
          border-radius: 999px;
          padding: 5px 10px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
        }

        .btn:hover {
          background: #f0fdf4;
          border-color: rgba(22, 101, 52, 0.28);
          transform: translateY(-1px);
        }

        .btn-primary {
          background: #16a34a;
          border-color: #16a34a;
          color: #fff;
        }

        .btn-primary:hover {
          background: #15803d;
          border-color: #15803d;
        }

        .icon-btn {
          position: relative;
          width: 30px;
          height: 30px;
          padding: 0;
          display: inline-grid;
          place-items: center;
          font-size: 18px;
          line-height: 1;
        }

        .collapse-btn {
          width: 26px;
          height: 26px;
          font-size: 13px;
        }

        .tooltip {
          position: absolute;
          right: 0;
          bottom: calc(100% + 8px);
          padding: 6px 9px;
          border-radius: 10px;
          background: rgba(17, 24, 39, 0.96);
          color: #ffffff;
          font-size: 11px;
          font-weight: 600;
          white-space: nowrap;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.22);
          opacity: 0;
          pointer-events: none;
          transform: translateY(4px);
          transition: opacity 0.15s ease, transform 0.15s ease;
        }

        .tooltip::after {
          content: "";
          position: absolute;
          top: 100%;
          right: 12px;
          border-width: 5px;
          border-style: solid;
          border-color: rgba(17, 24, 39, 0.96) transparent transparent transparent;
        }

        .icon-btn:hover .tooltip,
        .icon-btn:focus-visible .tooltip {
          opacity: 1;
          transform: translateY(0);
        }

        .note-list {
          display: grid;
          gap: 7px;
          max-height: 176px;
          overflow-y: auto;
          padding-right: 2px;
        }

        .note-entry {
          display: grid;
          gap: 5px;
          padding: 8px 10px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.78);
          border: 1px solid rgba(22, 101, 52, 0.1);
        }

        .note-entry-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .note-entry-time {
          font-size: 10.5px;
          color: #4b5563;
        }

        .note-entry-text {
          font-size: 12px;
          line-height: 1.45;
          color: #1f2937;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .note-entry-edit {
          padding: 3px 8px;
          font-size: 10.5px;
        }

        .note-entry-actions {
          display: flex;
          align-items: center;
          gap: 5px;
          flex-shrink: 0;
        }

        .note-entry-delete {
          width: 24px;
          height: 24px;
          padding: 0;
          display: inline-grid;
          place-items: center;
          font-size: 14px;
          line-height: 1;
          color: #b91c1c;
        }

        .note-entry-delete:hover {
          background: #fef2f2;
          border-color: rgba(185, 28, 28, 0.22);
          color: #991b1b;
        }

        .editor {
          display: grid;
          gap: 8px;
        }

        .editor[hidden] {
          display: none !important;
        }

        .textarea {
          width: 100%;
          min-height: 72px;
          resize: vertical;
          box-sizing: border-box;
          padding: 8px 10px;
          border-radius: 10px;
          border: 1px solid rgba(20, 83, 45, 0.18);
          background: #ffffff;
          color: #111827;
          font: inherit;
          font-size: 12px;
          line-height: 1.45;
          outline: none;
        }

        .textarea:focus {
          border-color: rgba(22, 163, 74, 0.6);
          box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.14);
        }

        .editor-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }

        .status {
          min-height: 16px;
          font-size: 11px;
          color: #4b5563;
        }

        ::-webkit-scrollbar {
          width: 4px;
        }

        ::-webkit-scrollbar-thumb {
          background: rgba(22, 101, 52, 0.2);
          border-radius: 999px;
        }
      </style>
      <div class="badge">
        <div class="top">
          <div class="icon"></div>
          <div class="content">
            <div class="title-row">
              <div class="title-wrap">
                <div class="title"></div>
                <span class="note-count-badge">0</span>
              </div>
              <div class="title-actions">
                <button type="button" class="btn icon-btn collapse-btn" data-action="toggle-collapse" aria-label="${copy.collapseLabel || FALLBACK_COPY.collapseLabel}">
                  <span class="collapse-symbol" aria-hidden="true">v</span>
                  <span class="tooltip collapse-tooltip" role="tooltip">${copy.collapseLabel || FALLBACK_COPY.collapseLabel}</span>
                </button>
                <button type="button" class="btn icon-btn" data-action="create" aria-label="${copy.addLabel}">
                  <span aria-hidden="true">+</span>
                  <span class="tooltip" role="tooltip">${copy.addLabel}</span>
                </button>
              </div>
            </div>
            <div class="count"></div>
          </div>
        </div>
        <div class="note-list"></div>
        <div class="editor" hidden>
          <textarea class="textarea" spellcheck="false"></textarea>
          <div class="editor-actions">
            <button type="button" class="btn" data-action="cancel">${copy.cancel}</button>
            <button type="button" class="btn btn-primary" data-action="save">${copy.save}</button>
          </div>
          <div class="status"></div>
        </div>
      </div>
    `;

    shadow.addEventListener('click', (event) => {
      const actionEl = event.target.closest('[data-action]');
      if (!actionEl) return;

      const action = actionEl.dataset.action;
      if (action === 'create') {
        isCollapsed = false;
        applyCollapsedState();
        openEditorForCreate();
        return;
      }
      if (action === 'toggle-collapse') {
        toggleCollapsedState();
        return;
      }
      if (action === 'edit-item') {
        isCollapsed = false;
        applyCollapsedState();
        openEditorForEdit(actionEl.dataset.noteId);
        return;
      }
      if (action === 'delete-item') {
        deleteNote(actionEl.dataset.noteId);
        return;
      }
      if (action === 'cancel') {
        closeEditor();
        return;
      }
      if (action === 'save') {
        saveCurrentNote();
      }
    });

    shadow.querySelector('.textarea').addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        saveCurrentNote();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeEditor();
      }
    });

    (document.body || document.documentElement).appendChild(root);
    applyLanguageToBadge(root);
    return root;
  }

  function applyLanguageToBadge(root = document.getElementById(ROOT_ID)) {
    const shadow = root?.shadowRoot;
    if (!shadow) return;
    const copy = getCopy();
    const createButton = shadow.querySelector('[data-action="create"]');
    const tooltip = shadow.querySelector('[data-action="create"] .tooltip');
    const cancelButton = shadow.querySelector('[data-action="cancel"]');
    const saveButton = shadow.querySelector('[data-action="save"]');
    if (createButton) createButton.setAttribute('aria-label', copy.addLabel);
    if (tooltip) tooltip.textContent = copy.addLabel;
    if (cancelButton) cancelButton.textContent = copy.cancel;
    if (saveButton) saveButton.textContent = copy.save;
    applyCollapsedState(root);
    shadow.querySelectorAll('.note-entry-edit').forEach((button) => {
      button.textContent = copy.edit;
    });
    shadow.querySelectorAll('.note-entry-delete').forEach((button) => {
      button.setAttribute('aria-label', copy.deleteAria);
      button.textContent = '×';
    });
  }

  function getCollapseLabel() {
    const copy = getCopy();
    return isCollapsed
      ? (copy.expandLabel || FALLBACK_COPY.expandLabel)
      : (copy.collapseLabel || FALLBACK_COPY.collapseLabel);
  }

  function applyCollapsedState(root = document.getElementById(ROOT_ID)) {
    const shadow = root?.shadowRoot;
    if (!shadow) return;

    const badge = shadow.querySelector('.badge');
    const button = shadow.querySelector('[data-action="toggle-collapse"]');
    const symbol = shadow.querySelector('.collapse-symbol');
    const tooltip = shadow.querySelector('.collapse-tooltip');
    const label = getCollapseLabel();

    if (badge) badge.classList.toggle('collapsed', isCollapsed);
    if (button) button.setAttribute('aria-label', label);
    if (symbol) symbol.textContent = isCollapsed ? '^' : 'v';
    if (tooltip) tooltip.textContent = label;
  }

  function toggleCollapsedState() {
    isCollapsed = !isCollapsed;
    if (isCollapsed) closeEditor();
    applyCollapsedState();
  }

  function removeRoot() {
    const root = document.getElementById(ROOT_ID);
    if (root) root.remove();
    editingNoteId = '';
    isCreatingNote = false;
    isCollapsed = false;
    activeScope = 'page';
  }

  function setStatus(message) {
    const root = document.getElementById(ROOT_ID);
    const statusEl = root?.shadowRoot?.querySelector('.status');
    if (statusEl) statusEl.textContent = message || '';
  }

  function closeEditor() {
    const root = document.getElementById(ROOT_ID);
    const shadow = root?.shadowRoot;
    if (!shadow) return;

    editingNoteId = '';
    isCreatingNote = false;
    shadow.querySelector('.editor').hidden = true;
    setStatus('');
  }

  function openEditorForCreate() {
    const root = document.getElementById(ROOT_ID);
    const shadow = root?.shadowRoot;
    if (!shadow) return;

    isCreatingNote = true;
    editingNoteId = '';
    const textarea = shadow.querySelector('.textarea');
    textarea.value = '';
    shadow.querySelector('.editor').hidden = false;
    setStatus(getCopy().createStatus);
    textarea.focus();
  }

  async function openEditorForEdit(noteId) {
    const data = await getStorage(['page_notes']);
    const notes = normalizePageNotes(data.page_notes || []);
    const note = notes.find((item) => getNoteId(item) === decodeURIComponent(noteId));
    if (!note) return;

    const root = document.getElementById(ROOT_ID);
    const shadow = root?.shadowRoot;
    if (!shadow) return;

    isCreatingNote = false;
    editingNoteId = getNoteId(note);
    const textarea = shadow.querySelector('.textarea');
    textarea.value = note.text || '';
    shadow.querySelector('.editor').hidden = false;
    setStatus(getCopy().editStatus);
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }

  function renderNotes(notes) {
    if (!notes.length) {
      removeRoot();
      return;
    }

    const root = ensureRoot();
    const shadow = root.shadowRoot;
    activeScope = notes[0].scope === 'domain' ? 'domain' : 'page';

    shadow.querySelector('.icon').textContent = activeScope === 'domain' ? '🌐' : '🔗';
    const copy = getCopy();
    shadow.querySelector('.title').textContent = activeScope === 'domain' ? copy.titleDomain : copy.titlePage;
    shadow.querySelector('.count').textContent = (copy.countTemplate || '{count} notes').replace('{count}', notes.length);
    shadow.querySelector('.note-count-badge').textContent = String(notes.length);
    applyCollapsedState(root);
    shadow.querySelector('.note-list').innerHTML = notes.map((note) => `
      <div class="note-entry">
        <div class="note-entry-head">
          <div class="note-entry-time">${formatNoteUpdated(note.updated)}</div>
          <div class="note-entry-actions">
            <button type="button" class="btn note-entry-edit" data-action="edit-item" data-note-id="${encodeURIComponent(getNoteId(note))}">${copy.edit}</button>
            <button type="button" class="btn note-entry-delete" data-action="delete-item" data-note-id="${encodeURIComponent(getNoteId(note))}" aria-label="${copy.deleteAria}">×</button>
          </div>
        </div>
        <div class="note-entry-text">${escapeHtml(note.text)}</div>
      </div>
    `).join('');
    shadow.querySelectorAll('.note-entry-delete').forEach((button) => {
      button.setAttribute('aria-label', copy.deleteAria);
      button.textContent = '×';
    });

    shadow.querySelector('.editor').hidden = !isCreatingNote && !editingNoteId;
    if (!isCreatingNote && !editingNoteId) {
      shadow.querySelector('.textarea').value = '';
      setStatus('');
    }
  }

  async function saveCurrentNote() {
    const root = document.getElementById(ROOT_ID);
    const shadow = root?.shadowRoot;
    if (!shadow) return;

    const textarea = shadow.querySelector('.textarea');
    const nextText = String(textarea.value || '').trim();
    if (!nextText) {
      setStatus(getCopy().emptyContent);
      textarea.focus();
      return;
    }

    setStatus(getCopy().saving);
    const data = await getStorage(['page_notes']);
    const notes = normalizePageNotes(data.page_notes || []);
    if (editingNoteId) {
      const index = notes.findIndex((note) => getNoteId(note) === editingNoteId);
      if (index < 0) {
        setStatus(getCopy().updateMissing);
        return;
      }
      notes[index] = {
        ...notes[index],
        text: nextText,
        updated: Date.now()
      };
    } else {
      const context = getCurrentContext();
      notes.push({
        id: createPageNoteId(),
        scope: activeScope,
        key: activeScope === 'domain' ? context.domain : context.url,
        text: nextText,
        url: context.url,
        domain: context.domain,
        created: Date.now(),
        updated: Date.now()
      });
    }

    await setStorage({ page_notes: notes });
    closeEditor();
    await refreshNoteBadge();
  }

  async function deleteNote(noteId) {
    const targetId = decodeURIComponent(noteId || '');
    if (!targetId) return;

    const data = await getStorage(['page_notes']);
    const notes = normalizePageNotes(data.page_notes || []);
    const nextNotes = notes.filter((note) => getNoteId(note) !== targetId);
    if (nextNotes.length === notes.length) return;

    if (editingNoteId === targetId) {
      closeEditor();
    }

    await setStorage({ page_notes: nextNotes });
    await refreshNoteBadge();
  }

  async function refreshNoteBadge() {
    const data = await getStorage(['page_notes']);
    renderNotes(findMatchingNotes(data.page_notes || []));
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function watchHistoryChanges() {
    const wrap = (method) => {
      const original = history[method];
      if (typeof original !== 'function') return;
      history[method] = function wrappedHistoryState(...args) {
        const result = original.apply(this, args);
        setTimeout(refreshNoteBadge, 0);
        return result;
      };
    };

    wrap('pushState');
    wrap('replaceState');
    window.addEventListener('popstate', refreshNoteBadge);
    window.addEventListener('hashchange', refreshNoteBadge);
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.language) {
      currentLanguage = normalizeLanguage(changes.language.newValue);
      applyLanguageToBadge();
      refreshNoteBadge();
    }
    if (changes.page_notes) {
      refreshNoteBadge();
    }
  });

  if (chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.type !== 'offiqa:refresh-page-note-badge') return false;
      refreshNoteBadge().then(() => sendResponse({ ok: true }));
      return true;
    });
  }

  watchHistoryChanges();
  window.addEventListener(REFRESH_EVENT, refreshNoteBadge);
  const initBadge = () => {
    getStorage(['language']).then((data) => {
      currentLanguage = normalizeLanguage(data.language);
      refreshNoteBadge();
    });
  };
  if (document.body) {
    initBadge();
  } else {
    document.addEventListener('DOMContentLoaded', initBadge, { once: true });
  }
})();
