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

/**
 * A route with its corners rounded off, as a driver takes them: each bend an
 * arc of `radius` (less where the straights either side are short), as
 * points about `step` apart. The first and last points stay where they are.
 */
export function smoothRoute(route: readonly Point[], radius: number, step = 0.4): Point[] {
  return smoothRouteMarked(route, radius, step).points;
}

/**
 * smoothRoute, saying how far round the route each point is: `ends[j]` is the
 * last of the route's points (by index) that the way has been round by
 * `points[j]` (a corner counts once its bend is done).
 */
export function smoothRouteMarked(route: readonly Point[], radius: number, step = 0.4): { points: Point[]; ends: number[] } {
  const points: Point[] = [];
  const ends: number[] = [];
  const push = (p: Point, end: number) => {
    const last = points[points.length - 1];
    if (last && Math.hypot(p.x - last.x, p.z - last.z) <= 1e-3) {
      ends[ends.length - 1] = Math.max(ends[ends.length - 1]!, end);
      return;
    }
    points.push({ x: p.x, z: p.z });
    ends.push(Math.max(end, ends[ends.length - 1] ?? 0));
  };
  if (route.length === 0) return { points, ends };
  push(route[0]!, 0);
  for (let i = 1; i < route.length - 1; i++) {
    const [a, b, c] = [route[i - 1]!, route[i]!, route[i + 1]!];
    const inLen = Math.hypot(b.x - a.x, b.z - a.z);
    const outLen = Math.hypot(c.x - b.x, c.z - b.z);
    if (inLen < 1e-4 || outLen < 1e-4) {
      // On top of its neighbour: round it as soon as that's reached.
      if (inLen < 1e-4) ends[ends.length - 1] = Math.max(ends[ends.length - 1]!, i);
      else push(b, i);
      continue;
    }
    const u = { x: (b.x - a.x) / inLen, z: (b.z - a.z) / inLen };
    const v = { x: (c.x - b.x) / outLen, z: (c.z - b.z) / outLen };
    const cross = u.x * v.z - u.z * v.x;
    const turn = Math.abs(Math.atan2(cross, u.x * v.x + u.z * v.z));
    if (turn < 1e-3) {
      push(b, i);
      continue;
    }
    // The arc starts and ends this far either side of the corner: no more than the straights allow
    // (all of the first and last, half of one shared with another bend).
    const room = Math.min(inLen * (i === 1 ? 1 : 0.5), outLen * (i === route.length - 2 ? 1 : 0.5));
    const half = Math.tan(turn / 2);
    const t = Math.min(radius * half, room);
    const r = t / half;
    const start = { x: b.x - u.x * t, z: b.z - u.z * t };
    const side = cross > 0 ? 1 : -1;
    const centre = { x: start.x - u.z * r * side, z: start.z + u.x * r * side };
    const n = Math.max(1, Math.ceil((r * turn) / step));
    const rx = start.x - centre.x;
    const rz = start.z - centre.z;
    for (let k = 0; k <= n; k++) {
      const angle = side * turn * (k / n);
      const [s, co] = [Math.sin(angle), Math.cos(angle)];
      push({ x: centre.x + rx * co - rz * s, z: centre.z + rx * s + rz * co }, k === n ? i : i - 1);
    }
  }
  if (route.length > 1) push(route[route.length - 1]!, route.length - 1);
  return { points, ends };
}
