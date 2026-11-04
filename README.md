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
  favicon.svg
  manifest.webmanifest
  data/
    index.json          # senarai tempoh sandaran
    roster-YYYY-MM.json # data sandaran luar talian
netlify/
  functions/
    roster.js           # proksi: GET ?period=YYYY-MM
netlify.toml            # publish public/, functions netlify/functions
tools/
  preview.cjs           # pelayan tempatan + mock fungsi (port 4173)
  check-frontend.cjs    # semakan id/CSS/kelas/data
  shots.cjs             # tangkapan skrin puppeteer-core (Windows + Edge)
  fetch-periods.mjs     # jana semula JSON sandaran
```

## Cara data berfungsi

Endpoint Apps Script (`exec?view=roster`) mengembalikan pembalut HTML yang
memerlukan JS (`goog.script.init` + `userHtml` terbenam), jadi ia tidak boleh
dipanggil terus dari pelayar (CORS + payload sandbox). Fungsi Netlify:

1. memuat turun pembalut,
2. menyahkod literal rentetan JS (`\xNN`, `\uNNNN`, dsb.),
3. mengekstrak objek `const DATA = {...}` yang seimbang,
4. mengembalikan `{ ok, period, data }` sebagai JSON dengan cache
   `max-age=60, s-maxage=300`.

Aplikasi sentiasa mencuba fungsi dahulu. Jika ia gagal atau peranti luar
talian, JSON dalam `public/data/` digunakan dan pengguna dimaklumkan.

## Pembangunan lokal

```sh
npm install          # hanya puppeteer-core (alat tangkapan skrin)
npm run preview      # http://localhost:4173
npm run check        # semakan integriti id, token CSS, kelas, data
npm run shots        # tangkapan skrin ke shots/ (perlu Edge di Windows)
npm run data:refresh # jana semula public/data/ daripada sumber langsung
```

`npm run preview` menyediakan `public/` dan memetakan
`/.netlify/functions/roster` kepada fail JSON sandaran, jadi keseluruhan
aplikasi boleh diuji tanpa deploy.

Untuk menguji fungsi sebenar secara terus:

```sh
node -e "require('./netlify/functions/roster.js').handler({queryStringParameters:{period:'2026-11'}}).then(r=>console.log(r.statusCode, JSON.parse(r.body).data.assignments.length))"
```

## Deploy ke Netlify

**Pilihan A — Git (disyorkan):**

1. Push repositori ini ke GitHub/GitLab.
2. Netlify → **Add new site** → **Import an existing project**.
3. Tetapan build: biarkan **build command** kosong, **publish directory** =
   `public`. `netlify.toml` sudah menetapkan direktori fungsi.
4. Deploy. Fungsi tersedia di `/.netlify/functions/roster`.

**Pilihan B — Netlify CLI:**

```sh
npm i -g netlify-cli
netlify deploy --prod
```

**Pilihan C — Netlify Drop:** sesuai untuk tapak statik sahaja. Fungsi proksi
memerlukan deploy melalui Git atau CLI.

**Env pilihan:** `ROSTER_BASE_URL` — gantikan URL Apps Script jika deployment
ID berubah.

## Nota

- Bahasa UI: Bahasa Melayu. Status seperti `CLAIM_CLOSED` dipetakan kepada
  `Tuntutan ditutup`.
- `tools/fetch-periods.mjs` menemui tempoh terkini sendiri daripada API —
  tiada kebergantungan pada fail luar.
- Tangkapan skrin dalam `shots/` tidak disimpan dalam Git (lihat
  `.gitignore`).
