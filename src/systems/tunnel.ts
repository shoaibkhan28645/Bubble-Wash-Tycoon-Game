import { TUNING, UPGRADES, type Point } from '../core/config';
import { levelFactor } from './economy';
import type { WorldLabels } from '../ui/worldLabels';
import type { Car } from './cars';
import { Station } from './stations';

/** Between the cars waiting for the tunnel, middle to middle. */
const SLOT_GAP = 4.6;

/**
 * Automatic brush tunnel (GDD: runs itself on a conveyor, 3 in a line). Cars
 * drive to the entrance, then the conveyor carries them through; the next
 * car may enter once the one ahead is a third of the way in.
 */
export class Tunnel extends Station {
  /** Cars on the conveyor (or waiting at the exit), first in first. */
  readonly inside: Car[] = [];
  readonly entry: Point;
  readonly exit: Point;

  constructor(at: Point, size: { width: number; length: number }, labels: WorldLabels | null) {
    super('tunnel', 'tunnel', at, size, TUNING.stations.tunnel.zonePadding, labels);
    const inset = 1.6;
    this.entry = { x: at.x, z: at.z - size.length / 2 + inset };
    this.exit = { x: at.x, z: at.z + size.length / 2 - inset };
  }

  /** Room on the conveyor for another car. */
  get canAccept(): boolean {
    const last = this.inside[this.inside.length - 1];
    if (this.inside.length >= TUNING.stations.tunnel.capacity) return false;
    return !last || (last.state !== 'entering' && last.progress >= 1 / TUNING.stations.tunnel.capacity);
  }

  override get idle(): boolean {
    return this.canAccept;
  }

  /** Never needs a worker. */
  override get needsWork(): boolean {
    return false;
  }

  /** Where a waiting car parks before the entrance (room for a monster truck at the entrance). */
  slot(index: number): Point {
    return { x: this.at.x, z: this.entry.z - SLOT_GAP * (index + 1) };
  }

  /**
   * One frame of the conveyor: cars drive in, get a soap each, ride through
   * by themselves and wait at the exit. The belt stops while the front car
   * waits for the next station, or a car at the entrance has no soap.
   */
  run(
    dt: number,
    speedLevel: number,
    supplies: { take(station: Station): boolean },
    on: { onMoving(car: Car): void; onFinished(car: Car): void; onWaiting(car: Car): void; onDone(car: Car): void },
  ): void {
    const blocked = this.inside[0]?.state === 'done';
    const seconds = TUNING.stations.tunnel.seconds * levelFactor(UPGRADES.kinds.speed, speedLevel);
    let stalled = false;
    for (const car of [...this.inside]) {
      if (car.state === 'entering') {
        car.update(dt, TUNING.cars.speed);
        if (car.arrived) car.state = 'waiting';
        continue;
      }
      if (car.state === 'done') {
        on.onDone(car);
        continue;
      }
      if (!car.supplied && this.supply) car.supplied = supplies.take(this);
      if ((this.supply && !car.supplied) || blocked) {
        stalled ||= !car.supplied;
        on.onWaiting(car);
        continue;
      }
      car.progress = Math.min(1, car.progress + dt / seconds);
      car.clean = car.progress;
      this.place(car, car.progress);
      on.onMoving(car);
      if (car.progress >= 1) on.onFinished(car);
    }
    const last = this.inside[this.inside.length - 1];
    this.showProgress(!!last, last?.progress ?? 0, stalled);
  }

  /** Puts a car on the conveyor at a given progress (0 = entrance, 1 = exit). */
  place(car: Car, progress: number): void {
    car.model.mesh.position.z = this.entry.z + (this.exit.z - this.entry.z) * progress;
    car.model.mesh.position.x = this.at.x;
  }
}
