import { describe, expect, it } from 'vitest';
import { LOCATION1, TUNING, type Point } from '../src/core/config';
import type { CarPool } from '../src/systems/cars';
import type { Walker } from '../src/systems/mart';
import { PassingTraffic } from '../src/systems/passing';
import { carAhead, RoadRules } from '../src/systems/roadRules';
import type { Car } from '../src/systems/cars';
import { Pedestrians } from '../src/systems/pedestrians';

function walker(): Walker {
  return {
    root: { position: { x: 0, z: 0, set(x: number, _y: number, z: number) { this.x = x; this.z = z; } }, rotation: { y: 0 }, visible: false },
    holding: false,
    update: () => {},
  };
}

/** Always the first choice; never stops for a look. */
const first = () => 0.99;

describe('pedestrians', () => {
  it('walk their route from one end to the other, then leave (and their avatar is reused)', () => {
    const made: Walker[] = [];
    const route = [{ x: 0, z: 0 }, { x: 10, z: 0 }];
    const people = new Pedestrians([route], () => {
      const w = walker();
      made.push(w);
      return w;
    }, first);
    people.update(0.01);
    // The street starts busy: most people already part way along, one setting off from an end
    // (with these rolls, the far end: x 10).
    expect(people.count).toBe(TUNING.streetLife.people);
    const p = made.at(-1)!;
    expect(p.root.visible).toBe(true);
    expect(p.root.position.x).toBeGreaterThan(9.9);
    for (let t = 0; t < 4; t += 0.1) people.update(0.1);
    expect(p.root.position.x).toBeLessThan(7);
    expect(Math.abs(p.root.position.z)).toBeLessThan(1e-6);
    for (let t = 0; t < 20; t += 0.1) people.update(0.1);
    // People come and go, never more than the most allowed, with avatars reused.
    expect(people.count).toBeLessThanOrEqual(TUNING.streetLife.people);
    expect(made.length).toBeLessThanOrEqual(TUNING.streetLife.people);
  });

  it('stop for a look only where a route says what to look at, facing it', () => {
    // Every roll 0: the route as written, and a stop at its one point worth a look.
    const w = walker();
    const keep = new Pedestrians([[{ x: 0, z: 0 }, { x: 2, z: 0, look: Math.PI }, { x: 10, z: 0 }]], () => w, () => 0);
    keep.update(0.01);
    for (let t = 0; t < 2; t += 0.1) keep.update(0.1);
    expect(w.root.position.x).toBe(2);
    expect(w.root.rotation.y).toBe(Math.PI);
  });

  it('walk routes that exist in the layout, each with two ends', () => {
    expect(LOCATION1.walkways.length).toBeGreaterThan(0);
    for (const route of LOCATION1.walkways) expect(route.length).toBeGreaterThanOrEqual(2);
  });
});

/** A stand-in car: drives straight at its speed towards its goal. */
function fakePool(): CarPool & { cars: { position: Point }[] } {
  const cars: { position: Point }[] = [];
  return {
    cars,
    active: new Set(),
    acquire() {
      const car = {
        position: { x: 0, z: 0 },
        goal: { x: 0, z: 0 },
        state: '',
        spawn(_def: unknown, at: Point, _a: unknown, goal: Point) {
          this.position = { ...at };
          this.goal = { ...goal };
        },
        update(dt: number, speed: number) {
          const d = this.goal.x - this.position.x;
          this.position.x += Math.sign(d) * Math.min(Math.abs(d), speed * dt);
        },
        get arrived() {
          return this.position.x === this.goal.x;
        },
      };
      cars.push(car);
      return car as never;
    },
    release() {},
  } as unknown as CarPool & { cars: { position: Point }[] };
}

describe('passing traffic', () => {
  it('drives along Main Street both ways and goes off at the far end', () => {
    const pool = fakePool();
    const passing = new PassingTraffic(pool, LOCATION1, () => [], () => 0);
    passing.update(3);
    expect(passing.count).toBe(2);
    const zs = pool.cars.map((c) => c.position.z).sort((a, b) => a - b);
    expect(zs).toEqual([LOCATION1.roadZ - LOCATION1.roadLane, LOCATION1.roadZ + LOCATION1.roadLane]);
    const [a, b] = pool.cars;
    const starts = [a!.position.x, b!.position.x];
    for (let t = 0; t < 20; t += 0.5) passing.update(0.5);
    // Each drove the whole way, to the end it was heading for.
    expect([a!.position.x, b!.position.x]).toEqual(starts.map((x) => -Math.sign(x) * TUNING.streetLife.roadEnd));
  });

  it("doesn't start a car onto a stretch of road that's taken", () => {
    const end = TUNING.streetLife.roadEnd;
    const pool = fakePool();
    const lanes = [LOCATION1.roadZ - LOCATION1.roadLane, LOCATION1.roadZ + LOCATION1.roadLane];
    const passing = new PassingTraffic(pool, LOCATION1, () => [{ x: -end, z: lanes[1]! }, { x: end, z: lanes[0]! }], () => 0);
    passing.update(3);
    expect(passing.count).toBe(0);
  });
});

