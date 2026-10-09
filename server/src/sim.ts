import type { Db } from './db/client.ts';
import * as R from './db/repo.ts';
import { applyDecision } from './domain/apply.ts';
import { LAST_STAGE, STAGE_MACHINE, STAGE_MIN } from './domain/constants.ts';
import type { Decision, MachineEffect } from './domain/rules.ts';
import { isFree, kindNeeded, machineCap } from './domain/rules.ts';
import type { Machine, Order } from './domain/types.ts';

/**
 * Simulasi lantai. Ketika `simulate` aktif, drum menghitung mundur dan cucian
 * bergerak maju persis seperti operator sungguhan — lewat Decision yang sama
 * dan diterapkan oleh `applyDecision()`, dengan actor 'Sistem' dan
 * origin 'sim' di log event. Tidak ada jalur belakang yang menyentuh state
 * tanpa meninggalkan jejak.
 *
 * Aturan:
 *  - drum jalan → sisa waktu berkurang tiap tick;
 *  - siklus selesai → naik tahap bila drum yang sama masih melayani tahap
 *    berikutnya, atau dilepas dan muat ke drum jenis berikut bila kosong;
 *  - tahap tanpa drum (0, 1, 7) → naik setelah melewati target menitnya;
 *  - tahap yang butuh drum tapi semua penuh → menunggu (tidak dipaksa).
 */

const SIM_ACTOR = 'Sistem (sim)';

export interface SimHandle {
  stop(): void;
  tick(nowMs?: number): Promise<void>;
}

const TEMP_OF: Record<number, number> = { 2: 40, 3: 40, 4: 40, 5: 68, 6: 120 };

function loadPct(order: Order, machine: Machine): number {
  const cap = Math.max(1, machineCap(machine));
  return Math.max(8, Math.min(99, Math.round((order.weight / cap) * 100)));
}

function runEffect(machine: Machine, order: Order, stage: number): MachineEffect {
  const load = loadPct(order, machine);
  return {
    machineId: machine.id,
    ticket: order.code,
    load,
    state: stage === 5 ? 'hot' : stage === 6 ? 'vent' : 'run',
    rpm: stage === 6 ? 0 : 6 + (load > 70 ? 3 : 0),
    left: STAGE_MIN[stage] ?? 30,
    stage,
    temp: TEMP_OF[stage] ?? 40,
  };
}

function idleEffect(machine: Machine): MachineEffect {
  return {
    machineId: machine.id, ticket: null, load: 0, state: 'idle',
    rpm: 0, left: 0, stage: machine.stage, temp: 26,
  };
}

function decision(action: Decision['action'], order: Order, to: number, opts: {
  machine?: string | null;
  effects?: MachineEffect[];
  assignCourier?: boolean;
  completes?: boolean;
  freesOrderMachine?: boolean;
}): Decision {
  return {
    ok: true,
    action,
    from: order.stage,
    to,
    machine: opts.machine ?? null,
    effects: opts.effects ?? [],
    assignCourier: opts.assignCourier ?? false,
    completes: opts.completes ?? false,
    freesOrderMachine: opts.freesOrderMachine ?? false,
    note: '',
    warning: null,
  };
}

/** Drum kosong dari jenis yang diminta yang muat, paling ringan bebannya. */
function freeOf(machines: Machine[], kind: string, weight: number): Machine | null {
  const fits = machines
    .filter((m) => m.kind === kind && isFree(m) && machineCap(m) >= weight)
    .sort((a, b2) => a.load - b2.load || a.left - b2.left);
  return fits[0] ?? null;
}

function releaseEffect(machines: Machine[], order: Order): MachineEffect | null {
  const holding = machines.find((m) => m.ticket === order.code);
  return holding ? idleEffect(holding) : null;
}

