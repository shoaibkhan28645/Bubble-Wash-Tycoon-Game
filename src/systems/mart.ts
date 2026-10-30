import { TUNING, type LocationLayout, type Point } from '../core/config';
import type { WorldLabels } from '../ui/worldLabels';
import type { Car } from './cars';
import { Station } from './stations';

/** A person walking around: the shopper's avatar (none in tests). */
export interface Walker {
  readonly root: { position: { x: number; z: number; set(x: number, y: number, z: number): unknown }; rotation: { y: number }; visible: boolean };
  holding: boolean;
  update(dt: number, scrubbing?: boolean): void;
}

type ShopperState = 'going' | 'queued' | 'returning';

interface Shopper {
  car: Car;
  walker: Walker | null;
  at: Point;
  path: Point[];
  state: ShopperState;
  /** Where to walk back to: the car's door. */
  door: Point;
}

/** Shoppers cut across the forecourt this far past the pumps, clear of the island and the cars. */
const PAST_PUMPS_X = 2.4;
/** And come up to the shop along this line, just in front of its till. */
const SHOPFRONT_Z = -19.6;

/**
 * The Mini-Mart till. A driver's car waits at the pump while they walk
 * over, line up, get served (by the player or the clerk standing at the
 * till), and walk back carrying a bag.
 */
export class Counter extends Station {
  /** The front shopper is at the till, waiting to be served. */
  serving = false;
  progress = 0;

  override get needsWork(): boolean {
    return this.serving;
  }

  override get idle(): boolean {
    return !this.serving;
  }
}

export class Mart {
  readonly counter: Counter;
  isOpen = false;
  /** All shopper models are loaded, so drivers can be shown walking. */
  ready = false;
  private readonly shoppers: Shopper[] = [];
  /** Shoppers going to or waiting at the till, first in line first. */
  private readonly line: Shopper[] = [];
  /** Avatars of shoppers who are done, to reuse. */
  private readonly spare: Walker[] = [];

  constructor(
    private readonly layout: LocationLayout,
    labels: WorldLabels | null,
    /** A person to show walking, or null (tests). */
    private readonly makeWalker: (() => Walker) | null,
    private readonly onServed: (car: Car, at: Point) => void,
  ) {
    const { counter, zone } = layout.mart;
    const size = { width: zone.maxX - zone.minX, length: zone.maxZ - zone.minZ };
    const centre = { x: (zone.minX + zone.maxX) / 2, z: (zone.minZ + zone.maxZ) / 2 };
    this.counter = new Counter('mart', 'counter', centre, size, 0, labels);
    this.counter.side = layout.staffSpots.clerk ?? counter;
  }

  /** Snacks can be on a ticket: the shop is open and its shoppers can be drawn. */
  get selling(): boolean {
    return this.isOpen && this.ready;
  }

  /** The driver of a car that's just pulled up at a pump gets out and walks over. */
  sendShopper(car: Car, pump: Station): void {
    const p = car.position;
    // Out of the door on the road side of the car.
    const door = { x: p.x, z: pump.at.z + car.def.size[0] / 2 + 0.35 };
    const walker = this.spare.pop() ?? this.makeWalker?.() ?? null;
    if (walker) {
      walker.holding = false;
      walker.root.visible = true;
      walker.root.position.set(door.x, 0, door.z);
    }
    const spots = this.layout.mart.queue;
    const spot = spots[Math.min(this.line.length, spots.length - 1)]!;
    const shopper: Shopper = { car, walker, at: { ...door }, path: this.routeBetween(door, spot), state: 'going', door };
    car.shopping = true;
    this.shoppers.push(shopper);
    this.line.push(shopper);
  }

  /** The car gave up and left: its driver vanishes with it. */
  cancel(car: Car): void {
    const shopper = this.shoppers.find((s) => s.car === car);
    if (shopper) this.remove(shopper);
    car.shopping = false;
  }

  /** Where the shoppers are walking (cars wait for people in front of them). */
  positions(): Point[] {
    return this.shoppers.map((s) => s.at);
  }

