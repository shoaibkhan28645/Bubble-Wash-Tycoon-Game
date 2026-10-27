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

  /** Short bubble pop (placeholder sound until the art pass). */
  pop(): void {
    const context = this.context;
    if (!context || !this.master || !this.audible) return;
    const t = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(1400, t + 0.07);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.13);
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
