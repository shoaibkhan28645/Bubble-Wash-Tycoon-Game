// Rush jobs: short hands-on jobs only the hero can do, offered whenever the
// next purchase is a while off, so there's always something worth doing.
// One at a time: it shows on the map with a countdown and its pay; walking
// to it starts it (no buttons); finishing pays at once, and back-to-back
// jobs pay a streak bonus. Letting one run out costs nothing but the streak.
//
// Pure logic, no drawing: what job is on offer, where its things are, how
// far along it is, when it runs out, and what it pays. The game draws it
// (render/jobView.ts) and pays out (core/jobs.ts). Three kinds of job:
//   collect: things lying about to pick up (and, if it has a `to`, bring there)
//   deliver: something to fetch from one place and take to another
//   escort:  someone to find, who then follows the hero to where they're going
import type { Point } from '../core/config';

export type JobPattern = 'collect' | 'deliver' | 'escort';
export type JobTown = 'carWash' | 'farm' | 'park';

/** A kind of job (src/data/jobs.json). */
export interface JobDef {
  id: string;
  town: JobTown;
  pattern: JobPattern;
  /** Shown on the marker and the chip. */
  icon: string;
  /** Its name's string key (ui/strings.ts). */
  title: string;
  /** Pads that must be built first (the job uses them). */
  needs: string[];
  /** The town's job spots (layout `jobSpots`) where it starts: where things spill, the crate waits, the person waits. */
  from: string;
  /** Where it ends: where things go, or the person is taken. A collect job without one is done once all are picked up. */
  to?: string;
  /** Collect: how many things, scattered this far from the spot. */
  count?: number;
  spread?: number;
  /** Seconds of doing (picking up, handing over) on top of the walking. */
  work?: number;
}

export interface JobTuning {
  /** Seconds before the first job in a town (after the tutorial). */
  firstSeconds: number;
  /** Seconds between jobs: the next purchase a little way off, a long way off, and after several ignored. */
  gapNear: number;
  gapFar: number;
  gapBackoff: number;
  /** No job while the next purchase is this close (seconds of income); a long way off beyond `farSeconds`. */
  nearSeconds: number;
  farSeconds: number;
  /** Ignored (run out untouched) this many in a row: jobs come only every `gapBackoff`. */
  backoffAfter: number;
  /** A job pays this many seconds of the hero's income… */
  paySeconds: number;
  /** …held between these shares of the next purchase's price (a new town's first prices are small next to old towns' income). */
  payShareMin: number;
  payShareMax: number;
  /** The least a job pays when there's nothing left to buy. */
  minPay: number;
  /** Pay multiplier for the n-th job in a row done (the last holds). */
  streak: number[];
  /** Walking a route takes this much longer than the straight line (going round things), when the real way isn't known… */
  detour: number;
  /** …and this much longer than the real way (turning, and not quite taking the best line). */
  wander: number;
  /** Seconds to spare on top of the walking and the doing. */
  buffer: number;
  minSeconds: number;
  maxSeconds: number;
  /** Over halfway done when time's up: this many more seconds, once. */
  overtime: number;
  /** How near the hero must come to pick something up or reach someone (m). */
  reach: number;
  /** How near to where it goes counts as there (m). */
  dropRadius: number;
  /** Someone following keeps this far behind the hero, and can walk this much faster to keep up. */
  followGap: number;
  followSpeed: number;
  /** Scattered things lie at least this far apart. */
  itemGap: number;
}

/** What the game tells the jobs each frame. */
export interface JobsContext {
  town: JobTown;
  hero: Point;
  /** The hero's walking speed now (m/s). */
  heroSpeed: number;
  /** What the hero's businesses earn a minute (every town). */
  incomePerMinute: number;
  /** The next purchase: its price, and how much more cash it needs (0: affordable). Null: nothing left to buy. */
  next: { cost: number; owed: number } | null;
  built: (pad: string) => boolean;
  /** The town's job spots, by name. */
  spots: Readonly<Record<string, readonly Point[]>>;
  /** Jobs may be offered at all (the tutorial's over, the people are loaded). */
  allowed: boolean;
  /** A panel is open: everything waits (the countdown too). */
  paused: boolean;
  /** Something else timed is on (a school trip…): no new job, but one under way carries on. */
  blocked: boolean;
  /** Whether a spot is clear to put something down (not in a building). */
  free?: (p: Point) => boolean;
  /** How far it really is to walk from one place to another (round buildings); straight lines × `detour` if not given. */
  walk?: (from: Point, to: Point) => number;
}

