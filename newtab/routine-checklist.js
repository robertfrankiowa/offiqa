// Routine Checklist — optional New Tab block.
// Storage: IndexedDB (OffiqaIDB) under key "offiqa_routine_checklist".
// Auto-resets check state each new day while preserving the item list.
(() => {
  const STORE_KEY = 'offiqa_routine_checklist';
  const card = document.getElementById('routine-checklist-card');
  if (!card) return;

  const els = {
    manageBtn:    document.getElementById('rl-manage-btn'),
    resetBtn:     document.getElementById('rl-reset-btn'),
    templatePicker: document.getElementById('rl-template-picker'),
    templates:    document.getElementById('rl-templates'),
    body:         document.getElementById('rl-body'),
    addRow:       document.getElementById('rl-add-row'),
    newItemInp:   document.getElementById('rl-new-item-input'),
    addItemBtn:   document.getElementById('rl-add-item-btn')
  };

  const TEMPLATES = {
    morning: {
      label: '🌅 Buổi sáng',
      sections: [
        { title: 'Buổi sáng', items: ['Kiểm tra email khẩn', 'Xem lại lịch họp hôm nay', 'Cập nhật danh sách ưu tiên'] }
      ]
    },
    eod: {
      label: '🌇 Cuối ngày',
      sections: [
        { title: 'Cuối ngày', items: ['Lưu tab đang mở', 'Dọn follow-up còn lại', 'Ghi lại ưu tiên ngày mai'] }
      ]
    },
    publish: {
      label: '📄 Publish',
      sections: [
        { title: 'Trước khi đăng', items: ['Kiểm tra nội dung lần cuối', 'Xem trước trên mobile', 'Điền đầy đủ meta/SEO', 'Chọn ảnh thumbnail', 'Lên lịch hoặc đăng ngay'] }
      ]
    },
    custom: {
      label: '✨ Tự tạo',
      sections: [
        { title: 'Checklist của tôi', items: [] }
      ]
    }
  };

  // State shape: { sections: [{title, items:[{id,text}]}], checks: {id: bool}, lastResetDate: string }
  let state = { sections: [], checks: {}, lastResetDate: '' };
  let manageMode = false;

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  async function load() {
    return await OffiqaIDB.get(STORE_KEY); // returns null if not found
  }
  async function persist() {
    await OffiqaIDB.set(STORE_KEY, state);
  }

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  function autoReset() {
    const today = todayStr();
    if (state.lastResetDate !== today) {
      state.checks = {};
      state.lastResetDate = today;
      persist();
    }
  }

  function hasItems() {
    return state.sections && state.sections.some((s) => s.items && s.items.length > 0);
  }

  function progressHtml() {
    const allItems = state.sections.flatMap((s) => s.items);
    const total = allItems.length;
    if (total === 0) return '';
    const done = allItems.filter((i) => state.checks[i.id]).length;
    const pct = Math.round((done / total) * 100);
    return `<div class="rl-progress"><div class="rl-progress-fill" style="width:${pct}%"></div></div>`;
  }

  function render() {
    if (!hasItems()) {
      // Show template picker, hide everything else
      els.templatePicker.hidden = false;
      els.body.innerHTML = '';
      els.addRow.hidden = true;
      els.resetBtn.hidden = true;
      return;
    }
    els.templatePicker.hidden = true;
    els.resetBtn.hidden = false;

    let html = progressHtml();
    state.sections.forEach((sec) => {
      if (state.sections.length > 1 || sec.title) {
        html += `<div class="rl-section-label">${esc(sec.title)}</div>`;
      }
      sec.items.forEach((item) => {
        const done = !!state.checks[item.id];
        html += `
          <div class="rl-checklist-item${done ? ' is-done' : ''}${manageMode ? ' rl-manage-mode' : ''}" data-id="${esc(item.id)}" data-act="toggle">
            <div class="rl-checkbox"></div>
            <span class="rl-item-text">${esc(item.text)}</span>
            <button type="button" class="rl-item-delete" data-id="${esc(item.id)}" data-act="delete" title="Xóa mục">×</button>
          </div>`;
      });
    });
    els.body.innerHTML = html;

    // Add row only when in manage mode AND has items
    els.addRow.hidden = !manageMode;

    if (manageMode) {
      els.body.classList.add('rl-manage-mode');
    } else {
      els.body.classList.remove('rl-manage-mode');
    }
    bindBodyEvents();
  }

  function bindBodyEvents() {
    els.body.querySelectorAll('[data-act]').forEach((node) => {
      node.addEventListener('click', (e) => {
        e.stopPropagation();
        const act = node.dataset.act;
        const id  = node.dataset.id;
        if (act === 'toggle' && !manageMode) {
          state.checks[id] = !state.checks[id];
          persist();
          render();
        } else if (act === 'delete') {
          state.sections.forEach((sec) => {
            sec.items = sec.items.filter((i) => i.id !== id);
          });
          delete state.checks[id];
          persist();
          render();
        }
      });
    });
  }

  // ---------- template picker ----------
  els.templates.querySelectorAll('.rl-template-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tpl = TEMPLATES[btn.dataset.template];
      if (!tpl) return;
      state.sections = tpl.sections.map((sec) => ({
        title: sec.title,
        items: sec.items.map((text) => ({
          id: 'rl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) + Math.random().toString(36).slice(2,4),
          text
        }))
      }));
      state.checks = {};
      state.lastResetDate = todayStr();
      persist();
      render();
    });
  });

  // ---------- manage / reset ----------
  els.manageBtn.addEventListener('click', () => {
    manageMode = !manageMode;
    els.manageBtn.textContent = manageMode ? 'Xong' : 'Quản lý';
    render();
  });

  els.resetBtn.addEventListener('click', () => {
    if (!confirm('Reset toàn bộ checklist hôm nay?')) return;
    state.checks = {};
    state.lastResetDate = todayStr();
    persist();
    render();
  });

  // ---------- add item ----------
  function addItem() {
    const text = els.newItemInp.value.trim();
    if (!text) { els.newItemInp.focus(); return; }
    if (!state.sections.length) {
      state.sections = [{ title: 'Checklist của tôi', items: [] }];
    }
    state.sections[state.sections.length - 1].items.push({
      id: 'rl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      text
    });
    els.newItemInp.value = '';
    persist();
    render();
    setTimeout(() => els.newItemInp.focus(), 0);
  }

  els.addItemBtn.addEventListener('click', addItem);
  els.newItemInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') addItem(); });

  // ---------- init ----------
  load().then((data) => {
    if (data && data.sections) {
      state = data;
    } else {
      state = { sections: [], checks: {}, lastResetDate: '' };
    }
    autoReset();
    render();
  });
})();
