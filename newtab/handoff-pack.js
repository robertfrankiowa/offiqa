// Handoff Pack — optional New Tab block.
// Storage: IndexedDB (OffiqaIDB) under key "offiqa_handoff_pack".
// Keeps a history of the last 5 handoffs for quick re-copy.
(() => {
  const STORE_KEY  = 'offiqa_handoff_pack';
  const MAX_HISTORY = 5;
  const card = document.getElementById('handoff-pack-card');
  if (!card) return;

  const els = {
    copyBtn:  document.getElementById('hp-copy-btn'),
    name:     document.getElementById('hp-name'),
    link:     document.getElementById('hp-link'),
    status:   document.getElementById('hp-status'),
    action:   document.getElementById('hp-action'),
    deadline: document.getElementById('hp-deadline'),
    note:     document.getElementById('hp-note'),
    history:  document.getElementById('hp-history')
  };

  let history = [];

  async function load() {
    const data = await OffiqaIDB.get(STORE_KEY);
    return Array.isArray(data) ? data : [];
  }

  async function persist() {
    await OffiqaIDB.set(STORE_KEY, history);
  }

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  function buildText(entry) {
    const lines = [];
    lines.push(`📦 HANDOFF: ${entry.name}`);
    if (entry.link)     lines.push(`🔗 Link: ${entry.link}`);
    if (entry.status)   lines.push(`📊 Trạng thái: ${entry.status}`);
    if (entry.action)   lines.push(`➡️  Cần làm: ${entry.action}`);
    if (entry.deadline) lines.push(`⏰ Deadline: ${entry.deadline}`);
    if (entry.note)     lines.push(`📝 Ghi chú: ${entry.note}`);
    return lines.join('\n');
  }

  function copyText(text, btn) {
    const label = btn.textContent;
    try {
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = '✓ Đã copy!';
        setTimeout(() => { btn.textContent = label; }, 1800);
      });
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      btn.textContent = '✓ Đã copy!';
      setTimeout(() => { btn.textContent = label; }, 1800);
    }
  }

  function render() {
    if (history.length === 0) {
      els.history.innerHTML = '';
      return;
    }
    els.history.innerHTML = `
      <div class="hp-history-label">Handoff gần đây</div>
      ${history.map((entry) => `
        <div class="hp-history-item" data-id="${esc(entry.id)}">
          <span class="hp-history-name">${esc(entry.name)}</span>
          <button type="button" class="hp-history-copy" data-id="${esc(entry.id)}" title="Copy lại">📋 Copy</button>
          <button type="button" class="hp-history-delete" data-id="${esc(entry.id)}" title="Xóa">×</button>
        </div>`).join('')}`;
    bindHistoryEvents();
  }

  function bindHistoryEvents() {
    els.history.querySelectorAll('.hp-history-copy').forEach((btn) => {
      btn.addEventListener('click', () => {
        const entry = history.find((h) => h.id === btn.dataset.id);
        if (entry) copyText(buildText(entry), btn);
      });
    });
    els.history.querySelectorAll('.hp-history-delete').forEach((btn) => {
      btn.addEventListener('click', () => {
        history = history.filter((h) => h.id !== btn.dataset.id);
        persist();
        render();
      });
    });
  }

  // ---------- main copy button ----------
  els.copyBtn.addEventListener('click', () => {
    const name = els.name.value.trim();
    if (!name) { els.name.focus(); return; }

    const entry = {
      id:       'hp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      name,
      link:     els.link.value.trim(),
      status:   els.status.value.trim(),
      action:   els.action.value.trim(),
      deadline: els.deadline.value,
      note:     els.note.value.trim(),
      createdAt: Date.now()
    };

    const text = buildText(entry);
    copyText(text, els.copyBtn);

    // Add to history (keep last MAX_HISTORY)
    history.unshift(entry);
    if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
    persist();
    render();

    // Clear fields
    els.name.value = els.link.value = els.status.value = '';
    els.action.value = els.deadline.value = els.note.value = '';
  });

  // ---------- init ----------
  load().then((data) => {
    history = Array.isArray(data) ? data : [];
    render();
  });
})();