/** A stand-in car for the road rules: where it is, which way it's going and how big it is. */
function car(x: number, z: number, next: Point | null, facing = 0, extra: Record<string, unknown> = {}): Car {
  return {
    position: { x, z },
    nextPoint: next,
    facing,
    def: { size: [1.7, 1.5, 3] },
    model: { mesh: { visible: true } },
    state: 'arriving',
    station: null,
    ...extra,
  } as unknown as Car;
}

describe('road rules', () => {
  it('a car waits for a car in front of it, not one behind or beside it', () => {
    const me = car(0, 0, { x: 0, z: 10 });
    const front = car(0, 3.5, null);
    const behind = car(0, -3.5, null);
    const beside = car(3, 1, null);
    expect(new RoadRules(() => [me, front], () => []).blocked(me, 0.1)).toBe(true);
    expect(new RoadRules(() => [me, behind, beside], () => []).blocked(me, 0.1)).toBe(false);
    // Far enough ahead: it drives up to the gap and stops there.
    expect(new RoadRules(() => [me, car(0, 6, null)], () => []).blocked(me, 0.1)).toBe(false);
  });

  it('a car stops for a person in front of it for as long as it takes', () => {
    const me = car(0, 0, { x: 10, z: 0 }, Math.PI / 2);
    const rules = new RoadRules(() => [me], () => [{ x: 2.2, z: 0.3 }]);
    for (let i = 0; i < 100; i++) expect(rules.blocked(me, 0.1)).toBe(true);
    expect(new RoadRules(() => [me], () => [{ x: -2, z: 0 }]).blocked(me, 0.1)).toBe(false);
  });

  it('two cars nose to nose: after a while one eases past, so nothing stays stuck', () => {
    const a = car(0, 0, { x: 0, z: 10 });
    const b = car(0, 3.4, { x: 0, z: -10 }, Math.PI);
    const rules = new RoadRules(() => [a, b], () => []);
    let waited = 0;
    while (rules.blocked(a, 0.1)) waited += 0.1;
    expect(waited).toBeGreaterThan(TUNING.cars.giveWaySeconds - 0.2);
    expect(waited).toBeLessThan(TUNING.cars.giveWaySeconds + 0.2);
  });

  it('a car standing still (queued, at a station) is always waited for, never driven through', () => {
    const me = car(0, 0, { x: 0, z: 10 });
    const parked = car(0, 3.4, null);
    const rules = new RoadRules(() => [me, parked], () => []);
    for (let i = 0; i < 200; i++) expect(rules.blocked(me, 0.1)).toBe(true);
  });

  it('oncoming cars in the other lane pass each other, even wide trucks', () => {
    const me = car(0, 0, { x: 20, z: 0 }, Math.PI / 2, { def: { size: [2.25, 1.95, 4.43] } });
    const oncoming = car(3.6, -1.7, { x: -20, z: -1.7 }, -Math.PI / 2);
    expect(new RoadRules(() => [me, oncoming], () => []).blocked(me, 0.1)).toBe(false);
  });

  it('cars on the tunnel conveyor together leave the spacing to the tunnel', () => {
    const tunnel = { kind: 'tunnel' };
    const a = car(0, 0, { x: 0, z: 10 }, 0, { station: tunnel });
    const b = car(0, 2, null, 0, { station: tunnel });
    expect(new RoadRules(() => [a, b], () => []).blocked(a, 0.1)).toBe(false);
  });

  it('someone walking waits for a car just in front of them, but can always step out of one', () => {
    const rect = { minX: 1, maxX: 3, minZ: -1, maxZ: 1 };
    expect(carAhead({ x: 0.5, z: 0 }, { x: 5, z: 0 }, [rect])).toBe(true);
    expect(carAhead({ x: 0.5, z: 0 }, { x: -5, z: 0 }, [rect])).toBe(false);
    expect(carAhead({ x: 2, z: 0 }, { x: 5, z: 0 }, [rect])).toBe(false);
  });
});

describe('the town is laid out for walking', () => {
  it('no walkway passes through a lamp post, street tree or anything else solid in the town', () => {
    const solids = [
      ...LOCATION1.town.filter((p) => p.solid).map((p) => ({ x: p.x, z: p.z, hw: p.solid![0], hd: p.solid![1] })),
      ...LOCATION1.town.filter((p) => p.model === 'lamp').map((p) => ({ x: p.x, z: p.z, hw: 0.2, hd: 0.2 })),
      ...LOCATION1.streetTrees.map((t) => ({ x: t.x, z: t.z, hw: 0.35, hd: 0.35 })),
    ];
    const room = 0.25;
    for (const route of LOCATION1.walkways) {
      for (let i = 1; i < route.length; i++) {
        const a = route[i - 1]!;
        const b = route[i]!;
        const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.2);
        for (let k = 0; k <= steps; k++) {
          const x = a.x + ((b.x - a.x) * k) / steps;
          const z = a.z + ((b.z - a.z) * k) / steps;
          const hit = solids.find((s) => Math.abs(x - s.x) < s.hw + room && Math.abs(z - s.z) < s.hd + room);
          expect(hit, `walkway at ${x.toFixed(1)}, ${z.toFixed(1)}`).toBeUndefined();
        }
      }
    }
  });
});
