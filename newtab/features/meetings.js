// ===== MEETINGS =====
let meetings = [];
let meetingCountdownInterval = null;

function updateMeetingToggleButton(isOpen) {
  const button = document.getElementById('btn-add-meeting');
  if (!button) return;

  button.textContent = isOpen ? '+ Ẩn' : '+ Thêm';
  button.title = isOpen ? 'Ẩn form cuộc họp' : 'Thêm cuộc họp';
}

function hideMeetingForm({ clearDraft = false } = {}) {
  const form = document.getElementById('meeting-form');
  if (!form) return;

  form.hidden = true;
  form.setAttribute('hidden', '');
  updateMeetingToggleButton(false);

  if (clearDraft) {
    document.getElementById('meeting-title-input').value = '';
    document.getElementById('meeting-date-input').value = '';
    document.getElementById('meeting-time-input').value = '';
    document.getElementById('meeting-link-input').value = '';
  }
}

function showMeetingForm() {
  const form = document.getElementById('meeting-form');
  if (!form) return;

  form.hidden = false;
  form.removeAttribute('hidden');
  updateMeetingToggleButton(true);

  document.getElementById('meeting-date-input').value = todayStr();
  const d = new Date(Date.now() + 30 * 60000);
  document.getElementById('meeting-time-input').value =
    `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  document.getElementById('meeting-title-input').focus();
}

function resetMeetingFormState() {
  hideMeetingForm({ clearDraft: true });
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatMeetingDate(dateStr) {
  // dateStr = YYYY-MM-DD
  const today = todayStr();
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate()+1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
  if (dateStr === today) return 'Hôm nay';
  if (dateStr === tomorrow) return 'Ngày mai';
  // Format as dd/mm
  const [y, m, dd] = dateStr.split('-');
  return `${dd}/${m}/${y}`;
}

function meetingDateDiffDays(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(dateStr); d.setHours(0,0,0,0);
  return Math.round((d - today) / 86400000);
}

async function loadMeetings() {
  const data = await store.get(['meetings_v2']);
  meetings = data.meetings_v2 || [];

  // Auto-cleanup: remove meetings older than 7 days
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth()+1).padStart(2,'0')}-${String(cutoff.getDate()).padStart(2,'0')}`;
  meetings = meetings.filter(m => m.date >= cutoffStr);
  await store.set({ meetings_v2: meetings });

  renderMeetings();
  startMeetingCountdown();
}

function parseMeetingMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const now = new Date();
  const meetingDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
  return Math.round((meetingDate - now) / 60000);
}

function formatCountdown(minutesLeft) {
  if (minutesLeft < -120) return null;
  if (minutesLeft < 0) return { text: `${Math.abs(minutesLeft)} phút trước`, cls: 'past' };
  if (minutesLeft === 0) return { text: 'Đang diễn ra', cls: 'now' };
  if (minutesLeft <= 10) return { text: `Còn ${minutesLeft} phút`, cls: 'soon' };
  if (minutesLeft < 60) return { text: `Còn ${minutesLeft} phút`, cls: '' };
  const h = Math.floor(minutesLeft / 60);
  const rm = minutesLeft % 60;
  return { text: `Còn ${h}g${rm > 0 ? rm + 'p' : ''}`, cls: '' };
}

function renderMeetings() {
  const el = document.getElementById('meeting-list');
  if (!el) return;

  const today = todayStr();
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  // Sort all meetings by date+time
  const sorted = [...meetings].sort((a, b) =>
    (a.date + a.time).localeCompare(b.date + b.time)
  );

  const todayMeetings = sorted.filter(m => m.date === today);
  const upcomingMeetings = sorted.filter(m => m.date > today);
  const pastMeetings = sorted.filter(m => {
    if (m.date < today) return true;
    if (m.date === today) {
      const [h, mi] = m.time.split(':').map(Number);
      return (h * 60 + mi) < nowMins - 120;
    }
    return false;
  });

  if (sorted.length === 0) {
    const h = now.getHours();
    const tips = h < 12
      ? 'Nhấn <strong>+ Thêm</strong> để lên kế hoạch cho cuộc họp sắp tới.'
      : h < 17 ? 'Buổi chiều trống — thời gian để tập trung deep work.'
      : 'Hiện chưa có lịch nào cần theo dõi. 🎉';
    el.innerHTML = `<div class="meeting-placeholder"><strong>📅 Chưa có cuộc họp hoặc lịch hẹn nào</strong><span>${tips}</span></div>`;
    return;
  }

  let html = '';

  // === TODAY ===
  if (todayMeetings.length > 0) {
    // Find next upcoming
    let nextIdx = -1;
    for (let i = 0; i < todayMeetings.length; i++) {
      const [h, mi] = todayMeetings[i].time.split(':').map(Number);
      if ((h * 60 + mi) >= nowMins - 5) { nextIdx = i; break; }
    }

    todayMeetings.forEach((mt, i) => {
      const minsLeft = parseMeetingMinutes(mt.time);
      const countdown = formatCountdown(minsLeft);
      if (!countdown) return;
      const isNext = i === nextIdx;
      html += `
        <div class="meeting-item ${isNext ? 'next-meeting' : ''} ${countdown.cls === 'past' ? 'past-meeting' : ''}">
          <div class="meeting-top-row">
            ${isNext ? '<span class="meeting-badge-next">▶ Tiếp theo</span>' : ''}
            <span class="meeting-title">${escHtml(mt.title)}</span>
            <button type="button" class="meeting-del-btn" data-action="delete-meeting" data-id="${escHtml(mt.id)}" title="Xóa">×</button>
          </div>
          <div class="meeting-bottom-row">
            <span class="meeting-time-label">⏰ ${escHtml(mt.time)}</span>
            <span class="meeting-countdown ${countdown.cls}">${countdown.text}</span>
            ${mt.link ? `<a class="meeting-join-btn" href="${escHtml(mt.link)}" target="_blank">Tham gia →</a>` : ''}
          </div>
        </div>`;
    });
  } else {
    // No meetings today but has upcoming - show small notice
    html += `<div class="meeting-no-today">📭 Hôm nay không có cuộc họp</div>`;
  }

  // === UPCOMING ===
  if (upcomingMeetings.length > 0) {
    html += `<div class="meeting-section-label">Sắp tới</div>`;
    upcomingMeetings.forEach(mt => {
      const dayDiff = meetingDateDiffDays(mt.date);
      const dateLabel = formatMeetingDate(mt.date);
      const daysLeft = dayDiff === 1 ? '' : ` · còn ${dayDiff} ngày`;
      const upcomingTone = dayDiff <= 2 ? 'meeting-upcoming-soon' : 'meeting-upcoming-later';
      html += `
        <div class="meeting-item meeting-upcoming ${upcomingTone}">
          <div class="meeting-top-row">
            <span class="meeting-upcoming-badge">${dateLabel}</span>
            <span class="meeting-title">${escHtml(mt.title)}</span>
            <button type="button" class="meeting-del-btn" data-action="delete-meeting" data-id="${escHtml(mt.id)}" title="Xóa">×</button>
          </div>
          <div class="meeting-bottom-row">
            <span class="meeting-time-label">⏰ ${escHtml(mt.time)}${daysLeft}</span>
            ${mt.link ? `<a class="meeting-join-btn" href="${escHtml(mt.link)}" target="_blank">Link →</a>` : ''}
          </div>
        </div>`;
    });
  }

  el.innerHTML = html;
}

function startMeetingCountdown() {
  clearInterval(meetingCountdownInterval);
  meetingCountdownInterval = setInterval(() => {
    renderMeetings();
    checkMeetingAlert();
    renderMorningBrief();
  }, 30000);
}

// Meeting form toggle
document.getElementById('btn-add-meeting')?.addEventListener('click', () => {
  const form = document.getElementById('meeting-form');
  if (!form) return;
  if (form.hidden) {
    showMeetingForm();
    return;
  }
  hideMeetingForm();
});

document.getElementById('meeting-cancel-btn')?.addEventListener('click', () => {
  hideMeetingForm({ clearDraft: true });
});

document.getElementById('meeting-save-btn')?.addEventListener('click', async () => {
  const title = document.getElementById('meeting-title-input').value.trim();
  const date  = document.getElementById('meeting-date-input').value || todayStr();
  const time  = document.getElementById('meeting-time-input').value;
  const link  = document.getElementById('meeting-link-input').value.trim();
  if (!title || !time) return;
  meetings.push({ id: Date.now().toString(), title, date, time, link });
  await store.set({ meetings_v2: meetings });
  hideMeetingForm({ clearDraft: true });
  renderMeetings();
  renderMorningBrief();
});

