import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/client.ts';
import * as R from '../db/repo.ts';
import { computePlan } from '../domain/plan.ts';
import { isStuck } from '../domain/rules.ts';
import { makeRequireRole } from '../plugins/auth.ts';

/**
 * Dasbor admin — semua angka diturunkan dari sumber kebenaran yang sama:
 * peredaran dari order lunas, komposisi dari item order, aktivitas dari log
 * event. Setiap angka contoh membawa penanda source='seed'.
 */

export function registerDashboardRoutes(app: FastifyInstance, db: Db): void {
  const requireRole = makeRequireRole(db);
  const staff = requireRole('staff', 'admin');

  app.get('/api/dashboard', { preHandler: staff }, async () => {
    const now = Date.now();
    const orders = await R.listOrders(db);
    const machines = await R.listMachines(db);
    const revenue = await R.listRevenue(db, 14);
    const today = revenue[revenue.length - 1];

    return {
      ok: true,
      revenue,
      today: today ?? null,
      mix: await R.serviceMix(db),
      activity: await R.activityFeed(db, 8),
      staff: await R.listStaff(db),
      machines: {
        list: machines,
        busy: machines.filter((m) => m.ticket !== '—').length,
        idle: machines.filter((m) => m.ticket === '—').length,
      },
      orders: {
        aktif: orders.filter((o) => !o.cancelled && o.stage < 8).length,
        selesai: orders.filter((o) => o.stage === 8 && !o.collected).length,
        lunas: orders.filter((o) => o.payStatus === 'lunas' && !o.cancelled).length,
      },
      stuck: orders.filter((o) => isStuck(o, now)).map((o) => o.code),
    };
  });

  app.get(
    '/api/plan',
    { preHandler: staff },
    async (req) => {
      const query = (req.query ?? {}) as { date?: string };
      const date = query.date ?? new Date().toISOString().slice(0, 10);
      const orders = (await R.listOrders(db)).filter((o) => !o.cancelled);
      const plan = computePlan({
        date, now: Date.now(), machines: await R.listMachines(db), orders,
      });
      return { ok: true, plan };
    },
  );
}
