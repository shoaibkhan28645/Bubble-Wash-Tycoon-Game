import { describe, expect, it } from 'vitest';
import { FarmTraffic, type Driver, type LegPlan } from '../src/systems/farmTraffic';
import { smoothRoute } from '../src/systems/vehicles';
import type { Point } from '../src/core/config';

const P = (...pts: [number, number][]): Point[] => pts.map(([x, z]) => ({ x, z }));
const DT = 1 / 30;

/** Two vehicles' bodies overlap (separating axes, a little slack at the sides). */
function overlapping(a: Driver, b: Driver): boolean {
  const body = (d: Driver) => ({ at: d.position, dir: { x: Math.sin(d.facing), z: Math.cos(d.facing) }, hl: d.length / 2, hw: d.width / 2 - 0.2 });
  const [p, q] = [body(a), body(b)];
  const dot = (u: Point, v: Point) => u.x * v.x + u.z * v.z;
  const d = { x: q.at.x - p.at.x, z: q.at.z - p.at.z };
  const reach = (o: typeof p, axis: Point) => o.hl * Math.abs(dot(o.dir, axis)) + o.hw * Math.abs(o.dir.x * axis.z - o.dir.z * axis.x);
  for (const axis of [p.dir, { x: -p.dir.z, z: p.dir.x }, q.dir, { x: -q.dir.z, z: q.dir.x }]) if (Math.abs(dot(d, axis)) > reach(p, axis) + reach(q, axis)) return false;
  return true;
}

/** Drives every driver until all are done (or time runs out), checking nobody ever overlaps. */
function run(traffic: FarmTraffic, drivers: Driver[], seconds = 60, each: (t: number) => void = () => {}): number {
  let t = 0;
  const done = new Set<Driver>();
  while (done.size < drivers.length && t < seconds) {
    traffic.tick();
    for (const d of drivers) if (!done.has(d) && traffic.drive(d, DT)) done.add(d);
    for (let i = 0; i < drivers.length; i++) for (let j = i + 1; j < drivers.length; j++) expect(overlapping(drivers[i]!, drivers[j]!), `t=${t.toFixed(2)}`).toBe(false);
    each(t);
    t += DT;
  }
  return t;
}

