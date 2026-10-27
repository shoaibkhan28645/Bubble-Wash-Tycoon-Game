import { Emitter } from './events';

/**
 * Pause state for the whole game. YouTube's onPause/onResume drive it; the
 * loop, audio, input and saving listen to it.
 */
export class Lifecycle {
  private isPaused = false;
  private readonly pauseEvents = new Emitter();
  private readonly resumeEvents = new Emitter();

  get paused(): boolean {
    return this.isPaused;
  }

  onPause(listener: () => void): () => void {
    return this.pauseEvents.on(listener);
  }

  onResume(listener: () => void): () => void {
    return this.resumeEvents.on(listener);
  }

  pause(): void {
    if (this.isPaused) return;
    this.isPaused = true;
    this.pauseEvents.emit();
  }

  resume(): void {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.resumeEvents.emit();
  }
}
