// The game for the town being played: each kind of town builds its own
// (the car wash town, the farm village, the theme park), all behind the same
// Game interface. The first town's code comes with the game; each later
// kind's is its own chunk, downloaded the first time the hero goes there
// (so a new town adds nothing to the start).
import type { GameClock } from './clock';
import type { GameState } from './gameState';
import type { Lifecycle } from './lifecycle';
import type { SaveManager } from './save';
import type { SoundManager } from '../audio/sound';
import type { Stage } from '../render/stage';
import type { Player } from '../systems/player';
import type { Traffic } from '../systems/traffic';
import type { StaffSystem } from '../systems/staff';
import { town } from './config';
import { createRoadsideGame } from './roadsideGame';

export interface Game {
  readonly stage: Stage;
  readonly clock: GameClock;
  readonly player: Player;
  /** Offline earnings screen (cash already banked), with Collect 2×. */
  welcomeBack(earned: { cash: number; seconds: number }): void;
  /** The car wash town's cars, stations and staff (the dev console and play-test bot look at them); null elsewhere. */
  readonly traffic: Traffic | null;
  readonly staff: StaffSystem | null;
  /** Average JavaScript milliseconds per frame, for the debug panel. */
  readonly frameMs: number;
  /** Frames that threw an error, and the last one's message (the debug panel). */
  readonly frameErrors: { count: number; last: string };
  /** Draws one frame without starting the loop (behind the loading screen). */
  renderOnce(): void;
  start(): void;
  /** Extra per-frame work, e.g. the debug overlay. */
  addTicker(ticker: (dt: number) => void): void;
  /**
   * Takes the town down (leaving it): stops the loop, drops every listener,
   * frees the GPU context and removes everything it put on the page.
   */
  dispose(): void;
}

/** A later kind of town's code, fetched once (the second time it's already here). */
const farmGame = () => import('./farmGame');
const parkGame = () => import('./parkGame');

/** Starts downloading a kind of town's code (while its models load), so opening it doesn't wait. */
export function preloadGame(kind: string): void {
  if (kind === 'farm') void farmGame();
  else if (kind === 'park') void parkGame();
}

/** Builds the town being played (see setTown), downloading its code first if it's a later kind of town. */
export async function createGame(
  container: HTMLElement,
  stage: Stage,
  state: GameState,
  lifecycle: Lifecycle,
  saves: SaveManager,
  sound: SoundManager,
  travelTo: (id: string) => Promise<void>,
): Promise<Game> {
  const current = town();
  if (current.kind === 'carWash') return createRoadsideGame(container, stage, state, lifecycle, saves, sound, travelTo, current);
  if (current.kind === 'farm') return (await farmGame()).createFarmGame(container, stage, state, lifecycle, saves, sound, travelTo, current);
  return (await parkGame()).createParkGame(container, stage, state, lifecycle, saves, sound, travelTo, current);
}
