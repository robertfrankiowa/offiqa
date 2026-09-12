# Offiqa — New Tab

> **Source-available, not open source.** Copyright (c) 2026 Offiqa. All rights
> reserved. This public repository exists for transparency, security review, and
> privacy verification. Except for GitHub's limited viewing and forking rights,
> Offiqa grants no permission to use, modify, distribute, analyze for
> replication, train AI systems on, or create derivative works. See
> [LICENSE](LICENSE) and [COPYRIGHT.md](COPYRIGHT.md).

A calm **context-workspace layer** that replaces Chrome's New Tab page. Built from
the Claude Design prototype handoff (`Offiqa New Tab.html`).

It is **not** a tab manager or todo app — it helps you get back into the right work
context fast: workspaces, meetings, quick notes, reminders and focus sessions, all
persisted locally.

## Privacy and optional online services

Offiqa does not include behavioural analytics, telemetry, advertising SDKs, or
cross-site tracking. Most workspace data stays in the browser by default. Some
features deliberately connect to third parties only when enabled or used by the
person using Offiqa: account and support services at Offiqa, and Google Drive
backup/sync. The complete, versioned description of these data flows is in the
[Privacy Policy](PRIVACY.md). Please read it before using an online feature.

## First run: multi-client activation

First run is an activation flow, not a feature tour. A new user starts their
30-day full-access trial by signing in, creates a real desk for Client 1 and
Client 2, then performs an actual `Client A → Client B → Client A` Handoff.
The final proof is rendered from the Handoff result, so Offiqa never claims tabs
were restored when it only selected a workspace. A clear single-client path
creates the first desk without inventing sample data and leaves adding Client 2
as the next action.

Client name is required. Expected work account and open tabs are optional; tabs
are never preselected and account labels are reminders, not website-login
verification. Core work data stays in the browser by default; account data is
used for entitlement/trial, Drive sync is optional, and research events remain
local, opt-in, and redacted.

## Client handoff and resume

Switching clients from the workspace bar, `Alt+1…9`, the side panel, or Home's
Continue action uses the same local Chrome transaction:

- Offiqa checkpoints the client being left, including its last active attachable
  tab, then collapses that tab group. It never closes tabs.
- A still-live target group is expanded and focused without opening duplicates.
  If the group is gone (for example after a browser restart), Offiqa restores up
  to 25 saved attachable URLs and returns to the prior active tab where possible.
- A client with no session opens its curated workspace links once; an empty
  client is selected without opening blank tabs.
- **Pause** checkpoints and collapses the current context without opening a
  different one — useful when an interruption is real work but not yet a new
  workspace.

## Assistant command center

The Home surface also derives a compact Today queue from existing workspaces,
meetings, priorities and follow-ups: Continue, next meeting, due work, Waiting
and Later. Waiting items stay on their workspace and can record who has the
ball plus one follow-up date; older pending notes remain compatible. The new
Administrative & Executive Assistant template set adds Executive Command
Center, Meeting Preparation and Waiting & Follow-up starting contexts. None of
this reads Gmail, Outlook or an external calendar.

### Minimum Context Guard

After a successful handoff, Offiqa gives a short local context cue: the active
workspace, its user-declared **expected account**, and whether the landing tab
belongs to the target group or to an exact saved link. A tab saved only for
another workspace receives an attention cue with **Switch** and **Keep**;
shared URLs stay neutral rather than being assigned to the first workspace.
Group titles also carry `Workspace · expected account` when a label exists.

This is not login verification. Offiqa does not inspect cookies, Chrome
profiles, page DOM, email addresses on a website, Send/Publish controls, or
page content. The guard is local-only and non-blocking; its optional cohort
metrics contain only redacted status/reason/action enums.

Sessions are device-local `chrome.storage.local` state: they are not Drive-synced
or included in a backup import. Restoring URLs is not restoration of unsaved form
data, editor drafts, scroll position, browser cookies, accounts, or profiles.
Optional research metrics are off by default, retained locally for at most 30 days
or 1,000 redacted events, and are only exportable when a tester chooses to do so.

## Two databases

Offiqa is **one product**: Remote Work / Virtual Assistant. Everything lives in
two IndexedDB databases, and the split between them is the only routing rule in
the codebase:

| Database | Holds |
|---|---|
| `offiqa.global` | the **person's** config — `settings`, `account`, `modules`, `summary` |
| `offiqa.core` | everything the person **made** — workspaces, principals, cases, notes, SOPs, the activity log |

`src/db-core.cjs` is the only place that list is written down, and it is its own
file because **three surfaces have to answer the same question and none can load
the others' code**: the app bundle, the service worker (`worker-core.js`) and the
Quick Note popup (`db-manifest.js`). It was hand-typed in three places once; the
third copy was already missing half of it, and the failure is silent — the key
is written somewhere real, just not where the reader looks.

Anything reading the databases from outside the app — `background.js`,
`quicknote.js` — must route through `OffiqaDb.nameFor(key)`.
`grep -l indexedDB *.js` is the check that nothing new has joined that list
unrouted.

**Two names are frozen.** `offiqa.core` and the Drive backup folder
`Offiqa/Client Work/` both read like leftovers from when Offiqa shipped as more
than one product. They are kept deliberately: each names something already on a
user's disk or in their Drive holding the only copy of some work. A display name
is a decision that can be revisited; a path is a promise. Renaming one means a
new empty container beside a full one nobody looks at again.

### The module seam, and why it is gone

A pre-1.0 build carried a *module seam* so Offiqa could run three products over one
engine — Remote Work (VA), Administrative / Office Support, and a third
(*scopedue*) that was never started. The second was built and held back behind
`released: false`; it never shipped to anyone.