document.getElementById('meeting-list')?.addEventListener('click', async (e) => {
  const delBtn = e.target.closest('[data-action="delete-meeting"]');
  if (delBtn) {
    meetings = meetings.filter(m => m.id !== delBtn.dataset.id);
    await store.set({ meetings_v2: meetings });
    renderMeetings();
    renderMorningBrief();
  }
});

// Enter key in title field
document.getElementById('meeting-title-input')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('meeting-save-btn').click();
});

// ===== ENHANCED MEETING EXPERIENCE =====
let meetingSaveTimerV2 = null;
let rerenderMeetingsAfterSaveV2 = false;
const DEFAULT_MEETING_DURATION_MINUTES_V2 = 45;
const MEETING_ACTION_PATTERN_V2 = /^\s*->\s*(.+?)\s*$/;
const MEETING_AGENDA_TEMPLATES_V2 = [
  { key: 'goal', label: 'M\u1ee5c ti\u00eau bu\u1ed5i h\u1ecdp', text: 'M\u1ee5c ti\u00eau bu\u1ed5i h\u1ecdp' },
  { key: 'decision', label: 'C\u1ea7n ch\u1ed1t quy\u1ebft \u0111\u1ecbnh g\u00ec', text: 'C\u1ea7n ch\u1ed1t quy\u1ebft \u0111\u1ecbnh g\u00ec' },
  { key: 'follow_up', label: 'Ai follow-up sau h\u1ecdp', text: 'Ai follow-up sau h\u1ecdp' }
];
const APPOINTMENT_FOLLOWUP_TEMPLATES_V2 = [
  'Gửi recap sau buổi gặp',
  'Gửi báo giá',
  'Gọi lại xác nhận bước tiếp theo'
];
const meetingUiStateV2 = {
  expandedId: '',
  activeTabs: {},
  autoTabPhase: {},
  agendaDraftCounts: {},
  agendaEditingIndex: {}
};

function replaceElementWithClone(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  const clone = el.cloneNode(true);
  el.replaceWith(clone);
  return clone;
}

function updateMeetingToggleButton(isOpen) {
  const button = document.getElementById('btn-add-meeting');
  if (!button) return;
  button.textContent = isOpen ? '+ Ẩn' : '+ Thêm';
  button.title = isOpen ? 'Ẩn form cuộc họp hoặc lịch hẹn' : 'Thêm cuộc họp hoặc lịch hẹn';
}

function normalizeMeetingKindV2(kind) {
  return String(kind || '').trim().toLowerCase() === 'appointment' ? 'appointment' : 'meeting';
}

function isAppointmentV2(meeting) {
  return normalizeMeetingKindV2(meeting?.kind) === 'appointment';
}

function getMeetingTypeLabelV2(meeting) {
  return isAppointmentV2(meeting) ? 'Hẹn' : 'Họp';
}

function updateMeetingFormModeV2() {
  const kindInput = document.getElementById('meeting-kind-input');
  const linkRow = document.getElementById('meeting-link-row');
  const hint = document.getElementById('meeting-form-hint');
  if (!kindInput || !linkRow || !hint) return;

  const isAppointment = kindInput.value === 'appointment';
  linkRow.hidden = isAppointment;
  hint.textContent = isAppointment
    ? 'Lưu xong rồi bổ sung người gặp, địa điểm và follow-up trong các tab Trước / Trong / Sau.'
    : 'Lưu xong rồi hoàn thiện agenda, tài liệu hoặc ghi chú trong các tab Trước / Trong / Sau.';
}

function hideMeetingForm({ clearDraft = false } = {}) {
  const form = document.getElementById('meeting-form');
  if (!form) return;
  form.hidden = true;
  form.setAttribute('hidden', '');
  updateMeetingToggleButton(false);

  if (clearDraft) {
    document.getElementById('meeting-kind-input').value = 'meeting';
    document.getElementById('meeting-title-input').value = '';
    document.getElementById('meeting-date-input').value = '';
    document.getElementById('meeting-time-input').value = '';
    document.getElementById('meeting-link-input').value = '';
    updateMeetingFormModeV2();
  }
}

function showMeetingForm() {
  const form = document.getElementById('meeting-form');
  if (!form) return;
  form.hidden = false;
  form.removeAttribute('hidden');
  updateMeetingToggleButton(true);
  updateMeetingFormModeV2();

  document.getElementById('meeting-date-input').value = todayStr();
  const d = new Date(Date.now() + 30 * 60000);
  document.getElementById('meeting-time-input').value =
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  document.getElementById('meeting-title-input').focus();
}