describe('farm traffic', () => {
  it('rounds off the corners of a route, keeping its ends', () => {
    const path = smoothRoute(P([0, 0], [10, 0], [10, 10]), 2);
    expect(path[0]).toEqual({ x: 0, z: 0 });
    expect(path.at(-1)).toEqual({ x: 10, z: 10 });
    // No point near the sharp corner; every point within the bend's radius of it.
    expect(path.some((p) => Math.hypot(p.x - 10, p.z) < 0.5)).toBe(false);
    for (const p of path) expect(p.x <= 10 + 1e-9 && p.z >= -1e-9).toBe(true);
  });

  it('pulls away, drives its leg and eases to a stop at the end', () => {
    const traffic = new FarmTraffic(() => []);
    const van = traffic.add('van', 4, 2);
    traffic.plan(van, [{ path: P([0, 0], [30, 0], [30, 20]) }]);
    let fastest = 0;
    const t = run(traffic, [van], 60, () => (fastest = Math.max(fastest, van.speed)));
    expect(van.position.x).toBeCloseTo(30, 3);
    expect(van.position.z).toBeCloseTo(20, 3);
    expect(van.speed).toBe(0);
    expect(fastest).toBeGreaterThan(5);
    // It took its time pulling away and round the bend: slower than flat out all the way.
    expect(t).toBeGreaterThan(50 / 7 + 1);
    expect(t).toBeLessThan(traffic.seconds([{ path: P([0, 0], [30, 0], [30, 20]) }]) + 0.5);
  });

  it('stops for someone in front of it, and drives on when they step aside', () => {
    const person = { x: 15, z: 0 };
    const traffic = new FarmTraffic(() => [person]);
    const van = traffic.add('van', 4, 2);
    traffic.plan(van, [{ path: P([0, 0], [30, 0]) }]);
    run(traffic, [van], 8);
    expect(van.speed).toBe(0);
    expect(van.braking).toBe(true);
    expect(van.position.x + 2).toBeLessThan(person.x - 0.5);
    expect(van.position.x + 2).toBeGreaterThan(person.x - 3);
    // Someone off to the side doesn't hold it up.
    person.z = 2.5;
    run(traffic, [van], 20);
    expect(van.position.x).toBeCloseTo(30, 3);
  });

  it('keeps its distance behind a vehicle going the same way', () => {
    const traffic = new FarmTraffic(() => []);
    const slow = traffic.add('slow', 4, 2);
    const fast = traffic.add('fast', 4, 2);
    traffic.plan(slow, [{ path: P([10, 0], [40, 0]) }]);
    traffic.plan(fast, [{ path: P([0, 0], [45, 0]) }]);
    run(traffic, [slow, fast], 40);
    expect(slow.position.x).toBeCloseTo(40, 3);
    // Stopped behind it, not through it.
    expect(fast.position.x).toBeLessThan(40 - 4);
  });

  it('takes turns on a track one vehicle wide: the one coming the other way waits outside it', () => {
    // Like the farm's main track: in from the road at its top end; one on it coming up to leave by the
    // road to the east, one coming along the road from the west to go down it.
    const narrow = { minX: -1.4, maxX: 1.4, minZ: -7, maxZ: 30, axis: 'z' as const };
    const traffic = new FarmTraffic(() => [], [narrow]);
    const leaving = traffic.add('leaving', 5.4, 2);
    const coming = traffic.add('coming', 4.4, 2);
    traffic.plan(leaving, [{ path: P([0, 22], [0, -9], [30, -9]) }]);
    traffic.plan(coming, [{ path: P([-24, -9], [0, -9], [0, 25]) }], 7);
    let bothOn = false;
    let waited = 0;
    const onIt = (d: Driver) => d.position.z > narrow.minZ && d.position.z < narrow.maxZ && Math.abs(d.position.x) < 1.5;
    run(traffic, [leaving, coming], 90, () => {
      bothOn ||= onIt(leaving) && onIt(coming);
      if (coming.held > 0) waited += DT;
    });
    expect(bothOn).toBe(false);
    expect(waited).toBeGreaterThan(0.5);
    expect(leaving.position).toEqual({ x: 30, z: -9 });
    expect(coming.position).toEqual({ x: 0, z: 25 });
  });

  it('gives way at a crossing: the two never meet', () => {
    const traffic = new FarmTraffic(() => []);
    const a = traffic.add('a', 4, 2);
    const b = traffic.add('b', 5, 2);
    traffic.plan(a, [{ path: P([-20, 0], [20, 0]) }], 7);
    traffic.plan(b, [{ path: P([0, -19], [0, 20]) }], 7);
    run(traffic, [a, b], 30);
    expect(a.position.x).toBeCloseTo(20, 3);
    expect(b.position.z).toBeCloseTo(20, 3);
  });

  it('backs up facing the other way, with its reversing lights on', () => {
    const traffic = new FarmTraffic(() => []);
    const pickup = traffic.add('pickup', 4.4, 1.9);
    const legs: LegPlan[] = [{ path: P([0, 0], [0, 10]) }, { path: P([0, 10], [0, 4], [-6, 4]), reverse: true }];
    traffic.plan(pickup, legs);
    let reversedFacing = NaN;
    run(traffic, [pickup], 40, () => {
      if (pickup.reversing && pickup.speed > 0.5 && pickup.position.z > 6) reversedFacing = pickup.facing;
    });
    // Going back up the track (-z) it faces down it (+z).
    expect(Math.cos(reversedFacing)).toBeGreaterThan(0.9);
    expect(pickup.position).toEqual({ x: -6, z: 4 });
    // At the end it faces the way it backed in from: east (+x).
    expect(Math.sin(pickup.facing)).toBeGreaterThan(0.9);
  });

  it('leaves vehicles parked at home out of the footprints, but not ones on their way', () => {
    const traffic = new FarmTraffic(() => []);
    const van = traffic.add('van', 4, 2);
    traffic.park(van, { x: 5, z: 5 }, 0);
    expect(traffic.footprints()).toEqual([]);
    traffic.plan(van, [{ path: P([5, 5], [5, 20]) }]);
    const [print] = traffic.footprints();
    expect(print).toEqual({ minX: 4, maxX: 6, minZ: 3, maxZ: 7 });
  });
});

