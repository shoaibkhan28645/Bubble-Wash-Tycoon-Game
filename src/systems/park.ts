// The theme park's visitors and rides (Chapter 3, Starlight Fun Park).
// Visitors come along the pavement, line up at the ticket booth and buy a
// ticket, then go round the park ticking off a wish list: each ride or stall
// they want, the one with the shortest line next. A ride takes a batch: its
// line steps on one by one, each rider walking round the platform to a free
// seat, and it goes round when every seat is taken (after a moment), or as
// soon as someone pulls its lever (the hero, or a ride operator who won't
// keep the first rider waiting long). A full ride pays a bonus, and a lever
// pulled just as the last seat fills is a "perfect launch". Riders step off
// one after another when it stops. Visitors who wait too long in a line give
// up and go home; done, they leave by the gate.
import ridesJson from '../data/rides.json';
import { TUNING, stationDef, type Dirt, type ParkLayout, type Point, type RideSpot, type Rect } from '../core/config';
import type { GameState } from '../core/gameState';
import { spawnSeconds } from './economy';
import { insideRect } from './stations';
import { Visitor, WalkUpCounter, type WalkerAvatar } from './walkups';
import type { WorldLabels } from '../ui/worldLabels';

/** A ride's kind (rides.json): its seats, how long it goes round, what a seat costs, and its shape. */
export interface RideDef {
  name: string;
  icon: string;
  model: string;
  seats: number;
  /** Seconds a ride lasts, spinning up and slowing down included. */
  seconds: number;
  /** What one seat pays. */
  price: number;
  /** Height of the platform people walk on, and its radius. */
  deck: number;
  plinth: number;
  /** The seats stand on a circle this big, the first at this angle (radians, anticlockwise seen from above, from +x). */
  seatRadius: number;
  seatStart: number;
  /** Riders walk round the platform this far out, to and from their seats. */
  boardRadius: number;
  /** Fastest turn (radians a second; a bumper car's metres a second), and how far the horses bob. */
  topSpeed: number;
  bob: number;
  /** How riders get to their seats: round the platform from the steps, or straight from the way in (bumper cars). */
  board: 'ring' | 'direct';
  /** How worn one ride makes it (it breaks down at 1). */
  wear: number;
  /** The share of visitors who want a go. */
  wish: number;
  /** Under a roof: it keeps running in a storm. */
  indoor?: boolean;
  /** A dark ride: riders go in at the door and aren't seen until they come out. */
  inside?: boolean;
  /** The part of the park it's in: one operator looks after a zone's rides. */
  zone: 'kiddie' | 'midway' | 'lakeside' | 'thrill';
  /** Runs round a track (the layout's): its cars leave the station and come back. */
  track?: 'flume' | 'coaster';
  /** A station's steps or stairs: how far out from its deck they reach the ground (metres). */
  ramp?: number;
}

export const RIDES = ridesJson as Record<string, RideDef>;

const PARK = TUNING.park;
const RULES = PARK.rides;

/** The stall visitors look in on their way out (not on their wish lists). */
const GIFT_SHOP = 'giftshop';
/** The first visitor at a new park waits this long (as good as for ever). */
const FIRST_PATIENCE = 3600;
/** Seconds a visitor hangs about before looking again, when every line they want is full. */
const IDLE_SECONDS = 3;
/** Points on the way round a platform, this far apart (radians). */
const ARC_STEP = 0.45;

/** A person drawn walking or riding (none in tests). */
export interface ParkAvatar extends WalkerAvatar {
  /** Sitting down: on a ride, or on a bench. */
  seated: boolean;
}

/** Where a visitor is in their day out. */
export type ParkStep =
  /** On the way to the ticket booth, or to a stop's line. */
  | 'walking'
  /** In a line (the booth's, a stall's or a ride's). */
  | 'line'
  /** Walking round a ride's platform to a seat. */
  | 'boarding'
  /** In a ride's seat. */
  | 'seated'
  /** Walking off a ride after it stopped. */
  | 'offRide'
  /** On the way to a bench, and sitting on it a while. */
  | 'toRest'
  | 'resting'
  /** Hanging about: every line they want is full, so they wait a moment and look again. */
  | 'idle'
  /** Waiting for the rest of their group (by the way out of a ride), to go on together. */
  | 'regroup'
  /** Done (or fed up): on the way out of the park. */
  | 'leaving';

/** One visitor to the park. */
export class ParkVisitor extends Visitor {
  step: ParkStep = 'walking';
  /** What they still want to do, by attraction id (a ride's or a stall's pad). */
  wishes: string[] = [];
  /** Wishes they had when they bought their ticket (all ticked off makes a perfect day). */
  wished = 0;
  /** The ride they're lining up for or on, their seat on it, and their place in its line (a queue spot). */
  ride: Ride | null = null;
  seat = -1;
  slot = -1;
  /** The ride they're walking to, before they take a place in its line. */
  rideHeading: Ride | null = null;
  /** Height above the ground (up on a platform). */
  y = 0;
  /** The bench seat they're resting on, and seconds left there. */
  bench: BenchSeat | null = null;
  restLeft = 0;
  /** They've had their ticket. */
  ticket = false;
  /** What they last bought at a stall (a stall's kind: what they're holding), and seconds until they've finished it. */
  bought: string | null = null;
  snackLeft = 0;
  /** Had their look in the gift shop on the way out (or passed it by). */
  shopped = false;
  /** The Visitor of the Day: a celebrity with a long wish list, paying five times over for a perfect day. */
  vip = false;
  /** On a school trip: one of the class off the school bus. */
  trip = false;
  /** The family, pair of teenagers or couple they came with (sharing one wish list, waiting for each other), or null. */
  group: VisitorGroup | null = null;
  /** What they've paid so far today. */
  spent = 0;

  constructor(
    override readonly avatar: ParkAvatar | null,
    from: Point,
    pay: number,
    patience: number,
    /** A child (drawn smaller). */
    readonly child: boolean,
  ) {
    super(avatar, from, 'ticket', pay, patience);
  }
}

/** The kinds of group visitors come in. */
export type GroupKind = 'family' | 'teens' | 'couple';

/** Visitors who came together: they share a wish list and go round as one, waiting for each other between rides. */
export interface VisitorGroup {
  kind: GroupKind;
  members: ParkVisitor[];
  /** The wish list the first of them to get a ticket made; the others get the same. */
  wishes: string[] | null;
}

