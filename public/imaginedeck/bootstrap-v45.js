(() => {
    'use strict';

    const SW_URL = '/sw.js';
    const SW_SCOPE = '/';
    const APP_URL = new URL('./app.html', location.href).href;
    const BOOTSTRAP_TIMEOUT_MS = 15_000;
    const ACTIVATION_TIMEOUT_MS = 10_000;
    const CONTROL_TIMEOUT_MS = 5_000;
    const CACHE_VERIFY_TIMEOUT_MS = 3_000;
    const ASSET_FETCH_TIMEOUT_MS = 8_000;
    const RETRY_DELAY_MS = 30_000;
    const PROMOTE_ATOMIC_HEADER = 'X-ImagineDeck-Promote-Atomic';
    const POINTER_CACHE = 'museum-portal-imaginedeck-load-v1-generation-pointer-v36';
    const GENERATION_PREFIX = 'museum-portal-imaginedeck-load-v1-generation-v36-';
    const POINTER_URL = new URL('/__imaginedeck-active-generation-v36__', location.origin).href;
    const ASSETS = [
        ['/imaginedeck/app.html', './app.html'],
        ['/imaginedeck/index.js', './index.js'],
        ['/imaginedeck/index.css', './index.css'],
        ['/imaginedeck/mergeFeeds.js', './mergeFeeds.js'],
        ['/imaginedeck/heartbeat.js', './heartbeat.js'],
        ['/imaginedeck/QR_458893.png', './QR_458893.png']
    ];
    const ASSET_PATHS = new Set(ASSETS.map(([pathname]) => pathname));
    const frame = document.getElementById('imaginedeck-frame');
    let appStarted = false;
    let bootstrapRunning = false;
    let retryTimer = null;

    function withTimeout(promise, timeoutMs, label) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error(`${label} timed out after ${timeoutMs} ms`)),
                timeoutMs
            );
            Promise.resolve(promise).then(
                value => { clearTimeout(timer); resolve(value); },
                error => { clearTimeout(timer); reject(error); }
            );
        });
    }

    function composeSignal(timeoutMs, inheritedSignal) {
        const controller = new AbortController();
        let inheritedHandler = null;
        if (inheritedSignal) {
            if (inheritedSignal.aborted) {
                controller.abort(inheritedSignal.reason);
            } else {
                inheritedHandler = () => controller.abort(inheritedSignal.reason);
                inheritedSignal.addEventListener('abort', inheritedHandler, { once: true });
            }
        }
        const timer = setTimeout(
            () => controller.abort(new Error(`ImagineDeck asset request timed out after ${timeoutMs} ms`)),
            timeoutMs
        );
        return {
            signal: controller.signal,
            cleanup() {
                clearTimeout(timer);
                if (inheritedSignal && inheritedHandler) {
                    inheritedSignal.removeEventListener('abort', inheritedHandler);
                }
            }
        };
    }

    function installBoundedFetch() {
        const nativeFetch = window.fetch.bind(window);
        window.fetch = function boundedImagineDeckFetch(input, init = undefined) {
            let request;
            try {
                request = input instanceof Request ? new Request(input, init) : new Request(input, init);
            } catch (error) {
                return nativeFetch(input, init);
            }
            const url = new URL(request.url, location.href);
            const method = String(request.method || 'GET').toUpperCase();
            const isAtomicPromotion =
                request.headers.get(PROMOTE_ATOMIC_HEADER) === '1';
            if (
                isAtomicPromotion ||
                url.origin !== location.origin ||
                !ASSET_PATHS.has(url.pathname) ||
                (method !== 'HEAD' && method !== 'GET')
            ) {
                return nativeFetch(input, init);
            }
            const composed = composeSignal(
                ASSET_FETCH_TIMEOUT_MS,
                request.signal || null
            );
            return nativeFetch(request, { signal: composed.signal })
                .finally(composed.cleanup);
        };
        window.__IMAGINEDECK_BOUNDED_FETCH_VERSION__ = 2;
    }

    async function sha256Hex(buffer) {
        const digest = await crypto.subtle.digest('SHA-256', buffer);
        return Array.from(new Uint8Array(digest), byte =>
            byte.toString(16).padStart(2, '0')
        ).join('');
    }

    async function responseSignature(key, response) {
        const etag = response.headers.get('etag');
        if (etag) return `${key}|etag:${etag}`;
        const modified = response.headers.get('last-modified');
        if (modified) {
            const length = response.headers.get('content-length') || '';
            return `${key}|last-modified:${modified}|length:${length}`;
        }
        return `${key}|sha256:${await sha256Hex(await response.arrayBuffer())}`;
    }

    async function verifyCachedGeneration() {
        if (!('caches' in window)) return false;
        try {
            return await withTimeout((async () => {
                const pointerResponse = await (await caches.open(POINTER_CACHE)).match(POINTER_URL);
                if (!pointerResponse) return false;
                const pointer = await pointerResponse.json();
                if (
                    typeof pointer?.cacheName !== 'string' ||
                    !pointer.cacheName.startsWith(GENERATION_PREFIX) ||
                    typeof pointer.signature !== 'string' ||
                    typeof pointer.createdAt !== 'number'
                ) return false;

                const generation = await caches.open(pointer.cacheName);
                const signatures = [];
                for (const [pathname, key] of ASSETS) {
                    const response = await generation.match(new URL(pathname, location.origin).href);
                    if (!response) return false;
                    signatures.push(await responseSignature(key, response.clone()));
                }
                return signatures.join('\n') === pointer.signature;
            })(), CACHE_VERIFY_TIMEOUT_MS, 'cached generation verification');
        } catch (error) {
            console.warn('[ImagineDeck Bootstrap] Cached generation verification failed.', error);
            return false;
        }
    }

    async function canUseActiveWorker(registration) {
        const controller = navigator.serviceWorker.controller;
        const active = registration?.active;
        const expectedUrl = new URL(SW_URL, location.origin).href;
        if (
            !controller || !active || active.state !== 'activated' ||
            controller !== active || controller.scriptURL !== expectedUrl ||
            active.scriptURL !== expectedUrl
        ) return false;
        return verifyCachedGeneration();
    }

    async function useActiveWorkerFallback(registration, error, phase) {
        if (await canUseActiveWorker(registration)) {
            console.warn(
                `[ImagineDeck Bootstrap] ${phase} failed; using verified cached generation.`,
                error
            );
            return true;
        }
        throw error;
    }

    function waitForActivation(worker) {
        if (!worker || worker.state === 'activated') return Promise.resolve();
        if (worker.state === 'redundant') {
            return Promise.reject(new Error('Service Worker became redundant before activation'));
        }
        return withTimeout(new Promise((resolve, reject) => {
            worker.addEventListener('statechange', () => {
                if (worker.state === 'activated') resolve();
                if (worker.state === 'redundant') {
                    reject(new Error('Service Worker became redundant before activation'));
                }
            });
        }), ACTIVATION_TIMEOUT_MS, 'Service Worker activation');
    }

    function waitForController(expectedWorker) {
        const matches = () => {
            const controller = navigator.serviceWorker.controller;
            return Boolean(controller && (!expectedWorker || controller === expectedWorker));
        };
        if (matches()) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const listener = () => {
                if (!matches()) return;
                clearTimeout(timer);
                navigator.serviceWorker.removeEventListener('controllerchange', listener);
                resolve();
            };
            const timer = setTimeout(() => {
                navigator.serviceWorker.removeEventListener('controllerchange', listener);
                reject(new Error(`Service Worker controller acquisition timed out after ${CONTROL_TIMEOUT_MS} ms`));
            }, CONTROL_TIMEOUT_MS);
            navigator.serviceWorker.addEventListener('controllerchange', listener);
        });
    }

    async function existingRegistration() {
        try {
            return await navigator.serviceWorker.getRegistration(
                new URL(SW_SCOPE, location.origin).href
            );
        } catch (error) {
            return null;
        }
    }

    async function ensureServiceWorker() {
        let registration;
        try {
            registration = await withTimeout(
                navigator.serviceWorker.register(SW_URL, {
                    scope: SW_SCOPE,
                    updateViaCache: 'none'
                }),
                BOOTSTRAP_TIMEOUT_MS,
                'Service Worker registration'
            );
        } catch (error) {
            const fallback = await existingRegistration();
            return useActiveWorkerFallback(fallback, error, 'Registration');
        }

        try {
            await withTimeout(
                registration.update(),
                BOOTSTRAP_TIMEOUT_MS,
                'Service Worker update'
            );
        } catch (error) {
            return useActiveWorkerFallback(registration, error, 'Update');
        }

        const candidate = registration.installing || registration.waiting;
        let expected = registration.active;
        if (candidate) {
            try {
                await waitForActivation(candidate);
                expected = candidate;
            } catch (error) {
                return useActiveWorkerFallback(
                    registration,
                    error,
                    'Candidate activation'
                );
            }
        }
        if (!expected) throw new Error('Service Worker update completed without an active worker');
        try {
            await waitForController(expected);
        } catch (error) {
            return useActiveWorkerFallback(
                registration,
                error,
                'Controller acquisition'
            );
        }
        return false;
    }

    function loadWatchdog() {
        const script = document.createElement('script');
        script.src = './watchdog.js';
        script.async = false;
        script.addEventListener('error', () => {
            console.error('[ImagineDeck Bootstrap] Failed to load watchdog.js.');
        });
        document.body.append(script);
    }

    function startApp(reason, requireController = true) {
        if (appStarted) return false;
        if (
            requireController && 'serviceWorker' in navigator &&
            !navigator.serviceWorker.controller
        ) return false;
        appStarted = true;
        frame.src = APP_URL;
        console.info('[ImagineDeck Bootstrap] iframe navigation started.', {
            reason,
            controlled: Boolean(navigator.serviceWorker?.controller)
        });
        return true;
    }

    function notifyReady(reason) {
        window.dispatchEvent(new CustomEvent('imaginedeck-service-worker-ready', {
            detail: { reason }
        }));
    }

    function retryLater() {
        if (retryTimer !== null) return;
        retryTimer = setTimeout(() => {
            retryTimer = null;
            void bootstrap();
        }, RETRY_DELAY_MS);
    }

    async function bootstrap() {
        if (bootstrapRunning || !('serviceWorker' in navigator)) return;
        bootstrapRunning = true;
        try {
            const usedCache = await ensureServiceWorker();
            startApp(usedCache
                ? 'verified cached portal Service Worker is controlling the page'
                : 'updated portal Service Worker is controlling the page');
            notifyReady(usedCache ? 'cached active worker fallback' : 'bootstrap completed');
        } catch (error) {
            console.warn(
                '[ImagineDeck Bootstrap] No verified coherent Service Worker generation is available; retaining the blank frame and retrying.',
                error
            );
            retryLater();
        } finally {
            bootstrapRunning = false;
        }
    }

    installBoundedFetch();
    loadWatchdog();

    if (!('serviceWorker' in navigator)) {
        startApp('Service Worker is unsupported', false);
        return;
    }
    void bootstrap();
})();
