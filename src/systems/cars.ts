import type { Scene } from 'three';
import { TUNING, type CarDef, type Point, type Rect, type StageDef } from '../core/config';
import { CarModel } from '../render/models/actors';
import type { Customer, CustomerState } from './customers';
import type { Station } from './stations';
import type { Need } from './tickets';
import { smoothRouteMarked } from './vehicles';

/** A car's progress through the lot (see CustomerState); an angry car poofs away. */
export type CarState = CustomerState;

const TURN_RATE = 10;
/** How far along its way a car looks for a turn to indicate. */
const TURN_LOOK = 4;
/** Pulling away, and easing to a stop (m/s²; the road rules plan stops at the same rate), and the hardest it brakes. */
const ACCEL = 10;
const BRAKE = 10;
const HARD_BRAKE = 24;
/** How hard it takes a bend (sideways, m/s²): the tighter the bend, the slower. */
const CORNER = 9;
/** The radius it drives its corners at (less where the way is too short for it). */
const ROUND = 2;
/** It rolls up to the end of its way this little faster than a standstill, so it gets there. */
const ARRIVE = 0.04;
/** It steers for a point this far ahead along its way. */
const STEER_LOOK = 0.8;
/** Held up by a car in its way while going no faster than this (m/s), it brakes the last bit rather than stop dead. */
const SLIDE = 3;
/** Counts cars as they come on: an earlier car has right of way where two ways cross. */
let spawned = 0;

/** One car on the lot: a customer who drives. Drives along waypoints; the stations decide where. */
export class Car implements Customer {
  readonly body = 'car' as const;
  def!: CarDef;
  state: CarState = 'arriving';
  /** Wash progress in the bay, 0..1 (also drives the mud shader). */
  clean = 0;
  /** Progress of the current station's job, 0..1. */
  progress = 0;
  timer = 0;
  /** Seconds of patience left, and the starting amount. */
  patience = 0;
  patienceMax = 1;
  /** Stages this car has had so far (it pays for each). */
  stages: StageDef[] = [];
  /** Product of the quality upgrades of the stations it visited. */
  quality = 1;
  /** True if the player worked on it by hand (not counted as automated income). */
  manual = false;
  /** Whether the current station's supply (soap, towel, wax) was used up for it. */
  supplied = false;
  /** The station it is in or heading into. */
  station: Station | null = null;
  /** What it pays as (the golden VIP pays 5x the best regular car). */
  payDef!: CarDef;
  /** Golden VIP: only the player serves it until the manager is hired. */
  vip = false;
  /** The Car of the Day. */
  special = false;
  /** Will stop at the detailing garage (if built). */
  wantsDetail = false;
  /** Seconds spent finished, waiting for a busy garage (it gives detailing a miss after a few). */
  detailWait = 0;
  /** Bought a snack from the vending machine while waiting. */
  snacked = false;
  /** Which car this is in the order they came on (lower came first). */
  serial = 0;
  /** It was held up by something in its way last time it tried to drive, and for how long now. */
  held = false;
  heldFor = 0;
  /** Seconds spent waiting in line. */
  waited = 0;
  /** Its driver is away at the Mini-Mart (the car waits at the pump until they're back). */
  shopping = false;
  /** Its driver got out while it waited in line (vending machine, bench): it doesn't drive in without them. */
  away = false;
  /** Its driver is wanted back at the car now (out of patience). */
  recall = false;
  /** Its driver has had the chance to get out while it waited (once a visit). */
  stretched = false;
  /** Its way ends off the map (driving away along the road): it doesn't slow down for the end. */
  offMap = false;
  /** What it came for (its ticket), in visiting order, and what it has had so far. */
  needs: Need[] = ['wash'];
  served: Need[] = [];
  /** The way ahead, its corners rounded off, and for each point how many of the way in's waypoints it's round by then. */
  private path: Point[] = [];
  private done: number[] = [];
  /** Waypoints on the way to its lane (the turn off the road), until passed; how many have been since the way was set. */
  private approach: Point[] = [];
  private shifted = 0;
  private heading = 0;
  /** How fast it's going now (m/s). */
  private vel = 0;

  /**
   * Who has to wait for whom on the road (none in tests): whether a car must stop now, and how much
   * further it can go before it will have to (it eases off in time).
   */
  static rules: { blocked(car: Car): boolean; room?(car: Car, speed: number): number; holdOf?(car: Car): 'person' | 'car' | 'way' | null } | null = null;

  constructor(readonly model: CarModel) {}

  get position(): Point {
    return { x: this.model.mesh.position.x, z: this.model.mesh.position.z };
  }

  get arrived(): boolean {
    return this.path.length === 0;
  }

  /** Footprint for blocking the player while parked. */
  get footprint(): Rect {
    const { x, z } = this.position;
    // Long along whichever way it faces (cars at the pumps face along the road).
    const along = Math.abs(Math.sin(this.heading)) > Math.SQRT1_2;
    const hw = this.def.size[along ? 2 : 0] / 2;
    const hl = this.def.size[along ? 0 : 2] / 2;
    return { minX: x - hw, maxX: x + hw, minZ: z - hl, maxZ: z + hl };
  }

