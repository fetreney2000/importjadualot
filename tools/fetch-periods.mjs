// tools/fetch-periods.mjs
// Memuat turun setiap tempoh dalam rosterOptions dan menyimpannya sebagai
// JSON fallback dalam public/data/roster-YYYY-MM.json
// Kegunaan: node tools/fetch-periods.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRosterWrapper } from '../shared/roster-parse.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.join(root, 'public', 'data');

const BASE =
  process.env.ROSTER_BASE_URL ||
  'https://script.google.com/macros/s/AKfycbzVl943vS3gzgALWFxT3r645KDXwnjPnoVPhTWqo1X3lWXwWEmX0F7riJd5vc4__xkj/exec';

async function fetchData(period) {
  const url = period ? `${BASE}?view=roster&period=${encodeURIComponent(period)}` : `${BASE}?view=roster`;
  const res = await fetch(url, { headers: { 'User-Agent': 'jadualot-fetch-script/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} untuk ${period || 'default'}`);
  return parseRosterWrapper(await res.text());
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
