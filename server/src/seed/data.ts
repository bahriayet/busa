import { COURIERS } from '../domain/constants.ts';
import type {
  Addon, Area, ChatMessage, Machine, OrderItem, OrderMode, Priority, Promo,
  Service, StaffMember, Tier, WalletTx,
} from '../domain/types.ts';

export { COURIERS };

/**
 * Data contoh — port setia dari `js/data.js`.
 *
 * Dua perbedaan yang disengaja terhadap seed lama:
 *  1. Total pesanan TIDAK ditulis manual. Seed hanya menyimpan item, addon,
 *     mode, dan promo; harganya dihitung ulang oleh mesin pricing server
 *     (`domain/pricing.ts`) supaya kwitansi, laporan, dan dompet konsisten.
 *  2. Semua waktu relatif terhadap saat seed dijalankan, jadi papan lantai,
 *     label "Hari ini 08:12", dan deteksi pesanan macet tetap hidup kapan pun
 *     database dibuat ulang.
 *
 * Baris yang dihasilkan penandaan `source = 'seed'` di database, dan API
 * ikut mengirim penanda itu — angka contoh tidak pernah menyamar jadi angka asli.
 */

export const SEED_SERVICES: Service[] = [
  {
    id: 'setrika', name: 'Cuci + Setrika', unit: 'kg', price: 8000, hours: 48, icon: 'shirt', tone: 'blue',
    desc: 'Rendam enzimatik 20 menit, cuci 40°C, bilas tiga kali, tumbling dry, setrika uap 160°C.',
    includes: ['Detergen hypoallergenic', 'Pewangi standar', 'Lipat + wadah gratis'], active: true,
  },
  {
    id: 'kasar', name: 'Cuci Kasar', unit: 'kg', price: 6000, hours: 36, icon: 'drop', tone: 'mint',
    desc: 'Cuci dan keringkan saja tanpa setrika. Untuk handuk, sprei, dan pakaian harian.',
    includes: ['Bilas ekstra', 'Pengering suhu rendah', 'Tanpa lipatan'], active: true,
  },
  {
    id: 'steam', name: 'Steam Sanitizer', unit: 'kg', price: 12000, hours: 24, icon: 'flame', tone: 'orange',
    desc: 'Uap 130°C membunuh 99,9% bakteri dan tungau. Aman untuk bayi dan kulit sensitif.',
    includes: ['Sertifikat sanitasi', 'Kantong kedap', 'Free upgrade pewangi'], active: true,
  },
  {
    id: 'kering', name: 'Cuci Kering', unit: 'pcs', price: 35000, hours: 72, icon: 'suit', tone: 'lilac',
    desc: 'Solvent gentle untuk jas, dress, wool, sutra, dan blazer berstruktur.',
    includes: ['Treatment kerah & manset', 'Gantungan + cover', 'Perbaiki kancing longgar'], active: true,
  },
  {
    id: 'sepatu', name: 'Cuci Sepatu', unit: 'pasang', price: 45000, hours: 24, icon: 'shoe', tone: 'blue',
    desc: 'Deep clean midsole, sikat per material, deodorize, whitening sole.',
    includes: ['Insole dicuci terpisah', 'Kotak sepatu', 'Garansi 3 hari'], active: true,
  },
  {
    id: 'bedcover', name: 'Bedcover & Gorden', unit: 'pcs', price: 40000, hours: 48, icon: 'blanket', tone: 'mint',
    desc: 'Mesin kapasitas 18 kg khusus linen besar, kering merata tanpa bau apek.',
    includes: ['Anti tungau', 'Lipat vakum opsional', 'Ukuran hingga 240×220'], active: true,
  },
];

export const SEED_ADDONS: Addon[] = [
  { id: 'express', name: 'Express 6 Jam', price: 25000, kind: 'flat', icon: 'bolt', note: 'Antrean didahulukan, kurir privat', active: true },
  { id: 'stain', name: 'Treatment Noda Membandel', price: 4000, kind: 'kg', icon: 'spark', note: 'Kopi, tinta, oli, kunyit', active: true },
  { id: 'premium', name: 'Pewangi Premium', price: 12000, kind: 'flat', icon: 'leaf', note: 'Tahan 14 hari di dalam lemari', active: true },
  { id: 'vakum', name: 'Vakum Linen Besar', price: 15000, kind: 'flat', icon: 'box', note: 'Hemat ruang 60%', active: true },
  { id: 'lipat', name: 'Lipat Khusus + Kertas Tissue', price: 10000, kind: 'flat', icon: 'grid', note: 'Gaya hotel, siap masuk koper', active: true },
];

