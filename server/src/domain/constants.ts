import type { MachineKind, ScanAction, Stage } from './types.ts';

/**
 * Sembilan tahap cucian. Nilai ini identik dengan `STAGES` di js/data.js —
 * satu sumber konfigurasi yang dibaca frontend lewat GET /api/meta.
 */
export const STAGES: Stage[] = [
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

export const LAST_STAGE = STAGES.length - 1;

/** Target menit per tahap, dipakai untuk ETA dan deteksi pesanan macet. */
export const STAGE_MIN: number[] = [15, 25, 40, 75, 45, 60, 70, 40, 0];

/** Tahap yang wajib menempel ke sebuah drum. */
export const STAGE_MACHINE: Record<number, MachineKind> = {
  2: 'wash',
  3: 'wash',
  4: 'wash',
  5: 'dry',
  6: 'steam',
};

export const SLOTS = ['07:00–09:00', '08:00–10:00', '10:00–12:00', '12:00–14:00', '14:00–16:00', '16:00–18:00', '18:00–20:00'];

export const ACTION_LABEL: Record<ScanAction, string> = {
  terima: 'diterima di kasir',
  muat: 'dimuat ke drum',
  tahap: 'naik tahap',
  lepas: 'drum dikosongkan',
  qc: 'balik rendam (QC)',
  selesai: 'diserahkan',
};

export const SCAN_ACTIONS: ScanAction[] = ['terima', 'muat', 'tahap', 'lepas', 'qc', 'selesai'];

export const MACHINE_KIND_LABEL: Record<MachineKind, string> = {
  wash: 'drum cuci',
  dry: 'pengering',
  steam: 'setrika uap',
  dryclean: 'cuci kering',
};

/** Kolom papan antrean admin. */
export const QUEUE_GROUPS = [
  { id: 'masuk', label: 'Masuk lantai', stages: [0, 1], tone: 'muted' },
  { id: 'cuci', label: 'Rendam · Cuci · Bilas', stages: [2, 3, 4], tone: 'blue' },
  { id: 'finishing', label: 'Kering · Setrika', stages: [5, 6], tone: 'amber' },
  { id: 'siap', label: 'QC & Siap', stages: [7], tone: 'lilac' },
  { id: 'selesai', label: 'Selesai', stages: [8], tone: 'mint' },
];

/** Jendela jam kerja lantai, dalam menit sejak tengah malam. */
export const DAY_START = 7 * 60;
export const DAY_MIN = 14 * 60;

/** Tiga lensa mesin yang dipakai papan jadwal: cuci, kering, setrika. */
export const PLAN_LENS: { from: number; to: number; kind: MachineKind; label: string }[] = [
  { from: 2, to: 5, kind: 'wash', label: 'Rendam · Cuci · Bilas' },
  { from: 5, to: 6, kind: 'dry', label: 'Keringkan' },
  { from: 6, to: 7, kind: 'steam', label: 'Setrika uap' },
];

export const MIN_KG_ORDER = 3;
export const FREE_SHIP_ABOVE = 80_000;
export const SHIP_FEE = 12_000;
export const PROTECT_RATE = 0.02;
export const TOPUP_BONUS_THRESHOLD = 500_000;
export const TOPUP_BONUS = 25_000;
export const STAMP_CYCLE = 7;

/** Nama kurir yang bertugas — dipakai untuk penugasan otomatis saat order selesai. */
export const COURIERS = ['Yudha P.', 'Sinta R.', 'Bagas W.'];

export function stageLabel(stage: number): string {
  return (STAGES[clampInt(stage, 0, LAST_STAGE)] ?? STAGES[0]!).label;
}

export function clampInt(v: number, lo: number, hi: number): number {
  const n = Math.round(Number.isFinite(v) ? v : lo);
  return Math.max(lo, Math.min(hi, n));
}

export function clampNum(v: number, lo: number, hi: number): number {
  const n = Number.isFinite(v) ? v : lo;
  return Math.max(lo, Math.min(hi, n));
}

export function pad2(n: number): string {
  return String(Math.floor(Math.abs(n))).padStart(2, '0');
}

export function clockOfMinute(min: number): string {
  const t = DAY_START + clampInt(min, 0, DAY_MIN);
  return `${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`;
}

export function minutesOfClock(hhmm: string): number | null {
  const m = /(\d{1,2}):(\d{2})/.exec(hhmm ?? '');
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Durasi dalam menit → kalimat "1 jam 5 menit" / "45 menit". */
export function durText(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h} jam ${r} menit` : `${r} menit`;
}

/** "HH:MM" lokal dari epoch ms — format yang sama dengan jejak lantai frontend. */
export function clockLabel(atMs: number): string {
  const d = new Date(atMs);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function isoOf(atMs: number): string {
  return new Date(atMs).toISOString();
}

/** Label relatif ala kasir: "Hari ini 08:12", "Kemarin 16:44", "5 Okt 19:02". */
export function createdLabel(atMs: number, now: number = Date.now()): string {
  const d = new Date(atMs);
  const today = new Date(now);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (diffDays === 0) return `Hari ini ${hm}`;
  if (diffDays === 1) return `Kemarin ${hm}`;
  const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${d.getDate()} ${bulan[d.getMonth()]} ${hm}`;
}

export function dayKey(atMs: number): string {
  const d = new Date(atMs);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
