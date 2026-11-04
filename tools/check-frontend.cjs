const fs = require('fs');
// 1. Setiap id yang dirujuk app.js mesti wujud dalam index.html
const html = fs.readFileSync('public/index.html', 'utf8');
const js = fs.readFileSync('public/app.js', 'utf8');
const used = [...new Set([...js.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]))];
used.push(...[...js.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]));
const missing = [...new Set(used)].filter(id => !html.includes(`id="${id}"`));
console.log('id dirujuk:', used.length, '| hilang:', missing.length ? missing : 'tiada');
// 2. Semua JSON fallback sah + kiraan slot
const idx = JSON.parse(fs.readFileSync('public/data/index.json', 'utf8'));
for (const p of idx.periods) {
  const d = JSON.parse(fs.readFileSync(`public/data/roster-${p}.json`, 'utf8'));
  const dd = d.ok ? d.data : d;
  console.log(p, dd.roster.status, dd.assignments.length + ' slot', dd.staff.length + ' staf');
}
