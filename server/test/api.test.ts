import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { buildApp } from '../src/app.ts';
import { seedIfEmpty } from '../src/db/seed.ts';
import { openTestDb } from './helpers/db.ts';
import type { Config } from '../src/config.ts';

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

before(async () => { await app.ready(); });
after(async () => { await db.close(); });

async function login(login: string, password = 'busa1234'): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login, password } });
  assert.equal(res.statusCode, 200, res.body);
  return (res.json() as { token: string }).token;
}

test('meta dan katalog publik', async () => {
  const meta = await app.inject({ method: 'GET', url: '/api/meta' });
  assert.equal(meta.statusCode, 200);
  const metaBody = meta.json() as { stages: unknown[] };
  assert.equal(metaBody.stages.length, 9);

  const cat = await app.inject({ method: 'GET', url: '/api/catalog' });
  const catBody = cat.json() as { services: unknown[]; promos: unknown[] };
  assert.equal(catBody.services.length, 6);
  assert.equal(catBody.promos.length, 3);
});

test('lacak publik memakai digit terakhir', async () => {
  const full = await app.inject({ method: 'GET', url: '/api/track/BUSA-4471' });
  assert.equal(full.statusCode, 200);
  const short = await app.inject({ method: 'GET', url: '/api/track/4471' });
  assert.equal(short.statusCode, 200);
  assert.equal((short.json() as { order: { code: string } }).order.code, 'BUSA-4471');
  const gone = await app.inject({ method: 'GET', url: '/api/track/BUSA-0000' });
  assert.equal(gone.statusCode, 404);
});

test('login salah ditolak, login admin memberi token', async () => {
  const bad = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'admin', password: 'salah' } });
  assert.equal(bad.statusCode, 401);
  const token = await login('admin');
  assert.ok(token.length > 20);
});

test('dashboard butuh peran staff/admin', async () => {
  const anon = await app.inject({ method: 'GET', url: '/api/dashboard' });
  assert.equal(anon.statusCode, 401);

  const token = await login('admin');
  const res = await app.inject({ method: 'GET', url: '/api/dashboard', headers: { authorization: `Bearer ${token}` } });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { revenue: unknown[]; orders: { aktif: number } };
  assert.equal(body.revenue.length, 14);
  assert.ok(body.orders.aktif > 0);
});

test('pindai: naik tahap, idempoten, dan tolak aksi mustahil', async () => {
  /* 4468 di tahap 5 dipegang M-02 → naik tahap sah. */
  const ok = await app.inject({
    method: 'POST', url: '/scan',
    payload: { id: 'EV-TEST-1', at: Date.now(), code: 'BUSA-4468', action: 'tahap', by: 'Dodo P.' },
  });
  assert.equal(ok.statusCode, 200, ok.body);
  const okBody = ok.json() as { ok: boolean; order: { stage: number } };
  assert.equal(okBody.ok, true);
  assert.equal(okBody.order.stage, 6);

  /* Kirim ulang event yang sama → tidak menggandakan efek. */
  const dup = await app.inject({
    method: 'POST', url: '/scan',
    payload: { id: 'EV-TEST-1', at: Date.now(), code: 'BUSA-4468', action: 'tahap', by: 'Dodo P.' },
  });
  const dupBody = dup.json() as { duplicate: boolean };
  assert.equal(dupBody.duplicate, true);

  /* Sudah diterima → terima lagi mustahil. */
  const again = await app.inject({
    method: 'POST', url: '/scan',
    payload: { id: 'EV-TEST-2', at: Date.now(), code: 'BUSA-4471', action: 'terima', by: 'Dodo P.' },
  });
  assert.equal(again.statusCode, 409);
  const againBody = again.json() as { ok: boolean; error: string };
  assert.equal(againBody.ok, false);
  assert.ok(againBody.error.includes('sudah diterima'));

  /* Selesai & diserahkan → semua aksi ditolak. */
  const done = await app.inject({
    method: 'POST', url: '/scan',
    payload: { id: 'EV-TEST-3', at: Date.now(), code: 'BUSA-4469', action: 'selesai', by: 'Dodo P.' },
  });
  assert.equal(done.statusCode, 409);
});

test('muat drum yang dipakai order lain ditolak dengan alasan operator', async () => {
  const res = await app.inject({
    method: 'POST', url: '/scan',
    payload: { id: 'EV-TEST-4', at: Date.now(), code: 'BUSA-4465', action: 'muat', machine: 'M-02', by: 'Dodo P.' },
  });
  assert.equal(res.statusCode, 409);
  const body = res.json() as { error: string; hint?: string };
  assert.ok(body.error.includes('memegang'));
  assert.ok(body.hint);
});