export function startSim(db: Db, broadcast: ((msg: Record<string, unknown>) => void) | undefined, tickMs: number): SimHandle {
  let running = false;
  const interval = setInterval(() => { void tick(); }, tickMs);

  async function tick(nowMs: number = Date.now()): Promise<void> {
    if (running) return;
    running = true;
    try {
      await runTick(nowMs);
    } finally {
      running = false;
    }
  }

  async function runTick(nowMs: number): Promise<void> {
    let changed = false;
    const machines = await R.listMachines(db);
    const orders = (await R.listOrders(db)).filter((o) => !o.cancelled);
    const delta = Math.max(0, tickMs / 60_000);

    /* 1. Drum menghitung mundur. */
    for (const m of machines) {
      if (m.state === 'idle' || m.left <= 0) continue;
      const next = Math.max(0, Math.round((m.left - delta) * 10) / 10);
      await R.patchMachine(db, m.id, { left: next, temp: Math.round((m.temp + (Math.random() - 0.5) * 0.6) * 10) / 10 });
      m.left = next;
      changed = true;
    }

    /* 2. Siklus drum yang selesai. */
    for (const m of machines) {
      if (m.state === 'idle' || m.left > 0 || !m.ticket || m.ticket === '—') continue;
      const order = await R.getOrder(db, m.ticket);
      if (!order || order.stage >= LAST_STAGE) {
        await R.applyMachineEffect(db, idleEffect(m));
        changed = true;
        continue;
      }
      const next = order.stage + 1;
      const needed = STAGE_MACHINE[next];

      if (needed && needed === m.kind && machineCap(m) >= order.weight) {
        /* Drum yang sama melayani tahap berikutnya (2→3→4 di drum cuci). */
        await applyDecision(db, order, decision('tahap', order, next, {
          machine: m.id, effects: [runEffect(m, order, next)],
        }), { actor: SIM_ACTOR, origin: 'sim', atMs: nowMs });
        changed = true;
        continue;
      }

      /* Drum harus dilepas; muat ke drum jenis berikut bila kosong. */
      const effects: MachineEffect[] = [idleEffect(m)];
      let to = order.stage;
      if (needed) {
        const target = freeOf(machines, kindNeeded(order, next), order.weight);
        if (target) {
          effects.push(runEffect(target, order, next));
          to = next;
        }
      } else {
        to = next;
      }
      await applyDecision(db, order, decision(to > order.stage ? 'muat' : 'lepas', order, to, {
        machine: effects[1]?.machineId ?? null,
        effects,
        completes: to === LAST_STAGE,
        freesOrderMachine: effects.length === 1,
      }), { actor: SIM_ACTOR, origin: 'sim', atMs: nowMs });
      changed = true;
    }

    /* 3. Pesanan tanpa drum: naik tahap bila waktunya, muat bila drum kosong. */
    for (const o of orders) {
      if (o.stage >= LAST_STAGE) continue;
      const held = machines.some((m) => m.ticket === o.code);
      if (held) continue;

      const needHere = STAGE_MACHINE[o.stage];
      if (needHere) {
        const kind = kindNeeded(o, o.stage);
        const target = freeOf(machines, kind, o.weight);
        if (!target) continue;
        await applyDecision(db, o, decision('muat', o, o.stage, {
          machine: target.id, effects: [runEffect(target, o, o.stage)],
        }), { actor: SIM_ACTOR, origin: 'sim', atMs: nowMs });
        changed = true;
        continue;
      }

      const dwell = o.stageAt ? nowMs - o.stageAt : 0;
      const target = (STAGE_MIN[o.stage] ?? 30) * 60_000;
      if (dwell < target) continue;

      const next = o.stage + 1;
      const needNext = STAGE_MACHINE[next];
      if (needNext) {
        const targetM = freeOf(machines, kindNeeded(o, next), o.weight);
        if (!targetM) continue;
        await applyDecision(db, o, decision('muat', o, next, {
          machine: targetM.id, effects: [runEffect(targetM, o, next)],
        }), { actor: SIM_ACTOR, origin: 'sim', atMs: nowMs });
      } else {
        const rel = releaseEffect(machines, o);
        await applyDecision(db, o, decision(next === LAST_STAGE ? 'selesai' : 'tahap', o, next, {
          effects: rel ? [rel] : [],
          assignCourier: next === LAST_STAGE && o.mode === 'delivery' && o.courier === '—',
          completes: next === LAST_STAGE,
          freesOrderMachine: Boolean(rel),
        }), { actor: SIM_ACTOR, origin: 'sim', atMs: nowMs });
      }
      changed = true;
    }

    if (changed && broadcast) {
      broadcast({
        type: 'floor', at: nowMs,
        machines: await R.listMachines(db),
        orders: (await R.listOrders(db)).map((o) => ({
          code: o.code, customerId: o.customerId, stage: o.stage, machine: o.machine, collected: o.collected,
        })),
        events: await R.listEvents(db, { limit: 12 }),
      });
    }
  }

  return {
    stop() { clearInterval(interval); },
    tick,
  };
}
