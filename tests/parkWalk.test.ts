// Starlight Fun Park underfoot: what's solid (rides, stalls, the tracks'
// low runs and columns, trees, lamp posts) stops the hero and the visitors,
// but never stands on a queue, a pad or a way in; the visitors keep to the
// paths; and the Starlight Wheel is a ride, loaded a gondola at a time.
import { describe, expect, it } from 'vitest';
import { fixedSolids, type Point, type Rect } from '../src/core/config';
import { newGame } from '../src/core/gameState';
import { STARLIGHT } from '../src/core/starlight';
import { PARK_SOLIDS } from '../src/render/models/park';
import { Track, trackSolids } from '../src/render/track';
import { NavGrid } from '../src/systems/nav';
import { ParkCrowd, RIDES, type Ride } from '../src/systems/park';

const { layout, pads } = STARLIGHT;
const NAV_RADIUS = 0.35;
const PAVED = { paved: [...layout.paths, layout.plaza], offPath: 2.5 };

const boxes = (id: string, at: Point): Rect[] =>
  (PARK_SOLIDS[id] ?? []).map(([hw, hd, dx = 0, dz = 0]) => ({ minX: at.x + dx - hw, maxX: at.x + dx + hw, minZ: at.z + dz - hd, maxZ: at.z + dz + hd }));
const around = (at: Point, half: number): Rect => ({ minX: at.x - half, maxX: at.x + half, minZ: at.z - half, maxZ: at.z + half });

/** Trees, lamp posts and the tracks: what this pass made solid. */
function propSolids(): Rect[] {
  const rects = [...layout.trees.map((t) => around(t, 0.32 * (t.size ?? 1))), ...layout.lamps.map((l) => around(l, 0.16))];
  for (const id of ['flume', 'coaster'] as const) {
    const spot = layout.rides[id]!;
    rects.push(...trackSolids(new Track(spot.track!, id), spot.deck ? [spot.deck] : []));
  }
  return rects;
}

/** Everything solid in the finished park (every pad built). */
function allSolids(): Rect[] {
  const rects = [...propSolids(), ...fixedSolids(layout), ...boxes('gate', { x: (layout.gate.minX + layout.gate.maxX) / 2, z: layout.hedgeZ })];
  for (const bed of layout.flowerBeds) rects.push(around(bed, 1));
  for (const pad of pads) {
    const ride = pad.effects.ride ? layout.rides[pad.effects.ride] : undefined;
    const at = ride?.at ?? layout.buildAt[pad.id] ?? layout.pads[pad.id];
    if (at) rects.push(...boxes(pad.id, at));
  }
  return rects;
}

/** Where people stand or walk to: queues, ways in and out, levers, steps, pads, staff spots, the gate. */
function placesPeopleGo(): { name: string; at: Point }[] {
  const places: { name: string; at: Point }[] = [];
  for (const [id, spot] of Object.entries(layout.rides)) {
    spot.queue.forEach((at, i) => places.push({ name: `${id} queue ${i}`, at }));
    places.push({ name: `${id} enter`, at: spot.enter }, { name: `${id} lever`, at: spot.lever });
    spot.exit.forEach((at, i) => places.push({ name: `${id} exit ${i}`, at }));
    if (spot.steps) places.push({ name: `${id} steps`, at: spot.steps });
  }
  for (const [id, counter] of Object.entries(layout.counters)) {
    counter.enter.forEach((at, i) => places.push({ name: `${id} enter ${i}`, at }));
    counter.queue.forEach((at, i) => places.push({ name: `${id} queue ${i}`, at }));
  }
  for (const [id, at] of Object.entries(layout.pads)) places.push({ name: `pad ${id}`, at });
  for (const [id, at] of Object.entries(layout.upgradePads)) places.push({ name: `upgrade ${id}`, at });
  for (const [id, at] of Object.entries(layout.staffSpots)) places.push({ name: `staff ${id}`, at });
  places.push({ name: 'leave', at: layout.leave }, ...layout.out.map((at, i) => ({ name: `out ${i}`, at })));
  return places;
}

const inside = (p: Point, r: Rect, grow = 0) => p.x > r.minX - grow && p.x < r.maxX + grow && p.z > r.minZ - grow && p.z < r.maxZ + grow;
const onPaving = (p: Point) => PAVED.paved.some((r) => p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ);

