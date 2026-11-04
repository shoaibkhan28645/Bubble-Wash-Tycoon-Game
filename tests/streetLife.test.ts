import { describe, expect, it } from 'vitest';
import { CARS, LOCATION1, SIDE_STREET_HALF, STREET_HALF, TUNING, type Point } from '../src/core/config';
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
    for (let t = 0; t < 3; t += 0.1) keep.update(0.1);
    expect(w.root.position.x).toBe(2);
    expect(w.root.rotation.y).toBe(Math.PI);
  });

  it('walk a dead-end route to its turn and back the way they came, then leave', () => {
    const made: Walker[] = [];
    const route = [{ x: 0, z: 0 }, { x: 10, z: 0, turn: true }];
    const people = new Pedestrians([route], () => {
      const w = walker();
      made.push(w);
      return w;
    }, first);
    people.update(0.01);
    // The one setting off starts at the route's start, never at the dead end.
    const p = made.at(-1)!;
    expect(p.root.position.x).toBeLessThan(0.1);
    let furthest = 0;
    let back = Infinity;
    for (let t = 0; t < 30 && p.root.visible; t += 0.1) {
      people.update(0.1);
      furthest = Math.max(furthest, p.root.position.x);
      if (furthest > 9.9) back = Math.min(back, p.root.position.x);
    }
    expect(furthest).toBeGreaterThan(9.9);
    expect(furthest).toBeLessThanOrEqual(10);
    expect(back).toBeLessThan(0.5);
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
    // Straight on towards its next point, stopping there.
    aim: (d: number) => {
      if (!next) return null;
      const len = Math.hypot(next.x - x, next.z - z);
      const k = Math.min(1, d / len);
      return { x: x + (next.x - x) * k, z: z + (next.z - z) * k };
    },
    facing,
    def: { size: [1.7, 1.5, 3] },
    model: { mesh: { visible: true } },
    state: 'arriving',
    station: null,
    serial: 0,
    held: false,
    heldFor: 0,
    ...extra,
  } as unknown as Car;
}

