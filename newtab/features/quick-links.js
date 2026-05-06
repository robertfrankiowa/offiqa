// ===== QUICK LINKS =====
const DEFAULT_DOCK_LINKS = [
  { id: 'gmail', name: 'Gmail', url: 'https://mail.google.com', domain: 'mail.google.com' },
  { id: 'drive', name: 'Drive', url: 'https://drive.google.com', domain: 'drive.google.com' },
  { id: 'calendar', name: 'Calendar', url: 'https://calendar.google.com', domain: 'calendar.google.com' },
  { id: 'meet', name: 'Meet', url: 'https://meet.google.com', domain: 'meet.google.com' },
  { id: 'sheets', name: 'Sheets', url: 'https://sheets.google.com', domain: 'sheets.google.com' },
  { id: 'docs', name: 'Docs', url: 'https://docs.google.com', domain: 'docs.google.com' }
];
const DEFAULT_EXTRA_QUICK_LINKS = [
  { id: 'github', name: 'GitHub', url: 'https://github.com', domain: 'github.com' },
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chat.openai.com', domain: 'chat.openai.com' },
  { id: 'figma', name: 'Figma', url: 'https://figma.com', domain: 'figma.com' }
];
const DEFAULT_QUICK_LINKS = [...DEFAULT_DOCK_LINKS, ...DEFAULT_EXTRA_QUICK_LINKS];
const QUICK_LINK_USAGE_KEY = 'quick_link_usage';

let quickLinks = [];
let quickLinksUsage = {};
let quickLinksContext = { suggestedIds: [], suggestionLabel: '' };
let qlEditMode = false;

function getHostnameFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

function cleanDomain(domain) {
  return String(domain || '').replace(/^www\./i, '').toLowerCase();
}

function getLinkDomain(link) {
  return link.domain || getHostnameFromUrl(link.url);
}

function getQuickLinkKey(link) {
  return cleanDomain(getLinkDomain(link)) || link.id || link.url;
}

function normalizeQuickLink(link) {
  const url = String(link?.url || '').trim();
  if (!url) return null;
  const domain = cleanDomain(link.domain || getHostnameFromUrl(url));
  return {
    id: String(link.id || domain || Date.now()),
    name: String(link.name || domain || url).trim(),
    url,
    domain,
    emoji: String(link.emoji || '🔗')
  };
}

function normalizeQuickLinkUsage(raw = {}) {
  return raw && typeof raw === 'object' ? raw : {};
}

function getFaviconUrl(domain) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
}

function renderQuickLinkIcon(link) {
  const domain = getLinkDomain(link);
  if (domain) {
    return `<img class="ql-favicon" src="${getFaviconUrl(domain)}" alt="" loading="lazy">`;
  }
  return `<span class="ql-emoji">${escHtml(link.emoji || '🔗')}</span>`;
}

function getQuickLinkBadge(link, index) {
  const key = getQuickLinkKey(link);
  const usage = quickLinksUsage[key] || {};
  if (quickLinksContext.suggestedIds?.includes(link.id)) return { text: 'Context', className: 'context' };
  if (index < 4) return { text: 'Pin', className: 'live' };
  if (Number(usage.count || 0) >= 3) return { text: 'Often', className: 'frequent' };
  return null;
}

async function refreshQuickLinksContext() {
  quickLinksContext = { suggestedIds: [], suggestionLabel: '' };
}

async function persistQuickLinks() {
  await store.set({ quick_links: quickLinks });
}

function renderQuickLinkCard(link, index) {
  const badge = getQuickLinkBadge(link, index);
  return `
    <div class="ql-item${index < 4 ? ' is-priority' : ''}" data-id="${escAttr(link.id)}">
      ${badge ? `<div class="ql-item-badge-row"><span class="ql-item-badge ${badge.className}">${escHtml(badge.text)}</span></div>` : ''}
      ${qlEditMode ? `
        <div class="ql-item-tools">
          <button type="button" class="ql-menu-toggle" data-action="delete-quick-link" data-id="${escAttr(link.id)}" title="Delete">×</button>
        </div>
      ` : ''}
      <button type="button" class="ql-link-hit" data-action="open-quick-link" data-id="${escAttr(link.id)}">
        ${renderQuickLinkIcon(link)}
        <span class="ql-name">${escHtml(link.name)}</span>
      </button>
    </div>
  `;
}

