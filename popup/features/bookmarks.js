// ===== DẤU TRANG =====
let bookmarkGroups = [];
let currentGroupId = null;
let hiddenShortcutLockedByPin = false;
let hiddenShortcutUnlocked = false;
const ICON_OPTIONS = ['\u{1F4C1}','\u{1F4BC}','\u2B50','\u{1F3E0}','\u{1F517}','\u{1F4CA}','\u{1F4E7}','\u{1F3AF}','\u{1F680}','\u{1F4A1}','\u{1F50D}','\u{1F4F1}','\u{1F5A5}\uFE0F','\u{1F4DD}'];
let selectedIcon = '\u{1F4C1}';

document.getElementById('group-icon-btn').addEventListener('click', () => {
  const icons = ICON_OPTIONS;
  const current = ICON_OPTIONS.indexOf(selectedIcon);
  selectedIcon = icons[(current + 1) % icons.length];
  document.getElementById('group-icon-btn').textContent = selectedIcon;
});

async function refreshBookmarkGroupsFromStore() {
  const data = await store.get(['bookmark_groups']);
  bookmarkGroups = Array.isArray(data.bookmark_groups) ? data.bookmark_groups : [];
  return bookmarkGroups;
}

async function loadBookmarks() {
  const data = await store.get(['bookmark_groups', 'auto_delete_smart_bookmarks', 'pin_hash']);
  bookmarkGroups = Array.isArray(data.bookmark_groups) ? data.bookmark_groups : [];
  hiddenShortcutLockedByPin = isHiddenBookmarkShortcut && Boolean(data.pin_hash);
  hiddenShortcutUnlocked = !hiddenShortcutLockedByPin;
  document.getElementById('auto-delete-on-close').checked = Boolean(data.auto_delete_smart_bookmarks);
  if (isHiddenBookmarkShortcut) {
    document.getElementById('new-group-hidden').checked = true;
    document.getElementById('bookmark-group-card-title').textContent = popupUiText('bookmarks.groupList');
    document.getElementById('bookmark-group-card-desc').textContent = popupUiText('bookmarks.dragHint');
  }
  renderTargetGroupOptions();
  updateBookmarkSaveState();
  renderGroups();
  await renderHiddenShortcutStatus();
  if (isHiddenBookmarkShortcut && hiddenShortcutLockedByPin) {
    openPinModal('unlock');
  }
}

function renderGroups() {
  const el = document.getElementById('group-list');
  const q = document.getElementById('bm-search').value.toLowerCase();
  const groups = getBookmarkGroupsForCurrentView().filter((group) => {
    if (!q) return true;

    const matchesGroupName = group.name.toLowerCase().includes(q);
    const matchesBookmark = (group.bookmarks || []).some((bookmark) => {
      const title = (bookmark.title || '').toLowerCase();
      const url = (bookmark.url || '').toLowerCase();
      return title.includes(q) || url.includes(q);
    });

    return matchesGroupName || matchesBookmark;
  });
  
  if (groups.length === 0) {
    if (isHiddenBookmarkShortcut && hiddenShortcutLockedByPin) {
      el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">\u{1F512}</div>${escapeHtml(popupUiText('bookmarks.hiddenLocked'))}</div>`;
      return;
    }
    el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">\u{1F516}</div>${escapeHtml(popupUiText('bookmarks.noGroups'))}</div>`;
    return;
  }
  el.innerHTML = groups.map(g => `
    <div class="group-item" data-group-id="${g.id}">
      <span class="group-icon">${g.icon}</span>
      <span class="group-name">${escapeHtml(g.name)}${g.hidden ? ` <span style="font-size:10px;color:#9ca3af">(${escapeHtml(popupUiText('bookmarks.hiddenLabelShort'))})</span>` : ''}</span>
      <span class="group-count">${escapeHtml(popupUiText((g.bookmarks || []).length === 1 ? 'bookmarks.page' : 'bookmarks.pages', { count: (g.bookmarks || []).length }))}</span>
      <button
        type="button"
        class="group-delete-btn"
        data-action="delete-group"
        data-group-id="${g.id}"
        data-group-name="${escapeHtml(g.name)}"
        title="${escapeHtml(popupUiText('bookmarks.deleteGroup'))}"
        aria-label="${escapeHtml(`${popupUiText('bookmarks.deleteGroup')} ${g.name}`)}"
      >&times;</button>
    </div>
  `).join('');
}

