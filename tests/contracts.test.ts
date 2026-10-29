import { describe, expect, it } from 'vitest';
import { CONTRACTS, GOALS, PADS } from '../src/core/config';
import { newGame, type GameState } from '../src/core/gameState';
import { canDouble, claimContract, contractDef, countTask, dealContract, readyCount, refreshBoard, tasksFor } from '../src/systems/contracts';
import { allGoalsDone, checkGoals, claimGoal, goalsSummary } from '../src/systems/townGoals';

const MIN = 60_000;
const NOW = 1_800_000_000_000;
/** Always picks the first contract it can. */
const first = () => 0;

function lotWith(...ids: string[]): GameState {
  const state = newGame();
  state.unlocked = ['bay1', ...ids];
  return state;
}

describe('contracts board', () => {
  it('stays empty until the board is built, then fills every slot with different contracts', () => {
    const state = lotWith('bay2', 'soap');
    expect(refreshBoard(state, NOW, first)).toBe(false);
    expect(state.contracts.slots).toEqual([]);
    state.unlocked.push('board');
    expect(refreshBoard(state, NOW, first)).toBe(true);
    const kinds = state.contracts.slots.map((s) => s.kind);
    expect(kinds).toHaveLength(CONTRACTS.slots);
    expect(new Set(kinds).size).toBe(CONTRACTS.slots);
    expect(kinds.every((k) => k !== '')).toBe(true);
  });

  it('only deals contracts the lot can do', () => {
    const state = lotWith('bay2', 'board');
    for (let i = 0; i < 20; i++) {
      const c = dealContract(state, NOW, Math.random)!;
      const def = contractDef(c.kind)!;
      expect(def.requires === undefined || state.unlocked.includes(def.requires)).toBe(true);
    }
  });

  it('pays more cash on a bigger lot, and runs for its minutes', () => {
    const small = dealContract(lotWith('bay2', 'board'), NOW, first)!;
    const big = dealContract(lotWith(...PADS.slice(1, 20).map((p) => p.id)), NOW, first)!;
    expect(small.kind).toBe(big.kind);
    expect(big.cash).toBeGreaterThan(small.cash);
    expect(small.endsAt).toBe(NOW + contractDef(small.kind)!.minutes * MIN);
  });

  it('counts only its own task, and finishes at the goal', () => {
    const state = lotWith('board');
    refreshBoard(state, NOW, first);
    const slot = state.contracts.slots[0]!;
    const task = contractDef(slot.kind)!.task;
    expect(countTask(state, 'something-else', NOW)).toEqual([]);
    for (let i = 1; i < slot.goal; i++) expect(countTask(state, task, NOW)).toEqual([]);
    expect(countTask(state, task, NOW)).toEqual([0]);
    expect(slot.progress).toBe(slot.goal);
    // Finished: no more counting, and it waits for the player.
    expect(countTask(state, task, NOW)).toEqual([]);
    expect(readyCount(state)).toBe(1);
  });

  it('a contract that runs out unfinished leaves its slot empty, refilled a few minutes later', () => {
    const state = lotWith('bay2', 'soap', 'pump1', 'board');
    refreshBoard(state, NOW, first);
    const slot = state.contracts.slots[0]!;
    const late = slot.endsAt;
    expect(countTask(state, contractDef(slot.kind)!.task, late)).toEqual([]);
    refreshBoard(state, late, first);
    expect(state.contracts.slots[0]).toMatchObject({ kind: '', endsAt: late + CONTRACTS.refillMinutes * MIN });
    refreshBoard(state, late + CONTRACTS.refillMinutes * MIN, first);
    expect(state.contracts.slots[0]!.kind).not.toBe('');
  });

  it('a finished contract never runs out; claiming pays it, counts it, and empties the slot', () => {
    const state = lotWith('board');
    refreshBoard(state, NOW, first);
    const slot = state.contracts.slots[0]!;
    slot.progress = slot.goal;
    refreshBoard(state, slot.endsAt + 99 * MIN, first);
    expect(state.contracts.slots[0]).toBe(slot);
    const { cash, gems } = { cash: slot.cash, gems: slot.gems };
    expect(claimContract(state, 0, NOW)).toEqual({ cash, gems });
    expect(state.cash).toBe(cash);
    expect(state.gems).toBe(gems);
    expect(state.counts.contract).toBe(1);
    expect(state.contracts.slots[0]!.kind).toBe('');
    // Nothing to claim twice.
    expect(claimContract(state, 0, NOW)).toEqual({ cash: 0, gems: 0 });
  });

  it('the ad doubles one contract a day', () => {
    const state = lotWith('board');
    refreshBoard(state, NOW, first);
    const slot = state.contracts.slots[0]!;
    slot.progress = slot.goal;
    expect(canDouble(state, '2026-10-29')).toBe(true);
    const reward = claimContract(state, 0, NOW, true, '2026-10-29');
    expect(reward.cash + reward.gems).toBe(2 * (slot.cash + slot.gems));
    expect(canDouble(state, '2026-10-29')).toBe(false);
    expect(canDouble(state, '2026-10-30')).toBe(true);
  });

  it('a combo car with a wax counts for washes of its type, fuel, combos and wax', () => {
    const car = { def: { id: 'suv' }, served: ['fuel', 'wash'], stages: [{ id: 'foam' }, { id: 'wax' }] };
    expect(tasksFor(car).sort()).toEqual(['combo', 'fuel', 'wash', 'wash:suv', 'wax']);
  });
});

describe('town goals', () => {
  it('a goal is reached once and stays reached, even if the stars drop', () => {
    const state = lotWith('pump1');
    expect(checkGoals(state)).toEqual(['fuel']);
    expect(checkGoals(state)).toEqual([]);
    state.stars = 5;
    expect(checkGoals(state)).toEqual(['stars']);
    state.stars = 3;
    expect(state.goals.done).toContain('stars');
  });

  it('claiming pays gems and a franchise star, once', () => {
    const state = lotWith('pump1');
    checkGoals(state);
    const gems = GOALS.goals.find((g) => g.id === 'fuel')!.gems;
    expect(claimGoal(state, 'fuel')).toBe(gems);
    expect(state.franchiseStars).toBe(GOALS.franchiseStars);
    expect(claimGoal(state, 'fuel')).toBe(0);
    expect(claimGoal(state, 'mart')).toBe(0);
    expect(state.gems).toBe(gems);
  });

  it('counts goals up from what was done, and opens the road when all are reached', () => {
    const state = lotWith(...GOALS.goals.flatMap((g) => (g.built ? [g.built] : [])));
    state.stars = 5;
    state.counts = { combo: 39, contract: 3 };
    checkGoals(state);
    expect(allGoalsDone(state)).toBe(false);
    expect(goalsSummary(state).next?.id).toBe('combos');
    state.counts.combo = 40;
    checkGoals(state);
    expect(allGoalsDone(state)).toBe(true);
    expect(goalsSummary(state)).toMatchObject({ done: GOALS.goals.length, ready: GOALS.goals.length, next: null });
  });
});