export interface Job {
  def: JobDef;
  /** What it pays if done (streak included). */
  pay: number;
  /** The streak multiplier in that pay. */
  multiplier: number;
  /** Seconds it was given, and seconds left. */
  limit: number;
  left: number;
  overtime: boolean;
  /** Where it starts and ends. */
  from: Point;
  to: Point | null;
  /** Collect: the things still lying about. */
  items: Point[];
  /** Collect: picked up so far. Deliver: 1 once fetched. */
  carried: number;
  /** Escort: where the person is (following once reached). */
  person: Point | null;
  following: boolean;
  /** The hero has done anything towards it. */
  started: boolean;
  /** How far along (0–1). */
  progress: number;
}

export type JobEvent =
  | { kind: 'offered'; job: Job }
  | { kind: 'picked'; job: Job; at: Point }
  | { kind: 'reached'; job: Job }
  | { kind: 'overtime'; job: Job }
  | { kind: 'done'; job: Job; pay: number }
  | { kind: 'expired'; job: Job };

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Rounds to two significant figures ($1,534 → $1,500), so pay reads cleanly. */
export function roundPay(amount: number): number {
  if (amount <= 0) return 0;
  const step = 10 ** Math.max(0, Math.floor(Math.log10(amount)) - 1);
  return Math.round(amount / step) * step;
}

/** Seconds of income until the next purchase is affordable (0 if it is now, Infinity if never/none). */
export function secondsToNext(ctx: Pick<JobsContext, 'next' | 'incomePerMinute'>): number {
  if (!ctx.next) return Infinity;
  if (ctx.next.owed <= 0) return 0;
  return ctx.incomePerMinute > 0 ? ctx.next.owed / (ctx.incomePerMinute / 60) : Infinity;
}

/** What a job pays before the streak: some seconds of income, held to a share of the next purchase's price. */
export function basePay(tuning: JobTuning, ctx: Pick<JobsContext, 'next' | 'incomePerMinute'>): number {
  const fromIncome = (tuning.paySeconds * Math.max(0, ctx.incomePerMinute)) / 60;
  if (!ctx.next) return Math.max(fromIncome, tuning.minPay);
  const lo = tuning.payShareMin * ctx.next.cost;
  const hi = tuning.payShareMax * ctx.next.cost;
  return Math.min(hi, Math.max(lo, fromIncome));
}

/** The pay multiplier for a job done after `streak` in a row. */
export function streakMultiplier(tuning: JobTuning, streak: number): number {
  return tuning.streak[Math.min(streak, tuning.streak.length - 1)] ?? 1;
}

/** A walk through points from `start`, nearest first each time: its length, and where it ends. */
function tour(start: Point, points: readonly Point[]): { length: number; end: Point } {
  const left = [...points];
  let at = start;
  let length = 0;
  while (left.length > 0) {
    let best = 0;
    for (let i = 1; i < left.length; i++) if (dist(at, left[i]!) < dist(at, left[best]!)) best = i;
    length += dist(at, left[best]!);
    at = left.splice(best, 1)[0]!;
  }
  return { length, end: at };
}

export class JobBoard {
  private job: Job | null = null;
  /** Jobs done in a row (the streak), and ignored (run out untouched) in a row. */
  streak = 0;
  ignored = 0;
  /** Seconds since the last job ended (or since arriving). */
  private since = 0;
  private offeredAny = false;
  private last = '';
  /** The hero's way behind them (for someone following). */
  private readonly trail: Point[] = [];

  constructor(
    private readonly defs: readonly JobDef[],
    private readonly tuning: JobTuning,
    private readonly random: () => number = Math.random,
  ) {}

  get active(): Job | null {
    return this.job;
  }

  /** Where the hero should head now: the nearest thing to pick up, the person, or where it all goes. */
  target(hero: Point): Point | null {
    const job = this.job;
    if (!job) return null;
    switch (job.def.pattern) {
      case 'collect':
        if (job.items.length > 0) return job.items.reduce((best, p) => (dist(hero, p) < dist(hero, best) ? p : best));
        return job.to;
      case 'deliver':
        return job.carried > 0 ? job.to : job.from;
      case 'escort':
        return job.following ? job.to : job.person;
    }
  }

  /** Seconds until the next job may be offered (0: as soon as it's worth it), for the given situation. */
  gap(ctx: Pick<JobsContext, 'next' | 'incomePerMinute'>): number {
    if (!this.offeredAny) return this.tuning.firstSeconds;
    if (this.ignored >= this.tuning.backoffAfter) return this.tuning.gapBackoff;
    return secondsToNext(ctx) > this.tuning.farSeconds ? this.tuning.gapFar : this.tuning.gapNear;
  }

