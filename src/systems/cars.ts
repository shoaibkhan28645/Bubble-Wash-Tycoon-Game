import type { Scene } from 'three';
import type { CarDef, Point, Rect } from '../core/config';
import { CarModel } from '../render/models/actors';

export type CarState = 'arriving' | 'queued' | 'entering' | 'dirty' | 'washed' | 'leaving';

const TURN_RATE = 10;

/** One car on the lot. Drives along waypoints; the bays decide where. */
export class Car {
  def!: CarDef;
  state: CarState = 'arriving';
  /** Wash progress, 0..1. */
  clean = 0;
  timer = 0;
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

  spawn(def: CarDef, at: Point, turn: Point, goal: Point): void {
    this.def = def;
    this.state = 'arriving';
    this.clean = 0;
    this.timer = 0;
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
    this.model.update(dt, !!next);
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
    this.scene.add(car.model.mesh);
    return car;
  }

  release(car: Car): void {
    car.model.mesh.visible = false;
    this.scene.remove(car.model.mesh);
    this.free.push(car);
  }
}