export const SEED_MACHINES: Machine[] = [
  { id: 'M-01', model: 'Front Load 12 kg', cap: 12, kind: 'wash', stage: 5, rpm: 5, temp: 62, load: 78, left: 22, ticket: 'BUSA-4470', state: 'run' },
  { id: 'M-02', model: 'Front Load 18 kg', cap: 18, kind: 'wash', stage: 3, rpm: 8, temp: 41, load: 92, left: 47, ticket: 'BUSA-4468', state: 'run' },
  { id: 'M-03', model: 'Top Load 9 kg', cap: 9, kind: 'wash', stage: 2, rpm: 11, temp: 34, load: 41, left: 31, ticket: 'BUSA-4467', state: 'run' },
  { id: 'M-04', model: 'Dryer 15 kg', cap: 15, kind: 'dry', stage: 4, rpm: 3, temp: 71, load: 66, left: 14, ticket: 'BUSA-4463', state: 'hot' },
  { id: 'M-05', model: 'Steam Press', cap: 6, kind: 'steam', stage: 6, rpm: 0, temp: 128, load: 24, left: 8, ticket: 'BUSA-4464', state: 'vent' },
  { id: 'M-06', model: 'Dry Clean 10 kg', cap: 10, kind: 'dryclean', stage: 0, rpm: 0, temp: 26, load: 0, left: 0, ticket: '—', state: 'idle' },
];

/**
 * `created` = kapan order masuk (hari relatif + jam), `stageAgo` = berapa menit
 * pesanan sudah diam di tahap sekarang. Dua baris sengaja dibuat melewati target
 * supaya panel "macet" di layar pindai punya isi yang nyata untuk diuji.
 */
export interface SeedOrder {
  code: string;
  customer: string;
  phone: string;
  stage: number;
  weight: number;
  mode: OrderMode;
  items: OrderItem[];
  addons: string[];
  promoCode?: string;
  protect?: boolean;
  pay: 'wallet' | 'qris' | 'cash';
  paid: boolean;
  priority: Priority;
  slotDayOffset: number;
  slotTime: string;
  courier: string;
  machine: string;
  notes: string;
  collected?: boolean;
  created: { dayOffset: number; hh: number; mm: number };
  stageAgoMin: number;
}

