(() => {
  const STORE = {
    LAYOUT: 'offiqa_layout_config',
    PRESET: 'offiqa_layout_preset_id',
    IS_CUSTOM: 'offiqa_layout_is_custom',
    INTRO_DISMISSED: 'offiqa_customize_intro_dismissed',
    QUICK_LINKS: 'quick_links',
    QUICK_LINKS_PINNED: 'offiqa_quick_apps_pinned',
    LANG: 'lang'
  };

  const DEFAULT_LAYOUT = (globalThis.OffiqaGetDefaultLayout && globalThis.OffiqaGetDefaultLayout()) || {
    order: ['meetings','today_focus','quick_notes','resume_sessions','focus_timer','frequent_tools'],
    hidden: [
      'client_followup',
      'campaign_content',
      'design_asset',
      'freelancer_projects',
      'sales_followup_desk',
      'marketing_campaign_desk',
      'design_review_desk',
      'accounting_client_desk',
      'hr_operations_desk',
      'purchasing_operations_desk',
      'logistics_operations_desk',
      'customer_care_desk',
      'rd_experiment_desk',
      'developer_flow_desk',
      'assistant_command_desk',
      'recruiting_pipeline_desk',
      'product_decision_desk',
      'qa_release_desk',
      'it_support_desk',
      'office_operations_desk',
      'teaching_operations_desk',
      'student_study_desk',
      'snippets',
      'clipboard',
      'browser_controls',
      'autoplay_controls',
      'waiting_on',
      'work_requests',
      'deadline_radar',
      'routine_checklist',
      'key_links',
      'update_builder',
      'handoff_pack'
    ],
    density: 'comfortable'
  };

  const PRESETS = globalThis.OFFIQA_PRESETS || {};
  const BLOCKS = globalThis.OFFIQA_BLOCKS || {};
  const APPS = globalThis.OFFIQA_APPS || {};
  const I18N = globalThis.OFFIQA_CUSTOMIZE_I18N || {};

  let lang = 'vi';
  let t = I18N[lang] || I18N.en || {};

  function loadLang() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(STORE.LANG, (data) => {
          lang = (data && data[STORE.LANG]) || (document.documentElement.lang) || 'vi';
          if (!I18N[lang]) lang = 'vi';
          t = I18N[lang] || I18N.en;
          resolve();
        });
      } catch (_) { t = I18N.vi || I18N.en; resolve(); }
    });
  }

  function escHtml(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  // ===== Storage helpers =====
  function storageGet(keys) { return new Promise((r) => chrome.storage.local.get(keys, r)); }
  function storageSet(obj) { return new Promise((r) => chrome.storage.local.set(obj, r)); }

  async function loadCustomizeState() {
    const data = await storageGet([STORE.LAYOUT, STORE.PRESET, STORE.IS_CUSTOM, STORE.QUICK_LINKS, STORE.QUICK_LINKS_PINNED]);
    const layout = (globalThis.OffiqaSanitizeLayout || ((x) => x))(data[STORE.LAYOUT] || DEFAULT_LAYOUT);
    const quickLinks = Array.isArray(data[STORE.QUICK_LINKS]) ? data[STORE.QUICK_LINKS] : [];
    return {
      layout,
      presetId: data[STORE.PRESET] || null,
      isCustom: !!data[STORE.IS_CUSTOM],
      quickLinks,
      pinned: Array.isArray(data[STORE.QUICK_LINKS_PINNED]) ? data[STORE.QUICK_LINKS_PINNED] : []
    };
  }

  async function saveLayoutConfig(layout, meta = {}) {
    const safe = (globalThis.OffiqaSanitizeLayout || ((x) => x))(layout);
    const patch = { [STORE.LAYOUT]: safe };
    if (meta.presetId !== undefined) patch[STORE.PRESET] = meta.presetId;
    if (meta.isCustom !== undefined) patch[STORE.IS_CUSTOM] = !!meta.isCustom;
    await storageSet(patch);
    applyLayoutToDom(safe);
  }

  async function saveQuickAppsToStorage(quickLinks, pinnedIds) {
    await storageSet({
      [STORE.QUICK_LINKS]: quickLinks,
      [STORE.QUICK_LINKS_PINNED]: pinnedIds || [],
      quick_links_migrated: true
    });
    // Trigger storage listeners in newtab.js to re-render
  }

  async function resetLayoutToDefault() {
    const defaultApps = ['gmail','drive','calendar','meet','sheets','docs','github','chatgpt','figma'];
    const links = defaultApps.map((id) => globalThis.OffiqaQuickLinkFromApp(id)).filter(Boolean);
    await saveLayoutConfig(DEFAULT_LAYOUT, { presetId: 'default_calm_workspace', isCustom: false });
    await saveQuickAppsToStorage(links, defaultApps.slice(0, 4));
  }

  // ===== Apply layout to DOM =====
  function applyLayoutToDom(layout) {
    const grid = document.querySelector('.grid');
    if (!grid) return;
    // Mark each child with data-block-id if not yet
    Object.keys(BLOCKS).forEach((id) => {
      const sel = BLOCKS[id].selector;
      if (!sel) return;
      const el = grid.querySelector(sel) || document.querySelector(sel);
      if (el) el.dataset.blockId = id;
    });
    // Hide / show
    Array.from(grid.children).forEach((child) => {
      const id = child.dataset.blockId;
      if (!id) return;
      if (layout.hidden && layout.hidden.includes(id)) {
        child.classList.add('ofq-block-hidden');
      } else {
        child.classList.remove('ofq-block-hidden');
      }
    });
    // Reorder
    const orderMap = {};
    layout.order.forEach((id, idx) => { orderMap[id] = idx; });
    const children = Array.from(grid.children);
    children.sort((a, b) => {
      const ai = orderMap[a.dataset.blockId];
      const bi = orderMap[b.dataset.blockId];
      const av = ai === undefined ? 999 : ai;
      const bv = bi === undefined ? 999 : bi;
      return av - bv;
    });
    children.forEach((c) => grid.appendChild(c));
    // Density
    document.body.classList.toggle('ofq-density-compact', layout.density === 'compact');
  }

  function markLayoutReady() {
    document.body.classList.remove('ofq-layout-pending');
  }

  // ===== UI: Sidebar =====
  let sidebarEl = null;
  let backdropEl = null;
  let draftLayout = null;
  let draftQuickLinks = null;
  let draftPinned = null;
  let draftPresetId = null;
  let draftIsCustom = false;
  let currentStep = 0; // 0..2

  function ensureSidebar() {
    if (sidebarEl) return;
    backdropEl = document.createElement('div');
    backdropEl.className = 'ofq-cust-backdrop';
    backdropEl.hidden = true;
    backdropEl.addEventListener('click', () => closeSidebar(false));
    document.body.appendChild(backdropEl);

    sidebarEl = document.createElement('aside');
    sidebarEl.className = 'ofq-cust-sidebar';
    sidebarEl.hidden = true;
    sidebarEl.setAttribute('role', 'dialog');
    sidebarEl.setAttribute('aria-modal', 'true');
    sidebarEl.innerHTML = `
      <div class="ofq-cust-header">
        <div class="ofq-cust-header-text">
          <div class="ofq-cust-title" id="ofq-cust-title"></div>
          <div class="ofq-cust-subtitle" id="ofq-cust-subtitle"></div>
        </div>
        <button type="button" class="ofq-cust-close" id="ofq-cust-close" aria-label="Close">×</button>
      </div>
      <div class="ofq-cust-steps" id="ofq-cust-steps"></div>
      <div class="ofq-cust-body" id="ofq-cust-body"></div>
      <div class="ofq-cust-footer">
        <div class="ofq-cust-footer-left">
          <button type="button" class="ofq-cust-btn is-link" id="ofq-cust-reset"></button>
        </div>
        <div class="ofq-cust-footer-right">
          <button type="button" class="ofq-cust-btn" id="ofq-cust-cancel"></button>
          <button type="button" class="ofq-cust-btn is-primary" id="ofq-cust-save"></button>
        </div>
      </div>
    `;
    document.body.appendChild(sidebarEl);

    sidebarEl.querySelector('#ofq-cust-close').addEventListener('click', () => closeSidebar(false));
    sidebarEl.querySelector('#ofq-cust-cancel').addEventListener('click', () => closeSidebar(false));
    sidebarEl.querySelector('#ofq-cust-save').addEventListener('click', onSave);
    sidebarEl.querySelector('#ofq-cust-reset').addEventListener('click', onReset);
    document.addEventListener('keydown', (e) => {
      if (!sidebarEl.classList.contains('is-open')) return;
      if (e.key === 'Escape') closeSidebar(false);
    });
  }

  async function openSidebar(initialStep = 0) {
    await loadLang();
    ensureSidebar();
    const state = await loadCustomizeState();
    draftLayout = JSON.parse(JSON.stringify(state.layout));
    draftQuickLinks = state.quickLinks.length ? state.quickLinks.map((q) => ({ ...q })) :
      ['gmail','drive','calendar','meet','sheets','docs','github','chatgpt','figma'].map((id) => globalThis.OffiqaQuickLinkFromApp(id)).filter(Boolean);
    draftPinned = state.pinned.length ? state.pinned.slice() : draftQuickLinks.slice(0, 4).map((q) => q.id);
    draftPresetId = state.presetId;
    draftIsCustom = state.isCustom;

    // Header
    sidebarEl.querySelector('#ofq-cust-title').textContent = t.title;
    sidebarEl.querySelector('#ofq-cust-subtitle').textContent = t.subtitle;
    sidebarEl.querySelector('#ofq-cust-cancel').textContent = t.cancel;
    sidebarEl.querySelector('#ofq-cust-save').textContent = t.save;
    sidebarEl.querySelector('#ofq-cust-reset').textContent = t.reset_default;

    renderSteps();
    goStep(Math.max(0, Math.min(2, initialStep)));

    backdropEl.hidden = false;
    sidebarEl.hidden = false;
    requestAnimationFrame(() => {
      backdropEl.classList.add('is-open');
      sidebarEl.classList.add('is-open');
    });
  }

  function closeSidebar(saved) {
    if (!sidebarEl) return;
    backdropEl.classList.remove('is-open');
    sidebarEl.classList.remove('is-open');
    setTimeout(() => {
      sidebarEl.hidden = true;
      backdropEl.hidden = true;
    }, 250);
  }

  function renderSteps() {
    const stepsEl = sidebarEl.querySelector('#ofq-cust-steps');
    const labels = [t.step_preset, t.step_blocks, t.step_apps];
    stepsEl.innerHTML = labels.map((l, i) =>
      `<button type="button" class="ofq-cust-step ${i === currentStep ? 'is-active' : ''}" data-step="${i}">${escHtml(l)}</button>`
    ).join('');
    stepsEl.querySelectorAll('.ofq-cust-step').forEach((b) => {
      b.addEventListener('click', () => goStep(parseInt(b.dataset.step, 10)));
    });
  }

  function goStep(step) {
    currentStep = Math.max(0, Math.min(2, step));
    renderSteps();
    const body = sidebarEl.querySelector('#ofq-cust-body');
    if (currentStep === 0) renderPresetStep(body);
    else if (currentStep === 1) renderBlocksStep(body);
    else renderAppsStep(body);
  }

  // ===== Step 1: Preset =====
  function renderPresetStep(body) {
    body.innerHTML = `
      <h3 class="ofq-cust-section-title">${escHtml(t.preset_intro_title)}</h3>
      <p class="ofq-cust-section-desc">${escHtml(t.preset_intro_subtitle)}</p>
      <div class="ofq-cust-preset-grid" id="ofq-cust-preset-grid"></div>
      <div style="margin-top:12px"><button type="button" class="ofq-cust-link-btn" id="ofq-cust-skip-preset">${escHtml(t.skip)} →</button></div>
    `;
    const grid = body.querySelector('#ofq-cust-preset-grid');
    Object.keys(PRESETS).forEach((id) => {
      const p = PRESETS[id];
      const tr = (t.preset && t.preset[id]) || [id, ''];
      const blocks = p.blocks.order.slice(0, 4).map((bid) => (t.block && t.block[bid] && t.block[bid][0]) || bid).join(' · ');
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'ofq-cust-preset-card' + (draftPresetId === id ? ' is-active' : '');
      card.innerHTML = `
        <div class="ofq-cust-preset-name">${escHtml(tr[0])}</div>
        <div class="ofq-cust-preset-desc">${escHtml(tr[1])}</div>
        <div class="ofq-cust-preset-meta">${escHtml(blocks)} · ${p.apps.length} apps</div>
      `;
      card.addEventListener('click', () => {
        applyPresetToDraft(id);
        goStep(1);
      });
      grid.appendChild(card);
    });
    body.querySelector('#ofq-cust-skip-preset').addEventListener('click', () => goStep(1));
  }

  function applyPresetToDraft(presetId) {
    const p = PRESETS[presetId];
    if (!p) return;
    draftLayout = (globalThis.OffiqaSanitizeLayout || ((x) => x))(p.blocks);
    // Build quick links from preset apps + keep custom (non-registry) links
    const customs = (draftQuickLinks || []).filter((q) => !APPS[q.id]);
    const presetLinks = p.apps.map((id) => globalThis.OffiqaQuickLinkFromApp(id)).filter(Boolean);
    draftQuickLinks = presetLinks.concat(customs);
    draftPinned = draftQuickLinks.slice(0, 4).map((q) => q.id);
    draftPresetId = presetId;
    draftIsCustom = false;
  }

  // ===== Step 2: Blocks =====
  function renderBlocksStep(body) {
    const visibleIds = draftLayout.order.filter((id) => !draftLayout.hidden.includes(id));
    body.innerHTML = `
      <h3 class="ofq-cust-section-title">${escHtml(t.blocks_intro_title)}</h3>
      <p class="ofq-cust-section-desc">${escHtml(t.blocks_intro_subtitle)}</p>
      <div class="ofq-cust-preview">
        <div class="ofq-cust-preview-label">${escHtml(t.preview_label)}</div>
        <div class="ofq-cust-preview-list" id="ofq-cust-preview-list"></div>
      </div>
      <div class="ofq-cust-block-group">
        <div class="ofq-cust-block-group-title">${escHtml(t.cat_recommended)} · ${escHtml(t.selected_count.replace('{n}', visibleIds.length))}</div>
        <div id="ofq-cust-block-recommended"></div>
      </div>
      <div class="ofq-cust-block-group">
        <div class="ofq-cust-block-group-title">${escHtml(t.cat_expertise || 'Chuyên môn')}</div>
        <div id="ofq-cust-block-expertise"></div>
      </div>
      <div class="ofq-cust-block-group">
        <div class="ofq-cust-block-group-title">${escHtml(t.cat_optional)}</div>
        <div id="ofq-cust-block-optional"></div>
      </div>
    `;
    refreshBlocksUI(body);
  }

  function refreshBlocksUI(body) {
    const recEl = body.querySelector('#ofq-cust-block-recommended');
    const expertiseEl = body.querySelector('#ofq-cust-block-expertise');
    const optEl = body.querySelector('#ofq-cust-block-optional');
    recEl.innerHTML = '';
    expertiseEl.innerHTML = '';
    optEl.innerHTML = '';
    // Recommended first, in current order
    const orderedRec = draftLayout.order.filter((id) => BLOCKS[id] && BLOCKS[id].category === 'recommended');
    // Append any visible recommended not yet in order
    Object.keys(BLOCKS).filter((id) => BLOCKS[id].category === 'recommended' && !orderedRec.includes(id)).forEach((id) => orderedRec.push(id));
    orderedRec.forEach((id, idx) => recEl.appendChild(buildBlockCard(id, idx, orderedRec.length)));
    Object.keys(BLOCKS).filter((id) => BLOCKS[id].category === 'expertise').forEach((id) => expertiseEl.appendChild(buildBlockCard(id, -1, 0)));
    Object.keys(BLOCKS).filter((id) => BLOCKS[id].category === 'optional').forEach((id) => optEl.appendChild(buildBlockCard(id, -1, 0)));
    // Update preview
    const preview = body.querySelector('#ofq-cust-preview-list');
    if (preview) {
      const visibleIds = draftLayout.order.filter((id) => !draftLayout.hidden.includes(id));
      preview.textContent = visibleIds.map((id) => (t.block && t.block[id] && t.block[id][0]) || id).join(' → ');
    }
  }

  function buildBlockCard(id, idx, total) {
    const meta = BLOCKS[id];
    const tr = (t.block && t.block[id]) || [id, ''];
    const card = document.createElement('div');
    card.className = 'ofq-cust-block-card';
    const isHidden = draftLayout.hidden.includes(id);
    const isOptional = meta.category !== 'recommended';
    const isSensitive = meta.isSensitive;
    let badge = `<span class="ofq-cust-badge">${escHtml(t.badge_default)}</span>`;
    if (isSensitive) badge = `<span class="ofq-cust-badge is-sensitive">${escHtml(t.badge_sensitive)}</span>`;
    else if (isOptional) badge = `<span class="ofq-cust-badge is-optional">${escHtml(t.badge_optional)}</span>`;
    card.innerHTML = `
      <div class="ofq-cust-block-info">
        <div class="ofq-cust-block-name"><span>${escHtml(tr[0])}</span> ${badge}</div>
        <div class="ofq-cust-block-desc">${escHtml(tr[1])}${isSensitive ? ' · ' + escHtml(t.sensitive_note) : ''}</div>
      </div>
      <div class="ofq-cust-block-controls">
        ${idx >= 0 ? `
          <button type="button" class="ofq-cust-icon-btn" data-act="up" data-id="${escHtml(id)}" ${idx === 0 ? 'disabled' : ''} title="${escHtml(t.move_up)}">↑</button>
          <button type="button" class="ofq-cust-icon-btn" data-act="down" data-id="${escHtml(id)}" ${idx === total - 1 ? 'disabled' : ''} title="${escHtml(t.move_down)}">↓</button>
        ` : ''}
        <label class="ofq-cust-switch">
          <input type="checkbox" data-act="toggle" data-id="${escHtml(id)}" ${isHidden ? '' : 'checked'}>
          <span class="ofq-cust-switch-slider"></span>
        </label>
      </div>
    `;
    card.querySelectorAll('[data-act]').forEach((el) => {
      el.addEventListener('click', (e) => {
        const act = el.dataset.act;
        if (act === 'toggle') return; // change handled by 'change'
        const blockId = el.dataset.id;
        if (act === 'up') reorderBlock(blockId, -1);
        if (act === 'down') reorderBlock(blockId, 1);
      });
      if (el.dataset.act === 'toggle') {
        el.addEventListener('change', (e) => {
          const blockId = el.dataset.id;
          toggleBlock(blockId, !el.checked);
        });
      }
    });
    return card;
  }

  function toggleBlock(id, hide) {
    if (hide) {
      if (!draftLayout.hidden.includes(id)) draftLayout.hidden.push(id);
    } else {
      draftLayout.hidden = draftLayout.hidden.filter((x) => x !== id);
      if (!draftLayout.order.includes(id)) draftLayout.order.push(id);
    }
    draftIsCustom = true;
    refreshBlocksUI(sidebarEl.querySelector('#ofq-cust-body'));
  }

  function reorderBlock(id, delta) {
    // Reorder among recommended (visible) sequence in draftLayout.order
    const list = draftLayout.order.slice();
    const idx = list.indexOf(id);
    if (idx === -1) return;
    // Find target index by stepping over only recommended blocks
    let target = idx + delta;
    if (target < 0 || target >= list.length) return;
    const [moved] = list.splice(idx, 1);
    list.splice(target, 0, moved);
    draftLayout.order = list;
    draftIsCustom = true;
    refreshBlocksUI(sidebarEl.querySelector('#ofq-cust-body'));
  }

  // ===== Step 3: Apps =====
  function renderAppsStep(body) {
    body.innerHTML = `
      <h3 class="ofq-cust-section-title">${escHtml(t.apps_intro_title)}</h3>
      <p class="ofq-cust-section-desc">${escHtml(t.apps_intro_subtitle)}</p>
      <div class="ofq-cust-preview">
        <div class="ofq-cust-preview-label">${escHtml(t.pinned_count.replace('{n}', draftPinned.length))}</div>
        <div class="ofq-cust-preview-list" id="ofq-cust-apps-preview"></div>
      </div>
      <div id="ofq-cust-apps-selected"></div>
      <div class="ofq-cust-block-group" style="margin-top:14px">
        <div class="ofq-cust-block-group-title">${escHtml(t.cat_recommended)}</div>
        <div class="ofq-cust-apps-list" id="ofq-cust-apps-registry"></div>
      </div>
      <div class="ofq-cust-add-custom-app">
        <div style="font-size:12px;font-weight:600">${escHtml(t.add_custom_app)}</div>
        <div class="ofq-cust-add-row">
          <input type="text" id="ofq-cust-custom-name" placeholder="${escHtml(t.custom_name)}">
          <input type="url" id="ofq-cust-custom-url" placeholder="${escHtml(t.custom_url)}">
          <button type="button" class="ofq-cust-btn is-primary" id="ofq-cust-add-custom">${escHtml(t.add)}</button>
        </div>
        <div id="ofq-cust-custom-err" style="color:#dc2626;font-size:11px;margin-top:6px"></div>
      </div>
    `;
    refreshAppsUI();
    body.querySelector('#ofq-cust-add-custom').addEventListener('click', onAddCustomApp);
  }

  function refreshAppsUI() {
    const selectedEl = sidebarEl.querySelector('#ofq-cust-apps-selected');
    const regEl = sidebarEl.querySelector('#ofq-cust-apps-registry');
    if (!selectedEl || !regEl) return;
    selectedEl.innerHTML = '';
    regEl.innerHTML = '';
    // Selected apps (current draftQuickLinks), pinned first
    draftQuickLinks.sort((a, b) => {
      const ap = draftPinned.indexOf(a.id);
      const bp = draftPinned.indexOf(b.id);
      if (ap === -1 && bp === -1) return 0;
      if (ap === -1) return 1;
      if (bp === -1) return -1;
      return ap - bp;
    });
    const grid = document.createElement('div');
    grid.className = 'ofq-cust-apps-list';
    draftQuickLinks.forEach((q) => grid.appendChild(buildAppCard(q, true)));
    selectedEl.appendChild(grid);
    // Registry not in selected
    Object.keys(APPS).forEach((id) => {
      if (draftQuickLinks.find((q) => q.id === id)) return;
      const link = globalThis.OffiqaQuickLinkFromApp(id);
      if (!link) return;
      regEl.appendChild(buildAppCard(link, false));
    });
    const preview = sidebarEl.querySelector('#ofq-cust-apps-preview');
    if (preview) {
      preview.textContent = draftPinned.map((id) => {
        const q = draftQuickLinks.find((x) => x.id === id);
        return q ? q.name : id;
      }).join(' · ') || '—';
    }
  }

  function buildAppCard(link, isSelected) {
    const card = document.createElement('div');
    card.className = 'ofq-cust-app-card';
    const pinned = draftPinned.includes(link.id);
    card.innerHTML = `
      <div class="ofq-cust-app-emoji">${escHtml(link.emoji || '🌐')}</div>
      <div class="ofq-cust-app-name" title="${escHtml(link.name)}">${escHtml(link.name)}</div>
      ${isSelected ? `<button type="button" class="ofq-cust-app-pin ${pinned ? 'is-pinned' : ''}" data-act="pin" data-id="${escHtml(link.id)}" title="${escHtml(pinned ? t.unpin : t.pin)}">${pinned ? '★' : '☆'}</button>` : ''}
      <label class="ofq-cust-switch">
        <input type="checkbox" data-act="toggle-app" data-id="${escHtml(link.id)}" ${isSelected ? 'checked' : ''}>
        <span class="ofq-cust-switch-slider"></span>
      </label>
    `;
    const toggle = card.querySelector('[data-act="toggle-app"]');
    toggle.addEventListener('change', () => onToggleApp(link, toggle.checked));
    const pinBtn = card.querySelector('[data-act="pin"]');
    if (pinBtn) pinBtn.addEventListener('click', () => onTogglePin(link.id));
    return card;
  }

  function onToggleApp(link, on) {
    if (on) {
      if (!draftQuickLinks.find((q) => q.id === link.id)) draftQuickLinks.push({ ...link });
    } else {
      draftQuickLinks = draftQuickLinks.filter((q) => q.id !== link.id);
      draftPinned = draftPinned.filter((id) => id !== link.id);
    }
    draftIsCustom = true;
    refreshAppsUI();
  }

  function onTogglePin(id) {
    if (draftPinned.includes(id)) {
      draftPinned = draftPinned.filter((x) => x !== id);
    } else {
      if (draftPinned.length >= 6) draftPinned = draftPinned.slice(0, 5);
      draftPinned.push(id);
    }
    draftIsCustom = true;
    refreshAppsUI();
  }

  function onAddCustomApp() {
    const nameEl = sidebarEl.querySelector('#ofq-cust-custom-name');
    const urlEl = sidebarEl.querySelector('#ofq-cust-custom-url');
    const errEl = sidebarEl.querySelector('#ofq-cust-custom-err');
    const name = (nameEl.value || '').trim();
    const url = (urlEl.value || '').trim();
    errEl.textContent = '';
    if (!name || !url) { errEl.textContent = t.url_invalid; return; }
    if (!/^https?:\/\//i.test(url)) { errEl.textContent = t.url_invalid; return; }
    let domain = '';
    try { domain = new URL(url).hostname; } catch (_) { errEl.textContent = t.url_invalid; return; }
    if (draftQuickLinks.find((q) => q.url === url)) { errEl.textContent = '✓'; return; }
    const id = 'custom_' + Date.now().toString(36);
    draftQuickLinks.push({ id, name, url, domain, emoji: '🔗' });
    draftIsCustom = true;
    nameEl.value = ''; urlEl.value = '';
    refreshAppsUI();
  }

  // ===== Save / Reset =====
  async function onSave() {
    await saveLayoutConfig(draftLayout, { presetId: draftPresetId, isCustom: draftIsCustom });
    await saveQuickAppsToStorage(draftQuickLinks, draftPinned);
    closeSidebar(true);
    // Reload to re-render Frequent Tools and other dynamic blocks with new data
    setTimeout(() => location.reload(), 220);
  }

  async function onReset() {
    if (!confirm(t.reset_confirm)) return;
    await resetLayoutToDefault();
    closeSidebar(true);
    setTimeout(() => location.reload(), 220);
  }

  // ===== First-run toast =====
  async function maybeShowFirstRunToast() {
    const data = await storageGet([STORE.INTRO_DISMISSED]);
    if (data[STORE.INTRO_DISMISSED]) return;
    await loadLang();
    const toast = document.createElement('div');
    toast.className = 'ofq-cust-toast';
    toast.innerHTML = `
      <div class="ofq-cust-toast-head">
        <div>
          <div class="ofq-cust-toast-title">${escHtml(t.toast_title)}</div>
          <div class="ofq-cust-toast-body">${escHtml(t.toast_body)}</div>
        </div>
        <button type="button" class="ofq-cust-toast-x" aria-label="Close">×</button>
      </div>
      <div class="ofq-cust-toast-actions">
        <button type="button" class="ofq-cust-btn is-primary ofq-toast-customize">${escHtml(t.toast_customize)}</button>
        <button type="button" class="ofq-cust-btn ofq-toast-default">${escHtml(t.toast_use_default)}</button>
      </div>
    `;
    document.body.appendChild(toast);
    const dismiss = async () => {
      await storageSet({ [STORE.INTRO_DISMISSED]: true });
      toast.remove();
    };
    toast.querySelector('.ofq-cust-toast-x').addEventListener('click', dismiss);
    toast.querySelector('.ofq-toast-default').addEventListener('click', dismiss);
    toast.querySelector('.ofq-toast-customize').addEventListener('click', async () => {
      await dismiss();
      openSidebar(0);
    });
  }

  // ===== Apply on load =====
  async function applyStoredLayoutOnLoad() {
    try {
      const data = await storageGet([STORE.LAYOUT]);
      const layout = (globalThis.OffiqaSanitizeLayout || ((x) => x))(data[STORE.LAYOUT] || DEFAULT_LAYOUT);
      applyLayoutToDom(layout);
    } finally {
      markLayoutReady();
    }
  }

  // Listen for storage changes from other parts (eg quick-links re-render in newtab.js)
  if (chrome && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes[STORE.LAYOUT]) {
        const layout = (globalThis.OffiqaSanitizeLayout || ((x) => x))(changes[STORE.LAYOUT].newValue || DEFAULT_LAYOUT);
        applyLayoutToDom(layout);
      }
    });
  }

  // Bootstrap once grid markup is available.
  let booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    applyStoredLayoutOnLoad();
    setTimeout(markLayoutReady, 1200);
    // Replace placeholder customize button behaviour
    const origBtn = document.getElementById('btn-customize-newtab');
    if (origBtn) {
      const clone = origBtn.cloneNode(true);
      origBtn.replaceWith(clone);
      clone.addEventListener('click', (e) => {
        e.preventDefault();
        const dropdown = document.getElementById('topbar-menu-dropdown');
        if (dropdown) { dropdown.classList.add('hidden'); dropdown.classList.remove('show'); }
        openSidebar(0);
      });
    }
    // First-run toast
    setTimeout(maybeShowFirstRunToast, 800);
  }

  if (document.querySelector('.grid')) {
    boot();
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Public API
  globalThis.OffiqaCustomize = {
    open: openSidebar,
    reset: resetLayoutToDefault,
    applyStoredLayout: applyStoredLayoutOnLoad
  };
})();