  /** The job's gone (the hero left town): no pay, but the streak stands. */
  cancel(): void {
    this.job = null;
    this.since = 0;
    this.trail.length = 0;
  }

  /** Offers a job now if any can be (for testing, and a debug switch). */
  force(ctx: JobsContext, id?: string): Job | null {
    if (this.job) return this.job;
    return this.offer(ctx, id);
  }

  update(dt: number, ctx: JobsContext): JobEvent[] {
    const events: JobEvent[] = [];
    if (ctx.paused) return events;
    if (!this.job) {
      if (!ctx.allowed || ctx.blocked) return events;
      this.since += dt;
      if (this.since < this.gap(ctx) || secondsToNext(ctx) < this.tuning.nearSeconds) return events;
      const job = this.offer(ctx);
      if (job) events.push({ kind: 'offered', job });
      return events;
    }
    const job = this.job;
    this.work(dt, job, ctx, events);
    if (!this.job) return events;
    job.left -= dt;
    if (job.left <= 0) {
      if (!job.overtime && job.progress >= 0.5) {
        job.overtime = true;
        job.left = this.tuning.overtime;
        events.push({ kind: 'overtime', job });
      } else {
        this.end(false);
        events.push({ kind: 'expired', job });
      }
    }
    return events;
  }

  /** The hero's doing this frame: picking up, reaching, bringing. */
  private work(dt: number, job: Job, ctx: JobsContext, events: JobEvent[]): void {
    const { hero } = ctx;
    const t = this.tuning;
    switch (job.def.pattern) {
      case 'collect': {
        for (let i = job.items.length - 1; i >= 0; i--) {
          const item = job.items[i]!;
          if (dist(hero, item) > t.reach) continue;
          job.items.splice(i, 1);
          job.carried++;
          job.started = true;
          events.push({ kind: 'picked', job, at: item });
        }
        const total = job.def.count ?? 1;
        const share = job.to ? 0.8 : 1;
        job.progress = (share * job.carried) / total;
        if (job.items.length === 0 && (!job.to || dist(hero, job.to) <= t.dropRadius)) this.finish(job, events);
        return;
      }
      case 'deliver': {
        if (job.carried === 0 && dist(hero, job.from) <= t.reach) {
          job.carried = 1;
          job.started = true;
          events.push({ kind: 'picked', job, at: job.from });
        }
        if (job.carried > 0 && job.to) {
          const whole = Math.max(0.5, dist(job.from, job.to));
          job.progress = 0.5 + 0.5 * clamp01(1 - dist(hero, job.to) / whole);
          if (dist(hero, job.to) <= t.dropRadius) this.finish(job, events);
        }
        return;
      }
      case 'escort': {
        const person = job.person!;
        if (!job.following && dist(hero, person) <= t.reach + 0.3) {
          job.following = true;
          job.started = true;
          this.trail.length = 0;
          this.trail.push({ ...hero });
          events.push({ kind: 'reached', job });
        }
        if (job.following) {
          this.follow(dt, person, ctx);
          if (job.to) {
            const whole = Math.max(0.5, dist(job.from, job.to));
            job.progress = 0.3 + 0.7 * clamp01(1 - dist(person, job.to) / whole);
            if (dist(person, job.to) <= t.dropRadius) this.finish(job, events);
          }
        }
        return;
      }
    }
  }

  /** Someone following walks the hero's own way (round whatever the hero went round), a little behind. */
  private follow(dt: number, person: Point, ctx: JobsContext): void {
    const last = this.trail[this.trail.length - 1];
    if (!last || dist(last, ctx.hero) > 0.25) this.trail.push({ ...ctx.hero });
    let budget = ctx.heroSpeed * this.tuning.followSpeed * dt;
    while (budget > 0 && this.trail.length > 0 && dist(person, ctx.hero) > this.tuning.followGap) {
      const next = this.trail[0]!;
      const d = dist(person, next);
      if (d <= budget) {
        person.x = next.x;
        person.z = next.z;
        budget -= d;
        this.trail.shift();
      } else {
        person.x += ((next.x - person.x) / d) * budget;
        person.z += ((next.z - person.z) / d) * budget;
        budget = 0;
      }
    }
  }

  private finish(job: Job, events: JobEvent[]): void {
    job.progress = 1;
    this.end(true);
    events.push({ kind: 'done', job, pay: job.pay });
  }