describe('road rules', () => {
  it('a car waits for a car in front of it, not one behind or beside it', () => {
    const me = car(0, 0, { x: 0, z: 10 });
    const front = car(0, 3.2, null);
    const behind = car(0, -3.5, null);
    const beside = car(3, 1, null);
    expect(new RoadRules(() => [me, front], () => []).blocked(me)).toBe(true);
    expect(new RoadRules(() => [me, behind, beside], () => []).blocked(me)).toBe(false);
    // Far enough ahead: it drives up to the gap and stops there.
    expect(new RoadRules(() => [me, car(0, 6, null)], () => []).blocked(me)).toBe(false);
  });

  it('a car stops for a person in front of it for as long as it takes', () => {
    const me = car(0, 0, { x: 10, z: 0 }, Math.PI / 2);
    const rules = new RoadRules(() => [me], () => [{ x: 2.2, z: 0.3 }]);
    for (let i = 0; i < 100; i++) expect(rules.blocked(me)).toBe(true);
    expect(new RoadRules(() => [me], () => [{ x: -2, z: 0 }]).blocked(me)).toBe(false);
  });

  it("where two ways cross, the car that came later waits short of the other's path, which drives on", () => {
    const first = car(0, 0, { x: 20, z: 0 }, Math.PI / 2, { serial: 1 });
    const later = car(4, -3.2, { x: 4, z: 10 }, 0, { serial: 2 });
    const rules = new RoadRules(() => [first, later], () => []);
    expect(rules.blocked(later)).toBe(true);
    expect(rules.blocked(first)).toBe(false);
    // Already in the way: the later car carries on to clear it, and the first one waits.
    const inTheWay = car(2.4, -0.3, { x: 2.4, z: 10 }, 0, { serial: 2 });
    const both = new RoadRules(() => [first, inTheWay], () => []);
    expect(both.blocked(inTheWay)).toBe(false);
    expect(both.blocked(first)).toBe(true);
  });

  it('a car never drives through the one in front, however long both wait', () => {
    const a = car(0, 0, { x: 0, z: 10 }, 0, { serial: 1, held: true, heldFor: 60 });
    const b = car(0, 3.2, { x: 0, z: 20 }, 0, { serial: 2, held: true, heldFor: 60 });
    expect(new RoadRules(() => [a, b], () => []).blocked(a)).toBe(true);
  });

  it('in gridlock, after a few seconds the car that came first eases through; the later one keeps waiting', () => {
    // Nose to nose, each in the other's way.
    const first = car(0, 0, { x: 0, z: 10 }, 0, { serial: 1, held: true, heldFor: 1 });
    const later = car(0, 4.2, { x: 0, z: -10 }, Math.PI, { serial: 2, held: true, heldFor: 9 });
    const rules = new RoadRules(() => [first, later], () => []);
    expect(rules.blocked(first)).toBe(true);
    expect(rules.blocked(later)).toBe(true);
    (first as { heldFor: number }).heldFor = 5;
    expect(rules.blocked(first)).toBe(false);
    expect(rules.blocked(later)).toBe(true);
    // A queued car (standing still) is never driven through.
    const queued = car(0, 4.2, null, Math.PI, { serial: 2 });
    expect(new RoadRules(() => [first, queued], () => []).blocked(first)).toBe(true);
  });

  it('in a ring of cars each waiting on the next, the one that came first eases through; the rest keep waiting', () => {
    // Four cars round a crossing, each nose to the side of the next.
    const a = car(0, 0, { x: 0, z: 10 }, 0, { serial: 1, held: true, heldFor: 1 });
    const b = car(0, 3.4, { x: 10, z: 3.4 }, Math.PI / 2, { serial: 2, held: true, heldFor: 9 });
    const c = car(3.4, 3.4, { x: 3.4, z: -10 }, Math.PI, { serial: 3, held: true, heldFor: 9 });
    const d = car(3.4, 0, { x: -10, z: 0 }, -Math.PI / 2, { serial: 4, held: true, heldFor: 9 });
    const rules = new RoadRules(() => [a, b, c, d], () => []);
    expect([a, b, c, d].map((x) => rules.blocked(x))).toEqual([true, true, true, true]);
    (a as { heldFor: number }).heldFor = 5;
    expect(rules.blocked(a)).toBe(false);
    for (const later of [b, c, d]) expect(rules.blocked(later)).toBe(true);
  });

  it('a car easing through gridlock carries on until it is past, not a step at a time', () => {
    const first = car(0, 0, { x: 0, z: 10 }, 0, { serial: 1, held: true, heldFor: 5 });
    const later = car(0, 4.2, { x: 0, z: -10 }, Math.PI, { serial: 2, held: true, heldFor: 9 });
    const rules = new RoadRules(() => [first, later], () => []);
    expect(rules.blocked(later)).toBe(true);
    expect(rules.blocked(first)).toBe(false);
    // It has just moved (its wait starts again), but it keeps going past the same car.
    (first as { heldFor: number }).heldFor = 0;
    expect(rules.blocked(first)).toBe(false);
  });

  it('a car pulling out onto the road waits at the kerb for a car coming along it, not one gone by', () => {
    // The road runs along x, 1.9 m either side of z 0 (a lane each side); the car pulls out from z -5.
    const onRoad = (p: Point) => (Math.abs(p.z) < 1.9 ? (p.z < 0 ? 'far' : 'near') : null);
    const out = () => car(0, -4.5, { x: 0, z: 5 }, 0, { serial: 1 });
    const coming = car(-8, -0.85, { x: 40, z: -0.85 }, Math.PI / 2, { serial: 2 });
    const gone = car(4, -0.85, { x: 40, z: -0.85 }, Math.PI / 2, { serial: 2 });
    const far = car(-30, -0.85, { x: 40, z: -0.85 }, Math.PI / 2, { serial: 2 });
    const a = out();
    expect(new RoadRules(() => [a, coming], () => [], onRoad).blocked(a)).toBe(true);
    const b = out();
    expect(new RoadRules(() => [b, gone], () => [], onRoad).blocked(b)).toBe(false);
    const c = out();
    expect(new RoadRules(() => [c, far], () => [], onRoad).blocked(c)).toBe(false);
    // The car on the road never waits for it.
    expect(new RoadRules(() => [a, coming], () => [], onRoad).blocked(coming)).toBe(false);
    // Turning across the far lane from the near one: it waits for a car coming along the far lane.
    const turning = car(0, 1.6, { x: 0, z: -6 }, Math.PI, { serial: 1 });
    const along = car(8, -0.85, { x: -40, z: -0.85 }, -Math.PI / 2, { serial: 2 });
    expect(new RoadRules(() => [turning, along], () => [], onRoad).blocked(turning)).toBe(true);
    expect(new RoadRules(() => [turning, along], () => [], onRoad).blocked(along)).toBe(false);
  });

  it("people walking on the pavement beside the road don't hold up the cars going by", () => {
    const truck = car(0, 0, { x: 20, z: 0 }, Math.PI / 2, { def: { size: [2.25, 1.95, 4.43] } });
    // The pavement runs 1.4 m from the middle of the near lane.
    expect(new RoadRules(() => [truck], () => [{ x: 2.5, z: 1.4 }]).blocked(truck)).toBe(false);
    expect(new RoadRules(() => [truck], () => [{ x: 2.5, z: 0.6 }]).blocked(truck)).toBe(true);
  });

  it('a car standing still (queued, at a station) is always waited for, never driven through', () => {
    const me = car(0, 0, { x: 0, z: 10 });
    const parked = car(0, 3.2, null);
    const rules = new RoadRules(() => [me, parked], () => []);
    for (let i = 0; i < 200; i++) expect(rules.blocked(me)).toBe(true);
  });

  it('oncoming cars in the other lane pass each other, even wide trucks', () => {
    const me = car(0, 0, { x: 20, z: 0 }, Math.PI / 2, { def: { size: [2.25, 1.95, 4.43] } });
    const oncoming = car(3.6, -1.7, { x: -20, z: -1.7 }, -Math.PI / 2);
    expect(new RoadRules(() => [me, oncoming], () => []).blocked(me)).toBe(false);
  });

  it('cars on the tunnel conveyor together leave the spacing to the tunnel', () => {
    const tunnel = { kind: 'tunnel' };
    const a = car(0, 0, { x: 0, z: 10 }, 0, { station: tunnel });
    const b = car(0, 2, null, 0, { station: tunnel });
    expect(new RoadRules(() => [a, b], () => []).blocked(a)).toBe(false);
  });

  it('someone walking waits for a car just in front of them, but can always step out of one', () => {
    const rect = { minX: 1, maxX: 3, minZ: -1, maxZ: 1 };
    expect(carAhead({ x: 0.5, z: 0 }, { x: 5, z: 0 }, [rect])).toBe(true);
    expect(carAhead({ x: 0.5, z: 0 }, { x: -5, z: 0 }, [rect])).toBe(false);
    expect(carAhead({ x: 2, z: 0 }, { x: 5, z: 0 }, [rect])).toBe(false);
  });
});