function renderTargetGroupOptions(preferredGroupId = null) {
  const select = document.getElementById('bm-target-group');
  const previousValue = preferredGroupId || select.value;
  const saveGroups = getBookmarkSaveGroups();

  if (saveGroups.length === 0) {
    select.innerHTML = `<option value="">${escapeHtml(popupUiText('bookmarks.selectPlaceholder'))}</option>`;
    select.disabled = true;
    updateBookmarkSaveState();
    return;
  }

  const options = saveGroups.map((group) => {
    const suffix = group.hidden ? popupUiText('bookmarks.hiddenSuffix') : '';
    return `<option value="${group.id}">${escapeHtml(group.icon)} ${escapeHtml(group.name)}${suffix}</option>`;
  }).join('');

  select.innerHTML = options;
  select.disabled = false;

  const fallback = isHiddenBookmarkShortcut
    ? saveGroups[0].id
    : (saveGroups.find((group) => !group.hidden)?.id || saveGroups[0].id);
  const nextValue = saveGroups.some((group) => group.id === previousValue) ? previousValue : fallback;
  select.value = nextValue;
  updateBookmarkSaveState();
}

async function renderHiddenShortcutStatus() {
  const data = await store.get(['bookmark_groups', 'hidden_bookmark_session', 'pin_hash']);
  const groups = Array.isArray(data.bookmark_groups) ? data.bookmark_groups : [];
  const hiddenGroups = groups.filter((group) => group.hidden);
  const hiddenBookmarkCount = hiddenGroups.reduce((total, group) => {
    return total + ((group.bookmarks || []).length);
  }, 0);
  const session = data.hidden_bookmark_session || {};
  const el = document.getElementById('bookmark-shortcut-status');
  const commands = chrome.commands?.getAll
    ? await new Promise((resolve) => chrome.commands.getAll(resolve))
    : [];
  const shortcutCommand = commands.find((command) => command.name === 'toggle-hidden-bookmarks');
  const assignedShortcut = shortcutCommand?.shortcut || '';
  const requiresPinUnlock = Boolean(data.pin_hash) && (!isHiddenBookmarkShortcut || !hiddenShortcutUnlocked);

  let stateClass = '';
  let title = '';
  let desc = '';

  if (!assignedShortcut) {
    stateClass = 'warn';
    title = popupUiText('bookmarks.shortcutNoKeyTitle');
    desc = popupUiText('bookmarks.shortcutNoKeyDesc');
  } else if (session.reason === 'error' && session.lastError) {
    stateClass = 'warn';
    title = popupUiText('bookmarks.shortcutErrorTitle', { shortcut: assignedShortcut });
    desc = session.lastError;
  } else if (session.active && Array.isArray(session.tabIds) && session.tabIds.length > 0) {
    stateClass = 'active';
    title = popupUiText('bookmarks.shortcutActiveTitle', { count: session.tabIds.length });
    desc = popupUiText('bookmarks.shortcutActiveDesc', { shortcut: assignedShortcut });
  } else if (hiddenGroups.length === 0) {
    title = popupUiText('bookmarks.shortcutEmptyTitle');
    desc = popupUiText('bookmarks.shortcutEmptyDesc', { shortcut: assignedShortcut });
  } else if (requiresPinUnlock) {
    stateClass = 'warn';
    title = popupUiText('bookmarks.shortcutLockedTitle');
    desc = isHiddenBookmarkShortcut
      ? popupUiText('bookmarks.shortcutLockedDescPopup')
      : popupUiText('bookmarks.shortcutLockedDescMain', { shortcut: assignedShortcut });
  } else if (hiddenBookmarkCount === 0) {
    stateClass = 'warn';
    title = popupUiText('bookmarks.shortcutNoBookmarksTitle');
    desc = popupUiText('bookmarks.shortcutNoBookmarksDesc', { count: hiddenGroups.length, shortcut: assignedShortcut });
  } else {
    stateClass = 'ready';
    title = popupUiText('bookmarks.shortcutReadyTitle', { shortcut: assignedShortcut, count: hiddenBookmarkCount });
    desc = popupUiText('bookmarks.shortcutReadyDesc', { shortcut: assignedShortcut });
  }

  el.className = `bookmark-shortcut-status${stateClass ? ` ${stateClass}` : ''}`;
  el.innerHTML = `
    <div class="bookmark-shortcut-status-title">${escapeHtml(title)}</div>
    <div class="bookmark-shortcut-status-desc">${escapeHtml(desc)}</div>
  `;

  if (isHiddenBookmarkShortcut) {
    const cardTitle = document.getElementById('bookmark-group-card-title');
    const cardDesc = document.getElementById('bookmark-group-card-desc');
    if (cardTitle && cardDesc) {
      cardTitle.textContent = hiddenShortcutLockedByPin && !hiddenShortcutUnlocked
        ? popupUiText('bookmarks.cardOpenHiddenTitle')
        : popupUiText('bookmarks.groupList');
      if (requiresPinUnlock) {
        cardDesc.textContent = popupUiText('bookmarks.cardPinUnlockDesc');
      } else {
        cardDesc.textContent = popupUiText('bookmarks.dragHint');
      }
    }
  }
}

