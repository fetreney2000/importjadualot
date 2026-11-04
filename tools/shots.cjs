// tools/shots.cjs — tangkapan skrin untuk semakan visual
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, '..', 'shots');
const URL_APP = process.env.PREVIEW_URL || 'http://localhost:4173/';

// Cari Chromium merentas platform; CHROME_PATH mengatasi semua.
const BROWSERS = [
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].filter(Boolean);
const executablePath = BROWSERS.find((file) => fs.existsSync(file));
if (!executablePath) {
  console.error('Pelayar Chromium tidak ditemui. Tetapkan CHROME_PATH kepada laluan pelayar.');
  process.exit(1);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--font-render-hinting=none'],
    defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  const url = URL_APP;
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('.shift', { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 700));

  // Mobile: senarai
  await page.screenshot({ path: path.join(OUT, 'mobile-list.png') });

  // Bar tarikh mesti kekal melekat di bawah topbar semasa menatal
  await page.evaluate(() => window.scrollTo(0, 1400));
  await new Promise((r) => setTimeout(r, 500));
  const sticky = await page.evaluate(() => {
    const nav = document.getElementById('dateNav').getBoundingClientRect();
    const bar = document.querySelector('.topbar').getBoundingClientRect();
    return {
      flush: Math.abs(nav.top - bar.bottom) < 4,
      active: document.querySelector('.dchip.active')?.dataset.jump || null,
    };
  });
  await page.screenshot({ path: path.join(OUT, 'mobile-list-scrolled.png') });

  // Pemilih tarikh: grid bulan mesti mengandungi semua hari dan boleh melompat
  const jumpDate = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('.dchip')];
    return chips[Math.min(chips.length - 1, 19)]?.dataset.jump || null;
  });
  await page.click('#monthBtn');
  await page.waitForSelector('#monthSheet:not([hidden]) .mday', { timeout: 8000 });
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: path.join(OUT, 'mobile-month.png') });
  const month = await page.evaluate(() => ({
    days: document.querySelectorAll('#monthGrid .mday:not(.pad)').length,
    title: document.getElementById('monthSheetTitle').textContent,
  }));
  await page.click(`#monthGrid [data-jump="${jumpDate}"]`);
  await new Promise((r) => setTimeout(r, 1500));
  const jumped = await page.evaluate((date) => {
    const day = document.querySelector(`#agendaList [data-date="${date}"]`);
    const nav = document.getElementById('dateNav').getBoundingClientRect();
    return {
      closed: document.getElementById('monthSheet').hidden,
      active: document.querySelector('.dchip.active')?.dataset.jump || null,
      aligned: day ? Math.abs(day.getBoundingClientRect().top - (nav.bottom + 10)) < 24 : false,
    };
  }, jumpDate);

  // Mobile: staf
  await page.click('.tabbar [data-tab="staff"]');
  await page.waitForSelector('.staff-card', { timeout: 8000 });
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: path.join(OUT, 'mobile-staff.png') });

  // Carian mesti berfungsi pada tab Staf, dan tapisan unit disembunyikan
  const staffUi = await page.evaluate(() => ({
    searchVisible: !!document.querySelector('#searchInput')?.offsetParent,
    unitsHidden: document.getElementById('unitChips').hidden,
  }));
  // Carian mesti tidak sensitif huruf besar/kecil.
  await page.type('#searchInput', 'fetre');
  await new Promise((r) => setTimeout(r, 450));
  const searchNames = await page.$$eval('.staff-name', (ns) => ns.map((n) => n.textContent.trim()));
  const searchOk = searchNames.length > 0 && searchNames.every((n) => n.toUpperCase().includes('FETRE'));
  await page.evaluate(() => {
    const input = document.getElementById('searchInput');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 450));

  // Mobile: tugas saya (pilih nama)
  await page.click('.tabbar [data-tab="me"]');
  await page.waitForSelector('#meSelect', { timeout: 8000 });
  await page.select('#meSelect', 'S004');
  await page.click('#meSave');
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: path.join(OUT, 'mobile-me.png') });

  // Kembali ke Senarai: bar tarikh mesti dipaparkan semula dengan tinggi betul
  await page.click('.tabbar [data-tab="agenda"]');
  await new Promise((r) => setTimeout(r, 350));
  const backToAgenda = await page.evaluate(() => {
    const nav = document.getElementById('dateNav');
    return {
      visible: !nav.hidden,
      height: nav.offsetHeight,
      varHeight: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--date-nav-h'), 10),
    };
  });

  // Desktop
  const desk = await browser.newPage();
  await desk.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1.5 });
  await desk.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await desk.waitForSelector('.shift', { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 700));
  await desk.screenshot({ path: path.join(OUT, 'desktop.png') });

  // Dark mode desktop
  const dark = await browser.newPage();
  await dark.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1.5 });
  await dark.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await dark.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await dark.waitForSelector('.shift', { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 700));
  await dark.screenshot({ path: path.join(OUT, 'desktop-dark.png') });

  // Semak limpahan mendatar pada mudah alih
  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
  }));

  console.log('ralat konsol:', errors.length ? errors : 'tiada');
  console.log('carian tab staf:', searchVisibleOk(staffUi, searchOk));
  console.log('jalur tarikh melekat:', sticky.flush ? 'lulus' : 'GAGAL',
    `(aktif: ${sticky.active || 'tiada'})`);
  console.log('pemilih tarikh:', month.days ? 'lulus' : 'GAGAL',
    `(${month.days} hari, ${month.title})`);
  console.log('lompat tarikh:', jumped.closed && jumped.active === jumpDate && jumped.aligned ? 'lulus' : 'GAGAL',
    `(aktif: ${jumped.active || 'tiada'}, sejajar: ${jumped.aligned})`);
  console.log('kembali ke senarai:', backToAgenda.visible && backToAgenda.height > 0 && backToAgenda.varHeight === backToAgenda.height ? 'lulus' : 'GAGAL',
    `(tinggi: ${backToAgenda.height}, var: ${backToAgenda.varHeight})`);
  console.log('lebar dokumen:', overflow.doc, 'vs tetingkap:', overflow.win,
    overflow.doc > overflow.win ? '→ LIMPAHAN!' : '→ ok');
  for (const f of fs.readdirSync(OUT)) console.log('  ', f, fs.statSync(path.join(OUT, f)).size, 'bytes');
  await browser.close();
})();

function searchVisibleOk(ui, searchOk) {
  const ok = ui.searchVisible && ui.unitsHidden && searchOk;
  return `${ok ? 'lulus' : 'GAGAL'} (carian kelihatan: ${ui.searchVisible}, unit tersembunyi: ${ui.unitsHidden}, hasil tepat: ${searchOk})`;
}
