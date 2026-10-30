// Sound effects made in code where the CC0 packs have nothing that fits:
// sponge squeaks, water spray, bubble pops, a car horn, a till bell, fuel
// glugging into a tank, the pump's beep and the hero's footsteps.

export type SynthSound = 'squeak' | 'spray' | 'pop' | 'honk' | 'bell' | 'glug' | 'beep' | 'step';

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
  };
}
