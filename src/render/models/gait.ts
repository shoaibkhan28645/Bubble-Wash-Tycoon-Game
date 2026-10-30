// Matching a character's walk to the ground it really covers, so its feet
// stay planted: the hero's walk, jog and sprint were each made for one ground
// speed (art/blender/hero_anim.py), and play faster or slower to match.

export type GaitPose = 'walk' | 'jog' | 'sprint';
/** Ground speed (metres a second, in the game) each gait clip was made for. */
export type Gaits = Partial<Record<GaitPose, number>>;

const ORDER: GaitPose[] = ['walk', 'jog', 'sprint'];
/** A gait plays at most this much slower or faster than it was made for. */
const MIN_RATE = 0.55;
const MAX_RATE = 1.7;
/** Change gait only this far past the speed between two, so it doesn't flicker. */
const HYSTERESIS = 0.12;

/** The gait for a ground speed, and how fast to play it so the feet match the ground. */
export function pickGait(gaits: Gaits, speed: number, current: GaitPose | null): { pose: GaitPose; rate: number } {
  const have = ORDER.filter((g) => gaits[g] !== undefined);
  let pose = have[0] ?? 'walk';
  for (let i = 1; i < have.length; i++) {
    const slower = have[i - 1]!;
    const faster = have[i]!;
    // Halfway (on a log scale) between the two gaits' speeds.
    let edge = Math.sqrt(gaits[slower]! * gaits[faster]!);
    if (current === faster) edge *= 1 - HYSTERESIS;
    else if (current === slower) edge *= 1 + HYSTERESIS;
    if (speed >= edge) pose = faster;
  }
  const made = gaits[pose] ?? speed;
  const rate = made > 0 ? Math.min(MAX_RATE, Math.max(MIN_RATE, speed / made)) : 1;
  return { pose, rate };
}

/** A foot lands at the start of each gait cycle and halfway through it: how many landed going from phase `from` to `to` (0..1, wrapping). */
export function footfalls(from: number, to: number): number {
  if (to >= from) return from < 0.5 && to >= 0.5 ? 1 : 0;
  return (from < 0.5 ? 1 : 0) + 1 + (to >= 0.5 ? 1 : 0);
}
