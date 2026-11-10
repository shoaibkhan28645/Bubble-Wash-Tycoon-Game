// The tracks the log flume's logs float round and the Starlight Comet's
// train runs on: a smooth closed loop through the layout's points, with a
// frame at every point (which way is ahead and which way is up; the coaster
// leans into its turns and turns upside down through its loop), a natural
// speed all the way round (hauled up the lifts, faster down the drops,
// slowing into the station), and the track itself drawn as one mesh: the
// flume's wooden channel of water on its posts, the coaster's pink rails on
// a white spine and columns.
import { BufferGeometry, CatmullRomCurve3, Color, Float32BufferAttribute, Matrix4, Mesh, Quaternion, Vector3 } from 'three';
import type { Point, Rect, TrackSpot } from '../core/config';
import { toyMaterial } from './models/build';

export type TrackStyle = 'flume' | 'coaster';

/** Metres between the points the track is worked out at. */
const STEP = 0.25;
const GRAVITY = 9.8;

/**
 * How cars move on each kind of track (metres a second): up a lift; never
 * slower than `min` (the flume's current, the coaster's momentum) nor faster
 * than `max`; slowed by `drag` (m/s²); pulling away from the station and
 * braking into it (m/s²); and how far the coaster leans into a turn.
 */
const MOTION: Record<TrackStyle, { lift: number; min: number; max: number; drag: number; launch: number; brake: number; bank: number }> = {
  flume: { lift: 1.7, min: 2.4, max: 8.5, drag: 1.1, launch: 1.4, brake: 1.5, bank: 0 },
  coaster: { lift: 3.2, min: 3.6, max: 15, drag: 0.2, launch: 2.2, brake: 2.8, bank: 1.8 },
};
/** The most the coaster leans (radians). */
const MAX_BANK = 0.55;

const UP = new Vector3(0, 1, 0);

/** A ride's track: where along it (metres from the station's middle) is where, facing which way, reached when. */
export class Track {
  readonly length: number;
  /** Seconds for one lap at the track's natural speed. */
  readonly lapSeconds: number;
  /** Where each control point is along the track (metres). */
  readonly marks: number[];
  readonly step: number;
  private readonly pos: Vector3[] = [];
  private readonly ahead: Vector3[] = [];
  private readonly up: Vector3[] = [];
  /** Seconds from the station to each point, at natural speed. */
  private readonly clock: number[] = [];

  constructor(
    readonly spot: TrackSpot,
    readonly style: TrackStyle,
  ) {
    const points = spot.points.map(([x = 0, z = 0, h = 0]) => new Vector3(x, h, z));
    const curve = new CatmullRomCurve3(points, true, 'centripetal');
    curve.arcLengthDivisions = points.length * 40;
    const lengths = curve.getLengths(curve.arcLengthDivisions);
    this.length = curve.getLength();
    this.marks = points.map((_, k) => lengths[k * 40]!);
    const n = Math.max(8, Math.round(this.length / STEP));
    this.step = this.length / n;
    for (let i = 0; i < n; i++) {
      const u = i / n;
      this.pos.push(curve.getPointAt(u));
      this.ahead.push(curve.getTangentAt(u).normalize());
    }
    this.frames();
    this.clock = this.timetable();
    this.lapSeconds = this.clock[n]!;
  }

  get count(): number {
    return this.pos.length;
  }

  /** Point `i` (wrapping round), its heading and up. */
  sample(i: number): { pos: Vector3; ahead: Vector3; up: Vector3 } {
    const k = ((i % this.count) + this.count) % this.count;
    return { pos: this.pos[k]!, ahead: this.ahead[k]!, up: this.up[k]! };
  }