  /** How fast it's going (m/s). */
  get speed(): number {
    return this.vel;
  }

  /** Which way it faces (radians, 0 = +z). */
  get facing(): number {
    return this.heading;
  }

  /** The route it's on now (a new one is a new array; driving it shortens it): the road rules keep their sums while it's the same. */
  get pathKey(): readonly Point[] {
    return this.path;
  }

  /** The next point it's driving to, if it's on the move. */
  get nextPoint(): Point | null {
    return this.path[0] ?? null;
  }

  /** Where it will be after driving `distance` more along its route (where it's really heading, round a corner just ahead). */
  aim(distance: number): Point | null {
    let at = this.position;
    let left = distance;
    for (const point of this.path) {
      const step = Math.hypot(point.x - at.x, point.z - at.z);
      if (step >= left) return { x: at.x + ((point.x - at.x) * left) / step, z: at.z + ((point.z - at.z) * left) / step };
      left -= step;
      at = point;
    }
    return this.path.length > 0 ? at : null;
  }

  /** Wants this but hasn't had it yet. */
  wants(need: Need): boolean {
    return this.needs.includes(need) && !this.served.includes(need);
  }

  spawn(def: CarDef, at: Point, approach: Point[], goal: Point, payDef: CarDef = def, needs: Need[] = ['wash']): void {
    this.def = def;
    this.serial = ++spawned;
    this.payDef = payDef;
    this.vip = !!def.vip;
    this.special = !!def.special;
    this.wantsDetail = false;
    this.detailWait = 0;
    this.snacked = false;
    this.waited = 0;
    this.state = 'arriving';
    this.clean = 0;
    this.progress = 0;
    this.timer = 0;
    this.stages = [];
    this.quality = 1;
    this.manual = false;
    this.supplied = false;
    this.station = null;
    this.needs = needs;
    this.served = [];
    this.shopping = false;
    this.away = false;
    this.recall = false;
    this.stretched = false;
    this.offMap = false;
    this.model.mesh.scale.setScalar(1);
    this.model.setType(def);
    // Cars that only want fuel arrive clean: no mud means no wash wanted.
    this.model.setClean(def.dirt, needs.includes('wash') ? 0 : 1);
    this.model.mesh.position.set(at.x, 0, at.z);
    this.model.mesh.visible = true;
    const first = approach[0] ?? goal;
    this.heading = Math.atan2(first.x - at.x, first.z - at.z);
    // It comes on from along the road already driving.
    this.vel = TUNING.cars.speed;
    this.route(approach, goal);
  }

  /** Drive these waypoints, then to a spot in a line (which can still move up with driveTo). */
  route(approach: Point[], goal: Point): void {
    this.approach = [...approach];
    this.setPath([...this.approach, goal]);
  }

  /** Carry on along the way in still to drive, then through these waypoints to a new goal. */
  then(points: Point[], goal: Point): void {
    this.approach.push(...points);
    this.setPath([...this.approach, goal]);
  }

  /** New destination down the lane, keeping the way in if not yet driven. */
  driveTo(goal: Point): void {
    const end = this.path[this.path.length - 1];
    // Already on its way there (a line shuffling up re-sends everyone): it carries on as it is.
    if (end && end.x === goal.x && end.z === goal.z) return;
    this.setPath([...this.approach, goal]);
  }

  /** Drive a fixed route (leaving the lot). */
  follow(points: Point[]): void {
    this.approach = [];
    this.setPath(points);
  }

  /** The way from where it is through these points, its corners rounded off as a driver takes them. */
  private setPath(points: Point[]): void {
    const { points: way, ends } = smoothRouteMarked([this.position, ...points], ROUND);
    // A point `ends` says it's round the route's point e by: that many waypoints of the way in are behind it.
    const count = (e: number) => Math.max(0, Math.min(this.approach.length, e));
    const already = count(ends[0] ?? 0);
    this.path = way.slice(1);
    this.done = ends.slice(1).map(count);
    this.shifted = 0;
    while (this.shifted < already) {
      this.approach.shift();
      this.shifted++;
    }
  }

  /** Reached the next point of its way (and maybe passed one of the way in's waypoints). */
  private reach(): void {
    this.path.shift();
    const done = this.done.shift() ?? 0;
    while (this.shifted < done && this.approach.length > 0) {
      this.approach.shift();
      this.shifted++;
    }
  }

