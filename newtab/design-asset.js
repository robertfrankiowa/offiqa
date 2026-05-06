// Design & Asset Workspace — optional New Tab block.
// Storage: IndexedDB (OffiqaIDB) under key "offiqa_design_asset".
(() => {
  const STORE_KEY = 'offiqa_design_asset';
  const card = document.getElementById('design-asset-card');
  if (!card) return;

  const els = {
    addBtn: document.getElementById('dsa-add-btn'),
    form: document.getElementById('dsa-form'),
    name: document.getElementById('dsa-name-input'),
    type: document.getElementById('dsa-type-input'),
    next: document.getElementById('dsa-next-input'),
    date: document.getElementById('dsa-date-input'),
    status: document.getElementById('dsa-status-input'),
    save: document.getElementById('dsa-save-btn'),
    cancel: document.getElementById('dsa-cancel-btn'),
    body: document.getElementById('dsa-body'),
    empty: document.getElementById('dsa-empty'),
    todaySection: document.getElementById('dsa-today-section'),
    todayList: document.getElementById('dsa-today-list'),
    waitingSection: document.getElementById('dsa-waiting-section'),
    waitingCount: document.getElementById('dsa-waiting-count'),
    waitingList: document.getElementById('dsa-waiting-list'),
    ideasSection: document.getElementById('dsa-ideas-section'),
    ideasCount: document.getElementById('dsa-ideas-count'),
    ideasList: document.getElementById('dsa-ideas-list'),
    openAll: document.getElementById('dsa-open-all')
  };

  let items = [];
  let openId = null;

  // ---------- default checklists per type ----------
  const CHECKLISTS = {
    banner: ['Check brief', 'Check brand color', 'Check spacing', 'Export PNG/JPG', 'Export đúng kích thước', 'Đặt tên file đúng', 'Upload Drive', 'Share link'],
    landing: ['Check brief', 'Check brand color', 'Check spacing', 'Desktop preview', 'Mobile preview', 'Kiểm tra CTA', 'Export assets', 'Đặt tên file đúng', 'Share link'],
    social: ['Check brief', 'Check brand color', 'Export đủ kích thước', 'Đặt tên file đúng', 'Upload Drive', 'Share link'],
    email: ['Check brief', 'Check brand color', 'Export PNG', 'Kiểm tra rendering', 'Đặt tên file đúng', 'Share link'],
    logo: ['Check brief', 'Check brand color', 'Kiểm tra vector', 'Export PNG', 'Export SVG', 'Export PDF', 'Đặt tên file đúng', 'Share link'],
    ui: ['Check brief', 'Check brand color', 'Check spacing', 'Desktop preview', 'Mobile preview', 'States: hover / active / disabled', 'Dev notes', 'Nén asset', 'Share link'],
    print: ['Check brief', 'Check brand color / CMYK', 'Kiểm tra bleed & margin', 'Export PDF print-ready', 'Đặt tên file đúng', 'Share link'],
    other: ['Check brief', 'Review', 'Export', 'Đặt tên file đúng', 'Share link']
  };

  const TYPE_LABEL = {
    banner: 'Banner',
    landing: 'Landing',
    social: 'Social',
    email: 'Email',
    logo: 'Logo',
    ui: 'UI/Web',
    print: 'Print',
    other: 'Khác'
  };

  // ---------- storage ----------
  async function load() {
    const data = await OffiqaIDB.get(STORE_KEY);
    return Array.isArray(data) ? data : [];
  }

  async function persist() {
    await OffiqaIDB.set(STORE_KEY, items);
  }

  // ---------- helpers ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function bucketOf(it) {
    if (it.status === 'idea') return 'idea';
    if (it.status === 'waiting') return 'waiting';
    if (it.status === 'done') return 'done';
    if (!it.date) return 'today';
    return it.date <= todayStr() ? 'today' : 'upcoming';
  }

  // ---------- render ----------
  function render() {
    const today = items.filter((c) => bucketOf(c) === 'today');
    const waiting = items.filter((c) => bucketOf(c) === 'waiting');
    const ideas = items.filter((c) => bucketOf(c) === 'idea');
    const total = today.length + waiting.length + ideas.length;

    if (total === 0) {
      els.empty.hidden = false;
      els.todaySection.hidden = true;
      els.waitingSection.hidden = true;
      els.ideasSection.hidden = true;
      return;
    }
    els.empty.hidden = true;

    if (today.length) {
      els.todaySection.hidden = false;
      els.todayList.innerHTML = today.map(itemHtml).join('');
    } else { els.todaySection.hidden = true; }

    if (waiting.length) {
      els.waitingSection.hidden = false;
      els.waitingCount.textContent = waiting.length;
      els.waitingList.innerHTML = waiting.map(itemHtml).join('');
    } else { els.waitingSection.hidden = true; }

    if (ideas.length) {
      els.ideasSection.hidden = false;
      els.ideasCount.textContent = ideas.length;
      els.ideasList.innerHTML = ideas.map(itemHtml).join('');
    } else { els.ideasSection.hidden = true; }

    bindItemEvents();
  }

  function checklistHtml(it) {
    const list = Array.isArray(it.checklist) ? it.checklist : [];
    if (!list.length) return '';
    const done = list.filter((s) => s.done).length;
    return `
      <div class="cfu-item-detail-row">
        <span class="cfu-item-detail-label">Handoff checklist <span style="color:var(--text-muted);font-size:11px">${done}/${list.length}</span></span>
        <div class="cmc-checklist">
          ${list.map((step, i) => `
            <label class="cmc-check">
              <input type="checkbox" data-act="check" data-idx="${i}" ${step.done ? 'checked' : ''}>
              <span class="${step.done ? 'cmc-check-done' : ''}">${esc(step.label)}</span>
            </label>
          `).join('')}
        </div>
      </div>`;
  }

  function linksHtml(it) {
    const links = Array.isArray(it.links) ? it.links : [];
    if (!links.length) return '';
    return `
      <div class="cfu-item-detail-row">
        <span class="cfu-item-detail-label">Links</span>
        <div class="cmc-links">
          ${links.map((l, i) => `
            <a class="cmc-link" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label || l.url)}</a>
            <button type="button" class="cmc-link-x" data-act="rmlink" data-idx="${i}" title="Xóa link">×</button>
          `).join('')}
        </div>
      </div>`;
  }

  function itemHtml(it) {
    const isOpen = it.id === openId;
    const typeBadge = `<span class="cmc-type-badge">${esc(TYPE_LABEL[it.type] || it.type)}</span>`;
    const summary = it.next ? esc(it.next) : '';
    const feedbackNote = it.feedback ? `<div class="cfu-item-detail-row"><span class="cfu-item-detail-label">Feedback</span><span style="color:#d97706">${esc(it.feedback)}</span></div>` : '';
    return `
      <div class="cfu-item${isOpen ? ' is-open' : ''}" data-id="${esc(it.id)}">
        <div class="cfu-item-summary" data-act="toggle">
          ${typeBadge}
          <span class="cfu-item-name">${esc(it.name)}</span>
          ${summary ? `<span class="cfu-item-deal">${summary}</span>` : ''}
        </div>
        ${isOpen ? `
          <div class="cfu-item-detail">
            <div class="cfu-item-detail-row"><span class="cfu-item-detail-label">Việc tiếp theo</span>${it.next ? esc(it.next) : '<span style="color:var(--text-muted)">Chưa có</span>'}</div>
            ${it.status ? `<div class="cfu-item-detail-row"><span class="cfu-item-detail-label">Trạng thái</span>${esc(it.status === 'waiting' ? 'Chờ feedback / approval' : it.status === 'idea' ? 'Ý tưởng' : 'Đang xử lý')}</div>` : ''}
            ${it.date ? `<div class="cfu-item-detail-row"><span class="cfu-item-detail-label">Deadline</span>${esc(it.date)}</div>` : ''}
            ${feedbackNote}
            ${linksHtml(it)}
            ${checklistHtml(it)}
            <div class="cfu-item-actions">
              <button type="button" class="cfu-action-btn is-primary" data-act="done">Đã xong</button>
              <button type="button" class="cfu-action-btn" data-act="snooze">Nhắc lại ngày mai</button>
              <button type="button" class="cfu-action-btn" data-act="toggle-wait">${it.status === 'waiting' ? 'Đã có phản hồi' : 'Chờ feedback'}</button>
              ${it.status === 'idea' ? `<button type="button" class="cfu-action-btn" data-act="promote">Chuyển thành workspace</button>` : ''}
              <button type="button" class="cfu-action-btn" data-act="addlink">+ Link</button>
              <button type="button" class="cfu-action-btn" data-act="addfeedback">Ghi feedback</button>
              <button type="button" class="cfu-action-btn" data-act="copy">Copy handoff</button>
              <button type="button" class="cfu-action-btn is-danger" data-act="delete">Xóa</button>
            </div>
          </div>
        ` : ''}
      </div>`;
  }

  function bindItemEvents() {
    els.body.querySelectorAll('.cfu-item').forEach((node) => {
      const id = node.dataset.id;
      const summary = node.querySelector('[data-act="toggle"]');
      if (summary) summary.addEventListener('click', () => handleAction(id, 'toggle'));
      node.querySelectorAll('button[data-act]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          handleAction(id, btn.dataset.act, btn.dataset);
        });
      });
      node.querySelectorAll('input[type="checkbox"][data-act="check"]').forEach((cb) => {
        cb.addEventListener('change', (e) => {
          e.stopPropagation();
          handleAction(id, 'check', { idx: cb.dataset.idx, checked: cb.checked });
        });
      });
    });
  }

  function handleAction(id, act, data) {
    const idx = items.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const it = items[idx];
    switch (act) {
      case 'toggle':
        openId = openId === id ? null : id;
        break;
      case 'done':
        items.splice(idx, 1);
        if (openId === id) openId = null;
        break;
      case 'snooze': {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        it.date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        it.status = 'today';
        break;
      }
      case 'toggle-wait':
        it.status = it.status === 'waiting' ? 'today' : 'waiting';
        break;
      case 'promote':
        it.status = 'today';
        if (!it.date) it.date = todayStr();
        if (!it.checklist || !it.checklist.length) {
          it.checklist = (CHECKLISTS[it.type] || CHECKLISTS.other).map((label) => ({ label, done: false }));
        }
        break;
      case 'addlink': {
        const url = prompt('URL (https://...)\nVí dụ: Figma, Canva, Brief, Drive, Preview:');
        if (!url) return;
        if (!/^https?:\/\//i.test(url)) { alert('URL phải bắt đầu bằng http:// hoặc https://'); return; }
        const label = prompt('Tên link (vd: Figma, Canva, Brief, Brand Kit, Drive, Preview):', '');
        it.links = Array.isArray(it.links) ? it.links : [];
        it.links.push({ url, label: (label || '').trim() });
        break;
      }
      case 'rmlink': {
        const i = Number(data && data.idx);
        if (Array.isArray(it.links) && i >= 0 && i < it.links.length) it.links.splice(i, 1);
        break;
      }
      case 'check': {
        const i = Number(data && data.idx);
        if (Array.isArray(it.checklist) && i >= 0 && i < it.checklist.length) {
          it.checklist[i].done = !!(data && data.checked);
        }
        break;
      }
      case 'addfeedback': {
        const feedback = prompt('Ghi feedback mới nhất:', it.feedback || '');
        if (feedback == null) return;
        it.feedback = feedback.trim();
        break;
      }
      case 'copy': {
        const checklistText = (it.checklist || [])
          .map((s) => `${s.done ? '✓' : '☐'} ${s.label}`)
          .join('\n');
        const linksText = (it.links || []).map((l) => `- ${l.label || l.url}: ${l.url}`).join('\n');
        const tpl = [
          `Thiết kế: ${it.name}`,
          `Loại: ${TYPE_LABEL[it.type] || it.type}`,
          `Trạng thái: ${it.status === 'waiting' ? 'Chờ feedback' : 'Đang xử lý'}`,
          it.next ? `Việc tiếp theo: ${it.next}` : '',
          it.date ? `Deadline: ${it.date}` : '',
          it.feedback ? `Feedback: ${it.feedback}` : '',
          linksText ? `\nLinks:\n${linksText}` : '',
          checklistText ? `\nHandoff checklist:\n${checklistText}` : ''
        ].filter(Boolean).join('\n');
        try { navigator.clipboard.writeText(tpl); } catch (_) {}
        flash(`Đã copy handoff: ${it.name}`);
        return;
      }
      case 'delete':
        if (!confirm(`Xóa "${it.name}"?`)) return;
        items.splice(idx, 1);
        if (openId === id) openId = null;
        break;
    }
    persist();
    render();
  }

  function flash(msg) {
    const node = document.createElement('div');
    node.textContent = msg;
    Object.assign(node.style, {
      position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
      background: '#111827', color: 'white', padding: '8px 14px', borderRadius: '8px',
      fontSize: '13px', zIndex: 9999, opacity: '0', transition: 'opacity .2s'
    });
    document.body.appendChild(node);
    requestAnimationFrame(() => { node.style.opacity = '1'; });
    setTimeout(() => { node.style.opacity = '0'; setTimeout(() => node.remove(), 250); }, 1800);
  }

  // ---------- form ----------
  function showForm(show) {
    els.form.hidden = !show;
    if (show) {
      els.date.value = todayStr();
      els.status.value = 'today';
      setTimeout(() => els.name.focus(), 0);
    } else {
      els.name.value = els.next.value = '';
    }
  }

  els.addBtn.addEventListener('click', () => showForm(els.form.hidden));
  els.cancel.addEventListener('click', () => showForm(false));
  els.save.addEventListener('click', () => {
    const name = els.name.value.trim();
    if (!name) { els.name.focus(); return; }
    const type = els.type.value || 'other';
    const status = els.status.value || 'today';
    const checklist = status === 'idea'
      ? []
      : (CHECKLISTS[type] || CHECKLISTS.other).map((label) => ({ label, done: false }));
    items.push({
      id: 'dsa_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      type,
      next: els.next.value.trim(),
      date: status === 'idea' ? '' : (els.date.value || todayStr()),
      status,
      feedback: '',
      links: [],
      checklist,
      createdAt: Date.now()
    });
    persist();
    showForm(false);
    render();
  });

  [els.name, els.next].forEach((inp) => {
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') els.save.click(); });
  });

  els.openAll.addEventListener('click', (e) => { e.preventDefault(); showForm(true); });

  // ---------- init ----------
  load().then((data) => { items = data; render(); });
})();
