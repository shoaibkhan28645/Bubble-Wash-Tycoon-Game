import { describe, expect, it } from 'vitest';
import { Group } from 'three';
import { TUNING, type Rect } from '../src/core/config';
import { newGame } from '../src/core/gameState';
import { BarnStore } from '../src/systems/barn';
import { Carrier } from '../src/systems/carry';
import { StandStock, type GoodId } from '../src/systems/crops';
import { Rig, TRACTOR, TractorDriver, routeAt, routeMarks } from '../src/systems/vehicles';

const OPEN: Rect = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };

/** Holds the stick in one direction for `seconds`. */
function hold(rig: Rig, x: number, z: number, seconds: number, obstacles: Rect[] = [], bounds = OPEN): void {
  for (let t = 0; t < seconds; t += 1 / 60) rig.drive(1 / 60, { x, z }, obstacles, bounds);
}

describe('the tractor', () => {
  it('drives where the stick points, up to its top speed', () => {
    const rig = new Rig({ x: 0, z: 0 }, 0);
    hold(rig, 0, 1, 3);
    expect(rig.at.x).toBeCloseTo(0, 5);
    expect(rig.at.z).toBeGreaterThan(TRACTOR.speed * 2);
    expect(rig.speed).toBeCloseTo(TRACTOR.speed, 1);
  });

  it('turns towards the stick, slowing into the turn, rather than spinning on the spot', () => {
    const rig = new Rig({ x: 0, z: 0 }, 0);
    hold(rig, 0, 1, 1);
    const fast = rig.speed;
    rig.drive(1 / 60, { x: 0, z: -1 }, [], OPEN);
    expect(rig.speed).toBeLessThan(fast);
    hold(rig, 1, 0, 3);
    expect(rig.heading).toBeCloseTo(Math.PI / 2, 2);
    expect(rig.at.x).toBeGreaterThan(5);
  });

  it('stops when the stick is let go, and a half push goes about half as fast', () => {
    const rig = new Rig({ x: 0, z: 0 }, 0);
    hold(rig, 0, 0.5, 3);
    expect(rig.speed).toBeCloseTo(TRACTOR.speed / 2, 1);
    hold(rig, 0, 0, 2);
    expect(rig.speed).toBe(0);
  });

  it("can't drive through a wall or off the farm", () => {
    const rig = new Rig({ x: 0, z: 0 }, 0);
    const wall: Rect = { minX: -5, maxX: 5, minZ: 6, maxZ: 7 };
    hold(rig, 0, 1, 4, [wall]);
    expect(rig.at.z).toBeLessThanOrEqual(6 - TRACTOR.radius + 1e-6);
    hold(rig, 1, 0, 6, [], { minX: -10, maxX: 10, minZ: -10, maxZ: 10 });
    expect(rig.at.x).toBeLessThanOrEqual(10 - TRACTOR.radius + 1e-6);
  });

  it('tows its trailer behind the hitch, swinging in after a turn', () => {
    const rig = new Rig({ x: 0, z: 0 }, 0);
    expect(rig.trailer.at.z).toBeCloseTo(-(TRACTOR.hitch + TRACTOR.trailer));
    hold(rig, 1, 0, 4);
    const behind = Math.hypot(rig.trailer.at.x - rig.at.x, rig.trailer.at.z - rig.at.z);
    expect(behind).toBeLessThanOrEqual(TRACTOR.hitch + TRACTOR.trailer + 1e-6);
    expect(Math.abs(rig.trailer.heading - rig.heading)).toBeLessThan(0.2);
  });
});

describe('the tractor driver', () => {
  it('drives a loop of waypoints, waiting while it unloads', () => {
    const route = [{ x: 0, z: 10 }, { x: 10, z: 10 }, { x: 10, z: 0 }, { x: 0, z: 0 }];
    const rig = new Rig({ x: 0, z: 0 }, 0);
    const driver = new TractorDriver(route);
    const seen = new Set<number>();
    for (let t = 0; t < 30; t += 1 / 30) {
      driver.update(1 / 30, rig, false, [], OPEN);
      route.forEach((p, i) => Math.hypot(p.x - rig.at.x, p.z - rig.at.z) < 1 && seen.add(i));
    }
    expect(seen.size).toBe(4);
    const at = { ...rig.at };
    for (let t = 0; t < 3; t += 1 / 30) driver.update(1 / 30, rig, true, [], OPEN);
    // It brakes to a stop (a couple of metres at full speed), then stays put.
    expect(Math.hypot(rig.at.x - at.x, rig.at.z - at.z)).toBeLessThan((TRACTOR.speed * TRACTOR.speed) / (2 * TRACTOR.accel) + 0.3);
    expect(rig.speed).toBe(0);
  });
});

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
});
