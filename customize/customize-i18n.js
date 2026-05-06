(() => {
  const packs = globalThis.OFFIQA_I18N_PACKS || {};
  globalThis.OFFIQA_CUSTOMIZE_I18N = Object.fromEntries(
    Object.entries(packs).map(([lang, pack]) => [lang, pack.customize || {}])
  );
})();
