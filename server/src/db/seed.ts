import { setCounter, type Db } from './client.ts';
import * as R from './repo.ts';
import {
  DEFAULT_BALANCE, DEFAULT_CUSTOMER, DEFAULT_STAMPS, SEED_ADDONS, SEED_ADDRESSES, SEED_AREAS,
  SEED_CHAT, SEED_CONTENT, SEED_MACHINES, SEED_ORDERS, SEED_PROMOS, SEED_REVENUE, SEED_SERVICES,
  SEED_STAFF, SEED_TIERS, SEED_TXNS, SEED_USERS, type SeedOrder,
} from '../seed/data.ts';
import { quote } from '../domain/pricing.ts';
import { isStuck } from '../domain/rules.ts';
import { hashPassword } from '../lib/password.ts';
import { uid } from '../lib/ids.ts';
import { LAST_STAGE, STAGES, dayKey } from '../domain/constants.ts';
import type { Config } from '../config.ts';
import type { Order, ScanAction } from '../domain/types.ts';

/** Naikkan bila isi seed berubah, supaya database lama di-seed ulang saat reset. */
export const SEED_VERSION = '1';

export interface SeedResult {
  seeded: boolean;
  version: string;
  orders: number;
  events: number;
  users: number;
}

export async function seedVersion(db: Db): Promise<string | null> {
  return (await db.get<{ value: string }>('SELECT value FROM schema_meta WHERE key = ?', 'seeded'))?.value ?? null;
}

function atTime(base: Date, dayOffset: number, hh: number, mm: number): number {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, hh, mm, 0, 0).getTime();
}

/** Waktu seed tidak boleh jatuh di masa depan bila server dinyalakan pagi-pagi. */
function notFuture(ms: number, now: number): number {
  return Math.min(ms, now - 60_000);
}