export const SEED_ORDERS: SeedOrder[] = [
  {
    code: 'BUSA-4471', customer: 'Rania Sekar', phone: '0812-7781-4402', stage: 3, weight: 6.5, mode: 'pickup',
    items: [{ id: 'setrika', qty: 6.5 }], addons: ['premium'], pay: 'wallet', paid: true, priority: 'reguler',
    slotDayOffset: -1, slotTime: '10:00–12:00', courier: '—', machine: 'M-03',
    notes: 'Pisahkan baju bayi, jangan dicampur.', created: { dayOffset: 0, hh: 8, mm: 12 }, stageAgoMin: 34,
  },
  {
    code: 'BUSA-4470', customer: 'Bagaswirawan', phone: '0811-2043-9987', stage: 7, weight: 11, mode: 'delivery',
    items: [{ id: 'setrika', qty: 8 }, { id: 'bedcover', qty: 1 }, { id: 'kasar', qty: 3 }], addons: ['stain'],
    pay: 'qris', paid: true, priority: 'express', slotDayOffset: -2, slotTime: '14:00–16:00',
    courier: 'Yudha P.', machine: 'M-01', notes: 'Bedcover motif daun, lipat jadi dua.',
    created: { dayOffset: -1, hh: 16, mm: 44 }, stageAgoMin: 18,
  },
  {
    code: 'BUSA-4469', customer: 'Nadira Ayu Lestari', phone: '0857-3300-1188', stage: 8, weight: 4, mode: 'pickup',
    items: [{ id: 'kering', qty: 2 }, { id: 'sepatu', qty: 1 }], addons: [], pay: 'wallet', paid: true,
    priority: 'reguler', slotDayOffset: -3, slotTime: '08:00–10:00', courier: '—', machine: 'M-05',
    notes: '', collected: true, created: { dayOffset: -3, hh: 19, mm: 2 }, stageAgoMin: 240,
  },
  {
    code: 'BUSA-4468', customer: 'Kantor Desa Mekarjaya', phone: '022-445-1177', stage: 5, weight: 28, mode: 'delivery',
    items: [{ id: 'setrika', qty: 20 }, { id: 'steam', qty: 8 }], addons: ['vakum', 'stain'],
    pay: 'cash', paid: false, priority: 'reguler', slotDayOffset: 0, slotTime: '07:00–09:00',
    courier: 'Sinta R.', machine: 'M-02', notes: 'Seragam ASN. Kerah harus rapi, kirim 3 dus.',
    created: { dayOffset: 0, hh: 6, mm: 30 }, stageAgoMin: 27,
  },
  {
    code: 'BUSA-4467', customer: 'Tommy Halim', phone: '0819-6650-0021', stage: 2, weight: 7.2, mode: 'pickup',
    items: [{ id: 'setrika', qty: 7.2 }], addons: ['express'], pay: 'wallet', paid: true, priority: 'express',
    slotDayOffset: -1, slotTime: '16:00–18:00', courier: '—', machine: 'M-04',
    notes: 'Butuh sebelum acara 20:00.', created: { dayOffset: 0, hh: 9, mm: 40 }, stageAgoMin: 72,
  },
  {
    code: 'BUSA-4466', customer: 'Aisyah Ramdhani', phone: '0813-2277-5590', stage: 1, weight: 3.4, mode: 'delivery',
    items: [{ id: 'bedcover', qty: 2 }], addons: [], pay: 'qris', paid: false, priority: 'reguler',
    slotDayOffset: 1, slotTime: '10:00–12:00', courier: 'Yudha P.', machine: '—', notes: '',
    created: { dayOffset: 0, hh: 10, mm: 5 }, stageAgoMin: 22,
  },
  {
    code: 'BUSA-4465', customer: 'Hendra Wijaya', phone: '0878-1120-3345', stage: 0, weight: 15, mode: 'pickup',
    items: [{ id: 'setrika', qty: 10 }, { id: 'steam', qty: 5 }], addons: ['premium', 'stain'],
    pay: 'cash', paid: false, priority: 'reguler', slotDayOffset: 1, slotTime: '12:00–14:00',
    courier: '—', machine: '—', notes: 'Baju kerja + sprei dua set.',
    created: { dayOffset: 0, hh: 10, mm: 58 }, stageAgoMin: 9,
  },
  {
    code: 'BUSA-4464', customer: 'Kirana Buana', phone: '0812-9900-7733', stage: 8, weight: 9, mode: 'delivery',
    items: [{ id: 'setrika', qty: 9 }], addons: [], pay: 'wallet', paid: true, priority: 'reguler',
    slotDayOffset: -4, slotTime: '08:00–10:00', courier: 'Sinta R.', machine: 'M-06', notes: '',
    collected: true, created: { dayOffset: -4, hh: 11, mm: 20 }, stageAgoMin: 900,
  },
  {
    code: 'BUSA-4463', customer: 'Depot Kopi Tuku', phone: '0821-4477-0910', stage: 4, weight: 22, mode: 'delivery',
    items: [{ id: 'setrika', qty: 14 }, { id: 'bedcover', qty: 8 }], addons: ['stain'],
    pay: 'cash', paid: true, priority: 'reguler', slotDayOffset: 0, slotTime: '16:00–18:00',
    courier: 'Bagas W.', machine: 'M-02', notes: 'Apron kena kopi, butuh treatment noda.',
    created: { dayOffset: 0, hh: 7, mm: 15 }, stageAgoMin: 96,
  },
  {
    code: 'BUSA-4462', customer: 'Meilani Putri', phone: '0896-3312-8845', stage: 6, weight: 5.5, mode: 'pickup',
    items: [{ id: 'kering', qty: 5.5 }], addons: ['lipat'], pay: 'wallet', paid: true, priority: 'reguler',
    slotDayOffset: -1, slotTime: '18:00–20:00', courier: '—', machine: 'M-05', notes: '',
    created: { dayOffset: -1, hh: 13, mm: 31 }, stageAgoMin: 41,
  },
];

