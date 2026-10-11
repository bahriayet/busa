import {
  b, getSetting, jparse, jstr, n, nextCounter, peekCounter, setSetting, unb, type Db, type SqlParam,
} from './client.ts';
import { SLOTS, STAMP_CYCLE, clockLabel, createdLabel, dayKey } from '../domain/constants.ts';
import type {
  Address, Addon, AppNotification, Area, ChatMessage, FloorEvent, Machine, MachineKind,
  MachineState, MixSlice, Order, OrderItem, OrderMode, PayMethod, PayStatus, Promo,
  RevenueDay, ScanAction, Service, ServiceUnit, StaffMember, Tier, User, WalletTx,
} from '../domain/types.ts';
import type { PriceBook } from '../domain/pricing.ts';
import type { MachineEffect } from '../domain/rules.ts';

/**
 * Lapisan akses data. Semua query SQL hidup di sini; modul route tidak boleh
 * menyentuh SQL langsung supaya bentuk domain tetap satu-satunya kontrak.
 *
 * Konvensi: kolom boolean INTEGER (0/1) dipetakan ke boolean domain, dan sentinel
 * '—' dipakai di API untuk "tidak ada" supaya cocok dengan frontend yang sudah jalan.
 */

/* ── Pemetaan baris → domain ─────────────────────────────── */

interface ServiceRow {
  id: string; name: string; unit: string; price: number; hours: number;
  icon: string; tone: string; descr: string; includes_json: string; active: number;
}

function toService(r: ServiceRow): Service {
  return {
    id: r.id, name: r.name, unit: r.unit as ServiceUnit, price: r.price, hours: r.hours,
    icon: r.icon, tone: r.tone, desc: r.descr,
    includes: jparse<string[]>(r.includes_json, []), active: unb(r.active),
  };
}

interface AddonRow {
  id: string; name: string; price: number; kind: string; icon: string; note: string; active: number;
}

function toAddon(r: AddonRow): Addon {
  return {
    id: r.id, name: r.name, price: r.price, kind: r.kind as Addon['kind'],
    icon: r.icon, note: r.note, active: unb(r.active),
  };
}

interface MachineRow {
  id: string; model: string; cap: number; kind: string; stage: number; rpm: number;
  temp: number; load_pct: number; left_min: number; ticket: string | null; state: string;
}

function toMachine(r: MachineRow): Machine {
  return {
    id: r.id, model: r.model, cap: r.cap, kind: r.kind as MachineKind, stage: r.stage,
    rpm: r.rpm, temp: Math.round(r.temp * 10) / 10, load: r.load_pct, left: r.left_min,
    ticket: r.ticket ?? '—', state: r.state as MachineState,
  };
}

interface OrderRow {
  code: string; customer_id: string | null; customer: string; phone: string; stage: number;
  weight: number; mode: string; items_json: string; addons_json: string; subtotal: number;
  ship: number; disc: number; protect_fee: number; total: number; promo_code: string | null;
  pay: string; pay_status: string; priority: string; slot_date: string; slot_time: string;
  courier: string; machine: string; rack: string | null; notes: string; collected: number;
  cancelled: number; scanned: number; created_ms: number; created_label: string;
  stage_at_ms: number | null; source: string;
}

function toOrder(r: OrderRow): Order {
  return {
    code: r.code, customerId: r.customer_id, customer: r.customer, phone: r.phone,
    stage: r.stage, weight: r.weight, mode: r.mode as OrderMode,
    items: jparse<OrderItem[]>(r.items_json, []), addons: jparse<string[]>(r.addons_json, []),
    subtotal: r.subtotal, ship: r.ship, disc: r.disc, protect: r.protect_fee, total: r.total,
    promoCode: r.promo_code, pay: r.pay as PayMethod, payStatus: r.pay_status as PayStatus,
    priority: r.priority as Order['priority'], slot: { date: r.slot_date, time: r.slot_time },
    courier: r.courier, machine: r.machine, rack: r.rack, notes: r.notes,
    collected: unb(r.collected), cancelled: unb(r.cancelled), scanned: unb(r.scanned),
    created: r.created_label || createdLabel(r.created_ms),
    createdAt: new Date(r.created_ms).toISOString(),
    stageAt: r.stage_at_ms, source: r.source as Order['source'],
  };
}

const ORDER_COLS = `code, customer_id, customer, phone, stage, weight, mode, items_json, addons_json,
  subtotal, ship, disc, protect_fee, total, promo_code, pay, pay_status, priority, slot_date, slot_time,
  courier, machine, rack, notes, collected, cancelled, scanned, created_ms, created_label, stage_at_ms, source`;

interface EventRow {
  seq: number; id: string; client_id: string | null; order_code: string; action: string;
  machine: string | null; stage_from: number; stage_to: number; actor: string; note: string;
  client_ms: number | null; at_ms: number; clock: string; origin: string;
}

function toEvent(r: EventRow): FloorEvent {
  return {
    id: r.id, seq: r.seq, at: r.at_ms, clock: r.clock || clockLabel(r.at_ms), code: r.order_code,
    action: r.action as ScanAction, machine: r.machine, stage: r.stage_from, to: r.stage_to,
    by: r.actor, note: r.note, sync: 'terkirim', origin: r.origin,
  };
}

const EVENT_COLS = `seq, id, client_id, order_code, action, machine, stage_from, stage_to, actor, note, client_ms, at_ms, clock, origin`;

/* ── Katalog ─────────────────────────────────────────────── */

export async function listServices(db: Db, includeInactive = true): Promise<Service[]> {
  const sql = includeInactive
    ? 'SELECT * FROM services ORDER BY sort, id'
    : 'SELECT * FROM services WHERE active = 1 ORDER BY sort, id';
  return (await db.all<ServiceRow>(sql)).map(toService);
}

