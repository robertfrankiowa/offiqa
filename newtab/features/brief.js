// ===== MORNING BRIEF =====
function renderMorningBrief() {
  const el = document.getElementById('morning-brief');
  if (!el) return;

  const now = new Date();
  const h = now.getHours();
  if (h < 5 || h >= 20) { el.hidden = true; return; }

  const today = todayStr();
  const nowMins = h * 60 + now.getMinutes();

  const pendingTasks = tasks.filter(t => !t.done);
  const priorityTasks = tasks.filter(t => t.pinned && !t.done);

  const todayMeetings = meetings.filter(m => m.date === today);
  const upcomingMeetings = meetings.filter(m => m.date > today);

  const urgentMeetings = todayMeetings.filter(mt => {
    const [mh, mm] = mt.time.split(':').map(Number);
    const diff = (mh * 60 + mm) - nowMins;
    return diff >= 0 && diff <= 15;
  });

  const parts = [];

  if (urgentMeetings.length > 0) {
    const mt = urgentMeetings[0];
    const diff = parseMeetingMinutes(mt.time);
    parts.push(`<span class="morning-brief-chip-urgent">🔔 <strong>${escHtml(mt.title)}</strong> bắt đầu ${diff <= 1 ? 'ngay bây giờ' : `trong ${diff} phút`}</span>`);
  } else if (todayMeetings.length > 0) {
    parts.push(`📅 ${todayMeetings.length} lịch hôm nay`);
  } else if (upcomingMeetings.length > 0) {
    const next = upcomingMeetings.sort((a,b) => a.date.localeCompare(b.date))[0];
    parts.push(`📅 Lịch tiếp theo: <strong>${escHtml(next.title)}</strong> · ${formatMeetingDate(next.date)}`);
  } else if (h < 10) {
    parts.push(`📅 Chưa có lịch nào`);
  }

  if (priorityTasks.length > 0) {
    parts.push(`⭐ ${priorityTasks.length} task ưu tiên`);
    if (sessionsCache.length > 0) {
      parts.push(`<button type="button" class="morning-brief-action morning-brief-action-link" data-action="open-latest-session">💼 Mở phiên gần nhất</button>`);
    }
  } else if (pendingTasks.length > 0) {
    parts.push(`✅ ${pendingTasks.length} task còn lại`);
  } else if (tasks.length > 0) {
    parts.push(`🎉 Xong hết task hôm nay!`);
  }

  if (parts.length === 0) { el.hidden = true; return; }

  el.hidden = false;
  const isUrgent = urgentMeetings.length > 0;
  el.className = isUrgent ? 'morning-brief urgent' : 'morning-brief';
  el.innerHTML = `
    <div class="morning-brief-inner">
      <span class="morning-brief-label">${h < 12 ? 'Buổi sáng' : h < 17 ? 'Buổi chiều' : 'Buổi tối'}</span>
      ${parts.map(p => `<span class="morning-brief-chip">${p}</span>`).join('<span class="morning-brief-sep">·</span>')}
      <button class="morning-brief-close" id="morning-brief-close" title="Đóng">×</button>
    </div>`;

  document.getElementById('morning-brief-close')?.addEventListener('click', () => { el.hidden = true; });
  document.querySelector('[data-action="open-latest-session"]')?.addEventListener('click', () => {
    openSession(0);
  });
}

