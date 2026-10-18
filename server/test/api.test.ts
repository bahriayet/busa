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
  trustProxy: false, production: false,
  cacheTtlMs: 0, bodyLimit: 256 * 1024, rateLimitScanMax: 100_000,
  rateLimitTrackMax: 100_000, rateLimitLoginAccountMax: 100_000,
  publicApiOrigin: '',
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
  /* Privasi: nama lengkap pelanggan tidak pernah keluar dari endpoint publik. */
  assert.equal((full.json() as { order: { customer: string } }).order.customer, 'Rania');
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
  assert.equal(coBody.order.payStatus, 'belum'); // QRIS menunggu verifikasi bukti bayar
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
  /* Pembayaran live pertama hari ini mengganti angka seed (bukan menambah). */
  const expectedToday = beforeToday.source === 'seed' ? 80 : beforeToday.v + 80;
  assert.equal(dashBody.today.v, expectedToday); // dalam ribuan
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

test('reslot: pelanggan memindah jam sendiri, gugur setelah masuk lantai', async () => {
  const token = await login('0812-7781-4402');
  const co = await app.inject({
    method: 'POST', url: '/api/orders',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      items: [{ id: 'setrika', qty: 3 }], addons: [], mode: 'pickup',
      slotDate: '2026-10-12', slotTime: '08:00–10:00', pay: 'qris',
    },
  });
  assert.equal(co.statusCode, 200, co.body);
  const code = (co.json() as { order: { code: string } }).order.code;

  const ok = await app.inject({
    method: 'POST', url: `/api/orders/${code}/reslot`,
    headers: { authorization: `Bearer ${token}` },
    payload: { slotTime: '10:00–12:00' },
  });
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal((ok.json() as { order: { slot: { time: string } } }).order.slot.time, '10:00–12:00');

  const bad = await app.inject({
    method: 'POST', url: `/api/orders/${code}/reslot`,
    headers: { authorization: `Bearer ${token}` },
    payload: { slotTime: '25:00–26:00' },
  });
  assert.equal(bad.statusCode, 400);

  /* Sudah masuk lantai (tahap > 1) → ditolak, walau oleh staf. */
  const staff = await login('dodo');
  const late = await app.inject({
    method: 'POST', url: '/api/orders/BUSA-4468/reslot',
    headers: { authorization: `Bearer ${staff}` },
    payload: { slotTime: '10:00–12:00' },
  });
  assert.equal(late.statusCode, 409);
});

test('bayar hanya untuk staf: pelanggan tidak bisa menandai lunas sendiri', async () => {
  const token = await login('0812-7781-4402');
  const co = await app.inject({
    method: 'POST', url: '/api/orders',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      items: [{ id: 'setrika', qty: 3 }], addons: [], mode: 'pickup',
      slotDate: '2026-10-12', slotTime: '12:00–14:00', pay: 'cash',
    },
  });
  assert.equal(co.statusCode, 200, co.body);
  const code = (co.json() as { order: { code: string } }).order.code;

  const denied = await app.inject({
    method: 'POST', url: `/api/orders/${code}/pay`,
    headers: { authorization: `Bearer ${token}` },
    payload: { method: 'cash' },
  });
  assert.equal(denied.statusCode, 403);

  const staff = await login('dodo');
  const paid = await app.inject({
    method: 'POST', url: `/api/orders/${code}/pay`,
    headers: { authorization: `Bearer ${staff}` },
    payload: { method: 'cash' },
  });
  assert.equal(paid.statusCode, 200, paid.body);
  assert.equal((paid.json() as { order: { payStatus: string } }).order.payStatus, 'lunas');
});

