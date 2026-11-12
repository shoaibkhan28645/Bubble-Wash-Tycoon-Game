// Drivers waiting in a wash line stretch their legs: once the vending
// machine is built, they get out for a can, and hurry back to the car as its
// turn comes. The car doesn't drive in without them. (A bench's seats are
// worked out here too: people out walking sit on the town's benches.)
import { TUNING, type LocationLayout, type Point } from '../core/config';
import type { Lane } from './arrivals';
import type { Car } from './cars';
import type { Walker } from './mart';
import { insideRect } from './stations';

/** A place to sit: where the person sits, the spot in front they step up from, and the way they face. */
export interface Seat {
  at: Point;
  front: Point;
  facing: number;
}

/** A bench seats two, side by side along it, facing out from its front (a bench at `rot` 0 faces +z). */
export function benchSeats(bench: Point, rot = 0): Seat[] {
  const along = { x: Math.cos(rot), z: -Math.sin(rot) };
  const out = { x: Math.sin(rot), z: Math.cos(rot) };
  return [-0.5, 0.5].map((k) => ({
    at: { x: bench.x + along.x * k + out.x * SEAT_FORWARD, z: bench.z + along.z * k + out.z * SEAT_FORWARD },
    front: { x: bench.x + along.x * k + out.x * FRONT, z: bench.z + along.z * k + out.z * FRONT },
    facing: rot,
  }));
}

/** How far in front of the bench's middle line people sit, and stand up to. */
const SEAT_FORWARD = 0.02;
const FRONT = 0.95;
/** Where a driver stands to use the vending machine: in front of it, facing it. */
const MACHINE_FRONT = 0.95;
/** A driver gets out only if the walk is this short (metres), so they're back in time. */
const MAX_WALK = 10;
/** Seconds at the machine, choosing and paying. */
const BUYING_SECONDS = 1.3;
/** Called back, drivers jog (metres a second). */
const HURRY_SPEED = 3.2;
/** Drivers go out only while the car in their bay has this much of its wash still to go. */
const LEAVE_BEFORE = 0.4;
/** And are called back once the car in their bay is this far through, so they're back as it pulls out. */
const RETURN_AT = 0.55;

type Stage = 'toMachine' | 'buying' | 'back';

interface Outing {
  car: Car;
  walker: Walker | null;
  at: Point;
  path: Point[];
  stage: Stage;
  timer: number;
  /** The car door it walks back to (re-aimed if the car moves up the line meanwhile). */
  door: Point;
}

export class WaitingDrivers {
  /** The people models are loaded, so drivers can be shown. */
  ready = false;
  /** Drivers who have got out so far (for tests and the play-test bot). */
  started = 0;
  private readonly outings: Outing[] = [];
  private readonly spare: Walker[] = [];
  private readonly machine: { stand: Point; at: Point } | null;

  constructor(
    private readonly layout: LocationLayout,
    private readonly built: (id: string) => boolean,
    /** A person to show (null in tests: the walking still happens). */
    private readonly makeWalker: (() => Walker) | null,
    /** A walking route round what's built (the machine, the bays). */
    private readonly route: (from: Point, to: Point) => Point[],
    /** A can was bought at the machine. */
    private readonly onSnack: (at: Point) => void,
    private readonly rand: () => number = Math.random,
  ) {
    const vending = layout.pads.vending;
    this.machine = vending ? { at: vending, stand: { x: vending.x, z: vending.z + MACHINE_FRONT } } : null;
  }

  /** Where the drivers out of their cars are (cars stop for them). */
  positions(): Point[] {
    return this.outings.map((o) => o.at);
  }

  get count(): number {
    return this.outings.length;
  }

  update(dt: number, lanes: readonly Lane[]): void {
    if (this.ready) for (const lane of lanes) this.letOut(lane);
    for (const outing of [...this.outings]) {
      const lane = lanes.find((l) => l.queue.includes(outing.car));
      // Its turn is coming (or it's had enough of waiting): back to the car.
      const due = !lane || (lane.queue[0] === outing.car && freeSoon(lane));
      if (outing.car.recall || due) this.callBack(outing);
      this.step(dt, outing);
    }
  }

