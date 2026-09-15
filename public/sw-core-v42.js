// --- Service Worker for Museum Portal ---

// 1. Configuration
// --------------------------------------------------

const CORE_CACHE_VERSION = 'v42'; // Verified per-navigation ImagineDeck generation
const API_CACHE_VERSION = 'v4'; // TTL 20h

const CORE_CACHE_NAME = `museum-portal-core-${CORE_CACHE_VERSION}`;
const API_CACHE_NAME = `museum-portal-api-${API_CACHE_VERSION}`;
const IMAGINEDECK_ASSET_CACHE_NAME = 'museum-portal-imaginedeck-assets-v1';
const IMAGINEDECK_STAGING_CACHE_NAME = 'museum-portal-imaginedeck-staging-v1';
const IMAGINEDECK_NORMAL_STAGING_CACHE_NAME = 'museum-portal-imaginedeck-normal-staging-v1';

const API_CACHE_MAX_AGE_MS = 20 * 60 * 60 * 1000; // 20 hours

const API_URL = 'https://script.google.com/macros/s/AKfycbyhraKi6oqu33iU1VNa9cSP4Oi9K7Kb7g3GrEOSjAUiqK7oELrhuCaAK2ElN4tneWUA/exec';

const IMAGINEDECK_REQUIRE_NETWORK_HEADER = 'X-ImagineDeck-Require-Network';
const IMAGINEDECK_STAGE_ONLY_HEADER = 'X-ImagineDeck-Stage-Only';
const IMAGINEDECK_PROMOTE_ATOMIC_HEADER = 'X-ImagineDeck-Promote-Atomic';
const IMAGINEDECK_DOCUMENT_PATH = '/imaginedeck/app.html';
const IMAGINEDECK_PIN_METADATA_CACHE_NAME = 'museum-portal-imaginedeck-pins-v1';
const IMAGINEDECK_PIN_CACHE_PREFIX = 'museum-portal-imaginedeck-load-v1-';
const IMAGINEDECK_PIN_MAX_AGE_MS = 15 * 60 * 1000;
const IMAGINEDECK_WATCHDOG_NETWORK_TIMEOUT_MS = 8 * 1000;

const ATOMIC_IMAGINEDECK_ASSET_PATHS = new Set([
  '/imaginedeck/app.html',
  '/imaginedeck/index.js',
  '/imaginedeck/index.css',
  '/imaginedeck/mergeFeeds.js',
  '/imaginedeck/heartbeat.js',
  '/imaginedeck/QR_458893.png'
]);

const IMAGINEDECK_ASSET_SIGNATURE_KEYS = new Map([
  ['/imaginedeck/app.html', './app.html'],
  ['/imaginedeck/index.js', './index.js'],
  ['/imaginedeck/index.css', './index.css'],
  ['/imaginedeck/mergeFeeds.js', './mergeFeeds.js'],
  ['/imaginedeck/heartbeat.js', './heartbeat.js'],
  ['/imaginedeck/QR_458893.png', './QR_458893.png']
]);

const IMAGINEDECK_PIN_SIGNATURE_META_NAME =
  'imaginedeck-pinned-asset-signature';

const NETWORK_FIRST_ASSET_PATHS = new Set([
  ...ATOMIC_IMAGINEDECK_ASSET_PATHS,
  '/imaginedeck/watchdog.js'
]);

const CORE_ASSETS_TO_CACHE = [
  '/',
  '/resume-guard.js',
  '/index.html',
  '/index.css',
  '/index.js',
  '/manifest.json',
  '/offline.html',
  '/imaginedeck/',
  '/imaginedeck/index.html',
  '/imaginedeck/bootstrap-v45.js',
  '/imaginedeck/watchdog.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon.png',
  '/museum-street/',
  '/museum-street/index.html',
  '/museum-street/script.js',
  '/museum-street/style.css',
  '/museum-street/events/01-events.html',
  '/museum-street/events/02-events.html',
  '/museum-street/events/03-events.html',
  '/museum-street/events/04-events.html',
  '/museum-street/events/05-events.html',
  '/museum-street/events/06-events.html',
  '/museum-street/events/07-events.html',
  '/museum-street/events/08-events.html',
  '/museum-street/events/09-events.html',
  '/museum-street/events/10-events.html',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;700&display=swap',
  'https://unpkg.com/lucide@latest',
  '/renkei/',
  '/renkei/index.html',
  '/renkei/index.css',
  '/renkei/index.js'
];

