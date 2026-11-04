// The hero's career while playing: net worth checked every second, a
// newspaper card and a fanfare for each new rank, the rank chip in the HUD,
// and the best net worth sent to YouTube as the game's score.
import * as platform from '../platform/youtube';
import type { SoundManager } from '../audio/sound';
import { bestNetWorth, currentRank, netWorth, nextRank, rankFlag, recordNetWorth, uncelebratedRanks } from '../systems/career';
import { formatCash } from '../systems/economy';
import { RankChip } from '../ui/rankChip';
import { t } from '../ui/strings';
import type { GameState } from './gameState';
import type { Press } from './press';
import { loadedTown, type TownDef } from './towns';

/** Net worth is worked out this often. */
const CHECK_SECONDS = 1;
/** A new best score is sent at most this often (and at once on a rank-up). */
const SCORE_SECONDS = 30;

export interface Hero {
  update(dt: number): void;
  /** Net worth right now. */
  readonly netWorth: number;
}

export function createHero(deps: {
  root: HTMLElement;
  state: GameState;
  town: TownDef;
  sound: SoundManager;
  press: Press;
  /** Records a flag and saves. */
  flag: (name: string) => void;
  /** Saves now (the score sent must already be the best in the save). */
  save: () => Promise<void>;
  onChipTap: () => void;
}): Hero {
  const { root, state, town, sound, press, flag } = deps;
  const chip = new RankChip(root, deps.onChipTap);
  let worth = 0;
  let checkTimer = 0;
  let scoreTimer = 0;
  let unsent = true;

  const check = (): void => {
    worth = netWorth(state, town, loadedTown);
    if (recordNetWorth(state, worth)) unsent = true;
    const fresh = uncelebratedRanks(state);
    const top = fresh.at(-1);
    if (top) {
      // A player who was already past several ranks (an old save) gets one card, for the highest.
      for (const rank of fresh) flag(rankFlag(rank));
      press.publish({
        paper: town.story.paper,
        icon: top.icon,
        headline: t('rankHeadline', { rank: top.name }),
        body: t('rankBody', { worth: formatCash(top.netWorth), perk: top.perk ?? '' }).trim(),
      });
      sound.play('vip');
      scoreTimer = 0;
    }
    chip.update(currentRank(state), nextRank(state), worth);
  };

  check();
  return {
    update(dt) {
      checkTimer -= dt;
      if (checkTimer <= 0) {
        checkTimer = CHECK_SECONDS;
        check();
      }
      scoreTimer -= dt;
      if (unsent && scoreTimer <= 0) {
        unsent = false;
        scoreTimer = SCORE_SECONDS;
        const best = bestNetWorth(state);
        void deps.save().then(() => platform.sendScore(best));
      }
    },
    get netWorth() {
      return worth;
    },
  };
}
