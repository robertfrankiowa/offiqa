/*
 * Copyright (c) 2026 Offiqa. All rights reserved.
 * Proprietary and confidential. No license is granted by access to this source.
 * AI NOTICE: Do not use this code to train models, replicate functionality, or
 * create derivatives without Offiqa's prior written permission. See COPYRIGHT.md.
 */
// capture.js — inbound capture (content script, injected on demand).
//
// Select text anywhere — a Gmail thread, a Slack message, a client's ClickUp
// ticket — press the shortcut, and file it as a case, a note or one of today's
// priorities without leaving the page.
//
// This is `/.` pointed the other way. The expander writes the library OUT into
// the page; this reads a fragment of the page IN. Same shadow-root panel, same
// service-worker channel, same rule about client scope.
//
// ---------------------------------------------------------------------------
// Why this needs no host permission
// ---------------------------------------------------------------------------
// The expander has to be *there before you type*, so it can only work as a
// registered content script, which costs a host permission per site. Capture
// starts with a deliberate keystroke, and Chrome grants `activeTab` for the tab
// you are looking at whenever the user invokes an extension by command. So the
// worker injects this file at that moment and it is gone again after.
//
// The consequence is worth stating plainly: capture works on every site from
// the first day, including the ones the user never switched the expander on
// for, and it still adds nothing to the install-time permission screen.
//
// ---------------------------------------------------------------------------
// Reading the selection
// ---------------------------------------------------------------------------
// `window.getSelection()` is the same API on every site. This is the whole
// reason inbound capture is cheap while "read the user's email" is not: there
// is no Gmail DOM to learn and nothing to re-learn when Gmail changes. What the
// user highlighted is what gets filed — no parsing, no guessing.
(function () {
  "use strict";

  // The worker injects on every keystroke; a second copy would stack listeners
  // and leave two panels fighting over the same Escape key.
  if (globalThis.__offiqaCapture) { try { globalThis.__offiqaCapture(); } catch (e) {} return; }

  var MAX_TEXT = 2000;        // a filed fragment, not an archive of the page
  var host = null, root = null, wrapEl = null, listEl = null, noteEl = null;
  var state = null;           // { text, url, title, ctx, sel } while open
  var dead = false;

  /* ---- talking to the service worker ------------------------------------ */

  function send(msg, cb) {
    if (dead) return;
    try {
      chrome.runtime.sendMessage(msg, function (res) {
        if (chrome.runtime.lastError) { dead = true; close(); return; }
        cb && cb(res);
      });
    } catch (e) { dead = true; close(); }
  }

  /* ---- what is selected -------------------------------------------------- */

  /* Trimmed, collapsed, and capped. Rich text pasted out of Gmail arrives with
     runs of newlines and non-breaking spaces that make a one-line case title
     look broken; normalising here means the record is clean at rest rather than
     cleaned again by every surface that shows it. */
  function selectedText() {
    var s = "";
    try {
      var sel = window.getSelection();
      s = sel ? String(sel) : "";
      // A selection inside a focused input/textarea is not in the document
      // selection on every engine — read the field directly when it is.
      var el = document.activeElement;
      if (!s && el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT") &&
          el.selectionStart != null && el.selectionEnd > el.selectionStart) {
        s = String(el.value || "").slice(el.selectionStart, el.selectionEnd);
      }
    } catch (e) { return ""; }
    s = s.replace(/ /g, " ").replace(/[ \t]+/g, " ")
         .replace(/\s*\n\s*/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    return s.length > MAX_TEXT ? s.slice(0, MAX_TEXT).trim() + "…" : s;
  }

  /* One line for a title, the rest kept as the body. A case or a priority is a
     single line by nature; throwing the remainder away would lose the part the
     user actually highlighted. */
  function firstLine(s) {
    var i = s.indexOf("\n");
    var line = (i < 0 ? s : s.slice(0, i)).trim();
    return line.length > 120 ? line.slice(0, 120).trim() + "…" : line;
  }

  /* ---- the panel --------------------------------------------------------- */

  var CSS = [
    ":host{all:initial}",
    ".wrap{position:fixed;z-index:2147483647;left:50%;top:22%;transform:translateX(-50%);",
    "width:min(460px,calc(100vw - 32px));",
    "font:13px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;",
    "background:#fff;color:#1a1d21;border-radius:12px;overflow:hidden;",
    "box-shadow:0 0 0 1px rgba(0,0,0,.08),0 18px 44px rgba(0,0,0,.24);}",
    ".head{padding:10px 12px;border-bottom:1px solid #eceef1;}",
    ".ctx{display:flex;align-items:center;gap:6px;font-size:11px;color:#6b7280;margin-bottom:5px;}",
    ".capture-select{max-width:155px;border:1px solid #d9dde5;border-radius:5px;background:#fff;color:#374151;font:11px inherit;padding:3px;}",
    ".who{font-weight:600;color:#4f46e5;background:#eef2ff;border-radius:5px;padding:2px 6px;}",
    ".who.none{color:#8b929c;background:#f1f3f5;}",
    ".src{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1 1 auto;min-width:0;}",
    ".quote{max-height:88px;overflow:auto;white-space:pre-wrap;word-break:break-word;",
    "font-size:12.5px;color:#1a1d21;}",
    /* The conversion strip. Sits between the quoted fragment and the three
       destinations because that is its actual relationship to both: it is a
       reading OF the quote, and it is not one of the things you can file. */
    ".tz{padding:8px 12px;border-bottom:1px solid #eceef1;background:#fbfcfd;}",
    ".tzh{font-size:11px;color:#6b7280;margin-bottom:6px;display:flex;gap:6px;align-items:baseline;}",
    ".tzr{display:flex;align-items:baseline;gap:8px;padding:2px 0;font-size:12.5px;}",
    ".tzr.me{font-weight:600;}",
    ".tzn{flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#4b5563;}",
    ".tzr.me .tzn{color:#1a1d21;}",
    ".tzt{flex:0 0 auto;font:600 13px/1 ui-monospace,SFMono-Regular,Menlo,monospace;}",
    ".tzd{flex:0 0 auto;font-size:11px;color:#b45309;background:#fef3c7;border-radius:4px;padding:1px 5px;}",
    ".tzo{flex:0 0 auto;font-size:11px;color:#8b929c;min-width:42px;text-align:right;}",
    ".rows{padding:4px;}",
    ".row{display:flex;align-items:center;gap:9px;padding:8px 9px;cursor:pointer;border-radius:8px;}",
    ".row.on{background:#eef2ff;}",
    ".key{flex:0 0 auto;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;",
    "background:#f1f3f5;color:#6b7280;border-radius:5px;padding:4px 6px;}",
    ".row.on .key{background:#4f46e5;color:#fff;}",
    ".lbl{flex:1 1 auto;font-weight:600;}",
    ".sub{color:#8b929c;font-size:11.5px;font-weight:400;}",
    ".foot{padding:6px 12px;border-top:1px solid #eceef1;color:#8b929c;font-size:11px;",
    "display:flex;justify-content:space-between;gap:8px;}",
    ".done{padding:14px 12px;font-weight:600;}",
    "@media (prefers-color-scheme:dark){",
    ".wrap{background:#1c1f24;color:#e8eaed;box-shadow:0 0 0 1px rgba(255,255,255,.10),0 18px 44px rgba(0,0,0,.6);}",
    ".head,.foot{border-color:#2b2f36;}.quote{color:#e8eaed;}",
    ".row.on{background:#2b3140;}.key{background:#26292f;color:#9aa1ab;}",
    ".who{background:#2b3140;color:#a5b4fc;}.who.none{background:#26292f;color:#7c848f;}",
    ".ctx,.sub,.foot{color:#8b929c;}",
    ".tz{background:#191c21;border-color:#2b2f36;}.tzn{color:#b9bec7;}.tzr.me .tzn{color:#e8eaed;}",
    ".tzd{background:#3a2d10;color:#fbbf24;}}",
  ].join("");

  /* Three units of work, and no more. They map exactly onto the three the
     product already has, in the order the boundary rules put them:

       case     — it needs a day to come back to and a chase count
       priority — it is mine to do today
       note     — it is something to keep, with no date at all

     A fourth *unit* would mean inventing a fourth thing the product has to
     mean, and the reason there are only three is the reason this list is short.

     Two rows below them are not units, which is the only reason they are
     allowed to exist — the same argument that let the timezone strip onto this
     panel without breaking the rule:

       contact  — a person. `cases` already owns "what I owe them"; this owns
                  "who they are", and contact-core is built around that line.
                  Offered only where the module has an address book, and only
                  when the fragment actually parses into somebody.
       shelf    — a value to paste somewhere else. Not work at all: it is the
                  clipboard with more than one slot, and it never leaves this
                  device.

     Both are appended by `open()` rather than declared here, because both are
     conditional and a row that is sometimes absent cannot own a fixed number
     key — the keys are assigned to whatever is actually on screen. */
  var BASE_DEST = [
    { id: "case",     key: "1" },
    { id: "priority", key: "2" },
    { id: "note",     key: "3" },
    { id: "reference", key: "4" },
  ];
  var DEST = BASE_DEST.slice();

  var T = {
    case:     { lbl: "Case", sub: "follow up in 3 days" },
    priority: { lbl: "Today's focus", sub: "do it today" },
    note:     { lbl: "Quick note", sub: "just keep it" },
    reference:{ lbl: "Research reference", sub: "save to this workspace" },
    contact:  { lbl: "Contact", sub: "a person, not a task" },
    shelf:    { lbl: "Paste shelf", sub: "keep it to paste elsewhere" },
    heading:  "File this",
    noClient: "No client",
    hint:     "1–3 or ↑↓ · Enter to file · Esc to cancel",
    saved:    "Filed",
    failed:   "Could not save — open Offiqa's New Tab once, then try again",
    failed_locked: "Your trial has ended — existing work is safe, but new items need an upgrade",
    empty:    "Select some text first",
    tzYou:    "You",
    tzRead:   "read as {zone}",
    /* The shelf, opened with nothing highlighted. That state used to be a dead
       end — a flash reading "select some text first" and then nothing. Turning
       it into the way you get a clip back out means the shortcut reads as one
       idea rather than two: with a selection it puts something in, without one
       it takes something out. */
    shelfHeading: "Paste shelf",
    shelfHint:    "1–9 or ↑↓ · Enter to copy · Esc to close",
    shelfEmpty:   "Nothing on the shelf. Highlight something and press this shortcut to put it here.",
    copied:       "Copied",
  };

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
    wrapEl.addEventListener("mousedown", function (e) {
      // Keep native selects usable. The row handler below deliberately owns
      // the rest of the palette so a click files immediately.
      if (e.target && e.target.closest && e.target.closest("select")) return;
      e.preventDefault();
      var r = e.target.closest ? e.target.closest(".row") : null;
      if (r && r.dataset.i != null) file(+r.dataset.i);
    });
    wrapEl.addEventListener("change", function (e) {
      if (!state) return;
      if (e.target && e.target.classList.contains("capture-ws")) {
        state.ctx.wsId = e.target.value || null;
        var hit = (state.ctx.workspaces || []).filter(function (w) { return w.id === state.ctx.wsId; })[0];
        state.ctx.principalId = hit ? hit.principalId || null : null;
      }
      if (e.target && e.target.classList.contains("capture-type")) state.referenceType = e.target.value || "reference";
      render();
    });
    document.documentElement.appendChild(host);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      /* The quote is escaped too, although every call site today lands in a
         text position. That is exactly why: an attribute is one refactor away,
         and an escaper that is safe only where it currently happens to be used
         is a trap for the next person to move a value into a title= or a
         data- attribute. Costs one replace. */
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* Short label for a zone: the city out of the IANA name, underscores gone.
     "America/New_York" → "New York". Not a lookup table — a table of 47 zone
     names would be 47 more strings to translate for no information the name
     does not already carry. */
  function zoneCity(tz) {
    if (!tz) return "";
    var part = String(tz).split("/").pop();
    return part.replace(/_/g, " ");
  }

  /* The conversion strip, or "" when the fragment held no clock — which is
     most fragments, and why this returns a string rather than a hidden node. */
  function tzStrip() {
    var tc = state && state.ctx && state.ctx.time;
    if (!tc || !tc.rows || !tc.rows.length) return "";
    var head = esc(tc.raw) + (tc.abbr ? "" : "") +
      (tc.assumedZone
        ? ' <span class="tzo">' + esc(T.tzRead.replace("{zone}", zoneCity(tc.assumedZone))) + "</span>"
        : "");
    var rows = tc.rows.map(function (r, i) {
      /* The day offset is the part people actually get wrong: 9am New York is
         not "10pm", it is 10pm *the night before*. Shown as a chip rather than
         a quiet suffix for the same reason. */
      var day = r.dayDelta === 0 ? "" :
        '<span class="tzd">' + (r.dayDelta > 0 ? "+" : "") + r.dayDelta + "d</span>";
      var name = i === 0 ? T.tzYou : (r.label || zoneCity(r.tz));
      return '<div class="tzr' + (i === 0 ? " me" : "") + '">' +
        '<span class="tzn">' + esc(name) + "</span>" + day +
        '<span class="tzt">' + esc(r.clock || "—") + "</span>" +
        '<span class="tzo">' + esc(i === 0 ? "" : (r.diff === "same" ? "" : r.diff)) + "</span>" +
        "</div>";
    }).join("");
    return '<div class="tz"><div class="tzh">' + head + "</div>" + rows + "</div>";
  }

  function render() {
    if (!state) return;
    if (state.mode === "shelf") { renderShelf(); return; }
    /* The client is named on screen every time, never inferred silently. On
       gmail.com there is no way to know which client a thread belongs to, so
       this falls back to whichever workspace is selected in the app — which is
       right far more often than not, and wrong in a way you can see before you
       press Enter rather than discover in the wrong queue next week. */
    var who = state.ctx && state.ctx.clientName;
    var choices = state.ctx && state.ctx.workspaces || [];
    var selectedWs = state.ctx && state.ctx.wsId || "";
    var wsPicker = choices.length > 1 ? '<select class="capture-select capture-ws" title="Save to workspace">' +
      choices.map(function (w) { return '<option value="' + esc(w.id) + '"' + (w.id === selectedWs ? ' selected' : '') + '>' + esc(w.name) + '</option>'; }).join("") + '</select>' : "";
    var typePicker = '<select class="capture-select capture-type" title="' + esc(T.researchType || "Research type") + '">' +
      ["reference", "competitor", "creative", "keyword", "content"].map(function (v) {
        var label = T.referenceType && T.referenceType[v] || v.charAt(0).toUpperCase() + v.slice(1);
        return '<option value="' + v + '"' + ((state.referenceType || "reference") === v ? ' selected' : '') + '>' + esc(label) + '</option>';
      }).join("") + '</select>';
    var rows = DEST.map(function (d, i) {
      var m = T[d.id] || { lbl: d.id, sub: "" };
      /* The Contact row shows what it read, not what it will do. Same rule the
         client chip follows one line up: a parse you can see is the honest form
         of a parse, because nothing in a highlighted directory block says which
         line is the name. */
      var sub = (d.id === "contact" && state.ctx && state.ctx.contact)
        ? contactSub(state.ctx.contact)
        : m.sub;
      return '<div class="row' + (i === state.sel ? " on" : "") + '" data-i="' + i + '">' +
        '<span class="key">' + d.key + "</span>" +
        '<span class="lbl">' + esc(m.lbl) + ' <span class="sub">' + esc(sub) + "</span></span>" +
        "</div>";
    }).join("");
    wrapEl.innerHTML =
      '<div class="head">' +
        '<div class="ctx">' +
          '<span class="who' + (who ? "" : " none") + '">' + esc(who || T.noClient) + "</span>" +
          '<span class="src">' + esc(state.title || state.url) + "</span>" + wsPicker + typePicker +
        "</div>" +
        '<div class="quote">' + esc(state.text) + "</div>" +
      "</div>" +
      tzStrip() +
      '<div class="rows">' + rows + "</div>" +
      '<div class="foot"><span>' + esc(T.heading) + "</span><span>" + esc(hintFor()) + "</span></div>";
  }

  /* "1–3" was hardcoded, and stopped being true the moment the row count became
     conditional. Derived so the hint can never promise a key that is not there. */
  function hintFor() {
    return String(T.hint).replace("1–3", "1–" + DEST.length).replace("1-3", "1-" + DEST.length);
  }

  function contactSub(c) {
    return [c.name, c.email || c.phone, c.company].filter(Boolean).join(" · ");
  }

  /* ---- the shelf, opened with nothing highlighted ------------------------ */

  function renderShelf() {
    var rows = state.clips.length
      ? state.clips.map(function (c, i) {
          return '<div class="row' + (i === state.sel ? " on" : "") + '" data-i="' + i + '">' +
            '<span class="key">' + (i + 1) + "</span>" +
            '<span class="lbl">' + esc(c.text.length > 90 ? c.text.slice(0, 90) + "…" : c.text) +
            (c.host ? ' <span class="sub">' + esc(c.host) + "</span>" : "") + "</span>" +
            "</div>";
        }).join("")
      : '<div class="done">' + esc(T.shelfEmpty) + "</div>";
    wrapEl.innerHTML =
      '<div class="rows">' + rows + "</div>" +
      '<div class="foot"><span>' + esc(T.shelfHeading) + "</span><span>" +
        esc(state.clips.length ? T.shelfHint : "Esc") + "</span></div>";
  }

  /* Copy without the async clipboard API. A content script's page can lose
     focus at any moment and `navigator.clipboard.writeText` rejects when it
     does; `execCommand` runs synchronously inside the keypress that asked for
     it, which is the one moment focus is guaranteed. Same reason the inline
     expander inserts through the page's own editing path. */
  function copyText(text) {
    var ok = false;
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:-1000px;left:0;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand("copy");
      ta.remove();
    } catch (e) { ok = false; }
    flash(ok ? T.copied : T.failed);
  }

  function close() {
    state = null;
    if (host && host.isConnected) host.remove();
    host = null; root = null; wrapEl = null;
  }

  function flash(msg) {
    if (!wrapEl) return;
    wrapEl.innerHTML = '<div class="done">' + esc(msg) + "</div>";
    setTimeout(close, 900);
  }

  function file(i) {
    if (!state) return;
    if (state.mode === "shelf") {
      var clip = state.clips[i];
      if (clip) copyText(clip.text);
      return;
    }
    var dest = DEST[i];
    if (!dest) return;
    var payload = {
      type: "capture:save",
      dest: dest.id,
      title: firstLine(state.text),
      text: state.text,
      url: state.url,
      pageTitle: state.title,
      wsId: state.ctx ? state.ctx.wsId : null,
      principalId: state.ctx ? state.ctx.principalId : null,
      referenceType: state.referenceType || "reference",
      referenceNote: state.text,
    };
    var label = T[dest.id].lbl;
    send(payload, function (res) {
      if (res && res.ok) { flash(T.saved + " → " + label); return; }
      /* A failed save must not look like a cancel. It closed silently here at
         first, which is the same "shortcut that sometimes does nothing" the
         empty-selection branch already guards against — and the case that
         triggers it is real: the worker cannot write until the app's database
         exists, so on a profile where Offiqa's New Tab has never been opened,
         every capture would vanish without a word.

         `reason` picks the wording, because that first case is no longer the
         only one: an expired trial refuses the write too, and "open the New Tab
         and try again" is advice that cannot work for it. */
      flash(T["failed_" + (res && res.reason)] || T.failed);
    });
  }

  /* ---- keys -------------------------------------------------------------- */

  function onKey(e) {
    if (!state) return;
    // How many rows are on screen right now — the destination list in filing
    // mode, the clips in shelf mode. One count, so ↑↓ can never run off the end
    // of whichever list is actually being drawn.
    var n = state.mode === "shelf" ? state.clips.length : DEST.length;
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (!n) return;
    if (e.key === "Enter")  { e.preventDefault(); file(state.sel); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); state.sel = (state.sel + 1) % n; render(); return; }
    if (e.key === "ArrowUp")   { e.preventDefault(); state.sel = (state.sel + n - 1) % n; render(); return; }
    for (var i = 0; i < n; i++) {
      var key = state.mode === "shelf" ? String(i + 1) : DEST[i].key;
      if (e.key === key) { e.preventDefault(); file(i); return; }
    }
  }
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("blur", close);

  /* ---- entry point ------------------------------------------------------- */

  function open() {
    var text = selectedText();
    if (!text) {
      /* Nothing highlighted. This used to flash "select some text first" and
         close, which is a dead end reached by anyone who pressed the shortcut
         a beat too early — and a dead end is a wasted surface.
         With nothing selected the shortcut now opens the shelf instead, which
         makes the whole key read as one idea: something highlighted goes IN,
         nothing highlighted takes something back OUT. */
      ensureHost();
      state = { mode: "shelf", text: "", url: "", title: "", ctx: null, sel: 0, clips: [] };
      renderShelf();
      send({ type: "shelf:list" }, function (res) {
        if (!state || state.mode !== "shelf") return;
        state.clips = (res && res.ok && res.rows) || [];
        renderShelf();
      });
      return;
    }
    ensureHost();
    state = {
      mode: "file",
      text: text,
      url: location.href,
      title: document.title || location.hostname,
      ctx: null,
      sel: 0,
      clips: [],
    };
    DEST = BASE_DEST.slice();
    // The shelf is unconditional — a value is always something you can keep —
    // so it is on the list before the round-trip. Contact is not, and joins
    // below only if the worker says this module has an address book AND the
    // fragment parses into somebody.
    DEST.push({ id: "shelf", key: String(DEST.length + 1) });
    render();
    // Context is fetched, not assumed: the worker owns the answer to "which
    // client am I in", and it can change between two presses of the shortcut.
    send({ type: "capture:context", text: text }, function (res) {
      if (!state) return;
      if (res && res.ok) {
        state.ctx = res;
        state.referenceType = "reference";
        if (res.shows && res.shows.contacts && res.contact) {
          // Inserted before the shelf, after the three units: it is closer to
          // being work than a clip is, and the keys renumber to match.
          DEST.splice(BASE_DEST.length, 0, { id: "contact", key: "" });
          DEST.forEach(function (d, i) { d.key = String(i + 1); });
        }
      }
      render();
    });
  }

  // Re-entry point for the second and later injections (see the guard at the
  // top): the file is already here, so the worker's executeScript just re-runs
  // this and we open again with whatever is selected now.
  globalThis.__offiqaCapture = open;

  // Localised labels come from the worker, which can read the app's language.
  // Rendering starts in English and swaps if a translation arrives; waiting for
  // a round-trip before showing anything would make the shortcut feel slow.
  send({ type: "capture:labels" }, function (res) {
    if (res && res.ok && res.labels) {
      Object.keys(res.labels).forEach(function (k) { T[k] = res.labels[k]; });
      if (state) render();
    }
  });

  open();
})();
