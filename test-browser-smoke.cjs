const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${PORT}/`;
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || path.join(process.cwd(), 'diagnostic-screenshots');

function logStep(phase, message) {
    console.log(`[${phase}] ${message}`);
}

async function runBrowserSmoke() {
    if (!fs.existsSync(ARTIFACT_DIR)) {
        fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    }

    let browser;
    try {
        browser = await chromium.launch({
            timeout: 15000
        });
    } catch (err) {
        console.error('Failed to launch Chromium browser:', err);
        process.exit(1);
    }

    let failureCount = 0;

    // --- Phase 1: Portrait Mode (375 x 812) ---
    try {
        logStep('portrait', 'starting viewport 375x812');
        const context = await browser.newContext({
            viewport: { width: 375, height: 812 },
            deviceScaleFactor: 1
        });
        const page = await context.newPage();
        page.setDefaultTimeout(10000);

        const pageErrors = [];
        page.on('pageerror', err => pageErrors.push(err.message));

        logStep('portrait', `navigating to ${BASE_URL}`);
        await page.goto(BASE_URL, { waitUntil: 'load', timeout: 10000 });
        await page.waitForTimeout(600); // Allow initial JS execution
        logStep('portrait', 'page loaded');

        // Screenshot
        const portraitScreenshot = path.join(ARTIFACT_DIR, 'portrait-375x812.png');
        await page.screenshot({ path: portraitScreenshot });
        logStep('portrait', `saved screenshot to ${portraitScreenshot}`);

        // Page title check
        const title = await page.title();
        assert.ok(title.includes('ミュージアム'), `Title must include ミュージアム, got: "${title}"`);

        // Check header and footer visibility
        const header = await page.$('header');
        assert.ok(header, 'header must be present');
        assert.ok(await header.isVisible(), 'header must be visible');

        const footer = await page.$('footer');
        assert.ok(footer, 'footer must be present');
        assert.ok(await footer.isVisible(), 'footer must be visible');

        // Check 8 portal cards
        logStep('portrait', 'checking card geometry');
        const cards = await page.$$('[data-slot]');
        assert.equal(cards.length, 8, `Expected 8 portal cards, found ${cards.length}`);

        const cardBoxes = [];
        for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            const isVis = await card.isVisible();
            assert.ok(isVis, `Portal card ${i + 1} must be visible`);
            const box = await card.boundingBox();
            assert.ok(box, `Card ${i + 1} bounding box missing`);
            cardBoxes.push(box);
        }

        // Verify 2 columns x 4 rows geometry
        const uniqueX = Array.from(new Set(cardBoxes.map(b => Math.round(b.x)))).sort((a, b) => a - b);
        const uniqueY = Array.from(new Set(cardBoxes.map(b => Math.round(b.y)))).sort((a, b) => a - b);
        logStep('portrait', `measured card positions: ${uniqueX.length} columns (X: ${uniqueX.join(',')}), ${uniqueY.length} rows (Y: ${uniqueY.join(',')})`);
        assert.equal(uniqueX.length, 2, `Portrait should have exactly 2 columns, got ${uniqueX.length}`);
        assert.equal(uniqueY.length, 4, `Portrait should have exactly 4 rows, got ${uniqueY.length}`);

        // Check plasma spheres circularity
        logStep('portrait', 'checking icon circularity');
        const spheres = await page.$$('.plasma-sphere');
        assert.equal(spheres.length, 8, `Expected 8 plasma-sphere icons, got ${spheres.length}`);
        for (let i = 0; i < spheres.length; i++) {
            const box = await spheres[i].boundingBox();
            assert.ok(box, `Sphere ${i + 1} bounding box missing`);
            const ratio = box.width / box.height;
            assert.ok(
                Math.abs(ratio - 1.0) <= 0.05,
                `Plasma sphere ${i + 1} must be circular within 5% tolerance (width: ${box.width}, height: ${box.height}, ratio: ${ratio})`
            );
        }

        // Viewport overflow and scroll check
        logStep('portrait', 'checking viewport overflow and scrolling');
        const metrics = await page.evaluate(() => {
            return {
                docScrollWidth: document.documentElement.scrollWidth,
                docClientWidth: document.documentElement.clientWidth,
                docScrollHeight: document.documentElement.scrollHeight,
                docClientHeight: document.documentElement.clientHeight,
                bodyScrollWidth: document.body.scrollWidth,
                bodyScrollHeight: document.body.scrollHeight,
                winWidth: window.innerWidth,
                winHeight: window.innerHeight
            };
        });

        assert.ok(
            metrics.docScrollWidth <= metrics.winWidth + 1,
            `Horizontal overflow detected: docScrollWidth ${metrics.docScrollWidth} > winWidth ${metrics.winWidth}`
        );
        assert.ok(
            metrics.docScrollHeight <= metrics.winHeight + 1,
            `Vertical overflow detected: docScrollHeight ${metrics.docScrollHeight} > winHeight ${metrics.winHeight}`
        );

        await context.close();
        logStep('portrait', 'PASS');
    } catch (err) {
        logStep('portrait', `FAIL: ${err.message}`);
        failureCount++;
    }

    // --- Phase 2: Landscape Mode (1169 x 719) ---
    try {
        logStep('landscape', 'starting viewport 1169x719');
        const context = await browser.newContext({
            viewport: { width: 1169, height: 719 },
            deviceScaleFactor: 1
        });
        const page = await context.newPage();
        page.setDefaultTimeout(10000);

        logStep('landscape', `navigating to ${BASE_URL}`);
        await page.goto(BASE_URL, { waitUntil: 'load', timeout: 10000 });
        await page.waitForTimeout(600);
        logStep('landscape', 'page loaded');

        // Screenshot
        const landscapeScreenshot = path.join(ARTIFACT_DIR, 'landscape-1169x719.png');
        await page.screenshot({ path: landscapeScreenshot });
        logStep('landscape', `saved screenshot to ${landscapeScreenshot}`);

        // Check header and footer visibility
        const header = await page.$('header');
        assert.ok(header && await header.isVisible(), 'header must be visible');
        const footer = await page.$('footer');
        assert.ok(footer && await footer.isVisible(), 'footer must be visible');

        // Verify slogan hidden in landscape
        const slogan = await page.$('.slogan-text');
        if (slogan) {
            const isSloganVis = await slogan.isVisible();
            assert.equal(isSloganVis, false, 'header slogan should be hidden in landscape mode to maximize grid space');
        }

        // Check 8 portal cards
        logStep('landscape', 'checking card geometry');
        const cards = await page.$$('[data-slot]');
        assert.equal(cards.length, 8, `Expected 8 portal cards, found ${cards.length}`);

        const cardBoxes = [];
        for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            assert.ok(await card.isVisible(), `Portal card ${i + 1} must be visible`);
            const box = await card.boundingBox();
            assert.ok(box, `Card ${i + 1} bounding box missing`);
            cardBoxes.push(box);
        }

        // Verify 4 columns x 2 rows geometry
        const uniqueX = Array.from(new Set(cardBoxes.map(b => Math.round(b.x)))).sort((a, b) => a - b);
        const uniqueY = Array.from(new Set(cardBoxes.map(b => Math.round(b.y)))).sort((a, b) => a - b);
        logStep('landscape', `measured card positions: ${uniqueX.length} columns (X: ${uniqueX.join(',')}), ${uniqueY.length} rows (Y: ${uniqueY.join(',')})`);
        assert.equal(uniqueX.length, 4, `Landscape should have exactly 4 columns, got ${uniqueX.length}`);
        assert.equal(uniqueY.length, 2, `Landscape should have exactly 2 rows, got ${uniqueY.length}`);

        // Check plasma spheres circularity
        logStep('landscape', 'checking icon circularity');
        const spheres = await page.$$('.plasma-sphere');
        for (let i = 0; i < spheres.length; i++) {
            const box = await spheres[i].boundingBox();
            const ratio = box.width / box.height;
            assert.ok(
                Math.abs(ratio - 1.0) <= 0.05,
                `Plasma sphere ${i + 1} must be circular within 5% tolerance (ratio: ${ratio})`
            );
        }

        // Viewport overflow check
        logStep('landscape', 'checking viewport overflow and scrolling');
        const metrics = await page.evaluate(() => {
            return {
                docScrollWidth: document.documentElement.scrollWidth,
                docClientWidth: document.documentElement.clientWidth,
                docScrollHeight: document.documentElement.scrollHeight,
                docClientHeight: document.documentElement.clientHeight,
                winWidth: window.innerWidth,
                winHeight: window.innerHeight
            };
        });

        assert.ok(
            metrics.docScrollWidth <= metrics.winWidth + 1,
            `Horizontal overflow detected in landscape: docScrollWidth ${metrics.docScrollWidth} > winWidth ${metrics.winWidth}`
        );
        assert.ok(
            metrics.docScrollHeight <= metrics.winHeight + 1,
            `Vertical overflow detected in landscape: docScrollHeight ${metrics.docScrollHeight} > winHeight ${metrics.winHeight}`
        );

        await context.close();
        logStep('landscape', 'PASS');
    } catch (err) {
        logStep('landscape', `FAIL: ${err.message}`);
        failureCount++;
    }

    // --- Phase 3: PWA / Service Worker Smoke ---
    try {
        logStep('pwa-sw', 'starting PWA / SW registration check');
        const context = await browser.newContext();
        const page = await context.newPage();
        page.setDefaultTimeout(10000);

        await page.goto(BASE_URL, { waitUntil: 'load', timeout: 10000 });
        await page.waitForTimeout(1000);

        const swStatus = await page.evaluate(async () => {
            if (!('serviceWorker' in navigator)) {
                return { supported: false };
            }
            const reg = await navigator.serviceWorker.getRegistration();
            return {
                supported: true,
                registered: !!reg,
                scope: reg ? reg.scope : null,
                state: reg && reg.active ? reg.active.state : (reg && reg.installing ? reg.installing.state : null)
            };
        });

        logStep('pwa-sw', `SW status: supported=${swStatus.supported}, registered=${swStatus.registered}, state=${swStatus.state}`);
        assert.ok(swStatus.supported, 'Service Worker should be supported in browser environment');
        assert.ok(swStatus.registered, 'Service Worker should register successfully for top page');

        await context.close();
        logStep('pwa-sw', 'PASS');
    } catch (err) {
        logStep('pwa-sw', `FAIL: ${err.message}`);
        failureCount++;
    }

    await browser.close();

    if (failureCount > 0) {
        console.error(`\nBrowser Smoke finished with ${failureCount} failure(s).`);
        process.exit(1);
    } else {
        console.log('\nBrowser Smoke ALL PHASES PASSED.');
    }
}

runBrowserSmoke().catch(err => {
    console.error('Unhandled fatal error in browser smoke:', err);
    process.exit(1);
});
