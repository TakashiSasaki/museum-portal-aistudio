(() => {
    'use strict';

    const HEARTBEAT_PROTOCOL_VERSION = 2;
    const HEARTBEAT_INTERVAL_MS = 60_000;
    const REQUIRED_PARENT_WATCHDOG_VERSION = 2;
    const PARENT_WATCHDOG_STARTUP_GRACE_MS = 10_000;
    const PARENT_RELOAD_RETRY_MS = 10 * 60_000;
    const PARENT_RELOAD_IDLE_RETRY_MS = 5_000;
    const PARENT_RELOAD_STORAGE_KEY = 'imaginedeck-parent-watchdog-reload-at';

    let previousClockValue = null;
    let queuedStateHeartbeat = false;
    let parentWatchdogVerificationTimer = null;
    let parentReloadIdleRetryTimer = null;
    let parentReloadPendingReason = null;

    function clearParentReloadIdleRetry() {
        if (parentReloadIdleRetryTimer !== null) {
            clearTimeout(parentReloadIdleRetryTimer);
            parentReloadIdleRetryTimer = null;
        }
    }

    function scheduleParentReloadWhenIdle(delayMs = PARENT_RELOAD_IDLE_RETRY_MS) {
        if (parentReloadIdleRetryTimer !== null) {
            return;
        }

        parentReloadIdleRetryTimer = setTimeout(() => {
            parentReloadIdleRetryTimer = null;
            attemptParentReloadWhenIdle();
        }, delayMs);
    }

    function attemptParentReloadWhenIdle() {
        if (window.parent === window || parentReloadPendingReason === null) {
            return;
        }

        const applicationState = readApplicationState({ allowUnchangedClock: true });
        if (
            applicationState.appReady !== true ||
            applicationState.stopwatchRunning ||
            applicationState.timerRunning
        ) {
            scheduleParentReloadWhenIdle();
            console.info('[ImagineDeck Heartbeat] Parent watchdog migration deferred.', {
                appReady: applicationState.appReady,
                stopwatchRunning: applicationState.stopwatchRunning,
                timerRunning: applicationState.timerRunning
            });
            return;
        }

        clearParentReloadIdleRetry();

        const now = Date.now();
        const previousReloadAt = Number(
            window.parent.sessionStorage.getItem(PARENT_RELOAD_STORAGE_KEY) || 0
        );
        const elapsedSinceReload = now - previousReloadAt;

        if (elapsedSinceReload <= PARENT_RELOAD_RETRY_MS) {
            scheduleParentReloadWhenIdle(
                Math.max(
                    PARENT_RELOAD_IDLE_RETRY_MS,
                    PARENT_RELOAD_RETRY_MS - elapsedSinceReload + 1
                )
            );
            return;
        }

        const reason = parentReloadPendingReason;
        parentReloadPendingReason = null;
        window.parent.sessionStorage.setItem(
            PARENT_RELOAD_STORAGE_KEY,
            String(now)
        );
        console.warn('[ImagineDeck Heartbeat] Reloading parent for watchdog migration.', {
            reason
        });
        window.parent.location.reload();
    }

    function requestParentReload(reason) {
        parentReloadPendingReason = reason;
        attemptParentReloadWhenIdle();
    }

    function clearParentWatchdogVerification() {
        if (parentWatchdogVerificationTimer !== null) {
            clearTimeout(parentWatchdogVerificationTimer);
            parentWatchdogVerificationTimer = null;
        }
    }

    function scheduleParentWatchdogVerification() {
        if (parentWatchdogVerificationTimer !== null) {
            return;
        }

        parentWatchdogVerificationTimer = setTimeout(() => {
            parentWatchdogVerificationTimer = null;

            try {
                if (
                    window.parent.__IMAGINEDECK_WATCHDOG_VERSION__ !==
                    REQUIRED_PARENT_WATCHDOG_VERSION
                ) {
                    requestParentReload('expected watchdog did not confirm execution');
                }
            } catch (error) {
                console.warn(
                    '[ImagineDeck Heartbeat] Delayed parent watchdog verification failed.',
                    error
                );
            }
        }, PARENT_WATCHDOG_STARTUP_GRACE_MS);
    }

    function ensureParentWatchdogVersion() {
        if (window.parent === window) {
            return true;
        }

        try {
            const actualVersion = window.parent.__IMAGINEDECK_WATCHDOG_VERSION__;
            if (actualVersion === REQUIRED_PARENT_WATCHDOG_VERSION) {
                clearParentWatchdogVerification();
                parentReloadPendingReason = null;
                clearParentReloadIdleRetry();
                return true;
            }

            const expectedVersion =
                window.parent.__IMAGINEDECK_EXPECTED_WATCHDOG_VERSION__;

            if (
                actualVersion == null &&
                expectedVersion === REQUIRED_PARENT_WATCHDOG_VERSION
            ) {
                // The parent HTML expects v2, but only watchdog.js may certify
                // that v2 actually executed. Allow a short bootstrap grace period.
                scheduleParentWatchdogVerification();
                return true;
            }

            requestParentReload(
                `incompatible watchdog version: actual=${String(actualVersion)}, expected=${String(expectedVersion)}`
            );
            // Keep sending backward-compatible heartbeats while the safe parent
            // reload is deferred. Cached v1 watchdogs ignore protocolVersion.
            return true;
        } catch (error) {
            console.warn('[ImagineDeck Heartbeat] Parent watchdog version check failed.', error);
            return true;
        }
    }

    function readAssetState() {
        const stylesheet = document.querySelector('link[rel="stylesheet"][href="index.css"]');
        const qrImage = document.querySelector('.qr-wrapper-horizontal img');
        const indexScriptReady =
            typeof updateClock === 'function' &&
            typeof initFeeds === 'function' &&
            typeof nextNoticePage === 'function' &&
            typeof isSwRunning === 'boolean' &&
            typeof isTimerRunning === 'boolean';
        const mergeFeedsScriptReady =
            typeof mergeFeeds === 'function' &&
            typeof loadMergedEvents === 'function';
        const stylesheetReady = Boolean(stylesheet?.sheet);
        const qrImageReady = Boolean(
            qrImage &&
            qrImage.complete &&
            qrImage.naturalWidth > 0 &&
            qrImage.naturalHeight > 0
        );

        return {
            assetsReady:
                indexScriptReady &&
                mergeFeedsScriptReady &&
                stylesheetReady &&
                qrImageReady,
            assetStatus: {
                indexScriptReady,
                mergeFeedsScriptReady,
                stylesheetReady,
                qrImageReady
            },
            indexScriptReady,
            mergeFeedsScriptReady
        };
    }

    function readApplicationState(options = {}) {
        try {
            const clockParts = [
                document.getElementById('clock-date')?.textContent,
                document.getElementById('clock-h')?.textContent,
                document.getElementById('clock-m')?.textContent,
                document.getElementById('clock-s')?.textContent
            ];
            const clockValue = clockParts.join('|');
            const clockInitialized = Boolean(clockParts[0]);
            const clockProgressing =
                options.allowUnchangedClock === true ||
                previousClockValue === null ||
                clockValue !== previousClockValue;

            previousClockValue = clockValue;

            const stopwatchRunning =
                typeof isSwRunning === 'boolean' && isSwRunning;
            const timerRunning =
                typeof isTimerRunning === 'boolean' && isTimerRunning;
            const assetState = readAssetState();

            const appReady =
                document.readyState === 'complete' &&
                assetState.indexScriptReady &&
                assetState.mergeFeedsScriptReady &&
                clockInitialized &&
                clockProgressing;

            return {
                appReady,
                stopwatchRunning,
                timerRunning,
                assetsReady: assetState.assetsReady,
                assetStatus: assetState.assetStatus
            };
        } catch (error) {
            return {
                appReady: false,
                stopwatchRunning: false,
                timerRunning: false,
                assetsReady: false,
                assetStatus: {
                    stateReadError: error instanceof Error ? error.message : String(error)
                },
                stateReadError: error instanceof Error ? error.message : String(error)
            };
        }
    }

    function sendHeartbeat(options = {}) {
        if (window.parent === window || !ensureParentWatchdogVersion()) {
            return;
        }

        // ensureParentWatchdogVersion() can synchronously schedule a migration
        // and read the application state. Reuse an unchanged clock as healthy
        // during that compatibility window instead of performing a second
        // synchronous clock-progress check that would mark the heartbeat unhealthy.
        const applicationState = readApplicationState({
            ...options,
            allowUnchangedClock:
                options.allowUnchangedClock === true ||
                parentReloadPendingReason !== null
        });

        window.parent.postMessage(
            {
                type: 'imaginedeck-heartbeat',
                protocolVersion: HEARTBEAT_PROTOCOL_VERSION,
                timestamp: Date.now(),
                ...applicationState
            },
            window.location.origin
        );
    }

    function queueStateHeartbeat() {
        if (queuedStateHeartbeat) {
            return;
        }

        queuedStateHeartbeat = true;
        queueMicrotask(() => {
            queuedStateHeartbeat = false;
            sendHeartbeat({ allowUnchangedClock: true });
            attemptParentReloadWhenIdle();
        });
    }

    function observeRunStateChanges() {
        const runStateTargets = [
            document.querySelector('[data-target="mode-stopwatch"]'),
            document.querySelector('[data-target="mode-timer"]')
        ].filter(Boolean);

        if (runStateTargets.length === 0) {
            return;
        }

        const observer = new MutationObserver(queueStateHeartbeat);
        runStateTargets.forEach(target => {
            observer.observe(target, {
                attributes: true,
                attributeFilter: ['class']
            });
        });
    }

    window.addEventListener('message', event => {
        if (
            event.origin !== window.location.origin ||
            event.source !== window.parent ||
            event.data?.type !== 'imaginedeck-heartbeat-request'
        ) {
            return;
        }

        sendHeartbeat({ allowUnchangedClock: true });
    });

    window.addEventListener('load', () => {
        observeRunStateChanges();
        sendHeartbeat({ allowUnchangedClock: true });
        attemptParentReloadWhenIdle();
    }, { once: true });

    setInterval(() => {
        sendHeartbeat();
        attemptParentReloadWhenIdle();
    }, HEARTBEAT_INTERVAL_MS);
})();
