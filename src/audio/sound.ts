import { FileLoader } from 'three';
import AUDIO from '../data/audio.json';
import { renderMusic } from './music';
import { renderSynth, type SynthSound } from './synth';

export type Sfx = keyof typeof AUDIO.sounds;

interface SoundDef {
  files?: string[];
  synth?: string;
  volume: number;
  gap: number;
  duck?: boolean;
}

/** Never more than this many effects at once (a busy lot can't turn into noise). */
const MAX_VOICES = 16;
/** Pitch wobble on repeated effects, so a hundred coins don't sound identical. */
const VARIETY = 0.08;
const SOUNDS = AUDIO.sounds as Record<Sfx, SoundDef>;

/**
 * Web Audio: CC0 samples (public/audio), effects and music made in code.
 * Silent whenever YouTube mutes or pauses the game: the AudioContext is
 * suspended, so nothing can leak through.
 */
export class SoundManager {
  private context: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private readonly files = new Map<string, AudioBuffer>();
  private synth: Partial<Record<SynthSound, AudioBuffer[]>> = {};
  private music: AudioBuffer | null = null;
  private musicStarted = false;
  private readonly lastPlayed = new Map<Sfx, number>();
  private voices = 0;
  private enabled = true;
  private paused = false;
  private unlocked = false;

  /**
   * Loads and decodes every sound, and renders the music, during the loading
   * screen. The context stays suspended until the first tap. Never throws:
   * the game simply plays silently if audio isn't available.
   */
  async load(onProgress: (fraction: number) => void = () => {}): Promise<void> {
    let context: AudioContext;
    try {
      context = new AudioContext();
    } catch {
      return;
    }
    this.context = context;
    this.sfxGain = context.createGain();
    this.sfxGain.gain.value = AUDIO.sfxVolume;
    this.sfxGain.connect(context.destination);
    this.musicGain = context.createGain();
    this.musicGain.gain.value = AUDIO.music.volume;
    this.musicGain.connect(context.destination);

    const names = [...new Set(Object.values(SOUNDS).flatMap((s) => s.files ?? []))];
    // Bundled files only, loaded the same way as the models.
    const loader = new FileLoader().setResponseType('arraybuffer');
    let done = 0;
    await Promise.all(
      names.map(async (name) => {
        try {
          const data = (await loader.loadAsync(`${import.meta.env.BASE_URL}audio/${name}.mp3`)) as ArrayBuffer;
          this.files.set(name, await context.decodeAudioData(data));
        } catch {
          // A missing sound stays silent; the game carries on.
        }
        onProgress(++done / (names.length + 1));
      }),
    );
    const rate = AUDIO.music.sampleRate;
    for (const [name, variants] of Object.entries(renderSynth(context.sampleRate))) {
      this.synth[name as SynthSound] = variants.map((samples) => this.toBuffer(samples, context.sampleRate));
    }
    this.music = this.toBuffer(renderMusic(rate), rate);
    onProgress(1);
    this.apply();
  }

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
    this.unlocked = true;
    this.apply();
  }

  play(name: Sfx): void {
    const context = this.context;
    const out = this.sfxGain;
    if (!context || !out || !this.audible || context.state !== 'running' || this.voices >= MAX_VOICES) return;
    const def = SOUNDS[name];
    const now = context.currentTime;
    if (now - (this.lastPlayed.get(name) ?? -Infinity) < def.gap) return;
    this.lastPlayed.set(name, now);

    // Samples and made-in-code layers both play (the till: a clack and a bell).
    const layers: AudioBuffer[] = [];
    const file = def.files?.[Math.floor(Math.random() * def.files.length)];
    const fileBuffer = file ? this.files.get(file) : undefined;
    if (fileBuffer) layers.push(fileBuffer);
    const variants = def.synth ? this.synth[def.synth as SynthSound] : undefined;
    if (variants?.length) layers.push(variants[Math.floor(Math.random() * variants.length)]!);
    const rate = def.duck ? 1 : 1 + (Math.random() - 0.5) * VARIETY;
    for (const buffer of layers) {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = rate;
      const gain = context.createGain();
      gain.gain.value = def.volume;
      source.connect(gain).connect(out);
      this.voices++;
      source.onended = () => {
        this.voices--;
        gain.disconnect();
      };
      source.start();
    }
    // Jingles: the music steps back while they play.
    if (def.duck && fileBuffer && this.musicGain) {
      const g = this.musicGain.gain;
      g.cancelScheduledValues(now);
      g.setTargetAtTime(AUDIO.music.duckVolume, now, 0.05);
      g.setTargetAtTime(AUDIO.music.volume, now + fileBuffer.duration, 0.3);
    }
  }

  /** How many sound files decoded (for the dev console and tests). */
  get loadedFiles(): number {
    return this.files.size;
  }

  private toBuffer(samples: Float32Array, sampleRate: number): AudioBuffer {
    const buffer = this.context!.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
    return buffer;
  }

  /** The music loop starts with the first tap and then just loops. */
  private startMusic(): void {
    if (this.musicStarted || !this.music || !this.context || !this.musicGain) return;
    this.musicStarted = true;
    const source = this.context.createBufferSource();
    source.buffer = this.music;
    source.loop = true;
    source.connect(this.musicGain);
    source.start();
  }

  private get audible(): boolean {
    return this.enabled && !this.paused;
  }

  private apply(): void {
    const context = this.context;
    if (!context) return;
    if (!this.audible) void context.suspend().catch(() => {});
    else if (this.unlocked) {
      void context.resume().catch(() => {});
      this.startMusic();
    }
  }
}
