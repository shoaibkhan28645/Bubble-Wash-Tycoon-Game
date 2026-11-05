// Walk-up businesses (a farm stand, a market stall): visitors on foot come
// along a walkway, line up at a counter, are served by the hero or a worker
// behind it, pay, and wander off. A visitor who waits too long gives up and
// leaves unhappy. Counters are stations like the car wash's,
// serving Customers on foot instead of cars.
import { TUNING, stationDef, type WalkUpLayout, type CounterSpot, type Dirt, type Point } from '../core/config';
import type { GameState } from '../core/gameState';
import type { Customer, CustomerState } from './customers';
import { spawnSeconds } from './economy';
import { Station } from './stations';
import type { WorldLabels } from '../ui/worldLabels';
import type { Need } from './tickets';

/** A person drawn walking (none in tests). */
export interface WalkerAvatar {
  readonly root: { position: { set(x: number, y: number, z: number): unknown }; rotation: { y: number }; visible: boolean };
  holding: boolean;
  update(dt: number, scrubbing?: boolean): void;
}

/** Tunables for visitors (each town gives its own). */
export interface VisitorRules {
  spawnSeconds: number;
  patience: number;
  walkSpeed: number;
  /** Base price range of one visit (a random amount between the two). */
  pay: [number, number];
}

/** One visitor on foot. */
export class Visitor implements Customer {
  readonly body = 'walker' as const;
  state: CustomerState = 'arriving';
  needs: Need[];
  served: Need[] = [];
  progress = 0;
  patience: number;
  patienceMax: number;
  stages = [];
  quality = 1;
  manual = false;
  supplied = true;
  /** Where they are, and the points still to walk to. */
  at: Point;
  path: Point[] = [];
  /** The counter they're lining up at (null once served or gone). */
  counter: WalkUpCounter | null = null;
  /** The base price they pay (their mood decides the tip). */
  readonly basePay: number;

  constructor(
    readonly avatar: WalkerAvatar | null,
    from: Point,
    need: Need,
    basePay: number,
    patience: number,
  ) {
    this.at = { ...from };
    this.needs = [need];
    this.basePay = basePay;
    this.patience = this.patienceMax = patience;
  }

  get position(): Point {
    return this.at;
  }

  wants(need: Need): boolean {
    return this.needs.includes(need) && !this.served.includes(need);
  }
}

/** A walk-up counter (a stand's window): a line of visitors, served one at a time from behind the counter. */
export class WalkUpCounter extends Station<Visitor> {
  /** Visitors lined up, front first (the front one is at the window once there). */
  readonly line: Visitor[] = [];

  constructor(
    id: string,
    kind: string,
    readonly spot: CounterSpot,
      labels: WorldLabels | null,
  ) {
    const { zone } = spot;
    super(id, kind, { x: (zone.minX + zone.maxX) / 2, z: (zone.minZ + zone.maxZ) / 2 }, { width: zone.maxX - zone.minX, length: zone.maxZ - zone.minZ }, stationDef(kind).padding, labels);
    // Workers stand behind the middle of the counter.
    this.side = { x: this.at.x, z: this.at.z };
  }

  /** The visitor at the window, waiting to be served. */
  get front(): Visitor | null {
    const first = this.line[0];
    return first && first.state === 'waiting' ? first : null;
  }

  override get needsWork(): boolean {
    return this.front !== null;
  }

  override get idle(): boolean {
    return this.line.length === 0;
  }

  /** Room for one more in line. */
  get hasRoom(): boolean {
    return this.line.length < Math.min(this.spot.queue.length, stationDef(this.kind).queueSpots ?? this.spot.queue.length);
  }
}

/** The first visitor at a new counter waits this long (as good as for ever). */
const FIRST_PATIENCE = 3600;

export interface ServedVisitor {
  visitor: Visitor;
  counter: WalkUpCounter;
}

/**
 * All the visitors and counters of a town's walk-up businesses: who comes when, who
 * lines up where, who's served, and who gives up.
 */
export class WalkUps {
  readonly counters: WalkUpCounter[] = [];
  readonly visitors: Visitor[] = [];
  /** The town's story: a rival takes some visitors (below 1). */
  rateFactor = 1;
  /** The town's story: a rush where every visitor pays more (dirt doesn't apply on foot). */
  rush: { dirt: Dirt; payMultiplier: number } | null = null;
  /** Rewarded boost: serving goes this much faster. */
  boost = 1;
  /** Visitors come only once their models have loaded. */
  open = false;
  private spawnTimer = 0;
  private readonly spare: WalkerAvatar[] = [];

