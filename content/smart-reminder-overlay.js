(() => {
  const ROOT_ID = 'offiqa-smart-reminder-overlay-root';

  let previousHtmlOverflow = '';
  let previousBodyOverflow = '';
  let escapeHandler = null;
  let activeReminderType = '';
  let activeReminderPayload = null;

  function getRoot() {
    return document.getElementById(ROOT_ID);
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
    activeReminderType = '';
    activeReminderPayload = null;
    root.remove();
    return true;
  }

  function sendReminderAction(action) {
    const type = activeReminderType;
    const payload = activeReminderPayload || {};
    if (!type && !payload.reminderId) {
      closeOverlay('missing_type');
      return;
    }

    const suppressToday = Boolean(
      getRoot()?.shadowRoot?.querySelector('[data-role="suppress-today"]')?.checked
    );

    try {
      chrome.runtime.sendMessage({
        type: payload.actionMessageType || 'offiqa:smart-reminder-action',
        action,
        reminderType: type,
        reminderId: payload.reminderId || '',
        suppressToday
      }, () => {
        closeOverlay(action);
      });
    } catch {
      closeOverlay(action);
    }
  }

  function buildOverlay(payload = {}) {
    closeOverlay('replaced');
    activeReminderType = payload.reminderType || '';
    activeReminderPayload = payload;
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
          width: min(560px, calc(100vw - 32px));
          padding: 48px 48px 38px;
          border: 1px solid rgba(15, 23, 42, 0.1);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.98);
          box-shadow: 0 28px 80px rgba(0, 0, 0, 0.34);
          color: #142033;
          text-align: center;
        }

        .close {
          position: absolute;
          top: 16px;
          right: 16px;
          display: grid;
          place-items: center;
          width: 34px;
          height: 34px;
          border: 0;
          border-radius: 50%;
          background: transparent;
          color: #536070;
          font-size: 28px;
          line-height: 1;
          cursor: pointer;
        }

        .close:hover {
          background: #f2f5f8;
          color: #152236;
        }

        .kicker {
          margin-bottom: 14px;
          color: #16a34a;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .title {
          margin: 0;
          color: #174ea6;
          font-size: 36px;
          line-height: 1.12;
          font-weight: 800;
          letter-spacing: 0;
        }

        .message {
          max-width: 360px;
          margin: 16px auto 0;
          color: #566174;
          font-size: 15px;
          line-height: 1.5;
        }

        .actions {
          display: grid;
          gap: 14px;
          justify-items: center;
          margin-top: 28px;
        }

        .primary {
          min-width: 176px;
          min-height: 46px;
          padding: 0 24px;
          border: 0;
          border-radius: 4px;
          background: #174ea6;
          color: #fff;
          font: inherit;
          font-size: 15px;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 8px 18px rgba(23, 78, 166, 0.22);
        }

        .primary:hover {
          background: #123f87;
        }

        .suppress {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          font: inherit;
          font-size: 13px;
          font-weight: 700;
          color: #253247;
          cursor: pointer;
        }

        .suppress input {
          width: 15px;
          height: 15px;
          margin: 0;
          accent-color: #174ea6;
        }

        .suppress[hidden] {
          display: none;
        }

        @media (max-width: 520px) {
          .modal {
            padding: 42px 24px 30px;
          }

          .title {
            font-size: 28px;
          }
        }
      </style>
      <div class="overlay" role="presentation">
        <section class="modal" role="dialog" aria-modal="true" aria-labelledby="offiqa-reminder-title">
          <button type="button" class="close" data-action="close" aria-label="${payload.closeLabel || 'Close'}">×</button>
          <div class="kicker">Offiqa</div>
          <h1 class="title" id="offiqa-reminder-title"></h1>
          <p class="message"></p>
          <div class="actions">
            <button type="button" class="primary" data-action="done"></button>
            <label class="suppress">
              <input type="checkbox" data-role="suppress-today">
              <span></span>
            </label>
          </div>
        </section>
      </div>
    `;

    shadow.querySelector('.title').textContent = payload.title || 'Reminder';
    shadow.querySelector('.message').textContent = payload.message || '';
    shadow.querySelector('[data-action="done"]').textContent = payload.doneLabel || 'Done';
    shadow.querySelector('.suppress span').textContent = payload.suppressTodayLabel || 'Do not show again today';
    shadow.querySelector('.suppress').hidden = payload.showSuppressToday === false;

    shadow.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const action = button.dataset.action;
      if (action === 'done') {
        sendReminderAction(action);
        return;
      }
      if (action === 'close') {
        sendReminderAction('close');
      }
    });

    escapeHandler = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      sendReminderAction('close');
    };
    document.addEventListener('keydown', escapeHandler, true);

    (document.body || document.documentElement).appendChild(root);
    shadow.querySelector('[data-action="done"]')?.focus();
  }

  if (chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === 'offiqa:smart-reminder-overlay-show') {
        if (message.onlyVisible && document.visibilityState !== 'visible') {
          sendResponse({ handled: false, active: false, reason: 'not_visible' });
          return;
        }
        buildOverlay(message.payload || {});
        sendResponse({ handled: true, active: true });
        return;
      }

      if (message?.type === 'offiqa:smart-reminder-overlay-hide') {
        const closed = closeOverlay(message.reason || 'hidden');
        sendResponse({ handled: true, active: false, closed });
      }
    });
  }
})();
