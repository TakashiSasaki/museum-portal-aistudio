// Initialize icons
lucide.createIcons();

// Load Portal Cards from Firestore
document.addEventListener('DOMContentLoaded', () => {
    const portalGrid = document.getElementById('portal-grid');
    if (!portalGrid) return;

    // Default configuration mapping for color themes to tailwind classes
    // Some cards use -700, others use -800, we map them as best effort
    const themeMap = {
        'cyan': { text: 'text-cyan-400', grad: 'from-cyan-500 to-cyan-700' },
        'emerald': { text: 'text-emerald-400', grad: 'from-emerald-500 to-emerald-800' },
        'yellow': { text: 'text-yellow-400', grad: 'from-yellow-400 to-yellow-600' },
        'fuchsia': { text: 'text-fuchsia-400', grad: 'from-fuchsia-500 to-purple-700' },
        'rose': { text: 'text-rose-500', grad: 'from-rose-500 to-rose-800' },
        'orange': { text: 'text-orange-500', grad: 'from-orange-500 to-orange-700' },
        'blue': { text: 'text-blue-500', grad: 'from-blue-500 to-blue-800' },
        'indigo': { text: 'text-indigo-400', grad: 'from-indigo-500 to-indigo-800' }
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

    function getCardInfoByIdOrSlot(cardId, slot) {
        const numericSlot = slot ? Number(slot) : null;
        // 1. Check in current active cards by position
        if (numericSlot && currentCardsData[numericSlot]) {
            return {
                id: cardId || currentCardsData[numericSlot].id || `card${numericSlot}`,
                ...currentCardsData[numericSlot]
            };
        }
        // 2. Check in current active cards by ID
        if (cardId) {
            for (const key in currentCardsData) {
                if (currentCardsData[key] && currentCardsData[key].id === cardId) {
                    return currentCardsData[key];
                }
            }
        }
        // 3. Check in all loaded cards (including archived cards)
        if (cardId) {
            const foundInAll = allLoadedCards.find(c => c.id === cardId);
            if (foundInAll) {
                return {
                    id: cardId,
                    ...foundInAll
                };
            }
        }
        // 4. Check in default cards by ID or position
        const defaultMatch = defaultPortalCards.find(c => (cardId && c.id === cardId) || (numericSlot && c.position === numericSlot));
        if (defaultMatch) {
            return {
                id: cardId || defaultMatch.id,
                ...defaultMatch
            };
        }
        // 5. Fallback to DOM slot
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
    }

    // --- SPA Routing ---
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
        const bookmarksView = document.getElementById('bookmarks-view');
        const archivesView = document.getElementById('archives-view');
        const bookmarksBtn = document.getElementById('header-bookmarks-button');
        const archivesBtn = document.getElementById('header-archives-button');
        const pageTitle = document.getElementById('header-main-title');
        const slogan = document.querySelector('.slogan-text');

        if (isBookmarksRoute()) {
            portalGrid.classList.add('hidden');
            if (archivesView) {
                archivesView.classList.add('hidden');
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
                if (!pageTitle.hasAttribute('data-original-title')) {
                    pageTitle.setAttribute('data-original-title', pageTitle.textContent.trim());
                }
                pageTitle.textContent = 'ブックマーク';
            }
            if (slogan) {
                slogan.classList.add('opacity-0', 'pointer-events-none');
            }
            document.title = 'ブックマーク | 愛媛大学ミュージアムポータルサイト';
        } else if (isArchivesRoute()) {
            portalGrid.classList.add('hidden');
            if (bookmarksView) {
                bookmarksView.classList.add('hidden');
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
                if (!pageTitle.hasAttribute('data-original-title')) {
                    pageTitle.setAttribute('data-original-title', pageTitle.textContent.trim());
                }
                pageTitle.textContent = 'アーカイブ';
            }
            if (slogan) {
                slogan.classList.add('opacity-0', 'pointer-events-none');
            }
            document.title = 'アーカイブ | 愛媛大学ミュージアムポータルサイト';
        } else {
            portalGrid.classList.remove('hidden');
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
            if (pageTitle && pageTitle.hasAttribute('data-original-title')) {
                pageTitle.textContent = pageTitle.getAttribute('data-original-title');
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

    function renderArchivesList() {
        const container = document.getElementById('archives-list-container');
        const countText = document.getElementById('archives-count-text');
        if (!container) return;

        const archivedCards = allLoadedCards.filter(c => c.position === 'archived');
        if (countText) {
            countText.textContent = `${archivedCards.length}件のアーカイブ`;
        }

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
            const iconSvg = svgCode && svgCode.trim() ? svgCode : defaultIconSvg;
            const targetUrl = url;
            const isExternal = targetUrl.startsWith('http');
            const isBookmarked = bookmarkedIdSet.has(cardId);

            html += `
                <div class="cosmic-card p-3 sm:p-4 flex items-center justify-between gap-3 text-left w-full group relative" data-archive-item-id="${cardId}">
                    <a href="${targetUrl}" ${isExternal ? 'target="_blank" rel="noopener noreferrer"' : ''} class="flex items-center gap-3 flex-1 min-w-0">
                        <div class="plasma-sphere ${theme.grad ? 'bg-gradient-to-br ' + theme.grad : 'bg-slate-700'} w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full">
                            ${iconSvg}
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 mb-0.5 flex-wrap">
                                <h2 class="text-sm font-medium text-slate-100 group-hover:text-cyan-200 transition-colors truncate">${cleanTitle}</h2>
                                <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-purple-950/80 text-purple-300 border border-purple-500/40 tracking-wider flex-shrink-0">Archived</span>
                                <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-900/80 text-slate-400 border border-slate-700/50 tracking-wider flex-shrink-0" title="カードID (FirestoreドキュメントID)">ID: ${cardId}</span>
                            </div>
                            <span class="text-[11px] text-slate-400 truncate block mt-0.5">${targetUrl}</span>
                        </div>
                    </a>
                    <div class="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                        <a
                            href="${targetUrl}"
                            ${isExternal ? 'target="_blank" rel="noopener noreferrer"' : ''}
                            class="px-2.5 py-1.5 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/90 border border-cyan-500/40 text-cyan-300 hover:text-white text-xs flex items-center gap-1 transition-all cursor-pointer"
                            title="ページを開く"
                        >
                            <span>開く</span>
                            <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                <polyline points="15 3 21 3 21 9"></polyline>
                                <line x1="10" y1="14" x2="21" y2="3"></line>
                            </svg>
                        </a>
                        <button
                            type="button"
                            class="archive-bookmark-btn p-1.5 rounded-lg border transition-all cursor-pointer ${isBookmarked ? 'bg-amber-950/60 border-amber-500/60 text-amber-300' : 'bg-slate-800/70 border-slate-700/60 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/50'}"
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
        const countText = document.getElementById('bookmarks-count-text');
        if (!container) return;

        const bookmarks = getStoredBookmarks();
        if (countText) {
            countText.textContent = `${bookmarks.length}件のブックマーク`;
        }

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
                        ポータル画面の各カード右上にあるブックマークアイコン（☆）をタップすると、よく使うコンテンツをここに保存できます。
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
            const iconSvg = svgCode && svgCode.trim() ? svgCode : defaultIconSvg;
            const targetUrl = url;
            const isExternal = targetUrl.startsWith('http');

            html += `
                <div class="cosmic-card p-3 sm:p-4 flex items-center justify-between gap-3 text-left w-full group relative" data-bookmark-item-id="${cardId}" data-bookmark-item-slot="${bm.slot || ''}">
                    <a href="${targetUrl}" ${isExternal ? 'target="_blank" rel="noopener noreferrer"' : ''} class="flex items-center gap-3 flex-1 min-w-0">
                        <div class="plasma-sphere ${theme.grad ? 'bg-gradient-to-br ' + theme.grad : 'bg-slate-700'} w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full">
                            ${iconSvg}
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 mb-0.5 flex-wrap">
                                <h2 class="text-sm font-medium text-slate-100 group-hover:text-cyan-200 transition-colors truncate">${cleanTitle}</h2>
                                <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 tracking-wider flex-shrink-0" title="カードID (FirestoreドキュメントID)">ID: ${cardId}</span>
                            </div>
                            <span class="text-[11px] text-slate-400 truncate block mt-0.5">${targetUrl}</span>
                        </div>
                    </a>
                    <div class="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                        <a
                            href="${targetUrl}"
                            ${isExternal ? 'target="_blank" rel="noopener noreferrer"' : ''}
                            class="px-2.5 py-1.5 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/90 border border-cyan-500/40 text-cyan-300 hover:text-white text-xs flex items-center gap-1 transition-all cursor-pointer"
                            title="ページを開く"
                        >
                            <span>開く</span>
                            <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                <polyline points="15 3 21 3 21 9"></polyline>
                                <line x1="10" y1="14" x2="21" y2="3"></line>
                            </svg>
                        </a>
                        <button
                            type="button"
                            class="remove-bookmark-btn p-1.5 rounded-lg bg-slate-800/70 hover:bg-rose-950/60 border border-slate-700/60 hover:border-rose-500/50 text-slate-400 hover:text-rose-300 transition-all cursor-pointer"
                            data-card-id="${cardId}"
                            data-slot="${bm.slot || ''}"
                            data-title="${cleanTitle.replace(/"/g, '&quot;')}"
                            aria-label="${cleanTitle} (ID: ${cardId}) のブックマークを解除"
                            title="ブックマーク解除 (ID: ${cardId})"
                        >
                            <svg class="w-4 h-4 text-amber-400 hover:text-rose-400 transition-colors" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.75">
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

    function resetSlot(slotElement) {
        slotElement.classList.add('invisible');
        slotElement.classList.remove('visible');
        slotElement.classList.add('default-text-color');
        delete slotElement.dataset.cardId;

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

        const spanElement = slotElement.querySelector('span');
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
            slotElement.href = defaultCard.url;
            slotElement.dataset.cardId = defaultCard.id;

            const btn = slotElement.querySelector('.card-bookmark-btn');
            if (btn) {
                btn.dataset.cardId = defaultCard.id;
            }

            const spanElement = slotElement.querySelector('span');
            if (spanElement) {
                spanElement.innerHTML = defaultCard.title;
            }
        });

        updateAllCardBookmarkStates();
        updateArchivesBadge();

        if (isArchivesRoute()) {
            renderArchivesList();
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

    // Title click returns to portal when in bookmarks or archives view
    const headerMainTitle = document.getElementById('header-main-title');
    if (headerMainTitle) {
        headerMainTitle.addEventListener('click', () => {
            if (isBookmarksRoute() || isArchivesRoute()) {
                navigateTo('/');
            }
        });
    }

    // Initialize remove bookmark confirmation dialog
    initRemoveBookmarkDialog();

    // Initialize SPA route based on initial URL
    renderRoute();

    if (typeof firebase === 'undefined') return;
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
                svgCode: cardData.svgCode || ''
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
                    iconContainer.innerHTML = cardData.svgCode;

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

        if (isArchivesRoute()) {
            renderArchivesList();
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
      .then((reg) => console.log("Service worker registered.", reg))
      .catch((err) => console.log("Service worker registration failed: ", err));
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
