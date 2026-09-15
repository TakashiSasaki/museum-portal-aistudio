const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { execFileSync } = require('node:child_process');

const ROOT = process.env.SITE_TEST_ROOT || process.cwd();
const PUBLIC = path.join(ROOT, 'public');

test('Required static files exist', () => {
    const requiredFiles = [
        'index.html',
        'index.css',
        'index.js',
        'sw.js',
        'manifest.json',
        'robots.txt',
        'sitemap.xml',
        'resume-guard.js',
        'offline.html',
        '404.html'
    ];
    for (const file of requiredFiles) {
        const filePath = path.join(PUBLIC, file);
        assert.ok(fs.existsSync(filePath), `Required static file missing: public/${file}`);
    }
});

test('Relevant JavaScript and Service Worker scripts have valid syntax', () => {
    function findJsFiles(dir) {
        let results = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name !== 'node_modules' && entry.name !== '.git') {
                    results = results.concat(findJsFiles(fullPath));
                }
            } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.cjs'))) {
                results.push(fullPath);
            }
        }
        return results;
    }

    const publicJsFiles = findJsFiles(PUBLIC);
    assert.ok(publicJsFiles.length > 0, 'Should find JavaScript files in public/');

    const rootTestScripts = [
        'test-imaginedeck-fullscreen-guard.cjs',
        'test-static-integrity.cjs',
        'test-browser-smoke.cjs',
        'test-sw.cjs'
    ].map(f => path.join(ROOT, f)).filter(f => fs.existsSync(f));

    const filesToCheck = [...publicJsFiles, ...rootTestScripts];

    for (const filePath of filesToCheck) {
        const relPath = path.relative(ROOT, filePath);
        try {
            execFileSync(process.execPath, ['--check', filePath], { stdio: 'pipe' });
        } catch (err) {
            assert.fail(`Syntax error in ${relPath}: ${err.message}`);
        }
    }
});

test('public/index.html top-page structural and responsive contract', () => {
    const indexPath = path.join(PUBLIC, 'index.html');
    const html = fs.readFileSync(indexPath, 'utf8');

    // canonical host contract
    assert.ok(
        html.includes('<link rel="canonical" href="https://portal.museum.ehime-u.ac.jp/" />') ||
        html.includes('<link rel="canonical" href="https://portal.museum.ehime-u.ac.jp/">'),
        'Canonical link must use https://portal.museum.ehime-u.ac.jp/'
    );

    // viewport-first / no-scroll body class contract
    assert.ok(
        html.includes('overflow-hidden'),
        'body must include overflow-hidden'
    );
    assert.ok(
        html.includes('h-[100dvh]') || html.includes('h-screen'),
        'body must include viewport height constraint (h-[100dvh] or h-screen)'
    );

    // 8 portal slots contract
    const slotMatches = html.match(/data-slot="[1-8]"/g) || [];
    assert.equal(slotMatches.length, 8, 'index.html must contain exactly 8 portal slots (data-slot 1 to 8)');
    for (let i = 1; i <= 8; i++) {
        assert.ok(html.includes(`data-slot="${i}"`), `index.html must contain data-slot="${i}"`);
    }

    // Header and footer triggers present
    assert.ok(html.includes('<header'), 'index.html must contain header');
    assert.ok(html.includes('<footer'), 'index.html must contain footer');
    assert.ok(html.includes('id="portal-grid"'), 'index.html must contain #portal-grid');

    // Grid responsive classes contract
    assert.ok(html.includes('grid-cols-2'), 'portal grid must specify grid-cols-2 for portrait');
    assert.ok(
        html.includes('landscape:grid-cols-4') || html.includes('sm:grid-cols-4'),
        'portal grid must specify 4 columns for landscape / wider screens'
    );
});

test('public/index.css layout and circular icon contracts', () => {
    const cssPath = path.join(PUBLIC, 'index.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    // Circular icon contract (aspect-ratio: 1 / 1, flex-shrink: 0)
    assert.ok(
        css.includes('aspect-ratio: 1 / 1') || css.includes('aspect-ratio: 1/1'),
        'index.css must enforce aspect-ratio: 1/1 on plasma-sphere icons'
    );
    assert.ok(
        css.includes('flex-shrink: 0'),
        'index.css must enforce flex-shrink: 0 on plasma-sphere icons'
    );

    // Responsive grid row contract
    assert.ok(
        css.includes('grid-template-rows: repeat(4, 1fr)'),
        'index.css portrait query must define repeat(4, 1fr)'
    );
    assert.ok(
        css.includes('grid-template-rows: repeat(2, 1fr)'),
        'index.css landscape query must define repeat(2, 1fr)'
    );
});

test('firebase.json hosting configuration contract', () => {
    const configPath = path.join(ROOT, 'firebase.json');
    assert.ok(fs.existsSync(configPath), 'firebase.json must exist');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    assert.ok(config.hosting, 'firebase.json must have hosting section');
    assert.equal(config.hosting.public, 'public', 'firebase.json hosting.public must be "public"');

    // sw.js no-cache header contract
    assert.ok(Array.isArray(config.hosting.headers), 'hosting.headers must be configured');
    const swHeaderConfig = config.hosting.headers.find(h => h.source === '/sw.js');
    assert.ok(swHeaderConfig, 'hosting.headers must have an entry for /sw.js');

    const cacheControl = swHeaderConfig.headers.find(
        h => h.key.toLowerCase() === 'cache-control'
    );
    assert.ok(cacheControl, '/sw.js header must define Cache-Control');
    assert.ok(
        cacheControl.value.includes('no-cache'),
        'sw.js Cache-Control header must include no-cache'
    );
});

test('robots.txt retains current admin exclusion and syntax sanity', () => {
    const robotsPath = path.join(PUBLIC, 'robots.txt');
    const content = fs.readFileSync(robotsPath, 'utf8');
    assert.ok(content.includes('User-agent: *'), 'robots.txt must define User-agent');
    assert.ok(content.includes('Disallow: /admin/'), 'robots.txt must disallow /admin/');
});

test('sitemap.xml is parseable and uses canonical host', () => {
    const sitemapPath = path.join(PUBLIC, 'sitemap.xml');
    const content = fs.readFileSync(sitemapPath, 'utf8');
    assert.ok(content.includes('<?xml'), 'sitemap.xml must have XML declaration');
    assert.ok(content.includes('<urlset'), 'sitemap.xml must have urlset tag');
    assert.ok(
        content.includes('<loc>https://portal.museum.ehime-u.ac.jp/</loc>'),
        'sitemap.xml must contain canonical homepage URL'
    );
});

test('public/sw.js importScripts() dependencies exist', () => {
    const swPath = path.join(PUBLIC, 'sw.js');
    const content = fs.readFileSync(swPath, 'utf8');
    const matches = [...content.matchAll(/importScripts\s*\(\s*['"]([^'"]+)['"]\s*\)/g)];
    assert.ok(matches.length > 0, 'public/sw.js must import dependency scripts');

    for (const match of matches) {
        const scriptUrl = match[1];
        // e.g. /sw-core-v44.js -> path inside public/
        const scriptRel = scriptUrl.replace(/^\//, '');
        const targetPath = path.join(PUBLIC, scriptRel);
        assert.ok(
            fs.existsSync(targetPath),
            `sw.js imported script does not exist: public/${scriptRel} (from ${scriptUrl})`
        );
    }
});
