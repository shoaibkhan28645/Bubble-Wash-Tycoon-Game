import { PADS, stageById, type CarDef, type Dirt, type StageDef } from '../core/config';

/** Price of one wash: base pay × (1 + stage bonuses) × quality. */
export function carPay(car: CarDef, stages: readonly StageDef[], quality = 1): number {
  const bonus = stages.reduce((sum, stage) => sum + stage.payBonus, 0);
  return Math.round(car.basePay * (car.payMultiplier ?? 1) * (1 + bonus) * quality);
}

/** Seconds of hand scrubbing a car needs. */
export function washSeconds(
  dirt: Dirt,
  stages: readonly StageDef[],
  wash: { baseSeconds: number; minSeconds: number; dirtMultiplier: Record<Dirt, number> },
): number {
  const reduction = stages.reduce((sum, stage) => sum + stage.timeReduction, 0);
  const seconds = wash.baseSeconds * wash.dirtMultiplier[dirt] * Math.max(0, 1 - reduction);
  return Math.max(wash.minSeconds, seconds);
}

/**
 * Cash moved into an unlock pad this frame. Drains at a rate that fills any
 * pad in about `fillSeconds`, never faster than the player can pay.
 */
export function padDrain(
  cost: number,
  paid: number,
  cash: number,
  dt: number,
  pads: { fillSeconds: number; minDrainPerSecond: number },
): number {
  const rate = Math.max(cost / pads.fillSeconds, pads.minDrainPerSecond);
  return Math.max(0, Math.min(cost - paid, cash, rate * dt));
}

/** Stages every car gets, from the pads that have been built. */
export function builtStages(unlocked: readonly string[]): StageDef[] {
  const stages: StageDef[] = [];
  for (const pad of PADS) {
    const id = pad.effects.stage;
    const stage = id && unlocked.includes(pad.id) ? stageById(id) : undefined;
    if (stage) stages.push(stage);
  }
  return stages;
}

const UNITS: [number, string][] = [
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
];

/** $999, $1.2K, $15K, $3.4M. Rounds down so the player never sees more than they have. */
export function formatCash(amount: number): string {
  const value = Math.max(0, Math.floor(amount));
  for (const [size, unit] of UNITS) {
    if (value >= size) {
      const scaled = value / size;
      const digits = scaled < 10 ? 1 : 0;
      const factor = 10 ** digits;
      return `$${(Math.floor(scaled * factor) / factor).toFixed(digits).replace(/\.0$/, '')}${unit}`;
    }
  }
  return `$${value}`;
}