document.getElementById('bm-search').addEventListener('input', renderGroups);
document.getElementById('auto-delete-on-close').addEventListener('change', async (e) => {
  await store.set({ auto_delete_smart_bookmarks: e.target.checked });
  showToast(e.target.checked ? popupUiText('bookmarks.toastAutoDeleteOn') : popupUiText('bookmarks.toastAutoDeleteOff'));
});

window.openGroup = (id) => {
  currentGroupId = id;
  const group = getBookmarkGroupsForCurrentView().find(g => g.id === id);
  if (!group) return;
  document.getElementById('bm-view-main').style.display = 'none';
  document.getElementById('bm-view-detail').style.display = 'block';
  document.getElementById('bm-group-title').textContent = `${group.icon} ${group.name}`;
  const openAllBtn = document.getElementById('btn-open-group-detail');
  if (openAllBtn) {
    const bookmarkCount = Array.isArray(group.bookmarks) ? group.bookmarks.length : 0;
    openAllBtn.disabled = bookmarkCount === 0;
    openAllBtn.textContent = bookmarkCount > 0 ? popupUiText('bookmarks.openAllCount', { count: bookmarkCount }) : popupUiText('bookmarks.openAll');
  }
  const bks = group.bookmarks || [];
  const el = document.getElementById('bm-bookmark-list');
  if (bks.length === 0) {
    el.innerHTML = `<div class="empty-state">${escapeHtml(popupUiText('bookmarks.noPagesInGroup'))}</div>`;
    return;
  }
  el.innerHTML = bks.map((b, i) => `
    <div class="bookmark-item">
      <img class="bookmark-favicon" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(b.url)}">
      <span class="bookmark-title" data-url="${encodeURIComponent(b.url)}" style="cursor:pointer">${escapeHtml(b.title || b.url)}</span>
      <button type="button" class="note-item-del" data-action="delete-bookmark" data-group-id="${id}" data-index="${i}">&times;</button>
    </div>
  `).join('');
  el.querySelectorAll('.bookmark-favicon').forEach((img) => {
    img.addEventListener('error', () => {
      img.style.visibility = 'hidden';
    }, { once: true });
  });
};