The whole seam has been removed: `ED_MANIFEST`, `edShows` / `edText`, the
`src/editions/<id>/` folders, the per-module chunks, the onboarding module step,
the Settings module switch, the per-module device keys, and the
`X-Offiqa-Module` header. What survived is the part that was never about modules
— the two database names above.

Two things the removal left behind, both intentional:

- **`settings` repairs its own shape.** Installs from a pre-1.0 build carry a
  nested `byEdition: { client: {…} }` bucket. `mergeSettings` lifts it on read
  and no writer puts it back, so the flat shape lands on the first settings
  write — no boot-time migration, nothing that can run twice, and an install
  that never writes settings still reads correctly forever. An `office` bucket,
  if one exists, is ignored rather than lifted: it holds answers to a setup
  questionnaire for a product that no longer exists.
- **A backup archive may hold `edition.<id>/` folders.** The importer counts
  them as skipped rather than merging them — there is nowhere here to put
  another product's records, and filing somebody's salaried work in among their
  clients is worse than declining it out loud.

`tests/db-core.test.mjs` fails if any shipped source reaches for one of the 21
removed names. They were all globals, so a stray reference compiles fine and
throws a `ReferenceError` on whichever render first hits it — a blank screen on
one route, with nothing in the console anyone would connect to a refactor.

### What is shared on purpose

**The person's config** — `settings` and `account`: language, theme, BYO API
keys, and the plan. **One Pro plan and one 30-day trial per person** — that is
the business model, not an inference, and it is why `account` is an
`OffiqaDb.GLOBAL_KEYS` key and the trial clock is a localStorage key. The
countdown has exactly one implementation, `offiqaTrialState()` in
`appframe.jsx` — Settings used to carry a second copy, with `30` and the storage
key written out again, four hundred lines from a comment promising the two "can
never disagree".

**`Offiqa Files/`** — one attachment folder at the Drive root. The files in it
are the user's own, sitting in their own Drive: one folder they can find and
revoke is the whole point. What Offiqa stores is the *link*.

**The export zip** — device-wide, one archive per person, because that is what a
backup of "my Offiqa" means.

### Template axes

A **pack** is a workspace template: a name pattern, a starting checklist, link
shelves, sometimes a daily routine. An **axis** is one question the New
Workspace picker asks to narrow them down. The picker draws one row per
registered axis, in registration order — it does not know how many there are.

```js
OffiqaTpl.register({
  id: "niche",                           // unique; re-registering replaces
  field: "niche",                        // settings field onboarding writes; must be in OffiqaTpl.FIELDS
  labelKey: "modals.newWs.byIndustry",   // the heading above the row
  list:  => NICHES,                   // the tiles
  packs: (v) => NICHE_PACKS.filter(p => p.niche === v),
});
OffiqaTpl.addPacks(NICHE_PACKS);         // makes them findable by id (createWs)
```

Who registers what today:

| axis | registered by | shipped in |
|---|---|---|
| `persona` | `src/templates.jsx` | `chunk.packs.js` |
| `niche` | `src/samples.jsx` | `chunk.samples.js` |

Two rules worth knowing before adding one:

- **`field` is checked against `OffiqaTpl.FIELDS`** in `template-core.cjs` and
  registration throws on an unknown value. Onboarding nulls every field in that
  list, and it has to know the complete list without loading `chunk.samples.js`
  — so a genuinely new field is the one thing an axis cannot add by itself. An
  axis with no `field` is fine: that is a browsing lens, not a setup question.
- **Weight decides which chunk an axis ships in.** The six industry packs are
  the heaviest thing the New Workspace picker can offer, so they ride with the
  sample set — wanted on exactly the same occasions — rather than in the shared
  persona library, which is downloaded far more often. `T` / `tab` / `tp` (the
  helpers packs are built from) stay shared and are reached through `window`.

`tests/template-core.test.mjs` registers a third axis nobody planned for and
checks it reaches the picker and is findable by `createWs` — so the claim above
is exercised, not just asserted.

## What's inside

- **App bar** — compact navy header: greeting + clock, search trigger (`/` · `⌘K`),
  dark-mode toggle, settings.
- **Context ribbon** — missed-yesterday alerts, the meeting starting soon, the active
  workspace, and weekly / monthly completion stats.
- **Quick work apps** — one-row launcher strip.
- **Continue workspace** — up to 5 (pinned first, recency-sorted) with status pill,
  follow-up, checklist progress; hover to pin / archive / start focus. "View all" opens
  the Workspace tab in the sidebar.
- **Quick notes** — reminders (with advance-notice + popup), `#tags` + filtering,
  checklist notes, pin / archive / convert (→ focus / workspace / meeting).
- **Toolbar popup** (`popup.html`) — the management surface shown when you click the
  Offiqa icon: status header, a **New Tab override** toggle (switching it off disables
  the extension via `chrome.management`, handing the New Tab back to Chrome), the
  **inline snippets** switch for the current site (+ "turn on for every site"), the
  Quick Note shortcut hint, and **Open Offiqa** / **Manage** buttons. Matches the New
  Tab's design tokens (light/dark).
- **Inline snippet expander** (`snippet.js`) — type `/.` in any text box on any site you
  have opted in and the reply library opens under the caret; keep typing to filter,
  Enter writes the line into the page. Give a snippet the shorthand `t` in the SOP shelf
  and `/.t` inserts it directly. Insertion goes through the page's own editing path
  (`execCommand("insertText")`), so React `onChange` fires and `Ctrl+Z` undoes it as one
  step. Works in `<input>`, `<textarea>` and contenteditable (Gmail, Slack, LinkedIn);
  **not** in canvas-drawn editors like Google Docs or Figma. Password fields are skipped
  by design, and workspace-scoped cards never leave the app — a text box on gmail.com
  cannot say which client the thread belongs to.
