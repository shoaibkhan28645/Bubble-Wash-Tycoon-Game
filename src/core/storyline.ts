// Runs the town's story while playing: checks for due beats, sends each to
// celebration cards, and applies their effects (the rival's lost customers, a rush).
import { beatFlag, catchUpFlags, dueBeats, newsFor, storyArrivalFactor } from '../systems/story';
import type { Dirt } from './config';
import type { GameState } from './gameState';
import type { Press } from './press';
import type { TownDef } from './towns';

/** Beats are looked for this often. */
const CHECK_SECONDS = 0.5;

export interface Storyline {
  update(dt: number): void;
  /** Seconds of rush left (0: none). */
  readonly rushLeft: number;
}

export function createStoryline(deps: {
  state: GameState;
  town: TownDef;
  press: Press;
  /** Who the story's effects act on: the car wash's arrivals, or a town's walk-up visitors. */
  arrivals: { rateFactor: number; rush: { dirt: Dirt; payMultiplier: number } | null };
  /** Records a flag and saves. */
  flag: (name: string) => void;
  /** What some beats do once their card's closed: a speed boost (seconds), the empire map. */
  effects?: { boost?: (seconds: number) => void; map?: () => void };
  /** The hero's in the middle of something (a rush job): beats told by the clock alone wait till it's over. */
  busy?: () => boolean;
}): Storyline {
  const { state, town, press, arrivals, flag, effects, busy } = deps;
  const { story } = town;
  for (const name of catchUpFlags(town.id, story, state)) flag(name);
  let rushLeft = 0;
  let timer = 0;

  const check = (): void => {
    arrivals.rateFactor = storyArrivalFactor(town.id, story, state);
    for (const beat of dueBeats(town.id, story, state, rushLeft > 0)) {
      if (beat.when.playSeconds !== undefined && busy?.()) continue;
      flag(beatFlag(town.id, beat.id));
      const { boost, map } = beat.effect ?? {};
      press.publish(newsFor(story, beat), boost || map ? () => {
        if (boost) effects?.boost?.(boost);
        if (map) effects?.map?.();
      } : undefined);
      const rush = beat.effect?.rush;
      if (rush) {
        rushLeft = rush.seconds;
        arrivals.rush = { dirt: rush.dirt, payMultiplier: rush.payMultiplier };
      }
    }
  };

  return {
    update(dt) {
      if (rushLeft > 0) {
        rushLeft = Math.max(0, rushLeft - dt);
        if (rushLeft === 0) arrivals.rush = null;
      }
      timer -= dt;
      if (timer > 0) return;
      timer = CHECK_SECONDS;
      check();
    },
    get rushLeft() {
      return rushLeft;
    },
  };
}
