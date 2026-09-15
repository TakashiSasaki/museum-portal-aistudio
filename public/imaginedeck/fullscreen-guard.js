(() => {
    'use strict';

    const FULLSCREEN_GUARD_VERSION = 2;
    const STATE = Object.freeze({
        BOOT: 'boot',
        FULLSCREEN: 'fullscreen',
        REQUESTING: 'requesting',
        TAP_REQUIRED: 'tap-required',
        UNAVAILABLE: 'unavailable',
        SUSPENDED: 'suspended'
    });

    const overlay = document.getElementById('fullscreen-guard');
    const title = document.getElementById('fullscreen-guard-title');
    const message = document.getElementById('fullscreen-guard-message');

    if (!overlay || !title || !message) {
        console.error('[ImagineDeck Fullscreen Guard] Required overlay elements are missing.');
        return;
    }

    const fullscreenDisplayMode = typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: fullscreen)')
        : null;

    let state = STATE.BOOT;
    let requestInFlight = false;

    function isDocumentVisible() {
        return document.visibilityState !== 'hidden';
    }

    function isEffectiveFullscreen() {
        return Boolean(
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            fullscreenDisplayMode?.matches
        );
    }

    function hasFullscreenRequest() {
        const target = document.documentElement;
        return Boolean(
            typeof target.requestFullscreen === 'function' ||
            typeof target.webkitRequestFullscreen === 'function'
        );
    }

    function setState(nextState) {
        state = nextState;
        overlay.dataset.state = nextState;
    }

    function enterFullscreenState(reason) {
        overlay.hidden = true;
        setState(STATE.FULLSCREEN);
        console.info('[ImagineDeck Fullscreen Guard] Fullscreen state confirmed.', { reason });
    }

    function showUnavailable() {
        setState(STATE.UNAVAILABLE);
        overlay.hidden = false;
        title.textContent = '全画面表示を開始できません';
        message.textContent = 'このブラウザではページから全画面表示を開始できません。ブラウザ側の全画面表示を使用してください。';
    }

    function showTapRequired({ retry = false } = {}) {
        if (isEffectiveFullscreen()) {
            enterFullscreenState('fullscreen became active before tap prompt');
            return;
        }
        if (!hasFullscreenRequest()) {
            showUnavailable();
            return;
        }

        setState(STATE.TAP_REQUIRED);
        overlay.hidden = false;
        title.textContent = retry
            ? '全画面表示に切り替えられませんでした'
            : '全画面表示ではありません';
        message.textContent = retry
            ? '画面をもう一度タップしてください。'
            : '画面をタップすると全画面表示になります。';
    }

    function renderRequesting() {
        setState(STATE.REQUESTING);
        overlay.hidden = false;
        title.textContent = '全画面表示に切り替えています';
        message.textContent = 'そのままお待ちください。';
    }

    async function requestFullscreen() {
        if (requestInFlight || isEffectiveFullscreen()) {
            if (isEffectiveFullscreen()) {
                enterFullscreenState('fullscreen already active before request');
            }
            return;
        }

        const target = document.documentElement;
        const standardRequest = target.requestFullscreen;
        const legacyRequest = target.webkitRequestFullscreen;
        if (typeof standardRequest !== 'function' && typeof legacyRequest !== 'function') {
            showUnavailable();
            return;
        }

        requestInFlight = true;
        renderRequesting();

        try {
            if (typeof standardRequest === 'function') {
                await standardRequest.call(target, { navigationUI: 'hide' });
            } else {
                await legacyRequest.call(target);
            }

            if (isEffectiveFullscreen()) {
                enterFullscreenState('user fullscreen request succeeded');
            } else {
                showTapRequired({ retry: true });
            }
        } catch (error) {
            console.warn('[ImagineDeck Fullscreen Guard] Fullscreen request failed.', { error });
            showTapRequired({ retry: true });
        } finally {
            requestInFlight = false;
            if (isEffectiveFullscreen()) {
                enterFullscreenState('user fullscreen request completed');
            }
        }
    }

    function suspend() {
        overlay.hidden = true;
        setState(STATE.SUSPENDED);
    }

    function reconcile(reason) {
        if (!isDocumentVisible()) {
            suspend();
            return;
        }
        if (isEffectiveFullscreen()) {
            enterFullscreenState(reason);
            return;
        }
        if (state === STATE.REQUESTING) {
            return;
        }
        showTapRequired();
    }

    function handleUserActivation(event) {
        if (overlay.hidden || isEffectiveFullscreen()) {
            return;
        }
        if (
            event?.type === 'keydown' &&
            event.key !== 'Enter' &&
            event.key !== ' ' &&
            event.key !== 'Space' &&
            event.key !== 'Spacebar'
        ) {
            return;
        }
        event?.preventDefault?.();
        void requestFullscreen();
    }

    overlay.addEventListener('click', handleUserActivation);
    overlay.addEventListener('keydown', handleUserActivation);

    document.addEventListener('fullscreenchange', () => {
        setState(STATE.BOOT);
        reconcile(isEffectiveFullscreen() ? 'fullscreenchange' : 'fullscreen exited');
    });

    document.addEventListener('fullscreenerror', () => {
        if (!requestInFlight && !isEffectiveFullscreen()) {
            showTapRequired({ retry: true });
        }
    });

    if ('onwebkitfullscreenchange' in document) {
        document.addEventListener('webkitfullscreenchange', () => {
            setState(STATE.BOOT);
            reconcile(isEffectiveFullscreen() ? 'webkitfullscreenchange' : 'webkit fullscreen exited');
        });
    }

    document.addEventListener('visibilitychange', () => {
        if (!isDocumentVisible()) {
            suspend();
            return;
        }
        setState(STATE.BOOT);
        reconcile('document became visible');
    });

    window.addEventListener('pageshow', () => {
        if (!isDocumentVisible()) {
            return;
        }
        setState(STATE.BOOT);
        reconcile('pageshow');
    });

    if (fullscreenDisplayMode) {
        const handleDisplayModeChange = () => {
            setState(STATE.BOOT);
            reconcile(
                isEffectiveFullscreen()
                    ? 'display-mode fullscreen'
                    : 'display-mode left fullscreen'
            );
        };
        if (typeof fullscreenDisplayMode.addEventListener === 'function') {
            fullscreenDisplayMode.addEventListener('change', handleDisplayModeChange);
        } else if (typeof fullscreenDisplayMode.addListener === 'function') {
            fullscreenDisplayMode.addListener(handleDisplayModeChange);
        }
    }

    window.__IMAGINEDECK_FULLSCREEN_GUARD_VERSION__ = FULLSCREEN_GUARD_VERSION;
    window.__IMAGINEDECK_FULLSCREEN_GUARD_DIAGNOSTICS__ = Object.freeze({
        getState: () => state,
        isEffectiveFullscreen
    });

    reconcile('initial load');
})();
