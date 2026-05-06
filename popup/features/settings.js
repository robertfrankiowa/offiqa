function normalizeLanguageOptions(preferredLanguage) {
  return SUPPORTED_LANGUAGE_OPTIONS.some((option) => option.value === preferredLanguage) ? preferredLanguage : 'en';
}

async function loadSettings() {
  const data = await store.get(['language', 'enable_home', ENABLE_CLIPBOARD_KEY, ENABLE_MEDIA_AUTOPLAY_KEY, ENABLE_QUICK_SNIPPETS_KEY]);
  const normalizedLanguage = normalizeLanguageOptions(data.language);
  applyPopupLanguage(normalizedLanguage);
  if (data.language !== normalizedLanguage) await store.set({ language: normalizedLanguage });

  const langSelect = document.getElementById('lang-select');
  if (langSelect) {
    langSelect.innerHTML = SUPPORTED_LANGUAGE_OPTIONS.map((option) => `<option value="${option.value}">${option.label}</option>`).join('');
    langSelect.value = normalizedLanguage;
  }
  const home = document.getElementById('enable-home');
  const clipboard = document.getElementById('enable-clipboard');
  const autoplay = document.getElementById('enable-media-autoplay');
  const snippets = document.getElementById('enable-quick-snippets');
  if (home) home.checked = data.enable_home !== false;
  if (clipboard) clipboard.checked = data[ENABLE_CLIPBOARD_KEY] !== false;
  if (autoplay) autoplay.checked = Boolean(data[ENABLE_MEDIA_AUTOPLAY_KEY]);
  if (snippets) snippets.checked = data[ENABLE_QUICK_SNIPPETS_KEY] !== false;
}

document.getElementById('lang-select')?.addEventListener('change', async (e) => {
  const nextLanguage = normalizeLanguageOptions(e.target.value);
  applyPopupLanguage(nextLanguage);
  await store.set({ language: nextLanguage });
  showToast(getPopupCopy().toasts.languageSaved);
});

document.getElementById('enable-home')?.addEventListener('change', async (e) => {
  await store.set({ enable_home: e.target.checked });
  showToast(e.target.checked ? getPopupCopy().toasts.homeOn : getPopupCopy().toasts.homeOff);
});

document.getElementById('enable-clipboard')?.addEventListener('change', async (e) => {
  await store.set({ [ENABLE_CLIPBOARD_KEY]: e.target.checked });
  showToast(e.target.checked ? getPopupCopy().toasts.clipboardOn : getPopupCopy().toasts.clipboardOff);
});

document.getElementById('enable-media-autoplay')?.addEventListener('change', async (e) => {
  await store.set({ [ENABLE_MEDIA_AUTOPLAY_KEY]: e.target.checked });
  showToast(e.target.checked ? getPopupCopy().toasts.autoplayOn : getPopupCopy().toasts.autoplayOff);
});

document.getElementById('enable-quick-snippets')?.addEventListener('change', async (e) => {
  await store.set({ [ENABLE_QUICK_SNIPPETS_KEY]: e.target.checked });
  showToast(e.target.checked ? getPopupCopy().toasts.snippetsOn : getPopupCopy().toasts.snippetsOff);
});

function getBackupFileName() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `offiqa-backup-${stamp}.json`;
}

async function exportOffiqaBackup() {
  const data = await chrome.storage.local.get(null);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = getBackupFileName();
  a.click();
  URL.revokeObjectURL(url);
  showToast(getPopupCopy().toasts.backupExported || 'Backup exported');
}

async function restoreOffiqaBackup(file) {
  if (!file) return;
  const text = await file.text();
  const data = JSON.parse(text);
  await chrome.storage.local.set(data);
  showToast(getPopupCopy().toasts.backupRestored || 'Backup restored');
  await loadSettings();
}

document.getElementById('btn-backup-export')?.addEventListener('click', exportOffiqaBackup);
document.getElementById('btn-backup-restore')?.addEventListener('click', () => document.getElementById('backup-restore-input')?.click());
document.getElementById('backup-restore-input')?.addEventListener('change', async (event) => {
  await restoreOffiqaBackup(event.target.files?.[0]);
  event.target.value = '';
});

document.getElementById('btn-reset-all')?.addEventListener('click', async () => {
  if (!confirm(getPopupCopy().confirmReset)) return;
  await chrome.storage.local.clear();
  applyPopupLanguage('en');
  showToast(getPopupCopy().toasts.resetDone);
});
