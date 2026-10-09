/* Isi URL backend untuk mengirim event pindai ke POST /scan.
   Dibiarkan kosong = aplikasi jalan penuh di perangkat (event ditandai 'lokal'). */
const SCAN_API = '';

const CATALOG = [
  { id: 'setrika', name: 'Cuci + Setrika', unit: 'kg', price: 8000, hours: 48, icon: 'shirt', tone: 'blue',
    desc: 'Rendam enzimatik 20 menit, cuci 40°C, bilas tiga kali, tumbling dry, setrika uap 160°C.',
    includes: ['Detergen hypoallergenic', 'Pewangi standar', 'Lipat + wadah gratis'] },
  { id: 'kasar', name: 'Cuci Kasar', unit: 'kg', price: 6000, hours: 36, icon: 'drop', tone: 'mint',
    desc: 'Cuci dan keringkan saja tanpa setrika. Untuk handuk, sprei, dan pakaian harian.',
    includes: ['Bilas ekstra', 'Pengering suhu rendah', 'Tanpa lipatan'] },
  { id: 'steam', name: 'Steam Sanitizer', unit: 'kg', price: 12000, hours: 24, icon: 'flame', tone: 'orange',
    desc: 'Uap 130°C membunuh 99,9% bakteri dan tungau. Aman untuk bayi dan kulit sensitif.',
    includes: ['Sertifikat sanitasi', 'Kantong kedap', 'Free upgrade pewangi'] },
  { id: 'kering', name: 'Cuci Kering', unit: 'pcs', price: 35000, hours: 72, icon: 'suit', tone: 'lilac',
    desc: 'Solvent gentle untuk jas, dress, wool, sutra, dan blazer berstruktur.',
    includes: ['Treatment kerah & manset', 'Gantungan + cover', 'Perbaiki kancing longgar'] },
  { id: 'sepatu', name: 'Cuci Sepatu', unit: 'pasang', price: 45000, hours: 24, icon: 'shoe', tone: 'blue',
    desc: 'Deep clean midsole, sikat per material, deodorize, whitening sole.',
    includes: ['Insole dicuci terpisah', 'Kotak sepatu', 'Garansi 3 hari'] },
  { id: 'bedcover', name: 'Bedcover & Gorden', unit: 'pcs', price: 40000, hours: 48, icon: 'blanket', tone: 'mint',
    desc: 'Mesin kapasitas 18 kg khusus linen besar, kering merata tanpa bau apek.',
    includes: ['Anti tungau', 'Lipat vakum opsional', 'Ukuran hingga 240×220'] },
];

const ADDONS = [
  { id: 'express', name: 'Express 6 Jam', price: 25000, kind: 'flat', icon: 'bolt', note: 'Antrean didahulukan, kurir privat' },
  { id: 'stain', name: 'Treatment Noda Membandel', price: 4000, kind: 'kg', icon: 'spark', note: 'Kopi, tinta, oli, kunyit' },
  { id: 'premium', name: 'Pewangi Premium', price: 12000, kind: 'flat', icon: 'leaf', note: 'Tahan 14 hari di dalam lemari' },
  { id: 'vakum', name: 'Vakum Linen Besar', price: 15000, kind: 'flat', icon: 'box', note: 'Hemat ruang 60%' },
  { id: 'lipat', name: 'Lipat Khusus + Kertas Tissue', price: 10000, kind: 'flat', icon: 'grid', note: 'Gaya hotel, siap masuk koper' },
];

const STAGES = [
  { label: 'Diterima', note: 'Ditagih di kasir, foto kondisi, berat ditimbang', icon: 'check' },
  { label: 'Timbang & Label', note: 'Label tahan air ditempel per item', icon: 'tag' },
  { label: 'Rendam', note: 'Enzimatik soak 20 menit pada noda berat', icon: 'drop' },
  { label: 'Cuci', note: 'Mesin front-load, suhu sesuai kode perawatan', icon: 'drum' },
  { label: 'Bilas', note: 'Tiga bilasan, netraliser pH', icon: 'water' },
  { label: 'Keringkan', note: 'Tumbling dry 60°C, sensor kelembapan', icon: 'wind' },
  { label: 'Setrika', note: 'Uap 160°C, meja vakum hisap', icon: 'iron' },
  { label: 'QC & Lipat', note: 'Cek noda sisa, lipat, masuk wadah', icon: 'grid' },
  { label: 'Selesai', note: 'Siap ambil atau diserahkan ke kurir', icon: 'star' },
];