describe("Willowbrook's vehicles together", () => {
  it('run their trips on the real farm for ten minutes without ever overlapping or locking up', async () => {
    const layout = (await import('../src/data/towns/willowbrook/layout.json')).default as unknown as import('../src/core/config').FarmLayout;
    const traffic = new FarmTraffic(() => [], layout.narrows);
    const { van: vanSpot, tanker: tankerSpot } = layout.vans;
    const m = layout.machines;
    const van = traffic.add('van', 4.16, 1.85);
    const tanker = traffic.add('tanker', 5.73, 1.95);
    const pickup = traffic.add('pickup', 3.85, 1.8);
    const truck = traffic.add('feedtruck', 5.03, 2.0);
    const facing = (route: Point[]) => Math.atan2(route[1]!.x - route[0]!.x, route[1]!.z - route[0]!.z);
    // A round trip every `every` seconds: out, away, and home along the other way.
    const rounds = [
      { d: van, spot: vanSpot!, every: 75, start: 0, trip: 70 },
      { d: tanker, spot: tankerSpot!, every: 90, start: 4, trip: 80 },
    ].map((r) => ({ ...r, state: 'home', left: 0, trips: 0, back: traffic.seconds([{ path: r.spot.back }], 7) }));
    for (const r of rounds) traffic.park(r.d, r.spot.route[0]!, facing(r.spot.route));
    traffic.park(pickup, m.pickupOut[0]!, facing(m.pickupOut));
    traffic.hide(truck);
    const visit = traffic.seconds(m.feedTruckVisit, 7);
    let pickupState = 'parked';
    let pickupTimer = 0;
    let pickupRuns = 0;
    let visits = 0;
    let visiting = false;
    let longest = 0;
    const all = [van, tanker, pickup, truck];
    for (let t = 0; t < 600; t += DT) {
      traffic.tick();
      for (const r of rounds) {
        if (r.state === 'home' && t >= r.start + r.trips * r.every) {
          traffic.plan(r.d, [{ path: r.spot.route, through: true }]);
          r.state = 'out';
          r.left = t;
        } else if (r.state === 'out' && traffic.drive(r.d, DT)) {
          traffic.hide(r.d);
          r.state = 'away';
        } else if (r.state === 'away' && t >= r.left + r.trip - r.back) {
          traffic.plan(r.d, [{ path: r.spot.back }], 7);
          r.state = 'back';
        } else if (r.state === 'back' && traffic.drive(r.d, DT)) {
          traffic.park(r.d, r.spot.route[0]!, facing(r.spot.route));
          r.state = 'home';
          r.trips++;
        }
      }
      // The feed truck every two and a half minutes (more often than the hens need it); the pickup
      // whenever it has been parked ten seconds and the main track's clear.
      if (!visiting && t >= 2 + visits * 150 + Math.max(0, 25 - visit / 2)) {
        traffic.plan(truck, m.feedTruckVisit, 7);
        visiting = true;
      } else if (visiting && traffic.drive(truck, DT)) {
        traffic.hide(truck);
        visiting = false;
        visits++;
      }
      pickupTimer += DT;
      if (pickupState === 'parked' && pickupTimer > 10 && traffic.clear(pickup, [{ path: m.pickupOut }])) {
        traffic.plan(pickup, [{ path: m.pickupOut }]);
        pickupState = 'out';
      } else if (pickupState === 'out' && traffic.drive(pickup, DT)) {
        pickupState = 'unloading';
        pickupTimer = 0;
      } else if (pickupState === 'unloading' && pickupTimer > 2) {
        traffic.plan(pickup, m.pickupBack);
        pickupState = 'back';
      } else if (pickupState === 'back' && traffic.drive(pickup, DT)) {
        traffic.park(pickup, m.pickupOut[0]!, facing(m.pickupOut));
        pickupState = 'parked';
        pickupTimer = 0;
        pickupRuns++;
      }
      for (const d of all) longest = Math.max(longest, d.held);
      for (let i = 0; i < all.length; i++)
        for (let j = i + 1; j < all.length; j++) {
          if (!all[i]!.visible || !all[j]!.visible) continue;
          expect(overlapping(all[i]!, all[j]!), `${all[i]!.id} and ${all[j]!.id} at ${t.toFixed(1)}s`).toBe(false);
        }
    }
    expect(rounds[0]!.trips).toBeGreaterThanOrEqual(7);
    expect(rounds[1]!.trips).toBeGreaterThanOrEqual(6);
    expect(visits).toBeGreaterThanOrEqual(4);
    expect(pickupRuns).toBeGreaterThanOrEqual(10);
    // Nobody waits long: at most for the feed truck to turn round on the main track.
    expect(longest).toBeLessThan(40);
  });
});

