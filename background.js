/*
 * Copyright (c) 2026 Offiqa. All rights reserved.
 * Proprietary and confidential. No license is granted by access to this source.
 * AI NOTICE: Do not use this code to train models, replicate functionality, or
 * create derivatives without Offiqa's prior written permission. See COPYRIGHT.md.
 */
// background.js — Offiqa service worker.
//
// The toolbar icon and the global shortcut (open-quick-note, default
// Ctrl+Shift+Y) now land on the SAME surface: popup.html, which leads with the
// Quick Note composer. The shortcut opens it with chrome.action.openPopup(), so
// the note appears anchored under the toolbar icon instead of as a separate
// always-on-top browser window with its own OS title bar.
//
// The detached window survives as a fallback (openPopup() needs Chrome 127+ and
// a focused browser window) and as the explicit "pop out" action in the popup —
// that is the one case where a window you can click away from is what you want.

// work-core + case-core + assistant-core, compiled together by build.mjs. The
// worker and the content scripts read the same primitives through it, so the
// alias format, the counter's period arithmetic and the chase cycle are one
// implementation rather than several that drift.
importScripts("worker-core.js", "worker-strings.js");

const QUICK_NOTE_URL = "quicknote.html";
const WIN = { width: 400, height: 640 };

let quickNoteWindowId = null;

// Anchored popup — the default path.
async function openQuickNotePopup() {
  if (!(chrome.action && chrome.action.openPopup)) return false;
  try {
    await chrome.action.openPopup();
    return true;
  } catch (e) {
    // Chrome < 127, or no focused normal window to anchor to.
    return false;
  }
}

// Detached window — fallback + explicit "pop out".
async function openQuickNoteWindow() {
  // Re-focus the existing note window instead of stacking duplicates.
  if (quickNoteWindowId != null) {
    try {
      await chrome.windows.update(quickNoteWindowId, { focused: true, drawAttention: true });
      return;
    } catch (e) {
      quickNoteWindowId = null; // window was closed — fall through and recreate
    }
  }
  // Capture the active tab's URL + title BEFORE opening the window, because
  // once it opens it steals focus and becomes the "active" window. (The
  // anchored popup has no such problem — it queries chrome.tabs itself.)
  let qp = "";
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab && tab.url && !/^(chrome|chrome-extension|edge|about):/.test(tab.url)) {
      const p = new URLSearchParams();
      p.set("tabUrl", tab.url);
      if (tab.title) p.set("tabTitle", tab.title);
      qp = "?" + p.toString();
    }
  } catch (e) {}
  const win = await chrome.windows.create({
    url: chrome.runtime.getURL(QUICK_NOTE_URL) + qp,
    type: "popup",
    focused: true,
    width: WIN.width,
    height: WIN.height,
  });
  quickNoteWindowId = win.id;
}

async function openQuickNote() {
  if (await openQuickNotePopup()) return;
  await openQuickNoteWindow();
}

/* ============================================================================
   Inline reply expander
   ============================================================================
   Two jobs live here, because a content script can do neither itself:

   1. The library. Snippets live in IndexedDB on the extension's own origin, so
      a script running on gmail.com cannot open that database — only this worker
      shares the origin. It reads, flattens and hands back plain rows.

   2. The opt-in. Nothing is granted at install time — every host pattern the
      expander uses sits in optional_host_permissions, so the user either says
      yes once for every site or turns them on one at a time. Chrome will not
      let that be pre-granted: optional permissions always cost a confirmation
      dialog, whichever of the two the user picks.

      The set of granted origins IS the setting. There is no stored list beside
      it that could disagree with what Chrome actually allows, and this worker's
      only job is to keep the registered content scripts matching it.
   ============================================================================ */

/* Both names, and the routing rule between them, come from db-core.cjs — the
   same file the app and the Quick Note popup compile. The worker has to answer
   the same question the app does (which database is a given key in) and it has
   to answer it the same way, or a snippet expanded on gmail.com bumps a counter
   the app will never read. Three hand-typed copies is how that starts answering
   differently depending on which surface asked. */
const CORE_DB = OffiqaDb.CORE_DB;
const GLOBAL_DB = OffiqaDb.GLOBAL_DB;

// Which database holds `key`.
function dbFor(key) { return OffiqaDb.nameFor(key); }
const EXPANDER_ID = "offiqa-expander";
const EXPANDER_JS = ["expander-core.js", "snippet.js"];
const LIB_TTL = 3000;                   // ms; a keystroke-fast cache, not a store

// "Every site", as one pattern. Matching optional_host_permissions exactly is
// what lets a single request cover everything and a single revoke undo it.
const ALL_ORIGINS = "*://*/*";

/* The manifest's OWN host permissions — the Gemini, Drive and offiqa.com
   endpoints the app calls. chrome.permissions.getAll() returns these alongside
   whatever the user granted, and they are not an opt-in: without this filter
   the expander would quietly register itself on googleapis.com for someone who
   had never switched a single site on. */
const BASE_ORIGINS = new Set((chrome.runtime.getManifest().host_permissions) || []);

let libCache = null;                    // { rows, myName, at }

/* ---- reading the core database ------------------------------------------- */

// One key out of offiqa.core / store "kv". Opened without a version so the
// worker can never trigger an upgrade the app hasn't asked for — if the DB does
// not exist yet (nothing saved on this profile), the read simply comes back
// empty rather than creating a schema behind the app's back.
function readFrom(dbName, key) {
  return new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(dbName); } catch (e) { resolve(null); return; }
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) { db.close(); resolve(null); return; }
      try {
        const rq = db.transaction("kv", "readonly").objectStore("kv").get(key);
        rq.onsuccess = () => { const v = rq.result; db.close(); resolve(v); };
        rq.onerror = () => { db.close(); resolve(null); };
      } catch (e) { db.close(); resolve(null); }
    };
  });
}

async function coreRead(key) { return readFrom(dbFor(key), key); }

/* Has the app ever run on this profile? Answered by counting keys rather than
   probing a named slice, because every named slice is a slice that could ship
   later and be absent for the same lazy-materialisation reason this exists to
   handle. Zero keys (or no database at all) means there is genuinely nothing to
   write into; anything else means the store is real and a missing key is just
   a slice with no rows yet. */
async function coreHasData() {
  // The work database, not the config one: "has the app ever run" means
  // "is there anything of the user's in here".
  const dbName = dbFor("workspaces");
  return new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(dbName); } catch (e) { resolve(false); return; }
    req.onerror = () => resolve(false);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) { db.close(); resolve(false); return; }
      try {
        const rq = db.transaction("kv", "readonly").objectStore("kv").count();
        rq.onsuccess = () => { const n = rq.result; db.close(); resolve(n > 0); };
        rq.onerror = () => { db.close(); resolve(false); };
      } catch (e) { db.close(); resolve(false); }
    };
  });
}

/* Write into a NAMED database, bypassing the trial gate `coreWrite` applies.
   Used where the write is an edit to something that already exists rather than
   a create — see remindAct. */
function writeTo(dbName, key, value) {
  return new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(dbName); } catch (e) { resolve(false); return; }
    req.onerror = () => resolve(false);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) { db.close(); resolve(false); return; }
      try {
        const tx = db.transaction("kv", "readwrite");
        tx.objectStore("kv").put(value, key);
        tx.oncomplete = () => { db.close(); resolve(true); };
        tx.onerror = () => { db.close(); resolve(false); };
      } catch (e) { db.close(); resolve(false); }
    };
  });
}

/* ---- the read-only lock, worker side --------------------------------------
   The app enforces it by wrapping its one state setter. This worker never loads
   the app, and its inbound doors — a capture filed with Ctrl+Shift+U, fifteen
   minutes logged from the HUD, a routine ticked in the side panel — write
   records straight to the database with no React in the picture. Gating only
   the app would leave every one of those as a way to keep adding after the
   trial ended, which is not a smaller lock, it is no lock.

   So the check goes on `coreWrite`, the single funnel every door writes
   through, using the SAME pure predicate (`OffiqaAccountCore.checkWrite`) the
   app uses. Reading the previous value first is what makes "a record appeared"
   answerable here at all — the doors hand over a whole rebuilt slice, exactly
   as the app's setter does.

   The entitlement comes off the `account` slice, which lives in offiqa.global
   and is therefore reachable by `dbFor` (a GLOBAL_KEY). That is the whole
   reason this is enforceable in the worker: the answer is on a slice it can
   read, not in localStorage, which it cannot.

   Cached briefly. Every HUD keystroke would otherwise open the global database
   to re-read a value that changes when a subscription does, which is to say
   almost never. A stale-by-seconds entitlement cannot wrongly LOCK anyone
   either — `mayCreate` treats an unknown answer as open. */
let _entCache = { value: null, at: 0 };
const ENT_TTL = 15000;

async function workerEntitlement() {
  const now = Date.now();
  if (_entCache.at && now - _entCache.at < ENT_TTL) return _entCache.value;
  let ent = null;
  try {
    const acct = await coreRead("account");
    if (acct && acct.ent) {
      ent = acct.ent;
    } else if (acct && !acct.token) {
      /* The slice is there and holds no token: a real answer, and the answer is
         nobody. Signed out is locked — the trial belongs to an account, so a
         person who never made one has nothing running. Without this branch,
         never signing in was a free tier with no clock on it, reachable from
         every door this worker owns. */
      ent = { signedIn: false, entitled: false };
    } else if (acct === null || acct === undefined) {
      /* No slice at all. On a fresh install that genuinely means signed out,
         but it also means "before the app has ever run", and this worker wakes
         on alarms and shortcuts that can fire first. Treated as unknown, which
         accMayCreate leaves open: a first capture on a brand-new profile must
         not be eaten by a lock the user has had no chance to see explained. */
      ent = null;
    }
  } catch (e) {
    /* A read that threw is not an answer either. An unreadable database must
       never present as an expired subscription. */
    ent = null;
  }
  _entCache = { value: ent, at: now };
  return ent;
}

/* Writes that must NEVER be gated, for the same reasons the app exempts them:
   `notifLog` is how this worker remembers a reminder already rang, and freezing
   it makes every reminder re-fire forever. `accCheckWrite` already ignores
   ungated slices, so this is only a fast path — but it is also the line to read
   when wondering why the bell still works on an expired account. */
async function coreWrite(key, value) {
  const dbName = dbFor(key);
  if (OffiqaAccountCore.sliceIsGated(key)) {
    const ent = await workerEntitlement();
    if (!OffiqaAccountCore.mayCreate(ent)) {
      const before = await readFrom(dbName, key);
      const verdict = OffiqaAccountCore.checkWrite(
        ent, { [key]: before }, { [key]: value });
      if (!verdict.allowed) {
        /* Refused, and said out loud. A door that silently does nothing is the
           worst version of this: the user presses the shortcut, the panel
           closes, and the capture is simply gone. Each caller turns `false`
           into its own on-screen message. */
        console.info("[offiqa] lock: refused a new " + key + " — trial ended");
        return false;
      }
    }
  }
  return writeTo(dbName, key, value);
}

// The app's other surfaces re-read a slice when they hear this. Posting it is
// what makes a line expanded on gmail.com show its bumped count in an already
// open New Tab, instead of only after a reload.
function announce(slice) {
  try { new BroadcastChannel("offiqa").postMessage({ type: "core:slice", slice }); } catch (e) {}
}

async function snippetLibrary() {
  if (libCache && Date.now() - libCache.at < LIB_TTL) return libCache;
  const [sops, settings, wsId, workspaces, principals] = await Promise.all([
    coreRead("sops"), coreRead("settings"),
    coreRead("activeWsId"), coreRead("workspaces"), coreRead("principals"),
  ]);
  const tweaks = (settings && settings.tweaks) || {};

  /* The client half of the variables, for the workspace selected in the app.
     §4.7.2's scope rule is about which SNIPPETS may appear on a page — a card
     tied to one client never shows in another's thread — and it is unchanged.
     This is a different question: given that a general snippet is being
     inserted, what does `{{client_email}}` mean? It means the client you have
     selected, which is the same answer capture gives when it files a fragment
     from gmail.com (§4.7.3). Right far more often than not, and wrong in a way
     you can see, because the value lands as visible text in the box. */
  const ws = (workspaces || []).find((w) => w && w.id === wsId && !w.archived) || null;
  const principal = ws ? (principals || []).find((p) => p && p.id === ws.principalId) : null;
  const clientVars = OffiqaAssistantCore.clientVars(principal);
  if (!clientVars.client && ws && ws.client) clientVars.client = ws.client;

  libCache = {
    rows: OffiqaAssistantCore.expanderRows(sops || []),
    // Kept for compatibility with an already-injected content script from an
    // older build; `vars` is what the current one reads.
    myName: tweaks.userName || null,
    /* `custom` rides alongside rather than being merged in here: autoVars is
       what decides that a user's own field can never take a reserved name, and
       flattening them together first would throw that decision away. */
    vars: Object.assign({}, OffiqaAssistantCore.myVars(tweaks), clientVars,
      { custom: OffiqaAssistantCore.customVars(tweaks) }),
    /* The popup's own four strings, in the language the APP is set to. The
       content script cannot work this out for itself: chrome.i18n answers in
       Chrome's UI language, and `settings.lang` lives in a database a content
       script has no access to — the same wall that put every other injected
       surface's strings in this bundle. */
    i18n: (await appStrings()).expander,
    at: Date.now(),
  };
  return libCache;
}

// Count one expansion. Same counter the in-app palette writes, so the ranking
// is one number wherever the line was used.
async function bumpSnippet(sopId, idx) {
  const sops = await coreRead("sops");
  if (!Array.isArray(sops)) return;
  const next = sops.map((s) => (s && s.id === sopId ? OffiqaAssistantCore.bumpUse(s, idx, Date.now()) : s));
  if (await coreWrite("sops", next)) { libCache = null; announce("sops"); }
}

/* ---- keeping registration in step with the granted origins ---------------- */

// Chrome persists registered content scripts across restarts, and persists
// granted permissions too — but the two can fall out of step (a permission
// revoked from chrome://extensions leaves the script registered and failing).
// Rebuilding from the permission list is cheap and always correct, so it runs
// at every startup and on every grant or revoke rather than being maintained.
// What the expander is actually allowed to run on, as the two states the UI
// offers rather than a raw permission dump:
//   { all: true,  origins: [ALL_ORIGINS] }  — every site
//   { all: false, origins: [...] }          — the sites picked one at a time
//
// "Every site" swallows the per-site list: once it is granted, the individual
// grants underneath it change nothing, so showing them would be a list of
// settings that do not do anything.
async function expanderScope() {
  let origins = [];
  try { origins = (await chrome.permissions.getAll()).origins || []; } catch (e) { return { all: false, origins: [] }; }
  const mine = origins.filter((o) => !BASE_ORIGINS.has(o));
  if (mine.indexOf(ALL_ORIGINS) > -1 || mine.indexOf("<all_urls>") > -1) {
    return { all: true, origins: [ALL_ORIGINS] };
  }
  return { all: false, origins: mine };
}

