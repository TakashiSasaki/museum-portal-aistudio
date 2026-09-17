const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const PORT = process.env.TEST_PORT || (process.env.PORT === '8080' ? 3000 : (process.env.PORT || 3000));
const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;

async function runArchivesTest() {
    console.log('[test-archives] Starting Playwright test against', BASE_URL);
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
    console.log('[test-archives] 1. Navigating to top page /');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'load' });
    await page.waitForTimeout(500);

    // Verify header archives button exists
    const headerArchivesBtn = await page.$('#header-archives-button');
    assert.ok(headerArchivesBtn, '#header-archives-button must exist in header');

    // Verify archives view exists and is hidden on top page
    const isArchivesHiddenOnTop = await page.evaluate(() => {
        const view = document.getElementById('archives-view');
        return view && view.classList.contains('hidden');
    });
    assert.equal(isArchivesHiddenOnTop, true, '#archives-view should be hidden on top page');

    // Step 2: Click header archives button (SPA navigation)
    console.log('[test-archives] 2. Clicking header archives button');
    await headerArchivesBtn.click();
    await page.waitForTimeout(300);

    const archivesUrl = page.url();
    assert.ok(archivesUrl.endsWith('/archives'), `URL should end with /archives, got: ${archivesUrl}`);

    const isPortalGridHidden = await page.evaluate(() => {
        return document.getElementById('portal-grid').classList.contains('hidden');
    });
    assert.equal(isPortalGridHidden, true, '#portal-grid should be hidden in archives view');

    const isArchivesVisible = await page.evaluate(() => {
        const view = document.getElementById('archives-view');
        return view && !view.classList.contains('hidden');
    });
    assert.equal(isArchivesVisible, true, '#archives-view should be visible on /archives');

    const isHeaderMainTitleHidden = await page.evaluate(() => {
        const title = document.getElementById('header-main-title');
        return title && title.classList.contains('hidden');
    });
    assert.equal(isHeaderMainTitleHidden, true, 'Header main title should be hidden in archives view');

    const isHeaderBackBtnVisible = await page.evaluate(() => {
        const btn = document.getElementById('header-back-button');
        return btn && !btn.classList.contains('hidden');
    });
    assert.equal(isHeaderBackBtnVisible, true, '#header-back-button should be visible in archives view');

    // Step 3: Check return to portal via header back button
    console.log('[test-archives] 3. Testing header back button');
    const backBtn = await page.$('#header-back-button');
    assert.ok(backBtn, '#header-back-button must exist');
    await backBtn.click();
    await page.waitForTimeout(300);

    const backUrl = page.url();
    assert.equal(new URL(backUrl).pathname, '/', 'Back button should navigate to /');

    const isPortalGridVisibleAgain = await page.evaluate(() => {
        return !document.getElementById('portal-grid').classList.contains('hidden');
    });
    assert.equal(isPortalGridVisibleAgain, true, 'portal-grid should be visible after returning');

    // Step 4: Direct URL access to /archives
    console.log('[test-archives] 4. Direct URL access to /archives');
    await page.goto(`${BASE_URL}/archives`, { waitUntil: 'load' });
    await page.waitForTimeout(500);

    const directUrl = page.url();
    assert.ok(directUrl.endsWith('/archives'), `Direct navigation should be on /archives, got: ${directUrl}`);

    const directArchivesVisible = await page.evaluate(() => {
        const view = document.getElementById('archives-view');
        return view && !view.classList.contains('hidden');
    });
    assert.equal(directArchivesVisible, true, 'Direct /archives load should show archives view');

    // Step 5: Test real Firestore archive end-to-end flow with card1
    console.log('[test-archives] 5. Testing real Firestore archived card behavior');
    await page.evaluate(async () => {
        await firebase.firestore().collection('portalCards').doc('card1').update({ position: null });
    });
    await page.waitForTimeout(300);

    const initialBadgeCount = await page.evaluate(() => {
        const b = document.getElementById('header-archives-badge');
        return b && !b.classList.contains('hidden') ? Number(b.textContent.trim()) : 0;
    });

    // Set card1 position to 'archived'
    await page.evaluate(async () => {
        await firebase.firestore().collection('portalCards').doc('card1').update({ position: 'archived' });
    });

    // Reload /archives
    await page.goto(`${BASE_URL}/archives`, { waitUntil: 'load' });
    await page.waitForTimeout(1000);

    // Verify card1 appears in archives list
    const archivedItem = await page.$('[data-archive-item-id="card1"]');
    assert.ok(archivedItem, 'card1 should be rendered in #archives-list-container with data-archive-item-id="card1"');

    // Verify card1 has no Archived badge and Document ID badge is not present
    const badgeTexts = await page.evaluate(el => {
        return Array.from(el.querySelectorAll('span')).map(s => s.textContent.trim());
    }, archivedItem);
    assert.ok(!badgeTexts.some(t => t.includes('Archived')), 'Card should NOT display Archived badge');
    assert.ok(!badgeTexts.some(t => t.includes('ID: card1')), 'Card should NOT display ID: card1 badge');

    // Verify header archives badge increases by 1
    const archivesBadgeText = await page.evaluate(() => {
        const b = document.getElementById('header-archives-badge');
        return b && !b.classList.contains('hidden') ? Number(b.textContent.trim()) : 0;
    });
    assert.equal(archivesBadgeText, initialBadgeCount + 1, `header-archives-badge should increment by 1 (expected ${initialBadgeCount + 1}, got ${archivesBadgeText})`);

    // Test bookmarking from archives page
    console.log('[test-archives] 5b. Bookmarking archived card from archives view');
    const bookmarkBtn = await archivedItem.$('.archive-bookmark-btn');
    assert.ok(bookmarkBtn, 'Archive item should have bookmark toggle button');
    await bookmarkBtn.click();
    await page.waitForTimeout(300);

    // Verify bookmark is stored
    const stored = await page.evaluate(() => {
        const raw = localStorage.getItem('museum_portal_bookmarks');
        return raw ? JSON.parse(raw) : [];
    });
    assert.ok(stored.some(b => (b.id === 'card1' || b.cardId === 'card1')), 'card1 should be in bookmarks localStorage');

    // Navigate to /bookmarks and check card1 is listed
    await page.goto(`${BASE_URL}/bookmarks`, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const bookmarkedCard1 = await page.$('[data-bookmark-item-id="card1"]');
    assert.ok(bookmarkedCard1, 'card1 should be rendered in /bookmarks list');

    // Navigate to top page / and confirm card1 is NOT on portal-grid
    await page.goto(`${BASE_URL}/`, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const renderedCard1InGrid = await page.$('#portal-grid [data-card-id="card1"]');
    assert.equal(renderedCard1InGrid, null, 'card1 (archived) must NOT be rendered in portal-grid slots 1..8');

    // Cleanup: restore card1 position to null
    console.log('[test-archives] 5c. Cleaning up: resetting card1 position to null');
    await page.evaluate(async () => {
        await firebase.firestore().collection('portalCards').doc('card1').update({ position: null });
        localStorage.removeItem('museum_portal_bookmarks');
    });

    // Test Admin edit-portal.html position options
    console.log('[test-archives] 6. Verifying /admin/edit-portal.html contains Archived option');
    await page.goto(`${BASE_URL}/admin/edit-portal.html`, { waitUntil: 'load' });
    await page.waitForTimeout(500);

    const editPositionOption = await page.evaluate(() => {
        const select = document.getElementById('edit-position');
        if (!select) return null;
        const options = Array.from(select.options).map(o => ({ value: o.value, text: o.text }));
        return options.find(o => o.value === 'archived');
    });
    assert.ok(editPositionOption, 'edit-portal.html select#edit-position must have option value="archived"');
    console.log('[test-archives] Found archived option in admin edit-portal.html:', editPositionOption);

    assert.equal(pageErrors.length, 0, `No unhandled page errors should occur: ${pageErrors.join(', ')}`);

    console.log('[test-archives] ALL ARCHIVES TESTS PASSED SUCCESSFULLY!');
    await browser.close();
}

runArchivesTest().catch(err => {
    console.error('[test-archives] FAILED:', err);
    process.exit(1);
});
