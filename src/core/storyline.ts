// Runs the town's story while playing: checks for due beats, sends each to
// the paper, and applies their effects (the rival's lost customers, a rush).
import type { Arrivals } from '../systems/arrivals';
import { beatFlag, catchUpFlags, dueBeats, newsFor, storyArrivalFactor } from '../systems/story';
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
  arrivals: Arrivals;
  /** Records a flag and saves. */
  flag: (name: string) => void;
}): Storyline {
  const { state, town, press, arrivals, flag } = deps;
  const { story } = town;
  for (const name of catchUpFlags(town.id, story, state)) flag(name);
  let rushLeft = 0;
  let timer = 0;

  const check = (): void => {
    arrivals.rateFactor = storyArrivalFactor(town.id, story, state);
    for (const beat of dueBeats(town.id, story, state, rushLeft > 0)) {
      flag(beatFlag(town.id, beat.id));
      press.publish(newsFor(story, beat));
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
