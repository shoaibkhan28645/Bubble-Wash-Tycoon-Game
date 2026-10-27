import { describe, expect, it } from 'vitest';
import { CARS, STAGES, TUNING, UPGRADES, type CarDef } from '../src/core/config';
import {
  builtStages,
  carPay,
  formatCash,
  levelFactor,
  levelStep,
  nextStars,
  padDrain,
  queueSpots,
  spawnSeconds,
  tipFor,
  upgradeCost,
  washSeconds,
} from '../src/systems/economy';

const car = (id: string): CarDef => CARS.find((c) => c.id === id)!;
const stage = (id: string) => STAGES.find((s) => s.id === id)!;

describe('carPay = base pay × (1 + stage bonuses) × quality', () => {
  it('pays base pay with no extra stages', () => {
    expect(carPay(car('hatchback'), [])).toBe(10);
  });

  it('adds stage bonuses together', () => {
    // Foam +50%, dry +30%, wax +40% → ×2.2
    expect(carPay(car('hatchback'), [stage('foam'), stage('dry'), stage('wax')])).toBe(22);
    expect(carPay(car('pickup'), [stage('foam')])).toBe(38); // 25 × 1.5 = 37.5, rounded
  });

  it('pre-rinse speeds washes up but adds no pay', () => {
    expect(carPay(car('sedan'), [stage('prerinse')])).toBe(15);
  });

  it('applies quality and the VIP multiplier', () => {
    expect(carPay(car('sedan'), [], 1.15)).toBe(17);
    expect(carPay({ ...car('vip'), basePay: 15 }, [])).toBe(75);
  });
});

describe('washSeconds', () => {
  it('scales with dirt and the hose', () => {
    expect(washSeconds('dusty', [], TUNING.wash)).toBe(TUNING.wash.baseSeconds);
    expect(washSeconds('muddy', [], TUNING.wash)).toBeCloseTo(TUNING.wash.baseSeconds * 1.6);
    expect(washSeconds('dusty', [stage('prerinse')], TUNING.wash)).toBeCloseTo(TUNING.wash.baseSeconds * 0.7);
  });

  it('never drops below the minimum', () => {
    const fast = { ...stage('prerinse'), timeReduction: 5 };
    expect(washSeconds('dusty', [fast], TUNING.wash)).toBe(TUNING.wash.minSeconds);
  });
});

describe('builtStages', () => {
  it('follows the pads that are built', () => {
    expect(builtStages(['bay1'])).toEqual([]);
    expect(builtStages(['bay1', 'hose', 'soap']).map((s) => s.id)).toEqual(['prerinse', 'foam']);
    const all = ['bay1', 'hose', 'soap', 'dryer', 'wax'];
    expect(builtStages(all, 'bay').map((s) => s.id)).toEqual(['prerinse', 'foam']);
    expect(builtStages(all, 'dryer').map((s) => s.id)).toEqual(['dry']);
  });
});

describe('padDrain', () => {
  const pads = { fillSeconds: 2, minDrainPerSecond: 20 };

  it('fills any pad in about two seconds', () => {
    let paid = 0;
    let time = 0;
    while (paid < 400 && time < 10) {
      paid += padDrain(400, paid, 10_000, 1 / 60, pads);
      time += 1 / 60;
    }
    expect(time).toBeCloseTo(2, 1);
  });

  it('never takes more than the player has or the pad needs', () => {
    expect(padDrain(400, 0, 15, 1, pads)).toBe(15);
    expect(padDrain(400, 395, 1000, 1, pads)).toBe(5);
    expect(padDrain(400, 0, 0, 1, pads)).toBe(0);
  });

  it('cheap pads still drain at a visible speed', () => {
    expect(padDrain(10, 0, 100, 0.1, pads)).toBeCloseTo(2);
  });
});