test('bukti bayar QRIS: pelanggan mengunggah, admin memverifikasi', async () => {
  const token = await login('0812-7781-4402');
  const co = await app.inject({
    method: 'POST', url: '/api/orders',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      items: [{ id: 'setrika', qty: 3 }], addons: [], mode: 'pickup',
      slotDate: '2026-10-12', slotTime: '14:00–16:00', pay: 'qris',
    },
  });
  assert.equal(co.statusCode, 200, co.body);
  const code = (co.json() as { order: { code: string; hasProof: boolean } }).order.code;
  assert.equal((co.json() as { order: { hasProof: boolean } }).order.hasProof, false);

  const png = 'data:image/png;base64,' + Buffer.from('bukti-uji').toString('base64');
  const bad = await app.inject({
    method: 'POST', url: `/api/orders/${code}/proof`,
    headers: { authorization: `Bearer ${token}` },
    payload: { dataUrl: 'bukan-gambar' },
  });
  assert.equal(bad.statusCode, 400);

  const up = await app.inject({
    method: 'POST', url: `/api/orders/${code}/proof`,
    headers: { authorization: `Bearer ${token}` },
    payload: { dataUrl: png },
  });
  assert.equal(up.statusCode, 200, up.body);
  const upBody = up.json() as { order: { payStatus: string; hasProof: boolean }; proof: string };
  assert.equal(upBody.order.payStatus, 'belum'); // tetap belum sampai kasir verifikasi
  assert.equal(upBody.order.hasProof, true);
  assert.equal(upBody.proof, png);

  /* Staf melihat bukti lalu menandai lunas. */
  const staff = await login('dodo');
  const seen = await app.inject({
    method: 'GET', url: `/api/orders/${code}/proof`,
    headers: { authorization: `Bearer ${staff}` },
  });
  assert.equal(seen.statusCode, 200);
  assert.equal((seen.json() as { proof: string }).proof, png);

  const paid = await app.inject({
    method: 'POST', url: `/api/orders/${code}/pay`,
    headers: { authorization: `Bearer ${staff}` },
    payload: { method: 'qris' },
  });
  assert.equal(paid.statusCode, 200, paid.body);
  assert.equal((paid.json() as { order: { payStatus: string } }).order.payStatus, 'lunas');
});

test('staf boleh membatalkan pesanan yang sudah masuk lantai', async () => {
  const staff = await login('dodo');
  /* BUSA-4467 sedang di lantai; pelanggan ditolak, staf boleh. */
  const token = await login('0812-7781-4402');
  const denied = await app.inject({
    method: 'POST', url: '/api/orders/BUSA-4467/cancel',
    headers: { authorization: `Bearer ${token}` },
  });
  /* Bukan milik pelanggan ini — ditolak sebelum aturan tahap pun berlaku. */
  assert.equal(denied.statusCode, 403);

  const ok = await app.inject({
    method: 'POST', url: '/api/orders/BUSA-4467/cancel',
    headers: { authorization: `Bearer ${staff}` },
  });
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal((ok.json() as { order: { cancelled: boolean } }).order.cancelled, true);
});

test('top up dompet dihapus: endpoint menolak dengan 404', async () => {
  const token = await login('0812-7781-4402');
  const res = await app.inject({
    method: 'POST', url: '/api/me/topup',
    headers: { authorization: `Bearer ${token}` },
    payload: { amount: 500_000 },
  });
  assert.equal(res.statusCode, 404);
  const me = await app.inject({ method: 'GET', url: '/api/me', headers: { authorization: `Bearer ${token}` } });
  assert.equal((me.json() as { customer: { balance: number } }).customer.balance, 412_500);
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

test('limit login per akun: percobaan beruntun ke akun yang sama diblokir', async () => {
  const perAccount = buildApp({ db, cfg: { ...cfg, rateLimitLoginAccountMax: 3 } });
  await perAccount.ready();
  for (let i = 0; i < 3; i++) {
    const res = await perAccount.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { login: 'admin', password: 'salah' },
    });
    assert.equal(res.statusCode, 401);
  }
  const blocked = await perAccount.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { login: 'admin', password: 'salah' },
  });
  assert.equal(blocked.statusCode, 429);

  /* Akun lain tidak terkena imbas limit akun ini. */
  const other = await perAccount.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { login: 'dodo', password: 'salah' },
  });
  assert.equal(other.statusCode, 401);
  await perAccount.close();
});

test('health check menjawab ok', async () => {
  const res = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(res.statusCode, 200);
  assert.equal((res.json() as { ok: boolean }).ok, true);
});

