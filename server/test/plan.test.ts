import assert from 'node:assert/strict';
import { test } from 'node:test';

import { computePlan } from '../src/domain/plan.ts';
import type { Machine, Order } from '../src/domain/types.ts';

const NOW = new Date('2026-10-08T09:30:00').getTime();

const MACHINES: Machine[] = [
  { id: 'M-01', model: 'Front Load 12 kg', cap: 12, kind: 'wash', stage: 3, rpm: 6, temp: 41, load: 78, left: 30, ticket: 'BUSA-4471', state: 'run' },
  { id: 'M-02', model: 'Front Load 18 kg', cap: 18, kind: 'wash', stage: 4, rpm: 8, temp: 40, load: 92, left: 40, ticket: 'BUSA-4463', state: 'run' },
  { id: 'M-03', model: 'Top Load 9 kg', cap: 9, kind: 'wash', stage: 0, rpm: 0, temp: 26, load: 0, left: 0, ticket: '—', state: 'idle' },
  { id: 'M-04', model: 'Dryer 15 kg', cap: 15, kind: 'dry', stage: 0, rpm: 0, temp: 26, load: 0, left: 0, ticket: '—', state: 'idle' },
];

function order(over: Partial<Order> = {}): Order {
  return {
    code: 'BUSA-9998', customerId: 'c1', customer: 'Tes', phone: '08', stage: 0,
    weight: 4, mode: 'pickup', items: [{ id: 'setrika', qty: 4 }], addons: [],
    subtotal: 0, ship: 0, disc: 0, protect: 0, total: 0, promoCode: null,
    pay: 'cash', payStatus: 'lunas', priority: 'reguler',
    slot: { date: '2026-10-08', time: '' }, courier: '—', machine: '—', rack: null, notes: '',
    collected: false, cancelled: false, scanned: true,
    created: 'Hari ini 08:00', createdAt: '2026-10-08T08:00:00.000Z',
    stageAt: NOW - 10 * 60_000, source: 'api', ...over,
  };
}

test('drum sibuk jadi blok timeline dengan sisa waktunya', () => {
  const plan = computePlan({
    date: '2026-10-08', now: NOW, machines: MACHINES,
    orders: [
      order({ code: 'BUSA-4471', stage: 3, machine: 'M-01' }),
      order({ code: 'BUSA-4463', stage: 4, machine: 'M-02' }),
    ],
  });
  const m01 = plan.timeline['M-01'];
  assert.ok(m01);
  assert.equal(m01[0]?.code, 'BUSA-4471');
  assert.equal(m01[0]?.end, 570 + 30); // 09:30 + 30 menit
});

test('order di tahap drum tanpa pemegang masuk keranjang tunggu', () => {
  const plan = computePlan({
    date: '2026-10-08', now: NOW, machines: MACHINES,
    orders: [
      order({ code: 'BUSA-4467', stage: 2, weight: 7.2, machine: '—' }),
    ],
  });
  const w = plan.waiting.find((x) => x.code === 'BUSA-4467');
  assert.ok(w);
  assert.equal(w?.kind, 'wash');
  assert.equal(w?.first?.machine, 'M-03'); // satu-satunya drum cuci kosong yang muat
});

test('keranjang tunggu dijadwalkan ke jendela kosong', () => {
  const plan = computePlan({
    date: '2026-10-08', now: NOW, machines: MACHINES,
    orders: [
      order({ code: 'BUSA-4467', stage: 2, weight: 7.2, machine: '—' }),
    ],
  });
  const m03 = plan.timeline['M-03'];
  assert.ok(m03);
  assert.equal(m03[0]?.code, 'BUSA-4467');
  assert.ok((m03.lastFree ?? 0) > 570);
});

test('risiko telat dihitung terhadap janji slot', () => {
  const plan = computePlan({
    date: '2026-10-08', now: NOW, machines: MACHINES,
    orders: [
      order({ code: 'BUSA-4468', stage: 1, weight: 28, slot: { date: '2026-10-08', time: '10:00–12:00' } }),
    ],
  });
  const risk = plan.atRisk.find((r) => r.code === 'BUSA-4468');
  assert.ok(risk);
  assert.ok(risk!.lateBy > 0);
  assert.ok(risk!.suggestion.length > 0);
});

test('jam bebas dihitung dari sisa hari kerja', () => {
  const plan = computePlan({
    date: '2026-10-08', now: NOW, machines: MACHINES,
    orders: [
      order({ code: 'BUSA-4471', stage: 3, machine: 'M-01' }),
    ],
  });
  assert.ok(plan.freeHours > 0);
});