async function syncExpanderSites() {
  const { origins } = await expanderScope();

  let registered = [];
  try { registered = await chrome.scripting.getRegisteredContentScripts({ ids: [EXPANDER_ID] }); } catch (e) {}

  if (!origins.length) {
    if (registered.length) {
      try { await chrome.scripting.unregisterContentScripts({ ids: [EXPANDER_ID] }); } catch (e) {}
    }
    return;
  }

  const script = {
    id: EXPANDER_ID,
    js: EXPANDER_JS,
    matches: origins,
    allFrames: true,                 // most real compose boxes are in an iframe
    runAt: "document_idle",
    persistAcrossSessions: true,
  };
  try {
    if (registered.length) await chrome.scripting.updateContentScripts([script]);
    else await chrome.scripting.registerContentScripts([script]);
  } catch (e) {
    // A host pattern Chrome will not register (rare, e.g. a scheme it reserves)
    // takes the whole call down with it. Drop back to no script rather than
    // leaving a half-registered one nobody can see or turn off.
    try { await chrome.scripting.unregisterContentScripts({ ids: [EXPANDER_ID] }); } catch (e2) {}
  }
}

/* A registered content script only runs on navigation, so switching a site on
   would otherwise do nothing until the tab was reloaded — and the tab the user
   is looking at is exactly the one they meant. Inject into what is already
   open; snippet.js guards against arriving twice. */
async function injectIntoOpenTabs(origins) {
  if (!origins || !origins.length) return;
  let tabs = [];
  try { tabs = await chrome.tabs.query({ url: origins }); } catch (e) { return; }
  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: EXPANDER_JS,
      });
    } catch (e) { /* a frame we can't touch (PDF viewer, sandboxed) — skip it */ }
  }
}

chrome.permissions.onAdded.addListener(async (perms) => {
  await syncExpanderSites();
  // Inject into what is open using the scope that is now in force, not the raw
  // delta: granting "every site" arrives as one pattern, and the tabs it just
  // took effect on are every tab.
  const { origins } = await expanderScope();
  const added = (perms && perms.origins) || [];
  await injectIntoOpenTabs(added.indexOf(ALL_ORIGINS) > -1 ? [ALL_ORIGINS] : added.filter((o) => !BASE_ORIGINS.has(o)));
  if (!added.length && origins.length) await injectIntoOpenTabs(origins);
});
chrome.permissions.onRemoved.addListener(syncExpanderSites);
chrome.runtime.onStartup.addListener(syncExpanderSites);

// First install — open the New Tab page so the onboarding flow (language pick +
// feature tour) appears immediately, instead of waiting for the user to open a
// New Tab manually. Only on a fresh install, never on update/reload.
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("newtab.html") });
  }
  syncExpanderSites();
});

/* ============================================================================
   Inbound capture
   ============================================================================
   The expander's mirror image. It writes the library out into a page; this
   reads a highlighted fragment back in and files it as a case, a priority or a
   note — the same three units the app already has, and no fourth one.

   The permission story is different, and better. The expander must already be
   running when you start typing, so it can only be a registered content script,
   which costs a host permission per site. Capture begins with a deliberate
   keystroke, and Chrome grants `activeTab` for the current tab whenever the
   user invokes an extension by command — so the script is injected at that
   moment and asks for nothing in advance. Capture therefore works everywhere
   from day one, including sites the expander was never switched on for, and
   still adds no line to the install screen.
   ============================================================================ */

const CAPTURE_JS = ["capture.js"];

function capUid(prefix) {
  return prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* Both on-demand panels arrive here. Neither is a registered content script:
   Chrome grants `activeTab` for the tab in front when the user invokes the
   extension by command, so the file is injected at that moment and asks for
   nothing in advance. */
async function injectOnDemand(tab, files, name) {
  /* The command carries the tab it fired on, but fall back to querying for the
     active one: a command dispatched while focus sits somewhere unusual can
     arrive without it, and "the shortcut did nothing" is the worst possible
     symptom to leave unexplained. */
  let target = tab;
  if (!target || !target.id) {
    try { [target] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); } catch (e) {}
  }
  if (!target || !target.id) {
    console.warn("[offiqa] " + name + ": no active tab to inject into");
    return;
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId: target.id }, files });
  } catch (e) {
    /* Usually a page no extension may touch: chrome://, the Web Store, the PDF
       viewer, or a New Tab that is our own extension page. Nothing can be done
       about it — but it is logged, because a silent catch here is what turns a
       working shortcut and a forbidden page into the same blank result. */
    console.warn("[offiqa] " + name + ": cannot inject into", target.url || target.id, "—", e && e.message);
  }
}

/* Which client the capture belongs to. The app keeps the selected workspace in
   localStorage, which a worker cannot read, so app.jsx mirrors it into the same
   kv store the worker already reads. If that is missing or stale the answer is
   "no client" — the panel then says so on screen rather than filing under a
   guess. */
async function captureContext(text) {
  const [wsId, workspaces, principals] = await Promise.all([
    coreRead("activeWsId"), coreRead("workspaces"), coreRead("principals"),
  ]);
  const ctx = OffiqaAssistantCore.captureContext(wsId, workspaces, principals);

  // Capture is allowed to target another live context. The current workspace is
  // only a default; silently filing competitor research to the wrong campaign
  // would undo the point of an explicit context layer.
  ctx.workspaces = (workspaces || []).filter((w) => w && !w.archived).map((w) => ({ id: w.id, name: w.name || "", principalId: w.principalId || null }));

  ctx.shows = { contacts: true };

  /* What the Contact row would actually file, read back before it is filed.
     Same rule the client chip follows: a guess you can see beats a guess you
     discover next week. Null when the fragment holds no usable person, which is
     how the panel knows to leave the row out entirely rather than offer a
     destination that would save a blank. */
  ctx.contact = (text && ctx.shows.contacts) ? OffiqaAssistantCore.contactDraft(text) : null;

  /* The conversion rides on the context reply rather than a second round-trip.
     The panel is already waiting for this one, the worker has already read
     `principals` to answer it, and a fragment holding no clock costs a regex
     that fails — which is most fragments. A separate message would double the
     latency of the common case to serve the rare one. */
  if (text) {
    try {
      ctx.time = OffiqaAssistantCore.timeConvert(text, {
        principals: principals || [],
        principalId: ctx.principalId,
        now: Date.now(),
      });
    } catch (e) { ctx.time = null; }
  }
  return ctx;
}

/* Everything about WHAT a capture becomes now lives in assistant-core, where
   it is covered by the same Node tests as the rest of the data model. What is
   left here is the part that genuinely needs Chrome: reading and writing the
   database the worker alone shares an origin with. */
/* ============================================================================
   Device data — still the user's
   ============================================================================
   Three things live in `chrome.storage.local` rather than in IndexedDB, each for
   a good reason: the running timer is the worker's control state, the paste
   shelf is a scratch buffer, and a workspace's session is this browser's tab
   state. None of them belongs on Drive, and none belongs in a Tuesday
   afternoon's backup.

   That reasoning is about *where they sync*. It is not a reason for the user to
   be unable to see them, take them or delete them — and for one release they
   could not, which was a plain bug: "Delete all data" wiped every IndexedDB
   slice and left a shelf holding client email addresses and phone numbers
   behind. A delete-all that does not delete all is the worst kind of promise.

   So the same three keys now answer to the same rules as everything else:
   counted on screen, included in the export, and wiped by clear-all.

   **Exported but never imported**, deliberately. The export exists so the data
   is *yours to take*; restoring another machine's tab session or a half-run
   timer onto this one would be restoring a fact that was never true here.
   ============================================================================ */

/* Every key Offiqa owns in storage.local, declared HERE and only here.

   The three sections that use them are spread down this file, and declaring
   each key beside its own section is what produced the bug this comment
   replaces: `DEVICE_KEYS` referenced `SESSION_BASE` two hundred lines before its
   `const` ran, which is a ReferenceError at the top of the worker — and a worker
   that throws at the top takes the quick note, capture, the expander and the HUD
   down with it, silently.

   Keeping the list in one place also means a fourth key cannot be added without
   deciding, in the same edit, what clear-all does with it. */
/* Three pieces of state that sit in storage.local rather than in a database,
   because the worker has to read them on wake without opening one, and because
   the badge has to keep working while no tab is open. */
const SESSION_BASE = "offiqa.sessions";
const SHELF_BASE = "offiqa.shelf";
const TIMER_BASE = "offiqa.timer";
const HANDOFF_METRICS_BASE = "offiqa.handoff.metrics.v1";
const DEVICE_KEYS = [SESSION_BASE, SHELF_BASE, TIMER_BASE, HANDOFF_METRICS_BASE];

async function deviceDump() {
  try {
    const got = await chrome.storage.local.get(DEVICE_KEYS);
    const sum = (base, of) => of(got[base]);
    return {
      ok: true,
      /* Counts for the screen, and the raw values for the export. The counts are
         what makes this honest at a glance: a number you can read is the
         difference between "there is something here" and a promise about it. */
      counts: {
        clips: sum(SHELF_BASE, (v) => (Array.isArray(v) ? v.length : 0)),
        sessions: sum(SESSION_BASE, (v) => (v && typeof v === "object" ? Object.keys(v).length : 0)),
        handoffMetrics: sum(HANDOFF_METRICS_BASE, (v) => (v && Array.isArray(v.events) ? v.events.length : 0)),
        timer: sum(TIMER_BASE, (v) => (v ? 1 : 0)),
      },
      data: got || {},
    };
  } catch (e) { return { ok: false }; }
}

async function deviceClear() {
  try {
    await chrome.storage.local.remove(DEVICE_KEYS);
    _sessionCache = null;
    // The badge is drawn from the timer that no longer exists.
    try { if (chrome.action && chrome.action.setBadgeText) await chrome.action.setBadgeText({ text: "" }); } catch (e) {}
    return { ok: true };
  } catch (e) { return { ok: false }; }
}

/* ---- the paste shelf -----------------------------------------------------
   In chrome.storage.local, beside the running timer, and for the same two
   reasons spelled out in assistant-core: a half-used scratch buffer is not the
   user's data, and it must not reach IndexedDB where cloud sync would carry a
   client's phone number onto a phone and a backup zip would keep it forever.

   The other half of the rule lives in how a clip gets here: never by reading
   the clipboard. Offiqa could ask for that permission and quietly keep a
   history of everything copied all day, which is a keylogger with better
   manners. A clip is on the shelf because it was highlighted and filed, exactly
   like every other capture. */

async function shelfGet() {
  try {
    const key = SHELF_BASE;
    const got = await chrome.storage.local.get(key);
    const list = got && got[key];
    return Array.isArray(list) ? list : [];
  } catch (e) { return []; }
}

async function shelfSet(list) {
  try { await chrome.storage.local.set({ [SHELF_BASE]: list }); return true; }
  catch (e) { return false; }
}

async function shelfAdd(entry) {
  const res = OffiqaAssistantCore.shelfPush(await shelfGet(), entry, { now: Date.now(), uid: capUid });
  if (!res.added) return false;
  return shelfSet(res.list);
}

async function shelfDrop(id) {
  const cur = await shelfGet();
  const next = OffiqaAssistantCore.shelfDrop(cur, id);
  if (next === cur) return true;
  return shelfSet(next);
}

/* ============================================================================
   Workspace sessions
   ============================================================================
   Until now "Resume" opened the workspace's saved links and that was the end of
   it. The saved links are the *curated* set — the four places this piece of work
   lives — and a real afternoon is those four plus eleven others you opened
   along the way. Close the browser and the eleven are gone.

   So a workspace's tabs are now a Chrome tab group, and the group's contents are
   the session. Two decisions shape everything here:

   **The group IS the session.** No separate list to keep in step with the tab
   strip, no bookkeeping that can disagree with what is on screen. Whatever is in
   the group is what gets remembered; drag a tab out and it stops being part of
   the workspace, which is the behaviour the tab strip already teaches.

   **Saving is automatic; restoring never is.** A snapshot costs nothing and
   losing an afternoon costs an afternoon, so it is written whenever the group
   changes. Opening fifteen tabs, on the other hand, is something that must
   never happen because you clicked something else — §4.8 already ships the
   open-a-group button switched OFF by default for exactly this reason. So
   restore is a named button with the count on it.

   **Where it lives:** `chrome.storage.local`, beside the timer and the shelf,
   and for the same reason. A session is this device's browser state, not the
   user's work: syncing it to Drive would have a second machine restore tabs it
   never opened, and a backup zip would keep a Tuesday afternoon forever.
   ============================================================================ */

/* `SESSION_BASE` is declared with the other two device keys near the top — see
   the note there for the ReferenceError that taught us why. */
/* One workspace's session, not a browsing archive. Past this the restore button
   is a promise to open forty tabs, which nobody wants and Chrome handles badly. */
const SESSION_MAX_TABS = 25;

/* Cached, and this one is load-bearing rather than an optimisation.
   Three tab listeners below fire for EVERY tab in the browser, not just ours —
   closing a window with thirty tabs is thirty events. Without a cache that is
   thirty `storage.local` reads to answer a question ("is this tab in a tracked
   group?") that is almost always no. The TTL is short because the worker
   restarts constantly anyway, and every write refreshes it. */
let _sessionCache = null;   // { map, at, key }
const SESSION_TTL = 5000;

async function sessionsGet() {
  const key = SESSION_BASE;
  if (_sessionCache && _sessionCache.key === key &&
      Date.now() - _sessionCache.at < SESSION_TTL) return _sessionCache.map;
  try {
    const got = await chrome.storage.local.get(key);
    const raw = got && got[key];
    const map = (raw && typeof raw === "object") ? raw : {};
    _sessionCache = { map, at: Date.now(), key };
    return map;
  } catch (e) { return {}; }
}

async function sessionsSet(map) {
  try {
    const key = SESSION_BASE;
    await chrome.storage.local.set({ [key]: map });
    _sessionCache = { map, at: Date.now(), key };
    return true;
  } catch (e) { return false; }
}

/* Which workspace a Chrome group belongs to, or null.
   Resolved from the stored map rather than from the group's title: a user can
   rename a group, and a session that stopped being found because of a rename
   would be a session silently lost. */
