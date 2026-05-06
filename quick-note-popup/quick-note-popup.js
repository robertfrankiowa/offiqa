(() => {
  const TYPE_META = {
    note: { label: 'Ghi chú', emoji: '📝', placeholder: 'Ghi nhanh điều cần nhớ...' },
    reminder: { label: 'Nhắc nhở', emoji: '⏰', placeholder: 'Nhắc mình việc gì?\nVí dụ: gửi recap sau cuộc họp' },
    checklist: { label: 'Danh sách', emoji: '☑️', placeholder: 'Mỗi dòng một việc\nGửi email follow-up\nCập nhật CRM\nChốt bước tiếp theo' },
    plan: { label: 'Kế hoạch', emoji: '🗓', placeholder: 'Kế hoạch ngắn...\nMục tiêu\nCác bước chính\nMốc cần xong' }
  };

  const params = new URLSearchParams(location.search);
  document.body.classList.toggle('is-embedded', params.get('embedded') === '1');

  const pageTitle = params.get('pageTitle') || '';
  const pageUrl = params.get('pageUrl') || '';
  let selectedType = 'note';

  const textEl = document.getElementById('quick-note-text');
  const dueEl = document.getElementById('quick-note-due');
  const timeEl = document.getElementById('quick-note-time');
  const advanceValueEl = document.getElementById('quick-note-advance-value');
  const advanceUnitEl = document.getElementById('quick-note-advance-unit');
  const scheduleEl = document.getElementById('quick-note-schedule');
  const advanceEl = document.getElementById('quick-note-advance');
  const sourceRow = document.getElementById('quick-note-source-row');
  const sourceText = document.getElementById('quick-note-source');
  const includeSourceEl = document.getElementById('quick-note-include-source');
  const saveBtn = document.getElementById('quick-note-save');
  const statusEl = document.getElementById('quick-note-status');
  const recentEl = document.getElementById('quick-note-recent');
  const recentListEl = document.getElementById('quick-note-recent-list');

  function storageGet(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  }

  function storageSet(data) {
    return new Promise((resolve) => chrome.storage.local.set(data, resolve));
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function createMemoryId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `memory_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function getChecklistItems(text) {
    return String(text || '')
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*(?:[-*•]+|\[[ xX]?\]|[0-9]+[.)]|[a-zA-Z][.)]|☐|☑|✓|✔)\s*/, '').trim())
      .filter(Boolean);
  }

  function normalizeMemoryText(type, text) {
    if (type !== 'checklist') return String(text || '').trim();
    return getChecklistItems(text).join('\n');
  }

  function normalizeReminderAdvanceUnit(unit) {
    return ['minutes', 'hours', 'days'].includes(unit) ? unit : 'minutes';
  }

  function normalizeReminderAdvanceValue(value) {
    const numeric = Math.floor(Number(value));
    if (!Number.isFinite(numeric) || numeric <= 0) return '';
    return String(Math.min(numeric, 999));
  }

  function shouldShowSchedule(type = selectedType) {
    return type === 'reminder' || type === 'plan';
  }

  function setStatus(text, tone = '') {
    statusEl.textContent = text || '';
    statusEl.className = `status${tone ? ` is-${tone}` : ''}`;
  }

  function applyType(type) {
    selectedType = TYPE_META[type] ? type : 'note';
    const meta = TYPE_META[selectedType];

    document.querySelectorAll('.type-pill').forEach((button) => {
      button.classList.toggle('active', button.dataset.type === selectedType);
    });

    textEl.placeholder = meta.placeholder;
    textEl.rows = selectedType === 'checklist' ? 8 : shouldShowSchedule() ? 5 : 7;
    scheduleEl.hidden = !shouldShowSchedule();
    advanceEl.hidden = selectedType !== 'reminder';
    setStatus('');
    textEl.focus();
  }

  function resetComposer() {
    textEl.value = '';
    dueEl.value = '';
    timeEl.value = '';
    advanceValueEl.value = '';
    advanceUnitEl.value = 'minutes';
    setStatus('Đã lưu', 'success');
    textEl.focus();
  }

  function closePopup() {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'offiqa:quick-note-close', reason: 'closed_by_iframe' }, '*');
      return;
    }
    window.close();
  }

  function renderRecent(memories) {
    const active = (Array.isArray(memories) ? memories : [])
      .filter((memory) => memory && !memory.deleted && memory.text)
      .sort((a, b) => Number(b.created || 0) - Number(a.created || 0))
      .slice(0, 3);

    if (!active.length) {
      recentEl.hidden = true;
      recentListEl.innerHTML = '';
      return;
    }

    recentEl.hidden = false;
    recentListEl.innerHTML = active.map((memory) => {
      const meta = TYPE_META[memory.type] || TYPE_META.note;
      const due = [memory.due, memory.dueTime].filter(Boolean).join(' ');
      return `
        <article class="recent-item">
          <div class="recent-meta">
            <span>${meta.emoji} ${escapeHtml(meta.label)}</span>
            ${due ? `<span>${escapeHtml(due)}</span>` : ''}
          </div>
          <div class="recent-text">${escapeHtml(memory.text).replace(/\n/g, '<br>')}</div>
        </article>
      `;
    }).join('');
  }

  async function saveMemory() {
    const text = normalizeMemoryText(selectedType, textEl.value);
    if (!text) {
      setStatus(selectedType === 'checklist' ? 'Thêm ít nhất một mục.' : 'Nhập nội dung cần lưu.', 'error');
      textEl.focus();
      return;
    }

    saveBtn.disabled = true;
    setStatus('Đang lưu...');

    const now = Date.now();
    const showSchedule = shouldShowSchedule();
    const memory = {
      id: createMemoryId(),
      type: selectedType,
      text,
      due: showSchedule ? dueEl.value.trim() : '',
      dueTime: showSchedule ? timeEl.value.trim() : '',
      ...(selectedType === 'reminder'
        ? {
            advanceValue: normalizeReminderAdvanceValue(advanceValueEl.value),
            advanceUnit: normalizeReminderAdvanceUnit(advanceUnitEl.value)
          }
        : {}),
      ...(includeSourceEl.checked && pageUrl
        ? {
            sourceTitle: pageTitle,
            sourceUrl: pageUrl
          }
        : {}),
      created: now
    };

    try {
      const data = await storageGet(['memories']);
      const memories = Array.isArray(data.memories) ? data.memories : [];
      const nextMemories = [memory, ...memories];
      await storageSet({ memories: nextMemories });
      resetComposer();
      renderRecent(nextMemories);
    } catch (error) {
      console.warn('[Offiqa] Quick note save failed:', error);
      setStatus('Không lưu được, thử lại giúp mình.', 'error');
    } finally {
      saveBtn.disabled = false;
    }
  }

  document.getElementById('quick-note-type').addEventListener('click', (event) => {
    const button = event.target.closest('.type-pill');
    if (!button) return;
    applyType(button.dataset.type);
  });

  document.getElementById('quick-note-close').addEventListener('click', closePopup);
  saveBtn.addEventListener('click', saveMemory);

  textEl.addEventListener('input', () => {
    if (statusEl.classList.contains('is-error') || statusEl.classList.contains('is-success')) {
      setStatus('');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closePopup();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      saveMemory();
    }
  });

  if (pageUrl) {
    sourceText.textContent = pageTitle ? `${pageTitle} - ${pageUrl}` : pageUrl;
  } else {
    sourceRow.hidden = true;
    includeSourceEl.checked = false;
  }

  applyType('note');
  storageGet(['memories']).then((data) => renderRecent(data.memories || []));
})();