/** Riwayat peredaran 14 hari. Ditandai `source='seed'`; hari berjalan ditimpa angka live dari order asli. */
export const SEED_REVENUE: { dayOffset: number; v: number; n: number }[] = [
  { dayOffset: -13, v: 1420, n: 18 }, { dayOffset: -12, v: 1980, n: 24 }, { dayOffset: -11, v: 1640, n: 21 },
  { dayOffset: -10, v: 2410, n: 29 }, { dayOffset: -9, v: 3120, n: 36 }, { dayOffset: -8, v: 2760, n: 33 },
  { dayOffset: -7, v: 1890, n: 23 }, { dayOffset: -6, v: 2240, n: 27 }, { dayOffset: -5, v: 2980, n: 35 },
  { dayOffset: -4, v: 3410, n: 41 }, { dayOffset: -3, v: 2670, n: 31 }, { dayOffset: -2, v: 2050, n: 25 },
  { dayOffset: -1, v: 2890, n: 34 }, { dayOffset: 0, v: 3640, n: 43 },
];

export const SEED_STAFF: StaffMember[] = [
  { name: 'Wulan A.', role: 'Ahli Noda', done: 148, rating: 4.9, tag: 'Kopi & tinta' },
  { name: 'Dodo Prayoga', role: 'Operator Mesin', done: 132, rating: 4.7, tag: 'Heavy load' },
  { name: 'Sinta R.', role: 'Kurir', done: 96, rating: 4.95, tag: 'Rute timur' },
  { name: 'Kanda B.', role: 'Setrika Uap', done: 88, rating: 4.6, tag: 'Blazer & kemeja' },
];

export interface SeedTx {
  id: string; type: WalletTx['type']; label: string; amount: number; dayOffset: number; hh: number; mm: number; status: string;
}

export const SEED_TXNS: SeedTx[] = [
  { id: 'TX-9921', type: 'pay', label: 'Bayar BUSA-4471', amount: -64000, dayOffset: -1, hh: 8, mm: 14, status: 'sukses' },
  { id: 'TX-9915', type: 'topup', label: 'Top up via GoPay', amount: 300000, dayOffset: -2, hh: 20, mm: 2, status: 'sukses' },
  { id: 'TX-9908', type: 'cashback', label: 'Cashback loyalitas 5%', amount: 12400, dayOffset: -3, hh: 17, mm: 30, status: 'sukses' },
  { id: 'TX-9901', type: 'pay', label: 'Bayar BUSA-4464', amount: -72000, dayOffset: -4, hh: 12, mm: 5, status: 'sukses' },
  { id: 'TX-9894', type: 'refund', label: 'Refund treatment noda', amount: 15000, dayOffset: -5, hh: 9, mm: 44, status: 'diproses' },
  { id: 'TX-9887', type: 'topup', label: 'Transfer bank BCA', amount: 500000, dayOffset: -7, hh: 15, mm: 20, status: 'sukses' },
];

/**
 * `terms` adalah kalimat yang dibaca pelanggan; field min_…, requires_…, dan
 * excludes_… adalah bentuk mesin dari kalimat yang sama dan ditegakkan oleh
 * mesin pricing.
 */
export const SEED_PROMOS: Promo[] = [
  {
    code: 'BUSA10', kind: 'pct', value: 10, cap: 20000, label: 'Potongan 10%',
    terms: 'Maks. Rp 20.000 · min. 3 kg · tidak berlaku express', active: true,
    minKg: 3, minSub: 0, courierOnly: false, requiresService: [], excludesAddon: ['express'],
  },
  {
    code: 'KURIRHEMAT', kind: 'flat', value: 15000, cap: 15000, label: 'Gratis antar-jemput',
    terms: 'Radius 8 km · min. belanja Rp 80.000', active: true,
    minKg: 0, minSub: 80000, courierOnly: true, requiresService: [], excludesAddon: [],
  },
  {
    code: 'SPREI2', kind: 'flat', value: 20000, cap: 20000, label: 'Potongan linen besar',
    terms: 'Khusus bedcover/gorden, 2 pcs pertama', active: true,
    minKg: 0, minSub: 0, courierOnly: false, requiresService: ['bedcover'], excludesAddon: [],
  },
];

export const SEED_AREAS: Area[] = [
  { kec: 'Buahbatu', eta: '2 jam', kode: 'BBU', slot: 6 },
  { kec: 'Mandalajung', eta: '3 jam', kode: 'MDJ', slot: 5 },
  { kec: 'Cicadas', eta: '3 jam', kode: 'CCA', slot: 4 },
  { kec: 'Panyileukan', eta: '4 jam', kode: 'PNY', slot: 4 },
  { kec: 'Cinambo', eta: '4 jam', kode: 'CNB', slot: 3 },
  { kec: 'Arcamanik', eta: '5 jam', kode: 'ARM', slot: 5 },
  { kec: 'Coblong', eta: '6 jam', kode: 'CBL', slot: 2 },
  { kec: 'Sukajadi', eta: '6 jam', kode: 'SKJ', slot: 3 },
];