- **In-page HUD** (`hud.js`, `Alt+L`) — the three records that are
  only worth making *while* the work happens, made without leaving the tab it happens
  in: tick a shift counter, log 5/15/30 minutes to the current client, mark a case
  chased. One keystroke opens it, one number files it, and it closes. Minutes are
  offered already rounded to that client's billing block, so a 5-minute tap on a
  15-minute contract says 15 rather than surprising the statement later — and every
  entry is written as **manual**, never as measured time — *except* the running
  timer, which is measured because it was. Start it on any page and stop it on any
  other; the badge on the toolbar icon counts up while it runs, because a timer you
  forgot is a timer that bills nine hours. Past 8h it keeps its true minutes and is
  demoted to **manual**: a stopwatch nobody stopped is evidence the browser was open,
  not evidence of attention. A counter can also opt into four call outcomes
  (connected / voicemail / no answer / **booked**), and an unmarked tap stays counted
  and unmarked rather than being bucketed into a guess. Costs no host permission:
  like capture it rides `activeTab`, so it works on every site from day one and adds
  nothing to the install screen. Scope follows the workspace bar — another client's
  counter never appears, and with no client selected there are no chases at all.
  **One key, three ways of delivering it**, because the usual way can silently fail:
  Chrome assigns a `suggested_key` only when it first sees a command, so a command
  added to an already-installed extension routinely arrives unbound — and a key
  another extension owns is dropped without a word. So `Alt+L` is both the
  `open-hud` command *and* a listener inside `snippet.js` (page-side code we own,
  nothing to bind, on sites the expander is switched on for), plus a **button in the
  toolbar popup**. The two key paths never double-fire — a bound command is
  intercepted before the page sees the keystroke. On a page no extension may run in,
  the popup says so rather than hiding the button.
- **Quick-note window** (`quicknote.html`) — opened by a global shortcut
  (`Ctrl+Shift+Y` / `⌘+Shift+Y`, the `open-quick-note` command → `background.js` opens
  it as a small floating window) so you can jot a note from **any** tab without leaving
  it — handy mid-meeting. Full parity with the New Tab composer: **Remind me** (date/time
  + advance notice), **Tag** (pick an existing tag or type a new one) and **Checklist**
  (multi-item). It writes the same notes the New Tab uses — to the shared IndexedDB
  core (`offiqa.core`, slice `notes`) — so an open New Tab updates live (via a
  `BroadcastChannel("offiqa")` message). `⌘/Ctrl+Enter` saves, `Esc` closes. Works whenever **Chrome is focused** —
  it cannot capture the key while a separate desktop app (e.g. the Zoom desktop client)
  is in the foreground; that's an OS-level limit no extension can cross.
- **Today's focus** and a real **Focus session** timer.
- **Upcoming meetings** → full **Meeting Workspace** (Before / Live / After: agenda,
  prep, decisions, action items with owner+due, linked client workspace, Markdown
  export, recurring scheduling).
- **Reminder delivery**  — reminders used to fire from a 30-second ticker
  living *inside the New Tab page*, so "remind me at 2" arrived whenever you next
  happened to open a new tab. The service worker now owns it. What may interrupt is
  deliberately narrow — **only moments you pinned to the clock yourself**: note
  reminders, meetings, and a case's first-response clock. An overdue chase, a cold
  workspace, an unsent daily update: never, by design. Quiet hours hold rather than
  drop, and a focused Offiqa tab counts as having been told.
- **Week grid**  — the meetings card reads two ways. A list answers "what is
  next"; it cannot answer "where is there room?", which is the question behind every
  scheduling request. Seven day-columns, meetings placed by the minute and sized by
  their (new) duration, overlaps laid into side-by-side lanes. Not a calendar app: no
  month view, no drag-to-create, no all-day band.
- **Contacts**  — the last missing slot in the data model: a
  person who is *not* a client. Paste a research list (CSV, tab-separated or a
  directory line — email and phone are found by shape), de-duplicated by address.
  The boundary is one rule: a contact answers **who**, a case answers **what you owe
  them** — so there is no status field here, and a prospect you are chasing gets a
  case. Promoting one to a client keeps the contact row.
- **First-response clock**  — the case queue measures in days, so "respond
  within 15 minutes" was a clause it could not express at all. Declare it per client;
  the clock runs once, stops when you mark the reply, and outranks everything in the
  queue while it runs. After 24h it stops reporting — by then the case is simply
  overdue, which the chase date already models.
- **Timezone conversion on selection**  — highlight "2 PM EST" anywhere and
  the capture panel shows your time and each client's, with a ±1d chip. It reads; it
  never files. Zone abbreviations are resolved for the offshore-VA reading and the
  panel says which one it used, so a wrong guess is visible in the same glance.
- **Context panel** (`Alt+O` or the toolbar button) — Chrome's side panel, and
  the answer to the one thing capture and the HUD structurally cannot do. Both borrow
  the page for a keystroke and leave, which is right for *recording a fact* and wrong
  for the question that stays open all day: **what am I in the middle of, for whom,
  and what is next?** You do not perform that question, you glance at it — and the
  side panel is the only surface that survives a tab switch. One rule keeps it from
  becoming a second copy of the app: **it shows the selected workspace and nothing
  else.** Client + their local clock + which of your accounts their work goes out
  from, next step, what is owed today, the daily run, pending chips, the SOP steps you
  are following, saved tabs, and attach-this-tab. Every control is one tap that
  records one fact; switching chips is the only navigation. Switching there moves the
  New Tab's workspace bar live.
