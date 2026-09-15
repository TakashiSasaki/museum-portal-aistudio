const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({
        viewport: { width: 375, height: 667 }, // iPhone SE viewport
        deviceScaleFactor: 2
    });

    await page.goto('http://localhost:3000/');

    // Inject fake data to simulate successful firestore load
    await page.evaluate(() => {
        const themeMap = {
            'cyan': { text: 'text-cyan-400', grad: 'from-cyan-500 to-cyan-700' },
            'fuchsia': { text: 'text-fuchsia-400', grad: 'from-fuchsia-500 to-purple-700' }
        };

        // Mock card1
        const existingLink = document.querySelector(`[data-page="card1"]`);
        if (existingLink) {
            existingLink.classList.remove('default-text-color');
            const iconContainer = existingLink.querySelector('.plasma-sphere');
            if (iconContainer) {
                iconContainer.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-white icon-glow"><path d="M12 2L2 22h20L12 2z"/></svg>`;
                iconContainer.classList.remove('bg-slate-500');
                iconContainer.classList.add(themeMap['cyan'].text, 'bg-gradient-to-br');
                themeMap['cyan'].grad.split(' ').forEach(cls => iconContainer.classList.add(cls));
            }
            const spanElement = existingLink.querySelector('span');
            if (spanElement) {
                spanElement.classList.remove('text-slate-500');
                spanElement.classList.add('text-slate-200');
            }
        }
    });

    await page.waitForTimeout(500); // give it a moment to render
    await page.screenshot({ path: '/home/jules/verification/screenshots/dynamic-state-test.png' });
    await browser.close();
    console.log("Screenshot saved to /home/jules/verification/screenshots/dynamic-state-test.png");
})();
