/*
 * Copyright (c) 2026 Offiqa. All rights reserved.
 * Proprietary and confidential. No license is granted by access to this source.
 * AI NOTICE: Do not use this code to train models, replicate functionality, or
 * create derivatives without Offiqa's prior written permission. See COPYRIGHT.md.
 */
// hud.js — the in-page log panel (content script, injected on demand).
//
// Press the shortcut anywhere — a Gmail thread, a GoHighLevel pipeline, a
// Shopify admin — and record the thing you just did without leaving the tab:
// tick a shift counter, log a few minutes to this client, mark a case chased.
//
// ---------------------------------------------------------------------------
// Why this exists at all
// ---------------------------------------------------------------------------
// Offiqa lives on the New Tab, which is the page an assistant passes *through*
// between tasks — not the one the work happens in. Three records are worthless
// unless they are made at the moment they become true:
//
//   · a "50 calls a shift" counter tapped between calls
//   · the forty minutes of scattered email nobody starts a timer for
//   · a chase counted the instant the message was sent
//
// Each of those costs a tab switch today, and a record that costs a tab switch
// is a record that does not get made.
//
// ---------------------------------------------------------------------------
// Why this needs no host permission
// ---------------------------------------------------------------------------
// Identical to capture.js: the panel opens on a deliberate keystroke, and Chrome
// grants `activeTab` for the tab in front whenever the user invokes an extension
// by command. The worker injects this file at that moment and it is gone again
// after — so the HUD works on every site from the first day and still adds no
// line to the install-time permission screen.
//
// ---------------------------------------------------------------------------
// What it deliberately is not
// ---------------------------------------------------------------------------
// Not a sidebar, not a second app surface. There is nothing to browse, nothing
// to edit, nothing to read. Every row is one keystroke that records one fact and
// closes the panel. Anything needing a decision belongs on a page with room for
// it — putting it here would turn a reflex into an interruption.
(function () {
  "use strict";

  // The worker injects on every keystroke; a second copy would stack listeners
  // and leave two panels fighting over the same Escape key.
  if (globalThis.__offiqaHud) { try { globalThis.__offiqaHud(); } catch (e) {} return; }

  var host = null, root = null, wrapEl = null;
  var state = null;           // { model, sel } while open
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

  /* ---- strings ----------------------------------------------------------- */

  // English first so the panel can paint immediately; the worker's translation
  // swaps in when it arrives. Waiting on a round-trip before showing anything
  // would make a keyboard shortcut feel slow, which is the whole point of it.
  var T = {
    heading: "Log it",
    noClient: "No client",
    hint: "1–9 or ↑↓ · Enter to log · Esc to close",
    empty: "Nothing to log here yet — set a daily target or open a case first.",
    counter: "{name}",
    counterOutcome: "{name} · {outcome}",
    counterSub: "{count} of {target} today",
    counterSubOpen: "{count} today",
    outcome: { connected: "Connected", voicemail: "Voicemail",
      noanswer: "No answer", booked: "Booked" },
    time: "Log {mins}m",
    timeSubPlain: "to {client}",
    timeSubNoClient: "unassigned",
    timeSubRounded: "to {client} · billed in {mins}m blocks",
    timerStart: "Start timer",
    timerStartSub: "measured minutes, to {client}",
    timerStartSubNoClient: "measured minutes, unassigned",
    timerStop: "Stop timer · {mins}m",
    timerStopSub: "running since you started it",
    timerStopSubOther: "running for another workspace",
    doneTimerStart: "Timer started",
    doneTimerStop: "Logged {mins}m",
    doneTimerCapped: "Logged {mins}m — over 8h, filed as entered by hand",
    doneTimerNone: "Stopped — under a minute, nothing logged",
    timerLine: "Timed — {host}",
    timerLineBare: "Timed session",
    chase: "Chased: {name}",
    chaseSub: "asked {n}× · next in 3 days",
    chaseSubFirst: "first chase · next in 3 days",
    noticeNoClient: "This workspace has no client — minutes logged here reach no statement.",
    noticeNoWorkspace: "No workspace selected — minutes logged here reach no statement.",
    doneCounter: "{name} · {count}",
    doneTime: "Logged {mins}m",
    doneChase: "Chased · asked {n}×",
    failed: "Could not save — open Offiqa's New Tab once, then try again",
  };

  function fill(tpl, vars) {
    return String(tpl == null ? "" : tpl).replace(/\{(\w+)\}/g, function (m, k) {
      return vars && vars[k] != null ? String(vars[k]) : m;
    });
  }

  /* ---- the panel --------------------------------------------------------- */

  /* Bottom-right, not centred. Capture's panel is about a fragment you just
     highlighted, so it sits where you are reading; this one is about the page as
     a whole and is often opened over a live call screen or a dialer, where
     covering the middle of the viewport is exactly wrong. */
  var CSS = [
    ":host{all:initial}",
    ".wrap{position:fixed;z-index:2147483647;right:18px;bottom:18px;",
    "width:min(340px,calc(100vw - 32px));",
    "font:13px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;",
    "background:#fff;color:#1a1d21;border-radius:12px;overflow:hidden;",
    "box-shadow:0 0 0 1px rgba(0,0,0,.08),0 18px 44px rgba(0,0,0,.24);}",
    ".head{padding:9px 12px;border-bottom:1px solid #eceef1;display:flex;align-items:center;gap:6px;}",
    ".who{font-weight:600;color:#4f46e5;background:#eef2ff;border-radius:5px;padding:2px 6px;font-size:11px;}",
    ".who.none{color:#8b929c;background:#f1f3f5;}",
    ".ws{font-size:11px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1 1 auto;min-width:0;}",
    ".rows{padding:4px;}",
    ".row{display:flex;align-items:center;gap:9px;padding:7px 9px;cursor:pointer;border-radius:8px;}",
    ".row.on{background:#eef2ff;}",
    ".key{flex:0 0 auto;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;",
    "background:#f1f3f5;color:#6b7280;border-radius:5px;padding:4px 6px;}",
    ".row.on .key{background:#4f46e5;color:#fff;}",
    ".txt{flex:1 1 auto;min-width:0;}",
    ".lbl{font-weight:600;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    ".sub{color:#8b929c;font-size:11.5px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    /* The tally sits hard right and monospaced so a number changing under a
       repeated tap does not shift the row it is on. */
    ".tally{flex:0 0 auto;font:600 11.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:#6b7280;}",
    /* Quiet, not alarming. Nothing is broken and nothing is being refused —
       the panel is simply telling you where these minutes will end up. A red
       banner here would read as an error and get dismissed on sight. */
    ".note{padding:7px 12px;border-bottom:1px solid #eceef1;",
    "font-size:11.5px;line-height:1.4;color:#8b929c;background:#f8f9fb;}",
    ".foot{padding:6px 12px;border-top:1px solid #eceef1;color:#8b929c;font-size:11px;",
    "display:flex;justify-content:space-between;gap:8px;}",
    ".done{padding:14px 12px;font-weight:600;}",
    ".msg{padding:14px 12px;color:#6b7280;}",
    "@media (prefers-color-scheme:dark){",
    ".wrap{background:#1c1f24;color:#e8eaed;box-shadow:0 0 0 1px rgba(255,255,255,.10),0 18px 44px rgba(0,0,0,.6);}",
    ".head,.foot,.note{border-color:#2b2f36;}",
    ".note{background:#212530;}",
    ".row.on{background:#2b3140;}.key{background:#26292f;color:#9aa1ab;}",
    ".who{background:#2b3140;color:#a5b4fc;}.who.none{background:#26292f;color:#7c848f;}",
    ".ws,.sub,.foot,.tally,.msg,.note{color:#8b929c;}}",
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
    wrapEl.addEventListener("mousedown", function (e) {
      // preventDefault keeps focus in the page: the panel is opened over a
      // compose box or a dialer often enough that stealing the caret would make
      // it a worse tool than the tab switch it replaces.
      e.preventDefault();
      var r = e.target.closest ? e.target.closest(".row") : null;
      if (r && r.dataset.i != null) fire(+r.dataset.i);
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

  /* One row's two lines and its right-hand tally. Kept in one place because the
     three kinds differ only in wording — the shape is deliberately identical so
     the eye can run down the list without re-learning it per row. */
  function rowText(r, model) {
    if (r.kind === "counter") {
      /* An outcome row keeps the counter's own progress in the sub-line — the
         shift total is what the target is about — and puts this outcome's tally
         on the right, because that is the number the row is claiming. */
      var name = r.outcome
        ? fill(T.counterOutcome, { name: r.label, outcome: T.outcome[r.outcome] || r.outcome })
        : fill(T.counter, { name: r.label });
      return {
        lbl: name,
        sub: r.unset ? fill(T.counterSubOpen, { count: r.count })
                     : fill(T.counterSub, { count: r.count, target: r.target }),
        tally: r.outcome ? String(r.outcomeCount || 0)
             : (r.unset ? String(r.count) : r.count + "/" + r.target),
      };
    }
    if (r.kind === "timerStart") {
      return { lbl: T.timerStart,
        sub: model.clientName ? fill(T.timerStartSub, { client: model.clientName }) : T.timerStartSubNoClient,
        tally: "" };
    }
    if (r.kind === "timerStop") {
      return { lbl: fill(T.timerStop, { mins: r.mins }),
        // Said plainly when it is true: an hour started on one client and
        // stopped while another is selected still belongs to the first.
        sub: r.forOther ? T.timerStopSubOther : T.timerStopSub,
        tally: r.mins + "m" };
    }
    if (r.kind === "time") {
      var sub;
      if (!model.clientName) sub = T.timeSubNoClient;
      else if (r.rounded) sub = fill(T.timeSubRounded, { client: model.clientName, mins: r.mins });
      else sub = fill(T.timeSubPlain, { client: model.clientName });
      return { lbl: fill(T.time, { mins: r.mins }), sub: sub, tally: "" };
    }
    return {
      lbl: fill(T.chase, { name: r.label }),
      sub: r.chases ? fill(T.chaseSub, { n: r.chases }) : T.chaseSubFirst,
      tally: r.ref || "",
    };
  }

  function render() {
    if (!state) return;
    var m = state.model;
    var who = m.clientName;
    var headHtml =
      '<div class="head">' +
        '<span class="who' + (who ? "" : " none") + '">' + esc(who || T.noClient) + "</span>" +
        '<span class="ws">' + esc(m.wsName || "") + "</span>" +
      "</div>";

    if (m.empty) {
      // Nothing configured yet. Said out loud rather than opening an empty box —
      // a panel with no rows reads as broken, not as "there is nothing here".
      wrapEl.innerHTML = headHtml + '<div class="msg">' + esc(T.empty) + "</div>";
      return;
    }

    /* Where these minutes will end up, when the answer is "nowhere billable".
       The chip already says "No client", but a chip is a label and this is a
       consequence — someone can tap Log 15m forty times over a fortnight, see
       the panel work perfectly every time, and only discover at invoice time
       that none of it attaches to anyone. Core decides which of the two states
       this is (see acHudModel); the panel only picks the sentence. */
    var noteHtml = m.notice
      ? '<div class="note">' +
          esc(m.notice === "noWorkspace" ? T.noticeNoWorkspace : T.noticeNoClient) +
        "</div>"
      : "";

    var rows = m.rows.map(function (r, i) {
      var txt = rowText(r, m);
      return '<div class="row' + (i === state.sel ? " on" : "") + '" data-i="' + i + '">' +
        '<span class="key">' + esc(r.key) + "</span>" +
        '<span class="txt"><span class="lbl">' + esc(txt.lbl) + "</span>" +
        '<span class="sub">' + esc(txt.sub) + "</span></span>" +
        (txt.tally ? '<span class="tally">' + esc(txt.tally) + "</span>" : "") +
        "</div>";
    }).join("");

    wrapEl.innerHTML = headHtml + noteHtml +
      '<div class="rows">' + rows + "</div>" +
      '<div class="foot"><span>' + esc(T.heading) + "</span><span>" + esc(T.hint) + "</span></div>";
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

  /* What the confirmation says. It quotes the number *after* the change, because
     the reason to tap a counter forty times in a shift is to watch it climb —
     "Calls · 33" answers the question the tap was asking. */
  function doneText(r, res) {
    if (r.kind === "counter") return fill(T.doneCounter, { name: r.label, count: (res && res.count != null) ? res.count : r.count + 1 });
    if (r.kind === "time") return fill(T.doneTime, { mins: (res && res.mins != null) ? res.mins : r.mins });
    if (r.kind === "timerStart") return T.doneTimerStart;
    if (r.kind === "timerStop") {
      if (!res || !res.mins) return T.doneTimerNone;
      // The demotion is stated, never silent: a row that quietly stopped
      // counting as measured is the one thing this rule exists to prevent.
      return fill(res.capped ? T.doneTimerCapped : T.doneTimerStop, { mins: res.mins });
    }
    return fill(T.doneChase, { n: (res && res.chases != null) ? res.chases : r.chases + 1 });
  }

  function fire(i) {
    if (!state || state.model.empty) return;
    var r = state.model.rows[i];
    if (!r) return;
    send({
      type: "hud:apply",
      action: { kind: r.kind, id: r.id, mins: r.mins, outcome: r.outcome },
      wsId: state.model.wsId,
      principalId: state.model.principalId,
      host: location.hostname || "",
    }, function (res) {
      /* A failed write must not look like a cancel — the same rule capture.js
         learned: on a profile where Offiqa's New Tab has never been opened there
         is no database to write into, and silence there is indistinguishable
         from a shortcut that does nothing. */
      if (res && res.ok) flash(doneText(r, res));
      else flash(T.failed);
    });
  }

  /* ---- keys -------------------------------------------------------------- */

  function onKey(e) {
    if (!state) return;
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (state.model.empty) return;
    var n = state.model.rows.length;
    if (e.key === "Enter")     { e.preventDefault(); fire(state.sel); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); state.sel = (state.sel + 1) % n; render(); return; }
    if (e.key === "ArrowUp")   { e.preventDefault(); state.sel = (state.sel + n - 1) % n; render(); return; }
    for (var i = 0; i < n; i++) {
      if (e.key === state.model.rows[i].key) { e.preventDefault(); fire(i); return; }
    }
  }
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("blur", close);

  /* ---- entry point ------------------------------------------------------- */

  function open() {
    ensureHost();
    /* The model is fetched, never cached across presses. Which workspace is
       selected, what a counter stands at and which cases are due all change
       between two presses of the shortcut — and a HUD showing a stale tally is
       worse than no HUD, because it will be tapped anyway. */
    send({ type: "hud:model" }, function (res) {
      if (!host) return;                       // closed while we waited
      if (!res || !res.ok) { flash(T.failed); return; }
      state = { model: res.model, sel: 0 };
      render();
    });
  }

  // Re-entry point for the second and later injections (see the guard at the
  // top): the file is already here, so the worker's executeScript just re-runs
  // this and we open again with a freshly read model.
  globalThis.__offiqaHud = open;

  send({ type: "hud:labels" }, function (res) {
    if (res && res.ok && res.labels) {
      Object.keys(res.labels).forEach(function (k) { T[k] = res.labels[k]; });
      if (state) render();
    }
  });

  open();
})();