export async function getService(db: Db, id: string): Promise<Service | undefined> {
  const r = await db.get<ServiceRow>('SELECT * FROM services WHERE id = ?', id);
  return r ? toService(r) : undefined;
}

export async function upsertService(db: Db, s: Service, sort: number): Promise<void> {
  await db.run(
    `INSERT INTO services (id, name, unit, price, hours, icon, tone, descr, includes_json, active, sort)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, unit=excluded.unit, price=excluded.price,
       hours=excluded.hours, icon=excluded.icon, tone=excluded.tone, descr=excluded.descr,
       includes_json=excluded.includes_json, active=excluded.active, sort=excluded.sort`,
    s.id, s.name, s.unit, s.price, s.hours, s.icon, s.tone, s.desc, jstr(s.includes), b(s.active), sort,
  );
}

export async function patchService(db: Db, id: string, patch: Partial<Pick<Service, 'price' | 'hours' | 'active' | 'name'>>): Promise<Service | undefined> {
  if (patch.price !== undefined) await db.run('UPDATE services SET price = ? WHERE id = ?', Math.round(patch.price), id);
  if (patch.hours !== undefined) await db.run('UPDATE services SET hours = ? WHERE id = ?', Math.round(patch.hours), id);
  if (patch.active !== undefined) await db.run('UPDATE services SET active = ? WHERE id = ?', b(patch.active), id);
  if (patch.name !== undefined) await db.run('UPDATE services SET name = ? WHERE id = ?', patch.name, id);
  return await getService(db, id);
}

export async function listAddons(db: Db, includeInactive = true): Promise<Addon[]> {
  const sql = includeInactive
    ? 'SELECT * FROM addons ORDER BY sort, id'
    : 'SELECT * FROM addons WHERE active = 1 ORDER BY sort, id';
  return (await db.all<AddonRow>(sql)).map(toAddon);
}

export async function getAddon(db: Db, id: string): Promise<Addon | undefined> {
  const r = await db.get<AddonRow>('SELECT * FROM addons WHERE id = ?', id);
  return r ? toAddon(r) : undefined;
}

export async function upsertAddon(db: Db, a: Addon, sort: number): Promise<void> {
  await db.run(
    `INSERT INTO addons (id, name, price, kind, icon, note, active, sort) VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, price=excluded.price, kind=excluded.kind,
       icon=excluded.icon, note=excluded.note, active=excluded.active, sort=excluded.sort`,
    a.id, a.name, a.price, a.kind, a.icon, a.note, b(a.active), sort,
  );
}

export async function patchAddon(db: Db, id: string, patch: Partial<Pick<Addon, 'price' | 'active' | 'name'>>): Promise<Addon | undefined> {
  if (patch.price !== undefined) await db.run('UPDATE addons SET price = ? WHERE id = ?', Math.round(patch.price), id);
  if (patch.active !== undefined) await db.run('UPDATE addons SET active = ? WHERE id = ?', b(patch.active), id);
  if (patch.name !== undefined) await db.run('UPDATE addons SET name = ? WHERE id = ?', patch.name, id);
  return await getAddon(db, id);
}

interface PromoRow {
  code: string; kind: string; value: number; cap: number; label: string; terms: string;
  active: number; min_kg: number; min_sub: number; courier_only: number;
  requires_service: string; excludes_addon: string;
}

function toPromo(r: PromoRow): Promo {
  const split = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
  return {
    code: r.code, kind: r.kind as Promo['kind'], value: r.value, cap: r.cap, label: r.label,
    terms: r.terms, active: unb(r.active), minKg: r.min_kg, minSub: r.min_sub,
    courierOnly: unb(r.courier_only), requiresService: split(r.requires_service), excludesAddon: split(r.excludes_addon),
  };
}

export async function listPromos(db: Db): Promise<Promo[]> {
  return (await db.all<PromoRow>('SELECT * FROM promos ORDER BY code')).map(toPromo);
}

export async function upsertPromo(db: Db, p: Promo): Promise<void> {
  await db.run(
    `INSERT INTO promos (code, kind, value, cap, label, terms, active, min_kg, min_sub, courier_only, requires_service, excludes_addon)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(code) DO UPDATE SET kind=excluded.kind, value=excluded.value, cap=excluded.cap,
       label=excluded.label, terms=excluded.terms, active=excluded.active, min_kg=excluded.min_kg,
       min_sub=excluded.min_sub, courier_only=excluded.courier_only,
       requires_service=excluded.requires_service, excludes_addon=excluded.excludes_addon`,
    p.code, p.kind, p.value, p.cap, p.label, p.terms, b(p.active), p.minKg, p.minSub,
    b(p.courierOnly), p.requiresService.join(','), p.excludesAddon.join(','),
  );
}

export async function priceBook(db: Db): Promise<PriceBook> {
  return { services: await listServices(db), addons: await listAddons(db), promos: await listPromos(db) };
}

/* ── Mesin ───────────────────────────────────────────────── */

export async function listMachines(db: Db): Promise<Machine[]> {
  return (await db.all<MachineRow>('SELECT * FROM machines ORDER BY sort, id')).map(toMachine);
}

export async function getMachine(db: Db, id: string): Promise<Machine | undefined> {
  const r = await db.get<MachineRow>('SELECT * FROM machines WHERE id = ?', id);
  return r ? toMachine(r) : undefined;
}

export async function upsertMachine(db: Db, m: Machine, sort: number): Promise<void> {
  await db.run(
    `INSERT INTO machines (id, model, cap, kind, stage, rpm, temp, load_pct, left_min, ticket, state, sort)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET model=excluded.model, cap=excluded.cap, kind=excluded.kind,
       stage=excluded.stage, rpm=excluded.rpm, temp=excluded.temp, load_pct=excluded.load_pct,
       left_min=excluded.left_min, ticket=excluded.ticket, state=excluded.state, sort=excluded.sort`,
    m.id, m.model, m.cap, m.kind, m.stage, m.rpm, m.temp, m.load, m.left,
    m.ticket === '—' ? null : m.ticket, m.state, sort,
  );
}

