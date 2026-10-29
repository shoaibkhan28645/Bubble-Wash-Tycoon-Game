import { PADS, TUNING, UPGRADES, stageById, type CarDef, type Dirt, type StageDef, type UpgradeKind } from '../core/config';
import { comboMultiplier, type Need } from './tickets';

/** Price of one wash: base pay × (1 + stage bonuses) × quality. */
export function carPay(car: CarDef, stages: readonly StageDef[], quality = 1): number {
  return ticketPay(car, stages, ['wash'], quality);
}

/**
 * What a car's ticket comes to: the wash (base pay with its stage bonuses)
 * plus fuel and a snack (each a share of base pay), times quality, times the
 * combo bonus for several needs served in one visit.
 */
export function ticketPay(car: CarDef, stages: readonly StageDef[], served: readonly Need[], quality = 1): number {
  const base = car.basePay * (car.payMultiplier ?? 1);
  const bonus = stages.reduce((sum, stage) => sum + stage.payBonus, 0);
  const wash = served.includes('wash') ? base * (1 + bonus) : 0;
  const fuel = served.includes('fuel') ? base * TUNING.fuel.payFactor : 0;
  const snack = served.includes('snack') ? base * TUNING.snack.payFactor : 0;
  return Math.round((wash + fuel + snack) * quality * comboMultiplier(served.length));
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

/** Built stages, optionally only those done at one kind of station. */
export function builtStages(unlocked: readonly string[], station?: StageDef['station']): StageDef[] {
  const stages: StageDef[] = [];
  for (const pad of PADS) {
    const id = pad.effects.stage;
    const stage = id && unlocked.includes(pad.id) ? stageById(id) : undefined;
    if (stage && (!station || stage.station === station)) stages.push(stage);
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

// ---- Upgrades ------------------------------------------------------------

/** Cost of buying the next level: base × target scale × growth^level (GDD: 1.15× per level). */
export function upgradeCost(kind: UpgradeKind, scale: number, level: number, growth: number): number {
  return Math.round(kind.base * scale * growth ** level);
}

/** Multiplier from a "factor" upgrade at a level, e.g. speed 0.9^L, quality 1.15^L. */
export function levelFactor(kind: UpgradeKind | undefined, level: number): number {
  return kind?.factor === undefined ? 1 : kind.factor ** level;
}

/** Amount added by a "step" upgrade at a level, e.g. carry +1 per level. */
export function levelStep(kind: UpgradeKind | undefined, level: number): number {
  return (kind?.step ?? 0) * level;
}

/** Waiting spots in a bay's line: the base plus one every N queue levels. */
export function queueSpots(base: number, kind: UpgradeKind | undefined, level: number): number {
  return base + (kind?.every ? Math.floor(level / kind.every) : 0);
}

// ---- Customers -----------------------------------------------------------

export type Outcome = 'happy' | 'okay' | 'angry';

/** GDD: cars served with more than half their patience left tip 20%. */
export function tipFor(pay: number, patienceLeft: number, rules: { tipThreshold: number; tipBonus: number }): number {
  return patienceLeft > rules.tipThreshold ? Math.round(pay * rules.tipBonus) : 0;
}

/** Star rating (1–5) moves up with happy customers and down with angry ones. */
export function nextStars(
  stars: number,
  outcome: Outcome,
  rules: { min: number; max: number; happy: number; okay: number; angry: number },
): number {
  return Math.min(rules.max, Math.max(rules.min, stars + rules[outcome]));
}

/** Seconds between new cars: faster with more stars (and the roadside sign later). */
export function spawnSeconds(base: number, stars: number, perStar: number, arrivalBonus = 0): number {
  const rate = Math.max(0.2, 1 + (stars - 3) * perStar) * (1 + arrivalBonus);
  return base / rate;
}

/** Seconds a station needs for one car at full work rate, with speed (and, by hand, scrub) upgrades. */
export function jobSeconds(
  stationId: string,
  kind: string,
  dirt: Dirt,
  state: { unlocked: readonly string[]; levels: Record<string, number> },
  byPlayer: boolean,
): number {
  const speed = levelFactor(UPGRADES.kinds.speed, state.levels[`${stationId}.speed`] ?? 0);
  if (kind === 'dryer' || kind === 'wax' || kind === 'garage' || kind === 'pump' || kind === 'counter') return TUNING.stations[kind].seconds * speed;
  const scrub = byPlayer ? levelFactor(UPGRADES.kinds.scrub, state.levels['player.scrub'] ?? 0) : 1;
  return washSeconds(dirt, builtStages(state.unlocked, 'bay'), TUNING.wash) * speed * scrub;
}
