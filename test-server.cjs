const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const test = require('node:test');

const PORT = process.env.TEST_PORT || (process.env.PORT === '8080' ? 3000 : (process.env.PORT || 3000));
const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;

let serverProcess = null;

test.before(async () => {
    // Check if server is already running
    try {
        const res = await fetch(`${BASE_URL}/healthz`);
        if (res.ok) {
            return; // Server is already running
        }
    } catch {
        // Not running, spawn it
    }

    serverProcess = spawn('node', ['server.js'], {
        stdio: 'pipe',
        env: { ...process.env, PORT: String(PORT) }
    });

    // Wait for server to become ready
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const res = await fetch(`${BASE_URL}/healthz`);
            if (res.ok) return;
        } catch {
            // Wait and retry
        }
        await new Promise(r => setTimeout(r, 100));
    }
    throw new Error(`Server failed to start at ${BASE_URL} within timeout`);
});

test.after(() => {
    if (serverProcess) {
        serverProcess.kill();
    }
});

test('server responds to health check at /healthz', async () => {
    const res = await fetch(`${BASE_URL}/healthz`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.equal(text, 'OK');
});

test('server delivers top page / with status 200 and expected title', async () => {
    const res = await fetch(`${BASE_URL}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/html/);
    const html = await res.text();
    assert.ok(html.includes('ミュージアム'), 'Top page HTML should contain "ミュージアム"');
});

test('server sets no-cache header on /sw.js and /sw-core-v44.js', async () => {
    const swRes = await fetch(`${BASE_URL}/sw.js`);
    assert.equal(swRes.status, 200);
    assert.equal(
        swRes.headers.get('cache-control'),
        'no-cache, no-store, must-revalidate'
    );

    const swCoreRes = await fetch(`${BASE_URL}/sw-core-v44.js`);
    assert.equal(swCoreRes.status, 200);
    assert.equal(
        swCoreRes.headers.get('cache-control'),
        'no-cache, no-store, must-revalidate'
    );
});

test('server delivers /__/firebase/init.js with local project configuration', async () => {
    const res = await fetch(`${BASE_URL}/__/firebase/init.js`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /javascript/);
    const body = await res.text();
    assert.ok(body.includes('museum-6f112'), 'init.js should contain project ID museum-6f112');
    assert.ok(body.includes('firebase.initializeApp'), 'init.js should contain firebase.initializeApp');
});

test('server redirects /__/firebase/:version/:file to Google CDN', async () => {
    const res = await fetch(`${BASE_URL}/__/firebase/8.10.1/firebase-app.js`, {
        redirect: 'manual'
    });
    assert.equal(res.status, 302);
    assert.equal(
        res.headers.get('location'),
        'https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js'
    );
});

test('server supports html extension resolution for /admin/view-icons', async () => {
    const res = await fetch(`${BASE_URL}/admin/view-icons`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/html/);
});

test('server serves 404.html for non-existent paths with status 404', async () => {
    const res = await fetch(`${BASE_URL}/this-path-does-not-exist-404-check`);
    assert.equal(res.status, 404);
    const text = await res.text();
    assert.ok(text.includes('404') || text.includes('見つかりません') || text.includes('DOCTYPE html'));
});
