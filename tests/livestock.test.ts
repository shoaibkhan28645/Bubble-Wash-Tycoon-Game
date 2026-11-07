import { describe, expect, it } from 'vitest';
import { Group } from 'three';
import { TUNING, type FarmLayout, type Point } from '../src/core/config';
import { newGame } from '../src/core/gameState';
import { Carrier } from '../src/systems/carry';
import { ANIMALS, Livestock } from '../src/systems/animals';
import type { GoodId } from '../src/systems/crops';

/** A hen house and a cow barn, each with its work spot, and a feed store. */
const LAYOUT = {
  pens: {
    henhouse: { animal: 'hens', run: { minX: 0, maxX: 4, minZ: 0, maxZ: 4 }, table: { x: -3, z: 0 }, zone: { minX: -4, maxX: -2, minZ: 1, maxZ: 2 }, trough: { x: 2, z: 2 } },
    cowbarn: { animal: 'cows', run: { minX: 0, maxX: 6, minZ: 10, maxZ: 16 }, table: { x: -3, z: 10 }, zone: { minX: -4, maxX: -2, minZ: 11, maxZ: 12 }, trough: { x: 3, z: 12 } },
  },
  feeders: { feedstore: { zone: { minX: 10, maxX: 12, minZ: 0, maxZ: 1 } } },
} as unknown as FarmLayout;

const hens = ANIMALS.hens;
const cows = ANIMALS.cows;
const { perCrate, cap: feedCap } = TUNING.feed;
/** Milliseconds for one egg from the whole flock, one bottle from the whole herd. */
const EGG_MS = (hens.every * 1000) / hens.count;
const MILK_MS = (cows.every * 1000) / cows.count;

function farm() {
  const state = newGame();
  const livestock = new Livestock(state, LAYOUT, (id) => (id === 'henhouse' ? hens.count : cows.count));
  livestock.addPen('henhouse', 0);
  const at: Point = { x: -3, z: 1.5 };
  const carrier = new Carrier<GoodId>(new Group(), () => at, () => 3);
  return { state, livestock, carrier, at };
}

describe('hens', () => {
  it('lay on the clock, counting part-laid eggs over to the next frame', () => {
    const { livestock } = farm();
    for (let t = 0; t <= EGG_MS * 3 + 1; t += 100) livestock.work(t);
    expect(livestock.made('henhouse')).toBe(3);
  });

  it('keep laying while the game is closed, up to what the nest boxes hold', () => {
    const { livestock } = farm();
    livestock.work(EGG_MS * 5 + 10);
    expect(livestock.made('henhouse')).toBe(5);
    livestock.work(EGG_MS * 1000);
    expect(livestock.made('henhouse')).toBe(hens.cap);
  });

  it('starts counting afresh if the clock is set back', () => {
    const { state, livestock } = farm();
    livestock.work(EGG_MS * 2 + 1);
    livestock.work(-50_000);
    expect(state.plots['henhouse.laid']).toBe(-50_000);
    expect(livestock.made('henhouse')).toBe(2);
  });

  it('are packed into cartons at the egg table, six eggs a carton', () => {
    const { livestock, carrier, at } = farm();
    const now = EGG_MS * (hens.perPack * 2 + 1) + 1;
    livestock.work(now);
    for (let t = 0; t < hens.packSeconds * 3; t += 0.1) livestock.update(0.1, now, [carrier]);
    expect(carrier.stack).toEqual(['eggs', 'eggs']);
    expect(livestock.made('henhouse')).toBe(1);
    at.x = 20;
    livestock.update(1, now, [carrier]);
    expect(livestock.packing.size).toBe(0);
  });

  it('lay faster when fed, eating a feed per egg, once corn goes into the feed store', () => {
    const { state, livestock, carrier, at } = farm();
    livestock.addFeeder('feedstore');
    expect(livestock.fed).toBe(false);
    expect(livestock.hungry).toBe(true);
    carrier.push('corn');
    carrier.push('veg');
    at.x = 11;
    at.z = 0.5;
    livestock.update(0, 0, [carrier]);
    expect(carrier.stack).toEqual(['veg']);
    expect(livestock.feed).toBe(perCrate);
    expect(livestock.fed).toBe(true);
    livestock.work((EGG_MS / hens.fedSpeed) * 4 + 1);
    expect(livestock.made('henhouse')).toBe(4);
    expect(livestock.feed).toBe(perCrate - 4 * hens.feedEach);
    // The store takes no more than it holds.
    state.supplies.feed = feedCap;
    carrier.push('corn');
    carrier.timer = 0;
    livestock.update(0, (EGG_MS / hens.fedSpeed) * 4 + 1, [carrier]);
    expect(carrier.count('corn')).toBe(1);
    expect(livestock.wantsFeed).toBe(false);
  });
});

describe('cows', () => {
  it('fill the milk tank on the clock, a bottle at a time at the dairy', () => {
    const { livestock, carrier, at } = farm();
    livestock.addPen('cowbarn', 0);
    livestock.work(MILK_MS * 2 + 5);
    expect(livestock.made('cowbarn')).toBe(2);
    expect(livestock.packs('cowbarn')).toBe(2);
    at.z = 11.5;
    for (let t = 0; t < cows.packSeconds * 2.5; t += 0.1) livestock.update(0.1, MILK_MS * 2 + 5, [carrier]);
    expect(carrier.stack).toEqual(['milk', 'milk']);
    expect(livestock.first('cows')?.id).toBe('cowbarn');
  });

  it('eat more feed than hens, and give milk faster when fed', () => {
    const { state, livestock } = farm();
    livestock.addPen('cowbarn', 0);
    livestock.addFeeder('feedstore');
    state.supplies.feed = 40;
    livestock.work((MILK_MS / cows.fedSpeed) * 3 + 1);
    expect(livestock.made('cowbarn')).toBe(3);
    expect(cows.feedEach).toBeGreaterThan(hens.feedEach);
  });
});
