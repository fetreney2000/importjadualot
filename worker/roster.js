// worker/roster.js
// Proksi Cloudflare Worker untuk roster SPPS-KLM.
// Masalah: endpoint Apps Script mengembalikan HTML wrapper yang memerlukan
// pelaksanaan JS (goog.script.init + userHtml terbenam). Pelayar tidak boleh
// memanggilnya secara terus (CORS + payload sandbox), jadi laluan ini:
//   1. memuat turun wrapper,
//   2. menyahkod literal rentetan JS (termasuk lolos \xNN),
//   3. mengekstrak JSON `const DATA` daripada userHtml,
//   4. mengembalikannya sebagai JSON bersih daripada origin yang sama.
//
// Kegunaan: GET /api/roster?period=2026-11
// Env pilihan: ROSTER_BASE_URL (default di bawah)

import { parseRosterWrapper, rosterEnvelope } from '../shared/roster-parse.js';

const DEFAULT_BASE_URL =
  'https://script.google.com/macros/s/AKfycbzVl943vS3gzgALWFxT3r645KDXwnjPnoVPhTWqo1X3lWXwWEmX0F7riJd5vc4__xkj/exec';

const PERIOD_RE = /^\d{4}-\d{2}$/;
const CACHE_TTL_SECONDS = 300;
const CACHE_ORIGIN = 'https://jadualot.internal';

/** Header keselamatan yang dikongsi oleh semua respons Worker. */
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
};

/** Header standard untuk respons JSON /api/*. */
export const API_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  ...SECURITY_HEADERS,
};

async function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'jadualot-worker/1.0' },
    });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Ambil roster yang sudah dihuraikan, menggunakan Cache API Cloudflare.
 * Cache menyimpan JSON bersih (bukan wrapper) selama CACHE_TTL_SECONDS.
 */
async function loadRoster(period, base) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = `${CACHE_ORIGIN}/roster/v1/${period || 'latest'}?src=${encodeURIComponent(base)}`;

  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) return { payload: await hit.json(), cacheStatus: 'HIT' };
    } catch {
      // Cache tidak tersedia — teruskan ke sumber.
    }
  }

  const url = period
    ? `${base}?view=roster&period=${encodeURIComponent(period)}`
    : `${base}?view=roster`;

  const res = await fetchWithTimeout(url, 20000);
  if (!res.ok) throw new Error(`Sumber roster menjawab ${res.status}`);
  const wrapper = await res.text();
  const data = parseRosterWrapper(wrapper);
  const payload = rosterEnvelope(data, period);

  if (cache) {
    const cached = new Response(JSON.stringify(payload), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
      },
    });
    // Tunggu put selesai supaya permintaan seterusnya terus mendapat HIT.
    // I/O cache tidak dikira dalam had CPU Worker.
    try {
      await cache.put(cacheKey, cached);
    } catch {
      // Kegagalan cache tidak sepatutnya menggagalkan respons.
    }
  }

  return { payload, cacheStatus: 'MISS' };
}

/**
 * Pengendali /api/roster.
 * @param {Request} request
 * @param {{ ROSTER_BASE_URL?: string }} env
 */
export async function handleRoster(request, env = {}) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: API_HEADERS });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(
      JSON.stringify({ ok: false, error: 'Kaedah tidak dibenarkan. Guna GET.' }),
      { status: 405, headers: { ...API_HEADERS, Allow: 'GET, HEAD, OPTIONS', 'Cache-Control': 'no-store' } },
    );
  }

  const url = new URL(request.url);
  const period = (url.searchParams.get('period') || '').trim();

  if (period && !PERIOD_RE.test(period)) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Parameter period tidak sah. Format: YYYY-MM.' }),
      { status: 400, headers: { ...API_HEADERS, 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const base = (env.ROSTER_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
    const { payload, cacheStatus } = await loadRoster(period, base);
    const body = JSON.stringify(payload);
    return new Response(request.method === 'HEAD' ? null : body, {
      status: 200,
      headers: {
        ...API_HEADERS,
        'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
        'X-Roster-Cache': cacheStatus,
      },
    });
  } catch (err) {
    const msg = err && err.name === 'AbortError' ? 'Sumber roster tamat masa.' : String((err && err.message) || err);
    return new Response(
      JSON.stringify({ ok: false, error: `Gagal memuatkan roster: ${msg}` }),
      { status: 502, headers: { ...API_HEADERS, 'Cache-Control': 'no-store' } },
    );
  }
}
