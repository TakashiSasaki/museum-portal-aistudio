// Initialize icons
lucide.createIcons();

// Load Portal Cards from Firestore
document.addEventListener('DOMContentLoaded', () => {
    const portalGrid = document.getElementById('portal-grid');
    if (!portalGrid) return;

    // Default configuration mapping for color themes to tailwind classes
    // Some cards use -700, others use -800, we map them as best effort
    const themeMap = {
        'cyan': { text: 'text-cyan-400', grad: 'from-cyan-500 to-cyan-700', hex: '#22d3ee', rgb: '34, 211, 238' },
        'emerald': { text: 'text-emerald-400', grad: 'from-emerald-500 to-emerald-800', hex: '#34d399', rgb: '52, 211, 153' },
        'yellow': { text: 'text-yellow-400', grad: 'from-yellow-400 to-yellow-600', hex: '#facc15', rgb: '250, 204, 21' },
        'amber': { text: 'text-amber-400', grad: 'from-amber-400 to-amber-600', hex: '#fbbf24', rgb: '251, 191, 36' },
        'fuchsia': { text: 'text-fuchsia-400', grad: 'from-fuchsia-500 to-purple-700', hex: '#e879f9', rgb: '232, 121, 249' },
        'rose': { text: 'text-rose-500', grad: 'from-rose-500 to-rose-800', hex: '#f43f5e', rgb: '244, 63, 94' },
        'orange': { text: 'text-orange-500', grad: 'from-orange-500 to-orange-700', hex: '#f97316', rgb: '249, 115, 22' },
        'blue': { text: 'text-blue-500', grad: 'from-blue-500 to-blue-800', hex: '#3b82f6', rgb: '59, 130, 246' },
        'indigo': { text: 'text-indigo-400', grad: 'from-indigo-500 to-indigo-800', hex: '#818cf8', rgb: '129, 140, 248' }
    };

    // Pre-calculate possible classes to remove to avoid expensive Array.from().filter() in loops
    const textClassesToRemove = ['text-slate-500', ...Object.values(themeMap).map(t => t.text)];
    const gradClassesToRemove = ['bg-slate-500', 'bg-gradient-to-br', ...Object.values(themeMap).flatMap(t => t.grad.split(' '))];

    const defaultIconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-white icon-glow"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';
    const defaultPortalCards = [
        { id: 'card1', position: 1, title: 'えひめ連携企業紹介', url: '/renkei/', colorTheme: 'cyan' },
        { id: 'card2', position: 2, title: '松山ミュージアム<br>ストリート', url: '/museum-street/', colorTheme: 'emerald' },
        { id: 'card3', position: 3, title: '愛媛大学<br>ミュージアム', url: '#', colorTheme: 'yellow' },
        { id: 'card4', position: 4, title: 'イマジン・デッキ', url: '#', colorTheme: 'fuchsia' },
        { id: 'card5', position: 5, title: '学生生活<br>サポート', url: '#', colorTheme: 'rose' },
        { id: 'card6', position: 6, title: '大学生協<br>サイト', url: '#', colorTheme: 'orange' },
        { id: 'card7', position: 7, title: '修学支援<br>システム', url: '#', colorTheme: 'blue' },
        { id: 'card8', position: 8, title: '問い合わせ先', url: '#', colorTheme: 'indigo' }
    ];

    // In-memory active card definitions for bookmarks sync
    const currentCardsData = {};
    // In-memory definitions of all cards loaded (including archived cards)
    let allLoadedCards = [...defaultPortalCards];

    // --- Bookmarks Management (Keyed by Card Document ID) ---
    const BOOKMARKS_STORAGE_KEY = 'museum_portal_bookmarks';

    function getStoredBookmarks() {
        try {
            const raw = localStorage.getItem(BOOKMARKS_STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            // Migration / normalization: ensure every item has a valid document id
            return parsed.map(b => {
                const item = { ...b };
                if (!item.id && item.cardId) {
                    item.id = item.cardId;
                }
                if (!item.id && item.slot) {
                    item.id = `card${item.slot}`;
                }
                if (!item.cardId && item.id) {
                    item.cardId = item.id;
                }
                return item;
            });
        } catch (e) {
            console.warn('[Bookmarks] Failed to read from localStorage:', e);
            return [];
        }
    }

    function saveStoredBookmarks(bookmarks) {
        try {
            localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarks));
        } catch (e) {
            console.warn('[Bookmarks] Failed to write to localStorage:', e);
        }
        updateBookmarksBadge();
    }

    function updateBookmarksBadge() {
        const badge = document.getElementById('header-bookmarks-badge');
        if (!badge) return;
        const count = getStoredBookmarks().length;
        if (count > 0) {
            badge.textContent = count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    function updateArchivesBadge() {
        const badge = document.getElementById('header-archives-badge');
        if (!badge) return;
        const count = allLoadedCards.filter(c => c.position === 'archived').length;
        if (count > 0) {
            badge.textContent = count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    const defaultHighlightsIds = ['card3', 'card2', 'card4', 'card1'];

    function getHighlightsCards() {
        const explicitHighlights = allLoadedCards.filter(c => c.isHighlight === true || c.highlight === true);
        if (explicitHighlights.length > 0) {
            return explicitHighlights;
        }
        const curated = [];
        defaultHighlightsIds.forEach(id => {
            const found = allLoadedCards.find(c => c.id === id);
            if (found && found.position !== 'archived') {
                curated.push(found);
            }
        });
        return curated.length > 0 ? curated : allLoadedCards.filter(c => typeof c.position === 'number' && c.position <= 4);
    }

    function updateHighlightsBadge() {
        const badge = document.getElementById('header-highlights-badge');
        if (!badge) return;
        const count = getHighlightsCards().length;
        if (count > 0) {
            badge.textContent = count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    // Scopes SVG element IDs (e.g. gradient IDs, clipPath IDs) to avoid cross-card collisions
    function scopeSvgIds(svgCode, uniquePrefix) {
        if (!svgCode || typeof svgCode !== 'string') return '';
        const idRegex = /\bid=["']([a-zA-Z0-9_-]+)["']/g;
        const ids = [];
        let match;
        while ((match = idRegex.exec(svgCode)) !== null) {
            if (!ids.includes(match[1])) {
                ids.push(match[1]);
            }
        }
        if (ids.length === 0) return svgCode;

        let scopedSvg = svgCode;
        ids.forEach(id => {
            const scopedId = `${uniquePrefix}_${id}`;
            // Replace definition: id="xyz" or id='xyz'
            scopedSvg = scopedSvg.replace(new RegExp(`\\bid=["']${id}["']`, 'g'), `id="${scopedId}"`);
            // Replace url(#xyz)
            scopedSvg = scopedSvg.replace(new RegExp(`url\\(#${id}\\)`, 'g'), `url(#${scopedId})`);
            // Replace href="#xyz" or xlink:href="#xyz"
            scopedSvg = scopedSvg.replace(new RegExp(`href=["']#${id}["']`, 'g'), `href="#${scopedId}"`);
        });
        return scopedSvg;
    }

    function getCardInfoByIdOrSlot(cardId, slot) {
        // 1. Check in current active cards by ID first
        if (cardId) {
            for (const key in currentCardsData) {
                if (currentCardsData[key] && currentCardsData[key].id === cardId) {
                    return currentCardsData[key];
                }
            }
            const foundInAll = allLoadedCards.find(c => c.id === cardId);
            if (foundInAll) {
                return {
                    id: cardId,
                    ...foundInAll
                };
            }
            const defaultMatchById = defaultPortalCards.find(c => c.id === cardId);
            if (defaultMatchById) {
                return {
                    id: cardId,
                    ...defaultMatchById
                };
            }
        }

        // 2. Check by position if slot is provided or cardId is a pure slot number
        let numericSlot = slot ? Number(slot) : null;
        if (!numericSlot && cardId && /^\d+$/.test(String(cardId))) {
            numericSlot = Number(cardId);
        }

        if (numericSlot && currentCardsData[numericSlot]) {
            return {
                id: currentCardsData[numericSlot].id || `card${numericSlot}`,
                ...currentCardsData[numericSlot]
            };
        }

        // 3. Check in default cards by position
        if (numericSlot) {
            const defaultMatchBySlot = defaultPortalCards.find(c => c.position === numericSlot);
            if (defaultMatchBySlot) {
                return {
                    id: defaultMatchBySlot.id,
                    ...defaultMatchBySlot
                };
            }
        }

        // 4. Fallback to DOM slot
        if (numericSlot) {
            const slotEl = portalGrid.querySelector(`[data-slot="${numericSlot}"]`);
            if (slotEl) {
                const spanEl = slotEl.querySelector('span');
                const iconEl = slotEl.querySelector('.plasma-sphere');
                const actualId = cardId || slotEl.dataset.cardId || `card${numericSlot}`;
                return {
                    id: actualId,
                    position: numericSlot,
                    slot: numericSlot,
                    title: spanEl ? spanEl.innerHTML : actualId,
                    url: slotEl.getAttribute('href') || '#',
                    colorTheme: 'cyan',
                    svgCode: iconEl ? iconEl.innerHTML : ''
                };
            }
        }
        return null;
    }

    function updateCardBookmarkButtonState(slot, isBookmarked, cardId) {
        const btn = portalGrid.querySelector(`[data-bookmark-slot="${slot}"]`);
        if (!btn) return;
        const displayId = cardId || btn.dataset.cardId || (slot ? `card${slot}` : '');
        if (displayId) {
            btn.dataset.cardId = displayId;
        }
        const info = getCardInfoByIdOrSlot(displayId, slot);
        const rawTitle = info && info.title ? info.title : `カード (${displayId})`;
        const cleanTitle = rawTitle.replace(/<br\s*\/?>/gi, ' ');

        if (isBookmarked) {
            btn.classList.add('is-bookmarked');
            btn.setAttribute('aria-label', `${cleanTitle} (ID: ${displayId}) のブックマークを解除`);
            btn.setAttribute('title', `ブックマーク解除 (ID: ${displayId})`);
        } else {
            btn.classList.remove('is-bookmarked');
            btn.setAttribute('aria-label', `${cleanTitle} (ID: ${displayId}) をブックマークに追加`);
            btn.setAttribute('title', `ブックマーク (ID: ${displayId})`);
        }
    }

    function updateAllCardBookmarkStates() {
        const bookmarks = getStoredBookmarks();
        const bookmarkedIdSet = new Set(bookmarks.map(b => b.id || b.cardId || (b.slot ? `card${b.slot}` : '')));
        for (let slot = 1; slot <= 8; slot++) {
            const slotEl = portalGrid.querySelector(`[data-slot="${slot}"]`);
            const btn = portalGrid.querySelector(`[data-bookmark-slot="${slot}"]`);
            const cardId = (slotEl && slotEl.dataset.cardId) || (btn && btn.dataset.cardId) || (currentCardsData[slot] && currentCardsData[slot].id) || `card${slot}`;
            const isBookmarked = bookmarkedIdSet.has(cardId);
            updateCardBookmarkButtonState(slot, isBookmarked, cardId);
        }
        updateBookmarksBadge();
    }

    function toggleCardBookmark(targetId, slot) {
        const numericSlot = slot ? Number(slot) : null;
        let cardId = targetId;
        if (!cardId && numericSlot) {
            const slotEl = portalGrid.querySelector(`[data-slot="${numericSlot}"]`);
            const btn = portalGrid.querySelector(`[data-bookmark-slot="${numericSlot}"]`);
            cardId = (slotEl && slotEl.dataset.cardId) || (btn && btn.dataset.cardId) || (currentCardsData[numericSlot] && currentCardsData[numericSlot].id) || `card${numericSlot}`;
        }
        if (!cardId) return;

        const bookmarks = getStoredBookmarks();
        const idx = bookmarks.findIndex(b => (b.id && b.id === cardId) || (b.cardId && b.cardId === cardId));
        let isNowBookmarked = false;

        if (idx >= 0) {
            bookmarks.splice(idx, 1);
            isNowBookmarked = false;
        } else {
            const info = getCardInfoByIdOrSlot(cardId, numericSlot);
            if (info) {
                bookmarks.push({
                    id: cardId,
                    cardId: cardId,
                    slot: info.position || numericSlot || null,
                    title: info.title || cardId,
                    url: info.url || '#',
                    colorTheme: info.colorTheme || 'cyan',
                    svgCode: info.svgCode || '',
                    savedAt: Date.now()
                });
                isNowBookmarked = true;
            }
        }

        saveStoredBookmarks(bookmarks);
        updateAllCardBookmarkStates();

        if (isBookmarksRoute()) {
            renderBookmarksList();
        }
        if (isHighlightsRoute()) {
            renderHighlightsList();
        }
    }

    // --- SPA Routing ---
    function isHighlightsRoute() {
        const p = window.location.pathname;
        return p === '/highlights' || p === '/highlights/' || p === '/highlights.html';
    }

    function isBookmarksRoute() {
        const p = window.location.pathname;
        return p === '/bookmarks' || p === '/bookmarks/' || p === '/bookmarks.html';
    }

    function isArchivesRoute() {
        const p = window.location.pathname;
        return p === '/archives' || p === '/archives/' || p === '/archives.html';
    }

    function renderRoute() {
        closeRemoveBookmarkDialog();
        const highlightsView = document.getElementById('highlights-view');
        const bookmarksView = document.getElementById('bookmarks-view');
        const archivesView = document.getElementById('archives-view');
        const highlightsBtn = document.getElementById('header-highlights-button');
        const bookmarksBtn = document.getElementById('header-bookmarks-button');
        const archivesBtn = document.getElementById('header-archives-button');
        const pageTitle = document.getElementById('header-main-title');
        const headerBackButton = document.getElementById('header-back-button');
        const slogan = document.querySelector('.slogan-text');

        if (isHighlightsRoute()) {
            portalGrid.classList.add('hidden');
            if (bookmarksView) {
                bookmarksView.classList.add('hidden');
            }
            if (archivesView) {
                archivesView.classList.add('hidden');
            }
            if (bookmarksBtn) {
                bookmarksBtn.classList.remove('active-bookmark-route');
            }
            if (archivesBtn) {
                archivesBtn.classList.remove('active-bookmark-route');
            }
            if (highlightsView) {
                highlightsView.classList.remove('hidden');
                renderHighlightsList();
            }
            if (highlightsBtn) {
                highlightsBtn.classList.add('active-bookmark-route');
            }
            if (pageTitle) {
                pageTitle.classList.add('hidden');
            }
            if (headerBackButton) {
                headerBackButton.classList.remove('hidden');
            }
            if (slogan) {
                slogan.classList.add('opacity-0', 'pointer-events-none');
            }
            document.title = 'ハイライト | 愛媛大学ミュージアムポータルサイト';
        } else if (isBookmarksRoute()) {
            portalGrid.classList.add('hidden');
            if (highlightsView) {
                highlightsView.classList.add('hidden');
            }
            if (archivesView) {
                archivesView.classList.add('hidden');
            }
            if (highlightsBtn) {
                highlightsBtn.classList.remove('active-bookmark-route');
            }
            if (archivesBtn) {
                archivesBtn.classList.remove('active-bookmark-route');
            }
            if (bookmarksView) {
                bookmarksView.classList.remove('hidden');
                renderBookmarksList();
            }
            if (bookmarksBtn) {
                bookmarksBtn.classList.add('active-bookmark-route');
            }
            if (pageTitle) {
                pageTitle.classList.add('hidden');
            }
            if (headerBackButton) {
                headerBackButton.classList.remove('hidden');
            }
            if (slogan) {
                slogan.classList.add('opacity-0', 'pointer-events-none');
            }
            document.title = 'ブックマーク | 愛媛大学ミュージアムポータルサイト';
        } else if (isArchivesRoute()) {
            portalGrid.classList.add('hidden');
            if (highlightsView) {
                highlightsView.classList.add('hidden');
            }
            if (bookmarksView) {
                bookmarksView.classList.add('hidden');
            }
            if (highlightsBtn) {
                highlightsBtn.classList.remove('active-bookmark-route');
            }
            if (bookmarksBtn) {
                bookmarksBtn.classList.remove('active-bookmark-route');
            }
            if (archivesView) {
                archivesView.classList.remove('hidden');
                renderArchivesList();
            }
            if (archivesBtn) {
                archivesBtn.classList.add('active-bookmark-route');
            }
            if (pageTitle) {
                pageTitle.classList.add('hidden');
            }
            if (headerBackButton) {
                headerBackButton.classList.remove('hidden');
            }
            if (slogan) {
                slogan.classList.add('opacity-0', 'pointer-events-none');
            }
            document.title = 'アーカイブ | 愛媛大学ミュージアムポータルサイト';
        } else {
            portalGrid.classList.remove('hidden');
            if (highlightsView) {
                highlightsView.classList.add('hidden');
            }
            if (bookmarksView) {
                bookmarksView.classList.add('hidden');
            }
            if (archivesView) {
                archivesView.classList.add('hidden');
            }
            if (highlightsBtn) {
                highlightsBtn.classList.remove('active-bookmark-route');
            }
            if (bookmarksBtn) {
                bookmarksBtn.classList.remove('active-bookmark-route');
            }
            if (archivesBtn) {
                archivesBtn.classList.remove('active-bookmark-route');
            }
            if (pageTitle) {
                pageTitle.classList.remove('hidden');
            }
            if (headerBackButton) {
                headerBackButton.classList.add('hidden');
            }
            if (slogan) {
                slogan.classList.remove('opacity-0', 'pointer-events-none');
            }
            document.title = '愛媛大学ミュージアムポータルサイト';
            updateAllCardBookmarkStates();
        }
    }

    function navigateTo(path) {
        if (window.location.pathname !== path) {
            window.history.pushState(null, '', path);
            renderRoute();
        }
    }

    window.addEventListener('popstate', () => {
        renderRoute();
    });

    function renderHighlightsList() {
        const container = document.getElementById('highlights-list-container');
        if (!container) return;

        const highlightsCards = getHighlightsCards();

        if (highlightsCards.length === 0) {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center text-center py-10 px-4">
                    <div class="w-14 h-14 rounded-full bg-slate-800/80 border border-slate-700/60 flex items-center justify-center mb-3 text-amber-400">
                        <svg viewBox="0 0 24 24" class="w-7 h-7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                        </svg>
                    </div>
                    <p class="text-sm font-medium text-slate-200 mb-1">ハイライトされたコンテンツはありません</p>
                    <p class="text-xs text-slate-400 max-w-xs mb-5 leading-relaxed">
                        管理者による厳選・おすすめコンテンツが登録されると、ここに一覧表示されます。
                    </p>
                    <button
                        type="button"
                        id="highlights-empty-back-btn"
                        class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-950/70 hover:bg-cyan-900/90 border border-cyan-500/50 hover:border-cyan-400 text-xs font-medium text-cyan-200 hover:text-white transition-all cursor-pointer"
                    >
                        <svg viewBox="0 0 24 24" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="19" y1="12" x2="5" y2="12"></line>
                            <polyline points="12 19 5 12 12 5"></polyline>
                        </svg>
                        <span>ポータルへ戻る</span>
                    </button>
                </div>
            `;
            const emptyBackBtn = document.getElementById('highlights-empty-back-btn');
            if (emptyBackBtn) {
                emptyBackBtn.addEventListener('click', () => navigateTo('/'));
            }
            return;
        }

        const bookmarks = getStoredBookmarks();
        const bookmarkedIdSet = new Set(bookmarks.map(b => b.id || b.cardId || (b.slot ? `card${b.slot}` : '')));

        let html = '';
        highlightsCards.forEach(card => {
            const cardId = card.id;
            const title = card.title || cardId;
            const url = card.url || '#';
            const colorTheme = card.colorTheme || 'cyan';
            const svgCode = card.svgCode || '';

            const theme = themeMap[colorTheme] || themeMap['cyan'];
            const cleanTitle = title.replace(/<br\s*\/?>/gi, ' ');
            const iconSvg = svgCode && svgCode.trim() ? scopeSvgIds(svgCode, 'hl_' + cardId) : defaultIconSvg;
            const targetUrl = url;
            const isExternal = targetUrl.startsWith('http');
            const isBookmarked = bookmarkedIdSet.has(cardId);

            html += `
                <div class="cosmic-card p-3 sm:p-4 flex items-center justify-between gap-3 text-left w-full group relative" data-highlight-item-id="${cardId}" style="--card-glow-color: ${theme.hex}; --card-glow-rgb: ${theme.rgb};">
                    <a href="${targetUrl}" ${isExternal ? 'target="_blank" rel="noopener noreferrer"' : ''} class="flex items-center gap-3 flex-1 min-w-0">
                        <div class="plasma-sphere ${theme.grad ? 'bg-gradient-to-br ' + theme.grad : 'bg-slate-700'} w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full">
                            ${iconSvg}
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 mb-0.5 flex-wrap">
                                <h2 class="text-sm font-medium text-slate-100 group-hover:text-amber-200 transition-colors truncate">${cleanTitle}</h2>
                            </div>
                            <span class="text-[11px] text-slate-400 line-clamp-3 break-all mt-0.5 leading-snug">${targetUrl}</span>
                        </div>
                    </a>
                    <div class="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                        <button
                            type="button"
                            class="highlight-bookmark-btn p-1.5 rounded-lg border-none transition-all cursor-pointer ${isBookmarked ? 'is-bookmarked' : 'bg-slate-800/70 text-slate-400'}"
                            data-card-id="${cardId}"
                            aria-label="${cleanTitle} (ID: ${cardId}) のブックマークを切り替え"
                            title="${isBookmarked ? 'ブックマーク解除' : 'ブックマークに追加'} (ID: ${cardId})"
                        >
                            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="${isBookmarked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.75">
                                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        const highlightBookmarkBtns = container.querySelectorAll('.highlight-bookmark-btn');
        highlightBookmarkBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const cardId = btn.dataset.cardId;
                toggleCardBookmark(cardId, null);
                renderHighlightsList();
            });
        });

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    function renderArchivesList() {
        const container = document.getElementById('archives-list-container');
        if (!container) return;

        const archivedCards = allLoadedCards.filter(c => c.position === 'archived');

        if (archivedCards.length === 0) {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center text-center py-10 px-4">
                    <div class="w-14 h-14 rounded-full bg-slate-800/80 border border-slate-700/60 flex items-center justify-center mb-3 text-purple-400">
                        <svg viewBox="0 0 24 24" class="w-7 h-7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="21 8 21 21 3 21 3 8"></polyline>
                            <rect x="1" y="3" width="22" height="5"></rect>
                            <line x1="10" y1="12" x2="14" y2="12"></line>
                        </svg>
                    </div>
                    <p class="text-sm font-medium text-slate-200 mb-1">アーカイブされたカードはありません</p>
                    <p class="text-xs text-slate-400 max-w-xs mb-5 leading-relaxed">
                        管理画面（/admin/edit-portal.html）でカードの表示位置を「Archived」に設定すると、ここに一覧表示されます。
                    </p>
                    <button
                        type="button"
                        id="archives-empty-back-btn"
                        class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-950/70 hover:bg-cyan-900/90 border border-cyan-500/50 hover:border-cyan-400 text-xs font-medium text-cyan-200 hover:text-white transition-all cursor-pointer"
                    >
                        <svg viewBox="0 0 24 24" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="19" y1="12" x2="5" y2="12"></line>
                            <polyline points="12 19 5 12 12 5"></polyline>
                        </svg>
                        <span>ポータルへ戻る</span>
                    </button>
                </div>
            `;
            const emptyBackBtn = document.getElementById('archives-empty-back-btn');
            if (emptyBackBtn) {
                emptyBackBtn.addEventListener('click', () => navigateTo('/'));
            }
            return;
        }

        const bookmarks = getStoredBookmarks();
        const bookmarkedIdSet = new Set(bookmarks.map(b => b.id || b.cardId || (b.slot ? `card${b.slot}` : '')));

        let html = '';
        archivedCards.forEach(card => {
            const cardId = card.id;
            const title = card.title || cardId;
            const url = card.url || '#';
            const colorTheme = card.colorTheme || 'cyan';
            const svgCode = card.svgCode || '';

            const theme = themeMap[colorTheme] || themeMap['cyan'];
            const cleanTitle = title.replace(/<br\s*\/?>/gi, ' ');
            const iconSvg = svgCode && svgCode.trim() ? scopeSvgIds(svgCode, 'arch_' + cardId) : defaultIconSvg;
            const targetUrl = url;
            const isExternal = targetUrl.startsWith('http');
            const isBookmarked = bookmarkedIdSet.has(cardId);

            html += `
                <div class="cosmic-card p-3 sm:p-4 flex items-center justify-between gap-3 text-left w-full group relative" data-archive-item-id="${cardId}" style="--card-glow-color: ${theme.hex}; --card-glow-rgb: ${theme.rgb};">
                    <a href="${targetUrl}" ${isExternal ? 'target="_blank" rel="noopener noreferrer"' : ''} class="flex items-center gap-3 flex-1 min-w-0">
                        <div class="plasma-sphere ${theme.grad ? 'bg-gradient-to-br ' + theme.grad : 'bg-slate-700'} w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full">
                            ${iconSvg}
                        </div>
                        <div class="flex-1 min-w-0">
                            <h2 class="text-sm font-medium text-slate-100 group-hover:text-cyan-200 transition-colors truncate mb-0.5">${cleanTitle}</h2>
                            <span class="text-[11px] text-slate-400 truncate block mt-0.5">${targetUrl}</span>
                        </div>
                    </a>
                    <div class="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                        <button
                            type="button"
                            class="archive-bookmark-btn p-1.5 rounded-lg border-none transition-all cursor-pointer ${isBookmarked ? 'is-bookmarked' : 'bg-slate-800/70 text-slate-400'}"
                            data-card-id="${cardId}"
                            aria-label="${cleanTitle} (ID: ${cardId}) のブックマークを切り替え"
                            title="${isBookmarked ? 'ブックマーク解除' : 'ブックマークに追加'} (ID: ${cardId})"
                        >
                            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="${isBookmarked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.75">
                                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        const archiveBookmarkBtns = container.querySelectorAll('.archive-bookmark-btn');
        archiveBookmarkBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const cardId = btn.dataset.cardId;
                toggleCardBookmark(cardId, null);
                renderArchivesList();
            });
        });

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    function renderBookmarksList() {
        const container = document.getElementById('bookmarks-list-container');
        if (!container) return;

        const bookmarks = getStoredBookmarks();

        if (bookmarks.length === 0) {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center text-center py-10 px-4">
                    <div class="w-14 h-14 rounded-full bg-slate-800/80 border border-slate-700/60 flex items-center justify-center mb-3 text-slate-400">
                        <svg viewBox="0 0 24 24" class="w-7 h-7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                        </svg>
                    </div>
                    <p class="text-sm font-medium text-slate-200 mb-1">ブックマークが登録されていません</p>
                    <p class="text-xs text-slate-400 max-w-xs mb-5 leading-relaxed">
                        ポータル画面の各カード右上にあるブックマークアイコン（<svg viewBox="0 0 24 24" class="inline-block w-3.5 h-3.5 -mt-0.5 text-slate-300 align-middle" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>）をタップすると、よく使うコンテンツをここに保存できます。
                    </p>
                    <button
                        type="button"
                        id="empty-state-back-btn"
                        class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-950/70 hover:bg-cyan-900/90 border border-cyan-500/50 hover:border-cyan-400 text-xs font-medium text-cyan-200 hover:text-white transition-all cursor-pointer"
                    >
                        <svg viewBox="0 0 24 24" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="19" y1="12" x2="5" y2="12"></line>
                            <polyline points="12 19 5 12 12 5"></polyline>
                        </svg>
                        <span>ポータルへ戻る</span>
                    </button>
                </div>
            `;
            const emptyBackBtn = document.getElementById('empty-state-back-btn');
            if (emptyBackBtn) {
                emptyBackBtn.addEventListener('click', () => navigateTo('/'));
            }
            return;
        }

        let html = '';
        bookmarks.forEach(bm => {
            const cardId = bm.id || bm.cardId || (bm.slot ? `card${bm.slot}` : 'unknown');
            const liveInfo = getCardInfoByIdOrSlot(cardId, bm.slot);
            const title = (liveInfo && liveInfo.title) || bm.title || cardId;
            const url = (liveInfo && liveInfo.url) || bm.url || '#';
            const colorTheme = (liveInfo && liveInfo.colorTheme) || bm.colorTheme || 'cyan';
            const svgCode = (liveInfo && liveInfo.svgCode) || bm.svgCode || '';

            const theme = themeMap[colorTheme] || themeMap['cyan'];
            const cleanTitle = title.replace(/<br\s*\/?>/gi, ' ');
            const iconSvg = svgCode && svgCode.trim() ? scopeSvgIds(svgCode, 'bm_' + cardId) : defaultIconSvg;
            const targetUrl = url;
            const isExternal = targetUrl.startsWith('http');

            html += `
                <div class="cosmic-card p-3 sm:p-4 flex items-center justify-between gap-3 text-left w-full group relative" data-bookmark-item-id="${cardId}" data-bookmark-item-slot="${bm.slot || ''}" style="--card-glow-color: ${theme.hex}; --card-glow-rgb: ${theme.rgb};">
                    <a href="${targetUrl}" ${isExternal ? 'target="_blank" rel="noopener noreferrer"' : ''} class="flex items-center gap-3 flex-1 min-w-0">
                        <div class="plasma-sphere ${theme.grad ? 'bg-gradient-to-br ' + theme.grad : 'bg-slate-700'} w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full">
                            ${iconSvg}
                        </div>
                        <div class="flex-1 min-w-0">
                            <h2 class="text-sm font-medium text-slate-100 group-hover:text-cyan-200 transition-colors truncate mb-0.5">${cleanTitle}</h2>
                            <span class="text-[11px] text-slate-400 truncate block mt-0.5">${targetUrl}</span>
                        </div>
                    </a>
                    <div class="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                        <button
                            type="button"
                            class="remove-bookmark-btn is-bookmarked p-1.5 rounded-lg border-none transition-all cursor-pointer"
                            data-card-id="${cardId}"
                            data-slot="${bm.slot || ''}"
                            data-title="${cleanTitle.replace(/"/g, '&quot;')}"
                            aria-label="${cleanTitle} (ID: ${cardId}) のブックマークを解除"
                            title="ブックマーク解除 (ID: ${cardId})"
                        >
                            <svg class="w-4 h-4 transition-colors" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.75">
                                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        const removeBtns = container.querySelectorAll('.remove-bookmark-btn');
        removeBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const cardId = btn.dataset.cardId;
                const slot = btn.dataset.slot;
                const title = btn.dataset.title;
                openRemoveBookmarkDialog({ cardId, slot, title });
            });
        });

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    let pendingRemoveBookmark = null;

    function openRemoveBookmarkDialog({ cardId, slot, title }) {
        const dialog = document.getElementById('bookmark-remove-dialog');
        const titleEl = document.getElementById('bookmark-remove-target-title');
        const idEl = document.getElementById('bookmark-remove-target-id');
        const cancelBtn = document.getElementById('bookmark-remove-cancel-btn');

        if (!dialog) {
            toggleCardBookmark(cardId, slot);
            return;
        }

        pendingRemoveBookmark = { cardId, slot, title };

        if (titleEl) {
            titleEl.textContent = title || cardId;
        }
        if (idEl) {
            idEl.textContent = `ID: ${cardId}`;
        }

        dialog.classList.remove('hidden');
        if (cancelBtn) {
            cancelBtn.focus();
        }
    }

    function closeRemoveBookmarkDialog() {
        const dialog = document.getElementById('bookmark-remove-dialog');
        if (dialog) {
            dialog.classList.add('hidden');
        }
        pendingRemoveBookmark = null;
    }

    function confirmRemoveBookmark() {
        if (!pendingRemoveBookmark) return;
        const { cardId, slot } = pendingRemoveBookmark;
        closeRemoveBookmarkDialog();
        toggleCardBookmark(cardId, slot);
    }

    function initRemoveBookmarkDialog() {
        const dialog = document.getElementById('bookmark-remove-dialog');
        const cancelBtn = document.getElementById('bookmark-remove-cancel-btn');
        const confirmBtn = document.getElementById('bookmark-remove-confirm-btn');

        if (cancelBtn) {
            cancelBtn.addEventListener('click', (e) => {
                e.preventDefault();
                closeRemoveBookmarkDialog();
            });
        }

        if (confirmBtn) {
            confirmBtn.addEventListener('click', (e) => {
                e.preventDefault();
                confirmRemoveBookmark();
            });
        }

        if (dialog) {
            dialog.addEventListener('click', (e) => {
                if (e.target === dialog) {
                    closeRemoveBookmarkDialog();
                }
            });
        }

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && dialog && !dialog.classList.contains('hidden')) {
                closeRemoveBookmarkDialog();
            }
        });
    }

    // --- UTM Bookmark Added & Navigation Confirmation Dialog ---
    let pendingUtmTargetUrl = null;

    function isFullFqdnUrl(url) {
        if (!url || typeof url !== 'string') return false;
        const trimmed = url.trim();
        return /^(?:[a-z+]+:)?\/\//i.test(trimmed);
    }

    function showUtmBookmarkDialog(cardInfo, isAlreadyBookmarked) {
        const dialog = document.getElementById('bookmark-utm-dialog');
        if (!dialog) return;

        const titleEl = document.getElementById('bookmark-utm-dialog-title');
        const descEl = document.getElementById('bookmark-utm-dialog-desc');
        const iconContainer = document.getElementById('bookmark-utm-icon-container');
        const targetTitleEl = document.getElementById('bookmark-utm-target-title');
        const targetIdEl = document.getElementById('bookmark-utm-target-id');
        const targetUrlEl = document.getElementById('bookmark-utm-target-url-preview');
        const openBtnText = document.getElementById('bookmark-utm-open-btn-text');
        const externalIcon = document.getElementById('bookmark-utm-open-btn-external-icon');
        const stayBtn = document.getElementById('bookmark-utm-stay-btn');

        const cardTitle = (cardInfo.title || cardInfo.id || '').replace(/<br\s*\/?>/gi, ' ').trim();
        const cardUrl = cardInfo.url || '#';
        pendingUtmTargetUrl = cardUrl;

        if (targetTitleEl) targetTitleEl.textContent = cardTitle;
        if (targetIdEl) targetIdEl.textContent = `ID: ${cardInfo.id}`;
        if (targetUrlEl) targetUrlEl.textContent = cardUrl;

        const isFqdn = isFullFqdnUrl(cardUrl);

        if (isAlreadyBookmarked) {
            if (titleEl) titleEl.textContent = 'すでにブックマークに登録されています';
            if (descEl) descEl.textContent = 'このアイテムはすでにブックマーク登録済みです。リンク先を開きますか？';
            if (iconContainer) {
                iconContainer.className = 'w-9 h-9 rounded-full bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center flex-shrink-0 text-cyan-400 aspect-square';
            }
        } else {
            if (titleEl) titleEl.textContent = 'ブックマークに追加しました';
            if (descEl) descEl.textContent = 'このアイテムをブックマークに追加しました。今すぐリンク先を開きますか？';
            if (iconContainer) {
                iconContainer.className = 'w-9 h-9 rounded-full bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center flex-shrink-0 text-emerald-400 aspect-square';
            }
        }

        if (isFqdn) {
            if (openBtnText) openBtnText.textContent = '新しいウィンドウで開く';
            if (externalIcon) externalIcon.classList.remove('hidden');
        } else {
            if (openBtnText) openBtnText.textContent = 'ページを開く';
            if (externalIcon) externalIcon.classList.add('hidden');
        }

        dialog.classList.remove('hidden');
        if (stayBtn) {
            stayBtn.focus();
        }
    }

    function closeUtmBookmarkDialog() {
        const dialog = document.getElementById('bookmark-utm-dialog');
        if (dialog) {
            dialog.classList.add('hidden');
        }
        pendingUtmTargetUrl = null;
    }

    function executeUtmTargetNavigation() {
        const url = pendingUtmTargetUrl;
        closeUtmBookmarkDialog();

        if (!url || url === '#' || url.trim() === '') {
            return;
        }

        if (isFullFqdnUrl(url)) {
            window.open(url, '_blank', 'noopener,noreferrer');
        } else {
            if (url.startsWith('#')) {
                window.location.hash = url;
            } else {
                window.location.href = url;
            }
        }
    }

    function initUtmBookmarkDialog() {
        const dialog = document.getElementById('bookmark-utm-dialog');
        const stayBtn = document.getElementById('bookmark-utm-stay-btn');
        const openBtn = document.getElementById('bookmark-utm-open-btn');

        if (stayBtn) {
            stayBtn.addEventListener('click', (e) => {
                e.preventDefault();
                closeUtmBookmarkDialog();
            });
        }

        if (openBtn) {
            openBtn.addEventListener('click', (e) => {
                e.preventDefault();
                executeUtmTargetNavigation();
            });
        }

        if (dialog) {
            dialog.addEventListener('click', (e) => {
                if (e.target === dialog) {
                    closeUtmBookmarkDialog();
                }
            });
        }

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && dialog && !dialog.classList.contains('hidden')) {
                closeUtmBookmarkDialog();
            }
        });
    }

    function resetSlot(slotElement) {
        slotElement.classList.add('invisible');
        slotElement.classList.remove('visible');
        slotElement.classList.add('default-text-color');
        slotElement.classList.add('is-loading');
        slotElement.setAttribute('aria-busy', 'true');
        delete slotElement.dataset.cardId;
        slotElement.style.removeProperty('--card-glow-color');
        slotElement.style.removeProperty('--card-glow-rgb');

        const btn = slotElement.querySelector('.card-bookmark-btn');
        if (btn) {
            delete btn.dataset.cardId;
        }

        const iconContainer = slotElement.querySelector('.plasma-sphere');
        if (iconContainer) {
            iconContainer.classList.remove(...textClassesToRemove);
            iconContainer.classList.add('text-slate-500');

            iconContainer.classList.remove(...gradClassesToRemove);
            iconContainer.classList.add('bg-slate-500');
            iconContainer.innerHTML = defaultIconSvg;
        }

        const spanElement = slotElement.querySelector('.card-title-text') || slotElement.querySelector('span');
        if (spanElement) {
            spanElement.classList.remove('text-slate-500');
            spanElement.classList.add('text-slate-200');
            spanElement.innerHTML = '';
        }

        slotElement.href = '#';
    }

    function resetAllSlots() {
        for (let slot = 1; slot <= 8; slot++) {
            const slotElement = portalGrid.querySelector(`[data-slot="${slot}"]`);
            if (slotElement) {
                resetSlot(slotElement);
            }
        }
    }

    function renderDefaultPortalCards() {
        allLoadedCards = [...defaultPortalCards];
        resetAllSlots();
        defaultPortalCards.forEach((defaultCard) => {
            currentCardsData[defaultCard.position] = { ...defaultCard, svgCode: '' };
            const slotElement = portalGrid.querySelector(`[data-slot="${defaultCard.position}"]`);
            if (!slotElement) return;

            slotElement.classList.remove('invisible');
            slotElement.classList.add('visible');
            slotElement.classList.remove('is-loading');
            slotElement.removeAttribute('aria-busy');
            slotElement.href = defaultCard.url;
            slotElement.dataset.cardId = defaultCard.id;

            if (defaultCard.colorTheme && themeMap[defaultCard.colorTheme]) {
                const theme = themeMap[defaultCard.colorTheme];
                if (theme.hex && theme.rgb) {
                    slotElement.style.setProperty('--card-glow-color', theme.hex);
                    slotElement.style.setProperty('--card-glow-rgb', theme.rgb);
                }
            }

            const btn = slotElement.querySelector('.card-bookmark-btn');
            if (btn) {
                btn.dataset.cardId = defaultCard.id;
            }

            const spanElement = slotElement.querySelector('.card-title-text') || slotElement.querySelector('span');
            if (spanElement) {
                spanElement.innerHTML = defaultCard.title;
            }
        });

        updateAllCardBookmarkStates();
        updateArchivesBadge();
        updateHighlightsBadge();

        if (isArchivesRoute()) {
            renderArchivesList();
        }
        if (isHighlightsRoute()) {
            renderHighlightsList();
        }

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    renderDefaultPortalCards();

    // Attach click listeners to card bookmark buttons
    const cardBookmarkBtns = portalGrid.querySelectorAll('.card-bookmark-btn');
    cardBookmarkBtns.forEach(btn => {
        const handleBookmarkClick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const slot = btn.dataset.bookmarkSlot;
            const cardId = btn.dataset.cardId || (slot && currentCardsData[slot]?.id) || (slot ? `card${slot}` : '');
            toggleCardBookmark(cardId, slot);
        };
        btn.addEventListener('click', handleBookmarkClick);
        btn.addEventListener('keydown', (e) => {
            if (e.key === ' ' || e.key === 'Enter') {
                handleBookmarkClick(e);
            }
        });
    });

    // Wire up header Highlights button
    const headerHighlightsBtn = document.getElementById('header-highlights-button');
    if (headerHighlightsBtn) {
        headerHighlightsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (isHighlightsRoute()) {
                navigateTo('/');
            } else {
                navigateTo('/highlights');
            }
        });
    }

    // Wire up header Bookmarks button
    const headerBookmarksBtn = document.getElementById('header-bookmarks-button');
    if (headerBookmarksBtn) {
        headerBookmarksBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (isBookmarksRoute()) {
                navigateTo('/');
            } else {
                navigateTo('/bookmarks');
            }
        });
    }

    // Wire up header Archives button
    const headerArchivesBtn = document.getElementById('header-archives-button');
    if (headerArchivesBtn) {
        headerArchivesBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (isArchivesRoute()) {
                navigateTo('/');
            } else {
                navigateTo('/archives');
            }
        });
    }

    // Wire up header back button
    const headerBackBtn = document.getElementById('header-back-button');
    if (headerBackBtn) {
        headerBackBtn.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo('/');
        });
    }

    // Wire up back button in highlights view (if present)
    const highlightsBackBtn = document.getElementById('highlights-back-button');
    if (highlightsBackBtn) {
        highlightsBackBtn.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo('/');
        });
    }

    // Wire up back button in bookmarks view
    const bookmarksBackBtn = document.getElementById('bookmarks-back-button');
    if (bookmarksBackBtn) {
        bookmarksBackBtn.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo('/');
        });
    }

    // Wire up back button in archives view
    const archivesBackBtn = document.getElementById('archives-back-button');
    if (archivesBackBtn) {
        archivesBackBtn.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo('/');
        });
    }

    // Title click returns to portal when in highlights, bookmarks or archives view
    const headerMainTitle = document.getElementById('header-main-title');
    if (headerMainTitle) {
        headerMainTitle.addEventListener('click', () => {
            if (isHighlightsRoute() || isBookmarksRoute() || isArchivesRoute()) {
                navigateTo('/');
            }
        });
    }

    // Initialize remove bookmark confirmation dialog
    initRemoveBookmarkDialog();
    initUtmBookmarkDialog();

    // Initialize SPA route based on initial URL
    renderRoute();

    function processUtmSourceBookmark() {
        const params = new URLSearchParams(window.location.search);
        const utmSource = params.get('utm_source');
        if (utmSource) {
            // Force navigate to top page if on another route
            if (isBookmarksRoute() || isHighlightsRoute() || isArchivesRoute()) {
                navigateTo('/');
            }
            
            const bookmarks = getStoredBookmarks();
            const alreadyBookmarked = bookmarks.some(b => (b.id && b.id === utmSource) || (b.cardId && b.cardId === utmSource));
            
            const info = getCardInfoByIdOrSlot(utmSource, null);
            if (info) {
                if (!alreadyBookmarked) {
                    toggleCardBookmark(utmSource, null);
                }
                showUtmBookmarkDialog(info, alreadyBookmarked);
            }
            
            // Clean up URL to prevent re-triggering on reload
            params.delete('utm_source');
            const newSearch = params.toString();
            const newUrl = window.location.pathname + (newSearch ? '?' + newSearch : '') + window.location.hash;
            window.history.replaceState(null, '', newUrl);
        }
    }

    if (typeof firebase === 'undefined') {
        processUtmSourceBookmark();
        return;
    }
    const db = firebase.firestore();

    // Try to get data from cache first for fast loading
    db.collection("portalCards").get({ source: 'cache' }).then((querySnapshot) => {
        if (!querySnapshot.empty) {
            renderPortalCards(querySnapshot);
        }
    }).catch((error) => {
        console.log("Failed to load from cache:", error);
    });

    // Then try to get fresh data from server
    db.collection("portalCards").get({ source: 'server' }).then((querySnapshot) => {
        if (!querySnapshot.empty) {
            renderPortalCards(querySnapshot);
        } else {
            renderDefaultPortalCards();
        }
    }).catch((error) => {
        console.log("Failed to load from server:", error);
    }).finally(() => {
        processUtmSourceBookmark();
    });

    function renderPortalCards(querySnapshot) {
        resetAllSlots();
        allLoadedCards = [];

        querySnapshot.forEach((doc) => {
            const cardData = doc.data();
            const docId = doc.id;

            // Determine position. Backward compatibility: if no position is set, try to infer from ID (e.g. "card1" -> 1)
            // Note: position === null means it was explicitly set to hidden, so only fallback if undefined.
            let position = cardData.position;
            if (position === undefined) {
                const match = docId.match(/^card(\d+)$/);
                if (match) {
                    position = parseInt(match[1], 10);
                }
            } else if (position !== 'archived') {
                const num = parseInt(position, 10);
                position = (!isNaN(num) && num >= 1 && num <= 8) ? num : null;
            }

            const cardRecord = {
                id: docId,
                position,
                title: cardData.title || '',
                url: cardData.url || '#',
                colorTheme: cardData.colorTheme || 'cyan',
                svgCode: cardData.svgCode || '',
                isHighlight: cardData.isHighlight === true || cardData.highlight === true
            };
            allLoadedCards.push(cardRecord);

            if (!position || typeof position !== 'number' || position < 1 || position > 8) {
                return; // Do not render if position is not between 1 and 8
            }

            const existingLink = portalGrid.querySelector(`[data-slot="${position}"]`);

            if (existingLink) {
                currentCardsData[position] = cardRecord;

                existingLink.dataset.cardId = docId;
                const btn = existingLink.querySelector('.card-bookmark-btn');
                if (btn) {
                    btn.dataset.cardId = docId;
                }

                // Make the slot visible since it has data
                existingLink.classList.remove('invisible');
                existingLink.classList.add('visible');
                existingLink.classList.remove('is-loading');
                existingLink.removeAttribute('aria-busy');

                // Apply CSS variables for the color theme
                if (cardData.colorTheme && themeMap[cardData.colorTheme]) {
                    const theme = themeMap[cardData.colorTheme];
                    if (theme.hex && theme.rgb) {
                        existingLink.style.setProperty('--card-glow-color', theme.hex);
                        existingLink.style.setProperty('--card-glow-rgb', theme.rgb);
                    }
                }

                // Update link
                if (cardData.url) {
                    existingLink.href = cardData.url;
                }

                // Update title
                if (cardData.title) {
                    const spanElement = existingLink.querySelector('span');
                    if (spanElement) {
                        // The original HTML has <br> tags in some titles for wrapping,
                        // If firestore doesn't have it, we just set the text.
                        // Ideally firestore title doesn't break UI layout.
                        spanElement.innerHTML = cardData.title;
                    }
                }

                // Update icon
                const iconContainer = existingLink.querySelector('.plasma-sphere');
                if (iconContainer && cardData.svgCode) {
                    iconContainer.innerHTML = scopeSvgIds(cardData.svgCode, 'portal_' + docId);

                    // Add 'text-white icon-glow' to the svg if not present to match styling
                    const svgElement = iconContainer.querySelector('svg');
                    if (svgElement) {
                        svgElement.classList.add('text-white', 'icon-glow');
                    }
                }

                // Update theme color
                if (cardData.colorTheme && themeMap[cardData.colorTheme]) {
                    const theme = themeMap[cardData.colorTheme];

                    // Remove default-text-color to show data is loaded
                    existingLink.classList.remove('default-text-color');

                    // Apply theme text color to the plasma sphere to ensure currentColor glow works properly
                    if (iconContainer) {
                        iconContainer.classList.remove(...textClassesToRemove);
                        iconContainer.classList.add(theme.text);
                    }

                    // Ensure title text remains white/slate-200
                    const spanElement = existingLink.querySelector('span');
                    if (spanElement) {
                        spanElement.classList.remove('text-slate-500'); // If there were any fallback
                        spanElement.classList.add('text-slate-200'); // Explicitly set to light color
                    }

                    // Update the gradient on the .plasma-sphere
                    if (iconContainer) {
                        // Remove existing gradients and backgrounds
                        iconContainer.classList.remove(...gradClassesToRemove);

                        // Add new gradients
                        iconContainer.classList.add('bg-gradient-to-br');
                        theme.grad.split(' ').forEach(cls => iconContainer.classList.add(cls));
                    }
                }
            }
        });

        updateAllCardBookmarkStates();
        updateArchivesBadge();
        updateHighlightsBadge();

        if (isArchivesRoute()) {
            renderArchivesList();
        }
        if (isHighlightsRoute()) {
            renderHighlightsList();
        }
        if (isBookmarksRoute()) {
            renderBookmarksList();
        }

        // Re-initialize any lucide icons that might have been loaded
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
});

