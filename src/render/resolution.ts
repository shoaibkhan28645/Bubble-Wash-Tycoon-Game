/** Seconds of frames averaged before deciding. */
const WINDOW = 3;
/** Ignore the first seconds (shaders still compiling). */
const WARMUP = 4;
const LOW_FPS = 50;
/** A step down must win at least this many frames per second to be kept. */
const MIN_GAIN = 4;
const STEP = 0.15;
const MIN_SCALE = 0.6;

/**
 * Lowers the drawing resolution a step at a time while the frame rate stays
 * low. A step that doesn't make the game faster is undone, and then it stops
 * trying: the phone is busy with something else, and a blurrier picture
 * would cost sharpness for nothing. It never steps back up on its own, so it
 * can't see-saw.
 */
export class AdaptiveResolution {
  /** Multiplier on the pixel ratio, 1 = full. */
  scale = 1;
  private frames = 0;
  private time = 0;
  private age = 0;
  /** Frame rate before the last step down, while checking whether it helped. */
  private before: number | null = null;
  private done = false;

  constructor(private readonly onChange: (scale: number) => void) {}

  /** Seconds between two drawn frames. */
  tick(dt: number): void {
    // Gaps from pauses or a hidden tab say nothing about speed.
    if (this.done || dt <= 0 || dt > 0.25) return;
    this.age += dt;
    if (this.age < WARMUP) return;
    this.frames++;
    this.time += dt;
    if (this.time < WINDOW) return;
    const fps = this.frames / this.time;
    this.frames = 0;
    this.time = 0;
    if (this.before !== null) {
      const helped = fps - this.before >= MIN_GAIN;
      this.before = null;
      if (!helped) {
        this.scale = Math.min(1, Math.round((this.scale + STEP) * 100) / 100);
        this.done = true;
        this.onChange(this.scale);
        return;
      }
    }
    if (fps >= LOW_FPS || this.scale <= MIN_SCALE) return;
    this.before = fps;
    this.scale = Math.max(MIN_SCALE, Math.round((this.scale - STEP) * 100) / 100);
    this.onChange(this.scale);
  }
}