describe('formatCash', () => {
  it.each([
    [0, '$0'],
    [999, '$999'],
    [1000, '$1K'],
    [1250, '$1.2K'],
    [15_900, '$15K'],
    [3_450_000, '$3.4M'],
    [2e9, '$2B'],
    [-5, '$0'],
  ])('%d → %s', (amount, text) => {
    expect(formatCash(amount)).toBe(text);
  });
});

describe('upgrades (1.15× cost curve)', () => {
  const speed = UPGRADES.kinds.speed!;

  it('each level costs 15% more than the last', () => {
    const costs = [0, 1, 2, 3].map((level) => upgradeCost(speed, 1, level, UPGRADES.growth));
    expect(costs[0]).toBe(speed.base);
    for (let i = 1; i < costs.length; i++) expect(costs[i]! / costs[i - 1]!).toBeCloseTo(1.15, 1);
    expect(upgradeCost(speed, 1, 10, UPGRADES.growth)).toBe(Math.round(speed.base * 1.15 ** 10));
  });

  it('later stations cost more', () => {
    const scale = UPGRADES.costScale;
    expect(upgradeCost(speed, scale.wax!, 0, 1.15)).toBeGreaterThan(upgradeCost(speed, scale.bay1!, 0, 1.15));
  });

  it('speed takes 10% off per level, compounding (never reaches zero)', () => {
    expect(levelFactor(speed, 0)).toBe(1);
    expect(levelFactor(speed, 1)).toBeCloseTo(0.9);
    expect(levelFactor(speed, 10)).toBeCloseTo(0.9 ** 10);
    expect(levelFactor(speed, 10)).toBeGreaterThan(0.3);
  });

  it('quality adds 15% pay per level, compounding', () => {
    expect(levelFactor(UPGRADES.kinds.quality, 2)).toBeCloseTo(1.3225);
  });

  it('queue adds a waiting spot every 3 levels', () => {
    const queue = UPGRADES.kinds.queue;
    expect([0, 2, 3, 5, 6, 9].map((l) => queueSpots(2, queue, l))).toEqual([2, 2, 3, 3, 4, 5]);
  });

  it('carry stack goes from 3 to 15', () => {
    const carry = UPGRADES.kinds.carry!;
    expect(TUNING.supplies.carryBase + levelStep(carry, 0)).toBe(3);
    expect(TUNING.supplies.carryBase + levelStep(carry, carry.max)).toBe(15);
  });

  it('every panel entry names a known upgrade kind and a priced target', () => {
    for (const keys of Object.values(UPGRADES.panels)) {
      for (const key of keys) {
        const [target, kind] = key.split('.');
        expect(UPGRADES.kinds[kind!]).toBeDefined();
        expect(UPGRADES.costScale[target!]).toBeGreaterThan(0);
      }
    }
  });
});

describe('customers', () => {
  const rules = TUNING.customers;

  it('tip 20% only with more than half the patience left', () => {
    expect(tipFor(50, 0.8, rules)).toBe(10);
    expect(tipFor(50, 0.5, rules)).toBe(0);
    expect(tipFor(50, 0.1, rules)).toBe(0);
  });

  it('stars rise with happy customers, fall with angry ones, and stay within 1–5', () => {
    const s = TUNING.stars;
    expect(nextStars(3, 'happy', s)).toBeGreaterThan(3);
    expect(nextStars(3, 'angry', s)).toBeLessThan(3);
    expect(nextStars(5, 'happy', s)).toBe(5);
    expect(nextStars(1, 'angry', s)).toBe(1);
  });

  it('more stars and the roadside sign bring cars more often', () => {
    const base = TUNING.cars.spawnSeconds;
    const per = TUNING.stars.arrivalPerStar;
    expect(spawnSeconds(base, 3, per)).toBe(base);
    expect(spawnSeconds(base, 5, per)).toBeLessThan(base);
    expect(spawnSeconds(base, 1, per)).toBeGreaterThan(base);
    expect(spawnSeconds(base, 3, per, 0.25)).toBeCloseTo(base / 1.25);
  });
});
