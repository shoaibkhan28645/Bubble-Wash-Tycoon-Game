// Rush jobs: short hands-on jobs only the hero can do, offered whenever the
// next purchase is a while off, so there's always something worth doing.
// One at a time: it shows on the map with a countdown and its pay; walking
// to it starts it (no buttons); finishing pays at once, and back-to-back
// jobs pay a streak bonus. Letting one run out costs nothing but the streak.
//
// Pure logic, no drawing: what job is on offer, where its things are, how
// far along it is, when it runs out, and what it pays. The game draws it
// (render/jobView.ts) and pays out (core/jobs.ts). Five kinds of job:
//   collect: things lying about (or wandering off) to pick up (and, if it has a `to`, bring there)
//   deliver: something to fetch from one place and take to another
//   escort:  someone to find, who then follows the hero to where they're going
//   work:    somewhere to stand and work a while (polish a car, pump the well)
//   signal:  somewhere to be when something happens there (a perfect launch on that ride's lever)
// Every so often a job is golden: it pays several times over.
import type { Point } from '../core/config';

export type JobPattern = 'collect' | 'deliver' | 'escort' | 'work' | 'signal';
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
  /** Work: seconds of standing at it to get it done. Signal: about how long it takes to come, once there. */
  hold?: number;
  /** How near the hero must come (m), if not the usual (a car's bigger than a soap bottle). */
  reach?: number;
  /** Collect: the things wander about at this speed (m/s), staying within the spread (hens, balloons). */
  wander?: number;
  /** Signal: what the town signals when it happens, said with the spot's id (`perfect` → `perfect:carousel`). */
  signal?: string;
  /** What it looks like (render/jobView.ts): the things (the job's id if not given), who's found, who waits at the end. */
  thing?: string;
  who?: 'child' | 'adult' | 'calf';
  waiting?: 'child' | 'adult' | 'none';
  /** Its thing is solid (a parked car): half its width and half its length (m), along x and z when it faces +z. */
  solid?: [number, number];
}

/** A place a job can happen: maybe one thing's (a ride's lever), there only once that's built. */
export interface JobSpot extends Point {
  id?: string;
  needs?: string;
  /** Which way a thing put here faces (radians about the vertical, from +z). */
  face?: number;
}

/** The ground a job's solid thing takes up at its spot (null if it has none). */
export function jobFootprint(def: JobDef, spot: JobSpot): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
  if (!def.solid) return null;
  const turned = Math.abs(Math.sin(spot.face ?? 0)) > 0.7;
  const [hx, hz] = turned ? [def.solid[1], def.solid[0]] : def.solid;
  return { minX: spot.x - hx, maxX: spot.x + hx, minZ: spot.z - hz, maxZ: spot.z + hz };
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
  /** Every this many jobs done, the next is golden, and pays this many times over. */
  goldenEvery: number;
  goldenPay: number;
  /** A golden job done can be doubled (an ad or gems): not in the first `doubleAfter` seconds of play, nor more often than every `doubleGap`. */
  doubleAfter: number;
  doubleGap: number;
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
  spots: Readonly<Record<string, readonly JobSpot[]>>;
  /** Whether a job can happen at a spot right now (a perfect launch needs a ride about to fill); any if not given. */
  usable?: (def: JobDef, spot: JobSpot) => boolean;
  /** Whether the hero can get to a place now (the lot grows as it's built); anywhere if not given. */
  reachable?: (p: Point) => boolean;
  /** Jobs done ever (every town), for which is golden; the board's own count if not given. */
  done?: number;
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

/** Something lying about to pick up; wandering ones head this way (radians, from +z) and turn when `turn` runs out. */
export interface JobItem extends Point {
  heading: number;
  turn: number;
}

