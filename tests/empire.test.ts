import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/core/config';
import { backgroundEarner, backgroundIncome, currentTownState, empireOfflineEarnings, switchTown } from '../src/core/empire';
import { newGame, newTownState } from '../src/core/gameState';

const HOUR = 3600 * 1000;

function roadsideBuilt() {
  const state = newGame();
  state.cash = 1000;
  state.gems = 12;
  state.flags = ['washed'];
  state.unlocked = ['bay1', 'hose', 'washer'];
  state.levels = { 'bay1.speed': 3 };
  state.staff = ['washer'];
  state.piles = { bay1: 40 };
  state.stars = 4.5;
  state.autoRate = 120;
  state.goals = { done: ['fuel'], claimed: [] };
  return state;
}

describe('switchTown', () => {
  it('stores the town being played and opens a fresh one, keeping empire progress', () => {
    const state = roadsideBuilt();
    switchTown(state, 'willowbrook');
    expect(state.currentTown).toBe('willowbrook');
    expect(currentTownState(state)).toEqual(newTownState());
    expect(state.towns.roadside).toMatchObject({ unlocked: ['bay1', 'hose', 'washer'], autoRate: 120, stars: 4.5, piles: { bay1: 40 } });
    expect(state).toMatchObject({ cash: 1000, gems: 12, flags: ['washed'] });
  });

  it('brings a town back exactly as it was left', () => {
    const state = roadsideBuilt();
    const before = currentTownState(state);
    switchTown(state, 'willowbrook');
    state.unlocked.push('field1');
    switchTown(state, 'roadside');
    expect(currentTownState(state)).toEqual(before);
    expect(state.towns).toEqual({ willowbrook: { ...newTownState(), unlocked: ['field1'] } });
  });

  it('does nothing when already there', () => {
    const state = roadsideBuilt();
    switchTown(state, 'roadside');
    expect(state.towns).toEqual({});
  });
});

describe('background towns', () => {
  it('earn at the offline rate while the hero is elsewhere, full rate with a manager', () => {
    const state = roadsideBuilt();
    expect(backgroundIncome(state)).toBe(0);
    switchTown(state, 'willowbrook');
    expect(backgroundIncome(state)).toBeCloseTo((120 * TUNING.offline.rate) / 60);
    state.towns.roadside!.unlocked.push('manager');
    expect(backgroundIncome(state)).toBeCloseTo((120 * TUNING.offline.managerRate) / 60);
  });

  it('pays in whole dollars as play goes on', () => {
    const state = roadsideBuilt();
    switchTown(state, 'willowbrook');
    const earn = backgroundEarner(state);
    const perSecond = backgroundIncome(state);
    for (let i = 0; i < 600; i++) earn(0.1);
    expect(Number.isInteger(state.cash)).toBe(true);
    expect(state.cash - 1000).toBeGreaterThanOrEqual(Math.floor(perSecond * 60) - 1);
    expect(state.cash - 1000).toBeLessThanOrEqual(Math.ceil(perSecond * 60));
  });

  it('every town earns while the game is closed, each with its own cap', () => {
    const state = roadsideBuilt();
    switchTown(state, 'willowbrook');
    state.autoRate = 60;
    const now = 100 * HOUR;
    const cap = empireOfflineEarnings(state, now - HOUR / 3, now);
    expect(cap.seconds).toBe(20 * 60);
    const rate = TUNING.offline.rate;
    expect(cap.cash).toBe(Math.floor(120 * 1200 * rate / 60) + Math.floor(60 * 1200 * rate / 60));
    // Away for a day: each town stops at its cap (20 minutes at offline-time level 0).
    expect(empireOfflineEarnings(state, now - 24 * HOUR, now)).toEqual(cap);
  });
});
