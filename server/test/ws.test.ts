import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import WebSocket from 'ws';

import { buildApp } from '../src/app.ts';
import { seedIfEmpty } from '../src/db/seed.ts';
import { openTestDb } from './helpers/db.ts';
import type { Config } from '../src/config.ts';

/**
 * /ws wajib token dan payload-nya disaring per peran: staf/admin menerima
 * seluruh papan lantai, pelanggan hanya pesanan miliknya tanpa data mesin.
 */

const cfg: Config = {
  host: '127.0.0.1', port: 0, databaseUrl: 'pglite:memory',
  staticRoot: '', serveStatic: false,
  jwtSecret: 'tes-rahasia-panjang-32-karakter-minimum-oke', jwtTtl: '12h',
  seedPassword: 'busa1234', simulate: false, tickMs: 7000,
  corsOrigins: [], logLevel: 'silent',
  rateLimitMax: 100_000, rateLimitLoginMax: 100_000,
  trustProxy: false,
};

const db = await openTestDb();
await seedIfEmpty(db, cfg);
const app = buildApp({ db, cfg });
await app.ready();
const base = (await app.listen({ host: '127.0.0.1', port: 0 })).replace(/^http/, 'ws');

after(async () => { await app.close(); await db.close(); });

async function loginToken(login: string): Promise<string> {
  const res = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { login, password: 'busa1234' },
  });
  assert.equal(res.statusCode, 200, res.body);
  return (res.json() as { token: string }).token;
}

function nextMessage(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    ws.once('message', (d) => {
      try { resolve(JSON.parse(d.toString()) as Record<string, unknown>); }
      catch (err) { reject(err as Error); }
    });
    ws.once('error', reject);
  });
}

test('ws tanpa token ditolak dengan kode 4401', async () => {
  const ws = new WebSocket(`${base}/ws`);
  const code = await new Promise<number>((resolve, reject) => {
    ws.once('close', (c) => resolve(c));
    ws.once('error', reject);
  });
  assert.equal(code, 4401);
});

test('ws staf menerima hello berisi data mesin', async () => {
  const token = await loginToken('admin');
  const ws = new WebSocket(`${base}/ws?token=${encodeURIComponent(token)}`);
  const msg = await nextMessage(ws);
  assert.equal(msg.type, 'hello');
  assert.ok(Array.isArray(msg.machines));
  ws.close();
});

test('ws pelanggan tidak menerima data mesin dan hanya pesanannya sendiri', async () => {
  const token = await loginToken('0812-7781-4402');
  const me = await app.inject({
    method: 'GET', url: '/api/me',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(me.statusCode, 200, me.body);
  const customerId = (me.json() as { customer: { id: string } }).customer.id;

  const ws = new WebSocket(`${base}/ws?token=${encodeURIComponent(token)}`);
  const hello = await nextMessage(ws);
  assert.equal(hello.type, 'hello');
  assert.equal(hello.machines, undefined);

  const floorMsg = nextMessage(ws);
  app.broadcast({
    type: 'floor', at: Date.now(),
    machines: [{ id: 'M-01' }],
    events: [{ id: 'e1' }],
    orders: [
      { code: 'BUSA-1', customerId, stage: 3 },
      { code: 'BUSA-2', customerId: 'c-pelanggan-lain', stage: 2 },
    ],
  });
  const floor = await floorMsg;
  assert.equal(floor.type, 'floor');
  assert.equal(floor.machines, undefined);
  assert.deepEqual((floor.orders as { code: string }[]).map((o) => o.code), ['BUSA-1']);
  ws.close();
});
