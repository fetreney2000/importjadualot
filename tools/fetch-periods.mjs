// tools/fetch-periods.mjs
// Memuat turun setiap tempoh dalam rosterOptions dan menyimpannya sebagai
// JSON fallback dalam public/data/roster-YYYY-MM.json
// Kegunaan: node tools/fetch-periods.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.join(root, 'public', 'data');

const BASE =
  process.env.ROSTER_BASE_URL ||
  'https://script.google.com/macros/s/AKfycbzVl943vS3gzgALWFxT3r645KDXwnjPnoVPhTWqo1X3lWXwWEmX0F7riJd5vc4__xkj/exec';

function decodeJsString(s) {
  let out = '';
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c !== '\\') { out += c; continue; }
    const n = s[i + 1];
    if (n === undefined) break;
    if (n === 'x') {
      const hex = s.slice(i + 2, i + 4);
      if (/^[0-9a-fA-F]{2}$/.test(hex)) { out += String.fromCharCode(parseInt(hex, 16)); i += 3; }
      else { out += n; i += 1; }
    } else if (n === 'u') {
      const hex = s.slice(i + 2, i + 6);
      if (/^[0-9a-fA-F]{4}$/.test(hex)) { out += String.fromCharCode(parseInt(hex, 16)); i += 5; }
      else { out += n; i += 1; }
    } else if (n === 'n') { out += '\n'; i += 1; }
    else if (n === 'r') { out += '\r'; i += 1; }
    else if (n === 't') { out += '\t'; i += 1; }
    else if (n === '"' || n === "'" || n === '\\' || n === '/') { out += n; i += 1; }
    else { out += n; i += 1; }
  }
  return out;
}

function extractDataJson(html) {
  const key = 'const DATA =';
  const ki = html.indexOf(key);
  if (ki === -1) throw new Error('const DATA tidak ditemui');
  const start = html.indexOf('{', ki + key.length);
  let depth = 0; let inStr = null; let esc = false;
  for (let i = start; i < html.length; i += 1) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === inStr) inStr = null;
    } else if (c === '"' || c === "'") inStr = c;
    else if (c === '{') depth += 1;
    else if (c === '}') { depth -= 1; if (depth === 0) return html.slice(start, i + 1); }
  }
  throw new Error('JSON DATA tidak seimbang');
}

async function fetchData(period) {
  const url = period ? `${BASE}?view=roster&period=${encodeURIComponent(period)}` : `${BASE}?view=roster`;
  const res = await fetch(url, { headers: { 'User-Agent': 'jadualot-fetch-script/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} untuk ${period || 'default'}`);
  const wrapper = await res.text();
  const marker = 'goog.script.init("';
  const start = wrapper.indexOf(marker) + marker.length;
  let end = wrapper.indexOf('", "", undefined', start);
  if (end === -1) end = wrapper.indexOf('","",undefined', start);
  if (start < marker.length || end === -1) throw new Error('payload init tidak ditemui');
  const outer = JSON.parse(decodeJsString(wrapper.slice(start, end)));
  return JSON.parse(extractDataJson(outer.userHtml));
}

const seed = await fetchData(null);
const periods = [...new Set([seed.roster.periodKey, ...seed.rosterOptions.map((r) => r.periodKey)])];
fs.mkdirSync(outDir, { recursive: true });
// Sentiasa tulis semula tempoh semasa supaya fallback sepadan dengan sumber terkini
fs.writeFileSync(path.join(outDir, `roster-${seed.roster.periodKey}.json`), JSON.stringify(seed, null, 1) + '\n');
console.log(`ok ${seed.roster.periodKey}: ${seed.assignments.length} slot`);

for (const p of periods) {
  if (p === seed.roster.periodKey) continue;
  try {
    const data = await fetchData(p);
    fs.writeFileSync(path.join(outDir, `roster-${p}.json`), JSON.stringify(data, null, 1) + '\n');
    console.log(`ok ${p}: ${data.assignments.length} slot (${data.roster.status})`);
  } catch (e) {
    console.log(`gagal ${p}: ${e.message}`);
  }
}

// Senarai tempoh untuk fallback luar talian aplikasi
const have = fs.readdirSync(outDir)
  .map((f) => (f.match(/^roster-(\d{4}-\d{2})\.json$/) || [])[1])
  .filter(Boolean)
  .sort();
fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify({ periods: have }) + '\n');
console.log(`index.json: ${have.join(', ')}`);