  /** Where along the track (metres) a car is `seconds` into a lap at natural speed. */
  distanceAt(seconds: number): number {
    const t = Math.max(0, Math.min(this.lapSeconds, seconds));
    let lo = 0;
    let hi = this.clock.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.clock[mid]! <= t) lo = mid;
      else hi = mid;
    }
    const span = this.clock[hi]! - this.clock[lo]!;
    const f = span > 0 ? (t - this.clock[lo]!) / span : 0;
    return (lo + f) * this.step;
  }

  /** The car's middle and how it's turned, `s` metres along (wrapping round). */
  frame(s: number, at: Vector3, turn: Quaternion): void {
    const x = (((s % this.length) + this.length) % this.length) / this.step;
    const i = Math.floor(x);
    const f = x - i;
    const a = this.sample(i);
    const b = this.sample(i + 1);
    at.lerpVectors(a.pos, b.pos, f);
    ahead.lerpVectors(a.ahead, b.ahead, f).normalize();
    up.lerpVectors(a.up, b.up, f);
    up.addScaledVector(ahead, -up.dot(ahead)).normalize();
    side.crossVectors(ahead, up);
    turn.setFromRotationMatrix(basis.makeBasis(ahead, up, side));
  }

  /** The nearest point along the track (metres) to a place on the ground. */
  nearest(p: Point): number {
    let best = 0;
    let gap = Infinity;
    this.pos.forEach((q, i) => {
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < gap) {
        gap = d;
        best = i;
      }
    });
    return best * this.step;
  }

  /** On a lift at `s` metres along. */
  private onLift(s: number): boolean {
    return (this.spot.lifts ?? []).some(([a = 0, b = 0]) => s >= this.marks[a]! && s <= this.marks[b]!);
  }

  /**
   * Which way is up at each point: carried along from the station's (straight
   * up) turning only as the track turns, so it goes upside down round a loop
   * and comes out the right way up; whatever twist is left over by the time
   * it's back at the station shared out all the way round. Then the coaster
   * leans into its turns.
   */
  private frames(): void {
    const n = this.count;
    const turn = new Quaternion();
    let u = UP.clone().addScaledVector(this.ahead[0]!, -this.ahead[0]!.y).normalize();
    this.up.push(u.clone());
    for (let i = 1; i <= n; i++) {
      turn.setFromUnitVectors(this.ahead[i - 1]!, this.ahead[i % n]!);
      u = u.clone().applyQuaternion(turn);
      const t = this.ahead[i % n]!;
      u.addScaledVector(t, -u.dot(t)).normalize();
      if (i < n) this.up.push(u);
    }
    // Back at the start: the twist between where "up" came round to and where it began.
    const t0 = this.ahead[0]!;
    const twist = Math.atan2(new Vector3().crossVectors(u, this.up[0]!).dot(t0), u.dot(this.up[0]!));
    for (let i = 1; i < n; i++) this.up[i]!.applyAxisAngle(this.ahead[i]!, (twist * i) / n);
    const lean = MOTION[this.style].bank;
    if (lean === 0) return;
    // How sharply it turns (radians a metre, seen from above), smoothed over a few metres, leaning right on a right turn.
    const heading = this.ahead.map((a) => Math.atan2(a.x, a.z));
    const bend = heading.map((h, i) => {
      const next = heading[(i + 1) % n]!;
      return Math.atan2(Math.sin(next - h), Math.cos(next - h)) / this.step;
    });
    const reach = Math.round(2 / this.step);
    for (let i = 0; i < n; i++) {
      if (Math.abs(this.ahead[i]!.y) > 0.5 || this.up[i]!.y < 0.7) continue;
      let sum = 0;
      for (let k = -reach; k <= reach; k++) sum += bend[(i + k + n) % n]!;
      const bank = Math.max(-MAX_BANK, Math.min(MAX_BANK, (-lean * sum) / (2 * reach + 1)));
      this.up[i]!.applyAxisAngle(this.ahead[i]!, bank);
    }
  }

  /** Seconds from the station to each point: speeding down, slowing up, hauled up the lifts, braking in. */
  private timetable(): number[] {
    const rules = MOTION[this.style];
    const n = this.count;
    const ds = this.step;
    const clock = [0];
    let v = 0;
    let free = 0.6;
    for (let i = 0; i < n; i++) {
      const s = (i + 1) * ds;
      const drop = this.pos[i]!.y - this.pos[(i + 1) % n]!.y;
      let next: number;
      if (this.onLift(s)) next = rules.lift;
      else {
        free = Math.max(free, v);
        const sq = free * free + 2 * GRAVITY * drop - 2 * rules.drag * ds;
        free = Math.min(rules.max, Math.max(rules.min, Math.sqrt(Math.max(0, sq))));
        next = free;
      }
      // Pulling away from the station, and braking into it.
      next = Math.min(next, 0.6 + Math.sqrt(2 * rules.launch * s), 0.4 + Math.sqrt(2 * rules.brake * Math.max(0, this.length - s)));
      if (this.onLift(s)) free = next;
      clock.push(clock[i]! + ds / Math.max(0.3, (v + next) / 2));
      v = next;
    }
    return clock;
  }
}

const ahead = new Vector3();
const up = new Vector3();
const side = new Vector3();
const basis = new Matrix4();

