// Sound effects made in code where the CC0 packs have nothing that fits:
// sponge squeaks, water spray, bubble pops, a car horn and a till bell.

export type SynthSound = 'squeak' | 'spray' | 'pop' | 'honk' | 'bell';

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

/** Every made-in-code sound, with its variants. */
export function renderSynth(sampleRate: number): Record<SynthSound, Float32Array[]> {
  return {
    squeak: [0, 1, 2].map((v) => squeak(sampleRate, v)),
    spray: [spray(sampleRate)],
    pop: [pop(sampleRate)],
    honk: [honk(sampleRate)],
    bell: [bell(sampleRate)],
  };
}
