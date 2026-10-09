import assert from 'node:assert/strict';
import { test } from 'node:test';

import { quote, quoteErrors, promoRejectReason } from '../src/domain/pricing.ts';
import { SEED_ADDONS, SEED_PROMOS, SEED_SERVICES } from '../src/seed/data.ts';

const book = { services: SEED_SERVICES, addons: SEED_ADDONS, promos: SEED_PROMOS };

test('tagihan BUSA-4471 dihitung ulang, bukan angka hardcode', () => {
  const q = quote({ items: [{ id: 'setrika', qty: 6.5 }], addons: ['premium'], mode: 'pickup' }, book);
  assert.equal(q.sub, 64_000); // 6.5 kg × 8.000 + pewangi 12.000
  assert.equal(q.ship, 12_000); // sub < 80.000 → ongkir
  assert.equal(q.total, 76_000); // server yang benar: 64.000 + ongkir, bukan 64.000 hardcode lama
  assert.equal(q.weight, 6.5);
});

test('minimum 3 kg dilaporkan sebagai kekurangan, bukan disamarkan', () => {
  const q = quote({ items: [{ id: 'setrika', qty: 2 }], addons: [], mode: 'pickup' }, book);
  assert.equal(q.minKgShort, 1);
  const errs = quoteErrors(q, { items: [{ id: 'setrika', qty: 2 }], addons: [], mode: 'pickup' });
  assert.ok(errs.some((e) => e.includes('minimal 3 kg')));
});

test('BUSA10: 10% dengan batas Rp 20.000, ditolak bila ada express', () => {
  const promo = SEED_PROMOS.find((p) => p.code === 'BUSA10')!;
  const q = quote({
    items: [{ id: 'setrika', qty: 10 }], addons: [], mode: 'pickup', promoCode: 'BUSA10',
  }, book);
  assert.equal(q.disc, 8_000); // 10% dari 80.000
  assert.equal(q.promo?.code, 'BUSA10');

  const rejected = quote({
    items: [{ id: 'setrika', qty: 10 }], addons: ['express'], mode: 'pickup', promoCode: 'BUSA10',
  }, book);
  assert.equal(rejected.promo, null);
  assert.ok(rejected.promoReject?.includes('tidak bisa digabung'));

  assert.ok(promoRejectReason(promo, {
    items: [{ id: 'setrika', qty: 10 }], addons: ['express'], mode: 'pickup',
  }, 10, 80_000)?.includes('express'));
});

test('KURIRHEMAT hanya untuk pesanan kurir dan belanja ≥ 80.000', () => {
  const drop = quote({
    items: [{ id: 'setrika', qty: 10 }], addons: [], mode: 'drop', promoCode: 'KURIRHEMAT',
  }, book);
  assert.equal(drop.promo, null);
  assert.ok(drop.promoReject?.includes('dijemput atau diantar'));

  const small = quote({
    items: [{ id: 'setrika', qty: 3 }], addons: [], mode: 'delivery', promoCode: 'KURIRHEMAT',
  }, book);
  assert.equal(small.promo, null);
  assert.ok(small.promoReject?.includes('Rp 80.000'));

  const ok = quote({
    items: [{ id: 'setrika', qty: 11 }], addons: [], mode: 'delivery', promoCode: 'KURIRHEMAT',
  }, book);
  assert.equal(ok.promo?.code, 'KURIRHEMAT');
  assert.equal(ok.disc, 15_000);
});

test('SPREI2 mensyaratkan bedcover', () => {
  const wrong = quote({
    items: [{ id: 'setrika', qty: 5 }], addons: [], mode: 'pickup', promoCode: 'SPREI2',
  }, book);
  assert.equal(wrong.promo, null);
  assert.ok(wrong.promoReject?.includes('bedcover'));

  const right = quote({
    items: [{ id: 'bedcover', qty: 2 }], addons: [], mode: 'pickup', promoCode: 'SPREI2',
  }, book);
  assert.equal(right.promo?.code, 'SPREI2');
  assert.equal(right.disc, 20_000);
});

test('proteksi 2% dan express memangkas siklus jadi 6 jam', () => {
  const q = quote({
    items: [{ id: 'setrika', qty: 10 }], addons: [], mode: 'pickup', protect: true,
  }, book);
  assert.equal(q.prot, 1_600);
  const ex = quote({
    items: [{ id: 'setrika', qty: 10 }], addons: ['express'], mode: 'pickup',
  }, book);
  assert.equal(ex.hours, 6);
});

test('express tidak berlaku untuk drop-off', () => {
  const errs = quoteErrors(
    quote({ items: [{ id: 'setrika', qty: 5 }], addons: ['express'], mode: 'drop' }, book),
    { items: [{ id: 'setrika', qty: 5 }], addons: ['express'], mode: 'drop' },
  );
  assert.ok(errs.some((e) => e.includes('Express')));
});

test('keranjang kosong ditolak, layanan nonaktif diabaikan', () => {
  const errs = quoteErrors(quote({ items: [], addons: [], mode: 'pickup' }, book), { items: [], addons: [], mode: 'pickup' });
  assert.ok(errs.some((e) => e.includes('Belum ada layanan')));

  const inactive = { ...book, services: book.services.map((s) => ({ ...s, active: false })) };
  const q = quote({ items: [{ id: 'setrika', qty: 5 }], addons: [], mode: 'pickup' }, inactive);
  assert.equal(q.sub, 0);
});