/**
 * Log the current orientation to the console for debugging
 */
const checkOrientation = () => {
  const isLandscape = window.matchMedia("(orientation: landscape)").matches;
  console.log(`[DEBUG] Current Orientation: ${isLandscape ? "Landscape" : "Portrait"} (Viewport: ${window.innerWidth}x${window.innerHeight})`);
};

// Initial check and listen for resize
checkOrientation();
window.addEventListener("resize", checkOrientation);

// Service Worker Registration
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("sw.js")
      .then((reg) => {
        console.log("Service worker registered.", reg);
        reg.update();
      })
      .catch((err) => console.log("Service worker registration failed: ", err));
  });
}

// Cache Clear & Hard Reload (Bottom-left refresh pictogram)
const cacheReloadBtn = document.getElementById('cache-reload-button');
if (cacheReloadBtn) {
  let isReloading = false;
  cacheReloadBtn.addEventListener('click', async () => {
    if (isReloading) return;
    isReloading = true;
    cacheReloadBtn.classList.add('reloading');
    cacheReloadBtn.setAttribute('aria-busy', 'true');
    cacheReloadBtn.disabled = true;

    try {
      // 1. Delete all CacheStorage entries
      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map((key) => caches.delete(key)));
        console.log('[CacheReload] Cleared caches:', cacheKeys);
      }

      // 2. Unregister all service workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((reg) => reg.unregister()));
        console.log('[CacheReload] Unregistered service workers:', registrations.length);
      }

      // 3. Clear session storage
      try {
        sessionStorage.clear();
      } catch (e) {
        // Ignore session storage error
      }
    } catch (err) {
      console.warn('[CacheReload] Cache cleanup error:', err);
    }

    // 4. Force reload with cache-busting timestamp
    const targetUrl = new URL(window.location.href);
    targetUrl.searchParams.set('_t', Date.now().toString());
    window.location.replace(targetUrl.href);
  });
}