export type RidePhase = 'loading' | 'running' | 'unloading';

/** Who pulled a ride's lever. */
export type LaunchBy = 'hero' | 'staff' | 'auto';

export interface Launch {
  riders: number;
  full: boolean;
  /** Pulled by the hero the moment the last seat filled. */
  perfect: boolean;
  by: LaunchBy;
  /** One of the runs after a service, that pay a little more. */
  serviced?: boolean;
}

/** A ride: seats, a line, and a round of loading, running and unloading. */
export class Ride {
  /** Visitors lined up, front first. */
  readonly line: ParkVisitor[] = [];
  /** Visitors walking to its line, not in it yet. */
  coming = 0;
  /** Who has each seat (walking to it, or sitting in it); more seats with the extra seats upgrade. */
  readonly seats: (ParkVisitor | null)[];
  phase: RidePhase = 'loading';
  /** Seconds into the current phase. */
  time = 0;
  /** How far round it has turned (radians) and how fast it's turning now. */
  angle = 0;
  speed = 0;
  /** Seconds this ride lasts (shorter with its speed upgrade). */
  cycle: number;
  /** Seconds it has been full while loading, and since its first rider sat down (-1: nobody yet). */
  fullFor = 0;
  waited = -1;
  /** The last launch, and seconds since then (the lever swings, the floaters show). */
  last: Launch | null = null;
  sinceLaunch = Infinity;
  /** Its speed upgrade: rides take this many times as long. */
  timeScale = 1;
  /** Its sturdy-parts upgrade: each ride wears it this many times as much. */
  wearScale = 1;
  /** Worn this far (it breaks down at 1, when allowed), and broken down: no launching until it's fixed. */
  wear = 0;
  broken = false;
  /** How far the repair (or a service) has got (0..1). */
  fixing = 0;
  /** Runs left that pay a little more, after it was serviced before it broke down. */
  bonusRuns = 0;
  /** Where each seat really is, if the model says (seats that move on their own: teacups, bumper cars). */
  seatAt: ((i: number) => Point) | null = null;
  /** Closed for now (an outdoor ride in a storm): riders wait, nobody launches it. */
  paused = false;
  /** The hero's time on the lever this time they stood on it, and whether that pulled it. */
  private heroOn = 0;
  private heroPulled = false;
  /** Seconds since the last rider stepped on, or off. */
  private stagger = 0;

  constructor(
    readonly id: string,
    readonly def: RideDef,
    readonly spot: RideSpot,
  ) {
    this.seats = new Array<ParkVisitor | null>(def.seats).fill(null);
    this.cycle = def.seconds;
  }

  /** More seats (the extra seats upgrade): never fewer than it has. */
  setSeats(n: number): void {
    while (this.seats.length < n) this.seats.push(null);
  }

  /** Riders sitting down (boarding ones not counted). */
  get seated(): number {
    return this.seats.filter((v) => v?.step === 'seated').length;
  }

  get boarding(): number {
    return this.seats.filter((v) => v?.step === 'boarding').length;
  }

  /** Every seat taken, and everyone sitting. */
  get full(): boolean {
    return this.seats.every((v) => v?.step === 'seated');
  }

  /** Spots in its line. */
  get spots(): number {
    return this.spot.queue.length;
  }

  get hasRoom(): boolean {
    return this.line.length + this.coming < this.spots;
  }

  /** The angle round the ride (anticlockwise from +x, seen from above) of seat `i` right now. */
  seatAngle(i: number): number {
    if (!this.seatAt) return this.def.seatStart + (i * 2 * Math.PI) / this.seats.length + this.angle;
    const p = this.seatAt(i);
    return Math.atan2(this.spot.at.z - p.z, p.x - this.spot.at.x);
  }

  /** A point on the ground round the ride, at `angle` (anticlockwise from +x, seen from above) and `radius`. */
  around(angle: number, radius: number): Point {
    return { x: this.spot.at.x + radius * Math.cos(angle), z: this.spot.at.z - radius * Math.sin(angle) };
  }

  /** Where seat `i` is on the ground right now. */
  seatPoint(i: number): Point {
    return this.seatAt?.(i) ?? this.around(this.seatAngle(i), this.def.seatRadius);
  }

  /** The way from the front of the line to seat `i`: up the steps, then round the platform or straight there. */
  boardPath(i: number): Point[] {
    const front = -Math.PI / 2;
    const round = this.def.board === 'ring' ? this.arc(front, this.seatAngle(i)) : [];
    return [this.steps, ...round, this.seatPoint(i)];
  }

  /** The way from seat `i` back to the steps (and then off by the way out). */
  offPath(i: number): Point[] {
    return this.def.board === 'ring' ? this.arc(this.seatAngle(i), -Math.PI / 2) : [this.steps];
  }

  /**
   * One frame of a broken-down ride being fixed by someone standing at its
   * lever (the hero, or the mechanic). Returns true once it's fixed.
   */
  repair(dt: number, fixer: boolean): boolean {
    if (!this.broken || !fixer) return false;
    this.fixing = Math.min(1, this.fixing + dt / RULES.repairSeconds);
    if (this.fixing < 1) return false;
    this.broken = false;
    this.fixing = 0;
    this.wear = 0;
    return true;
  }

  /**
   * One frame of servicing a worn ride (past serviceAt) before it breaks:
   * someone at its lever while it's empty and waiting. Nobody boards
   * meanwhile. Done, it's as good as new and pays a little more for its next
   * few runs. Returns true once it's done.
   */
  service(dt: number, fixer: boolean): boolean {
    const ready = !this.broken && this.wear >= RULES.serviceAt && this.phase === 'loading' && this.seats.every((s) => !s);
    if (!ready || !fixer) {
      if (!this.broken) this.fixing = 0;
      return false;
    }
    this.fixing = Math.min(1, this.fixing + dt / RULES.repairSeconds);
    if (this.fixing < 1) return false;
    this.fixing = 0;
    this.wear = 0;
    this.bonusRuns = RULES.serviceRuns;
    return true;
  }

  /** Being serviced right now. */
  get servicing(): boolean {
    return !this.broken && this.fixing > 0;
  }

