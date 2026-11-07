// The farm's machines (Chapter 2, Part D): the tractor the hero drives (or
// its driver, once hired), its trailer, and the routes the other machines
// follow. The tractor steers towards wherever the joystick points, at a
// speed set by how far it's pushed, slowing to take tight turns; it can't
// drive through buildings or off the farm. Its trailer follows the hitch.
import type { Point, Rect } from '../core/config';
import type { MoveInput } from './input';
import { pushOut } from './player';

/** How a vehicle drives. */
export interface DriveRules {
  /** Top speed (m/s) and how quickly it gets there or stops (m/s²). */
  speed: number;
  accel: number;
  /** Fastest turn (radians per second). */
  turn: number;
  /** Size, as a circle, for bumping into things. */
  radius: number;
  /** From the vehicle's middle back to the hitch, and from the hitch back to the trailer's axle. */
  hitch: number;
  trailer: number;
}

export const TRACTOR: DriveRules = { speed: 5.2, accel: 6, turn: 2.4, radius: 1.05, hitch: 1.45, trailer: 1.75 };

/** Turns `from` towards `to` by at most `step`, the short way round. */
function turnTowards(from: number, to: number, step: number): number {
  const diff = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + Math.max(-step, Math.min(step, diff));
}

/** A vehicle with a trailer: where it is, which way it faces (0 = +z), how fast it's going. */
export class Rig {
  at: Point;
  heading: number;
  speed = 0;
  readonly trailer: { at: Point; heading: number };

  constructor(
    park: Point,
    heading: number,
    private readonly rules: DriveRules = TRACTOR,
  ) {
    this.at = { ...park };
    this.heading = heading;
    this.trailer = { at: { x: 0, z: 0 }, heading };
    this.place(park, heading);
  }

  /** Puts it somewhere, trailer straight behind. */
  place(at: Point, heading: number): void {
    this.at = { ...at };
    this.heading = heading;
    this.speed = 0;
    const back = this.rules.hitch + this.rules.trailer;
    this.trailer.at = { x: at.x - Math.sin(heading) * back, z: at.z - Math.cos(heading) * back };
    this.trailer.heading = heading;
  }

  /**
   * Drives by the joystick: turns towards where it points and goes at a
   * speed set by how far it's pushed (`boost` for engine upgrades), slowing
   * into sharp turns. Nothing solid or off the farm can be driven through.
   */
  drive(dt: number, move: MoveInput, obstacles: readonly Rect[], bounds: Rect, boost = 1): void {
    const push = Math.min(1, Math.hypot(move.x, move.z));
    let want = 0;
    if (push > 0.05) {
      const goal = Math.atan2(move.x, move.z);
      this.heading = turnTowards(this.heading, goal, this.rules.turn * dt);
      const off = Math.abs(Math.atan2(Math.sin(goal - this.heading), Math.cos(goal - this.heading)));
      // Full speed when pointing the right way; a crawl while swinging round.
      want = this.rules.speed * boost * push * Math.max(0.25, Math.cos(Math.min(off, Math.PI / 2)));
    }
    this.move(dt, want, obstacles, bounds);
  }

  /** Drives itself towards a point (the tractor driver). True once there. */
  steerTo(dt: number, target: Point, obstacles: readonly Rect[], bounds: Rect, boost = 1, arrive = 0.8): boolean {
    const dx = target.x - this.at.x;
    const dz = target.z - this.at.z;
    const dist = Math.hypot(dx, dz);
    if (dist < arrive) return true;
    const goal = Math.atan2(dx, dz);
    this.heading = turnTowards(this.heading, goal, this.rules.turn * dt);
    const off = Math.abs(Math.atan2(Math.sin(goal - this.heading), Math.cos(goal - this.heading)));
    const want = this.rules.speed * boost * Math.max(0.3, Math.cos(Math.min(off, Math.PI / 2))) * Math.min(1, dist / 2);
    this.move(dt, want, obstacles, bounds);
    return false;
  }

