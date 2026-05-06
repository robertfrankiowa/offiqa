// ===== MEETINGS SIDEBAR =====
let meetingsSidebarItems = [];

function parseMeetingSidebarDateTime(meeting) {
  const parsed = new Date(`${meeting.date || ''}T${meeting.time || ''}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeMeetingSidebarRecord(record) {
  return {
    id: String(record?.id || Date.now()),
    title: String(record?.title || '').trim(),
    kind: record?.kind === 'appointment' ? 'appointment' : 'meeting',
    date: String(record?.date || ''),
    time: String(record?.time || ''),
    link: String(record?.link || '').trim(),
    location: String(record?.location || '').trim(),
    notes: String(record?.notes || '').trim()
  };
}

function formatMeetingSidebarWhen(meeting) {
  const dt = parseMeetingSidebarDateTime(meeting);
  if (!dt) return '';
  return new Intl.DateTimeFormat(getPopupLanguageLocale(), {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(dt);
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMeetingsSidebarStatus(meeting, now = new Date()) {
  const dt = parseMeetingSidebarDateTime(meeting);
  if (!dt) return { label: 'Chưa rõ giờ', tone: 'default' };

  const diffMinutes = Math.round((dt.getTime() - now.getTime()) / 60000);
  if (diffMinutes < -60) return { label: 'Đã qua', tone: 'default' };
  if (diffMinutes < 0) return { label: 'Đang diễn ra', tone: 'live' };
  if (diffMinutes <= 30) return { label: `Trong ${diffMinutes} phut`, tone: 'soon' };
  if (diffMinutes < 24 * 60) {
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return { label: hours > 0 ? `Trong ${hours}g ${minutes}p` : `Trong ${minutes} phut`, tone: 'soon' };
  }
  return { label: 'Sắp tới', tone: 'default' };
}

async function loadMeetingsSidebar() {
  const data = await store.get(['meetings_v2']);
  const rawMeetings = Array.isArray(data.meetings_v2) ? data.meetings_v2 : [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);

  meetingsSidebarItems = rawMeetings
    .map(normalizeMeetingSidebarRecord)
    .filter((meeting) => meeting.title && parseMeetingSidebarDateTime(meeting))
    .filter((meeting) => parseMeetingSidebarDateTime(meeting) >= cutoff)
    .sort((a, b) => parseMeetingSidebarDateTime(a) - parseMeetingSidebarDateTime(b));

  renderMeetingsSidebar();
}

function renderMeetingsSidebar() {
  const summary = document.getElementById('meetings-sidebar-summary');
  const list = document.getElementById('meetings-sidebar-list');
  if (!summary || !list) return;

  const now = new Date();
  const todayKey = getLocalDateKey(now);
  const todayCount = meetingsSidebarItems.filter((meeting) => meeting.date === todayKey).length;
  const upcomingCount = meetingsSidebarItems.filter((meeting) => {
    const dt = parseMeetingSidebarDateTime(meeting);
    return dt && dt >= now;
  }).length;

  summary.innerHTML = [
    `<span class="sidebar-summary-chip">${meetingsSidebarItems.length} muc</span>`,
    `<span class="sidebar-summary-chip">${todayCount} hom nay</span>`,
    `<span class="sidebar-summary-chip">${upcomingCount} sap toi</span>`
  ].join('');

  if (!meetingsSidebarItems.length) {
    list.className = 'scroll-area sidebar-panel-scroll';
    list.innerHTML = `<div class="sidebar-empty-state">${popupUiText('meetings.emptyHtml')}</div>`;
    return;
  }

  list.className = 'scroll-area sidebar-panel-scroll meeting-sidebar-list';
  list.innerHTML = meetingsSidebarItems.map((meeting) => {
    const status = getMeetingsSidebarStatus(meeting, now);
    const chips = [`<span class="meeting-sidebar-chip">${escapeHtml(meeting.kind === 'appointment' ? popupUiText('meetings.appointment') : popupUiText('meetings.meeting'))}</span>`];
    if (meeting.location) chips.push(`<span class="meeting-sidebar-chip">${escapeHtml(meeting.location)}</span>`);
    if (meeting.notes) chips.push(`<span class="meeting-sidebar-chip">${escapeHtml(popupUiText('meetings.hasNotes'))}</span>`);

    return `
      <article class="meeting-sidebar-item status-${status.tone}">
        <div class="meeting-sidebar-head">
          <div>
            <div class="meeting-sidebar-title">${escapeHtml(meeting.title)}</div>
            <div class="meeting-sidebar-when">${escapeHtml(formatMeetingSidebarWhen(meeting))}</div>
          </div>
          <span class="meeting-sidebar-status">${escapeHtml(status.label)}</span>
        </div>
        <div class="meeting-sidebar-meta">${chips.join('')}</div>
        <div class="meeting-sidebar-actions">
          ${meeting.link ? `<a class="btn btn-sm" href="${escapeHtml(meeting.link)}" target="_blank" rel="noopener noreferrer">${meeting.kind === 'appointment' ? 'Mở link' : 'Tham gia'}</a>` : ''}
        </div>
      </article>
    `;
  }).join('');
}
