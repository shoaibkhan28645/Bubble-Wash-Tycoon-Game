import { afterEach, describe, expect, it } from 'vitest';
import { padById, setTown, town, type PadDef } from '../src/core/config';
import { ROADSIDE, START_TOWN_ID, TOWN_IDS, loadTown, type TownDef } from '../src/core/towns';
import { newGame } from '../src/core/gameState';
import { allGoalsDone, goalsSummary } from '../src/systems/townGoals';

/** A second town with one free pad and no goals, standing on Town 1's map. */
const testPad: PadDef = { id: 'kiosk', name: 'Test kiosk', cost: 0, targetMinute: 0, adds: 'Nothing', effects: {} };
const TEST_TOWN: TownDef = { id: 'test', layout: ROADSIDE.layout, pads: [testPad], goals: { franchiseStars: 1, goals: [] } };

afterEach(() => setTown(ROADSIDE));

describe('towns', () => {
  it('starts in Dusty Roadside Lot, the first town of the journey', () => {
    expect(START_TOWN_ID).toBe('roadside');
    expect(TOWN_IDS[0]).toBe(START_TOWN_ID);
    expect(town()).toBe(ROADSIDE);
    expect(ROADSIDE.layout.name).toBe('Dusty Roadside Lot');
  });

  it('loads every listed town under its own id', async () => {
    for (const id of TOWN_IDS) expect((await loadTown(id)).id).toBe(id);
  });

  it('rejects an unknown town', async () => {
    await expect(loadTown('atlantis')).rejects.toThrow('Unknown town: atlantis');
  });

  it("switching towns switches the pads and goals every system reads", () => {
    const state = newGame();
    expect(padById('bay1')).toBeDefined();
    expect(allGoalsDone(state)).toBe(false);

    setTown(TEST_TOWN);
    expect(padById('bay1')).toBeUndefined();
    expect(padById('kiosk')).toBe(testPad);
    expect(goalsSummary(state)).toMatchObject({ done: 0, total: 0, next: null });
    expect(allGoalsDone(state)).toBe(true);

    setTown(ROADSIDE);
    expect(padById('kiosk')).toBeUndefined();
    expect(goalsSummary(state).total).toBe(ROADSIDE.goals.goals.length);
  });
});