  /** Up on the platform, or not (or partway up a station's stairs). */
  heightAt(p: Point): number {
    const deck = this.spot.deck;
    if (deck) {
      const out = Math.hypot(Math.max(deck.minX - p.x, 0, p.x - deck.maxX), Math.max(deck.minZ - p.z, 0, p.z - deck.maxZ));
      const ramp = this.def.ramp ?? 0;
      if (out <= 0) return this.def.deck;
      return ramp > 0 && out < ramp ? this.def.deck * (1 - out / ramp) : 0;
    }
    return Math.hypot(p.x - this.spot.at.x, p.z - this.spot.at.z) < this.def.plinth - 0.1 ? this.def.deck : 0;
  }

  /** The ride's steps: the middle of its front (towards +z). */
  get steps(): Point {
    return this.spot.steps ?? { x: this.spot.at.x, z: this.spot.at.z + this.def.plinth - 0.2 };
  }

  /** Round the platform, from the steps' side to seat `i` (or back), the shorter way. */
  arc(from: number, to: number): Point[] {
    let d = to - from;
    d = ((((d + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
    const n = Math.max(1, Math.ceil(Math.abs(d) / ARC_STEP));
    const points: Point[] = [];
    for (let k = 0; k <= n; k++) points.push(this.around(from + (d * k) / n, this.def.boardRadius));
    return points;
  }

  /**
   * One frame of the lever: `hero` says the hero is standing on it, `staff`
   * that the operator is. Returns who launched it, if anyone did.
   */
  lever(dt: number, hero: boolean, staff: boolean): { by: LaunchBy; perfect: boolean } | null {
    if (hero) this.heroOn += dt;
    else {
      this.heroOn = 0;
      this.heroPulled = false;
    }
    if (this.phase !== 'loading' || this.broken || this.paused) return null;
    const seated = this.seated;
    if (seated > 0) this.waited = this.waited < 0 ? 0 : this.waited + dt;
    const held = hero && this.heroOn >= RULES.leverSeconds;
    if (this.full) {
      this.fullFor += dt;
      // Standing on the lever as the last rider sits down launches it on the spot: a perfect launch.
      if (held) return { by: 'hero', perfect: this.fullFor <= RULES.perfectWindow };
      if (staff) return { by: 'staff', perfect: false };
      return this.fullFor >= RULES.launchDelay ? { by: 'auto', perfect: false } : null;
    }
    this.fullFor = 0;
    if (seated === 0) return null;
    // Stepping onto the lever pulls it once (stand on it and it waits for a full load).
    if (held && !this.heroPulled) {
      this.heroPulled = true;
      return { by: 'hero', perfect: false };
    }
    if (staff && this.waited >= RULES.operatorWait) return { by: 'staff', perfect: false };
    return null;
  }

  /** Off it goes: everyone on their way to a seat sits down at once. */
  launch(by: LaunchBy, perfect: boolean): Launch {
    for (const [i, v] of this.seats.entries()) {
      if (v?.step !== 'boarding') continue;
      v.step = 'seated';
      v.path = [];
      v.at = this.seatPoint(i);
      v.y = this.def.deck;
    }
    const riders = this.seated;
    const serviced = this.bonusRuns > 0;
    if (serviced) this.bonusRuns--;
    const launch: Launch = { riders, full: riders === this.seats.length, perfect, by, serviced };
    this.last = launch;
    this.sinceLaunch = 0;
    this.phase = 'running';
    this.time = 0;
    this.fullFor = 0;
    this.waited = -1;
    this.heroPulled = true;
    this.cycle = this.def.seconds * this.timeScale;
    this.wear += this.def.wear * this.wearScale;
    return launch;
  }

  /** Turns while running: up to speed, round, and slowing to a stop. */
  turn(dt: number): void {
    this.sinceLaunch += dt;
    if (this.phase !== 'running') {
      this.speed = 0;
      return;
    }
    this.time += dt;
    const top = this.def.topSpeed;
    const ease = (t: number) => t * t * (3 - 2 * t);
    const left = this.cycle - this.time;
    this.speed =
      this.time < RULES.spinUp ? top * ease(Math.min(1, this.time / RULES.spinUp)) : left < RULES.spinDown ? top * ease(Math.max(0, left / RULES.spinDown)) : top;
    this.angle += this.speed * dt;
    if (this.time >= this.cycle) {
      this.phase = 'unloading';
      this.time = 0;
      this.speed = 0;
      this.stagger = RULES.unloadStagger;
    }
  }

  /** Ready for the next rider to step on, or off. */
  nextStep(dt: number, gap: number): boolean {
    this.stagger += dt;
    if (this.stagger < gap) return false;
    this.stagger = 0;
    return true;
  }
}

/** A seat on a bench, and who's on it. */
export interface BenchSeat {
  at: Point;
  facing: number;
  taken: ParkVisitor | null;
}

export interface ParkEvents {
  /** A ticket sold at the booth, or a stall served someone. */
  onServed(visitor: ParkVisitor, counter: WalkUpCounter): void;
  /** Someone gave up waiting in a line and went home. */
  onGaveUp(visitor: ParkVisitor): void;
  /** A ride went round. */
  onLaunch(ride: Ride, launch: Launch): void;
  /** Someone finished every wish on their list and is going home happy. */
  onPerfectDay?(visitor: ParkVisitor): void;
  /** A ride wore out and broke down as it stopped. */
  onBroken?(ride: Ride): void;
  /** A broken-down ride was fixed, by the hero or the mechanic. */
  onFixed?(ride: Ride, byHero: boolean): void;
  /** A worn ride was serviced before it broke down. */
  onServiced?(ride: Ride, byHero: boolean): void;
  /** Someone finished their snack and dropped the wrapper here (the game decides if it lands). */
  onLitter?(at: Point, visitor: ParkVisitor): void;
  /** Someone has their ticket and knows what they want to do (their wish list is made). */
  onWishes?(visitor: ParkVisitor): void;
}

/**
 * Who stands at each ride's lever this frame: the hero, the ride operator,
 * and the mechanic (the hero or the mechanic fixes a broken-down ride).
 */
export type LeverState = (ride: Ride) => { hero: boolean; staff: boolean; mechanic?: boolean };

/** All the park's visitors, its ticket booth and stalls, and its rides. */
export class ParkCrowd {
  readonly counters: WalkUpCounter[] = [];
  readonly rides: Ride[] = [];
  readonly visitors: ParkVisitor[] = [];
  readonly benchSeats: BenchSeat[] = [];
  /** The town's story: a rival takes some visitors (below 1). */
  rateFactor = 1;
  /** The town's story: a rush where everyone pays more. */
  rush: { dirt: Dirt; payMultiplier: number } | null = null;
  /** Rewarded boost: serving goes this much faster. */
  boost = 1;
  /** Visitors come only once their models have loaded. */
  open = false;
  /** Whether a stall has anything to sell: while it hasn't, its line waits (losing patience at half the rate). */
  stocked: (counter: WalkUpCounter) => boolean = () => true;
  /** Whether a worn-out ride may break down now (the game keeps it to one at a time, and not too early). */
  canBreak: (ride: Ride) => boolean = () => true;
  /** A storm: outdoor rides close (their lines wait without minding); indoor rides and stalls carry on. */
  storm = false;
  /** Where the mascot is cheering people up: visitors in a line this close lose patience more slowly. */
  calm: Point | null = null;
  private spawnTimer = 0;
  private readonly spare = new Map<boolean, ParkAvatar[]>([
    [false, []],
    [true, []],
  ]);

  constructor(
    private readonly layout: ParkLayout,
    private readonly state: GameState,
    /** Arrival speed-up from what's built (the candy floss, the sign). */
    private readonly arrivalBonus: () => number,
    /** Extra patience from what's built (the benches). */
    private readonly patienceBonus: () => number,
    /** A person to draw, a child or not (null in tests). */
    private readonly makeAvatar: ((child: boolean) => ParkAvatar | null) | null,
    /** A walking route between two points round what's built. */
    private readonly route: (from: Point, to: Point) => Point[],
    private readonly events: ParkEvents,
    private readonly random: () => number = Math.random,
  ) {}

  /** Opens the ticket booth or a stall a built pad provides. */
  addCounter(padId: string, kind: string, labels: WorldLabels | null): void {
    const spot = this.layout.counters[padId];
    if (!spot || this.counters.some((c) => c.id === padId)) return;
    this.counters.push(new WalkUpCounter(padId, kind, spot, labels));
  }

  /** Opens a ride a built pad provides. */
  addRide(padId: string, kind: string): Ride | null {
    const spot = this.layout.rides[padId];
    const def = RIDES[kind];
    if (!spot || !def || this.rides.some((r) => r.id === padId)) return null;
    const ride = new Ride(padId, def, spot);
    this.rides.push(ride);
    return ride;
  }

  /** Puts out the seats of a built pad's benches. */
  addBenches(padId: string): void {
    const benches = this.layout.benches[padId];
    if (!benches || this.benchSeats.some((s) => benches.seats.includes(s.at))) return;
    for (const at of benches.seats) this.benchSeats.push({ at, facing: benches.facing, taken: null });
  }

  get booth(): WalkUpCounter | undefined {
    return this.counters.find((c) => stationDef(c.kind).serves === 'ticket');
  }

  ride(id: string): Ride | undefined {
    return this.rides.find((r) => r.id === id);
  }

  /** Where visitors are on the ground (the player and staff walk round them). */
  positions(): Point[] {
    return this.visitors.filter((v) => v.step !== 'seated' && v.y === 0).map((v) => v.at);
  }

  /**
   * A new park opens with a visitor already waiting at the ticket booth's
   * window: the first thing to do is right there. They wait as long as it takes.
   */
  parkFirst(): void {
    const booth = this.booth;
    if (!booth || booth.line.length > 0) return;
    const at = booth.spot.queue[0]!;
    const visitor = this.newVisitor(at, false, FIRST_PATIENCE);
    visitor.counter = booth;
    visitor.state = 'waiting';
    visitor.step = 'line';
    if (visitor.avatar) visitor.avatar.root.rotation.y = booth.spot.facing;
    booth.line.push(visitor);
  }

  /**
   * One frame. `work` says how hard each counter is being worked (the hero
   * or a worker behind it), `lever` who stands at each ride's lever.
   * Returns true if the hero served someone.
   */
  update(dt: number, work: (counter: WalkUpCounter) => { rate: number; byPlayer: boolean }, lever: LeverState): boolean {
    this.spawn(dt);
    for (const visitor of [...this.visitors]) this.walk(dt, visitor);
    let playerWorking = false;
    for (const counter of this.counters) {
      const front = counter.front;
      const rate = work(counter);
      if (front && rate.rate > 0 && this.stocked(counter)) {
        if (rate.byPlayer) {
          front.manual = true;
          playerWorking = true;
        }
        front.progress = Math.min(1, front.progress + (dt * rate.rate * this.boost) / (stationDef(counter.kind).seconds ?? 1));
        if (front.progress >= 1) this.serve(counter, front as ParkVisitor);
      }
      counter.showProgress(!!counter.front, counter.front?.progress ?? 0, false);
    }
    for (const ride of this.rides) {
      ride.paused = this.storm && !ride.def.indoor;
      this.runRide(dt, ride, lever(ride));
    }
    for (const visitor of [...this.visitors]) {
      if (visitor.snackLeft > 0) {
        visitor.snackLeft -= dt;
        // Finished: the wrapper's dropped (unless they're up on a ride or in a seat; then on the next step).
        if (visitor.snackLeft <= 0) {
          if (visitor.step === 'walking' || visitor.step === 'line' || visitor.step === 'idle') {
            if (visitor.avatar) visitor.avatar.holding = false;
            this.events.onLitter?.({ ...visitor.at }, visitor);
          } else visitor.snackLeft = 0.5;
        }
      }
      if (visitor.step !== 'line') continue;
      // Sheltering from a storm in an outdoor ride's line, nobody minds the wait.
      if (visitor.ride?.paused) continue;
      const calm = this.calm && Math.hypot(visitor.at.x - this.calm.x, visitor.at.z - this.calm.z) < PARK.mascot.calmRadius ? PARK.mascot.calmFactor : 1;
      visitor.patience -= (visitor.counter && !this.stocked(visitor.counter) ? dt / 2 : dt) * calm;
      if (visitor.patience <= 0) this.giveUp(visitor);
    }
    for (const visitor of [...this.visitors]) {
      if (visitor.step === 'resting') {
        visitor.restLeft -= dt;
        if (visitor.restLeft <= 0) this.standUp(visitor);
      } else if (visitor.step === 'regroup') {
        visitor.restLeft -= dt;
        if (visitor.restLeft <= 0) {
          this.leaveGroup(visitor);
          if (visitor.step === 'regroup') this.next(visitor);
        }
      } else if (visitor.step === 'idle') {
        visitor.restLeft -= dt;
        visitor.patience -= dt;
        if (visitor.patience <= 0) this.giveUp(visitor);
        else if (visitor.restLeft <= 0) {
          const booth = this.booth;
          if (visitor.ticket) this.next(visitor);
          else if (booth && booth.line.length < booth.spots) {
            booth.coming++;
            visitor.heading = booth;
            this.joinCounter(visitor, booth);
          } else visitor.restLeft = IDLE_SECONDS;
        }
      }
    }
    return playerWorking;
  }

  private newVisitor(at: Point, child: boolean, patience: number): ParkVisitor {
    const avatar = this.spare.get(child)!.pop() ?? this.makeAvatar?.(child) ?? null;
    if (avatar) {
      avatar.root.visible = true;
      avatar.holding = false;
      avatar.seated = false;
      avatar.root.position.set(at.x, 0, at.z);
    }
    const visitor = new ParkVisitor(avatar, at, PARK.visitors.ticket * (this.rush?.payMultiplier ?? 1), patience, child);
    this.visitors.push(visitor);
    return visitor;
  }

  /** A new visitor when the timer says (stars and what's built bring them sooner), on their way to the ticket booth. */
  private spawn(dt: number): void {
    const booth = this.booth;
    if (!this.open || !booth) return;
    const interval = spawnSeconds(PARK.visitors.spawnSeconds, this.state.stars, TUNING.stars.arrivalPerStar, this.arrivalBonus()) / this.rateFactor;
    this.spawnTimer += dt;
    if (this.spawnTimer < interval) return;
    if (booth.line.length + booth.coming >= booth.spots * 2 || this.visitors.length >= PARK.visitors.max) return;
    this.spawnTimer = 0;
    const from = this.layout.entrances[Math.floor(this.random() * this.layout.entrances.length)]!;
    const patience = PARK.visitors.patience * (1 + this.patienceBonus());
    const { enter } = booth.spot;
    const arrive = (visitor: ParkVisitor) => {
      visitor.heading = booth;
      booth.coming++;
      visitor.path = [{ x: enter[0]!.x, z: this.layout.walkwayZ }, ...enter];
    };
    // Now and then a family, a pair of teenagers or a couple, walking in together.
    if (this.random() < PARK.groups.chance && this.visitors.length + 3 <= PARK.visitors.max) {
      const kind = this.pick(PARK.groups.kinds as Record<GroupKind, number>);
      const children = kind === 'family' ? 1 + Math.floor(this.random() * 2) : 0;
      const group: VisitorGroup = { kind, members: [], wishes: null };
      const size = kind === 'family' ? 1 + children : 2;
      for (let i = 0; i < size; i++) {
        const child = kind === 'family' && i > 0;
        const visitor = this.newVisitor({ x: from.x + i * 0.6, z: from.z + (i % 2) * 0.4 }, child, patience);
        visitor.group = group;
        group.members.push(visitor);
        arrive(visitor);
      }
      return;
    }
    arrive(this.newVisitor(from, this.random() < PARK.visitors.childChance, patience));
  }

  /** One of `weights`' keys, picked in proportion to its weight. */
  private pick<K extends string>(weights: Record<K, number>): K {
    const entries = Object.entries(weights) as [K, number][];
    let at = this.random() * entries.reduce((sum, [, w]) => sum + w, 0);
    for (const [key, w] of entries) if ((at -= w) < 0) return key;
    return entries[entries.length - 1]![0];
  }

  /**
   * The Visitor of the Day arrives at an entrance and heads for the ticket
   * booth: a celebrity with a long wish list and plenty of patience.
   */
  spawnVip(): ParkVisitor | null {
    const booth = this.booth;
    if (!this.open || !booth) return null;
    const from = this.layout.entrances[Math.floor(this.random() * this.layout.entrances.length)]!;
    const visitor = this.newVisitor(from, false, PARK.visitors.patience * PARK.vip.patience * (1 + this.patienceBonus()));
    visitor.vip = true;
    visitor.heading = booth;
    booth.coming++;
    visitor.path = [{ x: from.x, z: this.layout.walkwayZ }, ...booth.spot.enter];
    return visitor;
  }

  /**
   * A school trip: `count` children step off the school bus at `at` and head
   * for the ticket booth; they want the rides children like, and wait well.
   */
  spawnTrip(at: Point, count: number): ParkVisitor[] {
    const booth = this.booth;
    if (!this.open || !booth) return [];
    const room = Math.max(0, PARK.visitors.max + PARK.bus.extra - this.visitors.length);
    const class_: ParkVisitor[] = [];
    for (let i = 0; i < Math.min(count, room); i++) {
      const from = { x: at.x + (i % 6) * 0.5, z: at.z + Math.floor(i / 6) * 0.5 };
      const visitor = this.newVisitor(from, true, PARK.visitors.patience * PARK.school.patience * (1 + this.patienceBonus()));
      visitor.trip = true;
      visitor.heading = booth;
      booth.coming++;
      visitor.path = [{ x: from.x, z: this.layout.walkwayZ }, ...booth.spot.enter];
      class_.push(visitor);
    }
    return class_;
  }

  /** A busload: `count` visitors step off at `at`, one behind another, and head for the ticket booth. */
  spawnGroup(at: Point, count: number): number {
    const booth = this.booth;
    if (!this.open || !booth) return 0;
    const room = Math.max(0, PARK.visitors.max + PARK.bus.extra - this.visitors.length);
    const n = Math.min(count, room);
    const { enter } = booth.spot;
    for (let i = 0; i < n; i++) {
      const from = { x: at.x + i * 0.55, z: at.z };
      const visitor = this.newVisitor(from, this.random() < PARK.visitors.childChance, PARK.visitors.patience * (1 + this.patienceBonus()));
      visitor.heading = booth;
      booth.coming++;
      visitor.path = [{ x: from.x, z: this.layout.walkwayZ }, ...enter];
    }
    return n;
  }

  /**
   * Their wish list, once they have a ticket: two to four of the rides and
   * stalls built, picked by how popular each is (rides.json `wish`, and the
   * stalls' in tuning.json), in the order they'll go. Everyone wants at least
   * one ride.
   */
  private wishList(count?: number, likes: Record<string, number> = {}): string[] {
    const options = [
      ...this.rides.map((r) => ({ id: r.id, weight: r.def.wish * (likes[r.id] ?? 1) })),
      ...this.counters.flatMap((c) => {
        const weight = (PARK.wishes as Record<string, number | number[]>)[c.kind];
        return c !== this.booth && typeof weight === 'number' ? [{ id: c.id, weight: weight * (likes[c.kind] ?? 1) }] : [];
      }),
    ];
    const [low, high] = PARK.wishes.count as [number, number];
    const n = Math.min(options.length, count ?? low + Math.floor(this.random() * (high - low + 1)));
    const wishes: string[] = [];
    while (wishes.length < n) {
      let pick = this.random() * options.reduce((sum, o) => sum + o.weight, 0);
      const i = options.findIndex((o) => (pick -= o.weight) < 0);
      wishes.push(options.splice(i < 0 ? options.length - 1 : i, 1)[0]!.id);
    }
    if (this.rides.length > 0 && !wishes.some((w) => this.ride(w))) wishes[0] = this.rides[Math.floor(this.random() * this.rides.length)]!.id;
    return wishes;
  }

  private serve(counter: WalkUpCounter, visitor: ParkVisitor): void {
    visitor.served.push(...visitor.needs);
    visitor.progress = 0;
    this.leaveCounterLine(visitor);
    this.events.onServed(visitor, counter);
    if (!visitor.ticket) {
      visitor.ticket = true;
      const group = visitor.group;
      if (group?.wishes) visitor.wishes = [...group.wishes];
      else {
        const likeKind: GroupKind | null = group ? group.kind : visitor.trip ? 'family' : null;
        const likes = likeKind ? ((PARK.groups.likes as Record<GroupKind, Record<string, number>>)[likeKind] ?? {}) : {};
        visitor.wishes = this.wishList(visitor.vip ? PARK.vip.wishes : undefined, likes);
        if (group) group.wishes = [...visitor.wishes];
      }
      visitor.wished = visitor.wishes.length;
      this.events.onWishes?.(visitor);
    } else {
      visitor.wishes = visitor.wishes.filter((w) => w !== counter.id);
      visitor.bought = counter.kind;
      if (visitor.avatar) visitor.avatar.holding = true;
      const [low, high] = PARK.litter.afterSeconds as [number, number];
      // A souvenir goes home with them; a snack's wrapper gets dropped when it's finished.
      visitor.snackLeft = counter.kind === GIFT_SHOP ? 0 : low + (high - low) * this.random();
    }
    visitor.state = 'leaving';
    visitor.step = 'walking';
    // Out by the counter's way out, then on to the next thing.
    visitor.path = counter.spot.exit.slice(1);
  }

  /** On to their next wish (the one with the shortest line), a rest on a bench now and then, or home. */
  private next(visitor: ParkVisitor): void {
    const group = visitor.group;
    if (group) {
      const others = this.groupmates(visitor);
      if (others.some((m) => m.step !== 'regroup')) {
        // Wait by the way out for the others (patiently, for a while).
        visitor.step = 'regroup';
        visitor.restLeft = PARK.groups.waitSeconds;
        visitor.path = [];
        visitor.heading = null;
        visitor.rideHeading = null;
        return;
      }
      // All here: the first decides, and the rest go along.
      this.nextAlone(visitor);
      for (const m of others) this.follow(m, visitor);
      return;
    }
    this.nextAlone(visitor);
  }

  /** The rest of a visitor's group still in the park (not on their way home). */
  private groupmates(visitor: ParkVisitor): ParkVisitor[] {
    return (visitor.group?.members ?? []).filter((m) => m !== visitor && m.step !== 'leaving' && this.visitors.includes(m));
  }

  /** Leaves their group (they've gone home, or the others gave up waiting): the rest carry on without them. */
  private leaveGroup(visitor: ParkVisitor): void {
    const group = visitor.group;
    if (!group) return;
    group.members = group.members.filter((m) => m !== visitor);
    visitor.group = null;
    // Anyone left waiting for them may now be all there.
    const waiting = group.members.find((m) => m.step === 'regroup' && this.visitors.includes(m));
    if (waiting && group.members.every((m) => m.step === 'regroup' || m.step === 'leaving' || !this.visitors.includes(m))) this.next(waiting);
  }

  /** A group member goes where `leader` decided: the same ride or stall, a rest, home. */
  private follow(member: ParkVisitor, leader: ParkVisitor): void {
    member.heading = null;
    member.rideHeading = null;
    member.wishes = member.wishes.filter((w) => leader.wishes.includes(w) || w === leader.rideHeading?.id || w === leader.heading?.id);
    if (leader.step === 'leaving') {
      member.shopped = leader.shopped;
      this.leave(member);
      return;
    }
    const ride = leader.rideHeading;
    if (ride && ride.hasRoom) {
      ride.coming++;
      member.rideHeading = ride;
      member.step = 'walking';
      member.state = 'arriving';
      member.path = this.route(member.at, ride.spot.enter);
      return;
    }
    const counter = leader.heading;
    if (counter && counter.line.length + counter.coming < counter.spots) {
      counter.coming++;
      member.heading = counter;
      member.step = 'walking';
      member.state = 'arriving';
      member.path = this.route(member.at, counter.spot.enter.at(-1)!);
      return;
    }
    // A rest, or no room alongside: they make their own way for now.
    this.nextAlone(member);
  }

  private nextAlone(visitor: ParkVisitor): void {
    visitor.heading = null;
    visitor.rideHeading = null;
    const seat = this.benchSeats.find((s) => !s.taken);
    if (seat && !visitor.group && visitor.wishes.length > 0 && visitor.wished > visitor.wishes.length && this.random() < PARK.wishes.rest) {
      seat.taken = visitor;
      visitor.bench = seat;
      visitor.step = 'toRest';
      visitor.path = this.route(visitor.at, seat.at);
      return;
    }
    // Done: on the way out, a look in the gift shop (if there's room in its line, and they fancy it).
    if (visitor.wishes.length === 0 && !visitor.shopped) {
      visitor.shopped = true;
      const shop = this.counters.find((c) => c.kind === GIFT_SHOP);
      if (shop && shop.line.length + shop.coming < shop.spots && this.random() < PARK.giftshop.chance) visitor.wishes = [shop.id];
    }
    const busy = (id: string): number => {
      const ride = this.ride(id);
      if (ride) return ride.hasRoom ? ride.line.length + ride.coming : Infinity;
      const counter = this.counters.find((c) => c.id === id);
      return counter && counter.line.length + counter.coming < counter.spots ? counter.line.length + counter.coming : Infinity;
    };
    const open = visitor.wishes.filter((w) => busy(w) < Infinity);
    if (visitor.wishes.length === 0) {
      this.leave(visitor);
      return;
    }
    if (open.length === 0) {
      // Every line they want is full: they hang about a moment (getting impatient) and look again.
      visitor.step = 'idle';
      visitor.restLeft = IDLE_SECONDS;
      visitor.path = [];
      return;
    }
    const goal = open.reduce((best, w) => (busy(w) < busy(best) ? w : best));
    const ride = this.ride(goal);
    visitor.step = 'walking';
    visitor.state = 'arriving';
    if (ride) {
      ride.coming++;
      visitor.rideHeading = ride;
      visitor.path = this.route(visitor.at, ride.spot.enter);
      return;
    }
    const counter = this.counters.find((c) => c.id === goal)!;
    counter.coming++;
    visitor.heading = counter;
    visitor.path = this.route(visitor.at, counter.spot.enter.at(-1)!);
  }

  /** Home time: to the gate and out along the pavement, by the nearer end. */
  private leave(visitor: ParkVisitor): void {
    if (visitor.group && this.groupmates(visitor).length === 0) visitor.group = null;
    if (visitor.wished > 0 && visitor.wishes.length === 0 && visitor.state !== 'angry') this.events.onPerfectDay?.(visitor);
    visitor.step = 'leaving';
    visitor.heading = null;
    visitor.rideHeading = null;
    const { out, leave, entrances } = this.layout;
    const street = out.at(-1)!;
    const away = entrances.reduce((best, e) => (Math.abs(e.x - street.x) < Math.abs(best.x - street.x) ? e : best));
    visitor.path = [...this.route(visitor.at, leave), ...out, away];
  }

  /** Lines up at a counter, from beside the back of its line: to the next free spot, at the back. */
  private joinCounter(visitor: ParkVisitor, counter: WalkUpCounter): void {
    if (visitor.heading) visitor.heading.coming--;
    visitor.heading = null;
    visitor.counter = counter;
    visitor.state = 'arriving';
    visitor.step = 'line';
    counter.line.push(visitor);
    const spot = counter.spot.queue[counter.line.length - 1]!;
    const from = counter.spot.enter.at(-1)!;
    visitor.path = [{ x: from.x, z: spot.z }, spot];
  }

  /** Lines up for a ride: in at the back, and along the snake of spots to the first free one. */
  private joinRide(visitor: ParkVisitor, ride: Ride): void {
    ride.coming--;
    visitor.rideHeading = null;
    visitor.ride = ride;
    visitor.step = 'line';
    visitor.state = 'arriving';
    ride.line.push(visitor);
    const { queue } = ride.spot;
    visitor.slot = ride.line.length - 1;
    visitor.path = [];
    for (let k = queue.length - 1; k >= visitor.slot; k--) visitor.path.push(queue[k]!);
  }

  private leaveCounterLine(visitor: ParkVisitor): void {
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

  private leaveRideLine(visitor: ParkVisitor): void {
    const ride = visitor.ride;
    if (!ride) return;
    const i = ride.line.indexOf(visitor);
    if (i < 0) return;
    ride.line.splice(i, 1);
    // Everyone behind moves up, spot by spot along the snake.
    const { queue } = ride.spot;
    ride.line.forEach((t, k) => {
      if (k >= t.slot) return;
      for (let s = t.slot - 1; s >= k; s--) t.path.push(queue[s]!);
      t.slot = k;
      t.state = 'queued';
    });
  }

  /** Out of patience: steps out of the line and goes home, unhappy. */
  private giveUp(visitor: ParkVisitor): void {
    const counter = visitor.counter;
    if (counter) {
      this.leaveCounterLine(visitor);
      const { aside } = counter.spot;
      visitor.at = { ...visitor.at };
      visitor.path = [{ x: visitor.at.x + aside.x, z: visitor.at.z + aside.z }];
    } else {
      this.leaveRideLine(visitor);
      visitor.ride = null;
      visitor.path = [];
    }
    visitor.state = 'angry';
    this.leaveGroup(visitor);
    this.events.onGaveUp(visitor);
    if (!visitor.ticket) {
      // Never got in: back along the pavement.
      visitor.step = 'leaving';
      const street = { x: visitor.at.x, z: this.layout.walkwayZ };
      const away = this.layout.entrances.reduce((best, e) => (Math.abs(e.x - street.x) < Math.abs(best.x - street.x) ? e : best));
      const enter = this.booth?.spot.enter ?? [];
      visitor.path.push(...enter.slice(1).reverse(), street, away);
      return;
    }
    const path = visitor.path;
    this.leave(visitor);
    visitor.path = [...path, ...visitor.path];
  }

  private standUp(visitor: ParkVisitor): void {
    if (visitor.bench) visitor.bench.taken = null;
    visitor.bench = null;
    if (visitor.avatar) visitor.avatar.seated = false;
    this.next(visitor);
  }

  /** A ride's round: riders step on while it loads, the lever (or a full load) sends it round, then they step off. */
  private runRide(dt: number, ride: Ride, at: { hero: boolean; staff: boolean; mechanic?: boolean }): void {
    if (ride.repair(dt, at.hero || !!at.mechanic)) this.events.onFixed?.(ride, at.hero);
    else if (ride.service(dt, at.hero || !!at.mechanic)) this.events.onServiced?.(ride, at.hero);
    const pulled = ride.lever(dt, at.hero, at.staff);
    if (pulled) this.events.onLaunch(ride, ride.launch(pulled.by, pulled.perfect));
    const running = ride.phase === 'running';
    ride.turn(dt);
    // Worn out, it gives up as it stops (once the riders are safely off it goes no more).
    if (running && ride.phase !== 'running' && ride.wear >= 1 && this.canBreak(ride)) {
      ride.broken = true;
      ride.fixing = 0;
      this.events.onBroken?.(ride);
    }
    // Those riding go round with their seats.
    for (const [i, v] of ride.seats.entries()) if (v?.step === 'seated') v.at = ride.seatPoint(i);
    if (ride.phase === 'loading') {
      const front = ride.line[0];
      const free = ride.seats.findIndex((s) => !s);
      if (front && free >= 0 && front.path.length === 0 && !ride.servicing && ride.nextStep(dt, RULES.boardStagger)) this.board(ride, front);
    } else if (ride.phase === 'unloading') {
      const next = ride.seats.findIndex((s) => s?.step === 'seated');
      if (next < 0) {
        ride.phase = 'loading';
        ride.time = 0;
      } else if (ride.nextStep(dt, RULES.unloadStagger)) this.stepOff(ride, next);
    }
  }

  /** The front of the line steps on, and walks (round the platform, or straight) to the free seat nearest the steps. */
  private board(ride: Ride, visitor: ParkVisitor): void {
    const steps = ride.steps;
    const gap = (i: number) => {
      const p = ride.seatPoint(i);
      return Math.hypot(p.x - steps.x, p.z - steps.z);
    };
    let seat = -1;
    for (let i = 0; i < ride.seats.length; i++) if (!ride.seats[i] && (seat < 0 || gap(i) < gap(seat))) seat = i;
    this.leaveRideLine(visitor);
    visitor.slot = -1;
    ride.seats[seat] = visitor;
    visitor.seat = seat;
    visitor.step = 'boarding';
    visitor.state = 'entering';
    visitor.path = ride.boardPath(seat);
  }

  /** A rider gets off: round the platform to the steps, down, and on with their day. */
  private stepOff(ride: Ride, seat: number): void {
    const visitor = ride.seats[seat]!;
    ride.seats[seat] = null;
    visitor.step = 'offRide';
    visitor.state = 'leaving';
    visitor.seat = -1;
    visitor.wishes = visitor.wishes.filter((w) => w !== ride.id);
    if (visitor.avatar) visitor.avatar.seated = false;
    visitor.path = [...ride.offPath(seat), ...ride.spot.exit];
  }

  private walk(dt: number, visitor: ParkVisitor): void {
    if (visitor.step === 'seated' || visitor.step === 'resting' || visitor.step === 'idle' || visitor.step === 'regroup') {
      visitor.avatar?.update(dt);
      return;
    }
    let budget = PARK.visitors.walkSpeed * dt * (visitor.child ? 0.9 : 1);
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
    const ride = visitor.ride;
    visitor.y = ride && (visitor.step === 'boarding' || visitor.step === 'offRide') ? ride.heightAt(visitor.at) : 0;
    visitor.avatar?.root.position.set(visitor.at.x, visitor.y, visitor.at.z);
    if (moving && visitor.path.length === 0) this.arrive(visitor);
    visitor.avatar?.update(dt);
  }

  private arrive(visitor: ParkVisitor): void {
    const { avatar } = visitor;
    switch (visitor.step) {
      case 'walking': {
        const counter = visitor.heading;
        if (counter && !visitor.counter) {
          if (counter.line.length < counter.spots) this.joinCounter(visitor, counter);
          else {
            counter.coming--;
            visitor.heading = null;
            visitor.wishes = visitor.wishes.filter((w) => w !== counter.id);
            if (visitor.ticket) this.next(visitor);
            else {
              // The ticket line's full (a busload came at once): they wait about and try again.
              visitor.step = 'idle';
              visitor.restLeft = IDLE_SECONDS;
            }
          }
          return;
        }
        const ride = visitor.rideHeading;
        if (ride) {
          if (ride.line.length < ride.spots) this.joinRide(visitor, ride);
          else {
            ride.coming--;
            visitor.rideHeading = null;
            visitor.wishes = visitor.wishes.filter((w) => w !== ride.id);
            this.next(visitor);
          }
          return;
        }
        // Out of a counter's way out (a ticket, a stall): on to the next wish.
        if (visitor.ticket) this.next(visitor);
        return;
      }
      case 'line': {
        // At the window (front of a counter's line): wait to be served, facing it. Further back: wait in line.
        const counter = visitor.counter;
        if (counter) {
          visitor.state = counter.line[0] === visitor ? 'waiting' : 'queued';
          if (avatar) avatar.root.rotation.y = counter.spot.facing;
        } else if (visitor.ride) {
          visitor.state = 'queued';
          const steps = visitor.ride.steps;
          // Facing the next spot up the line (the front faces the ride).
          const ahead = visitor.slot > 0 ? visitor.ride.spot.queue[visitor.slot - 1]! : steps;
          if (avatar) avatar.root.rotation.y = Math.atan2(ahead.x - visitor.at.x, ahead.z - visitor.at.z);
        }
        return;
      }
      case 'boarding': {
        const ride = visitor.ride!;
        visitor.step = 'seated';
        visitor.state = 'waiting';
        visitor.at = ride.seatPoint(visitor.seat);
        if (avatar) avatar.seated = true;
        return;
      }
      case 'offRide':
        visitor.ride = null;
        visitor.y = 0;
        this.next(visitor);
        return;
      case 'toRest': {
        const seat = visitor.bench;
        if (!seat) {
          this.next(visitor);
          return;
        }
        visitor.step = 'resting';
        const [low, high] = PARK.wishes.restSeconds as [number, number];
        visitor.restLeft = low + (high - low) * this.random();
        if (avatar) {
          avatar.seated = true;
          avatar.root.rotation.y = seat.facing;
        }
        return;
      }
      case 'leaving': {
        // Walked off the map: gone.
        this.visitors.splice(this.visitors.indexOf(visitor), 1);
        if (avatar) {
          avatar.root.visible = false;
          avatar.holding = false;
          avatar.seated = false;
          this.spare.get(visitor.child)!.push(avatar);
        }
        return;
      }
      default:
        return;
    }
  }
}

/** 0 by day, 1 at night: the park's day of `day` seconds, then an evening, fading between. */
export function eveningAt(seconds: number, rules: { day: number; evening: number; fade: number }): number {
  const t = seconds % (rules.day + rules.evening);
  if (t < rules.day - rules.fade) return 0;
  if (t < rules.day) return (t - (rules.day - rules.fade)) / rules.fade;
  if (t < rules.day + rules.evening - rules.fade) return 1;
  return 1 - (t - (rules.day + rules.evening - rules.fade)) / rules.fade;
}

/** Middle of a rect. */
export function middleOf(rect: Rect): Point {
  return { x: (rect.minX + rect.maxX) / 2, z: (rect.minZ + rect.maxZ) / 2 };
}

/** Standing in a counter's serving zone. */
export function inZone(p: Point, counter: WalkUpCounter): boolean {
  return insideRect(p, counter.zone);
}