// Long Press for Admin Access (2-second press on bottom-right tool pictogram)
const adminTrigger = document.getElementById('admin-trigger-button');
if (adminTrigger) {
  let longPressTimer = null;
  let isNavigating = false;
  let startX = 0;
  let startY = 0;
  let activePointerId = null;
  const pressDuration = 2000; // 2 seconds
  const maxMoveThresholdPx = 12; // Cancel if finger/pointer moves more than 12px

  const cancelPress = (pointerId) => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    adminTrigger.classList.remove('pressing');
    const pid = pointerId !== undefined ? pointerId : activePointerId;
    if (pid !== null && adminTrigger.hasPointerCapture && adminTrigger.hasPointerCapture(pid)) {
      try {
        adminTrigger.releasePointerCapture(pid);
      } catch (e) {
        // Ignore if pointer capture release fails
      }
    }
    activePointerId = null;
  };

  const startPress = (e, clientX, clientY, pointerId) => {
    if (isNavigating) return;
    if (longPressTimer) cancelPress();

    startX = clientX;
    startY = clientY;
    activePointerId = pointerId !== undefined ? pointerId : null;

    adminTrigger.classList.add('pressing');
    longPressTimer = setTimeout(() => {
      isNavigating = true;
      cancelPress();
      adminTrigger.classList.add('navigating');
      adminTrigger.setAttribute('aria-busy', 'true');
      adminTrigger.disabled = true;

      // Navigate to admin
      window.location.assign('/admin/');
    }, pressDuration);
  };

  // Pointer Events (unified touch, mouse, and pen)
  adminTrigger.addEventListener('pointerdown', (e) => {
    if (isNavigating) return;
    // Only primary button (left click) or touch/pen contact
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    try {
      adminTrigger.setPointerCapture(e.pointerId);
    } catch (err) {
      // Ignore if setPointerCapture fails on certain environments
    }

    startPress(e, e.clientX, e.clientY, e.pointerId);
  });

  adminTrigger.addEventListener('pointermove', (e) => {
    if (!longPressTimer) return;
    const dx = Math.abs(e.clientX - startX);
    const dy = Math.abs(e.clientY - startY);
    if (dx > maxMoveThresholdPx || dy > maxMoveThresholdPx) {
      cancelPress(e.pointerId);
    }
  });

  adminTrigger.addEventListener('pointerup', (e) => {
    cancelPress(e.pointerId);
  });

  adminTrigger.addEventListener('pointercancel', (e) => {
    cancelPress(e.pointerId);
  });

  // Always suppress default click & ghost clicks to prevent event bubbling and conflicts
  adminTrigger.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  // Suppress context menu on long press
  adminTrigger.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  // Keyboard accessibility (hold Space or Enter for 2 seconds)
  adminTrigger.addEventListener('keydown', (e) => {
    if (isNavigating) return;
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault(); // Suppress page scroll or native button trigger
      startPress(e, 0, 0, null);
    }
  });

  adminTrigger.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      cancelPress();
    }
  });
}

