import { TUNING, type LocationLayout, type Point } from '../core/config';
import type { WorldLabels } from '../ui/worldLabels';
import { CORNER, slotOf, type Lane } from './arrivals';
import type { Car } from './cars';
import { Station } from './stations';

/** The attendant stands this far off the island's end (by the cars' filler caps), between the two lanes. */
const ISLAND_END = 2.25;
/** And this far towards the pump's own lane, well inside its zone (which ends a little past the island's middle). */
const LANE_SIDE = 0.45;

/**
 * The fuel forecourt across the road. Cars turn in at the entry, wait in
 * one line for whichever pump frees up first, drive along that pump's lane
 * to fill up, and leave by the exit back onto the road.
 */
export class Forecourt {
  /** Pumps in build order; each has its own lane, side by side. */
  readonly pumps: Station[] = [];
  /** Cars waiting for a pump, first in line first. */
  readonly line: Car[] = [];
  /** The car driving out along the exit (both pumps' lanes share it, so one at a time), and which arrival it was. */
  private leaving: { car: Car; serial: number } | null = null;

  constructor(
    private readonly layout: LocationLayout,
    /** Null in tests (no page to draw on). */
    private readonly labels: WorldLabels | null,
  ) {}

  /** Opens the pump a built pad provides, with the spot its worker stands on. */
  addPump(id: string): void {
    const at = this.layout.pads[id];
    if (!at || this.pumps.some((p) => p.id === id)) return;
    const pump = new Station(id, 'pump', at, this.layout.pump, TUNING.stations.pump.zonePadding, this.labels);
    // Off the island's end towards the way in (cars' backs), just on this pump's side of it.
    const island = this.layout.buildAt[id] ?? at;
    const back = Math.sign(this.layout.forecourt.entryX - island.x);
    pump.side = { x: island.x + back * ISLAND_END, z: island.z + Math.sign(at.z - island.z) * LANE_SIDE };
    // Each lane's fuel gauge over its own end of the car, so the two never overlap on screen.
    pump.moveRing(at.x + Math.sign(at.z - island.z) * 1.1, 1.9, at.z);
    this.pumps.push(pump);
  }

  /** Where a car waits for a pump, just in off the road. */
  get waitSpot(): Point {
    const { entryX, waitZ } = this.layout.forecourt;
    return { x: entryX, z: waitZ };
  }

  /** Room for another fuel car: a free pump, or a free spot in the line. */
  get hasRoom(): boolean {
    if (this.pumps.length === 0) return false;
    const free = this.pumps.filter((p) => !p.car).length;
    return this.line.length < free + TUNING.stations.pump.queueSpots;
  }

  /** Sends the first car in line to each free pump, down the entry and along that pump's lane. */
  advance(): void {
    for (const pump of this.pumps) {
      const car = this.line[0];
      if (!car) return;
      if (pump.car) continue;
      this.line.shift();
      pump.car = car;
      car.station = pump;
      car.state = 'entering';
      car.progress = 0;
      car.supplied = false;
      car.then([{ x: this.layout.forecourt.entryX, z: pump.at.z }], pump.at);
    }
  }

  /** Takes a car out of the line (it ran out of patience). */
  remove(car: Car): void {
    const i = this.line.indexOf(car);
    if (i >= 0) this.line.splice(i, 1);
  }

  /**
   * A filled-up car leaves its pump: over the road into `washLane`'s line if
   * it wants a wash too (with some patience back), otherwise away along the
   * far side of the road. While every wash lane is full it stays at the pump,
   * and after a few seconds gives the wash a miss.
   */
  depart(car: Car, pump: Station, washLane: Lane | null): 'stay' | 'wash' | 'away' {
    if (car.wants('wash') && !washLane) {
      if (car.timer < TUNING.cars.leaveDelay + TUNING.fuel.washWaitSeconds) return 'stay';
      car.needs = car.needs.filter((need) => need !== 'wash');
    }
    if (this.exitBusy) return 'stay';
    this.leaving = { car, serial: car.serial };
    pump.car = null;
    car.station = null;
    const { roadZ, roadLane, forecourt } = this.layout;
    if (washLane && car.wants('wash')) {
      car.state = 'arriving';
      car.patience = Math.min(car.patienceMax, car.patience + car.patienceMax * TUNING.fuel.patienceRefill);
      car.route(this.acrossTo(pump, washLane.at.x), slotOf(washLane, washLane.queue.length, this.layout));
      washLane.queue.push(car);
      return 'wash';
    }
    car.state = 'leaving';
    const road = roadZ - roadLane;
    car.follow([...this.exitRoute(pump, road, forecourt.leaveX), { x: forecourt.leaveX, z: road }]);
    return 'away';
  }

  /** Another car is still on its way out along the exit, inside the forecourt. */
  private get exitBusy(): boolean {
    const out = this.leaving;
    // Gone (back in the pool, or out again as a new arrival), or back at a station.
    if (!out || out.car.serial !== out.serial || !out.car.model.mesh.visible || out.car.station) return false;
    return out.car.position.z < this.layout.roadZ - this.layout.roadLane * 2;
  }

  /**
   * From a pump over the road into the lot at `laneX`, cutting the corners. A lane just across from the
   * exit is driven straight over to; one further along, by the near side of the road.
   */
  private acrossTo(pump: Station, laneX: number): Point[] {
    const { roadZ, roadLane, forecourt } = this.layout;
    const near = roadZ + roadLane;
    const into = { x: laneX, z: near + CORNER };
    if (Math.abs(laneX - forecourt.exitX) < 2 * CORNER) return [{ x: forecourt.exitX, z: pump.at.z }, { x: forecourt.exitX, z: roadZ - roadLane - CORNER }, into];
    const turn = Math.sign(laneX - forecourt.exitX) * CORNER;
    return [...this.exitRoute(pump, near, laneX), { x: laneX - turn, z: near }, into];
  }

  /** From a pump on along its lane and out across the pavement to the road (at `roadZ`), cutting the corner towards `towardsX`. */
  private exitRoute(pump: Station, roadZ: number, towardsX: number): Point[] {
    const { exitX } = this.layout.forecourt;
    const turn = Math.sign(towardsX - exitX) * CORNER;
    return [
      { x: exitX, z: pump.at.z },
      { x: exitX, z: roadZ - CORNER },
      { x: exitX + turn, z: roadZ },
    ];
  }
}
