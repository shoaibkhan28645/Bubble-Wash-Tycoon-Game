/** Seconds of frames averaged before deciding. */
const WINDOW = 3;
/** Ignore the first seconds (shaders still compiling). */
const WARMUP = 4;
const LOW_FPS = 50;
const STEP = 0.15;
const MIN_SCALE = 0.6;

/**
 * Lowers the drawing resolution a step at a time while the frame rate stays
 * low. It never raises it again, so it can't see-saw between two sizes.
 */
export class AdaptiveResolution {
  /** Multiplier on the pixel ratio, 1 = full. */
  scale = 1;
  private frames = 0;
  private time = 0;
  private age = 0;

  constructor(private readonly onChange: (scale: number) => void) {}

  /** Seconds between two drawn frames. */
  tick(dt: number): void {
    // Gaps from pauses or a hidden tab say nothing about speed.
    if (dt <= 0 || dt > 0.25) return;
    this.age += dt;
    if (this.age < WARMUP) return;
    this.frames++;
    this.time += dt;
    if (this.time < WINDOW) return;
    const fps = this.frames / this.time;
    this.frames = 0;
    this.time = 0;
    if (fps >= LOW_FPS || this.scale <= MIN_SCALE) return;
    this.scale = Math.max(MIN_SCALE, Math.round((this.scale - STEP) * 100) / 100);
    this.onChange(this.scale);
  }
}
