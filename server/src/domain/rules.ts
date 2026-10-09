import {
  LAST_STAGE, MACHINE_KIND_LABEL, STAGE_MACHINE, STAGE_MIN, STAGES, durText,
} from './constants.ts';
import type { Machine, MachineKind, MachineState, Order, ScanAction } from './types.ts';

/**
 * Aturan lantai. Setiap aksi pindai dinilai di sini lebih dulu; bila mustahil,
 * ditolak dengan alasan yang bisa dibaca operator, bukan disimpan diam-diam.
 *
 * Fungsi-fungsi di berkas ini murni (order + machines masuk, verdict keluar)
 * supaya bisa diuji tanpa database.
 */

export interface MachineEffect {
  machineId: string;
  ticket: string | null;
  load: number;
  state: MachineState;
  rpm: number;
  left: number;
  stage: number;
  temp: number | null;
}

export interface Decision {
  ok: true;
  action: ScanAction;
  from: number;
  to: number;
  machine: string | null;
  effects: MachineEffect[];
  assignCourier: boolean;
  completes: boolean;
  freesOrderMachine: boolean;
  note: string;
  warning: string | null;
}

export interface Rejection {
  ok: false;
  reason: string;
  hint: string | null;
}

export type Verdict = Decision | Rejection;

function reject(reason: string, hint: string | null = null): Rejection {
  return { ok: false, reason, hint };
}

export function machineCap(m: Machine): number {
  if (m.cap > 0) return m.cap;
  const parsed = /(\d+)\s*kg/i.exec(m.model)?.[1];
  return parsed ? Number(parsed) : 8;
}

export function isFree(m: Machine): boolean {
  return !m.ticket || m.ticket === '—';
}

/** Layanan cuci kering memaksa drum dryclean, bukan drum cuci biasa. */
export function kindNeeded(order: Order, stage: number): MachineKind {
  const base = STAGE_MACHINE[stage] ?? 'wash';
  if (base === 'wash' && order.items.some((i) => i.id === 'kering')) return 'dryclean';
  return base;
}

export function machinesOfKind(machines: Machine[], kind: MachineKind): Machine[] {
  return machines.filter((m) => m.kind === kind);
}

/** Port dari `suggestMachine()` frontend: drum yang muat, paling ringan bebannya. */
export function suggestMachine(weight: number, kind: MachineKind | null, machines: Machine[]): Machine | null {
  const candidates = kind ? machinesOfKind(machines, kind) : machines;
  const fits = candidates.filter((m) => machineCap(m) >= weight);
  const free = fits.filter((m) => isFree(m) || m.load === 0);
  const list = free.length ? free : fits;
  return [...list].sort((a, b2) => a.load - b2.load || a.left - b2.left)[0] ?? null;
}

export interface DecideInput {
  action: ScanAction;
  order: Order;
  machines: Machine[];
  /** Kode mesin yang diminta operator, bila ada. */
  requestedMachine?: string | null;
  note?: string;
  couriers?: string[];
}

