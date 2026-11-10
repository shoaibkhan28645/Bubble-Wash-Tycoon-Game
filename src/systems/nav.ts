import type { Point, Rect } from '../core/config';

const CELL = 0.5;
const DIAGONAL = Math.SQRT2;
/** A shortcut may cost this much more (metres' worth) than the way it cuts out, and still be taken. */
const SHORTCUT_SLACK = 0.2;

/**
 * Where people would rather walk: on the `paved` ground (the park's paths
 * and plaza) a metre costs a metre; anywhere else (the grass) `offPath`
 * metres. Paths found keep to the paving and step off it only near where
 * they're going.
 */
export interface NavCosts {
  paved: readonly Rect[];
  offPath: number;
}

/**
 * Walkable grid over the lot for staff (and the park's visitors). Blocked
 * cells are the solid props (counter, shelf, bench…) grown by the walker's
 * radius. A* finds a path around them (keeping to the paving, if it's told
 * where that is), then the path is straightened where there is a clear
 * line that costs no more than the way round.
 */
export class NavGrid {
  private readonly cols: number;
  private readonly rows: number;
  private readonly blocked: Uint8Array;
  /** What crossing each cell costs (1 on the paving), or null: the same everywhere. */
  private readonly weight: Float32Array | null;
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
    costs?: NavCosts,
  ) {
    this.cols = Math.ceil((bounds.maxX - bounds.minX) / CELL);
    this.rows = Math.ceil((bounds.maxZ - bounds.minZ) / CELL);
    this.blocked = new Uint8Array(this.cols * this.rows);
    const cells = this.cols * this.rows;
    this.cost = new Float32Array(cells);
    this.came = new Int32Array(cells);
    this.seen = new Uint32Array(cells);
    this.closed = new Uint32Array(cells);
    // A cell is blocked if its middle is inside an obstacle grown by the radius: each obstacle marks the cells it covers.
    for (const o of obstacles) this.cover(o, radius, (i) => (this.blocked[i] = 1));
    this.weight = null;
    if (costs) {
      const weight = new Float32Array(cells).fill(Math.max(1, costs.offPath));
      for (const p of costs.paved) this.cover(p, 0, (i) => (weight[i] = 1), true);
      this.weight = weight;
    }
  }

  /** Calls `mark` for each cell whose middle is inside `rect` grown by `grow` (on its edge too, if `edges`). */
  private cover(rect: Rect, grow: number, mark: (cell: number) => void, edges = false): void {
    const { minX, minZ } = this.bounds;
    const first = (low: number, origin: number) => {
      const t = (low - grow - origin) / CELL - 0.5;
      return edges ? Math.ceil(t) : Math.floor(t) + 1;
    };
    const last = (high: number, origin: number) => {
      const t = (high + grow - origin) / CELL - 0.5;
      return edges ? Math.floor(t) : Math.ceil(t) - 1;
    };
    const c0 = Math.max(0, first(rect.minX, minX));
    const c1 = Math.min(this.cols - 1, last(rect.maxX, minX));
    const r0 = Math.max(0, first(rect.minZ, minZ));
    const r1 = Math.min(this.rows - 1, last(rect.maxZ, minZ));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) mark(r * this.cols + c);
  }

  /** What a metre through the cell at `p` costs (Infinity if it's blocked). */
  private weightAt(p: Point): number {
    const c = Math.floor((p.x - this.bounds.minX) / CELL);
    const r = Math.floor((p.z - this.bounds.minZ) / CELL);
    if (!this.free(c, r)) return Infinity;
    return this.weight ? this.weight[r * this.cols + c]! : 1;
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
    const { cost, came, seen, closed, weight } = this;
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
          const step = (dc !== 0 && dr !== 0 ? DIAGONAL : 1) * (weight ? (weight[i]! + weight[n]!) / 2 : 1);
          const g = cost[i]! + step;
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
    // What getting to each point the long way costs, in metres (the search counts in cells).
    const spent = cells.map((i) => cost[i]! * CELL);
    return this.straighten(from, points, spent);
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

  /**
   * Drops waypoints that can be skipped with a clear straight line (that
   * costs no more than the way it cuts out: no cutting across the grass
   * between two paths). `spent`: what getting to each point costs.
   */
  private straighten(from: Point, points: Point[], spent: number[]): Point[] {
    const out: Point[] = [];
    let anchor = from;
    let paid = 0;
    let i = 0;
    while (i < points.length) {
      let far = i;
      for (let j = points.length - 1; j > i; j--) {
        if (this.clearLine(anchor, points[j]!) && (!this.weight || this.lineCost(anchor, points[j]!) <= spent[j]! - paid + SHORTCUT_SLACK)) {
          far = j;
          break;
        }
      }
      out.push(points[far]!);
      anchor = points[far]!;
      paid = spent[far]!;
      i = far + 1;
    }
    return out;
  }

  /** What walking straight from `a` to `b` costs (metres, weighted by the ground underfoot). */
  private lineCost(a: Point, b: Point): number {
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(length / (CELL / 2)));
    let total = 0;
    for (let s = 0; s < steps; s++) {
      const t = (s + 0.5) / steps;
      total += this.weightAt({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
    return (total * length) / steps;
  }

  /**
   * Whether the straight line from `a` to `b` crosses only free cells: every
   * cell it passes through (a walk along the grid, so it can't slip past the
   * corner of a blocked one), bar the one it starts in.
   */
  private clearLine(a: Point, b: Point): boolean {
    const { minX, minZ } = this.bounds;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    let c = Math.floor((a.x - minX) / CELL);
    let r = Math.floor((a.z - minZ) / CELL);
    const endC = Math.floor((b.x - minX) / CELL);
    const endR = Math.floor((b.z - minZ) / CELL);
    const stepC = Math.sign(dx);
    const stepR = Math.sign(dz);
    // How far along the line (0..1) it next crosses a column's or a row's edge, and how far between edges.
    const deltaX = stepC !== 0 ? CELL / Math.abs(dx) : Infinity;
    const deltaZ = stepR !== 0 ? CELL / Math.abs(dz) : Infinity;
    let nextX = stepC > 0 ? (minX + (c + 1) * CELL - a.x) / dx : stepC < 0 ? (minX + c * CELL - a.x) / dx : Infinity;
    let nextZ = stepR > 0 ? (minZ + (r + 1) * CELL - a.z) / dz : stepR < 0 ? (minZ + r * CELL - a.z) / dz : Infinity;
    for (let guard = Math.abs(endC - c) + Math.abs(endR - r) + 2; guard > 0 && (c !== endC || r !== endR); guard--) {
      if (Math.abs(nextX - nextZ) < 1e-9) {
        // Through a corner: both cells beside it must be free too.
        if (!this.free(c + stepC, r) || !this.free(c, r + stepR)) return false;
        c += stepC;
        r += stepR;
        nextX += deltaX;
        nextZ += deltaZ;
      } else if (nextX < nextZ) {
        c += stepC;
        nextX += deltaX;
      } else {
        r += stepR;
        nextZ += deltaZ;
      }
      if (!this.free(c, r)) return false;
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
