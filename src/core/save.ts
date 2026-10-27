import type { GameState } from './gameState';
import { serialize } from './migrate';

/** Autosave interval in game-clock seconds (stops while paused). */
export const AUTOSAVE_SECONDS = 30;

type Writer = (data: string) => Promise<boolean>;

/**
 * Saves on request (every unlock, on pause) and every 30 seconds of play.
 * Only one save is in flight; requests made meanwhile collapse into one more.
 */
export class SaveManager {
  private sinceSave = 0;
  private inFlight: Promise<void> | null = null;
  private queued = false;

  constructor(
    private readonly state: GameState,
    private readonly write: Writer,
    /** False when loadData failed, so we never overwrite a save we couldn't read. */
    private readonly enabled = true,
    private readonly now: () => number = Date.now,
  ) {}

  /** Call every frame with the game-clock delta. */
  update(dt: number): void {
    this.sinceSave += dt;
    if (this.sinceSave >= AUTOSAVE_SECONDS) void this.saveNow();
  }

  saveNow(): Promise<void> {
    this.sinceSave = 0;
    if (!this.enabled) return Promise.resolve();
    if (this.inFlight) {
      this.queued = true;
      return this.inFlight;
    }
    this.inFlight = this.run().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async run(): Promise<void> {
    do {
      this.queued = false;
      this.state.savedAt = this.now();
      await this.write(serialize(this.state));
    } while (this.queued);
  }
}
