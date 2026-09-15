(() => {
  'use strict';

  const JSON_ORIGIN = 'https://imagine-deck-feed.firebaseapp.com';
  const JSON_PATHS = new Set(['/upcoming.json', '/past.json']);
  const baseHandleStaticAssetRequest = handleStaticAssetRequest;

  handleStaticAssetRequest = function handleStaticAssetRequestWithImagineDeckJsonBypass(request, evt) {
    const requestUrl = new URL(request.url);
    if (
      requestUrl.origin === JSON_ORIGIN &&
      JSON_PATHS.has(requestUrl.pathname)
    ) {
      return fetch(request);
    }

    return baseHandleStaticAssetRequest(request, evt);
  };

  self.__IMAGINEDECK_JSON_ENDPOINT_BYPASS_VERSION__ = 1;
})();