async function sessionForGroup(groupId) {
  if (groupId == null || groupId < 0) return null;
  const map = await sessionsGet();
  for (const [wsId, s] of Object.entries(map)) {
    if (s && s.groupId === groupId) return { wsId, session: s };
  }
  return null;
}

/* Write down what is in the group right now. Idempotent and cheap enough to run
   on every tab event the group sees. */
async function sessionSnapshot(wsId, groupId) {
  if (!wsId || groupId == null || groupId < 0) return;
  let tabs = [];
  try { tabs = await chrome.tabs.query({ groupId }); } catch (e) { return; }

  const usable = tabs.filter((t) => t && OffiqaLink.attachable(t.url));
  const urls = OffiqaHandoff.normalizeUrls(usable, SESSION_MAX_TABS);

  const map = await sessionsGet();
  /* An empty group is not an empty session — it is a group whose last tab was
     just closed, and overwriting a good snapshot with nothing is how "restore"
     becomes a button that opens zero tabs. The session is dropped only when the
     group itself goes away, below. */
  if (!urls.length) return;
  const activeTab = tabs.find((t) => t && t.active && OffiqaLink.attachable(t.url));
  const activeIndex = activeTab ? urls.findIndex((u) => OffiqaHandoff.normalizeUrl(u.url) === OffiqaHandoff.normalizeUrl(activeTab.url)) : null;
  const now = Date.now();
  map[wsId] = {
    version: 2, groupId, windowId: tabs[0] && Number.isInteger(tabs[0].windowId) ? tabs[0].windowId : null,
    urls, active: activeTab ? { url: activeTab.url, title: (activeTab.title || "").slice(0, 160), index: activeIndex } : null,
    at: now, checkpointAt: now,
  };
  await sessionsSet(map);
  return { ok: true, count: urls.length, truncatedCount: Math.max(0, usable.length - urls.length), session: map[wsId] };
}

/* Debounced: dragging four tabs into a group fires four events, and each one
   would otherwise cost a query plus a write. */
const sessionTimers = {};
function sessionTouch(wsId, groupId) {
  clearTimeout(sessionTimers[wsId]);
  sessionTimers[wsId] = setTimeout(() => {
    sessionSnapshot(wsId, groupId).catch(() => {});
  }, 900);
}

async function sessionOnTab(tab) {
  if (!tab || tab.groupId == null || tab.groupId < 0) return;
  const hit = await sessionForGroup(tab.groupId);
  if (hit) sessionTouch(hit.wsId, tab.groupId);
}

/* Open a workspace's tabs and put them in its group.
   Called from the app rather than done there, because the group has to survive
   the New Tab being closed and the worker is the only thing that outlives it. */
async function sessionOpen(wsId, urls, opts) {
  const o = opts || {};
  const source = urls || [];
  const list = OffiqaHandoff.normalizeUrls(source, SESSION_MAX_TABS);
  if (!list.length) return { ok: false, reason: "empty" };

  const ids = [];
  for (const item of list) {
    const url = item.url || item;
    try {
      /* `active: false` for every one. Fifteen tabs each stealing focus as it
         loads is the browser flickering for four seconds; the group is the
         destination, not any one page in it. */
      const tab = await chrome.tabs.create({ url, active: false });
      if (tab && tab.id != null) ids.push(tab.id);
    } catch (e) { /* one bad URL must not take the other fourteen down */ }
  }
  if (!ids.length) return { ok: false, reason: "empty" };

  let groupId = null;
  try {
    /* Reuse the workspace's existing group when it is still around, so pressing
       Resume twice adds to one group rather than making a second one with the
       same name — two identical groups is the state nobody can reason about. */
    const map = await sessionsGet();
    const prev = map[wsId] && map[wsId].groupId;
    let exists = false;
    if (prev != null && chrome.tabGroups) {
      try { await chrome.tabGroups.get(prev); exists = true; } catch (e) { exists = false; }
    }
    groupId = await chrome.tabs.group(exists ? { groupId: prev, tabIds: ids } : { tabIds: ids });
    if (chrome.tabGroups && o.title) {
      await chrome.tabGroups.update(groupId, { title: o.title, color: o.color || "grey" });
    }
  } catch (e) {
    /* Grouping is the decoration; the tabs are the point. A Chrome that refuses
       to group (an incognito window, a policy) still opened them. */
    console.warn("[offiqa] session: could not group —", e && e.message);
  }

  if (groupId != null) await sessionSnapshot(wsId, groupId);
  return { ok: true, count: ids.length, groupId, truncatedCount: Math.max(0, source.length - list.length) };
}

/* ---- semantic client handoff ------------------------------------------- */
let handoffChain = Promise.resolve();

async function handoffWorkspaces() {
  const list = await coreRead("workspaces");
  return Array.isArray(list) ? list : [];
}
/* Resolve the user-declared account once per transaction.  It is a label, not
   an authenticated identity: this worker intentionally never queries cookies
   or page content. */
async function handoffContext(wsId, loaded) {
  const values = loaded || await Promise.all([coreRead("workspaces"), coreRead("principals")]);
  const workspaces = Array.isArray(values[0]) ? values[0] : [];
  const principals = Array.isArray(values[1]) ? values[1] : [];
  const workspace = workspaces.find((w) => w && w.id === wsId) || null;
  if (!workspace) return null;
  const client = principals.find((p) => p && p.id === workspace.principalId) || null;
  const account = OffiqaWork.wsAccount(workspace, principals);
  return { workspace, workspaces, client, account: account.account, accountSource: account.source,
    color: OffiqaWork.wsColor ? OffiqaWork.wsColor(workspace) : (workspace.color || null) };
}
async function handoffLandingTab(result) {
  if (!result || !Number.isInteger(result.tabId)) return null;
  try { return await chrome.tabs.get(result.tabId); } catch (e) { return null; }
}
async function handoffDecorateGroup(context, groupId) {
  if (!context || groupId == null || !chrome.tabGroups) return;
  try { await chrome.tabGroups.update(groupId, {
    title: OffiqaHandoff.groupTitle(context.workspace.name, context.account, 48),
    color: OffiqaWork.groupColor(context.workspace),
  }); } catch (e) {}
}
async function handoffGuard(context, result) {
  const landingTab = await handoffLandingTab(result);
  const groupId = result && result.groupId != null ? result.groupId : null;
  return OffiqaHandoff.guard(Object.assign({}, context, { landingTab, targetGroupId: groupId }));
}
function handoffBroadcast(wsId, result) {
  try { new BroadcastChannel("offiqa").postMessage({ type: "handoff:completed", wsId, mode: result.mode, guard: result.guard || null }); } catch (e) {}
}
async function sessionSnapshotNow(wsId) {
  const s = OffiqaHandoff.normalizeSession((await sessionsGet())[wsId]);
  if (!s || s.groupId == null) return { ok: true, skipped: true };
  return sessionSnapshot(wsId, s.groupId) || { ok: false, reason: "snapshot" };
}
async function sessionFindLiveGroup(wsId) {
  const map = await sessionsGet();
  const session = OffiqaHandoff.normalizeSession(map[wsId]);
  if (!session || session.groupId == null) return { session, tabs: [] };
  try {
    const tabs = await chrome.tabs.query({ groupId: session.groupId });
    if (tabs && tabs.length) return { session, tabs };
  } catch (e) {}
  map[wsId] = Object.assign({}, session, { groupId: null, windowId: null });
  await sessionsSet(map);
  return { session: map[wsId], tabs: [] };
}
async function sessionFocusLive(wsId, session) {
  const found = await sessionFindLiveGroup(wsId);
  const s = found.session || session;
  if (!found.tabs.length) return { ok: false, reason: "no_live_group" };
  const tab = found.tabs[OffiqaHandoff.activeIndex(s, found.tabs)] || found.tabs[0];
  try {
    if (chrome.tabGroups && s && s.groupId != null) await chrome.tabGroups.update(s.groupId, { collapsed: false });
    if (tab.windowId != null && chrome.windows && chrome.windows.update) await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tab.id, { active: true });
    return { ok: true, mode: "focused_live_group", count: found.tabs.length, groupId: s && s.groupId, tabId: tab.id };
  } catch (e) { return { ok: false, reason: "focus" }; }
}
async function sessionRestore(wsId, sessionOrLinks, opts) {
  const s = OffiqaHandoff.normalizeSession(sessionOrLinks);
  const urls = s ? s.urls : OffiqaHandoff.normalizeUrls(sessionOrLinks || []);
  if (!urls.length) return { ok: false, reason: "empty" };
  const out = await sessionOpen(wsId, urls, opts);
  if (!out.ok) return out;
  const live = await sessionFindLiveGroup(wsId);
  const focused = await sessionFocusLive(wsId, s || live.session);
  return Object.assign(out, { mode: s ? "restored_snapshot" : "opened_curated_links" }, focused.ok ? { tabId: focused.tabId } : {});
}
async function handoffSelect(wsId) {
  const ok = await coreWrite("activeWsId", wsId || null);
  if (ok) {
    try { new BroadcastChannel("offiqa").postMessage({ type: "core:activeWs", id: wsId || null }); } catch (e) {}
  }
  return ok;
}
async function handoffMetricAppend(event) {
  try {
    const got = await chrome.storage.local.get(HANDOFF_METRICS_BASE);
    const log = OffiqaHandoff.metrics(got && got[HANDOFF_METRICS_BASE], Date.now());
    if (!log.enabled) return { ok: true, skipped: true };
    log.events.push(OffiqaHandoff.metric(event, Date.now()));
    log.events = log.events.slice(-1000);
    await chrome.storage.local.set({ [HANDOFF_METRICS_BASE]: log });
    return { ok: true };
  } catch (e) { return { ok: false }; }
}
async function handoffResume(wsId, knownContext, recordMetric) {
  const started = Date.now();
  const context = knownContext || await handoffContext(wsId);
  if (!context) return { ok: false, reason: "workspace" };
  const ws = context.workspace;
  const live = await sessionFindLiveGroup(wsId);
  let result = live.tabs.length ? await sessionFocusLive(wsId, live.session) : null;
  if (!result || !result.ok) {
    const s = OffiqaHandoff.normalizeSession(live.session);
    const title = OffiqaHandoff.groupTitle(ws.name, context.account, 48);
    result = s ? await sessionRestore(wsId, s, { title, color: OffiqaWork.groupColor(ws) })
      : await sessionRestore(wsId, ws.links || [], { title, color: OffiqaWork.groupColor(ws) });
  }
  if (!result || !result.ok) result = { ok: true, mode: "selected_only", count: 0 };
  await handoffSelect(wsId);
  await handoffDecorateGroup(context, result.groupId);
  result.guard = await handoffGuard(context, result);
  result.summary = OffiqaHandoff.summary(ws, (await sessionsGet())[wsId], Date.now());
  handoffBroadcast(wsId, result);
  if (recordMetric !== false) await handoffMetricAppend({ event: "handoff_completed", mode: result.mode,
    durationMs: Date.now() - started, tabCount: result.count || 0, truncatedCount: result.truncatedCount || 0,
    hadNextAction: false, ok: result.ok, guardStatus: result.guard && result.guard.status,
    guardReason: result.guard && result.guard.reason, accountLabelPresent: !!(result.guard && result.guard.expectedAccount), correctiveAction: "none" });
  return result;
}
/* Pause is the one-context version of a handoff: checkpoint first, then tuck
   the live group away without selecting or opening anything else. It makes an
   interruption explicit for assistants who are pulled into a call or a request
   that does not yet deserve its own workspace. */
async function handoffPause(wsId) {
  const context = await handoffContext(wsId);
  if (!context) return { ok: false, reason: "workspace" };
  const checkpoint = await sessionSnapshotNow(wsId);
  if (!checkpoint || !checkpoint.ok) return { ok: false, reason: "snapshot" };
  const live = await sessionFindLiveGroup(wsId);
  if (live.session && live.session.groupId != null && chrome.tabGroups) {
    try { await chrome.tabGroups.update(live.session.groupId, { collapsed: true }); }
    catch (e) { return { ok: false, reason: "collapse" }; }
  }
  const result = { ok: true, mode: "paused", checkpoint: checkpoint,
    summary: OffiqaHandoff.summary(context.workspace, (await sessionsGet())[wsId], Date.now()) };
  try { new BroadcastChannel("offiqa").postMessage({ type: "handoff:paused", wsId }); } catch (e) {}
  return result;
}
async function handoffSwitch(fromWsId, toWsId) {
  const started = Date.now(), loaded = await Promise.all([coreRead("workspaces"), coreRead("principals")]);
  const all = Array.isArray(loaded[0]) ? loaded[0] : [];
  const to = all.find((w) => w && w.id === toWsId);
  const from = all.find((w) => w && w.id === fromWsId);
  const context = await handoffContext(toWsId, loaded);
  if (!to || !context) return { ok: false, reason: "workspace" };
  let checkpoint = { ok: true, skipped: true };
  if (from && from.id !== to.id) {
    checkpoint = await sessionSnapshotNow(from.id);
    if (!checkpoint || !checkpoint.ok) {
      await handoffSelect(to.id);
      const degraded = { ok: true, mode: "selected_only", degraded: "checkpoint_failed", summary: OffiqaHandoff.summary(to, (await sessionsGet())[to.id], Date.now()) };
      degraded.guard = await handoffGuard(context, degraded); handoffBroadcast(to.id, degraded);
      await handoffMetricAppend({ event: "handoff_completed", mode: degraded.mode, durationMs: Date.now() - started,
        tabCount: 0, truncatedCount: 0, hadNextAction: !!(from && from.next && from.next.text), ok: true,
        guardStatus: degraded.guard.status, guardReason: degraded.guard.reason,
        accountLabelPresent: !!degraded.guard.expectedAccount, correctiveAction: "none" });
      return degraded;
    }
    const old = await sessionFindLiveGroup(from.id);
    if (old.session && old.session.groupId != null && chrome.tabGroups) {
      try { await chrome.tabGroups.update(old.session.groupId, { collapsed: true }); } catch (e) {}
    }
  }
  const result = await handoffResume(to.id, context, false);
  result.checkpoint = checkpoint;
  await handoffMetricAppend({ event: "handoff_completed", mode: result.mode, durationMs: Date.now() - started,
    tabCount: result.count || 0, truncatedCount: result.truncatedCount || 0, hadNextAction: !!(from && from.next && from.next.text), ok: result.ok,
    guardStatus: result.guard && result.guard.status, guardReason: result.guard && result.guard.reason,
    accountLabelPresent: !!(result.guard && result.guard.expectedAccount), correctiveAction: "none" });
  return result;
}
function handoffQueue(run) {
  handoffChain = handoffChain.catch(() => {}).then(run);
  return handoffChain;
}

