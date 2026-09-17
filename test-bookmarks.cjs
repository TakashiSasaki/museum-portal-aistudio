const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const PORT = process.env.TEST_PORT || (process.env.PORT === '8080' ? 3000 : (process.env.PORT || 3000));
const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;

async function runBookmarksTest() {
    console.log('[test-bookmarks] Starting Playwright test against', BASE_URL);
    const browser = await chromium.launch({ timeout: 15000 });
    const context = await browser.newContext({
        viewport: { width: 375, height: 812 },
        deviceScaleFactor: 1
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);

    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    // Step 1: Navigate to top page
    console.log('[test-bookmarks] 1. Navigating to top page /');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'load' });
    await page.waitForTimeout(500);

    // Verify header bookmarks button exists
    const headerBtn = await page.$('#header-bookmarks-button');
    assert.ok(headerBtn, '#header-bookmarks-button must exist in header');

    // Badge should be hidden initially
    const badge = await page.$('#header-bookmarks-badge');
    assert.ok(badge, '#header-bookmarks-badge must exist');
    const badgeIsHidden = await page.evaluate(el => el.classList.contains('hidden'), badge);
    assert.equal(badgeIsHidden, true, 'Badge should be hidden when no bookmarks exist');

    // Step 2: Check card bookmark buttons exist on all 8 cards
    console.log('[test-bookmarks] 2. Checking card bookmark buttons');
    const bookmarkBtns = await page.$$('.card-bookmark-btn');
    assert.equal(bookmarkBtns.length, 8, 'Must have 8 card bookmark buttons');

    // Step 3: Bookmark slot 1
    console.log('[test-bookmarks] 3. Toggling bookmark on slot 1');
    const slot1El = await page.$('[data-slot="1"]');
    assert.ok(slot1El, 'Slot 1 element must exist');
    const slot1CardId = await page.evaluate(el => el.dataset.cardId, slot1El);
    console.log('[test-bookmarks] Slot 1 card document ID:', slot1CardId);
    assert.ok(slot1CardId && slot1CardId.length > 0, 'Slot 1 must have a valid data-card-id');

    const slot1Btn = await page.$('[data-bookmark-slot="1"]');
    assert.ok(slot1Btn, 'Slot 1 bookmark button must exist');
    await slot1Btn.click();
    await page.waitForTimeout(200);

    // Verify slot 1 has is-bookmarked class
    const isBookmarked = await page.evaluate(el => el.classList.contains('is-bookmarked'), slot1Btn);
    assert.equal(isBookmarked, true, 'Slot 1 bookmark button should have is-bookmarked class');

    // Badge should now be visible and display 1
    const badgeText = await page.evaluate(el => el.textContent.trim(), badge);
    const badgeHiddenAfter = await page.evaluate(el => el.classList.contains('hidden'), badge);
    assert.equal(badgeHiddenAfter, false, 'Badge should be visible after bookmarking');
    assert.equal(badgeText, '1', 'Badge should show 1');

    // Verify localStorage has bookmark
    const stored = await page.evaluate(() => {
        const raw = localStorage.getItem('museum_portal_bookmarks');
        return raw ? JSON.parse(raw) : null;
    });
    console.log('[test-bookmarks] stored bookmark:', stored);
    assert.ok(Array.isArray(stored) && stored.length === 1, 'localStorage should have 1 item');
    assert.equal(stored[0].id, slot1CardId, `Stored item id should match slot 1 card document ID (${slot1CardId})`);
    assert.equal(stored[0].cardId, slot1CardId, `Stored item cardId should match slot 1 card document ID (${slot1CardId})`);
    assert.ok(stored[0].title && stored[0].title.length > 0, 'Stored item title should not be empty');

    // Step 4: Navigate to /bookmarks via header button (SPA navigation)
    console.log('[test-bookmarks] 4. Clicking header bookmarks button (SPA routing)');
    await headerBtn.click();
    await page.waitForTimeout(300);

    const currentUrl = page.url();
    assert.ok(currentUrl.endsWith('/bookmarks'), `Current URL must end with /bookmarks, got: ${currentUrl}`);

    const isPortalGridHidden = await page.evaluate(() => {
        return document.getElementById('portal-grid').classList.contains('hidden');
    });
    assert.equal(isPortalGridHidden, true, 'portal-grid should be hidden in bookmarks view');

    const isBookmarksViewVisible = await page.evaluate(() => {
        return !document.getElementById('bookmarks-view').classList.contains('hidden');
    });
    assert.equal(isBookmarksViewVisible, true, 'bookmarks-view should be visible');

    // Step 5: Check bookmarked item in list
    console.log('[test-bookmarks] 5. Checking rendered bookmarked item and Document ID display');
    const bookmarkItems = await page.$$('#bookmarks-list-container [data-bookmark-item-id]');
    assert.equal(bookmarkItems.length, 1, 'Bookmarks list should display 1 item with data-bookmark-item-id');

    const itemId = await page.evaluate(el => el.getAttribute('data-bookmark-item-id'), bookmarkItems[0]);
    assert.equal(itemId, slot1CardId, `Item data-bookmark-item-id must be ${slot1CardId}`);

    // Verify Document ID badge is NOT displayed inside the bookmark item
    const idBadgeText = await page.evaluate(el => {
        const badges = Array.from(el.querySelectorAll('span'));
        const badgeEl = badges.find(s => s.textContent.includes('ID:'));
        return badgeEl ? badgeEl.textContent.trim() : null;
    }, bookmarkItems[0]);
    assert.equal(idBadgeText, null, 'Bookmark item must NOT display the document ID badge');

    const itemTitle = await page.evaluate(el => el.querySelector('h2').textContent.trim(), bookmarkItems[0]);
    const expectedTitle = (stored[0].title || '').replace(/<br\s*\/?>/gi, ' ').trim();
    assert.equal(itemTitle, expectedTitle, `Item title must match card title: expected "${expectedTitle}", got "${itemTitle}"`);

    // Step 6: Test back navigation via header back button
    console.log('[test-bookmarks] 6. Testing return to portal');
    const backBtn = await page.$('#header-back-button');
    assert.ok(backBtn, '#header-back-button must exist');
    await backBtn.click();
    await page.waitForTimeout(300);

    const backUrl = page.url();
    assert.equal(new URL(backUrl).pathname, '/', 'Back button should navigate to /');

    const isPortalGridVisibleAgain = await page.evaluate(() => {
        return !document.getElementById('portal-grid').classList.contains('hidden');
    });
    assert.equal(isPortalGridVisibleAgain, true, 'portal-grid should be visible again');

    // Step 7: Test direct URL entry to /bookmarks
    console.log('[test-bookmarks] 7. Testing direct URL access to /bookmarks');
    await page.goto(`${BASE_URL}/bookmarks`, { waitUntil: 'load' });
    await page.waitForTimeout(500);

    const directUrl = page.url();
    assert.ok(directUrl.endsWith('/bookmarks'), `Direct URL must stay on /bookmarks, got: ${directUrl}`);

    const directBookmarksViewVisible = await page.evaluate(() => {
        return !document.getElementById('bookmarks-view').classList.contains('hidden');
    });
    assert.equal(directBookmarksViewVisible, true, 'Direct /bookmarks load should show bookmarks view');

    // Step 8: Remove bookmark from within bookmarks view with confirmation dialog
    console.log(`[test-bookmarks] 8. Triggering bookmark removal from bookmarks view by card ID: ${slot1CardId}`);
    await page.waitForSelector(`.remove-bookmark-btn[data-card-id="${slot1CardId}"]`, { state: 'visible' });
    await page.click(`.remove-bookmark-btn[data-card-id="${slot1CardId}"]`);
    await page.waitForTimeout(300);

    // Verify confirmation dialog is visible
    const isDialogVisible = await page.evaluate(() => {
        const dlg = document.getElementById('bookmark-remove-dialog');
        return dlg && !dlg.classList.contains('hidden');
    });
    assert.equal(isDialogVisible, true, 'Bookmark removal confirmation dialog should be displayed');

    const dialogTargetId = await page.evaluate(() => {
        return document.getElementById('bookmark-remove-target-id')?.textContent;
    });
    assert.ok(dialogTargetId.includes(slot1CardId), `Dialog should show target ID ${slot1CardId}, got: ${dialogTargetId}`);

    // Test Cancel button: click cancel and ensure bookmark was NOT removed
    console.log('[test-bookmarks] 8a. Testing dialog cancel');
    const cancelBtn = await page.$('#bookmark-remove-cancel-btn');
    assert.ok(cancelBtn, 'Cancel button in removal dialog must exist');
    await cancelBtn.click();
    await page.waitForTimeout(300);

    const isDialogHiddenAfterCancel = await page.evaluate(() => {
        const dlg = document.getElementById('bookmark-remove-dialog');
        return dlg && dlg.classList.contains('hidden');
    });
    assert.equal(isDialogHiddenAfterCancel, true, 'Dialog should be hidden after clicking cancel');

    const itemStillPresent = await page.$(`.remove-bookmark-btn[data-card-id="${slot1CardId}"]`);
    assert.ok(itemStillPresent, 'Item should remain bookmarked after cancel');

    // Test Confirm button: click remove again, then click confirm
    console.log('[test-bookmarks] 8b. Testing dialog confirm removal');
    await itemStillPresent.click();
    await page.waitForTimeout(300);

    const confirmBtn = await page.$('#bookmark-remove-confirm-btn');
    assert.ok(confirmBtn, 'Confirm button in removal dialog must exist');
    await confirmBtn.click();
    await page.waitForTimeout(300);

    // Should now show empty state
    const emptyBackBtn = await page.$('#empty-state-back-btn');
    assert.ok(emptyBackBtn, 'Empty state back button should appear when list is empty');

    const badgeHiddenEmpty = await page.evaluate(() => {
        return document.getElementById('header-bookmarks-badge').classList.contains('hidden');
    });
    assert.equal(badgeHiddenEmpty, true, 'Badge should be hidden when all bookmarks are removed');

    // Return to portal and verify slot 1 star is not bookmarked
    await emptyBackBtn.click();
    await page.waitForTimeout(300);

    const slot1BtnAfter = await page.$('[data-bookmark-slot="1"]');
    const isBookmarkedAfter = await page.evaluate(el => el.classList.contains('is-bookmarked'), slot1BtnAfter);
    assert.equal(isBookmarkedAfter, false, 'Slot 1 bookmark button should not be bookmarked anymore');

    // Step 9: Test UTM parameter auto-bookmarking with new item (card2 - relative path)
    console.log('[test-bookmarks] 9. Testing UTM auto-bookmarking on new item (card2)');
    await page.goto(`${BASE_URL}/?utm_source=card2`, { waitUntil: 'load' });
    await page.waitForTimeout(600);

    // Verify dialog exists and is visible
    const isUtmDialogVisible = await page.evaluate(() => {
        const dlg = document.getElementById('bookmark-utm-dialog');
        return dlg && !dlg.classList.contains('hidden');
    });
    assert.equal(isUtmDialogVisible, true, 'UTM Bookmark dialog must be visible');

    const utmDialogTitle = await page.evaluate(() => {
        return document.getElementById('bookmark-utm-dialog-title')?.textContent.trim();
    });
    assert.equal(utmDialogTitle, 'ブックマークに追加しました', 'Title must state added to bookmarks');

    const utmTargetId = await page.evaluate(() => {
        return document.getElementById('bookmark-utm-target-id')?.textContent.trim();
    });
    assert.ok(utmTargetId.includes('card2'), `Target ID must include card2, got ${utmTargetId}`);

    // Verify viewport has no overflow on 375x812
    const isScrollable = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight);
    assert.equal(isScrollable, false, 'Page must not have vertical scrollbar on 375x812');

    // Verify utm_source was removed from URL to prevent reload re-trigger
    const urlAfterUtm = page.url();
    assert.equal(urlAfterUtm.includes('utm_source'), false, 'URL should no longer contain utm_source');

    // Click stay on portal button
    console.log('[test-bookmarks] 9a. Testing "stay on portal" button');
    await page.click('#bookmark-utm-stay-btn');
    await page.waitForTimeout(300);

    const isUtmDialogHidden = await page.evaluate(() => {
        const dlg = document.getElementById('bookmark-utm-dialog');
        return dlg && dlg.classList.contains('hidden');
    });
    assert.equal(isUtmDialogHidden, true, 'UTM dialog should be hidden after clicking stay');

    // Verify card2 is in bookmarks
    const bookmarksAfterUtm = await page.evaluate(() => {
        const raw = localStorage.getItem('museum_portal_bookmarks');
        return raw ? JSON.parse(raw) : [];
    });
    assert.equal(bookmarksAfterUtm.length, 1, 'Bookmarks count should be 1');
    assert.equal(bookmarksAfterUtm[0].id, 'card2', 'Bookmarked item id should be card2');

    // Step 10: Test UTM parameter on ALREADY bookmarked item & Same-window navigation
    console.log('[test-bookmarks] 10. Testing UTM parameter on already bookmarked item & same-window navigation');
    await page.goto(`${BASE_URL}/?utm_source=card2`, { waitUntil: 'load' });
    await page.waitForTimeout(600);

    const isAlreadyDialogVisible = await page.evaluate(() => {
        const dlg = document.getElementById('bookmark-utm-dialog');
        return dlg && !dlg.classList.contains('hidden');
    });
    assert.equal(isAlreadyDialogVisible, true, 'Dialog must be visible for already bookmarked item');

    const alreadyDialogTitle = await page.evaluate(() => {
        return document.getElementById('bookmark-utm-dialog-title')?.textContent.trim();
    });
    assert.equal(alreadyDialogTitle, 'すでにブックマークに登録されています', 'Title must state already bookmarked');

    // Bookmarks count should still be 1 (no duplicate addition)
    const bookmarksCountDuplicateCheck = await page.evaluate(() => {
        const raw = localStorage.getItem('museum_portal_bookmarks');
        return raw ? JSON.parse(raw).length : 0;
    });
    assert.equal(bookmarksCountDuplicateCheck, 1, 'Bookmarks count should remain 1 (no duplicate)');

    // Check button text for relative path (/museum-street/)
    const openBtnTextRelative = await page.evaluate(() => {
        return document.getElementById('bookmark-utm-open-btn-text')?.textContent.trim();
    });
    assert.equal(openBtnTextRelative, 'ページを開く', 'Button text for relative path should be "ページを開く"');

    // Click open button and verify navigation to /museum-street/ in same window
    console.log('[test-bookmarks] 10a. Clicking open button for relative path');
    await page.click('#bookmark-utm-open-btn');
    await page.waitForTimeout(500);

    const urlAfterOpen = page.url();
    assert.ok(urlAfterOpen.includes('/museum-street/'), `URL should have navigated to /museum-street/, got ${urlAfterOpen}`);

    // Step 11: Test FQDN URL handling in UTM dialog (open in new window)
    console.log('[test-bookmarks] 11. Testing FQDN URL handling in UTM dialog (open in new window)');
    await page.goto(`${BASE_URL}/?utm_source=card3`, { waitUntil: 'load' });
    await page.waitForTimeout(600);

    const fqdnOpenBtnText = await page.evaluate(() => {
        return document.getElementById('bookmark-utm-open-btn-text')?.textContent.trim();
    });
    assert.equal(fqdnOpenBtnText, '新しいウィンドウで開く', 'Button text for FQDN URL should be "新しいウィンドウで開く"');

    const externalIconHidden = await page.evaluate(() => {
        const icon = document.getElementById('bookmark-utm-open-btn-external-icon');
        return icon && icon.classList.contains('hidden');
    });
    assert.equal(externalIconHidden, false, 'External link icon should be visible for FQDN URL');

    // Mock window.open to intercept the call
    await page.evaluate(() => {
        window.__openedWindows = [];
        window.open = (url, target, features) => {
            window.__openedWindows.push({ url, target, features });
            return null;
        };
    });

    await page.click('#bookmark-utm-open-btn');
    await page.waitForTimeout(300);

    const openedCalls = await page.evaluate(() => window.__openedWindows);
    assert.equal(openedCalls.length, 1, 'window.open should have been called once');
    assert.ok(openedCalls[0].url.startsWith('https://'), `Opened URL must be FQDN, got ${openedCalls[0].url}`);
    assert.equal(openedCalls[0].target, '_blank', 'Target must be _blank');
    assert.equal(openedCalls[0].features, 'noopener,noreferrer', 'Features must specify noopener,noreferrer');

    // Verify dialog closed after opening
    const isFqdnDialogClosed = await page.evaluate(() => {
        const dlg = document.getElementById('bookmark-utm-dialog');
        return dlg && dlg.classList.contains('hidden');
    });
    assert.equal(isFqdnDialogClosed, true, 'UTM dialog should close after opening target');

    assert.equal(pageErrors.length, 0, `No page errors should occur, got: ${pageErrors.join(', ')}`);

    console.log('[test-bookmarks] ALL BOOKMARKS TESTS PASSED SUCCESSFULLY!');
    await browser.close();
}

runBookmarksTest().catch(err => {
    console.error('[test-bookmarks] FAILED:', err);
    process.exit(1);
});
