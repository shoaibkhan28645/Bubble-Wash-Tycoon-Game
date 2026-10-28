import type { SoundManager } from './sound';

/** While the player scrubs: sponge squeaks with the odd bubble pop, and a hose spray now and then. */
export class WashSounds {
  private squeakIn = 0;
  private sprayIn = 0;

  constructor(private readonly sound: SoundManager) {}

  update(dt: number, scrubbing: boolean): void {
    if (!scrubbing) {
      this.squeakIn = 0;
      this.sprayIn = 0.3;
      return;
    }
    this.squeakIn -= dt;
    if (this.squeakIn <= 0) {
      this.sound.play(Math.random() < 0.3 ? 'pop' : 'squeak');
      this.squeakIn = 0.18 + Math.random() * 0.22;
    }
    this.sprayIn -= dt;
    if (this.sprayIn <= 0) {
      this.sound.play('spray');
      this.sprayIn = 1.1 + Math.random() * 0.6;
    }
  }
}
