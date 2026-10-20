# MAHA Dewi Laundry Ops

Panel operasional **Laundry MAHA Dewi Mataram** + halaman situs publik dengan slider enam babak.
Frontend statis (HTML/CSS/JS), backend Fastify + PostgreSQL, realtime via WebSocket.

Alamat: Jl. Pantai Senggigi No.43, Pagutan Bar., Kec. Mataram, Kota Mataram, NTB 83117 · Telepon: 0895-3193-3194
Jam buka: Senin–Kamis & Sabtu 09.00–17.30, Jumat 09.00–17.00, Minggu tutup · Antar-jemput: Senin–Sabtu 17.00–21.00.

## Fitur

- **Landing slider** — 6 babak layar penuh, thumbnail, panah, swipe/scroll berurutan;
  background tiap babak dapat diunggah dari dashboard admin.
- **Portal pelanggan** — lacak kode pesanan, checkout, dompet, stempel, alamat.
- **Dashboard admin/staf** — lantai mesin real-time, pindai tahap, antrean, pesanan,
  pelanggan, layanan/harga, pembayaran (QRIS), galeri, lokasi, laporan (CSV), pengguna.
- **Halaman legal publik** — Kebijakan Privasi dan Syarat & Ketentuan (tautan di colophon landing).
- **Aksesibilitas** — slider ber-ARIA (`region`/`group`/live region), slide nonaktif `inert`,
  navigasi keyboard (←/→, PageUp/Down, Home/End), target sentuh ≥44 px, dukungan
  `prefers-reduced-motion`, dan tombol "Lewati ke konten".
- **Keamanan** — RBAC, rate limit login, audit log, CSP ketat, CORS terbatas.

## Struktur

```
index.html            shell aplikasi (SPA hash router)
privasi.html          Kebijakan Privasi (publik, statis)
syarat.html           Syarat & Ketentuan (publik, statis)
css/app.css           seluruh gaya aplikasi (landing, portal, admin)
css/legal.css         gaya halaman legal
js/                   config, data seed, ui, app, api, landing, motion, views.*, scan
img/                  aset situs (slide 01-05 + varian mobile/thumbnail)
server/               API Fastify (routes, db repo, seed, test)
e2e/                  test E2E Playwright + server statis
render.yaml           blueprint backend Render
vercel.json           konfigurasi deploy frontend Vercel (termasuk CSP)
```

## Menjalankan lokal

**Backend + frontend sekaligus (disarankan):**

```bash
cd server
npm ci
# buat server/.env
# BUSA_DATABASE_URL=postgres://...
# BUSA_JWT_SECRET=minimal-32-karakter-acak
# BUSA_SEED_PASSWORD=password-awal-anda
npm run dev
# buka http://127.0.0.1:8080
```

**Hanya frontend (tanpa API, memakai data contoh lokal):**

```bash
# dari root repo
python -m http.server 4173
# buka http://127.0.0.1:4173
```

Frontend lokal memanggil API secara relatif (lihat `js/config.js`);
di domain online alamat backend diambil dari
`<meta name="busa-api-base">` di `index.html`.

## Inisialisasi data produksi

Database produksi **jangan** memakai seed demo. Set variabel berikut, lalu reset
satu kali pada database kosong/development:

```bash
cd server
# Linux/macOS
BUSA_SEED_MODE=production BUSA_SEED_PASSWORD='password-kuat-anda' BUSA_ADMIN_NAME='Bahri' npm run db:reset
# Windows PowerShell
$env:BUSA_SEED_MODE='production'; $env:BUSA_SEED_PASSWORD='password-kuat-anda'; $env:BUSA_ADMIN_NAME='Bahri'; npm run db:reset
```

Perintah ini menghapus seluruh data lama. Seed produksi hanya membuat katalog,
area, mesin awal kosong, lokasi, dan **satu akun admin**. Order, pelanggan, staf,
promo, dan testimoni contoh tidak dibuat. Ganti password admin setelah login
pertama dan unggah QRIS/foto asli dari panel admin.

## Akun awal (seed)

| Peran | Kredensial |
|---|---|
| Admin | `admin` / `busa1234` |
| Staf | `dodo`, `sinta` / `busa1234` |
| Pelanggan | `0812-7781-4402` / `busa1234` |

