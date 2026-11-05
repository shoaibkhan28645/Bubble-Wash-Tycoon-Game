// Walk-up businesses (Chapter 2 on): tourists on foot come along the
// boardwalk, line up at a counter, are served by the hero or a worker
// behind it, pay, and stroll off to the beach. A tourist who waits too long
// gives up and leaves unhappy. Counters are stations like the car wash's,
// serving Customers on foot instead of cars.
import { TUNING, stationDef, type BoardwalkLayout, type CounterSpot, type Dirt, type Point } from '../core/config';
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

/** Tunables for tourists, from tuning.json. */
export interface TouristRules {
  spawnSeconds: number;
  patience: number;
  walkSpeed: number;
  /** Base price range of one visit (a random amount between the two). */
  pay: [number, number];
}

/** One tourist on foot. */
export class Tourist implements Customer {
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

/** A walk-up counter (a kiosk window): a line of tourists, served one at a time from behind the counter. */
export class WalkUpCounter extends Station<Tourist> {
  /** Tourists lined up, front first (the front one is at the window once there). */
  readonly line: Tourist[] = [];

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

  /** The tourist at the window, waiting to be served. */
  get front(): Tourist | null {
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

/** The first tourist on a new boardwalk waits this long (as good as for ever). */
const FIRST_PATIENCE = 3600;

export interface ServedTourist {
  tourist: Tourist;
  counter: WalkUpCounter;
}

/**
 * All the tourists and counters of a boardwalk town: who comes when, who
 * lines up where, who's served, and who gives up.
 */
export class WalkUps {
  readonly counters: WalkUpCounter[] = [];
  readonly tourists: Tourist[] = [];
  /** The town's story: a rival takes some tourists (below 1). */
  rateFactor = 1;
  /** The town's story: a rush where every tourist pays more (dirt doesn't apply on foot). */
  rush: { dirt: Dirt; payMultiplier: number } | null = null;
  /** Rewarded boost: serving goes this much faster. */
  boost = 1;
  /** Tourists come only once their models have loaded. */
  open = false;
  private spawnTimer = 0;
  private readonly spare: WalkerAvatar[] = [];

  constructor(
    private readonly layout: BoardwalkLayout,
    private readonly state: GameState,
    private readonly rules: TouristRules,
    /** Arrival speed-up from what's built (the menu board). */
    private readonly arrivalBonus: () => number,
    /** Extra patience from what's built (the parasols). */
    private readonly patienceBonus: () => number,
    /** A person to draw (null in tests). */
    private readonly makeAvatar: (() => WalkerAvatar | null) | null,
    private readonly onServed: (served: ServedTourist) => void,
    private readonly onGaveUp: (tourist: Tourist) => void,
    private readonly random: () => number = Math.random,
  ) {}

  /** Opens the counter a built pad provides. */
  addCounter(padId: string, kind: string, labels: WorldLabels | null): void {
    const spot = this.layout.counters[padId];
    if (!spot || this.counters.some((c) => c.id === padId)) return;
    this.counters.push(new WalkUpCounter(padId, kind, spot, labels));
  }

  /**
   * A new boardwalk opens with a tourist already waiting at the first
   * window, as the car wash opens on a car in the bay: the first thing to
   * do is right there. They wait as long as it takes.
   */
  parkFirst(): void {
    const counter = this.counters[0];
    if (!counter || counter.line.length > 0) return;
    const at = counter.spot.queue[0]!;
    const [low, high] = this.rules.pay;
    const avatar = this.makeAvatar?.() ?? null;
    const tourist = new Tourist(avatar, at, stationDef(counter.kind).serves ?? '', Math.round((low + high) / 2), FIRST_PATIENCE);
    avatar?.root.position.set(at.x, 0, at.z);
    if (avatar) avatar.root.rotation.y = counter.spot.facing;
    tourist.counter = counter;
    tourist.state = 'waiting';
    counter.line.push(tourist);
    this.tourists.push(tourist);
  }

  /** Where tourists are (the player walks round them). */
  positions(): Point[] {
    return this.tourists.map((t) => t.at);
  }

  /**
   * One frame. `rate` says how hard each counter is being worked (the
   * hero or a worker behind it). Returns true if the hero served someone.
   */
  update(dt: number, rate: (counter: WalkUpCounter) => { rate: number; byPlayer: boolean }): boolean {
    this.spawn(dt);
    let playerWorking = false;
    for (const tourist of [...this.tourists]) this.walk(dt, tourist);
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
    for (const tourist of [...this.tourists]) {
      if (tourist.state !== 'queued' && tourist.state !== 'waiting') continue;
      tourist.patience -= dt;
      if (tourist.patience <= 0) this.giveUp(tourist);
    }
    return playerWorking;
  }

  /** A new tourist when the timer says (the stars and the menu board speed it up), heading for the shortest line. */
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
    const tourist = new Tourist(avatar, from, stationDef(counter.kind).serves ?? '', pay, patience);
    this.tourists.push(tourist);
    this.join(tourist, counter);
  }

  /** Lines up at a counter: along the boardwalk, round the counter's side, then to the next free spot in its line. */
  private join(tourist: Tourist, counter: WalkUpCounter): void {
    tourist.counter = counter;
    tourist.state = 'arriving';
    counter.line.push(tourist);
    const spot = counter.spot.queue[counter.line.length - 1]!;
    const { approach } = counter.spot;
    const mid = (this.layout.boardwalk.minZ + this.layout.boardwalk.maxZ) / 2;
    tourist.path = [{ x: approach.x, z: mid }, approach, { x: approach.x, z: spot.z }, spot];
  }

  private serve(counter: WalkUpCounter, tourist: Tourist): void {
    tourist.served.push(...tourist.needs);
    tourist.progress = 0;
    this.leaveLine(tourist);
    tourist.state = 'leaving';
    if (tourist.avatar) tourist.avatar.holding = true;
    this.onServed({ tourist, counter });
    this.strollOff(tourist, counter);
  }

  /** Out of patience: walks off unhappy, unserved. */
  private giveUp(tourist: Tourist): void {
    const counter = tourist.counter;
    this.leaveLine(tourist);
    tourist.state = 'angry';
    this.onGaveUp(tourist);
    if (counter) this.strollOff(tourist, counter);
  }

  private leaveLine(tourist: Tourist): void {
    const counter = tourist.counter;
    tourist.counter = null;
    if (!counter) return;
    const i = counter.line.indexOf(tourist);
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

  /** Back round the counter's side to the boardwalk, down the beach to a stroll spot (unless unhappy), then away. */
  private strollOff(tourist: Tourist, from: WalkUpCounter): void {
    const { strolls, entrances, boardwalk } = this.layout;
    const stroll = strolls[Math.floor(this.random() * strolls.length)]!;
    const exit = entrances[Math.floor(this.random() * entrances.length)]!;
    const mid = (boardwalk.minZ + boardwalk.maxZ) / 2;
    const { approach } = from.spot;
    const back = [{ x: approach.x, z: tourist.at.z }, approach, { x: approach.x, z: mid }];
    tourist.path = tourist.state === 'angry' ? [...back, exit] : [...back, stroll, { x: stroll.x, z: mid }, exit];
  }

  private walk(dt: number, tourist: Tourist): void {
    let budget = this.rules.walkSpeed * dt;
    const moving = tourist.path.length > 0;
    while (budget > 0 && tourist.path.length > 0) {
      const next = tourist.path[0]!;
      const dx = next.x - tourist.at.x;
      const dz = next.z - tourist.at.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1e-4 && tourist.avatar) tourist.avatar.root.rotation.y = Math.atan2(dx, dz);
      if (dist <= budget) {
        tourist.at = { ...next };
        tourist.path.shift();
        budget -= dist;
      } else {
        tourist.at = { x: tourist.at.x + (dx / dist) * budget, z: tourist.at.z + (dz / dist) * budget };
        budget = 0;
      }
    }
    tourist.avatar?.root.position.set(tourist.at.x, 0, tourist.at.z);
    if (moving && tourist.path.length === 0) this.arrive(tourist);
    tourist.avatar?.update(dt);
  }

  private arrive(tourist: Tourist): void {
    const counter = tourist.counter;
    if (counter) {
      // At the window (front of the line): wait to be served, facing the counter. Further back: wait in line.
      tourist.state = counter.line[0] === tourist ? 'waiting' : 'queued';
      if (tourist.avatar) tourist.avatar.root.rotation.y = counter.spot.facing;
      return;
    }
    // Strolled off the map: gone.
    this.tourists.splice(this.tourists.indexOf(tourist), 1);
    if (tourist.avatar) {
      tourist.avatar.root.visible = false;
      tourist.avatar.holding = false;
      this.spare.push(tourist.avatar);
    }
  }
}
