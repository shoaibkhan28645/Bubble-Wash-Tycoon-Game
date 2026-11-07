// The farm's vans as drawn: parked at the yard while they load, then
// driving out along the track, through the farm gate and off along the
// village road; out of sight for most of the trip; and back the same way.
import { Group, type Object3D } from 'three';
import type { Point } from '../../core/config';
import { farmModel } from './farm';

/** How fast the vans drive on the farm and the road (m/s). */
const SPEED = 7;
/** The share of a trip at most spent driving each way (the rest is off the map). */
const MAX_DRIVE = 0.4;

interface Van {
  model: Object3D;
  route: Point[];
  /** Distance from the start to each route point. */
  marks: number[];
  length: number;
}

/** Where a point at `distance` along the route is, and which way it faces there. */
function along(van: Van, distance: number): { at: Point; heading: number } {
  const d = Math.max(0, Math.min(van.length, distance));
  for (let i = 1; i < van.route.length; i++) {
    if (d > van.marks[i]! && i < van.route.length - 1) continue;
    const a = van.route[i - 1]!;
    const b = van.route[i]!;
    const span = van.marks[i]! - van.marks[i - 1]!;
    const k = span > 0 ? (d - van.marks[i - 1]!) / span : 0;
    return { at: { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k }, heading: Math.atan2(b.x - a.x, b.z - a.z) };
  }
  return { at: van.route[0]!, heading: 0 };
}

export class VanFleet {
  readonly group = new Group();
  private readonly vans = new Map<string, Van>();

  /** A newly built van, parked at the start of its route (facing along it). */
  add(id: string, model: string, route: Point[]): void {
    if (this.vans.has(id) || route.length < 2) return;
    const mesh = farmModel(model);
    mesh.traverse((node) => (node.castShadow = node.receiveShadow = true));
    const marks = [0];
    for (let i = 1; i < route.length; i++) marks.push(marks[i - 1]! + Math.hypot(route[i]!.x - route[i - 1]!.x, route[i]!.z - route[i - 1]!.z));
    const van: Van = { model: mesh, route, marks, length: marks[marks.length - 1]! };
    this.vans.set(id, van);
    this.place(van, 0, false);
    this.group.add(mesh);
  }

  /**
   * Each van at its spot for its trip: `progress(id)` is 0–1 through the
   * trip, or null while it's in the yard. `trip` is the trip's length in seconds.
   */
  update(progress: (id: string) => number | null, trip: (id: string) => number): void {
    for (const [id, van] of this.vans) {
      const p = progress(id);
      if (p === null) {
        this.place(van, 0, false);
        continue;
      }
      const drive = Math.min(MAX_DRIVE, van.length / SPEED / Math.max(1, trip(id)));
      if (p < drive) this.place(van, (p / drive) * van.length, false);
      else if (p > 1 - drive) this.place(van, ((1 - p) / drive) * van.length, true);
      else van.model.visible = false;
    }
  }

  /** Puts a van `distance` along its route, facing the way it goes (home, if `returning`). */
  private place(van: Van, distance: number, returning: boolean): void {
    const { at, heading } = along(van, distance);
    van.model.visible = true;
    van.model.position.set(at.x, 0, at.z);
    van.model.rotation.y = returning && distance > 0.01 ? heading + Math.PI : heading;
  }
}
