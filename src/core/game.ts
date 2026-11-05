// The game for the town being played: each kind of town builds its own
// (the car wash town today; Chapter 2's farm village next), all behind the
// same Game interface.
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

/** Builds the town being played (see setTown). */
export function createGame(
  container: HTMLElement,
  stage: Stage,
  state: GameState,
  lifecycle: Lifecycle,
  saves: SaveManager,
  sound: SoundManager,
  travelTo: (id: string) => Promise<void>,
): Game {
  const current = town();
  return createRoadsideGame(container, stage, state, lifecycle, saves, sound, travelTo, current);
}
