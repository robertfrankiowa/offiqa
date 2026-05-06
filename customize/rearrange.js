/* Offiqa — In-place drag & drop reorder for New Tab blocks */
(() => {
  const STORE_LAYOUT = 'offiqa_layout_config';
  const STORE_IS_CUSTOM = 'offiqa_layout_is_custom';
  const STORE_LANG = 'lang';

  const I18N = Object.fromEntries(Object.entries(globalThis.OFFIQA_I18N_PACKS || {}).map(([lang, pack]) => [lang, pack.rearrange || {}]));

  let lang = 'vi';
  let t = I18N.vi;
  let isEditing = false;
  let dragEl = null;
  let dropTargetEl = null;
  let bannerEl = null;
  let toggleBtn = null;
  let originalOrder = [];

  function loadLang() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(STORE_LANG, (data) => {
          lang = (data && data[STORE_LANG]) || document.documentElement.lang || 'vi';
          if (!I18N[lang]) lang = 'vi';
          t = I18N[lang];
          resolve();
        });
      } catch (_) { t = I18N.vi; resolve(); }
    });
  }

  function getGrid() { return document.querySelector('.grid'); }

  function getVisibleBlockCards() {
    const grid = getGrid();
    if (!grid) return [];
    return Array.from(grid.children).filter((card) =>
      card.dataset.blockId && !card.classList.contains('ofq-block-hidden')
    );
  }

  function storageGet(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  }

  function storageSet(payload) {
    return new Promise((resolve) => chrome.storage.local.set(payload, resolve));
  }

  function ensureBlockIdsTagged() {
    const BLOCKS = globalThis.OFFIQA_BLOCKS || {};
    const grid = getGrid();
    if (!grid) return;
    Object.keys(BLOCKS).forEach((id) => {
      const sel = BLOCKS[id].selector;
      if (!sel) return;
      const el = grid.querySelector(sel) || document.querySelector(sel);
      if (el && !el.dataset.blockId) el.dataset.blockId = id;
    });
  }

  function showBanner() {
    if (bannerEl) return;
    bannerEl = document.createElement('div');
    bannerEl.className = 'ofq-rearrange-banner';
    bannerEl.innerHTML = `
      <div class="ofq-rearrange-banner-text">${t.hint}</div>
      <div class="ofq-rearrange-actions">
        <button type="button" class="ofq-rearrange-cancel">${t.cancel || 'Cancel'}</button>
        <button type="button" class="ofq-rearrange-done">${t.exit}</button>
      </div>
    `;
    bannerEl.querySelector('.ofq-rearrange-done').addEventListener('click', () => exitEditMode());
    bannerEl.querySelector('.ofq-rearrange-cancel').addEventListener('click', () => cancelEditMode());
    document.body.appendChild(bannerEl);
    requestAnimationFrame(() => bannerEl.classList.add('is-visible'));
  }

  function hideBanner() {
    if (!bannerEl) return;
    bannerEl.classList.remove('is-visible');
    const el = bannerEl; bannerEl = null;
    setTimeout(() => el.remove(), 200);
  }

  function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'ofq-rearrange-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    setTimeout(() => {
      toast.classList.remove('is-visible');
      setTimeout(() => toast.remove(), 200);
    }, 1800);
  }

  function attachDnD(card) {
    if (card.dataset.ofqDnd === '1') return;
    card.dataset.ofqDnd = '1';
    card.setAttribute('draggable', 'true');
    // Visual handle
    if (!card.querySelector('.ofq-drag-handle')) {
      const handle = document.createElement('div');
      handle.className = 'ofq-drag-handle';
      handle.title = t.handle;
      handle.setAttribute('aria-hidden', 'true');
      handle.innerHTML = '⋮⋮';
      card.appendChild(handle);
    }
    card.addEventListener('dragstart', onDragStart);
    card.addEventListener('dragend', onDragEnd);
  }

  function detachDnD(card) {
    if (card.dataset.ofqDnd !== '1') return;
    card.dataset.ofqDnd = '';
    card.removeAttribute('draggable');
    const h = card.querySelector('.ofq-drag-handle');
    if (h) h.remove();
    card.removeEventListener('dragstart', onDragStart);
    card.removeEventListener('dragend', onDragEnd);
  }

  function onDragStart(e) {
    dragEl = this;
    this.classList.add('ofq-dragging');
    try {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', this.dataset.blockId || '');
    } catch (_) {}
  }

  function onDragEnd() {
    if (dragEl) dragEl.classList.remove('ofq-dragging');
    dragEl = null;
    clearDropTargets();
  }

  function findDropCard(e) {
    const cards = getVisibleBlockCards().filter((card) => card !== dragEl);
    return document.elementsFromPoint(e.clientX, e.clientY)
      .map((el) => el.closest && el.closest('.grid > [data-block-id]'))
      .find((el) => cards.includes(el));
  }

  function clearDropTargets() {
    const grid = getGrid();
    if (grid) grid.querySelectorAll('.ofq-drop-target').forEach((el) => el.classList.remove('ofq-drop-target'));
    dropTargetEl = null;
  }

  function swapCards(a, b) {
    if (!a || !b || a === b || a.parentNode !== b.parentNode) return false;
    const parent = a.parentNode;
    const aNext = a.nextSibling;
    const bNext = b.nextSibling;

    if (aNext === b) {
      parent.insertBefore(b, a);
    } else if (bNext === a) {
      parent.insertBefore(a, b);
    } else {
      parent.insertBefore(a, bNext);
      parent.insertBefore(b, aNext);
    }
    return true;
  }

  function onDragOver(e) {
    if (!dragEl) return;
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'move'; } catch (_) {}
    const target = findDropCard(e);
    clearDropTargets();
    if (!target || target === dragEl) return;
    dropTargetEl = target;
    target.classList.add('ofq-drop-target');
  }

  function onDrop(e) {
    e.preventDefault();
    swapCards(dragEl, dropTargetEl);
    clearDropTargets();
  }

  function getCurrentOrder() {
    const grid = getGrid();
    if (!grid) return [];
    return Array.from(grid.children)
      .map((c) => c.dataset.blockId)
      .filter(Boolean);
  }

  function restoreOriginalOrder() {
    const grid = getGrid();
    if (!grid || !originalOrder.length) return;
    const cards = Array.from(grid.children);
    const byId = new Map(cards.map((card) => [card.dataset.blockId, card]));
    const ordered = originalOrder.map((id) => byId.get(id)).filter(Boolean);
    const rest = cards.filter((card) => !ordered.includes(card));
    ordered.concat(rest).forEach((card) => grid.appendChild(card));
  }

  async function persistOrder() {
    const grid = getGrid();
    if (!grid) return;
    const newOrder = Array.from(grid.children)
      .map((c) => c.dataset.blockId)
      .filter(Boolean);
    const data = await storageGet(STORE_LAYOUT);
    const sanitize = globalThis.OffiqaSanitizeLayout || ((x) => x);
    const cur = sanitize(data[STORE_LAYOUT] || { order: newOrder, hidden: [], density: 'comfortable' });
    // Merge: keep blocks not currently in the DOM (e.g. hidden) appended at end in their previous relative order
    const merged = newOrder.slice();
    cur.order.forEach((id) => { if (!merged.includes(id)) merged.push(id); });
    const next = sanitize({ order: merged, hidden: cur.hidden, density: cur.density });
    await storageSet({ [STORE_LAYOUT]: next, [STORE_IS_CUSTOM]: true });
    return next;
  }

  function enterEditMode() {
    isEditing = true;
    document.body.classList.add('ofq-rearrange-mode');
    ensureBlockIdsTagged();
    originalOrder = getCurrentOrder();
    const grid = getGrid();
    if (grid) Array.from(grid.children).forEach((card) => {
      if (card.classList.contains('ofq-block-hidden')) return;
      attachDnD(card);
    });
    if (grid) {
      grid.addEventListener('dragover', onDragOver);
      grid.addEventListener('drop', onDrop);
    }
    if (toggleBtn) toggleBtn.hidden = true;
    showBanner();
  }

  async function finishEditMode({ save }) {
    isEditing = false;
    document.body.classList.remove('ofq-rearrange-mode');
    if (!save) restoreOriginalOrder();
    const grid = getGrid();
    if (grid) Array.from(grid.children).forEach((card) => detachDnD(card));
    if (grid) {
      grid.removeEventListener('dragover', onDragOver);
      grid.removeEventListener('drop', onDrop);
    }
    if (save) await persistOrder();
    if (toggleBtn) {
      toggleBtn.textContent = t.enter;
      toggleBtn.hidden = false;
    }
    hideBanner();
    if (save) showToast(t.saved);
    originalOrder = [];
  }

  async function exitEditMode() {
    await finishEditMode({ save: true });
  }

  async function cancelEditMode() {
    await finishEditMode({ save: false });
  }

  function toggleEditMode() {
    if (isEditing) exitEditMode(); else enterEditMode();
  }

  async function boot() {
    await loadLang();
    // Inject toggle inside topbar dropdown
    const dropdown = document.getElementById('topbar-menu-dropdown');
    if (dropdown && !dropdown.querySelector('.ofq-rearrange-toggle')) {
      toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'topbar-menu-item ofq-rearrange-toggle';
      toggleBtn.textContent = t.enter;
      toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        dropdown.classList.add('hidden');
        dropdown.classList.remove('show');
        toggleEditMode();
      });
      dropdown.appendChild(toggleBtn);
    }
    // ESC cancels edit mode
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isEditing) cancelEditMode();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 80));
  } else {
    setTimeout(boot, 80);
  }

  globalThis.OffiqaRearrange = {
    enter: enterEditMode,
    exit: exitEditMode,
    cancel: cancelEditMode,
    toggle: toggleEditMode
  };
})();
