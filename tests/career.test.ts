import { describe, expect, it } from 'vitest';
import { RANKS } from '../src/core/config';
import { newGame, newTownState } from '../src/core/gameState';
import { ROADSIDE } from '../src/core/towns';
import {
  bestNetWorth,
  currentRank,
  netWorth,
  nextRank,
  perk,
  rankFlag,
  rankFor,
  recordNetWorth,
  townValue,
  uncelebratedRanks,
} from '../src/systems/career';
import { refreshBoard } from '../src/systems/contracts';
import { costOf } from '../src/systems/upgrades';

const cost = (id: string) => ROADSIDE.pads.find((p) => p.id === id)!.cost;

/** A lot with the contracts board (and what its contracts need) built. */
function contractsUnlocked() {
  const state = newGame();
  state.unlocked = ROADSIDE.pads.slice(0, 18).map((p) => p.id);
  return state;
}

describe('net worth', () => {
  it('counts cash, cash piles, built and half-paid pads, buildings going up and upgrades', () => {
    const state = newGame();
    state.cash = 500;
    state.unlocked = ['bay1', 'hose', 'register'];
    state.building = { mart: { endsAt: 0, halved: false } };
    state.padPaid = { bay2: 120 };
    state.levels = { 'bay1.speed': 2 };
    state.piles = { bay1: 30 };
    const upgrades = costOf('bay1.speed', 0) + costOf('bay1.speed', 1);
    expect(townValue(ROADSIDE, state)).toBe(30 + cost('hose') + cost('register') + cost('mart') + 120 + upgrades);
    expect(netWorth(state, ROADSIDE, () => undefined)).toBe(500 + townValue(ROADSIDE, state));
  });

  it('adds the towns the hero is not in', () => {
    const state = newGame();
    state.towns.testville = { ...newTownState(), unlocked: ['hose'] };
    expect(netWorth(state, ROADSIDE, () => ROADSIDE)).toBe(cost('hose'));
    // A town whose data isn't loaded counts as nothing yet.
    expect(netWorth(state, ROADSIDE, () => undefined)).toBe(0);
  });

  it('keeps the best ever reached, so a rank never goes back', () => {
    const state = newGame();
    expect(recordNetWorth(state, 12_000.7)).toBe(true);
    expect(recordNetWorth(state, 9_000)).toBe(false);
    expect(bestNetWorth(state)).toBe(12_000);
    expect(currentRank(state).id).toBe('entrepreneur');
  });
});

describe('ranks', () => {
  it('climb with net worth, lowest first, from Hustler at zero', () => {
    expect(RANKS[0]).toMatchObject({ id: 'hustler', netWorth: 0 });
    for (let i = 1; i < RANKS.length; i++) expect(RANKS[i]!.netWorth).toBeGreaterThan(RANKS[i - 1]!.netWorth);
    expect(rankFor(0).id).toBe('hustler');
    expect(rankFor(9_999).id).toBe('hustler');
    expect(rankFor(10_000).id).toBe('entrepreneur');
    expect(rankFor(250_000).id).toBe('shopOwner');
  });

  it('shows the way to the next rank', () => {
    const state = newGame();
    recordNetWorth(state, 5_000);
    expect(nextRank(state)).toEqual({ rank: RANKS[1], progress: 0.5 });
    recordNetWorth(state, 1e9);
    expect(nextRank(state)).toBeNull();
  });

  it('celebrates each rank once', () => {
    const state = newGame();
    recordNetWorth(state, 150_000);
    expect(uncelebratedRanks(state).map((r) => r.id)).toEqual(['entrepreneur', 'shopOwner']);
    state.flags.push(rankFlag(RANKS[1]!), rankFlag(RANKS[2]!));
    expect(uncelebratedRanks(state)).toEqual([]);
  });

  it('gives perks: faster walking, then a contract slot', () => {
    const state = contractsUnlocked();
    expect(perk(state, 'walk')).toBe(0);
    refreshBoard(state, 0, () => 0);
    const slots = state.contracts.slots.length;
    recordNetWorth(state, 10_000);
    expect(perk(state, 'walk')).toBeCloseTo(0.1);
    recordNetWorth(state, 100_000);
    expect(perk(state, 'contractSlots')).toBe(1);
    refreshBoard(state, 0, () => 0);
    expect(state.contracts.slots.length).toBe(slots + 1);
  });
});
