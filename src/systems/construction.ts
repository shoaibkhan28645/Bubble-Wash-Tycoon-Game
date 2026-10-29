// Construction timers: bigger buildings take real time to build after
// they're paid for, and keep building while the player is away. A rewarded
// ad halves what's left (once per build); gems finish it at once.
import { TUNING } from '../core/config';
import type { Build, GameState } from '../core/gameState';

/** Puts a paid-for pad under construction for `seconds` from `now` (ms). */
export function startBuild(state: GameState, id: string, seconds: number, now: number): void {
  state.building[id] = { endsAt: now + seconds * 1000, halved: false };
}

export function secondsLeft(build: Build, now: number): number {
  return Math.max(0, (build.endsAt - now) / 1000);
}

/** The rewarded ad: half of what's left, once per build. False if already used. */
export function halveBuild(build: Build, now: number): boolean {
  if (build.halved) return false;
  build.endsAt = now + (secondsLeft(build, now) * 1000) / 2;
  build.halved = true;
  return true;
}

/** Gems to finish now: one per started block of tuning seconds left, at least one. */
export function finishGems(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / TUNING.construction.gemSeconds));
}

/** Pads whose building is done, soonest first; they leave `state.building`. */
export function takeFinished(state: GameState, now: number): string[] {
  const done = Object.entries(state.building)
    .filter(([, build]) => build.endsAt <= now)
    .sort((a, b) => a[1].endsAt - b[1].endsAt)
    .map(([id]) => id);
  for (const id of done) delete state.building[id];
  return done;
}

/** The build that finishes soonest, if any is going. */
export function soonestBuild(state: GameState): { id: string; build: Build } | null {
  let best: { id: string; build: Build } | null = null;
  for (const [id, build] of Object.entries(state.building)) if (!best || build.endsAt < best.build.endsAt) best = { id, build };
  return best;
}

/** "4:05", "1:02:30": what a site's countdown shows. */
export function formatClock(seconds: number): string {
  const s = Math.ceil(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}
