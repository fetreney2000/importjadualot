// netlify/functions/roster.js
// Proksi Netlify Function untuk roster SPPS-KLM.
// Masalah: endpoint Apps Script mengembalikan HTML wrapper yang memerlukan
// pelaksanaan JS (goog.script.init + userHtml terbenam). Pelayar tidak boleh
// memanggilnya secara terus (CORS + payload sandbox), jadi fungsi ini:
//   1. memuat turun wrapper,
//   2. menyahkod literal rentetan JS (termasuk lolos \xNN),
//   3. mengekstrak JSON `const DATA` daripada userHtml,
//   4. mengembalikannya sebagai JSON bersih daripada origin yang sama.
//
// Kegunaan: GET /.netlify/functions/roster?period=2026-11
// Env pilihan: ROSTER_BASE_URL (default di bawah)

const DEFAULT_BASE_URL =
  'https://script.google.com/macros/s/AKfycbzVl943vS3gzgALWFxT3r645KDXwnjPnoVPhTWqo1X3lWXwWEmX0F7riJd5vc4__xkj/exec';

const PERIOD_RE = /^\d{4}-\d{2}$/;

/** Menyahkod isi literal rentetan JS (tanpa tanda petik luar). */
function decodeJsString(s) {
  let out = '';
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c !== '\\') {
      out += c;
      continue;
    }
    const n = s[i + 1];
    if (n === undefined) break;
    if (n === 'x') {
      const hex = s.slice(i + 2, i + 4);
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        out += String.fromCharCode(parseInt(hex, 16));
        i += 3;
      } else {
        out += n;
        i += 1;
      }
    } else if (n === 'u') {
      const hex = s.slice(i + 2, i + 6);
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        out += String.fromCharCode(parseInt(hex, 16));
        i += 5;
      } else {
        out += n;
        i += 1;
      }
    } else if (n === 'n') { out += '\n'; i += 1; }
    else if (n === 'r') { out += '\r'; i += 1; }
    else if (n === 't') { out += '\t'; i += 1; }
    else if (n === 'b') { out += '\b'; i += 1; }
    else if (n === 'f') { out += '\f'; i += 1; }
    else if (n === 'v') { out += '\v'; i += 1; }
    else if (n === '0') { out += '\0'; i += 1; }
    else if (n === '"' || n === "'" || n === '\\' || n === '/') { out += n; i += 1; }
    else if (n === '\n') { i += 1; /* sambungan baris */ }
    else { out += n; i += 1; }
  }
  return out;
}

/** Menyekstrak objek JSON selepas `const DATA = {...};` dengan pengimbas seimbang. */
function extractDataJson(html) {
  const key = 'const DATA =';
  const ki = html.indexOf(key);
  if (ki === -1) throw new Error('const DATA tidak ditemui dalam userHtml');
  const start = html.indexOf('{', ki + key.length);
  if (start === -1) throw new Error('objek DATA tidak ditemui');
  let depth = 0;
  let inStr = null;
  let esc = false;
  for (let i = start; i < html.length; i += 1) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === inStr) inStr = null;
    } else if (c === '"' || c === "'") {
      inStr = c;
    } else if (c === '{') {
      depth += 1;
    } else if (c === '}') {
      depth -= 1;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error('JSON DATA tidak seimbang');
}

async function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'jadualot-netlify-function/1.0' },
    });
  } finally {
    clearTimeout(t);
  }
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
    'Access-Control-Allow-Origin': '*',
  };
  try {
    const params = (event && event.queryStringParameters) || {};
    const period = params.period && params.period.trim();
    if (period && !PERIOD_RE.test(period)) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Parameter period tidak sah. Format: YYYY-MM.' }) };
    }
    const base = (process.env.ROSTER_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
    const url = period
      ? `${base}?view=roster&period=${encodeURIComponent(period)}`
      : `${base}?view=roster`;

    const res = await fetchWithTimeout(url, 20000);
    if (!res.ok) throw new Error(`Sumber roster menjawab ${res.status}`);
    const wrapper = await res.text();

    const marker = 'goog.script.init("';
    const si = wrapper.indexOf(marker);
    if (si === -1) throw new Error('Pembungkus Apps Script tidak dijangka (init tidak ditemui)');
    const start = si + marker.length;
    const endMarkers = ['", "", undefined', '","",undefined'];
    let end = -1;
    for (const m of endMarkers) {
      end = wrapper.indexOf(m, start);
      if (end !== -1) break;
    }
    if (end === -1) throw new Error('Hujung payload init tidak ditemui');
    const decoded = decodeJsString(wrapper.slice(start, end));
    const outer = JSON.parse(decoded);
    if (!outer.userHtml) throw new Error('userHtml tiada dalam payload');
    const data = JSON.parse(extractDataJson(outer.userHtml));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, period: data?.roster?.periodKey || period || null, data }),
    };
  } catch (err) {
    const msg = err && err.name === 'AbortError' ? 'Sumber roster tamat masa.' : String((err && err.message) || err);
    return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: `Gagal memuatkan roster: ${msg}` }) };
  }
};