export async function seedIfEmpty(db: Db, cfg: Config): Promise<SeedResult> {
  const current = await seedVersion(db);
  if (current === SEED_VERSION) {
    return {
      seeded: false, version: SEED_VERSION,
      orders: await db.scalar<number>('SELECT COUNT(*) FROM orders') ?? 0,
      events: await db.scalar<number>('SELECT COUNT(*) FROM order_events') ?? 0,
      users: await db.scalar<number>('SELECT COUNT(*) FROM users') ?? 0,
    };
  }

  return await db.tx(async () => {
    const now = Date.now();
    const today = new Date(now);

    /* Katalog & referensi */
    for (const [i, s] of SEED_SERVICES.entries()) await R.upsertService(db, s, i);
    for (const [i, a] of SEED_ADDONS.entries()) await R.upsertAddon(db, a, i);
    for (const p of SEED_PROMOS) await R.upsertPromo(db, p);
    for (const [i, t] of SEED_TIERS.entries()) await R.upsertTier(db, t, i);
    for (const a of SEED_AREAS) await R.upsertArea(db, a);
    for (const [i, s] of SEED_STAFF.entries()) await R.upsertStaff(db, s, uid('st'), i);
    for (const [i, m] of SEED_MACHINES.entries()) await R.upsertMachine(db, m, i);
    for (const [key, value] of Object.entries(SEED_CONTENT)) await R.setContent(db, key, value);

    /* Pelanggan — satu baris per nama berbeda di daftar order */
    const customerIds = new Map<string, string>();
    for (const o of SEED_ORDERS) {
      if (customerIds.has(o.customer)) continue;
      const id = uid('c');
      const isPersona = o.customer === DEFAULT_CUSTOMER;
      await R.insertCustomer(db, {
        id, userId: null, name: o.customer, phone: o.phone,
        tier: isPersona ? 'premium' : 'basic',
        tierMs: isPersona ? atTime(today, -30, 9, 0) : null,
        renewsMs: isPersona ? atTime(today, 23, 0, 0) : null,
        stamps: isPersona ? DEFAULT_STAMPS : 0,
        balance: isPersona ? DEFAULT_BALANCE : 0,
        isWalkin: !isPersona,
        createdMs: notFuture(atTime(today, -60, 9, 0), now),
      });
      customerIds.set(o.customer, id);
    }

    /* Akun login. Semua akun demo memakai satu password development yang sama. */
    const { salt, hash } = hashPassword(cfg.seedPassword);
    let users = 0;
    for (const u of SEED_USERS) {
      await R.insertUser(db, {
        id: uid('u'), role: u.role, name: u.name,
        phone: u.phone ?? null, username: u.username ?? null,
        salt, hash, createdMs: notFuture(atTime(today, -60, 8, 0), now),
      });
      users++;
      if (u.role === 'customer' && u.customer) {
        const cid = customerIds.get(u.customer);
        const found = await R.findUserByLogin(db, u.phone ?? '');
        if (cid && found) await R.patchCustomer(db, cid, { userId: found.id });
      }
    }

    /* Pesanan — harga dihitung ulang oleh mesin pricing, bukan angka hardcode */
    const book = await R.priceBook(db);
    const inserted: { order: Order; seed: SeedOrder; createdMs: number; stageAt: number }[] = [];
    for (const s of SEED_ORDERS) {
      const createdMs = notFuture(atTime(today, s.created.dayOffset, s.created.hh, s.created.mm), now);
      const stageAt = Math.max(createdMs, now - s.stageAgoMin * 60_000);
      const q = quote({
        items: s.items, addons: s.addons, mode: s.mode,
        promoCode: s.promoCode ?? null, protect: s.protect ?? false,
      }, book);
      const slotMs = atTime(today, s.slotDayOffset, 0, 0);
      /*
       * order.machine diturunkan dari tabel mesin (sumber kebenaran drum), bukan
       * dari angka di daftar order. Pesanan yang tahapnya butuh drum tapi tidak
       * dipegang mesin mana pun tercatat "menunggu drum" ('—'), bukan menempel
       * ke mesin yang sebenarnya memegang order lain.
       */
      const holding = SEED_MACHINES.find((m) => m.ticket === s.code);
      await R.insertOrder(db, {
        code: s.code,
        customerId: customerIds.get(s.customer) ?? null,
        customer: s.customer, phone: s.phone, weight: q.weight || s.weight, mode: s.mode,
        items: s.items, addons: s.addons,
        subtotal: q.sub, ship: q.ship, disc: q.disc, protect: q.prot, total: q.total,
        promoCode: q.promo ? q.promo.code : null,
        pay: s.pay, payStatus: s.paid ? 'lunas' : 'belum', priority: s.priority,
        slotDate: dayKey(slotMs), slotTime: s.slotTime, courier: s.courier, notes: s.notes,
        createdMs, source: 'seed', stage: s.stage, machine: holding ? holding.id : '—',
        collected: s.collected ?? false, scanned: s.stage > 0, stageAtMs: stageAt,
      });
      const order = (await R.getOrder(db, s.code))!;
      inserted.push({ order, seed: s, createdMs, stageAt });
    }

    /*
     * Riwayat event disintesis supaya log append-only cocok dengan proyeksi:
     * pesanan yang sudah di tahap 5 punya jejak terima → muat → naik tahap,
     * bukan tiba-tiba muncul di tengah tanpa catatan.
     */
    let events = 0;
    const actors = SEED_STAFF.map((s) => s.name);
    for (const { order, createdMs, stageAt } of inserted) {
      const steps = buildHistory(order.stage);
      const span = Math.max(1000, stageAt - createdMs);
      for (const [i, step] of steps.entries()) {
        const at = createdMs + Math.round((span * (i + 1)) / steps.length);
        await R.insertEvent(db, {
          orderCode: order.code, action: step.action,
          machine: step.needsMachine ? (order.machine === '—' ? null : order.machine) : null,
          from: step.from, to: step.to, actor: actors[i % actors.length]!,
          note: '', atMs: at, origin: 'seed',
        });
        events++;
      }
    }

    /* Dompet: mutasi contoh + alamat + chat untuk pelanggan persona */
    const personaId = customerIds.get(DEFAULT_CUSTOMER);
    if (personaId) {
      for (const t of SEED_TXNS) {
        await R.insertTx(db, {
          id: t.id, customerId: personaId, type: t.type, label: t.label, amount: t.amount,
          atMs: notFuture(atTime(today, t.dayOffset, t.hh, t.mm), now), status: t.status,
          orderCode: /BUSA-\d+/.exec(t.label)?.[0] ?? null, source: 'seed',
        });
      }
      for (const [i, a] of SEED_ADDRESSES.entries()) {
        await R.insertAddress(db, {
          id: `a${i + 1}`, customerId: personaId, tag: a.tag, label: a.label, def: a.def,
        });
      }
      for (const [i, c] of SEED_CHAT.entries()) {
        await R.insertChat(db, {
          customerId: personaId, from: c.from, text: c.text,
          atMs: notFuture(atTime(today, 0, 10, 20 + i), now),
        });
      }
    }

    /* Riwayat peredaran 14 hari — ditandai seed, hari berjalan nanti ditimpa angka live */
    for (const r of SEED_REVENUE) {
      await R.seedRevenueDay(db, dayKey(atTime(today, r.dayOffset, 12, 0)), r.v * 1000, r.n);
    }

    /* Notifikasi diturunkan dari keadaan nyata, bukan ditulis manual */
    for (const { order } of inserted) {
      if (order.stage === LAST_STAGE && !order.collected) {
        await R.insertNotification(db, {
          customerId: order.customerId, tone: 'mint', icon: 'star',
          title: `${order.code} siap diambil`, msg: `Rak ${order.rack ?? 'C-07'} · berlaku 3 hari`,
          atMs: Math.max(order.stageAt ?? now, now - 3_600_000),
        });
      } else if (order.priority === 'express' && order.stage > 0 && order.stage < LAST_STAGE) {
        await R.insertNotification(db, {
          customerId: order.customerId, tone: 'orange', icon: 'bolt',
          title: `Express ${order.code} jalan`, msg: `Didahulukan di ${order.machine}`,
          atMs: order.stageAt ?? now,
        });
      }
      if (isStuck(order, now)) {
        await R.insertNotification(db, {
          customerId: null, tone: 'red', icon: 'alert',
          title: `${order.code} macet di ${STAGES[order.stage]?.label ?? '—'}`,
          msg: 'Lewat dari target tahap ini; perlu dipindai atau dipindah drum.',
          atMs: now,
        });
      }
    }

    /* Counter diset supaya kode berikutnya nyambung dengan data contoh */
    await setCounter(db, 'order_seq', 4471);
    await setCounter(db, 'tx_seq', 21);
    await db.run(
      'INSERT INTO schema_meta (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = ?',
      'seeded', SEED_VERSION, SEED_VERSION,
    );

    return {
      seeded: true, version: SEED_VERSION, orders: inserted.length, events, users,
    };
  });
}

interface HistoryStep {
  action: ScanAction;
  from: number;
  to: number;
  needsMachine: boolean;
}

/** Jejak minimum yang menjelaskan bagaimana sebuah pesanan sampai di tahap sekarang. */
function buildHistory(stage: number): HistoryStep[] {
  const steps: HistoryStep[] = [{ action: 'terima', from: 0, to: 0, needsMachine: false }];
  if (stage <= 0) return steps;
  steps.push({ action: 'tahap', from: 0, to: 1, needsMachine: false });
  if (stage >= 2) steps.push({ action: 'muat', from: 1, to: 2, needsMachine: true });
  for (let s = 3; s <= Math.min(stage, LAST_STAGE - 1); s++) {
    steps.push({ action: 'tahap', from: s - 1, to: s, needsMachine: s >= 2 && s <= 6 });
  }
  if (stage >= LAST_STAGE) {
    steps.push({ action: 'selesai', from: LAST_STAGE - 1, to: LAST_STAGE, needsMachine: false });
  }
  return steps;
}
