(() => {
  const APP_REGISTRY = {
    gmail:          { id: 'gmail',          label: 'Gmail',          url: 'https://mail.google.com',          domain: 'mail.google.com',          emoji: '📧' },
    outlook:        { id: 'outlook',        label: 'Outlook',        url: 'https://outlook.office.com',       domain: 'outlook.office.com',       emoji: '📨' },
    calendar:       { id: 'calendar',       label: 'Calendar',       url: 'https://calendar.google.com',      domain: 'calendar.google.com',      emoji: '📅' },
    drive:          { id: 'drive',          label: 'Drive',          url: 'https://drive.google.com',         domain: 'drive.google.com',         emoji: '🗂' },
    docs:           { id: 'docs',           label: 'Docs',           url: 'https://docs.google.com',          domain: 'docs.google.com',          emoji: '📄' },
    sheets:         { id: 'sheets',         label: 'Sheets',         url: 'https://sheets.google.com',        domain: 'sheets.google.com',        emoji: '📊' },
    meet:           { id: 'meet',           label: 'Meet',           url: 'https://meet.google.com',          domain: 'meet.google.com',          emoji: '📞' },
    slack:          { id: 'slack',          label: 'Slack',          url: 'https://app.slack.com',            domain: 'app.slack.com',            emoji: '💬' },
    teams:          { id: 'teams',          label: 'Teams',          url: 'https://teams.microsoft.com',      domain: 'teams.microsoft.com',      emoji: '👥' },
    notion:         { id: 'notion',         label: 'Notion',         url: 'https://www.notion.so',            domain: 'notion.so',                emoji: '📓' },
    trello:         { id: 'trello',         label: 'Trello',         url: 'https://trello.com',               domain: 'trello.com',               emoji: '📌' },
    asana:          { id: 'asana',          label: 'Asana',          url: 'https://app.asana.com',            domain: 'app.asana.com',            emoji: '✅' },
    clickup:        { id: 'clickup',        label: 'ClickUp',        url: 'https://app.clickup.com',          domain: 'app.clickup.com',          emoji: '🟣' },
    zoom:           { id: 'zoom',           label: 'Zoom',           url: 'https://zoom.us',                  domain: 'zoom.us',                  emoji: '🎥' },
    github:         { id: 'github',         label: 'GitHub',         url: 'https://github.com',               domain: 'github.com',               emoji: '🐙' },
    chatgpt:        { id: 'chatgpt',        label: 'ChatGPT',        url: 'https://chat.openai.com',          domain: 'chat.openai.com',          emoji: '🤖' },
    figma:          { id: 'figma',          label: 'Figma',          url: 'https://figma.com',                domain: 'figma.com',                emoji: '🎨' },
    linkedin:       { id: 'linkedin',       label: 'LinkedIn',       url: 'https://www.linkedin.com',         domain: 'linkedin.com',             emoji: '🔗' },
    crm:            { id: 'crm',            label: 'CRM',            url: 'https://app.hubspot.com',          domain: 'hubspot.com',              emoji: '🧲' },
    analytics:      { id: 'analytics',      label: 'Analytics',      url: 'https://analytics.google.com',     domain: 'analytics.google.com',     emoji: '📈' },
    search_console: { id: 'search_console', label: 'Search Console', url: 'https://search.google.com/search-console', domain: 'search.google.com', emoji: '🔎' },
    google_ads:     { id: 'google_ads',     label: 'Google Ads',     url: 'https://ads.google.com',           domain: 'ads.google.com',           emoji: '📣' },
    meta_business:  { id: 'meta_business',  label: 'Meta Business',  url: 'https://business.facebook.com',    domain: 'business.facebook.com',    emoji: '🏢' },
    canva:          { id: 'canva',          label: 'Canva',          url: 'https://www.canva.com',            domain: 'canva.com',                emoji: '🖼' },
    forms:          { id: 'forms',          label: 'Forms',          url: 'https://forms.google.com',         domain: 'forms.google.com',         emoji: '📝' },
    stripe:         { id: 'stripe',         label: 'Stripe',         url: 'https://dashboard.stripe.com',     domain: 'dashboard.stripe.com',     emoji: '💳' },
    paypal:         { id: 'paypal',         label: 'PayPal',         url: 'https://www.paypal.com',           domain: 'paypal.com',               emoji: '💰' },
    paddle:         { id: 'paddle',         label: 'Paddle',         url: 'https://vendors.paddle.com',       domain: 'vendors.paddle.com',       emoji: '🏗' }
  };

  globalThis.OFFIQA_APPS = APP_REGISTRY;

  globalThis.OffiqaQuickLinkFromApp = function (appId) {
    const a = APP_REGISTRY[appId];
    if (!a) return null;
    return { id: a.id, name: a.label, url: a.url, emoji: a.emoji, domain: a.domain };
  };
})();