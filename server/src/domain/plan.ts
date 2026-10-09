import {
  DAY_MIN, DAY_START, LAST_STAGE, STAGE_MACHINE, STAGE_MIN, STAGES,
} from './constants.ts';
import { isFree, kindNeeded, machineCap } from './rules.ts';
import type {
  AtRiskOrder, DayBlock, DayGap, DayPlan, Machine, MachineKind, Order, WaitingBasket,
} from './types.ts';

/**
 * Rencana hari lantai. Dihitung dari keadaan nyata (mesin + order), bukan
 * jadwal karangan: tiap drum yang sedang jalan jadi satu blok, sisa hari jadi
 * jendela kosong, dan keranjang tunggu dijadwalkan ke jendela paling awal
 * yang muat. Semua waktu dalam menit sejak tengah malam.
 */

export interface PlanInput {
  date: string;
  now: number;
  machines: Machine[];
  orders: Order[];
}

const inWindow = (t: number): number => Math.max(DAY_START, Math.min(DAY_MIN, t));

function nowMinutes(now: number): number {
  const d = new Date(now);
  return d.getHours() * 60 + d.getMinutes();
}

/** Pesanan aktif yang belum selesai, urut express dulu lalu paling awal masuk. */
function activeQueue(orders: Order[]): Order[] {
  return orders
    .filter((o) => !o.cancelled && o.stage < LAST_STAGE)
    .sort((a, b2) =>
      (a.priority === 'express' ? 0 : 1) - (b2.priority === 'express' ? 0 : 1)
      || a.createdAt.localeCompare(b2.createdAt));
}

/** Jenis drum yang pertama kali dibutuhkan order dari tahap sekarang. */
function neededKindOf(order: Order): MachineKind | null {
  const from = Math.max(order.stage, 2);
  for (let s = from; s <= LAST_STAGE - 1; s++) {
    if (STAGE_MACHINE[s]) return kindNeeded(order, s);
  }
  return null;
}

/** Menit siklus yang akan dijalani order di drum jenis `kind`, dari tahap sekarang. */
function cycleMinutes(order: Order, kind: MachineKind): number {
  let total = 0;
  const from = Math.max(order.stage, 2);
  for (let s = from; s <= LAST_STAGE - 1; s++) {
    if (!STAGE_MACHINE[s]) continue;
    if (kindNeeded(order, s) === kind) total += STAGE_MIN[s] ?? 30;
  }
  return Math.max(total, STAGE_MIN[from] ?? 30);
}

