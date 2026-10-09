/**
 * Bentuk data yang dipakai bersama oleh API dan frontend.
 * Nama field sengaja sama dengan `js/data.js` supaya respons API bisa
 * langsung dipakai tanpa lapisan pemetaan di browser.
 */

export type ServiceUnit = 'kg' | 'pcs' | 'pasang';

export interface Service {
  id: string;
  name: string;
  unit: ServiceUnit;
  price: number;
  hours: number;
  icon: string;
  tone: string;
  desc: string;
  includes: string[];
  active: boolean;
}

export type AddonKind = 'flat' | 'kg';

export interface Addon {
  id: string;
  name: string;
  price: number;
  kind: AddonKind;
  icon: string;
  note: string;
  active: boolean;
}

export interface Stage {
  label: string;
  note: string;
  icon: string;
}

export type MachineKind = 'wash' | 'dry' | 'steam' | 'dryclean';
export type MachineState = 'run' | 'hot' | 'vent' | 'idle';

export interface Machine {
  id: string;
  model: string;
  cap: number;
  kind: MachineKind;
  stage: number;
  rpm: number;
  temp: number;
  load: number;
  left: number;
  /** Kode pesanan yang sedang occupy drum, atau '—' bila kosong. */
  ticket: string;
  state: MachineState;
}

export type OrderMode = 'pickup' | 'delivery' | 'drop';
export type Priority = 'reguler' | 'express';
export type PayMethod = 'wallet' | 'qris' | 'cash';
export type PayStatus = 'lunas' | 'belum' | 'sebagian' | 'dikembalikan';

export interface OrderItem {
  id: string;
  qty: number;
}

export interface OrderSlot {
  date: string;
  time: string;
}

export interface Order {
  code: string;
  customerId: string | null;
  customer: string;
  phone: string;
  stage: number;
  weight: number;
  mode: OrderMode;
  items: OrderItem[];
  addons: string[];
  subtotal: number;
  ship: number;
  disc: number;
  protect: number;
  total: number;
  promoCode: string | null;
  pay: PayMethod;
  payStatus: PayStatus;
  priority: Priority;
  slot: OrderSlot;
  courier: string;
  machine: string;
  rack: string | null;
  notes: string;
  collected: boolean;
  cancelled: boolean;
  scanned: boolean;
  created: string;
  createdAt: string;
  stageAt: number | null;
  source: 'seed' | 'api' | 'lokal';
}

export type ScanAction = 'terima' | 'muat' | 'tahap' | 'lepas' | 'qc' | 'selesai';

export interface FloorEvent {
  id: string;
  seq: number;
  at: number;
  clock: string;
  code: string;
  action: ScanAction;
  machine: string | null;
  stage: number;
  to: number;
  by: string;
  note: string;
  sync: 'antre' | 'terkirim' | 'gagal' | 'lokal';
  origin: string;
}

export type Role = 'admin' | 'staff' | 'customer';

export interface User {
  id: string;
  role: Role;
  name: string;
  phone: string | null;
  username: string | null;
  active: boolean;
}

export type WalletTxType = 'pay' | 'topup' | 'cashback' | 'refund' | 'sub';

export interface WalletTx {
  id: string;
  type: WalletTxType;
  label: string;
  amount: number;
  at: string;
  status: string;
  orderCode?: string | null;
}

export interface Promo {
  code: string;
  kind: 'pct' | 'flat';
  value: number;
  cap: number;
  label: string;
  terms: string;
  active: boolean;
  /** Bentuk mesin dari `terms` — ditegakkan oleh mesin pricing. */
  minKg: number;
  minSub: number;
  courierOnly: boolean;
  requiresService: string[];
  excludesAddon: string[];
}

export interface StaffMember {
  name: string;
  role: string;
  done: number;
  rating: number;
  tag: string;
}

export interface Area {
  kec: string;
  eta: string;
  kode: string;
  slot: number;
}

export interface Tier {
  id: string;
  name: string;
  price: number;
  unit: string;
  tone: string;
  best: string;
  perks: string[];
  kgQuota: number;
}

export interface Address {
  id: string;
  tag: string;
  label: string;
  def: boolean;
}

export interface AppNotification {
  id: string;
  customerId: string | null;
  tone: string;
  icon: string;
  title: string;
  msg: string;
  at: string;
  read: boolean;
}

export interface ChatMessage {
  id: string;
  from: 'bot' | 'me' | 'staff';
  text: string;
  at: string;
}

export interface RevenueDay {
  day: string;
  d: string;
  v: number;
  n: number;
  source: 'seed' | 'live';
}

export interface QuoteLine {
  n: string;
  q: number;
  unit: string;
  amt: number;
}

export interface Quote {
  lines: QuoteLine[];
  sub: number;
  ship: number;
  disc: number;
  prot: number;
  total: number;
  promo: Promo | null;
  /** Alasan promo ditolak, dalam kalimat yang bisa langsung ditampilkan ke pelanggan. */
  promoReject: string | null;
  kgTotal: number;
  unitTotal: number;
  weight: number;
  minKgShort: number;
  hours: number;
}

export interface MixSlice {
  label: string;
  pct: number;
  tone: string;
}

export interface ActivityRow {
  t: string;
  text: string;
  tone: string;
  icon: string;
}

export interface DayBlock {
  code: string;
  kind: MachineKind;
  machine: string;
  start: number;
  end: number;
  label: string;
}

export interface DayGap {
  machine: string;
  kind: MachineKind;
  start: number;
  end: number;
}

export interface WaitingBasket {
  code: string;
  customer: string;
  weight: number;
  kind: MachineKind;
  first: DayGap | null;
  options: DayGap[];
}

export interface AtRiskOrder {
  code: string;
  slot: string;
  promised: number;
  finish: number;
  lateBy: number;
  suggestion: string;
}

export interface DayPlan {
  date: string;
  gaps: DayGap[];
  timeline: Record<string, DayBlock[] & { lastFree?: number }>;
  waiting: WaitingBasket[];
  atRisk: AtRiskOrder[];
  freeHours: number;
}

export interface PublicOrder {
  code: string;
  customer: string;
  weight: number;
  stage: number;
  stageLabel: string;
  machine: string;
  etaLabel: string;
  etaMins: number;
  serviceName: string;
}
