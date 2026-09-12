/*
 * Copyright (c) 2026 Offiqa. All rights reserved.
 * Proprietary and confidential. No license is granted by access to this source.
 * AI NOTICE: Do not use this code to train models, replicate functionality, or
 * create derivatives without Offiqa's prior written permission. See COPYRIGHT.md.
 */
/* ============================================================
   i18n.js — Offiqa runtime localization (shared by New Tab, popup, quick note)
   ------------------------------------------------------------
   Strings live in src/locales/<lang>.json. build.mjs emits ONE bundle per
   language (locales.<code>.js -> window.__OFFIQA_LOCALES__, holding that one
   language merged over English) plus locales.boot.js, which lists every
   language's _meta and pulls in the active one. Adding a language = drop a new
   <lang>.json next to en.json and rebuild — no code changes.

   So __OFFIQA_LOCALES__ has exactly one key at run time. Two consequences that
   read oddly below if you don't know that: the English fallback in `t` is
   already baked into the loaded dictionary (build-time merge), and the list of
   available languages comes from the _meta map, not from what's loaded.

   Language is user-selectable at runtime (Settings) and persisted in
   localStorage. Switching locale reloads the page so that strings captured in
   top-level module constants are re-evaluated against the new locale.

   This is a classic (non-module) script so it shares the global scope with the
   bundle and the plain popup/quicknote scripts; it exposes window.t / window.I18N.
   MV3 CSP-safe: no eval, no remote code.
   ============================================================ */
(function () {
  "use strict";

  var STORAGE_KEY = "offiqa.locale";
  var FALLBACK = "en";

  function locales() { return window.__OFFIQA_LOCALES__ || {}; }

  // Every language we ship, whether or not its strings are loaded. From the
  // _meta map in locales.boot.js; the loaded-bundle keys are the fallback for a
  // page that somehow has strings but no boot file.
  function metaMap() { return window.__OFFIQA_LOCALE_META__ || null; }
  function available() {
    var m = metaMap();
    return m ? Object.keys(m) : Object.keys(locales());
  }

  function stored() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  /* The active locale. locales.boot.js resolved this one script earlier — it
     had to, because it is what decided which language file to fetch — so this
     reads the answer rather than recomputing it. The branch below is the same
     resolution, kept for a page that loads i18n.js without the boot file. */
  function current() {
    if (window.__OFFIQA_LOCALE__) return window.__OFFIQA_LOCALE__;
    var known = metaMap() || locales();
    var s = stored();
    if (s && known[s]) return s;
    // Match locale-boot.tpl.js: only an explicit saved choice moves a fresh
    // install away from English. This also covers standalone pages that load
    // i18n.js without the locale boot script.
    return known[FALLBACK] ? FALLBACK : (available()[0] || FALLBACK);
  }

  function lookup(dict, key) {
    if (!dict) return undefined;
    var parts = key.split(".");
    var o = dict;
    for (var i = 0; i < parts.length; i++) {
      if (o == null) return undefined;
      o = o[parts[i]];
    }
    return o;
  }

  /* Ambient variables — available to every string without any call site passing
     them. There is exactly one use for this and it is deliberate: the word for
     the person you work for.

     "Client" is the right word for most of this product's users and it is a
     concrete one, so it stays the default. But the same data model also holds an
     employer and a work platform, and for those users "Clients" in the nav is
     simply wrong. Renaming globally would trade a precise word that fits the
     majority for a vague one that fits nobody exactly, so instead the noun is a
     hole in the string and the user fills it once.

     Ambient rather than a parameter because it appears in ~a dozen strings
     spread across five files; threading a variable through all of them would put
     the setting's fingerprints on call sites that have no other reason to know
     about it. */
  var ambient = {};
  function setAmbient(vars) { ambient = vars || {}; }

  // {name}-style placeholders. Missing vars are left intact so they show up.
  function interpolate(str, vars) {
    if (str.indexOf("{") < 0) return str;      // the overwhelmingly common case
    return str.replace(/\{(\w+)\}/g, function (m, k) {
      if (vars && vars[k] != null) return vars[k];
      return ambient[k] != null ? ambient[k] : m;
    });
  }

  /* Translate a dotted key. The English fallback is applied at BUILD time —
     every language file ships merged over en.json — so by the time a lookup
     misses here, the key is missing from English too and the key itself is
     what shows, which is what makes an untranslated string obvious in the UI.
     The L[FALLBACK] line still stands for the case where English is the loaded
     language, and costs one property read otherwise. */
  function t(key, vars) {
    var L = locales();
    var val = lookup(L[current()], key);
    if (val == null) val = lookup(L[FALLBACK], key);
    if (val == null) return key;
    if (typeof val !== "string") return val; // arrays/objects returned as-is
    return interpolate(val, vars);
  }

  /* Language list for the picker, from each locale's _meta block. Reads the
     _meta map rather than the loaded dictionaries: only one language's strings
     are resident, and a picker that offered only the language you are already
     in would be a picker you could never leave. */
  function languages() {
    var M = metaMap();
    var L = locales();
    return available().map(function (code) {
      var meta = (M && M[code]) || (L[code] && L[code]._meta) || {};
      return {
        code: code,
        name: meta.name || code,
        nativeName: meta.nativeName || meta.name || code,
      };
    });
  }

  function setLocale(code) {
    try { localStorage.setItem(STORAGE_KEY, code); } catch (e) {}
    /* Sample rows are ordinary persisted records, not translation keys. Mark
       the requested locale before reloading so the application can replace
       only its built-in sample records on the next boot. User-created data is
       never in scope for this handoff. */
    try { localStorage.setItem("offiqa.sample.locale.pending", code); } catch (e) {}
    location.reload();
  }

  // Localize static HTML nodes (used by popup/quicknote pages):
  //   data-i18n="key"           -> textContent
  //   data-i18n-html="key"      -> innerHTML (for strings containing markup)
  //   data-i18n-attr="attr:key;attr2:key2" -> attributes (title, aria-label, placeholder…)
  function applyDom(root) {
    var scope = root || document;
    try { document.documentElement.lang = current(); } catch (e) {}

    scope.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    scope.querySelectorAll("[data-i18n-html]").forEach(function (el) {
      el.innerHTML = t(el.getAttribute("data-i18n-html"));
    });
    scope.querySelectorAll("[data-i18n-attr]").forEach(function (el) {
      el.getAttribute("data-i18n-attr").split(";").forEach(function (pair) {
        var i = pair.indexOf(":");
        if (i < 0) return;
        var attr = pair.slice(0, i).trim();
        var key = pair.slice(i + 1).trim();
        if (attr && key) el.setAttribute(attr, t(key));
      });
    });
  }

  window.t = t;
  window.I18N = {
    t: t,
    getLocale: current,
    setLocale: setLocale,
    languages: languages,
    available: available,
    applyDom: applyDom,
    setAmbient: setAmbient,
    FALLBACK: FALLBACK,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { applyDom(); });
  } else {
    applyDom();
  }
})();