export const SEED_TIERS: Tier[] = [
  {
    id: 'basic', name: 'Cucian Lepas', price: 0, unit: 'per order', tone: 'muted',
    best: 'Untuk yang kadang-kadang', kgQuota: 0,
    perks: ['Harga per kg normal', 'Lacak siklus real-time', 'Stempel loyalti 7→1', 'Bayar QRIS / tunai'],
  },
  {
    id: 'premium', name: 'Rutin Mingguan', price: 149000, unit: 'per bulan', tone: 'blue',
    best: 'Hemat 18% untuk 4 angkatan', kgQuota: 40,
    perks: ['Kuota 40 kg / bulan', 'Antar-jemput gratis tanpa minimum', 'Prioritas antrean di atas reguler', 'Treatment noda 2× gratis / bulan', 'Pewangi premium termasuk'],
  },
  {
    id: 'bisnis', name: 'Kemitraan Bisnis', price: 499000, unit: 'per bulan', tone: 'orange',
    best: 'Kos, kafe, kantor, laundry hotel', kgQuota: 150,
    perks: ['Kuota 150 kg / bulan', 'Penagihan bulanan + invoice', 'Kurir khusus jam operasional Anda', 'SLA 24 jam dengan denda 10%', 'Dashboard pemakaian per cabang'],
  },
];

export const SEED_ADDRESSES: { tag: string; label: string; def: boolean }[] = [
  { tag: 'Rumah', label: 'Jl. Cendana Raya No. 12, Bandung 40115', def: true },
  { tag: 'Kantor', label: 'Gedung Sabda Lt. 4, Jl. Riau No. 88', def: false },
];

export const SEED_CHAT: ChatMessage[] = [
  { id: 'ch-1', from: 'bot', text: 'Selamat datang di BUSA. Ada yang bisa dibantu soal cucian hari ini?', at: '' },
  { id: 'ch-2', from: 'me', text: 'Paket bedcover saya bisa kena noda kunyit nggak?', at: '' },
  {
    id: 'ch-3', from: 'bot', at: '',
    text: 'Bisa. Treatment noda kunyit masuk tahap Rendam enzimatik 20 menit. Success rate 94% untuk linen katun. Mau saya tambahkan ke pesanan Anda?',
  },
];

/** Konten statis halaman situs — disimpan di tabel `content` supaya bisa diedit tanpa deploy. */
export const SEED_CONTENT: Record<string, unknown> = {
  gallery: [
    { seed: 'folded-towels-stack', label: 'Handuk hotel lipit', meta: 'QC 07 Okt' },
    { seed: 'denim-laundry-blue', label: 'Denim raw indigo', meta: 'Cuci dingin 30°' },
    { seed: 'steam-iron-shirt', label: 'Kemeja poplin', meta: 'Uap 160°' },
    { seed: 'sneaker-cleaning-brush', label: 'Sneaker putih', meta: 'Sole whitening' },
    { seed: 'linen-bedcover-cream', label: 'Linen krem', meta: 'Vakum 60%' },
    { seed: 'laundry-basket-wicker', label: 'Keranjang anyam', meta: 'Siap antar' },
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
  metrics: [
    { n: '12.480', l: 'kg ditangani / bulan' },
    { n: '98,4%', l: 'selesai tepat waktu' },
    { n: '6 jam', l: 'express tercepat' },
    { n: '4,9', l: 'rata-rata 812 ulasan' },
  ],
};

/** Akun demo. Password default development — wajib diganti lewat BUSA_SEED_PASSWORD di produksi. */
export const SEED_USERS: { username?: string; phone?: string; name: string; role: 'admin' | 'staff' | 'customer'; customer?: string }[] = [
  { username: 'admin', name: 'Wulan A.', role: 'admin' },
  { username: 'dodo', name: 'Dodo Prayoga', role: 'staff' },
  { username: 'sinta', name: 'Sinta R.', role: 'staff' },
  { phone: '0812-7781-4402', name: 'Rania Sekar', role: 'customer', customer: 'Rania Sekar' },
];

export const DEFAULT_CUSTOMER = 'Rania Sekar';
export const DEFAULT_BALANCE = 412_500;
export const DEFAULT_STAMPS = 4;