describe('solid things in the park', () => {
  it('include the tracks where they run low, and their posts and columns', () => {
    for (const id of ['flume', 'coaster'] as const) {
      const spot = layout.rides[id]!;
      const track = new Track(spot.track!, id);
      const rects = trackSolids(track, spot.deck ? [spot.deck] : []);
      expect(rects.length, id).toBeGreaterThan(20);
      // Low along the way out of the station: solid there, but never inside the station (solid already).
      const [x0 = 0, z0 = 0, h0 = 0] = spot.track!.points[1]!;
      expect(h0).toBeLessThan(2);
      expect(rects.some((r) => inside({ x: x0, z: z0 }, r))).toBe(true);
      for (const r of rects) expect(inside({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 }, spot.deck!)).toBe(false);
    }
  });

  it('never stand where people queue, walk in or out, work a lever, build or stand on duty', () => {
    const rects = propSolids();
    for (const { name, at } of placesPeopleGo()) {
      const hit = rects.find((r) => inside(at, r, 0.2));
      expect(hit, `${name} at ${at.x}, ${at.z}`).toBeUndefined();
    }
  });

  it('leave a way from the gate to every ride and stall', () => {
    const nav = new NavGrid(layout.walk, allSolids(), NAV_RADIUS, PAVED);
    const goals = [...Object.entries(layout.rides).map(([id, s]) => ({ id, at: s.enter })), ...Object.entries(layout.counters).filter(([id]) => id !== 'booth').map(([id, c]) => ({ id, at: c.enter.at(-1)! }))];
    for (const { id, at } of goals) {
      const path = nav.findPath(layout.leave, at);
      let from = layout.leave;
      for (const p of path) {
        // Every leg is clear of anything solid (sampled every 10 cm).
        const n = Math.ceil(Math.hypot(p.x - from.x, p.z - from.z) / 0.1);
        for (let k = 1; k < n; k++) expect(nav.isFree({ x: from.x + ((p.x - from.x) * k) / n, z: from.z + ((p.z - from.z) * k) / n }), id).toBe(true);
        from = p;
      }
      expect(Math.hypot(from.x - at.x, from.z - at.z), id).toBeLessThan(0.75);
    }
  });
});

describe('visitors walking', () => {
  it('keep to the paths, stepping off them only near where they are going', () => {
    const nav = new NavGrid(layout.walk, allSolids(), NAV_RADIUS, PAVED);
    for (const id of ['coaster', 'flume', 'haunted', 'swings', 'wheel']) {
      const to = layout.rides[id]!.enter;
      const path = [layout.leave, ...nav.findPath(layout.leave, to)];
      let paved = 0;
      let total = 0;
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1]!;
        const b = path[i]!;
        const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25));
        for (let k = 0; k < n; k++) {
          const p = { x: a.x + ((b.x - a.x) * (k + 0.5)) / n, z: a.z + ((b.z - a.z) * (k + 0.5)) / n };
          const step = Math.hypot(b.x - a.x, b.z - a.z) / n;
          total += step;
          if (onPaving(p) || Math.hypot(p.x - to.x, p.z - to.z) < 6) paved += step;
        }
      }
      expect(paved / total, id).toBeGreaterThan(0.9);
    }
  });

  it('cut across the grass when there is no paving to keep to', () => {
    const open = new NavGrid({ minX: 0, maxX: 20, minZ: 0, maxZ: 20 }, [], NAV_RADIUS);
    expect(open.findPath({ x: 1, z: 1 }, { x: 19, z: 19 })).toEqual([{ x: 19, z: 19 }]);
  });
});

describe('the Starlight Wheel', () => {
  function wheel(): { crowd: ParkCrowd; ride: Ride } {
    let seed = 5;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const crowd = new ParkCrowd(layout, newGame(), () => 0, () => 0, null, (_from, to) => [to], { onServed: () => {}, onGaveUp: () => {}, onLaunch: () => {} }, random);
    crowd.open = true;
    crowd.addCounter('booth', 'booth', null);
    const ride = crowd.addRide('wheel', 'wheel')!;
    return { crowd, ride };
  }

  it('is a Lakeside ride built from its pad, with sixteen seats', () => {
    expect(pads.find((p) => p.id === 'wheel')!.effects.ride).toBe('wheel');
    expect(RIDES.wheel!.zone).toBe('lakeside');
    expect(RIDES.wheel!.seats).toBe(16);
    expect(RIDES.wheel!.sign).toBe('steps');
    expect(layout.rides.wheel!.at).toEqual(layout.buildAt.wheel);
  });

  it('lets riders on and off only where it says, a gondola at a time', () => {
    const { crowd, ride } = wheel();
    let down = 0;
    ride.ready = (i) => Math.floor(i / 2) === down;
    for (let t = 0; t < 120 && ride.seated < 4; t += 0.05) {
      crowd.update(0.05, () => ({ rate: 1, byPlayer: false }), () => ({ hero: false, staff: false }));
      // Riders only ever take a seat in the gondola that's down; once it's full, the next comes down.
      ride.seats.forEach((v, i) => v && expect(Math.floor(i / 2)).toBeLessThanOrEqual(down));
      if (ride.seats[down * 2]?.step === 'seated' && ride.seats[down * 2 + 1]?.step === 'seated') down++;
    }
    expect(ride.seated).toBeGreaterThanOrEqual(4);
  });
});