  private end(done: boolean): void {
    const job = this.job!;
    if (done) {
      this.streak++;
      this.ignored = 0;
    } else {
      this.streak = 0;
      this.ignored = job.started ? 0 : this.ignored + 1;
    }
    this.job = null;
    this.since = 0;
    this.trail.length = 0;
  }

  /** Jobs that can be done here now: built what they need, and have their spots. */
  eligible(ctx: Pick<JobsContext, 'town' | 'built' | 'spots'>): JobDef[] {
    return this.defs.filter(
      (d) => d.town === ctx.town && d.needs.every((p) => ctx.built(p)) && (ctx.spots[d.from]?.length ?? 0) > 0 && (!d.to || (ctx.spots[d.to]?.length ?? 0) > 0),
    );
  }

  private offer(ctx: JobsContext, id?: string): Job | null {
    let pool = this.eligible(ctx);
    if (id) pool = pool.filter((d) => d.id === id);
    if (pool.length === 0) return null;
    // Not the same job twice running, if there's another.
    const fresh = pool.length > 1 ? pool.filter((d) => d.id !== this.last) : pool;
    const def = fresh[Math.floor(this.random() * fresh.length)]!;
    const job = this.make(def, ctx);
    if (!job) return null;
    this.job = job;
    this.last = def.id;
    this.offeredAny = true;
    this.trail.length = 0;
    return job;
  }

  private make(def: JobDef, ctx: JobsContext): Job | null {
    const t = this.tuning;
    // Where it starts and ends: any pair of the town's spots that can be done in the most time a job gets from
    // where the hero is now (a lost child at the far end of the park, with the hero at the other, can't be);
    // failing that, the quickest.
    const froms = ctx.spots[def.from]!;
    const tos = def.to ? ctx.spots[def.to]! : [null];
    const speed = Math.max(0.5, ctx.heroSpeed);
    const pairs = froms.flatMap((f) => tos.map((to) => ({ f, to })));
    // Metres of walking, the real way round if the town says (else the straight line, allowing for going round).
    const way = (a: Point, b: Point) => (ctx.walk ? ctx.walk(a, b) * t.wander : dist(a, b) * t.detour);
    const estimate = ({ f, to }: { f: Point; to: Point | null }) => {
      const scatter = def.pattern === 'collect' ? (def.spread ?? 2) * (def.count ?? 1) * 0.8 * t.detour : 0;
      const route = way(ctx.hero, f) + scatter + (to ? way(f, to) : 0);
      return route / speed + (def.work ?? 0) + t.buffer;
    };
    const fits = pairs.filter((p) => estimate(p) <= t.maxSeconds * 0.9);
    const chosen = fits.length > 0 ? fits[Math.floor(this.random() * fits.length)]! : pairs.reduce((a, b) => (estimate(a) <= estimate(b) ? a : b));
    const from = { ...chosen.f };
    const to = chosen.to ? { ...chosen.to } : null;
    const items: Point[] = [];
    if (def.pattern === 'collect') {
      const spread = def.spread ?? 2;
      for (let tries = 0; items.length < (def.count ?? 1) && tries < 200; tries++) {
        const a = this.random() * Math.PI * 2;
        const r = Math.sqrt(this.random()) * spread;
        const p = { x: from.x + Math.cos(a) * r, z: from.z + Math.sin(a) * r };
        if (ctx.free && !ctx.free(p)) continue;
        if (items.some((q) => dist(p, q) < t.itemGap)) continue;
        items.push(p);
      }
      if (items.length < (def.count ?? 1)) return null;
    }
    // Time enough to walk it all (going round things) and do it, with some to spare.
    let route: number;
    switch (def.pattern) {
      case 'collect': {
        // To the nearest first, then on round them (close together: straight lines, allowing for going round), then on.
        const first = items.reduce((best, p) => (dist(ctx.hero, p) < dist(ctx.hero, best) ? p : best));
        const round = tour(first, items.filter((p) => p !== first));
        route = way(ctx.hero, first) + round.length * t.detour + (to ? way(round.end, to) : 0);
        break;
      }
      default:
        route = way(ctx.hero, from) + (to ? way(from, to) : 0);
    }
    const limit = Math.min(t.maxSeconds, Math.max(t.minSeconds, route / speed + (def.work ?? 0) + t.buffer));
    const multiplier = streakMultiplier(t, this.streak);
    return {
      def,
      pay: roundPay(basePay(t, ctx) * multiplier),
      multiplier,
      limit,
      left: limit,
      overtime: false,
      from,
      to,
      items,
      carried: 0,
      person: def.pattern === 'escort' ? { ...from } : null,
      following: false,
      started: false,
      progress: 0,
    };
  }
}
