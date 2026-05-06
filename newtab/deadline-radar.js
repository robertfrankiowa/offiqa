// Deadline Radar — optional New Tab block.
// Storage: IndexedDB (OffiqaIDB) under key "offiqa_deadline_radar".
(() => {
  const STORE_KEY = 'offiqa_deadline_radar';
  const card = document.getElementById('deadline-radar-card');
  if (!card) return;

  const els = {
    viewPills: document.getElementById('dl-view-pills'),
    form:      document.getElementById('dl-form'),
    taskInp:   document.getElementById('dl-task-input'),
    dateInp:   document.getElementById('dl-date-input'),
    urgency:   document.getElementById('dl-urgency-input'),
    save:      document.getElementById('dl-save-btn'),
    cancel:    document.getElementById('dl-cancel-btn'),
    body:      document.getElementById('dl-body'),
    empty:     document.getElementById('dl-empty'),
    addBtn:    document.getElementById('dl-add-btn')
  };

  let items = [];
  let view  = 'today'; // today | 3days | week
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

  function offsetDate(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function endOfWeek() {
    const d = new Date();
    const dow = d.getDay(); // 0=sun
    const diff = 7 - dow;
    d.setDate(d.getDate() + diff);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function cutoffFor(v) {
    if (v === 'today')  return todayStr();
    if (v === '3days')  return offsetDate(3);
    if (v === 'week')   return endOfWeek();
    return todayStr();
  }

  function bucketLabel(date) {
    const t = todayStr();
    if (date < t) return '⚠️ Quá hạn';
    if (date === t) return '🔴 Hôm nay';
    if (date === offsetDate(1)) return '🟡 Ngày mai';
    return `📅 ${date}`;
  }

  function render() {
    const today = todayStr();
    const cutoff = cutoffFor(view);
    const visible = items
      .filter((i) => !i.done && i.date && i.date <= cutoff)
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    if (visible.length === 0) {
      els.empty.hidden = false;
      els.body.innerHTML = '';
      return;
    }
    els.empty.hidden = true;

    // Group by date bucket
    const groups = {};
    visible.forEach((i) => {
      const label = bucketLabel(i.date);
      if (!groups[label]) groups[label] = [];
      groups[label].push(i);
    });

    let html = '';
    Object.entries(groups).forEach(([label, grpItems]) => {
      html += `<div class="dl-date-group-label">${esc(label)}</div>`;
      html += grpItems.map(itemHtml).join('');
    });
    els.body.innerHTML = html;
    bindItemEvents();
  }

  function itemHtml(item) {
    const isOpen = item.id === openId;
    const overdue = item.date < todayStr();
    return `
      <div class="cfu-item${isOpen ? ' is-open' : ''}" data-id="${esc(item.id)}">
        <div class="cfu-item-summary" data-act="toggle">
          <div class="cfu-item-name">${esc(item.task)}</div>
          <div class="dl-item-meta">
            ${item.urgency === 'urgent' ? '<span class="dl-badge urgent">Khẩn</span>' : ''}
            ${overdue ? '<span class="dl-badge overdue">Quá hạn</span>' : ''}
            <span class="dl-date">${esc(item.date)}</span>
          </div>
        </div>
        ${isOpen ? `
          <div class="cfu-item-detail">
            <div class="cfu-item-detail-row">
              <span class="cfu-item-detail-label">Nhiệm vụ</span>
              ${esc(item.task)}
            </div>
            <div class="cfu-item-detail-row">
              <span class="cfu-item-detail-label">Hạn chót</span>
              ${esc(item.date)}
            </div>
            <div class="cfu-item-actions">
              <button type="button" class="cfu-action-btn is-primary" data-act="done">✓ Đã xong</button>
              <button type="button" class="cfu-action-btn" data-act="snooze">+1 ngày</button>
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
        item.done = true;
        if (openId === id) openId = null;
        flash(`✓ Xong: ${item.task}`);
        break;
      case 'snooze': {
        const d = new Date(item.date + 'T00:00:00');
        d.setDate(d.getDate() + 1);
        item.date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        flash('Đã dời hạn thêm 1 ngày');
        break;
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

  // ---------- view pills ----------
  els.viewPills.querySelectorAll('.dl-view-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      els.viewPills.querySelectorAll('.dl-view-pill').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      view = btn.dataset.view;
      render();
    });
  });

  // ---------- form ----------
  function showForm(show) {
    els.form.hidden = !show;
    if (show) {
      els.dateInp.value = todayStr();
      els.urgency.value = 'normal';
      setTimeout(() => els.taskInp.focus(), 0);
    } else {
      els.taskInp.value = '';
    }
  }

  els.addBtn.addEventListener('click', () => showForm(els.form.hidden));
  els.cancel.addEventListener('click', () => showForm(false));
  els.save.addEventListener('click', () => {
    const task = els.taskInp.value.trim();
    const date = els.dateInp.value;
    if (!task) { els.taskInp.focus(); return; }
    if (!date) { els.dateInp.focus(); return; }
    items.push({
      id: 'dl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      task, date,
      urgency: els.urgency.value || 'normal',
      done: false,
      createdAt: Date.now()
    });
    persist();
    showForm(false);
    render();
  });
  els.taskInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') els.save.click(); });

  load().then((data) => {
    items = Array.isArray(data) ? data : [];
    render();
  });
})();