function resetMeetingFormState() {
  hideMeetingForm({ clearDraft: true });
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatMeetingDate(dateStr) {
  const today = todayStr();
  const tomorrow = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  if (dateStr === today) return 'Hôm nay';
  if (dateStr === tomorrow) return 'Ngày mai';

  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

function meetingDateDiffDays(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

function getMeetingStartDateV2(meeting) {
  const [year, month, day] = String(meeting.date || todayStr()).split('-').map(Number);
  const [hours, minutes] = String(meeting.time || '00:00').split(':').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0, 0, 0);
}

function getMeetingEndDateV2(meeting) {
  if (Number(meeting?.endedAt) > 0) return new Date(Number(meeting.endedAt));
  return new Date(getMeetingStartDateV2(meeting).getTime() + DEFAULT_MEETING_DURATION_MINUTES_V2 * 60000);
}

function getMeetingPhaseV2(meeting, now = new Date()) {
  const start = getMeetingStartDateV2(meeting);
  const end = getMeetingEndDateV2(meeting);
  const minutesToStart = Math.round((start - now) / 60000);
  const minutesToEnd = Math.round((end - now) / 60000);

  if (now < start) return { phase: 'before', start, end, minutesToStart, minutesToEnd };
  if (now <= end) return { phase: 'during', start, end, minutesToStart, minutesToEnd };
  return {
    phase: 'after',
    start,
    end,
    minutesToStart,
    minutesToEnd,
    minutesAfterEnd: Math.round((now - end) / 60000)
  };
}

function parseMeetingMinutes(timeStr, dateStr = todayStr()) {
  return Math.round((getMeetingStartDateV2({ date: dateStr, time: timeStr || '00:00' }) - new Date()) / 60000);
}

function sanitizeMeetingUrlV2(url) {
  const candidate = String(url || '').trim();
  if (!candidate) return '';
  try {
    const parsed = new URL(candidate);
    if (!/^https?:$/i.test(parsed.protocol)) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function normalizeMeetingSelectionV2(selection) {
  const normalized = {};
  if (!selection || typeof selection !== 'object') return normalized;
  Object.entries(selection).forEach(([key, value]) => {
    normalized[String(key)] = value !== false;
  });
  return normalized;
}

function normalizeMeetingDocV2(doc) {
  if (!doc) return null;
  const url = sanitizeMeetingUrlV2(doc.url || doc.href || '');
  if (!url) return null;
  return {
    id: String(doc.id || `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`),
    label: String(doc.label || doc.title || '').trim(),
    url
  };
}

function sanitizeMeetingAgendaV2(agenda) {
  return (Array.isArray(agenda) ? agenda : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 6);
}

function normalizeMeetingRecordV2(raw) {
  const wrapUp = raw?.wrapUp && typeof raw.wrapUp === 'object' ? raw.wrapUp : {};
  return {
    id: String(raw?.id || Date.now()),
    kind: normalizeMeetingKindV2(raw?.kind),
    title: String(raw?.title || '').trim(),
    date: String(raw?.date || todayStr()),
    time: String(raw?.time || '09:00').slice(0, 5),
    link: sanitizeMeetingUrlV2(raw?.link || ''),
    location: String(raw?.location || '').trim(),
    person: String(raw?.person || raw?.contactPerson || '').trim(),
    goal: String(raw?.goal || '').trim(),
    carryNotes: String(raw?.carryNotes || raw?.prepNotes || '').trim(),
    agenda: sanitizeMeetingAgendaV2(raw?.agenda),
    docs: (Array.isArray(raw?.docs) ? raw.docs : []).map(normalizeMeetingDocV2).filter(Boolean),
    notes: typeof raw?.notes === 'string' ? raw.notes : '',
    endedAt: Number(raw?.endedAt) || 0,
    created: Number(raw?.created) || Number(raw?.id) || Date.now(),
    updated: Number(raw?.updated) || Number(raw?.created) || Date.now(),
    wrapUp: {
      promptedAt: Number(wrapUp.promptedAt) || 0,
      dismissedAt: Number(wrapUp.dismissedAt) || 0,
      completedAt: Number(wrapUp.completedAt) || 0,
      selection: normalizeMeetingSelectionV2(wrapUp.selection),
      importedItems: Array.from(new Set((Array.isArray(wrapUp.importedItems) ? wrapUp.importedItems : []).map((item) => String(item || ''))))
    }
  };
}

function createMeetingRecordV2({ kind, title, date, time, link }) {
  return normalizeMeetingRecordV2({
    id: Date.now().toString(),
    kind,
    title,
    date,
    time,
    link,
    created: Date.now(),
    updated: Date.now()
  });
}

function sortMeetingsAscendingV2(a, b) {
  return getMeetingStartDateV2(a) - getMeetingStartDateV2(b);
}

function findMeetingByIdV2(meetingId) {
  return meetings.find((meeting) => meeting.id === meetingId);
}

function actionItemKeyV2(text) {
  return normalizeComparableText(String(text || '').replace(MEETING_ACTION_PATTERN_V2, '$1'));
}

function extractMeetingActionItemsV2(noteText) {
  const seenKeys = new Set();
  return String(noteText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => {
      const matched = line.match(MEETING_ACTION_PATTERN_V2);
      if (!matched) return null;
      const text = matched[1].trim();
      const key = actionItemKeyV2(text);
      if (!text || !key || seenKeys.has(key)) return null;
      seenKeys.add(key);
      return { key, text };
    })
    .filter(Boolean);
}

function deriveMeetingDocLabelV2(url) {
  try {
    const parsed = new URL(url);
    const slug = parsed.pathname.split('/').filter(Boolean).pop();
    if (slug) return decodeURIComponent(slug).slice(0, 42);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return 'Tài liệu liên quan';
  }
}

function getMeetingCountdownMetaV2(meeting, phaseInfo = getMeetingPhaseV2(meeting)) {
  if (phaseInfo.phase === 'before') {
    if (phaseInfo.minutesToStart <= 10) return { text: `Còn ${phaseInfo.minutesToStart} phút`, cls: 'soon' };
    if (phaseInfo.minutesToStart < 60) return { text: `Còn ${phaseInfo.minutesToStart} phút`, cls: '' };
    const hours = Math.floor(phaseInfo.minutesToStart / 60);
    const minutes = phaseInfo.minutesToStart % 60;
    return { text: `Còn ${hours}g${minutes > 0 ? minutes + 'p' : ''}`, cls: '' };
  }
  if (phaseInfo.phase === 'during') return { text: 'Đang diễn ra', cls: 'now' };
  if ((phaseInfo.minutesAfterEnd || 0) <= 15) return { text: 'Vừa kết thúc', cls: 'soon' };
  if ((phaseInfo.minutesAfterEnd || 0) < 120) return { text: `${phaseInfo.minutesAfterEnd} phút trước`, cls: 'past' };
  return { text: 'Đã xong', cls: 'past' };
}

function getMeetingMetaLabelV2(meeting) {
  const dateLabel = meeting.date === todayStr() ? 'Hôm nay' : formatMeetingDate(meeting.date);
  return `${meeting.time} · ${dateLabel}`;
}

function getDefaultExpandedMeetingIdV2(sortedMeetings, now = new Date()) {
  return '';
}

function getMeetingAgendaRowCountV2(meeting) {
  const savedCount = Array.isArray(meeting?.agenda) ? meeting.agenda.length : 0;
  const draftCount = Number(meetingUiStateV2.agendaDraftCounts[meeting?.id]) || 0;
  return Math.min(6, Math.max(1, savedCount, draftCount));
}

function ensureMeetingUiStateV2(sortedMeetings, now = new Date()) {
  if (!sortedMeetings.length) {
    meetingUiStateV2.expandedId = '';
    meetingUiStateV2.activeTabs = {};
    meetingUiStateV2.autoTabPhase = {};
    meetingUiStateV2.agendaDraftCounts = {};
    meetingUiStateV2.agendaEditingIndex = {};
    return;
  }

  const activeIds = new Set(sortedMeetings.map((meeting) => meeting.id));
  Object.keys(meetingUiStateV2.activeTabs).forEach((meetingId) => {
    if (!activeIds.has(meetingId)) delete meetingUiStateV2.activeTabs[meetingId];
  });
  Object.keys(meetingUiStateV2.autoTabPhase).forEach((meetingId) => {
    if (!activeIds.has(meetingId)) delete meetingUiStateV2.autoTabPhase[meetingId];
  });
  Object.keys(meetingUiStateV2.agendaDraftCounts).forEach((meetingId) => {
    if (!activeIds.has(meetingId)) delete meetingUiStateV2.agendaDraftCounts[meetingId];
  });
  Object.keys(meetingUiStateV2.agendaEditingIndex).forEach((meetingId) => {
    if (!activeIds.has(meetingId)) delete meetingUiStateV2.agendaEditingIndex[meetingId];
  });

  if (!sortedMeetings.some((meeting) => meeting.id === meetingUiStateV2.expandedId)) {
    meetingUiStateV2.expandedId = '';
  }

  sortedMeetings.forEach((meeting) => {
    const phase = getMeetingPhaseV2(meeting, now).phase;
    const previousPhase = meetingUiStateV2.autoTabPhase[meeting.id];
    if (!meetingUiStateV2.activeTabs[meeting.id] || (previousPhase && previousPhase !== phase)) {
      meetingUiStateV2.activeTabs[meeting.id] = phase;
    }
    meetingUiStateV2.autoTabPhase[meeting.id] = phase;
    meetingUiStateV2.agendaDraftCounts[meeting.id] = getMeetingAgendaRowCountV2(meeting);
    const editingIndex = Number(meetingUiStateV2.agendaEditingIndex[meeting.id]);
    if (Number.isNaN(editingIndex) || editingIndex < 0 || editingIndex >= getMeetingAgendaRowCountV2(meeting)) {
      delete meetingUiStateV2.agendaEditingIndex[meeting.id];
    }
  });
}

function hasMeetingEditorFocusV2() {
  const active = document.activeElement;
  return !!(active && active.closest('#meeting-list') && /^(INPUT|TEXTAREA)$/i.test(active.tagName));
}

function getMeetingActiveTabV2(meeting, phaseInfo = getMeetingPhaseV2(meeting)) {
  return meetingUiStateV2.activeTabs[meeting.id] || phaseInfo.phase;
}

function insertMeetingNoteBulletV2(noteInput) {
  if (!noteInput) return;

  const start = Number(noteInput.selectionStart) || 0;
  const end = Number(noteInput.selectionEnd) || start;
  const value = noteInput.value || '';
  const before = value.slice(0, start);
  const after = value.slice(end);
  const prefix = before.length === 0 || before.endsWith('\n') ? '- ' : '\n- ';
  const nextValue = `${before}${prefix}${after}`;
  const nextCursor = before.length + prefix.length;

  noteInput.value = nextValue;
  noteInput.setSelectionRange(nextCursor, nextCursor);
  noteInput.dispatchEvent(new Event('input', { bubbles: true }));
}

function insertMeetingActionItemV2(noteInput) {
  if (!noteInput) return;

  const start = Number(noteInput.selectionStart) || 0;
  const end = Number(noteInput.selectionEnd) || start;
  const value = noteInput.value || '';
  const before = value.slice(0, start);
  const after = value.slice(end);
  const prefix = before.length === 0 || before.endsWith('\n') ? '-> ' : '\n-> ';
  const nextValue = `${before}${prefix}${after}`;
  const nextCursor = before.length + prefix.length;

  noteInput.value = nextValue;
  noteInput.setSelectionRange(nextCursor, nextCursor);
  noteInput.focus();
  noteInput.dispatchEvent(new Event('input', { bubbles: true }));
}

function getWrapSelectionV2(meeting, item) {
  if (Object.prototype.hasOwnProperty.call(meeting.wrapUp.selection, item.key)) {
    return !!meeting.wrapUp.selection[item.key];
  }
  return !meeting.wrapUp.importedItems.includes(item.key);
}

function renderMeetingActionPreviewMarkupV2(noteText) {
  const actionItems = extractMeetingActionItemsV2(noteText);
  if (!actionItems.length) {
    return `<div class="meeting-empty-state">Bấm "+ Action item" hoặc bắt đầu dòng bằng -> để hiện ở đây.</div>`;
  }
  return actionItems.map((item) => `<div class="meeting-action-chip">-> ${escHtml(item.text)}</div>`).join('');
}

function renderMeetingBeforeTabV2(meeting) {
  const agendaRowCount = getMeetingAgendaRowCountV2(meeting);
  const agendaRows = Array.from({ length: agendaRowCount }, (_, index) => meeting.agenda[index] || '');
  const activeInputIndex = Math.max(0, agendaRowCount - 1);
  const editingIndex = Number(meetingUiStateV2.agendaEditingIndex[meeting.id]);
  const agendaMarkup = agendaRows.map((item, index) => {
    const trimmedItem = String(item || '').trim();
    const isEditingExistingItem = Number.isInteger(editingIndex) && editingIndex === index && index < activeInputIndex;

    if (index < activeInputIndex && trimmedItem && !isEditingExistingItem) {
      return `
        <div class="meeting-agenda-row meeting-agenda-item">
          <span class="meeting-agenda-bullet">•</span>
          <span class="meeting-agenda-text">${escHtml(trimmedItem)}</span>
          <div class="meeting-agenda-actions">
            <button type="button" class="meeting-inline-edit" data-action="edit-meeting-agenda" data-id="${escAttr(meeting.id)}" data-index="${index}">Sửa</button>
            <button type="button" class="meeting-inline-del" data-action="delete-meeting-agenda" data-id="${escAttr(meeting.id)}" data-index="${index}" title="Xóa dòng">×</button>
          </div>
        </div>
      `;
    }

    if (index !== activeInputIndex && !isEditingExistingItem) return '';

    return `
      <div class="meeting-agenda-row">
        <span class="meeting-agenda-bullet">•</span>
        <input type="text" class="meeting-inline-input" value="${escAttr(item)}" placeholder="Điểm muốn đạt được trong buổi họp" data-action="meeting-agenda-input" data-id="${escAttr(meeting.id)}" data-index="${index}">
        ${(agendaRowCount > 1 || index < activeInputIndex) ? `<button type="button" class="meeting-inline-del" data-action="delete-meeting-agenda" data-id="${escAttr(meeting.id)}" data-index="${index}" title="Xóa dòng">×</button>` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="meeting-stage">
      <div class="meeting-section">
        <div class="meeting-section-heading">Agenda nhanh</div>
        <div class="meeting-agenda-list">
          ${agendaMarkup}
        </div>
        <button type="button" class="meeting-add-link" data-action="add-meeting-agenda" data-id="${escAttr(meeting.id)}">+ Thêm điểm agenda</button>
      </div>
      <div class="meeting-section">
        <div class="meeting-section-heading">Tài liệu đính kèm</div>
        <div class="meeting-doc-list">
          ${meeting.docs.length ? meeting.docs.map((doc) => `
            <div class="meeting-doc-chip">
              <a class="meeting-doc-link" href="${escAttr(doc.url)}" target="_blank" rel="noopener noreferrer">${escHtml(doc.label || deriveMeetingDocLabelV2(doc.url))}</a>
              <button type="button" class="meeting-inline-del" data-action="delete-meeting-doc" data-id="${escAttr(meeting.id)}" data-doc-id="${escAttr(doc.id)}" title="Xóa link">×</button>
            </div>
          `).join('') : `<div class="meeting-empty-state">Thêm Google Doc, Slide hoặc tài liệu liên quan để mở 1 click ngay trước họp.</div>`}
        </div>
        <div class="meeting-doc-form" data-doc-form-for="${escAttr(meeting.id)}">
          <input type="text" class="meeting-doc-input" data-doc-label placeholder="Tên tài liệu (tùy chọn)">
          <input type="url" class="meeting-doc-input" data-doc-url placeholder="https://drive.google.com/...">
          <button type="button" class="meeting-doc-add-btn" data-action="add-meeting-doc" data-id="${escAttr(meeting.id)}">Thêm link</button>
        </div>
      </div>
    </div>
  `;
}

function renderMeetingDuringTabV2(meeting) {
  return `
    <div class="meeting-stage">
      <div class="meeting-section">
        <div class="meeting-section-heading">Ghi nhanh</div>
        <textarea class="meeting-note-textarea" placeholder="Gõ nhanh... Dùng -> để đánh dấu action item" data-action="meeting-note-input" data-id="${escAttr(meeting.id)}">${escHtml(meeting.notes)}</textarea>
        <div class="meeting-note-quick-actions">
          <button type="button" class="meeting-add-link meeting-add-action-btn" data-action="insert-meeting-action" data-id="${escAttr(meeting.id)}">+ Action item</button>
          <span class="meeting-note-inline-hint">Tip: bắt đầu dòng bằng -> để tách action item tự động.</span>
        </div>
        <div class="meeting-note-hint">Nội dung được tự lưu trong lúc họp.</div>
      </div>
      <div class="meeting-section">
        <div class="meeting-section-heading">Action items</div>
        <div class="meeting-action-preview" data-action-preview-for="${escAttr(meeting.id)}">${renderMeetingActionPreviewMarkupV2(meeting.notes)}</div>
      </div>
    </div>
  `;
}

function renderMeetingAfterTabV2(meeting, phaseInfo) {
  const actionItems = extractMeetingActionItemsV2(meeting.notes);
  const title = `${meeting.title} vừa kết thúc`;
  const subtitle = isAppointmentV2(meeting)
    ? 'Chốt follow-up và chuyển việc cần làm sang Tasks hôm nay.'
    : 'Chuyển action items thành task?';

  return `
    <div class="meeting-wrap-panel">
      <div class="meeting-wrap-title">${escHtml(title)}</div>
      <div class="meeting-wrap-subtitle">${escHtml(subtitle)}</div>
      ${isAppointmentV2(meeting) ? `
        <div class="meeting-followup-suggestions">
          ${APPOINTMENT_FOLLOWUP_TEMPLATES_V2.map((template) => `
            <button type="button" class="meeting-template-btn" data-action="add-meeting-followup-template" data-id="${escAttr(meeting.id)}" data-template="${escAttr(template)}">${escHtml(template)}</button>
          `).join('')}
        </div>
      ` : ''}
      <div class="meeting-wrap-list">
        ${actionItems.length ? actionItems.map((item) => `
          <label class="meeting-wrap-item ${meeting.wrapUp.importedItems.includes(item.key) ? 'is-imported' : ''}">
            <span class="meeting-wrap-text">${escHtml(item.text)}</span>
            <span class="meeting-switch">
              <input type="checkbox" data-action="meeting-wrap-toggle" data-id="${escAttr(meeting.id)}" data-key="${escAttr(item.key)}" ${getWrapSelectionV2(meeting, item) ? 'checked' : ''}>
              <span class="meeting-switch-slider"></span>
            </span>
          </label>
        `).join('') : `<div class="meeting-empty-state">Chưa có action item nào trong note. Qua tab “Trong họp” và thêm dòng bắt đầu bằng ->.</div>`}
      </div>
      <div class="meeting-wrap-actions">
        <button type="button" class="meeting-wrap-btn is-primary" data-action="meeting-wrapup-save" data-id="${escAttr(meeting.id)}">Thêm vào Tasks hôm nay</button>
        <button type="button" class="meeting-wrap-btn" data-action="meeting-wrapup-dismiss" data-id="${escAttr(meeting.id)}">Bỏ qua</button>
      </div>
    </div>
  `;
}

function getMeetingCountdownMetaV2(meeting, phaseInfo = getMeetingPhaseV2(meeting)) {
  if (phaseInfo.phase === 'before') {
    if (phaseInfo.minutesToStart <= 10) return { text: `C\u00f2n ${phaseInfo.minutesToStart} ph\u00fat`, cls: 'soon' };
    if (phaseInfo.minutesToStart < 60) return { text: `C\u00f2n ${phaseInfo.minutesToStart} ph\u00fat`, cls: '' };
    const hours = Math.floor(phaseInfo.minutesToStart / 60);
    const minutes = phaseInfo.minutesToStart % 60;
    return { text: `C\u00f2n ${hours}g${minutes > 0 ? minutes + 'p' : ''}`, cls: '' };
  }

  if (phaseInfo.phase === 'during') return { text: '\u0110ang di\u1ec5n ra', cls: 'now' };
  if ((phaseInfo.minutesAfterEnd || 0) <= 1) return { text: '\u0110\u00e3 k\u1ebft th\u00fac', cls: 'past' };
  if ((phaseInfo.minutesAfterEnd || 0) < 180) {
    return { text: `\u0110\u00e3 k\u1ebft th\u00fac ${phaseInfo.minutesAfterEnd} ph\u00fat tr\u01b0\u1edbc`, cls: 'past' };
  }
  return { text: '\u0110\u00e3 k\u1ebft th\u00fac', cls: 'past' };
}

function getMeetingMetaLabelV2(meeting) {
  if (meeting.date === todayStr()) return meeting.time;
  return `${meeting.time} · ${formatMeetingDate(meeting.date)}`;
}

function getMeetingContextSummaryV2(meeting) {
  const parts = [];
  if (isAppointmentV2(meeting) && meeting.person) parts.push(`Người gặp: ${meeting.person}`);
  if (isAppointmentV2(meeting) && meeting.location) parts.push(`Địa điểm: ${meeting.location}`);
  return parts.join(' · ');
}

function getMeetingBucketsV2(sortedMeetings, now = new Date()) {
  const items = sortedMeetings.map((meeting) => ({ meeting, phaseInfo: getMeetingPhaseV2(meeting, now) }));
  const primary =
    items.find((item) => item.phaseInfo.phase === 'during')
    || items.find((item) => item.phaseInfo.phase === 'before')
    || [...items].sort((a, b) => b.phaseInfo.end - a.phaseInfo.end)[0]
    || null;

  const queued = items
    .filter((item) => item.meeting.id !== primary?.meeting.id && item.phaseInfo.phase !== 'after')
    .sort((a, b) => a.phaseInfo.start - b.phaseInfo.start)
    .map((item) => item.meeting);

  return {
    primary: primary?.meeting || null,
    upcoming: queued.slice(0, 3),
    later: queued.slice(3)
  };
}

function buildMeetingAgendaClipboardTextV2(meeting) {
  const agendaLines = sanitizeMeetingAgendaV2(meeting.agenda);
  const schedule = getMeetingMetaLabelV2(meeting);
  const sections = [meeting.title, `${getMeetingTypeLabelV2(meeting)} · ${schedule}`];

  if (isAppointmentV2(meeting)) {
    const appointmentDetails = [
      meeting.person ? `Người gặp: ${meeting.person}` : '',
      meeting.location ? `Địa điểm: ${meeting.location}` : '',
      meeting.goal ? `Mục tiêu: ${meeting.goal}` : '',
      meeting.carryNotes ? `Cần mang theo: ${meeting.carryNotes}` : ''
    ].filter(Boolean);
    if (appointmentDetails.length) sections.push(appointmentDetails.join('\n'));
  }

  if (agendaLines.length) {
    sections.push(`Agenda:\n${agendaLines.map((item, index) => `${index + 1}. ${item}`).join('\n')}`);
  } else {
    sections.push('Agenda:\nCh\u01b0a c\u00f3 n\u1ed9i dung');
  }

  return sections.join('\n\n');
}

function focusMeetingNoteEditorV2(meetingId) {
  setTimeout(() => {
    const noteInput = document.querySelector(`[data-action="meeting-note-input"][data-id="${meetingId}"]`);
    if (!noteInput) return;
    noteInput.focus();
    const length = noteInput.value.length;
    if (typeof noteInput.setSelectionRange === 'function') {
      noteInput.setSelectionRange(length, length);
    }
  }, 0);
}

function renderMeetingBeforeTabV2(meeting) {
  const agendaRowCount = getMeetingAgendaRowCountV2(meeting);
  const agendaRows = Array.from({ length: agendaRowCount }, (_, index) => meeting.agenda[index] || '');
  const activeInputIndex = Math.max(0, agendaRowCount - 1);
  const editingIndex = Number(meetingUiStateV2.agendaEditingIndex[meeting.id]);
  const isAppointment = isAppointmentV2(meeting);
  const joinUrl = !isAppointment ? sanitizeMeetingUrlV2(meeting.link) : '';
  const primaryDoc = meeting.docs[0] || null;
  const agendaMarkup = agendaRows.map((item, index) => {
    const trimmedItem = String(item || '').trim();
    const isEditingExistingItem = Number.isInteger(editingIndex) && editingIndex === index && index < activeInputIndex;

    if (index < activeInputIndex && trimmedItem && !isEditingExistingItem) {
      return `
        <div class="meeting-agenda-row meeting-agenda-item">
          <span class="meeting-agenda-bullet">•</span>
          <span class="meeting-agenda-text">${escHtml(trimmedItem)}</span>
          <div class="meeting-agenda-actions">
            <button type="button" class="meeting-inline-edit" data-action="edit-meeting-agenda" data-id="${escAttr(meeting.id)}" data-index="${index}">Sửa</button>
            <button type="button" class="meeting-inline-del" data-action="delete-meeting-agenda" data-id="${escAttr(meeting.id)}" data-index="${index}" title="Xóa dòng">×</button>
          </div>
        </div>
      `;
    }

    if (index !== activeInputIndex && !isEditingExistingItem) return '';

    return `
      <div class="meeting-agenda-row">
        <span class="meeting-agenda-bullet">•</span>
        <input type="text" class="meeting-inline-input" value="${escAttr(item)}" placeholder="${isAppointment ? 'Điểm muốn chốt trong buổi hẹn' : 'Điểm muốn đạt được trong buổi họp'}" data-action="meeting-agenda-input" data-id="${escAttr(meeting.id)}" data-index="${index}">
        ${(agendaRowCount > 1 || index < activeInputIndex) ? `<button type="button" class="meeting-inline-del" data-action="delete-meeting-agenda" data-id="${escAttr(meeting.id)}" data-index="${index}" title="Xóa dòng">×</button>` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="meeting-stage">
      <div class="meeting-section">
        <div class="meeting-section-head">
          <div class="meeting-section-heading">Vào việc ngay</div>
          <div class="meeting-section-caption">${isAppointment ? 'Mở nhanh những thứ cần nhất trước khi đi gặp.' : 'Mở nhanh những thứ cần nhất trước khi họp.'}</div>
        </div>
        <div class="meeting-quick-actions">
          ${joinUrl ? `<a class="meeting-quick-btn is-primary" href="${escAttr(joinUrl)}" target="_blank" rel="noopener noreferrer">Mở link họp</a>` : ''}
          ${meeting.location ? `<button type="button" class="meeting-quick-btn is-primary" data-action="copy-meeting-location" data-id="${escAttr(meeting.id)}">Copy địa điểm</button>` : ''}
          ${primaryDoc ? `<a class="meeting-quick-btn" href="${escAttr(primaryDoc.url)}" target="_blank" rel="noopener noreferrer">Mở tài liệu chính</a>` : ''}
          <button type="button" class="meeting-quick-btn" data-action="copy-meeting-agenda" data-id="${escAttr(meeting.id)}">Copy agenda</button>
          <button type="button" class="meeting-quick-btn" data-action="start-meeting-note" data-id="${escAttr(meeting.id)}">Bắt đầu ghi chú</button>
        </div>
      </div>
      ${isAppointment ? `
        <div class="meeting-section">
          <div class="meeting-section-head">
            <div class="meeting-section-heading">Thông tin lịch hẹn</div>
            <div class="meeting-section-caption">Hoàn thiện nhanh người gặp, địa điểm và những gì cần mang theo.</div>
          </div>
          <div class="meeting-detail-grid">
            <label class="meeting-field">
              <span class="meeting-field-label">Người gặp</span>
              <input type="text" class="meeting-inline-input" value="${escAttr(meeting.person)}" placeholder="Tên người gặp hoặc công ty" data-action="meeting-meta-input" data-id="${escAttr(meeting.id)}" data-field="person">
            </label>
            <label class="meeting-field">
              <span class="meeting-field-label">Địa điểm</span>
              <input type="text" class="meeting-inline-input" value="${escAttr(meeting.location)}" placeholder="Văn phòng, showroom, nhà máy..." data-action="meeting-meta-input" data-id="${escAttr(meeting.id)}" data-field="location">
            </label>
            <label class="meeting-field">
              <span class="meeting-field-label">Mục tiêu buổi gặp</span>
              <input type="text" class="meeting-inline-input" value="${escAttr(meeting.goal)}" placeholder="Cần chốt điều gì trong buổi gặp?" data-action="meeting-meta-input" data-id="${escAttr(meeting.id)}" data-field="goal">
            </label>
            <label class="meeting-field">
              <span class="meeting-field-label">Ghi chú cần mang theo</span>
              <input type="text" class="meeting-inline-input" value="${escAttr(meeting.carryNotes)}" placeholder="Mẫu, báo giá, hồ sơ, namecard..." data-action="meeting-meta-input" data-id="${escAttr(meeting.id)}" data-field="carryNotes">
            </label>
          </div>
        </div>
      ` : ''}
      <div class="meeting-section">
        <div class="meeting-section-head">
          <div class="meeting-section-heading">${isAppointment ? 'Agenda & mục tiêu nhanh' : 'Agenda nhanh'}</div>
          <div class="meeting-section-caption">Bấm 1 lần để đổ mẫu văn phòng phổ biến.</div>
        </div>
        <div class="meeting-template-row">
          ${MEETING_AGENDA_TEMPLATES_V2.map((template) => `
            <button type="button" class="meeting-template-btn" data-action="add-meeting-agenda-template" data-id="${escAttr(meeting.id)}" data-template="${escAttr(template.key)}">${escHtml(template.label)}</button>
          `).join('')}
        </div>
        <div class="meeting-agenda-list">
          ${agendaMarkup}
        </div>
        <button type="button" class="meeting-add-link" data-action="add-meeting-agenda" data-id="${escAttr(meeting.id)}">+ Thêm điểm agenda</button>
      </div>
      <div class="meeting-section">
        <div class="meeting-section-head">
          <div class="meeting-section-heading">Tài liệu đính kèm</div>
          <div class="meeting-section-caption">${isAppointment ? 'Mở nhanh báo giá, profile hoặc tài liệu cần mang theo trước khi đi gặp.' : 'Mở nhanh doc, slide hoặc tài liệu chính trước khi vào họp.'}</div>
        </div>
        <div class="meeting-doc-list">
          ${meeting.docs.length ? meeting.docs.map((doc) => `
            <div class="meeting-doc-chip">
              <a class="meeting-doc-link" href="${escAttr(doc.url)}" target="_blank" rel="noopener noreferrer">${escHtml(doc.label || deriveMeetingDocLabelV2(doc.url))}</a>
              <button type="button" class="meeting-inline-del" data-action="delete-meeting-doc" data-id="${escAttr(meeting.id)}" data-doc-id="${escAttr(doc.id)}" title="Xóa link">×</button>
            </div>
          `).join('') : `<div class="meeting-empty-state">${isAppointment ? 'Thêm báo giá, profile, brochure hoặc tài liệu cần mang theo để mở 1 click ngay trước khi đi gặp.' : 'Thêm Google Doc, Slide hoặc tài liệu liên quan để mở 1 click ngay trước họp.'}</div>`}
        </div>
        <div class="meeting-doc-form" data-doc-form-for="${escAttr(meeting.id)}">
          <input type="text" class="meeting-doc-input" data-doc-label placeholder="Tên tài liệu (tùy chọn)">
          <input type="url" class="meeting-doc-input" data-doc-url placeholder="https://drive.google.com/...">
          <button type="button" class="meeting-doc-add-btn" data-action="add-meeting-doc" data-id="${escAttr(meeting.id)}">Thêm link</button>
        </div>
      </div>
    </div>
  `;
}

function renderMeetingTabsV2(meeting, phaseInfo) {
  const activeTab = getMeetingActiveTabV2(meeting, phaseInfo);
  const tabs = [
    { id: 'before', label: 'Trước' },
    { id: 'during', label: 'Trong' },
    { id: 'after', label: 'Sau' }
  ];

  let content = '';
  if (activeTab === 'before') content = renderMeetingBeforeTabV2(meeting);
  if (activeTab === 'during') content = renderMeetingDuringTabV2(meeting);
  if (activeTab === 'after') content = renderMeetingAfterTabV2(meeting, phaseInfo);

  return `
    <div class="meeting-detail">
      <div class="meeting-tabs" role="tablist">
        ${tabs.map((tab) => `
          <button type="button" class="meeting-tab-btn ${activeTab === tab.id ? 'is-active' : ''}" data-action="meeting-tab" data-id="${escAttr(meeting.id)}" data-tab="${tab.id}">${tab.label}</button>
        `).join('')}
      </div>
      ${content}
    </div>
  `;
}

function renderMeetingCardV2(meeting, { expanded = false, isNext = false, now = new Date() } = {}) {
  const phaseInfo = getMeetingPhaseV2(meeting, now);
  const countdown = getMeetingCountdownMetaV2(meeting, phaseInfo);
  const joinUrl = !isAppointmentV2(meeting) ? sanitizeMeetingUrlV2(meeting.link) : '';
  const contextSummary = getMeetingContextSummaryV2(meeting);

  return `
    <div class="meeting-item ${expanded ? 'is-expanded' : ''} ${isNext ? 'next-meeting' : ''} phase-${phaseInfo.phase}">
      <div class="meeting-item-shell">
        <div class="meeting-header meeting-header-toggle" data-action="toggle-meeting-expand" data-id="${escAttr(meeting.id)}" role="button" tabindex="0" aria-expanded="${expanded ? 'true' : 'false'}" title="${expanded ? 'Thu gọn chi tiết item này' : 'Mở chi tiết item này'}">
          <div class="meeting-top-row">
            <div class="meeting-status-row">
              ${isNext ? '<span class="meeting-badge-next">▶ Tiếp theo</span>' : ''}
              <span class="meeting-type-pill ${isAppointmentV2(meeting) ? 'is-appointment' : 'is-meeting'}">${getMeetingTypeLabelV2(meeting)}</span>
              <span class="meeting-countdown ${countdown.cls}">${countdown.text}</span>
            </div>
            <div class="meeting-header-actions">
              ${phaseInfo.phase === 'during' ? `<button type="button" class="meeting-complete-btn" data-action="complete-meeting" data-id="${escAttr(meeting.id)}" title="Đánh dấu item này đã xong">Đã xong</button>` : ''}
              <button type="button" class="meeting-del-btn" data-action="delete-meeting" data-id="${escAttr(meeting.id)}" title="Xóa item này" aria-label="Xóa item này">×</button>
              <button type="button" class="meeting-expand-btn" data-action="toggle-meeting-expand" data-id="${escAttr(meeting.id)}" title="${expanded ? 'Thu gọn chi tiết' : 'Mở chi tiết'}" aria-label="${expanded ? 'Thu gọn chi tiết' : 'Mở chi tiết'}">${expanded ? '⌃' : '⌄'}</button>
            </div>
          </div>
          <div class="meeting-summary-row">
            <div class="meeting-title-toggle">
              <span class="meeting-title">${escHtml(meeting.title)}</span>
              ${contextSummary ? `<div class="meeting-context-line">${escHtml(contextSummary)}</div>` : ''}
            </div>
            <div class="meeting-summary-meta">
              <span class="meeting-time-label">⏰ ${escHtml(getMeetingMetaLabelV2(meeting))}</span>
              ${joinUrl ? `<a class="meeting-join-btn" href="${escAttr(joinUrl)}" target="_blank" rel="noopener noreferrer" data-skip-toggle="true">${phaseInfo.phase === 'after' ? 'Mở link →' : 'Tham gia →'}</a>` : ''}
            </div>
          </div>
        </div>
        ${expanded ? renderMeetingTabsV2(meeting, phaseInfo) : ''}
      </div>
    </div>
  `;
}

function normalizeMeetingsForSaveV2() {
  meetings = meetings.map(normalizeMeetingRecordV2).filter((meeting) => meeting.title && meeting.time);
}

async function persistMeetingsV2({ rerender = false } = {}) {
  clearTimeout(meetingSaveTimerV2);
  meetingSaveTimerV2 = null;
  rerenderMeetingsAfterSaveV2 = false;
  normalizeMeetingsForSaveV2();
  await store.set({ meetings_v2: meetings });
  renderMorningBrief();
  checkMeetingAlert();
  if (rerender) renderMeetings({ force: true });
}

function queueMeetingsSaveV2({ rerender = false } = {}) {
  rerenderMeetingsAfterSaveV2 = rerenderMeetingsAfterSaveV2 || rerender;
  clearTimeout(meetingSaveTimerV2);
  meetingSaveTimerV2 = setTimeout(async () => {
    const shouldRerender = rerenderMeetingsAfterSaveV2;
    rerenderMeetingsAfterSaveV2 = false;
    meetingSaveTimerV2 = null;
    normalizeMeetingsForSaveV2();
    await store.set({ meetings_v2: meetings });
    renderMorningBrief();
    checkMeetingAlert();
    if (shouldRerender) renderMeetings({ force: true });
  }, 250);
}

async function maybePromptWrapUpV2() {
  const now = new Date();
  const candidate = [...meetings]
    .sort((a, b) => getMeetingEndDateV2(b) - getMeetingEndDateV2(a))
    .find((meeting) => {
      const phaseInfo = getMeetingPhaseV2(meeting, now);
      return phaseInfo.phase === 'after'
        && (phaseInfo.minutesAfterEnd || 0) <= 30
        && !meeting.wrapUp.promptedAt
        && !meeting.wrapUp.completedAt
        && !meeting.wrapUp.dismissedAt;
    });

  if (!candidate) return;

  candidate.wrapUp.promptedAt = Date.now();
  candidate.updated = Date.now();
  meetingUiStateV2.activeTabs[candidate.id] = 'after';
  await persistMeetingsV2({ rerender: true });

  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(`${candidate.title} vừa kết thúc`, {
      body: 'Rà soát action items và chuyển việc cần làm sang Tasks hôm nay.'
    });
  }
}

function renderMeetings({ force = false } = {}) {
  if (!force && hasMeetingEditorFocusV2()) return;

  const el = document.getElementById('meeting-list');
  if (!el) return;

  const now = new Date();
  const sorted = [...meetings].sort(sortMeetingsAscendingV2);
  ensureMeetingUiStateV2(sorted, now);

  if (sorted.length === 0) {
    const h = now.getHours();
    const tips = h < 12
      ? 'Nhấn + Thêm để lên kế hoạch cho cuộc họp hoặc lịch hẹn sắp tới.'
      : h < 17 ? 'Buổi chiều trống, đây là lúc tốt để tránh chen họp và tập trung.'
      : 'Hiện chưa có item nào cần theo dõi.';
    el.innerHTML = `<div class="meeting-placeholder"><strong>Chưa có cuộc họp hoặc lịch hẹn nào</strong><span>${tips}</span></div>`;
    return;
  }

  const buckets = getMeetingBucketsV2(sorted, now);
  let html = '';

  if (buckets.primary) {
    html += `<div class="meeting-section-label">Đang diễn ra / gần nhất</div>`;
    html += renderMeetingCardV2(buckets.primary, {
      expanded: meetingUiStateV2.expandedId === buckets.primary.id,
      isNext: getMeetingPhaseV2(buckets.primary, now).phase !== 'after',
      now
    });
  }

  if (buckets.upcoming.length > 0) {
    html += `<div class="meeting-section-label">Sắp tới</div>`;
    buckets.upcoming.forEach((meeting) => {
      const upcomingTone = meetingDateDiffDays(meeting.date) <= 2 ? 'meeting-upcoming-soon' : 'meeting-upcoming-later';
      html += `<div class="meeting-upcoming ${upcomingTone}">
        ${renderMeetingCardV2(meeting, {
          expanded: meetingUiStateV2.expandedId === meeting.id,
          isNext: false,
          now
        })}
      </div>`;
    });
  }

  if (buckets.later.length > 0) {
    html += `<div class="meeting-section-label">Sau đó</div>`;
    buckets.later.forEach((meeting) => {
      html += `<div class="meeting-upcoming meeting-upcoming-later">
        ${renderMeetingCardV2(meeting, {
          expanded: meetingUiStateV2.expandedId === meeting.id,
          isNext: false,
          now
        })}
      </div>`;
    });
  }

  el.innerHTML = html;
}

async function loadMeetings() {
  const data = await store.get(['meetings_v2']);
  const rawMeetings = Array.isArray(data.meetings_v2) ? data.meetings_v2 : [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;

  meetings = rawMeetings
    .map(normalizeMeetingRecordV2)
    .filter((meeting) => meeting.date >= cutoffStr && meeting.title && meeting.time)
    .sort(sortMeetingsAscendingV2);

  if (JSON.stringify(rawMeetings) !== JSON.stringify(meetings)) {
    await store.set({ meetings_v2: meetings });
  }

  renderMeetings({ force: true });
  await maybePromptWrapUpV2();
  startMeetingCountdown();
}

function startMeetingCountdown() {
  clearInterval(meetingCountdownInterval);
  meetingCountdownInterval = setInterval(async () => {
    renderMeetings();
    await maybePromptWrapUpV2();
    checkMeetingAlert();
    renderMorningBrief();
  }, 30000);
}

function bindEnhancedMeetingInteractions() {
  const addButton = replaceElementWithClone('btn-add-meeting');
  const cancelButton = replaceElementWithClone('meeting-cancel-btn');
  const saveButton = replaceElementWithClone('meeting-save-btn');
  const list = replaceElementWithClone('meeting-list');
  const kindInput = replaceElementWithClone('meeting-kind-input');
  const titleInput = replaceElementWithClone('meeting-title-input');

  kindInput?.addEventListener('change', () => {
    updateMeetingFormModeV2();
  });

  addButton?.addEventListener('click', () => {
    const form = document.getElementById('meeting-form');
    if (!form) return;
    if (form.hidden) {
      showMeetingForm();
      return;
    }
    hideMeetingForm();
  });

  cancelButton?.addEventListener('click', () => {
    hideMeetingForm({ clearDraft: true });
  });

  saveButton?.addEventListener('click', async () => {
    const kind = document.getElementById('meeting-kind-input').value;
    const title = document.getElementById('meeting-title-input').value.trim();
    const date = document.getElementById('meeting-date-input').value || todayStr();
    const time = document.getElementById('meeting-time-input').value;
    const link = document.getElementById('meeting-link-input').value.trim();
    if (!title || !time) return;

    const meeting = createMeetingRecordV2({ kind, title, date, time, link });
    meetings.push(meeting);
    meetingUiStateV2.activeTabs[meeting.id] = getMeetingPhaseV2(meeting).phase;

    hideMeetingForm({ clearDraft: true });
    await persistMeetingsV2({ rerender: true });
  });

  titleInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('meeting-save-btn')?.click();
  });

  list?.addEventListener('click', async (e) => {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;

    const action = actionEl.dataset.action;
    const meetingId = actionEl.dataset.id || '';

    if (action === 'toggle-meeting-expand' && e.target.closest('[data-skip-toggle="true"]')) {
      return;
    }

    if (action === 'delete-meeting') {
      meetings = meetings.filter((meeting) => meeting.id !== meetingId);
      if (meetingUiStateV2.expandedId === meetingId) meetingUiStateV2.expandedId = '';
      delete meetingUiStateV2.activeTabs[meetingId];
      delete meetingUiStateV2.agendaDraftCounts[meetingId];
      delete meetingUiStateV2.agendaEditingIndex[meetingId];
      await persistMeetingsV2({ rerender: true });
      return;
    }

    if (action === 'toggle-meeting-expand') {
      meetingUiStateV2.expandedId = meetingUiStateV2.expandedId === meetingId ? '' : meetingId;
      renderMeetings({ force: true });
      return;
    }

    if (action === 'meeting-tab') {
      meetingUiStateV2.expandedId = meetingId;
      meetingUiStateV2.activeTabs[meetingId] = actionEl.dataset.tab || 'before';
      renderMeetings({ force: true });
      return;
    }

    const meeting = findMeetingByIdV2(meetingId);
    if (!meeting) return;

    if (action === 'complete-meeting') {
      const endedAt = Date.now();
      meeting.endedAt = endedAt;
      meeting.wrapUp.promptedAt = endedAt;
      meeting.wrapUp.dismissedAt = 0;
      meeting.updated = endedAt;
      meetingUiStateV2.expandedId = meetingId;
      meetingUiStateV2.activeTabs[meetingId] = 'after';
      await persistMeetingsV2({ rerender: true });
      return;
    }

    if (action === 'copy-meeting-agenda') {
      const text = buildMeetingAgendaClipboardTextV2(meeting);
      try {
        await navigator.clipboard.writeText(text);
        showToast(localizeNewTabText('Đã copy agenda'));
      } catch {
        window.alert(text);
      }
      return;
    }

    if (action === 'copy-meeting-location') {
      if (!meeting.location) return;
      try {
        await navigator.clipboard.writeText(meeting.location);
        showToast(localizeNewTabText('Đã copy địa điểm'));
      } catch {
        window.alert(meeting.location);
      }
      return;
    }

    if (action === 'start-meeting-note') {
      meetingUiStateV2.expandedId = meetingId;
      meetingUiStateV2.activeTabs[meetingId] = 'during';
      renderMeetings({ force: true });
      focusMeetingNoteEditorV2(meetingId);
      return;
    }

    if (action === 'insert-meeting-action') {
      const noteInput = document.querySelector(`[data-action="meeting-note-input"][data-id="${meetingId}"]`);
      if (!noteInput) return;
      insertMeetingActionItemV2(noteInput);
      return;
    }

    if (action === 'add-meeting-followup-template') {
      const templateText = String(actionEl.dataset.template || '').trim();
      if (!templateText) return;
      const normalizedTemplate = normalizeComparableText(templateText);
      const existingActionItems = new Set(extractMeetingActionItemsV2(meeting.notes).map((item) => item.key));
      if (!existingActionItems.has(normalizedTemplate)) {
        meeting.notes = `${meeting.notes ? `${meeting.notes.trim()}\n` : ''}-> ${templateText}`.trim();
        meeting.updated = Date.now();
        await persistMeetingsV2({ rerender: true });
      }
      meetingUiStateV2.expandedId = meetingId;
      meetingUiStateV2.activeTabs[meetingId] = 'after';
      renderMeetings({ force: true });
      return;
    }

    if (action === 'add-meeting-agenda-template') {
      const template = MEETING_AGENDA_TEMPLATES_V2.find((item) => item.key === actionEl.dataset.template);
      if (!template) return;

      const existingIndex = meeting.agenda.findIndex((item) => normalizeComparableText(item) === normalizeComparableText(template.text));
      meetingUiStateV2.expandedId = meetingId;
      meetingUiStateV2.activeTabs[meetingId] = 'before';

      if (existingIndex >= 0) {
        meetingUiStateV2.agendaEditingIndex[meetingId] = existingIndex;
        renderMeetings({ force: true });
        return;
      }

      if (meeting.agenda.length >= 6) {
        showToast(localizeNewTabText('Agenda đã đủ 6 mục'));
        return;
      }

      meeting.agenda.push(template.text);
      meeting.updated = Date.now();
      meetingUiStateV2.agendaDraftCounts[meetingId] = getMeetingAgendaRowCountV2(meeting);
      await persistMeetingsV2({ rerender: true });
      return;
    }

    if (action === 'add-meeting-agenda') {
      meetingUiStateV2.agendaDraftCounts[meetingId] = Math.min(6, getMeetingAgendaRowCountV2(meeting) + 1);
      delete meetingUiStateV2.agendaEditingIndex[meetingId];
      meetingUiStateV2.expandedId = meetingId;
      meetingUiStateV2.activeTabs[meetingId] = 'before';
      renderMeetings({ force: true });
      return;
    }

    if (action === 'edit-meeting-agenda') {
      const index = Number(actionEl.dataset.index);
      if (Number.isNaN(index)) return;

      meetingUiStateV2.agendaEditingIndex[meetingId] = index;
      meetingUiStateV2.expandedId = meetingId;
      meetingUiStateV2.activeTabs[meetingId] = 'before';
      renderMeetings({ force: true });
      return;
    }

    if (action === 'delete-meeting-agenda') {
      const index = Number(actionEl.dataset.index);
      if (Number.isNaN(index)) return;

      const currentRowCount = getMeetingAgendaRowCountV2(meeting);
      const hadSavedAgendaItem = index < meeting.agenda.length;
      if (hadSavedAgendaItem) {
        meeting.agenda.splice(index, 1);
        meeting.updated = Date.now();
      }

      const editingIndex = Number(meetingUiStateV2.agendaEditingIndex[meetingId]);
      if (!Number.isNaN(editingIndex)) {
        if (editingIndex === index) {
          delete meetingUiStateV2.agendaEditingIndex[meetingId];
        } else if (editingIndex > index) {
          meetingUiStateV2.agendaEditingIndex[meetingId] = editingIndex - 1;
        }
      }

      meetingUiStateV2.agendaDraftCounts[meetingId] = Math.max(1, Math.max(meeting.agenda.length, currentRowCount - 1));

      if (hadSavedAgendaItem) {
        await persistMeetingsV2({ rerender: true });
      } else {
        renderMeetings({ force: true });
      }
      return;
    }

    if (action === 'add-meeting-doc') {
      const form = actionEl.closest('[data-doc-form-for]');
      const labelInput = form?.querySelector('[data-doc-label]');
      const urlInput = form?.querySelector('[data-doc-url]');
      const url = sanitizeMeetingUrlV2(urlInput?.value || '');
      if (!url) {
        window.alert(localizeNewTabText('Link tài liệu chưa hợp lệ.'));
        urlInput?.focus();
        return;
      }

      meeting.docs.push({
        id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        label: String(labelInput?.value || '').trim(),
        url
      });
      meeting.updated = Date.now();
      await persistMeetingsV2({ rerender: true });
      return;
    }

    if (action === 'delete-meeting-doc') {
      meeting.docs = meeting.docs.filter((doc) => doc.id !== actionEl.dataset.docId);
      meeting.updated = Date.now();
      await persistMeetingsV2({ rerender: true });
      return;
    }

    if (action === 'meeting-wrapup-dismiss') {
      meeting.wrapUp.dismissedAt = Date.now();
      meeting.updated = Date.now();
      await persistMeetingsV2({ rerender: true });
      return;
    }

    if (action === 'meeting-wrapup-save') {
      const actionItems = extractMeetingActionItemsV2(meeting.notes);
      const selectedItems = actionItems.filter((item) => getWrapSelectionV2(meeting, item));
      const existingTasks = new Set(tasks.map((task) => normalizeComparableText(task.text)));
      const now = Date.now();

      selectedItems.forEach((item, index) => {
        const normalizedText = normalizeComparableText(item.text);
        if (existingTasks.has(normalizedText)) return;
        existingTasks.add(normalizedText);
        tasks.unshift({
          id: `${now}-${index}`,
          text: item.text,
          done: false,
          created: now + index,
          updatedAt: now + index,
          completedAt: 0,
          source: 'meeting',
          meetingId: meeting.id,
          taskDateKey: getLocalDateKey(new Date()),
          carryOverFromDateKey: ''
        });
      });

      meeting.wrapUp.importedItems = Array.from(new Set([
        ...meeting.wrapUp.importedItems,
        ...selectedItems.map((item) => item.key)
      ]));
      selectedItems.forEach((item) => {
        meeting.wrapUp.selection[item.key] = false;
      });
      meeting.wrapUp.completedAt = Date.now();
      meeting.wrapUp.dismissedAt = 0;
      meeting.updated = Date.now();

      await persistTaskState();
      await persistMeetingsV2({ rerender: true });
    }
  });

  list?.addEventListener('input', (e) => {
    const metaInput = e.target.closest('[data-action="meeting-meta-input"]');
    if (metaInput) {
      const meeting = findMeetingByIdV2(metaInput.dataset.id);
      const field = metaInput.dataset.field;
      if (!meeting || !field) return;

      if (['person', 'location', 'goal', 'carryNotes'].includes(field)) {
        meeting[field] = metaInput.value.trimStart();
        meeting.updated = Date.now();
        queueMeetingsSaveV2({ rerender: true });
      }
      return;
    }

    const agendaInput = e.target.closest('[data-action="meeting-agenda-input"]');
    if (agendaInput) {
      const meeting = findMeetingByIdV2(agendaInput.dataset.id);
      const index = Number(agendaInput.dataset.index);
      if (!meeting || Number.isNaN(index)) return;

      const agenda = [...meeting.agenda];
      while (agenda.length <= index) agenda.push('');
      agenda[index] = agendaInput.value;
      meeting.agenda = agenda;
      meeting.updated = Date.now();
      meetingUiStateV2.agendaDraftCounts[meeting.id] = Math.max(getMeetingAgendaRowCountV2(meeting), index + 1);
      if (Number(meetingUiStateV2.agendaEditingIndex[meeting.id]) === index && agendaInput.value.trim()) {
        delete meetingUiStateV2.agendaEditingIndex[meeting.id];
      }
      queueMeetingsSaveV2();
      return;
    }

    const noteInput = e.target.closest('[data-action="meeting-note-input"]');
    if (!noteInput) return;

    const meeting = findMeetingByIdV2(noteInput.dataset.id);
    if (!meeting) return;

    meeting.notes = noteInput.value;
    meeting.updated = Date.now();
    queueMeetingsSaveV2();

    const preview = document.querySelector(`[data-action-preview-for="${meeting.id}"]`);
    if (preview) preview.innerHTML = renderMeetingActionPreviewMarkupV2(noteInput.value);
  });

  list?.addEventListener('change', async (e) => {
    const toggle = e.target.closest('[data-action="meeting-wrap-toggle"]');
    if (!toggle) return;

    const meeting = findMeetingByIdV2(toggle.dataset.id);
    if (!meeting) return;

    meeting.wrapUp.selection[toggle.dataset.key] = !!toggle.checked;
    meeting.updated = Date.now();
    await persistMeetingsV2();
  });

  list?.addEventListener('keydown', (e) => {
    const toggleHeader = e.target.closest('.meeting-header-toggle[data-action="toggle-meeting-expand"]');
    if (toggleHeader && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      toggleHeader.click();
      return;
    }

    const noteInput = e.target.closest('[data-action="meeting-note-input"]');
    if (noteInput && e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      insertMeetingNoteBulletV2(noteInput);
      return;
    }

    if (e.key !== 'Enter') return;
    const form = e.target.closest('[data-doc-form-for]');
    if (!form) return;
    e.preventDefault();
    form.querySelector('[data-action="add-meeting-doc"]')?.click();
  });

  updateMeetingToggleButton(false);
  updateMeetingFormModeV2();
}

bindEnhancedMeetingInteractions();

// ===== MEETING ALERT BADGE =====
function checkMeetingAlert() {
  const today = todayStr();
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
  const urgent = meetings.some(mt => {
    if (mt.date !== today) return false;
    const [h, m] = mt.time.split(':').map(Number);
    const diff = (h * 60 + m) - nowMins;
    return diff >= 0 && diff <= 15;
  });
  const badge = document.getElementById('meeting-alert-dot');
  if (urgent) {
    if (!badge) {
      const dot = document.createElement('span');
      dot.id = 'meeting-alert-dot';
      dot.className = 'meeting-alert-dot';
      dot.title = 'Có lịch sắp bắt đầu!';
      const header = document.querySelector('#tab-meetings .card-title');
      if (header) header.appendChild(dot);
    }
  } else {
    badge?.remove();
  }
}


window.offiqaNewtabFeatureInitializers = window.offiqaNewtabFeatureInitializers || {};
window.offiqaNewtabFeatureInitializers.meetings = async () => {
  resetMeetingFormState();
  attachNativeDatePicker?.(document.getElementById('meeting-date-input'));
  await loadMeetings();
  checkMeetingAlert();
};