describe('the roads', () => {
  it('Main Street has room for the widest car in each lane, kerb to centre line', () => {
    const widest = Math.max(...CARS.map((c) => c.size[0]));
    expect(LOCATION1.roadLane - widest / 2).toBeGreaterThanOrEqual(-0.01);
    expect(LOCATION1.roadLane + widest / 2).toBeLessThanOrEqual(STREET_HALF);
    // Bubble Lane, one way: the right-hand side is driven.
    expect(LOCATION1.sideLane + widest / 2).toBeLessThanOrEqual(SIDE_STREET_HALF);
  });
});

describe('the town is laid out for walking', () => {
  it('no walkway goes on the lot, the forecourt, a road or a driveway: people out walking stay in the town', () => {
    const L = LOCATION1;
    const grow = (r: { minX: number; maxX: number; minZ: number; maxZ: number }, by: number) => ({ minX: r.minX - by, maxX: r.maxX + by, minZ: r.minZ - by, maxZ: r.maxZ + by });
    const working = [
      grow(L.lot, 0.6),
      ...Object.values(L.areas).map((a) => grow(a, 0.3)),
      // Main Street, kerb to kerb.
      { minX: -1e3, maxX: 1e3, minZ: L.roadZ - STREET_HALF - 0.1, maxZ: L.roadZ + STREET_HALF + 0.1 },
      // Bubble Lane and the lot's driveways out to it.
      { minX: L.lot.maxX, maxX: L.sideStreetX + SIDE_STREET_HALF + 0.2, minZ: L.roadZ, maxZ: 1e3 },
    ];
    for (const route of L.walkways) {
      for (let i = 1; i < route.length; i++) {
        const a = route[i - 1]!;
        const b = route[i]!;
        const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.2);
        for (let k = 0; k <= steps; k++) {
          const x = a.x + ((b.x - a.x) * k) / steps;
          const z = a.z + ((b.z - a.z) * k) / steps;
          const hit = working.find((r) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ);
          expect(hit, `walkway at ${x.toFixed(1)}, ${z.toFixed(1)}`).toBeUndefined();
        }
      }
    }
  });

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
