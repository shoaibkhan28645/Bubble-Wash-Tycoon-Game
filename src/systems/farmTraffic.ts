// The farm's vehicles on the move (Chapter 2): the delivery van, the milk
// tanker, the feed truck and the pickup drive the way the town's cars do.
// Each follows its legs (forward, or backing up to turn round), pulling away
// gently, slowing for bends and easing to a stop; stops for anyone in front of
// it and keeps its distance behind another vehicle; at a crossing the one
// further from it gives way; and on a track only one vehicle wide (the farm's
// main track, in from the gate) vehicles take turns: nobody drives onto it
// while a vehicle going the other way, or turning round on it, is there. If
// two still end up waiting on each other for a long while, the first to come
// eases through, so the farm never locks up.
import type { Point, Rect } from '../core/config';
import { routeAt, routeMarks, smoothRoute } from './vehicles';

/** One leg of a drive, as a town's map gives it. */
export interface LegPlan {
  /** Where the vehicle's middle goes; corners are rounded off as it drives them. */
  path: readonly Point[];
  /** Backing up: it faces the other way from the way it goes. */
  reverse?: boolean;
  /** Seconds it stands at the end before the next leg (unloading, say). */
  hold?: number;
  /** It drives on off the map at the end, without slowing down. */
  through?: boolean;
}

/** A track one vehicle wide: vehicles going opposite ways along it take turns. */
export interface Narrow extends Rect {
  /** Which way it runs. */
  axis: 'x' | 'z';
}

interface Leg {
  path: Point[];
  marks: number[];
  length: number;
  reverse: boolean;
  hold: number;
  /** Its top speed. */
  top: number;
  /** The fastest it may be going at each point: round the bends, and stopping at the end. */
  fastest: number[];
  /** For each narrow, the ways along it this leg goes while inside it (1 one way, 2 the other). */
  ways: number[];
  /** For each narrow, how far along the leg it's last inside (-1 if never). */
  lastIn: number[];
}

/** A body in the way: its middle, which way it points (unit), half its length and width. */
interface Body {
  at: Point;
  dir: Point;
  hl: number;
  hw: number;
}

/** Driving forward on the farm's tracks and the road, and backing up (m/s). */
export const CRUISE = 7;
const REVERSE = 2.1;
/** Pulling away, and braking (m/s²): gently, and hard for someone stepping out. */
const ACCEL = 2.4;
const BRAKE = 4.5;
const HARD_BRAKE = 11;
/** How hard it takes a bend (sideways, m/s²): the tighter the bend, the slower. */
const CORNER = 2.4;
/** The radius of the bends it drives (m). */
const ROUND = 2.2;
/** Seconds stopped at the end of a leg before the next (into reverse and out again). */
const GEAR = 0.6;
/** Room kept in front, to a vehicle or a person (m). */
const GAP = 0.7;
const PERSON = 0.3;
const PERSON_SIDE = 0.15;
/** How much two vehicles may brush sides before one is in the other's way. */
const SIDE_SLACK = 0.25;
/** How far apart the bodies checked along the way ahead are (m). */
const STEP = 0.5;
/** How far ahead two vehicles look to see whether their ways cross. */
const YIELD_LOOK = 7;
/** Vehicles going this nearly the same way follow each other rather than give way. */
const SAME_WAY = 0.7;
/** Vehicles this nearly head on, this far apart side to side, are passing in the other lane. */
const HEAD_ON = 0.9;
const ONCOMING_SIDE = 1.2;
/** Slower than this (m/s) counts as held up. */
const CREEP = 0.3;
/** Seconds two vehicles wait on each other before the first to come eases through. */
const GRIDLOCK = 8;
/** A vehicle waiting to go onto a narrow keeps this far back from it, out of the way of one coming off it. */
const NARROW_ROOM = 1;

let serials = 0;

