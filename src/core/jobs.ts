// Rush jobs in a town (systems/jobs.ts decides, render/jobView.ts draws):
// what every town's game hands over each frame, and paying out. The same in
// every town; each says what kind of town it is, who it can show (a lost
// child needs the park's visitors loaded) and when something else is on.
import { Vector3, type Object3D, type PerspectiveCamera, type Scene } from 'three';
import { JOBS, type Point, type Rect, type TownLayout } from './config';
import type { GameState } from './gameState';
import { backgroundIncome } from './empire';
import type { SoundManager } from '../audio/sound';
import type { Particles } from '../render/effects/particles';
import { JobView, type MakePerson } from '../render/jobView';
import { JobBoard, type JobTown } from '../systems/jobs';
import { NavGrid } from '../systems/nav';
import type { PadSystem } from '../systems/pads';
import type { Floaters } from '../ui/carBubbles';
import type { EventChips } from '../ui/eventChips';
import { formatCash } from '../systems/economy';
import { t } from '../ui/strings';
import type { WorldLabels } from '../ui/worldLabels';

/** The hero's earnings are measured over this long (seconds), for how far off the next purchase is. */
const EARN_WINDOW = 90;

/** The walking grid used for a job's time is made again after this long (seconds), and walks with this much room. */
const NAV_SECONDS = 20;
const NAV_RADIUS = 0.45;

/** A spot clear of everything solid, with room round it (somewhere a job's things can lie and the hero reach them). */
export function clearOf(p: Point, solids: readonly Rect[], margin = 0.45): boolean {
  return solids.every((r) => p.x < r.minX - margin || p.x > r.maxX + margin || p.z < r.minZ - margin || p.z > r.maxZ + margin);
}

export interface Jobs {
  readonly board: JobBoard;
  update(dt: number, camera: PerspectiveCamera, width: number, height: number, insets: { top: number; right: number }): void;
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
  /** Jobs may come at all (past the tutorial, people loaded…). */
  allowed: () => boolean;
  /** Something else timed is on (no new job meanwhile). */
  blocked: () => boolean;
  /** Everything solid in the town now (buildings, fences, props): jobs' things lie clear of them, and the hero walks round them. */
  solids: () => readonly Rect[];
  /** A job paid (missions count it as earnings). */
  onPaid: (amount: number, at: Point) => void;
  save: () => void;
}): Jobs {
  const { root, state, layout, pads, hero, effects, floaters, sound } = deps;
  const board = new JobBoard(JOBS.jobs, JOBS.tuning);
  const view = new JobView(deps.scene, deps.labels, root, deps.chips, hero.mesh, deps.makePerson);
  const spots = layout.jobSpots ?? {};
  // What the hero earns a minute, all told (by hand too): cash coming in, job pay left out.
  const earned: { at: number; amount: number }[] = [];
  let clock = 0;
  let lastCash = state.cash;

  const incomePerMinute = (): number => {
    const steady = state.autoRate + backgroundIncome(state) * 60;
    while (earned.length > 0 && earned[0]!.at < clock - EARN_WINDOW) earned.shift();
    const sum = earned.reduce((total, e) => total + e.amount, 0);
    const measured = (sum * 60) / Math.max(30, Math.min(clock, EARN_WINDOW));
    return Math.max(steady, measured);
  };

  // The real way round, for how long a job gets: a walking grid of the town as it is when a job's being chosen
  // (made again for the next one, as buildings go up meanwhile).
  let nav: { grid: NavGrid; at: number } | null = null;
  const path = (from: Point, to: Point): Point[] => {
    if (!nav || clock - nav.at > NAV_SECONDS) nav = { grid: new NavGrid(layout.walk, deps.solids(), NAV_RADIUS), at: clock };
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

  /** A panel's open (an upgrade pad's, a dialog, the paper): everything waits. */
  const panelOpen = (): boolean => root.querySelector('.welcome-overlay, .upgrade-panel:not([hidden])') !== null;

  const context = () => {
    const cost = pads.nextCost;
    const next = pads.next;
    return {
      town: deps.town,
      hero: hero.position(),
      heroSpeed: hero.speed(),
      incomePerMinute: incomePerMinute(),
      next: cost !== null && next ? { cost, owed: Math.max(0, next.owed - state.cash) } : null,
      built: (id: string) => state.unlocked.includes(id),
      spots,
      allowed: deps.allowed(),
      paused: panelOpen(),
      blocked: deps.blocked(),
      free: (p: Point) => clearOf(p, deps.solids()),
      walk,
    };
  };

  const at = (height: number) => {
    const p = hero.position();
    return new Vector3(p.x, height, p.z);
  };

  return {
    board,
    update(dt, camera, width, height, insets) {
      clock += dt;
      // (Job pay is added below, after this, and counted in lastCash: it's never taken for earnings.)
      const rise = state.cash - lastCash;
      if (rise > 0) earned.push({ at: clock, amount: rise });
      for (const e of board.update(dt, context())) {
        switch (e.kind) {
          case 'offered':
            view.show(e.job);
            sound.play('sparkle');
            break;
          case 'picked':
            view.picked(e.at);
            effects.burst('sparkle', new Vector3(e.at.x, 0.6, e.at.z), 8, 2, 0.3);
            sound.play('pick');
            break;
          case 'reached':
            sound.play('pop');
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
            floaters.show(`⚡ ${t('jobDone')} +${formatCash(e.pay)}${streak}`, at(3.2), 'tip');
            effects.burst('confetti', at(2.2), 36, 5, 1);
            sound.play('reward');
            deps.onPaid(e.pay, hero.position());
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
      view.update(dt, board, hero.position(), board.streak, camera, width, height, insets);
    },
    path,
    force(id) {
      if (board.active) return false;
      const job = board.force(context(), id);
      if (job) {
        view.show(job);
        sound.play('sparkle');
      }
      return !!job;
    },
    dispose() {
      board.cancel();
      view.dispose();
    },
  };
}
