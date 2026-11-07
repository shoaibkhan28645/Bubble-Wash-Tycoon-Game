import { describe, expect, it } from 'vitest';
import { Group } from 'three';
import { TUNING, type FarmLayout, type Point } from '../src/core/config';
import { newGame } from '../src/core/gameState';
import { Carrier } from '../src/systems/carry';
import { Poultry } from '../src/systems/animals';
import type { GoodId } from '../src/systems/crops';

/** One hen house with its egg table, and a feed store. */
const LAYOUT = {
  coops: { henhouse: { run: { minX: 0, maxX: 4, minZ: 0, maxZ: 4 }, table: { x: -3, z: 0 }, zone: { minX: -4, maxX: -2, minZ: 1, maxZ: 2 }, trough: { x: 2, z: 2 } } },
  feeders: { feedstore: { zone: { minX: 10, maxX: 12, minZ: 0, maxZ: 1 } } },
} as unknown as FarmLayout;

const { count, layEvery, nestCap, eggsPerCarton, packSeconds, fedSpeed, feedPerCrate, feedCap } = TUNING.hens;
/** Milliseconds for one egg from the whole flock. */
const EGG_MS = (layEvery * 1000) / count;

function farm() {
  const state = newGame();
  const poultry = new Poultry(state, LAYOUT, () => count);
  poultry.addCoop('henhouse', 0);
  const at: Point = { x: -3, z: 1.5 };
  const carrier = new Carrier<GoodId>(new Group(), () => at, () => 3);
  return { state, poultry, carrier, at };
}

describe('hens', () => {
  it('lay on the clock, counting part-laid eggs over to the next frame', () => {
    const { poultry } = farm();
    for (let t = 0; t <= EGG_MS * 3 + 1; t += 100) poultry.lay(t);
    expect(poultry.eggs('henhouse')).toBe(3);
  });

  it('keep laying while the game is closed, up to what the nest boxes hold', () => {
    const { poultry } = farm();
    poultry.lay(EGG_MS * 5 + 10);
    expect(poultry.eggs('henhouse')).toBe(5);
    poultry.lay(EGG_MS * 1000);
    expect(poultry.eggs('henhouse')).toBe(nestCap);
  });

  it('starts counting afresh if the clock is set back', () => {
    const { state, poultry } = farm();
    poultry.lay(EGG_MS * 2 + 1);
    poultry.lay(-50_000);
    expect(state.plots['henhouse.laid']).toBe(-50_000);
    expect(poultry.eggs('henhouse')).toBe(2);
  });

  it('are packed into cartons at the egg table, six eggs a carton', () => {
    const { poultry, carrier, at } = farm();
    poultry.lay(EGG_MS * (eggsPerCarton * 2 + 1) + 1);
    for (let t = 0; t < packSeconds * 3; t += 0.1) poultry.update(0.1, EGG_MS * (eggsPerCarton * 2 + 1) + 1, [carrier]);
    expect(carrier.stack).toEqual(['eggs', 'eggs']);
    expect(poultry.eggs('henhouse')).toBe(1);
    at.x = 20;
    poultry.update(1, EGG_MS * (eggsPerCarton * 2 + 1) + 1, [carrier]);
    expect(poultry.packing.size).toBe(0);
  });

  it('lay faster when fed, eating a feed per egg, once corn goes into the feed store', () => {
    const { state, poultry, carrier, at } = farm();
    poultry.addFeeder('feedstore');
    expect(poultry.fed).toBe(false);
    expect(poultry.hungry).toBe(true);
    carrier.push('corn');
    carrier.push('veg');
    at.x = 11;
    at.z = 0.5;
    poultry.update(0, 0, [carrier]);
    expect(carrier.stack).toEqual(['veg']);
    expect(poultry.feed).toBe(feedPerCrate);
    expect(poultry.fed).toBe(true);
    poultry.lay((EGG_MS / fedSpeed) * 4 + 1);
    expect(poultry.eggs('henhouse')).toBe(4);
    expect(poultry.feed).toBe(feedPerCrate - 4);
    // The store takes no more than it holds.
    state.supplies.feed = feedCap;
    carrier.push('corn');
    carrier.timer = 0;
    poultry.update(0, (EGG_MS / fedSpeed) * 4 + 1, [carrier]);
    expect(carrier.count('corn')).toBe(1);
    expect(poultry.wantsFeed).toBe(false);
  });
});
