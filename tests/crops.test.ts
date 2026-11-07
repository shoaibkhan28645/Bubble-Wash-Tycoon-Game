import { describe, expect, it } from 'vitest';
import { Group } from 'three';
import { CROPS, TUNING, type FarmLayout, type Point } from '../src/core/config';
import { newGame } from '../src/core/gameState';
import { Carrier } from '../src/systems/carry';
import { Crops, StandStock, type CropId } from '../src/systems/crops';

/** Just the farm's fields: a row of two vegetable plots and one of corn. */
const LAYOUT = {
  fields: {
    field1: { plots: [{ x: 0, z: 0 }, { x: 3, z: 0 }] },
    field2: { plots: [{ x: 0, z: 4 }] },
  },
} as unknown as FarmLayout;

const STAND = { id: 'stand', zone: { minX: 10, maxX: 12, minZ: 0, maxZ: 1 } };

function farm(growBonus = 0) {
  const state = newGame();
  const crops = new Crops(state, LAYOUT, () => 1 + growBonus);
  crops.addField('field1', 'veg');
  crops.addField('field2', 'corn');
  const at: Point = { x: 0, z: 0 };
  const carrier = new Carrier<CropId>(new Group(), () => at, () => 3);
  return { state, crops, carrier, at };
}

/** Stands still for `seconds` (wall clock starting at `now`), a tenth of a second at a time. */
function stay(crops: Crops, carrier: Carrier<CropId>, seconds: number, now = 0): void {
  for (let t = 0; t < seconds; t += 0.1) crops.update(0.1, now + t * 1000, [carrier]);
}

describe('crops', () => {
  it('starts every plot ripe, and harvests a crate onto the back of whoever stands on one', () => {
    const { crops, carrier } = farm();
    expect(crops.plots.map((p) => p.id)).toEqual(['field1.0', 'field1.1', 'field2.0']);
    expect(crops.plots.every((p) => crops.ripe(p, 0))).toBe(true);
    stay(crops, carrier, TUNING.farm.harvestSeconds / 2);
    expect(carrier.stack).toEqual([]);
    stay(crops, carrier, TUNING.farm.harvestSeconds);
    expect(carrier.stack).toEqual(['veg']);
  });

  it('replants a harvested plot, which ripens again on the clock (also while away)', () => {
    const { state, crops, carrier } = farm();
    stay(crops, carrier, 1);
    const plot = crops.plots[0]!;
    const grow = CROPS.veg!.growSeconds * 1000;
    expect(state.plots['field1.0']).toBeGreaterThan(grow * 0.9);
    expect(crops.ripe(plot, 1000)).toBe(false);
    expect(crops.growth(plot, 1000 + grow / 2)).toBeCloseTo(0.5, 1);
    // Still standing there: nothing more until it's ripe.
    stay(crops, carrier, 3, 1000);
    expect(carrier.stack.length).toBe(1);
    expect(crops.ripe(plot, 2000 + grow)).toBe(true);
  });

  it('grows faster with the well', () => {
    const slow = farm(0).crops;
    const fast = farm(0.5).crops;
    expect(fast.growMs(fast.plots[2]!)).toBeCloseTo(slow.growMs(slow.plots[2]!) / 1.5);
  });

  it('stops harvesting with a full back', () => {
    const { crops, carrier, at } = farm();
    for (const crop of ['veg', 'veg', 'corn'] as CropId[]) carrier.push(crop);
    stay(crops, carrier, 2);
    expect(carrier.stack.length).toBe(3);
    expect(crops.ripe(crops.plots[0]!, 2000)).toBe(true);
    at.x = 50;
    expect(crops.plotAt(at)).toBeNull();
  });

  it('finds the nearest ripe plot for a farmhand, leaving out taken ones', () => {
    const { state, crops } = farm();
    expect(crops.nearestRipe({ x: 4, z: 0 }, 0)?.id).toBe('field1.1');
    expect(crops.nearestRipe({ x: 4, z: 0 }, 0, (p) => p.id === 'field1.1')?.id).toBe('field1.0');
    for (const p of crops.plots) state.plots[p.id] = 10_000;
    expect(crops.nearestRipe({ x: 0, z: 0 }, 0)).toBeNull();
  });
});

describe('the farm stand', () => {
  it('takes crates from carriers in reach, up to what it holds', () => {
    const state = newGame();
    const stock = new StandStock(state, () => 0);
    const at: Point = { x: 30, z: 0 };
    const carrier = new Carrier<CropId>(new Group(), () => at, () => 20);
    for (let i = 0; i < 14; i++) carrier.push(i % 2 ? 'corn' : 'veg');
    stock.update([STAND], [carrier]);
    expect(stock.total('stand')).toBe(0);
    at.x = 12.5;
    for (let i = 0; i < 40; i++) {
      carrier.update(0.2, false);
      stock.update([STAND], [carrier]);
    }
    expect(stock.total('stand')).toBe(TUNING.farm.standCapacity);
    expect(carrier.stack.length).toBe(14 - TUNING.farm.standCapacity);
    expect(new StandStock(state, () => 5).hasRoom('stand')).toBe(true);
  });

  it("fills each villager's basket with one of everything it has, until it is empty", () => {
    const state = newGame();
    state.supplies = { 'stand.veg': 2, 'stand.corn': 1, 'stand.eggs': 1 };
    const stock = new StandStock(state, () => 0);
    expect(stock.takeBasket('stand').sort()).toEqual(['corn', 'eggs', 'veg']);
    expect(stock.takeBasket('stand')).toEqual(['veg']);
    expect(stock.takeBasket('stand')).toEqual([]);
    expect(stock.total('stand')).toBe(0);
  });

});