  constructor(
    private readonly layout: WalkUpLayout,
    private readonly state: GameState,
    private readonly rules: VisitorRules,
    /** Arrival speed-up from what's built (a sign). */
    private readonly arrivalBonus: () => number,
    /** Extra patience from what's built (shade, a bench). */
    private readonly patienceBonus: () => number,
    /** A person to draw (null in tests). */
    private readonly makeAvatar: (() => WalkerAvatar | null) | null,
    private readonly onServed: (served: ServedVisitor) => void,
    private readonly onGaveUp: (visitor: Visitor) => void,
    private readonly random: () => number = Math.random,
  ) {}

  /** Opens the counter a built pad provides. */
  addCounter(padId: string, kind: string, labels: WorldLabels | null): void {
    const spot = this.layout.counters[padId];
    if (!spot || this.counters.some((c) => c.id === padId)) return;
    this.counters.push(new WalkUpCounter(padId, kind, spot, labels));
  }

  /**
   * A new town opens with a visitor already waiting at the first window,
   * as the car wash opens on a car in the bay: the first thing to
   * do is right there. They wait as long as it takes.
   */
  parkFirst(): void {
    const counter = this.counters[0];
    if (!counter || counter.line.length > 0) return;
    const at = counter.spot.queue[0]!;
    const [low, high] = this.rules.pay;
    const avatar = this.makeAvatar?.() ?? null;
    const visitor = new Visitor(avatar, at, stationDef(counter.kind).serves ?? '', Math.round((low + high) / 2), FIRST_PATIENCE);
    avatar?.root.position.set(at.x, 0, at.z);
    if (avatar) avatar.root.rotation.y = counter.spot.facing;
    visitor.counter = counter;
    visitor.state = 'waiting';
    counter.line.push(visitor);
    this.visitors.push(visitor);
  }

  /** Where visitors are (the player walks round them). */
  positions(): Point[] {
    return this.visitors.map((t) => t.at);
  }

  /**
   * One frame. `rate` says how hard each counter is being worked (the
   * hero or a worker behind it). Returns true if the hero served someone.
   */
  update(dt: number, rate: (counter: WalkUpCounter) => { rate: number; byPlayer: boolean }): boolean {
    this.spawn(dt);
    let playerWorking = false;
    for (const visitor of [...this.visitors]) this.walk(dt, visitor);
    for (const counter of this.counters) {
      const front = counter.front;
      const work = rate(counter);
      if (front && work.rate > 0) {
        if (work.byPlayer) {
          front.manual = true;
          playerWorking = true;
        }
        front.progress = Math.min(1, front.progress + (dt * work.rate * this.boost) / (stationDef(counter.kind).seconds ?? 1));
        if (front.progress >= 1) this.serve(counter, front);
      }
      counter.showProgress(!!counter.front, counter.front?.progress ?? 0, false);
    }
    for (const visitor of [...this.visitors]) {
      if (visitor.state !== 'queued' && visitor.state !== 'waiting') continue;
      visitor.patience -= dt;
      if (visitor.patience <= 0) this.giveUp(visitor);
    }
    return playerWorking;
  }

  /** A new visitor when the timer says (the stars and what's built speed it up), heading for the shortest line. */
  private spawn(dt: number): void {
    if (!this.open || this.counters.length === 0) return;
    const interval = spawnSeconds(this.rules.spawnSeconds, this.state.stars, TUNING.stars.arrivalPerStar, this.arrivalBonus()) / this.rateFactor;
    this.spawnTimer += dt;
    if (this.spawnTimer < interval) return;
    const open = this.counters.filter((c) => c.hasRoom);
    if (open.length === 0) return;
    this.spawnTimer = 0;
    const counter = open.reduce((best, c) => (c.line.length < best.line.length ? c : best));
    const from = this.layout.entrances[Math.floor(this.random() * this.layout.entrances.length)]!;
    const [low, high] = this.rules.pay;
    const pay = Math.round(low + (high - low) * this.random()) * (this.rush?.payMultiplier ?? 1);
    const patience = this.rules.patience * (1 + this.patienceBonus());
    const avatar = this.spare.pop() ?? this.makeAvatar?.() ?? null;
    if (avatar) {
      avatar.root.visible = true;
      avatar.holding = false;
      avatar.root.position.set(from.x, 0, from.z);
    }
    const visitor = new Visitor(avatar, from, stationDef(counter.kind).serves ?? '', pay, patience);
    this.visitors.push(visitor);
    this.join(visitor, counter);
  }