test('terima walk-in baru di lantai menulis event dan proyeksi', async () => {
  const res = await app.inject({
    method: 'POST', url: '/scan',
    payload: { id: 'EV-TEST-5', at: Date.now(), code: 'BUSA-4465', action: 'terima', by: 'Wulan A.' },
  });
  assert.equal(res.statusCode, 200, res.body);
  const events = await app.inject({ method: 'GET', url: '/api/events?code=BUSA-4465' });
  assert.equal(events.statusCode, 401);
  const token = await login('dodo');
  const authed = await app.inject({ method: 'GET', url: '/api/events?code=BUSA-4465', headers: { authorization: `Bearer ${token}` } });
  const body = authed.json() as { events: unknown[] };
  assert.ok(body.events.length >= 1);
});

test('pelanggan: profil, dompet, dan checkout server-side', async () => {
  const token = await login('0812-7781-4402');
  const me = await app.inject({ method: 'GET', url: '/api/me', headers: { authorization: `Bearer ${token}` } });
  assert.equal(me.statusCode, 200);
  const meBody = me.json() as { customer: { balance: number; stamps: number }; orders: unknown[] };
  assert.equal(meBody.customer.balance, 412_500);
  assert.equal(meBody.customer.stamps, 4);
  assert.ok(meBody.orders.length >= 1);

  /* Checkout: harga dihitung server — 4 kg setrika + premium, dijemput. */
  const co = await app.inject({
    method: 'POST', url: '/api/orders',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      items: [{ id: 'setrika', qty: 4 }], addons: ['premium'], mode: 'pickup',
      slotDate: '2026-10-10', slotTime: '10:00–12:00', pay: 'qris',
    },
  });
  assert.equal(co.statusCode, 200, co.body);
  const coBody = co.json() as { order: { code: string; total: number; payStatus: string }; quote: { sub: number; ship: number } };
  assert.equal(coBody.quote.sub, 44_000);
  assert.equal(coBody.quote.ship, 12_000);
  assert.equal(coBody.order.total, 56_000);
  assert.equal(coBody.order.payStatus, 'lunas');
  assert.ok(coBody.order.code.startsWith('BUSA-'));

  /* Promo dengan syarat yang dilanggar → alasan dalam bahasa Indonesia. */
  const bad = await app.inject({
    method: 'POST', url: '/api/orders',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      items: [{ id: 'setrika', qty: 2 }], addons: [], mode: 'pickup',
      slotDate: '2026-10-10', slotTime: '12:00–14:00', pay: 'qris',
    },
  });
  assert.equal(bad.statusCode, 400);
  const badBody = bad.json() as { reasons: string[] };
  assert.ok(badBody.reasons.some((r) => r.includes('minimal 3 kg')));
});

test('walk-in kasir menciptakan pelanggan dan order dalam satu langkah', async () => {
  const token = await login('dodo');
  const res = await app.inject({
    method: 'POST', url: '/api/orders/walkin',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      customer: 'Toko Roti Subuh', phone: '0812-0000-1111',
      items: [{ id: 'bedcover', qty: 2 }], addons: [], mode: 'drop', pay: 'cash',
    },
  });
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json() as { order: { code: string; payStatus: string; total: number } };
  assert.equal(body.order.payStatus, 'belum'); // tunai belum dibayar
  assert.equal(body.order.total, 80_000);

  /* Bayar lunas di kasir → peredaran hari ini naik sebesar tagihan (angka seed ditimpa live). */
  const before = await app.inject({ method: 'GET', url: '/api/dashboard', headers: { authorization: `Bearer ${token}` } });
  const beforeToday = (before.json() as { today: { v: number; source: string } }).today;

  const pay = await app.inject({
    method: 'POST', url: `/api/orders/${body.order.code}/pay`,
    headers: { authorization: `Bearer ${token}` },
    payload: { method: 'cash' },
  });
  assert.equal(pay.statusCode, 200);

  const dash = await app.inject({ method: 'GET', url: '/api/dashboard', headers: { authorization: `Bearer ${token}` } });
  const dashBody = dash.json() as { today: { v: number; source: string } };
  assert.equal(dashBody.today.source, 'live');
  assert.equal(dashBody.today.v, beforeToday.v + 80); // dalam ribuan
});