export async function applyMachineEffect(db: Db, e: MachineEffect): Promise<void> {
  await db.run(
    `UPDATE machines SET ticket = ?, load_pct = ?, state = ?, rpm = ?, left_min = ?, stage = ?,
       temp = COALESCE(?, temp) WHERE id = ?`,
    n(e.ticket), e.load, e.state, e.rpm, e.left, e.stage, n(e.temp), e.machineId,
  );
}

export async function patchMachine(db: Db, id: string, patch: Partial<Machine>): Promise<Machine | undefined> {
  const colOf: Partial<Record<keyof Machine, string>> = {
    model: 'model', cap: 'cap', kind: 'kind', stage: 'stage', rpm: 'rpm',
    temp: 'temp', load: 'load_pct', left: 'left_min', state: 'state',
  };
  const sets: string[] = [];
  const params: SqlParam[] = [];
  for (const [field, col] of Object.entries(colOf)) {
    const v = patch[field as keyof Machine];
    if (v === undefined || col === undefined) continue;
    sets.push(`${col} = ?`);
    params.push(n(v));
  }
  if (patch.ticket !== undefined) {
    sets.push('ticket = ?');
    params.push(patch.ticket === '—' ? null : patch.ticket);
  }
  if (sets.length) {
    params.push(id);
    await db.run(`UPDATE machines SET ${sets.join(', ')} WHERE id = ?`, ...params);
  }
  return await getMachine(db, id);
}

/* ── Pesanan ─────────────────────────────────────────────── */

export async function listOrders(db: Db, opts: { customerId?: string | null; includeCancelled?: boolean; limit?: number } = {}): Promise<Order[]> {
  const where: string[] = [];
  const params: SqlParam[] = [];
  if (opts.customerId) { where.push('customer_id = ?'); params.push(opts.customerId); }
  if (!opts.includeCancelled) where.push('cancelled = 0');
  const sql = `SELECT ${ORDER_COLS} FROM orders ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_ms DESC`;
  const rows = await db.all<OrderRow>(sql, ...params);
  const out = rows.map(toOrder);
  return opts.limit ? out.slice(0, opts.limit) : out;
}

export async function getOrder(db: Db, code: string): Promise<Order | undefined> {
  const r = await db.get<OrderRow>(`SELECT ${ORDER_COLS} FROM orders WHERE code = ?`, code);
  return r ? toOrder(r) : undefined;
}

/** Cari by kode penuh atau 3+ digit terakhir, meniru perilaku `findOrder()` frontend. */
export async function findOrderByCode(db: Db, raw: string): Promise<Order | undefined> {
  const q = String(raw ?? '').trim().toUpperCase();
  if (!q) return undefined;
  const exact = await getOrder(db, q);
  if (exact) return exact;
  const digits = q.replace(/\D/g, '');
  if (digits.length < 3) return undefined;
  const r = await db.get<OrderRow>(
    `SELECT ${ORDER_COLS} FROM orders WHERE code LIKE ? ORDER BY created_ms DESC LIMIT 1`, `%${digits}`,
  );
  return r ? toOrder(r) : undefined;
}

export interface NewOrderInput {
  code: string;
  customerId: string | null;
  customer: string;
  phone: string;
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
  priority: Order['priority'];
  slotDate: string;
  slotTime: string;
  courier: string;
  notes: string;
  createdMs: number;
  source: Order['source'];
  stage?: number;
  machine?: string;
  rack?: string | null;
  collected?: boolean;
  scanned?: boolean;
  stageAtMs?: number | null;
}