describe("Willowbrook's vehicles' ways", () => {
  it('never drive a body through a building, a pen, the windmill or a solid prop', async () => {
    const layout = (await import('../src/data/towns/willowbrook/layout.json')).default as unknown as import('../src/core/config').FarmLayout & {
      town: { model: string; x: number; z: number; solid?: [number, number] }[];
    };
    const { FARM_SOLIDS } = await import('../src/render/models/farm');
    const { routeAt, routeMarks } = await import('../src/systems/vehicles');
    type Box = { minX: number; maxX: number; minZ: number; maxZ: number; what: string };
    const boxes: Box[] = [];
    for (const [id, parts] of Object.entries(FARM_SOLIDS)) {
      const at = layout.buildAt[id] ?? layout.pads[id];
      if (!at) continue;
      for (const [hw, hd, dx = 0, dz = 0] of parts) boxes.push({ minX: at.x + dx - hw, maxX: at.x + dx + hw, minZ: at.z + dz - hd, maxZ: at.z + dz + hd, what: id });
    }
    for (const piece of layout.town) if (piece.solid) boxes.push({ minX: piece.x - piece.solid[0], maxX: piece.x + piece.solid[0], minZ: piece.z - piece.solid[1], maxZ: piece.z + piece.solid[1], what: piece.model });
    for (const [id, pen] of Object.entries(layout.pens)) boxes.push({ ...pen.run, what: `${id} run` });
    const mill = layout.sites.windmill!;
    boxes.push({ minX: mill.x - 2.1, maxX: mill.x + 2.1, minZ: mill.z - 2.1, maxZ: mill.z + 2.1, what: 'windmill' });
    const board = layout.board;
    boxes.push({ minX: board.x - 1.1, maxX: board.x + 1.1, minZ: board.z - 0.25, maxZ: board.z + 0.25, what: 'orders board' });
    const m = layout.machines;
    const ways: { who: string; size: [number, number]; legs: LegPlan[] }[] = [
      { who: 'van out', size: [4.16, 1.85], legs: [{ path: layout.vans.van!.route }] },
      { who: 'van back', size: [4.16, 1.85], legs: [{ path: layout.vans.van!.back }] },
      { who: 'tanker out', size: [5.73, 1.95], legs: [{ path: layout.vans.tanker!.route }] },
      { who: 'tanker back', size: [5.73, 1.95], legs: [{ path: layout.vans.tanker!.back }] },
      { who: 'pickup out', size: [3.85, 1.8], legs: [{ path: m.pickupOut }] },
      { who: 'pickup back', size: [3.85, 1.8], legs: m.pickupBack },
      { who: 'feed truck', size: [5.03, 2.0], legs: m.feedTruckVisit },
    ];
    for (const { who, size, legs } of ways) {
      const [length, width] = size;
      for (const leg of legs) {
        // The way as it's driven: corners rounded off as the traffic does.
        const path = smoothRoute(leg.path, 2.2);
        const marks = routeMarks(path);
        const total = marks[marks.length - 1]!;
        for (let s = 0; s <= total; s += 0.25) {
          const at = routeAt(path, marks, s).at;
          const back = routeAt(path, marks, s - length * 0.3).at;
          const front = routeAt(path, marks, s + length * 0.3).at;
          const len = Math.hypot(front.x - back.x, front.z - back.z) || 1;
          const dir = { x: (front.x - back.x) / len, z: (front.z - back.z) / len };
          // The body's corners, a few centimetres in.
          const hl = length / 2 - 0.05;
          const hw = width / 2 - 0.05;
          const corners = [
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1],
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].map(([a, b]) => ({ x: at.x + dir.x * hl * a! + dir.z * hw * b!, z: at.z + dir.z * hl * a! - dir.x * hw * b! }));
          for (const box of boxes) {
            const inside = corners.find((c) => c.x > box.minX && c.x < box.maxX && c.z > box.minZ && c.z < box.maxZ);
            expect(inside, `${who} at (${at.x.toFixed(1)}, ${at.z.toFixed(1)}) runs into the ${box.what}`).toBeUndefined();
          }
        }
      }
    }
  });
});