export class Driver {
  /** The order vehicles came in: the first to come goes first. */
  readonly serial = ++serials;
  visible = false;
  readonly position: Point = { x: 0, z: 0 };
  /** Which way its body points (the model's rotation.y). */
  facing = 0;
  /** How fast it's going, along the way it goes (m/s). */
  speed = 0;
  /** Seconds it has been held up. */
  held = 0;
  /** Its lamps: braking, backing up, and the side it's about to turn (1 left, -1 right). */
  braking = false;
  reversing = false;
  signal = 0;
  /** Parked where it lives: its spot is solid anyway (people walk round it), so it's left out of the footprints. */
  home = false;
  /** What it last waited on (to spot two vehicles waiting on each other). */
  waitingOn: Driver | null = null;
  /** The narrow it's waiting to go onto, and the ways it'll go along it. */
  waitingFor: Narrow | null = null;
  waitWays = 0;
  legs: Leg[] = [];
  leg = 0;
  along = 0;
  /** Seconds left standing at the end of a leg. */
  wait = 0;
  /** The narrows it may drive onto, and the ways it goes along each. */
  readonly claims = new Map<Narrow, number>();

  constructor(
    readonly id: string,
    readonly length: number,
    readonly width: number,
  ) {}

  /** On its way (or standing at the end of a leg, about to go on). */
  get driving(): boolean {
    return this.leg < this.legs.length;
  }

  /** Its body now. */
  body(): Body {
    return { at: this.position, dir: { x: Math.sin(this.facing), z: Math.cos(this.facing) }, hl: this.length / 2, hw: this.width / 2 };
  }

  /** The ground it covers (its corners, turned with it). */
  footprint(): Rect {
    const { at, dir, hl, hw } = this.body();
    const ex = Math.abs(dir.x) * hl + Math.abs(dir.z) * hw;
    const ez = Math.abs(dir.z) * hl + Math.abs(dir.x) * hw;
    return { minX: at.x - ex, maxX: at.x + ex, minZ: at.z - ez, maxZ: at.z + ez };
  }
}

export class FarmTraffic {
  readonly drivers: Driver[] = [];
  /** Each driver's way ahead this frame, worked out once (`frame` says which frame). */
  private readonly ahead = new Map<Driver, { frame: number; bodies: (Body & { d: number })[] }>();
  private frame = 0;
  /** The narrows, each with room round it to wait in. */
  private readonly narrows: readonly Narrow[];

  constructor(
    /** Where the people are: the hero, the staff, villagers. */
    private readonly people: () => Iterable<Point>,
    narrows: readonly Narrow[] = [],
  ) {
    this.narrows = narrows.map((n) => ({ ...n, minX: n.minX - NARROW_ROOM, maxX: n.maxX + NARROW_ROOM, minZ: n.minZ - NARROW_ROOM, maxZ: n.maxZ + NARROW_ROOM }));
  }

  add(id: string, length: number, width: number): Driver {
    const driver = new Driver(id, length, width);
    this.drivers.push(driver);
    return driver;
  }

  /** Sends a vehicle along these legs, from the start of the first (already going `speed`, coming on from off the map). */
  plan(driver: Driver, legs: readonly LegPlan[], speed = 0): void {
    driver.legs = legs.filter((l) => l.path.length >= 2).map((l) => this.leg(l));
    driver.leg = 0;
    driver.along = 0;
    driver.wait = 0;
    driver.speed = speed;
    driver.held = 0;
    driver.visible = true;
    driver.home = false;
    driver.waitingFor = null;
    this.place(driver);
    // Already on a narrow: it's its to drive off.
    for (const narrow of this.narrows) if (!driver.claims.has(narrow) && touches(driver.body(), narrow)) driver.claims.set(narrow, this.waysLeft(driver, narrow) || 3);
  }

  /** Stands a vehicle where it parks, facing `facing`. */
  park(driver: Driver, at: Point, facing: number, home = true): void {
    driver.legs = [];
    driver.leg = 0;
    driver.speed = 0;
    driver.visible = true;
    driver.home = home;
    driver.position.x = at.x;
    driver.position.z = at.z;
    driver.facing = facing;
    driver.claims.clear();
    driver.waitingFor = null;
    driver.braking = driver.reversing = false;
    driver.signal = 0;
  }

  /** Off the map. */
  hide(driver: Driver): void {
    driver.legs = [];
    driver.leg = 0;
    driver.speed = 0;
    driver.visible = false;
    driver.claims.clear();
    driver.waitingFor = null;
    driver.braking = driver.reversing = false;
  }

