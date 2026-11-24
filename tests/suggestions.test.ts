import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/gameState';
import { itemFor, starterOfferDue, STARTER_CALM_SECONDS, STARTER_PLAY_SECONDS } from '../src/systems/suggestions';
import { pickStarter, priceOf } from '../src/systems/wardrobe';

const TODAY = '2026-11-24';
const calm = { tutorial: false, calmSeconds: STARTER_CALM_SECONDS, sessionSeconds: 60 };

describe('the free starter pick', () => {
  it('waits for the opening to be over: the tutorial done and the first cards shown', () => {
    const state = newGame();
    state.playSeconds = STARTER_PLAY_SECONDS - 1;
    expect(starterOfferDue(state, calm)).toBe(false);
    state.playSeconds = STARTER_PLAY_SECONDS;
    expect(starterOfferDue(state, calm)).toBe(true);
    expect(starterOfferDue(state, { ...calm, tutorial: true })).toBe(false);
  });

  it('never over another card, nor in a visit\'s first moments', () => {
    const state = newGame();
    state.playSeconds = 600;
    expect(starterOfferDue(state, { ...calm, calmSeconds: STARTER_CALM_SECONDS - 1 })).toBe(false);
    expect(starterOfferDue(state, { ...calm, sessionSeconds: 5 })).toBe(false);
  });

  it('not in the opening, even with a goal reward claimed (1.4 put it there, before the first build)', () => {
    const state = newGame();
    state.goals.claimed.push('firstWashes');
    state.playSeconds = 25;
    expect(starterOfferDue(state, { tutorial: true, calmSeconds: 60, sessionSeconds: 25 })).toBe(false);
    state.playSeconds = STARTER_PLAY_SECONDS;
    expect(starterOfferDue(state, { ...calm, tutorial: true })).toBe(false);
    expect(starterOfferDue(state, calm)).toBe(true);
  });

  it('is offered no more once picked', () => {
    const state = newGame();
    state.playSeconds = 600;
    expect(pickStarter(state, 'tan')).toBe(true);
    expect(starterOfferDue(state, calm)).toBe(false);
  });
});

describe('the suggestions in play', () => {
  it('puts on something owned first, then something the gems buy', () => {
    const state = newGame();
    state.wardrobe.owned.push('tan');
    expect(itemFor(state, 'carry', TODAY)).toMatchObject({ item: { id: 'tan' }, offer: 'owned' });
    state.wardrobe.owned = [];
    state.gems = priceOf(state, 'tan', TODAY);
    expect(itemFor(state, 'carry', TODAY)).toMatchObject({ item: { id: 'tan' }, offer: 'buy' });
  });

  it('with too few gems, names something to save up for (it used to say nothing)', () => {
    const state = newGame();
    state.gems = 5;
    expect(itemFor(state, 'carry', TODAY)).toMatchObject({ item: { id: 'tan' }, offer: 'save' });
    expect(itemFor(state, 'patience', TODAY)).toMatchObject({ item: { id: 'crown' }, offer: 'save' });
  });

  it('asks no saving up for more of a perk already worn, and offers only what works in the town', () => {
    const state = newGame();
    state.wardrobe.owned.push('tan');
    state.wardrobe.equipped.outfit = 'tan';
    state.gems = 0;
    expect(itemFor(state, 'carry', TODAY)).toBeNull();
    // The airport's Aviator carries 2: offered there once the gems buy it, never in the car wash.
    state.currentTown = 'skyport';
    state.gems = 1000;
    expect(itemFor(state, 'carry', TODAY)).toMatchObject({ item: { id: 'aviator' }, offer: 'buy' });
    state.currentTown = 'roadside';
    expect(itemFor(state, 'carry', TODAY)).toBeNull();
  });
});
