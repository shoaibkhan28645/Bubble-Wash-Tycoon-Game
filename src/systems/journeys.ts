import { TUNING, type LocationLayout, type Point } from '../core/config';
import type { CarMoods } from '../ui/carBubbles';
import { slotOf, type Arrivals, type Lane } from './arrivals';
import type { Car } from './cars';
import type { Departures } from './departures';
import type { Forecourt } from './forecourt';
import { nextStop } from './lanes';
import type { Mart } from './mart';
import type { Station } from './stations';
import type { Till } from './till';
import { Tunnel } from './tunnel';

/** The lot's stations, as Traffic keeps them. */
export interface LotStations {
  readonly bays: readonly Station[];
  readonly finishing: readonly Station[];
  readonly tunnel: Tunnel | null;
  readonly forecourt: Forecourt;
  readonly arrivals: Arrivals;
  readonly mart: Mart;
  lanes(): Lane[];
}

/**
 * Cars getting from one place to the next: into a free bay from the line,
 * on to the next finishing station when it's their turn, out to pay and
 * leave (or from the pumps on to a wash lane), and storming off when their
 * patience runs out.
 */
export class Journeys {
  constructor(
    private readonly lot: LotStations,
    private readonly layout: LocationLayout,
    private readonly till: Till,
    private readonly moods: CarMoods,
    private readonly departures: Departures,
  ) {}

  /**
   * Of the cars done and waiting for `next`, the one that has waited longest.
   * Without this the tunnel, updated last, took every free dryer and the
   * bays' finished cars sat waiting forever.
   */
  private firstInLine(next: Station): Car | undefined {
    const done = [...this.lot.bays, ...this.lot.finishing].flatMap((s) => (s.car?.state === 'done' ? [{ car: s.car, from: s }] : []));
    const front = this.lot.tunnel?.inside[0];
    if (front?.state === 'done') done.push({ car: front, from: this.lot.tunnel! });
    let first: Car | undefined;
    for (const { car, from } of done) {
      if (nextStop(this.lot.finishing, from, car.wantsDetail) === next && this.wayClear(from, next) && (!first || car.timer > first.timer)) first = car;
    }
    return first;
  }

  /**
   * The finishing lane runs through every station: a car skipping one (the
   * tunnel's cars skip the dryer) can only set off once nobody is in the
   * stations on its way, or it would end up waiting behind a car that is
   * itself waiting for the station it just claimed.
   */
  private wayClear(from: Station, next: Station): boolean {
    const stations = this.lot.finishing;
    const start = stations.indexOf(from) + 1;
    return stations.slice(start, stations.indexOf(next)).every((s) => !s.car);
  }

  /** After a short pause, go to the next free station, or pay and leave. */
  moveOn(dt: number, from: Station, car: Car): void {
    car.timer += dt;
    if (car.timer < TUNING.cars.leaveDelay) return;
    if (from.kind === 'pump') {
      this.leavePump(dt, from, car);
      return;
    }
    const lane = this.layout.finishX;
    // From a bay or the tunnel: down to the lane across the lot, then along it to the finishing lane.
    const toLane =
      from.kind === 'bay' || from.kind === 'tunnel'
        ? [
            { x: from.at.x, z: this.layout.collectZ },
            { x: lane, z: this.layout.collectZ },
          ]
        : [];
    const next = nextStop(this.lot.finishing, from, car.wantsDetail);
    if (next) {
      // Wait here until the next station is free and it's this car's turn.
      if (next.car || !this.wayClear(from, next) || this.firstInLine(next) !== car) return;
      this.leave(from, car);
      next.car = car;
      car.station = next;
      car.state = 'entering';
      car.progress = 0;
      car.supplied = false;
      car.follow([...toLane, next.at]);
      return;
    }
    this.leave(from, car);
    this.till.checkout(car, from);
    this.moods.hide(car);
    car.state = 'leaving';
    const exitZ = from.kind === 'garage' ? this.layout.exitZ : this.layout.earlyExitZ;
    car.follow([...toLane, { x: lane, z: exitZ }, ...this.awayRoute(exitZ)]);
    this.departures.driveOff(car);
  }

  /**
   * Fuelled: drive on along the pump lane and up the exit to the road; then
   * on to a wash lane like any arriving car, or away (paying at the pump).
   * If every wash lane stays full for a few seconds, it gives the wash a
   * miss and just pays for its fuel, so the pumps keep flowing.
   */
  private leavePump(dt: number, from: Station, car: Car): void {
    // Waiting for the driver to come back from the shop.
    if (car.shopping) {
      this.drainPatience(car, dt);
      return;
    }
    const lane = car.wants('wash') ? this.lot.arrivals.washLaneFor(car.def, car.vip) : null;
    if (this.lot.forecourt.depart(car, from, lane) !== 'away') return;
    this.till.checkout(car, from);
    this.moods.hide(car);
    this.departures.driveOff(car);
  }

  /** Out of the lot onto the side street, up it (keeping right) and away along the main road. */
  private awayRoute(exitZ: number): Point[] {
    const { sideStreetX, roadZ, roadLane, leaveX } = this.layout;
    const x = sideStreetX + roadLane;
    const z = roadZ + roadLane;
    return [
      { x, z: exitZ },
      { x, z },
      { x: leaveX, z },
    ];
  }

  private leave(from: Station, car: Car): void {
    if (from instanceof Tunnel) from.inside.splice(from.inside.indexOf(car), 1);
    else from.car = null;
  }

  drainPatience(car: Car, dt: number): void {
    car.patience -= dt;
    if (car.patience > 0) return;
    // Out of patience: pay for what it got (fuel), honk, storm off in a puff of dust.
    this.till.payServed(car);
    this.lot.forecourt.remove(car);
    if (car.shopping) this.lot.mart.cancel(car);
    for (const lane of this.lot.lanes()) {
      if (!lane.queue.includes(car)) continue;
      lane.queue.splice(lane.queue.indexOf(car), 1);
      lane.queue.forEach((c, i) => c.driveTo(slotOf(lane, i, this.layout)));
    }
    if (car.station) this.leave(car.station, car);
    car.station = null;
    this.moods.hide(car);
    this.till.rate('angry');
    this.departures.stormOff(car);
  }

  /** Front car moves into an empty bay or onto the tunnel conveyor; the rest shuffle forward. */
  advanceQueue(lane: Lane): void {
    if (!lane.idle || lane.queue.length === 0) return;
    const next = lane.queue.shift()!;
    next.state = 'entering';
    next.station = lane;
    if (lane instanceof Tunnel) {
      next.driveTo(lane.entry);
      lane.inside.push(next);
    } else {
      next.driveTo(lane.at);
      lane.car = next;
    }
    lane.queue.forEach((car, i) => car.driveTo(slotOf(lane, i, this.layout)));
  }
}
