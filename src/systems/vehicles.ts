// Routes the farm's vehicles drive (Chapter 2): the delivery vans, the feed
// truck, the combine and the pickup each follow a list of points, and these
// say how long a route is and where along it a vehicle is, facing which way.
import type { Point } from '../core/config';

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
