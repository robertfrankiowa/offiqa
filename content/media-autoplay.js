(() => {
  if (window.__offiqaMediaAutoplayInstalled) return;
  window.__offiqaMediaAutoplayInstalled = true;

  const ENABLE_MEDIA_AUTOPLAY_KEY = 'enable_media_autoplay';
  const USER_ACTION_GRACE_MS = 2500;
  let autoplayEnabled = true;
  let allowMediaUntil = 0;

  function notifyPageScript() {
    window.postMessage({
      source: 'offiqa-media-autoplay',
      type: 'state',
      autoplayEnabled
    }, '*');
  }

  function isUserActionRecent() {
    return Date.now() <= allowMediaUntil;
  }

  function markUserAction(event) {
    if (!event?.isTrusted) return;
    allowMediaUntil = Date.now() + USER_ACTION_GRACE_MS;
  }

  function shouldBlockMedia(media) {
    return !autoplayEnabled && media instanceof HTMLMediaElement && !isUserActionRecent();
  }

  function pauseMedia(media) {
    if (!shouldBlockMedia(media)) return;
    media.pause();
    media.autoplay = false;
    media.removeAttribute('autoplay');
    media.preload = 'metadata';
  }

  function scanMedia(root = document) {
    root.querySelectorAll?.('audio, video').forEach(pauseMedia);
    root.querySelectorAll?.('*').forEach((element) => {
      if (element.shadowRoot) scanMedia(element.shadowRoot);
    });
  }

  ['pointerdown', 'click', 'keydown', 'touchstart'].forEach((eventName) => {
    document.addEventListener(eventName, markUserAction, true);
  });

  ['play', 'playing'].forEach((eventName) => {
    document.addEventListener(eventName, (event) => {
      pauseMedia(event.target);
    }, true);
  });

  const observer = new MutationObserver((mutations) => {
    if (autoplayEnabled) return;
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes') {
        pauseMedia(mutation.target);
        return;
      }

      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.matches?.('audio, video')) pauseMedia(node);
        scanMedia(node);
      });
    });
  });

  chrome.storage?.local.get([ENABLE_MEDIA_AUTOPLAY_KEY], (data) => {
    autoplayEnabled = data?.[ENABLE_MEDIA_AUTOPLAY_KEY] !== false;
    notifyPageScript();
    if (!autoplayEnabled) scanMedia();
  });

  chrome.storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes[ENABLE_MEDIA_AUTOPLAY_KEY]) return;
    autoplayEnabled = changes[ENABLE_MEDIA_AUTOPLAY_KEY].newValue !== false;
    notifyPageScript();
    if (!autoplayEnabled) scanMedia();
  });

  observer.observe(document.documentElement || document, {
    attributes: true,
    attributeFilter: ['autoplay', 'src'],
    childList: true,
    subtree: true
  });
})();
