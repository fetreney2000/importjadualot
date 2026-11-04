const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const html = fs.readFileSync('public/index.html', 'utf8');
const js = fs.readFileSync('public/app.js', 'utf8');
const css = fs.readFileSync('public/styles.css', 'utf8');

let fail = 0;

// 1. Setiap id yang dirujuk app.js mesti wujud dalam index.html
const refs = [...new Set([
  ...[...js.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]),
  ...[...js.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]),
])];
const missing = refs.filter((id) => !html.includes(`id="${id}"`));
console.log(`id dirujuk: ${refs.length} | hilang: ${missing.length ? missing.join(', ') : 'tiada'}`);
if (missing.length) fail++;

// 2. Kelas data-* yang digunakan JS wujud dalam HTML/CSS
for (const sel of ['data-tab', 'data-unit', 'data-jump', 'data-date', 'data-staff']) {
  if (!html.includes(sel) && !js.includes(sel)) { console.log(`AMARAN: ${sel} tidak ditemui`); fail++; }
}

// 3. Token CSS yang dirujuk wujud
const usedVars = [...new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]))];
const definedVars = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
const undef = usedVars.filter((v) => !definedVars.has(v) && !['--av-h'].includes(v));
console.log(`token CSS: ${usedVars.length} dirujuk | tidak ditakrif: ${undef.length ? undef.join(', ') : 'tiada'}`);
if (undef.length) fail++;

// 4. Kelas dalam HTML ada padanan CSS (semakan asas)
const htmlClasses = new Set();
for (const m of html.matchAll(/class="([^"]+)"/g)) m[1].split(/\s+/).filter(Boolean).forEach((c) => htmlClasses.add(c));
const noCss = [...htmlClasses].filter((c) => !css.includes(`.${c}`) && !c.startsWith('u-'));
console.log(`kelas HTML: ${htmlClasses.size} | tanpa CSS: ${noCss.length ? noCss.join(', ') : 'tiada'}`);

// 5. Laluan API mesti menuju ke Worker Cloudflare
if (!js.includes("const API = '/api/roster'")) {
  console.log("AMARAN: const API bukan '/api/roster'");
  fail++;
}

// 6. PWA: manifest, ikon, dan service worker
const manifest = JSON.parse(fs.readFileSync('public/manifest.webmanifest', 'utf8'));
const icons = manifest.icons || [];
const iconProblems = [];

for (const size of ['192x192', '512x512']) {
  if (!icons.some((icon) => icon.sizes === size)) iconProblems.push(`ikon ${size}`);
}
if (!icons.some((icon) => (icon.purpose || '').includes('maskable'))) iconProblems.push('ikon maskable');
if (!html.includes('rel="manifest"')) iconProblems.push('link manifest');
if (!html.includes('apple-touch-icon')) iconProblems.push('apple-touch-icon');
if (!js.includes("register('sw.js'")) iconProblems.push('pendaftaran service worker');
if (!fs.existsSync('public/sw.js')) iconProblems.push('sw.js');
for (const file of ['public/app.js', 'public/sw.js']) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch {
    iconProblems.push(`sintaks ${file}`);
  }
}
for (const icon of icons) {
  if (icon.src && !fs.existsSync(path.join('public', icon.src))) iconProblems.push(icon.src);
}

function pngSize(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

for (const [file, size] of [
  ['public/icons/icon-192.png', 192],
  ['public/icons/icon-512.png', 512],
  ['public/icons/maskable-192.png', 192],
  ['public/icons/maskable-512.png', 512],
  ['public/icons/apple-touch-icon.png', 180],
]) {
  if (!fs.existsSync(file)) { iconProblems.push(file); continue; }
  const dim = pngSize(file);
  if (!dim || dim.w !== size || dim.h !== size) iconProblems.push(`${file} bukan ${size}px`);
}

console.log(`PWA: ${icons.length} ikon | isu: ${iconProblems.length ? iconProblems.join(', ') : 'tiada'}`);
if (iconProblems.length) fail++;

// 7. Data sandaran sah
const idx = JSON.parse(fs.readFileSync('public/data/index.json', 'utf8'));
for (const p of idx.periods) {
  const d = JSON.parse(fs.readFileSync(`public/data/roster-${p}.json`, 'utf8'));
  const dd = d.ok ? d.data : d;
  console.log(`  ${p} ${dd.roster.status} · ${dd.assignments.length} slot · ${dd.staff.length} staf`);
}

console.log(fail ? `\nGAGAL: ${fail} isu` : '\nSemua semakan lulus.');
process.exit(fail ? 1 : 0);
