import assert from 'node:assert/strict';
import { test } from 'node:test';

import { decide, isStuck, suggestMachine } from '../src/domain/rules.ts';
import type { Machine, Order } from '../src/domain/types.ts';
import { LAST_STAGE } from '../src/domain/constants.ts';

const MACHINES: Machine[] = [
  { id: 'M-01', model: 'Front Load 12 kg', cap: 12, kind: 'wash', stage: 2, rpm: 5, temp: 40, load: 0, left: 0, ticket: '—', state: 'idle' },
  { id: 'M-02', model: 'Front Load 18 kg', cap: 18, kind: 'wash', stage: 3, rpm: 8, temp: 41, load: 92, left: 47, ticket: 'BUSA-4468', state: 'run' },
  { id: 'M-04', model: 'Dryer 15 kg', cap: 15, kind: 'dry', stage: 4, rpm: 3, temp: 71, load: 66, left: 14, ticket: 'BUSA-4463', state: 'hot' },
];

function order(over: Partial<Order> = {}): Order {
  return {
    code: 'BUSA-9999', customerId: 'c1', customer: 'Tes', phone: '08', stage: 0,
    weight: 5, mode: 'pickup', items: [{ id: 'setrika', qty: 5 }], addons: [],
    subtotal: 0, ship: 0, disc: 0, protect: 0, total: 0, promoCode: null,
    pay: 'cash', payStatus: 'belum', hasProof: false, priority: 'reguler',
    slot: { date: '', time: '' }, courier: '—', machine: '—', rack: null, notes: '',
    collected: false, cancelled: false, scanned: false,
    created: 'Hari ini 08:00', createdAt: new Date().toISOString(),
    stageAt: null, source: 'api', ...over,
  };
}

test('terima hanya sekali; berat kosong ditolak', () => {
  const fresh = order();
  const ok = decide({ action: 'terima', order: fresh, machines: MACHINES });
  assert.equal(ok.ok, true);

  const noWeight = order({ weight: 0 });
  const bad = decide({ action: 'terima', order: noWeight, machines: MACHINES });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.ok(bad.reason.includes('Berat'));

  const scanned = order({ stage: 1, scanned: true });
  const dup = decide({ action: 'terima', order: scanned, machines: MACHINES });
  assert.equal(dup.ok, false);
});

test('selesai terlalu dini ditolak dengan petunjuk', () => {
  const early = order({ stage: 2 });
  const v = decide({ action: 'selesai', order: early, machines: MACHINES });
  assert.equal(v.ok, false);
  if (!v.ok) assert.ok(v.hint?.includes('tahap 8'));
});

test('selesai pada tahap 8 menolak aksi lain', () => {
  const done = order({ stage: LAST_STAGE, collected: false });
  const v = decide({ action: 'tahap', order: done, machines: MACHINES });
  assert.equal(v.ok, false);
  if (!v.ok) assert.ok(v.reason.includes('sudah selesai'));
});

test('muat menolak drum jenis keliru (cuci kering butuh dryclean)', () => {
  const dry = order({ stage: 1, items: [{ id: 'kering', qty: 2 }], weight: 2 });
  const v = decide({ action: 'muat', order: dry, machines: MACHINES, requestedMachine: 'M-01' });
  assert.equal(v.ok, false);
  if (!v.ok) assert.ok(v.reason.includes('cuci kering'));
});

test('muat menolak drum yang terlalu kecil dengan usulan', () => {
  const big = order({ stage: 1, weight: 15 });
  const v = decide({ action: 'muat', order: big, machines: MACHINES, requestedMachine: 'M-01' });
  assert.equal(v.ok, false);
  if (!v.ok) assert.ok(v.hint?.includes('M-02'));
});

test('muat menolak drum yang sedang dipakai order lain', () => {
  const v = decide({ action: 'muat', order: order({ stage: 1, weight: 15 }), machines: MACHINES, requestedMachine: 'M-02' });
  assert.equal(v.ok, false);
  if (!v.ok) assert.ok(v.reason.includes('BUSA-4468'));
});

test('muat sukses mengisi drum dan menghitung beban', () => {
  const o = order({ stage: 1, weight: 6 });
  const v = decide({ action: 'muat', order: o, machines: MACHINES });
  assert.equal(v.ok, true);
  if (v.ok) {
    assert.equal(v.machine, 'M-01');
    assert.equal(v.to, 2);
    assert.equal(v.effects[0]?.ticket, 'BUSA-9999');
    assert.equal(v.effects[0]?.load, 50); // 6/12
    assert.equal(v.effects[0]?.state, 'run');
  }
});

test('muat >90% kapasitas memberi peringatan', () => {
  const o = order({ stage: 1, weight: 11.5 });
  const v = decide({ action: 'muat', order: o, machines: MACHINES });
  assert.equal(v.ok, true);
  if (v.ok) assert.ok(v.warning?.includes('mendekati kapasitas'));
});

test('naik tahap tanpa drum yang memegangnya ditolak', () => {
  const o = order({ stage: 2, machine: '—' });
  const v = decide({ action: 'tahap', order: o, machines: MACHINES });
  assert.equal(v.ok, false);
  if (!v.ok) assert.ok(v.hint?.includes('Muat'));
});

test('lepas tanpa pemegang drum ditolak', () => {
  const v = decide({ action: 'lepas', order: order({ stage: 3 }), machines: MACHINES });
  assert.equal(v.ok, false);
});

test('qc sebelum setrika ditolak; setelahnya kembali ke rendam', () => {
  const early = decide({ action: 'qc', order: order({ stage: 2 }), machines: MACHINES });
  assert.equal(early.ok, false);

  const late = decide({ action: 'qc', order: order({ stage: 6 }), machines: MACHINES });
  assert.equal(late.ok, true);
  if (late.ok) assert.equal(late.to, 2);
});

test('suggestMachine memilih drum muat yang paling ringan bebannya', () => {
  const pick = suggestMachine(10, 'wash', MACHINES);
  assert.equal(pick?.id, 'M-01');
});

test('isStuck mendeteksi pesanan melewati target tahap', () => {
  const now = Date.now();
  const ok = order({ stage: 2, stageAt: now - 20 * 60_000 });
  assert.equal(isStuck(ok, now), false);
  const stuck = order({ stage: 2, stageAt: now - 100 * 60_000 });
  assert.equal(isStuck(stuck, now), true);
});