export async function insertOrder(db: Db, o: NewOrderInput): Promise<void> {
  await db.run(
    `INSERT INTO orders (code, customer_id, customer, phone, stage, weight, mode, items_json, addons_json,
       subtotal, ship, disc, protect_fee, total, promo_code, pay, pay_status, priority, slot_date, slot_time,
       courier, machine, rack, notes, collected, cancelled, scanned, created_ms, created_label, stage_at_ms, source)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    o.code, n(o.customerId), o.customer, o.phone, o.stage ?? 0, o.weight, o.mode, jstr(o.items), jstr(o.addons),
    o.subtotal, o.ship, o.disc, o.protect, o.total, n(o.promoCode), o.pay, o.payStatus, o.priority,
    o.slotDate, o.slotTime, o.courier, o.machine ?? '—', n(o.rack ?? null), o.notes,
    b(o.collected ?? false), 0, b(o.scanned ?? false),
    o.createdMs, createdLabel(o.createdMs), n(o.stageAtMs ?? o.createdMs), o.source,
  );
}

const ORDER_COLS_WRITABLE: Record<string, string> = {
  stage: 'stage', weight: 'weight', mode: 'mode', notes: 'notes', courier: 'courier',
  machine: 'machine', rack: 'rack', collected: 'collected', cancelled: 'cancelled',
  scanned: 'scanned', total: 'total', subtotal: 'subtotal', ship: 'ship', disc: 'disc',
  protect: 'protect_fee', payStatus: 'pay_status', pay: 'pay', priority: 'priority',
  promoCode: 'promo_code', stageAt: 'stage_at_ms', slotDate: 'slot_date', slotTime: 'slot_time',
  items: 'items_json', addons: 'addons_json', customer: 'customer', phone: 'phone',
  customerId: 'customer_id', source: 'source',
};
const ORDER_JSON_COLS = new Set(['items', 'addons']);
const ORDER_BOOL_COLS = new Set(['collected', 'cancelled', 'scanned']);

export async function patchOrder(db: Db, code: string, patch: Record<string, unknown>): Promise<Order | undefined> {
  const sets: string[] = [];
  const params: SqlParam[] = [];
  for (const [key, value] of Object.entries(patch)) {
    const col = ORDER_COLS_WRITABLE[key];
    if (!col || value === undefined) continue;
    sets.push(`${col} = ?`);
    params.push(ORDER_JSON_COLS.has(key) ? jstr(value) : ORDER_BOOL_COLS.has(key) ? b(value) : n(value));
  }
  if (sets.length) {
    params.push(code);
    await db.run(`UPDATE orders SET ${sets.join(', ')} WHERE code = ?`, ...params);
  }
  return await getOrder(db, code);
}

export async function nextOrderCode(db: Db): Promise<string> {
  return `BUSA-${await nextCounter(db, 'order_seq')}`;
}

export async function peekOrderSeq(db: Db): Promise<number> {
  return await peekCounter(db, 'order_seq');
}

/* ── Event lantai ────────────────────────────────────────── */

export interface NewEventInput {
  clientId?: string | null;
  orderCode: string;
  action: ScanAction;
  machine?: string | null;
  from: number;
  to: number;
  actor: string;
  note?: string;
  clientMs?: number | null;
  atMs: number;
  origin?: string;
}

/**
 * Menulis satu baris ke log event. `seq` diambil dari counter lalu `id` diturunkan
 * darinya, sehingga id dijamin unik dan log tetap append-only (tidak ada UPDATE).
 */
export async function insertEvent(db: Db, e: NewEventInput): Promise<FloorEvent> {
  const seq = await nextCounter(db, 'event_seq');
  const id = `EV-${String(seq).padStart(6, '0')}`;
  await db.run(
    `INSERT INTO order_events (seq, id, client_id, order_code, action, machine, stage_from, stage_to,
       actor, note, client_ms, at_ms, clock, origin)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    seq, id, n(e.clientId ?? null), e.orderCode, e.action, n(e.machine ?? null), e.from, e.to,
    e.actor, e.note ?? '', n(e.clientMs ?? null), e.atMs, clockLabel(e.atMs), e.origin ?? 'api',
  );
  return {
    id, seq, at: e.atMs, clock: clockLabel(e.atMs), code: e.orderCode, action: e.action,
    machine: e.machine ?? null, stage: e.from, to: e.to, by: e.actor, note: e.note ?? '',
    sync: 'terkirim', origin: e.origin ?? 'api',
  };
}

export async function eventByClientId(db: Db, clientId: string): Promise<FloorEvent | undefined> {
  const r = await db.get<EventRow>(`SELECT ${EVENT_COLS} FROM order_events WHERE client_id = ?`, clientId);
  return r ? toEvent(r) : undefined;
}

export async function listEvents(db: Db, opts: { code?: string; limit?: number; sinceSeq?: number } = {}): Promise<FloorEvent[]> {
  const where: string[] = [];
  const params: SqlParam[] = [];
  if (opts.code) { where.push('order_code = ?'); params.push(opts.code.toUpperCase()); }
  if (opts.sinceSeq) { where.push('seq > ?'); params.push(opts.sinceSeq); }
  const sql = `SELECT ${EVENT_COLS} FROM order_events ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY seq DESC LIMIT ?`;
  params.push(opts.limit ?? 200);
  return (await db.all<EventRow>(sql, ...params)).map(toEvent);
}

export async function maxEventSeq(db: Db): Promise<number> {
  return await db.scalar<number>('SELECT COALESCE(MAX(seq), 0) FROM order_events') ?? 0;
}

/* ── Pelanggan, alamat, dompet ───────────────────────────── */

interface CustomerRow {
  id: string; user_id: string | null; name: string; phone: string; tier: string;
  tier_ms: number | null; renews_ms: number | null; stamps: number; balance: number;
  is_walkin: number; created_ms: number;
}

export interface Customer {
  id: string; userId: string | null; name: string; phone: string; tier: string;
  tierMs: number | null; renewsMs: number | null; stamps: number; balance: number;
  isWalkin: boolean; createdMs: number;
}

function toCustomer(r: CustomerRow): Customer {
  return {
    id: r.id, userId: r.user_id, name: r.name, phone: r.phone, tier: r.tier,
    tierMs: r.tier_ms, renewsMs: r.renews_ms, stamps: r.stamps, balance: r.balance,
    isWalkin: unb(r.is_walkin), createdMs: r.created_ms,
  };
}

export async function listCustomers(db: Db): Promise<Customer[]> {
  return (await db.all<CustomerRow>('SELECT * FROM customers ORDER BY name')).map(toCustomer);
}

export async function getCustomer(db: Db, id: string): Promise<Customer | undefined> {
  const r = await db.get<CustomerRow>('SELECT * FROM customers WHERE id = ?', id);
  return r ? toCustomer(r) : undefined;
}

export async function getCustomerByName(db: Db, name: string): Promise<Customer | undefined> {
  const r = await db.get<CustomerRow>('SELECT * FROM customers WHERE name = ? LIMIT 1', name);
  return r ? toCustomer(r) : undefined;
}

export async function getCustomerByPhone(db: Db, phone: string): Promise<Customer | undefined> {
  const digits = phone.replace(/\D/g, '');
  const r = await db.get<CustomerRow>("SELECT * FROM customers WHERE replace(replace(replace(phone,'-',''),' ',''),'.','') = ? LIMIT 1", digits);
  return r ? toCustomer(r) : undefined;
}