test('batalkan hanya sebelum masuk lantai', async () => {
  const token = await login('0812-7781-4402');
  const co = await app.inject({
    method: 'POST', url: '/api/orders',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      items: [{ id: 'setrika', qty: 3 }], addons: [], mode: 'pickup',
      slotDate: '2026-10-11', slotTime: '08:00–10:00', pay: 'qris',
    },
  });
  const code = (co.json() as { order: { code: string } }).order.code;

  const cancel = await app.inject({
    method: 'POST', url: `/api/orders/${code}/cancel`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(cancel.statusCode, 200);

  const early = await app.inject({
    method: 'POST', url: '/api/orders/BUSA-4471/cancel',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(early.statusCode, 409);
});

test('top up menambah saldo dan bonus di ambang 500 ribu', async () => {
  const token = await login('0812-7781-4402');
  const res = await app.inject({
    method: 'POST', url: '/api/me/topup',
    headers: { authorization: `Bearer ${token}` },
    payload: { amount: 500_000 },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { balance: number; bonus: number };
  assert.equal(body.bonus, 25_000);
  assert.equal(body.balance, 412_500 + 525_000);
});

test('peran pelanggan tidak bisa melihat mesin', async () => {
  const token = await login('0812-7781-4402');
  const res = await app.inject({ method: 'GET', url: '/api/machines', headers: { authorization: `Bearer ${token}` } });
  assert.equal(res.statusCode, 403);
});

test('skema OpenAPI terpasang', async () => {
  const res = await app.inject({ method: 'GET', url: '/docs/json' });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { info: { title: string } };
  assert.equal(body.info.title, 'BUSA Laundry Ops');
});

test('admin: patch addon dan field mesin', async () => {
  const token = await login('admin');
  const addon = await app.inject({
    method: 'PATCH', url: '/api/addons/stain',
    headers: { authorization: `Bearer ${token}` },
    payload: { price: 4500 },
  });
  assert.equal(addon.statusCode, 200, addon.body);
  assert.equal((addon.json() as { addon: { price: number } }).addon.price, 4500);

  const machine = await app.inject({
    method: 'PATCH', url: '/api/machines/M-06',
    headers: { authorization: `Bearer ${token}` },
    payload: { temp: 42.5, load: 33, left: 21, rpm: 4 },
  });
  assert.equal(machine.statusCode, 200, machine.body);
  const m = (machine.json() as { machine: { temp: number; load: number; left: number; rpm: number } }).machine;
  assert.equal(m.temp, 42.5);
  assert.equal(m.load, 33);
  assert.equal(m.left, 21);
  assert.equal(m.rpm, 4);

  const bad = await app.inject({
    method: 'PATCH', url: '/api/machines/M-06',
    headers: { authorization: `Bearer ${token}` },
    payload: { rpm: 99 },
  });
  assert.equal(bad.statusCode, 400);
});

test('admin: buat, nonaktifkan, ubah password, dan hapus pengguna', async () => {
  const token = await login('admin');
  const created = await app.inject({
    method: 'POST', url: '/api/users',
    headers: { authorization: `Bearer ${token}` },
    payload: { name: 'Kasir Uji', username: 'kasiruji', password: 'uji12345', role: 'staff' },
  });
  assert.equal(created.statusCode, 200, created.body);
  const user = (created.json() as { user: { id: string } }).user;

  const dup = await app.inject({
    method: 'POST', url: '/api/users',
    headers: { authorization: `Bearer ${token}` },
    payload: { name: 'Kasir Uji 2', username: 'kasiruji', password: 'uji12345', role: 'staff' },
  });
  assert.equal(dup.statusCode, 409);

  const off = await app.inject({
    method: 'PATCH', url: `/api/users/${user.id}`,
    headers: { authorization: `Bearer ${token}` },
    payload: { active: false },
  });
  assert.equal(off.statusCode, 200);
  assert.equal((off.json() as { user: { active: boolean } }).user.active, false);

  const loginOff = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { login: 'kasiruji', password: 'uji12345' },
  });
  assert.equal(loginOff.statusCode, 401);

  const on = await app.inject({
    method: 'PATCH', url: `/api/users/${user.id}`,
    headers: { authorization: `Bearer ${token}` },
    payload: { active: true, newPassword: 'baru12345' },
  });
  assert.equal(on.statusCode, 200);

  const loginOn = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { login: 'kasiruji', password: 'baru12345' },
  });
  assert.equal(loginOn.statusCode, 200);

  const del = await app.inject({
    method: 'DELETE', url: `/api/users/${user.id}`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(del.statusCode, 200, del.body);
});

test('DELETE ber-content-type JSON tanpa body dibalas 400, bukan 500', async () => {
  const res = await app.inject({
    method: 'DELETE', url: '/api/users/tidak-ada',
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(res.statusCode, 400);
  assert.equal((res.json() as { ok: boolean }).ok, false);
});

test('rate limit login menolak percobaan beruntun', async () => {
  const limited = buildApp({ db, cfg: { ...cfg, rateLimitLoginMax: 3 } });
  await limited.ready();
  for (let i = 0; i < 3; i++) {
    const res = await limited.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { login: 'admin', password: 'salah' },
    });
    assert.equal(res.statusCode, 401);
  }
  const blocked = await limited.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { login: 'admin', password: 'salah' },
  });
  assert.equal(blocked.statusCode, 429);
  await limited.close();
});

test('health check menjawab ok', async () => {
  const res = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(res.statusCode, 200);
  assert.equal((res.json() as { ok: boolean }).ok, true);
});