export interface Job {
  def: JobDef;
  /** What it pays if done (streak and gold included). */
  pay: number;
  /** The streak multiplier in that pay. */
  multiplier: number;
  /** A golden job: pays `goldenPay` times over. */
  golden: boolean;
  /** Seconds it was given, and seconds left. */
  limit: number;
  left: number;
  overtime: boolean;
  /** Where it starts and ends. */
  from: JobSpot;
  to: JobSpot | null;
  /** Collect: the things still lying about. */
  items: JobItem[];
  /** Collect: picked up so far. Deliver: 1 once fetched. */
  carried: number;
  /** Escort: where the person is (following once reached). */
  person: Point | null;
  following: boolean;
  /** Work: seconds worked so far, and whether the hero's at it this moment. */
  held: number;
  working: boolean;
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
  /** Jobs done here (for which is golden, when the game doesn't say how many ever). */
  private doneCount = 0;
  /** What the town signalled since the last update. */
  private readonly signals: string[] = [];
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
      case 'work':
      case 'signal':
        return job.from;
    }
  }

  /** Something happened in town that a job may be waiting for (`perfect:carousel`: a perfect launch there). */
  signal(key: string): void {
    if (this.job?.def.pattern === 'signal') this.signals.push(key);
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
    if (ctx.paused) {
      if (this.job) this.job.working = false;
      return events;
    }
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
    this.signals.length = 0;
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
    const reach = job.def.reach ?? t.reach;
    job.working = false;
    switch (job.def.pattern) {
      case 'collect': {
        if (job.def.wander) this.roam(dt, job, ctx);
        for (let i = job.items.length - 1; i >= 0; i--) {
          const item = job.items[i]!;
          if (dist(hero, item) > reach) continue;
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
        if (job.carried === 0 && dist(hero, job.from) <= reach) {
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
        if (!job.following && dist(hero, person) <= reach + 0.3) {
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
      case 'work': {
        // Standing at it works it; stepping away keeps what's done so far.
        if (dist(hero, job.from) > reach) return;
        if (!job.started) events.push({ kind: 'reached', job });
        job.started = true;
        job.working = true;
        job.held += dt;
        const hold = Math.max(0.1, job.def.hold ?? 3);
        job.progress = Math.min(1, job.held / hold);
        if (job.held >= hold) this.finish(job, events);
        return;
      }
      case 'signal': {
        if (dist(hero, job.from) <= reach && !job.started) {
          job.started = true;
          job.progress = 0.5;
          events.push({ kind: 'reached', job });
        }
        const key = `${job.def.signal ?? job.def.id}:${job.from.id ?? ''}`;
        if (this.signals.includes(key)) this.finish(job, events);
        return;
      }
    }
  }

  /** Wandering things amble about, turning now and then, and back towards the middle at the edge or anything in the way. */
  private roam(dt: number, job: Job, ctx: JobsContext): void {
    const speed = job.def.wander ?? 0;
    const spread = job.def.spread ?? 2;
    for (const item of job.items) {
      item.turn -= dt;
      if (item.turn <= 0) {
        item.heading += (this.random() - 0.5) * 1.8;
        item.turn = 1 + this.random() * 2;
      }
      const next = { x: item.x + Math.sin(item.heading) * speed * dt, z: item.z + Math.cos(item.heading) * speed * dt };
      if (dist(next, job.from) > spread || (ctx.free && !ctx.free(next)) || (ctx.reachable && !ctx.reachable(next))) {
        item.heading = Math.atan2(job.from.x - item.x, job.from.z - item.z) + (this.random() - 0.5) * 1.2;
        item.turn = 1 + this.random() * 2;
        continue;
      }
      item.x = next.x;
      item.z = next.z;
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
    job.working = false;
    this.doneCount++;
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

  /** A job's spots of a kind that can be used now: what they need built, and (where it starts) ready for it. */
  private places(def: JobDef, name: string, ctx: Pick<JobsContext, 'built' | 'spots' | 'usable' | 'reachable'>): JobSpot[] {
    return (ctx.spots[name] ?? []).filter(
      (s) => (!s.needs || ctx.built(s.needs)) && (!ctx.reachable || ctx.reachable(s)) && (name !== def.from || !ctx.usable || ctx.usable(def, s)),
    );
  }

  /** Jobs that can be done here now: built what they need, and have their spots. */
  eligible(ctx: Pick<JobsContext, 'town' | 'built' | 'spots' | 'usable' | 'reachable'>): JobDef[] {
    return this.defs.filter(
      (d) => d.town === ctx.town && d.needs.every((p) => ctx.built(p)) && this.places(d, d.from, ctx).length > 0 && (!d.to || this.places(d, d.to, ctx).length > 0),
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
    const froms = this.places(def, def.from, ctx);
    const tos: (JobSpot | null)[] = def.to ? this.places(def, def.to, ctx) : [null];
    if (froms.length === 0 || tos.length === 0) return null;
    const speed = Math.max(0.5, ctx.heroSpeed);
    const pairs = froms.flatMap((f) => tos.map((to) => ({ f, to })));
    // Metres of walking, the real way round if the town says (else the straight line, allowing for going round).
    const way = (a: Point, b: Point) => (ctx.walk ? ctx.walk(a, b) * t.wander : dist(a, b) * t.detour);
    const doing = (def.work ?? 0) + (def.hold ?? 0);
    const estimate = ({ f, to }: { f: Point; to: Point | null }) => {
      const scatter = def.pattern === 'collect' ? (def.spread ?? 2) * (def.count ?? 1) * 0.8 * t.detour : 0;
      const route = way(ctx.hero, f) + scatter + (to ? way(f, to) : 0);
      return route / speed + doing + t.buffer;
    };
    const fits = pairs.filter((p) => estimate(p) <= t.maxSeconds * 0.9);
    const chosen = fits.length > 0 ? fits[Math.floor(this.random() * fits.length)]! : pairs.reduce((a, b) => (estimate(a) <= estimate(b) ? a : b));
    const from = { ...chosen.f };
    const to = chosen.to ? { ...chosen.to } : null;
    const items: JobItem[] = [];
    if (def.pattern === 'collect') {
      const spread = def.spread ?? 2;
      for (let tries = 0; items.length < (def.count ?? 1) && tries < 200; tries++) {
        const a = this.random() * Math.PI * 2;
        const r = Math.sqrt(this.random()) * spread;
        const p = { x: from.x + Math.cos(a) * r, z: from.z + Math.sin(a) * r, heading: this.random() * Math.PI * 2, turn: this.random() * 2 };
        if ((ctx.free && !ctx.free(p)) || (ctx.reachable && !ctx.reachable(p))) continue;
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
    const limit = Math.min(t.maxSeconds, Math.max(t.minSeconds, route / speed + doing + t.buffer));
    const multiplier = streakMultiplier(t, this.streak);
    // Every few jobs done, the next one's golden (and stays so until it's done).
    const golden = t.goldenEvery > 0 && ((ctx.done ?? this.doneCount) + 1) % t.goldenEvery === 0;
    return {
      def,
      pay: roundPay(basePay(t, ctx) * multiplier * (golden ? t.goldenPay : 1)),
      multiplier,
      golden,
      limit,
      left: limit,
      overtime: false,
      from,
      to,
      items,
      carried: 0,
      person: def.pattern === 'escort' ? { ...from } : null,
      following: false,
      held: 0,
      working: false,
      started: false,
      progress: 0,
    };
  }
}
