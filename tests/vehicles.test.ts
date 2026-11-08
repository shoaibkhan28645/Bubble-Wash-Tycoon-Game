import { describe, expect, it } from 'vitest';
import { Group } from 'three';
import { TUNING, type Rect } from '../src/core/config';
import { newGame } from '../src/core/gameState';
import { BarnStore } from '../src/systems/barn';
import { Carrier } from '../src/systems/carry';
import { StandStock, type GoodId } from '../src/systems/crops';
import { routeAt, routeMarks } from '../src/systems/vehicles';

describe('routes', () => {
  it('find the point and heading at any distance along them', () => {
    const route = [{ x: 0, z: 0 }, { x: 0, z: 10 }, { x: 5, z: 10 }];
    const marks = routeMarks(route);
    expect(marks).toEqual([0, 10, 15]);
    expect(routeAt(route, marks, 4)).toEqual({ at: { x: 0, z: 4 }, heading: 0 });
    expect(routeAt(route, marks, 12).at).toEqual({ x: 2, z: 10 });
    expect(routeAt(route, marks, 12).heading).toBeCloseTo(Math.PI / 2);
    expect(routeAt(route, marks, 99).at).toEqual({ x: 5, z: 10 });
  });
});

describe('the barn store', () => {
  const DOOR: Rect = { minX: 0, maxX: 4, minZ: 0, maxZ: 2 };

  it('takes crates at its doors, the trailer far faster than anyone on foot, and hands them to the stand', () => {
    const state = newGame();
    const barn = new BarnStore(state, DOOR, () => 40);
    const trailer = new Carrier<GoodId>(new Group(), () => ({ x: 2, z: 1 }), () => 10);
    for (let i = 0; i < 6; i++) trailer.push(i % 2 ? 'corn' : 'veg');
    const stock = new StandStock(state, () => 0);
    for (let i = 0; i < 20; i++) {
      trailer.update(0.05, false);
      barn.update(0.05, [trailer], new Set([trailer]), null, []);
    }
    expect(trailer.stack).toEqual([]);
    expect(barn.total).toBe(6);
    for (let i = 0; i < 4 / 0.05; i++) barn.update(0.05, [], new Set(), { id: 'stand', stock }, []);
    expect(stock.total('stand')).toBeGreaterThanOrEqual(3);
    // The good the stand has least of goes first, so it stays even.
    expect(Math.abs(stock.stock('stand', 'veg') - stock.stock('stand', 'corn'))).toBeLessThanOrEqual(1);
  });

  it('loads a van waiting for what it holds, and takes nothing once full', () => {
    const state = newGame();
    state.supplies['barnstore.corn'] = 5;
    const barn = new BarnStore(state, DOOR, () => 5);
    let loaded = 0;
    const van = { wants: () => (loaded < 3 ? { good: 'corn' as GoodId, more: 3 - loaded } : null), fill: () => void loaded++ };
    for (let i = 0; i < 100; i++) barn.update(0.05, [], new Set(), null, [van]);
    expect(loaded).toBe(3);
    expect(barn.count('corn')).toBe(2);
    expect(barn.hasRoom).toBe(true);
    state.supplies['barnstore.veg'] = 3;
    expect(barn.hasRoom).toBe(false);
    expect(TUNING.barn.restockSeconds).toBeGreaterThan(0);
  });

  it('keeps crates back for the mill, passing on only what is over', () => {
    const state = newGame();
    state.supplies['barnstore.corn'] = 6;
    const barn = new BarnStore(state, DOOR, () => 40);
    barn.keep = (good) => (good === 'corn' ? 4 : 0);
    const stock = new StandStock(state, () => 0);
    let loaded = 0;
    const van = { wants: () => ({ good: 'corn' as GoodId, more: 10 }), fill: () => void loaded++ };
    for (let i = 0; i < 200; i++) barn.update(0.05, [], new Set(), { id: 'stand', stock }, [van]);
    expect(barn.count('corn')).toBe(4);
    expect(stock.stock('stand', 'corn') + loaded).toBe(2);
    // The mill still takes them.
    expect(barn.take('corn')).toBe(true);
    expect(barn.count('corn')).toBe(3);
  });
});
