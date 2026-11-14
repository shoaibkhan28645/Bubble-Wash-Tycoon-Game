// Rush jobs (systems/jobs.ts): when they're offered, what they pay, the
// streak, and that each kind of job can be done in the time it gives.
import { describe, expect, it } from 'vitest';
import { JOBS, type Point } from '../src/core/config';
import { JobBoard, basePay, roundPay, secondsToNext, streakMultiplier, type JobDef, type JobsContext } from '../src/systems/jobs';

const T = JOBS.tuning;
const DT = 1 / 30;

function seeded(seed: number): () => number {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

const SPILL: JobDef = { id: 'spill', town: 'carWash', pattern: 'collect', icon: '🧴', title: 'jobSpill', needs: ['soap'], from: 'spill', to: 'shelf', count: 5, spread: 2.2, work: 2 };
const RUSH: JobDef = { id: 'rush', town: 'farm', pattern: 'deliver', icon: '📦', title: 'jobRush', needs: [], from: 'door', to: 'gate', work: 2 };
const LOST: JobDef = { id: 'lost', town: 'park', pattern: 'escort', icon: '🧒', title: 'jobLost', needs: [], from: 'lost', to: 'parent', work: 2 };

/** A town where the next purchase is ten minutes of income away, everything is built and the hero stands at the origin. */
function context(over: Partial<JobsContext> = {}): JobsContext {
  return {
    town: 'carWash',
    hero: { x: 0, z: 0 },
    heroSpeed: 4.8,
    incomePerMinute: 600,
    next: { cost: 10000, owed: 6000 },
    built: () => true,
    spots: {
      spill: [{ x: 10, z: 4 }],
      shelf: [{ x: -6, z: 8 }],
      door: [{ x: 12, z: -6 }],
      gate: [{ x: -14, z: 10 }],
      lost: [{ x: 16, z: 12 }],
      parent: [{ x: -10, z: -12 }],
    },
    allowed: true,
    paused: false,
    blocked: false,
    ...over,
  };
}

/** Moves the hero straight towards a point at their speed; true once there. */
function walk(hero: Point, to: Point, speed: number, dt: number): boolean {
  const d = Math.hypot(to.x - hero.x, to.z - hero.z);
  const step = speed * dt;
  if (d <= step) {
    hero.x = to.x;
    hero.z = to.z;
    return true;
  }
  hero.x += ((to.x - hero.x) / d) * step;
  hero.z += ((to.z - hero.z) / d) * step;
  return false;
}

/** Runs the board until a job is offered (or `seconds` pass); the time it took. */
function untilOffered(board: JobBoard, ctx: JobsContext, seconds = 600): number {
  for (let t = 0; t < seconds; t += DT) {
    if (board.update(DT, ctx).some((e) => e.kind === 'offered')) return t;
  }
  return Infinity;
}

/** The hero does the job on offer, walking at their speed straight to wherever it points; the events seen and the time it took. */
function doJob(board: JobBoard, ctx: JobsContext): { kinds: string[]; seconds: number } {
  const kinds: string[] = [];
  let t = 0;
  for (; t < 120 && board.active; t += DT) {
    const target = board.target(ctx.hero);
    if (target) walk(ctx.hero, target, ctx.heroSpeed, DT);
    for (const e of board.update(DT, ctx)) kinds.push(e.kind);
  }
  return { kinds, seconds: t };
}

describe('rush job pay', () => {
  it('is some seconds of income, held between shares of the next purchase, rounded to two figures', () => {
    // Some seconds of $600 a minute (25 s: $250), held between shares of $10,000 (2.5%–5%: $250–$500).
    const own = (T.paySeconds * 600) / 60;
    expect(basePay(T, { incomePerMinute: 600, next: { cost: 10000, owed: 1 } })).toBeCloseTo(Math.min(T.payShareMax * 10000, Math.max(T.payShareMin * 10000, own)));
    expect(basePay(T, { incomePerMinute: 960, next: { cost: 10000, owed: 1 } })).toBeCloseTo((T.paySeconds * 960) / 60);
    // A town's first prices next to the old towns' big income: no more than its top share of the price.
    expect(basePay(T, { incomePerMinute: 600000, next: { cost: 10000, owed: 1 } })).toBeCloseTo(T.payShareMax * 10000);
    // Hardly any income yet: at least its least share of the price.
    expect(basePay(T, { incomePerMinute: 6, next: { cost: 10000, owed: 1 } })).toBeCloseTo(T.payShareMin * 10000);
    // Nothing left to buy: the income's share, or the least a job pays.
    expect(basePay(T, { incomePerMinute: 0, next: null })).toBe(T.minPay);
    expect(roundPay(1534)).toBe(1500);
    expect(roundPay(98)).toBe(98);
    expect(roundPay(2_345_678)).toBe(2_300_000);
  });

  it('grows with the streak, holding at the top', () => {
    expect(T.streak.map((_, i) => streakMultiplier(T, i))).toEqual(T.streak);
    expect(streakMultiplier(T, 99)).toBe(T.streak.at(-1));
  });

  it('counts seconds to the next purchase from the income', () => {
    expect(secondsToNext({ incomePerMinute: 600, next: { cost: 10000, owed: 6000 } })).toBeCloseTo(600);
    expect(secondsToNext({ incomePerMinute: 600, next: { cost: 10000, owed: 0 } })).toBe(0);
    expect(secondsToNext({ incomePerMinute: 0, next: { cost: 10000, owed: 6000 } })).toBe(Infinity);
    expect(secondsToNext({ incomePerMinute: 600, next: null })).toBe(Infinity);
  });
});

describe('rush jobs on offer', () => {
  it('come a little after arriving, then more often the further off the next purchase is', () => {
    const board = new JobBoard([SPILL], T, seeded(1));
    const ctx = context();
    expect(untilOffered(board, ctx)).toBeCloseTo(T.firstSeconds, 0);
    board.cancel();
    // Far off (ten minutes of income): the short gap.
    expect(untilOffered(board, ctx)).toBeCloseTo(T.gapFar, 0);
    board.cancel();
    // Within two minutes: the longer gap.
    expect(untilOffered(board, context({ next: { cost: 10000, owed: 900 } }))).toBeCloseTo(T.gapNear, 0);
  });

  it('never while the next purchase is nearly affordable, or during the tutorial, or while something else is on', () => {
    const near = new JobBoard([SPILL], T, seeded(2));
    expect(untilOffered(near, context({ next: { cost: 10000, owed: 200 } }), 300)).toBe(Infinity);
    const tutorial = new JobBoard([SPILL], T, seeded(2));
    expect(untilOffered(tutorial, context({ allowed: false }), 300)).toBe(Infinity);
    const busy = new JobBoard([SPILL], T, seeded(2));
    expect(untilOffered(busy, context({ blocked: true }), 300)).toBe(Infinity);
  });

  it('only jobs whose buildings are built and whose spots this town has', () => {
    const board = new JobBoard([SPILL, RUSH, LOST], T, seeded(3));
    expect(board.eligible(context()).map((d) => d.id)).toEqual(['spill']);
    expect(board.eligible(context({ built: () => false })).map((d) => d.id)).toEqual([]);
    expect(board.eligible(context({ town: 'farm' })).map((d) => d.id)).toEqual(['rush']);
    expect(board.eligible(context({ town: 'park', spots: { lost: [{ x: 1, z: 1 }] } })).map((d) => d.id)).toEqual([]);
  });

  it('back off after several are ignored, and come back once one is done', () => {
    const board = new JobBoard([SPILL], T, seeded(4));
    const ctx = context();
    for (let i = 0; i < T.backoffAfter; i++) {
      untilOffered(board, ctx);
      // Left alone: it runs out.
      while (board.active) board.update(DT, ctx);
    }
    expect(board.ignored).toBe(T.backoffAfter);
    expect(untilOffered(board, ctx)).toBeCloseTo(T.gapBackoff, 0);
    doJob(board, ctx);
    expect(board.ignored).toBe(0);
    expect(untilOffered(board, ctx)).toBeCloseTo(T.gapFar, 0);
  });

  it('a panel open stops everything, the countdown too', () => {
    const board = new JobBoard([SPILL], T, seeded(5));
    const ctx = context();
    untilOffered(board, ctx);
    const left = board.active!.left;
    for (let t = 0; t < 30; t += DT) board.update(DT, { ...ctx, paused: true });
    expect(board.active!.left).toBe(left);
    // Something else coming on doesn't stop the one under way.
    board.update(1, { ...ctx, blocked: true });
    expect(board.active!.left).toBeCloseTo(left - 1);
  });
});

describe('doing rush jobs', () => {
  it('collect: picks up every one, brings them where they go, and pays what it said; in good time', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const board = new JobBoard([SPILL], T, seeded(seed));
      const ctx = context();
      untilOffered(board, ctx);
      const job = board.active!;
      expect(job.items).toHaveLength(5);
      for (const [i, a] of job.items.entries()) {
        expect(Math.hypot(a.x - job.from.x, a.z - job.from.z)).toBeLessThanOrEqual(SPILL.spread! + 1e-9);
        for (const b of job.items.slice(i + 1)) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(T.itemGap);
      }
      const promised = job.pay;
      const { kinds, seconds } = doJob(board, ctx);
      expect(kinds.filter((k) => k === 'picked')).toHaveLength(5);
      expect(kinds.at(-1)).toBe('done');
      // Walking straight at full speed takes well under the time given (it allows for going round things).
      expect(seconds).toBeLessThan(job.limit * 0.85);
      expect(promised).toBeGreaterThan(0);
      expect(board.streak).toBe(1);
    }
  });

  it('collect: scatters only where things can lie (never in a building)', () => {
    const board = new JobBoard([SPILL], T, seeded(6));
    const wall = (p: Point) => !(p.x > 10 && p.z > 3);
    untilOffered(board, context({ free: wall }));
    for (const p of board.active!.items) expect(wall(p)).toBe(true);
  });

  it('deliver: fetch it, take it, done', () => {
    const board = new JobBoard([RUSH], T, seeded(7));
    const ctx = context({ town: 'farm' });
    untilOffered(board, ctx);
    const job = board.active!;
    const { kinds, seconds } = doJob(board, ctx);
    expect(kinds).toEqual(['picked', 'done']);
    expect(seconds).toBeLessThan(job.limit * 0.85);
  });

  it('escort: find them, and they follow a little behind all the way there', () => {
    const board = new JobBoard([LOST], T, seeded(8));
    const ctx = context({ town: 'park' });
    untilOffered(board, ctx);
    const job = board.active!;
    let closest = Infinity;
    let following = false;
    const kinds: string[] = [];
    for (let t = 0; t < 120 && board.active; t += DT) {
      const target = board.target(ctx.hero)!;
      walk(ctx.hero, target, ctx.heroSpeed, DT);
      for (const e of board.update(DT, ctx)) kinds.push(e.kind);
      if (job.following) {
        following = true;
        closest = Math.min(closest, Math.hypot(job.person!.x - ctx.hero.x, job.person!.z - ctx.hero.z));
      }
    }
    expect(following).toBe(true);
    expect(kinds).toEqual(['reached', 'done']);
    // Never on top of the hero.
    expect(closest).toBeGreaterThan(T.followGap * 0.8);
    // Where they were going.
    expect(Math.hypot(job.person!.x - job.to!.x, job.person!.z - job.to!.z)).toBeLessThanOrEqual(T.dropRadius);
  });

  it('time up past halfway: a few seconds more, once; not yet halfway: it runs out', () => {
    const board = new JobBoard([RUSH], T, seeded(9));
    const ctx = context({ town: 'farm' });
    untilOffered(board, ctx);
    // Fetch it, walk halfway and stand there.
    const job = board.active!;
    while (job.carried === 0) {
      walk(ctx.hero, job.from, ctx.heroSpeed, DT);
      board.update(DT, ctx);
    }
    const mid = { x: (job.from.x + job.to!.x) / 2 + (job.to!.x - job.from.x) * 0.1, z: (job.from.z + job.to!.z) / 2 + (job.to!.z - job.from.z) * 0.1 };
    while (!walk(ctx.hero, mid, ctx.heroSpeed, DT)) board.update(DT, ctx);
    const kinds: string[] = [];
    while (board.active) for (const e of board.update(DT, ctx)) kinds.push(e.kind);
    expect(kinds).toEqual(['overtime', 'expired']);
    expect(board.streak).toBe(0);
    // Not touched at all: no extra time.
    untilOffered(board, ctx);
    const kinds2: string[] = [];
    while (board.active) for (const e of board.update(DT, ctx)) kinds2.push(e.kind);
    expect(kinds2).toEqual(['expired']);
  });

  it('the streak: each job done in a row pays more; one run out starts it again; leaving town keeps it', () => {
    const board = new JobBoard([SPILL], T, seeded(10));
    const ctx = context();
    const pays: number[] = [];
    for (let i = 0; i < 6; i++) {
      untilOffered(board, ctx);
      pays.push(board.active!.multiplier);
      doJob(board, ctx);
    }
    expect(pays).toEqual([...T.streak, T.streak.at(-1)].slice(0, 6));
    untilOffered(board, ctx);
    board.cancel();
    expect(board.streak).toBe(6);
    untilOffered(board, ctx);
    while (board.active) board.update(DT, ctx);
    expect(board.streak).toBe(0);
  });

  it('picks spots it can be done from where the hero is (a lost child at the far end of the park would take too long)', () => {
    const near = { x: 12, z: 0 };
    const far = { x: 160, z: 0 };
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const board = new JobBoard([LOST], T, seeded(seed));
      untilOffered(board, context({ town: 'park', spots: { lost: [far, near], parent: [{ x: -8, z: 0 }] } }));
      expect(board.active!.from).toEqual(near);
    }
  });

  it('gives time for the real way round when the town says how far it is to walk', () => {
    const spots = { door: [{ x: 30, z: 0 }], gate: [{ x: -30, z: 0 }] };
    const straight = new JobBoard([RUSH], T, seeded(12));
    untilOffered(straight, context({ town: 'farm', spots }));
    // The way round is twice the straight line (a barn in the way).
    const round = new JobBoard([RUSH], T, seeded(12));
    untilOffered(round, context({ town: 'farm', spots, walk: (a, b) => 2 * Math.hypot(a.x - b.x, a.z - b.z) }));
    expect(round.active!.limit).toBeGreaterThan(straight.active!.limit * 1.4);
  });

  it('gives at least the least time and at most the most', () => {
    const board = new JobBoard([RUSH], T, seeded(11));
    // Right next to it all: the least time.
    untilOffered(board, context({ town: 'farm', spots: { door: [{ x: 0.5, z: 0 }], gate: [{ x: 1, z: 0 }] } }));
    expect(board.active!.limit).toBe(T.minSeconds);
    board.cancel();
    // A very long way: no more than the most.
    untilOffered(board, context({ town: 'farm', heroSpeed: 1, spots: { door: [{ x: 90, z: 0 }], gate: [{ x: -90, z: 0 }] } }));
    expect(board.active!.limit).toBe(T.maxSeconds);
  });
});

