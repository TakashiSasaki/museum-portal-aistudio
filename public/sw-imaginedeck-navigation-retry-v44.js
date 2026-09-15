(() => {
  'use strict';

  const NAVIGATION_RETRY_VERSION = 44;
  const RETRY_DELAY_MS = 1_000;
  const baseHandleNetworkFirstAssetRequest = handleNetworkFirstAssetRequest;

  function isImagineDeckGenerationNavigation(request) {
    const requestUrl = new URL(request.url);
    return (
      requestUrl.origin === self.location.origin &&
      requestUrl.pathname === IMAGINEDECK_DOCUMENT_PATH &&
      request.mode === 'navigate'
    );
  }

  function retryingServiceUnavailable() {
    const retrySeconds = Math.ceil(RETRY_DELAY_MS / 1_000);
    const body =
      '<!doctype html><html><head><meta charset="utf-8">' +
      `<meta http-equiv="refresh" content="${retrySeconds}">` +
      '<meta name="robots" content="noindex"></head>' +
      '<body><p>ImagineDeck is preparing a coherent asset generation. Retrying shortly.</p>' +
      `<script>setTimeout(() => location.reload(), ${RETRY_DELAY_MS});</script>` +
      '</body></html>';

    return new Response(body, {
      status: 503,
      statusText: 'Service Unavailable',
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Retry-After': String(retrySeconds)
      }
    });
  }

  handleNetworkFirstAssetRequest = function handleNetworkFirstAssetRequestV44(
    request,
    evt
  ) {
    if (!isImagineDeckGenerationNavigation(request)) {
      return baseHandleNetworkFirstAssetRequest(request, evt);
    }

    return Promise.resolve(baseHandleNetworkFirstAssetRequest(request, evt))
      .then(response => (
        response?.status === 503
          ? retryingServiceUnavailable()
          : response
      ));
  };

  self.__IMAGINEDECK_SW_NAVIGATION_RETRY_VERSION__ =
    NAVIGATION_RETRY_VERSION;
})();