// ===== MORNING BRIEF V2 =====
function renderMorningBrief() {
  const el = document.getElementById('morning-brief');
  if (!el) return;

  const now = new Date();
  const hour = now.getHours();
  if (hour < 5 || hour >= 20) { el.hidden = true; return; }

  const today = todayStr();
  const nowMins = hour * 60 + now.getMinutes();
  const pendingTasks = tasks.filter((task) => !task.done);
  const priorityTasks = tasks.filter((task) => task.pinned && !task.done);
  const todayMeetings = meetings.filter((meeting) => meeting.date === today);
  const upcomingMeetings = meetings.filter((meeting) => meeting.date > today);
  const urgentMeetings = todayMeetings.filter((meeting) => {
    const [mh, mm] = meeting.time.split(':').map(Number);
    const diff = (mh * 60 + mm) - nowMins;
    return diff >= 0 && diff <= 15;
  });

  if (hour >= 17 && hour < 18) {
    const lastSession = sessionsCache[0];
    const justSaved = Number(el.dataset.eodSavedAt || 0) > 0 && (Date.now() - Number(el.dataset.eodSavedAt || 0)) < 15 * 60 * 1000;
    const parts = [
      `🌆 ${sessionsCache.length} phiên đã lưu${lastSession ? ` · gần nhất ${escHtml(lastSession.name)}` : ''}`,
      justSaved
        ? 'Đã snapshot cuối ngày. Mai mở lên sẽ thấy lại đúng context đang dở.'
        : 'Sắp tan làm · lưu trạng thái trước khi đóng để sáng mai không bị blank slate.',
      '<button type="button" class="morning-brief-action" data-action="save-eod-snapshot">💾 Lưu tất cả</button>',
      '<button type="button" class="morning-brief-action" data-action="review-sessions">🔎 Xem lại</button>'
    ];

    el.hidden = false;
    el.className = 'morning-brief';
    el.innerHTML = `
      <div class="morning-brief-inner">
        <span class="morning-brief-label">Evening Brief</span>
        ${parts.map((part) => `<span class="morning-brief-chip">${part}</span>`).join('<span class="morning-brief-sep">·</span>')}
        <button class="morning-brief-close" id="morning-brief-close" title="Đóng">×</button>
      </div>`;

    document.getElementById('morning-brief-close')?.addEventListener('click', () => { el.hidden = true; });
    document.querySelector('[data-action="save-eod-snapshot"]')?.addEventListener('click', async () => {
      await saveEndOfDaySnapshot();
      el.dataset.eodSavedAt = String(Date.now());
      renderMorningBrief();
    });
    document.querySelector('[data-action="review-sessions"]')?.addEventListener('click', () => {
      document.getElementById('tab-sessions')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return;
  }

  const parts = [];

  if (urgentMeetings.length > 0) {
    const meeting = urgentMeetings[0];
    const diff = parseMeetingMinutes(meeting.time);
    parts.push(`<span class="morning-brief-chip-urgent">🔔 <strong>${escHtml(meeting.title)}</strong> bắt đầu ${diff <= 1 ? 'ngay bây giờ' : `trong ${diff} phút`}</span>`);
  } else if (todayMeetings.length > 0) {
    parts.push(`📅 ${todayMeetings.length} lịch hôm nay`);
  } else if (upcomingMeetings.length > 0) {
    const nextMeeting = upcomingMeetings.sort((a, b) => a.date.localeCompare(b.date))[0];
    parts.push(`📅 Lịch tiếp theo: <strong>${escHtml(nextMeeting.title)}</strong> · ${formatMeetingDate(nextMeeting.date)}`);
  } else if (hour < 10) {
    parts.push('📭 Chưa có lịch nào');
  }

  if (priorityTasks.length > 0) {
    parts.push(`⭐ ${priorityTasks.length} task ưu tiên`);
    if (sessionsCache.length > 0) {
      parts.push('<button type="button" class="morning-brief-action morning-brief-action-link" data-action="open-latest-session">💼 Mở phiên gần nhất</button>');
    }
  } else if (pendingTasks.length > 0) {
    parts.push(`✅ ${pendingTasks.length} task còn lại`);
  } else if (tasks.length > 0) {
    parts.push('🎉 Xong hết task hôm nay!');
  }

  if (sessionsCache.length > 0 && hour < 11) {
    const lastSession = sessionsCache[0];
    parts.push(`📌 Đang dở: ${escHtml(truncateSessionText(lastSession.handoffNote || lastSession.name, 56))}`);
  }

  if (parts.length === 0) { el.hidden = true; return; }

  el.hidden = false;
  el.className = urgentMeetings.length > 0 ? 'morning-brief urgent' : 'morning-brief';
  el.innerHTML = `
    <div class="morning-brief-inner">
      <span class="morning-brief-label">${hour < 12 ? 'Buổi sáng' : hour < 17 ? 'Buổi chiều' : 'Buổi tối'}</span>
      ${parts.map((part) => `<span class="morning-brief-chip">${part}</span>`).join('<span class="morning-brief-sep">·</span>')}
      <button class="morning-brief-close" id="morning-brief-close" title="Đóng">×</button>
    </div>`;

  document.getElementById('morning-brief-close')?.addEventListener('click', () => { el.hidden = true; });
  document.querySelector('[data-action="open-latest-session"]')?.addEventListener('click', () => {
    if (sessionsCache[0]) showSessionResumeModal(sessionsCache[0].id, 'resume');
  });
}


window.offiqaNewtabFeatureInitializers = window.offiqaNewtabFeatureInitializers || {};
window.offiqaNewtabFeatureInitializers.brief = async () => {
  renderMorningBrief();
};
