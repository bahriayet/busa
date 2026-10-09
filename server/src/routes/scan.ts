import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from '../db/client.ts';
import * as R from '../db/repo.ts';
import { applyDecision } from '../domain/apply.ts';
import { decide } from '../domain/rules.ts';
import type { ScanAction } from '../domain/types.ts';
import { badRequest, conflict, notFound } from '../lib/http.ts';
import { makeOptionalAuth, makeRequireRole } from '../plugins/auth.ts';

/**
 * POST /scan — seam yang sama dengan `scan.js` di frontend. Body dikirim tanpa
 * token (operator memindai label di LAN), jadi identity jatuh ke field `by`
 * atau akun yang login bila header Authorization ada.
 *
 * Server adalah sumber kebenaran: tahap `stage`/`to` dari klien diabaikan,
 * semua dinilai ulang oleh `decide()` — aksi mustahil ditolak 409 dengan
 * alasan berbahasa Indonesia. Idempoten lewat `client_id` (ev.id dari klien):
 * kirim ulang event yang sama tidak menggandakan efek.
 */

export interface ScanBody {
  id?: string;
  at?: number;
  code?: string;
  action?: string;
  machine?: string | null;
  stage?: number;
  to?: number;
  by?: string;
  note?: string;
  sync?: string;
}

export function registerScanRoutes(app: FastifyInstance, db: Db): void {
  const requireRole = makeRequireRole(db);
  const optionalAuth = makeOptionalAuth(db);
  const handler = async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body ?? {}) as ScanBody;
    const code = String(body.code ?? '').trim().toUpperCase();
    const action = String(body.action ?? '').trim() as ScanAction;
    if (!code) throw badRequest('Label pesanan kosong.');
    if (!action) throw badRequest('Aksi pindai kosong.');

    const clientId = body.id ? String(body.id) : null;

    /* Idempotensi: event yang sama dari klien tidak diulang. */
    if (clientId) {
      const dup = await R.eventByClientId(db, clientId);
      if (dup) {
        return { ok: true, duplicate: true, event: dup, order: await R.getOrder(db, dup.code) };
      }
    }

    const order = await R.findOrderByCode(db, code);
    if (!order) throw notFound(`Label ${code} tidak dikenal.`);

    const machines = await R.listMachines(db);
    const verdict = decide({
      action, order, machines,
      requestedMachine: body.machine ? String(body.machine).toUpperCase() : null,
      note: body.note ? String(body.note) : '',
    });

    if (!verdict.ok) {
      throw conflict(verdict.reason, verdict.hint ? { hint: verdict.hint } : {});
    }

    const actor = req.auth?.name ?? (body.by ? String(body.by).trim() : 'Kasir');
    const clientMs = Number.isFinite(body.at) ? Math.min(Number(body.at), Date.now()) : null;
    const result = await applyDecision(db, order, verdict, {
      actor, clientId, clientMs,
      origin: 'scan',
    });

    app.broadcast?.({
      type: 'scan', at: result.event.at, event: result.event,
      order: result.order, machines: result.machines,
    });

    return reply.code(200).send({
      ok: true,
      event: result.event,
      order: result.order,
      machines: result.machines,
      stamps: result.stamps,
      warning: verdict.warning,
    });
  };

  /* Seam frontend: terbuka, opsional Bearer untuk identitas operator. */
  app.post('/scan', { preHandler: optionalAuth }, handler);
  /* Permukaan API: wajib staf/admin. */
  app.post('/api/scan', { preHandler: requireRole('staff', 'admin') }, handler);
}
