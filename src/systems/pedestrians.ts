// People out for a stroll (no business at the car wash): they walk the
// pavements along routes from the layout, cross at the zebra crossings,
// sometimes stop to look in a shop window, and leave at the far end.
import { TUNING, type Point, type Rect } from '../core/config';
import { between } from './economy';
import type { Walker } from './mart';
import { carAhead } from './roadRules';

type Spot = Point & { look?: number };

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
}

/** Kept waiting by a car this long, someone out walking squeezes past. */
const CAR_WAIT_SECONDS = 3;

export class Pedestrians {
  private readonly strollers: Stroller[] = [];
  private readonly spare: Walker[] = [];
  private spawnTimer = 0;
  /** The street starts out busy: the first people are already part way along. */
  private started = false;

  constructor(
    /** The routes people walk, each from one end to the other (either way). */
    private readonly routes: readonly Spot[][],
    /** A person to show (null in tests: nobody is drawn, but the walking still happens). */
    private readonly makeWalker: () => Walker,
    private readonly rand: () => number = Math.random,
    /** Every car's footprint: people wait for a car in their way. */
    private readonly cars: () => readonly Rect[] = () => [],
  ) {}

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
    const route = this.routes[Math.floor(this.rand() * this.routes.length)]!;
    const path = this.rand() < 0.5 ? [...route] : [...route].reverse();
    let start = path.shift()!;
    if (midway && path.length > 0) {
      const skip = Math.floor(this.rand() * path.length);
      const from = skip > 0 ? path[skip - 1]! : start;
      const to = path[skip]!;
      const k = this.rand();
      path.splice(0, skip);
      start = { x: from.x + (to.x - from.x) * k, z: from.z + (to.z - from.z) * k };
    }
    const walker = this.spare.pop() ?? this.makeWalker();
    walker.root.visible = true;
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
    });
  }

  private walk(dt: number, s: Stroller): void {
    // Stopped to look in a window (facing it, across the pavement).
    if (s.passed === s.pauseAfter && s.pauseLeft > 0) {
      s.pauseLeft -= dt;
      s.walker.update(dt, 0, false);
      return;
    }
    const ahead = s.path[0];
    if (ahead && s.held < CAR_WAIT_SECONDS && carAhead(s.at, ahead, this.cars())) {
      s.held += dt;
      s.walker.update(dt, 0, false);
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
    s.walker.update(dt, 0.45, false);
    if (s.path.length === 0) {
      s.walker.root.visible = false;
      s.walker.holding = false;
      this.strollers.splice(this.strollers.indexOf(s), 1);
      this.spare.push(s.walker);
    }
  }
}
