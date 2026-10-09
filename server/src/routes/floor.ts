import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/client.ts';
import * as R from '../db/repo.ts';
import { LAST_STAGE, QUEUE_GROUPS, STAGES, STAGE_MIN } from '../domain/constants.ts';
import { dwellMinutes, isStuck } from '../domain/rules.ts';
import { makeRequireRole } from '../plugins/auth.ts';

/**
 * Papan lantai — data hidup untuk operator dan admin. Semua angka diturunkan
 * dari log event dan proyeksi, bukan daftar karangan.
 */

export function registerFloorRoutes(app: FastifyInstance, db: Db): void {
  const requireRole = makeRequireRole(db);
  const floor = requireRole('staff', 'admin');

  app.get('/api/machines', { preHandler: floor }, async () => ({
    ok: true, machines: await R.listMachines(db),
  }));

  app.get(
    '/api/events',
    { preHandler: floor },
    async (req) => {
      const query = (req.query ?? {}) as { code?: string; limit?: string; sinceSeq?: string };
      const limit = Math.min(500, Math.max(1, Number.parseInt(query.limit ?? '200', 10) || 200));
      const sinceSeq = Number.parseInt(query.sinceSeq ?? '0', 10) || 0;
      const events = await R.listEvents(db, {
        code: query.code, limit, sinceSeq: sinceSeq > 0 ? sinceSeq : undefined,
      });
      return { ok: true, events, seq: await R.maxEventSeq(db) };
    },
  );

  app.get('/api/queue', { preHandler: floor }, async () => {
    const orders = (await R.listOrders(db)).filter((o) => !o.cancelled);
    const groups = QUEUE_GROUPS.map((g) => ({
      ...g,
      orders: orders
        .filter((o) => g.stages.includes(o.stage))
        .sort((a, b2) => (a.priority === 'express' ? 0 : 1) - (b2.priority === 'express' ? 0 : 1) || b2.createdAt.localeCompare(a.createdAt)),
    }));
    return {
      ok: true,
      groups,
      totals: {
        aktif: orders.filter((o) => o.stage < LAST_STAGE).length,
        selesai: orders.filter((o) => o.stage === LAST_STAGE && !o.collected).length,
        diambil: orders.filter((o) => o.collected).length,
      },
    };
  });

  app.get('/api/stuck', { preHandler: floor }, async () => {
    const now = Date.now();
    const machines = await R.listMachines(db);
    const stuck = (await R.listOrders(db)).filter((o) => isStuck(o, now))
      .map((o) => {
        const m = machines.find((x) => x.ticket === o.code);
        return {
          code: o.code, customer: o.customer, stage: o.stage,
          stageLabel: STAGES[o.stage]?.label ?? '—',
          dwell: dwellMinutes(o, now), target: STAGE_MIN[o.stage] ?? 30,
          machine: m ? m.id : null, left: m ? m.left : 0,
        };
      });
    return { ok: true, stuck };
  });
}