  /** Every vehicle on the move or stopped on its way: nobody walks through one. */
  footprints(): Rect[] {
    return this.drivers.filter((d) => d.visible && !d.home).map((d) => d.footprint());
  }

  /**
   * Whether the way's clear to set off on these legs: no narrow on them is taken by a vehicle going
   * the other way (or turning round on it). A vehicle that can wait where it is (the pickup, being
   * loaded) waits there rather than set off and stand at the end of the narrow.
   */
  clear(driver: Driver, legs: readonly LegPlan[]): boolean {
    const built = legs.filter((l) => l.path.length >= 2).map((l) => this.leg(l));
    return this.narrows.every((narrow, i) => {
      const ways = built.reduce((w, l) => w | (l.ways[i] ?? 0), 0);
      if (ways === 0) return true;
      return !this.drivers.some((o) => {
        const theirs = o === driver || !o.visible ? undefined : o.claims.get(narrow);
        return theirs !== undefined && (theirs | ways) === 3;
      });
    });
  }

  /** Starts a new frame (call once a frame, before driving). */
  tick(): void {
    this.frame++;
  }

  /** How long the legs take with nothing in the way (seconds), from `speed`. */
  seconds(legs: readonly LegPlan[], speed = 0): number {
    const probe = new Driver('probe', 1, 1);
    probe.legs = legs.filter((l) => l.path.length >= 2).map((l) => this.leg(l));
    probe.speed = speed;
    const dt = 1 / 20;
    let t = 0;
    while (probe.driving && t < 600) {
      t += dt;
      if (probe.wait > 0) {
        probe.wait -= dt;
        if (probe.wait <= 0) this.nextLeg(probe);
        continue;
      }
      const leg = probe.legs[probe.leg]!;
      const top = this.fastestAt(probe, leg);
      probe.speed = probe.speed < top ? Math.min(top, probe.speed + ACCEL * dt) : Math.max(top, probe.speed - HARD_BRAKE * dt);
      probe.along += Math.max(probe.speed, 0.05) * dt;
      if (probe.along >= leg.length) this.endLeg(probe, leg);
    }
    return t;
  }

  /** One frame of driving for one vehicle; true once it has driven all its legs. */
  drive(driver: Driver, dt: number): boolean {
    if (!driver.driving) return true;
    if (driver.wait > 0) {
      driver.speed = 0;
      driver.braking = true;
      driver.wait -= dt;
      if (driver.wait > 0) return false;
      this.nextLeg(driver);
      if (!driver.driving) return true;
      this.place(driver);
    }
    const leg = driver.legs[driver.leg]!;
    this.release(driver);
    driver.waitingOn = null;
    driver.waitingFor = null;
    const free = this.room(driver, leg);
    const top = Math.min(this.fastestAt(driver, leg), Math.sqrt(2 * BRAKE * Math.max(0, free)));
    const before = driver.speed;
    driver.speed = before < top ? Math.min(top, before + ACCEL * dt) : Math.max(top, before - HARD_BRAKE * dt);
    driver.braking = driver.speed < before - 0.02 || (driver.speed < 0.05 && driver.held > 0);
    driver.reversing = leg.reverse;
    const step = Math.min(driver.speed * dt, Math.max(0, free));
    if (step < driver.speed * dt) driver.speed = step / Math.max(dt, 1e-4);
    // Held up: stopped, or barely creeping, for something in the way (not just pulling away).
    driver.held = free < 1 && step < CREEP * dt ? driver.held + dt : 0;
    driver.along += step;
    if (driver.along >= leg.length - 1e-3) {
      driver.along = leg.length;
      driver.speed = 0;
      this.place(driver);
      this.endLeg(driver, leg);
      return !driver.driving;
    }
    this.place(driver);
    driver.signal = leg.reverse ? 0 : this.turnAhead(leg, driver.along);
    return false;
  }

  private endLeg(driver: Driver, leg: Leg): void {
    driver.wait = leg.hold + (driver.leg < driver.legs.length - 1 ? GEAR : 0);
    if (driver.wait <= 0) this.nextLeg(driver);
  }

