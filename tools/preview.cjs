// Serve public/ + mock function endpoint for local visual checks.
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'public');
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/roster') {
    const period = url.searchParams.get('period') || '2026-11';
    const file = path.join(root, 'data', `roster-${period}.json`);
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('{}'); }
    const body = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, period, data: data.ok ? data.data : data }));
  }
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.join(root, decodeURIComponent(p));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('404');
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});

server.listen(4173, () => console.log('preview http://localhost:4173'));
