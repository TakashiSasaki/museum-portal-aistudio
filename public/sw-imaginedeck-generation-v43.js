(() => {
  'use strict';

  const IMAGINEDECK_GENERATION_VERSION = 43;
  // Keep the v36 cache schema so existing verified generations remain usable.
  const ACTIVE_POINTER_CACHE_NAME =
    `${IMAGINEDECK_PIN_CACHE_PREFIX}generation-pointer-v36`;
  const GENERATION_CACHE_PREFIX =
    `${IMAGINEDECK_PIN_CACHE_PREFIX}generation-v36-`;
  const ACTIVE_POINTER_REQUEST = new Request(
    new URL('/__imaginedeck-active-generation-v36__', self.location.origin).href
  );
  const MAX_BACKGROUND_STABLE_FETCH_ATTEMPTS = 3;
  const MAX_NAVIGATION_STABLE_FETCH_ATTEMPTS = 1;
  const GENERATION_RETENTION_MS = 24 * 60 * 60 * 1000;
  const baseHandleNetworkFirstAssetRequest = handleNetworkFirstAssetRequest;
  let sharedStableGenerationRefreshPromise = null;

  function coherentGenerationUnavailable(message) {
    return new Response(message, {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  function generationCacheName() {
    return (
      `${GENERATION_CACHE_PREFIX}${Date.now()}-` +
      Math.random().toString(36).slice(2)
    );
  }

  async function readGenerationEntries(cacheName) {
    if (
      typeof cacheName !== 'string' ||
      !cacheName.startsWith(GENERATION_CACHE_PREFIX)
    ) {
      return null;
    }

    const cache = await caches.open(cacheName);
    const entries = await Promise.all(
      [...ATOMIC_IMAGINEDECK_ASSET_PATHS].map(async pathname => {
        const request = stableImagineDeckRequest(pathname);
        const response = await cache.match(request);
        return response ? { request, response } : null;
      })
    );

    return entries.every(Boolean) ? entries : null;
  }

  async function readActiveGenerationPointer() {
    const pointerCache = await caches.open(ACTIVE_POINTER_CACHE_NAME);
    const response = await pointerCache.match(ACTIVE_POINTER_REQUEST);
    if (!response) {
      return null;
    }

    try {
      const pointer = await response.json();
      if (
        typeof pointer?.cacheName !== 'string' ||
        !pointer.cacheName.startsWith(GENERATION_CACHE_PREFIX) ||
        typeof pointer.signature !== 'string' ||
        typeof pointer.createdAt !== 'number'
      ) {
        throw new Error('Invalid ImagineDeck generation pointer metadata.');
      }

      const entries = await readGenerationEntries(pointer.cacheName);
      if (!entries) {
        throw new Error('The pointed ImagineDeck generation is incomplete.');
      }

      const signature = await imagineDeckGenerationSignature(entries);
      if (signature !== pointer.signature) {
        throw new Error('The pointed ImagineDeck generation signature is invalid.');
      }

      return { ...pointer, entries };
    } catch (error) {
      console.warn(
        '[ServiceWorker] Discarding an invalid ImagineDeck generation pointer.',
        error
      );
      await pointerCache.delete(ACTIVE_POINTER_REQUEST);
      return null;
    }
  }

  async function writeActiveGenerationPointer(cacheName, signature) {
    const pointerCache = await caches.open(ACTIVE_POINTER_CACHE_NAME);
    const pointer = {
      cacheName,
      signature,
      createdAt: Date.now()
    };

    await pointerCache.put(
      ACTIVE_POINTER_REQUEST,
      new Response(JSON.stringify(pointer), {
        headers: { 'Content-Type': 'application/json' }
      })
    );
    return pointer;
  }

  async function mirrorGenerationForLegacyWatchdog(entries) {
    const mirrorCache = await caches.open(IMAGINEDECK_ASSET_CACHE_NAME);
    for (const entry of entries) {
      await mirrorCache.put(entry.request, entry.response.clone());
    }
  }

  async function cleanupOldGenerationCaches(activeCacheName) {
    const now = Date.now();
    const cacheNames = await caches.keys();

    await Promise.all(
      cacheNames.map(async cacheName => {
        if (
          cacheName === activeCacheName ||
          !cacheName.startsWith(GENERATION_CACHE_PREFIX)
        ) {
          return;
        }

        const suffix = cacheName.slice(GENERATION_CACHE_PREFIX.length);
        const createdAt = Number.parseInt(suffix.split('-')[0], 10);
        if (
          Number.isFinite(createdAt) &&
          now - createdAt > GENERATION_RETENTION_MS
        ) {
          await caches.delete(cacheName);
        }
      })
    );
  }

  async function publishImmutableGeneration(entries, signature) {
    const cacheName = generationCacheName();
    const generationCache = await caches.open(cacheName);

    try {
      for (const entry of entries) {
        await generationCache.put(entry.request, entry.response.clone());
      }

      const storedEntries = await readGenerationEntries(cacheName);
      if (!storedEntries) {
        throw new Error('Published ImagineDeck generation is incomplete.');
      }

      const storedSignature = await imagineDeckGenerationSignature(storedEntries);
      if (storedSignature !== signature) {
        throw new Error('Published ImagineDeck generation signature changed.');
      }

      const pointer = await writeActiveGenerationPointer(cacheName, signature);
      try {
        await mirrorGenerationForLegacyWatchdog(storedEntries);
      } catch (error) {
        console.warn(
          '[ServiceWorker] Failed to update the legacy ImagineDeck watchdog mirror.',
          error
        );
      }

      void cleanupOldGenerationCaches(cacheName).catch(error => {
        console.warn(
          '[ServiceWorker] Failed to clean old ImagineDeck generations.',
          error
        );
      });

      return { ...pointer, entries: storedEntries };
    } catch (error) {
      const pointer = await readActiveGenerationPointer().catch(() => null);
      if (!pointer || pointer.cacheName !== cacheName) {
        await caches.delete(cacheName);
      }
      throw error;
    }
  }

  async function serverAssetSignature(pathname) {
    const signatureKey = IMAGINEDECK_ASSET_SIGNATURE_KEYS.get(pathname);
    if (!signatureKey) {
      throw new Error(`No ImagineDeck signature key for ${pathname}`);
    }

    const request = stableImagineDeckRequest(pathname);
    try {
      const headResponse = await fetch(
        new Request(request.url, {
          method: 'HEAD',
          credentials: 'same-origin'
        }),
        { cache: 'reload' }
      );
      if (headResponse?.status === 200) {
        const validator = responseValidator(headResponse);
        if (validator) {
          return `${signatureKey}|${validator}`;
        }
      }
    } catch (error) {
      // Fall through to a content hash.
    }

    const response = await fetch(request, { cache: 'reload' });
    if (!response || response.status !== 200) {
      throw new Error(
        `ImagineDeck signature fetch for ${pathname} returned ` +
        `${response?.status ?? 'no response'}`
      );
    }
    return imagineDeckResponseSignature(pathname, response.clone());
  }

  async function readServerGenerationSignature() {
    // Promise.all preserves input order while running all six probes together.
    const signatures = await Promise.all(
      [...ATOMIC_IMAGINEDECK_ASSET_PATHS].map(serverAssetSignature)
    );
    return signatures.join('\n');
  }

  async function fetchGenerationEntriesFromNetwork() {
    return Promise.all(
      [...ATOMIC_IMAGINEDECK_ASSET_PATHS].map(async pathname => {
        const request = stableImagineDeckRequest(pathname);
        const response = await fetch(request, { cache: 'reload' });
        if (!response || response.status !== 200) {
          throw new Error(
            `ImagineDeck generation fetch for ${pathname} returned ` +
            `${response?.status ?? 'no response'}`
          );
        }
        return { request, response };
      })
    );
  }

  async function performStableGenerationRefresh(maxAttempts) {
    let lastMismatch = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const beforeSignature = await readServerGenerationSignature();
      const entries = await fetchGenerationEntriesFromNetwork();
      const fetchedSignature = await imagineDeckGenerationSignature(entries);
      const afterSignature = await readServerGenerationSignature();

      if (
        beforeSignature === fetchedSignature &&
        fetchedSignature === afterSignature
      ) {
        return publishImmutableGeneration(entries, fetchedSignature);
      }

      lastMismatch = {
        attempt,
        beforeSignature,
        fetchedSignature,
        afterSignature
      };
      console.warn(
        '[ServiceWorker] ImagineDeck release changed while staging; retaining the current generation.',
        lastMismatch
      );
    }

    throw new Error(
      'Unable to observe one stable ImagineDeck release across staging: ' +
      JSON.stringify(lastMismatch)
    );
  }

  function refreshStableGenerationFromNetwork({
    maxAttempts = MAX_BACKGROUND_STABLE_FETCH_ATTEMPTS,
    shared = true
  } = {}) {
    if (shared && sharedStableGenerationRefreshPromise) {
      return sharedStableGenerationRefreshPromise;
    }

    const operation = performStableGenerationRefresh(maxAttempts);
    if (!shared) {
      return operation;
    }

    const tracked = operation.finally(() => {
      if (sharedStableGenerationRefreshPromise === tracked) {
        sharedStableGenerationRefreshPromise = null;
      }
    });
    sharedStableGenerationRefreshPromise = tracked;
    return tracked;
  }

  async function migrateLegacyGenerationIfComplete() {
    const legacyCache = await caches.open(IMAGINEDECK_ASSET_CACHE_NAME);
    const entries = await Promise.all(
      [...ATOMIC_IMAGINEDECK_ASSET_PATHS].map(async pathname => {
        const request = stableImagineDeckRequest(pathname);
        const response = await legacyCache.match(request);
        return response ? { request, response } : null;
      })
    );

    if (!entries.every(Boolean)) {
      return null;
    }

    const signature = await imagineDeckGenerationSignature(entries);
    return publishImmutableGeneration(entries, signature);
  }

  async function ensureActiveGeneration() {
    const existingPointer = await readActiveGenerationPointer();
    if (existingPointer) {
      return existingPointer;
    }

    try {
      return await refreshStableGenerationFromNetwork();
    } catch (networkError) {
      const migrated = await migrateLegacyGenerationIfComplete();
      if (migrated) {
        console.warn(
          '[ServiceWorker] Using a migrated legacy ImagineDeck generation because the network refresh failed.',
          networkError
        );
        return migrated;
      }
      throw networkError;
    }
  }

  async function responseFromGeneration(generation, request) {
    const cache = await caches.open(generation.cacheName);
    return cache.match(stableImagineDeckRequest(request.url || request));
  }

  async function pinGenerationForClient(clientId, selectedGeneration = null) {
    if (!clientId) {
      throw new Error('ImagineDeck navigation client id is missing.');
    }

    const generation = selectedGeneration || await ensureActiveGeneration();
    const sourceEntries = await readGenerationEntries(generation.cacheName);
    if (!sourceEntries) {
      throw new Error('Active immutable ImagineDeck generation is incomplete.');
    }

    const sourceSignature = await imagineDeckGenerationSignature(sourceEntries);
    if (sourceSignature !== generation.signature) {
      throw new Error('Selected ImagineDeck generation signature is invalid.');
    }

    const metadataCache = await caches.open(IMAGINEDECK_PIN_METADATA_CACHE_NAME);
    const metadataRequest = imagineDeckPinMetadataRequest(clientId);
    const previousPinResponse = await metadataCache.match(metadataRequest);
    let previousCacheName = null;

    if (previousPinResponse) {
      try {
        const previousPin = await previousPinResponse.json();
        previousCacheName =
          typeof previousPin.cacheName === 'string'
            ? previousPin.cacheName
            : null;
      } catch (error) {
        previousCacheName = null;
      }
    }

    const cacheName =
      `${IMAGINEDECK_PIN_CACHE_PREFIX}client-v36-${Date.now()}-` +
      Math.random().toString(36).slice(2);
    const pinnedCache = await caches.open(cacheName);

    try {
      for (const entry of sourceEntries) {
        await pinnedCache.put(entry.request, entry.response.clone());
      }

      const pinnedEntries = await Promise.all(
        sourceEntries.map(async entry => {
          const response = await pinnedCache.match(entry.request);
          return response ? { request: entry.request, response } : null;
        })
      );
      if (!pinnedEntries.every(Boolean)) {
        throw new Error('Pinned ImagineDeck client generation is incomplete.');
      }

      const pinnedSignature = await imagineDeckGenerationSignature(pinnedEntries);
      if (pinnedSignature !== generation.signature) {
        throw new Error('Pinned ImagineDeck client generation signature changed.');
      }

      await metadataCache.put(
        metadataRequest,
        new Response(
          JSON.stringify({
            cacheName,
            signature: generation.signature,
            createdAt: Date.now()
          }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      );
    } catch (error) {
      await caches.delete(cacheName);
      throw error;
    }

    if (previousCacheName && previousCacheName !== cacheName) {
      await caches.delete(previousCacheName);
    }

    return { cacheName, signature: generation.signature };
  }

  async function pinActiveGenerationForClient(clientId) {
    return pinGenerationForClient(clientId);
  }

  async function currentOrMigratedGeneration() {
    const current = await readActiveGenerationPointer();
    if (current) {
      return current;
    }
    return migrateLegacyGenerationIfComplete();
  }

  async function handleGenerationDocumentNavigation(request, evt) {
    if (evt?.waitUntil) {
      evt.waitUntil(cleanupExpiredImagineDeckPins().catch(() => {}));
    }

    let generation = null;
    try {
      // Navigation performs one stable observation. If a deployment changes
      // during that observation, retain the last verified generation and let the
      // watchdog/background promotion retry without blocking this document.
      generation = await refreshStableGenerationFromNetwork({
        maxAttempts: MAX_NAVIGATION_STABLE_FETCH_ATTEMPTS,
        shared: false
      });
    } catch (error) {
      console.warn(
        '[ServiceWorker] Failed to observe one stable ImagineDeck release before navigation; retaining the current immutable generation.',
        error
      );
      generation = await currentOrMigratedGeneration().catch(() => null);
    }

    if (!generation) {
      return coherentGenerationUnavailable(
        `No coherent ImagineDeck generation for ${request.url}`
      );
    }

    const navigationClientId = evt?.resultingClientId || evt?.clientId || '';
    if (!navigationClientId) {
      return coherentGenerationUnavailable(
        'Unable to pin a coherent ImagineDeck generation.'
      );
    }

    try {
      const pinnedGeneration = await pinGenerationForClient(
        navigationClientId,
        generation
      );
      const pinnedCache = await caches.open(pinnedGeneration.cacheName);
      const pinnedDocumentResponse = await pinnedCache.match(
        stableImagineDeckRequest(request.url)
      );
      if (!pinnedDocumentResponse) {
        throw new Error('Pinned ImagineDeck document response is missing.');
      }

      return attachImagineDeckGenerationSignature(
        pinnedDocumentResponse,
        pinnedGeneration.signature
      );
    } catch (error) {
      console.warn(
        '[ServiceWorker] Failed to pin the ImagineDeck generation for this navigation.',
        error
      );
      return coherentGenerationUnavailable(
        'Unable to pin a coherent ImagineDeck generation.'
      );
    }
  }

  async function handleAtomicGenerationRequest(request, evt) {
    const requestUrl = new URL(request.url);
    const requireNetwork =
      request.headers.get(IMAGINEDECK_REQUIRE_NETWORK_HEADER) === '1';
    const stageOnly =
      request.headers.get(IMAGINEDECK_STAGE_ONLY_HEADER) === '1';
    const promoteAtomic =
      request.headers.get(IMAGINEDECK_PROMOTE_ATOMIC_HEADER) === '1' ||
      (
        requestUrl.pathname === IMAGINEDECK_DOCUMENT_PATH &&
        request.mode !== 'navigate'
      );
    const isGenerationDocument =
      requestUrl.pathname === IMAGINEDECK_DOCUMENT_PATH &&
      request.mode === 'navigate';

    if (requireNetwork || stageOnly) {
      return baseHandleNetworkFirstAssetRequest(request, evt);
    }

    if (promoteAtomic) {
      try {
        const generation = await refreshStableGenerationFromNetwork();
        return (
          await responseFromGeneration(generation, request)
        ) || coherentGenerationUnavailable(
          `Promoted ImagineDeck response is missing for ${request.url}`
        );
      } catch (error) {
        console.warn(
          '[ServiceWorker] Explicit stable ImagineDeck generation promotion failed.',
          error
        );
        const generation = await readActiveGenerationPointer();
        if (generation) {
          const response = await responseFromGeneration(generation, request);
          if (response) {
            return response;
          }
        }
        return coherentGenerationUnavailable(
          `Stable generation promotion failed for ${request.url}`
        );
      }
    }

    if (isGenerationDocument) {
      return handleGenerationDocumentNavigation(request, evt);
    }

    const pinnedResponse = await matchPinnedImagineDeckResponse(
      evt?.clientId || '',
      stableImagineDeckRequest(request.url)
    );
    if (pinnedResponse) {
      return pinnedResponse;
    }

    try {
      const generation = await ensureActiveGeneration();
      const response = await responseFromGeneration(generation, request);
      if (response) {
        return response;
      }
      throw new Error('Active immutable ImagineDeck response is missing.');
    } catch (error) {
      console.warn(
        `[ServiceWorker] No coherent ImagineDeck generation for ${requestUrl.pathname}.`,
        error
      );
      return coherentGenerationUnavailable(
        `No coherent ImagineDeck generation for ${request.url}`
      );
    }
  }

  refreshAtomicAssetSetFromNetwork = () =>
    refreshStableGenerationFromNetwork();
  pinActiveImagineDeckGeneration = pinActiveGenerationForClient;

  handleNetworkFirstAssetRequest = function handleNetworkFirstAssetRequestV43(
    request,
    evt
  ) {
    const requestUrl = new URL(request.url);
    const isAtomicAsset =
      requestUrl.origin === self.location.origin &&
      ATOMIC_IMAGINEDECK_ASSET_PATHS.has(requestUrl.pathname);

    if (!isAtomicAsset) {
      return baseHandleNetworkFirstAssetRequest(request, evt);
    }

    return handleAtomicGenerationRequest(request, evt);
  };

  self.__IMAGINEDECK_SW_GENERATION_VERSION__ =
    IMAGINEDECK_GENERATION_VERSION;
})();