  private nextLeg(driver: Driver): void {
    driver.leg++;
    driver.along = 0;
    driver.wait = 0;
  }

  /** How far it can go before it must stop: for people, vehicles, a narrow it must wait to go onto, a crossing it gives way at. */
  private room(driver: Driver, leg: Leg): number {
    let free = Infinity;
    const look = driver.length / 2 + GAP + (driver.speed * driver.speed) / (2 * BRAKE) + 2;
    const ahead = this.sweep(driver, Math.max(look, YIELD_LOOK));
    const near = ahead.filter((b) => b.d <= look);
    const way = travel(driver, leg);
    const hl = driver.length / 2;
    // People: anyone in front, on its way.
    for (const person of this.people()) {
      const rx = person.x - driver.position.x;
      const rz = person.z - driver.position.z;
      if (rx * way.x + rz * way.z < hl * 0.6) continue;
      for (const body of near) {
        if (body.d - STEP >= free) break;
        if (inside(person, { ...body, hl: body.hl + PERSON, hw: driver.width / 2 + PERSON_SIDE })) {
          free = Math.min(free, body.d - STEP);
          break;
        }
      }
    }
    const mine = driver.body();
    for (const other of this.drivers) {
      if (other === driver || !other.visible) continue;
      const them = other.body();
      const r = { x: driver.position.x - other.position.x, z: driver.position.z - other.position.z };
      // Coming the other way in the other lane: they just pass.
      if (dot(them.dir, way) * (other.legs[other.leg]?.reverse ? -1 : 1) < -HEAD_ON && Math.abs(r.x * them.dir.z - r.z * them.dir.x) > ONCOMING_SIDE) continue;
      // Long held up by each other: the one with the right of way (on the narrow, or else the first to come) eases through.
      const first = driver.claims.size > other.claims.size || (driver.claims.size === other.claims.size && driver.serial < other.serial);
      if (driver.held > GRIDLOCK && other.waitingOn === driver && first) continue;
      if (overlap({ ...mine, dir: way, hw: mine.hw - SIDE_SLACK }, them)) {
        // Already overlapping: the one in front drives out of it, the one behind waits.
        if (dot(way, r) < -0.1) {
          free = 0;
          driver.waitingOn = other;
        }
        continue;
      }
      // Never held up by a vehicle behind it.
      if (dot(way, r) > hl) continue;
      for (const body of near) {
        if (body.d - STEP >= free) break;
        if (overlap({ ...body, hw: driver.width / 2 - SIDE_SLACK }, them)) {
          free = Math.min(free, body.d - STEP);
          driver.waitingOn = other;
          break;
        }
      }
    }
    // A narrow: onto it only when nobody's on it going the other way (or turning round on it).
    for (const narrow of this.narrows) {
      if (driver.claims.has(narrow)) continue;
      const at = near.find((b) => touches({ ...b, hl: b.hl - GAP / 2, hw: driver.width / 2 }, narrow));
      if (!at) continue;
      const ways = this.waysLeft(driver, narrow) || 3;
      const busy =
        this.drivers.find((o) => {
          const theirs = o === driver || !o.visible ? undefined : o.claims.get(narrow);
          return theirs !== undefined && (theirs | ways) === 3;
        }) ??
        // First come, first served: one that has waited longer to go the other way goes first.
        this.drivers.find((o) => o !== driver && o.visible && o.waitingFor === narrow && o.held > driver.held + 0.5 && (o.waitWays | ways) === 3);
      if (busy) {
        free = Math.min(free, at.d - STEP);
        driver.waitingOn = busy;
        driver.waitingFor = narrow;
        driver.waitWays = ways;
      } else driver.claims.set(narrow, ways);
    }
    // A crossing: the one further from it gives way (unless it's already in the other's way), and
    // never to a vehicle that's held up itself (that one may be waiting for this one).
    for (const other of this.drivers) {
      if (other === driver || !other.visible || !other.driving || other.wait > 0 || other.held > 0.3) continue;
      const theirs = this.sweep(other, YIELD_LOOK);
      if (theirs.length === 0 || dot(travelNow(other), way) > SAME_WAY) continue;
      let mineAt = Infinity;
      let theirsAt = Infinity;
      for (const a of ahead) {
        for (const b of theirs) {
          if (!overlap({ ...a, hw: driver.width / 2 - SIDE_SLACK }, { ...b, hw: other.width / 2 - SIDE_SLACK })) continue;
          mineAt = Math.min(mineAt, a.d);
          theirsAt = Math.min(theirsAt, b.d);
        }
      }
      if (mineAt === Infinity || mineAt <= STEP) continue;
      if (theirsAt < mineAt || (theirsAt === mineAt && other.serial < driver.serial)) {
        free = Math.min(free, mineAt - 2 * STEP);
        driver.waitingOn = other;
      }
    }
    return free;
  }