- **Right-click capture**  — §4.7.3 argued a shortcut was enough. It is not,
  for the reason the HUD already admits about itself: **a shortcut is invisible.**
  Nobody discovers `Ctrl+Shift+U`. All five capture destinations are now on the
  context menu for a selection, plus "attach this tab" on the page menu. Same
  `captureSave`, same rules, one more door — and `contextMenus` adds no line to the
  install screen. The menu rebuilds on every worker wake, because Chrome persists it
  and a menu built once keeps speaking the old language after a switch.
- **Paste shelf**  — read a name in Gmail, type it into a CRM, type it again
  into a sheet, type it a third time into a calendar invite. The clipboard holds
  exactly one thing. The shelf holds twelve — and **never reads your clipboard**: a
  clip gets there because you highlighted it and pressed the key, like every other
  capture. It lives in `chrome.storage.local`, beside the running timer, so it never
  syncs to Drive and never lands in a backup. It also turns a dead end into a door:
  pressing the capture shortcut with *nothing* selected used to flash "select some
  text first" — now it opens the shelf, so the key reads as one idea (something
  highlighted goes in, nothing highlighted takes something back out).
- **Contact as a capture destination**  — highlight a
  contact block on a directory page and it becomes an address-book row, through the
  *same* parser the bulk paste uses. What it cannot know is which line is the name and
  which is the company, so the panel shows what it read before you press Enter.
- **Workspaces can gain tabs**  — until now tabs only went in at creation
  time; after that the only road was copy the URL, change tab, paste it into a field
  on another page. Four doors now: "add from open tabs" inside the workspace, the
  popup button, the context menu, and the panel. All four write an indistinguishable
  link row — which is why `detectLinkKind`/`buildLink` moved into `link-core.cjs`: the
  worker cannot load `data.jsx`, and a second link builder is how the same URL gets
  filed as a "tab" from one button and a "document" from another. A tab already saved
  is not saved twice (hash-insensitive), and says so.
- **Device data is the user's too**  — three things live in
  `chrome.storage.local` rather than IndexedDB on purpose (the paste shelf, workspace
  tab sessions, a running timer): they are this browser's state and must never reach
  Drive or a restorable backup. That was a sound storage decision which had quietly
  become an **ownership hole** — they were invisible, unexportable, and **survived
  "Delete all data"**. Now `DEVICE_KEYS` in `background.js` is the single list,
  `device:dump` / `device:clear` the API, and Data & backup shows a *Data kept on this
  device only* section with live counts and its own Erase. Exported under `device/`,
  never imported: the export exists so the data is yours to take, and restoring another
  machine's tab session would restore a fact that was never true here.
- **Switching the activity log off offers to erase it**  — naming the count and
  the day span. An offer, not a consequence: those rows are real work, and wiping
  somebody's week because they flipped a switch is the mirror of the mistake being
  fixed.
- **Open-tab context**  — the side panel reads the tab strip and splits it
  three ways: open *and* saved here, open but belonging to **another workspace (named,
  not counted)**, and open but saved nowhere, with an attach button. Read-only by
  design — clicking a row switches to that tab, which is navigation, the same act as
  clicking a saved link. No close button, no reordering, no browser-wide session list.
  Costs no new permission: the New Workspace picker already reads the tab strip.
- **Tab groups + sessions**  — Resume opens the workspace's tabs into a Chrome
  tab group wearing its name and colour, and **the group is the session**: whatever is
  in it is what gets remembered, so dragging a tab out is how you remove it. Saving is
  automatic (losing an afternoon costs an afternoon); restoring never is — it is a
  button with the count on it, for the same reason §4.8 ships "open this whole group"
  switched off by default. Colour maps through a fixed eight-row table rather than a
  nearest-hue calculation: recognising a group at a glance is the whole point, and a
  computed mapping would re-colour a client between versions.
- **Search where Offiqa cannot read**  — ⌘K takes you to the Gmail / Drive /
  Calendar search box with the query already typed. Last in the list, because
  everything above it is data Offiqa actually holds. **No row ever claims a result
  count** — a real integration would say "3 emails"; this cannot know, and a number it
  cannot verify is exactly the lie the integration would exist to avoid.
- **Profile variables**  — four of your details and four of the client's become
  `{{my_email}}`, `{{client_phone}}` … in every snippet surface. Inserted at the caret,
  by you. An unset value stays visible as `{{client_phone}}` rather than collapsing to
  a gap you send without noticing.
- **Form fill**  — right-click a text box → fill from your saved details. The
  dangerous half, so: never submits, never overwrites what you typed, refuses password
  /card/OTP/hidden fields outright, fills only fields the page itself identifies
  (`autocomplete` → `type` → label), **leaves unidentifiable fields alone**, stays
  inside the form you clicked, and reports "3 filled · 1 left as you typed · 1 not
  saved yet". A form filled 70% correctly is worse than an empty one.
- **Browsing → work log** (**off by default**) — records which of a client's
  sites you worked in. Four rules: it **never produces a minute** (rows are
  `type:"browse"` with no `mins` field at all, so no total can reach them and §3.5's
  measured/manual distinction is untouched); only hosts a workspace already saved;
  one visit per host per 15 minutes, not one per page; hostname only, never the URL or
  page title. No new permission — `tabs` already grants tab URLs; what changed is the
  promise, not the access, which the docs now say plainly.
- **Shortcuts in Settings**  — the `?` sheet was always the canonical list,
  and `?` is a key you only press if you already suspect there is a list. The same
  list — built by one `shortcutGroups()` call in `appframe.jsx`, never a second copy —
  now also sits in Settings → General, next to the only control that can change any of
  it. Two things live only there: a **Change** button (browser-level keys are Chrome's,
  `chrome://extensions/shortcuts` is the only place to remap them, and it cannot even
  be linked with an `<a>`), and the **real** bindings read back from
  `chrome.commands.getAll()`. Chrome assigns a `suggested_key` only the first time it
  sees a command and silently drops one another extension owns — so an unbound
  shortcut now reads **"Not set"** in place of a key cap, the closed group's summary
  says how many, and a callout names *which*.