export async function insertCustomer(db: Db, c: Omit<Customer, 'isWalkin'> & { isWalkin?: boolean }): Promise<void> {
  await db.run(
    `INSERT INTO customers (id, user_id, name, phone, tier, tier_ms, renews_ms, stamps, balance, is_walkin, created_ms)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    c.id, n(c.userId), c.name, c.phone, c.tier, n(c.tierMs), n(c.renewsMs), c.stamps, c.balance,
    b(c.isWalkin ?? false), c.createdMs,
  );
}

export async function patchCustomer(
  db: Db, id: string,
  patch: Partial<Pick<Customer, 'tier' | 'stamps' | 'balance' | 'userId' | 'renewsMs' | 'tierMs' | 'phone'>>,
): Promise<Customer | undefined> {
  const colOf: Record<string, string> = {
    tier: 'tier', stamps: 'stamps', balance: 'balance', userId: 'user_id',
    renewsMs: 'renews_ms', tierMs: 'tier_ms', phone: 'phone',
  };
  const sets: string[] = [];
  const params: SqlParam[] = [];
  for (const [k, col] of Object.entries(colOf)) {
    const v = patch[k as keyof typeof patch];
    if (v === undefined) continue;
    sets.push(`${col} = ?`);
    params.push(n(v));
  }
  if (sets.length) {
    params.push(id);
    await db.run(`UPDATE customers SET ${sets.join(', ')} WHERE id = ?`, ...params);
  }
  return await getCustomer(db, id);
}

/** Naikkan stempel loyalti; penuh 7 → kembali ke 0 (satu kg gratis sudah dipakai). */
export async function bumpStamps(db: Db, customerId: string): Promise<number> {
  const cur = (await db.get<{ stamps: number }>('SELECT stamps FROM customers WHERE id = ?', customerId))?.stamps ?? 0;
  const next = cur < STAMP_CYCLE ? cur + 1 : 0;
  await db.run('UPDATE customers SET stamps = ? WHERE id = ?', next, customerId);
  return next;
}

export async function listAddresses(db: Db, customerId: string): Promise<Address[]> {
  return (await db.all<{ id: string; tag: string; label: string; is_default: number }>(
    'SELECT * FROM addresses WHERE customer_id = ? ORDER BY is_default DESC, id', customerId,
  )).map((r) => ({ id: r.id, tag: r.tag, label: r.label, def: unb(r.is_default) }));
}

export async function insertAddress(db: Db, a: Address & { customerId: string }): Promise<Address> {
  if (a.def) await db.run('UPDATE addresses SET is_default = 0 WHERE customer_id = ?', a.customerId);
  await db.run('INSERT INTO addresses (id, customer_id, tag, label, is_default) VALUES (?,?,?,?,?)',
    a.id, a.customerId, a.tag, a.label, b(a.def));
  return { id: a.id, tag: a.tag, label: a.label, def: a.def };
}

export async function deleteAddress(db: Db, id: string, customerId: string): Promise<Address[]> {
  await db.run('DELETE FROM addresses WHERE id = ? AND customer_id = ?', id, customerId);
  const left = await listAddresses(db, customerId);
  if (left.length && !left.some((a) => a.def)) {
    await db.run('UPDATE addresses SET is_default = 1 WHERE id = ?', left[0]!.id);
  }
  return await listAddresses(db, customerId);
}

export async function setDefaultAddress(db: Db, id: string, customerId: string): Promise<Address[]> {
  await db.run('UPDATE addresses SET is_default = 0 WHERE customer_id = ?', customerId);
  await db.run('UPDATE addresses SET is_default = 1 WHERE id = ? AND customer_id = ?', id, customerId);
  return await listAddresses(db, customerId);
}

interface TxRow {
  id: string; type: string; label: string; amount: number; at_ms: number; at_label: string;
  status: string; order_code: string | null;
}

export async function listTx(db: Db, customerId: string, limit = 100): Promise<WalletTx[]> {
  return (await db.all<TxRow>(
    'SELECT * FROM wallet_tx WHERE customer_id = ? ORDER BY at_ms DESC LIMIT ?', customerId, limit,
  )).map((r) => ({
    id: r.id, type: r.type as WalletTx['type'], label: r.label, amount: r.amount,
    at: r.at_label || createdLabel(r.at_ms), status: r.status, orderCode: r.order_code,
  }));
}

export async function insertTx(db: Db, t: {
  id?: string; customerId: string; type: WalletTx['type']; label: string; amount: number;
  atMs: number; status?: string; orderCode?: string | null; source?: string;
}): Promise<WalletTx> {
  const id = t.id ?? `TX-${9000 + await nextCounter(db, 'tx_seq')}`;
  await db.run(
    `INSERT INTO wallet_tx (id, customer_id, type, label, amount, at_ms, at_label, status, order_code, source)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    id, t.customerId, t.type, t.label, t.amount, t.atMs, createdLabel(t.atMs),
    t.status ?? 'sukses', n(t.orderCode ?? null), t.source ?? 'api',
  );
  return {
    id, type: t.type, label: t.label, amount: t.amount, at: createdLabel(t.atMs),
    status: t.status ?? 'sukses', orderCode: t.orderCode ?? null,
  };
}

export async function adjustBalance(db: Db, customerId: string, delta: number): Promise<number> {
  await db.run('UPDATE customers SET balance = balance + ? WHERE id = ?', Math.round(delta), customerId);
  return (await db.get<{ balance: number }>('SELECT balance FROM customers WHERE id = ?', customerId))?.balance ?? 0;
}

/* ── Pengguna & auth ─────────────────────────────────────── */

interface UserRow {
  id: string; role: string; name: string; phone: string | null; phone_digits: string | null;
  username: string | null; pass_salt: string; pass_hash: string; active: number; created_ms: number;
}

export type AuthUser = User & { salt: string; hash: string };

function toUser(r: UserRow): User {
  return {
    id: r.id, role: r.role as User['role'], name: r.name,
    phone: r.phone, username: r.username, active: unb(r.active),
  };
}

