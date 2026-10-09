import type { Db } from '../db/client.ts';
import * as R from '../db/repo.ts';
import { COURIERS, LAST_STAGE } from './constants.ts';
import type { Decision } from './rules.ts';
import type { AppNotification, FloorEvent, Machine, Order } from './types.ts';

/**
 * Penerap keputusan lantai. Satu-satunya tempat sebuah Decision berubah menjadi
 * baris di database — dipakai oleh route /scan maupun simulator lantai, sehingga
 * keduanya tidak mungkin menyimpang satu sama lain.
 *
 * Semua mutasi (event log, proyeksi order, proyeksi mesin, stempel loyalti,
 * notifikasi) terjadi dalam SATU transaksi. Log append-only tetap sumber
 * kebenaran; tabel lain hanya proyeksi yang ditulis bersamanya.
 */

export interface ApplyOpts {
  actor: string;
  origin?: string;
  clientId?: string | null;
  clientMs?: number | null;
  atMs?: number;
}

export interface ApplyResult {
  event: FloorEvent;
  order: Order;
  machines: Machine[];
  /** Stempel loyalti setelah pesanan selesai, bila order punya pelanggan. */
  stamps: number | null;
  notif: AppNotification | null;
}

export async function applyDecision(db: Db, order: Order, d: Decision, opts: ApplyOpts): Promise<ApplyResult> {
  return await db.tx(async () => {
    const atMs = opts.atMs ?? Date.now();

    const event = await R.insertEvent(db, {
      clientId: opts.clientId ?? null,
      orderCode: order.code,
      action: d.action,
      machine: d.machine,
      from: d.from,
      to: d.to,
      actor: opts.actor,
      note: d.note,
      clientMs: opts.clientMs ?? null,
      atMs,
      origin: opts.origin ?? 'api',
    });

    for (const eff of d.effects) await R.applyMachineEffect(db, eff);

    const patch: Record<string, unknown> = { stage: d.to, stageAt: atMs, scanned: 1 };
    if (d.machine) patch.machine = d.machine;
    if (d.freesOrderMachine) patch.machine = '—';
    if (d.assignCourier) {
      const busy = new Set(
        (await R.listOrders(db, { limit: 500 })).map((o) => o.courier).filter((c) => c !== '—'),
      );
      patch.courier = COURIERS.find((c) => !busy.has(c)) ?? COURIERS[0]!;
    }

    let stamps: number | null = null;
    let notif: AppNotification | null = null;

    if (d.completes && d.to === LAST_STAGE) {
      if (order.customerId && !order.collected) {
        stamps = await R.bumpStamps(db, order.customerId);
        patch.machine = patch.machine ?? '—';
      }
      if (order.customerId && !order.collected) {
        notif = await R.insertNotification(db, {
          customerId: order.customerId, tone: 'mint', icon: 'star',
          title: `${order.code} siap diambil`, msg: 'Berlaku 3 hari di gerai.',
          atMs,
        });
      }
    }

    await R.patchOrder(db, order.code, patch);
    const fresh = await R.getOrder(db, order.code);
    if (!fresh) throw new Error(`Order ${order.code} hilang setelah diterapkan — transaksi digulung.`);
    const machines = await R.listMachines(db);

    return { event, order: fresh, machines, stamps, notif };
  });
}
