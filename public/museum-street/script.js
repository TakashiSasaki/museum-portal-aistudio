const SERVICE_WORKER_READY_TIMEOUT_MS = 1000;

document.addEventListener('DOMContentLoaded', () => {
    const navContainer = document.getElementById('museum-nav');
    const contentFrame = document.getElementById('content-frame');
    const mapFrame = document.getElementById('map-frame');
    const tabEvents = document.getElementById('tab-events');
    const tabMap = document.getElementById('tab-map');
    
    // Mobile navigation elements
    const navBackdrop = document.getElementById('nav-backdrop');
    const menuToggle = document.getElementById('menu-toggle');
    
    const defaultPage = '1';
    let currentPage = defaultPage;
    let currentTab = 'events';
    let activeLink = null;

    // Menu toggle logic
    const closeMenu = () => {
        if (!navContainer || !navBackdrop) return;
        navContainer.classList.add('-translate-x-full');
        navContainer.classList.remove('translate-x-0');
        navBackdrop.classList.add('opacity-0');
        navBackdrop.classList.add('pointer-events-none');
        setTimeout(() => {
            navBackdrop.classList.add('hidden');
        }, 300);
    };

    const openMenu = () => {
        if (!navContainer || !navBackdrop) return;
        navBackdrop.classList.remove('hidden');
        // Force reflow
        navBackdrop.offsetHeight;
        navContainer.classList.remove('-translate-x-full');
        navContainer.classList.add('translate-x-0');
        navBackdrop.classList.remove('opacity-0');
        navBackdrop.classList.remove('pointer-events-none');
    };

    if (menuToggle) {
        menuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            if (navContainer.classList.contains('-translate-x-full')) {
                openMenu();
            } else {
                closeMenu();
            }
        });
    }

    if (navBackdrop) {
        navBackdrop.addEventListener('click', closeMenu);
    }

    const updateTabs = () => {
        if (!tabEvents || !tabMap) return;
        
        if (currentTab === 'events') {
            tabEvents.classList.add('bg-slate-800/80', 'text-white', 'shadow-[0_0_10px_rgba(255,255,255,0.1)]', 'active-tab');
            tabEvents.classList.remove('bg-slate-900/40', 'text-slate-400', 'opacity-60', 'hover:opacity-100', 'inactive-tab');
            
            tabMap.classList.add('bg-slate-900/40', 'text-slate-400', 'opacity-60', 'hover:opacity-100', 'inactive-tab');
            tabMap.classList.remove('bg-slate-800/80', 'text-white', 'shadow-[0_0_10px_rgba(255,255,255,0.1)]', 'active-tab');

            contentFrame.classList.remove('hidden');
            mapFrame.classList.add('hidden');
        } else {
            tabMap.classList.add('bg-slate-800/80', 'text-white', 'shadow-[0_0_10px_rgba(255,255,255,0.1)]', 'active-tab');
            tabMap.classList.remove('bg-slate-900/40', 'text-slate-400', 'opacity-60', 'hover:opacity-100', 'inactive-tab');

            tabEvents.classList.add('bg-slate-900/40', 'text-slate-400', 'opacity-60', 'hover:opacity-100', 'inactive-tab');
            tabEvents.classList.remove('bg-slate-800/80', 'text-white', 'shadow-[0_0_10px_rgba(255,255,255,0.1)]', 'active-tab');

            contentFrame.classList.add('hidden');
            mapFrame.classList.remove('hidden');
            
            loadMapContent(currentPage);
        }
    };

    if (tabEvents) {
        tabEvents.addEventListener('click', () => {
            if (currentTab !== 'events') {
                currentTab = 'events';
                updateTabs();
            }
        });
    }

    if (tabMap) {
        tabMap.addEventListener('click', () => {
            if (currentTab !== 'map') {
                currentTab = 'map';
                updateTabs();
            }
        });
    }

    const loadMapContent = (page) => {
        if (!mapFrame || mapFrame.dataset.loadedPage === String(page)) {
            return; 
        }
        
        const url = `mymap/${String(page).padStart(2, '0')}-mymap.html`;
        fetch(url)
            .then(res => {
                if (!res.ok) throw new Error("Map HTML fetch failed");
                return res.text();
            })
            .then(html => {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const embeddedIframe = doc.querySelector('iframe');
                if (embeddedIframe && embeddedIframe.src) {
                    mapFrame.src = embeddedIframe.src;
                    mapFrame.dataset.loadedPage = String(page);
                }
            })
            .catch(err => {
                console.warn("Could not load map content", err);
            });
    };

    const API_URL = 'https://script.google.com/macros/s/AKfycbyhraKi6oqu33iU1VNa9cSP4Oi9K7Kb7g3GrEOSjAUiqK7oELrhuCaAK2ElN4tneWUA/exec';

    const loadEventsContent = (page) => {
        const apiUrl = `${API_URL}?page=${page}&mime=text/plain`;
        const fallbackUrl = `events/${String(page).padStart(2, '0')}-events.html`;

        contentFrame.srcdoc = `<div style="color: #94a3b8; display: flex; justify-content: center; align-items: center; height: 100%; font-family: sans-serif;">読み込み中...</div>`;

        fetch(apiUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`API error! status: ${response.status}`);
                }
                return response.text();
            })
            .then(html => {
                contentFrame.srcdoc = html;
            })
            .catch(error => {
                console.warn('Direct API fetch failed, falling back to local wrapper.', error);
                contentFrame.src = fallbackUrl;
            });
    };

    contentFrame.addEventListener('load', () => {
        try {
            if (contentFrame.contentDocument && contentFrame.contentDocument.body) {
                contentFrame.contentDocument.body.style.padding = '0';
            }
        } catch (e) {
            console.warn('[DEBUG] Could not set padding for content iframe', e);
        }
    });

    navContainer.addEventListener('click', (e) => {
        const link = e.target.closest('.museum-item');
        if (link) {
            e.preventDefault();
            const page = link.dataset.page;
            
            if (currentPage !== page) {
                currentPage = page;
                
                if (activeLink) {
                    activeLink.classList.remove('active');
                }
                link.classList.add('active');
                activeLink = link;

                loadEventsContent(currentPage);
                if (currentTab === 'map') {
                    loadMapContent(currentPage);
                } else if (mapFrame) {
                    mapFrame.dataset.loadedPage = "";
                }
            }
            if (window.innerWidth < 768) {
                closeMenu();
            }
        }
    });

    async function waitForServiceWorkerReady() {
        if (!('serviceWorker' in navigator)) {
            console.warn('[Museum Street] Service worker is not supported.');
            return 'unsupported';
        }

        try {
            console.log('[Museum Street] Registering service worker and waiting for readiness.');
            await navigator.serviceWorker.register('/sw.js');

            const waitResult = await Promise.race([
                navigator.serviceWorker.ready.then(() => 'ready'),
                new Promise(resolve => setTimeout(() => resolve('timeout'), SERVICE_WORKER_READY_TIMEOUT_MS))
            ]);

            if (waitResult === 'ready') {
                console.log('[Museum Street] Service worker ready before timeout.');
            } else {
                console.warn(`[Museum Street] Service worker readiness timed out after ${SERVICE_WORKER_READY_TIMEOUT_MS} ms.`);
            }

            if (navigator.serviceWorker.controller) {
                console.log('[Museum Street] Current page is controlled by a service worker.');
            } else {
                console.warn('[Museum Street] Current page is not yet controlled by a service worker.');
            }

            return waitResult;
        } catch (error) {
            console.warn('[Museum Street] Service worker setup failed; continuing without it.', error);
            return 'failed';
        }
    }

    const precacheAllEvents = async (excludePage) => {
        const pages = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].filter(p => p !== String(excludePage));
        for (const p of pages) {
            const apiUrl = `${API_URL}?page=${p}&mime=text/plain`;
            try {
                await fetch(apiUrl);
            } catch (e) {
                console.warn(`[Museum Street] Precache failed for page ${p}`, e);
            }
            await new Promise(resolve => setTimeout(resolve, 250));
        }
        console.log('[Museum Street] Pre-caching of all museum events completed.');
    };

    const initialLink = navContainer.querySelector(`[data-page="${defaultPage}"]`);
    if (initialLink) {
        initialLink.classList.add('active');
        activeLink = initialLink;

        (async () => {
            try {
                const status = await waitForServiceWorkerReady();
                console.log(`[Museum Street] Initial content load proceeding after service worker wait status: ${status}.`);
            } catch (error) {
                console.warn('[Museum Street] Unexpected error during service worker wait:', error);
            } finally {
                loadEventsContent(defaultPage);
                if (currentTab === 'map') {
                    loadMapContent(defaultPage);
                }
                if ('requestIdleCallback' in window) {
                    requestIdleCallback(() => precacheAllEvents(defaultPage));
                } else {
                    setTimeout(() => precacheAllEvents(defaultPage), 1000);
                }
            }
        })();
    }

    // Initial menu state for mobile
    if (window.innerWidth < 768) {
        if (navContainer && navBackdrop) {
            // Disable transitions temporarily to open without animation
            navContainer.style.transition = 'none';
            navBackdrop.style.transition = 'none';

            navBackdrop.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
            navContainer.classList.remove('-translate-x-full');
            navContainer.classList.add('translate-x-0');

            // Force reflow
            navContainer.offsetHeight;

            // Re-enable transitions
            setTimeout(() => {
                navContainer.style.transition = '';
                navBackdrop.style.transition = '';
            }, 0);
        }
    }
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
});