export async function insertUser(db: Db, u: {
  id: string; role: User['role']; name: string; phone?: string | null;
  username?: string | null; salt: string; hash: string; createdMs: number;
}): Promise<void> {
  await db.run(
    `INSERT INTO users (id, role, name, phone, phone_digits, username, pass_salt, pass_hash, active, created_ms)
     VALUES (?,?,?,?,?,?,?,?,1,?)`,
    u.id, u.role, u.name, n(u.phone ?? null), n(u.phone ? u.phone.replace(/\D/g, '') : null),
    n(u.username ?? null), u.salt, u.hash, u.createdMs,
  );
}

/** Login boleh pakai username (staf) atau nomor telepon (pelanggan), format bebas. */
export async function findUserByLogin(db: Db, login: string): Promise<AuthUser | undefined> {
  const raw = login.trim();
  const key = raw.toLowerCase();
  const digits = raw.replace(/\D/g, '');
  const r = await db.get<UserRow>(
    `SELECT * FROM users WHERE (username IS NOT NULL AND lower(username) = ?)
        OR (phone_digits IS NOT NULL AND phone_digits = ?) LIMIT 1`,
    key, digits,
  );
  return r ? { ...toUser(r), salt: r.pass_salt, hash: r.pass_hash } : undefined;
}

export async function findUserById(db: Db, id: string): Promise<User | undefined> {
  const r = await db.get<UserRow>('SELECT * FROM users WHERE id = ?', id);
  return r ? toUser(r) : undefined;
}

export async function setUserPassword(db: Db, id: string, salt: string, hash: string): Promise<void> {
  await db.run('UPDATE users SET pass_salt = ?, pass_hash = ? WHERE id = ?', salt, hash, id);
}

export async function countUsers(db: Db): Promise<number> {
  return await db.scalar<number>('SELECT COUNT(*) FROM users') ?? 0;
}

export async function listUsers(db: Db): Promise<User[]> {
  return (await db.all<UserRow>('SELECT * FROM users ORDER BY created_ms DESC')).map(toUser);
}

export async function findUserByUsername(db: Db, username: string): Promise<User | undefined> {
  const r = await db.get<UserRow>('SELECT * FROM users WHERE lower(username) = ?', username.toLowerCase());
  return r ? toUser(r) : undefined;
}

export async function findUserByPhoneDigits(db: Db, digits: string): Promise<User | undefined> {
  const r = await db.get<UserRow>('SELECT * FROM users WHERE phone_digits = ?', digits);
  return r ? toUser(r) : undefined;
}

export async function patchUser(db: Db, id: string, patch: Partial<Pick<User, 'name' | 'role' | 'active'>>): Promise<User | undefined> {
  const sets: string[] = [];
  const params: SqlParam[] = [];
  if (patch.name !== undefined) { sets.push('name = ?'); params.push(patch.name); }
  if (patch.role !== undefined) { sets.push('role = ?'); params.push(patch.role); }
  if (patch.active !== undefined) { sets.push('active = ?'); params.push(b(patch.active)); }
  if (sets.length) {
    params.push(id);
    await db.run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, ...params);
  }
  return await findUserById(db, id);
}

export async function deleteUser(db: Db, id: string): Promise<boolean> {
  const res = await db.run('DELETE FROM users WHERE id = ?', id);
  return (res.changes ?? 0) > 0;
}

/* ── Token blacklist (logout) ────────────────────────────── */

export async function blacklistToken(db: Db, jti: string, userId: string, expiresAt: number): Promise<void> {
  await db.run(
    'INSERT INTO token_blacklist (jti, user_id, expires_at) VALUES (?,?,?) ON CONFLICT (jti) DO NOTHING',
    jti, userId, expiresAt,
  );
}

export async function isTokenBlacklisted(db: Db, jti: string): Promise<boolean> {
  return !!await db.get('SELECT 1 FROM token_blacklist WHERE jti = ?', jti);
}

export async function cleanExpiredTokens(db: Db): Promise<number> {
  const res = await db.run('DELETE FROM token_blacklist WHERE expires_at < ?', Date.now());
  return Number(res.changes ?? 0);
}

/* ── Password reset tokens ───────────────────────────────── */

export async function insertPasswordReset(db: Db, token: string, userId: string, expiresMs: number): Promise<void> {
  await db.run(
    'INSERT INTO password_resets (token, user_id, used, created_ms, expires_ms) VALUES (?,?,0,?,?)',
    token, userId, Date.now(), expiresMs,
  );
}

export async function findPasswordReset(db: Db, token: string): Promise<{ userId: string; expiresMs: number; used: boolean } | undefined> {
  const r = await db.get<{ user_id: string; expires_ms: number; used: number }>(
    'SELECT user_id, expires_ms, used FROM password_resets WHERE token = ?', token,
  );
  return r ? { userId: r.user_id, expiresMs: r.expires_ms, used: unb(r.used) } : undefined;
}

export async function markPasswordResetUsed(db: Db, token: string): Promise<void> {
  await db.run('UPDATE password_resets SET used = 1 WHERE token = ?', token);
}

export async function cleanExpiredResets(db: Db): Promise<number> {
  const res = await db.run('DELETE FROM password_resets WHERE expires_ms < ?', Date.now());
  return Number(res.changes ?? 0);
}

/* ── Referensi ───────────────────────────────────────────── */

export async function listStaff(db: Db): Promise<StaffMember[]> {
  return await db.all<{ name: string; role: string; done: number; rating: number; tag: string }>(
    'SELECT name, role, done, rating, tag FROM staff ORDER BY sort, name',
  );
}

