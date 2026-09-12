/*
 * Copyright (c) 2026 Offiqa. All rights reserved.
 * Proprietary and confidential. No license is granted by access to this source.
 * AI NOTICE: Do not use this code to train models, replicate functionality, or
 * create derivatives without Offiqa's prior written permission. See COPYRIGHT.md.
 */
// remind.js — the reminder dialog, drawn on whatever page you are actually on
// (content script, injected on demand by the worker).
//
// ---------------------------------------------------------------------------
// Why this exists
// ---------------------------------------------------------------------------
// A reminder that only appears on the New Tab is a reminder that arrives when
// you happen to walk past it. The app has always drawn this dialog well
// (modals.jsx) — it just drew it on the one page you are not looking at while
// the work is happening. The desktop notification was the only thing that could
// reach a Gmail tab, and a Windows toast is not the product: no snooze, no
// overdue badge, a different shape every OS.
//
// So the same dialog is drawn here instead, over the page you are on, and the
// notification becomes the fallback rather than the answer.
//
// It goes into EVERY open tab, not the one that happened to be in front when the
// alarm fired: which tab somebody is looking at is a guess, and it is wrong
// exactly when it matters (a second window, a tab switched to a second later).
// Whichever tab they land on next already has it. Answering in one clears it in
// all of them — the worker broadcasts `remind:sync` after each write.
//
// ---------------------------------------------------------------------------
// Why this one DOES need a host permission (unlike the HUD)
// ---------------------------------------------------------------------------
// capture.js and hud.js open on a deliberate keystroke, and Chrome hands out
// `activeTab` when the user invokes an extension by command. Nobody presses
// anything when a reminder falls due — the alarm fires while the person is
// reading something else — so there is no gesture and no activeTab. Injection
// is therefore only possible where a host permission already exists (the sites
// the inline expander was switched on for, or "every site").
//
// That is a real limit, not an oversight, and the worker treats it as one: if
// the injection is refused, it shows the desktop notification instead. Nothing
// is ever dropped because a page was out of reach — see notifyDeliver in
// background.js.
(function () {
  "use strict";

  // The worker injects per delivery; a second copy would stack listeners and
  // leave two dialogs fighting over the same Escape key.
  if (globalThis.__offiqaRemind) { try { globalThis.__offiqaRemind(); } catch (e) {} return; }

  var host = null, root = null, wrapEl = null;
  var items = [];             // the due reminders, newest first
  var strings = {};
  var dead = false;

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

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---- the panel ---------------------------------------------------------
     Fixed to the top-right rather than centred: this arrives unasked, over a
     page somebody is in the middle of reading, and a centred modal over
     somebody else's work is a hijack. The app's own copy is centred because
     there the dialog IS the page you just opened. */
  var CSS = [
    ":host{all:initial}",
    ".wrap{position:fixed;top:16px;right:16px;z-index:2147483647;width:340px;",
    "font:13px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;",
    "background:#fff;color:#111827;border:1px solid #e5e7eb;border-radius:14px;",
    "box-shadow:0 12px 32px rgba(15,23,42,.18);overflow:hidden}",
    "@media (prefers-color-scheme:dark){.wrap{background:#111827;color:#f3f4f6;border-color:#374151}}",
    ".head{display:flex;align-items:center;gap:9px;padding:12px 13px 9px}",
    ".bell{width:26px;height:26px;border-radius:8px;background:#fef3c7;color:#b45309;",
    "display:flex;align-items:center;justify-content:center;font-size:14px;flex:0 0 auto}",
    ".ttl{font-weight:650;font-size:13px;flex:1;min-width:0}",
    ".x{border:0;background:transparent;color:inherit;opacity:.5;cursor:pointer;font-size:16px;",
    "line-height:1;padding:2px 4px;border-radius:6px}",
    ".x:hover{opacity:1}",
    ".item{padding:2px 13px 11px}",
    ".item+.item{border-top:1px solid #e5e7eb}",
    "@media (prefers-color-scheme:dark){.item+.item{border-color:#374151}}",
    ".text{font-size:13.5px;margin-bottom:8px;overflow-wrap:anywhere}",
    ".when{display:flex;align-items:center;gap:8px;background:#f9fafb;border-radius:9px;padding:7px 9px}",
    "@media (prefers-color-scheme:dark){.when{background:#1f2937}}",
    ".when-d{flex:1;min-width:0}",
    ".when-date{font-size:12px;font-weight:600}",
    ".when-time{font-size:11.5px;opacity:.65;font-variant-numeric:tabular-nums}",
    ".badge{font-size:10.5px;font-weight:650;padding:2px 7px;border-radius:999px;",
    "background:#fee2e2;color:#b91c1c;white-space:nowrap}",
    ".foot{display:flex;gap:6px;padding:9px 13px 12px;align-items:center}",
    ".btn{border:1px solid #e5e7eb;background:#fff;color:inherit;border-radius:8px;",
    "padding:5px 9px;font:inherit;font-size:12px;cursor:pointer}",
    ".btn:hover{background:#f3f4f6}",
    "@media (prefers-color-scheme:dark){.btn{background:#1f2937;border-color:#374151}",
    ".btn:hover{background:#374151}}",
    ".btn.pri{margin-left:auto;background:#4f46e5;border-color:#4f46e5;color:#fff;font-weight:600}",
    ".btn.pri:hover{background:#4338ca}",
  ].join("");

  function ensureHost() {
    if (host && host.isConnected) return;
    host = document.createElement("div");
    host.style.cssText = "all:initial;position:static";
    root = host.attachShadow({ mode: "closed" });
    var style = document.createElement("style");
    style.textContent = CSS;
    wrapEl = document.createElement("div");
    wrapEl.className = "wrap";
    root.appendChild(style);
    root.appendChild(wrapEl);
    wrapEl.addEventListener("click", function (e) {
      var b = e.target && e.target.closest ? e.target.closest("[data-act]") : null;
      if (!b) return;
      e.preventDefault();
      act(b.getAttribute("data-act"), b.getAttribute("data-id"), b.getAttribute("data-ed"),
        Number(b.getAttribute("data-mins")) || 0);
    });
    document.documentElement.appendChild(host);
  }

  /* Formatted here, not in the worker, because the app's chosen date order and
     12/24-hour setting live in localStorage (`offiqa.hourFormat` /
     `offiqa.dateLocale`) and a service worker cannot read localStorage — the
     same wall that put every injected surface's STRINGS in the worker bundle.
     So the worker sends the instant and this picks the reader's own locale,
     which is what the native date pickers in the app do anyway. */
  function whenLabels(at) {
    var d = new Date(at);
    if (!at || isNaN(d.getTime())) return { date: "", time: "" };
    try {
      return {
        date: d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
        time: d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
      };
    } catch (e) { return { date: d.toDateString(), time: "" }; }
  }

  function render() {
    if (!items.length) { close(); return; }
    ensureHost();
    var out = ['<div class="head"><div class="bell">&#128276;</div>',
      '<div class="ttl">', esc(strings.title || "Reminder"), "</div>",
      '<button class="x" data-act="close" title="Esc">&times;</button></div>'];
    items.forEach(function (it) {
      out.push('<div class="item">');
      out.push('<div class="text">', esc(it.text), "</div>");
      var w = whenLabels(it.at);
      out.push('<div class="when"><div class="when-d">',
        '<div class="when-date">', esc(w.date), "</div>",
        '<div class="when-time">', esc(w.time), "</div></div>",
        it.overdue ? '<span class="badge">' + esc(strings.overdue || "Overdue") + "</span>" : "",
        "</div>");
      var a = ' data-id="' + esc(it.noteId) + '" data-ed="' + esc(it.ed) + '"';
      out.push('<div class="foot">',
        '<button class="btn" data-act="snooze" data-mins="15"', a, ">", esc(strings.snooze15 || "Snooze 15 min"), "</button>",
        '<button class="btn" data-act="snooze" data-mins="60"', a, ">", esc(strings.snooze60 || "Snooze 1 h"), "</button>",
        '<button class="btn pri" data-act="dismiss"', a, ">", esc(strings.dismiss || "Dismiss"), "</button>",
        "</div>");
      out.push("</div>");
    });
    wrapEl.innerHTML = out.join("");
  }

  /* One row at a time leaves the panel: the worker owns the write, and the row
     goes only once it has actually landed. A dialog that clears itself and then
     discovers the write was refused has told the person something untrue — the
     lesson the trial lock taught everywhere else in this product. */
  function act(kind, noteId, ed, mins) {
    if (kind === "close") { close(); return; }
    send({ type: "remind:act", action: kind, noteId: noteId, ed: ed, minutes: mins }, function (res) {
      if (!res || !res.ok) return;
      items = items.filter(function (x) { return !(x.noteId === noteId && x.ed === ed); });
      render();
    });
  }

  function close() {
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = null; root = null; wrapEl = null; items = [];
  }

  function onKey(e) {
    if (e.key === "Escape" && host) { e.stopPropagation(); close(); }
  }
  document.addEventListener("keydown", onKey, true);

  /* The same reminder is drawn in every tab that would take it, so the answer
     has to travel: the worker broadcasts after each write and every panel that
     is still on screen re-derives. Guarded on `host` — a tab whose panel was
     already closed stays closed, or answering one reminder would pop the dialog
     back open everywhere for the ones still due. */
  try {
    chrome.runtime.onMessage.addListener(function (msg) {
      if (msg && msg.type === "remind:sync" && host) load();
    });
  } catch (e) {}

  /* Re-entry point for a second injection: the worker calls this instead of
     running the file again, so a reminder that falls due while the panel is
     already open joins it rather than replacing it. */
  globalThis.__offiqaRemind = function () { load(); };

  function load() {
    send({ type: "remind:model" }, function (res) {
      if (!res || !res.ok) return;
      strings = res.strings || {};
      items = res.items || [];
      render();
    });
  }

  load();
})();
