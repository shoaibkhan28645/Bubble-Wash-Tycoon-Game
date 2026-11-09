// The farm's road vehicles as drawn. A delivery van parks in the yard facing
// its way out while it loads, then drives out east along its track, up the
// farm's east side and off along the village road; out of sight for most of
// the trip; and back from the other end of the road, in through the farm
// gate and down to where it parks, facing out again. The feed truck visits:
// it comes in from town, stops at the feed store, and leaves again.
import { Group, type Object3D } from 'three';
import type { Point } from '../../core/config';
import { routeAt, routeMarks } from '../../systems/vehicles';
import { farmMover } from './farm';

/** How fast the vans drive on the farm and the road (m/s). */
const SPEED = 7;
/** The share of a trip at most spent driving each way (the rest is off the map, or waiting). */
const MAX_DRIVE = 0.4;

/**
 * trip: out and back the same way, parked at the start between trips. visit: in, wait at the start,
 * out; unseen between visits. loop: start to end once, parked at the start between. round: out along
 * the route, back along another way that ends where it starts, parked at the start between.
 */
export type RouteMode = 'trip' | 'visit' | 'loop' | 'round';

interface Way {
  route: Point[];
  marks: number[];
  length: number;
}

interface Vehicle extends Way {
  model: Object3D;
  mode: RouteMode;
  /** A round's way back. */
  back: Way | null;
}

function way(route: Point[]): Way {
  const marks = routeMarks(route);
  return { route, marks, length: marks[marks.length - 1]! };
}

export class VanFleet {
  readonly group = new Group();
  private readonly vans = new Map<string, Vehicle>();

  /** `onAdd` hears of each vehicle drawn (its wheels turn, render/farmMotion.ts). */
  constructor(private readonly onAdd: (model: Object3D) => void = () => {}) {}

  /** A vehicle on a route (`route[0]` is where it parks, or for a visit where it stops); a round comes back along `back`. */
  add(id: string, model: string, route: Point[], mode: RouteMode = 'trip', back: Point[] = []): void {
    if (this.vans.has(id) || route.length < 2) return;
    const mesh = farmMover(model, 'box');
    const van: Vehicle = { model: mesh, ...way(route), mode, back: mode === 'round' && back.length >= 2 ? way(back) : null };
    this.vans.set(id, van);
    this.idle(van);
    this.group.add(mesh);
    this.onAdd(mesh);
  }

  /** Where a vehicle is drawn now (the combine's harvesting follows it). */
  positionOf(id: string): Point | null {
    const van = this.vans.get(id);
    return van && van.model.visible ? { x: van.model.position.x, z: van.model.position.z } : null;
  }

  /**
   * Each vehicle at its spot: `progress(id)` is 0–1 through the trip, visit
   * or loop, or null when idle. `seconds` is how long that takes.
   */
  update(progress: (id: string) => number | null, seconds: (id: string) => number): void {
    for (const [id, van] of this.vans) {
      const p = progress(id);
      if (p === null) {
        this.idle(van);
        continue;
      }
      if (van.mode === 'loop') {
        this.place(van, p * van.length, false);
        continue;
      }
      if (van.mode === 'round' && van.back) {
        // Each way at the vans' own speed: out, off the map for most of it, and in the other way.
        const total = Math.max(1, seconds(id));
        const out = Math.min(MAX_DRIVE, van.length / SPEED / total);
        const home = Math.min(MAX_DRIVE, van.back.length / SPEED / total);
        if (p < out) this.place(van, (p / out) * van.length, false);
        else if (p > 1 - home) this.place(van, ((p - (1 - home)) / home) * van.back.length, false, van.back);
        else van.model.visible = false;
        continue;
      }
      const drive = Math.min(MAX_DRIVE, van.length / SPEED / Math.max(1, seconds(id)));
      if (van.mode === 'trip') {
        if (p < drive) this.place(van, (p / drive) * van.length, false);
        else if (p > 1 - drive) this.place(van, ((1 - p) / drive) * van.length, true);
        else van.model.visible = false;
      } else if (p < drive) this.place(van, (1 - p / drive) * van.length, true);
      else if (p > 1 - drive) this.place(van, ((p - (1 - drive)) / drive) * van.length, false);
      else this.place(van, 0, true);
    }
  }

  private idle(van: Vehicle): void {
    if (van.mode === 'visit') van.model.visible = false;
    else this.place(van, 0, false);
  }

  /** Puts a vehicle `distance` along its route (or `along` another way), facing the way it goes (back towards the start, if `returning`). */
  private place(van: Vehicle, distance: number, returning: boolean, along: Way = van): void {
    const { at, heading } = routeAt(along.route, along.marks, distance);
    van.model.visible = true;
    van.model.position.set(at.x, 0, at.z);
    van.model.rotation.y = returning ? heading + Math.PI : heading;
  }
}