- **Settings sidebar** — General / Workspace / Notes / Account (**sign in, sign up
  and password recovery happen right here** — see *Signing in without leaving the
  extension* — then Free Trial → Pro upgrade), theme ("Classic"), accent +
  background presets, **Desktop notifications**
  (on by default — you already asked by putting a time on a note), quiet hours,
  **Inline snippets** (every site vs. the per-domain list), export / import / clear.

All user data lives in **IndexedDB** — `offiqa.core` (built-in slices), one
`offiqa.mod.<id>` per module, and `offiqa.backups` (rolling ZIP snapshots). The
only remaining `localStorage` use is a pre-paint theme hint (`offiqa.theme.hint`).
Backup/restore is local-only (export/import ZIP, snapshots, optional backup to a
user-chosen folder via the File System Access API) — no cloud, no account.

## Project layout

```
manifest.json        MV3 manifest (New Tab override; action popup; service worker;
                       "tabs" + "scripting" + "alarms" + "notifications" permissions —
                       the last two are warning-free in Chrome, which is what makes
                       reminder delivery affordable; "management" is OPTIONAL and asked
                       for at the popup's override switch, never at install; an explicit
                       content_security_policy rather than MV3's default; the expander's
                       site access is optional_host_permissions — NO content_scripts
                       block, so a fresh install warns about no site at all;
                       open-quick-note / capture-selection / open-hud commands)
background.js        service worker — quick-note window; snippet library reads;
                       registers/unregisters the expander as sites are granted;
                       injects capture + HUD on their commands and applies HUD taps;
                       **delivers reminders** (one chrome.alarms set to the next
                       instant worth waking for) and owns the running timer's state
capture.js           inbound capture content script (injected on demand via
                       activeTab, never registered) — file a selection as case /
                       priority / note
hud.js               in-page log panel (same activeTab route) — tick a shift
                       counter (with call outcomes), start/stop a running timer,
                       log minutes, mark a case chased, without leaving the tab
                       the work is happening in
newtab.html          page shell — loads vendored React + app.core.js
popup.html           toolbar management popup (icon click) — override toggle + actions
popup.js             toolbar popup logic — toggle / Open Offiqa / Manage / shortcut
quicknote.html       quick-note composer window (opened by Ctrl/⌘+Shift+Y)
quicknote.js         quick-note logic — writes notes to the shared IndexedDB core
snippet.js           inline expander content script (injected per granted site, not
                       declared in the manifest) — caret popup in a closed shadow root
expander-core.js     GENERATED — assistant-core.cjs on its own, for snippet.js
worker-core.js       GENERATED — time + work + case + assistant + notif cores,
                       importScripts'd by the service worker: the HUD composes a
                       counter, a chase and a time entry, and reminder delivery
                       derives the very same notification model the bell does —
                       all of it through the primitives the app itself uses
worker-strings.js    GENERATED — just the `capture`, `hud` and `notify` locale blocks, so the
                       injected panels are translated from src/locales/*.json
                       without the worker parsing a whole language on every wake
locales.boot.js      GENERATED — every language's `_meta` + the resolver: picks the
                       active language and document.writes that ONE bundle. Every
                       page links this, never a language file directly
locales.<code>.js    GENERATED — one language, merged over English, minus the key
                       paths that travel with a chunk (src/locale-split.mjs)
strings.<g>.<code>.js  GENERATED — those key paths, loaded by chunk-loader ahead of
                       the chunk that renders them
theme-init.js        sets the theme before paint (external; no inline scripts)
styles.css           the prototype's stylesheet (verbatim, + a few additions)
app.core.js          GENERATED — core bundle (home screen), loaded on startup
chunk.modals.js      GENERATED — workspace / focus / new-workspace / add-app modals
chunk.meeting.js     GENERATED — meeting workspace (depends on chunk.modals)
chunk.settings.js    GENERATED — settings sidebar
chunk.packs.js       GENERATED — the shared workspace template library
chunk.samples.js     GENERATED — the sample set + the industry template axis; on demand
chunk.mod.<id>.js    GENERATED — one per add-on under src/modules/<id>/ (lazy)
src/locale-split.mjs which locale key paths leave the boot bundle, and which chunk
                       they travel with. Read by build.mjs, chunk-loader.jsx and
                       tests/locale-split.test.mjs — one definition, three readers
src/locale-boot.tpl.js the body of locales.boot.js (copied verbatim, not transpiled)
db-manifest.js       GENERATED — db-core.cjs alone, for popup.html /
                       quicknote.html: which database a note belongs in, without
                       loading the app
src/contact-core.cjs the address book: a person who is NOT a client. Pure — paste
                       parsing, email de-dupe, promote-to-client, the bridge to a case
src/db-core.cjs      which database holds what — the whole routing table, one
                       file, three readers (pure; also in worker-core)
src/template-core.cjs the template-axis registry — one row per axis in the picker
src/chunk-loader.jsx loadChunk / CHUNK_DEPS / lazyComp — ahead of every UI file
src/tweaks-core.jsx  useTweaks + the edit-mode handshake (panel is a chunk)
src/charts.jsx       DonutRing (the one chart home draws); rest in charts-figures
src/samples.jsx      the sample set + the industry template axis (a lazy chunk:
                       it runs once, during onboarding, and then never again)
src/data.jsx         runtime data helpers — links, workspace status, date/time
                       formatting, seed helpers, and the three-line door to the
                       sample chunk (SAMPLE_WS_IDS / loadSamples / registerSamples)
src/core-db.jsx      IndexedDB layer: openDB, CoreStore, ModuleStorage, boot/migrate
src/core-backup.jsx  backup/export/import ZIP, snapshots, folder target, auto-backup
src/data-panel.jsx   the Data & backup page — the "data" route (chunk.data.js)
src/registry.jsx     static module registry (RMODULES)
src/core-api.jsx     window.Offiqa — Core API + event bus
src/dashboard-shell.jsx  shared DashboardShell + Widget for module dashboards
src/router.jsx       module host + switcher rail
src/modules/<id>/    a module (index.jsx) → emitted as chunk.mod.<id>.js
src/*.jsx            the original prototype source (edit these, then rebuild)
vendor/              React + ReactDOM + fflate (loaded locally, CSP-safe; fflate is
                       pulled in by chunk.backup, not by any page's <head>)
fonts/               Geist / Geist Mono woff2 + fonts.css (vendored, offline)
icons/               extension icons (generated by gen-icons.mjs)
build.mjs            compiles src/*.jsx -> core + lazy chunks (esbuild)
gen-icons.mjs        regenerates the PNG icons
vendor-fonts.mjs     regenerates fonts/ from a Google Fonts CSS dump
serve.mjs            tiny static server for local preview only
```