const STAGE_MIN = [15, 25, 40, 75, 45, 60, 70, 40, 0];

const STAGE_MACHINE = { 2: 'wash', 3: 'wash', 4: 'wash', 5: 'dry', 6: 'steam' };

const SEED = {
  orders: [
    { code: 'BUSA-4471', customer: 'Rania Sekar', phone: '0812-7781-4402', stage: 3, weight: 6.5, mode: 'pickup',
      items: [{ id: 'setrika', qty: 6.5 }], addons: ['premium'], total: 64000, priority: 'reguler',
      slot: { date: '2026-10-07', time: '10:00–12:00' }, courier: '—', machine: 'M-03',
      notes: 'Pisahkan baju bayi, jangan dicampur.', created: 'Hari ini 08:12' },
    { code: 'BUSA-4470', customer: 'Bagaswirawan', phone: '0811-2043-9987', stage: 7, weight: 11, mode: 'delivery',
      items: [{ id: 'setrika', qty: 8 }, { id: 'bedcover', qty: 1 }, { id: 'kasar', qty: 3 }], addons: ['stain'], total: 112000, priority: 'express',
      slot: { date: '2026-10-06', time: '14:00–16:00' }, courier: 'Yudha P.', machine: 'M-01',
      notes: 'Bedcover motif daun, lipat jadi dua.', created: 'Kemarin 16:44' },
    { code: 'BUSA-4469', customer: 'Nadira Ayu Lestari', phone: '0857-3300-1188', stage: 8, weight: 4, mode: 'pickup',
      items: [{ id: 'kering', qty: 2 }, { id: 'sepatu', qty: 1 }], addons: [], total: 115000, priority: 'reguler',
      slot: { date: '2026-10-05', time: '08:00–10:00' }, courier: '—', machine: 'M-05',
      notes: '', created: '5 Okt 19:02' },
    { code: 'BUSA-4468', customer: 'Kantor Desa Mekarjaya', phone: '022-445-1177', stage: 5, weight: 28, mode: 'delivery',
      items: [{ id: 'setrika', qty: 20 }, { id: 'steam', qty: 8 }], addons: ['vakum', 'stain'], total: 316000, priority: 'reguler',
      slot: { date: '2026-10-08', time: '07:00–09:00' }, courier: 'Sinta R.', machine: 'M-02',
      notes: 'Seragam ASN. Kerah harus rapi, kirim 3 dus.', created: 'Hari ini 06:30' },
    { code: 'BUSA-4467', customer: 'Tommy Halim', phone: '0819-6650-0021', stage: 2, weight: 7.2, mode: 'pickup',
      items: [{ id: 'setrika', qty: 7.2 }], addons: ['express'], total: 82600, priority: 'express',
      slot: { date: '2026-10-07', time: '16:00–18:00' }, courier: '—', machine: 'M-04',
      notes: 'Butuh sebelum acara 20:00.', created: 'Hari ini 09:40' },
    { code: 'BUSA-4466', customer: 'Aisyah Ramdhani', phone: '0813-2277-5590', stage: 1, weight: 3.4, mode: 'delivery',
      items: [{ id: 'bedcover', qty: 2 }], addons: [], total: 80000, priority: 'reguler',
      slot: { date: '2026-10-09', time: '10:00–12:00' }, courier: 'Yudha P.', machine: '—',
      notes: '', created: 'Hari ini 10:05' },
    { code: 'BUSA-4465', customer: 'Hendra Wijaya', phone: '0878-1120-3345', stage: 0, weight: 15, mode: 'pickup',
      items: [{ id: 'setrika', qty: 10 }, { id: 'steam', qty: 5 }], addons: ['premium', 'stain'], total: 180000, priority: 'reguler',
      slot: { date: '2026-10-09', time: '12:00–14:00' }, courier: '—', machine: '—',
      notes: 'Baju kerja + sprei dua set.', created: 'Hari ini 10:58' },
    { code: 'BUSA-4464', customer: 'Kirana Buana', phone: '0812-9900-7733', stage: 8, weight: 9, mode: 'delivery',
      items: [{ id: 'setrika', qty: 9 }], addons: [], total: 72000, priority: 'reguler',
      slot: { date: '2026-10-04', time: '08:00–10:00' }, courier: 'Sinta R.', machine: 'M-06',
      notes: '', created: '4 Okt 11:20' },
    { code: 'BUSA-4463', customer: 'Depot Kopi Tuku', phone: '0821-4477-0910', stage: 4, weight: 22, mode: 'delivery',
      items: [{ id: 'setrika', qty: 14 }, { id: 'bedcover', qty: 8 }], addons: ['stain'], total: 448000, priority: 'reguler',
      slot: { date: '2026-10-08', time: '16:00–18:00' }, courier: 'Bagas W.', machine: 'M-02',
      notes: 'Apron kena kopi, butuh treatment noda.', created: 'Hari ini 07:15' },
    { code: 'BUSA-4462', customer: 'Meilani Putri', phone: '0896-3312-8845', stage: 6, weight: 5.5, mode: 'pickup',
      items: [{ id: 'kering', qty: 5.5 }], addons: ['lipat'], total: 46000, priority: 'reguler',
      slot: { date: '2026-10-07', time: '18:00–20:00' }, courier: '—', machine: 'M-05',
      notes: '', created: 'Kemarin 13:31' },
  ],

  machines: [
    { id: 'M-01', model: 'Front Load 12 kg', cap: 12, kind: 'wash', stage: 5, rpm: 5, temp: 62, load: 78, left: 22, ticket: 'BUSA-4470', state: 'run' },
    { id: 'M-02', model: 'Front Load 18 kg', cap: 18, kind: 'wash', stage: 3, rpm: 8, temp: 41, load: 92, left: 47, ticket: 'BUSA-4468', state: 'run' },
    { id: 'M-03', model: 'Top Load 9 kg', cap: 9, kind: 'wash', stage: 2, rpm: 11, temp: 34, load: 41, left: 31, ticket: 'BUSA-4467', state: 'run' },
    { id: 'M-04', model: 'Dryer 15 kg', cap: 15, kind: 'dry', stage: 4, rpm: 3, temp: 71, load: 66, left: 14, ticket: 'BUSA-4463', state: 'hot' },
    { id: 'M-05', model: 'Steam Press', cap: 6, kind: 'steam', stage: 6, rpm: 0, temp: 128, load: 24, left: 8, ticket: 'BUSA-4464', state: 'vent' },
    { id: 'M-06', model: 'Dry Clean 10 kg', cap: 10, kind: 'dryclean', stage: 0, rpm: 0, temp: 26, load: 0, left: 0, ticket: '—', state: 'idle' },
  ],

  revenue: [
    { d: '24', v: 1420, n: 18 }, { d: '25', v: 1980, n: 24 }, { d: '26', v: 1640, n: 21 },
    { d: '27', v: 2410, n: 29 }, { d: '28', v: 3120, n: 36 }, { d: '29', v: 2760, n: 33 },
    { d: '30', v: 1890, n: 23 }, { d: '01', v: 2240, n: 27 }, { d: '02', v: 2980, n: 35 },
    { d: '03', v: 3410, n: 41 }, { d: '04', v: 2670, n: 31 }, { d: '05', v: 2050, n: 25 },
    { d: '06', v: 2890, n: 34 }, { d: '07', v: 3640, n: 43 },
  ],

  mix: [
    { label: 'Cuci + Setrika', pct: 46, tone: 'blue' },
    { label: 'Cuci Kering', pct: 18, tone: 'lilac' },
    { label: 'Cuci Kasar', pct: 15, tone: 'mint' },
    { label: 'Bedcover', pct: 12, tone: 'amber' },
    { label: 'Steam', pct: 9, tone: 'orange' },
  ],

  staff: [
    { name: 'Wulan A.', role: 'Ahli Noda', done: 148, rating: 4.9, tag: 'Kopi & tinta' },
    { name: 'Dodo Prayoga', role: 'Operator Mesin', done: 132, rating: 4.7, tag: 'Heavy load' },
    { name: 'Sinta R.', role: 'Kurir', done: 96, rating: 4.95, tag: 'Rute timur' },
    { name: 'Kanda B.', role: 'Setrika Uap', done: 88, rating: 4.6, tag: 'Blazer & kemeja' },
  ],

  txns: [
    { id: 'TX-9921', type: 'pay', label: 'Bayar BUSA-4471', amount: -64000, at: '07 Okt 08:14', status: 'sukses' },
    { id: 'TX-9915', type: 'topup', label: 'Top up via GoPay', amount: 300000, at: '06 Okt 20:02', status: 'sukses' },
    { id: 'TX-9908', type: 'cashback', label: 'Cashback loyalitas 5%', amount: 12400, at: '05 Okt 17:30', status: 'sukses' },
    { id: 'TX-9901', type: 'pay', label: 'Bayar BUSA-4464', amount: -72000, at: '04 Okt 12:05', status: 'sukses' },
    { id: 'TX-9894', type: 'refund', label: 'Refund treatment noda', amount: 15000, at: '03 Okt 09:44', status: 'diproses' },
    { id: 'TX-9887', type: 'topup', label: 'Transfer bank BCA', amount: 500000, at: '01 Okt 15:20', status: 'sukses' },
  ],

  promos: [
    { code: 'BUSA10', kind: 'pct', value: 10, cap: 20000, label: 'Potongan 10%', terms: 'Maks. Rp 20.000 · min. 3 kg · tidak berlaku express' },
    { code: 'KURIRHEMAT', kind: 'flat', value: 15000, cap: 15000, label: 'Gratis antar-jemput', terms: 'Radius 8 km · min. belanja Rp 80.000' },
    { code: 'SPREI2', kind: 'flat', value: 20000, cap: 20000, label: 'Potongan linen besar', terms: 'Khusus bedcover/gorden, 2 pcs pertama' },
  ],

  gallery: [
    { seed: 'folded-towels-stack', label: 'Handuk hotel lipit', meta: 'QC 07 Okt' },
    { seed: 'denim-laundry-blue', label: 'Denim raw indigo', meta: 'Cuci dingin 30°' },
    { seed: 'steam-iron-shirt', label: 'Kemeja poplin', meta: 'Uap 160°' },
    { seed: 'sneaker-cleaning-brush', label: 'Sneaker putih', meta: 'Sole whitening' },
    { seed: 'linen-bedcover-cream', label: 'Linen krem', meta: 'Vakum 60%' },
    { seed: 'laundry-basket-wicker', label: 'Keranjang anyam', meta: 'Siap antar' },
  ],

  addresses: [
    { id: 'a1', tag: 'Rumah', label: 'Jl. Cendana Raya No. 12, Bandung 40115', def: true },
    { id: 'a2', tag: 'Kantor', label: 'Gedung Sabda Lt. 4, Jl. Riau No. 88', def: false },
  ],

  slots: ['07:00–09:00', '08:00–10:00', '10:00–12:00', '12:00–14:00', '14:00–16:00', '16:00–18:00', '18:00–20:00'],

  chat: [
    { from: 'bot', text: 'Selamat datang di BUSA. Ada yang bisa dibantu soal cucian hari ini?' },
    { from: 'me', text: 'Paket bedcover saya bisa kena noda kunyit nggak?' },
    { from: 'bot', text: 'Bisa. Treatment noda kunyit masuk tahap Rendam enzimatik 20 menit. Success rate 94% untuk linen katun. Mau saya tambahkan ke pesanan BUSA-4466?', q: true },
  ],

  activity: [
    { t: '10:58', text: 'Pesanan baru BUSA-4465 masuk dari walk-in', tone: 'orange', icon: 'plus' },
    { t: '10:41', text: 'M-02 naik ke tahap Cuci · 41°C', tone: 'blue', icon: 'drum' },
    { t: '10:22', text: 'Sinta R. berangkat antar BUSA-4470', tone: 'mint', icon: 'truck' },
    { t: '09:55', text: 'QC gagal 1 item — BUSA-4463, noda kopi sisa', tone: 'red', icon: 'alert' },
    { t: '09:30', text: 'Stok detergen premium turun di bawah 20 L', tone: 'amber', icon: 'box' },
    { t: '08:44', text: 'Wulan A. menutup 12 treatment noda semalam', tone: 'lilac', icon: 'spark' },
  ],

  faq: [
    { q: 'Berapa lama cycle standar?', a: 'Cuci + Setrika 48 jam sejak diterima. Express 6 jam dengan antrean didahulukan dan kurir privat.' },
    { q: 'Bagaimana kalau noda tidak hilang?', a: 'Kami foto sebelum-sesudah. Jika noda membandel tetap ada setelah dua kali treatment, biaya treatment dikembalikan 100%.' },
    { q: 'Pakaian hilang atau rusak?', a: 'Setiap item diberi label unik dan diasuransikan hingga Rp 500.000 per item. Klaim diproses maksimal 3 hari kerja.' },
    { q: 'Bayar apa saja yang diterima?', a: 'Dompet BUSA, QRIS, transfer bank, tunai di kasir. Kontrak rutin bisa penagihan bulanan.' },
    { q: 'Apakah pakaian dicampur dengan pelanggan lain?', a: 'Tidak. Setiap pesanan jalan di drum sendiri dengan label tahan air. Bedcover dan linen besar memakai mesin 18 kg terpisah.' },
    { q: 'Bagaimana jika saya tidak di rumah saat dijemput?', a: 'Kurir menunggu 15 menit dan mengirim foto bukti. Anda bisa pindahkan slot lewat portal pelanggan tanpa biaya.' },
  ],

  testimonials: [
    { name: 'Kirana Buana', role: 'pemilik kos 14 pintu', seed: 'portrait-kirana', text: 'Dulu saya cuci sendiri tiap Minggu. Sekarang 26 kg naik kurir tiap Selasa, balik sudah rapi. Stempel ketujuh itu nyata, bukan gimmick.', stars: 5 },
    { name: 'Depot Kopi Tuku', role: 'klien apron & linen bar', seed: 'portrait-tommy', text: 'Noda kopi paling bandel di apron kami turun semua. Foto sebelum-sesudah dikirim ke WA, jadi saya tidak perlu datang ke tempat.', stars: 5 },
    { name: 'Nadira Ayu', role: 'ibu dua balita', seed: 'portrait-nadira', text: 'Steam sanitizer buat baju bayi yang saya cari. Bau apek hilang, dan saya bisa lihat posisi cucian dari HP tanpa nanya ke kasir.', stars: 4 },
    { name: 'Hendra Wijaya', role: 'pengusaha katering', seed: 'portrait-hendra', text: 'Kontrak bulanan, penagihan rapi, tidak pernah telat jemput. Satu-satunya laundry yang saya berani titip seragam 28 orang.', stars: 5 },
    { name: 'Aisyah Ramdhani', role: 'penghuni apartemen', seed: 'portrait-aisyah', text: 'Bedcover 240 saya muat dan kering merata. Nggak ada lagi bau lembap waktu dilipat.', stars: 5 },
    { name: 'Tommy Halim', role: 'freelancer ber-jas', seed: 'portrait-tommy2', text: 'Express 6 jam menyelamatkan presentasi saya. Kurir privat, sampai 40 menit lebih awal dari janji.', stars: 5 },
  ],

  areas: [
    { kec: 'Buahbatu', eta: '2 jam', kode: 'BBU', slot: 6 },
    { kec: 'Mandalajung', eta: '3 jam', kode: 'MDJ', slot: 5 },
    { kec: 'Cicadas', eta: '3 jam', kode: 'CCA', slot: 4 },
    { kec: 'Panyileukan', eta: '4 jam', kode: 'PNY', slot: 4 },
    { kec: 'Cinambo', eta: '4 jam', kode: 'CNB', slot: 3 },
    { kec: 'Arcamanik', eta: '5 jam', kode: 'ARM', slot: 5 },
    { kec: 'Coblong', eta: '6 jam', kode: 'CBL', slot: 2 },
    { kec: 'Sukajadi', eta: '6 jam', kode: 'SKJ', slot: 3 },
  ],

  tiers: [
    { id: 'basic', name: 'Cucian Lepas', price: 0, unit: 'per order', tone: 'muted', best: 'Untuk yang kadang-kadang', perks: ['Harga per kg normal', 'Lacak siklus real-time', 'Stempel loyalti 7→1', 'Bayar QRIS / tunai'] },
    { id: 'premium', name: 'Rutin Mingguan', price: 149000, unit: 'per bulan', tone: 'blue', best: 'Hemat 18% untuk 4 angkatan', perks: ['Kuota 40 kg / bulan', 'Antar-jemput gratis tanpa minimum', 'Prioritas antrean di atas reguler', 'Treatment noda 2× gratis / bulan', 'Pewangi premium termasuk'] },
    { id: 'bisnis', name: 'Kemitraan Bisnis', price: 499000, unit: 'per bulan', tone: 'orange', best: 'Kos, kafe, kantor, laundry hotel', perks: ['Kuota 150 kg / bulan', 'Penagihan bulanan + invoice', 'Kurir khusus jam operasional Anda', 'SLA 24 jam dengan denda 10%', 'Dashboard pemakaian per cabang'] },
  ],

  persona: { name: 'Rania Sekar', phone: '0812-7781-4402', member: 'premium', since: 'Maret 2025', tier: 'Pelanggan Rutin' },

  metrics: [
    { n: '12.480', l: 'kg ditangani / bulan' },
    { n: '98,4%', l: 'selesai tepat waktu' },
    { n: '6 jam', l: 'express tercepat' },
    { n: '4,9', l: 'rata-rata 812 ulasan' },
  ],

};
