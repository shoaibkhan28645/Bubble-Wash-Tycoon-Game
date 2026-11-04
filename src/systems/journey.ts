// The hero's journey across the six towns (strategy doc, section 4): which
// towns he owns, which he can open next, and which are still to come.
import journeyJson from '../data/journey.json';
import type { GameState } from '../core/gameState';

export interface JourneyStop {
  id: string;
  name: string;
  chapter: number;
  icon: string;
  /** What the town's businesses are, for the map. */
  teaser: string;
  /** Franchise stars needed to open it. */
  franchiseStars: number;
}

export const JOURNEY = journeyJson as JourneyStop[];

/**
 * here: the hero is in it. owned: he has businesses there. open: he can go
 * there now. soon: he has the stars, but this version of the game doesn't
 * have the town yet. locked: not enough franchise stars yet.
 */
export type StopStatus = 'here' | 'owned' | 'open' | 'soon' | 'locked';

/** Where each town stands for this player; `exists` says which towns this build can load. */
export function stopStatus(stop: JourneyStop, state: GameState, exists: (id: string) => boolean): StopStatus {
  if (stop.id === state.currentTown) return 'here';
  if (state.towns[stop.id]) return 'owned';
  if (state.franchiseStars < stop.franchiseStars) return 'locked';
  return exists(stop.id) ? 'open' : 'soon';
}
