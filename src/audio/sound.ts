export type Sfx = 'scrub' | 'done' | 'coin' | 'drain' | 'build' | 'honk' | 'pick' | 'drop';

interface Tone {
  type: OscillatorType;
  from: number;
  to: number;
  delay: number;
  length: number;
  volume: number;
}

/** Placeholder sounds made from simple tones; replaced with real effects in the art pass. */
const RECIPES: Record<Sfx, Tone[]> = {
  scrub: [{ type: 'triangle', from: 900, to: 1500, delay: 0, length: 0.06, volume: 0.08 }],
  done: [
    { type: 'sine', from: 880, to: 880, delay: 0, length: 0.12, volume: 0.25 },
    { type: 'sine', from: 1320, to: 1320, delay: 0.09, length: 0.2, volume: 0.25 },
  ],
  coin: [
    { type: 'square', from: 990, to: 990, delay: 0, length: 0.06, volume: 0.1 },
    { type: 'square', from: 1480, to: 1480, delay: 0.06, length: 0.14, volume: 0.1 },
  ],
  drain: [{ type: 'sine', from: 600, to: 760, delay: 0, length: 0.05, volume: 0.1 }],
  honk: [
    { type: 'square', from: 330, to: 330, delay: 0, length: 0.16, volume: 0.12 },
    { type: 'square', from: 392, to: 392, delay: 0, length: 0.16, volume: 0.08 },
    { type: 'square', from: 330, to: 330, delay: 0.22, length: 0.24, volume: 0.12 },
  ],
  pick: [{ type: 'sine', from: 700, to: 1050, delay: 0, length: 0.07, volume: 0.12 }],
  drop: [{ type: 'sine', from: 1050, to: 620, delay: 0, length: 0.08, volume: 0.12 }],
  build: [
    { type: 'triangle', from: 523, to: 523, delay: 0, length: 0.12, volume: 0.25 },
    { type: 'triangle', from: 659, to: 659, delay: 0.1, length: 0.12, volume: 0.25 },
    { type: 'triangle', from: 784, to: 784, delay: 0.2, length: 0.12, volume: 0.25 },
    { type: 'triangle', from: 1047, to: 1047, delay: 0.3, length: 0.3, volume: 0.25 },
  ],
};

/**
 * Web Audio sound manager. Silent whenever YouTube mutes or pauses the game:
 * the AudioContext is suspended, so nothing can leak through.
 */
export class SoundManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;
  private paused = false;

  /** Follows ytgame.system.isAudioEnabled / onAudioEnabledChange. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.apply();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.apply();
  }

  /** Browsers only allow audio after a tap or key press; call from those handlers. */
  unlock(): void {
    if (!this.context) {
      const context = new AudioContext();
      this.master = context.createGain();
      this.master.connect(context.destination);
      this.context = context;
    }
    this.apply();
  }

  play(name: Sfx): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master || !this.audible || context.state !== 'running') return;
    const now = context.currentTime;
    for (const tone of RECIPES[name]) {
      const t = now + tone.delay;
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = tone.type;
      osc.frequency.setValueAtTime(tone.from, t);
      if (tone.to !== tone.from) osc.frequency.exponentialRampToValueAtTime(tone.to, t + tone.length);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(tone.volume, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + tone.length);
      osc.connect(gain).connect(master);
      osc.start(t);
      osc.stop(t + tone.length + 0.02);
    }
  }

  private get audible(): boolean {
    return this.enabled && !this.paused;
  }

  private apply(): void {
    const context = this.context;
    if (!context) return;
    if (this.audible) void context.resume().catch(() => {});
    else void context.suspend().catch(() => {});
  }
}
