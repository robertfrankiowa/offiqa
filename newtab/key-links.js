// Key Links — optional New Tab block.
// Storage: IndexedDB (OffiqaIDB) under key "offiqa_key_links".
(() => {
  const STORE_KEY = 'offiqa_key_links';
  const card = document.getElementById('key-links-card');
  if (!card) return;

  const els = {
    addBtn:  document.getElementById('kl-add-btn'),
    form:    document.getElementById('kl-form'),
    emoji:   document.getElementById('kl-emoji-input'),
    name:    document.getElementById('kl-name-input'),
    url:     document.getElementById('kl-url-input'),
    save:    document.getElementById('kl-save-btn'),
    cancel:  document.getElementById('kl-cancel-btn'),
    body:    document.getElementById('kl-body'),
    empty:   document.getElementById('kl-empty')
  };

  let links = [];

  async function load() {
    const data = await OffiqaIDB.get(STORE_KEY);
    return Array.isArray(data) ? data : [];
  }
  async function persist() {
    await OffiqaIDB.set(STORE_KEY, links);
  }

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  function render() {
    if (links.length === 0) {
      els.empty.hidden = false;
      els.body.innerHTML = '';
      return;
    }
    els.empty.hidden = true;
    els.body.innerHTML = links.map(linkHtml).join('');
    bindBodyEvents();
  }

  function linkHtml(link) {
    const icon = link.emoji || '🔗';
    return `
      <div class="kl-link-item" data-id="${esc(link.id)}" data-url="${esc(link.url)}" data-act="open" role="button" tabindex="0">
        <span class="kl-link-emoji">${esc(icon)}</span>
        <span class="kl-link-name">${esc(link.name)}</span>
        <span class="kl-link-arrow">↗</span>
        <button type="button" class="kl-link-delete" data-id="${esc(link.id)}" data-act="delete" title="Xóa link">×</button>
      </div>`;
  }

  function bindBodyEvents() {
    els.body.querySelectorAll('[data-act]').forEach((node) => {
      node.addEventListener('click', (e) => {
        e.stopPropagation();
        const act = node.dataset.act;
        const id  = node.dataset.id || node.closest('[data-id]')?.dataset.id;
        if (act === 'open') {
          const url = node.dataset.url;
          if (url) window.open(url, '_blank');
        } else if (act === 'delete') {
          links = links.filter((l) => l.id !== id);
          persist();
          render();
        }
      });
    });
    // Keyboard support
    els.body.querySelectorAll('.kl-link-item').forEach((node) => {
      node.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          window.open(node.dataset.url, '_blank');
        }
      });
    });
  }

  function showForm(show) {
    els.form.hidden = !show;
    if (show) {
      els.emoji.value = '';
      els.name.value = '';
      els.url.value = '';
      setTimeout(() => els.name.focus(), 0);
    }
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

  els.addBtn.addEventListener('click', () => showForm(els.form.hidden));
  els.cancel.addEventListener('click', () => showForm(false));
  els.save.addEventListener('click', () => {
    const name = els.name.value.trim();
    const url  = els.url.value.trim();
    if (!name) { els.name.focus(); return; }
    if (!url)  { els.url.focus(); return; }
    if (!/^https?:\/\//i.test(url)) { flash('URL phải bắt đầu bằng https://'); return; }
    links.push({
      id:    'kl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      name,
      url,
      emoji: els.emoji.value.trim() || '🔗',
      createdAt: Date.now()
    });
    persist();
    showForm(false);
    render();
  });
  [els.name, els.url].forEach((inp) => {
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') els.save.click(); });
  });

  load().then((data) => {
    links = Array.isArray(data) ? data : [];
    render();
  });
})();
