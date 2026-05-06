// Waiting On — optional New Tab block.
// Storage: IndexedDB (OffiqaIDB) under key "offiqa_waiting_on".
(() => {
  const STORE_KEY = 'offiqa_waiting_on';
  const card = document.getElementById('waiting-on-card');
  if (!card) return;

  const els = {
    addBtn:   document.getElementById('wo-add-btn'),
    form:     document.getElementById('wo-form'),
    person:   document.getElementById('wo-person-input'),
    task:     document.getElementById('wo-task-input'),
    date:     document.getElementById('wo-date-input'),
    urgency:  document.getElementById('wo-urgency-input'),
    save:     document.getElementById('wo-save-btn'),
    cancel:   document.getElementById('wo-cancel-btn'),
    body:     document.getElementById('wo-body'),
    empty:    document.getElementById('wo-empty'),
    openAll:  document.getElementById('wo-open-all')
  };

  let items = [];
  let openId = null;

  // ---------- storage ----------
  async function load() {
    const data = await OffiqaIDB.get(STORE_KEY);
    return Array.isArray(data) ? data : [];
  }
  async function persist() {
    await OffiqaIDB.set(STORE_KEY, items);
  }

  // ---------- helpers ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function urgencyLabel(item) {
    if (item.urgency === 'urgent') return '<span class="wo-badge urgent">Khẩn</span>';
    return '<span class="wo-badge">Chờ</span>';
  }

  function overdueLabel(item) {
    if (!item.date) return '';
    if (item.date < todayStr()) return '<span class="wo-badge overdue">Quá hạn</span>';
    return '';
  }

  function dateLabel(item) {
    if (!item.date) return '';
    return `<span class="wo-date">${esc(item.date)}</span>`;
  }

  // ---------- render ----------
  function render() {
    const active = items.filter((i) => i.status !== 'done');
    if (active.length === 0) {
      els.empty.hidden = false;
      els.body.innerHTML = '';
      return;
    }
    els.empty.hidden = true;
    // Sort: urgent first, then by date asc
    const sorted = [...active].sort((a, b) => {
      if (a.urgency === 'urgent' && b.urgency !== 'urgent') return -1;
      if (b.urgency === 'urgent' && a.urgency !== 'urgent') return 1;
      return (a.date || '9999') < (b.date || '9999') ? -1 : 1;
    });
    els.body.innerHTML = sorted.map(itemHtml).join('');
    bindItemEvents();
  }

  function itemHtml(item) {
    const isOpen = item.id === openId;
    return `
      <div class="cfu-item${isOpen ? ' is-open' : ''}" data-id="${esc(item.id)}">
        <div class="cfu-item-summary" data-act="toggle">
          <div class="cfu-item-name">${esc(item.person)}</div>
          <div class="cfu-item-deal">${esc(item.task)}</div>
          <div class="wo-item-meta">
            ${urgencyLabel(item)}
            ${overdueLabel(item)}
            ${dateLabel(item)}
          </div>
        </div>
        ${isOpen ? `
          <div class="cfu-item-detail">
            <div class="cfu-item-detail-row">
              <span class="cfu-item-detail-label">Nội dung</span>
              ${esc(item.task)}
            </div>
            ${item.date ? `
              <div class="cfu-item-detail-row">
                <span class="cfu-item-detail-label">Hạn chót</span>
                ${esc(item.date)}
              </div>` : ''}
            ${item.note ? `
              <div class="cfu-item-detail-row">
                <span class="cfu-item-detail-label">Ghi chú</span>
                ${esc(item.note)}
              </div>` : ''}
            <div class="cfu-item-actions">
              <button type="button" class="cfu-action-btn is-primary" data-act="received">✓ Đã nhận phản hồi</button>
              <button type="button" class="cfu-action-btn" data-act="remind">Nhắc lại</button>
              <button type="button" class="cfu-action-btn" data-act="copy">Copy follow-up</button>
              <button type="button" class="cfu-action-btn" data-act="note">Ghi chú</button>
              <button type="button" class="cfu-action-btn is-danger" data-act="delete">Xóa</button>
            </div>
          </div>
        ` : ''}
      </div>`;
  }

  function bindItemEvents() {
    els.body.querySelectorAll('.cfu-item').forEach((node) => {
      const id = node.dataset.id;
      node.querySelectorAll('[data-act]').forEach((btn) => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); handleAction(id, btn.dataset.act); });
      });
    });
  }

  function handleAction(id, act) {
    const idx = items.findIndex((i) => i.id === id);
    if (idx < 0) return;
    const item = items[idx];
    switch (act) {
      case 'toggle':
        openId = openId === id ? null : id;
        break;
      case 'received':
        items.splice(idx, 1);
        if (openId === id) openId = null;
        flash(`✓ Đã đánh dấu nhận phản hồi từ ${item.person}`);
        break;
      case 'remind': {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        item.date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        flash('Đã dời nhắc lại sang ngày mai');
        break;
      }
      case 'copy': {
        const tpl = `Hi ${item.person},\n\nJust following up — ${item.task}. Could you let me know the status when you get a chance?\n\nThanks!`;
        try { navigator.clipboard.writeText(tpl); } catch (_) {}
        flash('Đã copy mẫu follow-up');
        return;
      }
      case 'note': {
        const note = prompt('Ghi chú:', item.note || '');
        if (note == null) return;
        item.note = note.trim();
        break;
      }
      case 'delete':
        if (!confirm(`Xóa "${item.person} — ${item.task}"?`)) return;
        items.splice(idx, 1);
        if (openId === id) openId = null;
        break;
      default:
        openId = openId === id ? null : id;
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
      els.urgency.value = 'normal';
      els.date.value = '';
      setTimeout(() => els.person.focus(), 0);
    } else {
      els.person.value = els.task.value = els.date.value = '';
    }
  }

  els.addBtn.addEventListener('click', () => showForm(els.form.hidden));
  els.cancel.addEventListener('click', () => showForm(false));
  els.save.addEventListener('click', () => {
    const person = els.person.value.trim();
    const task   = els.task.value.trim();
    if (!person) { els.person.focus(); return; }
    if (!task)   { els.task.focus(); return; }
    items.push({
      id: 'wo_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      person, task,
      date: els.date.value || '',
      urgency: els.urgency.value || 'normal',
      note: '',
      status: 'active',
      createdAt: Date.now()
    });
    persist();
    showForm(false);
    render();
  });
  [els.person, els.task].forEach((inp) => {
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') els.save.click(); });
  });
  els.openAll.addEventListener('click', (e) => { e.preventDefault(); showForm(true); });

  // ---------- init ----------
  load().then((data) => {
    items = Array.isArray(data) ? data : [];
    render();
  });
})();
