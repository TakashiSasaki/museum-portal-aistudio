(() => {
  'use strict';

  const NETWORK_PATCH_VERSION = 36;
  const baseHandleNetworkFirstAssetRequest = handleNetworkFirstAssetRequest;

  handleNetworkFirstAssetRequest = function handleNetworkFirstAssetRequestNetworkV36(
    request,
    evt
  ) {
    const requestUrl = new URL(request.url);
    const isAtomicAsset =
      requestUrl.origin === self.location.origin &&
      ATOMIC_IMAGINEDECK_ASSET_PATHS.has(requestUrl.pathname);
    const hasProtocolHeader =
      request.headers.get(IMAGINEDECK_REQUIRE_NETWORK_HEADER) === '1' ||
      request.headers.get(IMAGINEDECK_STAGE_ONLY_HEADER) === '1' ||
      request.headers.get(IMAGINEDECK_PROMOTE_ATOMIC_HEADER) === '1';
    const isContentHashProbe =
      isAtomicAsset &&
      request.method === 'GET' &&
      request.mode !== 'navigate' &&
      request.cache === 'no-store' &&
      !hasProtocolHeader;

    if (!isContentHashProbe) {
      return baseHandleNetworkFirstAssetRequest(request, evt);
    }

    // The watchdog's validator fallback must hash server bytes, not the
    // client-pinned or active immutable generation. Request.cache is visible
    // to the worker even when older watchdog code omitted the protocol header.
    return fetch(request, { cache: 'reload' }).catch(error => {
      console.warn(
        `[ServiceWorker] Network-only ImagineDeck content-hash probe failed for ${requestUrl.pathname}.`,
        error
      );
      return new Response(
        `Network-only hash probe failed for ${request.url}`,
        {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain' }
        }
      );
    });
  };

  self.__IMAGINEDECK_SW_NETWORK_PATCH_VERSION__ = NETWORK_PATCH_VERSION;
})();
