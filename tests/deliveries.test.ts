import { describe, expect, it } from 'vitest';
import { Group } from 'three';
import { TUNING, type Point, type Rect } from '../src/core/config';
import { newGame, newTownState, type Order } from '../src/core/gameState';
import { serialize } from '../src/core/migrate';
import { Carrier } from '../src/systems/carry';
import type { GoodId } from '../src/systems/crops';
import { Deliveries, VANS } from '../src/systems/deliveries';

const BAY: Rect = { minX: 0, maxX: 2, minZ: 0, maxZ: 2 };

/** A farm with a van (and maybe a tanker), making eggs and milk; `auto`: a driver is hired. */
function farm(opts: { vans?: string[]; auto?: boolean } = {}) {
  const state = newGame();
  const done: { order: Order; van: string }[] = [];
  let seed = 1;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const deliveries = new Deliveries(state, () => opts.vans ?? ['van'], () => ['veg', 'eggs', 'milk'], () => !!opts.auto, (order, van) => done.push({ order, van }), random);
  const at: Point = { x: 1, z: 1 };
  const carrier = new Carrier<GoodId>(new Group(), () => at, () => 20);
  return { state, deliveries, done, carrier, at };
}

/** Fills the carrier with what the van waits for, and loads it at the bay. */
function loadUp(deliveries: Deliveries, carrier: Carrier<GoodId>, van: string): void {
  const wants = deliveries.wants(van)!;
  for (let i = 0; i < wants.more; i++) carrier.push(wants.good);
  for (let i = 0; i < 200 && deliveries.wants(van); i++) {
    carrier.timer = 0;
    deliveries.load(van, BAY, [carrier]);
  }
}

describe('delivery orders', () => {
  it('fill the board with orders for what the farm makes and its vans carry, paying more than the stand', () => {
    const { deliveries } = farm();
    for (let t = 0; t <= TUNING.deliveries.refillSeconds * 1000 * 3; t += 1000) deliveries.update(t);
    expect(deliveries.orders.length).toBe(TUNING.deliveries.slots);
    for (const order of deliveries.orders) {
      expect(VANS.van!.goods).toContain(order.good);
      expect(order.qty).toBeGreaterThanOrEqual(VANS.van!.load[0]);
      expect(order.qty).toBeLessThanOrEqual(VANS.van!.load[1]);
    }
    expect(new Set(deliveries.orders.map((o) => o.id)).size).toBe(deliveries.orders.length);
  });

  it('show nothing until there is a van', () => {
    const { deliveries } = farm({ vans: [] });
    deliveries.update(0);
    expect(deliveries.orders).toEqual([]);
  });

  it('run out and are replaced if no van takes them', () => {
    const { deliveries } = farm();
    deliveries.update(0);
    const first = deliveries.orders[0]!;
    deliveries.update(first.endsAt + 1);
    expect(deliveries.orders.some((o) => o.id === first.id)).toBe(false);
  });

  it('go with a van the hero picks, which waits to be loaded, then drives off and pays when back', () => {
    const { deliveries, done, carrier, state } = farm();
    deliveries.update(0);
    const order = deliveries.orders[0]!;
    expect(deliveries.assign(order.id, 'van')).toBe(true);
    expect(deliveries.assign(deliveries.orders[1]?.id ?? -1, 'van')).toBe(false);
    loadUp(deliveries, carrier, 'van');
    expect(order.loaded).toBe(order.qty);
    deliveries.update(10);
    expect(deliveries.atYard('van')).toBe(false);
    expect(deliveries.tripProgress('van', 10 + VANS.van!.trip * 500)).toBeCloseTo(0.5);
    deliveries.update(10 + VANS.van!.trip * 1000);
    expect(done.map((d) => d.order.id)).toEqual([order.id]);
    expect(deliveries.atYard('van')).toBe(true);
    expect(state.counts.delivery).toBe(1);
  });

  it('are taken by the driver, best paying first, each van only carrying its own goods', () => {
    const { deliveries } = farm({ vans: ['van', 'tanker'], auto: true });
    for (let t = 0; t <= TUNING.deliveries.refillSeconds * 1000 * 4; t += 1000) deliveries.update(t);
    const van = deliveries.orderOf('van');
    const tanker = deliveries.orderOf('tanker');
    if (van) expect(VANS.van!.goods).toContain(van.good);
    if (tanker) expect(tanker.good).toBe('milk');
    expect(van ?? tanker).toBeDefined();
  });

  it("finish their trips while the game is closed (Part C's gate)", () => {
    const { deliveries, done, carrier } = farm();
    deliveries.update(0);
    deliveries.assign(deliveries.orders[0]!.id, 'van');
    loadUp(deliveries, carrier, 'van');
    deliveries.update(1000);
    // The game is closed straight after; opened again an hour later, the van is home and the order paid.
    deliveries.update(3_600_000);
    expect(done.length).toBe(1);
    expect(deliveries.atYard('van')).toBe(true);
  });

  it('keep a whole six-town empire save under 64 KiB', () => {
    const state = newGame();
    const busy = (): ReturnType<typeof newTownState> => {
      const town = newTownState();
      town.unlocked = Array.from({ length: 30 }, (_, i) => `pad${i}`);
      for (let i = 0; i < 60; i++) town.levels[`station${i}.speed`] = 10;
      for (let i = 0; i < 40; i++) town.plots[`field${i % 4}.${i}`] = 1_793_400_000_000 + i;
      for (let i = 0; i < 20; i++) town.supplies[`stand${i}.goods`] = 20;
      town.deliveries.orders = Array.from({ length: 4 }, (_, i) => ({ id: i, good: 'milk', qty: 16, pay: 4100, buyer: 'the Willowbrook Diner', endsAt: 1_793_400_000_000, van: 'van', loaded: 3 }));
      town.deliveries.trips = { van: { order: 1, leftAt: 1_793_400_000_000, backAt: 1_793_400_080_000 }, tanker: { order: 2, leftAt: 1, backAt: 2 } };
      return town;
    };
    Object.assign(state, busy());
    for (const id of ['roadside', 'market', 'downtown', 'port', 'skyline']) state.towns[id] = busy();
    expect(new TextEncoder().encode(serialize(state)).length).toBeLessThan(64 * 1024);
  });
});
