(() => {
    'use strict';

    const WATCHDOG_VERSION = 2;
    const REQUIRED_CHILD_HEARTBEAT_VERSION = 2;
    const LEGACY_CHILD_HEARTBEAT_VERSION = 1;
    const CHECK_INTERVAL_MS = 60_000;
    const HEARTBEAT_TIMEOUT_MS = 150_000;
    const CHILD_STATE_CONFIRM_TIMEOUT_MS = 2_000;
    const LEGACY_CHILD_CONFIRM_DELAY_MS = 1_200;
    const ASSET_CONFIRM_TIMEOUT_MS = 30_000;
    const SERVICE_WORKER_UPDATE_TIMEOUT_MS = 12_000;
    const SERVICE_WORKER_CONTROL_TIMEOUT_MS = 5_000;
    const RELOAD_WINDOW_MS = 10 * 60_000;
    const MAX_RELOADS_PER_WINDOW = 3;
    const APP_URL = './app.html';
    const ASSET_SIGNATURE_STORAGE_KEY = 'imaginedeck-loaded-asset-signature';
    const REQUIRE_NETWORK_HEADER = 'X-ImagineDeck-Require-Network';
    const STAGE_ONLY_HEADER = 'X-ImagineDeck-Stage-Only';
    const PROMOTE_ATOMIC_HEADER = 'X-ImagineDeck-Promote-Atomic';
    const ACTIVE_ASSET_CACHE_NAME = 'museum-portal-imaginedeck-assets-v1';
    const PINNED_SIGNATURE_META_NAME = 'imaginedeck-pinned-asset-signature';
    const MONITORED_ASSET_URLS = [
        './app.html',
        './index.js',
        './index.css',
        './mergeFeeds.js',
        './heartbeat.js',
        './QR_458893.png'
    ];

    const frame = document.getElementById('imaginedeck-frame');
    if (!frame) {
        console.error('[ImagineDeck Watchdog] iframe not found.');
        return;
    }

    let lastHealthyHeartbeatAt = Date.now();
    let lastCheckAt = Date.now();
    let reloadHistory = [];
    let reloadSuppressed = false;
    let reloadSuppressedSignature = null;
    let reloadInProgress = false;
    let childStateKnown = false;
    let childBusy = false;
    let childAssetsReady = false;
    let childHeartbeatVersion = null;
    let childMigrationPending = false;
    let loadedAssetSignature = sessionStorage.getItem(ASSET_SIGNATURE_STORAGE_KEY);
    let pendingAssetSignature = null;
    let updateCheckInProgress = false;
    let confirmationSignature = null;
    let confirmationLoadSeen = false;
    let confirmationTimeoutId = null;
    const childStateWaiters = new Set();

    function withTimeout(promise, timeoutMs, label) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(
                () => reject(new Error(`${label} timed out after ${timeoutMs} ms`)),
                timeoutMs
            );

            Promise.resolve(promise).then(
                value => {
                    clearTimeout(timeoutId);
                    resolve(value);
                },
                error => {
                    clearTimeout(timeoutId);
                    reject(error);
                }
            );
        });
    }

    function pruneReloadHistory(now) {
        reloadHistory = reloadHistory.filter(
            timestamp => now - timestamp < RELOAD_WINDOW_MS
        );
    }

    function clearReloadSuppression(reason) {
        if (!reloadSuppressed && reloadHistory.length === 0) {
            reloadSuppressedSignature = null;
            return;
        }

        reloadSuppressed = false;
        reloadSuppressedSignature = null;
        reloadHistory = [];
        console.info('[ImagineDeck Watchdog] Automatic reload suppression cleared.', { reason });
    }

    function suppressReloads(reason, signature = null) {
        if (!reloadSuppressed) {
            console.error(
                '[ImagineDeck Watchdog] Automatic reload suppressed after repeated failures.',
                { reason, signature, reloadHistory: [...reloadHistory] }
            );
        }
        reloadSuppressed = true;
        reloadSuppressedSignature = signature;
    }

    function requestImmediateHeartbeat(reason) {
        frame.contentWindow?.postMessage(
            {
                type: 'imaginedeck-heartbeat-request',
                timestamp: Date.now(),
                reason
            },
            window.location.origin
        );
    }

    function resolveChildStateWaiters(received) {
        for (const resolve of childStateWaiters) {
            resolve(received);
        }
        childStateWaiters.clear();
    }

    function requestFreshChildState(reason) {
        return new Promise(resolve => {
            let settled = false;
            let requestTimerId = null;
            const requestDelayMs =
                childHeartbeatVersion !== null &&
                childHeartbeatVersion < REQUIRED_CHILD_HEARTBEAT_VERSION
                    ? LEGACY_CHILD_CONFIRM_DELAY_MS
                    : 0;

            const finish = received => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timeoutId);
                if (requestTimerId !== null) {
                    clearTimeout(requestTimerId);
                }
                childStateWaiters.delete(finish);
                resolve(received);
            };

            const timeoutId = setTimeout(
                () => finish(false),
                CHILD_STATE_CONFIRM_TIMEOUT_MS + requestDelayMs
            );

            childStateWaiters.add(finish);
            requestTimerId = setTimeout(
                () => requestImmediateHeartbeat(reason),
                requestDelayMs
            );
        });
    }

    function grantHeartbeatGrace(reason) {
        const now = Date.now();
        lastHealthyHeartbeatAt = now;
        lastCheckAt = now;
        requestImmediateHeartbeat(reason);
        console.info('[ImagineDeck Watchdog] Heartbeat grace period granted.', { reason });
    }

    async function waitForServiceWorkerController(timeoutMs = SERVICE_WORKER_CONTROL_TIMEOUT_MS) {
        if (navigator.serviceWorker.controller) {
            return true;
        }

        return new Promise(resolve => {
            const timeoutId = setTimeout(() => resolve(false), timeoutMs);
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                clearTimeout(timeoutId);
                resolve(Boolean(navigator.serviceWorker.controller));
            }, { once: true });
        });
    }

    async function refreshServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            return false;
        }

        try {
            const registration = await navigator.serviceWorker.getRegistration('/');
            if (!registration) {
                return false;
            }

            await withTimeout(
                registration.update(),
                SERVICE_WORKER_UPDATE_TIMEOUT_MS,
                'Service Worker update'
            );

            const candidate = registration.installing || registration.waiting;
            if (candidate && candidate.state !== 'activated') {
                await withTimeout(
                    new Promise(resolve => {
                        candidate.addEventListener('statechange', () => {
                            if (
                                candidate.state === 'activated' ||
                                candidate.state === 'redundant'
                            ) {
                                resolve();
                            }
                        });
                    }),
                    SERVICE_WORKER_UPDATE_TIMEOUT_MS,
                    'Service Worker activation'
                );
            }

            return waitForServiceWorkerController();
        } catch (error) {
            console.warn('[ImagineDeck Watchdog] Service Worker update check failed.', error);
            return false;
        }
    }

    function stableAssetRequest(assetUrl) {
        const url = new URL(assetUrl, window.location.href);
        url.search = '';
        url.hash = '';
        return new Request(url.href, { credentials: 'same-origin' });
    }

    function assetValidatorFromResponse(assetUrl, response) {
        const etag = response.headers.get('etag');
        if (etag) {
            return `${assetUrl}|etag:${etag}`;
        }

        const lastModified = response.headers.get('last-modified');
        if (lastModified) {
            const contentLength = response.headers.get('content-length') || '';
            return `${assetUrl}|last-modified:${lastModified}|length:${contentLength}`;
        }

        return null;
    }

    async function sha256Hex(arrayBuffer) {
        const digest = await crypto.subtle.digest('SHA-256', arrayBuffer);
        return Array.from(new Uint8Array(digest), byte =>
            byte.toString(16).padStart(2, '0')
        ).join('');
    }

    async function responseSignature(assetUrl, response) {
        const validator = assetValidatorFromResponse(assetUrl, response);
        if (validator) {
            return validator;
        }

        const hash = await sha256Hex(await response.arrayBuffer());
        return `${assetUrl}|sha256:${hash}`;
    }

    async function fetchAssetContentHash(assetUrl, url) {
        const response = await fetch(url.href, {
            method: 'GET',
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error(`GET ${url.pathname} returned ${response.status}`);
        }

        return responseSignature(assetUrl, response);
    }

    async function fetchAssetValidator(assetUrl) {
        const url = new URL(assetUrl, window.location.href);

        try {
            const response = await fetch(url.href, {
                method: 'HEAD',
                cache: 'no-store'
            });

            if (response.ok) {
                const validator = assetValidatorFromResponse(assetUrl, response);
                if (validator) {
                    return validator;
                }
            }
        } catch (error) {
            console.warn(
                `[ImagineDeck Watchdog] HEAD update check failed for ${url.pathname}; falling back to content hash.`,
                error
            );
        }

        return fetchAssetContentHash(assetUrl, url);
    }

    async function readServerAssetSignature() {
        const validators = await Promise.all(
            MONITORED_ASSET_URLS.map(fetchAssetValidator)
        );
        return validators.join('\n');
    }

    async function fetchAssetForVerification(assetUrl) {
        const url = new URL(assetUrl, window.location.href);
        const response = await fetch(url.href, {
            method: 'GET',
            cache: 'no-store',
            headers: {
                [REQUIRE_NETWORK_HEADER]: '1',
                [STAGE_ONLY_HEADER]: '1'
            }
        });

        if (!response.ok) {
            throw new Error(`Network verification for ${url.pathname} returned ${response.status}`);
        }

        return responseSignature(assetUrl, response);
    }

    async function readActiveAssetSignature() {
        const cache = await caches.open(ACTIVE_ASSET_CACHE_NAME);
        const validators = [];

        for (const assetUrl of MONITORED_ASSET_URLS) {
            const response = await cache.match(stableAssetRequest(assetUrl));
            if (!response) {
                return null;
            }
            validators.push(await responseSignature(assetUrl, response.clone()));
        }

        return validators.join('\n');
    }

    async function requestAtomicPromotionFromServiceWorker(expectedSignature) {
        // A dedicated promotion request enters the Service Worker's serialized
        // complete-set refresh path. The window never writes the shared active
        // cache directly.
        const probeUrl = new URL(APP_URL, window.location.href);
        const response = await fetch(probeUrl.href, {
            method: 'GET',
            cache: 'no-store',
            headers: {
                [PROMOTE_ATOMIC_HEADER]: '1'
            }
        });

        if (!response.ok) {
            throw new Error(`Service Worker promotion probe returned ${response.status}`);
        }

        const activeSignature = await readActiveAssetSignature();
        if (activeSignature !== expectedSignature) {
            pendingAssetSignature = activeSignature || await readServerAssetSignature();
            console.info(
                '[ImagineDeck Watchdog] Active asset set changed while the Service Worker was promoting it; deferring reload.',
                { expectedSignature, activeSignature }
            );
            return null;
        }

        return expectedSignature;
    }

    async function prepareMonitoredAssets(expectedSignature) {
        const serviceWorkerReady = await refreshServiceWorker();
        if (!serviceWorkerReady) {
            throw new Error('The portal Service Worker is not controlling the page.');
        }

        const verifiedSignature = (
            await Promise.all(MONITORED_ASSET_URLS.map(fetchAssetForVerification))
        ).join('\n');

        if (verifiedSignature !== expectedSignature) {
            pendingAssetSignature = verifiedSignature;
            console.info(
                '[ImagineDeck Watchdog] Server assets changed during verification; deferring reload.',
                { expectedSignature, verifiedSignature }
            );
            return null;
        }

        return requestAtomicPromotionFromServiceWorker(verifiedSignature);
    }

    function clearAssetConfirmationTimer() {
        if (confirmationTimeoutId !== null) {
            clearTimeout(confirmationTimeoutId);
            confirmationTimeoutId = null;
        }
    }

    function abandonAssetConfirmation(reason) {
        if (confirmationSignature === null) {
            return;
        }

        console.warn('[ImagineDeck Watchdog] Asset confirmation did not complete.', {
            reason,
            confirmationSignature,
            pendingAssetSignature,
            childAssetsReady
        });

        clearAssetConfirmationTimer();
        confirmationSignature = null;
        confirmationLoadSeen = false;
        void applyPendingUpdateIfSafe();
    }

    function beginAssetConfirmation(signature) {
        confirmationSignature = signature;
        confirmationLoadSeen = false;
        clearAssetConfirmationTimer();
        confirmationTimeoutId = setTimeout(
            () => abandonAssetConfirmation(
                'timed out waiting for iframe navigation and an asset-ready heartbeat'
            ),
            ASSET_CONFIRM_TIMEOUT_MS
        );
    }

    function beginAssetConfirmationAfterLoad() {
        if (confirmationSignature !== null) {
            confirmationLoadSeen = true;
        }
    }

    function readPinnedAssetSignatureFromFrame() {
        try {
            const encodedSignature = frame.contentDocument
                ?.querySelector(`meta[name="${PINNED_SIGNATURE_META_NAME}"]`)
                ?.getAttribute('content');
            if (!encodedSignature) {
                return null;
            }
            return decodeURIComponent(encodedSignature);
        } catch (error) {
            console.warn(
                '[ImagineDeck Watchdog] Failed to read the iframe generation signature.',
                error
            );
            return null;
        }
    }

    function commitConfirmedAssetSignature(message) {
        if (
            confirmationSignature === null ||
            !confirmationLoadSeen ||
            message.assetsReady !== true ||
            childHeartbeatVersion < REQUIRED_CHILD_HEARTBEAT_VERSION
        ) {
            return false;
        }

        const pinnedAssetSignature = readPinnedAssetSignatureFromFrame();
        if (pinnedAssetSignature === null) {
            return false;
        }

        if (pinnedAssetSignature !== confirmationSignature) {
            pendingAssetSignature = pinnedAssetSignature;
            abandonAssetConfirmation(
                'iframe confirmed a different pinned asset generation'
            );
            return false;
        }

        if (pendingAssetSignature !== confirmationSignature) {
            abandonAssetConfirmation('server signature changed before the iframe confirmed loading');
            return false;
        }

        loadedAssetSignature = confirmationSignature;
        sessionStorage.setItem(ASSET_SIGNATURE_STORAGE_KEY, confirmationSignature);
        pendingAssetSignature = null;
        confirmationSignature = null;
        confirmationLoadSeen = false;
        clearAssetConfirmationTimer();
        clearReloadSuppression('asset signature confirmed by the reloaded iframe');

        console.info('[ImagineDeck Watchdog] Loaded asset signature confirmed by the iframe.', {
            assetStatus: message.assetStatus
        });
        return true;
    }

    async function reloadFrame(reason, options = {}) {
        if (reloadInProgress || confirmationSignature !== null) {
            return false;
        }

        const now = Date.now();
        pruneReloadHistory(now);
        if (reloadHistory.length >= MAX_RELOADS_PER_WINDOW) {
            suppressReloads(reason, options.assetSignature || pendingAssetSignature || null);
            return false;
        }

        reloadInProgress = true;
        try {
            let preparedSignature = null;

            if (options.assetSignature) {
                try {
                    preparedSignature = await prepareMonitoredAssets(options.assetSignature);
                } catch (error) {
                    console.warn(
                        '[ImagineDeck Watchdog] Failed to prepare a coherent monitored asset set; retaining the active set.',
                        error
                    );
                    return false;
                }

                if (preparedSignature === null) {
                    return false;
                }
            } else if (options.refreshAssets === true) {
                await refreshServiceWorker();
            }

            if (options.requireIdle === true) {
                const stateConfirmed = await requestFreshChildState(
                    'confirm idle state before applying content update'
                );

                if (!stateConfirmed || !childStateKnown || childBusy) {
                    console.info(
                        '[ImagineDeck Watchdog] Content update reload deferred after final state check.',
                        { stateConfirmed, childStateKnown, childBusy, childHeartbeatVersion }
                    );
                    return false;
                }
            }

            const commitTime = Date.now();
            pruneReloadHistory(commitTime);
            if (reloadHistory.length >= MAX_RELOADS_PER_WINDOW) {
                suppressReloads(
                    reason,
                    preparedSignature || options.assetSignature || pendingAssetSignature || null
                );
                return false;
            }

            reloadHistory.push(commitTime);
            lastHealthyHeartbeatAt = commitTime;
            childStateKnown = false;
            childBusy = false;
            childAssetsReady = false;
            childHeartbeatVersion = null;

            if (preparedSignature !== null) {
                beginAssetConfirmation(preparedSignature);
            }

            const stableAppUrl = new URL(APP_URL, window.location.href).href;
            console.warn('[ImagineDeck Watchdog] Reloading iframe.', {
                reason,
                awaitingAssetConfirmation: preparedSignature !== null
            });
            frame.src = stableAppUrl;
            return true;
        } finally {
            reloadInProgress = false;
        }
    }

    async function applyPendingUpdateIfSafe() {
        const assetUpdatePending = Boolean(pendingAssetSignature);
        if (
            (!assetUpdatePending && !childMigrationPending) ||
            reloadSuppressed ||
            reloadInProgress ||
            confirmationSignature !== null ||
            !childStateKnown ||
            childBusy
        ) {
            return;
        }

        const signatureToLoad = pendingAssetSignature;
        const reason = assetUpdatePending && childMigrationPending
            ? 'server content update and child heartbeat migration detected'
            : assetUpdatePending
                ? 'server content update detected'
                : 'legacy child heartbeat protocol detected';

        await reloadFrame(reason, {
            refreshAssets: true,
            requireIdle: true,
            assetSignature: signatureToLoad || undefined
        });
    }

    function resetSuppressionForNewSignature(currentSignature) {
        if (
            reloadSuppressed &&
            reloadSuppressedSignature !== null &&
            currentSignature !== reloadSuppressedSignature
        ) {
            clearReloadSuppression('a different server asset signature was detected');
        }
    }

    async function reconcileActiveSetWithLoadedSignature(currentSignature) {
        const activeSignature = await readActiveAssetSignature();
        if (activeSignature === currentSignature) {
            return true;
        }

        console.info(
            '[ImagineDeck Watchdog] Reconciling the active cache with the currently loaded server signature.',
            { currentSignature, activeSignature }
        );

        const reconciledSignature = await prepareMonitoredAssets(currentSignature);
        return reconciledSignature === currentSignature;
    }

    async function checkForContentUpdate() {
        if (updateCheckInProgress) {
            return;
        }

        updateCheckInProgress = true;
        try {
            const currentSignature = await readServerAssetSignature();
            resetSuppressionForNewSignature(currentSignature);

            if (loadedAssetSignature === null) {
                pendingAssetSignature = currentSignature;
                console.info(
                    '[ImagineDeck Watchdog] Initial server asset signature recorded; synchronizing iframe assets.',
                    { deferred: !childStateKnown || childBusy || reloadSuppressed }
                );
                await applyPendingUpdateIfSafe();
                return;
            }

            if (currentSignature === loadedAssetSignature) {
                const reconciled = await reconcileActiveSetWithLoadedSignature(currentSignature);
                if (!reconciled) {
                    pendingAssetSignature = currentSignature;
                    return;
                }

                pendingAssetSignature = null;
                if (
                    confirmationSignature !== null &&
                    confirmationSignature !== currentSignature
                ) {
                    abandonAssetConfirmation('server assets returned to the loaded signature');
                }
                if (reloadSuppressed && reloadSuppressedSignature !== null) {
                    clearReloadSuppression('server assets returned to the confirmed signature');
                }
                await applyPendingUpdateIfSafe();
                return;
            }

            pendingAssetSignature = currentSignature;
            console.info('[ImagineDeck Watchdog] Server content update detected.', {
                deferred:
                    !childStateKnown ||
                    childBusy ||
                    confirmationSignature !== null ||
                    reloadSuppressed
            });
            await applyPendingUpdateIfSafe();
        } catch (error) {
            console.warn('[ImagineDeck Watchdog] Server content update check failed.', error);
        } finally {
            updateCheckInProgress = false;
        }
    }

    window.addEventListener('message', event => {
        if (
            event.origin !== window.location.origin ||
            event.source !== frame.contentWindow
        ) {
            return;
        }

        const message = event.data;
        if (!message || message.type !== 'imaginedeck-heartbeat') {
            return;
        }

        const reportedVersion = Number(message.protocolVersion);
        childHeartbeatVersion = Number.isInteger(reportedVersion)
            ? reportedVersion
            : LEGACY_CHILD_HEARTBEAT_VERSION;
        childMigrationPending =
            childHeartbeatVersion < REQUIRED_CHILD_HEARTBEAT_VERSION;

        if (message.appReady !== true) {
            const legacyStateOnlyConfirmation =
                childHeartbeatVersion < REQUIRED_CHILD_HEARTBEAT_VERSION &&
                childStateWaiters.size > 0 &&
                childStateKnown &&
                Date.now() - lastHealthyHeartbeatAt < HEARTBEAT_TIMEOUT_MS &&
                typeof message.stopwatchRunning === 'boolean' &&
                typeof message.timerRunning === 'boolean';

            if (legacyStateOnlyConfirmation) {
                childBusy = message.stopwatchRunning || message.timerRunning;
                resolveChildStateWaiters(true);
                console.info(
                    '[ImagineDeck Watchdog] Accepted legacy heartbeat as state-only confirmation.',
                    { childBusy, childHeartbeatVersion }
                );
                return;
            }

            console.warn('[ImagineDeck Watchdog] Unhealthy heartbeat received.', {
                ...message,
                interpretedProtocolVersion: childHeartbeatVersion
            });
            return;
        }

        lastHealthyHeartbeatAt = Date.now();
        childStateKnown = true;
        childBusy = Boolean(message.stopwatchRunning) || Boolean(message.timerRunning);
        childAssetsReady = message.assetsReady === true;
        resolveChildStateWaiters(true);

        if (childMigrationPending) {
            console.info('[ImagineDeck Watchdog] Legacy child heartbeat protocol detected.', {
                childHeartbeatVersion,
                deferred: childBusy
            });
        }

        if (confirmationSignature !== null && confirmationLoadSeen) {
            if (!commitConfirmedAssetSignature(message)) {
                console.info(
                    '[ImagineDeck Watchdog] Waiting for the reloaded iframe to confirm all monitored assets.',
                    {
                        assetsReady: message.assetsReady,
                        assetStatus: message.assetStatus,
                        pinnedAssetSignature: readPinnedAssetSignatureFromFrame(),
                        expectedAssetSignature: confirmationSignature,
                        childHeartbeatVersion
                    }
                );
            }
        }

        if (
            reloadSuppressed &&
            pendingAssetSignature === null &&
            confirmationSignature === null
        ) {
            clearReloadSuppression('healthy heartbeat restored without a pending asset update');
        }

        void applyPendingUpdateIfSafe();
    });

    frame.addEventListener('load', () => {
        grantHeartbeatGrace('iframe loaded');
        beginAssetConfirmationAfterLoad();
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            grantHeartbeatGrace('page became visible');
        }
    });

    window.addEventListener('pageshow', () => {
        grantHeartbeatGrace('page shown');
    });

    window.addEventListener('imaginedeck-service-worker-ready', () => {
        void checkForContentUpdate();
    });

    setInterval(() => {
        const now = Date.now();
        const checkGapMs = now - lastCheckAt;
        lastCheckAt = now;

        if (document.visibilityState !== 'visible') {
            return;
        }

        if (checkGapMs > HEARTBEAT_TIMEOUT_MS) {
            grantHeartbeatGrace(`watchdog resumed after ${checkGapMs} ms`);
            return;
        }

        const silenceMs = now - lastHealthyHeartbeatAt;
        if (silenceMs > HEARTBEAT_TIMEOUT_MS) {
            void reloadFrame(`healthy heartbeat missing for ${silenceMs} ms`);
        }
    }, CHECK_INTERVAL_MS);

    window.__IMAGINEDECK_WATCHDOG_VERSION__ = WATCHDOG_VERSION;

    void checkForContentUpdate();
    setInterval(() => {
        void checkForContentUpdate();
    }, CHECK_INTERVAL_MS);
})();
