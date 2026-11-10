// People out for a stroll (no business at the car wash): they walk the
// town's pavements and garden paths along routes from the layout, never the
// forecourt or across a road; sometimes stop to look in a shop window or at a
// house, and leave at the far end (or turn back at a dead end). From one dead
// end a gap in the hedge leads to the benches on the lot, and some go and sit
// there a while.
import { TUNING, type Point, type Rect } from '../core/config';
import { between } from './economy';
import type { Walker } from './mart';
import { carAhead } from './roadRules';
import type { Seat } from './waitingDrivers';

type Spot = Point & { look?: number; turn?: boolean; sit?: Seat };

/** A bench people out walking may go and sit on: from a walkway's dead end, along `via`, to one of its seats. */
export interface BenchVisit {
  from: Point;
  via: Point[];
  seats: Seat[];
}

interface Stroller {
  walker: Walker;
  path: Spot[];
  at: Point;
  /** Where along the way they'll stop for a look (index of the next point when it happens), and for how long. */
  pauseAfter: number;
  pauseLeft: number;
  speed: number;
  passed: number;
  /** Seconds kept waiting by a car in the way. */
  held: number;
  /** The seat they're on their way to, or sitting on, and for how much longer. */
  seat: Seat | null;
  sitLeft: number;
}

/** Kept waiting by a car this long, someone out walking squeezes past. */
const CAR_WAIT_SECONDS = 3;

export class Pedestrians {
  private readonly strollers: Stroller[] = [];
  private readonly spare: Walker[] = [];
  private spawnTimer = 0;
  /** The street starts out busy: the first people are already part way along. */
  private started = false;
  /** Seats someone is on, or on their way to. */
  private readonly taken = new Set<Seat>();

  constructor(
    /** The routes people walk, each from one end to the other (either way), or to a turn and back. */
    private readonly routes: readonly Spot[][],
    /** A person to show (null in tests: nobody is drawn, but the walking still happens). */
    private readonly makeWalker: () => Walker,
    private readonly rand: () => number = Math.random,
    /** Every car's footprint: people wait for a car in their way. */
    private readonly cars: () => readonly Rect[] = () => [],
    /** Benches some of them go and sit on. */
    private readonly visits: readonly BenchVisit[] = [],
  ) {}

  /** How many people are sitting on a bench right now. */
  get sitting(): number {
    return this.strollers.filter((s) => s.sitLeft > 0).length;
  }

  /** Where everyone is (passing cars stop for people on the road). */
  positions(): Point[] {
    return this.strollers.map((s) => s.at);
  }

  get count(): number {
    return this.strollers.length;
  }

