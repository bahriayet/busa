import Fastify, { LogController, type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
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
import { TtlCache } from './lib/cache.ts';
import { auditLine } from './lib/audit.ts';
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
    /** Cache TTL untuk endpoint publik yang jarang berubah. */
    cache: TtlCache;
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
    /* Batas default ketat; route unggah gambar menimpanya per-route. */
    bodyLimit: cfg.bodyLimit,
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
  app.decorate('cache', new TtlCache(cfg.cacheTtlMs));

  /* CSP: script hanya dari berkas sendiri (tak ada script inline di index.html;
     atribut event inline sudah dihapus dari JS) dan koneksi dibatasi ke API
     sendiri saat produksi. style-src tetap longgar karena UI memakai atribut
     style dinamis (--i, lebar bar) yang dibuat lewat innerHTML. */
  const cspConnect = cfg.production
    ? [...new Set([
      "'self'",
      ...(cfg.publicApiOrigin ? [cfg.publicApiOrigin, cfg.publicApiOrigin.replace(/^http/, 'ws')] : []),
      'https://busa-api.onrender.com', 'wss://busa-api.onrender.com',
    ])]
    : ["'self'", 'ws:', 'wss:', 'https:', 'http:'];

  void app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        fontSrc: ["'self'", 'https:', 'data:'],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        /* Peta Google tertanam di halaman situs (babak penutup) — tanpa ini
           `default-src 'self'` memblokir iframe lokasi. */
        frameSrc: [
          'https://www.google.com', 'https://maps.google.com', 'https://consent.google.com',
          'https://www.google.co.id', 'https://maps.google.co.id',
        ],
        imgSrc: ["'self'", 'data:', 'https:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
        connectSrc: cspConnect,
        upgradeInsecureRequests: cfg.production ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  void app.register(cors, {
    origin: cfg.corsOrigins.length ? cfg.corsOrigins : false,
    /* Default @fastify/cors hanya GET,HEAD,POST — cukup untuk baca, tapi
       admin portal memakai PATCH/PUT/DELETE lintas domain (Vercel → API).
       Tanpa daftar ini, preflight browser menolak perubahan dari portal. */
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  void app.register(jwt, { secret: cfg.jwtSecret, sign: { expiresIn: cfg.jwtTtl } });
  void app.register(rateLimit, { global: true, max: cfg.rateLimitMax, timeWindow: '1 minute' });
  void app.register(swagger, {
    openapi: {
      info: { title: 'BUSA Laundry Ops', version: '1.0.0' },
      servers: [{ url: `http://${cfg.host}:${cfg.port}` }],
    },
  });
  /* UI dokumen API hanya di lokal/dev — produksi tidak membuka /docs. */
  if (!cfg.production) void app.register(swaggerUi, { routePrefix: '/docs' });

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
      /* Token yang terbit sebelum password diganti juga dicabut di jalur WS. */
      try {
        const changed = await R.passwordChangedAt(db, payload.sub);
        if (changed && payload.iat && payload.iat * 1000 + 1000 < changed) {
          socket.close(4401, 'Sesi telah diakhiri.');
          return;
        }
      } catch { /* cek best-effort; koneksi tetap dilayani */ }

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
    registerPublicRoutes(app, db, cfg);
    registerAuthRoutes(app, db, cfg);
    registerMeRoutes(app, db);
    registerOrderRoutes(app, db);
    registerScanRoutes(app, db, cfg);
    registerFloorRoutes(app, db);
    registerDashboardRoutes(app, db);
    registerAdminRoutes(app, db);

    /** Cek hidup + koneksi DB — dipakai monitoring/uptime, tanpa data sensitif. */
    app.get('/health', async () => {
      await db.get('SELECT 1');
      /* Detail lokasi DB hanya untuk lokal/dev — produksi cukup status hidup. */
      return cfg.production
        ? { ok: true, uptime_s: Math.round(process.uptime()) }
        : { ok: true, db: db.location, uptime_s: Math.round(process.uptime()) };
    });

    if (cfg.serveStatic) {
      /*
       * Hanya aset frontend yang boleh disajikan — folder `server` (isi .env,
       * kunci JWT, source) dan dokumen internal tidak pernah ikut terekspos.
       */
      const frontendAsset = (pathname: string): boolean =>
        pathname === '/' || pathname === '/index.html'
        || pathname.startsWith('/css/') || pathname.startsWith('/js/')
        || pathname.startsWith('/img/');
      void app.register(staticPlugin, {
        root: cfg.staticRoot,
        allowedPath: frontendAsset,
        serveDotFiles: false,
      });
    }
  });

  /* Audit keamanan: hanya peristiwa penting (ditolak, masuk, mutasi) yang
     dicatat — body/query tidak pernah ikut, jadi tidak ada rahasia di log. */
  app.addHook('onResponse', (req, reply) => {
    const body = req.body as { login?: unknown; phone?: unknown } | undefined;
    const line = auditLine({
      method: req.method,
      route: req.routeOptions?.url ?? req.url,
      ip: req.ip,
      auth: req.auth,
      login: body?.login !== undefined ? String(body.login)
        : body?.phone !== undefined ? String(body.phone)
        : undefined,
    }, reply.statusCode);
    if (line) req.log[line.level](line.data, line.msg);
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ApiError) {
      return reply.code(err.statusCode).send(err.toJSON());
    }
    if ((err as { validation?: unknown }).validation) {
      return reply.code(400).send({ ok: false, error: 'Body tidak sesuai kontrak API.', detail: (err as { validation?: unknown }).validation });
    }
    /* Body melebihi bodyLimit (Fastify melempar 413 bawaan berbahasa Inggris). */
    if ((err as { statusCode?: number }).statusCode === 413) {
      return reply.code(413).send({ ok: false, error: 'Body permintaan terlalu besar.' });
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
