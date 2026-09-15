const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on('console', msg => {
        if (msg.text().includes('[Museum Street]')) {
            console.log(`BROWSER LOG: ${msg.text()}`);
        }
    });

    try {
        await page.goto('http://localhost:3000/museum-street/', { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);
        console.log('Test completed successfully.');
    } catch (e) {
        console.error('Test failed:', e);
    } finally {
        await browser.close();
    }
})();