export function decide(input: DecideInput): Verdict {
  const { action, order, machines } = input;
  const note = input.note ?? '';

  if (order.cancelled) {
    return reject(`${order.code} sudah dibatalkan; tidak ada yang bisa dikerjakan di lantai.`);
  }
  if (order.stage === LAST_STAGE && action !== 'qc') {
    return reject(
      `${order.code} sudah selesai dan diserahkan.`,
      order.collected ? 'Bila ada komplain, buka order baru sebagai pengerjaan ulang.' : 'Tandai diambil dulu bila cucian sudah berpindah tangan.',
    );
  }

  switch (action) {
    case 'terima': {
      if (order.stage > 0 || order.scanned) {
        return reject(`${order.code} sudah diterima di kasir dan kini di tahap ${STAGES[order.stage]?.label ?? '—'}.`);
      }
      if (order.weight <= 0) {
        return reject('Berat belum ditimbang.', 'Timbang dulu, lalu isi berat pada detail pesanan sebelum menerima.');
      }
      return ok({ action, order, to: 0, machine: order.machine === '—' ? null : order.machine, effects: [], note });
    }

    case 'muat': {
      if (order.stage >= 5) {
        return reject(
          `${order.code} sudah di tahap ${STAGES[order.stage]?.label ?? '—'}; muatan tidak bisa dibongkar pasang lagi.`,
          'Pakai aksi "Kosongkan drum" lebih dulu bila memang harus memindahkan cucian.',
        );
      }
      const kind = kindNeeded(order, Math.max(order.stage, 2));
      const requested = input.requestedMachine
        ? machines.find((m) => m.id === input.requestedMachine?.toUpperCase())
        : undefined;

      if (input.requestedMachine && !requested) {
        return reject(`Mesin ${input.requestedMachine} tidak ada di lantai.`, `Yang tersedia: ${machines.map((m) => m.id).join(', ')}.`);
      }
      if (requested && requested.kind !== kind) {
        return reject(
          `${requested.id} adalah ${MACHINE_KIND_LABEL[requested.kind]}, sedangkan ${order.code} butuh ${MACHINE_KIND_LABEL[kind]}.`,
          `Pilih salah satu: ${machinesOfKind(machines, kind).map((m) => m.id).join(', ') || 'tidak ada'}.`,
        );
      }

      const cand = requested ?? suggestMachine(order.weight, kind, machines);
      if (!cand) {
        return reject('Tidak ada drum yang muat.', 'Semua mesin sedang penuh. Tahan keranjang di antrean dan muat begitu ada drum selesai.');
      }
      const cap = machineCap(cand);
      if (cap < order.weight) {
        const big = machinesOfKind(machines, kind)
          .filter((m) => machineCap(m) >= order.weight)
          .sort((a, b2) => a.load - b2.load)[0];
        return reject(
          `${cand.id} hanya ${cap} kg, sedangkan ${order.code} ${order.weight} kg.`,
          big ? `Usulan: ${big.id} (${machineCap(big)} kg, beban ${big.load}%).` : `Tidak ada ${MACHINE_KIND_LABEL[kind]} sebesar ${order.weight} kg hari ini.`,
        );
      }
      if (!isFree(cand) && cand.ticket !== order.code) {
        const holder = cand.ticket ?? '—';
        const until = cand.left > 0 ? `sisa ${durText(cand.left)}` : 'siklus berjalan';
        return reject(`${cand.id} sedang memegang ${holder} (${until}).`, `Drum ${MACHINE_KIND_LABEL[kind]} yang kosong: ${machinesOfKind(machines, kind).filter(isFree).map((m) => m.id).join(', ') || 'tidak ada'}.`);
      }

      const to = Math.max(order.stage, 2);
      const load = Math.max(8, Math.min(99, Math.round((order.weight / cap) * 100)));
      const effect: MachineEffect = {
        machineId: cand.id,
        ticket: order.code,
        load,
        state: 'run',
        rpm: 6 + (load > 70 ? 3 : 0),
        left: STAGE_MIN[to] ?? 30,
        stage: to,
        temp: kind === 'steam' ? 120 : kind === 'dry' ? 68 : 40,
      };
      const warning = load > 90
        ? `${cand.id} terisi ${load}% — mendekati kapasitas ${cap} kg, cucian bisa tidak bersih merata.`
        : null;
      return ok({ action, order, to, machine: cand.id, effects: [effect], note, warning });
    }

    case 'tahap': {
      const need = STAGE_MACHINE[order.stage];
      if (need) {
        const holding = machines.find((m) => m.ticket === order.code);
        if (!holding) {
          return reject(
            `Tahap ${STAGES[order.stage]?.label ?? '—'} harus berjalan di dalam ${MACHINE_KIND_LABEL[need]}.`,
            `Muat ${order.code} ke drum lebih dulu (aksi "Muat drum").`,
          );
        }
        const to = Math.min(LAST_STAGE, order.stage + 1);
        const nextLeft = STAGE_MIN[to] ?? 30;
        const effect: MachineEffect = {
          machineId: holding.id,
          ticket: order.code,
          load: holding.load,
          state: to === 5 ? 'hot' : to === 6 ? 'vent' : 'run',
          rpm: to >= 5 ? Math.max(2, holding.rpm - 2) : holding.rpm,
          left: nextLeft,
          stage: to,
          temp: to === 5 ? 70 : to === 6 ? 125 : holding.temp,
        };
        return ok({ action, order, to, machine: holding.id, effects: [effect], note });
      }
      return ok({ action, order, to: Math.min(LAST_STAGE, order.stage + 1), machine: order.machine === '—' ? null : order.machine, effects: [], note });
    }

    case 'lepas': {
      const target = input.requestedMachine
        ? machines.find((m) => m.id === input.requestedMachine?.toUpperCase())
        : machines.find((m) => m.ticket === order.code);
      if (!target) {
        return reject(`Tidak ada drum yang sedang memegang ${order.code}.`, 'Aksi ini hanya untuk mengosongkan drum setelah cucian keluar.');
      }
      if (target.ticket !== order.code) {
        return reject(`${target.id} sedang memegang ${target.ticket ?? '—'}, bukan ${order.code}.`);
      }
      const effect: MachineEffect = {
        machineId: target.id, ticket: null, load: 0, state: 'idle', rpm: 0, left: 0, stage: target.stage, temp: 26,
      };
      return ok({
        action, order, to: Math.min(LAST_STAGE, order.stage), machine: target.id,
        effects: [effect], note, freesOrderMachine: true,
      });
    }

    case 'qc': {
      if (order.stage < 6) {
        return reject(
          `${order.code} belum sampai tahap setrika, jadi belum ada yang bisa di-QC.`,
          `Sekarang di tahap ${STAGES[order.stage]?.label ?? '—'}. QC baru masuk akal setelah tahap 6.`,
        );
      }
      if (order.stage === LAST_STAGE && order.collected) {
        return reject(`${order.code} sudah diserahkan ke pelanggan.`, 'Buka order pengerjaan ulang bila pelanggan komplain.');
      }
      const holding = machines.find((m) => m.ticket === order.code);
      const effects: MachineEffect[] = holding
        ? [{ machineId: holding.id, ticket: null, load: 0, state: 'idle', rpm: 0, left: 0, stage: holding.stage, temp: 26 }]
        : [];
      return ok({
        action, order, to: 2, machine: null, effects, note: note || 'noda sisa, masuk rendam ulang', freesOrderMachine: Boolean(holding),
      });
    }

    case 'selesai': {
      if (order.stage < LAST_STAGE - 1) {
        return reject(
          `${order.code} belum boleh diserahkan — masih di tahap ${STAGES[order.stage]?.label ?? '—'}.`,
          'QC & Lipat harus selesai lebih dulu (tahap 8 dari 9).',
        );
      }
      const holding = machines.find((m) => m.ticket === order.code);
      const effects: MachineEffect[] = holding
        ? [{ machineId: holding.id, ticket: null, load: 0, state: 'idle', rpm: 0, left: 0, stage: holding.stage, temp: 26 }]
        : [];
      const assignCourier = order.mode === 'delivery' && (!order.courier || order.courier === '—');
      return ok({
        action, order, to: LAST_STAGE, machine: null, effects, note,
        freesOrderMachine: Boolean(holding), assignCourier, completes: true,
      });
    }

    default:
      return reject(`Aksi "${String(action)}" tidak dikenal.`);
  }
}