export async function listAreas(db: Db): Promise<Area[]> {
  return (await db.all<{ kode: string; kec: string; eta: string; slot_cap: number }>(
    'SELECT kode, kec, eta, slot_cap FROM areas ORDER BY slot_cap DESC, kec',
  )).map((r) => ({ kode: r.kode, kec: r.kec, eta: r.eta, slot: r.slot_cap }));
}

export async function listTiers(db: Db): Promise<Tier[]> {
  return (await db.all<{ id: string; name: string; price: number; unit: string; tone: string; best: string; perks_json: string; kg_quota: number }>(
    'SELECT * FROM tiers ORDER BY sort, price',
  )).map((r) => ({
    id: r.id, name: r.name, price: r.price, unit: r.unit, tone: r.tone, best: r.best,
    perks: jparse<string[]>(r.perks_json, []), kgQuota: r.kg_quota,
  }));
}

export async function getTier(db: Db, id: string): Promise<Tier | undefined> {
  return (await listTiers(db)).find((t) => t.id === id);
}

export async function upsertTier(db: Db, t: Tier, sort: number): Promise<void> {
  await db.run(
    `INSERT INTO tiers (id, name, price, unit, tone, best, perks_json, kg_quota, sort) VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, price=excluded.price, unit=excluded.unit,
       tone=excluded.tone, best=excluded.best, perks_json=excluded.perks_json,
       kg_quota=excluded.kg_quota, sort=excluded.sort`,
    t.id, t.name, t.price, t.unit, t.tone, t.best, jstr(t.perks), t.kgQuota, sort,
  );
}

export async function upsertArea(db: Db, a: Area): Promise<void> {
  await db.run(
    `INSERT INTO areas (kode, kec, eta, slot_cap) VALUES (?,?,?,?)
     ON CONFLICT(kode) DO UPDATE SET kec=excluded.kec, eta=excluded.eta, slot_cap=excluded.slot_cap`,
    a.kode, a.kec, a.eta, a.slot,
  );
}

export async function upsertStaff(db: Db, s: StaffMember, id: string, sort: number): Promise<void> {
  await db.run(
    `INSERT INTO staff (id, name, role, done, rating, tag, sort) VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, role=excluded.role, done=excluded.done,
       rating=excluded.rating, tag=excluded.tag, sort=excluded.sort`,
    id, s.name, s.role, s.done, s.rating, s.tag, sort,
  );
}

export async function getContent<T>(db: Db, key: string, fallback: T): Promise<T> {
  const r = await db.get<{ value_json: string }>('SELECT value_json FROM content WHERE key = ?', key);
  return r ? jparse<T>(r.value_json, fallback) : fallback;
}

export async function setContent(db: Db, key: string, value: unknown): Promise<void> {
  await db.run(
    'INSERT INTO content (key, value_json) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value_json = ?',
    key, jstr(value), jstr(value),
  );
}

/* ── QRIS pembayaran ─────────────────────────────────────── */

/** Gambar QRIS yang diunggah admin, disimpan sebagai data URL di settings. */
export interface QrisImage { dataUrl: string; updatedAt: number }

export async function getQrisImage(db: Db): Promise<QrisImage | null> {
  const v = await getSetting<QrisImage | null>(db, 'qris_image', null);
  if (!v || typeof v.dataUrl !== 'string' || !v.dataUrl.startsWith('data:image/')) return null;
  return { dataUrl: v.dataUrl, updatedAt: typeof v.updatedAt === 'number' ? v.updatedAt : 0 };
}

export async function setQrisImage(db: Db, image: QrisImage | null): Promise<QrisImage | null> {
  await setSetting(db, 'qris_image', image);
  return image;
}

/* ── Notifikasi & chat ───────────────────────────────────── */

interface NotifRow {
  id: string; customer_id: string | null; tone: string; icon: string; title: string;
  msg: string; at_ms: number; at_label: string; is_read: number;
}

function toNotif(r: NotifRow): AppNotification {
  return {
    id: r.id, customerId: r.customer_id, tone: r.tone, icon: r.icon, title: r.title, msg: r.msg,
    at: r.at_label || clockLabel(r.at_ms), read: unb(r.is_read),
  };
}

export async function insertNotification(db: Db, x: {
  id?: string; customerId?: string | null; tone: string; icon: string;
  title: string; msg?: string; atMs?: number;
}): Promise<AppNotification> {
  const atMs = x.atMs ?? Date.now();
  const id = x.id ?? `n-${await nextCounter(db, 'notif_seq')}`;
  await db.run(
    'INSERT INTO notifications (id, customer_id, tone, icon, title, msg, at_ms, at_label, is_read) VALUES (?,?,?,?,?,?,?,?,0)',
    id, n(x.customerId ?? null), x.tone, x.icon, x.title, x.msg ?? '', atMs, clockLabel(atMs),
  );
  return {
    id, customerId: x.customerId ?? null, tone: x.tone, icon: x.icon, title: x.title,
    msg: x.msg ?? '', at: clockLabel(atMs), read: false,
  };
}

export async function listNotifications(db: Db, customerId: string | null, limit = 40): Promise<AppNotification[]> {
  const rows = customerId
    ? await db.all<NotifRow>('SELECT * FROM notifications WHERE customer_id = ? OR customer_id IS NULL ORDER BY at_ms DESC LIMIT ?', customerId, limit)
    : await db.all<NotifRow>('SELECT * FROM notifications ORDER BY at_ms DESC LIMIT ?', limit);
  return rows.map(toNotif);
}

export async function markNotificationsRead(db: Db, customerId: string | null): Promise<number> {
  const res = customerId
    ? await db.run('UPDATE notifications SET is_read = 1 WHERE (customer_id = ? OR customer_id IS NULL) AND is_read = 0', customerId)
    : await db.run('UPDATE notifications SET is_read = 1 WHERE is_read = 0');
  return Number(res.changes);
}