> Ganti password seed lewat `BUSA_SEED_PASSWORD` **sebelum** produksi dan
> segera ubah password admin dari menu Pengguna/Profil.

## Konfigurasi server (env)

| Variabel | Keterangan |
|---|---|
| `BUSA_DATABASE_URL` / `DATABASE_URL` | connection string PostgreSQL (wajib) |
| `BUSA_JWT_SECRET` | rahasia token ≥32 karakter (disarankan) |
| `BUSA_SEED_PASSWORD` | password awal user seed (produksi: wajib diisi, minimal 8 karakter) |
| `BUSA_SEED_MODE` | `demo` atau `production`; produksi tidak mengisi order/pelanggan contoh |
| `BUSA_ADMIN_NAME` | nama akun admin saat seed produksi (default `Bahri`) |
| `BUSA_WHATSAPP` | nomor WhatsApp resmi format internasional (default `6289531933194`) |
| `BUSA_CORS_ORIGINS` | daftar origin frontend, pisahkan koma |
| `BUSA_PORT` / `PORT` | port server (default 8080) |
| `BUSA_SERVE_STATIC` | `true` = server ikut menyajikan frontend |
| `BUSA_SIMULATE` | `true` hanya untuk demo (tahap bergerak otomatis) |

> Nama variabel lingkungan `BUSA_*`, nama meta `busa-api-base`, dan domain API lama
> dipertahankan agar deployment yang sudah berjalan tetap kompatibel. Nama brand
> yang tampil ke pengunjung sudah memakai MAHA Dewi.

## Deploy

1. **Backend (Render)** — gunakan `render.yaml` (Blueprint). Isi env rahasia:
   `BUSA_DATABASE_URL`, `BUSA_JWT_SECRET`, `BUSA_SEED_PASSWORD`,
   `BUSA_CORS_ORIGINS` (domain Vercel Anda).
2. **Frontend (Vercel)** — deploy root repo. Sesuaikan
   `<meta name="busa-api-base">` di `index.html` bila backend pindah domain.
3. Health check backend: `GET /health`.

## Admin — mengatur tampilan

- **Tampilan** → 6 slot background slider (unggah/ganti/hapus, drag-drop,
  kompres otomatis ≤600 KB, disarankan rasio 16:9).
- **Lokasi** → gambar peta/alamat, atau peta Google otomatis.
- **Galeri**, **Pembayaran (QRIS)**, **Layanan/harga**, dsb.

## Test

```bash
cd server
npm run typecheck
npm test        # 65 test API/domain
```

E2E frontend (memakai **Microsoft Edge** yang terpasang — tanpa unduh browser):

```bash
# dari root repo
npm install
npm run test:e2e        # headless
npm run test:e2e:headed # melihat prosesnya
```

Cakupan E2E: slider 6 babak & navigasi berurutan, regresi daftar layanan babak 4,
header mobile tanpa overflow, halaman legal, aksesibilitas slider (ARIA, inert,
fokus keyboard, Home/End, reduced-motion), serta login admin → unggah/hapus
background slide (API dimock, tidak menyentuh database).

Checklist QA manual sebelum rilis:

- login admin/staf/pelanggan, checkout, lalu pindai tahap 0→8
- landing: panah, thumbnail, swipe/scroll (satu langkah), dark mode, HP
- landing: Tab/Shift+Tab, ←/→, Home/End, fokus terlihat, screen reader singkat
- aktifkan "kurangi gerakan" di OS → animasi slider tidak berjalan
- admin: unggah background slide, lokasi, QRIS, galeri, ekspor CSV
- pastikan tombol Portal & Jadwalkan di header landing berfungsi
- buka `privasi` dan `syarat`, cek tautan colophon & tampilan HP

## Operasional

- Pantau `GET /health` dengan uptime monitor (mis. BetterStack/UptimeRobot).
- Backup: aktifkan retensi/PITR di Neon; uji restore berkala.
- Log: Render menyimpan stdout; set `BUSA_LOG_LEVEL=info` di produksi.
- Rotasi `BUSA_JWT_SECRET` bila dicurigai bocor (semua sesi lama gugur).

## Catatan keamanan

- Token disimpan di localStorage; CSP ketat mencegah script inline.
- Jangan aktifkan `BUSA_SIMULATE` di produksi.
- Ganti seluruh password seed dan QRIS contoh sebelum menerima pesanan nyata.
