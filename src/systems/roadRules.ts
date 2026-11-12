// Cars are solid: before each step a moving car checks the stretch of its
// route just ahead, following its turns, and waits while its body there
// would run into another car or a person. Where two cars' ways cross or
// merge, the car that came on later gives way before it reaches the other's
// path, so the two don't end up nose to nose. If cars still lock up waiting
// on each other (gridlock), the one that came first eases through after a
// few seconds (two head to head, or a ring of them round a crossing); a
// parked or queued car and a person are never driven through.
import { type Point, type Rect } from '../core/config';
import { insideRect } from './stations';
import type { Car } from './cars';

/** Room kept to the car in front, and to a person, in metres. */
const CAR_GAP = 0.35;
const PERSON_GAP = 0.5;
/** A person's size ahead of a car, and how close to its path (side on) they must be to hold it up. */
const PERSON = 0.3;
const PERSON_SIDE = 0.15;
/** Oncoming cars further off to the side than this are in the other lane. */
const ONCOMING_SIDE = 1.2;
/** How much two cars may brush sides before one counts as in the other's way (the tail of a long car in a line). */
const SIDE_SLACK = 0.25;
/** How far along its route a car checks, in steps (more than a car drives in one frame). */
const LOOK = 1;
const STEP = 0.25;
/** How far ahead of a car with right of way, and how far out to its side, another car keeps out of its path. */
const YIELD_AHEAD = 3.5;
const YIELD_SIDE = 1.2;
/** Cars going this nearly the same way follow each other rather than give way. */
const SAME_WAY = 0.7;
/** Cars this nearly head on are coming the other way (not one cutting a corner across the road). */
const HEAD_ON = 0.9;
/** Seconds cars stay locked up waiting on each other before the first to come eases through. */
const GRIDLOCK = 4;
/** The most cars in a ring of gridlock looked for. */
const RING = 12;
/** A car about to drive onto the road looks this far along its way; the traffic coming along the road, this far ahead of each car. */
const JOIN_LOOK = 5;
const JOIN_AHEAD = 10;

/** What the rules need of a car. */
type RoadCar = Pick<Car, 'position' | 'aim' | 'facing' | 'def' | 'model' | 'state' | 'station' | 'serial' | 'held' | 'heldFor'> & Partial<Pick<Car, 'pathKey'>>;

/** A car's body: centre, which way it points (unit), half length and half width. */
interface Body {
  at: Point;
  dir: Point;
  hl: number;
  hw: number;
}

export class RoadRules {
  /** Which car each held-up car last waited on. */
  private readonly waitingOn = new Map<RoadCar, RoadCar>();
  /** A car easing through gridlock, and the car it is getting past: it carries on until they're clear. */
  private readonly passing = new Map<RoadCar, RoadCar>();

  constructor(
    private readonly cars: () => Iterable<RoadCar>,
    /** Where the people are: the player, staff, shoppers, people out walking. */
    private readonly people: () => Point[],
    /** Which lane of the road a point is in (null: off the road). Cars pulling into a lane give way to the traffic along it. */
    private readonly laneAt: (p: Point) => string | null = () => null,
  ) {}

