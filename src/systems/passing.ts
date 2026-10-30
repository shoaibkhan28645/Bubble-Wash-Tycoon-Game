// Traffic passing along Main Street, both ways (not customers): cars come
// on at one end and go off at the other. Like every car they wait for
// whatever is in front of them (roadRules.ts): another car, a customer
// pulling out of the side street, someone on the zebra crossing.
import { CARS, TUNING, type LocationLayout, type Point } from '../core/config';
import { between } from './economy';
import type { Car, CarPool } from './cars';

/** A car only comes on where its lane is clear this far in, and this wide. */
const CLEAR = 8;
const LANE_HALF = 1.1;

interface Passer {
  car: Car;
  /** +1 driving east (+x), -1 driving west. */
  dir: 1 | -1;
}

export class PassingTraffic {
  private readonly passers: Passer[] = [];
  private readonly timers: Record<'1' | '-1', number> = { '1': 2, '-1': 0.5 };

  constructor(
    private readonly pool: CarPool,
    private readonly layout: LocationLayout,
    /** Everyone and everything that might be on the road: other cars and the people walking. */
    private readonly inTheWay: () => Point[],
    private readonly rand: () => number = Math.random,
  ) {}

  get count(): number {
    return this.passers.length;
  }

  /** The lane's z, and where its cars come on and go off. */
  private lane(dir: 1 | -1): { z: number; from: number; to: number } {
    const { roadZ, roadLane } = this.layout;
    const end = TUNING.streetLife.roadEnd;
    return { z: dir > 0 ? roadZ + roadLane : roadZ - roadLane, from: -dir * end, to: dir * end };
  }

  update(dt: number): void {
    const t = TUNING.streetLife;
    const others = this.inTheWay();
    for (const dir of [1, -1] as const) {
      const key = String(dir) as '1' | '-1';
      this.timers[key] -= dt;
      if (this.timers[key] > 0 || this.passers.length >= t.cars) continue;
      const { z, from, to } = this.lane(dir);
      // Only onto an empty stretch of road.
      if (others.some((o) => Math.abs(o.z - z) < LANE_HALF && Math.abs(o.x - from) < CLEAR)) continue;
      this.spawn(dir, z, from, to);
      this.timers[key] = between(t.carsEvery, this.rand);
    }
    for (const p of [...this.passers]) {
      p.car.update(dt, TUNING.cars.speed);
      if (p.car.arrived) {
        this.passers.splice(this.passers.indexOf(p), 1);
        this.pool.release(p.car);
      }
    }
  }

  private spawn(dir: 1 | -1, z: number, from: number, to: number): void {
    const types = CARS.filter((c) => !c.vip && c.id !== 'monster');
    const def = types[Math.floor(this.rand() * types.length)]!;
    const car = this.pool.acquire();
    // Clean (no wash wanted), just passing through.
    car.spawn(def, { x: from, z }, [], { x: to, z }, def, []);
    car.state = 'leaving';
    this.passers.push({ car, dir });
  }
}