export async function listChat(db: Db, customerId: string, limit = 60): Promise<ChatMessage[]> {
  return (await db.all<{ id: string; sender: string; body: string; at_ms: number }>(
    'SELECT * FROM chat_messages WHERE customer_id = ? ORDER BY at_ms ASC LIMIT ?', customerId, limit,
  )).map((r) => ({ id: r.id, from: r.sender as ChatMessage['from'], text: r.body, at: clockLabel(r.at_ms) }));
}

export async function insertChat(db: Db, m: {
  id?: string; customerId: string | null; from: ChatMessage['from']; text: string; atMs?: number;
}): Promise<ChatMessage> {
  const atMs = m.atMs ?? Date.now();
  const id = m.id ?? `ch-${await nextCounter(db, 'chat_seq')}`;
  await db.run(
    'INSERT INTO chat_messages (id, customer_id, sender, body, at_ms) VALUES (?,?,?,?,?)',
    id, n(m.customerId), m.from, m.text, atMs,
  );
  return { id, from: m.from, text: m.text, at: clockLabel(atMs) };
}

/* ── Peredaran harian & turunan ──────────────────────────── */

export async function listRevenue(db: Db, days: number): Promise<RevenueDay[]> {
  const rows = await db.all<{ day: string; gross: number; orders_count: number; source: string }>(
    'SELECT day, gross, orders_count, source FROM daily_revenue ORDER BY day DESC LIMIT ?', days,
  );
  return rows.reverse().map((r) => ({
    day: r.day, d: r.day.slice(-2), v: Math.round(r.gross / 1000), n: r.orders_count,
    source: r.source as RevenueDay['source'],
  }));
}

/**
 * Tambah peredaran dari transaksi nyata. Baris contoh (source='seed') pada hari
 * yang sama DITIMPA angka live — angka contoh tidak pernah bercampur jadi "total".
 */
export async function bumpRevenue(db: Db, atMs: number, gross: number): Promise<void> {
  const day = dayKey(atMs);
  const g = Math.round(gross);
  await db.run(
    `INSERT INTO daily_revenue (day, gross, orders_count, source) VALUES (?,?,1,'live')
     ON CONFLICT(day) DO UPDATE SET
       gross = CASE WHEN daily_revenue.source = 'seed' THEN excluded.gross ELSE daily_revenue.gross + excluded.gross END,
       orders_count = CASE WHEN daily_revenue.source = 'seed' THEN 1 ELSE daily_revenue.orders_count + 1 END,
       source = 'live'`,
    day, g,
  );
}

export async function seedRevenueDay(db: Db, day: string, gross: number, count: number): Promise<void> {
  await db.run(
    `INSERT INTO daily_revenue (day, gross, orders_count, source) VALUES (?,?,?,'seed') ON CONFLICT(day) DO NOTHING`,
    day, Math.round(gross), count,
  );
}

/** Komposisi layanan berdasarkan volume (kg + unit) dari pesanan nyata. */
export async function serviceMix(db: Db): Promise<MixSlice[]> {
  const rows = await db.all<{ items_json: string }>('SELECT items_json FROM orders WHERE cancelled = 0');
  const services = await listServices(db);
  const tally = new Map<string, number>();
  let sum = 0;
  for (const r of rows) {
    for (const it of jparse<OrderItem[]>(r.items_json, [])) {
      if (!(it.qty > 0)) continue;
      tally.set(it.id, (tally.get(it.id) ?? 0) + it.qty);
      sum += it.qty;
    }
  }
  if (!sum) return [];
  return [...tally.entries()]
    .map(([id, v]) => {
      const s = services.find((x) => x.id === id);
      return { label: s?.name ?? id, pct: Math.round((v / sum) * 100), tone: s?.tone ?? 'muted' };
    })
    .sort((a, b2) => b2.pct - a.pct)
    .slice(0, 6);
}

const ACTION_TEXT: Record<ScanAction, string> = {
  terima: 'diterima di kasir', muat: 'dimuat ke drum', tahap: 'naik tahap',
  lepas: 'drum dikosongkan', qc: 'balik rendam (QC)', selesai: 'diserahkan',
};

/** Aktivitas lantai diturunkan dari event asli, bukan daftar karangan. */
export async function activityFeed(db: Db, limit = 8): Promise<{ t: string; text: string; tone: string; icon: string }[]> {
  const rows = (await listEvents(db, { limit })).map((e) => ({
    t: e.clock,
    text: `${e.code} · ${e.by} · ${ACTION_TEXT[e.action]}${e.machine ? ` di ${e.machine}` : ''}`,
    tone: e.action === 'qc' ? 'red' : e.action === 'lepas' ? 'amber' : e.action === 'selesai' ? 'mint' : 'blue',
    icon: e.action === 'selesai' ? 'star' : e.action === 'muat' ? 'drum' : e.action === 'qc' ? 'alert' : 'scan',
  }));
  if (rows.length < limit) {
    for (const nx of await listNotifications(db, null, limit - rows.length)) {
      rows.push({ t: nx.at, text: nx.title + (nx.msg ? ` — ${nx.msg}` : ''), tone: nx.tone, icon: nx.icon });
    }
  }
  return rows.slice(0, limit);
}

/** Sisa kursi per slot jemput untuk satu tanggal, dari semua slot yang kami buka. */
export async function slotLoad(db: Db, date: string): Promise<{ slot: string; booked: number }[]> {
  const rows = await db.all<{ slot_time: string }>(
    'SELECT slot_time FROM orders WHERE slot_date = ? AND cancelled = 0', date,
  );
  const tally = new Map<string, number>();
  for (const r of rows) tally.set(r.slot_time, (tally.get(r.slot_time) ?? 0) + 1);
  return SLOTS.map((slot) => ({ slot, booked: tally.get(slot) ?? 0 }));
}
