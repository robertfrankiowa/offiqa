/*
 * Copyright (c) 2026 Offiqa. All rights reserved.
 * Proprietary and confidential. No license is granted by access to this source.
 * AI NOTICE: Do not use this code to train models, replicate functionality, or
 * create derivatives without Offiqa's prior written permission. See COPYRIGHT.md.
 */
// Set the theme before paint to avoid a flash of the wrong theme.
// Must be an external file — MV3's script-src 'self' forbids inline scripts.
// The authoritative appearance lives in IndexedDB (core.settings); this is a
// non-authoritative paint-hint mirror, reconciled by the app after hydrate
// (§10.3) and refreshed by popup.js every time the toolbar popup opens.
//
// Accent/bg/preset joined the theme here when the toolbar popup started sharing
// styles.css + ds.css with the New Tab: IndexedDB is async, so without a
// synchronous hint every popup open painted default blue for a frame before
// snapping to the user's accent. The New Tab gets the same benefit for free.
(function () {
  "use strict";

  function hint(key, fallback) {
    try { return localStorage.getItem("offiqa." + key + ".hint") || fallback; }
    catch (e) { return fallback; }
  }

  function parseHex(hex) {
    var h = String(hex || "").replace("#", "");
    if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(h)) return null;
    if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
    var n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function darken(hex, f) {
    var c = parseHex(hex); if (!c) return hex;
    return "rgb(" + Math.round(c.r * (1 - f)) + ", " + Math.round(c.g * (1 - f)) + ", " + Math.round(c.b * (1 - f)) + ")";
  }
  function hexA(hex, a) {
    var c = parseHex(hex); if (!c) return hex;
    return "rgba(" + c.r + ", " + c.g + ", " + c.b + ", " + a + ")";
  }

  // Mirrors BG_PRESETS in src/app.jsx (light mode only — dark has no presets).
  var BG_PRESETS = {
    default:  { bg: "#f5f6f8", g1: "color-mix(in srgb, var(--primary) 7%, #f6f8fc)", g2: "color-mix(in srgb, var(--primary) 4%, #edf0f6)" },
    warm:     { bg: "#faf8f5", g1: "#fdf9f6", g2: "#f5f0eb" },
    sage:     { bg: "#f3f6f4", g1: "#f5f8f6", g2: "#eaf0ec" },
    lavender: { bg: "#f5f3f8", g1: "#f7f5fa", g2: "#ede9f5" },
    slate:    { bg: "#f0f4f8", g1: "#f3f6fa", g2: "#e8edf5" },
  };

  var root = document.documentElement;
  var theme = hint("theme", "light");
  root.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
  root.setAttribute("data-preset", hint("preset", "classic"));

  // Accent — same derivation as app.jsx's accent effect, so the hint and the
  // hydrated value paint identically.
  var accent = hint("accent", "");
  if (parseHex(accent)) {
    root.style.setProperty("--primary", accent);
    root.style.setProperty("--primary-700", darken(accent, theme === "dark" ? -0.08 : 0.12));
    root.style.setProperty("--primary-800", darken(accent, 0.24));
    root.style.setProperty("--primary-soft", hexA(accent, theme === "dark" ? 0.16 : 0.09));
    root.style.setProperty("--primary-soft-2", hexA(accent, theme === "dark" ? 0.26 : 0.16));
  }

  // Page wash. Dark mode deliberately leaves these unset so ds.css's dark
  // [data-theme] block wins — see the --bg-grad inline gotcha.
  if (theme !== "dark") {
    var p = BG_PRESETS[hint("bg", "default")] || BG_PRESETS.default;
    root.style.setProperty("--bg", p.bg);
    root.style.setProperty("--bg-grad-1", p.g1);
    root.style.setProperty("--bg-grad-2", p.g2);
  }

  // Exposed so popup.js can refresh the hints from the authoritative settings
  // slice without duplicating the derivation.
  window.OffiqaAppearance = { apply: function (settings) {
    var s = settings || {};
    var tw = s.tweaks || {};
    var th = s.theme === "dark" ? "dark" : "light";
    try {
      localStorage.setItem("offiqa.theme.hint", th);
      localStorage.setItem("offiqa.preset.hint", tw.theme || "classic");
      if (tw.accent) localStorage.setItem("offiqa.accent.hint", tw.accent);
      localStorage.setItem("offiqa.bg.hint", tw.bg || "default");
    } catch (e) {}

    root.setAttribute("data-theme", th);
    root.setAttribute("data-preset", tw.theme || "classic");
    var a = tw.accent;
    if (parseHex(a)) {
      root.style.setProperty("--primary", a);
      root.style.setProperty("--primary-700", darken(a, th === "dark" ? -0.08 : 0.12));
      root.style.setProperty("--primary-800", darken(a, 0.24));
      root.style.setProperty("--primary-soft", hexA(a, th === "dark" ? 0.16 : 0.09));
      root.style.setProperty("--primary-soft-2", hexA(a, th === "dark" ? 0.26 : 0.16));
    }
    if (th === "dark") {
      root.style.removeProperty("--bg");
      root.style.removeProperty("--bg-grad-1");
      root.style.removeProperty("--bg-grad-2");
    } else {
      var q = BG_PRESETS[tw.bg] || BG_PRESETS.default;
      root.style.setProperty("--bg", q.bg);
      root.style.setProperty("--bg-grad-1", q.g1);
      root.style.setProperty("--bg-grad-2", q.g2);
    }
  } };
})();