const CORE_LOCAL_ASSET_TIMEOUT_MS = 4 * 1000;
const CORE_INSTALL_ASSETS = CORE_ASSETS_TO_CACHE.filter((assetUrl) => !assetUrl.startsWith('http'));
const CORE_REMOTE_ASSETS = CORE_ASSETS_TO_CACHE.filter((assetUrl) => assetUrl.startsWith('http'));

let normalAssetSetRefreshPromise = null;
const CORE_REQUIRED_ASSETS = new Set([
  '/',
  '/resume-guard.js',
  '/index.html',
  '/index.css',
  '/index.js',
  '/manifest.json',
  '/offline.html',
  '/imaginedeck/',
  '/imaginedeck/index.html',
  '/imaginedeck/bootstrap-v45.js',
  '/imaginedeck/watchdog.js',
  '/museum-street/',
  '/museum-street/index.html',
  '/museum-street/script.js',
  '/museum-street/style.css'
]);

let atomicAssetOperationChain = Promise.resolve();

// 2. Event Listeners
// --------------------------------------------------

async function fetchCoreAssetWithTimeout(request) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CORE_LOCAL_ASSET_TIMEOUT_MS);
  try {
    return await fetch(request, { cache: 'reload', signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function preserveRemoteCoreAssets() {
  const activeCache = await caches.open(CORE_CACHE_NAME);
  const cacheNames = await caches.keys();

  for (const assetUrl of CORE_REMOTE_ASSETS) {
    if (await activeCache.match(assetUrl)) {
      continue;
    }

    for (const cacheName of cacheNames) {
      if (cacheName === CORE_CACHE_NAME) {
        continue;
      }

      try {
        const sourceCache = await caches.open(cacheName);
        const response = await sourceCache.match(assetUrl);
        if (response) {
          await activeCache.put(assetUrl, response.clone());
          break;
        }
      } catch (error) {
        console.warn('[ServiceWorker] Failed to preserve remote core asset ' + assetUrl, error);
      }
    }
  }
}

async function precacheRemoteCoreAssets() {
  const cache = await caches.open(CORE_CACHE_NAME);

  await Promise.all(CORE_REMOTE_ASSETS.map(async (assetUrl) => {
    if (await cache.match(assetUrl)) {
      return;
    }

    try {
      const request = new Request(assetUrl, { mode: 'no-cors' });
      const response = await fetchCoreAssetWithTimeout(request);
      if (response.status === 200 || response.type === 'opaque') {
        await cache.put(assetUrl, response);
      }
    } catch (error) {
      console.warn('[ServiceWorker] Remote core asset precache failed: ' + assetUrl, error);
    }
  }));
}

self.addEventListener('install', (evt) => {
  console.log('[ServiceWorker] Install event started.');
  evt.waitUntil(
    caches.open(CORE_CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Caching core application shell assets...');
      const failedInstallAssets = [];
      const cachePromises = CORE_INSTALL_ASSETS.map((assetUrl) => {
        return (async () => {
          try {
            const request = assetUrl.startsWith('http')
              ? new Request(assetUrl, { mode: 'no-cors' })
              : new Request(assetUrl);
            const response = await fetchCoreAssetWithTimeout(request);
            if (response.status === 200 || response.type === 'opaque') {
              await cache.put(assetUrl, response);
            } else {
              failedInstallAssets.push(assetUrl);
              console.warn(`[ServiceWorker] Skipped caching ${assetUrl} - non-ok status: ${response.status}`);
            }
          } catch (err) {
            failedInstallAssets.push(assetUrl);
            console.warn(`[ServiceWorker] Failed to fetch and cache '${assetUrl}'.`, err);
          }
        })();
      });
      return Promise.all(cachePromises).then(() => {
        if (failedInstallAssets.length > 0) {
          throw new Error('Core local assets failed to precache: ' + failedInstallAssets.join(', '));
        }
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
  console.log('[ServiceWorker] Activate event started.');
  const currentCaches = [
    CORE_CACHE_NAME,
    API_CACHE_NAME,
    IMAGINEDECK_ASSET_CACHE_NAME,
    IMAGINEDECK_PIN_METADATA_CACHE_NAME
  ];

  evt.waitUntil(
    migrateImagineDeckFallbacks()
      .then(() => preserveRemoteCoreAssets())
      .then(() => caches.keys())
      .then((cacheNames) => Promise.all(
        cacheNames.map((cacheName) => {
          if (
            !currentCaches.includes(cacheName) &&
            !cacheName.startsWith(IMAGINEDECK_PIN_CACHE_PREFIX)
          ) {
            console.log(`[ServiceWorker] Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
          return undefined;
        })
      ))
      .then(() => cleanupExpiredImagineDeckPins())
      .then(() => {
        console.log('[ServiceWorker] Activation complete. Starting API pre-caching in background.');
        precacheApiContent();
        precacheRemoteCoreAssets().catch((error) => {
          console.warn('[ServiceWorker] Remote core asset background precache failed.', error);
        });
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', (evt) => {
  const { request } = evt;

  if (
    request.url.includes('googleapis.com') ||
    request.url.includes('imaginedeck.igsrr.org/feed/')
  ) {
    return;
  }

  if (request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(request.url);

  if (
    requestUrl.origin === self.location.origin &&
    NETWORK_FIRST_ASSET_PATHS.has(requestUrl.pathname)
  ) {
    evt.respondWith(handleNetworkFirstAssetRequest(request, evt));
    return;
  }

  if (request.url.startsWith(API_URL)) {
    evt.respondWith(handleApiRequest(request));
    return;
  }

  if (request.mode === 'navigate') {
    evt.respondWith(handleNavigationRequest(request));
    return;
  }

  evt.respondWith(handleStaticAssetRequest(request, evt));
});

// 3. Caching Strategy Implementations
// --------------------------------------------------

function stableImagineDeckRequest(pathOrUrl) {
  const url = new URL(pathOrUrl, self.location.origin);
  url.search = '';
  url.hash = '';
  return new Request(url.href, { credentials: 'same-origin' });
}

async function migrateImagineDeckFallbacks() {
  const assetCache = await caches.open(IMAGINEDECK_ASSET_CACHE_NAME);
  const cacheNames = (await caches.keys()).filter(cacheName =>
    cacheName !== IMAGINEDECK_ASSET_CACHE_NAME &&
    cacheName !== IMAGINEDECK_STAGING_CACHE_NAME &&
    cacheName !== IMAGINEDECK_NORMAL_STAGING_CACHE_NAME
  );
  const atomicPaths = [...ATOMIC_IMAGINEDECK_ASSET_PATHS];

  const activeAtomicResponses = await Promise.all(
    atomicPaths.map(pathname =>
      assetCache.match(stableImagineDeckRequest(pathname))
    )
  );

  if (!activeAtomicResponses.every(Boolean)) {
    await Promise.all(
      atomicPaths.map(pathname =>
        assetCache.delete(stableImagineDeckRequest(pathname))
      )
    );

    for (const cacheName of cacheNames) {
      const legacyCache = await caches.open(cacheName);
      const candidateResponses = await Promise.all(
        atomicPaths.map(pathname =>
          legacyCache.match(
            stableImagineDeckRequest(pathname),
            { ignoreSearch: true }
          )
        )
      );

      if (!candidateResponses.every(Boolean)) {
        continue;
      }

      for (let index = 0; index < atomicPaths.length; index += 1) {
        await assetCache.put(
          stableImagineDeckRequest(atomicPaths[index]),
          candidateResponses[index].clone()
        );
      }
      break;
    }
  }

  const watchdogRequest = stableImagineDeckRequest('/imaginedeck/watchdog.js');
  if (!(await assetCache.match(watchdogRequest))) {
    for (const cacheName of cacheNames) {
      const legacyCache = await caches.open(cacheName);
      const existingResponse = await legacyCache.match(
        watchdogRequest,
        { ignoreSearch: true }
      );
      if (existingResponse) {
        await assetCache.put(watchdogRequest, existingResponse.clone());
        break;
      }
    }
  }
}

async function createResponseWithFetchTime(response) {
  const headers = new Headers(response.headers);
  headers.append('X-Cache-Fetched-At', Date.now().toString());

  const body = await response.blob();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function responseValidator(response) {
  const etag = response.headers.get('etag');
  if (etag) {
    return `etag:${etag}`;
  }

  const lastModified = response.headers.get('last-modified');
  if (lastModified) {
    const contentLength = response.headers.get('content-length') || '';
    return `last-modified:${lastModified}|length:${contentLength}`;
  }

  return null;
}

async function responseBodyHash(response) {
  const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
  return Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

async function responsesRepresentSameAsset(networkResponse, cachedResponse) {
  const networkValidator = responseValidator(networkResponse);
  const cachedValidator = responseValidator(cachedResponse);

  if (networkValidator && cachedValidator) {
    return networkValidator === cachedValidator;
  }

  const [networkHash, cachedHash] = await Promise.all([
    responseBodyHash(networkResponse),
    responseBodyHash(cachedResponse)
  ]);
  return networkHash === cachedHash;
}

async function imagineDeckResponseSignature(pathname, response) {
  const signatureKey = IMAGINEDECK_ASSET_SIGNATURE_KEYS.get(pathname);
  if (!signatureKey) {
    throw new Error(`No ImagineDeck signature key for ${pathname}`);
  }

  const validator = responseValidator(response);
  if (validator) {
    return `${signatureKey}|${validator}`;
  }

  const hash = await responseBodyHash(response);
  return `${signatureKey}|sha256:${hash}`;
}

async function imagineDeckGenerationSignature(entries) {
  const signatures = await Promise.all(
    entries.map(entry =>
      imagineDeckResponseSignature(
        new URL(entry.request.url).pathname,
        entry.response.clone()
      )
    )
  );
  return signatures.join('\n');
}

async function attachImagineDeckGenerationSignature(response, signature) {
  const html = await response.text();
  const marker =
    `<meta name="${IMAGINEDECK_PIN_SIGNATURE_META_NAME}" ` +
    `content="${encodeURIComponent(signature)}">`;
  const signedHtml = html.includes('</head>')
    ? html.replace('</head>', `  ${marker}\n</head>`)
    : `${marker}\n${html}`;
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('etag');
  if (!headers.has('content-type')) {
    headers.set('content-type', 'text/html; charset=UTF-8');
  }

  return new Response(signedHtml, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function rollbackAtomicAssetSet(activeCache, previousEntries) {
  for (const entry of previousEntries) {
    if (entry.response) {
      await activeCache.put(entry.request, entry.response.clone());
    } else {
      await activeCache.delete(entry.request);
    }
  }
}

async function promoteNormalStagingCache() {
  const stagingCache = await caches.open(IMAGINEDECK_NORMAL_STAGING_CACHE_NAME);
  const activeCache = await caches.open(IMAGINEDECK_ASSET_CACHE_NAME);
  const entries = await Promise.all(
    [...ATOMIC_IMAGINEDECK_ASSET_PATHS].map(async pathname => {
      const request = stableImagineDeckRequest(pathname);
      const [stagedResponse, previousResponse] = await Promise.all([
        stagingCache.match(request),
        activeCache.match(request)
      ]);

      if (!stagedResponse) {
        throw new Error(`Normal staging response missing for ${pathname}`);
      }

      return { request, stagedResponse, previousResponse };
    })
  );
  const previousEntries = entries.map(entry => ({
    request: entry.request,
    response: entry.previousResponse
  }));

  try {
    for (const entry of entries) {
      await activeCache.put(entry.request, entry.stagedResponse.clone());
    }
  } catch (error) {
    await rollbackAtomicAssetSet(activeCache, previousEntries);
    throw error;
  }
}

function runSerializedAtomicAssetOperation(operation) {
  const operationPromise = atomicAssetOperationChain.then(operation, operation);
  atomicAssetOperationChain = operationPromise.catch(() => {});
  return operationPromise;
}

async function refreshAtomicAssetSetFromNetwork() {
  if (normalAssetSetRefreshPromise) {
    return normalAssetSetRefreshPromise;
  }

  normalAssetSetRefreshPromise = runSerializedAtomicAssetOperation(async () => {
    await caches.delete(IMAGINEDECK_NORMAL_STAGING_CACHE_NAME);
    const stagingCache = await caches.open(IMAGINEDECK_NORMAL_STAGING_CACHE_NAME);

    try {
      await Promise.all(
        [...ATOMIC_IMAGINEDECK_ASSET_PATHS].map(async pathname => {
          const request = stableImagineDeckRequest(pathname);
          const response = await fetchCoreAssetWithTimeout(request);
          if (!response || response.status !== 200) {
            throw new Error(`Atomic normal refresh for ${pathname} returned ${response?.status ?? 'no response'}`);
          }
          await stagingCache.put(request, response.clone());
        })
      );

      await promoteNormalStagingCache();
    } finally {
      await caches.delete(IMAGINEDECK_NORMAL_STAGING_CACHE_NAME);
    }
  }).finally(() => {
    normalAssetSetRefreshPromise = null;
  });

  return normalAssetSetRefreshPromise;
}

function imagineDeckPinMetadataRequest(clientId) {
  const url = new URL(
    `/__imaginedeck-client-pin__/${encodeURIComponent(clientId)}`,
    self.location.origin
  );
  return new Request(url.href);
}

async function readImagineDeckClientPin(clientId) {
  if (!clientId) {
    return null;
  }

  const metadataCache = await caches.open(IMAGINEDECK_PIN_METADATA_CACHE_NAME);
  const metadataRequest = imagineDeckPinMetadataRequest(clientId);
  const response = await metadataCache.match(metadataRequest);
  if (!response) {
    return null;
  }

  try {
    const pin = await response.json();
    if (
      typeof pin.cacheName !== 'string' ||
      typeof pin.signature !== 'string' ||
      typeof pin.createdAt !== 'number' ||
      Date.now() - pin.createdAt > IMAGINEDECK_PIN_MAX_AGE_MS
    ) {
      await metadataCache.delete(metadataRequest);
      if (typeof pin.cacheName === 'string') {
        await caches.delete(pin.cacheName);
      }
      return null;
    }
    return pin;
  } catch (error) {
    await metadataCache.delete(metadataRequest);
    return null;
  }
}

async function cleanupExpiredImagineDeckPins() {
  const metadataCache = await caches.open(IMAGINEDECK_PIN_METADATA_CACHE_NAME);
  const metadataRequests = await metadataCache.keys();

  for (const metadataRequest of metadataRequests) {
    const response = await metadataCache.match(metadataRequest);
    if (!response) {
      continue;
    }

    try {
      const pin = await response.json();
      if (
        typeof pin.cacheName !== 'string' ||
        typeof pin.createdAt !== 'number' ||
        Date.now() - pin.createdAt > IMAGINEDECK_PIN_MAX_AGE_MS
      ) {
        await metadataCache.delete(metadataRequest);
        if (typeof pin.cacheName === 'string') {
          await caches.delete(pin.cacheName);
        }
      }
    } catch (error) {
      await metadataCache.delete(metadataRequest);
    }
  }
}

async function pinActiveImagineDeckGeneration(clientId) {
  if (!clientId) {
    return null;
  }

  return runSerializedAtomicAssetOperation(async () => {
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

    const activeCache = await caches.open(IMAGINEDECK_ASSET_CACHE_NAME);
    const entries = await Promise.all(
      [...ATOMIC_IMAGINEDECK_ASSET_PATHS].map(async pathname => {
        const request = stableImagineDeckRequest(pathname);
        const response = await activeCache.match(request);
        if (!response) {
          throw new Error(`Active ImagineDeck response missing for ${pathname}`);
        }
        return { request, response };
      })
    );
    const signature = await imagineDeckGenerationSignature(entries);

    const cacheName =
      `${IMAGINEDECK_PIN_CACHE_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const pinnedCache = await caches.open(cacheName);

    try {
      for (const entry of entries) {
        await pinnedCache.put(entry.request, entry.response.clone());
      }

      await metadataCache.put(
        metadataRequest,
        new Response(
          JSON.stringify({
            cacheName,
            signature,
            createdAt: Date.now()
          }),
          {
            headers: { 'Content-Type': 'application/json' }
          }
        )
      );
    } catch (error) {
      await caches.delete(cacheName);
      throw error;
    }

    if (previousCacheName && previousCacheName !== cacheName) {
      await caches.delete(previousCacheName);
    }

    return { cacheName, signature };
  });
}

async function matchPinnedImagineDeckResponse(clientId, request) {
  const pin = await readImagineDeckClientPin(clientId);
  if (!pin) {
    return null;
  }

  const pinnedCache = await caches.open(pin.cacheName);
  const response = await pinnedCache.match(request);
  if (response) {
    return response;
  }

  const metadataCache = await caches.open(IMAGINEDECK_PIN_METADATA_CACHE_NAME);
  await metadataCache.delete(imagineDeckPinMetadataRequest(clientId));
  await caches.delete(pin.cacheName);
  return null;
}

/**
 * Serves a coherent ImagineDeck generation. app.html navigation creates an
 * immutable per-client snapshot; its CSS, JS, heartbeat, and image requests
 * remain pinned to that snapshot even if another tab promotes a newer active set.
 */
async function fetchImagineDeckWatchdogWithTimeout(request) {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(
      new Error(
        `ImagineDeck watchdog request timed out after ${IMAGINEDECK_WATCHDOG_NETWORK_TIMEOUT_MS} ms`
      )
    ),
    IMAGINEDECK_WATCHDOG_NETWORK_TIMEOUT_MS
  );

  try {
    return await fetch(request, {
      cache: 'reload',
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function handleNetworkFirstAssetRequest(request, evt) {
  const requestUrl = new URL(request.url);
  const stableRequest = stableImagineDeckRequest(request.url);
  const isWatchdogAsset = requestUrl.pathname === '/imaginedeck/watchdog.js';
  const cache = await caches.open(
    isWatchdogAsset ? CORE_CACHE_NAME : IMAGINEDECK_ASSET_CACHE_NAME
  );
  const cachedResponse = await cache.match(stableRequest);
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
  const isAtomicAsset =
    ATOMIC_IMAGINEDECK_ASSET_PATHS.has(requestUrl.pathname);
  const isGenerationDocument =
    isAtomicAsset &&
    requestUrl.pathname === IMAGINEDECK_DOCUMENT_PATH &&
    request.mode === 'navigate';

  if (requireNetwork || stageOnly) {
    try {
      return await fetch(request, { cache: 'reload' });
    } catch (error) {
      return new Response(`Network required: Failed to fetch ${request.url}`, {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  }

  if (!isAtomicAsset) {
    try {
      const networkResponse = requestUrl.pathname === '/imaginedeck/watchdog.js'
        ? await fetchImagineDeckWatchdogWithTimeout(request)
        : await fetch(request, { cache: 'reload' });
      if (networkResponse && networkResponse.status === 200) {
        await cache.put(stableRequest, networkResponse.clone());
        return networkResponse;
      }
      return cachedResponse || networkResponse;
    } catch (error) {
      if (cachedResponse) {
        return cachedResponse;
      }
      return new Response(`Offline: Failed to fetch ${request.url}`, {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  }

  if (promoteAtomic) {
    try {
      await refreshAtomicAssetSetFromNetwork();
      const promotedResponse = await cache.match(stableRequest);
      if (promotedResponse) {
        return promotedResponse;
      }
      throw new Error('Promoted ImagineDeck response is missing.');
    } catch (error) {
      console.warn(
        '[ServiceWorker] Explicit ImagineDeck generation promotion failed.',
        error
      );
      if (cachedResponse) {
        return cachedResponse;
      }
      return new Response(`Atomic promotion failed for ${request.url}`, {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  }

  if (!isGenerationDocument) {
    const pinnedResponse = await matchPinnedImagineDeckResponse(
      evt?.clientId || '',
      stableRequest
    );
    if (pinnedResponse) {
      return pinnedResponse;
    }

    if (cachedResponse) {
      return cachedResponse;
    }

    try {
      await refreshAtomicAssetSetFromNetwork();
      const initializedResponse = await cache.match(stableRequest);
      if (initializedResponse) {
        return initializedResponse;
      }
      throw new Error('Initialized ImagineDeck response is missing.');
    } catch (error) {
      console.warn(
        `[ServiceWorker] Failed to establish an initial ImagineDeck generation for ${requestUrl.pathname}.`,
        error
      );
      return new Response(`No coherent ImagineDeck generation for ${request.url}`, {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  }

  if (evt?.waitUntil) {
    evt.waitUntil(cleanupExpiredImagineDeckPins().catch(() => {}));
  }

  let activeDocumentResponse = cachedResponse;
  if (!activeDocumentResponse) {
    try {
      await refreshAtomicAssetSetFromNetwork();
      activeDocumentResponse = await cache.match(stableRequest);
    } catch (error) {
      console.warn(
        '[ServiceWorker] Failed to establish the initial ImagineDeck document generation.',
        error
      );
    }
  }

  if (!activeDocumentResponse) {
    return new Response(`No coherent ImagineDeck generation for ${request.url}`, {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  const navigationClientId = evt?.resultingClientId || evt?.clientId || '';
  if (!navigationClientId) {
    return activeDocumentResponse;
  }

  try {
    const pinnedGeneration = await pinActiveImagineDeckGeneration(navigationClientId);
    const pinnedCache = await caches.open(pinnedGeneration.cacheName);
    const pinnedDocumentResponse =
      (await pinnedCache.match(stableRequest)) || activeDocumentResponse;
    return attachImagineDeckGenerationSignature(
      pinnedDocumentResponse,
      pinnedGeneration.signature
    );
  } catch (error) {
    console.warn(
      '[ServiceWorker] Failed to pin the ImagineDeck generation for this navigation.',
      error
    );
    return activeDocumentResponse;
  }
}

async function handleApiRequest(request) {
  const cache = await caches.open(API_CACHE_NAME);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    const fetchedAtHeader = cachedResponse.headers.get('X-Cache-Fetched-At');
    const dateHeader = cachedResponse.headers.get('Date');

    let cachedAt = 0;
    if (fetchedAtHeader) {
      cachedAt = parseInt(fetchedAtHeader, 10);
    } else if (dateHeader) {
      cachedAt = new Date(dateHeader).getTime();
    }

    const isExpired = (Date.now() - cachedAt) > API_CACHE_MAX_AGE_MS;

    if (!isExpired) {
      return cachedResponse;
    }
  }

  try {
    const networkResponse = await fetch(request);

    if (networkResponse && networkResponse.status === 200) {
      const responseToCache = await createResponseWithFetchTime(networkResponse.clone());
      await cache.put(request, responseToCache);
    }

    return networkResponse;
  } catch (error) {
    if (cachedResponse) {
      console.log('[ServiceWorker] Network failed for API. Returning expired cache.');
      return cachedResponse;
    }
    return new Response('Content failed to load. Please check your connection.', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

async function handleNavigationRequest(request) {
  try {
    const networkResponse = await fetch(request, { cache: 'no-cache' });

    const cache = await caches.open(CORE_CACHE_NAME);
    await cache.put(request, networkResponse.clone());

    return networkResponse;
  } catch (error) {
    console.log(`[ServiceWorker] Network failed for navigation. Trying cache for: ${request.url}`);
    const cachedResponse = await caches.match(request, { ignoreSearch: true });
    if (cachedResponse) {
      return cachedResponse;
    }
    return caches.match('/offline.html');
  }
}

async function handleStaticAssetRequest(request, evt) {
  const cachedResponse = await caches.match(request, { ignoreSearch: true });

  const networkFetchPromise = (async () => {
    try {
      const networkResponse = await fetch(request);
      if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
        const cache = await caches.open(CORE_CACHE_NAME);
        await cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    } catch (e) {
      console.log(`[SW] Network failed for ${request.url}.`, e);
      if (!cachedResponse) {
        return new Response(`Offline: Failed to fetch ${request.url}`, { status: 503 });
      }
      throw e;
    }
  })();

  if (cachedResponse) {
    if (evt && evt.waitUntil) {
      evt.waitUntil(networkFetchPromise.catch(() => {}));
    }
    return cachedResponse;
  }

  return networkFetchPromise;
}

// 4. Utility Functions
// --------------------------------------------------

async function precacheApiContent() {
  console.log('[ServiceWorker] Starting background API pre-caching for pages 1-10.');
  const cache = await caches.open(API_CACHE_NAME);

  for (let i = 1; i <= 10; i++) {
    const url = `${API_URL}?page=${i}&mime=text/plain`;
    const request = new Request(url);

    const cachedResponse = await cache.match(request);
    let isExpired = true;
    if (cachedResponse) {
      const fetchedAtHeader = cachedResponse.headers.get('X-Cache-Fetched-At');
      const dateHeader = cachedResponse.headers.get('Date');

      let cachedAt = 0;
      if (fetchedAtHeader) {
        cachedAt = parseInt(fetchedAtHeader, 10);
      } else if (dateHeader) {
        cachedAt = new Date(dateHeader).getTime();
      }

      isExpired = (Date.now() - cachedAt) > API_CACHE_MAX_AGE_MS;
    }

    if (!cachedResponse || isExpired) {
      console.log(`[ServiceWorker] Pre-caching API content for page ${i}${isExpired && cachedResponse ? ' (expired)' : ''}`);
      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = await createResponseWithFetchTime(networkResponse.clone());
          await cache.put(request, responseToCache);
        }
      } catch (e) {
        console.warn(`[ServiceWorker] Failed to pre-cache API content for page ${i}`, e);
      }

      if (i < 10) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  console.log('[ServiceWorker] Background API pre-caching finished.');
}
