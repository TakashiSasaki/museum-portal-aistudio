const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const PORT = process.env.TEST_PORT || (process.env.PORT === '8080' ? 3000 : (process.env.PORT || 3000));
const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;

async function runHighlightsTest() {
    console.log('[test-highlights] Starting Playwright test against', BASE_URL);
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
    console.log('[test-highlights] 1. Navigating to top page /');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'load' });
    await page.waitForTimeout(500);

    // Verify header buttons exist
    const headerHighlightsBtn = await page.$('#header-highlights-button');
    const headerBookmarksBtn = await page.$('#header-bookmarks-button');
    const headerArchivesBtn = await page.$('#header-archives-button');
    assert.ok(headerHighlightsBtn, '#header-highlights-button must exist in header');
    assert.ok(headerBookmarksBtn, '#header-bookmarks-button must exist in header');
    assert.ok(headerArchivesBtn, '#header-archives-button must exist in header');

    // Verify order: Highlights is to the left of Bookmarks
    const isHighlightsBeforeBookmarks = await page.evaluate(() => {
        const hBtn = document.getElementById('header-highlights-button');
        const bBtn = document.getElementById('header-bookmarks-button');
        return hBtn && bBtn && (hBtn.compareDocumentPosition(bBtn) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    });
    assert.equal(isHighlightsBeforeBookmarks, true, '#header-highlights-button must be positioned to the left of #header-bookmarks-button');

    // Verify highlights view exists and is hidden on top page
    const isHighlightsHiddenOnTop = await page.evaluate(() => {
        const view = document.getElementById('highlights-view');
        return view && view.classList.contains('hidden');
    });
    assert.equal(isHighlightsHiddenOnTop, true, '#highlights-view should be hidden on top page');

    // Verify horizontal layout on 375px width (iPhone 12 mini)
    const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    assert.equal(hasHorizontalOverflow, false, '375px viewport must not have horizontal scroll');

    // Step 2: Click header highlights button (SPA navigation)
    console.log('[test-highlights] 2. Clicking header highlights button');
    await headerHighlightsBtn.click();
    await page.waitForTimeout(300);

    const highlightsUrl = page.url();
    assert.ok(highlightsUrl.endsWith('/highlights'), `URL should end with /highlights, got: ${highlightsUrl}`);

    const isPortalGridHidden = await page.evaluate(() => {
        return document.getElementById('portal-grid').classList.contains('hidden');
    });
    assert.equal(isPortalGridHidden, true, '#portal-grid should be hidden in highlights view');

    const isHighlightsVisible = await page.evaluate(() => {
        const view = document.getElementById('highlights-view');
        return view && !view.classList.contains('hidden');
    });
    assert.equal(isHighlightsVisible, true, '#highlights-view should be visible on /highlights');

    const pageTitle = await page.evaluate(() => document.getElementById('header-main-title')?.textContent.trim());
    assert.equal(pageTitle, 'ハイライト', `Header main title should be 'ハイライト', got '${pageTitle}'`);

    const countText = await page.evaluate(() => document.getElementById('highlights-count-text')?.textContent.trim());
    console.log('[test-highlights] Highlights count text:', countText);
    assert.ok(countText.includes('ハイライト'), 'Highlights count text should mention ハイライト');

    // Verify items in highlights list
    const itemsCount = await page.evaluate(() => {
        return document.querySelectorAll('#highlights-list-container [data-highlight-item-id]').length;
    });
    console.log('[test-highlights] Rendered highlights items count:', itemsCount);
    assert.ok(itemsCount > 0, 'Highlights view should render at least 1 highlight card');

    // Step 3: Check return to portal via back button
    console.log('[test-highlights] 3. Testing back button');
    const backBtn = await page.$('#highlights-back-button');
    assert.ok(backBtn, '#highlights-back-button must exist');
    await backBtn.click();
    await page.waitForTimeout(300);

    const backUrl = page.url();
    assert.equal(new URL(backUrl).pathname, '/', 'Back button should navigate to /');

    const isPortalGridVisibleAgain = await page.evaluate(() => {
        return !document.getElementById('portal-grid').classList.contains('hidden');
    });
    assert.equal(isPortalGridVisibleAgain, true, '#portal-grid should be visible after returning to /');

    // Step 4: Test direct navigation to /highlights
    console.log('[test-highlights] 4. Testing direct navigation to /highlights');
    await page.goto(`${BASE_URL}/highlights`, { waitUntil: 'load' });
    await page.waitForTimeout(500);

    const directViewVisible = await page.evaluate(() => {
        const view = document.getElementById('highlights-view');
        return view && !view.classList.contains('hidden');
    });
    assert.equal(directViewVisible, true, '#highlights-view should be visible on direct navigation');

    // Step 5: Test clicking logo/title returns to portal
    console.log('[test-highlights] 5. Testing header logo/title click returns to portal');
    const titleEl = await page.$('#header-main-title');
    assert.ok(titleEl, '#header-main-title must exist');
    await titleEl.click();
    await page.waitForTimeout(300);
    assert.equal(new URL(page.url()).pathname, '/', 'Header title click should return to /');

    assert.equal(pageErrors.length, 0, `Page errors encountered: ${JSON.stringify(pageErrors)}`);

    await browser.close();
    console.log('[test-highlights] SUCCESS: All Highlights assertions passed!');
}

runHighlightsTest().catch(err => {
    console.error('[test-highlights] FAILED:', err);
    process.exit(1);
});