const POLISH: JobDef = { id: 'polish', town: 'carWash', pattern: 'work', icon: '✨', title: 'jobPolish', needs: [], from: 'car', hold: 6, reach: 2.2, work: 1 };
const PERFECT: JobDef = { id: 'perfect', town: 'park', pattern: 'signal', icon: '🎯', title: 'jobPerfect', needs: [], from: 'lever', hold: 12, signal: 'perfect' };
const HENS: JobDef = { id: 'hens', town: 'farm', pattern: 'collect', icon: '🐔', title: 'jobHens', needs: [], from: 'yard', to: 'coop', count: 4, spread: 3, wander: 0.6, work: 2 };

describe('more kinds of rush job', () => {
  it('work: standing at it gets it done; stepping away keeps what is done so far', () => {
    const board = new JobBoard([POLISH], T, seeded(3));
    const ctx = context({ spots: { car: [{ x: 8, z: 0 }] } });
    untilOffered(board, ctx);
    const job = board.active!;
    expect(board.target(ctx.hero)).toEqual(job.from);
    // Walk up to it (within reach, not on top of it) and work three seconds.
    ctx.hero = { x: 6.2, z: 0 };
    const kinds: string[] = [];
    for (let t = 0; t < 3; t += DT) for (const e of board.update(DT, ctx)) kinds.push(e.kind);
    expect(kinds).toEqual(['reached']);
    expect(job.working).toBe(true);
    expect(job.progress).toBeCloseTo(0.5, 1);
    // Away a moment: nothing more done, nothing lost.
    ctx.hero = { x: 0, z: 0 };
    board.update(1, ctx);
    expect(job.working).toBe(false);
    expect(job.progress).toBeCloseTo(0.5, 1);
    // Back to finish it.
    ctx.hero = { x: 6.2, z: 0 };
    for (let t = 0; t < 3.2 && board.active; t += DT) for (const e of board.update(DT, ctx)) kinds.push(e.kind);
    expect(kinds).toEqual(['reached', 'done']);
    expect(board.active).toBeNull();
    // The time it gave covers walking there and the work.
    expect(job.limit).toBeGreaterThanOrEqual(8 / ctx.heroSpeed + 6 + 1);
  });

  it('signal: done when it happens at its own spot, not at another', () => {
    const board = new JobBoard([PERFECT], T, seeded(4));
    const ctx = context({ town: 'park', spots: { lever: [{ x: 6, z: 0, id: 'carousel' }] } });
    untilOffered(board, ctx);
    const job = board.active!;
    ctx.hero = { x: 6, z: 0 };
    const kinds = board.update(DT, ctx).map((e) => e.kind);
    expect(kinds).toEqual(['reached']);
    expect(job.progress).toBe(0.5);
    board.signal('perfect:teacups');
    expect(board.update(DT, ctx).map((e) => e.kind)).toEqual([]);
    board.signal('perfect:carousel');
    expect(board.update(DT, ctx).map((e) => e.kind)).toEqual(['done']);
    // The time it gave allows for waiting for it.
    expect(job.limit).toBeGreaterThanOrEqual(6 / ctx.heroSpeed + 12);
  });

  it("spots that need something built, or aren't ready, are passed over (and no spot ready: no job)", () => {
    const levers = [
      { x: 6, z: 0, id: 'carousel', needs: 'carousel' },
      { x: -6, z: 0, id: 'teacups', needs: 'teacups' },
    ];
    const built = (pad: string) => pad === 'teacups' || pad === 'carousel';
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const only = new JobBoard([PERFECT], T, seeded(seed));
      untilOffered(only, context({ town: 'park', spots: { lever: levers }, built: (pad) => pad === 'teacups' }));
      expect(only.active!.from.id).toBe('teacups');
      const ready = new JobBoard([PERFECT], T, seeded(seed));
      untilOffered(ready, context({ town: 'park', spots: { lever: levers }, built, usable: (_d, s) => s.id === 'carousel' }));
      expect(ready.active!.from.id).toBe('carousel');
    }
    const none = new JobBoard([PERFECT], T, seeded(9));
    const ctx = context({ town: 'park', spots: { lever: levers }, built, usable: () => false });
    expect(none.eligible(ctx)).toEqual([]);
    expect(untilOffered(none, ctx, 200)).toBe(Infinity);
  });

  it('collect: wandering things amble about within their spread, never into anything, and can still be caught in time', () => {
    const wall = { minX: 9, maxX: 11, minZ: -1, maxZ: 1 };
    const free = (p: Point) => p.x < wall.minX - 0.45 || p.x > wall.maxX + 0.45 || p.z < wall.minZ - 0.45 || p.z > wall.maxZ + 0.45;
    for (const seed of [1, 2, 3, 4, 5]) {
      const board = new JobBoard([HENS], T, seeded(seed));
      const ctx = context({ town: 'farm', spots: { yard: [{ x: 10, z: 3 }], coop: [{ x: -4, z: 6 }] }, free });
      untilOffered(board, ctx);
      const job = board.active!;
      const start = job.items.map((p) => ({ ...p }));
      // Left alone a while: they've moved, but stayed in the yard and out of the wall.
      for (let t = 0; t < 10; t += DT) {
        board.update(DT, { ...ctx, hero: { x: -40, z: -40 } });
        for (const p of job.items) {
          expect(Math.hypot(p.x - job.from.x, p.z - job.from.z)).toBeLessThanOrEqual(HENS.spread! + 1e-6);
          expect(free(p)).toBe(true);
        }
      }
      expect(job.items.some((p, i) => Math.hypot(p.x - start[i]!.x, p.z - start[i]!.z) > 1)).toBe(true);
      // Chasing them down still fits in the time left.
      const left = job.left;
      const { kinds, seconds } = doJob(board, ctx);
      expect(kinds.filter((k) => k === 'picked')).toHaveLength(4);
      expect(kinds).toContain('done');
      expect(seconds).toBeLessThan(left);
    }
  });

  it("only where the hero can get to now (the lot grows as it's built): spots and things outside are passed over", () => {
    // The lot so far reaches z = 15: the spot at z = 20 is beyond it, as is the spread round the one at z = 13.5.
    const reachable = (p: Point) => p.z < 15;
    for (const seed of [1, 2, 3, 4, 5]) {
      const board = new JobBoard([SPILL], T, seeded(seed));
      untilOffered(board, context({ spots: { spill: [{ x: 4, z: 20 }, { x: 4, z: 11 }], shelf: [{ x: -6, z: 8 }] }, reachable }));
      const job = board.active!;
      expect(job.from).toEqual({ x: 4, z: 11 });
      for (const p of job.items) expect(p.z).toBeLessThan(15);
    }
    const none = new JobBoard([SPILL], T, seeded(1));
    expect(none.eligible(context({ spots: { spill: [{ x: 4, z: 20 }], shelf: [{ x: -6, z: 8 }] }, reachable }))).toEqual([]);
  });

  it('golden: every sixth job done, the next pays three times over, and stays golden until done', () => {
    const board = new JobBoard([SPILL], T, seeded(5));
    const ctx = context();
    const golden: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      untilOffered(board, ctx);
      golden.push(board.active!.golden);
      if (i < 5) doJob(board, ctx);
    }
    expect(golden).toEqual([false, false, false, false, false, true]);
    const job = board.active!;
    expect(job.pay).toBe(roundPay(basePay(T, ctx) * job.multiplier * T.goldenPay));
    // Let it run out: the next one's golden still.
    while (board.active) board.update(DT, ctx);
    untilOffered(board, ctx);
    expect(board.active!.golden).toBe(true);
    doJob(board, ctx);
    untilOffered(board, ctx);
    expect(board.active!.golden).toBe(false);
    // Counted over every town when the game says how many have been done.
    const fresh = new JobBoard([SPILL], T, seeded(5));
    untilOffered(fresh, context({ done: 11 }));
    expect(fresh.active!.golden).toBe(true);
  });
});