  /** Lets go of the narrows it has left behind for good. */
  private release(driver: Driver): void {
    for (const narrow of [...driver.claims.keys()]) {
      if (touches(driver.body(), narrow)) continue;
      const i = this.narrows.indexOf(narrow);
      const leg = driver.legs[driver.leg];
      const still = (leg && leg.lastIn[i]! >= driver.along) || driver.legs.slice(driver.leg + 1).some((l) => l.lastIn[i]! >= 0);
      if (!still) driver.claims.delete(narrow);
    }
  }

  /** The ways along a narrow it'll go, from here to the end of its legs. */
  private waysLeft(driver: Driver, narrow: Narrow): number {
    const i = this.narrows.indexOf(narrow);
    let ways = 0;
    for (let l = driver.leg; l < driver.legs.length; l++) ways |= driver.legs[l]!.ways[i] ?? 0;
    return ways;
  }

  /** Its body at points along the way ahead (`d` on from where it is), up to `distance`, on this leg. */
  private sweep(driver: Driver, distance: number): (Body & { d: number })[] {
    const kept = this.ahead.get(driver);
    if (kept && kept.frame === this.frame && kept.bodies.length > 0 && kept.bodies[kept.bodies.length - 1]!.d >= distance - STEP) return kept.bodies.filter((b) => b.d <= distance);
    const bodies: (Body & { d: number })[] = [];
    const leg = driver.legs[driver.leg];
    if (leg && driver.wait <= 0) {
      const hl = driver.length / 2;
      for (let d = STEP; d <= distance + 1e-6; d += STEP) {
        const s = Math.min(leg.length, driver.along + d);
        const nose = pointAt(leg, s + hl + GAP);
        const tail = pointAt(leg, s - hl);
        const dx = nose.x - tail.x;
        const dz = nose.z - tail.z;
        const len = Math.hypot(dx, dz);
        if (len < 1e-4) break;
        bodies.push({ at: { x: (nose.x + tail.x) / 2, z: (nose.z + tail.z) / 2 }, dir: { x: dx / len, z: dz / len }, hl: len / 2, hw: driver.width / 2, d });
        if (s >= leg.length) break;
      }
    }
    this.ahead.set(driver, { frame: this.frame, bodies });
    return bodies;
  }

  /** The fastest it may go where it is: its top speed, round the bend, stopping at the end. */
  private fastestAt(driver: Driver, leg: Leg): number {
    const { marks, fastest } = leg;
    let i = 1;
    while (i < marks.length - 1 && marks[i]! < driver.along) i++;
    const next = fastest[i]!;
    return Math.min(leg.top, Math.sqrt(next * next + 2 * BRAKE * Math.max(0, marks[i]! - driver.along)));
  }

  /** Which way the leg bends a little way ahead: 1 left, -1 right, 0 straight on. */
  private turnAhead(leg: Leg, along: number): number {
    const a = routeAt(leg.path, leg.marks, along + 1).heading;
    const b = routeAt(leg.path, leg.marks, along + 8).heading;
    const turn = Math.atan2(Math.sin(b - a), Math.cos(b - a));
    return Math.abs(turn) < 0.6 ? 0 : Math.sign(turn);
  }

