(() => {
  'use strict';

  const LAST_ACTIVE_KEY = 'museumPortal:lastActiveAtMs';
  const STALE_RESUME_THRESHOLD_MS = 60 * 60 * 1000; // 60 minutes
  const TOP_URL = '/';
  const RESET_QUERY = 'resume=stale';

  function safeGetLastActiveAtMs() {
    try {
      const raw = window.localStorage.getItem(LAST_ACTIVE_KEY);
      if (!raw) return 0;
      const value = Number(raw);
      return Number.isFinite(value) ? value : 0;
    } catch (error) {
      console.warn('[ResumeGuard] Failed to read localStorage.', error);
      return 0;
    }
  }

  function safeSetLastActiveAtMs(value) {
    try {
      window.localStorage.setItem(LAST_ACTIVE_KEY, String(value));
    } catch (error) {
      console.warn('[ResumeGuard] Failed to write localStorage.', error);
    }
  }

  function isStandalonePwa() {
    return Boolean(
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  }

  function isEmbeddedFrame() {
    try {
      return window.top !== window.self;
    } catch {
      return true;
    }
  }

  function isTopPage() {
    return location.pathname === '/' || location.pathname === '/index.html';
  }

  function isExemptPath() {
    return location.pathname.startsWith('/admin/');
  }

  function shouldResetToTop() {
    if (!isStandalonePwa()) return false;
    if (isEmbeddedFrame()) return false;
    if (isTopPage()) return false;
    if (isExemptPath()) return false;

    const lastActiveAtMs = safeGetLastActiveAtMs();
    if (!lastActiveAtMs) return false;

    return Date.now() - lastActiveAtMs > STALE_RESUME_THRESHOLD_MS;
  }

  function markActive() {
    safeSetLastActiveAtMs(Date.now());
  }

  if (shouldResetToTop()) {
    console.warn('[ResumeGuard] Stale PWA resume detected. Redirecting to top page.');
    location.replace(`${TOP_URL}?${RESET_QUERY}`);
    return;
  }

  markActive();

  window.addEventListener('pageshow', markActive);
  window.addEventListener('focus', markActive);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' || document.visibilityState === 'visible') {
      markActive();
    }
  });
})();
