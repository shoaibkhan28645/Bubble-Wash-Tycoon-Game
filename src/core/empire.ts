// The hero's empire: every town he owns businesses in. The town being played
// keeps its progress at the top of GameState (where every system reads it);
// the others wait in state.towns and keep earning in the background.
import { TUNING } from './config';
import { TOWN_KEYS, newTownState, type GameState, type TownState } from './gameState';
import { offlineEarnings } from '../systems/offline';

/** The pad that hires a town's manager (offline earnings at full rate); every town names it this way. */
const MANAGER = 'manager';

/** A copy of the progress of the town being played. */
export function currentTownState(state: GameState): TownState {
  const town = newTownState();
  for (const key of TOWN_KEYS) Object.assign(town, { [key]: state[key] });
  return town;
}

/**
 * Makes `id` the town being played: the current town's progress goes into
 * state.towns, and the new town's comes out of it (a fresh town the first
 * time). Empire-wide progress (cash, gems, flags, contracts…) stays put.
 */
export function switchTown(state: GameState, id: string): void {
  if (id === state.currentTown) return;
  state.towns[state.currentTown] = currentTownState(state);
  const next = state.towns[id] ?? newTownState();
  delete state.towns[id];
  Object.assign(state, next);
  state.currentTown = id;
}

/** Share of a town's measured income it earns while the hero is elsewhere: 50%, or 100% with its manager. */
function awayRate(town: TownState): number {
  return town.unlocked.includes(MANAGER) ? TUNING.offline.managerRate : TUNING.offline.rate;
}

/**
 * A town's steady takings a minute: its staff's measured rate, held to the
 * most that town can make (tuning `offline.maxRate`, well above a fully
 * upgraded town). A save from before v11 could hold a rate a lucky golden VIP
 * had blown up; this keeps it from paying out forever.
 */
export function steadyRate(id: string, town: TownState): number {
  const max = (TUNING.offline.maxRate as Record<string, number | undefined>)[id];
  return max === undefined ? town.autoRate : Math.min(town.autoRate, max);
}

/** Cash per second from the towns the hero isn't in (their staff keep working). */
export function backgroundIncome(state: GameState): number {
  let perMinute = 0;
  for (const [id, town] of Object.entries(state.towns)) perMinute += steadyRate(id, town) * awayRate(town);
  return perMinute / 60;
}

/**
 * Cash every town earned while the game was closed, each with its own
 * manager and offline-hours cap. `seconds` is the longest any town counted.
 */
export function empireOfflineEarnings(state: GameState, since: number, now: number): { seconds: number; cash: number } {
  let seconds = 0;
  let cash = 0;
  for (const [id, town] of [[state.currentTown, currentTownState(state)] as const, ...Object.entries(state.towns)]) {
    const capLevel = town.levels[`${MANAGER}.offlineHours`] ?? 0;
    const earned = offlineEarnings(steadyRate(id, town), since, now, TUNING.offline, town.unlocked.includes(MANAGER), capLevel);
    seconds = Math.max(seconds, earned.seconds);
    cash += earned.cash;
  }
  return { seconds, cash };
}

/** Adds background income as play goes on, in whole dollars so the cash counter doesn't twitch every frame. */
export function backgroundEarner(state: GameState): (dt: number) => void {
  let owed = 0;
  return (dt) => {
    owed += backgroundIncome(state) * dt;
    if (owed < 1) return;
    const whole = Math.floor(owed);
    state.cash += whole;
    owed -= whole;
  };
}
