# JadualOT

Paparan roster kerja lebih masa SPPS-KLM yang pantas, jelas dan mesra telefon.
Antara muka direka semula sepenuhnya daripada aplikasi Apps Script asal — chrome
neutral, warna hanya untuk data, dan susun atur yang menyesuaikan diri dari
telefon hingga desktop.

- **Senarai** — agenda syif mengikut hari, jalur tarikh, tapisan unit dan
  penapis perubahan.
- **Staf** — semua staf dalam tempoh semasa, kad boleh dikembangkan.
- **Tugas Saya** — pilih nama sekali, peranti mengingatinya, dan hanya syif
  anda dipaparkan.
- **Mod gelap automatik**, sasaran sentuh 38–42px, dan manifest PWA.
- **Boleh dipasang** — service worker menyimpan app shell, data sandaran dan
  roster terakhir supaya aplikasi boleh dibuka luar talian selepas lawatan
  pertama.
- **Luar talian** — jika API gagal, roster terakhir atau data sandaran yang
  dibundel digunakan secara automatik.

## Struktur

```
public/
  index.html            # Senarai / Staf / Tugas Saya, rail + tab bar
  styles.css            # sistem reka bentuk, tema terang/gelap
  app.js                # vanilla JS, tiada framework
  sw.js                 # service worker: app shell + cache data/API
  _headers              # header cache/keselamatan untuk aset statik
  favicon.svg
  manifest.webmanifest
  icons/                # ikon 192/512, maskable dan apple-touch-icon
  data/
    index.json          # senarai tempoh sandaran
    roster-YYYY-MM.json # data sandaran luar talian
worker/
  index.js              # router: /api/* → Worker, selebihnya aset statik
  roster.js             # proksi: GET /api/roster?period=YYYY-MM
wrangler.jsonc          # konfigurasi Worker + aset public/
tools/
  preview.cjs           # pelayan statik + mock API (port 4173)
  test-handler.cjs      # ujian pengendali Worker tanpa deploy
  check-frontend.cjs    # semakan id/CSS/kelas/data/PWA
  shots.cjs             # tangkapan skrin puppeteer-core (Windows + Edge)
  fetch-periods.mjs     # jana semula JSON sandaran
```

## Cara data berfungsi

Endpoint Apps Script (`exec?view=roster`) mengembalikan pembalut HTML yang
memerlukan JS (`goog.script.init` + `userHtml` terbenam), jadi ia tidak boleh
dipanggil terus dari pelayar (CORS + payload sandbox). Worker:

1. memuat turun pembalut,
2. menyahkod literal rentetan JS (`\xNN`, `\uNNNN`, dsb.),
3. mengekstrak objek `const DATA = {...}` yang seimbang,
4. menyimpan JSON bersih dalam Cache API Cloudflare selama 5 minit,
5. mengembalikan `{ ok, period, data }` dengan cache
   `max-age=60, s-maxage=300, stale-while-revalidate=600`.

Aplikasi sentiasa mencuba `/api/roster` dahulu. Jika ia gagal atau peranti luar
talian, JSON dalam `public/data/` digunakan dan pengguna dimaklumkan.

`public/_headers` hanya terpakai pada aset statik; header respons API ditetapkan
terus dalam `worker/roster.js`. Fail `sw.js` dihidangkan dengan
`Cache-Control: no-cache` supaya kemas kini service worker cepat dikesan.

## PWA dan mod luar talian

Selepas lawatan pertama, service worker (`public/sw.js`) mendaftar dan menyimpan:

- **app shell** — HTML, CSS, JS, manifest dan semua ikon;
- **data sandaran** — `data/index.json` serta setiap `roster-YYYY-MM.json`;
- **API roster** — respons terakhir bagi setiap tempoh yang dibuka;
- **fon Google** — stylesheet dan fail fon yang sempat dimuatkan.

Strategi cache:

| Permintaan | Strategi |
| --- | --- |
| Navigasi halaman | network-first, fallback app shell |
| `/api/roster` | network-first, fallback respons terakhir (ditanda offline) |
| `/data/*.json` | stale-while-revalidate |
| Aset shell | stale-while-revalidate |
| Fon Google | cache-first / stale-while-revalidate |

