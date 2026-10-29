// The balancing JSON must match the GDD tables and fit together.
import { describe, expect, it } from 'vitest';
import { CARS, CHARACTERS, DAILY, LOCATION1, PADS, STAGES } from '../src/core/config';

const modelFiles = Object.keys(import.meta.glob('../public/models/**/*.glb')).map((f) => f.replace('../public/', ''));

const padIds = PADS.map((p) => p.id);

describe('pads.json', () => {
  it('has the 22 town-1 pads in order, from the free bay to the truck', () => {
    expect(PADS).toHaveLength(22);
    expect(PADS[0]).toMatchObject({ id: 'bay1', cost: 0 });
    expect(PADS.at(-1)).toMatchObject({ id: 'truck', cost: 25000, effects: { endOfContent: true } });
  });

  it('the fuel pump comes in the first ten minutes, before the first washer', () => {
    const at = (id: string) => padIds.indexOf(id);
    expect(PADS[at('pump1')]!.targetMinute).toBeLessThan(10);
    expect(at('pump1')).toBeLessThan(at('washer'));
    expect(at('attendant')).toBeGreaterThan(at('pump1'));
    expect(at('pump2')).toBeGreaterThan(at('pump1'));
  });

  it('costs and target times only go up', () => {
    for (let i = 1; i < PADS.length; i++) {
      expect(PADS[i]!.cost).toBeGreaterThan(PADS[i - 1]!.cost);
      expect(PADS[i]!.targetMinute).toBeGreaterThan(PADS[i - 1]!.targetMinute);
    }
  });

  it('has unique ids and known stages', () => {
    expect(new Set(padIds).size).toBe(padIds.length);
    for (const pad of PADS) {
      if (pad.effects.stage) expect(STAGES.map((s) => s.id)).toContain(pad.effects.stage);
    }
  });
});

describe('cars.json', () => {
  it('has the 8 GDD car types', () => {
    expect(CARS.map((c) => c.id)).toEqual(['hatchback', 'sedan', 'pickup', 'suv', 'minivan', 'sports', 'monster', 'vip']);
  });

  it('each car is unlocked by a real pad', () => {
    for (const car of CARS) {
      if (car.unlockedBy !== null) expect(padIds).toContain(car.unlockedBy);
    }
  });

  it('the first car arrives from the start', () => {
    expect(CARS.find((c) => c.unlockedBy === 'bay1')?.id).toBe('hatchback');
  });
});

describe('location1.json', () => {
  it('places pads that exist, starting with the free first bay', () => {
    for (const id of Object.keys(LOCATION1.pads)) expect(padIds).toContain(id);
    expect(LOCATION1.pads.bay1).toBeDefined();
  });

  it('every pump has its island and the forecourt a cash pile', () => {
    for (const pad of PADS) if (pad.effects.pump) expect(LOCATION1.buildAt[pad.id], pad.id).toBeDefined();
    expect(LOCATION1.piles.fuel).toBeDefined();
  });

  it('has a cash pile for every bay and the register', () => {
    for (const pad of PADS) {
      if (pad.effects.bay && LOCATION1.pads[pad.id]) expect(LOCATION1.piles[pad.effects.bay]).toBeDefined();
    }
    expect(LOCATION1.piles.register).toBeDefined();
  });

  it('keeps pads apart so the player never stands on two', () => {
    const spots = Object.entries(LOCATION1.pads).filter(([id]) => !id.startsWith('bay'));
    for (let i = 0; i < spots.length; i++)
      for (let j = i + 1; j < spots.length; j++) {
        const [, a] = spots[i]!;
        const [, b] = spots[j]!;
        expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z))).toBeGreaterThan(2.5);
      }
  });
});

describe('models', () => {
  it('every car and character in the data has a model file', () => {
    for (const car of CARS) expect(modelFiles).toContain(`models/cars/${car.model}.glb`);
    for (const car of DAILY.carOfDay.cars) expect(modelFiles).toContain(`models/cars/${car.model}.glb`);
    for (const person of [CHARACTERS.player, ...Object.values(CHARACTERS.staff)]) {
      expect(modelFiles).toContain(`models/people/character-${person}.glb`);
    }
  });
});
