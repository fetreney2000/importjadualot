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
- **Mod gelap automatik**, sasaran sentuh 38–42px, dan manifest PWA asas.
- **Luar talian** — jika API gagal, data sandaran yang dibundel digunakan
  secara automatik.

## Struktur

```
public/
  index.html            # Senarai / Staf / Tugas Saya, rail + tab bar
  styles.css            # sistem reka bentuk, tema terang/gelap
  app.js                # vanilla JS, tiada framework
  _headers              # header cache/keselamatan untuk aset statik
  favicon.svg
  manifest.webmanifest
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
  check-frontend.cjs    # semakan id/CSS/kelas/data
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
terus dalam `worker/roster.js`.

## Pembangunan lokal

```sh
npm install          # puppeteer-core + wrangler
npm run dev          # http://localhost:8787 — Worker + aset sebenar
npm run preview      # http://localhost:4173 — statik + mock API
npm run check        # semakan integriti id, token CSS, kelas, data
npm test             # uji pengendali Worker (tanpa Cache API)
npm run shots        # tangkapan skrin ke shots/ (perlu Edge di Windows)
npm run data:refresh # jana semula public/data/ daripada sumber langsung
```

`npm run dev` menggunakan Wrangler dan menyediakan kedua-dua aset statik serta
`/api/roster` sebenar, termasuk Cache API tempatan. `npm run preview` lebih
ringan: ia memetakan `/api/roster` kepada fail JSON sandaran, jadi UI boleh
diuji tanpa rangkaian.

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
   - **Non-production branch deploy command:** biarkan lalai
     (`npx wrangler versions upload`)
5. Simpan dan deploy. Nama Worker dalam dashboard mesti `jadualot`, sama
   dengan `name` dalam `wrangler.jsonc`.

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
