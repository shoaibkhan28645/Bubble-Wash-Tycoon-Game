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

  constructor(private readonly tick: Tick) {}

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
    const start = performance.now();
    this.tick(dt);
    this.busyMs += (performance.now() - start - this.busyMs) * 0.1;
    this.rafId = requestAnimationFrame(this.frame);
  };
}
