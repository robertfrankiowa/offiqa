// Client Follow-up Workspace — optional New Tab block.
// Storage: IndexedDB (OffiqaIDB) under key "offiqa_client_followups".
(() => {
  const STORE_KEY = 'offiqa_client_followups';
  const card = document.getElementById('client-followup-card');
  if (!card) return;

  const els = {
    addBtn: document.getElementById('cfu-add-btn'),
    form: document.getElementById('cfu-form'),
    name: document.getElementById('cfu-name-input'),
    deal: document.getElementById('cfu-deal-input'),
    next: document.getElementById('cfu-next-input'),
    date: document.getElementById('cfu-date-input'),
    status: document.getElementById('cfu-status-input'),
    save: document.getElementById('cfu-save-btn'),
    cancel: document.getElementById('cfu-cancel-btn'),
    body: document.getElementById('cfu-body'),
    empty: document.getElementById('cfu-empty'),
    todaySection: document.getElementById('cfu-today-section'),
    todayList: document.getElementById('cfu-today-list'),
    waitingSection: document.getElementById('cfu-waiting-section'),
    waitingCount: document.getElementById('cfu-waiting-count'),
    waitingList: document.getElementById('cfu-waiting-list'),
    openAll: document.getElementById('cfu-open-all')
  };

  let clients = [];
  let openId = null;

  // ---------- storage ----------
  async function load() {
    const data = await OffiqaIDB.get(STORE_KEY);
    return Array.isArray(data) ? data : [];
  }
  async function persist() {
    await OffiqaIDB.set(STORE_KEY, clients);
  }

  // ---------- helpers ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  function todayStr() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function bucketOf(c) {
    if (c.status === 'waiting') return 'waiting';
    if (c.status === 'done') return 'done';
    if (!c.date) return 'today';
    return c.date <= todayStr() ? 'today' : 'upcoming';
  }

  // ---------- render ----------
  function render() {
    const today = clients.filter((c) => bucketOf(c) === 'today');
    const waiting = clients.filter((c) => bucketOf(c) === 'waiting');
    const total = today.length + waiting.length;

    if (total === 0) {
      els.empty.hidden = false;
      els.todaySection.hidden = true;
      els.waitingSection.hidden = true;
      return;
    }
    els.empty.hidden = true;

    if (today.length) {
      els.todaySection.hidden = false;
      els.todayList.innerHTML = today.map(itemHtml).join('');
    } else {
      els.todaySection.hidden = true;
    }
    if (waiting.length) {
      els.waitingSection.hidden = false;
      els.waitingCount.textContent = waiting.length;
      els.waitingList.innerHTML = waiting.map(itemHtml).join('');
    } else {
      els.waitingSection.hidden = true;
    }
    bindItemEvents();
  }

  function itemHtml(c) {
    const isOpen = c.id === openId;
    const next = c.next ? esc(c.next) : '<span style="color:var(--text-muted)">Chưa có việc tiếp theo</span>';
    return `
      <div class="cfu-item${isOpen ? ' is-open' : ''}" data-id="${esc(c.id)}">
        <div class="cfu-item-summary" data-act="toggle">
          <span class="cfu-item-name">${esc(c.name)}</span>
          <span class="cfu-item-deal">${esc(c.deal || c.next || '')}</span>
        </div>
        ${isOpen ? `
          <div class="cfu-item-detail">
            ${c.deal ? `<div class="cfu-item-detail-row"><span class="cfu-item-detail-label">Deal</span>${esc(c.deal)}</div>` : ''}
            <div class="cfu-item-detail-row"><span class="cfu-item-detail-label">Next</span>${next}</div>
            ${c.lastNote ? `<div class="cfu-item-detail-row"><span class="cfu-item-detail-label">Ghi chú gần nhất</span>${esc(c.lastNote)}</div>` : ''}
            ${c.date ? `<div class="cfu-item-detail-row"><span class="cfu-item-detail-label">Follow-up</span>${esc(c.date)}</div>` : ''}
            <div class="cfu-item-actions">
              <button type="button" class="cfu-action-btn is-primary" data-act="done">Đã xong</button>
              <button type="button" class="cfu-action-btn" data-act="snooze">Nhắc lại ngày mai</button>
              <button type="button" class="cfu-action-btn" data-act="toggle-wait">${c.status === 'waiting' ? 'Đã có phản hồi' : 'Chuyển sang chờ'}</button>
              <button type="button" class="cfu-action-btn" data-act="copy">Copy mẫu email</button>
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
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          handleAction(id, btn.dataset.act);
        });
      });
    });
  }

  function handleAction(id, act) {
    const idx = clients.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const c = clients[idx];
    switch (act) {
      case 'toggle':
        openId = openId === id ? null : id;
        break;
      case 'done':
        clients.splice(idx, 1);
        if (openId === id) openId = null;
        break;
      case 'snooze': {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        c.date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        c.status = 'today';
        break;
      }
      case 'toggle-wait':
        c.status = c.status === 'waiting' ? 'today' : 'waiting';
        break;
      case 'copy': {
        const tpl = `Hi ${c.name},\n\nJust following up on ${c.deal || 'our last conversation'}. ${c.next || 'Let me know if there is anything I can help with.'}\n\nThanks!`;
        try { navigator.clipboard.writeText(tpl); } catch (_) {}
        flash(`Đã copy mẫu email cho ${c.name}`);
        return;
      }
      case 'note': {
        const note = prompt('Ghi chú gần nhất:', c.lastNote || '');
        if (note == null) return;
        c.lastNote = note.trim();
        break;
      }
      case 'delete':
        if (!confirm(`Xóa "${c.name}"?`)) return;
        clients.splice(idx, 1);
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
    setTimeout(() => {
      node.style.opacity = '0';
      setTimeout(() => node.remove(), 250);
    }, 1600);
  }

  // ---------- form ----------
  function showForm(show) {
    els.form.hidden = !show;
    if (show) {
      els.date.value = todayStr();
      els.status.value = 'today';
      setTimeout(() => els.name.focus(), 0);
    } else {
      els.name.value = els.deal.value = els.next.value = '';
    }
  }

  els.addBtn.addEventListener('click', () => showForm(els.form.hidden));
  els.cancel.addEventListener('click', () => showForm(false));
  els.save.addEventListener('click', () => {
    const name = els.name.value.trim();
    if (!name) { els.name.focus(); return; }
    clients.push({
      id: 'cfu_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      deal: els.deal.value.trim(),
      next: els.next.value.trim(),
      date: els.date.value || todayStr(),
      status: els.status.value || 'today',
      lastNote: '',
      createdAt: Date.now()
    });
    persist();
    showForm(false);
    render();
  });
  [els.name, els.deal, els.next].forEach((inp) => {
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') els.save.click(); });
  });

  els.openAll.addEventListener('click', (e) => {
    e.preventDefault();
    showForm(true);
  });

  // ---------- init ----------
  load().then((data) => {
    clients = Array.isArray(data) ? data : [];
    render();
  });
})();