  blocked(car: RoadCar): boolean {
    const dir = heading(car);
    if (!dir) return false;
    const p = car.position;
    const [width, , length] = car.def.size;
    // Nobody steps out in front of a car: people always get to cross.
    for (const person of this.people()) {
      const { along, side } = relative(p, dir, person);
      if (along > 0 && along < length / 2 + PERSON + PERSON_GAP && side < width / 2 + PERSON_SIDE) return true;
    }
    this.waitingOn.delete(car);
    const passing = this.passing.get(car);
    this.passing.delete(car);
    const ahead = sweep(car, LOOK);
    // About to pull into a lane of the road (out of the forecourt or the lot, or across the road into the
    // forecourt): it waits for a gap in the traffic along that lane, rather than pull out in front of a
    // car and stop across its way.
    const here = this.laneAt(tip(p, dir, length / 2));
    const entry = sweep(car, JOIN_LOOK);
    const joining = new Set<string>();
    for (const body of entry) {
      const lane = this.laneAt(tip(body.at, body.dir, body.hl));
      if (lane !== null && lane !== here) joining.add(lane);
    }
    let held = false;
    for (const other of this.cars()) {
      if (other === car || !other.model.mesh.visible || other.state === 'angry' || sameTunnel(car, other)) continue;
      // Anything in its path holds it up, moving or standing. Cars stuck in a ring each waiting on the
      // next (gridlock) for a few seconds: the one that came first eases through, all the way past.
      if (hits(car, ahead, other)) {
        if (other === passing || (car.heldFor > GRIDLOCK && this.ringBack(other, car))) {
          this.passing.set(car, other);
          continue;
        }
        this.waitingOn.set(car, other);
        return true;
      }
      const near = Math.hypot(other.position.x - p.x, other.position.z - p.z) < JOIN_AHEAD + JOIN_LOOK + length;
      const lane = joining.size > 0 && near && !other.held ? this.laneAt(other.position) : null;
      if (lane !== null && joining.has(lane) && heading(other) && crosses(sweep(other, JOIN_AHEAD), entry)) {
        this.waitingOn.set(car, other);
        held = true;
        continue;
      }
      // Give way to a car that came on earlier and is about to drive through where this one is heading,
      // unless this car is already in its path (then it carries on and clears it), or that car is held
      // up itself (it may be waiting for this one). A car still in the lane, facing the way the other
      // goes (about to turn off it, say), just carries on.
      const way = heading(other);
      const body = { x: Math.sin(car.facing), z: Math.cos(car.facing) };
      if (!way || other.held || other.serial >= car.serial || dot(way, dir) > SAME_WAY || dot(way, body) > SAME_WAY) continue;
      if (hits(other, sweep(other, YIELD_AHEAD, YIELD_SIDE), car) && !hits(other, sweep(other, LOOK), car) && towards(car, dir, other, way)) {
        this.waitingOn.set(car, other);
        held = true;
      }
    }
    return held;
  }

  /** Following who waits on whom from `other` comes back round to `car`, every car on the way held up and come after it. */
  private ringBack(other: RoadCar, car: RoadCar): boolean {
    let at: RoadCar | undefined = other;
    for (let i = 0; i < RING && at; i++) {
      if (at === car) return true;
      if (!at.held || at.serial < car.serial) return false;
      at = this.waitingOn.get(at);
    }
    return false;
  }
}

/**
 * A car's sweeps and heading, kept while it stays where it is on the same
 * route: every car checks every other car each frame, and working each
 * one's way out again for every car checking it was most of a busy lot's
 * frame on a phone. Anything that changes them (moving, turning, a new
 * route, a new model) makes them be worked out again.
 */
interface Memo {
  x: number;
  z: number;
  facing: number;
  path: readonly Point[];
  length: number;
  first: Point | undefined;
  def: RoadCar['def'];
  heading?: Point | null;
  sweeps: Map<number, Body[]>;
}
const memos = new WeakMap<RoadCar, Memo>();

function memoOf(car: RoadCar): Memo | null {
  const path = car.pathKey;
  if (!path) return null;
  const { x, z } = car.position;
  let memo = memos.get(car);
  if (!memo || memo.x !== x || memo.z !== z || memo.facing !== car.facing || memo.path !== path || memo.length !== path.length || memo.first !== path[0] || memo.def !== car.def) {
    memo = { x, z, facing: car.facing, path, length: path.length, first: path[0], def: car.def, sweeps: new Map() };
    memos.set(car, memo);
  }
  return memo;
}

/** Which way a car is driving (towards where its route takes it next), or null if it's standing still. */
function heading(car: RoadCar): Point | null {
  const memo = memoOf(car);
  if (memo && memo.heading !== undefined) return memo.heading;
  const found = headingNow(car);
  if (memo) memo.heading = found;
  return found;
}

function headingNow(car: RoadCar): Point | null {
  const next = car.aim(STEP);
  if (!next) return null;
  const dx = next.x - car.position.x;
  const dz = next.z - car.position.z;
  const len = Math.hypot(dx, dz);
  return len < 1e-4 ? null : { x: dx / len, z: dz / len };
}

/**
 * Where a car's body will be as it drives on along its route, step by step up to `distance` (and `wide`
 * wider), with room kept in front. The body runs from its tail on the route behind to its nose on the
 * route ahead, so round a corner it cuts across it as a real car does, rather than sticking out straight.
 */