function refreshOpenBookmarkGroupDetail() {
  if (!currentGroupId) return;
  const detailView = document.getElementById('bm-view-detail');
  if (!detailView || detailView.style.display === 'none') return;

  const stillAvailable = getBookmarkGroupsForCurrentView().some((group) => group.id === currentGroupId);
  if (stillAvailable) {
    openGroup(currentGroupId);
    return;
  }

  currentGroupId = null;
  document.getElementById('bm-view-main').style.display = 'block';
  detailView.style.display = 'none';
}

window.openBookmark = (url) => {
  chrome.tabs.create({ url: decodeURIComponent(url) });
};

window.openBookmarkGroup = (groupId) => {
  const group = bookmarkGroups.find((item) => item.id === groupId);
  const bookmarks = Array.isArray(group?.bookmarks) ? group.bookmarks.filter((bookmark) => bookmark?.url) : [];
  if (!bookmarks.length) return;

  bookmarks.forEach((bookmark, index) => {
    chrome.tabs.create({ url: bookmark.url, active: index === 0 });
  });
  showToast(popupUiText('bookmarks.toastOpenedGroup', { count: bookmarks.length, name: group.name }));
};

window.deleteBookmark = async (groupId, idx) => {
  await refreshBookmarkGroupsFromStore();
  const group = bookmarkGroups.find(g => g.id === groupId);
  if (!group) return;
  group.bookmarks.splice(idx, 1);
  await store.set({ bookmark_groups: bookmarkGroups });
  openGroup(groupId);
  await renderHiddenShortcutStatus();
};

window.deleteGroup = async (groupId) => {
  await refreshBookmarkGroupsFromStore();
  const group = bookmarkGroups.find((item) => item.id === groupId);
  if (!group) return;

  const bookmarkCount = Array.isArray(group.bookmarks) ? group.bookmarks.length : 0;
  const shouldDelete = confirm(
    bookmarkCount > 0
      ? popupUiText('bookmarks.deleteGroupConfirmWithBookmarks', { name: group.name, count: bookmarkCount })
      : popupUiText('bookmarks.deleteGroupConfirm', { name: group.name })
  );
  if (!shouldDelete) return;

  bookmarkGroups = bookmarkGroups.filter((item) => item.id !== groupId);
  if (currentGroupId === groupId) {
    currentGroupId = null;
    document.getElementById('bm-view-main').style.display = 'block';
    document.getElementById('bm-view-detail').style.display = 'none';
  }

  await store.set({ bookmark_groups: bookmarkGroups });
  renderTargetGroupOptions();
  renderGroups();
  await renderHiddenShortcutStatus();
  showToast(popupUiText('bookmarks.groupDeleted', { name: group.name }));
};

document.getElementById('btn-bm-back').addEventListener('click', () => {
  document.getElementById('bm-view-main').style.display = 'block';
  document.getElementById('bm-view-detail').style.display = 'none';
  currentGroupId = null;
  renderGroups();
});

document.getElementById('btn-delete-group-detail').addEventListener('click', () => {
  if (!currentGroupId) return;
  deleteGroup(currentGroupId);
});

document.getElementById('btn-open-group-detail').addEventListener('click', () => {
  if (!currentGroupId) return;
  openBookmarkGroup(currentGroupId);
});