test('produksi: /docs ditutup dan /health tanpa detail lokasi DB', async () => {
  const prod = buildApp({ db, cfg: { ...cfg, production: true, publicApiOrigin: 'https://busa-api.onrender.com' } });
  await prod.ready();
  const docs = await prod.inject({ method: 'GET', url: '/docs/json' });
  assert.equal(docs.statusCode, 404);
  const health = await prod.inject({ method: 'GET', url: '/health' });
  assert.equal(health.statusCode, 200);
  assert.deepEqual(Object.keys(health.json()).sort(), ['ok', 'uptime_s']);
  /* CSP produksi: script hanya dari berkas sendiri, atribut event inline dilarang. */
  const csp = String(health.headers['content-security-policy'] || '');
  assert.ok(csp.includes("script-src 'self'"), csp);
  assert.ok(csp.includes("script-src-attr 'none'"), csp);
  assert.ok(csp.includes('wss://busa-api.onrender.com'), csp);
  /* Iframe peta lokasi di halaman situs — frame-src harus mengizinkan Google Maps. */
  assert.ok(csp.includes('frame-src') && csp.includes('https://www.google.com'), csp);
  await prod.close();
});

test('body melebihi batas dibalas 413 dengan pesan Indonesia', async () => {
  const tiny = buildApp({ db, cfg: { ...cfg, bodyLimit: 1024 } });
  await tiny.ready();
  const res = await tiny.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { login: 'admin', password: 'x'.repeat(4096) },
  });
  assert.equal(res.statusCode, 413);
  assert.equal((res.json() as { ok: boolean }).ok, false);
  await tiny.close();
});

test('katalog di-cache tetapi invalidasi saat admin mengubah harga addon', async () => {
  const cached = buildApp({ db, cfg: { ...cfg, cacheTtlMs: 60_000 } });
  await cached.ready();

  const loginRes = await cached.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { login: 'admin', password: 'busa1234' },
  });
  const token = (loginRes.json() as { token: string }).token;

  const priceOf = async (): Promise<number> => {
    const res = await cached.inject({ method: 'GET', url: '/api/catalog' });
    const body = res.json() as { addons: { id: string; price: number }[] };
    return body.addons.find((a) => a.id === 'stain')!.price;
  };

  const before = await priceOf(); // mengisi cache
  const patch = await cached.inject({
    method: 'PATCH', url: '/api/addons/stain',
    headers: { authorization: `Bearer ${token}` },
    payload: { price: before + 100 },
  });
  assert.equal(patch.statusCode, 200, patch.body);
  assert.equal(await priceOf(), before + 100); // cache tidak boleh basi

  await cached.inject({
    method: 'PATCH', url: '/api/addons/stain',
    headers: { authorization: `Bearer ${token}` },
    payload: { price: before },
  });
  await cached.close();
});

test('CORS lintas domain mengizinkan PUT/PATCH/DELETE untuk portal admin', async () => {
  const web = buildApp({ db, cfg: { ...cfg, corsOrigins: ['https://busa-londry.vercel.app'] } });
  await web.ready();
  const pre = await web.inject({
    method: 'OPTIONS', url: '/api/qris',
    headers: {
      origin: 'https://busa-londry.vercel.app',
      'access-control-request-method': 'PUT',
      'access-control-request-headers': 'authorization,content-type',
    },
  });
  assert.equal(pre.statusCode, 204, pre.body);
  const allow = String(pre.headers['access-control-allow-methods'] || '');
  for (const m of ['PUT', 'PATCH', 'DELETE']) assert.ok(allow.includes(m), `metode ${m} tidak diizinkan: ${allow}`);
  await web.close();
});

