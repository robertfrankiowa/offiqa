const OFFIQA_ONBOARDING_LANGUAGE_ORDER = ['en', 'es', 'vi'];

const OFFIQA_ONBOARDING_PACKS = globalThis.OFFIQA_I18N_PACKS || {};

const OFFIQA_ONBOARDING_LANGUAGES = OFFIQA_ONBOARDING_LANGUAGE_ORDER
  .filter((code) => OFFIQA_ONBOARDING_PACKS[code]?.onboarding)
  .map((code) => ({
    code,
    label: OFFIQA_ONBOARDING_PACKS[code].label || code
  }));

const OFFIQA_ONBOARDING_TRANSLATIONS = Object.fromEntries(
  OFFIQA_ONBOARDING_LANGUAGES.map(({ code }) => [
    code,
    OFFIQA_ONBOARDING_PACKS[code].onboarding
  ])
);

window.OffiqaOnboardingI18n = {
  languages: OFFIQA_ONBOARDING_LANGUAGES,
  translations: OFFIQA_ONBOARDING_TRANSLATIONS
};
