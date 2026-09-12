/*
 * Copyright (c) 2026 Offiqa. All rights reserved.
 * Proprietary and confidential. No license is granted by access to this source.
 * AI NOTICE: Do not use this code to train models, replicate functionality, or
 * create derivatives without Offiqa's prior written permission. See COPYRIGHT.md.
 */
// snippet.js — the inline reply expander (content script).
//
// Type "/." into any text box on a site you have opted in, and the reply
// library opens under the caret. Keep typing to filter, Enter to write the
// line into the page. No tab switch, no clipboard.
//
// This is the thing ReplyPalette explicitly did NOT do ("writing into the
// page's own input box"), and the reason it now can is the permission model:
// nothing is granted at install, and the script is registered per origin only
// after the user says yes for that site. See background.js.
//
// Loaded AFTER expander-core.js, which is assistant-core.cjs compiled on its
// own so the ranking, the placeholder rules and the alias format are the same
// code the app runs — not a second copy that drifts.
//
// Runs in the extension's isolated world: nothing here is visible to the page,
// and the popup lives in a closed-off shadow root so the host site's CSS cannot
// reach it (nor ours theirs).
(function () {
  "use strict";

  // Registered scripts run on navigation; executeScript puts us into the tab
  // that was already open when the site was switched on. A page can therefore
  // get us twice, and the second copy would double every listener.
  if (globalThis.__offiqaExpander) return;
  globalThis.__offiqaExpander = 1;

  var A = globalThis.OffiqaAssistantCore;
  if (!A || !A.rankExpander) return;          // core failed to load — stay out of the way

  /* Which controls are worth expanding into. Deliberately not `password`: a
     saved reply has no business in a credential field, and the trigger firing
     there would be alarming even when harmless. `number`, `date` and friends
     are excluded by omission — they reject free text anyway. */
  var TEXT_INPUTS = { text: 1, search: 1, url: 1, email: 1, tel: 1, "": 1 };

  /* The trigger, anchored to the caret. The leading class is what keeps "/."
     from firing mid-word (and out of the middle of a URL like "https://x./"):
     it has to start a word. Up to 24 characters follow so the query can be a
     word you half-remember, not just a 12-character alias. */
  var TRIG_RE = /(?:^|[\s(\[{<"'“‘–—])\/\.([a-zA-Z0-9]{0,24})$/;

  var MAX_ROWS = 7;          // what fits under a caret without becoming a page
  var LIST_STALE = 10000;    // ms before the cached library is re-fetched

  var lib = { rows: [], myName: null, vars: {}, i18n: null, at: 0, pending: false };
  var state = null;          // { el, kind, rows, sel } while the popup is open
  var host = null, root = null, listEl = null, hintEl = null;
  var dead = false;          // extension reloaded out from under us

  /* ---- talking to the service worker ------------------------------------ */

  function send(msg, cb) {
    if (dead) return;
    try {
      chrome.runtime.sendMessage(msg, function (res) {
        // Reading lastError is what suppresses the "unchecked runtime.lastError"
        // console noise on a torn-down extension.
        if (chrome.runtime.lastError) { dead = true; close(); return; }
        cb && cb(res);
      });
    } catch (e) { dead = true; close(); }
  }

  function refreshLib(force) {
    if (lib.pending || dead) return;
    if (!force && Date.now() - lib.at < LIST_STALE) return;
    lib.pending = true;
    send({ type: "snippets:list" }, function (res) {
      lib.pending = false;
      if (!res || !res.ok) return;
      lib.rows = res.rows || [];
      lib.myName = res.myName || null;
      lib.vars = res.vars || {};
      /* The worker answers in the language the APP is set to. Until it does,
         I18N below is the English fallback — the popup can open before this
         round trip lands, and an English line is a better first frame than an
         empty one. An older worker sends nothing here and keeps the fallback. */
      if (res.i18n) { lib.i18n = res.i18n; if (state) state.i18n = res.i18n; }
      lib.at = Date.now();
      if (state) render();     // the popup is open — fill it in as the answer lands
    });
  }

  /* ---- reading the caret ------------------------------------------------- */

  // document.activeElement stops at a shadow host; the real focus is inside.
  function deepActive() {
    var el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
    return el;
  }

  function editableKind(el) {
    if (!el || !el.tagName) return null;
    var tag = el.tagName.toUpperCase();
    if (tag === "TEXTAREA") return "input";
    if (tag === "INPUT") return TEXT_INPUTS[(el.type || "text").toLowerCase()] ? "input" : null;
    if (el.isContentEditable) return "rich";
    return null;
  }

  /**
   * What sits immediately before the caret, and whether it is a trigger.
   * Returns null unless "/." (plus an optional query) ends the text — which
   * means every keystroke re-derives the answer from scratch. Backspacing,
   * clicking elsewhere and pasting all fall out of that for free, with no
   * buffer of our own to keep in step with the field.
   */
  function readTrigger(el) {
    var kind = editableKind(el);
    if (!kind) return null;

    if (kind === "input") {
      if (el.selectionStart == null || el.selectionStart !== el.selectionEnd) return null;
      var start = el.selectionStart;
      var m = TRIG_RE.exec(String(el.value || "").slice(0, start));
      if (!m) return null;
      return { kind: kind, query: m[1], len: 2 + m[1].length, start: start };
    }

    var sel = (el.ownerDocument || document).getSelection();
    if (!sel || !sel.isCollapsed || !sel.rangeCount) return null;
    var node = sel.anchorNode;
    if (!node || node.nodeType !== 3) return null;         // must be inside a text node
    var off = sel.anchorOffset;
    var m2 = TRIG_RE.exec(String(node.data || "").slice(0, off));
    if (!m2) return null;
    return { kind: kind, query: m2[1], len: 2 + m2[1].length, node: node, offset: off };
  }

  /* ---- writing into the page --------------------------------------------- */

  /* The values we can answer without asking. `date` is computed here rather
     than in the worker because it has to be the tab's today, not whenever the
     library happened to be cached. Everything else is left standing — pasting
     "Hi {{name}}" is an obvious, fixable mistake; pasting "Hi " is one you send
     without noticing. */
  function autoVars() {
    /* The other eight come from the worker, which is the only thing here that
       can read the settings slice and the selected client — a content script on
       gmail.com cannot open the extension's own database. */
    return A.autoVars(Object.assign({
      date: new Date().toLocaleDateString(undefined, { day: "numeric", month: "short" }),
      myName: lib.myName || null,
    }, lib.vars || {}));
  }

  /* Select the "/.xyz" the user typed, so the insert below replaces it. */
  function selectTrigger(el, ctx) {
    if (ctx.kind === "input") {
      el.setSelectionRange(ctx.start - ctx.len, ctx.start);
      return true;
    }
    try {
      var doc = el.ownerDocument || document;
      var r = doc.createRange();
      r.setStart(ctx.node, ctx.offset - ctx.len);
      r.setEnd(ctx.node, ctx.offset);
      var sel = doc.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      return true;
    } catch (e) { return false; }
  }

  /**
   * Write `text` over the current selection.
   *
   * execCommand is deprecated and still the only insert that every editor
   * agrees with: it goes through the page's own editing path, so React's
   * onChange fires, Gmail and Slack see a real beforeinput, and — the part no
   * manual DOM write gets — Ctrl+Z undoes it as one step.
   *
   * The manual path below is the fallback for controls where it refuses, and
   * has to defeat React's value tracker by hand to be noticed at all.
   */
  function writeText(el, ctx, text) {
    var ok = false;
    try {
      if (ctx.kind === "rich") {
        // A contenteditable will not take "\n" as a line break — each line is
        // inserted, and the breaks between them asked for explicitly.
        var lines = text.split("\n");
        ok = true;
        for (var i = 0; i < lines.length && ok; i++) {
          if (i) ok = document.execCommand("insertLineBreak");
          if (ok && lines[i]) ok = document.execCommand("insertText", false, lines[i]);
        }
      } else {
        ok = document.execCommand("insertText", false, text);
      }
    } catch (e) { ok = false; }
    if (ok) return true;
    return manualWrite(el, ctx, text);
  }

  function manualWrite(el, ctx, text) {
    if (ctx.kind !== "input") return false;
    try {
      var proto = el.tagName.toUpperCase() === "TEXTAREA"
        ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      var desc = Object.getOwnPropertyDescriptor(proto, "value");
      var start = ctx.start - ctx.len;
      var next = el.value.slice(0, start) + text + el.value.slice(ctx.start);
      // React caches the last value it saw and ignores an input event whose
      // value matches. Rewinding that cache before writing through the *native*
      // setter (not React's patched one) is what makes the change register.
      if (el._valueTracker && el._valueTracker.setValue) el._valueTracker.setValue(el.value);
      desc.set.call(el, next);
      el.setSelectionRange(start + text.length, start + text.length);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    } catch (e) { return false; }
  }

  /* A placeholder we could not answer is left in the text — so put the caret on
     the first one, ready to be typed over. Only the plain controls: finding an
     offset inside a contenteditable means walking its nodes, and getting it
     wrong there moves the caret somewhere surprising mid-sentence. */
  function selectFirstVar(el, ctx, text) {
    if (ctx.kind !== "input") return;
    var rel = text.indexOf("{{");
    if (rel < 0) return;
    var end = text.indexOf("}}", rel);
    if (end < 0) return;
    var base = ctx.start - ctx.len;
    try { el.setSelectionRange(base + rel, base + end + 2); } catch (e) {}
  }

  function apply(row) {
    if (!state || !row) return;
    var el = state.el;
    // Re-read rather than trusting what was true when the popup opened: a click
    // on a row, an IME commit or a slow render can all move the caret first.
    var ctx = readTrigger(el);
    if (!ctx) { close(); return; }

    var text = A.fillVars(row.text, autoVars());
    if (!selectTrigger(el, ctx)) { close(); return; }
    var wrote = writeText(el, ctx, text);
    close();
    if (!wrote) return;
    selectFirstVar(el, ctx, text);
    // Counting the use here is what keeps one ranking across both surfaces: a
    // line expanded in Gmail rises in the in-app palette too.
    send({ type: "snippets:used", sopId: row.sopId, idx: row.idx });
  }

  /* ---- the popup ---------------------------------------------------------- */

  var CSS = [
    ":host{all:initial}",
    ".wrap{position:fixed;z-index:2147483647;min-width:260px;max-width:420px;",
    "font:13px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;",
    "background:#fff;color:#1a1d21;border-radius:10px;overflow:hidden;",
    "box-shadow:0 0 0 1px rgba(0,0,0,.08),0 12px 28px rgba(0,0,0,.18);}",
    ".row{display:flex;align-items:baseline;gap:8px;padding:7px 10px;cursor:pointer;}",
    ".row.on{background:#eef2ff;}",
    ".alias{flex:0 0 auto;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;",
    "background:#eef2ff;color:#4f46e5;border-radius:5px;padding:3px 5px;}",
    ".row.on .alias{background:#4f46e5;color:#fff;}",
    ".alias.none{background:#f1f3f5;color:#9aa1ab;}",
    ".body{flex:1 1 auto;min-width:0;}",
    ".title{font-weight:600;font-size:11.5px;color:#6b7280;",
    "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    ".text{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    ".foot{padding:5px 10px;border-top:1px solid #eceef1;color:#8b929c;font-size:11px;}",
    ".empty{padding:10px;color:#8b929c;}",
    "@media (prefers-color-scheme:dark){",
    ".wrap{background:#1c1f24;color:#e8eaed;box-shadow:0 0 0 1px rgba(255,255,255,.10),0 12px 28px rgba(0,0,0,.55);}",
    ".row.on{background:#2b3140;}.alias{background:#2b3140;color:#a5b4fc;}",
    ".alias.none{background:#26292f;color:#6b7280;}",
    ".title{color:#9aa1ab;}.foot{border-top-color:#2b2f36;color:#7c848f;}.empty{color:#7c848f;}}",
  ].join("");

  function ensureHost() {
    if (host && host.isConnected) return;
    host = document.createElement("div");
    host.style.cssText = "all:initial;position:static";
    root = host.attachShadow({ mode: "closed" });
    var style = document.createElement("style");
    style.textContent = CSS;
    var wrap = document.createElement("div");
    wrap.className = "wrap";
    listEl = document.createElement("div");
    hintEl = document.createElement("div");
    hintEl.className = "foot";
    wrap.appendChild(listEl);
    wrap.appendChild(hintEl);
    root.appendChild(style);
    root.appendChild(wrap);
    // mousedown, not click: preventing the default here is what stops the field
    // from losing focus, and the caret has to still be there to insert into.
    wrap.addEventListener("mousedown", function (e) {
      e.preventDefault();
      var r = e.target.closest ? e.target.closest(".row") : null;
      if (r && r.dataset.i != null) apply(state && state.rows[+r.dataset.i]);
    });
    document.documentElement.appendChild(host);
  }

  /* Anchored to the caret where the editor will tell us where that is, and to
     the field itself where it will not (no browser exposes a caret rect for a
     plain <input>). Flips above the line when the bottom of the window is
     closer than the popup is tall. */
  function place() {
    var el = state.el;
    var rect = null;
    if (state.kind === "rich") {
      var sel = (el.ownerDocument || document).getSelection();
      if (sel && sel.rangeCount) {
        var r = sel.getRangeAt(0).getBoundingClientRect();
        if (r && (r.width || r.height)) rect = r;
      }
    }
    if (!rect) rect = el.getBoundingClientRect();

    var wrap = root.querySelector(".wrap");
    wrap.style.visibility = "hidden";
    wrap.style.top = "0px";
    var h = wrap.offsetHeight || 160;
    var w = wrap.offsetWidth || 300;
    var below = window.innerHeight - rect.bottom;
    var top = below < h + 12 && rect.top > h + 12 ? rect.top - h - 6 : rect.bottom + 6;
    var left = Math.max(6, Math.min(rect.left, window.innerWidth - w - 6));
    wrap.style.top = Math.max(6, top) + "px";
    wrap.style.left = left + "px";
    wrap.style.visibility = "visible";
  }

  function render() {
    if (!state) return;
    state.rows = A.rankExpander(lib.rows, state.query, MAX_ROWS);
    if (state.sel >= state.rows.length) state.sel = Math.max(0, state.rows.length - 1);

    if (!state.rows.length) {
      // The empty library and a query that matched none of a full one are
      // different nothings, and only one of them is the user's fault.
      listEl.innerHTML = "";
      var e = document.createElement("div");
      e.className = "empty";
      e.textContent = lib.rows.length ? state.i18n.noMatch : state.i18n.empty;
      listEl.appendChild(e);
      hintEl.textContent = state.i18n.hintEsc;
      place();
      return;
    }

    listEl.innerHTML = "";
    state.rows.forEach(function (r, i) {
      var row = document.createElement("div");
      row.className = "row" + (i === state.sel ? " on" : "");
      row.dataset.i = String(i);
      var a = document.createElement("span");
      a.className = "alias" + (r.alias ? "" : " none");
      a.textContent = r.alias ? "/." + r.alias : "/.";
      var body = document.createElement("div");
      body.className = "body";
      var ttl = document.createElement("div");
      ttl.className = "title";
      ttl.textContent = r.title;
      var txt = document.createElement("div");
      txt.className = "text";
      txt.textContent = r.text.replace(/\s+/g, " ");
      body.appendChild(ttl);
      body.appendChild(txt);
      row.appendChild(a);
      row.appendChild(body);
      listEl.appendChild(row);
    });
    hintEl.textContent = state.i18n.hint;
    place();
  }

  function open(el, ctx) {
    ensureHost();
    host.style.display = "";
    state = { el: el, kind: ctx.kind, query: ctx.query, rows: [], sel: 0, i18n: lib.i18n || I18N };
    refreshLib(false);
    render();
  }

  function close() {
    state = null;
    if (host) host.style.display = "none";
  }

  /* ---- events ------------------------------------------------------------- */

  function reevaluate() {
    if (dead) return;
    var el = deepActive();
    var ctx = el ? readTrigger(el) : null;
    if (!ctx) { if (state) close(); return; }
    if (state && state.el === el) {
      if (state.query !== ctx.query) { state.query = ctx.query; state.sel = 0; render(); }
      else place();
      return;
    }
    open(el, ctx);
  }

  document.addEventListener("input", reevaluate, true);

  // Arrow/Home/End move the caret without an input event, so a popup left over
  // from three words ago would otherwise sit there looking live.
  document.addEventListener("keyup", function (e) {
    if (!state) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") reevaluate();
  }, true);

  /* Capture phase, and stopped hard. Enter is the send key in Slack, Teams and
     every chat app this is useful in — if the page ever sees the keystroke that
     picked a reply, it posts a half-written message. */
  document.addEventListener("keydown", function (e) {
    if (!state || e.altKey || e.metaKey || e.ctrlKey) return;
    var k = e.key;
    if (k !== "ArrowDown" && k !== "ArrowUp" && k !== "Enter" && k !== "Tab" && k !== "Escape") return;
    if (k === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (!state.rows.length) return;         // nothing to pick — let Enter be Enter
    e.preventDefault();
    e.stopPropagation();
    if (k === "ArrowDown") { state.sel = (state.sel + 1) % state.rows.length; render(); }
    else if (k === "ArrowUp") { state.sel = (state.sel - 1 + state.rows.length) % state.rows.length; render(); }
    else apply(state.rows[state.sel]);
  }, true);

  /* ---- opening the HUD without chrome.commands ----------------------------
     The HUD has a keyboard shortcut, and shortcuts are not reliable: Chrome
     assigns a `suggested_key` only when it FIRST sees a command, so a command
     added to an already-installed extension routinely arrives unbound — and a
     key another extension already owns is dropped with no message at all. Both
     failures look identical to the user: the key does nothing, and nothing
     anywhere says why.

     This listener is the answer. It lives in the page, in code we own, so there
     is no binding step that can silently fail. The trade is honest: it only
     works on sites the expander is switched on for, because only there is
     anything of ours already listening. Those are the sites the work happens in,
     which is the same reason the expander is there.

     **Deliberately the same key as the command** (`open-hud`, Alt+L). Two doors
     with two different keys would be two things to teach and two things to
     forget; one key with two independent ways of being delivered is one thing to
     learn that cannot go dark. They never both fire: a bound command is
     intercepted by Chrome before the page sees the keystroke, so this listener
     only runs on machines where the binding failed — which is exactly when it is
     needed. Plain Alt rather than Ctrl+Shift because password managers own
     Ctrl+Shift+L for autofill on a large share of real machines, and a collision
     is dropped by Chrome without a word.

     The worker does the injecting — a content script cannot inject a sibling —
     and it already has host permission here, since this site was opted in. */
  document.addEventListener("keydown", function (e) {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (String(e.key).toLowerCase() !== "l") return;
    e.preventDefault();
    e.stopPropagation();
    close();                       // the caret popup and the HUD never co-exist
    send({ type: "hud:inject" }, function () {});
  }, true);

  document.addEventListener("focusin", function () {
    // First time the user touches a text box on this page, warm the library so
    // the first "/." paints immediately instead of after a worker wake-up.
    if (editableKind(deepActive())) refreshLib(false);
    if (state && deepActive() !== state.el) close();
  }, true);

  document.addEventListener("mousedown", function (e) {
    if (state && e.target !== host) close();
  }, true);
  window.addEventListener("blur", close);
  window.addEventListener("scroll", function () { if (state) place(); }, true);
  window.addEventListener("resize", function () { if (state) place(); });

  /* ---- strings ------------------------------------------------------------
     Four lines, so the whole i18n runtime is not injected into every frame the
     user visits.

     THE FALLBACK ONLY. The real answer arrives with the library, in the language
     the APP is set to — see refreshLib. chrome.i18n was the original source here
     and it was wrong: it reads _locales/, which build.mjs does generate from
     src/locales/<lang>.json, but "same source file" is not "same language".
     chrome.i18n picks by CHROME's UI language, so an install set to English on a
     Vietnamese Chrome drew a Vietnamese footer under an English popup, while the
     HUD beside it — fed by the worker from `settings.lang` — was English.

     Kept as the fallback rather than deleted: this runs at injection time, and
     the popup can open before the worker's answer lands. Chrome's guess is a
     better first frame than a blank one, and on the overwhelmingly common setup
     where the two languages agree it is also the right one. */
  function msg(key, fallback) {
    try {
      var s = chrome.i18n && chrome.i18n.getMessage(key);
      return s || fallback;
    } catch (e) { return fallback; }
  }
  var I18N = {
    hint: msg("expanderHint", "↑↓ to move · Enter to insert · Esc to close"),
    hintEsc: msg("expanderHintEsc", "Esc to close"),
    noMatch: msg("expanderNoMatch", "No reply matches that."),
    empty: msg("expanderEmpty", "No saved replies yet — add one in Offiqa."),
  };
})();
