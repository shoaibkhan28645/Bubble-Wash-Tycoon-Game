import { describe, expect, it } from 'vitest';
import { LOCATION1, TUNING, type Point } from '../src/core/config';
import type { CarPool } from '../src/systems/cars';
import type { Walker } from '../src/systems/mart';
import { PassingTraffic } from '../src/systems/passing';
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

  it('brakes for anything in its lane ahead (someone on the zebra crossing), then drives on', () => {
    const pool = fakePool();
    const z = LOCATION1.roadZ + LOCATION1.roadLane;
    let inTheWay: Point[] = [];
    const passing = new PassingTraffic(pool, LOCATION1, () => inTheWay, () => 0);
    passing.update(3);
    const car = pool.cars.find((c) => c.position.z === z)!;
    inTheWay = [{ x: car.position.x + 3, z }];
    const before = car.position.x;
    passing.update(0.5);
    expect(car.position.x).toBe(before);
    inTheWay = [];
    passing.update(0.5);
    expect(car.position.x).toBeGreaterThan(before);
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