  /** Puts the vehicle where it is along its leg, its body lined up from its back wheels to its front. */
  private place(driver: Driver): void {
    const leg = driver.legs[driver.leg];
    if (!leg) return;
    const k = driver.length * 0.3;
    const at = pointAt(leg, driver.along);
    const front = pointAt(leg, driver.along + k);
    const back = pointAt(leg, driver.along - k);
    driver.position.x = at.x;
    driver.position.z = at.z;
    driver.facing = Math.atan2(front.x - back.x, front.z - back.z) + (leg.reverse ? Math.PI : 0);
  }

  private leg(plan: LegPlan): Leg {
    const path = smoothRoute(plan.path, ROUND);
    const marks = routeMarks(path);
    const length = marks[marks.length - 1] ?? 0;
    const top = plan.reverse ? REVERSE : CRUISE;
    // Round a bend no faster than it can take it; then, working back from the end, slow in time for each.
    const limit = path.map((_, i) => {
      if (i === 0 || i === path.length - 1) return top;
      const [a, b, c] = [path[i - 1]!, path[i]!, path[i + 1]!];
      const turn = Math.abs(Math.atan2((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x), (b.x - a.x) * (c.x - b.x) + (b.z - a.z) * (c.z - b.z)));
      const span = (marks[i + 1]! - marks[i - 1]!) / 2;
      return turn < 1e-3 ? top : Math.min(top, Math.sqrt((CORNER * span) / turn));
    });
    const fastest = [...limit];
    fastest[fastest.length - 1] = plan.through ? top : 0;
    for (let i = fastest.length - 2; i >= 0; i--) fastest[i] = Math.min(limit[i]!, Math.sqrt(fastest[i + 1]! ** 2 + 2 * BRAKE * (marks[i + 1]! - marks[i]!)));
    const ways: number[] = [];
    const lastIn: number[] = [];
    for (const narrow of this.narrows) {
      let w = 0;
      let last = -1;
      for (let i = 0; i < path.length; i++) {
        if (!within(path[i]!, narrow)) continue;
        last = marks[i]!;
        const j = Math.min(path.length - 1, i + 1);
        const h = i === j ? 0 : narrow.axis === 'z' ? path[j]!.z - path[i]!.z : path[j]!.x - path[i]!.x;
        if (Math.abs(h) > 0.05 * Math.max(1e-6, marks[j]! - marks[i]!)) w |= h > 0 ? 1 : 2;
      }
      ways.push(w);
      lastIn.push(last);
    }
    return { path, marks, length, reverse: !!plan.reverse, hold: plan.hold ?? 0, top, fastest, ways, lastIn };
  }
}

/** A point `s` along a leg, carrying on straight past either end. */
function pointAt(leg: Leg, s: number): Point {
  const { path, marks, length } = leg;
  if (s >= 0 && s <= length) return routeAt(path, marks, s).at;
  const [a, b] = s < 0 ? [path[1]!, path[0]!] : [path[path.length - 2]!, path[path.length - 1]!];
  const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const over = s < 0 ? -s : s - length;
  return { x: b.x + ((b.x - a.x) / len) * over, z: b.z + ((b.z - a.z) / len) * over };
}

/** Which way it's going along its leg (unit). */
function travel(driver: Driver, leg: Leg): Point {
  const a = pointAt(leg, driver.along);
  const b = pointAt(leg, driver.along + 0.5);
  const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
}

function travelNow(driver: Driver): Point {
  const leg = driver.legs[driver.leg];
  return leg ? travel(driver, leg) : { x: Math.sin(driver.facing), z: Math.cos(driver.facing) };
}

function within(p: Point, r: Rect): boolean {
  return p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ;
}

/** A person (a point) inside a body. */
function inside(p: Point, body: Body): boolean {
  const rx = p.x - body.at.x;
  const rz = p.z - body.at.z;
  return Math.abs(rx * body.dir.x + rz * body.dir.z) <= body.hl && Math.abs(rx * body.dir.z - rz * body.dir.x) <= body.hw;
}

/** A body over a rect (a narrow). */
function touches(body: Body, r: Rect): boolean {
  const hx = (r.maxX - r.minX) / 2;
  const hz = (r.maxZ - r.minZ) / 2;
  return overlap(body, { at: { x: r.minX + hx, z: r.minZ + hz }, dir: { x: 0, z: 1 }, hl: hz, hw: hx });
}

/** Two bodies overlap (separating axes). */
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