/** Colours of each kind of track. */
const PAINT = {
  wood: '#b7834f',
  woodDark: '#8a5a32',
  water: '#5fd3ea',
  rail: '#ff5fa8',
  spine: '#f6f8fb',
  tie: '#3b4a5e',
  column: '#f6f8fb',
  foot: '#cfd6de',
};

/** Builds one vertex-coloured mesh out of strips, tubes and posts. */
class Shapes {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly colors: number[] = [];
  readonly index: number[] = [];
  private readonly color = new Color();

  private vertex(p: Vector3, n: Vector3): number {
    this.positions.push(p.x, p.y, p.z);
    this.normals.push(n.x, n.y, n.z);
    this.colors.push(this.color.r, this.color.g, this.color.b);
    return this.positions.length / 3 - 1;
  }

  /** A flat quad, a b c d anticlockwise seen from the side it faces. */
  quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, color: string): void {
    this.color.set(color);
    const n = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(d, a)).normalize();
    const i = this.vertex(a, n);
    this.vertex(b, n);
    this.vertex(c, n);
    this.vertex(d, n);
    this.index.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  /** A round rod from `a` to `b`. */
  rod(a: Vector3, b: Vector3, r: number, color: string, sides = 6): void {
    this.color.set(color);
    const along = new Vector3().subVectors(b, a).normalize();
    const x = Math.abs(along.y) < 0.9 ? new Vector3().crossVectors(along, UP).normalize() : new Vector3(1, 0, 0);
    const y = new Vector3().crossVectors(x, along);
    const start = this.positions.length / 3;
    for (const end of [a, b]) {
      for (let k = 0; k < sides; k++) {
        const t = (k / sides) * Math.PI * 2;
        const n = x.clone().multiplyScalar(Math.cos(t)).addScaledVector(y, Math.sin(t));
        this.vertex(end.clone().addScaledVector(n, r), n);
      }
    }
    for (let k = 0; k < sides; k++) {
      const k1 = (k + 1) % sides;
      this.index.push(start + k, start + sides + k, start + sides + k1, start + k, start + sides + k1, start + k1);
    }
  }

  /** A box centred at `c`, along `x`, `y` and `z` (half sizes along each). */
  box(c: Vector3, x: Vector3, y: Vector3, z: Vector3, color: string): void {
    const corner = (i: number, j: number, k: number) => c.clone().addScaledVector(x, i).addScaledVector(y, j).addScaledVector(z, k);
    for (const [axis, a, b] of [
      [0, 1, 2],
      [1, 2, 0],
      [2, 0, 1],
    ] as const) {
      for (const sign of [-1, 1]) {
        const pick = (p: number, q: number) => {
          const v = [0, 0, 0];
          v[axis] = sign;
          v[a] = p;
          v[b] = q;
          return corner(v[0]!, v[1]!, v[2]!);
        };
        if (sign > 0) this.quad(pick(-1, -1), pick(1, -1), pick(1, 1), pick(-1, 1), color);
        else this.quad(pick(-1, -1), pick(-1, 1), pick(1, 1), pick(1, -1), color);
      }
    }
  }

  /** A tube following the track, `side` and `lift` off its middle, from point to point every `stride` points (all the way round). */
  tube(track: Track, stride: number, side: number, lift: number, r: number, color: string, sides = 6): void {
    this.color.set(color);
    const rings = Math.floor(track.count / stride);
    const start = this.positions.length / 3;
    const s = new Vector3();
    for (let i = 0; i < rings; i++) {
      const { pos, ahead, up } = track.sample(i * stride);
      s.crossVectors(ahead, up);
      const middle = pos.clone().addScaledVector(s, side).addScaledVector(up, lift);
      for (let k = 0; k < sides; k++) {
        const t = (k / sides) * Math.PI * 2;
        const n = s.clone().multiplyScalar(Math.cos(t)).addScaledVector(up, Math.sin(t));
        this.vertex(middle.clone().addScaledVector(n, r), n);
      }
    }
    for (let i = 0; i < rings; i++) {
      const a = start + i * sides;
      const b = start + ((i + 1) % rings) * sides;
      for (let k = 0; k < sides; k++) {
        const k1 = (k + 1) % sides;
        this.index.push(a + k, b + k, b + k1, a + k, b + k1, a + k1);
      }
    }
  }

  mesh(): Mesh {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(this.colors, 3));
    geometry.setIndex(this.index);
    geometry.computeBoundingSphere();
    const mesh = new Mesh(geometry, toyMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

function inside(p: Vector3, rects: Rect[]): boolean {
  return rects.some((r) => p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ);
}

/**
 * The flume's channel: wooden walls and floor with water inside, on posts
 * where it's off the ground; open where it runs through the splash pool.
 * `keepOut`: where no posts stand (the station).
 */
function flume(track: Track, keepOut: Rect[]): Mesh {
  const shapes = new Shapes();
  const pool = track.spot.pool;
  const wet = (p: Vector3) => !!pool && Math.hypot(p.x - pool.x, p.z - pool.z) < pool.r - 0.25;
  // The channel's cross-section (across, up from a log's middle): outside, then inside; and the water.
  const outside: [number, number][] = [
    [-0.62, 0.22],
    [-0.62, -0.55],
    [0.62, -0.55],
    [0.62, 0.22],
  ];
  const within: [number, number][] = [
    [0.5, 0.22],
    [0.5, -0.45],
    [-0.5, -0.45],
    [-0.5, 0.22],
  ];
  const stride = 2;
  const n = Math.floor(track.count / stride);
  const s = new Vector3();
  const place = (i: number, [x, y]: [number, number]) => {
    const { pos, ahead, up } = track.sample(i * stride);
    s.crossVectors(ahead, up);
    return pos.clone().addScaledVector(s, x).addScaledVector(up, y);
  };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (wet(track.sample(i * stride).pos) || wet(track.sample(j * stride).pos)) continue;
    const edges = (profile: [number, number][], color: string) => {
      for (let k = 0; k < profile.length - 1; k++) shapes.quad(place(i, profile[k]!), place(j, profile[k]!), place(j, profile[k + 1]!), place(i, profile[k + 1]!), color);
    };
    edges(outside, PAINT.wood);
    edges(within, PAINT.woodDark);
    // The tops of the walls, and the water.
    for (const [a, b] of [
      [outside[3]!, within[0]!],
      [within[3]!, outside[0]!],
    ] as const)
      shapes.quad(place(i, a), place(j, a), place(j, b), place(i, b), PAINT.wood);
    shapes.quad(place(i, [-0.5, -0.08]), place(i, [0.5, -0.08]), place(j, [0.5, -0.08]), place(j, [-0.5, -0.08]), PAINT.water);
  }
  // Posts under the channel where it's raised.
  for (const { pos, across } of flumePosts(track, keepOut)) {
    const top = pos.y - 0.55;
    for (const e of [-0.4, 0.4]) {
      const foot = pos.clone().addScaledVector(across, e);
      shapes.rod(new Vector3(foot.x, 0, foot.z), new Vector3(foot.x, top, foot.z), 0.08, PAINT.woodDark);
    }
    const a = pos.clone().addScaledVector(across, -0.45);
    const b = pos.clone().addScaledVector(across, 0.45);
    a.y = b.y = top - 0.05;
    shapes.rod(a, b, 0.06, PAINT.woodDark, 4);
  }
  return shapes.mesh();
}

