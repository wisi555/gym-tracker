// A tiny web server for the tests: serves this folder at /gym-tracker/,
// like GitHub Pages does. No caching, so every request gets the real file.
// Test-only extra: POST /__test/bump makes sw.js look like a new version.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 4173;
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};
let bumps = 0;

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__test/bump') { bumps++; res.end(String(bumps)); return; }
  if (url.pathname === '/__test/reset') { bumps = 0; res.end('0'); return; }
  if (url.pathname === '/gym-tracker') { res.writeHead(301, { Location: '/gym-tracker/' }); res.end(); return; }
  if (!url.pathname.startsWith('/gym-tracker/')) { res.writeHead(404); res.end(); return; }
  let rel = decodeURIComponent(url.pathname.slice('/gym-tracker/'.length)) || 'index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end(); return;
  }
  let body = fs.readFileSync(file);
  if (rel === 'sw.js' && bumps) {
    body = Buffer.from(body.toString().replace(/const VERSION = '([^']+)';/, `const VERSION = '$1-test${bumps}';`));
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(body);
}).listen(PORT, () => console.log(`Serving ${ROOT} at http://localhost:${PORT}/gym-tracker/`));
