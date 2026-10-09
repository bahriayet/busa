import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Db } from '../db/client.ts';
import * as R from '../db/repo.ts';
import {
  ACTION_LABEL, COURIERS, FREE_SHIP_ABOVE, MACHINE_KIND_LABEL, MIN_KG_ORDER, PLAN_LENS,
  PROTECT_RATE, QUEUE_GROUPS, SCAN_ACTIONS, SHIP_FEE, SLOTS, STAGE_MACHINE, STAGE_MIN,
  STAGES, STAMP_CYCLE, TOPUP_BONUS, TOPUP_BONUS_THRESHOLD, stageLabel,
} from '../domain/constants.ts';
import { etaMinutes, isStuck } from '../domain/rules.ts';
import { notFound } from '../lib/http.ts';
import { makeOptionalAuth } from '../plugins/auth.ts';

/**
 * Endpoint publik: data yang sama sekali tidak butuh login. Frontend membaca
 * konfigurasi tahap/slot/konstanta dari sini, jadi satu sumber konfigurasi
 * (server) menggantikan salinan di js/data.js.
 */

export function registerPublicRoutes(app: FastifyInstance, db: Db): void {
  app.get('/api/meta', async () => ({
    ok: true,
    stages: STAGES,
    stageMin: STAGE_MIN,
    stageMachine: STAGE_MACHINE,
    slots: SLOTS,
    actions: SCAN_ACTIONS.map((a) => ({ id: a, label: ACTION_LABEL[a] })),
    machineKinds: MACHINE_KIND_LABEL,
    queueGroups: QUEUE_GROUPS,
    planLens: PLAN_LENS,
    couriers: COURIERS,
    operators: (await R.listStaff(db)).map((s) => s.name),
    constants: {
      minKgOrder: MIN_KG_ORDER, freeShipAbove: FREE_SHIP_ABOVE, shipFee: SHIP_FEE,
      protectRate: PROTECT_RATE, stampCycle: STAMP_CYCLE,
      topupBonusThreshold: TOPUP_BONUS_THRESHOLD, topupBonus: TOPUP_BONUS,
    },
  }));

  /* Katalog: pelanggan hanya melihat yang aktif; staf/admin melihat semua
     supaya layanan yang disembunyikan masih bisa diaktifkan kembali. */
  app.get('/api/catalog', { preHandler: makeOptionalAuth(db) }, async (req) => {
    const staff = req.auth?.role === 'admin' || req.auth?.role === 'staff';
    return {
      ok: true,
      services: await R.listServices(db, staff),
      addons: await R.listAddons(db, staff),
      promos: staff ? await R.listPromos(db) : (await R.listPromos(db)).filter((p) => p.active),
      tiers: await R.listTiers(db),
      areas: await R.listAreas(db),
      couriers: COURIERS,
    };
  });

  app.get('/api/content', async () => ({
    ok: true,
    gallery: await R.getContent<unknown[]>(db, 'gallery', []),
    faq: await R.getContent<unknown[]>(db, 'faq', []),
    testimonials: await R.getContent<unknown[]>(db, 'testimonials', []),
    metrics: await R.getContent<unknown[]>(db, 'metrics', []),
  }));

  app.get('/api/slots', async (req: FastifyRequest<{ Querystring: { date?: string } }>) => {
    const date = req.query.date ?? new Date().toISOString().slice(0, 10);
    return { ok: true, date, slots: await R.slotLoad(db, date) };
  });

  app.get('/api/track/:code', async (req: FastifyRequest<{ Params: { code: string } }>) => {
    const order = await R.findOrderByCode(db, req.params.code);
    if (!order) throw notFound(`Order ${req.params.code} tidak ditemukan.`);
    const queueDepth = (await R.listOrders(db)).filter((o) => o.code !== order.code && o.stage === order.stage).length;
    const eta = etaMinutes(order, await R.listMachines(db), queueDepth);
    const services = await R.listServices(db);
    const first = order.items[0];
    const service = first ? services.find((s) => s.id === first.id) : undefined;
    return {
      ok: true,
      order: {
        code: order.code, customer: order.customer, weight: order.weight,
        stage: order.stage, stageLabel: stageLabel(order.stage),
        machine: order.machine === '—' ? null : order.machine,
        etaLabel: eta.label, etaMins: eta.mins,
        serviceName: service?.name ?? '',
        stuck: isStuck(order, Date.now()),
      },
    };
  });
}