/** Where the flume's channel stands on posts (a pair across it, every metre and a half where it's raised), and which way is across. */
function flumePosts(track: Track, keepOut: Rect[]): { pos: Vector3; across: Vector3 }[] {
  const pool = track.spot.pool;
  const wet = (p: Vector3) => !!pool && Math.hypot(p.x - pool.x, p.z - pool.z) < pool.r - 0.25;
  const posts: { pos: Vector3; across: Vector3 }[] = [];
  const every = Math.round(1.5 / track.step);
  for (let i = 0; i < track.count; i += every) {
    const { pos, ahead, up } = track.sample(i);
    if (pos.y < 0.95 || inside(pos, keepOut) || wet(pos)) continue;
    const across = new Vector3().crossVectors(ahead, up);
    across.y = 0;
    posts.push({ pos: pos.clone(), across: across.normalize() });
  }
  return posts;
}

/**
 * The coaster's columns: under the track now and then where it runs upright
 * off the ground, and beside it, propping it up, where it runs straight up
 * or down the side of its loop (`spine`: where the arm meets it). `top` is
 * the column's top; it stands on the ground beneath.
 */
function coasterColumns(track: Track, keepOut: Rect[]): { top: Vector3; spine: Vector3 | null }[] {
  const columns: { top: Vector3; spine: Vector3 | null }[] = [];
  const every = Math.round(2.4 / track.step);
  let lastSide = -Infinity;
  for (let i = 0; i < track.count; i++) {
    const { pos, ahead, up } = track.sample(i);
    if (inside(pos, keepOut)) continue;
    if (i % every === 0 && up.y > 0.8 && pos.y > 1.5) columns.push({ top: pos.clone().addScaledVector(up, -0.62), spine: null });
    if (Math.abs(ahead.y) > 0.97 && Math.abs(up.y) < 0.3 && i - lastSide > every) {
      lastSide = i;
      const out = up.clone().negate();
      out.y = 0;
      out.normalize();
      const spine = pos.clone().addScaledVector(up, -0.56);
      columns.push({ top: spine.clone().addScaledVector(out, 0.7), spine });
    }
  }
  return columns;
}

