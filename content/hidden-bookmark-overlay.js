(() => {
  if (window.__offiqaHiddenBookmarkOverlayLoaded) return;
  window.__offiqaHiddenBookmarkOverlayLoaded = true;

  const ROOT_ID = 'offiqa-hidden-bookmark-overlay-root';
  const REQUEST_KEY = 'hidden_bookmark_overlay_request';
  let currentLanguage = 'en';

  let previousHtmlOverflow = '';
  let previousBodyOverflow = '';
  let escapeHandler = null;
  let lastHotkeySentAt = 0;

  function normalizeLanguage(lang) {
    return ['en', 'es', 'vi'].includes(lang) ? lang : 'en';
  }

  function getOverlayCopy() {
    return (globalThis.OFFIQA_I18N_PACKS || {})[currentLanguage]?.content?.hiddenBookmark
      || (globalThis.OFFIQA_I18N_PACKS || {}).en?.content?.hiddenBookmark
      || { ariaLabel: 'Offiqa hidden bookmarks', close: 'Close' };
  }

  function getRoot() {
    return document.getElementById(ROOT_ID);
  }

  function notifyOverlayClosed(reason) {
    try {
      chrome.runtime.sendMessage({
        type: 'offiqa:hidden-bookmark-overlay-state',
        active: false,
        reason
      });
    } catch {
      // Ignore background shutdown / navigation races.
    }
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
    notifyOverlayClosed(reason);
    return true;
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
    const copy = getOverlayCopy();
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
          border: none;
          border-radius: inherit;
          background: white;
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
          border-radius: 50%;
          background: rgba(18, 24, 33, 0.88);
          color: #fff;
          font-size: 24px;
          line-height: 1;
          cursor: pointer;
          box-shadow: 0 16px 36px rgba(0, 0, 0, 0.22);
          transition: transform 0.15s ease, color 0.15s ease, background 0.15s ease, border-color 0.15s ease;
          outline: none;
        }

        .close:hover {
          transform: translateY(-1px);
          color: #fff;
          background: rgba(15, 23, 42, 0.96);
        }

        .close:focus-visible {
          border-color: rgba(59, 130, 246, 0.4);
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.14);
        }

        @media (max-width: 640px) {
          .overlay {
            padding: 12px;
          }

          .modal {
            width: min(100vw - 24px, 620px);
            height: min(100vh - 24px, 680px);
          }
        }
      </style>
      <div class="overlay">
        <div class="modal" role="dialog" aria-modal="true" aria-label="${copy.ariaLabel}">
          <button type="button" class="close" aria-label="${copy.close}">&times;</button>
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

  function handleAltBHotkey(event) {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if ((event.key || '').toLowerCase() !== 'b') return;

    const now = Date.now();
    if (now - lastHotkeySentAt < 350) return;
    lastHotkeySentAt = now;

    event.preventDefault();
    event.stopPropagation();

    if (getRoot()) {
      closeOverlay('closed_by_shortcut');
      try {
        chrome.runtime.sendMessage({
          type: 'offiqa:hidden-bookmark-hotkey-local-handled',
          reason: 'closed_by_shortcut'
        });
      } catch {
        // Ignore navigation/background races.
      }
      return;
    }

    try {
      buildOverlay(chrome.runtime.getURL('popup/popup.html?shortcut=hidden-bookmarks&embedded=1#bookmarks'));
      chrome.runtime.sendMessage({
        type: 'offiqa:hidden-bookmark-hotkey-local-handled',
        reason: 'overlay_opened'
      });
    } catch {
      try {
        chrome.runtime.sendMessage({ type: 'offiqa:hidden-bookmark-hotkey' });
      } catch {
        // Ignore navigation/background races.
      }
    }
  }

  chrome.storage.local.get(['language'], (data) => {
    currentLanguage = normalizeLanguage(data.language);
  });

  document.addEventListener('keydown', handleAltBHotkey, true);

  if (chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== 'offiqa:hidden-bookmark-overlay-toggle') return;
      if (message.onlyVisible && document.visibilityState !== 'visible') {
        sendResponse({ handled: false, active: false, reason: 'not_visible' });
        return;
      }

      if (getRoot()) {
        closeOverlay('closed_by_shortcut');
        sendResponse({ handled: true, active: false, reason: 'closed_by_shortcut' });
        return;
      }

      buildOverlay(message.url);
      sendResponse({ handled: true, active: true, reason: 'overlay_opened' });
    });
  }

  function handleStorageOverlayRequest(request) {
    if (!request || request.type !== 'toggle') return;
    if (request.extensionPageOnly && location.protocol !== 'chrome-extension:') return;
    if (document.visibilityState !== 'visible') return;

    if (getRoot()) {
      closeOverlay('closed_by_shortcut');
      return;
    }

    buildOverlay(request.url);
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.language) {
      currentLanguage = normalizeLanguage(changes.language.newValue);
    }
    if (changes[REQUEST_KEY]) {
      handleStorageOverlayRequest(changes[REQUEST_KEY].newValue);
    }
  });
})();
