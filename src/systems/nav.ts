import type { Point, Rect } from '../core/config';

const CELL = 0.5;
const DIAGONAL = Math.SQRT2;

/**
 * Walkable grid over the lot for staff. Blocked cells are the solid props
 * (counter, shelf, bench…) grown by the walker's radius. A* finds a path
 * around them, then the path is straightened where there is a clear line.
 */
export class NavGrid {
  private readonly cols: number;
  private readonly rows: number;
  private readonly blocked: Uint8Array;

  constructor(
    private readonly bounds: Rect,
    obstacles: readonly Rect[],
    radius: number,
  ) {
    this.cols = Math.ceil((bounds.maxX - bounds.minX) / CELL);
    this.rows = Math.ceil((bounds.maxZ - bounds.minZ) / CELL);
    this.blocked = new Uint8Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const p = this.center(c, r);
        const hit = obstacles.some(
          (o) => p.x > o.minX - radius && p.x < o.maxX + radius && p.z > o.minZ - radius && p.z < o.maxZ + radius,
        );
        if (hit) this.blocked[r * this.cols + c] = 1;
      }
    }
  }

  /** Waypoints from `from` to `to` (excluding `from`), or a straight line if no path exists. */
  findPath(from: Point, to: Point): Point[] {
    const start = this.nearestFree(this.cellOf(from));
    const goal = this.nearestFree(this.cellOf(to));
    if (start === null || goal === null) return [to];
    if (start === goal) return [to];

    const total = this.cols * this.rows;
    const cost = new Float32Array(total).fill(Infinity);
    const came = new Int32Array(total).fill(-1);
    const closed = new Uint8Array(total);
    const open: { i: number; f: number }[] = [{ i: start, f: 0 }];
    cost[start] = 0;
    const gx = goal % this.cols;
    const gr = Math.floor(goal / this.cols);
    const guess = (i: number) => {
      const dx = Math.abs((i % this.cols) - gx);
      const dr = Math.abs(Math.floor(i / this.cols) - gr);
      return Math.max(dx, dr) + (DIAGONAL - 1) * Math.min(dx, dr);
    };

    while (open.length > 0) {
      // Small grids: a linear scan for the best node is fast enough and simple.
      let best = 0;
      for (let k = 1; k < open.length; k++) if (open[k]!.f < open[best]!.f) best = k;
      const { i } = open.splice(best, 1)[0]!;
      if (i === goal) break;
      if (closed[i]) continue;
      closed[i] = 1;
      const c = i % this.cols;
      const r = Math.floor(i / this.cols);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nc = c + dc;
          const nr = r + dr;
          if (!this.free(nc, nr)) continue;
          // No cutting corners past a blocked cell.
          if (dc !== 0 && dr !== 0 && (!this.free(c + dc, r) || !this.free(c, r + dr))) continue;
          const n = nr * this.cols + nc;
          const g = cost[i]! + (dc !== 0 && dr !== 0 ? DIAGONAL : 1);
          if (g < cost[n]!) {
            cost[n] = g;
            came[n] = i;
            open.push({ i: n, f: g + guess(n) });
          }
        }
      }
    }
    if (came[goal] === -1) return [to];

    const cells: number[] = [];
    for (let i = goal; i !== start; i = came[i]!) cells.push(i);
    cells.reverse();
    const points = cells.map((i) => this.center(i % this.cols, Math.floor(i / this.cols)));
    points[points.length - 1] = this.isFree(to) ? to : points[points.length - 1]!;
    return this.straighten(from, points);
  }

  /** True if a point is outside every grown obstacle. */
  isFree(p: Point): boolean {
    const c = Math.floor((p.x - this.bounds.minX) / CELL);
    const r = Math.floor((p.z - this.bounds.minZ) / CELL);
    return this.free(c, r);
  }

  /** Drops waypoints that can be skipped with a clear straight line. */
  private straighten(from: Point, points: Point[]): Point[] {
    const out: Point[] = [];
    let anchor = from;
    let i = 0;
    while (i < points.length) {
      let far = i;
      for (let j = points.length - 1; j > i; j--) {
        if (this.clearLine(anchor, points[j]!)) {
          far = j;
          break;
        }
      }
      out.push(points[far]!);
      anchor = points[far]!;
      i = far + 1;
    }
    return out;
  }

  private clearLine(a: Point, b: Point): boolean {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (CELL / 2));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      if (!this.isFree({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })) return false;
    }
    return true;
  }

  private free(c: number, r: number): boolean {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows && this.blocked[r * this.cols + c] === 0;
  }

  private cellOf(p: Point): number {
    const c = Math.min(this.cols - 1, Math.max(0, Math.floor((p.x - this.bounds.minX) / CELL)));
    const r = Math.min(this.rows - 1, Math.max(0, Math.floor((p.z - this.bounds.minZ) / CELL)));
    return r * this.cols + c;
  }

  /** The cell itself if free, else the closest free cell (spiralling out). */
  private nearestFree(i: number): number | null {
    const c0 = i % this.cols;
    const r0 = Math.floor(i / this.cols);
    for (let ring = 0; ring < Math.max(this.cols, this.rows); ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          if (this.free(c0 + dc, r0 + dr)) return (r0 + dr) * this.cols + c0 + dc;
        }
      }
    }
    return null;
  }

  private center(c: number, r: number): Point {
    return { x: this.bounds.minX + (c + 0.5) * CELL, z: this.bounds.minZ + (r + 0.5) * CELL };
  }
}