Jika API tidak dapat dihubungi, respons cache ditandakan dengan
`X-Jadualot-Cache: offline`; UI memaparkan "Mod luar talian" dan toast yang
sesuai. Jika tempoh itu belum pernah dibuka, data sandaran yang dibundel
digunakan.

Untuk memasang: di Chromium, butang pasang (ikon muat turun) muncul di bar
atas apabila aplikasi layak dipasang. Anda juga boleh memilih **Install app**
daripada menu pelayar, atau di iOS Safari memilih **Share → Add to Home
Screen**. PWA memerlukan HTTPS (atau `localhost` semasa pembangunan).

Apabila menukar strategi cache atau senarai aset shell, naikkan `VERSION` dalam
`public/sw.js` supaya cache lama dibuang semasa activation.

## Pembangunan lokal

```sh
npm install          # puppeteer-core + wrangler
npm run dev          # http://localhost:8787 — Worker + aset sebenar
npm run preview      # http://localhost:4173 — statik + mock API
npm run check        # semakan integriti id, token CSS, kelas, data, PWA
npm test             # uji pengendali Worker (tanpa Cache API)
npm run shots        # tangkapan skrin ke shots/ (perlu Edge di Windows)
npm run data:refresh # jana semula public/data/ daripada sumber langsung
```

`npm run dev` menggunakan Wrangler dan menyediakan kedua-dua aset statik serta
`/api/roster` sebenar, termasuk Cache API tempatan. `npm run preview` lebih
ringan: ia memetakan `/api/roster` kepada fail JSON sandaran, jadi UI boleh
diuji tanpa rangkaian.

Service worker juga aktif semasa pembangunan. Jika perubahan UI tidak muncul,
buka DevTools → **Application → Service Workers** dan pilih **Update on reload**
atau **Unregister**, kemudian muat semula. Ujian luar talian yang paling
realistik ialah hentikan pelayan (`Ctrl+C`) dan muat semula halaman.

Env pilihan untuk pembangunan lokal — cipta `.dev.vars`:

```
ROSTER_BASE_URL=https://script.google.com/macros/s/.../exec
```

## Deploy ke Cloudflare Workers

**Pilihan A — Workers Builds (Git, disyorkan):**

1. Push repositori ini ke GitHub.
2. Cloudflare Dashboard → **Workers & Pages** → **Create** →
   **Import a repository** (Workers Builds).
3. Pilih repo dan branch `main`, root directory `/`.
4. Tetapan build:
   - **Build command:** `npm run check`
   - **Deploy command:** `npm run deploy`
   - **Non-production branch deploy command:** `npx wrangler preview`
5. Simpan dan deploy. Nama Worker dalam dashboard mesti `jadualot`, sama
   dengan `name` dalam `wrangler.jsonc`.

`npx wrangler preview` menggunakan Worker Previews dan memerlukan blok
`"previews": {}` dalam `wrangler.jsonc` (sudah disertakan). Jika anda menukar
arahan deploy bukan production kepada `npx wrangler versions upload`, blok itu
tidak diperlukan.

Setiap branch selain `main` menghasilkan URL pratonton Workers Builds dan komen
PR. Uji `https://<preview-url>/api/roster?period=2026-11` sebelum merge.

**Pilihan B — Wrangler CLI:**

```sh
npx wrangler login
npm run deploy
```

**Env pilihan:** `ROSTER_BASE_URL` — gantikan URL Apps Script jika deployment
ID berubah. Tetapkan di dashboard Worker → **Settings** → **Variables and
Secrets** (atau dalam `.dev.vars` untuk lokal).

**Domain tersuai:** memerlukan zon DNS dikendalikan oleh Cloudflare. Jika belum,
gunakan URL `https://jadualot.<subdomain>.workers.dev` sehingga DNS dipindahkan.

## Nota

- Bahasa UI: Bahasa Melayu. Status seperti `CLAIM_CLOSED` dipetakan kepada
  `Tuntutan ditutup`.
- `tools/fetch-periods.mjs` menemui tempoh terkini sendiri daripada API —
  tiada kebergantungan pada fail luar.
- Tangkapan skrin dalam `shots/` tidak disimpan dalam Git (lihat
  `.gitignore`).
- Migrasi daripada Netlify: `netlify/` dan `netlify.toml` telah dibuang;
  endpoint lama `/.netlify/functions/roster` digantikan dengan `/api/roster`.