/* The group was closed. The session survives it — that is the entire feature —
   but the group id it points at is now meaningless and must not be reused, or
   the next snapshot writes into a group belonging to somebody else. */
if (chrome.tabGroups && chrome.tabGroups.onRemoved) {
  chrome.tabGroups.onRemoved.addListener(async (group) => {
    const hit = await sessionForGroup(group && group.id);
    if (!hit) return;
    const map = await sessionsGet();
    if (map[hit.wsId]) { map[hit.wsId] = Object.assign({}, map[hit.wsId], { groupId: null }); await sessionsSet(map); }
  });
}

chrome.tabs.onUpdated.addListener((_id, info, tab) => {
  if (info && (info.url || info.groupId != null)) sessionOnTab(tab).catch(() => {});
});
chrome.tabs.onCreated.addListener((tab) => { sessionOnTab(tab).catch(() => {}); });
/* A closed tab takes its groupId with it, so there is nothing to look up —
   every tracked group is re-snapshotted instead. Debounced at the LISTENER,
   not just at the snapshot: closing a window fires this thirty times, and
   thirty passes over the session map is the cost this avoids. */
let sessionSweepTimer = null;
chrome.tabs.onRemoved.addListener(() => {
  clearTimeout(sessionSweepTimer);
  sessionSweepTimer = setTimeout(async () => {
    const map = await sessionsGet();
    for (const [wsId, s] of Object.entries(map)) {
      if (s && s.groupId != null) sessionTouch(wsId, s.groupId);
    }
  }, 700);
});

/* ============================================================================
   Browsing → the work log
   ============================================================================
   The pure half — what counts, how visits fold together, and why a row can
   never become a minute — is `browseLog` in assistant-core, under the same Node
   tests as everything else. What is here is the part that needs Chrome: noticing
   that a tab came to the front, and deciding whether it is any of Offiqa's
   business.

   Three gates, in order, and the first one is the point:

     1. The user switched it on. `tweaks.browseLog !== true` and nothing below
        this line ever runs. §3.1 promises the product does not watch you work;
        the promise it makes now is narrower — that it does not watch you work
        *unless you asked it to* — and a feature that were on by default could
        not make even that one.
     2. The host matches a link a workspace has saved. Not a curated list of
        "work sites": the workspace decides, which means the answer to "why was
        this recorded" is always "because you saved it here".
     3. There is a selected workspace to attribute it to.

   Costs no new permission. The `tabs` permission Offiqa has held since 1.0.0 is
   exactly the one that grants `url` and `title` on a tab — so the install screen
   gains nothing, and what changed is the promise, not the access.
   ============================================================================ */

/* Debounced hard. Switching through six tabs to find one is six activations,
   and only the one you land on is a visit. */
let browseTimer = null;
const BROWSE_SETTLE_MS = 4000;

async function browseEnabled() {
  const settings = await coreRead("settings");
  const tweaks = (settings && settings.tweaks) || {};
  return tweaks.browseLog === true;
}

async function browseNote(tab) {
  if (!tab || !OffiqaLink.attachable(tab.url)) return;
  if (!(await browseEnabled())) return;

  const host = OffiqaAssistantCore.hostOf(tab.url);
  if (!host) return;

  const [wsId, workspaces, principals] = await Promise.all([
    coreRead("activeWsId"), coreRead("workspaces"), coreRead("principals"),
  ]);

  /* Which workspace owns this host — not which one is selected. A tab you have
     saved under Acme is Acme's work even if the bar is on Bright, and
     attributing it to whatever chip happened to be active is the mistake §4.7.4
     already refuses to make with a running timer. */
  const owner = OffiqaAssistantCore.browseOwner(host, workspaces);
  if (!owner) return;

  const strings = (await appStrings()).notify || {};
  const log = await coreRead("activityLog");
  const res = OffiqaAssistantCore.browseLog(Array.isArray(log) ? log : [], {
    host,
    wsId: owner.id,
    principalId: owner.principalId || null,
  }, {
    now: Date.now(),
    uid: capUid,
    text: (strings.browseLine || "Worked in {host}").replace("{host}", host),
  });
  if (!res.changed) return;
  if (!(await coreHasData())) return;
  if (await coreWrite("activityLog", res.list)) announce("activityLog");
}

function browseTouch(tab) {
  clearTimeout(browseTimer);
  browseTimer = setTimeout(() => { browseNote(tab).catch(() => {}); }, BROWSE_SETTLE_MS);
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId).then(browseTouch).catch(() => {});
});
chrome.tabs.onUpdated.addListener((_id, info, tab) => {
  // Only a completed navigation in the tab you are looking at. `status` filters
  // out the several intermediate events every page load fires.
  if (info && info.status === "complete" && tab && tab.active) browseTouch(tab);
});

/* ---- attaching the tab in front of you -----------------------------------
   The one thing a workspace could not do: gain a tab after it was created. The
   New Workspace picker collected open tabs once, and from then on the only road
   in was copy the URL, change tab, paste it into a field — which is the problem
   the product exists to remove, performed by hand.

   Three surfaces call this and all three are outside the app (the popup, the
   context menu, the side panel), which is why it lives here rather than in
   app.jsx. The record it writes goes through link-core, so a tab attached from
   the toolbar is indistinguishable from one ticked in the picker. */
async function attachTab(page, wsId) {
  const workspaces = await coreRead("workspaces");
  if (!Array.isArray(workspaces)) return { ok: false, reason: "noWorkspace" };
  const target = wsId || (await coreRead("activeWsId"));
  const res = OffiqaAssistantCore.wsAttach(workspaces, target, page, { now: Date.now(), uid: capUid });
  if (!res.ok) return { ok: false, reason: res.reason };
  if (!(await coreWrite("workspaces", res.list))) return { ok: false, reason: "write" };
  announce("workspaces");
  const ws = res.list.find((w) => w && w.id === target);
  return { ok: true, title: res.link.title, wsName: (ws && ws.name) || null };
}

async function captureSave(msg) {
  /* The shelf is handled before `captureRecord` rather than inside it, because
     it is the one destination that is not a slice. Keeping it out of the record
     builder is what stops "which store does this go in" from becoming a
     question the pure layer has to answer. */
  /* Every exit from here is `{ ok, reason }`, not a bare boolean, because the
     two ways a capture can fail want opposite advice: a profile whose app has
     never run wants "open the New Tab once", and an expired trial wants to be
     told the trial expired. Both used to return `false` and every surface said
     the first thing — so a locked account was told to retry something that
     could not work. Same shape and the same `<thing>Fail_<reason>` lookup the
     attach item already uses. */
  if (msg && msg.dest === "shelf") {
    return (await shelfAdd({ text: msg.text, url: msg.url }))
      ? { ok: true } : { ok: false, reason: "write" };
  }
  if (msg && msg.dest === "reference") {
    const attached = await attachTab({ url: msg.url, title: msg.pageTitle || msg.title,
      referenceType: msg.referenceType, referenceNote: msg.referenceNote || msg.text }, msg.wsId || null);
    return attached.ok ? attached : { ok: false, reason: attached.reason || "write" };
  }

  const built = OffiqaAssistantCore.captureRecord(msg, {
    now: Date.now(),
    uid: capUid,
    timeLabel: new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
  });
  if (!built) return { ok: false, reason: "badInput" };

  const current = await coreRead(built.slice);
  let list;
  if (Array.isArray(current)) {
    list = current;
  } else {
    /* An absent key is NOT the same as an absent database, and treating them
       alike is what made "file as a case" fail while notes and priorities
       worked. Slices that shipped after 1.0.0 — `cases` among them — are
       materialised lazily: core-db fills them with [] in memory for a real
       install and only writes the key once the app itself stores a row. So on
       any profile that has never created a case, `cases` genuinely does not
       exist in IndexedDB, and refusing to write was refusing the first one.

       The real question is whether the app has ever run here, which the store's
       key count answers without naming any particular slice. */
    if (!(await coreHasData())) {
      console.warn("[offiqa] capture: core store is empty — open Offiqa's New Tab once first");
      return { ok: false, reason: "empty" };
    }
    list = [];
  }

  const next = built.append ? [...list, built.record] : [built.record, ...list];
  if (!(await coreWrite(built.slice, next))) {
    /* Ask the gate rather than assuming: coreWrite also returns false when the
       store itself refuses the put, and telling someone their trial ended when
       IndexedDB simply failed would be its own lie in the other direction. */
    const ent = await workerEntitlement();
    const locked = OffiqaAccountCore.sliceIsGated(built.slice)
      && !OffiqaAccountCore.mayCreate(ent);
    console.warn("[offiqa] capture: write to '" + built.slice + "' failed"
      + (locked ? " — trial ended" : ""));
    return { ok: false, reason: locked ? "locked" : "write" };
  }
  announce(built.slice);
  return { ok: true };
}

/* The injected panels' strings, in the app's saved language rather than the
   browser's — the panel should match the product the user set up, not their
   Chrome locale. Generated from src/locales/*.json by build.mjs (see the note
   there for why the worker cannot just load locales.js).

   Both panels paint in English immediately and swap when these arrive: waiting
   on a round-trip before showing anything would make a keyboard shortcut feel
   slow, which is the entire reason either of them exists. */
async function appStrings() {
  const all = globalThis.__OFFIQA_WORKER_STRINGS__ || {};
  const settings = await coreRead("settings");
  const lang = (settings && (settings.lang || (settings.tweaks && settings.tweaks.lang))) || "en";
  return all[lang] || all.en || { capture: {}, hud: {} };
}

async function captureLabels() {
  return (await appStrings()).capture;
}

/* ============================================================================
   The in-page HUD
   ============================================================================
   Capture files something you read; this records something you did. Same
   activeTab route, same closed-shadow panel, same rule about client scope — the
   difference is that every row here writes to a slice the app already owns,
   through the very same primitive the in-app surface uses.

   The worker's share of the work is the part that genuinely needs Chrome:
   reading the six slices the panel is derived from, and writing the one slice a
   tap changes. What the panel contains and what a tap means both live in
   assistant-core, under the same Node tests as the rest of the data model.
   ============================================================================ */

const HUD_JS = ["hud.js"];

// The slices the panel is derived from. Read together so the model is one
// consistent snapshot rather than six reads a tap could interleave with.
async function hudSlices() {
  const [wsId, workspaces, principals, goals, cases, activityLog] = await Promise.all([
    coreRead("activeWsId"), coreRead("workspaces"), coreRead("principals"),
    coreRead("goals"), coreRead("cases"), coreRead("activityLog"),
  ]);
  return {
    wsId: wsId || null,
    slices: {
      workspaces: workspaces || [], principals: principals || [],
      goals: goals || [], cases: cases || [], activityLog: activityLog || [],
    },
  };
}

/* ---- the running timer ----------------------------------------------------
   Deliberately in chrome.storage.local, not in the core database.

   A half-run timer is not the user's data — it is this worker's control state.
   Putting it in IndexedDB would sync it to Drive, where a second device would
   find a timer it did not start and cannot see running; and the worker, which
   is asleep most of the time and restarts constantly, needs somewhere it can
   read on wake without opening a database. `storage.local` is both.
   -------------------------------------------------------------------------- */

/* `TIMER_BASE` is declared with the other two device keys near the top, so
   clear-all cannot forget one of them. */

async function timerGet() {
  try {
    const got = await chrome.storage.local.get(TIMER_BASE);
    const t = got && got[TIMER_BASE];
    return (t && t.startedAt != null) ? t : null;
  } catch (e) { return null; }
}

async function timerSet(value) {
  try {
    if (value) await chrome.storage.local.set({ [TIMER_BASE]: value });
    else await chrome.storage.local.remove(TIMER_BASE);
  } catch (e) {}
  await timerBadge(value);
}

/* The toolbar badge has two producers: the focus timer and remote support
   replies. Keep one writer so a timer update cannot erase an admin-reply badge
   (or vice versa). Support takes precedence because it is an external answer
   waiting for the person; the timer remains visible whenever support is clear. */
let _supportBadgeUnread = 0;
let _supportBadgeEmail = "";
let _timerBadgeValue = null;

function timerBadgeLabel(timer) {
  if (!timer) return "";
  const mins = OffiqaAssistantCore.timerElapsed(timer, Date.now());
  return mins < 60 ? mins + "m" : Math.floor(mins / 60) + "h";
}

async function refreshActionBadge() {
  try {
    if (!chrome.action || !chrome.action.setBadgeText) return;
    const timer = _timerBadgeValue || await timerGet();
    const support = Number(_supportBadgeUnread) || 0;
    const label = support > 0
      ? (support > 99 ? "99+" : String(support))
      : timerBadgeLabel(timer);
    await chrome.action.setBadgeBackgroundColor({ color: support > 0 ? "#dc2626" : "#2563eb" });
    await chrome.action.setBadgeText({ text: label });
  } catch (e) {}
}

/* The badge is not decoration — it is the countermeasure to the one way this
   feature can hurt somebody. A timer you forgot is a timer that bills nine
   hours, and an admin reply is an answer the user should not have to discover
   by opening New Tab. Both need a mark visible from every tab. */
async function timerBadge(timer) {
  _timerBadgeValue = timer || null;
  await refreshActionBadge();
}

const SUPPORT_API_PATH = "/api/ext/support/threads/";
const SUPPORT_ALARM = "offiqa-support";
const SUPPORT_READ_BASE = "offiqa.support.read.v1.";
const SUPPORT_POLL_MIN = 5;

function supportReadKey(email) {
  return SUPPORT_READ_BASE + encodeURIComponent(String(email || "").trim().toLowerCase() || "account");
}

async function supportReadMap(email) {
  try {
    const key = supportReadKey(email);
    const got = await chrome.storage.local.get(key);
    const value = got && got[key];
    return value && typeof value === "object" ? value : {};
  } catch (e) { return {}; }
}

function supportUnreadRows(threads, seen) {
  return (Array.isArray(threads) ? threads : []).filter(item =>
    Number(item && item.lastAdminMessageId || 0) > Number(seen[String(item && item.id)] || 0)
  );
}