  update(dt: number): void {
    const t = TUNING.streetLife;
    if (!this.started && this.routes.length > 0) {
      this.started = true;
      for (let i = 0; i < t.people - 1; i++) this.spawn(true);
    }
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.strollers.length < t.people && this.routes.length > 0) {
      this.spawn();
      this.spawnTimer = between(t.peopleEvery, this.rand);
    }
    for (const s of [...this.strollers]) this.walk(dt, s);
  }

  /** Someone sets off from one end of a route (or, `midway`, is already somewhere along it). */
  private spawn(midway = false): void {
    // Some set out for a bench with a free seat; the rest go wherever.
    const benchRoute = this.rand() < TUNING.streetLife.sitChance ? this.routes.find((r) => !!this.visitFrom(r.at(-1)!)) : undefined;
    const route = benchRoute ?? this.routes[Math.floor(this.rand() * this.routes.length)]!;
    const path = route[route.length - 1]!.turn ? [...route, ...[...route].reverse().slice(1)] : this.rand() < 0.5 ? [...route] : [...route].reverse();
    let start = path.shift()!;
    if (midway && path.length > 0) {
      const skip = Math.floor(this.rand() * path.length);
      const from = skip > 0 ? path[skip - 1]! : start;
      const to = path[skip]!;
      const k = this.rand();
      path.splice(0, skip);
      start = { x: from.x + (to.x - from.x) * k, z: from.z + (to.z - from.z) * k };
    }
    const seat = benchRoute ? this.planSit(path) : null;
    const walker = this.spare.pop() ?? this.makeWalker();
    walker.root.visible = true;
    walker.seated = false;
    walker.holding = this.rand() < TUNING.streetLife.bagChance;
    walker.root.position.set(start.x, 0, start.z);
    const t = TUNING.streetLife;
    // Maybe a stop on the way, at one of the points worth a look (not the far end).
    const stops = path.flatMap((p, i) => (p.look !== undefined && i < path.length - 1 ? [i + 1] : []));
    const pauseAfter = stops.length > 0 && this.rand() < t.pauseChance ? stops[Math.floor(this.rand() * stops.length)]! : -1;
    this.strollers.push({
      walker,
      path,
      at: { ...start },
      pauseAfter,
      pauseLeft: between(t.pauseSeconds, this.rand),
      speed: between(t.walkSpeed, this.rand),
      passed: 0,
      held: 0,
      seat,
      sitLeft: 0,
    });
  }

  /** The bench visit that starts from this dead end and has a free seat, if any. */
  private visitFrom(end: Spot): BenchVisit | undefined {
    if (!end.turn) return undefined;
    return this.visits.find((v) => Math.hypot(v.from.x - end.x, v.from.z - end.z) < 0.5 && v.seats.some((s) => !this.taken.has(s)));
  }

  /**
   * Someone who set out for a bench carries on from the dead end, through the
   * gap in the hedge, to a free seat; sits a while; then comes back the same
   * way: the visit goes into their path at the dead end.
   */
  private planSit(path: Spot[]): Seat | null {
    const at = path.findIndex((p) => p.turn);
    if (at < 0) return null;
    const end = path[at]!;
    const visit = this.visitFrom(end);
    if (!visit) return null;
    const seat = visit.seats.find((s) => !this.taken.has(s))!;
    this.taken.add(seat);
    const via = visit.via.map((p) => ({ x: p.x, z: p.z }));
    path.splice(at + 1, 0, ...via, { ...seat.front }, { ...seat.at, sit: seat }, { ...seat.front }, ...[...via].reverse(), { x: end.x, z: end.z });
    return seat;
  }

  private walk(dt: number, s: Stroller): void {
    // Sitting on a bench a while; then up, and on their way back.
    if (s.sitLeft > 0) {
      s.sitLeft -= dt;
      s.walker.update(dt);
      if (s.sitLeft <= 0) {
        s.walker.seated = false;
        if (s.seat) this.taken.delete(s.seat);
        s.seat = null;
      }
      return;
    }
    // Stopped to look in a window (facing it, across the pavement).
    if (s.passed === s.pauseAfter && s.pauseLeft > 0) {
      s.pauseLeft -= dt;
      s.walker.update(dt);
      return;
    }
    const ahead = s.path[0];
    if (ahead && s.held < CAR_WAIT_SECONDS && carAhead(s.at, ahead, this.cars())) {
      s.held += dt;
      s.walker.update(dt);
      return;
    }
    s.held = 0;
    let budget = s.speed * dt;
    while (budget > 0 && s.path.length > 0) {
      const next = s.path[0]!;
      const dx = next.x - s.at.x;
      const dz = next.z - s.at.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1e-4) s.walker.root.rotation.y = Math.atan2(dx, dz);
      if (dist <= budget) {
        s.at = { x: next.x, z: next.z };
        s.path.shift();
        s.passed++;
        budget -= dist;
        if (next.sit) {
          // Sat down on the bench, facing out from it.
          s.walker.seated = true;
          s.walker.root.rotation.y = next.sit.facing;
          s.sitLeft = between(TUNING.streetLife.sitSeconds, this.rand);
          break;
        }
        if (s.passed === s.pauseAfter) {
          // Turn to what's worth a look: a shop window, the car wash.
          s.walker.root.rotation.y = next.look ?? s.walker.root.rotation.y;
          break;
        }
      } else {
        s.at = { x: s.at.x + (dx / dist) * budget, z: s.at.z + (dz / dist) * budget };
        budget = 0;
      }
    }
    s.walker.root.position.set(s.at.x, 0, s.at.z);
    s.walker.update(dt);
    if (s.path.length === 0) {
      if (s.seat) this.taken.delete(s.seat);
      s.walker.root.visible = false;
      s.walker.holding = false;
      s.walker.seated = false;
      this.strollers.splice(this.strollers.indexOf(s), 1);
      this.spare.push(s.walker);
    }
  }
}