interface OkInput {
  action: ScanAction;
  order: Order;
  to: number;
  machine: string | null;
  effects: MachineEffect[];
  note: string;
  warning?: string | null;
  assignCourier?: boolean;
  completes?: boolean;
  freesOrderMachine?: boolean;
}

function ok(i: OkInput): Decision {
  return {
    ok: true,
    action: i.action,
    from: i.order.stage,
    to: i.to,
    machine: i.machine,
    effects: i.effects,
    assignCourier: i.assignCourier ?? false,
    completes: i.completes ?? false,
    freesOrderMachine: i.freesOrderMachine ?? false,
    note: i.note,
    warning: i.warning ?? null,
  };
}

/** Pesanan yang diam di satu tahap jauh melampaui target — bahan panel "macet". */
export function dwellMinutes(order: Order, now: number): number | null {
  if (!order.stageAt) return null;
  return Math.max(0, Math.round((now - order.stageAt) / 60000));
}

export function isStuck(order: Order, now: number): boolean {
  if (order.stage >= LAST_STAGE || order.cancelled) return false;
  const d = dwellMinutes(order, now);
  if (d === null) return false;
  const target = STAGE_MIN[order.stage] ?? 30;
  return d > target * 1.6;
}

/** Sisa menit sampai pesanan siap, dihitung dari tahap sekarang + antrean di tahap yang sama. */
export function etaMinutes(order: Order, machines: Machine[], queueDepth: number): { mins: number; label: string } {
  if (order.stage >= LAST_STAGE) return { mins: 0, label: 'selesai' };
  let mins = 0;
  for (let i = order.stage + 1; i < STAGES.length; i++) mins += STAGE_MIN[i] ?? 0;
  if (STAGE_MACHINE[order.stage]) {
    const m = machines.find((x) => x.id === order.machine && x.ticket === order.code);
    if (m && m.left > 0) mins += m.left;
  }
  mins += Math.round(Math.max(0, queueDepth) * 6);
  const d = new Date(Date.now() + mins * 60000);
  const label = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return { mins, label };
}
