// The steps a player reaches, for the platform's stats (Playgama's telemetry: where in the game players
// stop). Each is sent once per player, when it first happens, as `progression_completed` with a fixed
// `step_id` and its place in the game (`step_index`), and the game's version to tell builds apart.
import { version } from '../../package.json';
import { trackEvent } from '../platform/youtube';

/** In the order a player reaches them. */
export const PROGRESS_STEPS = [
  'first_wash',
  'first_cash',
  'first_build',
  'first_helper',
  'mini_mart',
  'town_willowbrook',
  'town_starlight',
  'town_skyport',
  'game_finished',
] as const;
export type ProgressStep = (typeof PROGRESS_STEPS)[number];

/** The first town's pads that mark a step (src/data/towns/roadside/pads.json). */
const ROADSIDE_PADS: Record<string, ProgressStep> = { register: 'first_build', washer: 'first_helper', mart: 'mini_mart' };

/** The step a newly built pad marks, if any: one of the first town's, the land for the next town, or the end. */
export function padStep(townId: string, padId: string, effects?: { travel?: string; endOfContent?: boolean }): ProgressStep | null {
  if (effects?.endOfContent) return 'game_finished';
  const next = effects?.travel && `town_${effects.travel}`;
  if (next) return (PROGRESS_STEPS as readonly string[]).includes(next) ? (next as ProgressStep) : null;
  return townId === 'roadside' ? ROADSIDE_PADS[padId] ?? null : null;
}

/** Sends a step. Call where it first happens (a flag first set, a pad just built): that's what makes it once. */
export function reportProgress(step: ProgressStep | null, send: typeof trackEvent = trackEvent): void {
  if (!step) return;
  send('progression_completed', { step_id: step, step_index: PROGRESS_STEPS.indexOf(step) + 1, game_version: version });
}