function sweep(car: RoadCar, distance: number, wide = 0): Body[] {
  const memo = memoOf(car);
  const key = distance * 100 + wide;
  const kept = memo?.sweeps.get(key);
  if (kept) return kept;
  const bodies = sweepNow(car, distance, wide);
  memo?.sweeps.set(key, bodies);
  return bodies;
}

function sweepNow(car: RoadCar, distance: number, wide: number): Body[] {
  const [width, , length] = car.def.size;
  const hl = length / 2;
  const back = { x: -Math.sin(car.facing), z: -Math.cos(car.facing) };
  // Along the route by `s` (behind the car, back the way it faces).
  const along = (s: number): Point | null => (s >= 0 ? car.aim(s) : { x: car.position.x + back.x * -s, z: car.position.z + back.z * -s });
  const bodies: Body[] = [];
  let from = car.position;
  for (let d = STEP; d <= distance + 1e-6; d += STEP) {
    const at = car.aim(d);
    // The end of its route: it stops there, so nothing further on is in its way.
    if (!at || Math.hypot(at.x - from.x, at.z - from.z) < 1e-4) break;
    from = at;
    const nose = along(d + hl + CAR_GAP)!;
    const tail = along(d - hl)!;
    const dx = nose.x - tail.x;
    const dz = nose.z - tail.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) break;
    bodies.push({ at: { x: (nose.x + tail.x) / 2, z: (nose.z + tail.z) / 2 }, dir: { x: dx / len, z: dz / len }, hl: len / 2, hw: width / 2 - SIDE_SLACK + wide });
  }
  return bodies;
}

/**
 * One of `car`'s bodies along its way runs into `other`. Two cars already
 * overlapping (after gridlock) come apart: the one in front drives out, the
 * one behind waits; a car overlapping one that stands still drives out of it.
 */
function hits(car: RoadCar, ahead: Body[], other: RoadCar): boolean {
  const first = ahead[0];
  if (!first) return false;
  const [ow, , ol] = other.def.size;
  const f = { x: Math.sin(other.facing), z: Math.cos(other.facing) };
  const them: Body = { at: other.position, dir: f, hl: ol / 2, hw: ow / 2 };
  const [width, , length] = car.def.size;
  // Coming the other way in the other lane: they just pass (wide trucks reach over the line).
  const r = { x: car.position.x - other.position.x, z: car.position.z - other.position.z };
  if (dot(f, first.dir) < -HEAD_ON && Math.abs(r.x * f.z - r.z * f.x) > ONCOMING_SIDE) return false;
  if (overlap({ at: car.position, dir: first.dir, hl: length / 2, hw: width / 2 - SIDE_SLACK }, them)) {
    // A standing car can't move off: this one drives out of it.
    if (!heading(other)) return false;
    const away = dot(first.dir, r);
    return away < -0.1 || (Math.abs(away) <= 0.1 && car.serial > other.serial);
  }
  // Never held up by a car behind it (round a tight turn its tail may seem to swing into one).
  const facing = { x: Math.sin(car.facing), z: Math.cos(car.facing) };
  if (dot(facing, r) > length / 2) return false;
  return ahead.some((body) => overlap(body, them));
}

/** Where a body's front is: `hl` on from `at` along `dir`. */
function tip(at: Point, dir: Point, hl: number): Point {
  return { x: at.x + dir.x * hl, z: at.z + dir.z * hl };
}

/** Two cars' ways run into each other somewhere along them. */
function crosses(a: Body[], b: Body[]): boolean {
  return a.some((x) => b.some((y) => overlap(x, y)));
}

/** Two cars' bodies overlap (separating axes). */
function overlap(a: Body, b: Body): boolean {
  const d = { x: b.at.x - a.at.x, z: b.at.z - a.at.z };
  const reach = (body: Body, axis: Point) => body.hl * Math.abs(dot(body.dir, axis)) + body.hw * Math.abs(body.dir.x * axis.z - body.dir.z * axis.x);
  for (const axis of [a.dir, { x: -a.dir.z, z: a.dir.x }, b.dir, { x: -b.dir.z, z: b.dir.x }]) {
    if (Math.abs(dot(d, axis)) > reach(a, axis) + reach(b, axis)) return false;
  }
  return true;
}

function dot(a: Point, b: Point): number {
  return a.x * b.x + a.z * b.z;
}

