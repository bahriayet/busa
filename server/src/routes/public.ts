import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Db } from '../db/client.ts';
import type { Config } from '../config.ts';
import * as R from '../db/repo.ts';
import {
  ACTION_LABEL, COURIERS, FREE_SHIP_ABOVE, MACHINE_KIND_LABEL, MIN_KG_ORDER, PLAN_LENS,
  PROTECT_RATE, QUEUE_GROUPS, SCAN_ACTIONS, SHIP_FEE, SLOTS, STAGE_MACHINE, STAGE_MIN,
  STAGES, STAMP_CYCLE, TOPUP_BONUS, TOPUP_BONUS_THRESHOLD, stageLabel,
} from '../domain/constants.ts';
import { etaMinutes, isStuck } from '../domain/rules.ts';
import { notFound } from '../lib/http.ts';
import { CACHE } from '../lib/cache.ts';
import { makeOptionalAuth } from '../plugins/auth.ts';

/**
 * Endpoint publik: data yang sama sekali tidak butuh login. Frontend membaca
 * konfigurasi tahap/slot/konstanta dari sini, jadi satu sumber konfigurasi
 * (server) menggantikan salinan di js/data.js.
 *
 * Data yang jarang berubah (meta, katalog, konten, QRIS) dibungkus cache TTL
 * singkat; route admin memanggil `cache.invalidate` saat menulis agar admin
 * tidak pernah melihat data basi.
 */

export function registerPublicRoutes(app: FastifyInstance, db: Db, cfg: Config): void {
  app.get('/api/meta', async () => app.cache.wrap(CACHE.meta, async () => ({
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
  })));

  /* Katalog: pelanggan hanya melihat yang aktif; staf/admin melihat semua
     supaya layanan yang disembunyikan masih bisa diaktifkan kembali. */
  app.get('/api/catalog', { preHandler: makeOptionalAuth(db) }, async (req) => {
    const staff = req.auth?.role === 'admin' || req.auth?.role === 'staff';
    return app.cache.wrap(staff ? CACHE.catalogStaff : CACHE.catalogPublic, async () => ({
      ok: true,
      services: await R.listServices(db, staff),
      addons: await R.listAddons(db, staff),
      promos: staff ? await R.listPromos(db) : (await R.listPromos(db)).filter((p) => p.active),
      tiers: await R.listTiers(db),
      areas: await R.listAreas(db),
      couriers: COURIERS,
    }));
  });

  app.get('/api/content', async () => app.cache.wrap(CACHE.content, async () => ({
    ok: true,
    gallery: await R.getContent<unknown[]>(db, 'gallery', []),
    faq: await R.getContent<unknown[]>(db, 'faq', []),
    testimonials: await R.getContent<unknown[]>(db, 'testimonials', []),
    metrics: await R.getContent<unknown[]>(db, 'metrics', []),
    location: await R.getContent<unknown>(db, 'location', null),
    slides: await R.getContent<unknown[]>(db, 'slides', []),
  })));

  /* Gambar QRIS untuk pembayaran — memang ditunjukkan ke pelanggan untuk
     dipindai, jadi boleh publik. `null` berarti pakai gambar bawaan frontend. */
  app.get('/api/qris', async () => app.cache.wrap(CACHE.qris, async () => ({ ok: true, qris: await R.getQrisImage(db) })));

  app.get('/api/slots', async (req: FastifyRequest<{ Querystring: { date?: string } }>) => {
    const date = req.query.date ?? new Date().toISOString().slice(0, 10);
    return { ok: true, date, slots: await R.slotLoad(db, date) };
  });

  /* Kode pesanan berurutan (MD-44xx): endpoint publik ini dibatasi per IP
     agar tidak bisa disapu berurutan untuk memanen data pelanggan. */
  app.get(
    '/api/track/:code',
    { config: { rateLimit: { max: cfg.rateLimitTrackMax, timeWindow: '15 minutes' } } },
    async (req: FastifyRequest<{ Params: { code: string } }>) => {
      const order = await R.findOrderByCode(db, req.params.code);
      if (!order) throw notFound(`Order ${req.params.code} tidak ditemukan.`);
      const queueDepth = await R.countOrdersAtStage(db, order.stage, order.code);
      const eta = etaMinutes(order, await R.listMachines(db), queueDepth);
      const services = await R.listServices(db);
      const first = order.items[0];
      const service = first ? services.find((s) => s.id === first.id) : undefined;
      return {
        ok: true,
        order: {
          code: order.code,
          customer: (order.customer || '').split(' ')[0],
          weight: order.weight,
          stage: order.stage, stageLabel: stageLabel(order.stage),
          machine: order.machine === '—' ? null : order.machine,
          etaLabel: eta.label, etaMins: eta.mins,
          serviceName: service?.name ?? '',
          stuck: isStuck(order, Date.now()),
        },
      };
    },
  );

  /*
   * Papan publik "sedang dikerjakan" untuk halaman situs: pengunjung tanpa
   * login melihat data nyata dari server (nama disamarkan ke nama depan,
   * tanpa total/harga/telepon). Tanpa endpoint ini halaman situs hanya bisa
   * menampilkan data contoh lokal sehingga tidak sinkron dengan lantai.
   *
   * TTL pendek (5 dtk) — pola yang sama dengan irama broadcast lantai.
   */
  app.get('/api/live', async () => app.cache.wrap(CACHE.live, async () => {
    const orders = await R.listActiveOrders(db);
    const machines = await R.listMachines(db);
    const services = await R.listServices(db);
    const active = orders.filter((o) => o.stage > 0 && o.stage < STAGES.length - 1);
    const list = active.slice(0, 8).map((o) => {
      const queueDepth = active.filter((x) => x.code !== o.code && x.stage === o.stage).length;
      const eta = etaMinutes(o, machines, queueDepth);
      const first = o.items[0];
      const service = first ? services.find((s) => s.id === first.id) : undefined;
      return {
        code: o.code,
        customer: (o.customer || '').split(' ')[0],
        weight: o.weight,
        stage: o.stage,
        machine: o.machine === '—' ? null : o.machine,
        serviceName: service?.name ?? '',
        etaLabel: eta.label,
      };
    });
    return {
      ok: true,
      at: Date.now(),
      doneToday: await R.countOrdersAtStage(db, STAGES.length - 1),
      orders: list,
    };
  }, 5_000));
}