### Why a build step?

The prototype loaded React and Babel-standalone from a CDN and transpiled JSX in the
browser. MV3's extension CSP forbids both remote scripts and `eval()`, so we vendor
React locally and **pre-compile** the JSX at build time. The prototype's actual source
is kept verbatim (same global-scope structure, same load order), so the result is a
faithful, pixel-for-pixel match — just packaged to run inside an extension.

### Code-splitting / lazy loading

Only `app.core.js` (the home screen) plus the open module's pack loads at startup.
Everything else ships as separate `chunk.*.js` files that the loader in `app.jsx`
injects on first use (deps first: `meeting` pulls in `modals` for its shared
`Overlay`; `modals` pulls in `packs`). Each chunk exposes its components on `window`;
the `lazyComp()` wrapper renders them once loaded. After the home screen paints, an
idle callback (`requestIdleCallback`) **warms the chunks in the background** —
non-blocking, so startup stays light but the first interaction is instant. The build
minifies whitespace/syntax but **keeps identifier names**, since chunks reference each
other (and core) through shared globals. That shared namespace is why
`tests/db-core.test.mjs` fails the build on a duplicate top-level name: a second
`function foo` anywhere in the core bundle silently replaces the first.

A chunk can also carry non-JS baggage — the things only it uses have no business
in a page's `<head>`. `chunk-loader.jsx` declares three maps for that: `CHUNK_CSS`
(a stylesheet), `CHUNK_LIB` (a vendored library), and the generated string wiring
from `src/locale-split.mjs`. CSS and libraries load *alongside* the chunk; strings
load *before* it, because several chunks capture translated text into top-level
constants and a chunk that evaluates first would freeze raw key names into the UI
for the rest of the session.

| chunk | holds | also carries | loads when |
|---|---|---|---|
| `chunk.packs.js` | the shared persona template library | `templates.*` strings | New Workspace, or a seeding run |
| `chunk.samples.js` | the sample set + the industry template axis | `data.client.*` strings | onboarding, New Workspace, §10.4 slice fill |
| `chunk.modals/meeting/assistant.js` | interaction-only UI | | first use (warmed at idle) |
| `chunk.settings.js` | the settings sidebar | `ui-premium.css`, `settings.*` strings | first use (warmed at idle) |
| `chunk.cmdk.js` | the ⌘K command palette | | warmed at idle; the key handler stays in core |
| `chunk.data.js` | the Data & backup page | `settings.*` strings | on open (pulls `sync` + `backup`) |
| `chunk.sync.js` | the Google Drive engine | | `settings.driveSync.connected`, or the Data page |
| `chunk.backup.js` | ZIP export/import + auto-backup | `vendor/fflate.min.js` | `settings.backup.frequency !== "off"`, or the Data page |
| `chunk.onboard.js` | the first-install welcome | `ui-premium.css` | eagerly at hydrate when `!settings.onboardingDone` |
| `chunk.charts.js` | Legend / Sparkline / AreaChart / BarGroup | | dep of `assistant` (home draws only `DonutRing`) |
| `chunk.tweaks.js` | the edit-mode panel + its controls | `settings.*` strings | only if a host posts `__activate_edit_mode` |

### What the boot path costs

The New Tab used to fetch **1,571 KB across 21 files** before it could paint. It is
now **991 KB across 12 files**, and every byte that left is still one script call
away. Three things moved, in descending order of size:

| what | was | now | why it could leave |
|---|---|---|---|
| `locales.js` — all four languages | 573 KB | 79 KB (`locales.boot.js` + the boot half of one language) | you read in one language, and half of that language is behind a drawer or a picker |
| `ui-premium.css` | 59 KB | 0 | it styles the Settings page and its drawer, the onboarding card and the toolbar popup — nothing the home screen paints |
| `vendor/fflate.min.js` | 6 KB | 0 | only `core-backup.jsx` calls it |

`tests/locale-split.test.mjs` is what keeps the first row honest: it re-derives which
files ship in which bundle and fails if boot code reads a string that has moved, or
if a chunk reads one it never loads.

Each loads for a different reason, which is why they are separate chunks and not one
"everything else" bundle: pairing a Drive user with an auto-backup user means each
downloads the other's engine.

Three of them keep a small piece behind in core, and the piece is always the part
that has to exist *before* the chunk can arrive:

