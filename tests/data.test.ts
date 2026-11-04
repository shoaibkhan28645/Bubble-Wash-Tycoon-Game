// The balancing JSON must match the GDD tables and fit together.
import { describe, expect, it } from 'vitest';
import { CARS, CHARACTERS, CONTRACTS, DAILY, STAGES, TUNING, padById } from '../src/core/config';
import { ROADSIDE } from '../src/core/towns';
import { t, type StringKey } from '../src/ui/strings';

/** The Blender car files as text (their JSON part names every model). */
const carFiles = import.meta.glob<string>('../public/models/cars/*.glb', { query: '?raw', import: 'default', eager: true });
const modelFiles = Object.keys(import.meta.glob('../public/models/**/*.glb')).map((f) => f.replace('../public/', ''));

const padIds = ROADSIDE.pads.map((p) => p.id);

describe('roadside pads.json', () => {
  it('has the 26 town-1 pads in order, from the free bay to the truck', () => {
    expect(ROADSIDE.pads).toHaveLength(26);
    expect(ROADSIDE.pads[0]).toMatchObject({ id: 'bay1', cost: 0 });
    expect(ROADSIDE.pads.at(-1)).toMatchObject({ id: 'truck', cost: 25000, effects: { endOfContent: true } });
  });

  it('the fuel pump comes in the first ten minutes, before the first washer', () => {
    const at = (id: string) => padIds.indexOf(id);
    expect(ROADSIDE.pads[at('pump1')]!.targetMinute).toBeLessThan(10);
    expect(at('pump1')).toBeLessThan(at('washer'));
    expect(at('attendant')).toBeGreaterThan(at('pump1'));
    expect(at('pump2')).toBeGreaterThan(at('pump1'));
  });

  it('costs and target times only go up', () => {
    for (let i = 1; i < ROADSIDE.pads.length; i++) {
      expect(ROADSIDE.pads[i]!.cost).toBeGreaterThan(ROADSIDE.pads[i - 1]!.cost);
      expect(ROADSIDE.pads[i]!.targetMinute).toBeGreaterThan(ROADSIDE.pads[i - 1]!.targetMinute);
    }
  });

  it('has unique ids and known stages', () => {
    expect(new Set(padIds).size).toBe(padIds.length);
    for (const pad of ROADSIDE.pads) {
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

describe('roadside layout.json', () => {
  it('places pads that exist, starting with the free first bay', () => {
    for (const id of Object.keys(ROADSIDE.layout.pads)) expect(padIds).toContain(id);
    expect(ROADSIDE.layout.pads.bay1).toBeDefined();
  });

  it('every pump has its island and the forecourt a cash pile', () => {
    for (const pad of ROADSIDE.pads) if (pad.effects.pump) expect(ROADSIDE.layout.buildAt[pad.id], pad.id).toBeDefined();
    expect(ROADSIDE.layout.piles.fuel).toBeDefined();
  });

  it('has a cash pile for every bay and the register', () => {
    for (const pad of ROADSIDE.pads) {
      if (pad.effects.bay && ROADSIDE.layout.pads[pad.id]) expect(ROADSIDE.layout.piles[pad.effects.bay]).toBeDefined();
    }
    expect(ROADSIDE.layout.piles.register).toBeDefined();
  });

  it("puts the walk's edges on the staff grid's half-metre cells, so work spots stay in free cells", () => {
    for (const edge of [ROADSIDE.layout.walk.minX, ROADSIDE.layout.walk.minZ]) expect(Number.isInteger(edge * 2)).toBe(true);
  });

  it('keeps pads apart so the player never stands on two', () => {
    const spots = Object.entries(ROADSIDE.layout.pads).filter(([id]) => !id.startsWith('bay'));
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
    // The Blender car files, and every car's model in one of them (by node name).
    for (const file of ['cars-small', 'cars-family', 'cars-large', 'cars-big', 'cars-monster']) expect(modelFiles).toContain(`models/cars/${file}.glb`);
    for (const car of DAILY.carOfDay.cars) expect(modelFiles).toContain(`models/cars/special-${car.model}.glb`);
    const cars = Object.values(carFiles).join('');
    for (const car of [...CARS, ...DAILY.carOfDay.cars]) expect(cars.includes(`"name":"${car.model}"`), car.id).toBe(true);
    for (const person of new Set([CHARACTERS.player, ...Object.values(CHARACTERS.staff), ...CHARACTERS.shoppers, ...TUNING.streetLife.characters])) {
      expect(modelFiles).toContain(`models/people/character-${person}.glb`);
    }
  });
});

describe('contracts.json and goals.json', () => {
  it('every contract needs a real pad and counts something the game counts, with text for it', () => {
    const tasks = ['wash', 'fuel', 'snack', 'combo', 'wax', 'detail', ...CARS.filter((c) => !c.vip).map((c) => `wash:${c.id}`)];
    for (const def of CONTRACTS.kinds) {
      if (def.requires) expect(padIds).toContain(def.requires);
      expect(tasks).toContain(def.task);
      expect(t(`task_${def.task}` as StringKey, { n: 1 })).not.toContain('task_');
      expect(!!def.cash !== !!def.gems, def.id).toBe(true);
      expect(def.minutes).toBeGreaterThanOrEqual(30);
      expect(def.minutes).toBeLessThanOrEqual(240);
    }
    expect(new Set(CONTRACTS.kinds.map((d) => d.id)).size).toBe(CONTRACTS.kinds.length);
  });

  it('a car type is only asked for once it can arrive', () => {
    for (const def of CONTRACTS.kinds) {
      const car = CARS.find((c) => def.task === `wash:${c.id}`);
      if (!car?.unlockedBy || car.unlockedBy === 'bay1') continue;
      expect(padIds.indexOf(def.requires ?? 'bay1'), def.id).toBeGreaterThanOrEqual(padIds.indexOf(car.unlockedBy));
    }
  });

  it('the board can always fill its slots with contracts that need no more than the board', () => {
    const board = padIds.indexOf('board');
    const early = CONTRACTS.kinds.filter((d) => !d.requires || padIds.indexOf(d.requires) < board);
    expect(early.length).toBeGreaterThanOrEqual(CONTRACTS.slots);
  });

  it('has five to eight town goals, each with text, on real pads and counts', () => {
    expect(ROADSIDE.goals.goals.length).toBeGreaterThanOrEqual(5);
    expect(ROADSIDE.goals.goals.length).toBeLessThanOrEqual(8);
    for (const goal of ROADSIDE.goals.goals) {
      expect(t(`goal_${goal.id}` as StringKey)).not.toContain('goal_');
      if (goal.built) expect(padIds).toContain(goal.built);
      if (goal.count) expect(['combo', 'contract']).toContain(goal.count);
    }
    // The last goal is the landmark, and the truck waits for every goal.
    expect(ROADSIDE.goals.goals.at(-1)?.built).toBe('landmark');
    expect(ROADSIDE.pads.find((p) => p.id === 'truck')?.afterGoals).toBe(true);
    expect(padById('landmark')?.buildSeconds).toBeGreaterThanOrEqual(4 * 3600);
    expect(padById('landmark')?.buildSeconds).toBeLessThanOrEqual(8 * 3600);
    expect(ROADSIDE.layout.sites.landmark).toBeDefined();
  });
});
