export type Tick = (dt: number) => void;

/** Longest step one frame may take, so a hitch never teleports things. */
const MAX_DT = 0.1;

/** requestAnimationFrame loop that can be stopped and restarted (for pause). */
export class Loop {
  private rafId = 0;
  private last = 0;
  private running = false;
  /** Average milliseconds of JavaScript per frame (game update plus issuing the draw). */
  busyMs = 0;
  /** Frames that threw, and the last error (the debug panel shows them). */
  errors = 0;
  lastError = '';

  constructor(
    private readonly tick: Tick,
    /** Hears of a frame that threw (the game carries on with the next one). */
    private readonly onError: (error: unknown) => void = (error) => console.error(error),
  ) {}

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    const dt = Math.min(Math.max(0, (now - this.last) / 1000), MAX_DT);
    this.last = now;
    // The next frame is asked for first: a frame that throws must not end the loop (it did, and
    // nothing moved again until the player changed towns, which starts a new one).
    this.rafId = requestAnimationFrame(this.frame);
    const start = performance.now();
    try {
      this.tick(dt);
    } catch (error) {
      this.errors++;
      const message = error instanceof Error ? error.message : String(error);
      // The same error every frame is reported once, not sixty times a second.
      if (message !== this.lastError) this.onError(error);
      this.lastError = message;
    }
    this.busyMs += (performance.now() - start - this.busyMs) * 0.1;
  };
}
