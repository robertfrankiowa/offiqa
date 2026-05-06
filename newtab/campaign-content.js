// Campaign & Content Workspace — optional New Tab block.
// Storage: IndexedDB (OffiqaIDB) under key "offiqa_campaign_content".
(() => {
  const STORE_KEY = 'offiqa_campaign_content';
  const card = document.getElementById('campaign-content-card');
  if (!card) return;

  const els = {
    addBtn: document.getElementById('cmc-add-btn'),
    form: document.getElementById('cmc-form'),
    name: document.getElementById('cmc-name-input'),
    type: document.getElementById('cmc-type-input'),
    next: document.getElementById('cmc-next-input'),
    date: document.getElementById('cmc-date-input'),
    status: document.getElementById('cmc-status-input'),
    save: document.getElementById('cmc-save-btn'),
    cancel: document.getElementById('cmc-cancel-btn'),
    body: document.getElementById('cmc-body'),
    empty: document.getElementById('cmc-empty'),
    todaySection: document.getElementById('cmc-today-section'),
    todayList: document.getElementById('cmc-today-list'),
    waitingSection: document.getElementById('cmc-waiting-section'),
    waitingCount: document.getElementById('cmc-waiting-count'),
    waitingList: document.getElementById('cmc-waiting-list'),
    ideasSection: document.getElementById('cmc-ideas-section'),
    ideasCount: document.getElementById('cmc-ideas-count'),
    ideasList: document.getElementById('cmc-ideas-list'),
    openAll: document.getElementById('cmc-open-all')
  };

  let items = [];
  let openId = null;

  // ---------- default checklists per type ----------
  const CHECKLISTS = {
    blog: ['Outline', 'Draft', 'Review', 'Internal links', 'Meta title', 'Meta description', 'Image / asset', 'Publish'],
    landing: ['Wireframe', 'Copy', 'Design', 'Review', 'CTA', 'UTM', 'Publish'],
    email: ['Subject lines', 'Copy', 'Creative', 'Review', 'Schedule', 'UTM'],
    social: ['Copy', 'Creative', 'Review', 'Schedule', 'UTM'],
    ads: ['Audience', 'Creative', 'Copy', 'Tracking / UTM', 'Review', 'Launch'],
    campaign: ['Brief', 'Assets', 'Channels', 'Schedule', 'Tracking', 'Review', 'Launch', 'Report'],
    other: ['To do', 'Review', 'Done']
  };
  const TYPE_LABEL = {
    blog: 'Blog/SEO', landing: 'Landing', email: 'Email', social: 'Social',
    ads: 'Ads', campaign: 'Campaign', other: 'Khác'
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
    return `
      <div class="cfu-item-detail-row">
        <span class="cfu-item-detail-label">Checklist</span>
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
    const summary = it.next ? esc(it.next) : (it.deal ? esc(it.deal) : '');
    return `
      <div class="cfu-item${isOpen ? ' is-open' : ''}" data-id="${esc(it.id)}">
        <div class="cfu-item-summary" data-act="toggle">
          ${typeBadge}
          <span class="cfu-item-name">${esc(it.name)}</span>
          ${summary ? `<span class="cfu-item-deal">${summary}</span>` : ''}
        </div>
        ${isOpen ? `
          <div class="cfu-item-detail">
            <div class="cfu-item-detail-row"><span class="cfu-item-detail-label">Next</span>${it.next ? esc(it.next) : '<span style="color:var(--text-muted)">Chưa có việc tiếp theo</span>'}</div>
            ${it.lastNote ? `<div class="cfu-item-detail-row"><span class="cfu-item-detail-label">Ghi chú gần nhất</span>${esc(it.lastNote)}</div>` : ''}
            ${it.date ? `<div class="cfu-item-detail-row"><span class="cfu-item-detail-label">Deadline</span>${esc(it.date)}</div>` : ''}
            ${linksHtml(it)}
            ${checklistHtml(it)}
            <div class="cfu-item-actions">
              <button type="button" class="cfu-action-btn is-primary" data-act="done">Đã xong</button>
              <button type="button" class="cfu-action-btn" data-act="snooze">Nhắc lại ngày mai</button>
              <button type="button" class="cfu-action-btn" data-act="toggle-wait">${it.status === 'waiting' ? 'Đã có phản hồi' : 'Chờ feedback'}</button>
              ${it.status === 'idea' ? `<button type="button" class="cfu-action-btn" data-act="promote">Chuyển thành workspace</button>` : ''}
              <button type="button" class="cfu-action-btn" data-act="addlink">+ Link</button>
              <button type="button" class="cfu-action-btn" data-act="copy">Copy snippet</button>
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
      // Summary toggle
      const summary = node.querySelector('[data-act="toggle"]');
      if (summary) summary.addEventListener('click', () => handleAction(id, 'toggle'));
      // Action buttons (exclude toggle which is on summary)
      node.querySelectorAll('button[data-act]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          handleAction(id, btn.dataset.act, btn.dataset);
        });
      });
      // Checkboxes
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
        break;
      case 'addlink': {
        const url = prompt('URL (https://...):');
        if (!url) return;
        if (!/^https?:\/\//i.test(url)) { alert('URL phải bắt đầu bằng http:// hoặc https://'); return; }
        const label = prompt('Tên link (ví dụ: Docs, Sheets, Canva, CMS, Drive, Analytics):', '');
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
      case 'copy': {
        const tpl = `${it.name}\nType: ${TYPE_LABEL[it.type] || it.type}\nNext: ${it.next || '-'}\nDeadline: ${it.date || '-'}\n${(it.links || []).map(l => `- ${l.label || l.url}: ${l.url}`).join('\n')}`;
        try { navigator.clipboard.writeText(tpl); } catch (_) {}
        flash(`Đã copy snippet: ${it.name}`);
        return;
      }
      case 'note': {
        const note = prompt('Ghi chú gần nhất:', it.lastNote || '');
        if (note == null) return;
        it.lastNote = note.trim();
        break;
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
    setTimeout(() => { node.style.opacity = '0'; setTimeout(() => node.remove(), 250); }, 1600);
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
    const checklist = (CHECKLISTS[type] || CHECKLISTS.other).map((label) => ({ label, done: false }));
    items.push({
      id: 'cmc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      type,
      next: els.next.value.trim(),
      date: status === 'idea' ? '' : (els.date.value || todayStr()),
      status,
      lastNote: '',
      links: [],
      checklist: status === 'idea' ? [] : checklist,
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
