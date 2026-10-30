// The balancing JSON must match the GDD tables and fit together.
import { describe, expect, it } from 'vitest';
import { CARS, CHARACTERS, CONTRACTS, DAILY, GOALS, LOCATION1, PADS, STAGES, TUNING, padById } from '../src/core/config';
import { t, type StringKey } from '../src/ui/strings';

/** The Blender car files as text (their JSON part names every model). */
const carFiles = import.meta.glob<string>('../public/models/cars/*.glb', { query: '?raw', import: 'default', eager: true });
const peopleFiles = import.meta.glob<string>('../public/models/people/*.glb', { query: '?raw', import: 'default', eager: true });
const modelFiles = Object.keys(import.meta.glob('../public/models/**/*.glb')).map((f) => f.replace('../public/', ''));

const padIds = PADS.map((p) => p.id);

describe('pads.json', () => {
  it('has the 26 town-1 pads in order, from the free bay to the truck', () => {
    expect(PADS).toHaveLength(26);
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

  it("puts the walk's edges on the staff grid's half-metre cells, so work spots stay in free cells", () => {
    for (const edge of [LOCATION1.walk.minX, LOCATION1.walk.minZ]) expect(Number.isInteger(edge * 2)).toBe(true);
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
    // The Blender car files, and every car's model in one of them (by node name).
    for (const file of ['cars-small', 'cars-large', 'cars-special']) expect(modelFiles).toContain(`models/cars/${file}.glb`);
    const cars = Object.values(carFiles).join('');
    for (const car of [...CARS, ...DAILY.carOfDay.cars]) expect(cars.includes(`"name":"${car.model}"`), car.id).toBe(true);
    // Every person in the data is in a people file (by node name), and every file is there.
    const files = CHARACTERS.files as Record<string, string[]>;
    const listed = Object.values(files).flat();
    for (const person of [CHARACTERS.player, ...Object.values(CHARACTERS.staff), ...CHARACTERS.shoppers, ...TUNING.streetLife.characters]) {
      expect(listed, person).toContain(person);
    }
    for (const [file, people] of Object.entries(files)) {
      expect(modelFiles).toContain(`models/people/${file}.glb`);
      for (const person of people) expect(peopleFiles[`../public/models/people/${file}.glb`]!.includes(`"name":"person-${person}"`), person).toBe(true);
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
    expect(GOALS.goals.length).toBeGreaterThanOrEqual(5);
    expect(GOALS.goals.length).toBeLessThanOrEqual(8);
    for (const goal of GOALS.goals) {
      expect(t(`goal_${goal.id}` as StringKey)).not.toContain('goal_');
      if (goal.built) expect(padIds).toContain(goal.built);
      if (goal.count) expect(['combo', 'contract']).toContain(goal.count);
    }
    // The last goal is the landmark, and the truck waits for every goal.
    expect(GOALS.goals.at(-1)?.built).toBe('landmark');
    expect(PADS.find((p) => p.id === 'truck')?.afterGoals).toBe(true);
    expect(padById('landmark')?.buildSeconds).toBeGreaterThanOrEqual(4 * 3600);
    expect(padById('landmark')?.buildSeconds).toBeLessThanOrEqual(8 * 3600);
    expect(LOCATION1.sites.landmark).toBeDefined();
  });
});
