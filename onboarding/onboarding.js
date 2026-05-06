const { languages, translations } = window.OffiqaOnboardingI18n;

let selectedLang = 'en';
let currentStep = 1;
const chromeStorage = globalThis.chrome?.storage?.local;

function getCopy(lang = selectedLang) {
  return translations[lang] || translations.en;
}

function renderLanguageButtons() {
  return languages.map((lang) => (
    `<button class="lang-btn${lang.code === selectedLang ? ' selected' : ''}" data-lang="${lang.code}">${lang.label}</button>`
  )).join('');
}

function renderFeatures(features) {
  return features.map((feature) => `
    <div class="feature-card">
      <div class="feature-item">
        <div class="feature-icon" aria-hidden="true">${feature.icon || ''}</div>
        <div>
          <div class="feature-name">${feature.name}</div>
          <div class="feature-desc">${feature.desc}</div>
        </div>
      </div>
    </div>
  `).join('');
}

function renderPrivacy(privacy) {
  if (!privacy) return '';

  return `
    <section class="privacy-panel" aria-label="${privacy.title}">
      <div class="privacy-heading">
        <span class="privacy-icon" aria-hidden="true">${privacy.icon}</span>
        <div>
          <h2>${privacy.title}</h2>
        </div>
      </div>
      <div class="privacy-badges">
        ${(privacy.highlights || []).map((item) => `<span>${item}</span>`).join('')}
      </div>
      <ul class="privacy-points">
        ${privacy.points.map((point) => `<li>${point}</li>`).join('')}
      </ul>
      <a class="github-link" href="${privacy.githubUrl}" target="_blank" rel="noopener noreferrer">
        <span>${privacy.githubBrand}</span>
        <strong>${privacy.githubLabel}</strong>
        <span aria-hidden="true">${privacy.externalIcon}</span>
      </a>
    </section>
  `;
}

function renderChips(items) {
  return items.map((item) => `<div class="chip">${item}</div>`).join('');
}

function renderBrandLogo(copy) {
  return `<img class="logo" src="../icons/icon128.png" alt="${copy.meta.logoAlt}" width="72" height="72">`;
}

function renderStep1(copy) {
  document.getElementById('step1').innerHTML = `
    ${renderBrandLogo(copy)}
    <div class="step-indicator">${copy.step1.step_indicator}</div>
    <h1>${copy.step1.title}</h1>
    <p class="lang-title">${copy.step1.subtitle}</p>
    <div class="lang-grid">${renderLanguageButtons()}</div>
    <button class="btn-main" id="btn-step1">${copy.step1.button}</button>
    <p class="small-note">${copy.step1.note}</p>
  `;
}

function renderStep2(copy) {
  document.getElementById('step2').innerHTML = `
    ${renderBrandLogo(copy)}
    <div class="step-indicator">${copy.step2.step_indicator}</div>
    <h1>${copy.step2.title}</h1>
    <p class="subtitle">${copy.step2.subtitle}</p>
    <div class="features">
      <div class="feature-grid">${renderFeatures(copy.step2.features)}</div>
      ${renderPrivacy(copy.step2.privacy)}
    </div>
    <button class="btn-main" id="btn-step2">${copy.step2.button}</button>
  `;
}

function renderStep3(copy) {
  document.getElementById('step3').innerHTML = `
    ${renderBrandLogo(copy)}
    <div class="step-indicator">${copy.step3.step_indicator}</div>
    <h1>${copy.step3.title}</h1>
    <p class="subtitle">${copy.step3.subtitle}</p>
    <div class="home-chips">${renderChips(copy.step3.chips)}</div>
    <button class="btn-main" id="btn-step3">${copy.step3.button}</button>
    <button class="btn-secondary" id="btn-skip">${copy.step3.secondary}</button>
    <p class="small-note">${copy.step3.note}</p>
  `;
}

function updateActiveStep() {
  [1, 2, 3].forEach((step) => {
    document.getElementById(`step${step}`).classList.toggle('active', step === currentStep);
  });
}

function renderAll() {
  const copy = getCopy();
  document.documentElement.lang = selectedLang;
  document.title = copy.meta.pageTitle;
  renderStep1(copy);
  renderStep2(copy);
  renderStep3(copy);
  updateActiveStep();
}

function goStep(step) {
  currentStep = step;
  updateActiveStep();
}

document.addEventListener('click', async (event) => {
  const langButton = event.target.closest('.lang-btn');
  if (langButton) {
    selectedLang = langButton.dataset.lang;
    renderAll();
    return;
  }

  if (event.target.id === 'btn-step1') {
    if (chromeStorage) {
      await chromeStorage.set({ offiqa_language: selectedLang });
    }
    goStep(2);
    return;
  }

  if (event.target.id === 'btn-step2') {
    goStep(3);
    return;
  }

  if (event.target.id === 'btn-step3') {
    if (chromeStorage) {
      const layoutConfig = {
        order: ["meetings", "today_focus", "quick_notes", "resume_sessions", "focus_timer", "frequent_tools"],
        hidden: [
          "client_followup",
          "campaign_content",
          "design_asset",
          "snippets",
          "clipboard",
          "browser_controls",
          "autoplay_controls",
          "waiting_on",
          "work_requests",
          "deadline_radar",
          "routine_checklist",
          "key_links",
          "update_builder",
          "handoff_pack"
        ],
        density: "comfortable"
      };
      
      const quickApps = ["gmail", "drive", "calendar", "meet", "sheets", "docs", "github", "chatgpt", "figma"];

      await chromeStorage.set({ 
        offiqa_language: selectedLang,
        offiqa_onboarding_completed: true,
        offiqa_onboarding_version: "3step_v1",
        offiqa_home_enabled: true,
        offiqa_layout_preset_id: "default_calm_workspace",
        offiqa_first_home_toast_shown: false
      });
      
      const currentData = await chromeStorage.get(['offiqa_layout_config', 'offiqa_quick_apps']);
      const updates = {};
      if (!currentData.offiqa_layout_config) updates.offiqa_layout_config = layoutConfig;
      if (!currentData.offiqa_quick_apps) updates.offiqa_quick_apps = quickApps;
      
      if (Object.keys(updates).length > 0) {
        await chromeStorage.set(updates);
      }
    }
    window.close();
    chrome.tabs.create({ url: 'chrome://newtab' });
    return;
  }

  if (event.target.id === 'btn-skip') {
    if (chromeStorage) {
      await chromeStorage.set({
        offiqa_language: selectedLang,
        offiqa_onboarding_completed: true,
        offiqa_onboarding_version: "3step_v1",
        offiqa_home_enabled: false
      });
    }
    window.close();
  }
});

async function initOnboarding() {
  if (!chromeStorage) {
    renderAll();
    return;
  }

  const data = await chromeStorage.get(['language']);
  if (data.language && translations[data.language]) {
    selectedLang = data.language;
  }
  renderAll();
}

globalThis.chrome?.storage?.onChanged?.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes.language) return;
  if (changes.language.newValue && translations[changes.language.newValue]) {
    selectedLang = changes.language.newValue;
    renderAll();
  }
});

initOnboarding();
