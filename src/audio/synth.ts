// Sound effects made in code where the CC0 packs have nothing that fits:
// sponge squeaks, water spray, bubble pops, a car horn, a till bell, fuel
// glugging into a tank, the pump's beep, the hero's footsteps, and the farm's
// animals: a cow's moo and a hen's clucking (a voice through the shapes of a
// mouth, as speech is made).

export type SynthSound = 'squeak' | 'spray' | 'pop' | 'honk' | 'bell' | 'glug' | 'beep' | 'step' | 'moo' | 'cluck';

/** Small seeded random generator, so every run sounds the same. */
function seeded(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function render(sampleRate: number, seconds: number, sample: (t: number, i: number) => number): Float32Array {
  const out = new Float32Array(Math.floor(sampleRate * seconds));
  for (let i = 0; i < out.length; i++) out[i] = sample(i / sampleRate, i);
  return out;
}

/** A wet rubbery squeak: a fast wobbly chirp, slightly different each variant. */
function squeak(sampleRate: number, variant: number): Float32Array {
  const base = 1500 + variant * 260;
  const length = 0.09 + variant * 0.02;
  let phase = 0;
  return render(sampleRate, length, (t) => {
    const u = t / length;
    const freq = base * (1 + 0.5 * Math.sin(Math.PI * u)) + 90 * Math.sin(2 * Math.PI * 38 * t);
    phase += (2 * Math.PI * freq) / sampleRate;
    const env = Math.sin(Math.PI * u) ** 1.5;
    return Math.sin(phase + 0.6 * Math.sin(phase * 2)) * env * 0.6;
  });
}

/** A short hose burst: band-limited noise that swells and settles. */
function spray(sampleRate: number): Float32Array {
  const rand = seeded(7);
  let low = 0;
  let lower = 0;
  return render(sampleRate, 0.55, (t) => {
    const noise = rand() * 2 - 1;
    // Two simple filters: keep the hiss band of running water.
    low += 0.35 * (noise - low);
    lower += 0.06 * (low - lower);
    const band = low - lower;
    const env = Math.min(1, t / 0.06) * Math.exp(-t * 3) * (1 + 0.15 * Math.sin(2 * Math.PI * 23 * t));
    return band * env * 1.4;
  });
}

/** A soap bubble popping: a tiny falling blip. */
function pop(sampleRate: number): Float32Array {
  let phase = 0;
  return render(sampleRate, 0.06, (t) => {
    const freq = 1100 * Math.exp(-t * 30) + 300;
    phase += (2 * Math.PI * freq) / sampleRate;
    return Math.sin(phase) * Math.exp(-t * 60) * 0.7;
  });
}

/** Two honks of a little car horn (two notes a third apart, a bit buzzy). */
function honk(sampleRate: number): Float32Array {
  const voice = (t: number, f: number) => Math.tanh(3 * Math.sin(2 * Math.PI * f * t)) * 0.5;
  return render(sampleRate, 0.5, (t) => {
    const on = (t < 0.16 ? 1 : 0) + (t > 0.22 && t < 0.46 ? 1 : 0);
    const edge = Math.min(1, (t % 0.22) / 0.01);
    return (voice(t, 415) + voice(t, 523)) * 0.45 * on * edge;
  });
}

/** The "ching" of a till: a bright bell with a few inharmonic partials. */
function bell(sampleRate: number): Float32Array {
  const partials: [number, number, number][] = [
    [2637, 1, 5],
    [3951, 0.55, 7],
    [5274, 0.35, 9],
    [6644, 0.2, 12],
  ];
  return render(sampleRate, 0.7, (t) => {
    let v = 0;
    for (const [f, a, d] of partials) v += Math.sin(2 * Math.PI * f * t) * a * Math.exp(-t * d);
    return v * Math.min(1, t / 0.002) * 0.4;
  });
}

/** Fuel running into a tank: three low gulps, each a falling bubbly blip over a soft rush. */
function glug(sampleRate: number, variant: number): Float32Array {
  const rand = seeded(11 + variant);
  let phase = 0;
  let low = 0;
  const gulps = [0, 0.11, 0.21].map((at, i) => [at, 210 + variant * 25 - i * 18] as const);
  return render(sampleRate, 0.34, (t) => {
    low += 0.08 * (rand() * 2 - 1 - low);
    let freq = 160;
    let env = 0;
    for (const [at, f] of gulps) {
      const u = t - at;
      if (u < 0 || u > 0.1) continue;
      freq = f * (1 - u * 2.4);
      env = Math.sin((Math.PI * u) / 0.1);
    }
    phase += (2 * Math.PI * freq) / sampleRate;
    return Math.sin(phase) * env * 0.55 + low * 0.5 * Math.min(1, t / 0.03) * Math.exp(-t * 4);
  });
}

/** The pump's "done" beep: two quick tones from a little digital display. */
function beep(sampleRate: number): Float32Array {
  return render(sampleRate, 0.26, (t) => {
    const freq = t < 0.1 ? 1320 : 1760;
    const u = t < 0.1 ? t : t - 0.13;
    const on = u >= 0 && u < 0.1 ? Math.min(1, u / 0.005, (0.1 - u) / 0.01) : 0;
    // Softened square: a pure sine sounds too sweet for a machine.
    return Math.tanh(2.5 * Math.sin(2 * Math.PI * freq * t)) * on * 0.35;
  });
}

/** A rubber boot landing on wet paving: a soft low thud with a short, dull scuff. */
function step(sampleRate: number, variant: number): Float32Array {
  const rand = seeded(31 + variant);
  const pitch = 92 + variant * 13;
  let low = 0;
  let phase = 0;
  return render(sampleRate, 0.1, (t) => {
    low += 0.16 * (rand() * 2 - 1 - low);
    const scuff = low * Math.exp(-t * 60) * 1.8;
    phase += (2 * Math.PI * pitch * (1 - t * 2.5)) / sampleRate;
    const thud = Math.sin(phase) * Math.exp(-t * 42) * Math.min(1, t / 0.002);
    return (thud * 0.8 + scuff) * 0.7;
  });
}

/** A band-pass filter (a mouth's resonance): its centre and sharpness can glide as it plays. */
class Formant {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  private b0 = 0;
  private a1 = 0;
  private a2 = 0;
  private b2 = 0;

  constructor(private readonly sampleRate: number) {}

  tune(freq: number, q: number): void {
    const w = (2 * Math.PI * freq) / this.sampleRate;
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    this.b0 = alpha / a0;
    this.b2 = -alpha / a0;
    this.a1 = (-2 * Math.cos(w)) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  next(x: number): number {
    const y = this.b0 * x + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** Scales a sound so its loudest moment sits at `peak`. */
function normalise(out: Float32Array, peak: number): Float32Array {
  let max = 0;
  for (const v of out) max = Math.max(max, Math.abs(v));
  if (max > 0) for (let i = 0; i < out.length; i++) out[i] = (out[i]! / max) * peak;
  return out;
}

/** Smooth 0 → 1 over 0..1. */
const ease = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/**
 * A cow's moo: a low, buzzy voice through the mouth, from a closed "mmm"
 * opening to "ooo" and closing again, its pitch rising and falling, with a
 * slow wobble. Each variant a different cow.
 */
function moo(sampleRate: number, variant: number): Float32Array {
  const rand = seeded(41 + variant);
  const length = 1.15 + variant * 0.17;
  const base = 96 - variant * 9;
  const mouth = [new Formant(sampleRate), new Formant(sampleRate), new Formant(sampleRate)];
  let phase = 0;
  let soft = 0;
  return normalise(
    render(sampleRate, length, (t, i) => {
      const u = t / length;
      // Up as it opens its mouth, then down and away.
      const rise = Math.sin(Math.PI * Math.min(1, u / 0.62)) * 0.38 - ease((u - 0.55) / 0.45) * 0.12;
      const f0 = base * (1 + rise) * (1 + 0.015 * Math.sin(2 * Math.PI * 5.2 * t));
      phase = (phase + f0 / sampleRate) % 1;
      // A buzzy voice (a sawtooth), softened, with a little breath.
      soft += 0.35 * (phase * 2 - 1 - soft);
      const voice = soft + (rand() * 2 - 1) * 0.05;
      const open = ease(u / 0.3) * (1 - 0.6 * ease((u - 0.7) / 0.3));
      if (i % 32 === 0) {
        mouth[0]!.tune(240 + 300 * open, 4);
        mouth[1]!.tune(650 + 350 * open, 6);
        mouth[2]!.tune(2300, 8);
      }
      const shaped = mouth[0]!.next(voice) * 1.0 + mouth[1]!.next(voice) * 0.55 + mouth[2]!.next(voice) * 0.12;
      const env = ease(t / 0.16) * (1 - ease((u - 0.72) / 0.28));
      return shaped * env * (0.55 + 0.45 * open);
    }),
    0.75,
  );
}

/**
 * A hen's clucking: a few short bright "buk"s, each with a little click and a
 * pitch that drops, sometimes ending on a long squawk ("b'gawk").
 */
function cluck(sampleRate: number, variant: number): Float32Array {
  const rand = seeded(53 + variant);
  const patterns: { at: number; bok: boolean }[][] = [
    [
      { at: 0, bok: true },
      { at: 0.15, bok: true },
      { at: 0.28, bok: true },
      { at: 0.43, bok: false },
    ],
    [
      { at: 0, bok: true },
      { at: 0.17, bok: true },
      { at: 0.31, bok: true },
    ],
    [
      { at: 0, bok: true },
      { at: 0.13, bok: true },
      { at: 0.3, bok: false },
    ],
  ];
  const calls = patterns[variant % patterns.length]!;
  const last = calls[calls.length - 1]!;
  const length = last.at + (last.bok ? 0.12 : 0.32);
  const mouth = [new Formant(sampleRate), new Formant(sampleRate)];
  mouth[0]!.tune(850, 3);
  mouth[1]!.tune(1900, 5);
  let phase = 0;
  const pitch = 1 + variant * 0.06;
  return normalise(
    render(sampleRate, length, (t) => {
      let f0 = 0;
      let env = 0;
      let drive = 1.5;
      let click = 0;
      for (const call of calls) {
        const v = t - call.at;
        if (call.bok) {
          if (v < 0 || v > 0.1) continue;
          f0 = (430 - 1300 * v) * pitch;
          env = Math.min(1, v / 0.004) * Math.exp(-v / 0.028);
          click = v < 0.006 ? (rand() * 2 - 1) * (1 - v / 0.006) : 0;
        } else {
          if (v < 0 || v > 0.3) continue;
          // The squawk: up, held, and down a little; harsher.
          f0 = (520 + 340 * ease(v / 0.1) - 160 * ease((v - 0.18) / 0.12)) * pitch;
          env = Math.min(1, v / 0.012) * (1 - ease((v - 0.22) / 0.08));
          drive = 3;
        }
      }
      if (env > 0) phase = (phase + f0 / sampleRate) % 1;
      const voice = env > 0 ? (Math.tanh(drive * Math.sin(2 * Math.PI * phase)) + (phase * 2 - 1) * 0.4) * env : 0;
      // The click goes through the mouth too (a "k", not a hiss), and the mouth rings on a moment after each call.
      const input = voice + click * 0.8;
      return mouth[0]!.next(input) + mouth[1]!.next(input) * 0.7;
    }),
    0.7,
  );
}

/** Every made-in-code sound, with its variants. */
export function renderSynth(sampleRate: number): Record<SynthSound, Float32Array[]> {
  return {
    squeak: [0, 1, 2].map((v) => squeak(sampleRate, v)),
    spray: [spray(sampleRate)],
    pop: [pop(sampleRate)],
    honk: [honk(sampleRate)],
    bell: [bell(sampleRate)],
    glug: [0, 1].map((v) => glug(sampleRate, v)),
    beep: [beep(sampleRate)],
    step: [0, 1, 2, 3].map((v) => step(sampleRate, v)),
    moo: [0, 1, 2].map((v) => moo(sampleRate, v)),
    cluck: [0, 1, 2].map((v) => cluck(sampleRate, v)),
  };
}
