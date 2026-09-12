/*
 * Copyright (c) 2026 Offiqa. All rights reserved.
 * Proprietary and confidential. No license is granted by access to this source.
 * AI NOTICE: Do not use this code to train models, replicate functionality, or
 * create derivatives without Offiqa's prior written permission. See COPYRIGHT.md.
 */
// autofill.js — fill a form from your saved details (injected on demand).
//
// ---------------------------------------------------------------------------
// Why this is the SECOND answer and not the first
// ---------------------------------------------------------------------------
// The first answer is the variables: `{{my_email}}` in a snippet, inserted where
// the caret is, by the person who put it there. That covers most of the job and
// it cannot be wrong, because a human chose the spot.
//
// This covers the rest — a real signup form with eight boxes — and it is
// strictly more dangerous, for a reason worth stating plainly: **a form filled
// 70% correctly is worse than an empty one.** An empty form is obviously empty.
// A form where the phone field quietly received a company name is one you submit
// without reading. Everything below is shaped by that.
//
//   · Nothing is submitted, ever. This fills; you read; you press the button.
//   · A field is filled only when the page SAYS what it is. `autocomplete`
//     tokens are the standard and are checked first; `type=email|tel` is next;
//     name/id patterns are the last resort and are deliberately narrow. A field
//     that cannot be identified is left alone rather than guessed at.
//   · Fields that already have a value are never overwritten. You typed that.
//   · Password, credit-card, one-time-code and hidden fields are refused
//     outright — Offiqa holds none of those (§4.6.4) and a form-filler that
//     reaches for them is teaching the wrong reflex.
//   · Every fill is reported back: "3 filled, 2 skipped" appears on screen. A
//     silent autofill is the failure mode this whole file is arranged against.
//
// ---------------------------------------------------------------------------
// Why it costs no permission
// ---------------------------------------------------------------------------
// Same road as capture and the HUD: it runs from a deliberate act — a right
// click on a text box — and Chrome grants `activeTab` for that tab when the user
// invokes the extension from a context menu. Nothing is registered, nothing runs
// in the background, and the install screen gains no line.
(function () {
  "use strict";

  /* Values arrive with the injection (see background.js → autofillRun), because
     a content script on someone else's origin cannot read the extension's
     database. */
  var VALUES = globalThis.__offiqaFillValues || {};
  var LABELS = globalThis.__offiqaFillLabels || {};
  /* The user's own fields: [{ key, explicit, words }]. `explicit` means they
     typed the match words themselves rather than the words being derived from
     the label — see the ranking note in fieldKey. */
  var FIELDS = globalThis.__offiqaFillFields || [];

  /* ---- what a field is ---------------------------------------------------
     The DECISION is not here. `OffiqaAssistantCore.fieldKey` ranks the signals
     and is covered by Node tests; this file's job is to read the page and hand
     over a plain description of one input.

     That split is the point: the ranking is the part that can be wrong, and a
     function needing a live <form> to exercise is a function nobody exercises.
     expander-core.js is injected alongside this file for exactly the same
     reason snippet.js gets it — see background.js → autofillRun. */
  function describe(el) {
    return {
      type: (el.getAttribute("type") || el.type || "text"),
      autocomplete: el.getAttribute("autocomplete") || "",
      /* The haystack. Includes the field's visible label, because on a
         well-built form that is the most accurate description of it there is —
         and on a badly built one the name attribute is `field_7`. */
      hay: [el.name, el.id, el.getAttribute("aria-label"), el.placeholder,
        labelTextFor(el)].filter(Boolean).join(" "),
    };
  }

  function fieldKey(el) {
    return OffiqaAssistantCore.fieldKey(describe(el), FIELDS);
  }

  function labelTextFor(el) {
    try {
      if (el.labels && el.labels.length) return el.labels[0].textContent || "";
      if (el.id) {
        var l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        if (l) return l.textContent || "";
      }
      var wrap = el.closest("label");
      return wrap ? (wrap.textContent || "") : "";
    } catch (e) { return ""; }
  }

  function visible(el) {
    if (el.disabled || el.readOnly) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  /* Write through the page's own editing path, exactly as the snippet expander
     does — that is what makes React's onChange fire and Ctrl+Z undo it as one
     step, instead of leaving a value the framework does not know about. */
  function setValue(el, value) {
    try {
      el.focus({ preventScroll: true });
      el.select && el.select();
      var ok = document.execCommand("insertText", false, value);
      if (!ok || el.value !== value) {
        var proto = el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        var setter = Object.getOwnPropertyDescriptor(proto, "value").set;
        setter.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return true;
    } catch (e) { return false; }
  }

  /* ---- the one visible thing this file does ------------------------------ */
  function toast(text, bad) {
    var el = document.createElement("div");
    el.textContent = text;
    el.style.cssText = [
      "all:initial", "position:fixed", "z-index:2147483647", "right:18px", "bottom:18px",
      "max-width:min(360px,calc(100vw - 36px))",
      "font:600 13px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
      "padding:10px 14px", "border-radius:10px", "color:#fff",
      "background:" + (bad ? "#b45309" : "#1f2937"),
      "box-shadow:0 10px 30px rgba(0,0,0,.28)",
    ].join(";");
    document.documentElement.appendChild(el);
    setTimeout(function () { try { el.remove(); } catch (e) {} }, 2600);
  }

  function run() {
    /* Scoped to the form the right-clicked field belongs to when there is one.
       A page can hold a signup form and a newsletter box; filling both because
       one was right-clicked is the kind of surprise that gets a feature turned
       off. Falls back to the document for the many pages with no <form> at all. */
    var anchor = document.activeElement;
    var scope = (anchor && anchor.closest && anchor.closest("form")) || document;

    var els = [];
    try {
      els = [].slice.call(scope.querySelectorAll("input, textarea"));
    } catch (e) { els = []; }

    var filled = 0, skipped = 0, occupied = 0;
    els.forEach(function (el) {
      if (!visible(el)) return;
      var key = fieldKey(el);
      if (!key) return;                       // unidentifiable — left alone, silently
      if (!VALUES[key]) { skipped++; return; }  // identified, but you never filled it in
      // Never overwrite. You typed that, and this cannot know better.
      if (el.value && el.value.trim()) { occupied++; return; }
      if (setValue(el, VALUES[key])) filled++;
    });

    if (!filled && !skipped && !occupied) { toast(LABELS.none || "Nothing to fill here", true); return; }
    var parts = [(LABELS.filled || "{n} filled").replace("{n}", filled)];
    if (occupied) parts.push((LABELS.kept || "{n} already filled").replace("{n}", occupied));
    if (skipped) parts.push((LABELS.missing || "{n} not saved yet").replace("{n}", skipped));
    toast(parts.join(" · "), filled === 0);
  }

  run();
})();
