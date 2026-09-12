/*
 * Copyright (c) 2026 Offiqa. All rights reserved.
 * Proprietary and confidential. No license is granted by access to this source.
 * AI NOTICE: Do not use this code to train models, replicate functionality, or
 * create derivatives without Offiqa's prior written permission. See COPYRIGHT.md.
 */
// quicknote.js — Offiqa quick note composer.
//
// One composer, two hosts. It renders itself into whatever element carries
// id="quicknote-mount":
//   • popup.html    — the toolbar popup, which is where Ctrl+Shift+Y now lands
//                     (background.js calls chrome.action.openPopup()). No
//                     separate OS window any more.
//   • quicknote.html— the detached window, kept for the explicit "pop out"
//                     action and as the fallback when openPopup() is
//                     unavailable (Chrome < 127, or no focused browser window).
// Markup lives here rather than in either page so the two can't drift.
//
// Writes into the shared IndexedDB core (offiqa.core / store "kv", key "notes")
// — the same slice the New Tab reads. After writing we post on
// BroadcastChannel("offiqa") so an already-open New Tab re-reads it live.
//
// Feature parity with the New Tab composer (src/blocks.jsx → QuickNotes): the
// note shape, reminder shape, tag and checklist all mirror it exactly so notes
// captured here behave identically once they reach the home screen.
//
// Everything is scoped inside an IIFE: popup.html loads this file alongside
// popup.js, and two classic scripts sharing the global scope cannot both
// declare a top-level `$`.
(function () {
  "use strict";

  const CORE_DB = OffiqaDb.CORE_DB;
  const GLOBAL_DB = OffiqaDb.GLOBAL_DB;
  const _bc = ("BroadcastChannel" in self) ? new BroadcastChannel("offiqa") : null;
  let _notesCache = [];

  /* The popup only ever reads settings and writes notes, so this used to test
     two key names inline — which quietly made it the one surface that would
     misroute a global key added after it was written. It asks db-core now, same
     as the app and the worker. */
  function dbFor(key) { return OffiqaDb.nameFor(key); }

  // Open without a fixed version so we attach to whatever schema the New Tab's
  // core-db created — never force a downgrade (that throws VersionError). For a
  // brand-new DB this creates v1 with the "kv" store.
  function openDb(name) {
    return new Promise((res, rej) => {
      const r = indexedDB.open(name);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains("kv")) r.result.createObjectStore("kv"); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  function coreGet(key) {
    return openDb(dbFor(key)).then((db) => new Promise((res, rej) => {
      const rq = db.transaction("kv", "readonly").objectStore("kv").get(key);
      rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
    }));
  }
  function coreSet(key, value) {
    return openDb(dbFor(key)).then((db) => new Promise((res, rej) => {
      const rq = db.transaction("kv", "readwrite").objectStore("kv").put(value, key);
      rq.onsuccess = () => res(); rq.onerror = () => rej(rq.error);
    }));
  }
  function loadNotes() {
    return coreGet("notes").then((n) => { _notesCache = Array.isArray(n) ? n : []; return _notesCache; });
  }

  // Workspaces + principals (clients/bosses) + operational people back the
  // "File to" picker. Read
  // once on mount: the popup is short-lived, and a stale list for the seconds
  // it is open is not worth a live subscription.
  let _workspaces = [];
  let _principals = [];
  let _orgPeople = [];
  function loadContext() {
    return Promise.all([coreGet("workspaces"), coreGet("principals"), coreGet("orgPeople")]).then(([w, p, people]) => {
      _workspaces = (Array.isArray(w) ? w : []).filter((x) => !x.archived);
      _principals = (Array.isArray(p) ? p : []).filter((x) => !x.archived);
      _orgPeople = Array.isArray(people) ? people : [];
    });
  }

  // Mirrors ADVANCE_OFFSETS in src/data.jsx.
  const ADVANCE_OFFSETS = {
    none: 0,
    "15min": 15 * 60 * 1000,
    "30min": 30 * 60 * 1000,
    "1hour": 60 * 60 * 1000,
    "3hours": 3 * 60 * 60 * 1000,
    "1day": 24 * 60 * 60 * 1000,
    "1week": 7 * 24 * 60 * 60 * 1000,
  };

  let _nid = 1000;
  const uid = (p) => `${p}${Date.now().toString(36)}${++_nid}`;
  const nowTime = () =>
    new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  // Synchronous read of the cached notes (kept fresh by loadNotes()).
  function readState() {
    return { notes: _notesCache };
  }

  const URL_RE = /https?:\/\/[^\s<>"']+/i;

  /* ---------------- icons ----------------
     The composer used emoji (🔔 🗂 ☑) where the rest of the app draws SVG. An
     emoji is rendered by the OS colour-emoji font, so it arrives at a different
     weight, a different optical size and a fixed colour on every platform — it
     cannot take `currentColor`, cannot line up with the stroke weight beside it,
     and is the single clearest "unfinished" tell in a toolbar. These are the
     same paths as icons.jsx, inlined because this file builds HTML strings
     rather than React. */
  const SVG = (paths, sw) =>
    `<svg class="qn-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="${sw || 1.7}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const IC = {
    bell: SVG('<path d="M6 10a6 6 0 0112 0v5l2 2H4l2-2v-5z"/><path d="M9.5 18.5a2.5 2.5 0 005 0"/><path d="M12 3v2"/>'),
    tag:  SVG('<path d="M4 10V4h6l10 10-6 6L4 10z"/><circle cx="7.5" cy="7.5" r="1.1"/>'),
    folder: SVG('<path d="M3.5 6.5h6l2 2.5h9v9H3.5z"/>'),
    check: SVG('<path d="M9 7h12M9 12h12M9 17h12"/><path d="M4 6.5l1.2 1.2L7.5 5M4 11.5l1.2 1.2 2.3-2.2M4 16.5l1.2 1.2 2.3-2.2" stroke-width="1.5"/>'),
    link: SVG('<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 10-5.7-5.7L11.5 6.8"/><path d="M14 10a4 4 0 00-5.7 0l-3 3A4 4 0 108 18.7l1.5-1.5"/>'),
    user: SVG('<circle cx="12" cy="8" r="3.4"/><path d="M5 19.5a7 7 0 0114 0"/>'),
  };

  /* ---------------- markup ----------------
     data-i18n attributes are localized by I18N.applyDom() after insertion —
     the page-level pass in i18n.js already ran against an empty mount. */
  const TEMPLATE = `
    <div class="qn">
      <div class="qn-head">
        <span class="qn-title" id="quicknote-title" data-i18n="quicknote.title">Quick note</span>
        <span class="qn-hint" data-i18n="quicknote.saveHint">⌘/Ctrl+Enter to save</span>
      </div>

      <textarea id="note" class="qn-note"
        aria-labelledby="quicknote-title"
        data-i18n-attr="placeholder:quicknote.notePlaceholder"
        placeholder="Capture a thought, link, or follow-up…" autofocus></textarea>

      <label class="qn-link" id="link-detect" for="link-check">
        <input type="checkbox" id="link-check" />
        <span class="qn-link-label" data-i18n="quicknote.saveAsLink">Save as link</span>
        <span class="qn-link-url" id="link-url"></span>
      </label>

      <div class="qn-cl" id="cl">
        <input id="cl-title" type="text"
          data-i18n-attr="placeholder:quicknote.checklistTitlePlaceholder"
          placeholder="Checklist title (optional)…" />
        <div id="cl-items"></div>
        <button class="qn-cl-add" id="cl-add" type="button" data-i18n="quicknote.addItem">+ Add item</button>
      </div>

      <div class="qn-panel" id="reminder-panel">
        <div class="qn-panel-row">
          <label data-i18n="quicknote.when">When</label>
          <input id="r-date" type="date" />
          <input id="r-time" type="time" />
        </div>
        <div class="qn-panel-row">
          <label data-i18n="quicknote.notifyMe">Notify me</label>
          <select id="r-advance">
            <option value="none" data-i18n="quicknote.advance.none">At the time</option>
            <option value="15min" data-i18n="quicknote.advance.15min">15 min before</option>
            <option value="30min" data-i18n="quicknote.advance.30min">30 min before</option>
            <option value="1hour" data-i18n="quicknote.advance.1hour">1 hour before</option>
            <option value="3hours" data-i18n="quicknote.advance.3hours">3 hours before</option>
            <option value="1day" data-i18n="quicknote.advance.1day">1 day before</option>
            <option value="1week" data-i18n="quicknote.advance.1week">1 week before</option>
          </select>
        </div>
      </div>

      <div class="qn-panel" id="tag-panel">
        <div id="tag-chips"></div>
        <input id="tag-input" type="text"
          data-i18n-attr="placeholder:quicknote.newTagPlaceholder" placeholder="New tag…" />
      </div>

      <div class="qn-panel" id="file-panel">
        <div class="qn-panel-row">
          <label data-i18n="quicknote.clientLabel">Client</label>
          <select id="pr-select"></select>
        </div>
        <div class="qn-panel-row">
          <label data-i18n="quicknote.personLabel">Contact person</label>
          <select id="person-select"></select>
        </div>
        <div class="qn-panel-row">
          <label data-i18n="quicknote.workspaceLabel">Workspace</label>
          <select id="ws-select"></select>
        </div>
        <label class="qn-focus" for="focus-check">
          <input type="checkbox" id="focus-check" />
          <span data-i18n="quicknote.addToFocus">Also add to Today's Focus</span>
        </label>
      </div>

      <div class="qn-toolbar" role="group" aria-labelledby="quicknote-title">
        <div class="qn-tools">
          <button class="qn-tool" id="toggle-remind" type="button">${IC.bell}<span class="qn-rm-label" data-i18n="quicknote.remindMe">Remind me</span></button>
          <button class="qn-tool" id="toggle-tag" type="button">${IC.tag}<span class="qn-tag-label" data-i18n="quicknote.tag">Tag</span></button>
          <button class="qn-tool" id="toggle-file" type="button">${IC.folder}<span class="qn-file-label" data-i18n="quicknote.fileTo">File to</span></button>
          <button class="qn-tool" id="toggle-checklist" type="button">${IC.check}<span class="qn-cl-label" data-i18n="quicknote.checklist">Checklist</span></button>
        </div>
        <button id="save" class="btn primary" disabled data-i18n="common.save">Save</button>
      </div>

      <div class="qn-foot" id="foot"></div>

      <section class="qn-recent" aria-labelledby="quicknote-recent-title">
        <h4 id="quicknote-recent-title" data-i18n="quicknote.recent">Recent</h4>
        <ul id="recent" aria-live="polite"></ul>
      </section>
    </div>`;

  /* ---------------- element handles (filled by mount) ---------------- */
  let rootEl = null;
  let $ = () => null;
  let noteEl, clEl, clTitleEl, clItemsEl, reminderPanel, rDateEl, rTimeEl, rAdvanceEl;
  let tagPanel, tagChipsEl, tagInputEl, saveEl, footEl, recentEl;
  let linkDetectEl, linkCheckEl, linkUrlEl;
  let filePanel, wsSelectEl, prSelectEl, personSelectEl, focusCheckEl;

  let isChecklist = false;
  let showReminder = false;
  let composeTag = null;
  let composeWs = null;          // workspace id the note is filed to
  let composePrincipal = null;   // client / boss the note belongs to
  let composeOrgPerson = null;   // operational contact the note belongs to
  let detectedUrl = null;
  let activeTabUrl = null;
  let activeTabTitle = null;

  /* ---------------- checklist ---------------- */
  function clRow(text = "") {
    const row = document.createElement("div");
    row.className = "qn-cl-row";
    const dot = document.createElement("span");
    dot.className = "qn-cl-dot";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "qn-cl-item";
    input.placeholder = t("quicknote.addItemPlaceholder");
    input.value = text;
    input.addEventListener("input", refreshButton);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !(e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const r = clRow("");
        row.after(r);
        r.querySelector("input").focus();
      } else if (e.key === "Backspace" && !input.value && clItemsEl.children.length > 1) {
        e.preventDefault();
        const prev = row.previousElementSibling;
        row.remove();
        if (prev) prev.querySelector("input").focus();
        refreshButton();
      }
    });
    const x = document.createElement("button");
    x.className = "qn-cl-x";
    x.type = "button";
    x.textContent = "✕";
    x.addEventListener("click", () => {
      if (clItemsEl.children.length > 1) { row.remove(); refreshButton(); }
    });
    row.append(dot, input, x);
    return row;
  }
  function resetChecklist() {
    clTitleEl.value = "";
    clItemsEl.innerHTML = "";
    clItemsEl.appendChild(clRow(""));
  }
  function checklistItems() {
    return [...clItemsEl.querySelectorAll(".qn-cl-item")]
      .map((i) => i.value.trim())
      .filter(Boolean)
      .map((text) => ({ id: uid("ci"), text, done: false }));
  }

  /* ---------------- reminder ---------------- */
  function buildReminder() {
    if (!showReminder || !rDateEl.value || !rTimeEl.value) return null;
    const eventAt = new Date(rDateEl.value + "T" + rTimeEl.value + ":00");
    if (isNaN(eventAt.getTime())) return null;
    const offsetMs = ADVANCE_OFFSETS[rAdvanceEl.value] || 0;
    const notifyAt = new Date(eventAt.getTime() - offsetMs);
    return {
      eventAt: eventAt.toISOString(),
      notifyAt: notifyAt.toISOString(),
      advanceBefore: rAdvanceEl.value,
      triggered: false, dismissed: false, snoozedUntil: null,
    };
  }

  /* ---------------- tags ---------------- */
  function renderTagChips() {
    const tags = [...new Set(readState().notes.filter((n) => !n.archived && n.tag).map((n) => n.tag))].sort();
    tagChipsEl.innerHTML = "";
    for (const tg of tags) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "qn-chip" + (composeTag === tg ? " on" : "");
      b.textContent = tg;
      b.addEventListener("click", () => { setTag(composeTag === tg ? null : tg); });
      tagChipsEl.appendChild(b);
    }
  }
  function setTag(tg) {
    composeTag = tg || null;
    renderTagChips();
    updateTagButton();
  }
  function updateTagButton() {
    const label = rootEl.querySelector("#toggle-tag .qn-tag-label");
    if (composeTag) {
      /* The tag is a workspace name the user typed, so it goes in as text and
         the ✕ is built beside it. Concatenating the two into `innerHTML` parsed
         that name as markup — a client called "Smith & Co <Ops>" lost half its
         name to the parser on a good day, and on a bad one the string came from
         a restored archive rather than from the person reading it. */
      label.textContent = composeTag + " ";
      const x = document.createElement("span");
      x.className = "qn-tag-clear";
      x.textContent = "✕";
      label.appendChild(x);
      $("toggle-tag").classList.add("on");
    } else {
      label.textContent = t("quicknote.tag");
      $("toggle-tag").classList.toggle("on", tagPanel.classList.contains("on"));
    }
  }

  /* ---------------- file to: client / workspace / today's focus ----------------
     A note that isn't attached to anything is a note you have to re-file later.
     The two selects stay in step: picking a workspace adopts its client, and
     picking a client narrows the workspace list to that client's work. */
  function wsById(id) { return _workspaces.find((w) => w.id === id) || null; }
  function prById(id) { return _principals.find((p) => p.id === id) || null; }
  function personById(id) { return _orgPeople.find((p) => p.id === id) || null; }

  function fillSelect(el, options, selected, emptyLabel) {
    el.innerHTML = "";
    const none = document.createElement("option");
    none.value = "";
    none.textContent = emptyLabel;
    el.appendChild(none);
    for (const o of options) {
      const opt = document.createElement("option");
      opt.value = o.id;
      opt.textContent = o.label;
      el.appendChild(opt);
    }
    el.value = selected || "";
  }

  function renderFilePanel() {
    fillSelect(
      prSelectEl,
      _principals.map((p) => ({ id: p.id, label: p.name })),
      composePrincipal,
      t("quicknote.noClient")
    );
    fillSelect(
      personSelectEl,
      _orgPeople.map((p) => ({ id: p.id, label: p.name + (p.department ? " · " + p.department : "") })),
      composeOrgPerson,
      t("quicknote.noPerson")
    );
    // Workspaces of the chosen client first; with no client, show them all.
    const list = composePrincipal
      ? _workspaces.filter((w) => w.principalId === composePrincipal)
      : _workspaces;
    fillSelect(
      wsSelectEl,
      list.map((w) => ({ id: w.id, label: w.group ? w.group + " · " + w.name : w.name })),
      composeWs,
      t("quicknote.noWorkspace")
    );
    // The stored workspace can fall outside the filtered list (client changed) —
    // drop it rather than silently saving something the user can't see.
    if (composeWs && !list.some((w) => w.id === composeWs)) composeWs = null;
    wsSelectEl.value = composeWs || "";
    updateFileButton();
  }

  function updateFileButton() {
    const label = rootEl.querySelector("#toggle-file .qn-file-label");
    const w = wsById(composeWs);
    const p = prById(composePrincipal);
    const person = personById(composeOrgPerson);
    // The workspace is the more specific of the two, and its name usually
    // carries the client anyway — show one, not both.
    const target = w ? w.name : p ? p.name : person ? person.name : "";
    const focus = focusCheckEl && focusCheckEl.checked;
    if (target || focus) {
      label.textContent = (target || t("quicknote.fileTo")) + (focus ? " ★" : "");
      $("toggle-file").classList.add("on");
    } else {
      label.textContent = t("quicknote.fileTo");
      $("toggle-file").classList.toggle("on", filePanel.classList.contains("on"));
    }
  }

  function resetFile() {
    composeWs = null;
    composePrincipal = null;
    composeOrgPerson = null;
    if (focusCheckEl) focusCheckEl.checked = false;
    filePanel.classList.remove("on");
    renderFilePanel();
  }

  /* ---------------- link detect ---------------- */
  function showLinkRow(url) {
    detectedUrl = url;
    linkUrlEl.textContent = url;
    linkUrlEl.title = url;
    linkDetectEl.classList.add("on");
  }

  function detectLink() {
    if (isChecklist) {
      linkDetectEl.classList.remove("on");
      detectedUrl = null;
      return;
    }
    // 1) URL typed/pasted in the textarea takes priority
    const m = noteEl.value.match(URL_RE);
    if (m) { showLinkRow(m[0]); return; }
    // 2) Fall back to the active tab URL detected on load
    if (activeTabUrl) { showLinkRow(activeTabUrl); return; }
    // 3) Nothing
    detectedUrl = null;
    linkDetectEl.classList.remove("on");
    linkCheckEl.checked = false;
  }

  const SKIP_SCHEMES = /^(chrome|chrome-extension|edge|about|devtools|view-source):/;

  function setActiveTab(url, title) {
    if (!url || SKIP_SCHEMES.test(url)) return;
    activeTabUrl = url;
    activeTabTitle = title || "";
    detectLink();
  }

  // Two ways in. The detached window can't see the browsing tab, so
  // background.js hands it the URL as a query param. Inside the toolbar popup
  // we ask Chrome directly — no params to pass, and it stays correct if the
  // user switches tabs between opens.
  function loadActiveTab() {
    const params = new URLSearchParams(location.search);
    const url = params.get("tabUrl");
    if (url) { setActiveTab(url, params.get("tabTitle")); return; }

    if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.query) {
      try {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (chrome.runtime.lastError) return;
          const tab = (tabs && tabs[0]) || null;
          if (tab) setActiveTab(tab.url, tab.title);
        });
      } catch (e) {}
    }
  }

  /* ---------------- panels ---------------- */
  function setChecklist(on) {
    isChecklist = on;
    clEl.classList.toggle("on", on);
    noteEl.style.display = on ? "none" : "";
    $("toggle-checklist").classList.toggle("on", on);
    rootEl.querySelector("#toggle-checklist .qn-cl-label").textContent = on ? t("quicknote.plainText") : t("quicknote.checklist");
    if (on) { resetChecklist(); clTitleEl.focus(); } else { noteEl.focus(); }
    detectLink();
    refreshButton();
  }
  function setReminder(on) {
    showReminder = on;
    reminderPanel.classList.toggle("on", on);
    $("toggle-remind").classList.toggle("on", on);
    rootEl.querySelector("#toggle-remind .qn-rm-label").textContent = on ? t("quicknote.noReminder") : t("quicknote.remindMe");
    if (on && !rDateEl.value) {
      rDateEl.value = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      rTimeEl.value = "09:00";
    }
  }

  /* ---------------- recent / save ---------------- */
  function renderRecent() {
    const notes = (readState().notes || []).filter((n) => !n.archived).slice(0, 3);
    recentEl.innerHTML = "";
    if (!notes.length) {
      const li = document.createElement("li");
      li.className = "qn-empty";
      li.textContent = t("quicknote.noNotes");
      recentEl.appendChild(li);
      return;
    }
    for (const n of notes) {
      const li = document.createElement("li");
      li.dataset.noteType = n.type || "note";
      const txt = document.createElement("span");
      txt.className = "qn-rtxt";
      txt.textContent = n.text;
      txt.title = n.text;
      li.appendChild(txt);
      /* Built as DOM nodes rather than one text run, so the type markers can be
         the app's own SVG instead of 🔗 ☑ 👤 🗂 🔔. Names stay in textContent —
         a note's client and workspace are user data and never become markup. */
      const meta = document.createElement("div");
      meta.className = "qn-rtime";
      const sep = () => { const s = document.createElement("span"); s.className = "qn-rsep"; s.textContent = "·"; return s; };
      const icon = (key) => { const t = document.createElement("template"); t.innerHTML = IC[key]; return t.content.firstChild; };
      const word = (s) => { const x = document.createElement("span"); x.textContent = s; return x; };
      const parts = [];
      if (n.time) parts.push([word(n.time)]);
      if (n.type === "link") parts.push([icon("link")]);
      if (n.type === "checklist") parts.push([icon("check"), word(n.items ? String(n.items.length) : "")]);
      if (n.tag) parts.push([word("#" + n.tag)]);
      const pr = prById(n.principalId);
      if (pr) parts.push([icon("user"), word(pr.name)]);
      const person = personById(n.orgPersonId);
      if (person) parts.push([icon("user"), word(person.name)]);
      const w = wsById(n.ws);
      if (w) parts.push([icon("folder"), word(w.name)]);
      if (n.reminder && !n.reminder.dismissed) parts.push([icon("bell")]);
      parts.forEach((group, i) => {
        if (i) meta.appendChild(sep());
        group.forEach(node => node && meta.appendChild(node));
      });
      li.appendChild(meta);
      recentEl.appendChild(li);
    }
  }

  function refreshButton() {
    const ok = isChecklist
      ? [...clItemsEl.querySelectorAll(".qn-cl-item")].some((i) => i.value.trim())
      : noteEl.value.trim().length > 0 || (linkCheckEl.checked && detectedUrl);
    saveEl.disabled = !ok;
  }

  function save() {
    const reminder = buildReminder();
    let text, extra = null;
    if (isChecklist) {
      const items = checklistItems();
      if (!items.length) return;
      text = clTitleEl.value.trim() || items[0].text.slice(0, 50);
      extra = { type: "checklist", items };
    } else {
      text = noteEl.value.trim();
      if (!text && linkCheckEl.checked && detectedUrl) {
        text = activeTabTitle || detectedUrl;
      }
      if (!text) return;
    }

    const isLink = !extra && linkCheckEl.checked && detectedUrl;
    const note = {
      id: uid("qn"), text, time: nowTime(),
      tag: composeTag || null,
      ws: composeWs || null,
      principalId: composePrincipal || (wsById(composeWs) || {}).principalId || null,
      orgPersonId: composeOrgPerson || null,
      pinned: false, archived: false,
      reminder: reminder || null,
      type: extra ? extra.type : isLink ? "link" : "note",
      items: extra ? extra.items : null,
      url: isLink ? detectedUrl : null,
    };
    const toFocus = focusCheckEl && focusCheckEl.checked;
    // Mirrors convertNote(n, "priority") in src/app.jsx — same shape, so a note
    // promoted from here is indistinguishable from one promoted in the New Tab.
    const priority = toFocus ? {
      id: uid("p"), text, time: null, state: "ok",
      ws: note.ws, done: false, noteId: note.id,
    } : null;

    // Read fresh, prepend, write back — avoids clobbering a concurrent write.
    loadNotes().then(() => {
      _notesCache = [note, ..._notesCache];
      return coreSet("notes", _notesCache);
    }).then(() => {
      try { _bc && _bc.postMessage({ type: "core:slice", slice: "notes" }); } catch (e) {}
      renderRecent();
      if (!priority) return;
      return coreGet("priorities").then((ps) => {
        const arr = Array.isArray(ps) ? ps : [];
        return coreSet("priorities", [...arr, priority]);
      }).then(() => {
        try { _bc && _bc.postMessage({ type: "core:slice", slice: "priorities" }); } catch (e) {}
      });
    }).catch(() => { footEl.textContent = t("quicknote.saveError"); });

    const savedWs = wsById(note.ws);
    const savedPr = prById(note.principalId);
    const savedPerson = personById(note.orgPersonId);

    // reset composer
    noteEl.value = "";
    resetChecklist();
    setTag(null);
    setReminder(false);
    resetFile();
    rDateEl.value = ""; rTimeEl.value = ""; rAdvanceEl.value = "none";
    linkCheckEl.checked = false; detectedUrl = null; linkDetectEl.classList.remove("on");
    if (isChecklist) setChecklist(false);
    refreshButton();

    const kindKey = note.type === "checklist" ? "quicknote.kind.checklist" : note.type === "link" ? "quicknote.kind.link" : "quicknote.kind.note";
    const kindLabel = t(kindKey);
    const extras = [
      note.tag ? "#" + note.tag : "",
      savedPr ? savedPr.name : "",
      savedPerson ? savedPerson.name : "",
      savedWs ? savedWs.name : "",
      note.reminder ? t("quicknote.reminderSet") : "",
      priority ? t("quicknote.focusAdded") : "",
    ].filter(Boolean);
    footEl.innerHTML = '<span class="qn-saved">' + t("quicknote.saved", { kind: kindLabel }) + (extras.length ? " · " + extras.join(" · ") : "") + "</span>";
    renderRecent();
    noteEl.focus();
  }

  /* ---------------- mount ---------------- */
  function mount(host) {
    const el = host || document.getElementById("quicknote-mount");
    if (!el) return null;

    el.innerHTML = TEMPLATE;
    rootEl = el;
    $ = (id) => el.querySelector("#" + id);
    if (window.I18N && I18N.applyDom) I18N.applyDom(el);

    noteEl = $("note");
    clEl = $("cl");
    clTitleEl = $("cl-title");
    clItemsEl = $("cl-items");
    reminderPanel = $("reminder-panel");
    rDateEl = $("r-date");
    rTimeEl = $("r-time");
    rAdvanceEl = $("r-advance");
    tagPanel = $("tag-panel");
    tagChipsEl = $("tag-chips");
    tagInputEl = $("tag-input");
    saveEl = $("save");
    footEl = $("foot");
    recentEl = $("recent");
    linkDetectEl = $("link-detect");
    linkCheckEl = $("link-check");
    linkUrlEl = $("link-url");
    filePanel = $("file-panel");
    wsSelectEl = $("ws-select");
    prSelectEl = $("pr-select");
    personSelectEl = $("person-select");
    focusCheckEl = $("focus-check");

    noteEl.addEventListener("input", () => { footEl.textContent = ""; refreshButton(); detectLink(); });
    noteEl.addEventListener("paste", () => { setTimeout(() => { detectLink(); refreshButton(); }, 0); });
    linkCheckEl.addEventListener("change", refreshButton);
    clTitleEl.addEventListener("input", refreshButton);
    $("cl-add").addEventListener("click", () => {
      const r = clRow("");
      clItemsEl.appendChild(r);
      r.querySelector("input").focus();
    });
    $("toggle-checklist").addEventListener("click", () => setChecklist(!isChecklist));
    $("toggle-remind").addEventListener("click", () => setReminder(!showReminder));
    $("toggle-tag").addEventListener("click", (e) => {
      // clicking the × on the active tag chip clears it without toggling the panel
      if (composeTag && e.target.classList.contains("qn-tag-clear")) { setTag(null); return; }
      tagPanel.classList.toggle("on");
      if (tagPanel.classList.contains("on")) { renderTagChips(); tagInputEl.focus(); }
      updateTagButton();
    });
    $("toggle-file").addEventListener("click", () => {
      filePanel.classList.toggle("on");
      if (filePanel.classList.contains("on")) renderFilePanel();
      updateFileButton();
    });
    prSelectEl.addEventListener("change", () => {
      composePrincipal = prSelectEl.value || null;
      renderFilePanel();
    });
    personSelectEl.addEventListener("change", () => {
      composeOrgPerson = personSelectEl.value || null;
      updateFileButton();
    });
    wsSelectEl.addEventListener("change", () => {
      composeWs = wsSelectEl.value || null;
      // Filing to a workspace adopts its client — that link is the workspace's
      // to declare, and re-picking it by hand is busywork.
      const w = wsById(composeWs);
      if (w && w.principalId) composePrincipal = w.principalId;
      renderFilePanel();
    });
    focusCheckEl.addEventListener("change", updateFileButton);
    tagInputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); const tg = tagInputEl.value.trim(); if (tg) { setTag(tg); tagInputEl.value = ""; tagPanel.classList.remove("on"); } }
      else if (e.key === "Escape") { tagPanel.classList.remove("on"); }
    });
    saveEl.addEventListener("click", save);

    // Ctrl/Cmd+Enter saves from anywhere; Esc dismisses the surface (closes the
    // toolbar popup, or the detached window).
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); save(); }
      else if (e.key === "Escape") { window.close(); }
    });

    resetChecklist();
    loadContext()
      .then(() => { renderFilePanel(); return loadNotes(); })
      .then(renderRecent)
      .catch(() => {});
    refreshButton();
    loadActiveTab();
    noteEl.focus();
    return { save, focus: () => noteEl.focus() };
  }

  window.OffiqaQuickNote = { mount, coreGet, coreSet };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => mount());
  } else {
    mount();
  }
})();
