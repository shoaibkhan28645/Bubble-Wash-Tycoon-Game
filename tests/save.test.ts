import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/gameState';
import { MIGRATIONS, SAVE_VERSION, migrate, parseSave, serialize, type Migration } from '../src/core/migrate';

// Every save version ever shipped gets a fixture here, and must keep loading.
const fixtures = import.meta.glob<string>('./fixtures/save-v*.json', {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('parseSave', () => {
  it('starts a new game when nothing is saved', () => {
    expect(parseSave('')).toEqual({ state: newGame(), status: 'new' });
  });

  it('round-trips a saved game', () => {
    const state = {
      ...newGame(),
      cash: 1234.5,
      gems: 7,
      unlocked: ['bay1', 'hose'],
      levels: { 'bay1.speed': 2 },
      staff: ['washer'],
      padPaid: { register: 40 },
      piles: { bay1: 25 },
      savedAt: 99,
    };
    expect(parseSave(serialize(state))).toEqual({ state, status: 'loaded' });
  });

  it('starts fresh on unreadable data instead of crashing', () => {
    for (const text of ['{not json', '42', '"text"', 'null', '[1,2]']) {
      expect(parseSave(text)).toEqual({ state: newGame(), status: 'corrupt' });
    }
  });

  it('repairs bad fields one by one and keeps the good ones', () => {
    const text = JSON.stringify({
      version: SAVE_VERSION,
      cash: -5,
      gems: 'lots',
      location: 0,
      unlocked: ['bay1', 3, 'bay1', 'hose'],
      levels: { 'bay1.speed': 2, broken: -1, half: 1.5, word: 'x' },
      staff: 'washer',
      padPaid: { hose: 20, bad: -3, word: 'x' },
      piles: [5],
      savedAt: Number.NaN,
    });
    expect(parseSave(text).state).toEqual({
      cash: 0,
      gems: 0,
      location: 1,
      unlocked: ['bay1', 'hose'],
      levels: { 'bay1.speed': 2 },
      staff: [],
      padPaid: { hose: 20 },
      piles: {},
      savedAt: 0,
    });
  });

  it('saves only ids, levels and counts, versioned', () => {
    const saved = JSON.parse(serialize(newGame()));
    expect(saved.version).toBe(SAVE_VERSION);
    expect(Object.keys(saved).sort()).toEqual(['cash', 'gems', 'levels', 'location', 'padPaid', 'piles', 'savedAt', 'staff', 'unlocked', 'version']);
  });

  it('keeps a full late-game save well under 50 KiB', () => {
    const state = newGame();
    for (let i = 0; i < 200; i++) {
      state.unlocked.push(`location${i % 6}.pad${i}`);
      state.levels[`location${i % 6}.station${i}.quality`] = 10;
    }
    state.cash = 1e15;
    expect(serialize(state).length).toBeLessThan(50 * 1024);
  });
});

describe('old saves', () => {
  it('has a fixture for every version up to the current one', () => {
    for (let v = 1; v <= SAVE_VERSION; v++) {
      expect(Object.keys(fixtures)).toContain(`./fixtures/save-v${v}.json`);
    }
  });

  it.each(Object.entries(fixtures))('%s still loads', (_name, text) => {
    const { state, status } = parseSave(text);
    expect(status).toBe('loaded');
    expect(state.unlocked.length).toBeGreaterThan(0);
    expect(state.cash).toBeGreaterThan(0);
    expect(state.padPaid).toBeTypeOf('object');
    expect(state.piles).toBeTypeOf('object');
  });

  it('upgrades a v1 save to v2 without losing progress', () => {
    const { state } = parseSave(fixtures['./fixtures/save-v1.json']!);
    expect(state).toMatchObject({ cash: 4250, gems: 30, unlocked: ['bay1', 'hose', 'register', 'bay2', 'soap'], padPaid: {}, piles: {} });
  });

  it('has a migration from every older version', () => {
    for (let v = 1; v < SAVE_VERSION; v++) expect(MIGRATIONS[v]).toBeTypeOf('function');
  });
});

describe('migrate', () => {
  // A pretend history: v1 called cash "money"; v2 added gems.
  const history: Record<number, Migration> = {
    1: ({ money, ...rest }) => ({ ...rest, cash: money }),
    2: (save) => ({ ...save, gems: 5 }),
  };

  it('runs every step from an old version up to the target', () => {
    const state = migrate({ version: 1, money: 300, unlocked: ['bay1'] }, history, 3);
    expect(state.cash).toBe(300);
    expect(state.gems).toBe(5);
    expect(state.unlocked).toEqual(['bay1']);
  });

  it('only runs the steps it needs', () => {
    expect(migrate({ version: 2, cash: 10 }, history, 3)).toMatchObject({ cash: 10, gems: 5 });
  });

  it('treats a save without a version as version 1', () => {
    expect(migrate({ money: 8 }, history, 3).cash).toBe(8);
  });

  it('keeps known fields from a newer version', () => {
    expect(migrate({ version: 99, cash: 50, futureThing: true }, history, 3).cash).toBe(50);
  });

  it('reports a missing step instead of losing the save', () => {
    const text = JSON.stringify({ version: 0, cash: 1 });
    expect(() => migrate({ version: 0 }, history, 3)).toThrow();
    // parseSave turns that into "failed", and boot then disables saving.
    expect(parseSave(text).status).toBe('failed');
  });
});