// Header Action Buttons (Bookmarks & Archives)
const bookmarksBtn = document.getElementById('header-bookmarks-button');
if (bookmarksBtn) {
  bookmarksBtn.addEventListener('click', () => {
    // Custom event or interaction point for bookmarks
    console.log('[Portal] Bookmarks clicked');
  });
}

const archivesBtn = document.getElementById('header-archives-button');
if (archivesBtn) {
  archivesBtn.addEventListener('click', () => {
    // Custom event or interaction point for archives
    console.log('[Portal] Archives clicked');
  });
}


// --- PWA Install Button Logic ---
function initPwaInstallButton() {
  const installBtn = document.getElementById('pwa-install-button');
  if (!installBtn) return;

  let deferredInstallPrompt = null;

  function isStandaloneMode() {
    return ('standalone' in window.navigator && window.navigator.standalone) ||
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches;
  }

  // If already running as PWA, keep hidden
  if (isStandaloneMode()) {
    installBtn.hidden = true;
    return;
  }

  // Listen for the beforeinstallprompt event
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredInstallPrompt = e;

    // Only show the install button if not already in standalone mode
    if (!isStandaloneMode()) {
      installBtn.hidden = false;
    }
  });

  // Handle click on the install button
  installBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;

    // Show the install prompt
    deferredInstallPrompt.prompt();

    try {
      // Wait for the user to respond to the prompt
      const { outcome } = await deferredInstallPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
    } catch (err) {
      console.log("Install prompt error:", err);
    }

    // We've used the prompt, and can't use it again, discard it
    deferredInstallPrompt = null;
    // Hide the button
    installBtn.hidden = true;
  });

  // Listen for the appinstalled event
  window.addEventListener('appinstalled', () => {
    // Hide the button after successful installation
    installBtn.hidden = true;
    deferredInstallPrompt = null;
    console.log('PWA was installed');
  });
}

