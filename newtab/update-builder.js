// Update Builder — optional New Tab block. No backend needed.
// Storage: IndexedDB (OffiqaIDB) under key "offiqa_update_builder".
(() => {
  const STORE_KEY = 'offiqa_update_builder';
  const card = document.getElementById('update-builder-card');
  if (!card) return;

  const els = {
    pills:    document.getElementById('ub-template-pills'),
    textarea: document.getElementById('ub-textarea'),
    copyBtn:  document.getElementById('ub-copy-btn'),
    clearBtn: document.getElementById('ub-clear-btn')
  };

  let currentTpl = 'daily';

  const TEMPLATES = {
    daily: {
      label: 'Daily update',
      text:
`Hôm nay tôi đã làm:
- 

Đang chờ / blocked:
- 

Ngày mai / bước tiếp theo:
- `
    },
    weekly: {
      label: 'Weekly update',
      text:
`Tuần này tôi đã làm:
- 

Kết quả nổi bật:
- 

Tuần tới ưu tiên:
- 

Cần hỗ trợ / blocked:
- `
    },
    project: {
      label: 'Project status',
      text:
`Dự án:
Giai đoạn: 
Hoàn thành:
- 

Đang làm:
- 

Bước tiếp theo:
- 

Rủi ro / blocked:
- `
    },
    recap: {
      label: 'Meeting recap',
      text:
`Cuộc họp:
Ngày:
Người tham dự:

Điểm chính đã thảo luận:
- 

Quyết định đã chốt:
- 

Action items:
- [ ] 
- [ ] `
    },
    blocker: {
      label: 'Blocker report',
      text:
`Blocker:
Mô tả vấn đề:

Ảnh hưởng:
- 

Đã thử:
- 

Cần hỗ trợ từ:
- 

Deadline bị ảnh hưởng:`
    },
    client: {
      label: 'Client update',
      text:
`Kính gửi [Tên khách hàng],

Cập nhật tiến độ dự án:

Đã hoàn thành:
- 

Đang thực hiện:
- 

Bước tiếp theo:
- 

Ngày cập nhật tiếp theo:

Trân trọng,
[Tên]`
    }
  };

  async function load() {
    return await OffiqaIDB.get(STORE_KEY); // returns null if not found
  }

  async function persist() {
    const draft = { tpl: currentTpl, text: els.textarea.value };
    await OffiqaIDB.set(STORE_KEY, draft);
  }

  // ---------- template switch ----------
  els.pills.querySelectorAll('.ub-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      els.pills.querySelectorAll('.ub-pill').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentTpl = btn.dataset.tpl;
      // Only replace if textarea is empty or has default template content
      const tpl = TEMPLATES[currentTpl];
      if (tpl) {
        const currentText = els.textarea.value;
        const isBlank = !currentText.trim();
        // Check if it matches any template
        const isDefaultContent = Object.values(TEMPLATES).some((t) => t.text.trim() === currentText.trim());
        if (isBlank || isDefaultContent) {
          els.textarea.value = tpl.text;
        }
      }
      persist();
    });
  });

  // ---------- copy ----------
  els.copyBtn.addEventListener('click', () => {
    const text = els.textarea.value;
    if (!text.trim()) return;
    try {
      navigator.clipboard.writeText(text).then(() => {
        els.copyBtn.classList.add('ub-copied');
        els.copyBtn.textContent = '✓ Đã copy!';
        setTimeout(() => {
          els.copyBtn.classList.remove('ub-copied');
          els.copyBtn.textContent = '📋 Copy update';
        }, 1800);
      });
    } catch (_) {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      els.copyBtn.textContent = '✓ Đã copy!';
      setTimeout(() => { els.copyBtn.textContent = '📋 Copy update'; }, 1800);
    }
  });

  // ---------- clear ----------
  els.clearBtn.addEventListener('click', () => {
    if (!els.textarea.value.trim()) return;
    if (!confirm('Xóa nội dung hiện tại?')) return;
    els.textarea.value = TEMPLATES[currentTpl]?.text || '';
    persist();
  });

  // ---------- auto-save on type ----------
  let saveTimer;
  els.textarea.addEventListener('input', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 600);
  });

  // ---------- init ----------
  load().then((draft) => {
    if (draft && draft.tpl && TEMPLATES[draft.tpl]) {
      currentTpl = draft.tpl;
      els.textarea.value = draft.text || TEMPLATES[currentTpl].text;
      // Activate the correct pill
      els.pills.querySelectorAll('.ub-pill').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.tpl === currentTpl);
      });
    } else {
      els.textarea.value = TEMPLATES.daily.text;
    }
  });
})();
