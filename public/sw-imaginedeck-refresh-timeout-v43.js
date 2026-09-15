(() => {
  'use strict';

  const REFRESH_TIMEOUT_PATCH_VERSION = 43;
  const ATOMIC_NETWORK_REQUEST_TIMEOUT_MS = 4_000;
  const ATOMIC_NAVIGATION_TIMEOUT_MS = 25_000;
  const ATOMIC_BACKGROUND_TIMEOUT_MS = 70_000;
  const PIN_FALLBACK_TIMEOUT_MS = 2_000;
  const V36_POINTER_CACHE_NAME =
    `${IMAGINEDECK_PIN_CACHE_PREFIX}generation-pointer-v36`;
  const V36_POINTER_REQUEST = new Request(
    new URL('/__imaginedeck-active-generation-v36__', self.location.origin).href
  );
  const V36_GENERATION_CACHE_PREFIX =
    `${IMAGINEDECK_PIN_CACHE_PREFIX}generation-v36-`;
  const baseFetch = self.fetch.bind(self);
  const baseHandleNetworkFirstAssetRequest = handleNetworkFirstAssetRequest;
  const drainingNavigationWorkByClient = new Map();

  function serviceUnavailable(message) {
    return new Response(message, {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' }
    });
  }

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

  function atomicRequestInfo(input) {
    try {
      const request = input instanceof Request ? input : new Request(input);
      const url = new URL(request.url);
      return {
        request,
        url,
        isAtomic:
          url.origin === self.location.origin &&
          ATOMIC_IMAGINEDECK_ASSET_PATHS.has(url.pathname)
      };
    } catch (error) {
      return { request: null, url: null, isAtomic: false };
    }
  }

  function composeAbortSignal(timeoutMs, inheritedSignal) {
    const controller = new AbortController();
    let inheritedAbortHandler = null;

    if (inheritedSignal) {
      if (inheritedSignal.aborted) {
        controller.abort(inheritedSignal.reason);
      } else {
        inheritedAbortHandler = () => controller.abort(inheritedSignal.reason);
        inheritedSignal.addEventListener('abort', inheritedAbortHandler, { once: true });
      }
    }

    const timeoutId = setTimeout(
      () => controller.abort(
        new Error(
          `ImagineDeck network request timed out after ${timeoutMs} ms`
        )
      ),
      timeoutMs
    );

    return {
      signal: controller.signal,
      cleanup() {
        clearTimeout(timeoutId);
        if (inheritedSignal && inheritedAbortHandler) {
          inheritedSignal.removeEventListener('abort', inheritedAbortHandler);
        }
      }
    };
  }

  self.fetch = function fetchWithImagineDeckTimeout(input, init = undefined) {
    const { request, isAtomic } = atomicRequestInfo(input);
    if (!isAtomic) {
      return baseFetch(input, init);
    }

    const inheritedSignal = init?.signal || request?.signal || null;
    const composed = composeAbortSignal(
      ATOMIC_NETWORK_REQUEST_TIMEOUT_MS,
      inheritedSignal
    );

    return baseFetch(input, { ...(init || {}), signal: composed.signal })
      .finally(composed.cleanup);
  };

  async function readV36ActiveGenerationResponse(request) {
    const pointerCache = await caches.open(V36_POINTER_CACHE_NAME);
    const pointerResponse = await pointerCache.match(V36_POINTER_REQUEST);
    if (!pointerResponse) {
      return null;
    }

    let pointer;
    try {
      pointer = await pointerResponse.json();
    } catch (error) {
      return null;
    }

    if (
      typeof pointer?.cacheName !== 'string' ||
      !pointer.cacheName.startsWith(V36_GENERATION_CACHE_PREFIX) ||
      typeof pointer.signature !== 'string'
    ) {
      return null;
    }

    const generationCache = await caches.open(pointer.cacheName);
    const response = await generationCache.match(
      stableImagineDeckRequest(request.url || request)
    );
    return response ? { response, signature: pointer.signature } : null;
  }

  function generationNavigationClientId(evt) {
    return evt?.resultingClientId || evt?.clientId || '';
  }

  function isGenerationNavigation(request) {
    const requestUrl = new URL(request.url);
    return (
      requestUrl.pathname === IMAGINEDECK_DOCUMENT_PATH &&
      request.mode === 'navigate'
    );
  }

  function quarantineTimedOutNavigation(clientId, workPromise) {
    if (!clientId) {
      return;
    }

    const token = {};
    const drainPromise = Promise.resolve(workPromise)
      .catch(error => {
        console.warn(
          '[ServiceWorker] Timed-out ImagineDeck navigation work eventually failed.',
          error
        );
      })
      .finally(() => {
        const current = drainingNavigationWorkByClient.get(clientId);
        if (current?.token === token) {
          drainingNavigationWorkByClient.delete(clientId);
        }
      });

    drainingNavigationWorkByClient.set(clientId, {
      token,
      drainPromise
    });
  }

  async function fallbackAfterRefreshTimeout(request, evt, error) {
    const requestUrl = new URL(request.url);
    const requireNetwork =
      request.headers.get(IMAGINEDECK_REQUIRE_NETWORK_HEADER) === '1';
    const stageOnly =
      request.headers.get(IMAGINEDECK_STAGE_ONLY_HEADER) === '1';
    const isContentHashProbe =
      request.method === 'GET' &&
      request.mode !== 'navigate' &&
      request.cache === 'no-store' &&
      !requireNetwork &&
      !stageOnly &&
      request.headers.get(IMAGINEDECK_PROMOTE_ATOMIC_HEADER) !== '1';

    console.warn(
      `[ServiceWorker] ImagineDeck generation handling failed for ${requestUrl.pathname}; using a coherent cached generation when allowed.`,
      error
    );

    if (requireNetwork || stageOnly || isContentHashProbe) {
      return serviceUnavailable(
        `Network-only ImagineDeck request failed for ${request.url}`
      );
    }

    if (isGenerationNavigation(request)) {
      const clientId = generationNavigationClientId(evt);
      if (!clientId) {
        return serviceUnavailable(
          'Unable to pin a cached ImagineDeck generation after refresh failure.'
        );
      }

      try {
        const pinned = await withTimeout(
          pinActiveImagineDeckGeneration(clientId),
          PIN_FALLBACK_TIMEOUT_MS,
          'ImagineDeck cached-generation pin'
        );
        const pinnedCache = await caches.open(pinned.cacheName);
        const documentResponse = await pinnedCache.match(
          stableImagineDeckRequest(request.url)
        );
        if (!documentResponse) {
          throw new Error('Pinned cached ImagineDeck document is missing.');
        }
        return attachImagineDeckGenerationSignature(
          documentResponse,
          pinned.signature
        );
      } catch (fallbackError) {
        console.warn(
          '[ServiceWorker] Cached ImagineDeck navigation fallback failed.',
          fallbackError
        );
        return serviceUnavailable(
          'No coherent cached ImagineDeck generation is available.'
        );
      }
    }

    const pinnedResponse = await matchPinnedImagineDeckResponse(
      evt?.clientId || '',
      stableImagineDeckRequest(request.url)
    );
    if (pinnedResponse) {
      return pinnedResponse;
    }

    const active = await readV36ActiveGenerationResponse(request);
    if (active?.response) {
      return active.response;
    }

    return serviceUnavailable(
      `No coherent cached ImagineDeck generation for ${request.url}`
    );
  }

  function runBoundedNavigation(request, evt) {
    const clientId = generationNavigationClientId(evt);
    if (!clientId) {
      return Promise.resolve(serviceUnavailable(
        'Unable to identify the ImagineDeck navigation client.'
      ));
    }

    if (drainingNavigationWorkByClient.has(clientId)) {
      return Promise.resolve(serviceUnavailable(
        'Previous timed-out ImagineDeck navigation work is still draining.'
      ));
    }

    const workPromise = Promise.resolve(
      baseHandleNetworkFirstAssetRequest(request, evt)
    );

    return new Promise(resolve => {
      let settled = false;
      const timeoutId = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        quarantineTimedOutNavigation(clientId, workPromise);
        console.warn(
          '[ServiceWorker] ImagineDeck navigation generation work timed out; failing closed until the stale operation settles.',
          { clientId, timeoutMs: ATOMIC_NAVIGATION_TIMEOUT_MS }
        );
        resolve(serviceUnavailable(
          'ImagineDeck navigation generation preparation timed out.'
        ));
      }, ATOMIC_NAVIGATION_TIMEOUT_MS);

      workPromise.then(
        response => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timeoutId);
          resolve(response);
        },
        error => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timeoutId);
          resolve(fallbackAfterRefreshTimeout(request, evt, error));
        }
      );
    });
  }

  handleNetworkFirstAssetRequest = function handleNetworkFirstAssetRequestV43(
    request,
    evt
  ) {
    const { isAtomic } = atomicRequestInfo(request);
    if (!isAtomic) {
      return baseHandleNetworkFirstAssetRequest(request, evt);
    }

    if (isGenerationNavigation(request)) {
      return runBoundedNavigation(request, evt);
    }

    const clientId = evt?.clientId || '';
    if (clientId && drainingNavigationWorkByClient.has(clientId)) {
      return Promise.resolve(serviceUnavailable(
        'ImagineDeck subresource delivery is blocked while stale navigation work drains.'
      ));
    }

    return withTimeout(
      baseHandleNetworkFirstAssetRequest(request, evt),
      ATOMIC_BACKGROUND_TIMEOUT_MS,
      'ImagineDeck background generation refresh and delivery'
    ).catch(error => fallbackAfterRefreshTimeout(request, evt, error));
  };

  self.__IMAGINEDECK_SW_REFRESH_TIMEOUT_VERSION__ =
    REFRESH_TIMEOUT_PATCH_VERSION;
})();