/** `car` is heading into `other`'s path (not already driving away from it). */
function towards(car: RoadCar, dir: Point, other: RoadCar, way: Point): boolean {
  // Which side of the other car's line it's on, and whether its way crosses that line.
  const rx = car.position.x - other.position.x;
  const rz = car.position.z - other.position.z;
  const offset = rx * way.z - rz * way.x;
  const drift = dir.x * way.z - dir.z * way.x;
  return offset * drift < 0 || Math.abs(offset) < car.def.size[0] / 2;
}

/** How far ahead along `dir` a point is from `p`, and how far off to the side. */
function relative(p: Point, dir: Point, q: Point): { along: number; side: number } {
  const rx = q.x - p.x;
  const rz = q.z - p.z;
  return { along: rx * dir.x + rz * dir.z, side: Math.abs(rx * dir.z - rz * dir.x) };
}

/** On the tunnel's conveyor together: the tunnel spaces them itself. */
function sameTunnel(a: RoadCar, b: RoadCar): boolean {
  return a.station !== null && a.station === b.station && a.station.kind === 'tunnel';
}

/** How far ahead a walker checks for a car, and the room kept from it. */
const WALKER_LOOK = 0.45;
const CAR_ROOM = 0.15;

/**
 * A car just in front of someone walking from `at` towards `next` (not one
 * they're already standing in: they may step out of it).
 */
export function carAhead(at: Point, next: Point, cars: readonly Rect[]): boolean {
  return carIn(at, next, cars) !== null;
}

/** Which car (its footprint) is just in front of someone walking from `at` towards `next`, if any. */
export function carIn(at: Point, next: Point, cars: readonly Rect[]): Rect | null {
  const dx = next.x - at.x;
  const dz = next.z - at.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return null;
  const probe = { x: at.x + (dx / len) * Math.min(WALKER_LOOK, len), z: at.z + (dz / len) * Math.min(WALKER_LOOK, len) };
  const grown = (r: Rect) => ({ minX: r.minX - CAR_ROOM, maxX: r.maxX + CAR_ROOM, minZ: r.minZ - CAR_ROOM, maxZ: r.maxZ + CAR_ROOM });
  return cars.find((r) => insideRect(probe, grown(r)) && !insideRect(at, grown(r))) ?? null;
}

/**
 * The way round a car (its footprint, `room` clear of it) from `at` to `to`:
 * by its nearest corner, or two, whichever way is shorter. Empty if the
 * straight way doesn't go through it.
 */
export function aroundCar(at: Point, to: Point, car: Rect, room = 0.55): Point[] {
  const r = { minX: car.minX - room, maxX: car.maxX + room, minZ: car.minZ - room, maxZ: car.maxZ + room };
  const inner = { minX: car.minX - room * 0.8, maxX: car.maxX + room * 0.8, minZ: car.minZ - room * 0.8, maxZ: car.maxZ + room * 0.8 };
  if (!crossesRect(at, to, inner)) return [];
  const corners = [
    { x: r.minX, z: r.minZ },
    { x: r.maxX, z: r.minZ },
    { x: r.maxX, z: r.maxZ },
    { x: r.minX, z: r.maxZ },
  ];
  const length = (way: Point[]) => [at, ...way, to].reduce((sum, p, i, all) => (i === 0 ? 0 : sum + Math.hypot(p.x - all[i - 1]!.x, p.z - all[i - 1]!.z)), 0);
  const clear = (way: Point[]) => [at, ...way, to].every((p, i, all) => i === 0 || !crossesRect(all[i - 1]!, p, inner));
  const ways: Point[][] = [];
  for (let i = 0; i < 4; i++) {
    ways.push([corners[i]!]);
    ways.push([corners[i]!, corners[(i + 1) % 4]!], [corners[(i + 1) % 4]!, corners[i]!]);
  }
  let best: Point[] = [];
  let shortest = Infinity;
  for (const way of ways) {
    if (!clear(way)) continue;
    const l = length(way);
    if (l < shortest) {
      shortest = l;
      best = way;
    }
  }
  return best;
}

/** The segment from `a` to `b` passes through the rect (Liang-Barsky clipping). */
function crossesRect(a: Point, b: Point, r: Rect): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  for (const [p, q] of [
    [-dx, a.x - r.minX],
    [dx, r.maxX - a.x],
    [-dz, a.z - r.minZ],
    [dz, r.maxZ - a.z],
  ] as const) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}
