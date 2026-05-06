// Work Requests — optional New Tab block.
// Storage: IndexedDB (OffiqaIDB) under key "offiqa_work_requests".
(() => {
  const STORE_KEY = 'offiqa_work_requests';
  const card = document.getElementById('work-requests-card');
  if (!card) return;

  const els = {
    addBtn:    document.getElementById('wr-add-btn'),
    form:      document.getElementById('wr-form'),
    requester: document.getElementById('wr-requester-input'),
    task:      document.getElementById('wr-task-input'),
    source:    document.getElementById('wr-source-input'),
    date:      document.getElementById('wr-date-input'),
    link:      document.getElementById('wr-link-input'),
    save:      document.getElementById('wr-save-btn'),
    cancel:    document.getElementById('wr-cancel-btn'),
    body:      document.getElementById('wr-body'),
    empty:     document.getElementById('wr-empty'),
    openAll:   document.getElementById('wr-open-all')
  };

  const SOURCE_ICONS = { email: '📧', chat: '💬', meeting: '📅', call: '📞', verbal: '🗣', other: '📌' };
  const SOURCE_LABELS = { email: 'Email', chat: 'Chat', meeting: 'Họp', call: 'Cuộc gọi', verbal: 'Nói miệng', other: 'Khác' };

  let items = [];
  let openId = null;

  async function load() {
    const data = await OffiqaIDB.get(STORE_KEY);
    return Array.isArray(data) ? data : [];
  }
  async function persist() {
    await OffiqaIDB.set(STORE_KEY, items);
  }

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function isOverdue(item) {
    return item.date && item.date < todayStr();
  }

  function render() {
    const active = items.filter((i) => i.status !== 'done');
    if (active.length === 0) {
      els.empty.hidden = false;
      els.body.innerHTML = '';
      return;
    }
    els.empty.hidden = true;
    // Sort: overdue first, then by date asc, then by createdAt
    const sorted = [...active].sort((a, b) => {
      const ao = isOverdue(a) ? 0 : (a.date ? 1 : 2);
      const bo = isOverdue(b) ? 0 : (b.date ? 1 : 2);
      if (ao !== bo) return ao - bo;
      return (a.date || '9999') < (b.date || '9999') ? -1 : 1;
    });
    els.body.innerHTML = sorted.map(itemHtml).join('');
    bindItemEvents();
  }

  function itemHtml(item) {
    const isOpen = item.id === openId;
    const icon = SOURCE_ICONS[item.source] || '📌';
    const srcLabel = SOURCE_LABELS[item.source] || item.source;
    const overdue = isOverdue(item);
    return `
      <div class="cfu-item${isOpen ? ' is-open' : ''}" data-id="${esc(item.id)}">
        <div class="cfu-item-summary" data-act="toggle">
          <div class="cfu-item-name">${esc(item.requester)}</div>
          <div class="cfu-item-deal">${esc(item.task)}</div>
          <div class="wr-item-meta">
            <span class="wr-badge">${icon} ${esc(srcLabel)}</span>
            ${overdue ? `<span class="wr-badge urgent">Quá hạn</span>` : ''}
            ${item.date ? `<span class="wr-date">${esc(item.date)}</span>` : ''}
          </div>
        </div>
        ${isOpen ? `
          <div class="cfu-item-detail">
            <div class="cfu-item-detail-row">
              <span class="cfu-item-detail-label">Công việc</span>
              ${esc(item.task)}
            </div>
            ${item.date ? `
              <div class="cfu-item-detail-row">
                <span class="cfu-item-detail-label">Deadline</span>
                ${esc(item.date)}
              </div>` : ''}
            ${item.link ? `
              <div class="cfu-item-detail-row">
                <span class="cfu-item-detail-label">Link</span>
                <a href="${esc(item.link)}" target="_blank" style="color:var(--green);text-decoration:none;">${esc(item.link)}</a>
              </div>` : ''}
            <div class="cfu-item-actions">
              <button type="button" class="cfu-action-btn is-primary" data-act="done">✓ Đã xong</button>
              <button type="button" class="cfu-action-btn" data-act="copy">Copy task</button>
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
      case 'done':
        items.splice(idx, 1);
        if (openId === id) openId = null;
        flash(`✓ Đã xong: ${item.task}`);
        break;
      case 'copy': {
        const tpl = `[${SOURCE_LABELS[item.source] || item.source}] ${item.requester}: ${item.task}${item.date ? ` — Deadline: ${item.date}` : ''}${item.link ? `\nLink: ${item.link}` : ''}`;
        try { navigator.clipboard.writeText(tpl); } catch (_) {}
        flash('Đã copy task');
        return;
      }
      case 'delete':
        if (!confirm(`Xóa "${item.task}"?`)) return;
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

  function showForm(show) {
    els.form.hidden = !show;
    if (show) {
      els.source.value = 'email';
      els.date.value = '';
      els.link.value = '';
      setTimeout(() => els.requester.focus(), 0);
    } else {
      els.requester.value = els.task.value = els.link.value = '';
    }
  }

  els.addBtn.addEventListener('click', () => showForm(els.form.hidden));
  els.cancel.addEventListener('click', () => showForm(false));
  els.save.addEventListener('click', () => {
    const requester = els.requester.value.trim();
    const task      = els.task.value.trim();
    if (!requester) { els.requester.focus(); return; }
    if (!task)      { els.task.focus(); return; }
    const link = els.link.value.trim();
    if (link && !/^https?:\/\//i.test(link)) { flash('Link phải bắt đầu bằng https://'); return; }
    items.push({
      id: 'wr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      requester, task,
      source: els.source.value || 'other',
      date:   els.date.value || '',
      link:   link,
      status: 'active',
      createdAt: Date.now()
    });
    persist();
    showForm(false);
    render();
  });
  [els.requester, els.task].forEach((inp) => {
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') els.save.click(); });
  });
  els.openAll.addEventListener('click', (e) => { e.preventDefault(); showForm(true); });

  load().then((data) => {
    items = Array.isArray(data) ? data : [];
    render();
  });
})();
