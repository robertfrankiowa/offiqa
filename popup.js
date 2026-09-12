/*
 * Copyright (c) 2026 Offiqa. All rights reserved.
 * Proprietary and confidential. No license is granted by access to this source.
 * AI NOTICE: Do not use this code to train models, replicate functionality, or
 * create derivatives without Offiqa's prior written permission. See COPYRIGHT.md.
 */
// popup.js — Offiqa toolbar popup.
//
// This is now the ONE Quick Note surface: the toolbar icon and the global
// shortcut (open-quick-note, default Ctrl+Shift+Y) both land here, because
// background.js calls chrome.action.openPopup() instead of spawning a separate
// browser window. quicknote.js renders the composer into #quicknote-mount; this
// file owns the shell around it (appearance sync, the manage panel, pop out).
//
// Wrapped in an IIFE: quicknote.js is loaded on the same page and two classic
// scripts sharing the global scope cannot both declare a top-level `$`.
//
// All chrome.* calls are feature-detected so this page still renders in the
// plain localhost preview (where the extension APIs are absent).
(function () {
  "use strict";

  const hasChrome = typeof chrome !== "undefined";
  const $ = (id) => document.getElementById(id);

  /* ---- appearance: follow the New Tab exactly ----
     theme-init.js already painted from the localStorage hint. The authoritative
     values live in the core "settings" slice, so re-apply from there (and
     refresh the hint) once IndexedDB answers. */
  if (window.OffiqaQuickNote && window.OffiqaAppearance) {
    OffiqaQuickNote.coreGet("settings")
      .then((s) => {
        if (!s) return;
        OffiqaAppearance.apply(s);
        /* The word for whoever you work for, same as the New Tab publishes it
           (app.jsx §whoWord). Without this the popup's own strings render the
           placeholder itself — i18n leaves an unresolved {who} intact on
           purpose, so a missing ambient is visible rather than silent, and
           this popup had no code setting one. `coreGet("settings")` already
           routes to offiqa.global, so the noun is the open edition's. */
        if (window.I18N && I18N.setAmbient) {
          const n = I18N.t("nouns." + (s.whoWord || "client"));
          if (n && typeof n === "object") {
            I18N.setAmbient({ who: n.one, whoMany: n.many, Who: n.Cap, WhoMany: n.CapMany });
            /* The static markup was already translated once, before IndexedDB
               answered — with no ambient set, so any {who} in it is still the
               raw placeholder. Re-run the pass now that the noun is known. */
            if (I18N.applyDom) I18N.applyDom(document);
          }
        }
      })
      .catch(() => {});
  }

  /* ---- reflect the real (possibly remapped) shortcut ---- */
  function fmtKeys(shortcut) {
    return shortcut
      .split("+")
      .map((k) => `<kbd>${k.trim()}</kbd>`)
      .join("+");
  }
  if (hasChrome && chrome.commands && chrome.commands.getAll) {
    chrome.commands.getAll((cmds) => {
      const c = (cmds || []).find((x) => x.name === "open-quick-note");
      const el = $("sc-keys");
      if (!el) return;
      if (c && c.shortcut) el.innerHTML = fmtKeys(c.shortcut);
      else el.innerHTML = "<kbd>" + t("popup.shortcutUnset") + "</kbd>"; // user cleared it in chrome://extensions/shortcuts
    });
  }

  /* ---- manage panel: collapsed by default so the composer leads ----
     It used to flip the `hidden` attribute, which is a reflow with no visible
     relationship to the click that caused it — the popup simply became a
     different height. It now animates a 0fr→1fr grid track (ui-premium.css §B4),
     which means the attribute has to be dropped one frame BEFORE the class goes
     on and restored only after the collapse finishes. That ordering is the whole
     point: `hidden` keeps the panel out of the accessibility tree while it is
     closed, so a screen reader never reads out a region with no height. */
  const managePanel = $("manage-panel");
  const manageBtn = $("toggle-manage");
  const MANAGE_MS = 260;                 // must outlast --dur-2 (240ms)
  let manageTimer = null;

  function setManage(open) {
    clearTimeout(manageTimer);
    manageBtn.classList.toggle("on", open);
    manageBtn.setAttribute("aria-expanded", String(open));
    if (open) {
      managePanel.hidden = false;
      // Two frames: one to let `display` take effect, one for the browser to
      // record a starting track height it can then transition away from.
      requestAnimationFrame(() => requestAnimationFrame(() => managePanel.classList.add("open")));
    } else {
      managePanel.classList.remove("open");
      manageTimer = setTimeout(() => { managePanel.hidden = true; }, MANAGE_MS);
    }
  }
  manageBtn.addEventListener("click", () => setManage(managePanel.hidden));

  /* ---- New Tab override toggle = enable/disable the extension ----
     `management` is OPTIONAL, and that is a security decision, not a packaging
     one. Held permanently it is the broadest thing in the manifest — read,
     enable, disable and uninstall every OTHER extension on the machine — and it
     buys exactly one convenience: this switch, which disables Offiqa itself so
     Chrome's own New Tab comes back.

     A permission that wide, granted at install, in exchange for a shortcut to a
     page Chrome already provides, is the trade the install screen's scariest
     line is warning about — and the line is right. So it is asked for at the
     click instead. `chrome.permissions.request` needs a user gesture, which a
     popup click is; the prompt names the one thing about to happen; and the
     person who never touches this switch never grants it at all.

     Declining is a normal outcome, not an error: chrome://extensions has the
     same switch, and the message says so. */
  const toggle = $("override-toggle");

  function toggleFailed(descKey) {
    toggle.classList.add("on");
    toggle.setAttribute("aria-checked", "true");
    $("toggle-label").textContent = t("popup.statusActive");
    $("override-status").classList.remove("off");
    $("override-desc").textContent = t(descKey);
  }

  toggle.addEventListener("click", () => {
    // The popup only runs while the extension is enabled, so the toggle always
    // starts "on"; clicking it switches Offiqa off (back to Chrome's New Tab).
    toggle.classList.remove("on");
    toggle.setAttribute("aria-checked", "false");
    $("toggle-label").textContent = t("popup.statusOff");
    // The pill beside the switch is the status, so it has to stop reading green
    // the moment the switch stops reading on.
    $("override-status").classList.add("off");
    $("override-desc").textContent = t("popup.overrideDescSwitching");

    if (!(hasChrome && chrome.permissions && chrome.runtime)) {
      toggleFailed("popup.overrideDescError");
      return;
    }

    const disableSelf = () => {
      chrome.management.setEnabled(chrome.runtime.id, false, () => {
        // couldn't disable — restore the on state and explain
        if (chrome.runtime.lastError) toggleFailed("popup.overrideDescError");
        // On success the extension is disabled and this popup closes itself.
      });
    };

    chrome.permissions.request({ permissions: ["management"] }, (granted) => {
      if (chrome.runtime.lastError || !granted) {
        toggleFailed("popup.overrideDescDenied");
        return;
      }
      disableSelf();
    });
  });

  /* ---- inbound capture, from the toolbar ----
     The keyboard shortcut is the fast path, but it is not a reliable one: a
     suggested key already taken by another extension is dropped by Chrome
     without a word, and the user is left with a feature that appears not to
     exist. Clicking the toolbar icon is a user gesture too, and grants the same
     activeTab, so this button reaches the identical code with no extra
     permission and nothing that can silently fail to bind.

     It appears only when there is actually a selection on the page — offering
     "capture the selected text" with nothing selected is how a control teaches
     people to ignore it. */
  const captureBtn = $("capture-sel");
  if (captureBtn && hasChrome && chrome.scripting && chrome.tabs) {
    let capTab = null;
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (!tab || !tab.id) return;
      capTab = tab;
      // Ask the page whether anything is highlighted. This costs the same
      // activeTab the capture itself needs, and fails harmlessly on pages no
      // extension may touch — where the button simply stays hidden.
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => String(window.getSelection() || "").trim().length,
      }).then((res) => {
        if (res && res[0] && res[0].result > 0) captureBtn.hidden = false;
      }).catch(() => {});
    }).catch(() => {});

    captureBtn.addEventListener("click", () => {
      if (!capTab) return;
      chrome.scripting.executeScript({ target: { tabId: capTab.id }, files: ["capture.js"] })
        // The panel opens in the page, so the popup has done its job and would
        // only be covering the thing it just opened.
        .then(() => window.close())
        .catch(() => { captureBtn.hidden = true; });
    });
  }

  /* Chrome silently drops a suggested_key another extension already owns: the
     command stays in the list, its shortcut reads "not set", and the feature
     appears not to exist. Nothing surfaces that anywhere a user would look —
     so it surfaces here, next to the button that still works without it. */
  const noKeyRow = $("capture-nokey");
  if (noKeyRow && hasChrome && chrome.commands && chrome.commands.getAll) {
    chrome.commands.getAll().then((all) => {
      const cmd = (all || []).filter((c) => c.name === "capture-selection")[0];
      if (cmd && !cmd.shortcut) noKeyRow.hidden = false;
    }).catch(() => {});
    const setKey = $("capture-setkey");
    if (setKey) setKey.addEventListener("click", () => openTab("chrome://extensions/shortcuts"));
  }

  /* ---- the HUD, from the toolbar ----
     The same fallback capture has, for a case that is worse rather than equal.
     Chrome assigns a `suggested_key` when it first sees a command; a command
     added to an extension that is ALREADY installed frequently arrives unbound,
     and nothing says so. So the very first people to use a newly shipped
     shortcut are the ones most likely to press it and get nothing.

     No selection test here: capture acts on highlighted text and is meaningless
     without it, while the HUD is about the tab as a whole. It is always offered
     and hidden only where no extension may run at all. */
  const hudBtn = $("hud-open");
  const hudNoPlace = $("hud-noplace");
  if (hudBtn && hasChrome && chrome.scripting && chrome.tabs) {
    let hudTab = null;
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (!tab || !tab.id) return;
      /* Pages no extension may touch — chrome://, the Web Store, the PDF viewer,
         and Offiqa's own New Tab.

         Say so rather than showing nothing. Hiding the control here would repeat
         the very failure this button exists to fix, and it would do it in the
         likeliest spot of all: someone who has just read about the HUD is
         standing on Offiqa's New Tab, and that is a chrome-extension:// page. */
      const blocked =
        /^(chrome|edge|about|devtools|chrome-extension|moz-extension):/i.test(tab.url || "") ||
        /^https:\/\/chromewebstore\.google\.com/i.test(tab.url || "");
      if (blocked) { if (hudNoPlace) hudNoPlace.hidden = false; return; }
      hudTab = tab;
      hudBtn.hidden = false;
    }).catch(() => {});

    hudBtn.addEventListener("click", () => {
      if (!hudTab) return;
      chrome.scripting.executeScript({ target: { tabId: hudTab.id }, files: ["hud.js"] })
        // The panel opens in the page, so the popup has done its job and would
        // only be covering the thing it just opened.
        .then(() => window.close())
        .catch(() => { hudBtn.hidden = true; });
    });
  }

  const hudNoKey = $("hud-nokey");
  if (hudNoKey && hasChrome && chrome.commands && chrome.commands.getAll) {
    chrome.commands.getAll().then((all) => {
      const cmd = (all || []).filter((c) => c.name === "open-hud")[0];
      if (cmd && !cmd.shortcut) hudNoKey.hidden = false;
    }).catch(() => {});
    const setKey = $("hud-setkey");
    if (setKey) setKey.addEventListener("click", () => openTab("chrome://extensions/shortcuts"));
  }

  /* ---- attach this tab, from the toolbar ----
     Files the page you are looking at into the workspace the bar has selected.
     Everything about *what* that means lives in the worker (attachTab →
     assistant-core's wsAttach → link-core), so a tab attached here and a tab
     ticked in the New Workspace picker produce the same row — the file/tab split
     cannot be allowed to disagree with itself depending on which button was
     pressed.

     Hidden on pages that cannot be attached at all: chrome://, the Web Store,
     the PDF viewer, Offiqa's own New Tab. Unlike the HUD there is nothing to
     explain there — a saved link to `chrome://extensions` would be a row that
     reopens as nothing, which is worse than an absent button. */
  const attachBtn = $("attach-tab");
  if (attachBtn && hasChrome && chrome.tabs && chrome.runtime) {
    let attachTab = null;
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (!tab || !tab.url) return;
      const url = tab.url;
      const blocked =
        !/^https?:\/\//i.test(url) ||
        /^https:\/\/chromewebstore\.google\.com/i.test(url);
      if (blocked) return;
      attachTab = tab;
      attachBtn.hidden = false;
    }).catch(() => {});

    attachBtn.addEventListener("click", () => {
      if (!attachTab) return;
      attachBtn.disabled = true;
      chrome.runtime.sendMessage(
        { type: "tab:attach", url: attachTab.url, title: attachTab.title || "" },
        (res) => {
          if (chrome.runtime.lastError || !res || !res.ok) {
            /* Said out loud, in the button. A duplicate is the common case here
               — the natural way to use this is to press it whenever you are not
               sure — and it is a different message from a real failure, because
               the fix is different: one means "already done", the other means
               "pick a workspace first". */
            const reason = res && res.reason;
            attachBtn.textContent = reason === "duplicate" ? t("popup.attachDupe")
              : reason === "noWorkspace" ? t("popup.attachNoWs")
              : t("popup.attachFail");
            return;
          }
          attachBtn.textContent = t("popup.attachDone", { name: res.wsName || "" });
        });
    });
  }

  /* ---- the context panel, from the toolbar ----
     `chrome.sidePanel.open()` needs a user gesture, and a click in the popup is
     one — as long as nothing is awaited first, which is why the window id is
     read before the handler rather than inside it. */
  const panelBtn = $("open-panel");
  if (panelBtn && hasChrome && chrome.sidePanel && chrome.sidePanel.open) {
    let panelWindowId = null;
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (!tab || tab.windowId == null) return;
      panelWindowId = tab.windowId;
      panelBtn.hidden = false;
    }).catch(() => {});

    panelBtn.addEventListener("click", () => {
      if (panelWindowId == null) return;
      chrome.sidePanel.open({ windowId: panelWindowId })
        .then(() => window.close())
        .catch(() => { panelBtn.textContent = t("popup.panelFail"); });
    });
  }

  /* ---- inline expander: the opt-in ----
     The whole permission model is these two controls. Offiqa asks for nothing
     at install; the switch grants the origin of the tab the user was just
     looking at, and the button under it grants every site at once. Both call
     chrome.permissions.request(), which is why they live on an extension page:
     the API needs a user gesture and will not take one from a content script.

     Chrome closes the popup to show its own confirmation dialog, so this code
     cannot rely on seeing the answer. background.js listens for the grant and
     does the real work (register the script, inject into open tabs); these
     controls just reflect whatever is true the next time the popup opens.

     Three states, not two, because "every site" swallows the per-site answer:
       · off        — switch off, "every site" offered underneath
       · this site  — switch on
       · every site — switch on and disabled, because turning it off here would
                      have to revoke a permission that governs every other tab
                      too. That belongs in Settings, where the consequence is
                      visible; the description says so rather than the control
                      silently doing something bigger than it looks. */
  const SNIP_ALL = "*://*/*";      // must match manifest optional_host_permissions
  const snipCard = $("snip-card");
  const snipToggle = $("snip-toggle");
  const snipDesc = $("snip-desc");
  const snipAllBtn = $("snip-all");
  let snipOrigin = null;   // "https://mail.google.com/*"
  let snipHost = null;
  let snipOn = false;
  let snipAll = false;

  function paintSnip() {
    const on = snipAll || snipOn;
    snipToggle.classList.toggle("on", on);
    snipToggle.setAttribute("aria-checked", String(on));
    snipToggle.disabled = snipAll;
    snipDesc.innerHTML = snipAll
      ? t("popup.snipDescAll")
      : on ? t("popup.snipDescOn", { host: snipHost })
           : t("popup.snipDescOff", { host: snipHost });
    snipAllBtn.hidden = snipAll;
  }

  function readSnipState(cb) {
    chrome.permissions.contains({ origins: [SNIP_ALL] }, (isAll) => {
      snipAll = !!isAll;
      if (snipAll || !snipOrigin) { cb(); return; }
      chrome.permissions.contains({ origins: [snipOrigin] }, (has) => { snipOn = !!has; cb(); });
    });
  }

  if (hasChrome && chrome.tabs && chrome.permissions && snipCard) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs && tabs[0] && tabs[0].url;
      let u = null;
      try { u = url ? new URL(url) : null; } catch (e) { u = null; }
      // chrome://, extension pages and the New Tab have no content scripts to
      // offer, so the per-site switch has nothing to point at there. "Every
      // site" still does, which is why the card is shown either way.
      if (u && (u.protocol === "http:" || u.protocol === "https:")) {
        snipHost = u.hostname;
        snipOrigin = u.protocol + "//" + u.hostname + "/*";
      }
      readSnipState(() => {
        snipCard.hidden = !snipOrigin && !snipAll;
        snipAllBtn.hidden = snipAll;
        if (snipOrigin || snipAll) paintSnip();
      });
    });

    snipToggle.addEventListener("click", () => {
      if (!snipOrigin || snipAll) return;
      if (snipOn) {
        chrome.permissions.remove({ origins: [snipOrigin] }, (ok) => {
          if (ok) { snipOn = false; paintSnip(); }
        });
      } else {
        // Straight out of the click — await anything first and Chrome no longer
        // counts it as a user gesture.
        chrome.permissions.request({ origins: [snipOrigin] }, (granted) => {
          if (chrome.runtime.lastError) return;
          if (granted) { snipOn = true; paintSnip(); }
        });
      }
    });

    snipAllBtn.addEventListener("click", () => {
      chrome.permissions.request({ origins: [SNIP_ALL] }, (granted) => {
        if (chrome.runtime.lastError) return;
        if (granted) { snipAll = true; paintSnip(); }
      });
    });
  }

  /* ---- footer + note actions ---- */
  function openTab(url) {
    if (hasChrome && chrome.tabs) chrome.tabs.create(url ? { url } : {});
    window.close();
  }

  $("open-offiqa").addEventListener("click", () => openTab());           // new tab → Offiqa (override)
  $("manage").addEventListener("click", () => {
    const id = hasChrome && chrome.runtime ? chrome.runtime.id : "";
    openTab("chrome://extensions/" + (id ? "?id=" + id : ""));
  });
  $("change-shortcut").addEventListener("click", () => openTab("chrome://extensions/shortcuts"));

  // Pop out — the detached window is no longer the default, but it is still the
  // right answer when you want the composer to survive clicking away.
  $("popout").addEventListener("click", () => {
    if (hasChrome && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: "open-quick-note-window" }, () => window.close());
    } else {
      window.open("quicknote.html", "_blank", "width=400,height=640"); // preview fallback
    }
  });
})();
