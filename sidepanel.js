/*
 * Copyright (c) 2026 Offiqa. All rights reserved.
 * Proprietary and confidential. No license is granted by access to this source.
 * AI NOTICE: Do not use this code to train models, replicate functionality, or
 * create derivatives without Offiqa's prior written permission. See COPYRIGHT.md.
 */
// sidepanel.js — the context panel that stays put.
//
// ---------------------------------------------------------------------------
// Why this surface exists
// ---------------------------------------------------------------------------
// Capture (§4.7.3) and the HUD (§4.7.4) each borrow the page for one keystroke
// and leave. That is exactly right for recording a fact and exactly wrong for
// the question that is open the whole day:
//
//     what am I in the middle of, for whom, and what is the next step?
//
// You do not *perform* that question, you glance at it — and a panel that closes
// after one keypress cannot be glanced at. Chrome's side panel is the only
// surface that survives a tab switch, which is what makes this a panel rather
// than a fourth shortcut.
//
// ---------------------------------------------------------------------------
// The one rule
// ---------------------------------------------------------------------------
// **It shows the selected workspace and nothing else.** Not a list of
// everything, not a search, not a second home page. It is the workspace bar's
// context (§4.1) made visible while you are somewhere else — which is why
// switching chips is the only navigation here, and why every other control is a
// single tap that records one fact.
//
// ---------------------------------------------------------------------------
// Where the state lives
// ---------------------------------------------------------------------------
// Nowhere here. The panel holds no copy of anything: it asks the worker for a
// model, draws it, sends a tap back, and asks again. Two consequences worth
// stating, because both are the reason it is written this way:
//
//   · the derivation is `panelModel` in assistant-core, under the same Node
//     tests as the rest of the data model — a panel with its own idea of "late"
//     would be a second product disagreeing with the first;
//   · nothing can go stale in a surface that stays open for eight hours, because
//     it re-reads on every tab change, every window focus and every slice
//     announcement from any other surface.
(function () {
  "use strict";

  var hasChrome = typeof chrome !== "undefined" && !!chrome.runtime;
  var root = document.getElementById("sp-root");
  var model = null;
  var tabInfo = null;       // { url, title } of the tab in front
  var toastTimer = null;

  /* English first so the panel paints immediately; the worker's translation
     swaps in when it arrives. Same reasoning as capture and the HUD — except
     this surface stays open, so it also matters that a language change reaches
     it, which it does through the same reload every other surface gets. */
  var T = {
    heading: "Now",
    noWorkspace: "No workspace selected yet. Pick one above, or create one in Offiqa.",
    noWorkspaces: "No workspaces yet. Open Offiqa's New Tab to make your first one.",
    next: "Next step",
    noNext: "No next step set — this is the one that goes quiet.",
    followDue: "Follow up today",
    followLate: "Follow-up {n}d late",
    followSoon: "Follow up in {n}d",
    owed: "Owed today",
    owedNone: "Nothing owed here today.",
    chase: "Chase",
    chased: "Asked {n}×",
    routine: "Daily run",
    pending: "Pending",
    sop: "Procedure",
    sopMore: "+{n} more in Offiqa",
    tabsOpen: "Open right now",
    tabAttach: "Attach",
    tabsMore: "+{n} more open, saved nowhere",
    links: "Saved tabs",
    openAll: "Open all saved tabs",
    restore: "Restore {n} tabs from last time",
    attach: "Attach this tab",
    attached: "Attached to {name}",
    attachSaved: "This tab is already saved here",
    attachBad: "This page cannot be attached",
    guardReady: "Expected account: {account}",
    guardUnknown: "Check account: {account}",
    guardUnknownNoAccount: "Check account before working here.",
    guardAttention: "{active} is active, but this tab belongs to {conflict}.",
    guardSwitch: "Switch to {name}",
    guardKeep: "Keep {name}",
    clips: "Paste shelf",
    clipsNone: "Nothing on the shelf. Highlight something and press the capture shortcut.",
    copied: "Copied",
    drop: "Remove",
    failed: "Could not save — open Offiqa's New Tab once, then try again",
    asleep: "probably asleep",
    off: "outside working hours",
    work: "working hours",
  };

  function fill(tpl, vars) {
    return String(tpl == null ? "" : tpl).replace(/\{(\w+)\}/g, function (m, k) {
      return vars && vars[k] != null ? String(vars[k]) : m;
    });
  }

  function send(msg, cb) {
    if (!hasChrome) { cb && cb(null); return; }
    try {
      chrome.runtime.sendMessage(msg, function (res) {
        if (chrome.runtime.lastError) { cb && cb(null); return; }
        cb && cb(res);
      });
    } catch (e) { cb && cb(null); }
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---- reading the model ------------------------------------------------- */

  function currentTab(cb) {
    if (!(hasChrome && chrome.tabs && chrome.tabs.query)) { cb(null); return; }
    try {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, function (tabs) {
        var t = tabs && tabs[0];
        cb(t ? { id: t.id, groupId: t.groupId, url: t.url || "", title: t.title || "" } : null);
      });
    } catch (e) { cb(null); }
  }

  var refreshQueued = false;
  function refresh() {
    /* Collapsed rather than queued. A tab switch fires activated *and* updated,
       and a slice write announces once per slice — three or four events for one
       user action, each of which would otherwise cost a full read of seven
       slices while the panel redraws underneath the pointer. */
    if (refreshQueued) return;
    refreshQueued = true;
    setTimeout(function () {
      refreshQueued = false;
      currentTab(function (tab) {
        tabInfo = tab;
        send({ type: "panel:model", tab: tab }, function (res) {
          if (res && res.ok) { model = res.model; render(); }
        });
      });
    }, 60);
  }

  /* ---- rendering --------------------------------------------------------- */

  function secHead(title, count) {
    return '<div class="sp-h"><span>' + esc(title) + "</span>" +
      (count == null ? "" : '<span class="sp-count">' + esc(count) + "</span>") + "</div>";
  }

  function guardHtml(g) {
    if (!g) return "";
    var attention = g.status === "attention", conflict = g.conflictingWorkspace || {};
    var text = attention ? fill(T.guardAttention, { active: g.workspaceName || "", conflict: conflict.wsName || "" })
      : g.status === "ready" && g.expectedAccount ? fill(T.guardReady, { account: g.expectedAccount })
      : g.expectedAccount ? fill(T.guardUnknown, { account: g.expectedAccount }) : T.guardUnknownNoAccount;
    return '<div class="sp-guard' + (attention ? " attention" : "") + '" role="status" aria-live="' + (attention ? "assertive" : "polite") + '">' +
      '<span>' + esc(text) + '</span>' + (attention && conflict.wsId
        ? '<button class="sp-act" data-guard-switch="' + esc(conflict.wsId) + '">' + esc(fill(T.guardSwitch, { name: conflict.wsName || "" })) + '</button>' +
          '<button class="sp-act" data-guard-keep="1">' + esc(fill(T.guardKeep, { name: g.workspaceName || "" })) + '</button>' : '') + '</div>';
  }

  function barHtml(bar) {
    if (!bar || !bar.length) return "";
    return '<div class="sp-bar">' + bar.map(function (w) {
      return '<button class="sp-chip' + (w.current ? " on" : "") + '" data-ws="' + esc(w.id) + '">' +
        '<span class="sp-dot" style="background:' + esc(w.color || "#6366f1") + '"></span>' +
        "<span>" + esc(w.name) + "</span></button>";
    }).join("") + "</div>";
  }

  function followTag(ws) {
    if (!ws || ws.followUpAt == null) return "";
    var n = ws.followDays;
    if (n > 0) return '<span class="sp-tag late">' + esc(fill(T.followLate, { n: n })) + "</span>";
    if (n === 0) return '<span class="sp-tag warn">' + esc(T.followDue) + "</span>";
    return '<span class="sp-tag">' + esc(fill(T.followSoon, { n: -n })) + "</span>";
  }

  function clientHtml(c) {
    if (!c) return "";
    var bits = ['<span class="sp-tag">' + esc(c.name) + "</span>"];
    if (c.clock) {
      /* The client's clock, and what it means there. A time with no reading is
         a number the user has to interpret at the exact moment they are least
         likely to — which is the whole argument for §4.1's coloured dot. */
      var state = T[c.state] || "";
      bits.push('<span class="sp-tag' + (c.state === "asleep" ? " warn" : "") + '">' +
        esc(c.clock) + (c.dayDelta ? esc(" " + (c.dayDelta > 0 ? "+" : "") + c.dayDelta + "d") : "") +
        (state ? esc(" · " + state) : "") + "</span>");
    }
    // The account this client's work goes out from. On this surface more than
    // any other: the panel is open while you are inside the mailbox.
    if (c.account) bits.push('<span class="sp-tag">' + esc(c.account) + "</span>");
    return '<div class="sp-meta">' + bits.join("") + "</div>";
  }

  function owedHtml(owed) {
    if (!owed.length) return '<div class="sp-empty">' + esc(T.owedNone) + "</div>";
    return owed.map(function (o) {
      var late = o.days > 0;
      var sub = o.kind === "case"
        ? (o.ref ? esc(o.ref) + " · " : "") + esc(fill(T.chased, { n: o.chases }))
        : "";
      return '<div class="sp-row' + (late ? " late" : "") + '">' +
        '<span class="sp-txt">' + esc(o.title) +
          (sub ? '<span class="sp-sub">' + sub + "</span>" : "") + "</span>" +
        (o.kind === "case"
          ? '<button class="sp-act" data-chase="' + esc(o.id) + '">' + esc(T.chase) + "</button>"
          : "") +
        "</div>";
    }).join("");
  }

  /* The open tab strip, read as context.
     Absent entirely when there is nothing to say — a section that always draws
     "0 open here" on a fresh window is a section people learn to skip. */
  function openTabsHtml(tc) {
    if (!tc) return "";
    var total = tc.mine.length + tc.elsewhere.length + tc.loose.length;
    if (!total) return "";

    var body = "";
    tc.mine.forEach(function (x) {
      body += '<div class="sp-link" data-tab="' + x.id + '">' +
        '<span class="sp-sq" style="background:var(--primary)"></span>' +
        '<span class="sp-lt">' + esc(x.title) + "</span></div>";
    });
    /* Named, not counted. A tab that looks like yours but belongs to another
       client is the thing worth surfacing here — "3 elsewhere" would hide
       exactly the confusion this bucket exists to remove. */
    tc.elsewhere.forEach(function (x) {
      body += '<div class="sp-link" data-tab="' + x.id + '">' +
        '<span class="sp-sq" style="background:var(--faint)"></span>' +
        '<span class="sp-lt">' + esc(x.title) +
        ' <span class="sp-sub">' + esc(x.wsName) + "</span></span></div>";
    });
    tc.loose.forEach(function (x) {
      body += '<div class="sp-row tap" data-tab="' + x.id + '">' +
        '<span class="sp-txt">' + esc(x.title) +
          '<span class="sp-sub">' + esc(x.host) + "</span></span>" +
        '<button class="sp-act" data-attach="' + x.id + '">' + esc(T.tabAttach) + "</button>" +
      "</div>";
    });
    if (tc.looseMore) {
      body += '<div class="sp-empty">' + esc(fill(T.tabsMore, { n: tc.looseMore })) + "</div>";
    }
    return '<div class="sp-sec">' +
      secHead(T.tabsOpen, tc.mine.length + "/" + total) + body + "</div>";
  }

  function render() {
    if (!model) { root.innerHTML = ""; return; }

    var out = [barHtml(model.bar)];

    if (!model.ws) {
      out.push('<div class="sp-empty">' +
        esc(model.bar && model.bar.length ? T.noWorkspace : T.noWorkspaces) + "</div>");
      root.innerHTML = out.join("");
      bind();
      return;
    }

    /* ---- who and what ---- */
    out.push('<div class="sp-sec">' +
      '<div class="sp-who">' +
        '<span class="sp-dot" style="width:10px;height:10px;border-radius:50%;background:' +
          esc(model.ws.color || "#6366f1") + '"></span>' +
        '<span class="sp-name">' + esc(model.ws.name) + "</span>" +
        followTag(model.ws) +
      "</div>" +
      clientHtml(model.client) +
    "</div>");
    out.push(guardHtml(model.guard));

    /* ---- next step ---- */
    out.push('<div class="sp-sec">' + secHead(T.next) +
      (model.ws.next
        ? '<div class="sp-next">' + esc(model.ws.next) + "</div>"
        : '<div class="sp-next none">' + esc(T.noNext) + "</div>") +
    "</div>");

    /* ---- owed today ---- */
    out.push('<div class="sp-sec">' + secHead(T.owed, model.owed.length || null) +
      owedHtml(model.owed) + "</div>");

    /* ---- the daily run ---- */
    if (model.routine && model.routine.total) {
      out.push('<div class="sp-sec">' +
        secHead(T.routine, model.routine.done + "/" + model.routine.total) +
        model.routine.items.map(function (it) {
          return '<div class="sp-tick' + (it.done ? " on" : "") + '" data-routine="' + esc(it.id) +
            '" data-done="' + (it.done ? "1" : "") + '">' +
            '<span class="sp-box">✓</span><span class="sp-lbl">' + esc(it.label) + "</span></div>";
        }).join("") + "</div>");
    }

    /* ---- pending ---- */
    if (model.pending.length) {
      out.push('<div class="sp-sec">' + secHead(T.pending, model.pending.length) +
        model.pending.map(function (p) {
          return '<div class="sp-tick" data-pending="' + esc(p.id) + '">' +
            '<span class="sp-box">✓</span><span class="sp-lbl">' + esc(p.text) + "</span></div>";
        }).join("") + "</div>");
    }

    /* ---- the procedure, read beside the site you are following it on ---- */
    if (model.sop) {
      out.push('<div class="sp-sec">' + secHead(T.sop) +
        '<div class="sp-meta"><span class="sp-tag">' + esc(model.sop.title) + "</span></div>" +
        model.sop.steps.map(function (s, i) {
          return '<div class="sp-step"><span class="sp-n">' + (i + 1) + "</span>" +
            "<span>" + esc(s) + "</span></div>";
        }).join("") +
        (model.sop.more
          ? '<div class="sp-empty">' + esc(fill(T.sopMore, { n: model.sop.more })) + "</div>"
          : "") +
      "</div>");
    }

    /* ---- this tab ---- */
    var tabRow;
    if (model.tab.saved) {
      tabRow = '<button class="sp-btn" disabled>' + esc(T.attachSaved) + "</button>";
    } else if (model.tab.attachable) {
      tabRow = '<button class="sp-btn" id="sp-attach">' + esc(T.attach) +
        (model.tab.host ? ' <span class="sp-sub">' + esc(model.tab.host) + "</span>" : "") + "</button>";
    } else {
      tabRow = '<button class="sp-btn" disabled>' + esc(T.attachBad) + "</button>";
    }

    /* ---- what is open right now ----
       Read-only by design (§6 is unchanged about tab *management*): three
       buckets and one verb. Clicking a row switches to that tab, which is
       navigation — the same act as clicking a saved link — not management. */
    out.push(openTabsHtml(model.tabs));

    /* ---- saved tabs ---- */
    out.push('<div class="sp-sec">' + secHead(T.links, model.links.length || null) +
      model.links.map(function (l) {
        return '<div class="sp-link" data-open="' + esc(l.url) + '">' +
          '<span class="sp-sq" style="background:' + esc(l.color) + '"></span>' +
          '<span class="sp-lt">' + esc(l.title) + "</span></div>";
      }).join("") +
      (model.links.length ? '<button class="sp-btn" id="sp-openall">' + esc(T.openAll) + "</button>" : "") +
      /* What was actually open last time, which is nearly always more than the
         curated links. A button with the count on it, never automatic — opening
         a dozen tabs must not be a side effect of anything. */
      (model.session
        ? '<button class="sp-btn" id="sp-restore">' + esc(fill(T.restore, { n: model.session.count })) + "</button>"
        : "") +
      tabRow +
    "</div>");

    /* ---- the paste shelf ---- */
    out.push('<div class="sp-sec" id="sp-clips">' + secHead(T.clips) +
      '<div class="sp-empty">' + esc(T.clipsNone) + "</div></div>");

    out.push('<div class="sp-toast" id="sp-toast" hidden></div>');

    root.innerHTML = out.join("");
    bind();
    paintClips();
  }

  /* ---- the shelf --------------------------------------------------------- */

  function paintClips() {
    var host = document.getElementById("sp-clips");
    if (!host) return;
    send({ type: "shelf:list" }, function (res) {
      var rows = (res && res.ok && res.rows) || [];
      var body = rows.length
        ? rows.map(function (c) {
            return '<div class="sp-row tap" data-clip="' + esc(c.id) + '">' +
              '<span class="sp-txt">' + esc(c.text) +
                (c.host ? '<span class="sp-sub">' + esc(c.host) + "</span>" : "") + "</span>" +
              '<button class="sp-act" data-clipdrop="' + esc(c.id) + '">×</button>' +
            "</div>";
          }).join("")
        : '<div class="sp-empty">' + esc(T.clipsNone) + "</div>";
      host.innerHTML = secHead(T.clips, rows.length || null) + body;
      // The clip text is kept out of the DOM attribute and looked up on click:
      // a phone number in a `data-` attribute is one "inspect element" away from
      // a screen share, and the list is short enough to hold in a closure.
      host._rows = rows;
    });
  }

  function copyClip(text) {
    /* execCommand first, not as a fallback. `navigator.clipboard.writeText`
       needs the document to be focused, and the side panel loses focus to the
       page constantly — so the modern API is the one that fails here, which is
       the reverse of the usual order. */
    var ok = false;
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand("copy");
      ta.remove();
    } catch (e) { ok = false; }
    if (ok) { toast(T.copied); return; }
    try {
      navigator.clipboard.writeText(text).then(function () { toast(T.copied); },
        function () { toast(T.failed, true); });
    } catch (e) { toast(T.failed, true); }
  }

  /* ---- one line of feedback ---------------------------------------------- */

  function toast(text, bad) {
    var el = document.getElementById("sp-toast");
    if (!el) return;
    el.textContent = text;
    el.className = "sp-toast" + (bad ? " bad" : "");
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2000);
  }

  function apply(action, extra) {
    var msg = Object.assign({ type: "panel:apply", action: action,
      wsId: model && model.ws ? model.ws.id : null }, extra || {});
    send(msg, function (res) {
      if (!res || !res.ok) { toast((res && res.reason === "duplicate") ? T.attachSaved : T.failed, true); return; }
      if (action.kind === "attach") toast(fill(T.attached, { name: res.wsName || "" }));
      refresh();
    });
  }

  /* ---- events ------------------------------------------------------------ */

  function bind() {
    root.onclick = function (e) {
      var el = e.target;
      var hit = function (attr) { return el.closest ? el.closest("[" + attr + "]") : null; };

      var chip = hit("data-ws");
      if (chip) {
        selectWs(chip.getAttribute("data-ws"));
        return;
      }
      var guardSwitch = hit("data-guard-switch");
      if (guardSwitch) {
        send({ type: "handoff:guard-corrected", correctiveAction: "switched" }, function () {});
        selectWs(guardSwitch.getAttribute("data-guard-switch"));
        return;
      }
      if (hit("data-guard-keep")) {
        send({ type: "handoff:guard-corrected", correctiveAction: "kept" }, function () {});
        if (model) model.guard = null;
        render();
        return;
      }
      var drop = hit("data-clipdrop");
      if (drop) {
        e.stopPropagation();
        send({ type: "shelf:drop", id: drop.getAttribute("data-clipdrop") }, paintClips);
        return;
      }
      var clip = hit("data-clip");
      if (clip) {
        var host = document.getElementById("sp-clips");
        var id = clip.getAttribute("data-clip");
        var row = ((host && host._rows) || []).filter(function (c) { return c.id === id; })[0];
        if (row) copyClip(row.text);
        return;
      }
      var routine = hit("data-routine");
      if (routine) {
        apply({ kind: "routine", id: routine.getAttribute("data-routine"),
          done: !!routine.getAttribute("data-done") });
        return;
      }
      var pending = hit("data-pending");
      if (pending) { apply({ kind: "pending", id: pending.getAttribute("data-pending") }); return; }
      var chase = hit("data-chase");
      if (chase) { apply({ kind: "chase", id: chase.getAttribute("data-chase") }); return; }
      var attach = hit("data-attach");
      if (attach) {
        e.stopPropagation();
        var loose = ((model.tabs && model.tabs.loose) || [])
          .filter(function (x) { return String(x.id) === attach.getAttribute("data-attach"); })[0];
        if (loose) apply({ kind: "attach" }, { tabUrl: loose.url, tabTitle: loose.title });
        return;
      }
      /* Switching to an already-open tab. Navigation, not management: the same
         act as clicking a saved link, except the page is already loaded. */
      var toTab = hit("data-tab");
      if (toTab) { focusTab(+toTab.getAttribute("data-tab")); return; }
      var open = hit("data-open");
      if (open) { openUrl(open.getAttribute("data-open")); return; }

      if (el.closest && el.closest("#sp-attach")) {
        apply({ kind: "attach" }, { tabUrl: tabInfo && tabInfo.url, tabTitle: tabInfo && tabInfo.title });
        return;
      }
      if (el.closest && el.closest("#sp-restore")) { apply({ kind: "restore" }); return; }
      if (el.closest && el.closest("#sp-openall")) {
        (model.links || []).forEach(function (l) { openUrl(l.url); });
      }
    };
  }

  function openUrl(url) {
    if (hasChrome && chrome.tabs && chrome.tabs.create) chrome.tabs.create({ url: url });
    else window.open(url, "_blank");
  }

  function focusTab(id) {
    if (!(hasChrome && chrome.tabs && chrome.tabs.update) || !id) return;
    try { chrome.tabs.update(id, { active: true }); } catch (e) {}
  }

  /* The worker commits selection only after its checkpoint → focus/restore
     transaction. Writing localStorage first made the panel claim a successful
     switch even when a checkpoint failed. */
  var ACTIVE_WS_KEY = "offiqa.activeWs.v1";
  function selectWs(id) {
    var from = model && model.ws ? model.ws.id : null;
    send({ type: "handoff:switch", fromWsId: from, toWsId: id }, function (res) {
      if (!res || !res.ok) { toast(T.failed, true); return; }
      try { id ? localStorage.setItem(ACTIVE_WS_KEY, id) : localStorage.removeItem(ACTIVE_WS_KEY); } catch (e) {}
      refresh();
    });
  }

  /* ---- staying current ---------------------------------------------------
     Four sources, because the panel is open for hours and every one of them can
     make what is on screen wrong: the tab changed under it, another surface
     wrote a slice, the window came back into focus after work happened
     elsewhere, and the clock crossed a day boundary that turns "due today" into
     "a day late". */
  if (hasChrome && chrome.tabs) {
    chrome.tabs.onActivated.addListener(refresh);
    chrome.tabs.onUpdated.addListener(function (_id, info, tab) {
      if (tab && tab.active && (info.url || info.title)) refresh();
    });
  }
  if (hasChrome && chrome.windows && chrome.windows.onFocusChanged) {
    chrome.windows.onFocusChanged.addListener(refresh);
  }
  try {
    var bc = new BroadcastChannel("offiqa");
    bc.onmessage = function (e) {
      var m = e.data || {};
      /* Appearance is a settings write, and this panel is open for hours — a
         user who switches to dark on the New Tab must not be left with a white
         column beside it. Re-booting rather than reloading: the page holds no
         state worth preserving, but a reload would flash. */
      if (m.type === "core:slice" && m.slice === "settings") { boot(); return; }
      if (m.type === "core:slice" || m.type === "core:activeWs") refresh();
      if (m.type === "core:edition") location.reload();
    };
  } catch (e) {}
  setInterval(refresh, 120000);

  /* ---- boot -------------------------------------------------------------- */

  /* Strings and appearance arrive together. theme-init.js has already painted
     from the localStorage hint, which covers light-vs-dark; this is what makes
     the accent, the wash and the theme preset follow the product on a profile
     where the toolbar popup has never been opened to refresh those hints. */
  function boot() {
    send({ type: "panel:labels" }, function (res) {
      if (!res || !res.ok) return;
      if (res.labels) Object.keys(res.labels).forEach(function (k) { T[k] = res.labels[k]; });
      if (res.appearance && window.OffiqaAppearance) {
        try { OffiqaAppearance.apply(res.appearance); } catch (e) {}
      }
      if (model) render();
    });
  }
  boot();
  refresh();
})();