  /** Stops where it is (unloading, or the hero got out). */
  brake(dt: number): void {
    this.move(dt, 0, [], { minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity });
  }

  private move(dt: number, want: number, obstacles: readonly Rect[], bounds: Rect): void {
    const change = this.rules.accel * dt;
    this.speed += Math.max(-change, Math.min(change, want - this.speed));
    const p = { x: this.at.x + Math.sin(this.heading) * this.speed * dt, z: this.at.z + Math.cos(this.heading) * this.speed * dt };
    const r = this.rules.radius;
    for (const rect of obstacles) pushOut(p, r, rect);
    p.x = Math.min(bounds.maxX - r, Math.max(bounds.minX + r, p.x));
    p.z = Math.min(bounds.maxZ - r, Math.max(bounds.minZ + r, p.z));
    // Bumped into something: the speed is what it really managed.
    const moved = Math.hypot(p.x - this.at.x, p.z - this.at.z);
    if (dt > 0) this.speed = Math.min(this.speed, moved / dt);
    this.at = p;
    this.follow();
  }

  /** The trailer swings in behind the hitch. */
  private follow(): void {
    const hitch = { x: this.at.x - Math.sin(this.heading) * this.rules.hitch, z: this.at.z - Math.cos(this.heading) * this.rules.hitch };
    const dx = hitch.x - this.trailer.at.x;
    const dz = hitch.z - this.trailer.at.z;
    const d = Math.hypot(dx, dz) || 1;
    this.trailer.heading = Math.atan2(dx, dz);
    this.trailer.at = { x: hitch.x - (dx / d) * this.rules.trailer, z: hitch.z - (dz / d) * this.rules.trailer };
  }
}

/** Length of a route, and how far along it each point is. */
export function routeMarks(route: readonly Point[]): number[] {
  const marks = [0];
  for (let i = 1; i < route.length; i++) marks.push(marks[i - 1]! + Math.hypot(route[i]!.x - route[i - 1]!.x, route[i]!.z - route[i - 1]!.z));
  return marks;
}

/** Where `distance` along a route is, and which way it faces there. */
export function routeAt(route: readonly Point[], marks: readonly number[], distance: number): { at: Point; heading: number } {
  const total = marks[marks.length - 1] ?? 0;
  const d = Math.max(0, Math.min(total, distance));
  for (let i = 1; i < route.length; i++) {
    if (d > marks[i]! && i < route.length - 1) continue;
    const a = route[i - 1]!;
    const b = route[i]!;
    const span = marks[i]! - marks[i - 1]!;
    const k = span > 0 ? (d - marks[i - 1]!) / span : 0;
    return { at: { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k }, heading: Math.atan2(b.x - a.x, b.z - a.z) };
  }
  return { at: route[0] ?? { x: 0, z: 0 }, heading: 0 };
}

/**
 * The tractor driver: drives a loop of waypoints round the fields, stopping
 * at the barn door until the trailer is empty. Keeps its place in the loop.
 */
export class TractorDriver {
  private next = 0;

  constructor(private readonly route: readonly Point[]) {}

  /** One frame of driving; `unloading` holds it still (at the barn with crates aboard). */
  update(dt: number, rig: Rig, unloading: boolean, obstacles: readonly Rect[], bounds: Rect, boost = 1): void {
    if (this.route.length === 0) return;
    if (unloading) {
      rig.brake(dt);
      return;
    }
    if (rig.steerTo(dt, this.route[this.next]!, obstacles, bounds, boost)) this.next = (this.next + 1) % this.route.length;
  }

  /** Starts from the waypoint nearest the tractor (when it takes over where the hero left it). */
  rejoin(at: Point): void {
    let best = 0;
    let bestD = Infinity;
    this.route.forEach((p, i) => {
      const d = Math.hypot(p.x - at.x, p.z - at.z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    this.next = best;
  }
}
