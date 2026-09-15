import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';

// Health check endpoint for readiness probes
app.get('/healthz', (req, res) => {
  res.status(200).send('OK');
});

// Service Worker must always serve with no-cache header
app.use((req, res, next) => {
  if (req.path === '/sw.js' || req.path.startsWith('/sw-')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
  next();
});

// Firebase Hosting reserved URLs emulation for local preview
app.get('/__/firebase/:version/:file', (req, res) => {
  res.redirect(`https://www.gstatic.com/firebasejs/${req.params.version}/${req.params.file}`);
});

app.get('/__/firebase/init.js', (req, res) => {
  res.type('application/javascript');
  res.send(`
    if (typeof firebase !== 'undefined') {
      try {
        firebase.initializeApp({
          projectId: "museum-6f112"
        });
      } catch (e) {
        console.warn('Firebase initialization warning:', e);
      }
    }
  `);
});

// Serve static assets from public directory
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir, {
  extensions: ['html']
}));

// Fallback 404 handler
app.use((req, res) => {
  res.status(404).sendFile(path.join(publicDir, '404.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Museum Portal server listening on http://${HOST}:${PORT}`);
});
