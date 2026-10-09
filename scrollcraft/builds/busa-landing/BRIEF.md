# BRIEF — BUSA Laundry Ops, halaman publik

Mode: `Self-authored under explicit creative delegation`.
Pengguna mendelegasikan arah kreatif ("terserah kamu, yang penting lengkap dan tidak
templated"), dan pada giliran ini hanya meminta: pisahkan pelanggan/admin, buat landing
page, lalu gerakkan semuanya dengan GSAP + scroll-craft + tilt. Delapan pertanyaan
wawancara dijawab dalam suara brand, ditandai sebagai keputusan yang diarang sendiri.

## 1. Vibe (3-5 kata) + referensi lintas medium

Kata: **basah, mekanis, jujur, hangat, berputar**.
Referensi bukan situs: papan LED binatu coin-op 1998; suara drum front-load dari ruang
sebelah; kwitansi timbang pasar yang dicetak dot-matrix; serial "keranjang datang,
keranjang balik".

## 2. Perjalanan pengunjung, per bagian (urutan mereka)

1. Lihat lantai kerja nyata, sedang berputar, tanpa klaim marketing.
2. Sadar ada satu pesanan yang tidak bisa dijelaskan ("hampir selesai" versi laundry lain).
3. Masuk ke dalam drum: sembilan tahap dibakar satu per satu dengan jam nyata.
4. Coba kendalikan: atur berat, pilih slot, lihat harga dan ETA menjawab.
5. Lihat angka operasional yang benar-benar dihitung dari state aplikasi.
6. Tinggalkan nomor telepon + alamat di form yang sama yang dipakai aplikasi aslinya.

## 3. Kurva energi

Tenang-tenang-tenang → **puncak** (bagian 3) → interaktif → padat-angka → hening satu
lapangan → selesai. Bagian 2 sengaja dibuat sunyi (satu strip status, hampir kosong) agar
puncak punya sesuatu untuk berubah dari. Kesunyian ini **diarang**, bukan sisa: tidak ada
dead scroll yang tidak direncanakan.

## 4. Kurva perasaan (satu baris per babak: emosi, lalu penyebabnya di layar)

| # | Emosi | Penyebab di layar |
|---|---|---|
| 1 | Kenal / gelisah | papan mesin nyata, drum benar-benar berputar, hitungan berjalan |
| 2 | Ragu | satu empty state telanjang: status "Diterima", nol informasi lanjutan |
| 3 | Kejelasan (**puncak**) | permukaan ditahan (pin), pintu drum membuka (iris reveal), sembilan tahap dibakar dengan jam |
| 4 | Kontrol | slider berat + slot jemput; kwitansi dan ETA menjawab seketika |
| 5 | Yakin | utilisasi mesin, komposisi layanan, jam selesai staf — semua dihitung dari state |
| 6 | Siap | satu kolom input nyata dengan kursor di dalamnya, ditambah jejak log pengunjung |

Tidak ada dua babak berurutan dengan emosi yang sama.

## 5. Puncak

Kalimat yang akan diucapkan pengunjung ke temannya:
> "Halaman depannya itu panel laundry yang beneran jalan, terus pas kita scroll, kita
> masuk ke dalam drumnya dan sembilan tahap cucian nge-run di depan mata."

Puncak = babak 3. Dapat span terbesar (3,4 tinggi viewport), dapat sunyi sebelumnya, dan
satu-satunya babak yang memakai pin + reveal sekaligus. Babak lain di-demote: tanpa pin,
tanpa dwell.

## 6. Uji "cerita ke orang lain"

"Itu situs yang **bisa Anda putar cepat cuma dengan scroll lebih kencang, dan di ujung
bawah ada drum yang menampung label setiap bagian yang sudah Anda lewati**."

Blank-nya adalah pengalaman yang terjadi *pada* pengunjung, bukan nama perangkat.

## 7. Jangkauan dari premium-minimal

Editorial-dense dengan satu aksen. Halaman ini **bukan** dark-luxury: kanvas krem sabun,
tinta arang, satu aksen oranye-sinyal (tinta/aksen kedua, ultramarin, hanya untuk data
mesin). Keluarga estetika: dense + editorial, karena produknya memang permukaan kerja.

## 8. Aset

Tidak ada foto brand. Tidak ada pembangkitan berbayar (KIE_AI_API_KEY tidak dipakai).
Aset yang ada: fotografi drum/lipatan dari picsum sebagai *textur dokumenter*, dan mesin
SVG/CSS yang digambar sendiri. Angka-angka operasional dihitung dari state aplikasi;
angka pemasaran (kg/bulan, jumlah ulasan) adalah **data contoh berlabel** dan wajib
diganti sebelum tayang.

## Grammar yang dipilih: 2.3 Live surface

Halaman adalah aplikasi yang benar-benar berjalan, bukan tangkapan layar. Permukaan nyata
dengan logika nyata (`S.machines`, `S.orders`, `calc()`), diberi label "data contoh" di
wajahnya. Chrome = chrome aplikasi (rail, status bar, ticker), bukan bar wordmark + CTA.
Penutup = input nyata, bukan tombol magnetik. Ini memenuhi aturan kejujuran: setiap panel
dihitung, bukan dilukis.

Kenang tujuh grammar lain kalah:

- **Filmic one-shot** — membawa beban bukti dan justru adalah template yang dihindari; juga
  melarang lebih dari satu pintu masuk, padahal halaman ini harus bisa dilompati.
- **Chaptered editorial** — melarang media di bawah tipografi; produknya bergerak, bukan
  dibaca.
- **Continuous world** — butuh worldflight dan aset video; biayanya pembangkitan berbayar
  yang tidak diizinkan brief.
- **Typographic poster** — melarang kartu dan melarang permukaan; membuang satu-satunya
  keunggulan brand (panel yang bisa dipakai).
- **Gallery/catalog** — cocok kalau pertanyaan pengunjung "apa pilihannya"; pertanyaan
  mereka di sini "apa saya bisa percaya".
- **Split stage** — butuh dua sisi yang diadu; kita tidak menjual before/after.
- **Rhythmic cutlist** — energi cepat untuk merek streetwear; binatu menjual ketepatan.

## Signature move (bespoke, satu ini saja)

**"Drum penampung"**: chrome bawah halaman adalah pintu bundar yang sekaligus bilah
progres. Level air/busa naik mengikuti progres gulir; setiap batas babak yang dilewati
menempelkan satu **label cucian** (chip data nyata dari babak itu) ke dalam drum dan label
itu tinggal di sana; saat pengunjung mencapai form penutup, drum menyelesaikan satu
putaran dan label-label dilipat keluar menjadi satu baris rekap nyata ("6 babak dilewati
· 9 tahap dilihat · 14:32"). Ditambah turunan tunggal: **kecepatan gulir menaikkan RPM
semua drum** di halaman (satu properti kustom). Keduanya hidup di objek chrome yang sama.

## Papan skor perangkat

| Babak | Perangkat | Kenapa yang ini |
|---|---|---|
| 1 Kenal | `flow` + `in` (stagger pendek), `count` telemetry nyata | permukaan mengisi sendiri = argumennya |
| 2 Ragu | `reveal` iris ke strip sunyi | perubahan state, bukan hiasan; ini sunyi sebelum puncak |
| 3 Kejelasan (puncak) | `pin` (span 3,4vh, dwell) + bakar sembilan tahap dari `--bc-p` | permukaan menahan sementara state berjalan = grammar ini |
| 4 Kontrol | `pan` lateral rail layanan + kontrol pointer (slider/slot) | perjalanan lateral dibaca "pilihan"; vertikal dibaca "argumen" |
| 5 Yakin | `flow` + parallax di kolom media, `count` | angka datang di permukaan yang sudah dikenal |
| 6 Siap | `in` pendek pada input nyata | penutup menyerahkan permukaan, tidak fade out |

Empat keluarga perangkat berbeda (flow/in, reveal, pin, pan, count, pointer), tidak ada
dua yang sama berurutan, satu `scrub` atau kurang, satu puncak dengan span terbesar.

## Aturan keras yang ditaati

Tanpa scroll cue, tanpa `01 / 06`, tanpa em dash terlihat, eyebrow maksimal 1 per 3 judul,
tanpa grid kartu identik, tanpa klaim besar 6rem di luar momen hero, tanpa angka karangan
(angka demo dilabeli), transisi UI di bawah 300ms, `transform`/`opacity`/`clip-path` saja,
`prefers-reduced-motion` = lebih sedikit dan lebih lembut (opasitas yang membawa makna
tetap, perpindahan posisi dihapus), fokus terlihat di semua kontrol, gerak pointer
digating ke `(hover:hover) and (pointer:fine)`.

## Yang tidak bisa diverifikasi di mesin ini

Langkah 5 scroll-craft (jalur screenshot `shoot.mjs`) butuh `playwright-core` + browser
dan CLI `agent-browser` belum terpasang di mesin ini, jadi bukti visual berupa contact
sheet **tidak** dikumpulkan. Verifikasi yang benar-benar dijalankan: `node --check`,
smoke test render via stub DOM untuk semua rute di tiga portal, audit CSS, dan aset 200.
Keterbatasan ini dinyatakan apa adanya, tidak diklaim sudah dicek.