- **`useTweaks` + `TweaksHost`** (`tweaks-core.jsx`) — the hook feeds accent, density
  and name into the frame on every boot, and the host owns the edit-mode handshake.
  The listener has to be mounted before the host's `__activate_edit_mode`, or that
  message lands on nobody and the toolbar toggle silently does nothing; the activate
  is what triggers the fetch, and `active` survives it so the panel still opens.
- **`DonutRing`** (`charts.jsx`) — the one chart the home screen draws. Deliberately
  self-contained: the day it needs a helper from `charts-figures.jsx`, both are back
  in the boot bundle together.
- **`FocusCard`** (`blocks.jsx`) — the collapsed card is on the home screen; the
  running timer (`FocusSession`) moved to `chunk.modals.js`, where its other entry
  point already lived, and the card renders it through a lazy wrapper.

**`chunk-loader.jsx` sits ahead of every UI file** so any of them can build a lazy
wrapper. It used to be the top of `app.jsx`, which is the LAST file in the core
concatenation — so nothing earlier could split itself and the seam had to be made
from the outside by passing a component down as a prop.

**Both engine chunks are gated on a setting app.jsx already has in hand at hydrate.**
That check is each engine's own first line, hoisted out of code that had to be
downloaded to run it — `maybeAutoBackup` returns unless a frequency is set,
`pullOnLoad` returns unless Drive is connected. "Is the feature on" is the gate;
"is it due" deliberately is not, or the download would sit in front of the run.

The invariant to preserve when touching either: **the chunk is loaded whenever the
feature is on.** `markDirty` guards on `window.OffiqaSync`, and when it is absent
there is by definition nothing to mark. Connecting happens in the Data panel, which
pulls the engine in as a dependency — so anything that reads `window.OffiqaSync` or
`window.OffiqaBackup` must read it at CALL time, never capture it at load time.
`Offiqa.backup` is a getter for exactly this reason.

What is deliberately *not* split: anything the first screen draws. `app.jsx` and
`blocks.jsx` are over half of what remains and they ARE the home screen — the ribbon,
the workspace bar, the daily run, today's focus, quick notes. Workspace status labels
lived in `templates.jsx` until that became a chunk, and the home page threw before it
painted — they moved to `data.jsx`, which is now the engine's runtime data helpers and
holds no sample content at all.

**Two rules learned by breaking them**, both worth reading before splitting anything
else out of core:

1. **Read the chunk's globals at call time, never at load time.** `core-api.jsx` had
   `backup: window.OffiqaBackup` inside the `window.Offiqa` object literal — built
   during boot, so it froze `undefined` in place the day the backup engine became a
   chunk. It is a getter now. The same trap caught a `sync:status` subscription that
   only registered `if (sync)` and a settings row hidden unless the engine existed.
2. **A constant used by core cannot live in a chunk.** `APP_VERSION` was declared in
   `core-backup.jsx` and read by `core-api.jsx`; moving the file out produced a
   `ReferenceError` at the top level and a blank page with an empty console — the
   same failure mode as the `templates.jsx` split. Always assert
   `document.getElementById("root").children.length` after a core edit.

## Develop

```bash
npm install          # esbuild
npm run build        # src/*.jsx  ->  app.core.js + chunk.*.js
npm test             # the pure cores + the worker, in Node — no React, no browser
npm run package      # build + emit dist/ (validates the worker's importScripts list)
node gen-icons.mjs   # only if you change the brand icon
```

**Business logic that is easy to get wrong lives in `.cjs` cores that run under
plain Node**, so it can be tested without rendering anything — currently **2,180
assertions** across 18 files. That split is not decoration: "2 PM New York in Manila
during DST", "which Monday does this week start on", "does a 15-minute SLA warn at
5 minutes or at a third of the window" are all mistakes invisible on screen. Two bugs
were caught this way before anyone saw them, and a third — switching on an
SLA clause making every existing case scream "27387m late" — was caught by the
preview and fixed in the core rather than papered over in the UI.

Four of those files are not about a core at all, and they are the module wall:

| File | Pins |
|---|---|
| `db-core.test.mjs` | the routing table, plus two guards: no duplicate top-level name in the core bundle, and no shipped source still reaching for one of the 21 names the removed module seam exported |
| `device-state.test.mjs` | the three things kept outside a database — the running clock files its minutes once, against the workspace it STARTED on; starting a second clock files the first; "delete everything" reaches all three |

The last two boot the **real `background.js`** in a VM over a fake IndexedDB and a
`chrome.storage.local` that really stores — see `tests/_worker-harness.mjs`, shared
by both so there are not two answers to "what does the worker see".
`worker-boot.test.mjs` keeps its own thinner stub on purpose: its claim is that the
top level survives with *nothing* to read, which a populated harness could not make.

Edit `src/*.jsx` or `styles.css`, then `npm run build`. **Do not edit the generated
`app.core.js` / `chunk.*.js`** — they are regenerated.

Local preview (outside Chrome): `node serve.mjs` → http://localhost:4178

## Load in Chrome

1. `npm install && npm run build`
2. `chrome://extensions` → enable **Developer mode**
3. **Load unpacked** → select this folder
4. Open a new tab.

## Notes

- The UI font is **Geist** / **Geist Mono**, vendored locally in `fonts/` (variable
  woff2, `latin` + `latin-ext` + `vietnamese` subsets, ~108 KB). `styles.css` imports
  `fonts/fonts.css` — no network, fully offline. To refresh the fonts, re-run
  `vendor-fonts.mjs` (see the header of that file for the fetch step).
- No inline scripts: the early theme-setter lives in `theme-init.js` (MV3's
  `script-src 'self'` forbids inline `<script>`).
