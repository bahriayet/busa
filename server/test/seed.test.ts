import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildApp } from '../src/app.ts';
import { seedIfEmpty } from '../src/db/seed.ts';
import { openTestDb } from './helpers/db.ts';
import type { Config } from '../src/config.ts';

function productionCfg(overrides: Partial<Config> = {}): Config {
  return {
    host: '127.0.0.1', port: 0, databaseUrl: 'pglite:memory',
    staticRoot: '', serveStatic: false,
    jwtSecret: 'tes-rahasia-panjang-32-karakter-minimum-oke', jwtTtl: '12h',
    seedPassword: 'Rahasia-Uji-12345', seedMode: 'production', seedAdminName: 'Bahri',
    simulate: false, tickMs: 7000,
    corsOrigins: [], logLevel: 'silent',
    rateLimitMax: 100_000, rateLimitLoginMax: 100_000,
    trustProxy: false, production: false,
    cacheTtlMs: 0, bodyLimit: 256 * 1024, rateLimitScanMax: 100_000,
    rateLimitTrackMax: 100_000, rateLimitLoginAccountMax: 100_000,
    publicApiOrigin: '', whatsapp: '6289531933194',
    ...overrides,
  };
}

test('seed produksi hanya membuat katalog, mesin kosong, lokasi, dan satu admin', async () => {
  const db = await openTestDb();
  const cfg = productionCfg();
  const res = await seedIfEmpty(db, cfg);

  assert.equal(res.seeded, true);
  assert.equal(res.version, 'production-1');
  assert.equal(res.orders, 0);
  assert.equal(res.events, 0);
  assert.equal(res.users, 1);

  assert.equal(await db.scalar<number>('SELECT COUNT(*) FROM orders'), 0);
  assert.equal(await db.scalar<number>('SELECT COUNT(*) FROM customers'), 0);
  assert.equal(await db.scalar<number>('SELECT COUNT(*) FROM staff'), 0);
  assert.equal(await db.scalar<number>('SELECT COUNT(*) FROM promos'), 0);
  assert.equal(await db.scalar<number>('SELECT COUNT(*) FROM users'), 1);

  const admin = await db.get<{ name: string; role: string; username: string }>(
    'SELECT name, role, username FROM users LIMIT 1',
  );
  assert.deepEqual(admin, { name: 'Bahri', role: 'admin', username: 'admin' });

  const machine = await db.get<{ ticket: string | null; state: string }>('SELECT ticket, state FROM machines LIMIT 1');
  assert.deepEqual(machine, { ticket: null, state: 'idle' });

  const second = await seedIfEmpty(db, cfg);
  assert.equal(second.seeded, false);
  assert.equal(second.version, 'production-1');

  /* Password dari environment benar-benar dipakai untuk login admin. */
  const app = buildApp({ db, cfg });
  await app.ready();
  const login = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { login: 'admin', password: 'Rahasia-Uji-12345' },
  });
  assert.equal(login.statusCode, 200, login.body);
  await app.close();
  await db.close();
});

test('seed produksi menolak password demo default', async () => {
  const db = await openTestDb();
  await assert.rejects(
    seedIfEmpty(db, productionCfg({ seedPassword: 'busa1234' })),
    /BUSA_SEED_PASSWORD/,
  );
  assert.equal(await db.scalar<number>('SELECT COUNT(*) FROM users'), 0);
  await db.close();
});
