import { describe, expect, it } from 'vitest';
import { CARS, STAGES, TUNING, type CarDef } from '../src/core/config';
import { builtStages, carPay, formatCash, padDrain, washSeconds } from '../src/systems/economy';

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