async function supportBadgePoll() {
  let acct;
  try { acct = await readFrom(GLOBAL_DB, "account"); } catch (e) { return; }
  const token = acct && typeof acct.token === "string" ? acct.token : "";
  const email = String(acct && acct.email || "").trim().toLowerCase();
  if (!token || !email) {
    _supportBadgeEmail = "";
    _supportBadgeUnread = 0;
    await refreshActionBadge();
    return;
  }

  try {
    const res = await fetch("https://offiqa.com" + SUPPORT_API_PATH, {
      method: "GET",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    });
    if (!res.ok) return; // A network/auth blip must not erase a visible badge.
    const json = await res.json();
    if (!json || !json.ok) return;
    const unread = supportUnreadRows(json.threads, await supportReadMap(email));
    _supportBadgeEmail = email;
    _supportBadgeUnread = unread.length;
    await refreshActionBadge();
  } catch (e) {
    /* Polling is best-effort. The last known badge stays visible until the
       next successful answer, rather than disappearing during an outage. */
  }
}

async function supportMarkRead(msg) {
  const email = String(msg && msg.email || _supportBadgeEmail || "").trim().toLowerCase();
  if (!email) return { ok: false };
  const key = supportReadKey(email);
  const seen = await supportReadMap(email);
  const rows = Array.isArray(msg && msg.rows) ? msg.rows : [];
  rows.forEach(item => {
    const id = Number(item && item.id || 0);
    const adminId = Number(item && item.lastAdminMessageId || 0);
    if (id > 0 && adminId > 0) seen[String(id)] = adminId;
  });
  try { await chrome.storage.local.set({ [key]: seen }); } catch (e) { return { ok: false }; }
  await supportBadgePoll();
  return { ok: true };
}

async function supportSchedule() {
  try {
    await chrome.alarms.create(SUPPORT_ALARM, { delayInMinutes: 1, periodInMinutes: SUPPORT_POLL_MIN });
  } catch (e) {}
}

/** Stop whatever is running and file it. Returns the result, or null if nothing ran. */
async function timerStop(timer) {
  const running = timer || (await timerGet());
  if (!running) return null;
  const strings = (await appStrings()).hud;
  const built = OffiqaAssistantCore.timerEntry(running, Date.now(), {
    uid: capUid,
    text: running.host ? strings.timerLine.replace("{host}", running.host) : strings.timerLineBare,
  });
  await timerSet(null);
  if (!built) return { ok: true, mins: 0, dropped: true };

  const log = await readFrom(CORE_DB, "activityLog");
  if (!(await writeTo(CORE_DB, "activityLog", [built.entry].concat(log || [])))) return { ok: false };
  announce("activityLog");
  return { ok: true, mins: built.mins, capped: built.capped };
}

async function hudModel() {
  const { wsId, slices } = await hudSlices();
  const timer = await timerGet();
  // Cheap and self-healing: every panel open re-stamps the badge, so a badge
  // lost to a browser restart comes back the first time the HUD is used.
  await timerBadge(timer);
  return OffiqaAssistantCore.hudModel(slices, { wsId, now: Date.now(), timer });
}

/* Apply one row. Returns the number the confirmation quotes back, because the
   reason to tap a counter is to watch it move — re-deriving it in the page from
   what it was before the write would be a guess that is wrong exactly when two
   surfaces are open at once. */
async function hudApply(msg) {
  const { slices } = await hudSlices();
  const action = msg && msg.action;
  if (!action) return { ok: false };

  /* The billable line's text. The hostname and nothing more: it is the real
     context of the minutes and it lands in a statement the client may read, so
     a full URL — which can carry an order number, a thread id, another client's
     name — has no business in it. */
  const strings = (await appStrings()).hud;
  const label = msg.host ? strings.logLine.replace("{host}", msg.host) : strings.logLineBare;

  /* The timer's two rows are worker state, not a slice edit, so they never
     reach hudApply — which is why they are handled before it rather than as a
     kind it would have to learn and then refuse. */
  if (action.kind === "timerStart") {
    // Starting while one runs files the old one first. Two timers is a state
    // nobody can reason about, and silently discarding the first is worse.
    const prev = await timerGet();
    const closed = prev ? await timerStop(prev) : null;
    await timerSet({ startedAt: Date.now(),
      wsId: msg.wsId || null,
      principalId: msg.principalId || null, host: msg.host || "" });
    return { ok: true, started: true, closedMins: closed ? closed.mins : 0 };
  }
  if (action.kind === "timerStop") {
    const res = await timerStop(null);
    return res || { ok: false };
  }

  const built = OffiqaAssistantCore.hudApply(slices, action, {
    now: Date.now(),
    uid: capUid,
    wsId: msg.wsId || null,
    principalId: msg.principalId || null,
    text: label,
  });
  if (!built) return { ok: false };

  /* Same lazy-materialisation trap capture.js hit: `goals` and `cases` are
     slices that shipped after 1.0.0, so on a profile that has never created one
     the key genuinely does not exist. An absent key is not an absent database —
     only the store's key count can tell those apart. */
  if (!(await coreHasData())) {
    console.warn("[offiqa] hud: core store is empty — open Offiqa's New Tab once first");
    return { ok: false };
  }
  /* A priced counter touches two slices at once — the tally and the billable
     row. Written in order and announced individually, so an open New Tab
     refreshes both rather than showing a counter that moved with no money
     behind it. IndexedDB has no cross-store transaction here, so a failure on
     the second write is reported rather than rolled back: the tally moving
     without the money is recoverable by hand, a silent success is not. */
  const written = [];
  for (const w of built.writes) {
    if (!(await coreWrite(w.slice, w.list))) {
      console.warn("[offiqa] hud: write to '" + w.slice + "' failed" +
        (written.length ? " (after '" + written.join("', '") + "' succeeded)" : ""));
      return { ok: false };
    }
    written.push(w.slice);
    announce(w.slice);
  }

  const first = built.writes[0].list;
  const out = { ok: true };
  if (action.kind === "counter") {
    const g = first.find((x) => x && x.id === action.id);
    const p = g && OffiqaWork.counterProgress(g, Date.now());
    if (p) out.count = p.count;
    // So the confirmation can say the tap also earned something.
    if (built.entry) { out.units = built.entry.units; out.unitLabel = built.entry.unitLabel; }
  } else if (action.kind === "chase") {
    const c = first.find((x) => x && x.id === action.id);
    if (c) out.chases = c.chases;
  } else if (action.kind === "time") {
    out.mins = built.entry.mins;
  }
  return out;
}

async function hudLabels() {
  return (await appStrings()).hud;
}

/* ============================================================================
   The side panel
   ============================================================================
   Capture and the HUD both borrow the page for one keystroke and leave. That is
   the right shape for recording a fact, and the wrong shape for the question
   that is open all day — *what am I in the middle of, for whom, and what is
   next?* You do not perform that question; you glance at it.

   Chrome's side panel is the only surface that survives a tab switch, which is
   what makes this a panel and not a fourth shortcut. The worker's share is the
   part that needs Chrome: reading the slices, writing the one a tap changes, and
   knowing which tab is in front. What the panel contains lives in
   assistant-core, under the same Node tests as the rest of the data model.
   ============================================================================ */

/* Everything the panel is derived from. One batch, so the model is a single
   consistent snapshot rather than seven reads a tap could interleave with. */
async function panelSlices() {
  const keys = ["workspaces", "principals", "cases", "priorities", "sops", "routineTicks", "goals"];
  const [wsId, ...values] = await Promise.all([coreRead("activeWsId")].concat(keys.map(coreRead)));
  const slices = {};
  keys.forEach((k, i) => { slices[k] = values[i] || []; });
  return { wsId: wsId || null, slices };
}

/* Strings and appearance in one round-trip.
   theme-init.js paints the panel from the localStorage hint before anything
   runs, which is enough for light-vs-dark — app.jsx keeps that hint current.
   It is NOT enough for the accent, the page wash or the theme preset: those
   hints are only ever refreshed by the toolbar popup, so on a profile where the
   popup has never been opened the panel would sit in default blue beside a
   product the user has themed green.

   The popup solves this by reading the settings slice itself. The panel cannot
   — it does not load core-db — but the worker already reads that slice for the
   language, so the answer rides back with the strings rather than costing a
   second surface its own database code. `OffiqaAppearance.apply` on the page
   owns the derivation either way, so there is still exactly one of it. */
async function panelBoot() {
  const [strings, settings] = await Promise.all([appStrings(), coreRead("settings")]);
  const tw = (settings && settings.tweaks) || {};
  return {
    ok: true,
    labels: strings.panel || {},
    appearance: {
      theme: (settings && settings.theme) === "dark" ? "dark" : "light",
      tweaks: { accent: tw.accent || null, bg: tw.bg || "default", theme: tw.theme || "classic" },
    },
  };
}

/* Every tab in the window the panel is attached to.
   `currentWindow` and not `lastFocusedWindow`: the panel belongs to one window,
   and answering about a different one because the user glanced at a second
   monitor is worse than answering about none. Fails to an empty list, which the
   section then simply does not draw. */
async function openTabs() {
  try { return await chrome.tabs.query({ currentWindow: true }); }
  catch (e) { return []; }
}

async function panelModel(tab) {
  const [{ wsId, slices }, tabs] = await Promise.all([panelSlices(), openTabs()]);
  const model = OffiqaAssistantCore.panelModel(slices, { wsId, now: Date.now(), tab: tab || null });
  /* Read, never acted on — see the header on `tabContext`. The panel gets three
     buckets and exactly one verb (attach, which it already had); nothing here
     closes, moves or groups a tab. */
  model.tabs = OffiqaAssistantCore.tabContext(tabs, slices.workspaces, wsId);

  /* What was open last time. Offered as a count and a button, never restored on
     its own — see the sessions header. Suppressed when the group is still on
     screen: "restore 12 tabs" beside 12 tabs you are already looking at is an
     offer to open them twice. */
  const sessions = await sessionsGet();
  const s = wsId ? OffiqaHandoff.normalizeSession(sessions[wsId]) : null;
  const live = !!(s && s.groupId != null && tabs.some((t) => t && t.groupId === s.groupId));
  model.session = (s && s.urls && s.urls.length && !live)
    ? { count: s.urls.length, at: s.at || null } : null;
  model.handoff = wsId ? OffiqaHandoff.summary((slices.workspaces || []).find((w) => w && w.id === wsId), s, Date.now()) : null;
  if (wsId) {
    const context = await handoffContext(wsId, [slices.workspaces || [], slices.principals || []]);
    if (context) model.guard = OffiqaHandoff.guard(Object.assign({}, context, {
      landingTab: tab || null, targetGroupId: s && s.groupId != null ? s.groupId : null,
    }));
  }
  return model;
}

/* Switching workspace from the panel.
   The selection's home is localStorage on the extension's own origin (app.jsx
   §readActiveWs), mirrored into the store for this worker. The panel is an
   extension page, so it writes the localStorage half itself and asks for this
   half — and then the app hears `core:activeWs` on the bus and moves its bar
   without a reload. Three writers, one value, and no polling. */
async function panelSelectWs(wsId) {
  const fromWsId = await coreRead("activeWsId");
  return handoffQueue(() => handoffSwitch(fromWsId, wsId));
}

/* One tap. Deliberately the same three verbs the HUD offers plus the two the
   panel adds, and every one of them records a single fact:
     routine  — tick / untick a step of today's run
     pending  — clear a hanging chip
     chase    — count a follow-up (case-core's chase cycle, not a date nudge)
     attach   — save the tab in front of you
   Anything needing a decision still belongs on a page with room for it. */
async function panelApply(msg) {
  const action = msg && msg.action;
  if (!action) return { ok: false };

  if (action.kind === "attach") {
    return attachTab({ url: msg.tabUrl, title: msg.tabTitle }, msg.wsId || null);
  }

  if (action.kind === "restore") {
    return handoffQueue(() => handoffResume(msg.wsId));
  }

  const { wsId, slices } = await panelSlices();
  const target = msg.wsId || wsId;

  const now = Date.now();

  if (action.kind === "routine") {
    const ws = (slices.workspaces || []).find((w) => w && w.id === target);
    if (!ws) return { ok: false };
    // The client's midnight, not the machine's — §4.2.1, and the reason this
    // goes through routineDay rather than a local date.
    const day = OffiqaWork.routineDay(ws, slices.principals, now).day;
    const ticks = slices.routineTicks || [];
    const next = action.done
      ? OffiqaWork.untick(ticks, target, action.id, day)
      : OffiqaWork.tick(ticks, { id: capUid("rt"), itemId: action.id, wsId: target, day, at: now });
    if (next === ticks) return { ok: true };
    if (!(await coreWrite("routineTicks", next))) return { ok: false };
    announce("routineTicks");
    return { ok: true };
  }

  if (action.kind === "pending") {
    const list = (slices.workspaces || []).map((w) => {
      if (!w || w.id !== target) return w;
      const pending = OffiqaWork.togglePending(w.pending || [], action.id, now);
      return pending === (w.pending || []) ? w : Object.assign({}, w, { pending });
    });
    if (!(await coreWrite("workspaces", list))) return { ok: false };
    announce("workspaces");
    return { ok: true };
  }

  if (action.kind === "chase") {
    /* Straight through case-core's own chase cycle, which is what keeps the
       counter honest: chasing bumps the count and pushes the date, and the
       snooze buttons that only move the date live elsewhere and stay there
       (§4.6.1). A panel with its own version of this would inflate the one
       number a client is ever shown. */
    const list = (slices.cases || []).map((c) =>
      (c && c.id === action.id) ? OffiqaCase.chase(c, { now }) : c);
    if (!(await coreWrite("cases", list))) return { ok: false };
    announce("cases");
    const c = list.find((x) => x && x.id === action.id);
    return { ok: true, chases: c ? c.chases : 0 };
  }

  return { ok: false };
}

/* ============================================================================
   The right-click menu
   ============================================================================
   Capture already worked from a keystroke, and §4.7.3 argued that was enough.
   It is not, for a reason the same section admits about `Alt+L` two pages later:
   a shortcut is invisible. Nobody discovers `Ctrl+Shift+U`; they discover it
   because somebody told them, and the people who most need to file the sentence
   they are looking at are the ones who never read that far.

   Right-click is where every browser has taught people to look for "do
   something with this selection". It costs the `contextMenus` permission, which
   adds no line to the install screen, and it reaches exactly the same
   `captureSave` the panel does — so there is one code path and one set of
   rules about where things land.

   ── Why the menu files directly instead of opening the panel ────────────────

   The panel exists to let you choose. A menu item IS the choice, already made,
   which is the entire reason to reach for one. Opening a panel afterwards to
   ask again would make the discoverable road slower than the expert road.

   What is lost by not opening the panel is the confirmation — which client this
   was filed under, and whether it worked at all. So a one-line toast is injected
   into the page instead, on the same `activeTab` grant the click already
   provides. A capture that silently fails is the failure mode §4.7.3 spent a
   paragraph guarding the panel against; it would be strange to reintroduce it
   through a different door.
   ============================================================================ */

