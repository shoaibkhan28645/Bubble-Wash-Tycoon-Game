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
    // 40 s of $600 a minute: $400, within 2.5%–8% of $10,000 ($250–$800).
    expect(basePay(T, { incomePerMinute: 600, next: { cost: 10000, owed: 1 } })).toBeCloseTo(400);
    // A town's first prices next to the old towns' big income: no more than 8% of the price.
    expect(basePay(T, { incomePerMinute: 600000, next: { cost: 10000, owed: 1 } })).toBeCloseTo(800);
    // Hardly any income yet: at least 2.5% of the price.
    expect(basePay(T, { incomePerMinute: 6, next: { cost: 10000, owed: 1 } })).toBeCloseTo(250);
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
    expect(pays).toEqual([1, 1.15, 1.3, 1.5, 1.75, 1.75]);
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