/** A track's channel or rails are this low (a car's middle, metres) or lower where nobody can walk under them. */
const LOW: Record<TrackStyle, number> = { flume: 2.5, coaster: 2.6 };
/** Half the width of the flume's channel and of the coaster's ties (metres), and of a post or a column's foot. */
const HALF_WIDTH: Record<TrackStyle, number> = { flume: 0.62, coaster: 0.56 };
const POST = 0.12;
const COLUMN = 0.2;

/**
 * What of a track nobody walks through, as boxes on the ground: wherever
 * it runs low (squares along it, half a metre apart), and the posts or
 * columns under the rest. Not in `keepOut` (the station, solid already),
 * nor in the splash pool.
 */
export function trackSolids(track: Track, keepOut: Rect[]): Rect[] {
  const pool = track.spot.pool;
  const wet = (p: Vector3) => !!pool && Math.hypot(p.x - pool.x, p.z - pool.z) < pool.r;
  const rects: Rect[] = [];
  const box = (x: number, z: number, half: number) => rects.push({ minX: x - half, maxX: x + half, minZ: z - half, maxZ: z + half });
  const half = HALF_WIDTH[track.style];
  const every = Math.max(1, Math.round(0.5 / track.step));
  for (let i = 0; i < track.count; i += every) {
    const { pos } = track.sample(i);
    if (pos.y > LOW[track.style] || inside(pos, keepOut) || wet(pos)) continue;
    box(pos.x, pos.z, half);
  }
  if (track.style === 'flume') {
    for (const { pos, across } of flumePosts(track, keepOut)) {
      if (pos.y <= LOW.flume) continue;
      for (const e of [-0.4, 0.4]) box(pos.x + across.x * e, pos.z + across.z * e, POST);
    }
  } else {
    for (const { top } of coasterColumns(track, keepOut)) box(top.x, top.z, COLUMN);
  }
  return rects;
}

/**
 * The coaster's track: two pink rails on ties over a white spine, on white
 * columns where it's off the ground (but not in the station, `keepOut`),
 * with props at the sides of its loop.
 */
function coaster(track: Track, keepOut: Rect[]): Mesh {
  const shapes = new Shapes();
  const stride = 3;
  // A car's middle is its axles': the rails are just under the wheels, either side.
  for (const e of [-0.5, 0.5]) shapes.tube(track, stride, e, -0.19, 0.07, PAINT.rail, 5);
  shapes.tube(track, stride, 0, -0.56, 0.12, PAINT.spine, 6);
  const s = new Vector3();
  const tieEvery = Math.round(1.0 / track.step);
  for (let i = 0; i < track.count; i += tieEvery) {
    const { pos, ahead, up } = track.sample(i);
    s.crossVectors(ahead, up);
    shapes.box(pos.clone().addScaledVector(up, -0.28), ahead.clone().multiplyScalar(0.05), up.clone().multiplyScalar(0.05), s.clone().multiplyScalar(0.55), PAINT.tie);
    shapes.box(pos.clone().addScaledVector(up, -0.42), ahead.clone().multiplyScalar(0.04), up.clone().multiplyScalar(0.12), s.clone().multiplyScalar(0.04), PAINT.tie);
  }
  // Upright track: a column from the ground to under the spine, now and then; straight up or down the side of the
  // loop: a column beside it, propping it up.
  for (const { top, spine } of coasterColumns(track, keepOut)) {
    shapes.rod(new Vector3(top.x, 0, top.z), top, spine ? 0.12 : 0.11, PAINT.column, 8);
    if (spine) shapes.rod(top, spine, 0.08, PAINT.column, 6);
    shapes.box(new Vector3(top.x, 0.06, top.z), new Vector3(0.3, 0, 0), new Vector3(0, 0.06, 0), new Vector3(0, 0, 0.3), PAINT.foot);
  }
  return shapes.mesh();
}

/** The track drawn: the flume's channel or the coaster's rails, in the world's own coordinates. */
export function trackMesh(track: Track, keepOut: Rect[]): Mesh {
  const mesh = track.style === 'flume' ? flume(track, keepOut) : coaster(track, keepOut);
  mesh.name = `track:${track.style}`;
  return mesh;
}