const MENU_ROOT = "offiqa-root";
const MENU_DESTS = ["case", "priority", "note", "contact", "shelf"];
const MENU_FILL = "offiqa-fill";

/* Fill a form from the saved profile.
   Injected with its values rather than fetching them, because a content script
   on someone else's origin cannot open the extension's database — and injected
   only on a right click, which is what grants `activeTab` and keeps this off the
   install screen entirely.

   Only YOUR four values go in. The client's four are deliberately withheld: a
   form on a page is nearly always about you (a signup, a support ticket, a
   vendor account), and a filler that could put a client's phone number into an
   unrelated box is a filler that will. Client details stay where they can only
   be placed deliberately — a snippet variable, at the caret. */
async function autofillRun(tab) {
  const tabId = tab && tab.id;
  if (!tabId) return;
  const [settings, strings] = await Promise.all([coreRead("settings"), appStrings()]);
  const tweaks = (settings && settings.tweaks) || {};
  const values = OffiqaAssistantCore.autoVars(Object.assign(
    OffiqaAssistantCore.myVars(tweaks),
    { custom: OffiqaAssistantCore.customVars(tweaks) }));
  /* How to recognise the user's own fields on a page. Derived here rather than
     in the content script because it reads the settings slice, which a script
     on someone else's origin cannot open. */
  const matchers = OffiqaAssistantCore.fillMatchers(tweaks);
  const labels = (strings.menu && strings.menu.fillLabels) || {};

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      /* Two steps, and the order matters: the values have to exist in the page's
         isolated world before the file that reads them runs. `func` and `files`
         cannot be combined in one call. */
      func: (v, l, m) => {
        globalThis.__offiqaFillValues = v;
        globalThis.__offiqaFillLabels = l;
        globalThis.__offiqaFillFields = m;
      },
      args: [values, labels, matchers],
    });
    /* expander-core first, exactly as the inline snippet expander does: the
       ranking that decides which saved value a box wants lives in
       assistant-core, so autofill.js has to arrive with it. Injecting them
       separately would leave a race in which the file runs before the core. */
    await chrome.scripting.executeScript({ target: { tabId }, files: ["expander-core.js", "autofill.js"] });
  } catch (e) {
    console.warn("[offiqa] autofill: could not run —", e && e.message);
  }
}

/* Rebuilt on every worker wake rather than only at install.
   Titles are localised, so a menu built once at install time keeps saying
   "Danh bạ" after the user switched to English. Chrome persists the menu across
   restarts, which is precisely what makes a stale one survive. removeAll +
   create is cheap, idempotent, and the only version that cannot drift. */
/* Called both from the top-level wake path and from the "menus:rebuild"
   message a single wake can also deliver — two callers that can easily land
   in the same tick. Chained onto a shared promise so a second call always
   waits for the first's removeAll+create to finish rather than racing it,
   which is what was producing "duplicate id" errors on the extension. */
let menusBuildChain = Promise.resolve();
function menusBuild() {
  menusBuildChain = menusBuildChain.then(menusBuildNow, menusBuildNow);
  return menusBuildChain;
}

async function menusBuildNow() {
  if (!chrome.contextMenus) return;
  try { await chrome.contextMenus.removeAll(); } catch (e) { return; }

  const strings = (await appStrings()).menu || {};

  const mk = (props) => {
    try {
      chrome.contextMenus.create(props, () => { void chrome.runtime.lastError; });
    } catch (e) {}
  };

  mk({ id: MENU_ROOT, title: strings.root || "Offiqa", contexts: ["selection", "page", "link"] });

  MENU_DESTS.forEach((dest) => {
    mk({
      id: "offiqa-cap-" + dest,
      parentId: MENU_ROOT,
      title: strings[dest] || dest,
      // Only where there is something highlighted — the whole input to a
      // capture. Chrome hides the item entirely when there is not.
      contexts: ["selection"],
    });
  });

  /* The tab, not the selection. Separate context on purpose: attaching the page
     you are on is the one thing here that has nothing to do with what is
     highlighted, and putting it under `selection` would hide it exactly when it
     is most useful. */
  mk({ id: "offiqa-attach", parentId: MENU_ROOT,
    title: strings.attach || "Attach this tab", contexts: ["page", "link"] });

  /* `editable` only. Offering "fill this form" from a page with no text box is
     a menu item that can only disappoint, and the right click that opens it is
     also what tells the filler which form was meant. */
  mk({ id: MENU_FILL, parentId: MENU_ROOT,
    title: strings.fill || "Fill this form", contexts: ["editable"] });
}

/* A single line, bottom-right, gone in two seconds. Injected as a function
   rather than shipped as a file: it has no state, no keys and nothing to
   re-enter, and a fourth content script in the package is a fourth thing that
   can fail to ship (see package.mjs). */
function menuToast(text, ok) {
  const el = document.createElement("div");
  el.textContent = text;
  el.style.cssText = [
    "all:initial", "position:fixed", "z-index:2147483647", "right:18px", "bottom:18px",
    "max-width:min(360px,calc(100vw - 36px))",
    "font:600 13px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
    "padding:10px 14px", "border-radius:10px",
    "color:" + (ok ? "#fff" : "#fff"),
    "background:" + (ok ? "#1f2937" : "#b91c1c"),
    "box-shadow:0 10px 30px rgba(0,0,0,.28)",
  ].join(";");
  document.documentElement.appendChild(el);
  setTimeout(() => { try { el.remove(); } catch (e) {} }, 2200);
}

async function menuSay(tabId, text, ok) {
  if (!tabId) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: menuToast,
      args: [String(text || ""), !!ok],
    });
  } catch (e) {
    // A page no extension may touch. The write still happened; there is just
    // nowhere to say so, which is worth a line in the log rather than silence.
    console.warn("[offiqa] menu: could not confirm on this page —", e && e.message);
  }
}

function fillStr(tpl, vars) {
  return String(tpl == null ? "" : tpl).replace(/\{(\w+)\}/g, (m, k) =>
    (vars && vars[k] != null ? String(vars[k]) : m));
}

async function menuClicked(info, tab) {
  const strings = (await appStrings()).menu || {};
  const tabId = tab && tab.id;

  if (info.menuItemId === "offiqa-attach") {
    /* `linkUrl` first: right-clicking a link and choosing attach should save
       that link, not the page it happens to sit on. Falling back to the page is
       what makes the same item work from anywhere on it. */
    const url = info.linkUrl || info.pageUrl || (tab && tab.url) || "";
    const title = info.linkUrl ? "" : ((tab && tab.title) || "");
    const res = await attachTab({ url, title }, null);
    if (res.ok) {
      await menuSay(tabId, fillStr(strings.attached, { name: res.wsName || "" }), true);
    } else {
      await menuSay(tabId, strings["attachFail_" + res.reason] || strings.attachFail || "", false);
    }
    return;
  }

  if (info.menuItemId === MENU_FILL) { await autofillRun(tab); return; }

  const dest = String(info.menuItemId || "").replace(/^offiqa-cap-/, "");
  if (MENU_DESTS.indexOf(dest) < 0) return;

  const text = String(info.selectionText || "").trim();
  if (!text) return;

  /* The client the capture will be filed under, resolved before the write so
     the confirmation can name it. §4.7.3's rule survives the menu: the panel
     showed the client so a misfile was visible before Enter; here it cannot be,
     so it is visible immediately after — which is the closest honest equivalent
     when the choice and the action are the same click. */
  const ctx = await captureContext(null);
  const saved = await captureSave({
    dest,
    title: text.split("\n")[0].slice(0, 120),
    text,
    url: info.pageUrl || (tab && tab.url) || "",
    pageTitle: (tab && tab.title) || "",
    wsId: ctx.wsId || null,
    principalId: ctx.principalId || null,
  });

  if (!saved.ok) {
    await menuSay(tabId, strings["failed_" + saved.reason] || strings.failed || "", false);
    return;
  }
  const label = strings[dest] || dest;
  await menuSay(tabId, fillStr(strings.filed, {
    dest: label,
    who: ctx.clientName || strings.noClient || "",
  }), true);
}

if (chrome.contextMenus) chrome.contextMenus.onClicked.addListener(menuClicked);

chrome.commands.onCommand.addListener((command, tab) => {
  // Logged unconditionally: when a shortcut "does nothing", the first thing
  // worth knowing is whether the command reached the worker at all. Without
  // this line, a shortcut swallowed by the OS and a broken handler look alike.
  console.log("[offiqa] command:", command);
  if (command === "open-quick-note") openQuickNote();
  if (command === "capture-selection") injectOnDemand(tab, CAPTURE_JS, "capture");
  if (command === "open-hud") injectOnDemand(tab, HUD_JS, "hud");
  if (command === "open-panel") openPanel(tab);
});

/* The side panel needs a *user gesture* to open, which a command handler counts
   as — but only if nothing is awaited first. So this reads the window id off the
   tab the command carried rather than querying for it, and only falls back to a
   query on the path where the gesture is already spent anyway. */
async function openPanel(tab) {
  if (!(chrome.sidePanel && chrome.sidePanel.open)) return;
  const windowId = tab && tab.windowId;
  try {
    if (windowId != null) { await chrome.sidePanel.open({ windowId }); return; }
    const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (t && t.windowId != null) await chrome.sidePanel.open({ windowId: t.windowId });
  } catch (e) {
    console.warn("[offiqa] side panel: could not open —", e && e.message);
  }
}

/* Startup self-check. `chrome.commands.getAll()` reports what Chrome actually
   bound, which is not always what the manifest asked for: a suggested key the
   OS or another extension already owns arrives here as an empty shortcut, and
   that is invisible everywhere else until someone opens the shortcuts page. */
async function reportCommands() {
  try {
    const all = await chrome.commands.getAll();
    all.forEach((c) => {
      if (!c.shortcut) {
        console.warn("[offiqa] command '" + c.name + "' has NO shortcut bound — " +
          "set one at chrome://extensions/shortcuts");
      } else {
        console.log("[offiqa] command '" + c.name + "' bound to", c.shortcut);
      }
    });
  } catch (e) {}
}
reportCommands();

chrome.windows.onRemoved.addListener((id) => {
  if (id === quickNoteWindowId) quickNoteWindowId = null;
});

/* ============================================================================
   The worker's front door
   ============================================================================
   Two kinds of caller arrive at this listener and they are not equally trusted.

   **Our own pages** — the New Tab app, the popup, the side panel, Quick Note.
   Nothing between them and the worker; whatever they ask for, they could read
   from the database themselves.

   **Content scripts** — snippet.js, capture.js, hud.js, running inside someone
   else's page. Chrome puts them in an isolated world, so the page cannot call
   this listener and cannot read what comes back. That is a real wall and it is
   why the list below is short rather than empty.

   But it is one wall, and everything on the other side of it is somebody else's
   code: an XSS on a site the expander was switched on for, a compromised
   extension sharing the tab, a page that finds a way to confuse a script we
   injected into it. So the rule is not "the wall holds" — it is that a content
   script may only ask for what it visibly needs to do its job on screen.

   `CS_ALLOWED` is that list, taken from what the three files actually send. The
   surfaces that read the person's whole working life — the side panel's model,
   the device dump, the paste shelf, session restore, permission changes — are
   not on it, and none of them was ever sent from a page. Refusing them costs
   nothing today and means a hole in a content script cannot become a hole in
   the database tomorrow.

   Kept as an allowlist and not a blocklist on purpose: a message type added
   later is refused until somebody names it, which is the failure direction that
   does not leak. */
const CS_ALLOWED = new Set([
  "capture:context", "capture:labels", "capture:save",  // capture.js
  "hud:model", "hud:labels", "hud:apply", "hud:inject", // hud.js  (+ snippet.js)
  "snippets:list", "snippets:used",                     // snippet.js
  /* remind.js. `remind:act` writes — the only content-script message here that
     does — but it writes exactly one field on one note the caller names, and a
     page cannot invent a note id it was not just handed. Snoozing or dismissing
     somebody's own reminder is also the least valuable thing a hostile page
     could do with a message: it delays a note the person can still see in the
     app, and nothing leaves the device. */
  "remind:model", "remind:act",
  /* capture.js's shelf view. Read-only, and it is showing the user their own
     clips on the page they are about to paste into — the whole point of it. */
  "shelf:list",
]);

/* Which side of the wall the sender is on, read off its URL and nothing else.

   NOT `!sender.tab`, which is the obvious version and is wrong here: the New Tab
   page is a tab, so the app itself would fail the test and lose the export path
   (`device:dump`) on the surface that owns it. The side panel and the popup are
   not tabs, the content scripts are, and none of that is the question — the
   question is which origin the document belongs to, and only an extension page
   answers `chrome-extension://<our id>/`.

   The id check is belt-and-braces: with no `externally_connectable` another
   extension cannot reach this listener at all. It costs one comparison. */
const OWN_PAGE_PREFIX = chrome.runtime.getURL("/");
function fromExtensionPage(sender) {
  return !!sender && sender.id === chrome.runtime.id &&
    typeof sender.url === "string" && sender.url.indexOf(OWN_PAGE_PREFIX) === 0;
}

