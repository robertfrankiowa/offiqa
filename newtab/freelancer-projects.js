// Freelancer Projects - optional New Tab block.
// Storage: IndexedDB (OffiqaIDB) under key "offiqa_freelancer_projects".
(() => {
  const STORE_KEY = 'offiqa_freelancer_projects';
  const card = document.getElementById('freelancer-projects-card');
  if (!card) return;

  const els = {
    addBtn: document.getElementById('fp-add-btn'),
    form: document.getElementById('fp-form'),
    name: document.getElementById('fp-name-input'),
    client: document.getElementById('fp-client-input'),
    next: document.getElementById('fp-next-input'),
    link: document.getElementById('fp-link-input'),
    scope: document.getElementById('fp-scope-input'),
    deadline: document.getElementById('fp-deadline-input'),
    progress: document.getElementById('fp-progress-input'),
    status: document.getElementById('fp-status-input'),
    priority: document.getElementById('fp-priority-input'),
    save: document.getElementById('fp-save-btn'),
    cancel: document.getElementById('fp-cancel-btn'),
    empty: document.getElementById('fp-empty'),
    body: document.getElementById('fp-body'),
    activeCount: document.getElementById('fp-active-count'),
    riskCount: document.getElementById('fp-risk-count'),
    doneCount: document.getElementById('fp-done-count'),
    riskSection: document.getElementById('fp-risk-section'),
    riskSectionCount: document.getElementById('fp-risk-section-count'),
    riskList: document.getElementById('fp-risk-list'),
    activeSection: document.getElementById('fp-active-section'),
    activeSectionCount: document.getElementById('fp-active-section-count'),
    activeList: document.getElementById('fp-active-list'),
    waitingSection: document.getElementById('fp-waiting-section'),
    waitingSectionCount: document.getElementById('fp-waiting-section-count'),
    waitingList: document.getElementById('fp-waiting-list'),
    openAll: document.getElementById('fp-open-all')
  };

  let projects = [];
  let openId = null;

  async function load() {
    const data = await OffiqaIDB.get(STORE_KEY);
    return Array.isArray(data) ? data : [];
  }

  async function persist() {
    await OffiqaIDB.set(STORE_KEY, projects);
  }

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function offsetDate(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function clampProgress(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  function isRisk(project) {
    if (project.status === 'done') return false;
    if (['waiting', 'review', 'change', 'invoice'].includes(project.status)) return true;
    if (project.priority === 'high') return true;
    if (!project.deadline) return false;
    return project.deadline <= offsetDate(2);
  }

  function deadlineBadge(project) {
    if (!project.deadline) return '';
    const today = todayStr();
    let label = project.deadline;
    let cls = '';
    if (project.deadline < today && project.status !== 'done') {
      label = 'Quá hạn';
      cls = ' is-overdue';
    } else if (project.deadline === today) {
      label = 'Hôm nay';
      cls = ' is-today';
    } else if (project.deadline === offsetDate(1)) {
      label = 'Ngày mai';
      cls = ' is-soon';
    }
    return `<span class="fp-badge${cls}">${esc(label)}</span>`;
  }

  function statusLabel(project) {
    if (project.status === 'waiting') return '<span class="fp-badge is-waiting">Chờ khách</span>';
    if (project.status === 'done') return '<span class="fp-badge is-done">Đã xong</span>';
    return '<span class="fp-badge">Đang làm</span>';
  }

  function sortByDeadline(a, b) {
    const ad = a.deadline || '9999-12-31';
    const bd = b.deadline || '9999-12-31';
    if (ad !== bd) return ad < bd ? -1 : 1;
    return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
  }

  function statusLabelV2(project) {
    const labels = {
      lead: 'Lead',
      active: 'Active',
      waiting: 'Waiting client',
      review: 'In review',
      change: 'Change request',
      invoice: 'Ready invoice',
      done: 'Done'
    };
    if (project.status === 'waiting') return `<span class="fp-badge is-waiting">${labels.waiting}</span>`;
    if (project.status === 'done') return `<span class="fp-badge is-done">${labels.done}</span>`;
    if (project.status === 'change') return `<span class="fp-badge is-high">${labels.change}</span>`;
    return `<span class="fp-badge">${labels[project.status] || labels.active}</span>`;
  }

  function renderSection(section, countEl, listEl, items) {
    section.hidden = items.length === 0;
    countEl.textContent = items.length || '';
    listEl.innerHTML = items.map(itemHtml).join('');
  }

  function render() {
    const active = projects.filter((p) => p.status !== 'done');
    const done = projects.filter((p) => p.status === 'done');
    const risk = active.filter(isRisk).sort(sortByDeadline);
    const waiting = active.filter((p) => p.status === 'waiting' && !risk.includes(p)).sort(sortByDeadline);
    const normal = active.filter((p) => p.status !== 'waiting' && !risk.includes(p)).sort(sortByDeadline);

    els.activeCount.textContent = active.length;
    els.riskCount.textContent = risk.length;
    els.doneCount.textContent = done.length;

    const hasVisible = risk.length + waiting.length + normal.length;
    els.empty.hidden = hasVisible > 0;
    renderSection(els.riskSection, els.riskSectionCount, els.riskList, risk);
    renderSection(els.activeSection, els.activeSectionCount, els.activeList, normal);
    renderSection(els.waitingSection, els.waitingSectionCount, els.waitingList, waiting);
    bindItemEvents();
  }

  function itemHtml(project) {
    const isOpen = project.id === openId;
    const progress = clampProgress(project.progress);
    const next = project.next ? esc(project.next) : '<span style="color:var(--text-muted)">Chưa có việc tiếp theo</span>';
    return `
      <div class="cfu-item fp-item${isOpen ? ' is-open' : ''}" data-id="${esc(project.id)}">
        <div class="cfu-item-summary" data-act="toggle">
          <div class="fp-item-main">
            <div class="fp-item-title-row">
              <span class="cfu-item-name">${esc(project.name)}</span>
              ${project.priority === 'high' ? '<span class="fp-badge is-high">Ưu tiên</span>' : ''}
            </div>
            <div class="cfu-item-deal">${esc(project.client || project.next || '')}</div>
            <div class="fp-progress-row">
              <div class="fp-progress-track"><span style="width:${progress}%"></span></div>
              <span class="fp-progress-value">${progress}%</span>
            </div>
          </div>
          <div class="fp-item-meta">
            ${statusLabelV2(project)}
            ${deadlineBadge(project)}
          </div>
        </div>
        ${isOpen ? `
          <div class="cfu-item-detail">
            ${project.client ? `<div class="cfu-item-detail-row"><span class="cfu-item-detail-label">Khách hàng</span>${esc(project.client)}</div>` : ''}
            <div class="cfu-item-detail-row"><span class="cfu-item-detail-label">Việc tiếp theo</span>${next}</div>
            ${project.deadline ? `<div class="cfu-item-detail-row"><span class="cfu-item-detail-label">Deadline</span>${esc(project.deadline)}</div>` : ''}
            ${project.scope ? `<div class="cfu-item-detail-row"><span class="cfu-item-detail-label">Scope</span>${esc(project.scope)}</div>` : ''}
            ${project.note ? `<div class="cfu-item-detail-row"><span class="cfu-item-detail-label">Ghi chú</span>${esc(project.note)}</div>` : ''}
            <div class="cfu-item-actions">
              ${project.link ? `<button type="button" class="cfu-action-btn" data-act="open">Open workspace</button>` : ''}
              <button type="button" class="cfu-action-btn" data-act="copy-followup">Copy follow-up</button>
              <button type="button" class="cfu-action-btn" data-act="copy-change">Copy change request</button>
              <button type="button" class="cfu-action-btn" data-act="progress-down">-10%</button>
              <button type="button" class="cfu-action-btn" data-act="progress-up">+10%</button>
              <button type="button" class="cfu-action-btn" data-act="waiting">${project.status === 'waiting' ? 'Tiếp tục làm' : 'Chờ khách'}</button>
              <button type="button" class="cfu-action-btn" data-act="snooze">Dời +1 ngày</button>
              <button type="button" class="cfu-action-btn" data-act="note">Ghi chú</button>
              <button type="button" class="cfu-action-btn is-primary" data-act="done">Đã xong</button>
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
    const idx = projects.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const project = projects[idx];
    switch (act) {
      case 'toggle':
        openId = openId === id ? null : id;
        break;
      case 'open':
        if (project.link) chrome.tabs.create({ url: project.link });
        return;
      case 'copy-followup':
        try {
          navigator.clipboard.writeText(`Just checking in on ${project.name}. What is the next step from your side, and is there anything you need from me to keep this moving?`);
        } catch (_) {}
        flash(`Copied follow-up for ${project.name}`);
        return;
      case 'copy-change':
        try {
          navigator.clipboard.writeText('Thanks — I can add this as a separate change request. I’ll estimate the extra time/cost before starting so we keep the current scope and timeline clear.');
        } catch (_) {}
        flash(`Copied change request for ${project.name}`);
        return;
      case 'progress-up':
        project.progress = clampProgress(project.progress + 10);
        break;
      case 'progress-down':
        project.progress = clampProgress(project.progress - 10);
        break;
      case 'waiting':
        project.status = project.status === 'waiting' ? 'active' : 'waiting';
        break;
      case 'snooze': {
        const base = project.deadline ? new Date(project.deadline + 'T00:00:00') : new Date();
        base.setDate(base.getDate() + 1);
        project.deadline = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
        break;
      }
      case 'note': {
        const note = prompt('Ghi chú dự án:', project.note || '');
        if (note == null) return;
        project.note = note.trim();
        break;
      }
      case 'done':
        project.status = 'done';
        project.progress = 100;
        if (openId === id) openId = null;
        flash(`Đã hoàn tất: ${project.name}`);
        break;
      case 'delete':
        if (!confirm(`Xóa dự án "${project.name}"?`)) return;
        projects.splice(idx, 1);
        if (openId === id) openId = null;
        break;
    }
    project.updatedAt = Date.now();
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

  function showForm(show) {
    els.form.hidden = !show;
    if (show) {
      els.deadline.value = offsetDate(7);
      els.progress.value = '0';
      els.status.value = 'active';
      els.priority.value = 'normal';
      setTimeout(() => els.name.focus(), 0);
    } else {
      els.name.value = '';
      els.client.value = '';
      els.next.value = '';
      if (els.link) els.link.value = '';
      if (els.scope) els.scope.value = '';
    }
  }

  els.addBtn.addEventListener('click', () => showForm(els.form.hidden));
  els.cancel.addEventListener('click', () => showForm(false));
  els.save.addEventListener('click', () => {
    const name = els.name.value.trim();
    if (!name) { els.name.focus(); return; }
    projects.push({
      id: 'fp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      client: els.client.value.trim(),
      next: els.next.value.trim(),
      link: els.link ? els.link.value.trim() : '',
      scope: els.scope ? els.scope.value.trim() : '',
      deadline: els.deadline.value || '',
      progress: clampProgress(els.progress.value),
      status: els.status.value || 'active',
      priority: els.priority.value || 'normal',
      note: '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    persist();
    showForm(false);
    render();
  });

  [els.name, els.client, els.next, els.link, els.scope].filter(Boolean).forEach((input) => {
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') els.save.click(); });
  });

  els.openAll.addEventListener('click', (e) => {
    e.preventDefault();
    showForm(true);
  });

  load().then((data) => {
    projects = data.map((p) => ({
      ...p,
      progress: clampProgress(p.progress),
      status: ['lead', 'active', 'waiting', 'review', 'change', 'invoice', 'done'].includes(p.status) ? p.status : 'active',
      priority: p.priority === 'high' ? 'high' : 'normal'
    }));
    render();
  });
})();
