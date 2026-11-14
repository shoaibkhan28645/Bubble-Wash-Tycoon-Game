// Rush jobs in a town (systems/jobs.ts decides, render/jobView.ts draws):
// what every town's game hands over each frame, and paying out. The same in
// every town; each says what kind of town it is, who and what it can show (a
// lost child needs the park's visitors loaded, a hen the farm's models), when
// a job's spot is ready (a perfect launch needs a ride about to fill) and
// when something else is on. A golden job done may be doubled (an ad or
// gems); the very first job of all, the town's mentor says what jobs are.
import { Vector3, type Object3D, type PerspectiveCamera, type Scene } from 'three';
import { JOBS, TUNING, type Point, type Rect, type TownLayout } from './config';
import type { GameState } from './gameState';
import { backgroundIncome } from './empire';
import type { SoundManager } from '../audio/sound';
import type { Particles } from '../render/effects/particles';
import { JobView, type MakePerson, type MakeThing } from '../render/jobView';
import { JobBoard, jobFootprint, type JobDef, type JobSpot, type JobTown } from '../systems/jobs';
import { NavGrid } from '../systems/nav';
import type { PadSystem } from '../systems/pads';
import { stepOutOf } from '../systems/player';
import type { Floaters } from '../ui/carBubbles';
import { speech } from '../ui/dialog';
import type { EventChips } from '../ui/eventChips';
import { formatCash } from '../systems/economy';
import { t } from '../ui/strings';
import type { WorldLabels } from '../ui/worldLabels';

/** The hero's earnings are measured over this long (seconds), for how far off the next purchase is. */
const EARN_WINDOW = 90;

/** The walking grid used for a job's time is made again after this long (seconds), and walks with this much room. */
const NAV_SECONDS = 20;
const NAV_RADIUS = 0.45;

/** Jobs keep this far inside where the hero may walk (m). */
const REACH_MARGIN = 0.6;

/** Seconds after a golden job's done before the offer to double it (the reward's seen first). */
const DOUBLE_DELAY = 1.2;

/** When a golden job's pay was last offered doubled (seconds of play; every town). */
let doubledAt = -Infinity;

/** A spot clear of everything solid, with room round it (somewhere a job's things can lie and the hero reach them). */
export function clearOf(p: Point, solids: readonly Rect[], margin = 0.45): boolean {
  return solids.every((r) => p.x < r.minX - margin || p.x > r.maxX + margin || p.z < r.minZ - margin || p.z > r.maxZ + margin);
}

const square = (p: Point, half: number): Rect => ({ minX: p.x - half, maxX: p.x + half, minZ: p.z - half, maxZ: p.z + half });

/** Whether a job shows anyone: someone lost (not a calf), or someone waiting at the end. */
function hasPeople(def: JobDef): boolean {
  const lost = def.pattern === 'escort' && def.who !== 'calf';
  const waiting = (def.pattern === 'escort' || def.pattern === 'deliver') && (def.waiting ?? 'adult') !== 'none';
  return lost || waiting;
}

export interface Jobs {
  readonly board: JobBoard;
  /** The hero's working at a job right now (polishing, pumping): the game shows him busy. */
  readonly working: boolean;
  update(dt: number, camera: PerspectiveCamera, width: number, height: number, insets: { top: number; right: number }): void;
  /** Something happened in town a job may be waiting for (`perfect:carousel`). */
  signal(key: string): void;
  /** What's solid of the job now (a parked car), for the hero to walk round. */
  solids(): Rect[];
  /** Offers a job now (the debug switch, and the tests in the browser). */
  force(id?: string): boolean;
  /** The way round from one place to another, as the job's time allows for (the play-test bot walks it). */
  path(from: Point, to: Point): Point[];
  dispose(): void;
}

