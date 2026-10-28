import type { Scene } from 'three';
import type { CarDef, Point, Rect, StageDef } from '../core/config';
import { CarModel } from '../render/models/actors';
import type { Station } from './stations';

/**
 * arriving → queued → entering → waiting (needs service) → done (service
 * finished, waiting for the next station) → entering … → leaving.
 * Any car whose patience runs out while waiting goes `angry` and poofs away.
 */
export type CarState = 'arriving' | 'queued' | 'entering' | 'waiting' | 'done' | 'leaving' | 'angry';

const TURN_RATE = 10;

/** One car on the lot. Drives along waypoints; the bays decide where. */
export class Car {
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
  /** Bought a snack from the vending machine while waiting. */
  snacked = false;
  /** Seconds spent waiting in line. */
  waited = 0;
  private path: Point[] = [];
  /** The turn from the road into the lane, until the car has passed it. */
  private turn: Point | null = null;
  private heading = 0;

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
    const hw = this.def.size[0] / 2;
    const hl = this.def.size[2] / 2;
    return { minX: x - hw, maxX: x + hw, minZ: z - hl, maxZ: z + hl };
  }

  spawn(def: CarDef, at: Point, turn: Point, goal: Point, payDef: CarDef = def): void {
    this.def = def;
    this.payDef = payDef;
    this.vip = !!def.vip;
    this.special = !!def.special;
    this.wantsDetail = false;
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
    this.model.mesh.scale.setScalar(1);
    this.model.setType(def);
    this.model.setClean(def.dirt, 0);
    this.model.mesh.position.set(at.x, 0, at.z);
    this.model.mesh.visible = true;
    this.heading = Math.atan2(turn.x - at.x, turn.z - at.z);
    this.turn = turn;
    this.path = [turn, goal];
  }

  /** New destination down the lane, keeping the road turn if not yet taken. */
  driveTo(goal: Point): void {
    this.path = this.turn ? [this.turn, goal] : [goal];
  }

  /** Drive a fixed route (leaving the lot). */
  follow(points: Point[]): void {
    this.turn = null;
    this.path = [...points];
  }

  update(dt: number, speed: number): void {
    const next = this.path[0];
    this.model.animate(dt, !!next);
    if (!next) return;
    const p = this.model.mesh.position;
    const dx = next.x - p.x;
    const dz = next.z - p.z;
    const dist = Math.hypot(dx, dz);
    const step = speed * dt;
    if (dist <= step) {
      p.x = next.x;
      p.z = next.z;
      if (next === this.turn) this.turn = null;
      this.path.shift();
    } else {
      p.x += (dx / dist) * step;
      p.z += (dz / dist) * step;
    }
    if (dist > 0.01) {
      const goal = Math.atan2(dx, dz);
      const diff = Math.atan2(Math.sin(goal - this.heading), Math.cos(goal - this.heading));
      this.heading += diff * Math.min(1, dt * TURN_RATE);
    }
    this.model.mesh.rotation.y = this.heading;
  }
}

/** Reuses car objects instead of creating and destroying them. */
export class CarPool {
  private readonly free: Car[] = [];

  constructor(private readonly scene: Scene) {}

  acquire(): Car {
    const car = this.free.pop() ?? new Car(new CarModel());
    car.model.mesh.name = 'car';
    this.scene.add(car.model.mesh);
    return car;
  }

  release(car: Car): void {
    car.model.mesh.visible = false;
    this.scene.remove(car.model.mesh);
    this.free.push(car);
  }
}