document.getElementById('btn-create-group').addEventListener('click', async () => {
  const name = document.getElementById('new-group-name').value.trim();
  if (!name) { showToast(popupUiText('bookmarks.groupNameRequired')); return; }
  await refreshBookmarkGroupsFromStore();
  const existingGroup = isHiddenBookmarkShortcut
    ? bookmarkGroups.find((item) => String(item.name || '').trim().toLowerCase() === name.toLowerCase())
    : null;
  const group = existingGroup || {
    id: Date.now().toString(),
    name,
    icon: selectedIcon,
    hidden: isHiddenBookmarkShortcut || document.getElementById('new-group-hidden').checked,
    bookmarks: [],
    created: Date.now()
  };
  if (existingGroup) {
    group.hidden = true;
  } else {
    bookmarkGroups.push(group);
  }
  await store.set({ bookmark_groups: bookmarkGroups });
  const savedData = await store.get(['bookmark_groups']);
  bookmarkGroups = savedData.bookmark_groups || bookmarkGroups;
  document.getElementById('new-group-name').value = '';
  document.getElementById('new-group-hidden').checked = isHiddenBookmarkShortcut;
  document.getElementById('bm-search').value = '';
  renderTargetGroupOptions(group.id);
  renderGroups();
  const createdGroupEl = Array.from(document.querySelectorAll('.group-item[data-group-id]'))
    .find((item) => item.dataset.groupId === group.id);
  if (createdGroupEl) {
    createdGroupEl.classList.add('is-new');
    createdGroupEl.scrollIntoView({ block: 'nearest' });
    setTimeout(() => createdGroupEl.classList.remove('is-new'), 1600);
  }
  await renderHiddenShortcutStatus();
  showToast(popupUiText('bookmarks.groupCreated'));
});

document.getElementById('btn-save-current').addEventListener('click', async () => {
  await refreshActivePageContext();
  await refreshBookmarkGroupsFromStore();
  const saveGroups = getBookmarkSaveGroups();
  if (saveGroups.length === 0) { showToast(popupUiText('bookmarks.needGroup')); return; }
  const tab = activePageContext.tab;
  if (!tab || !activePageContext.isValid) {
    showToast(popupUiText('bookmarks.toastInvalidUrl'));
    return;
  }
  const selectedGroupId = document.getElementById('bm-target-group').value;
  const group = saveGroups.find((item) => item.id === selectedGroupId)
    || (isHiddenBookmarkShortcut ? saveGroups[0] : saveGroups.find((item) => !item.hidden))
    || saveGroups[0];
  group.bookmarks = group.bookmarks || [];
  group.bookmarks.push({ url: tab.url, title: tab.title, saved: Date.now() });
  await store.set({ bookmark_groups: bookmarkGroups });
  renderTargetGroupOptions(group.id);
  renderGroups();
  await renderHiddenShortcutStatus();
  showToast(popupUiText('bookmarks.savedTo', { name: group.name }));
});

// Hidden groups PIN
let pinInput = '';
let pinMode = 'set'; // 'set' | 'unlock'

document.getElementById('btn-set-pin').addEventListener('click', () => openPinModal('set'));
document.getElementById('btn-show-hidden').addEventListener('click', async () => {
  const data = await store.get(['pin_hash']);
  if (data.pin_hash) openPinModal('unlock');
  else showHiddenGroups();
});

function openPinModal(mode) {
  pinMode = mode;
  pinInput = '';
  updatePinDots();
  document.getElementById('pin-modal-title').textContent = mode === 'set' ? popupUiText('bookmarks.pinSetTitle') : popupUiText('bookmarks.pinUnlockTitle');
  document.getElementById('pin-modal-desc').textContent = mode === 'set'
    ? popupUiText('bookmarks.pinSetDesc')
    : popupUiText('bookmarks.pinUnlockDesc');
  document.getElementById('pin-modal').classList.remove('hidden');
}

function updatePinDots() {
  for (let i = 1; i <= 4; i++) {
    const dot = document.getElementById(`pd${i}`);
    dot.classList.toggle('filled', i <= pinInput.length);
  }
}

