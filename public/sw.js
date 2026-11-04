// public/sw.js
// Service worker JadualOT — app shell, data sandaran dan API roster.
// Strategi:
//   - navigasi: network-first, fallback kepada app shell
//   - /api/roster: network-first, fallback kepada respons terakhir (ditanda offline)
//   - /data/*.json dan aset shell: stale-while-revalidate
//   - fon Google: cache-first/stale-while-revalidate

const VERSION = 'v3';
const SHELL_CACHE = `jadualot-shell-${VERSION}`;
const DATA_CACHE = `jadualot-data-${VERSION}`;
const API_CACHE = `jadualot-api-${VERSION}`;
const FONT_CACHE = `jadualot-fonts-${VERSION}`;
const OWNED_CACHES = [SHELL_CACHE, DATA_CACHE, API_CACHE, FONT_CACHE];

// Semua laluan diterbitkan daripada lokasi skrip ini, bukan diandaikan root.
const BASE = new URL('./', self.location.href);
const BASE_PATH = BASE.pathname.replace(/\/$/, '');
const SHELL_URL = new URL('index.html', BASE).href;
const SW_PATH = new URL('sw.js', BASE).pathname;
const API_PATH = new URL('api/roster', BASE).pathname;
const DATA_PATH = new URL('data/', BASE).pathname;

const SHELL_ASSETS = [
  '',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'favicon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-192.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
].map((asset) => new URL(asset, BASE).href);

const OFFLINE_HTML = `<!doctype html>
<html lang="ms">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>JadualOT · Luar talian</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #f6f7f9; color: #16181d; }
  main { max-width: 34rem; text-align: center; }
  h1 { font-size: 1.5rem; margin: 0 0 .6rem; }
  p { line-height: 1.6; color: #5b616e; }
  .btn { display: inline-block; margin-top: 1rem; padding: .65rem 1.1rem; border: 0; border-radius: .6rem;
    background: #4f46e5; color: #fff; font: inherit; font-weight: 600; text-decoration: none; }
  @media (prefers-color-scheme: dark) {
    body { background: #0a0b0e; color: #f2f4f8; }
    p { color: #9aa2b1; }
  }
</style>
</head>
<body>
<main>
  <h1>Luar talian</h1>
  <p>JadualOT belum tersedia pada peranti ini. Sambung ke internet dan buka semula aplikasi.</p>
  <a class="btn" href="${BASE.href}">Cuba lagi</a>
</main>
</body>
</html>`;

/* ---------------- install / activate ---------------- */

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);

    // Pemasangan tidak boleh atomik: satu aset 404/503 tidak sepatutnya
    // membatalkan seluruh install dan menghalang data sandaran dicache.
    // Setiap aset dicache secara berasingan; kegagalan dilaporkan tetapi
    // tidak menghalang activation.
    const results = await Promise.allSettled(
      SHELL_ASSETS.map((url) => shell.add(new Request(url, { cache: 'reload' }))),
    );
    const failed = SHELL_ASSETS.filter((_, i) => results[i].status === 'rejected');
    if (failed.length) console.warn('SW: aset shell gagal dicache:', failed.join(', '));

    await precacheData();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith('jadualot-') && !OWNED_CACHES.includes(key))
        .map((key) => caches.delete(key)),
    );
    await self.clients.claim();
  })());
});

/** Simpan index.json dan semua roster sandaran supaya tersedia luar talian. */
async function precacheData() {
  const cache = await caches.open(DATA_CACHE);
  try {
    const indexUrl = new URL('data/index.json', BASE).href;
    const res = await fetch(indexUrl, { cache: 'reload' });
    if (!res.ok) return;
    await cache.put(indexUrl, res.clone());

    const idx = await res.json();
    const periods = Array.isArray(idx.periods) ? idx.periods : [];
    await Promise.allSettled(periods.map(async (period) => {
      const url = new URL(`data/roster-${encodeURIComponent(period)}.json`, BASE).href;
      const roster = await fetch(url, { cache: 'reload' });
      if (roster.ok) await cache.put(url, roster);
    }));
  } catch {
    // Data sandaran pilihan — kegagalan tidak sepatutnya menggagalkan pemasangan.
  }
}

/* ---------------- fetch routing ---------------- */

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  const sameOrigin = url.origin === self.location.origin;
  const inBase = !BASE_PATH || url.pathname === BASE_PATH || url.pathname.startsWith(`${BASE_PATH}/`);

  if (request.mode === 'navigate') {
    if (sameOrigin && inBase) event.respondWith(handleNavigation(event));
    return;
  }

  if (sameOrigin && inBase) {
    if (url.pathname === API_PATH) {
      event.respondWith(handleApi(event));
      return;
    }
    if (url.pathname === SW_PATH) return;
    if (url.pathname.startsWith(DATA_PATH)) {
      event.respondWith(staleWhileRevalidate(event, DATA_CACHE));
      return;
    }
    event.respondWith(staleWhileRevalidate(event, SHELL_CACHE));
    return;
  }

  if (url.hostname === 'fonts.googleapis.com') {
    event.respondWith(staleWhileRevalidate(event, FONT_CACHE, true));
    return;
  }
  if (url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(event, FONT_CACHE));
  }
});

/* ---------------- strategies ---------------- */

async function handleNavigation(event) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetchWithTimeout(event.request, 6000, 'no-store');
    if (res && res.ok) event.waitUntil(cache.put(SHELL_URL, res.clone()).catch(() => {}));
    return res;
  } catch {
    const cached = await cache.match(SHELL_URL);
    if (cached) return cached;
    return new Response(OFFLINE_HTML, {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}

async function handleApi(event) {
  const cache = await caches.open(API_CACHE);
  try {
    const res = await fetchWithTimeout(event.request, 22000, 'no-store');
    if (res && res.ok) event.waitUntil(cache.put(event.request, res.clone()).catch(() => {}));
    return res;
  } catch {
    const cached = await cache.match(event.request);
    return cached ? markOffline(cached) : Response.error();
  }
}

async function staleWhileRevalidate(event, cacheName, allowOpaque = false) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(event.request);

  const update = fetch(event.request).then(async (res) => {
    if (res && (res.ok || (allowOpaque && res.type === 'opaque'))) {
      try { await cache.put(event.request, res.clone()); } catch { /* abaikan */ }
    }
    return res;
  }).catch(() => null);

  if (cached) {
    event.waitUntil(update);
    return cached;
  }
  return (await update) || Response.error();
}

async function cacheFirst(event, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(event.request);
  if (cached) return cached;

  try {
    const res = await fetch(event.request);
    if (res && (res.ok || res.type === 'opaque')) {
      try { await cache.put(event.request, res.clone()); } catch { /* abaikan */ }
    }
    return res;
  } catch {
    return Response.error();
  }
}

/** Tandakan respons API yang datang daripada cache supaya UI boleh tunjuk mod luar talian. */
function markOffline(response) {
  const headers = new Headers(response.headers);
  headers.set('X-Jadualot-Cache', 'offline');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function fetchWithTimeout(request, ms, cacheMode) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const init = { signal: controller.signal };
  if (cacheMode) init.cache = cacheMode;
  return fetch(request, init).finally(() => clearTimeout(timer));
}