function renderQuickLinks() {
  const el = document.getElementById('quick-links-panel');
  const editBtn = document.getElementById('ql-edit-btn');
  if (!el) return;

  if (editBtn) {
    editBtn.classList.toggle('is-editing', qlEditMode);
    editBtn.setAttribute('aria-pressed', String(qlEditMode));
  }

  const links = quickLinks.length ? quickLinks : DEFAULT_QUICK_LINKS.map(normalizeQuickLink).filter(Boolean);
  el.classList.toggle('ql-edit-mode', qlEditMode);
  el.innerHTML = `
    ${quickLinksContext.suggestionLabel ? `
      <div class="quick-links-smartbar">
        <div class="quick-links-smartbar-copy">
          <span class="quick-links-smartbar-kicker">Suggested</span>
          <span class="quick-links-smartbar-title">${escHtml(quickLinksContext.suggestionLabel)}</span>
        </div>
      </div>
    ` : ''}
    ${qlEditMode ? `<div class="quick-links-edit-note">Drag or remove shortcuts, then add the tools you use most.</div>` : ''}
    <div class="quick-links-section">
      <div class="quick-links-grid">
        ${links.map(renderQuickLinkCard).join('')}
        <button type="button" class="ql-add-btn" id="ql-add-btn">
          <span class="ql-emoji">+</span>
          <span class="ql-name">Add</span>
        </button>
      </div>
    </div>
  `;
}

async function loadQuickLinks() {
  const data = await store.get(['quick_links', QUICK_LINK_USAGE_KEY]);
  const storedLinks = Array.isArray(data.quick_links) ? data.quick_links : [];
  quickLinks = (storedLinks.length ? storedLinks : DEFAULT_QUICK_LINKS).map(normalizeQuickLink).filter(Boolean);
  quickLinksUsage = normalizeQuickLinkUsage(data[QUICK_LINK_USAGE_KEY]);
  await refreshQuickLinksContext();
  renderQuickLinks();
}

function normalizeQuickLinkUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

async function promptAddLink() {
  const url = normalizeQuickLinkUrl(prompt(localizeNewTabPromptLabel('URL:'), ''));
  if (!url) return;
  const name = prompt(localizeNewTabPromptLabel('Tên hiển thị:'), getHostnameFromUrl(url)) || getHostnameFromUrl(url);
  quickLinks.push(normalizeQuickLink({ id: `${Date.now()}`, name, url }));
  await persistQuickLinks();
  renderQuickLinks();
}

async function deleteQuickLink(linkId) {
  quickLinks = quickLinks.filter((link) => link.id !== linkId);
  await persistQuickLinks();
  renderQuickLinks();
}

async function recordQuickLinkOpen(link) {
  const key = getQuickLinkKey(link);
  quickLinksUsage[key] = {
    count: Number(quickLinksUsage[key]?.count || 0) + 1,
    lastOpened: Date.now()
  };
  await store.set({ [QUICK_LINK_USAGE_KEY]: quickLinksUsage });
}

async function openQuickLinkById(linkId) {
  const link = quickLinks.find((item) => item.id === linkId);
  if (!link) return;
  await recordQuickLinkOpen(link);
  window.location.href = link.url;
}

document.getElementById('ql-edit-btn')?.addEventListener('click', () => {
  qlEditMode = !qlEditMode;
  renderQuickLinks();
});

document.getElementById('quick-links-panel')?.addEventListener('click', async (e) => {
  const addButton = e.target.closest('#ql-add-btn');
  if (addButton) {
    await promptAddLink();
    return;
  }

  const deleteButton = e.target.closest('[data-action="delete-quick-link"]');
  if (deleteButton) {
    await deleteQuickLink(deleteButton.dataset.id);
    return;
  }

  const openButton = e.target.closest('[data-action="open-quick-link"]');
  if (openButton) await openQuickLinkById(openButton.dataset.id);
});

window.offiqaNewtabFeatureInitializers = window.offiqaNewtabFeatureInitializers || {};
window.offiqaNewtabFeatureInitializers.quickLinks = async () => {
  await loadQuickLinks();
};