export function createJobs(deps: {
  root: HTMLElement;
  scene: Scene;
  labels: WorldLabels;
  chips: EventChips;
  state: GameState;
  layout: TownLayout;
  town: JobTown;
  pads: PadSystem;
  hero: { position: () => Point; mesh: Object3D; speed: () => number };
  effects: Particles;
  floaters: Floaters;
  sound: SoundManager;
  makePerson: MakePerson;
  /** The town's own models of jobs' things (hens, a calf, a VIP car). */
  makeThing?: MakeThing;
  /** People's models are loaded (jobs with someone in them wait till they are). */
  people?: () => boolean;
  /** Whether a job can happen at a spot right now (a ride about to fill, for a perfect launch). */
  usable?: (def: JobDef, spot: JobSpot) => boolean;
  /** Jobs may come at all (past the tutorial, people loaded…). */
  allowed: () => boolean;
  /** Something else timed is on (no new job meanwhile). */
  blocked: () => boolean;
  /** Everything solid in the town now (buildings, fences, props): jobs' things lie clear of them, and the hero walks round them. */
  solids: () => readonly Rect[];
  /** Where the hero may walk now (the lot grows as it's built): jobs happen only inside it. */
  walkable: () => Rect;
  /** The town's mentor, who tells the hero about jobs the first time one comes. */
  mentor: { name: string; icon: string };
  /** A job paid (missions count it as earnings). */
  onPaid: (amount: number, at: Point) => void;
  /** A job done (today's missions count it). */
  onDone: () => void;
  /** Offers to double a golden job's pay (an ad or gems): true if earned. */
  double: (pay: number) => Promise<boolean>;
  save: () => void;
}): Jobs {
  const { root, state, layout, pads, hero, effects, floaters, sound } = deps;
  const tuning = JOBS.tuning;
  const board = new JobBoard(JOBS.jobs, tuning);
  const view = new JobView(deps.scene, deps.labels, root, deps.chips, hero.mesh, deps.makePerson, deps.makeThing);
  const spots = layout.jobSpots ?? {};
  // What the hero earns a minute, all told (by hand too): cash coming in, job pay left out.
  const earned: { at: number; amount: number }[] = [];
  let clock = 0;
  let lastCash = state.cash;
  let doubleIn = 0;
  let doublePay = 0;
  let gone = false;

  const incomePerMinute = (): number => {
    const steady = state.autoRate + backgroundIncome(state) * 60;
    while (earned.length > 0 && earned[0]!.at < clock - EARN_WINDOW) earned.shift();
    const sum = earned.reduce((total, e) => total + e.amount, 0);
    const measured = (sum * 60) / Math.max(30, Math.min(clock, EARN_WINDOW));
    return Math.max(steady, measured);
  };

  // The real way round, for how long a job gets: a walking grid of the town as it is when a job's being chosen,
  // as far as the hero may walk so far (made again for the next one, as buildings go up and the lot grows).
  let nav: { grid: NavGrid; at: number; area: string } | null = null;
  const path = (from: Point, to: Point): Point[] => {
    const walkable = deps.walkable();
    const area = `${walkable.minX},${walkable.maxX},${walkable.minZ},${walkable.maxZ}`;
    if (!nav || clock - nav.at > NAV_SECONDS || nav.area !== area) nav = { grid: new NavGrid(walkable, deps.solids(), NAV_RADIUS), at: clock, area };
    return nav.grid.findPath(from, to);
  };
  const walk = (from: Point, to: Point): number => {
    let length = 0;
    let at = from;
    for (const p of path(from, to)) {
      length += Math.hypot(p.x - at.x, p.z - at.z);
      at = p;
    }
    return length;
  };

  /** Where nothing of a job may lie: what's solid, and every pad (stepping on one to pick something up would buy it). */
  const taken = (): Rect[] => [
    ...deps.solids(),
    ...Object.entries(layout.pads)
      .filter(([id]) => !state.unlocked.includes(id))
      .map(([, p]) => square(p, TUNING.pads.radius)),
    ...Object.values(layout.upgradePads).map((p) => square(p, TUNING.pads.upgradeRadius)),
  ];

  /** A panel's open (an upgrade pad's, a dialog, the paper): everything waits. */
  const panelOpen = (): boolean => root.querySelector('.welcome-overlay, .upgrade-panel:not([hidden])') !== null;

  const usable = (def: JobDef, spot: JobSpot): boolean => (!hasPeople(def) || (deps.people?.() ?? true)) && (deps.usable?.(def, spot) ?? true);

  const context = () => {
    const cost = pads.nextCost;
    const next = pads.next;
    // Worked out once a frame, and only if wanted (wandering things ask every frame).
    let blocked: Rect[] | null = null;
    return {
      town: deps.town,
      hero: hero.position(),
      heroSpeed: hero.speed(),
      incomePerMinute: incomePerMinute(),
      next: cost !== null && next ? { cost, owed: Math.max(0, next.owed - state.cash) } : null,
      built: (id: string) => state.unlocked.includes(id),
      spots,
      usable,
      reachable: (p: Point) => {
        const w = deps.walkable();
        return p.x > w.minX + REACH_MARGIN && p.x < w.maxX - REACH_MARGIN && p.z > w.minZ + REACH_MARGIN && p.z < w.maxZ - REACH_MARGIN;
      },
      done: state.counts.jobs ?? 0,
      allowed: deps.allowed(),
      paused: panelOpen(),
      blocked: deps.blocked(),
      free: (p: Point) => clearOf(p, (blocked ??= taken())),
      walk,
    };
  };

  const at = (height: number) => {
    const p = hero.position();
    return new Vector3(p.x, height, p.z);
  };

  const solids = (): Rect[] => {
    const job = board.active;
    const footprint = job ? jobFootprint(job.def, job.from) : null;
    return footprint ? [footprint] : [];
  };

  const offered = (): void => {
    const job = board.active;
    if (!job) return;
    view.show(job);
    sound.play('sparkle');
    // Something solid put down where the hero stands (a car): they step out of its way.
    for (const r of solids()) stepOutOf(hero.mesh.position, TUNING.player.radius, r, deps.solids(), layout.walk);
    if (job.golden) floaters.show(`🌟 ${t('jobGolden')}`, at(3.4), 'tip');
    // The first job of all: the mentor says what it's about (once, and only to someone new to jobs).
    if (!state.flags.includes('jobIntro')) {
      state.flags.push('jobIntro');
      if ((state.counts.jobs ?? 0) === 0) speech(root, deps.mentor, t('jobIntro'));
    }
  };

  /** A golden job's pay, doubled if the player wants (an ad or gems). */
  const offerDouble = (pay: number): void => {
    void deps.double(pay).then((earnedIt) => {
      if (!earnedIt || gone) return;
      state.cash += pay;
      // Not earnings: job pay never counts towards how far off the next purchase is.
      lastCash += pay;
      floaters.show(`🌟 ${t('jobDoubled')} +${formatCash(pay)}`, at(3.2), 'tip');
      effects.burst('confetti', at(2.2), 44, 5, 1);
      sound.play('reward');
      deps.onPaid(pay, hero.position());
      deps.save();
    });
  };

  return {
    board,
    get working() {
      return board.active?.working ?? false;
    },
    update(dt, camera, width, height, insets) {
      clock += dt;
      // (Job pay is added below, after this, and counted in lastCash: it's never taken for earnings.)
      const rise = state.cash - lastCash;
      if (rise > 0) earned.push({ at: clock, amount: rise });
      for (const e of board.update(dt, context())) {
        switch (e.kind) {
          case 'offered':
            offered();
            break;
          case 'picked':
            view.picked(e.at);
            effects.burst('sparkle', new Vector3(e.at.x, 0.6, e.at.z), 8, 2, 0.3);
            sound.play('pick');
            break;
          case 'reached':
            sound.play('pop');
            // A perfect launch: what to do, now the hero's at the lever.
            if (e.job.def.pattern === 'signal') floaters.show(`🎯 ${t('jobPerfectHint')}`, at(3), 'star');
            break;
          case 'overtime':
            floaters.show(`⏱ ${t('jobOvertime')}`, at(3), 'star');
            sound.play('whoosh');
            break;
          case 'done': {
            view.done();
            state.cash += e.pay;
            state.counts.jobs = (state.counts.jobs ?? 0) + 1;
            state.counts.jobStreak = Math.max(state.counts.jobStreak ?? 0, board.streak);
            const streak = board.streak > 1 ? `  🔥${t('jobStreak', { n: e.job.multiplier })}` : '';
            floaters.show(`${e.job.golden ? '🌟' : '⚡'} ${t('jobDone')} +${formatCash(e.pay)}${streak}`, at(3.2), 'tip');
            effects.burst('confetti', at(2.2), e.job.golden ? 60 : 36, 5, 1);
            sound.play('reward');
            deps.onPaid(e.pay, hero.position());
            deps.onDone();
            // A golden one: double it? (Not for someone new to the game, and not too often.)
            if (e.job.golden && state.playSeconds >= tuning.doubleAfter && state.playSeconds - doubledAt >= tuning.doubleGap) {
              doubledAt = state.playSeconds;
              doubleIn = DOUBLE_DELAY;
              doublePay = e.pay;
            }
            deps.save();
            break;
          }
          case 'expired':
            view.clear();
            floaters.show(`⌛ ${t('jobMissed')}`, at(3), 'star');
            break;
        }
      }
      lastCash = state.cash;
      if (doubleIn > 0) {
        doubleIn -= dt;
        if (doubleIn <= 0) offerDouble(doublePay);
      }
      view.update(dt, board, hero.position(), board.streak, camera, width, height, insets);
    },
    signal(key) {
      board.signal(key);
    },
    solids,
    path,
    force(id) {
      if (board.active) return false;
      const job = board.force(context(), id);
      if (job) offered();
      return !!job;
    },
    dispose() {
      gone = true;
      board.cancel();
      view.dispose();
    },
  };
}
