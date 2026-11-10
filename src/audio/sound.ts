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
  /** Loaded with its town (loadSet), not during the first loading screen. */
  set?: string;
}

/** A recorded loop: a town's music, or a place's sound (the carousel's music box, the rain). */
interface TrackDef {
  file: string;
  volume: number;
  set?: string;
}
const TRACKS = (AUDIO as { tracks?: Record<string, TrackDef> }).tracks ?? {};

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
  /** The music playing (its own gain, to fade it out when the town changes), and which: a recorded track, or null for the made-in-code loop. */
  private musicSource: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private musicTrack: string | null = null;
  /** Recorded loops playing now, each at its own level. */
  private readonly loops = new Map<string, { source: AudioBufferSourceNode; gain: GainNode }>();
  private readonly sets = new Set<string>();
  private readonly lastPlayed = new Map<Sfx, number>();
  private voices = 0;
  private enabled = true;
  private paused = false;
  private unlocked = false;

  /**
   * Loads and decodes every sound during the loading screen (the music is
   * made later, by prepareMusic). The context stays suspended until the first tap. Never throws:
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

    const names = [...new Set(Object.values(SOUNDS).flatMap((s) => (s.set ? [] : (s.files ?? []))))];
    let done = 0;
    await this.loadFiles(names, () => onProgress(++done / (names.length + 1)));
    for (const [name, variants] of Object.entries(renderSynth(context.sampleRate))) {
      this.synth[name as SynthSound] = variants.map((samples) => this.toBuffer(samples, context.sampleRate));
    }
    onProgress(1);
    this.apply();
  }

  /** A town's own sounds and music (the park's), loaded when the hero gets there. Never throws. */
  async loadSet(set: string): Promise<void> {
    if (!this.context || this.sets.has(set)) return;
    this.sets.add(set);
    const sounds = Object.values(SOUNDS).flatMap((s) => (s.set === set ? (s.files ?? []) : []));
    const tracks = Object.values(TRACKS).flatMap((t) => (t.set === set ? [t.file] : []));
    await this.loadFiles([...new Set([...sounds, ...tracks])]);
    // The town's music may have been waiting for its file.
    this.apply();
  }

  private async loadFiles(names: readonly string[], onEach: () => void = () => {}): Promise<void> {
    const context = this.context;
    if (!context) return;
    // Bundled files only, loaded the same way as the models.
    const loader = new FileLoader().setResponseType('arraybuffer');
    await Promise.all(
      names.map(async (name) => {
        try {
          if (!this.files.has(name)) {
            const data = (await loader.loadAsync(`${import.meta.env.BASE_URL}audio/${name}.mp3`)) as ArrayBuffer;
            this.files.set(name, await context.decodeAudioData(data));
          }
        } catch {
          // A missing sound stays silent; the game carries on.
        }
        onEach();
      }),
    );
  }

  /**
   * Which music plays: a recorded track (audio.json `tracks`, once loaded), or
   * null for the made-in-code loop. The old music fades out as the new starts.
   */
  useMusic(track: string | null): void {
    if (track === this.musicTrack) return;
    this.musicTrack = track;
    const old = this.musicSource;
    this.musicSource = null;
    if (old && this.context) {
      const now = this.context.currentTime;
      old.gain.gain.setTargetAtTime(0, now, 0.25);
      old.source.stop(now + 1.2);
    }
    this.apply();
  }

  /**
   * A recorded loop playing at `level` (0..1) of its volume: the carousel's
   * music box louder the nearer the hero is, the rain in a storm. It starts
   * the first time it's wanted and fades between levels.
   */
  loop(track: string, level: number): void {
    const context = this.context;
    const def = TRACKS[track];
    const buffer = def ? this.files.get(def.file) : undefined;
    if (!context || !def || !buffer || !this.sfxGain) return;
    let playing = this.loops.get(track);
    if (!playing) {
      if (level <= 0.01) return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const gain = context.createGain();
      gain.gain.value = 0;
      source.connect(gain).connect(this.sfxGain);
      source.start();
      playing = { source, gain };
      this.loops.set(track, playing);
    }
    playing.gain.gain.setTargetAtTime(def.volume * Math.max(0, Math.min(1, level)), context.currentTime, 0.3);
  }

  /** Stops every recorded loop (leaving a town). */
  stopLoops(): void {
    for (const { source, gain } of this.loops.values()) {
      source.stop();
      gain.disconnect();
    }
    this.loops.clear();
  }

  /** Renders the music loop; called just after the game is playable so it doesn't delay the start. */
  prepareMusic(): void {
    if (this.music || !this.context) return;
    const rate = AUDIO.music.sampleRate;
    this.music = this.toBuffer(renderMusic(rate), rate);
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

  /** Plays an effect; `level` (0..1) quietens one far from the hero. */
  play(name: Sfx, level = 1): void {
    const context = this.context;
    const out = this.sfxGain;
    if (!context || !out || !this.audible || context.state !== 'running' || this.voices >= MAX_VOICES || level < 0.05) return;
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
      gain.gain.value = def.volume * Math.min(1, level);
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

  /** The music starts with the first tap and then just loops (the town's track once it has loaded). */
  private startMusic(): void {
    if (this.musicSource || !this.context || !this.musicGain) return;
    const track = this.musicTrack ? TRACKS[this.musicTrack] : undefined;
    const buffer = track ? this.files.get(track.file) : this.music;
    if (!buffer) return;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = this.context.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(track?.volume ?? 1, this.context.currentTime, 0.2);
    source.connect(gain).connect(this.musicGain);
    source.start();
    this.musicSource = { source, gain };
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