test('galeri: admin menyimpan foto, item tidak sah ditolak', async () => {
  const admin = await login('admin');
  const png = 'data:image/png;base64,' + Buffer.from('foto-uji').toString('base64');
  const ok = await app.inject({
    method: 'PATCH', url: '/api/content/gallery',
    headers: { authorization: `Bearer ${admin}` },
    payload: { value: [{ dataUrl: png, label: 'Depan toko' }] },
  });
  assert.equal(ok.statusCode, 200, ok.body);
  const val = (ok.json() as { value: { label: string }[] }).value;
  assert.equal(val[0]?.label, 'Depan toko');

  const bad = await app.inject({
    method: 'PATCH', url: '/api/content/gallery',
    headers: { authorization: `Bearer ${admin}` },
    payload: { value: [{ dataUrl: 'bukan-gambar' }] },
  });
  assert.equal(bad.statusCode, 400);

  const tooMany = await app.inject({
    method: 'PATCH', url: '/api/content/gallery',
    headers: { authorization: `Bearer ${admin}` },
    payload: { value: Array.from({ length: 9 }, () => ({ seed: 'contoh' })) },
  });
  assert.equal(tooMany.statusCode, 400);

  const anon = await app.inject({ method: 'PATCH', url: '/api/content/gallery', payload: { value: [] } });
  assert.equal(anon.statusCode, 401);
});

test('lokasi: admin menyimpan peta & alamat, isi tidak sah ditolak', async () => {
  const admin = await login('admin');
  const png = 'data:image/png;base64,' + Buffer.from('peta-uji').toString('base64');
  const ok = await app.inject({
    method: 'PATCH', url: '/api/content/location',
    headers: { authorization: `Bearer ${admin}` },
    payload: {
      value: {
        active: true,
        name: 'Cabang Buahbatu',
        address: 'Jl. Buahbatu No. 108, Bandung',
        hours: '07.00–21.00',
        phone: '0812-7781-4402',
        url: 'https://maps.google.com/?q=BUSA',
        image: { dataUrl: png },
      },
    },
  });
  assert.equal(ok.statusCode, 200, ok.body);
  const val = (ok.json() as { value: { name: string; image: { dataUrl: string } } }).value;
  assert.equal(val.name, 'Cabang Buahbatu');
  assert.equal(val.image.dataUrl, png);

  /* Endpoint publik ikut membawa lokasi supaya halaman situs bisa merender. */
  const pub = await app.inject({ method: 'GET', url: '/api/content' });
  assert.equal(pub.statusCode, 200);
  const body = pub.json() as { location: { name: string } | null };
  assert.equal(body.location?.name, 'Cabang Buahbatu');

  const badUrl = await app.inject({
    method: 'PATCH', url: '/api/content/location',
    headers: { authorization: `Bearer ${admin}` },
    payload: { value: { url: 'javascript:alert(1)' } },
  });
  assert.equal(badUrl.statusCode, 400);

  const badImg = await app.inject({
    method: 'PATCH', url: '/api/content/location',
    headers: { authorization: `Bearer ${admin}` },
    payload: { value: { image: { dataUrl: 'bukan-gambar' } } },
  });
  assert.equal(badImg.statusCode, 400);

  const notObject = await app.inject({
    method: 'PATCH', url: '/api/content/location',
    headers: { authorization: `Bearer ${admin}` },
    payload: { value: [1, 2, 3] },
  });
  assert.equal(notObject.statusCode, 400);

  const anon = await app.inject({ method: 'PATCH', url: '/api/content/location', payload: { value: {} } });
  assert.equal(anon.statusCode, 401);
});

test('background slide: admin menyimpan 6 slot, isi tidak sah ditolak', async () => {
  const admin = await login('admin');
  const jpg = 'data:image/jpeg;base64,' + Buffer.from('slide-uji').toString('base64');
  const ok = await app.inject({
    method: 'PATCH', url: '/api/content/slides',
    headers: { authorization: `Bearer ${admin}` },
    payload: { value: [jpg, null, jpg, jpg, jpg, jpg] },
  });
  assert.equal(ok.statusCode, 200, ok.body);
  const val = (ok.json() as { value: (string | null)[] }).value;
  assert.equal(val.length, 6);
  assert.equal(val[0], jpg);
  assert.equal(val[1], null);

  /* Endpoint publik ikut membawa background agar landing bisa merender. */
  const pub = await app.inject({ method: 'GET', url: '/api/content' });
  assert.equal(pub.statusCode, 200);
  const body = pub.json() as { slides: (string | null)[] };
  assert.equal(body.slides[0], jpg);

  const tooMany = await app.inject({
    method: 'PATCH', url: '/api/content/slides',
    headers: { authorization: `Bearer ${admin}` },
    payload: { value: [jpg, jpg, jpg, jpg, jpg, jpg, jpg] },
  });
  assert.equal(tooMany.statusCode, 400);

  const badImg = await app.inject({
    method: 'PATCH', url: '/api/content/slides',
    headers: { authorization: `Bearer ${admin}` },
    payload: { value: ['bukan-gambar'] },
  });
  assert.equal(badImg.statusCode, 400);

  const notArray = await app.inject({
    method: 'PATCH', url: '/api/content/slides',
    headers: { authorization: `Bearer ${admin}` },
    payload: { value: { foto: jpg } },
  });
  assert.equal(notArray.statusCode, 400);

  const anon = await app.inject({ method: 'PATCH', url: '/api/content/slides', payload: { value: [] } });
  assert.equal(anon.statusCode, 401);
});

