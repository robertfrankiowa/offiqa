(() => {
  if (window.__offiqaQuickNoteOverlayLoaded) return;
  window.__offiqaQuickNoteOverlayLoaded = true;

  const ROOT_ID = 'offiqa-quick-note-overlay-root';
  let previousHtmlOverflow = '';
  let previousBodyOverflow = '';
  let escapeHandler = null;
  let lastHotkeySentAt = 0;

  function getRoot() {
    return document.getElementById(ROOT_ID);
  }

  function getPopupUrl() {
    const url = new URL(chrome.runtime.getURL('quick-note-popup/quick-note-popup.html'));
    url.searchParams.set('embedded', '1');
    url.searchParams.set('pageTitle', document.title || '');
    url.searchParams.set('pageUrl', location.href || '');
    return url.toString();
  }

  function restorePageScroll() {
    document.documentElement.style.overflow = previousHtmlOverflow;
    if (document.body) {
      document.body.style.overflow = previousBodyOverflow;
    }
  }

  function closeOverlay(reason = 'closed') {
    const root = getRoot();
    if (!root) return false;

    if (escapeHandler) {
      document.removeEventListener('keydown', escapeHandler, true);
      escapeHandler = null;
    }

    restorePageScroll();
    root.remove();

    try {
      chrome.runtime.sendMessage({
        type: 'offiqa:quick-note-overlay-state',
        active: false,
        reason
      });
    } catch {
      // Ignore background shutdown / navigation races.
    }

    return true;
  }

  function notifyHotkeyHandled(reason) {
    try {
      chrome.runtime.sendMessage({
        type: 'offiqa:quick-note-hotkey-local-handled',
        reason
      });
    } catch {
      // Ignore background shutdown / navigation races.
    }
  }

  function buildOverlay(url) {
    previousHtmlOverflow = document.documentElement.style.overflow || '';
    previousBodyOverflow = document.body?.style.overflow || '';
    document.documentElement.style.overflow = 'hidden';
    if (document.body) {
      document.body.style.overflow = 'hidden';
    }

    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.style.all = 'initial';
    root.style.position = 'fixed';
    root.style.inset = '0';
    root.style.zIndex = '2147483647';

    const shadow = root.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
        }

        .overlay {
          position: fixed;
          inset: 0;
          display: grid;
          place-items: center;
          padding: 24px;
          background: rgba(10, 14, 22, 0.58);
          backdrop-filter: blur(7px);
          -webkit-backdrop-filter: blur(7px);
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .modal {
          position: relative;
          width: min(620px, calc(100vw - 32px));
          height: min(680px, calc(100vh - 48px));
          overflow: hidden;
          border: 1px solid rgba(15, 23, 42, 0.1);
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.98);
          box-shadow: 0 28px 80px rgba(0, 0, 0, 0.34);
        }

        .frame {
          width: 100%;
          height: 100%;
          border: 0;
          border-radius: inherit;
          background: #fff;
        }

        .close {
          position: fixed;
          top: 18px;
          right: 18px;
          z-index: 2;
          width: 46px;
          height: 46px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 999px;
          background: rgba(18, 24, 33, 0.88);
          color: #fff;
          font-size: 24px;
          line-height: 1;
          cursor: pointer;
          box-shadow: 0 16px 36px rgba(0, 0, 0, 0.22);
        }

        .close:hover {
          background: rgba(15, 23, 42, 0.96);
        }

        .close:focus-visible {
          outline: 3px solid rgba(59, 130, 246, 0.3);
          outline-offset: 2px;
        }

        @media (max-width: 640px) {
          .overlay {
            padding: 10px;
          }

          .modal {
            width: min(100vw - 24px, 620px);
            height: min(100vh - 24px, 680px);
          }
        }
      </style>
      <div class="overlay">
        <div class="modal" role="dialog" aria-modal="true" aria-label="Offiqa quick note">
          <button type="button" class="close" aria-label="Đóng">&times;</button>
          <iframe class="frame" src="${url}"></iframe>
        </div>
      </div>
    `;

    const overlay = shadow.querySelector('.overlay');
    const closeButton = shadow.querySelector('.close');

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        closeOverlay('closed_by_backdrop');
      }
    });

    closeButton.addEventListener('click', () => {
      closeOverlay('closed_by_button');
    });

    escapeHandler = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      closeOverlay('closed_by_escape');
    };
    document.addEventListener('keydown', escapeHandler, true);

    (document.body || document.documentElement).appendChild(root);
  }

  function handleQuickNoteHotkey(event) {
    const key = (event.key || '').toLowerCase();
    const code = event.code || '';
    const isAltN = event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && (key === 'n' || code === 'KeyN');
    if (!isAltN) return;

    const now = Date.now();
    if (now - lastHotkeySentAt < 350) return;
    lastHotkeySentAt = now;

    event.preventDefault();
    event.stopPropagation();

    if (getRoot()) {
      closeOverlay('closed_by_shortcut');
      notifyHotkeyHandled('closed_by_shortcut');
      return;
    }

    try {
      buildOverlay(getPopupUrl());
      notifyHotkeyHandled('overlay_opened');
    } catch {
      try {
        chrome.runtime.sendMessage({
          type: 'offiqa:quick-note-hotkey',
          pageTitle: document.title || '',
          pageUrl: location.href || ''
        });
      } catch {
        // Ignore navigation/background races.
      }
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== getRoot()?.shadowRoot?.querySelector('.frame')?.contentWindow) return;
    if (event.data?.type === 'offiqa:quick-note-close') {
      closeOverlay(event.data.reason || 'closed_by_iframe');
    }
  });

  document.addEventListener('keydown', handleQuickNoteHotkey, true);

  if (chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== 'offiqa:quick-note-overlay-toggle') return;
      if (message.onlyVisible && document.visibilityState !== 'visible') {
        sendResponse({ handled: false, active: false, reason: 'not_visible' });
        return;
      }

      if (getRoot()) {
        closeOverlay('closed_by_shortcut');
        sendResponse({ handled: true, active: false, reason: 'closed_by_shortcut' });
        return;
      }

      buildOverlay(message.url || getPopupUrl());
      sendResponse({ handled: true, active: true, reason: 'overlay_opened' });
    });
  }
})();