  /** People out and about (for the play-test bot). */
  get count(): number {
    return this.shoppers.length;
  }

  /** One frame: walking, and serving the front of the line at `rate` (0 when nobody's at the till). */
  update(dt: number, rate: number, boost: number): void {
    for (const shopper of [...this.shoppers]) this.walk(dt, shopper);
    const front = this.line[0];
    const atTill = !!front && front.state === 'queued' && front.path.length === 0;
    this.counter.serving = atTill;
    if (atTill && rate > 0) {
      this.counter.progress = Math.min(1, this.counter.progress + (dt * rate * boost) / TUNING.stations.counter.seconds);
      if (this.counter.progress >= 1) this.serve(front);
    }
    this.counter.showProgress(atTill, this.counter.progress, false);
  }

  private serve(shopper: Shopper): void {
    this.counter.progress = 0;
    this.line.shift();
    shopper.state = 'returning';
    if (shopper.walker) shopper.walker.holding = true;
    shopper.path = this.routeBetween(this.layout.mart.queue[0]!, shopper.door);
    this.onServed(shopper.car, this.layout.mart.counter);
    this.routeLine();
  }

  /** Everyone in line moves up a spot: the first to the till, the rest behind. */
  private routeLine(): void {
    const spots = this.layout.mart.queue;
    this.line.forEach((shopper, i) => {
      const spot = spots[Math.min(i, spots.length - 1)]!;
      // Still on the way: head for the new spot instead. Already in line: step up.
      if (shopper.path.length > 0) shopper.path[shopper.path.length - 1] = spot;
      else if (shopper.at.x !== spot.x || shopper.at.z !== spot.z) shopper.path = [spot];
    });
  }

  /** Round the end of the pumps and along the shopfront (either way round). */
  private routeBetween(from: Point, to: Point): Point[] {
    const outward = from.x < to.x;
    const pumpsSide = outward ? from : to;
    const corner = [
      { x: PAST_PUMPS_X, z: pumpsSide.z },
      { x: PAST_PUMPS_X + 1.2, z: SHOPFRONT_Z },
    ];
    return outward ? [...corner, to] : [...corner.reverse(), to];
  }

  private walk(dt: number, shopper: Shopper): void {
    let budget = TUNING.snack.walkSpeed * dt;
    const moving = shopper.path.length > 0;
    while (budget > 0 && shopper.path.length > 0) {
      const next = shopper.path[0]!;
      const dx = next.x - shopper.at.x;
      const dz = next.z - shopper.at.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1e-4 && shopper.walker) shopper.walker.root.rotation.y = Math.atan2(dx, dz);
      if (dist <= budget) {
        shopper.at = { ...next };
        shopper.path.shift();
        budget -= dist;
      } else {
        shopper.at = { x: shopper.at.x + (dx / dist) * budget, z: shopper.at.z + (dz / dist) * budget };
        budget = 0;
      }
    }
    shopper.walker?.root.position.set(shopper.at.x, 0, shopper.at.z);
    if (moving && shopper.path.length === 0) this.arrive(shopper);
    shopper.walker?.update(dt);
  }

  private arrive(shopper: Shopper): void {
    if (shopper.state !== 'returning') {
      shopper.state = 'queued';
      // Face the till.
      if (shopper.walker) shopper.walker.root.rotation.y = Math.PI;
      return;
    }
    // Back at the car with the bag.
    shopper.car.served.push('snack');
    shopper.car.shopping = false;
    this.remove(shopper);
  }

  private remove(shopper: Shopper): void {
    this.shoppers.splice(this.shoppers.indexOf(shopper), 1);
    const i = this.line.indexOf(shopper);
    if (i >= 0) {
      this.line.splice(i, 1);
      if (i === 0) {
        this.counter.progress = 0;
        this.counter.serving = false;
      }
      this.routeLine();
    }
    if (shopper.walker) {
      shopper.walker.root.visible = false;
      shopper.walker.holding = false;
      this.spare.push(shopper.walker);
    }
  }
}
