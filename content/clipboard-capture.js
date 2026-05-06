(() => {
  if (window.__offiqaClipboardCaptureInstalled) return;
  window.__offiqaClipboardCaptureInstalled = true;

  const ENABLE_CLIPBOARD_KEY = 'enable_clipboard';
  let lastSignature = '';
  let lastCopiedAt = 0;
  let clipboardEnabled = true;

  function isExtensionContextAlive() {
    return Boolean(globalThis.chrome?.runtime?.id);
  }

  function safeReadClipboardSetting() {
    if (!isExtensionContextAlive() || !chrome.storage?.local?.get) return;
    try {
      chrome.storage.local.get([ENABLE_CLIPBOARD_KEY], (data) => {
        if (!isExtensionContextAlive()) return;
        clipboardEnabled = data?.[ENABLE_CLIPBOARD_KEY] !== false;
      });
    } catch {
      clipboardEnabled = false;
    }
  }

  function safeWatchClipboardSetting() {
    if (!isExtensionContextAlive() || !chrome.storage?.onChanged?.addListener) return;
    try {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (!isExtensionContextAlive()) return;
        if (areaName !== 'local' || !changes[ENABLE_CLIPBOARD_KEY]) return;
        clipboardEnabled = changes[ENABLE_CLIPBOARD_KEY].newValue !== false;
      });
    } catch {
      clipboardEnabled = false;
    }
  }

  function safeSendMessage(message) {
    if (!isExtensionContextAlive() || !chrome.runtime?.sendMessage) return;
    try {
      chrome.runtime.sendMessage(message, () => {
        try {
          void chrome.runtime.lastError;
        } catch {
          // Ignore stale extension contexts after reload/update.
        }
      });
    } catch {
      clipboardEnabled = false;
    }
  }

  safeReadClipboardSetting();
  safeWatchClipboardSetting();

  function getCopiedText(event) {
    const clipboardText = event?.clipboardData?.getData('text/plain');
    if (clipboardText) return clipboardText;

    const selection = window.getSelection?.();
    return selection ? selection.toString() : '';
  }

  document.addEventListener('copy', (event) => {
    if (!clipboardEnabled) return;

    const text = getCopiedText(event).trim();
    if (!text) return;

    const copiedAt = Date.now();
    const signature = `${window.location.href}::${text}`;
    if (signature === lastSignature && copiedAt - lastCopiedAt < 800) {
      return;
    }

    lastSignature = signature;
    lastCopiedAt = copiedAt;

    safeSendMessage({
      type: 'offiqa:clipboard-capture',
      payload: {
        text,
        url: window.location.href,
        title: document.title || '',
        created: copiedAt,
        source: 'auto'
      }
    });
  }, true);
})();