  /**
   * A car in line whose driver can stretch their legs: stopped on the lot, with
   * the bay ahead busy (a wash only just begun, or a clean car waiting there for
   * the dryer to come free, which is often the longest wait).
   */
  private letOut(lane: Lane): void {
    const ahead = lane.customer;
    const busy = !!ahead && (ahead.state === 'entering' || ahead.state === 'done' || (ahead.state === 'waiting' && ahead.progress < LEAVE_BEFORE));
    if (!busy || 'inside' in lane) return;
    const car = lane.queue[0];
    if (!car || car.stretched || car.away || car.vip || car.state !== 'queued' || !car.arrived || !insideRect(car.position, this.layout.lot)) return;
    car.stretched = true;
    // Off to the machine for a can.
    const machine = this.wantsCan(car) ? this.machine : null;
    if (!machine || this.rand() >= TUNING.waitingDrivers.chance) return;
    const door = doorOf(car, machine.stand);
    if (Math.hypot(machine.stand.x - door.x, machine.stand.z - door.z) > MAX_WALK) return;
    const walker = this.spare.pop() ?? this.makeWalker?.() ?? null;
    if (walker) {
      walker.root.visible = true;
      walker.holding = false;
      walker.seated = false;
      walker.root.position.set(door.x, 0, door.z);
    }
    car.away = true;
    this.started++;
    const outing: Outing = { car, walker, at: { ...door }, path: [], stage: 'toMachine', timer: 0, door };
    this.go(outing, 'toMachine', machine.stand);
    this.outings.push(outing);
  }

  /** The vending machine is built and this driver hasn't had a can yet. */
  private wantsCan(car: Car): boolean {
    return !!this.machine && this.built('vending') && !car.snacked;
  }

  private go(outing: Outing, stage: Stage, to: Point): void {
    outing.stage = stage;
    outing.path = this.route(outing.at, to);
  }

  private callBack(outing: Outing): void {
    if (outing.stage === 'back' || outing.stage === 'buying') return;
    outing.door = doorOf(outing.car, outing.at);
    this.go(outing, 'back', outing.door);
  }

  private step(dt: number, outing: Outing): void {
    const { walker } = outing;
    if (outing.stage === 'buying') {
      outing.timer -= dt;
      walker?.update(dt, true);
      if (outing.timer > 0) return;
      outing.car.snacked = true;
      this.onSnack(this.machine!.at);
      if (walker) walker.holding = true;
      // Back to the car with it.
      outing.door = doorOf(outing.car, outing.at);
      this.go(outing, 'back', outing.door);
      return;
    }
    if (outing.stage === 'back') {
      // The car moved up the line meanwhile: walk to where its door is now.
      const door = doorOf(outing.car, outing.at);
      if (Math.hypot(door.x - outing.door.x, door.z - outing.door.z) > 0.5) {
        outing.door = door;
        outing.path = this.route(outing.at, door);
      }
    }
    const moving = outing.path.length > 0;
    let budget = (outing.stage === 'back' ? HURRY_SPEED : TUNING.snack.walkSpeed) * dt;
    while (budget > 0 && outing.path.length > 0) {
      const next = outing.path[0]!;
      const dx = next.x - outing.at.x;
      const dz = next.z - outing.at.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1e-4 && walker) walker.root.rotation.y = Math.atan2(dx, dz);
      if (dist <= budget) {
        outing.at = { ...next };
        outing.path.shift();
        budget -= dist;
      } else {
        outing.at = { x: outing.at.x + (dx / dist) * budget, z: outing.at.z + (dz / dist) * budget };
        budget = 0;
      }
    }
    walker?.root.position.set(outing.at.x, 0, outing.at.z);
    walker?.update(dt);
    if (moving && outing.path.length === 0) this.arrive(outing);
  }

  private arrive(outing: Outing): void {
    const { walker } = outing;
    if (outing.stage === 'toMachine') {
      outing.stage = 'buying';
      outing.timer = BUYING_SECONDS;
      // Face the machine.
      if (walker) walker.root.rotation.y = Math.PI;
      return;
    }
    // Back at the car: in they get.
    this.remove(outing);
  }

  /** The car left (or this town is closing): its driver goes with it. */
  cancel(car: Car): void {
    const outing = this.outings.find((o) => o.car === car);
    if (outing) this.remove(outing);
  }

  private remove(outing: Outing): void {
    this.outings.splice(this.outings.indexOf(outing), 1);
    outing.car.away = false;
    outing.car.recall = false;
    if (outing.walker) {
      outing.walker.root.visible = false;
      outing.walker.holding = false;
      outing.walker.seated = false;
      this.spare.push(outing.walker);
    }
  }
}

/** The bay ahead is free or nearly: the front car's driver should be on their way back. */
function freeSoon(lane: Lane): boolean {
  if (lane.idle) return true;
  const car = lane.customer;
  return !!car && car.state === 'waiting' && car.progress >= RETURN_AT;
}

/** The car door on the side nearest `toward` (cars in line face along z, so the doors are to the sides). */
function doorOf(car: Car, toward: Point): Point {
  const p = car.position;
  const side = toward.x < p.x ? -1 : 1;
  return { x: p.x + side * (car.def.size[0] / 2 + 0.35), z: p.z };
}