  /** Lines up at a counter: along the walkway, round the counter's side, then to the next free spot in its line. */
  private join(visitor: Visitor, counter: WalkUpCounter): void {
    visitor.counter = counter;
    visitor.state = 'arriving';
    counter.line.push(visitor);
    const spot = counter.spot.queue[counter.line.length - 1]!;
    const { approach } = counter.spot;
    const mid = this.layout.walkwayZ;
    visitor.path = [{ x: approach.x, z: mid }, approach, { x: approach.x, z: spot.z }, spot];
  }

  private serve(counter: WalkUpCounter, visitor: Visitor): void {
    visitor.served.push(...visitor.needs);
    visitor.progress = 0;
    this.leaveLine(visitor);
    visitor.state = 'leaving';
    if (visitor.avatar) visitor.avatar.holding = true;
    this.onServed({ visitor, counter });
    this.strollOff(visitor, counter);
  }

  /** Out of patience: walks off unhappy, unserved. */
  private giveUp(visitor: Visitor): void {
    const counter = visitor.counter;
    this.leaveLine(visitor);
    visitor.state = 'angry';
    this.onGaveUp(visitor);
    if (counter) this.strollOff(visitor, counter);
  }

  private leaveLine(visitor: Visitor): void {
    const counter = visitor.counter;
    visitor.counter = null;
    if (!counter) return;
    const i = counter.line.indexOf(visitor);
    if (i >= 0) counter.line.splice(i, 1);
    // Everyone behind steps up a spot.
    counter.line.forEach((t, k) => {
      const spot = counter.spot.queue[k]!;
      if (t.path.length > 0) t.path[t.path.length - 1] = spot;
      else if (t.at.x !== spot.x || t.at.z !== spot.z) {
        t.path = [spot];
        t.state = 'queued';
      }
    });
  }

  /** Back round the counter's side to the walkway, off to a stroll spot (unless unhappy), then away. */
  private strollOff(visitor: Visitor, from: WalkUpCounter): void {
    const { strolls, entrances, walkwayZ: mid } = this.layout;
    const stroll = strolls[Math.floor(this.random() * strolls.length)]!;
    const exit = entrances[Math.floor(this.random() * entrances.length)]!;
    const { approach } = from.spot;
    const back = [{ x: approach.x, z: visitor.at.z }, approach, { x: approach.x, z: mid }];
    visitor.path = visitor.state === 'angry' ? [...back, exit] : [...back, stroll, { x: stroll.x, z: mid }, exit];
  }

  private walk(dt: number, visitor: Visitor): void {
    let budget = this.rules.walkSpeed * dt;
    const moving = visitor.path.length > 0;
    while (budget > 0 && visitor.path.length > 0) {
      const next = visitor.path[0]!;
      const dx = next.x - visitor.at.x;
      const dz = next.z - visitor.at.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1e-4 && visitor.avatar) visitor.avatar.root.rotation.y = Math.atan2(dx, dz);
      if (dist <= budget) {
        visitor.at = { ...next };
        visitor.path.shift();
        budget -= dist;
      } else {
        visitor.at = { x: visitor.at.x + (dx / dist) * budget, z: visitor.at.z + (dz / dist) * budget };
        budget = 0;
      }
    }
    visitor.avatar?.root.position.set(visitor.at.x, 0, visitor.at.z);
    if (moving && visitor.path.length === 0) this.arrive(visitor);
    visitor.avatar?.update(dt);
  }

  private arrive(visitor: Visitor): void {
    const counter = visitor.counter;
    if (counter) {
      // At the window (front of the line): wait to be served, facing the counter. Further back: wait in line.
      visitor.state = counter.line[0] === visitor ? 'waiting' : 'queued';
      if (visitor.avatar) visitor.avatar.root.rotation.y = counter.spot.facing;
      return;
    }
    // Strolled off the map: gone.
    this.visitors.splice(this.visitors.indexOf(visitor), 1);
    if (visitor.avatar) {
      visitor.avatar.root.visible = false;
      visitor.avatar.holding = false;
      this.spare.push(visitor.avatar);
    }
  }
}
