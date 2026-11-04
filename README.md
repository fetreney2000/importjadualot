# Jadual OT — SPPS-KLM

Aplikasi web mobile-first (Bahasa Melayu) untuk memaparkan roster kerja lebih masa.
Sedia untuk deploy ke Netlify: tapak statik dalam `public/` + satu Netlify Function sebagai proksi.

## Struktur

```
public/
  index.html          # Senarai / Staf / Tugas Saya + bottom tab bar
  styles.css          # mobile-first, mod gelap automatik
  app.js              # vanilla JS, tiada framework
  manifest.webmanifest / favicon.svg
  data/
    index.json            # senarai tempoh fallback
    roster-YYYY-MM.json   # data sandaran luar talian (dijana)
netlify/
  functions/
    roster.js         # GET /.netlify/functions/roster?period=2026-11
tools/
  fetch-periods.mjs   # jana semula JSON fallback
netlify.toml
```

## Cara fungsi berfungsi

Endpoint Apps Script (`exec?view=roster`) mengembalikan HTML wrapper yang
memerlukan JS (`goog.script.init` + `userHtml` terbenam) — ia tidak boleh
dipanggil terus dari pelayar (CORS + payload sandbox). Fungsi Netlify:

1. memuat turun wrapper,
2. menyahkod literal rentetan JS (lolos `\xNN` dsb.),
3. mengekstrak `const DATA = {...}` yang seimbang,
4. mengembalikan `{ ok, period, data }` sebagai JSON dengan cache
   `max-age=60, s-maxage=300`.

Aplikasi sentiasa mencuba fungsi dahulu; jika gagal, ia menggunakan JSON
sandaran dalam `public/data/`.

## Pembangunan lokal

```sh
# Uji fungsi (memerlukan internet)
node -e "require('./netlify/functions/roster.js').handler({queryStringParameters:{period:'2026-11'}}).then(r=>console.log(r.statusCode, JSON.parse(r.body).data.assignments.length))"

# Jana semula fallback (selepas roster baharu diterbitkan)
node tools/fetch-periods.mjs

# Hidang tapak statik (contoh)
npx serve public
```

## Deploy ke Netlify

**Pilihan A — Netlify Drop:** seret folder `public/` + `netlify/` … sebenarnya
seret root projek (atau `git push` seperti di bawah). Drop hanya untuk tapak
statik; fungsi memerlukan deploy melalui Git atau CLI.

**Pilihan B — Git (disyorkan):**

1. `git init && git add . && git commit -m "Jadual OT v1"`
2. Push ke GitHub/GitLab.
3. Netlify → Add new site → Import from Git.
4. Build settings: kosongkan build command, Publish directory = `public`,
   Functions directory = `netlify/functions` (atau dikesan automatik
   daripada `netlify.toml`).
5. Deploy. Fungsi tersedia di `/.netlify/functions/roster`.

**Pilihan C — Netlify CLI:**

```sh
npm i -g netlify-cli
netlify deploy --prod   # publish=public, functions=netlify/functions
```

**Env pilihan:** `ROSTER_BASE_URL` — gantikan URL Apps Script jika deployment ID berubah.

## Nota

- Bahasa UI: Bahasa Melayu. Status seperti `CLAIM_CLOSED` dipetakan kepada
  `TUNTUTAN DITUTUP`.
- `tools/fetch-periods.mjs` menemui tempoh terkini sendiri daripada API —
  tiada kebergantungan pada fail luar.
