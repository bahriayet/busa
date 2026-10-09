import Fastify, { LogController, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import staticPlugin from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { WebSocket } from 'ws';

import type { Config } from './config.ts';
import type { Db } from './db/client.ts';
import type { Role } from './domain/types.ts';
import type { JwtPayload } from './plugins/auth.ts';
import * as R from './db/repo.ts';
import { ApiError } from './lib/http.ts';
import { registerPublicRoutes } from './routes/public.ts';
import { registerAuthRoutes } from './routes/auth.ts';
import { registerMeRoutes } from './routes/me.ts';
import { registerOrderRoutes } from './routes/orders.ts';
import { registerScanRoutes } from './routes/scan.ts';
import { registerFloorRoutes } from './routes/floor.ts';
import { registerDashboardRoutes } from './routes/dashboard.ts';
import { registerAdminRoutes } from './routes/admin.ts';

declare module 'fastify' {
  interface FastifyInstance {
    /** Siarkan pesan ke semua klien WebSocket /ws — diisi oleh buildApp. */
    broadcast: (msg: Record<string, unknown>) => void;
    /** Referensi database untuk operasi auth (blacklist, dll). */
    db: Db;
  }
}

export interface BuildOpts {
  db: Db;
  cfg: Config;
}

export function buildApp({ db, cfg }: BuildOpts): FastifyInstance {
  const app = Fastify({
    logger: { level: cfg.logLevel },
    logController: new LogController({ disableRequestLogging: true }),
    trustProxy: cfg.trustProxy,
  });

  /* Hub WebSocket — satu-satunya kanal push untuk papan lantai hidup.
     Payload disaring per peran: pelanggan hanya menerima pesanan miliknya,
     tanpa data mesin/event lantai. */
  interface SocketMeta { role: Role; userId: string; customerId: string | null; }
  const sockets = new Map<WebSocket, SocketMeta>();
  const hub = (msg: Record<string, unknown>): void => {
    const orders = Array.isArray(msg.orders) ? (msg.orders as Record<string, unknown>[]) : null;
    const staffWire = JSON.stringify(msg);
    for (const [s, meta] of [...sockets]) {
      if (s.readyState !== s.OPEN) continue;
      if (meta.role !== 'customer') { s.send(staffWire); continue; }
      if (msg.type === 'floor' && orders) {
        const mine = orders.filter((o) => o.customerId === meta.customerId);
        s.send(JSON.stringify({ type: 'floor', at: msg.at, orders: mine }));
      } else if (msg.type === 'scan' && msg.order
        && (msg.order as { customerId?: unknown }).customerId === meta.customerId) {
        s.send(JSON.stringify({ type: 'scan', at: msg.at, order: msg.order }));
      }
    }
  };
  app.decorate('broadcast', hub);
  app.decorate('db', db);

  void app.register(cors, { origin: cfg.corsOrigins.length ? cfg.corsOrigins : false });
  void app.register(jwt, { secret: cfg.jwtSecret, sign: { expiresIn: cfg.jwtTtl } });
  void app.register(rateLimit, { global: true, max: cfg.rateLimitMax, timeWindow: '1 minute' });
  void app.register(swagger, {
    openapi: {
      info: { title: 'BUSA Laundry Ops', version: '1.0.0' },
      servers: [{ url: `http://${cfg.host}:${cfg.port}` }],
    },
  });
  void app.register(swaggerUi, { routePrefix: '/docs' });

  /*
   * WebSocket harus didaftarkan bersama route /ws di scope plugin yang sama:
   * hook `onRoute` milik @fastify/websocket hanya aktif untuk route yang
   * didaftarkan setelah plugin selesai dimuat. Mendaftarkan `/ws` di root
   * membuatnya jadi route HTTP biasa dan `socket.send` tidak pernah ada.
   */
  void app.register(async (instance) => {
    await instance.register(websocket);
    instance.get('/ws', { websocket: true }, async (socket, req) => {
      /* Token lewat query (?token=...) karena WebSocket browser tidak bisa
         mengirim header Authorization. Wajib valid + tidak di-blacklist. */
      const raw = (req.query as { token?: unknown } | undefined)?.token;
      const token = typeof raw === 'string' ? raw : '';
      let payload: JwtPayload;
      try {
        payload = instance.jwt.verify<JwtPayload>(token);
      } catch {
        socket.close(4401, 'Sesi tidak valid.');
        return;
      }
      if (!payload.sub || !['admin', 'staff', 'customer'].includes(payload.role)) {
        socket.close(4401, 'Token tidak utuh.');
        return;
      }
      if (payload.jti) {
        try {
          if (await R.isTokenBlacklisted(db, payload.jti)) {
            socket.close(4401, 'Sesi telah diakhiri.');
            return;
          }
        } catch { /* cek blacklist best-effort; koneksi tetap dilayani */ }
      }

      let customerId: string | null = null;
      if (payload.role === 'customer') {
        const user = await R.findUserById(db, payload.sub);
        customerId = user?.phone ? (await R.getCustomerByPhone(db, user.phone))?.id ?? null : null;
      }
      sockets.set(socket, { role: payload.role, userId: payload.sub, customerId });

      try {
        if (payload.role === 'customer') {
          socket.send(JSON.stringify({ type: 'hello', at: Date.now() }));
        } else {
          socket.send(JSON.stringify({
            type: 'hello', at: Date.now(),
            machines: await R.listMachines(db),
            events: await R.listEvents(db, { limit: 12 }),
          }));
        }
      } catch {
        /* klien putus sebelum sapaan sempat terkirim */
      }
      socket.on('close', () => sockets.delete(socket));
      socket.on('error', () => sockets.delete(socket));
    });
  });

  /*
   * Route didaftarkan di dalam `after()` agar plugin (rate limit, swagger)
   * sudah selesai dimuat — hook `onRoute` mereka hanya menangkap route yang
   * dibuat setelah plugin aktif, termasuk config `rateLimit` per-route.
   */
  void app.after(() => {
    registerPublicRoutes(app, db);
    registerAuthRoutes(app, db, cfg);
    registerMeRoutes(app, db);
    registerOrderRoutes(app, db);
    registerScanRoutes(app, db);
    registerFloorRoutes(app, db);
    registerDashboardRoutes(app, db);
    registerAdminRoutes(app, db);

    /** Cek hidup + koneksi DB — dipakai monitoring/uptime, tanpa data sensitif. */
    app.get('/health', async () => {
      await db.get('SELECT 1');
      return { ok: true, db: db.location, uptime_s: Math.round(process.uptime()) };
    });

    if (cfg.serveStatic) {
      /*
       * Hanya aset frontend yang boleh disajikan — folder `server` (isi .env,
       * kunci JWT, source) dan dokumen internal tidak pernah ikut terekspos.
       */
      const frontendAsset = (pathname: string): boolean =>
        pathname === '/' || pathname === '/index.html'
        || pathname.startsWith('/css/') || pathname.startsWith('/js/');
      void app.register(staticPlugin, {
        root: cfg.staticRoot,
        allowedPath: frontendAsset,
        serveDotFiles: false,
      });
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ApiError) {
      return reply.code(err.statusCode).send(err.toJSON());
    }
    if ((err as { validation?: unknown }).validation) {
      return reply.code(400).send({ ok: false, error: 'Body tidak sesuai kontrak API.', detail: (err as { validation?: unknown }).validation });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.code(status).send({ ok: false, error: (err as Error).message || 'Permintaan ditolak.' });
    }
    req.log.error(err);
    return reply.code(500).send({ ok: false, error: 'Kesalahan server.' });
  });

  return app;
}
