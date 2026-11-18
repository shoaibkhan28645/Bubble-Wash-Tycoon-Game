// The town's big moments (a story beat, a new rank): celebration cards wait their turn and only open
// when no other card or dialog is up, one at a time. Closing one is a natural break
// between screens, so an interstitial ad may follow (Playables rules).
import type { SoundManager } from '../audio/sound';
import { showCelebration, type Announcement } from '../ui/celebration';

/** Wait this long after a card closes before the next one opens. */
const GAP_SECONDS = 1.5;

export interface Press {
  /** Queues a card; `then` runs once it's been closed. */
  publish(item: Announcement, then?: () => void): void;
  update(dt: number): void;
  /** A card is open or waiting. */
  readonly busy: boolean;
}

export function createPress(root: HTMLElement, sound: SoundManager, onClosed: () => void): Press {
  const waiting: { item: Announcement; then?: () => void }[] = [];
  let open = false;
  let gap = 0;
  return {
    publish(item, then) {
      waiting.push({ item, then });
    },
    update(dt) {
      gap = Math.max(0, gap - dt);
      if (open || gap > 0 || waiting.length === 0) return;
      // Never over another card or dialog (welcome back, the calendar, an ad offer).
      if (root.querySelector('.welcome-overlay')) return;
      const { item, then } = waiting.shift()!;
      open = true;
      sound.play('open');
      showCelebration(root, item, () => {
        open = false;
        gap = GAP_SECONDS;
        sound.play('click');
        onClosed();
        then?.();
      });
    },
    get busy() {
      return open || waiting.length > 0;
    },
  };
}
