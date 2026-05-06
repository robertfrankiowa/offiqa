(() => {
  if (window.__offiqaQuickSnippetsInstalled) return;
  window.__offiqaQuickSnippetsInstalled = true;

  const ROOT_ID = 'offiqa-quick-snippets-root';
  const QUICK_SNIPPETS_STORAGE_KEY = 'quick_text_snippets';
  const ENABLE_QUICK_SNIPPETS_KEY = 'enable_quick_snippets';
  const PANEL_WIDTH = 320;
  const MAX_RESULTS = 6;
  const TRIGGER_REGEX = /(^|\s)(\/\/[^\s]+)$/;
  const QUICK_SNIPPETS_I18N = Object.fromEntries(Object.entries(globalThis.OFFIQA_I18N_PACKS || {}).map(([lang, pack]) => [lang, pack.content?.quickSnippets || {}]));

  let enabled = true;
  let snippets = [];
  let popupState = null;
  let selectedIndex = 0;
  let refreshFrameId = 0;
  let lastObservedSignature = '';
  let dismissedPopupState = null;
  let nextElementId = 1;
  const elementIds = new WeakMap();
  let currentLanguage = 'en';

  function normalizeLanguage(lang) {
    return ['en', 'es', 'vi'].includes(lang) ? lang : 'en';
  }

  function getCopy() {
    return QUICK_SNIPPETS_I18N[currentLanguage] || QUICK_SNIPPETS_I18N.en;
  }

  function getStorage(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
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

    return {
      id: typeof snippet.id === 'string' && snippet.id ? snippet.id : `snippet_${created}_${index}`,
      keyword,
      label: typeof snippet.label === 'string' && snippet.label.trim()
        ? snippet.label.trim()
        : typeof snippet.title === 'string' && snippet.title.trim()
          ? snippet.title.trim()
          : keyword,
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

  function isTextInput(element) {
    if (!(element instanceof HTMLInputElement)) return false;
    const blockedTypes = new Set(['button', 'checkbox', 'color', 'date', 'datetime-local', 'file', 'hidden', 'image', 'month', 'radio', 'range', 'reset', 'submit', 'time', 'week']);
    return !blockedTypes.has((element.type || 'text').toLowerCase());
  }

  function getEditableTarget(target) {
    if (!target || !(target instanceof Element)) return null;
    if (target.closest(`#${ROOT_ID}`)) return null;

    if (target instanceof HTMLTextAreaElement) {
      return !target.disabled && !target.readOnly ? target : null;
    }

    if (isTextInput(target)) {
      return !target.disabled && !target.readOnly ? target : null;
    }

    const editableParent = target.closest('[contenteditable]:not([contenteditable="false"])');
    if (editableParent instanceof HTMLElement && editableParent.isContentEditable) {
      return editableParent;
    }

    return null;
  }

  function getElementId(target) {
    if (!target || !(target instanceof Element)) return 0;
    if (!elementIds.has(target)) {
      elementIds.set(target, nextElementId++);
    }
    return elementIds.get(target);
  }

  function getContentSignature(target) {
    if (!target) return '';

    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      return String(target.value || '');
    }

    if (target instanceof HTMLElement && target.isContentEditable) {
      return String(target.innerText || target.textContent || '');
    }

    return '';
  }

  function syncDismissedPopupState(target) {
    if (!dismissedPopupState || !target) return;

    if (dismissedPopupState.elementId !== getElementId(target)) return;

    if (dismissedPopupState.contentSignature !== getContentSignature(target)) {
      dismissedPopupState = null;
    }
  }

  function getTargetSignature(target) {
    if (!target) return '';

    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      return [
        target.value,
        typeof target.selectionStart === 'number' ? target.selectionStart : 'na',
        typeof target.selectionEnd === 'number' ? target.selectionEnd : 'na',
        document.activeElement === target ? 'focused' : 'blurred'
      ].join('::');
    }

    if (target instanceof HTMLElement && target.isContentEditable) {
      const selection = window.getSelection();
      const anchorNode = selection?.anchorNode;
      const anchorOffset = selection?.anchorOffset;
      return [
        target.innerText || target.textContent || '',
        anchorNode && target.contains(anchorNode) ? anchorOffset : -1,
        document.activeElement === target ? 'focused' : 'blurred'
      ].join('::');
    }

    return '';
  }

  function scheduleRefresh(target, { doubleFrame = false } = {}) {
    if (refreshFrameId) {
      cancelAnimationFrame(refreshFrameId);
      refreshFrameId = 0;
    }

    const runRefresh = () => {
      const activeTarget = getEditableTarget(document.activeElement);
      refreshPopupForTarget(activeTarget || target);
    };

    refreshFrameId = requestAnimationFrame(() => {
      refreshFrameId = 0;
      if (doubleFrame) {
        refreshFrameId = requestAnimationFrame(() => {
          refreshFrameId = 0;
          runRefresh();
        });
        return;
      }
      runRefresh();
    });
  }

  function ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (root) return root;

    root = document.createElement('div');
    root.id = ROOT_ID;
    root.style.all = 'initial';
    root.style.position = 'fixed';
    root.style.left = '0';
    root.style.top = '0';
    root.style.zIndex = '2147483647';
    root.style.display = 'none';

    const shadow = root.attachShadow({ mode: 'open' });
    const copy = getCopy();
    shadow.innerHTML = `
      <style>
        .panel {
          width: ${PANEL_WIDTH}px;
          border-radius: 16px;
          border: 1px solid rgba(22, 101, 52, 0.18);
          background: rgba(255, 255, 255, 0.98);
          box-shadow: 0 20px 48px rgba(15, 23, 42, 0.18);
          backdrop-filter: blur(14px);
          overflow: hidden;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: #111827;
        }

        .head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 12px 14px 10px;
          border-bottom: 1px solid rgba(229, 231, 235, 0.9);
          background: linear-gradient(180deg, rgba(240, 253, 244, 0.95) 0%, rgba(255, 255, 255, 0.98) 100%);
        }

        .title {
          font-size: 12px;
          font-weight: 800;
          color: #166534;
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }

        .query {
          font-size: 11px;
          font-weight: 700;
          color: #4b5563;
        }

        .head-right {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .close-btn {
          width: 24px;
          height: 24px;
          border: 1px solid rgba(209, 213, 219, 0.95);
          border-radius: 999px;
          background: #ffffff;
          color: #6b7280;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 700;
          line-height: 1;
          cursor: pointer;
          padding: 0;
        }

        .close-btn:hover {
          background: #f9fafb;
          color: #111827;
          border-color: rgba(156, 163, 175, 0.95);
        }

        .list {
          display: grid;
          gap: 4px;
          padding: 8px;
          max-height: 280px;
          overflow-y: auto;
        }

        .item {
          display: grid;
          gap: 5px;
          width: 100%;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid transparent;
          background: transparent;
          text-align: left;
          cursor: pointer;
          color: inherit;
        }

        .item:hover,
        .item.is-active {
          background: #f0fdf4;
          border-color: rgba(22, 163, 74, 0.16);
        }

        .top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .trigger {
          display: inline-flex;
          align-items: center;
          padding: 3px 8px;
          border-radius: 999px;
          background: #dcfce7;
          color: #166534;
          font-size: 10.5px;
          font-weight: 800;
        }

        .label {
          font-size: 12.5px;
          font-weight: 700;
          color: #111827;
          min-width: 0;
        }

        .content {
          font-size: 12px;
          line-height: 1.45;
          color: #4b5563;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          overflow: hidden;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .footer {
          padding: 9px 12px 11px;
          border-top: 1px solid rgba(229, 231, 235, 0.9);
          background: #fafafa;
          font-size: 11px;
          color: #6b7280;
        }

        ::-webkit-scrollbar {
          width: 6px;
        }

        ::-webkit-scrollbar-thumb {
          background: rgba(148, 163, 184, 0.35);
          border-radius: 999px;
        }
      </style>
      <div class="panel" role="listbox" aria-label="Offiqa quick snippets">
        <div class="head">
          <div class="title">${copy.title}</div>
          <div class="head-right">
            <div class="query"></div>
            <button type="button" class="close-btn" data-action="close" aria-label="${copy.close}">×</button>
          </div>
        </div>
        <div class="list"></div>
        <div class="footer">${copy.footer}</div>
      </div>
    `;

    shadow.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });

    shadow.addEventListener('click', (event) => {
      const closeButton = event.target.closest('[data-action="close"]');
      if (closeButton) {
        dismissCurrentPopup();
        return;
      }

      const item = event.target.closest('.item[data-index]');
      if (!item || !popupState) return;

      const index = Number(item.dataset.index);
      if (!Number.isFinite(index)) return;
      insertSelectedSnippet(index);
    });

    document.documentElement.appendChild(root);
    applyLanguageToPopup(root);
    return root;
  }

  function applyLanguageToPopup(root = document.getElementById(ROOT_ID)) {
    const shadow = root?.shadowRoot;
    if (!shadow) return;
    const copy = getCopy();
    const titleEl = shadow.querySelector('.title');
    const closeButton = shadow.querySelector('.close-btn');
    const footerEl = shadow.querySelector('.footer');
    if (titleEl) titleEl.textContent = copy.title;
    if (closeButton) closeButton.setAttribute('aria-label', copy.close);
    if (footerEl) footerEl.textContent = copy.footer;
  }

  function hidePopup() {
    popupState = null;
    selectedIndex = 0;
    lastObservedSignature = '';
    const root = document.getElementById(ROOT_ID);
    if (root) {
      root.style.display = 'none';
    }
  }

  function dismissCurrentPopup() {
    if (!popupState?.target) {
      hidePopup();
      return;
    }

    dismissedPopupState = {
      elementId: getElementId(popupState.target),
      contentSignature: getContentSignature(popupState.target)
    };
    hidePopup();
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getMatchingSnippets(query) {
    const normalizedQuery = String(query || '').trim().toLowerCase();
    if (!normalizedQuery) return [];

    return snippets
      .map((snippet) => {
        const keyword = snippet.keyword.toLowerCase();
        const label = String(snippet.label || '').toLowerCase();
        const content = snippet.content.toLowerCase();

        let score = -1;
        if (keyword === normalizedQuery) score = 0;
        else if (keyword.startsWith(normalizedQuery)) score = 1;
        else if (label.startsWith(normalizedQuery)) score = 2;
        else if (keyword.includes(normalizedQuery)) score = 3;
        else if (label.includes(normalizedQuery)) score = 4;
        else if (content.includes(normalizedQuery)) score = 5;

        return score >= 0 ? { snippet, score } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score || Number(b.snippet.updated || 0) - Number(a.snippet.updated || 0))
      .slice(0, MAX_RESULTS)
      .map((entry) => entry.snippet);
  }

  function extractTriggerState(target) {
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      const hasSelectionApi = typeof target.selectionStart === 'number' && typeof target.selectionEnd === 'number';
      if (hasSelectionApi && target.selectionStart !== target.selectionEnd) return null;

      const value = String(target.value || '');
      const caret = hasSelectionApi ? target.selectionStart : value.length;
      const beforeText = value.slice(0, caret);
      const match = beforeText.match(TRIGGER_REGEX);
      if (!match) return null;

      const token = match[2] || '';
      return {
        type: 'text-control',
        hasSelectionApi,
        query: token.slice(2),
        replaceRange: {
          start: caret - token.length,
          end: caret
        }
      };
    }

    if (!(target instanceof HTMLElement) || !target.isContentEditable) {
      return null;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!range.collapsed || !target.contains(range.startContainer)) return null;

    const beforeRange = range.cloneRange();
    beforeRange.selectNodeContents(target);
    beforeRange.setEnd(range.startContainer, range.startOffset);
    const beforeText = beforeRange.toString();
    const match = beforeText.match(TRIGGER_REGEX);
    if (!match) return null;

    const token = match[2] || '';
    return {
      type: 'contenteditable',
      query: token.slice(2),
      replaceRange: {
        start: beforeText.length - token.length,
        end: beforeText.length
      }
    };
  }

  function createRangeFromTextOffsets(root, start, end) {
    const range = document.createRange();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes = [];

    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    if (textNodes.length === 0) {
      range.selectNodeContents(root);
      range.collapse(true);
      return range;
    }

    let cursor = 0;
    let startSet = false;

    for (const node of textNodes) {
      const length = node.textContent.length;
      const nextCursor = cursor + length;

      if (!startSet && start <= nextCursor) {
        range.setStart(node, Math.max(0, start - cursor));
        startSet = true;
      }

      if (startSet && end <= nextCursor) {
        range.setEnd(node, Math.max(0, end - cursor));
        return range;
      }

      cursor = nextCursor;
    }

    const lastNode = textNodes[textNodes.length - 1];
    if (!startSet) {
      range.setStart(lastNode, lastNode.textContent.length);
    }
    range.setEnd(lastNode, lastNode.textContent.length);
    return range;
  }

  function createTextFragment(text) {
    const fragment = document.createDocumentFragment();
    const lines = String(text || '').split('\n');
    let lastNode = null;

    lines.forEach((line, index) => {
      const textNode = document.createTextNode(line);
      fragment.appendChild(textNode);
      lastNode = textNode;

      if (index < lines.length - 1) {
        const br = document.createElement('br');
        fragment.appendChild(br);
        lastNode = br;
      }
    });

    return { fragment, lastNode };
  }

  function dispatchInputEvent(target, text) {
    try {
      target.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertReplacementText',
        data: text
      }));
    } catch {
      target.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function insertSnippetIntoTarget(target, replaceRange, text) {
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      const value = String(target.value || '');
      target.focus();
      target.value = `${value.slice(0, replaceRange.start)}${text}${value.slice(replaceRange.end)}`;
      const caret = replaceRange.start + text.length;
      if (typeof target.setSelectionRange === 'function') {
        try {
          target.setSelectionRange(caret, caret);
        } catch {
          // Some input types like email do not expose selection APIs consistently.
        }
      }
      dispatchInputEvent(target, text);
      return;
    }

    if (!(target instanceof HTMLElement) || !target.isContentEditable) {
      return;
    }

    target.focus();
    const selection = window.getSelection();
    const range = createRangeFromTextOffsets(target, replaceRange.start, replaceRange.end);
    selection?.removeAllRanges();
    selection?.addRange(range);

    let inserted = false;
    if (typeof document.execCommand === 'function') {
      try {
        inserted = document.execCommand('insertText', false, text);
      } catch {
        inserted = false;
      }
    }

    if (!inserted) {
      range.deleteContents();
      const { fragment, lastNode } = createTextFragment(text);
      range.insertNode(fragment);

      if (selection) {
        const afterRange = document.createRange();
        if (lastNode?.nodeType === Node.TEXT_NODE) {
          afterRange.setStart(lastNode, lastNode.textContent.length);
        } else if (lastNode) {
          afterRange.setStartAfter(lastNode);
        } else {
          afterRange.selectNodeContents(target);
          afterRange.collapse(false);
        }
        afterRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(afterRange);
      }
    }

    dispatchInputEvent(target, text);
  }

  function renderPopup() {
    if (!popupState || !enabled || popupState.matches.length === 0) {
      hidePopup();
      return;
    }

    const root = ensureRoot();
    const shadow = root.shadowRoot;
    const listEl = shadow.querySelector('.list');
    const queryEl = shadow.querySelector('.query');

    queryEl.textContent = `//${popupState.query || ''}`;
    listEl.innerHTML = popupState.matches.map((snippet, index) => `
      <button type="button" class="item ${index === selectedIndex ? 'is-active' : ''}" data-index="${index}">
        <div class="top">
          <span class="trigger">//${escapeHtml(snippet.keyword)}</span>
          <span class="label">${escapeHtml(snippet.label || snippet.keyword)}</span>
        </div>
        <div class="content">${escapeHtml(snippet.content)}</div>
      </button>
    `).join('');

    root.style.display = 'block';
    positionPopup();
  }

  function positionPopup() {
    if (!popupState) return;

    const root = ensureRoot();
    const panel = root.shadowRoot?.querySelector('.panel');
    const target = popupState.target;
    if (!panel || !target || !document.contains(target)) {
      hidePopup();
      return;
    }

    const rect = target.getBoundingClientRect();
    const panelHeight = panel.getBoundingClientRect().height || 240;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const preferredLeft = Math.min(rect.left, viewportWidth - PANEL_WIDTH - 12);
    const left = Math.max(12, preferredLeft);
    const belowTop = rect.bottom + 8;
    const top = belowTop + panelHeight <= viewportHeight - 12
      ? belowTop
      : Math.max(12, rect.top - panelHeight - 8);

    root.style.left = `${Math.round(left)}px`;
    root.style.top = `${Math.round(top)}px`;
  }

  function refreshPopupForTarget(target) {
    if (!enabled || snippets.length === 0) {
      hidePopup();
      return;
    }

    const editableTarget = getEditableTarget(target || document.activeElement);
    if (!editableTarget) {
      hidePopup();
      return;
    }

    syncDismissedPopupState(editableTarget);

    const triggerState = extractTriggerState(editableTarget);
    if (!triggerState) {
      hidePopup();
      return;
    }

    const matches = getMatchingSnippets(triggerState.query);
    if (matches.length === 0) {
      hidePopup();
      return;
    }

    const isDismissedForCurrentContent = dismissedPopupState
      && dismissedPopupState.elementId === getElementId(editableTarget)
      && dismissedPopupState.contentSignature === getContentSignature(editableTarget);
    if (isDismissedForCurrentContent) {
      hidePopup();
      return;
    }

    popupState = {
      ...triggerState,
      target: editableTarget,
      matches
    };
    lastObservedSignature = getTargetSignature(editableTarget);
    selectedIndex = 0;
    renderPopup();
  }

  function insertSelectedSnippet(index = selectedIndex) {
    if (!popupState) return;
    const snippet = popupState.matches[index];
    if (!snippet) return;

    dismissedPopupState = null;
    insertSnippetIntoTarget(popupState.target, popupState.replaceRange, snippet.content);
    hidePopup();
  }

  function moveSelection(step) {
    if (!popupState || popupState.matches.length === 0) return;
    selectedIndex = (selectedIndex + step + popupState.matches.length) % popupState.matches.length;
    renderPopup();
  }

  async function loadState() {
    const data = await getStorage([QUICK_SNIPPETS_STORAGE_KEY, ENABLE_QUICK_SNIPPETS_KEY, 'language']);
    snippets = normalizeQuickSnippets(data[QUICK_SNIPPETS_STORAGE_KEY] || []);
    enabled = data[ENABLE_QUICK_SNIPPETS_KEY] !== false;
    currentLanguage = normalizeLanguage(data.language);
    applyLanguageToPopup();
    if (!enabled || snippets.length === 0) {
      hidePopup();
    }
  }

  document.addEventListener('input', (event) => {
    scheduleRefresh(event.target, { doubleFrame: true });
  }, true);

  document.addEventListener('keyup', (event) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'Enter' || event.key === 'Escape') {
      return;
    }
    scheduleRefresh(event.target, { doubleFrame: true });
  }, true);

  document.addEventListener('focusin', (event) => {
    scheduleRefresh(event.target, { doubleFrame: true });
  }, true);

  document.addEventListener('click', (event) => {
    const editableTarget = getEditableTarget(event.target);
    if (editableTarget) {
      scheduleRefresh(editableTarget, { doubleFrame: true });
      return;
    }

    const root = document.getElementById(ROOT_ID);
    if (!root || !event.composedPath().includes(root)) {
      hidePopup();
    }
  }, true);

  document.addEventListener('selectionchange', () => {
    const activeTarget = getEditableTarget(document.activeElement);
    if (!activeTarget || !(activeTarget instanceof HTMLElement) || !activeTarget.isContentEditable) {
      return;
    }
    scheduleRefresh(activeTarget);
  });

  document.addEventListener('keydown', (event) => {
    if (!popupState) return;

    const activeTarget = getEditableTarget(event.target) || getEditableTarget(document.activeElement);
    if (!activeTarget || activeTarget !== popupState.target) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelection(1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(-1);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      insertSelectedSnippet();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      dismissCurrentPopup();
    }
  }, true);

  window.addEventListener('resize', () => {
    positionPopup();
  });

  window.addEventListener('scroll', () => {
    positionPopup();
  }, true);

  window.setInterval(() => {
    if (!enabled || snippets.length === 0) return;

    const activeTarget = getEditableTarget(document.activeElement);
    if (!activeTarget) {
      if (popupState) hidePopup();
      return;
    }

    const signature = getTargetSignature(activeTarget);
    if (!signature) return;

    if (signature !== lastObservedSignature) {
      lastObservedSignature = signature;
      refreshPopupForTarget(activeTarget);
      return;
    }

    if (popupState?.target === activeTarget) {
      positionPopup();
    }
  }, 220);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;

    if (changes[QUICK_SNIPPETS_STORAGE_KEY]) {
      snippets = normalizeQuickSnippets(changes[QUICK_SNIPPETS_STORAGE_KEY].newValue || []);
    }

    if (changes[ENABLE_QUICK_SNIPPETS_KEY]) {
      enabled = changes[ENABLE_QUICK_SNIPPETS_KEY].newValue !== false;
    }

    if (changes.language) {
      currentLanguage = normalizeLanguage(changes.language.newValue);
      applyLanguageToPopup();
    }

    if (!enabled || snippets.length === 0) {
      hidePopup();
      return;
    }

    if (popupState?.target) {
      refreshPopupForTarget(popupState.target);
    }
  });

  loadState();
})();
