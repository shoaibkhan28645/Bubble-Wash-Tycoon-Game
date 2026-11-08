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
  // A search's working memory, reused (see findPath).
  private readonly cost: Float32Array;
  private readonly came: Int32Array;
  private readonly seen: Uint32Array;
  private readonly closed: Uint32Array;
  private search = 0;
  private heapCells = new Int32Array(1024);
  private heapF = new Float32Array(1024);
  private heapSize = 0;

  constructor(
    private readonly bounds: Rect,
    obstacles: readonly Rect[],
    radius: number,
  ) {
    this.cols = Math.ceil((bounds.maxX - bounds.minX) / CELL);
    this.rows = Math.ceil((bounds.maxZ - bounds.minZ) / CELL);
    this.blocked = new Uint8Array(this.cols * this.rows);
    const cells = this.cols * this.rows;
    this.cost = new Float32Array(cells);
    this.came = new Int32Array(cells);
    this.seen = new Uint32Array(cells);
    this.closed = new Uint32Array(cells);
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

    // The search's working memory is kept from one search to the next (helpers search every
    // second or so, and fresh arrays each time were a steady stream of garbage on a phone);
    // a cell's numbers count only if it was stamped in this search.
    const search = this.nextSearch();
    const { cost, came, seen, closed } = this;
    const cols = this.cols;
    const gx = goal % cols;
    const gr = Math.floor(goal / cols);
    const guess = (i: number) => {
      const dx = Math.abs((i % cols) - gx);
      const dr = Math.abs(Math.floor(i / cols) - gr);
      return Math.max(dx, dr) + (DIAGONAL - 1) * Math.min(dx, dr);
    };
    seen[start] = search;
    cost[start] = 0;
    came[start] = -1;
    this.heapSize = 0;
    this.push(start, 0);
    let found = false;
    while (this.heapSize > 0) {
      const i = this.pop();
      if (i === goal) {
        found = true;
        break;
      }
      if (closed[i] === search) continue;
      closed[i] = search;
      const c = i % cols;
      const r = Math.floor(i / cols);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nc = c + dc;
          const nr = r + dr;
          if (!this.free(nc, nr)) continue;
          // No cutting corners past a blocked cell.
          if (dc !== 0 && dr !== 0 && (!this.free(c + dc, r) || !this.free(c, r + dr))) continue;
          const n = nr * cols + nc;
          const g = cost[i]! + (dc !== 0 && dr !== 0 ? DIAGONAL : 1);
          if (seen[n] !== search || g < cost[n]!) {
            seen[n] = search;
            cost[n] = g;
            came[n] = i;
            this.push(n, g + guess(n));
          }
        }
      }
    }
    if (!found) return [to];

    const cells: number[] = [];
    for (let i = goal; i !== start; i = came[i]!) cells.push(i);
    cells.reverse();
    const points = cells.map((i) => this.center(i % cols, Math.floor(i / cols)));
    points[points.length - 1] = this.isFree(to) ? to : points[points.length - 1]!;
    return this.straighten(from, points);
  }

  /** A new search's stamp (the stamps start again, cleared, after four billion searches). */
  private nextSearch(): number {
    if (this.search >= 0xfffffffe) {
      this.search = 0;
      this.seen.fill(0);
      this.closed.fill(0);
    }
    return ++this.search;
  }

  /** Adds a cell to the open list, a binary heap on its estimated total cost. */
  private push(cell: number, f: number): void {
    if (this.heapSize >= this.heapCells.length) {
      const cells = new Int32Array(this.heapCells.length * 2);
      const fs = new Float32Array(this.heapF.length * 2);
      cells.set(this.heapCells);
      fs.set(this.heapF);
      this.heapCells = cells;
      this.heapF = fs;
    }
    const heapCells = this.heapCells;
    const heapF = this.heapF;
    let at = this.heapSize++;
    while (at > 0) {
      const up = (at - 1) >> 1;
      if (heapF[up]! <= f) break;
      heapCells[at] = heapCells[up]!;
      heapF[at] = heapF[up]!;
      at = up;
    }
    heapCells[at] = cell;
    heapF[at] = f;
  }

  /** Takes the open cell with the lowest estimated total cost. */
  private pop(): number {
    const heapCells = this.heapCells;
    const heapF = this.heapF;
    const top = heapCells[0]!;
    const size = --this.heapSize;
    if (size === 0) return top;
    const cell = heapCells[size]!;
    const f = heapF[size]!;
    let at = 0;
    for (;;) {
      const left = at * 2 + 1;
      if (left >= size) break;
      const right = left + 1;
      const child = right < size && heapF[right]! < heapF[left]! ? right : left;
      if (heapF[child]! >= f) break;
      heapCells[at] = heapCells[child]!;
      heapF[at] = heapF[child]!;
      at = child;
    }
    heapCells[at] = cell;
    heapF[at] = f;
    return top;
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