- **The install screen stays clean.** `alarms` and `notifications` are declared and
  neither produces a permission warning in Chrome, which is the only reason reminder
  delivery was affordable under the product's local-first promise.
  `generativelanguage.googleapis.com` was dropped from `host_permissions` along the
  way — it had been declared for a feature that was never built, and no file
  referenced it. Site access for the
  expander remains `optional_host_permissions`, granted at runtime, never at install.

  `contextMenus`, `sidePanel` and `storage` are there on the same terms — none of the
  three produces a warning. `storage` is the interesting one: it went **missing** for a
  stretch of development. `chrome.storage` needs it (`unlimitedStorage` is a different
  permission entirely), so every call in the worker threw into its own `try/catch` and
  `timerGet()` silently returned `null` — the running timer never survived a worker
  sleep, and nothing anywhere said so. The paste shelf needed the same store, which is
  how it surfaced.

  One was also taken **off** the list, which is the harder direction. `management` was
  a permanent permission for a while, and is the broadest thing Chrome offers — read,
  enable, disable and uninstall every *other* extension on the machine. It bought one
  convenience: the popup's override switch, which disables Offiqa so Chrome's own New
  Tab comes back. That is the trade the install screen's scariest line exists to warn
  about, and the warning was right. It now lives in `optional_permissions` and is
  requested at the click (`chrome.permissions.request` needs a user gesture, which a
  popup click is). Declining is a normal outcome — `chrome://extensions` has the same
  switch — so the popup says so instead of reporting an error. Anyone who never touches
  the switch never grants it at all.

  The same release stopped **inheriting** the page CSP and declared one. MV3's default
  (`script-src 'self'; object-src 'self'`) is already strict, and "already strict" is
  not a control: a default can move, and a policy nobody wrote down is a policy nobody
  reviews. The declared one adds `frame-src 'self'`, `base-uri 'none'` and
  `form-action 'none'` — the app has no iframes and both its `<form>`s call
  `preventDefault()`, so nothing legitimate can notice, and an injected one cannot post
  anywhere.
- **The running timer lives in `chrome.storage.local`, not in IndexedDB.** A half-run
  timer is the worker's control state, not the user's data: syncing it to Drive would
  hand a second device a timer it did not start and cannot see running, and the worker
  needs somewhere it can read on wake without opening a database.

### Talking to offiqa.com

One base (`OFFIQA_API_BASE`), one host permission (already in the manifest, so a
server-backed module adds no install warning), and two fetch sites: the
account/billing calls in `core-api.jsx` and the Drive token broker in
`platform.jsx`. `Offiqa.account.serverFetch(path, opts)` is the authenticated
door anything else should use — bearer token attached, JSON in and out.

#### Signing in without leaving the extension

There are two doors into the same account, and they end in the *same*
`ExtensionToken` — a 64-hex bearer, stored server-side as a SHA-256 hash, with a
90-day idle window that slides on every use:

| Door | Route | Used by |
|------|-------|---------|
| The form in Settings → Account | `POST /api/ext/auth/{login,register,resend,forgot,google}/` | the extension |
| `chrome.identity.launchWebAuthFlow` → the website's own `/login/` | `GET /api/ext/connect/` | the PWA, and as the fallback link under the form |

The website door is kept, not deprecated: the PWA has no `launchWebAuthFlow`, and
if anything about the in-extension form is ever blocked, offiqa.com still works.

Four rules the auth routes hold, none of them optional:

- **Stateless.** No session cookie, so no CSRF token — and so `Auth::attemptUser()`'s
  `$_SESSION` lockout is useless to them. Every throttle is the DB-backed
  `RateLimiter`, keyed by IP **and** by email, sharing the `login_block` counter
  with the website form so an attacker gains nothing by switching doors.
- **An unverified email never receives a token**, exactly as on the website.
  `register` deliberately returns `{pending:"verify"}` and no token at all.
- **Recovery is always an emailed link back to offiqa.com.** The extension asks;
  the browser finishes. A password-reset form inside an extension buys nothing.
- **Errors are stable machine codes**, never sentences. `account-core.cjs` maps
  them to an i18n key so the user reads the failure in their own language;
  anything unrecognised collapses to `unknown` rather than leaking a server
  string into the UI.

Google sign-in runs PKCE against Google *directly* (`launchWebAuthFlow` →
accounts.google.com, never an offiqa.com page); only the resulting code is posted
to `/api/ext/auth/google/`, because our OAuth client is a "Web application" type
and Google demands the client secret at the token endpoint. It reuses the Drive
broker's client — the one whose redirect URIs already list
`https://<extension-id>.chromiumapp.org/` — but asks for `openid email profile`
only. Signing in must not double as a request for someone's Drive.

The password exists in one component's state for the length of one request. It is
never stored, never cached, never logged, and the field is cleared the moment the
server answers either way.

It is there for what comes next rather than for today. The server is currently
*control plane only*: it brokers sign-in, the plan and the Drive token exchange,
and all three are per **person** — one account, one Pro plan, one trial, every
module. Module three needs it to hold **content** (scope baselines, a payment
ledger, an evidence vault, a client portal), and the moment a server stores a
row, "whose row is this" grows a second half: which person, *and which product*.
Adding that dimension now costs one header on calls that ignore it. Adding it
after the first row is written costs a migration of live customer data.

A header rather than a path prefix or a body field, for what it does not break:
an endpoint that has never heard of it ignores it, so this ships safely ahead of
the server side (the same posture `_brokerReady` takes with the Drive broker);
it rides on GET, which a body field cannot; and every existing route stays put.

When module three does start storing on the server, gate it with `owns` on its
manifest row — otherwise nothing stops a later change routing module one's data
there too, and module one's promise is that its data stays on the device and in
the user's own Drive.