// Messages from extension pages. "open-quick-note-window" is the popup's pop-out
// button; "open-quick-note" is kept for anything that just wants the composer.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg) return;
  if (!fromExtensionPage(_sender) && !CS_ALLOWED.has(msg.type)) {
    console.warn("[offiqa] refused '" + msg.type + "' from a content script");
    sendResponse({ ok: false, reason: "forbidden" });
    return;
  }
  if (msg.type === "open-quick-note-window") {
    openQuickNoteWindow().then(() => sendResponse({ ok: true }));
    return true; // async response
  }
  if (msg.type === "open-quick-note") {
    openQuickNote().then(() => sendResponse({ ok: true }));
    return true;
  }

  /* The visible New Tab polls support faster than the worker alarm. It reports
     that count here so the toolbar badge reacts immediately while the worker
     remains the fallback when no Offiqa page is open. */
  if (msg.type === "support:badge") {
    _supportBadgeEmail = String(msg.email || "").trim().toLowerCase();
    _supportBadgeUnread = Math.max(0, Number(msg.unread) || 0);
    refreshActionBadge().then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === "support:mark-read") {
    supportMarkRead(msg).then((res) => sendResponse(res), () => sendResponse({ ok: false }));
    return true;
  }

  /* ---- expander ---- */
  if (msg.type === "snippets:list") {
    snippetLibrary().then(
      // Named field by field on purpose — the cache is ours and the response
      // crosses to a content script, so what goes out is a decision, not a
      // spread. Which also means a field added to the cache and not added here
      // is silently dropped: `i18n` was, and the expander went on rendering its
      // English fallback while looking exactly like a worker that had not been
      // reloaded.
      (l) => sendResponse({ ok: true, rows: l.rows, myName: l.myName, vars: l.vars, i18n: l.i18n }),
      () => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === "remind:model") {
    remindModel().then((r) => sendResponse(r), () => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === "remind:act") {
    remindAct(msg).then((r) => sendResponse(r), () => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === "snippets:used") {
    bumpSnippet(msg.sopId, msg.idx).then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
    return true;
  }
  // The opt-in itself cannot happen here: chrome.permissions.request() needs a
  // user gesture and only an extension page has one. The popup and Settings
  // ask; this is just how they read back what is in force.
  if (msg.type === "snippets:sites") {
    expanderScope().then(
      (s) => sendResponse({ ok: true, all: s.all, origins: s.origins }),
      () => sendResponse({ ok: false }));
    return true;
  }
  /* ---- capture ---- */
  if (msg.type === "capture:context") {
    captureContext(msg.text).then(
      (c) => sendResponse(Object.assign({ ok: true }, c)),
      () => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === "capture:labels") {
    captureLabels().then(
      (labels) => sendResponse({ ok: true, labels }),
      () => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === "capture:save") {
    // Pass the whole verdict through — the panel picks its wording from
    // `reason`, so flattening this back to a boolean here would undo the fix.
    captureSave(msg).then(
      (res) => sendResponse(res),
      () => sendResponse({ ok: false, reason: "write" }));
    return true;
  }

  /* ---- HUD ---- */
  /* Opened from the page's own Alt+L instead of the command. A content script
     cannot inject a sibling script, so it asks; the sender's tab is the target,
     which is also the only tab this could sensibly mean. No activeTab needed —
     the expander only runs where a host permission was already granted. */
  if (msg.type === "hud:inject") {
    const tabId = _sender && _sender.tab && _sender.tab.id;
    if (!tabId) { sendResponse({ ok: false }); return; }
    chrome.scripting.executeScript({ target: { tabId }, files: HUD_JS })
      .then(() => sendResponse({ ok: true }))
      .catch((e) => {
        console.warn("[offiqa] hud: inject from page failed —", e && e.message);
        sendResponse({ ok: false });
      });
    return true;
  }
  if (msg.type === "hud:model") {
    hudModel().then(
      (model) => sendResponse({ ok: true, model }),
      () => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === "hud:labels") {
    hudLabels().then(
      (labels) => sendResponse({ ok: true, labels }),
      () => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === "hud:apply") {
    hudApply(msg).then(
      (res) => sendResponse(res),
      () => sendResponse({ ok: false }));
    return true;
  }

  /* ---- device data ---- */
  if (msg.type === "device:dump") {
    deviceDump().then((res) => sendResponse(res), () => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === "device:clear") {
    deviceClear().then((res) => sendResponse(res), () => sendResponse({ ok: false }));
    return true;
  }

  /* ---- the paste shelf ---- */
  if (msg.type === "shelf:list") {
    shelfGet().then((rows) => sendResponse({ ok: true, rows }), () => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === "shelf:add") {
    shelfAdd({ text: msg.text, url: msg.url }).then(
      (ok) => sendResponse({ ok }), () => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === "shelf:drop") {
    shelfDrop(msg.id).then((ok) => sendResponse({ ok }), () => sendResponse({ ok: false }));
    return true;
  }

  /* ---- workspace sessions ---- */
  if (msg.type === "session:open") {
    sessionOpen(msg.wsId, msg.urls, { title: msg.title, color: msg.color }).then(
      (res) => sendResponse(res), () => sendResponse({ ok: false, reason: "open" }));
    return true;
  }
  if (msg.type === "session:get") {
    sessionsGet().then(
      (map) => sendResponse({ ok: true, session: map[msg.wsId] || null }),
      () => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === "handoff:switch") {
    handoffQueue(() => handoffSwitch(msg.fromWsId, msg.toWsId)).then(
      (res) => sendResponse(res), () => sendResponse({ ok: false, reason: "handoff" }));
    return true;
  }
  if (msg.type === "handoff:resume") {
    handoffQueue(() => handoffResume(msg.wsId)).then(
      (res) => sendResponse(res), () => sendResponse({ ok: false, reason: "handoff" }));
    return true;
  }
  if (msg.type === "handoff:pause") {
    handoffQueue(() => handoffPause(msg.wsId)).then(
      (res) => sendResponse(res), () => sendResponse({ ok: false, reason: "handoff" }));
    return true;
  }
  /* The picker deliberately returns only display metadata to the local New Tab
     page. Internal/restricted URLs never reach the onboarding UI. */
  if (msg.type === "onboarding:tabs") {
    chrome.tabs.query({ currentWindow: true }).then((rows) => {
      const tabs = (rows || []).filter(t => t && OffiqaLink.attachable(t.url)).map(t => {
        let host = ""; try { host = new URL(t.url).host; } catch (e) {}
        return { id: t.id, title: String(t.title || host || "Tab").slice(0, 160), host, url: t.url, favUrl: t.favIconUrl || null };
      });
      sendResponse({ ok: true, tabs });
    }, () => sendResponse({ ok: false, tabs: [] }));
    return true;
  }
  if (msg.type === "onboarding:metric") {
    /* `hoMetric` removes every field outside its onboarding allowlist before it
       is written; the existing consent switch remains the only opt-in gate. */
    handoffMetricAppend(Object.assign({ event: msg.event }, msg.fields || {})).then(
      () => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === "handoff:metric-consent") {
    chrome.storage.local.get(HANDOFF_METRICS_BASE).then((got) => {
      const log = OffiqaHandoff.metrics(got && got[HANDOFF_METRICS_BASE], Date.now());
      log.enabled = msg.enabled === true;
      return chrome.storage.local.set({ [HANDOFF_METRICS_BASE]: log });
    }).then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === "handoff:guard-corrected") {
    const action = msg.correctiveAction === "kept" ? "kept" : "switched";
    handoffMetricAppend({ event: "context_guard_corrected", guardStatus: "attention",
      guardReason: "other_workspace_url", correctiveAction: action, accountLabelPresent: false }).then(
      () => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === "handoff:metrics-export") {
    chrome.storage.local.get(HANDOFF_METRICS_BASE).then((got) => {
      const log = OffiqaHandoff.metrics(got && got[HANDOFF_METRICS_BASE], Date.now());
      sendResponse({ ok: true, metrics: { enabled: log.enabled, events: log.events.map((e) => OffiqaHandoff.metric(e, e.at)) } });
    }, () => sendResponse({ ok: false }));
    return true;
  }

  /* ---- attach the tab in front of you ---- */
  if (msg.type === "tab:attach") {
    attachTab({ url: msg.url, title: msg.title }, msg.wsId || null).then(
      (res) => sendResponse(res), () => sendResponse({ ok: false, reason: "write" }));
    return true;
  }

  /* ---- the side panel ---- */
  if (msg.type === "panel:model") {
    panelModel(msg.tab).then(
      (model) => sendResponse({ ok: true, model }), () => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === "panel:labels") {
    panelBoot().then((res) => sendResponse(res), () => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === "panel:apply") {
    panelApply(msg).then((res) => sendResponse(res), () => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === "panel:selectWs") {
    panelSelectWs(msg.wsId).then((res) => sendResponse(res), () => sendResponse({ ok: false }));
    return true;
  }

  /* Rebuilt from the app when the language changes. The worker
     also rebuilds on every wake, which covers everything else; this exists so
     the change is visible in the menu immediately rather than after whatever
     next happens to wake it. */
  if (msg.type === "menus:rebuild") {
    menusBuild().then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
    return true;
  }

  /* Switch one site back off. The origin is checked against what is actually
     granted before anything is removed, for a reason that is not paranoia about
     the caller: `chrome.permissions.remove` takes a MATCH PATTERN, and a broad
     one silently takes more than the row that was clicked — the all-sites
     pattern arriving where one host was meant revokes every site the user ever
     switched on, reported back as a cheerful `{ ok: true }`. Removing only
     a pattern that appears verbatim in the granted list makes the call able to
     do exactly the one thing its name says. */
  if (msg.type === "snippets:revoke") {
    expanderScope().then((scope) => {
      if (scope.origins.indexOf(msg.origin) < 0) { sendResponse({ ok: false, reason: "unknown" }); return; }
      chrome.permissions.remove({ origins: [msg.origin] }).then(
        (removed) => { syncExpanderSites(); sendResponse({ ok: true, removed }); },
        () => sendResponse({ ok: false }));
    }, () => sendResponse({ ok: false }));
    return true;
  }

  /* ---- reminder delivery ---- */
  /* The app calls this after it writes a note reminder or a meeting, because a
     worker that is asleep never hears the BroadcastChannel. Cheap enough to
     fire on every save: it re-reads the diary and moves one alarm. */
  if (msg.type === "notify:reschedule") {
    /* The app sends this whenever the diary changes, which includes dismissing
       or snoozing a reminder from its OWN dialog — a write that never passes
       through `remindAct`. Without the broadcast the panels this worker drew in
       the other tabs would still be offering a reminder that was answered on
       the New Tab a second ago. */
    remindSync();
    notifyReschedule().then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
    return true;
  }
});

/* ============================================================================
   Reminder delivery
   ============================================================================
   The gap this closes is not a missing feature, it is a missing *room*. Note
   reminders were fired by a 30-second `setInterval` living inside the New Tab
   page, so a reminder set for 14:00 arrived whenever the user next opened a new
   tab. An assistant spends the day in Gmail and the client's admin panel; the
   promise "remind me at 2" was being kept only by coincidence.

   What may interrupt is decided in notif-core (`PUSH_KINDS`), not here, and it
   is deliberately just two things: note reminders and meetings — moments the
   user pinned to the clock themselves. This file's job is the part that
   genuinely needs Chrome: waking up, reading, ringing, and writing down that it
   rang.

   Three rules carried over from the app rather than reinvented:

   • **Quiet hours hold, they do not drop.** Inside the window nothing rings and
     nothing is marked delivered, so the first run after the window closes rings
     it. Identical to the ticker's behaviour, and for the identical reason: the
     reminder is held, not lost.
   • **Looking at Offiqa counts as being told.** If the focused tab is one of
     our own pages the bell is already on screen, so the row is stamped
     delivered without a desktop popup. Ringing at somebody reading the thing
     you are ringing about is how a product teaches people to turn it off.
   • **A reminder rings exactly once.** The `notifLog` is the record of what
     rang, it is written back to offiqa.core, and the single alarm wakes for the
     earliest instant anything needs.

   Neither permission adds a line to the install screen: `alarms` and
   `notifications` are both warning-free in Chrome, which is what makes this
   affordable under §3.1.
   ============================================================================ */

const NOTIFY_ALARM = "offiqa-notify";
/* Never sleep longer than this, however empty the diary. A reminder saved on
   another device, a sync that landed, a meeting created in a tab the worker did
   not hear about — all of them are invisible until something looks. Fifteen
   minutes is the honest ceiling on "how late can Offiqa be about news it was
   never told". */
const NOTIFY_MAX_SLEEP_MIN = 15;
/* Chrome will not schedule an alarm closer than this, and pretending otherwise
   just means the alarm fires later than the code claims. */
const NOTIFY_MIN_SLEEP_MS = 30000;

/* Everything the derivation reads. One batch, so the model is a single
   consistent snapshot rather than ten reads a write could interleave with. */
async function notifySlices() {
  const keys = ["meetings", "notes", "cases", "priorities", "workspaces",
    "principals", "activityLog", "routineTicks", "notifLog", "goals"];
  const values = await Promise.all(keys.map((k) => readFrom(CORE_DB, k)));
  const out = {};
  keys.forEach((k, i) => { out[k] = values[i] || []; });
  return out;
}

/* Is one of our own pages the tab the user is actually looking at? Not "is a
   New Tab open somewhere" — twenty background tabs is the normal state of a
   browser and none of them is being read. */
async function offiqaInFront() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    /* `pendingUrl` as well: a tab mid-navigation to our page has no `url` yet,
       and a reminder that lands in that window would read it as somebody
       else's tab. */
    const url = (tab && (tab.url || tab.pendingUrl)) || "";
    if (!url) return false;
    if (url.startsWith(chrome.runtime.getURL(""))) return true;
    /* The New Tab is the whole product, and it is the ONE page this could not
       recognise: Chrome reports an overridden New Tab as `chrome://newtab/`,
       never as `chrome-extension://<id>/newtab.html`. Verified from the worker
       itself — `chrome.tabs.query` answers `chrome://newtab/` while that tab is
       the one being looked at. So the prefix test above was false on the New Tab
       every single time, `onScreen` was never true, and the desktop toast fired
       while the user was staring at the bell that had already told them.

       The trade-off in accepting the alias: if a DIFFERENT extension owns the
       New Tab override, this suppresses a toast that should have shown. That is
       the rarer setup by a distance — Offiqa's reason to exist is being that
       page — and the failure is one quiet notification rather than a duplicate
       on every single reminder. */
    return url === "chrome://newtab/" || url.startsWith("chrome://newtab/?");
  } catch (e) { return false; }
}

/* The desktop notification for one item. Titles come from the locale bundle so
   the popup speaks the language the user set up the product in, not the one
   Chrome happens to be running in. */
function notifyBodyFor(item, strings) {
  const s = strings || {};
  if (item.kind === "reminder.due") return s.reminder || "Reminder";
  if (item.kind === "meeting.live") return s.meetingLive || "Starting now";
  const mins = (item.data && item.data.mins) || 0;
  return (s.meetingSoon || "Starts in {mins} min").replace("{mins}", String(mins));
}

async function notifyShow(items, strings) {
  for (const it of items) {
    try {
      await chrome.notifications.create(it.key, {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/icon128.png"),
        title: it.text || strings.untitled || "Offiqa",
        message: notifyBodyFor(it, strings),
        /* Reminders and meetings are both time-critical by definition — the
           whole point of this path is that the user is not looking at Offiqa,
           so a popup that auto-dismisses while they are in another window is a
           notification that did not happen. */
        requireInteraction: true,
        silent: false,
      });
    } catch (e) {
      console.warn("[offiqa] notify: could not show", it.key, "—", e && e.message);
    }
  }
}

/* One pass: derive, ring what is owed, write down that it rang, and set the
   next alarm. Safe to run at any time and any number of times — everything it
   writes is identity-preserving when nothing changed. */
/* Returns the instant the next wake is needed for. */
async function notifyTickFor(ctx) {
  const slices = await notifySlices();
  const now = ctx.now;

  const state = {
    meetings: slices.meetings, notes: slices.notes, cases: slices.cases,
    priorities: slices.priorities, workspaces: slices.workspaces,
    principals: slices.principals, activityLog: slices.activityLog,
    routineTicks: slices.routineTicks, goals: slices.goals,
  };

  const seen = OffiqaNotif.seenMap(slices.notifLog);
  const model = OffiqaNotif.collect(state, { now, snooze: ctx.snooze, seen });

  /* Reconcile first, unconditionally. The history log is a record of what was
     true, and that is worth keeping whether or not anything was allowed to ring
     — including through quiet hours, when the *only* record of a held reminder
     is this row. */
  let log = OffiqaNotif.logReconcile(slices.notifLog, model.items, now,
    { idFor: (key) => "nl_" + key + "_" + now.toString(36) });

  if (ctx.enabled && !ctx.quiet) {
    const due = OffiqaNotif.pushDue(model.items, log, { now, snooze: ctx.snooze });
    if (due.length) {
      /* "Looking at Offiqa counts as being told" — and only about the DESKTOP
         toast.

         This used to skip the delivery outright, and that was the whole of the
         "reminders only ever show on the New Tab" bug. Standing in front of
         Offiqa says nothing about the twenty other tabs somebody is about to go
         back to — but the row was stamped delivered anyway, the in-page dialog
         was never drawn in any of them, and because a reminder rings exactly
         once it never got a second chance. The app's own dialog kept redrawing
         it on the New Tab, so the one surface that needed it least was the only
         surface that ever had it.

         What the rule actually protects is the OS toast: the bell is already on
         screen, and a desktop pop-up over the page that is showing it is how a
         product teaches people to switch it off. So the dialog goes out to the
         other tabs either way, and only the toast is held. */
      await notifyDeliver(due, ctx, ctx.inFront);
      log = OffiqaNotif.logMarkNotified(log, due, now);
    }
  }

  if (log !== slices.notifLog) {
    if (await writeTo(CORE_DB, "notifLog", log)) announce("notifLog");
  }

  return OffiqaNotif.nextWake(state, now);
}

const REMIND_JS = ["remind.js"];

/* Deliver what is due to wherever the person actually is.
   ---------------------------------------------------------------------------
   Two channels, tried in order, because they are not equals:

   1. The reminder dialog, drawn INTO the pages they have open (remind.js).
      This is the product's own dialog — the note's text, the overdue badge, two
      snooze buttons — and it is what a reminder is supposed to look like.

   2. The desktop notification. A fallback, not the answer: no snooze, a
      different shape on every OS, and on Windows it is silently swallowed
      whenever notifications are switched off for Chrome.

   Every open tab, not just the front one
   ---------------------------------------------------------------------------
   The front tab was the obvious target and the wrong one. "The tab in front" is
   a guess about where somebody is looking, and it is wrong exactly when it
   matters: a second Chrome window, a tab that takes focus a second after the
   alarm fires, somebody who switches away mid-delivery. Drawing it in every tab
   means whichever one they land on next already has it — and because answering
   is a write, answering in one tab clears it in all of them (`remindSync`).

   The dialog needs a host permission for the page, and there is no gesture to
   borrow `activeTab` from — the alarm fires while the person is reading
   something else. So on sites the permission was never granted for, every
   injection is refused and channel 2 carries it. Nothing is dropped for want of
   a permission; it just arrives plainer. */
async function remindTabs() {
  let tabs = [];
  try { tabs = await chrome.tabs.query({}); } catch (e) { return []; }
  /* A tab we could never inject into is not worth a failed attempt: our own
     pages are the app's job, and chrome:// is closed to everyone. Anything
     http(s) is worth trying — `executeScript` is the only honest test of
     whether the permission is actually there.

     Discarded tabs are skipped rather than woken: injecting reloads the page
     somebody parked, and a reminder that costs them an unsaved form is not one
     they will thank us for. Nothing is lost — the row is still due, and the
     next pass draws it there once the tab is real again. */
  return (tabs || []).filter((t) => t && t.id != null && !t.discarded &&
    /^https?:/i.test((t.url || t.pendingUrl) || ""));
}

async function notifyDeliver(due, ctx, onScreen) {
  /* Only reminders are drawn in-page: the dialog's whole shape — snooze, an
     overdue badge, a note to read — is a reminder's. A meeting starting in five
     minutes wants the OS, which can interrupt a full-screen call. */
  const inPage = due.filter((it) => it.kind === "reminder.due");
  const rest = due.filter((it) => it.kind !== "reminder.due");
  let injected = false;
  if (inPage.length) {
    const tabs = await remindTabs();
    /* All at once rather than one after another: forty sequential round-trips
       would reach the fortieth tab noticeably later than the first, and the one
       the person is actually looking at is not necessarily first in the list. */
    const results = await Promise.all(tabs.map(async (tab) => {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: REMIND_JS });
        return true;
      } catch (e) {
        /* Refused (no host permission for this origin), or the tab went away
           mid-flight. Either way the fallback below is the answer, so this is
           info rather than a warning — it is the DESIGNED path on most sites. */
        return (e && e.message) || "refused";
      }
    }));
    injected = results.some((r) => r === true);
    /* One line, not one per tab: the reason is the same on all of them, and a
       wall of identical console noise is how the useful line gets missed. */
    if (!injected && results.length) {
      console.info("[offiqa] remind: no in-page dialog on any of", results.length,
        "tab(s) —", results[0]);
    }
  }
  /* Offiqa is the page in front of them: their bell already carries this row,
     so the OS channel is held. Never the in-page dialog above — that one is for
     the tabs they are NOT looking at, which is every other tab they have open
     and where they will be a few seconds from now. */
  if (onScreen) return;
  const viaOs = injected ? rest : due;
  if (viaOs.length) await notifyShow(viaOs, ctx.strings);
}

/* One answer, every copy.
   The panel is open in every tab that would take it, so an answer given in one
   of them has to reach the rest — otherwise dismissing a reminder means
   dismissing it forty times, which is worse than the toast this replaced. The
   worker owns the write and is therefore the only thing that knows it landed:
   it tells every tab, and each panel that is still on screen re-derives. A tab
   whose panel was already closed ignores this (see remind.js), so answering one
   reminder never pops the dialog back up for the ones still due. */
async function remindSync() {
  let tabs = [];
  try { tabs = await chrome.tabs.query({}); } catch (e) { return; }
  for (const t of tabs) {
    if (!t || t.id == null) continue;
    // No listener in that tab is the normal case and it rejects. Swallowed on
    // purpose: this is a broadcast, and every silence in it is expected.
    try {
      const p = chrome.tabs.sendMessage(t.id, { type: "remind:sync" });
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  }
}

/* What the injected dialog draws.
   Derived fresh rather than handed over at injection time: the worker can be
   torn down between `executeScript` and the panel's first message, and a panel
   that came up empty because the worker forgot is worse than one that took an
   extra millisecond. Re-deriving also means a reminder that fell due in between
   joins the list instead of being missed. */
async function remindModel() {
  const now = Date.now();
  const settings = await readFrom(GLOBAL_DB, "settings");
  const tweaks = (settings && settings.tweaks) || {};
  const strings = (await appStrings()).remind || {};
  const items = [];
  try {
    const slices = await notifySlices();
    const state = {
      meetings: slices.meetings, notes: slices.notes, cases: slices.cases,
      priorities: slices.priorities, workspaces: slices.workspaces,
      principals: slices.principals, activityLog: slices.activityLog,
      routineTicks: slices.routineTicks, goals: slices.goals,
    };
    const model = OffiqaNotif.collect(state, {
      now, snooze: tweaks.notifSnooze, seen: OffiqaNotif.seenMap(slices.notifLog),
    });
    model.items.forEach((it) => {
      if (it.kind !== "reminder.due" || it.refType !== "note") return;
      items.push({ noteId: it.refId, text: it.text, at: it.at, overdue: it.at != null && it.at < now });
    });
  } catch (e) { /* a database mid-upgrade: an empty panel beats a thrown one */ }
  return { ok: true, items, strings };
}

/* Snooze or dismiss, from the injected dialog. The same two writes the app's
   own dialog makes (`snoozeReminder` / `dismissReminder` in app.jsx), kept in
   step field for field — this is the same dialog, so it had better leave the
   same data behind.

   `triggered: false` on a snooze is load-bearing: without it the item is due
   again the instant the snooze lapses AND still flagged as already fired, which
   is how a snoozed reminder comes back permanently overdue. */
async function remindAct(msg) {
  const noteId = msg && msg.noteId;
  if (!noteId) return { ok: false };
  const notes = await readFrom(CORE_DB, "notes");
  if (!Array.isArray(notes)) return { ok: false };
  let touched = false;
  const next = notes.map((n) => {
    if (!n || n.id !== noteId || !n.reminder) return n;
    touched = true;
    if (msg.action === "snooze") {
      const mins = Number(msg.minutes) > 0 ? Number(msg.minutes) : 15;
      return { ...n, reminder: { ...n.reminder, triggered: false,
        snoozedUntil: new Date(Date.now() + mins * 60000).toISOString() } };
    }
    return { ...n, reminder: { ...n.reminder, dismissed: true } };
  });
  if (!touched) return { ok: false };
  /* `writeTo` and not `coreWrite`: the gate coreWrite applies is not wanted
     here — this is an edit to a note that already exists, never a create, so
     the trial lock has nothing to refuse and a lapsed account can still put its
     own reminders down. */
  if (!(await writeTo(CORE_DB, "notes", next))) return { ok: false };
  announce("notes");
  await notifyReschedule();
  /* The other tabs are showing the row this just answered. Not awaited before
     the reply: the panel that asked has earned its answer now, and a broadcast
     to forty tabs must not be what makes the button feel slow. */
  remindSync();
  return { ok: true };
}

/* One pass: derive, ring what is owed, write down that it rang, and set the
   next alarm. Safe to run at any time and any number of times — everything it
   writes is identity-preserving when nothing changed.

   Quiet hours, the notification opt-out and the snooze are the person's and
   live in offiqa.global. */
async function notifyTick() {
  const now = Date.now();
  const settings = await readFrom(GLOBAL_DB, "settings");
  const tweaks = (settings && settings.tweaks) || {};
  const quiet = tweaks.quietHours
    ? OffiqaAssistantCore.inQuietHours(now, { from: tweaks.quietFrom, to: tweaks.quietTo })
    : false;
  /* An opt-out, not an opt-in. The user already asked for this the moment they
     set a time on a note — making them ask twice is how a promise stays broken
     for everyone who never found the switch (§4.6.5). */
  const enabled = tweaks.osNotify !== false;

  const strings = await appStrings();
  const ctx = {
    now, quiet, enabled,
    snooze: tweaks.notifSnooze,
    inFront: await offiqaInFront(),
    strings: strings.notify || {},
  };

  const wakes = [];
  /* A database mid-upgrade, a store that is not there yet — the honest response
     is to skip this pass, not to throw out of the alarm handler. */
  try { wakes.push(await notifyTickFor(ctx)); }
  catch (e) { console.warn("[offiqa] notify: tick failed —", e && e.message); }

  await notifyScheduleAt(wakes.filter((w) => w != null), now);
}

/* Move the single alarm to the next instant worth waking for.

   One alarm rather than one per item: Chrome's alarm list is global to the
   extension and a diary of forty meetings would be forty names to keep in step
   with a diary that changes. The next instant is cheap to recompute and cannot
   go stale. The wake calculation reads cases and principals too (first-response
   clocks), so callers hand over the full state, not the diary pair. */
async function notifyScheduleAt(nexts, now) {
  const next = nexts.length ? Math.min.apply(null, nexts) : null;
  const ceiling = now + NOTIFY_MAX_SLEEP_MIN * 60000;
  const when = Math.max(now + NOTIFY_MIN_SLEEP_MS, Math.min(next == null ? ceiling : next, ceiling));
  try {
    await chrome.alarms.create(NOTIFY_ALARM, { when });
  } catch (e) {
    console.warn("[offiqa] notify: could not schedule —", e && e.message);
  }
}

async function notifyReschedule() {
  const now = Date.now();
  const wakes = [];
  try {
    const slices = await notifySlices();
    const next = OffiqaNotif.nextWake({ meetings: slices.meetings, notes: slices.notes,
      cases: slices.cases, principals: slices.principals }, now);
    if (next != null) wakes.push(next);
  } catch (e) {}
  await notifyScheduleAt(wakes, now);
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm && alarm.name === NOTIFY_ALARM) {
    notifyTick().catch((e) => console.warn("[offiqa] notify: tick failed —", e && e.message));
  }
  if (alarm && alarm.name === SUPPORT_ALARM) {
    supportBadgePoll().catch(() => {});
  }
});

/* Clicking the popup goes to the thing, not to a notifications page — the same
   rule `notifRoute` follows in the app. The key rides in the hash because it is
   the one channel that survives the New Tab being a fresh document. */
async function notifyOpen(id) {
  const key = String(id);
  await chrome.tabs.create({
    url: chrome.runtime.getURL("newtab.html") + "#n=" + encodeURIComponent(key),
  });
}

chrome.notifications.onClicked.addListener((id) => {
  notifyOpen(id).catch((e) => console.warn("[offiqa] notify: open failed —", e && e.message));
  try { chrome.notifications.clear(id); } catch (e) {}
});

/* The alarm survives browser restarts, but a profile that has never run this
   version has none — and `create` on an existing name is a no-op reschedule,
   so calling it on every startup is both the repair and the no-op. */
chrome.runtime.onStartup.addListener(() => { notifyTick().catch(() => {}); });
chrome.runtime.onInstalled.addListener(() => { notifyTick().catch(() => {}); });
notifyTick().catch(() => {});
chrome.runtime.onStartup.addListener(() => { supportSchedule(); supportBadgePoll().catch(() => {}); });
chrome.runtime.onInstalled.addListener(() => { supportSchedule(); supportBadgePoll().catch(() => {}); });
supportSchedule();
supportBadgePoll().catch(() => {});

/* The menu, rebuilt on every wake — see menusBuild for why once at install is
   not enough. Runs at the very bottom because it reads the app's language and
   language, which lives behind `coreRead`. */
menusBuild().catch((e) => console.warn("[offiqa] menu: build failed —", e && e.message));
