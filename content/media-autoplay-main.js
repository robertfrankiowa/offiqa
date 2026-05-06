(() => {
  if (window.__offiqaMediaAutoplayMainInstalled) return;
  window.__offiqaMediaAutoplayMainInstalled = true;

  const USER_ACTION_GRACE_MS = 2500;
  const nativePlay = HTMLMediaElement.prototype.play;
  const NativeAudioContext = window.AudioContext;
  const NativeOfflineAudioContext = window.OfflineAudioContext;
  const NativeWebkitAudioContext = window.webkitAudioContext;
  const NativeAudioScheduledSourceNode = window.AudioScheduledSourceNode;
  const NativeAudioBufferSourceNode = window.AudioBufferSourceNode;
  const NativeOscillatorNode = window.OscillatorNode;
  const NativeConstantSourceNode = window.ConstantSourceNode;
  const trackedAudioContexts = new Set();
  let autoplayEnabled = false;
  let allowMediaUntil = 0;

  function markUserAction(event) {
    if (!event?.isTrusted) return;
    allowMediaUntil = Date.now() + USER_ACTION_GRACE_MS;
  }

  function isUserActionRecent() {
    return Date.now() <= allowMediaUntil || navigator.userActivation?.isActive === true;
  }

  function shouldBlock() {
    return !autoplayEnabled && !isUserActionRecent();
  }

  function prepareBlockedMedia(media) {
    media.pause();
    media.autoplay = false;
    media.removeAttribute('autoplay');
    media.preload = 'metadata';
  }

  function createBlockedResult() {
    return Promise.resolve();
  }

  function isOfflineAudioContextInstance(context) {
    return typeof NativeOfflineAudioContext === 'function' && context instanceof NativeOfflineAudioContext;
  }

  function isRealtimeAudioContext(context) {
    return Boolean(context) && !isOfflineAudioContextInstance(context);
  }

  function silenceAudioContext(context) {
    if (!isRealtimeAudioContext(context) || context.state === 'closed') return;
    try {
      context.suspend();
    } catch {
      // Best effort: some contexts may reject while closing.
    }
  }

  function silenceTrackedAudioContexts() {
    trackedAudioContexts.forEach((context) => {
      silenceAudioContext(context);
    });
  }

  function trackAudioContext(context) {
    if (!isRealtimeAudioContext(context)) return;
    trackedAudioContexts.add(context);
    context.addEventListener?.('statechange', () => {
      if (context.state === 'closed') {
        trackedAudioContexts.delete(context);
        return;
      }

      if (shouldBlock() && context.state === 'running') {
        silenceAudioContext(context);
      }
    });

    if (shouldBlock()) {
      silenceAudioContext(context);
    }
  }

  function wrapAudioContextConstructor(NativeContext) {
    if (typeof NativeContext !== 'function') return NativeContext;

    const GuardedAudioContext = function OffiqaAudioContextGuard(...args) {
      const context = Reflect.construct(NativeContext, args, new.target || GuardedAudioContext);
      trackAudioContext(context);
      return context;
    };

    Object.setPrototypeOf(GuardedAudioContext, NativeContext);
    GuardedAudioContext.prototype = NativeContext.prototype;
    Object.defineProperty(GuardedAudioContext, 'name', {
      value: NativeContext.name,
      configurable: true
    });

    return GuardedAudioContext;
  }

  function patchAudioContextPrototype(NativeContext) {
    if (typeof NativeContext !== 'function' || !NativeContext.prototype) return;
    if (NativeContext.prototype.__offiqaAudioContextPatched) return;

    const nativeResume = NativeContext.prototype.resume;
    const nativeCreateMediaElementSource = NativeContext.prototype.createMediaElementSource;
    Object.defineProperty(NativeContext.prototype, '__offiqaAudioContextPatched', {
      value: true,
      configurable: true
    });

    if (typeof nativeResume === 'function') {
      NativeContext.prototype.resume = function offiqaAudioContextResumeGuard(...args) {
        trackAudioContext(this);
        if (isRealtimeAudioContext(this) && shouldBlock()) {
          silenceAudioContext(this);
          return createBlockedResult();
        }

        return nativeResume.apply(this, args);
      };
    }

    if (typeof nativeCreateMediaElementSource === 'function') {
      NativeContext.prototype.createMediaElementSource = function offiqaMediaElementSourceGuard(mediaElement, ...args) {
        if (mediaElement instanceof HTMLMediaElement && shouldBlock()) {
          prepareBlockedMedia(mediaElement);
        }

        return nativeCreateMediaElementSource.apply(this, [mediaElement, ...args]);
      };
    }
  }

  function patchAudioScheduledSourcePrototype(NativeSourceNode) {
    if (typeof NativeSourceNode !== 'function' || !NativeSourceNode.prototype) return;
    if (NativeSourceNode.prototype.__offiqaAudioSourcePatched) return;

    const nativeStart = NativeSourceNode.prototype.start;
    Object.defineProperty(NativeSourceNode.prototype, '__offiqaAudioSourcePatched', {
      value: true,
      configurable: true
    });

    if (typeof nativeStart === 'function') {
      NativeSourceNode.prototype.start = function offiqaAudioSourceStartGuard(...args) {
        if (isRealtimeAudioContext(this.context) && shouldBlock()) {
          silenceAudioContext(this.context);
          try {
            this.stop?.(0);
          } catch {
            // A source may not be started yet; silencing the owning context covers it.
          }

          silenceTrackedAudioContexts();
          return undefined;
        }

        return nativeStart.apply(this, args);
      };
    }
  }

  patchAudioContextPrototype(NativeAudioContext);
  patchAudioContextPrototype(NativeWebkitAudioContext);
  patchAudioScheduledSourcePrototype(NativeAudioScheduledSourceNode);
  patchAudioScheduledSourcePrototype(NativeAudioBufferSourceNode);
  patchAudioScheduledSourcePrototype(NativeOscillatorNode);
  patchAudioScheduledSourcePrototype(NativeConstantSourceNode);

  if (NativeAudioContext) {
    window.AudioContext = wrapAudioContextConstructor(NativeAudioContext);
  }

  if (NativeWebkitAudioContext) {
    window.webkitAudioContext = wrapAudioContextConstructor(NativeWebkitAudioContext);
  }

  if (NativeOfflineAudioContext && window.OfflineAudioContext === NativeOfflineAudioContext) {
    window.OfflineAudioContext = NativeOfflineAudioContext;
  }

  HTMLMediaElement.prototype.play = function offiqaPlayGuard(...args) {
    if (this instanceof HTMLMediaElement && shouldBlock()) {
      prepareBlockedMedia(this);
      return createBlockedResult();
    }

    return nativePlay.apply(this, args);
  };

  ['pointerdown', 'click', 'keydown', 'touchstart'].forEach((eventName) => {
    document.addEventListener(eventName, markUserAction, true);
  });

  ['play', 'playing'].forEach((eventName) => {
    document.addEventListener(eventName, (event) => {
      if (event.target instanceof HTMLMediaElement && shouldBlock()) prepareBlockedMedia(event.target);
    }, true);
  });

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.source !== 'offiqa-media-autoplay' || event.data?.type !== 'state') return;
    autoplayEnabled = event.data.autoplayEnabled !== false;
    if (!autoplayEnabled) silenceTrackedAudioContexts();
  });
})();
