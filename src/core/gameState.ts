/**
 * The single source of truth for progress. Only ids, levels and counts live
 * here; positions and other moment-to-moment state belong to the systems.
 */
export interface GameState {
  cash: number;
  gems: number;
  /** Current location number, starting at 1. */
  location: number;
  /** Ids of built unlock pads, in build order. */
  unlocked: string[];
  /** Upgrade levels by id, e.g. "bay1.speed": 3. */
  levels: Record<string, number>;
  /** Ids of hired staff. */
  staff: string[];
  /** Cash already paid into unlock pads that aren't finished yet, by pad id. */
  padPaid: Record<string, number>;
  /** Uncollected cash in each pile, by pile id. */
  piles: Record<string, number>;
  /** Star rating, 1–5 (sets how often cars arrive). */
  stars: number;
  /** Automated income per minute, measured in play; drives offline earnings. */
  autoRate: number;
  /** Supply counts: "shelf.soap", "bay1.soap", "dryer.towel"… */
  supplies: Record<string, number>;
  /** One-off milestones for the tutorial hand: "washed", "collected", "supplied", "ended"… */
  flags: string[];
  /** Total seconds played (game clock), for the first-10-minutes timeline. */
  playSeconds: number;
  /** Wall-clock ms of the last save (0 = never saved). Used for offline earnings. */
  savedAt: number;
}

export function newGame(): GameState {
  return {
    cash: 0,
    gems: 0,
    location: 1,
    unlocked: [],
    levels: {},
    staff: [],
    padPaid: {},
    piles: {},
    stars: 3,
    autoRate: 0,
    supplies: {},
    flags: [],
    playSeconds: 0,
    savedAt: 0,
  };
}