test('QRIS: publik membaca, hanya admin mengganti, pelanggan ditolak', async () => {
  const anon = await app.inject({ method: 'GET', url: '/api/qris' });
  assert.equal(anon.statusCode, 200);
  assert.equal((anon.json() as { qris: unknown }).qris, null);

  const png = 'data:image/png;base64,' + Buffer.from('qris-uji').toString('base64');
  const custToken = await login('0812-7781-4402');
  const denied = await app.inject({
    method: 'PUT', url: '/api/qris',
    headers: { authorization: `Bearer ${custToken}` },
    payload: { dataUrl: png },
  });
  assert.equal(denied.statusCode, 403);

  const admin = await login('admin');
  const bad = await app.inject({
    method: 'PUT', url: '/api/qris',
    headers: { authorization: `Bearer ${admin}` },
    payload: { dataUrl: 'data:text/html;base64,YWJj' },
  });
  assert.equal(bad.statusCode, 400);

  const put = await app.inject({
    method: 'PUT', url: '/api/qris',
    headers: { authorization: `Bearer ${admin}` },
    payload: { dataUrl: png },
  });
  assert.equal(put.statusCode, 200, put.body);
  const stored = (put.json() as { qris: { dataUrl: string; updatedAt: number } }).qris;
  assert.equal(stored.dataUrl, png);
  assert.ok(stored.updatedAt > 0);

  const get = await app.inject({ method: 'GET', url: '/api/qris' });
  assert.equal((get.json() as { qris: { dataUrl: string } }).qris.dataUrl, png);

  const del = await app.inject({
    method: 'DELETE', url: '/api/qris',
    headers: { authorization: `Bearer ${admin}` },
  });
  assert.equal(del.statusCode, 200);
  assert.equal((del.json() as { qris: unknown }).qris, null);
  const after = await app.inject({ method: 'GET', url: '/api/qris' });
  assert.equal((after.json() as { qris: unknown }).qris, null);
});

test('ganti password mencabut token lama (sesi penyerang putus)', async () => {
  const token = await login('dodo');
  /* Beri jarak > 1 detik: token yang terbit di detik yang sama dengan
     pergantian password sengaja dimaafkan (presisi iat JWT = detik). */
  await new Promise((r) => setTimeout(r, 1100));

  const change = await app.inject({
    method: 'POST', url: '/api/auth/change-password',
    headers: { authorization: `Bearer ${token}` },
    payload: { currentPassword: 'busa1234', newPassword: 'dodoRahasia123' },
  });
  assert.equal(change.statusCode, 200, change.body);

  const stale = await app.inject({
    method: 'GET', url: '/api/dashboard',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(stale.statusCode, 401);

  /* Kembalikan password ke nilai seed supaya tidak mengubah state test lain. */
  const relog = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { login: 'dodo', password: 'dodoRahasia123' },
  });
  assert.equal(relog.statusCode, 200, relog.body);
  const fresh = (relog.json() as { token: string }).token;
  const restore = await app.inject({
    method: 'POST', url: '/api/auth/change-password',
    headers: { authorization: `Bearer ${fresh}` },
    payload: { currentPassword: 'dodoRahasia123', newPassword: 'busa1234' },
  });
  assert.equal(restore.statusCode, 200, restore.body);
});