document.querySelectorAll('.pin-key').forEach(key => {
  key.addEventListener('click', async () => {
    const k = key.dataset.key;
    if (k === 'X') {
      if (isHiddenBookmarkShortcut && pinMode === 'unlock' && hiddenShortcutLockedByPin && !hiddenShortcutUnlocked) {
        return;
      }
      document.getElementById('pin-modal').classList.add('hidden');
      return;
    }
    if (k === 'C') { pinInput = pinInput.slice(0, -1); updatePinDots(); return; }
    if (pinInput.length >= 4) return;
    pinInput += k;
    updatePinDots();
    if (pinInput.length === 4) {
      await handlePin();
    }
  });
});

async function handlePin() {
  if (pinMode === 'set') {
    document.getElementById('pin-modal').classList.add('hidden');
    const hash = simpleHash(pinInput);
    await store.set({ pin_hash: hash });
    showToast(popupUiText('bookmarks.pinSetToast'));
  } else {
    const data = await store.get(['pin_hash']);
    if (simpleHash(pinInput) === data.pin_hash) {
      hiddenShortcutUnlocked = true;
      document.getElementById('pin-modal').classList.add('hidden');
      renderTargetGroupOptions();
      if (isHiddenBookmarkShortcut) {
        renderGroups();
      } else {
        showHiddenGroups();
      }
      await renderHiddenShortcutStatus();
    } else {
      pinInput = '';
      updatePinDots();
      document.getElementById('pin-modal-desc').textContent = popupUiText('bookmarks.pinWrongDesc');
      showToast(popupUiText('bookmarks.pinWrongToast'));
    }
  }
}

function showHiddenGroups() {
  const hidden = bookmarkGroups.filter(g => g.hidden);
  if (hidden.length === 0) {
    if (isHiddenBookmarkShortcut) {
      renderGroups();
      return;
    }
    showToast(popupUiText('bookmarks.noHiddenGroupsToast'));
    return;
  }
  const el = document.getElementById('group-list');
  el.innerHTML = hidden.map(g => `
    <div class="group-item" data-group-id="${g.id}">
      <span class="group-icon">${g.icon}</span>
      <span class="group-name">${escapeHtml(g.name)} <span style="font-size:10px;color:#9ca3af">(${escapeHtml(popupUiText('bookmarks.hiddenLabelShort'))})</span></span>
      <span class="group-count">${escapeHtml(popupUiText((g.bookmarks || []).length === 1 ? 'bookmarks.page' : 'bookmarks.pages', { count: (g.bookmarks || []).length }))}</span>
      <button
        type="button"
        class="group-delete-btn"
        data-action="delete-group"
        data-group-id="${g.id}"
        title="${escapeHtml(popupUiText('bookmarks.deleteGroup'))}"
        aria-label="${escapeHtml(`${popupUiText('bookmarks.deleteGroup')} ${g.name}`)}"
      >&times;</button>
    </div>
  `).join('');
}

if (chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.bookmark_groups || changes.hidden_bookmark_session || changes.pin_hash) {
      if (changes.bookmark_groups) {
        bookmarkGroups = Array.isArray(changes.bookmark_groups.newValue) ? changes.bookmark_groups.newValue : [];
      }
      if (typeof changes.pin_hash !== 'undefined') {
        hiddenShortcutLockedByPin = isHiddenBookmarkShortcut && Boolean(changes.pin_hash.newValue);
        hiddenShortcutUnlocked = !hiddenShortcutLockedByPin;
      }
      renderTargetGroupOptions();
      renderHiddenShortcutStatus();
      if (document.getElementById('tab-bookmarks')?.classList.contains('active') || isHiddenBookmarkShortcut) {
        renderGroups();
        refreshOpenBookmarkGroupDetail();
      }
      if (
        isHiddenBookmarkShortcut &&
        hiddenShortcutLockedByPin &&
        !hiddenShortcutUnlocked &&
        document.getElementById('pin-modal').classList.contains('hidden')
      ) {
        openPinModal('unlock');
      } else if (!hiddenShortcutLockedByPin) {
        document.getElementById('pin-modal').classList.add('hidden');
      }
    }
  });
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(16);
}
