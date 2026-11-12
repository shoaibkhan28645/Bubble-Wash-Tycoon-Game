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
}

export const JOURNEY = journeyJson as JourneyStop[];

/**
 * here: the hero is in it. owned: he has businesses there. open: he bought
 * its land and can go. soon: he bought its land, but this version of the
 * game doesn't have the town yet. locked: its land isn't bought yet.
 */
export type StopStatus = 'here' | 'owned' | 'open' | 'soon' | 'locked';

/**
 * Where each town stands for this player; `exists` says which towns this
 * build can load. The only way into a new town is buying its land (the last
 * pad of the town before it, `landBought`); franchise stars are a score.
 */
export function stopStatus(stop: JourneyStop, state: GameState, exists: (id: string) => boolean, landBought = false): StopStatus {
  if (stop.id === state.currentTown) return 'here';
  if (state.towns[stop.id]) return 'owned';
  if (!landBought) return 'locked';
  return exists(stop.id) ? 'open' : 'soon';
}

/** The town before this one on the journey (where its land is bought), if any. */
export function previousStop(stop: JourneyStop): JourneyStop | undefined {
  return JOURNEY.find((s) => s.chapter === stop.chapter - 1);
}