export function computePlan(input: PlanInput): DayPlan {
  const nowMin = inWindow(nowMinutes(input.now));
  const dayEnd = DAY_MIN;

  /* Blok mesin: tiap drum yang sedang jalan mengisi jadwal sampai selesai. */
  const lastFree = new Map<string, number>();
  const timeline: Record<string, DayBlock[] & { lastFree?: number }> = {};
  const gaps: DayGap[] = [];

  for (const m of input.machines) {
    const busy = !isFree(m);
    const end = busy ? inWindow(nowMin + Math.max(1, m.left)) : nowMin;
    const blocks: DayBlock[] = [];
    if (busy && end > nowMin) {
      blocks.push({
        code: m.ticket === '—' ? '' : m.ticket,
        kind: m.kind, machine: m.id, start: nowMin, end,
        label: STAGES[m.stage]?.label ?? '',
      });
    }
    lastFree.set(m.id, Math.max(nowMin, end));
    const arr = blocks as DayBlock[] & { lastFree?: number };
    arr.lastFree = lastFree.get(m.id)!;
    timeline[m.id] = arr;
    gaps.push({ machine: m.id, kind: m.kind, start: Math.max(nowMin, end), end: dayEnd });
  }

  /* Keranjang tunggu: order aktif yang butuh drum tapi tidak sedang dipegang. */
  const waiting: WaitingBasket[] = [];
  for (const o of activeQueue(input.orders)) {
    const holding = input.machines.some((m) => m.ticket === o.code);
    if (holding) continue;
    const kind = neededKindOf(o);
    if (!kind) continue;
    const options: DayGap[] = input.machines
      .filter((m) => m.kind === kind && machineCap(m) >= o.weight)
      .map((m) => ({ machine: m.id, kind, start: lastFree.get(m.id) ?? nowMin, end: dayEnd }))
      .filter((g) => g.start < g.end)
      .sort((a, b2) => a.start - b2.start);
    waiting.push({
      code: o.code, customer: o.customer, weight: o.weight, kind,
      first: options[0] ?? null, options,
    });
  }

  /* Jadwalkan keranjang tunggu ke jendela paling awal yang muat (greedy). */
  for (const w of waiting) {
    const gap = w.options[0];
    if (!gap) continue;
    const order = input.orders.find((o) => o.code === w.code)!;
    const dur = cycleMinutes(order, w.kind);
    const start = gap.start;
    const end = inWindow(start + dur);
    const arr = timeline[gap.machine];
    if (arr) {
      arr.push({ code: w.code, kind: w.kind, machine: gap.machine, start, end, label: STAGES[order.stage]?.label ?? '' });
      arr.lastFree = Math.max(arr.lastFree ?? nowMin, end);
      lastFree.set(gap.machine, arr.lastFree);
    }
  }

  /* Risiko telat: ETA melewati janji slot pada tanggal yang diminta. */
  const atRisk: AtRiskOrder[] = [];
  for (const o of input.orders) {
    if (o.cancelled || o.stage >= LAST_STAGE || o.slot.date !== input.date || !o.slot.time) continue;
    const slotStart = parseSlotStart(o.slot.time);
    if (slotStart === null) continue;
    const queueDepth = input.orders.filter((x) => x.code !== o.code && !x.cancelled && x.stage === o.stage).length;
    const eta = etaMinutesOf(o, input.machines, queueDepth);
    const finish = nowMin + eta;
    if (finish <= slotStart) continue;
    const suggestion = suggestFor(o, input.machines);
    atRisk.push({
      code: o.code, slot: o.slot.time, promised: slotStart, finish,
      lateBy: finish - slotStart, suggestion,
    });
  }

  const freeHours = Math.round(
    [...lastFree.values()].reduce((a, t) => a + Math.max(0, dayEnd - t), 0) / 60,
  );

  return { date: input.date, gaps, timeline, waiting, atRisk, freeHours };
}

/** "07:00–09:00" → 7*60. Mengembalikan null bila format tidak dikenali. */
function parseSlotStart(slot: string): number | null {
  const m = /(\d{1,2}):(\d{2})/.exec(slot);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** ETA dalam menit: sisa tahap + sisa siklus drum + antrean di tahap yang sama. */
function etaMinutesOf(order: Order, machines: Machine[], queueDepth: number): number {
  let mins = 0;
  for (let i = order.stage + 1; i < STAGES.length; i++) mins += STAGE_MIN[i] ?? 0;
  const need = STAGE_MACHINE[order.stage];
  if (need) {
    const m = machines.find((x) => x.id === order.machine && x.ticket === order.code);
    if (m && m.left > 0) mins += m.left;
  }
  return mins + Math.round(Math.max(0, queueDepth) * 6);
}

/** Kalimat saran yang bisa langsung dipakai operator. */
function suggestFor(order: Order, machines: Machine[]): string {
  const kind = STAGE_MACHINE[order.stage] ?? null;
  if (kind) {
    const holding = machines.find((m) => m.ticket === order.code);
    if (!holding) {
      const free = machines.filter((m) => m.kind === kind && isFree(m) && machineCap(m) >= order.weight);
      if (free.length) return `Muat ke ${free.map((m) => m.id).join(' / ')} sekarang.`;
      const soon = machines
        .filter((m) => m.kind === kind && m.ticket !== order.code)
        .sort((a, b2) => a.left - b2.left)[0];
      return soon ? `Tunggu ${soon.id} selesai (${soon.left} menit), atau pindahkan muatan.` : `Tidak ada ${kind} tersedia hari ini.`;
    }
  }
  return order.stage === LAST_STAGE - 1 ? 'Serahkan dan tandai selesai.' : 'Naik tahap lewat pindai.';
}
