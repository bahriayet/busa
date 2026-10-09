import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
/** .../server/src → .../server */
export const SERVER_ROOT = resolve(here, '..');
/** .../server → .../ui (root frontend statis) */
export const PROJECT_ROOT = resolve(SERVER_ROOT, '..');

export interface Config {
  host: string;
  port: number;
  databaseUrl: string;
  staticRoot: string;
  serveStatic: boolean;
  jwtSecret: string;
  jwtTtl: string;
  seedPassword: string;
  simulate: boolean;
  tickMs: number;
  corsOrigins: string[];
  logLevel: string;
  rateLimitMax: number;
  rateLimitLoginMax: number;
  /** Percayai header X-Forwarded-* dari reverse proxy (host PaaS). */
  trustProxy: boolean;
}

function int(v: string | undefined, fallback: number): number {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

function bool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined || v === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(v.toLowerCase());
}

function list(v: string | undefined): string[] {
  return (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Rahasia JWT tidak pernah ditulis ke config yang di-track. Urutan sumber:
 * BUSA_JWT_SECRET → berkas `data/.jwt-secret` (dibuat sekali, mode 0600) →
 * gagal. Nilai rahasianya sendiri tidak pernah dicetak ke log.
 */
function resolveJwtSecret(explicit: string | undefined, dataDir: string): string {
  if (explicit && explicit.length >= 32) return explicit;
  if (explicit) throw new Error('BUSA_JWT_SECRET terlalu pendek; minimal 32 karakter.');
  const file = join(dataDir, '.jwt-secret');
  if (existsSync(file)) {
    const saved = readFileSync(file, 'utf8').trim();
    if (saved.length >= 32) return saved;
  }
  mkdirSync(dataDir, { recursive: true });
  const fresh = randomBytes(48).toString('base64url');
  writeFileSync(file, fresh, { encoding: 'utf8' });
  try { chmodSync(file, 0o600); } catch { /* Windows tidak mendukung mode POSIX */ }
  return fresh;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dataDir = resolve(SERVER_ROOT, env.BUSA_DATA_DIR ?? 'data');
  const databaseUrl = env.BUSA_DATABASE_URL ?? env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'Connection string database belum diisi. Set BUSA_DATABASE_URL (atau DATABASE_URL) ke endpoint Neon/PostgreSQL.',
    );
  }

  /* Host PaaS (Render/Railway/Fly) menyuntik PORT — dipakai sebagai sinyal
     bahwa server berjalan di balik reverse proxy: bind ke 0.0.0.0 dan
     percayai X-Forwarded-* supaya pembatasan per-IP tetap akurat. */
  const onPaaS = Boolean(env.PORT);

  return {
    host: env.BUSA_HOST ?? (onPaaS ? '0.0.0.0' : '127.0.0.1'),
    port: int(env.BUSA_PORT ?? env.PORT, 8080),
    databaseUrl,
    staticRoot: env.BUSA_STATIC_ROOT ? resolve(env.BUSA_STATIC_ROOT) : PROJECT_ROOT,
    serveStatic: bool(env.BUSA_SERVE_STATIC, true),
    jwtSecret: resolveJwtSecret(env.BUSA_JWT_SECRET, dataDir),
    jwtTtl: env.BUSA_JWT_TTL ?? '12h',
    seedPassword: env.BUSA_SEED_PASSWORD ?? 'busa1234',
    simulate: bool(env.BUSA_SIMULATE, true),
    tickMs: int(env.BUSA_TICK_MS, 7000),
    corsOrigins: list(env.BUSA_CORS_ORIGINS),
    logLevel: env.BUSA_LOG_LEVEL ?? 'info',
    rateLimitMax: int(env.BUSA_RATE_LIMIT_MAX, 300),
    rateLimitLoginMax: int(env.BUSA_RATE_LIMIT_LOGIN_MAX, 20),
    trustProxy: bool(env.BUSA_TRUST_PROXY, onPaaS),
  };
}