document.addEventListener('DOMContentLoaded', initPwaInstallButton);


// --- iOS PWA Install Prompt Logic ---
function initIosPwaPrompt() {
  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  function isStandaloneMode() {
    return ('standalone' in window.navigator && window.navigator.standalone) ||
      window.matchMedia('(display-mode: standalone)').matches;
  }

  function trackIosInstallPromptEvent(eventName, payload = {}) {
    // Placeholder for future gtag integration
    // console.log(`[Analytics Placeholder] Event: ${eventName}`, payload);
    if (typeof gtag === 'function') {
      gtag('event', eventName, payload);
    }
  }

  function updateVisitCount() {
    // Increment only once per session
    if (!sessionStorage.getItem('iosPwaSessionVisited')) {
      const rawCount = localStorage.getItem('iosInstallPromptVisitCount');
      const count = rawCount ? Number(rawCount) : 0;
      const nextCount = count + 1;
      localStorage.setItem('iosInstallPromptVisitCount', String(nextCount));
      sessionStorage.setItem('iosPwaSessionVisited', 'true');
      return nextCount;
    }
    return Number(localStorage.getItem('iosInstallPromptVisitCount') || 1);
  }

  function shouldShowPrompt() {
    if (!isIOS()) return false;
    if (isStandaloneMode()) {
      trackIosInstallPromptEvent('ios_install_prompt_standalone_detected');
      return false;
    }

    const dontShowUntil = Number(localStorage.getItem('iosInstallPromptDontShowUntil') || 0);
    if (Date.now() < dontShowUntil) return false;

    const visitCount = updateVisitCount();
    if (visitCount < 2) return false;

    return true;
  }

  if (shouldShowPrompt()) {
    // Delay prompt by 3 seconds
    setTimeout(() => {
      // Double check standalone mode just in case
      if (isStandaloneMode()) return;

      const promptHtml = `
        <div id="ios-pwa-prompt" class="ios-pwa-prompt" role="dialog" aria-label="ホーム画面追加案内">
            <div class="ios-pwa-prompt-header">
                <h2 class="ios-pwa-prompt-title">ホーム画面に追加してすばやく開く</h2>
                <button id="ios-pwa-prompt-close" class="ios-pwa-prompt-close" aria-label="閉じる">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
            </div>
            <p class="ios-pwa-prompt-body">
                Safari の共有メニュー
                <span class="ios-pwa-prompt-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/></svg>
                </span>
                から「ホーム画面に追加」を選択してください。
            </p>
            <div class="ios-pwa-prompt-footer">
                <input type="checkbox" id="ios-pwa-prompt-checkbox" class="ios-pwa-prompt-checkbox">
                <label for="ios-pwa-prompt-checkbox">このお知らせを1ヶ月間表示しない</label>
            </div>
        </div>
      `;

      document.body.insertAdjacentHTML('beforeend', promptHtml);
      const promptEl = document.getElementById('ios-pwa-prompt');

      // Trigger slide up
      // requestAnimationFrame is used to ensure the element is in the DOM before applying the class
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          promptEl.classList.add('show');
        });
      });

      trackIosInstallPromptEvent('ios_install_prompt_impression', {
        page_path: window.location.pathname,
        visit_count: Number(localStorage.getItem('iosInstallPromptVisitCount') || 1)
      });

      document.getElementById('ios-pwa-prompt-close').addEventListener('click', () => {
        promptEl.classList.remove('show');

        const isChecked = document.getElementById('ios-pwa-prompt-checkbox').checked;
        const cooldownDays = isChecked ? 30 : 3;
        const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;
        localStorage.setItem('iosInstallPromptDontShowUntil', String(Date.now() + cooldownMs));

        trackIosInstallPromptEvent('ios_install_prompt_close', {
          dont_show_checked: isChecked,
          cooldown_days: cooldownDays
        });

        // Wait for transition before removing
        setTimeout(() => {
          promptEl.remove();
        }, 500);
      });

    }, 3000);
  } else {
    // Even if not showing, we should update visit count in background
    updateVisitCount();
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initIosPwaPrompt);