  /**
   * One frame of driving, as a driver would: pulling away gently, slowing for a bend ahead and to
   * stop at the end of its way, easing off in good time for a car or a person it will have to stop
   * for (the road rules say how much room it has, and when it must wait), and steering smoothly round.
   */
  update(dt: number, speed: number): void {
    const next = this.path[0];
    // Something in the way: wait for it to clear (the road rules decide). Giving way, or coming up slowly
    // behind a car, it brakes to a stop (there's room to); for a person in front, it stops at once.
    this.held = !!next && !!Car.rules?.blocked(this);
    this.heldFor = this.held ? this.heldFor + dt : 0;
    const hold = this.held ? (Car.rules?.holdOf?.(this) ?? 'car') : null;
    const braking = this.vel > 0 && (hold === 'way' || (hold === 'car' && this.vel <= SLIDE));
    if ((this.held && !braking) || !next) {
      this.vel = 0;
      this.model.animate(dt, false, this.held, this.held ? this.turnAhead() : 0);
      return;
    }
    const room = Car.rules?.room?.(this, this.vel) ?? Infinity;
    const top = braking ? 0 : Math.min(speed, this.fastestAhead(speed), Math.sqrt(2 * BRAKE * room));
    const before = this.vel;
    this.vel = before < top ? Math.min(top, before + ACCEL * dt) : Math.max(top, before - HARD_BRAKE * dt);
    const p = this.model.mesh.position;
    // Never further than the room ahead (braking the last bit up to a car, it's within it already).
    let budget = hold === 'car' ? this.vel * dt : Math.min(this.vel * dt, room);
    const moved = budget > 1e-6;
    while (budget > 1e-6 && this.path.length > 0) {
      const target = this.path[0]!;
      const dx = target.x - p.x;
      const dz = target.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= budget) {
        p.x = target.x;
        p.z = target.z;
        budget -= dist;
        this.reach();
      } else {
        p.x += (dx / dist) * budget;
        p.z += (dz / dist) * budget;
        budget = 0;
      }
    }
    if (moved) {
      // Steering for a point just ahead along the way: round a bend it turns as it goes.
      const ahead = this.aim(STEER_LOOK) ?? next;
      const dx = ahead.x - p.x;
      const dz = ahead.z - p.z;
      if (Math.hypot(dx, dz) > 0.05) {
        const goal = Math.atan2(dx, dz);
        const diff = Math.atan2(Math.sin(goal - this.heading), Math.cos(goal - this.heading));
        this.heading += diff * Math.min(1, dt * TURN_RATE);
      }
    }
    this.model.mesh.rotation.y = this.heading;
    const accel = (this.vel - before) / Math.max(dt, 1e-3);
    this.model.animate(dt, this.vel > 0.2, braking || accel < -1.5, this.turnAhead(), accel);
  }

  /** The fastest it may be going now to take the bends ahead at a safe speed, and to stop at the end of its way. */
  private fastestAhead(speed: number): number {
    let best = speed;
    let s = 0;
    let prev = this.position;
    const reach = (speed * speed) / (2 * BRAKE) + 1;
    for (let i = 0; i < this.path.length; i++) {
      const point = this.path[i]!;
      const seg = Math.hypot(point.x - prev.x, point.z - prev.z);
      s += seg;
      if (s > reach) break;
      const after = this.path[i + 1];
      if (!after) {
        if (!this.offMap) best = Math.min(best, Math.sqrt(2 * BRAKE * (s + ARRIVE)));
        break;
      }
      const out = Math.hypot(after.x - point.x, after.z - point.z);
      if (seg > 0.05 && out > 1e-4) {
        const ax = point.x - prev.x;
        const az = point.z - prev.z;
        const bx = after.x - point.x;
        const bz = after.z - point.z;
        const turn = Math.abs(Math.atan2(ax * bz - az * bx, ax * bx + az * bz));
        if (turn > 0.02) {
          const corner = Math.sqrt((CORNER * (seg + out)) / 2 / turn);
          best = Math.min(best, Math.sqrt(corner * corner + 2 * BRAKE * s));
        }
      }
      prev = point;
    }
    return best;
  }

  /** Which way the way ahead turns, for the indicators: 1 left, -1 right, 0 straight on. */
  private turnAhead(): number {
    const far = this.aim(TURN_LOOK);
    if (!far) return 0;
    const p = this.position;
    if (Math.hypot(far.x - p.x, far.z - p.z) < 0.5) return 0;
    const diff = Math.atan2(Math.sin(Math.atan2(far.x - p.x, far.z - p.z) - this.heading), Math.cos(Math.atan2(far.x - p.x, far.z - p.z) - this.heading));
    return Math.abs(diff) < 0.35 ? 0 : Math.sign(diff);
  }
}

/** Reuses car objects instead of creating and destroying them. */
export class CarPool {
  private readonly free: Car[] = [];
  /** Every car out on the lot or the road now. */
  readonly active = new Set<Car>();

  constructor(private readonly scene: Scene) {
    // One car waits in the scene, hidden, so the paint's look is compiled with the town's, not at the first arrival.
    const spare = new Car(new CarModel());
    spare.model.mesh.visible = false;
    scene.add(spare.model.mesh);
    this.free.push(spare);
  }

  acquire(): Car {
    const car = this.free.pop() ?? new Car(new CarModel());
    car.model.mesh.name = 'car';
    this.scene.add(car.model.mesh);
    this.active.add(car);
    return car;
  }

  release(car: Car): void {
    car.model.mesh.visible = false;
    this.scene.remove(car.model.mesh);
    this.active.delete(car);
    this.free.push(car);
  }
}
