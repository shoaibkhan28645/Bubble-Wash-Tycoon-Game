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
    savedAt: 0,
  };
}
