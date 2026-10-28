// The background music (GDD: "a light, upbeat ukulele loop"), made in code:
// strummed ukulele chords (Karplus-Strong plucked strings), a soft bass, a
// shaker, and a marimba tune in the second half. Rendered once into a
// seamless loop, so it costs no download.

const BPM = 104;
const BEATS_PER_BAR = 4;

/** Ukulele chord shapes (GCEA tuning) as MIDI notes, low string first. */
const CHORDS: Record<string, number[]> = {
  C: [67, 60, 64, 72],
  Am: [69, 60, 64, 69],
  F: [69, 60, 65, 69],
  G: [67, 62, 67, 71],
  Em: [67, 64, 67, 71],
};
/** Bass roots kept around 110–200 Hz: phone speakers can't play much lower. */
const BASS: Record<string, number> = { C: 48, Am: 45, F: 53, G: 55, Em: 52 };

/** 16 bars: a verse twice, then a lift with the melody. */
const PROGRESSION = ['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G', 'F', 'G', 'Em', 'Am', 'F', 'G', 'C', 'G'];

/** Strum pattern per bar: beat, down (true) or up, loudness. "D . D U . U D U" */
const STRUM: [number, boolean, number][] = [
  [0, true, 1],
  [1, true, 0.75],
  [1.5, false, 0.5],
  [2.5, false, 0.55],
  [3, true, 0.8],
  [3.5, false, 0.5],
];

/** Marimba tune for bars 9–16: [bar, beat, MIDI note, beats long], in C major over the chords. */
const MELODY: [number, number, number, number][] = [
  [8, 0, 81, 1], [8, 1, 79, 0.5], [8, 1.5, 76, 0.5], [8, 2, 77, 1], [8, 3, 76, 1],
  [9, 0, 74, 1.5], [9, 1.5, 76, 0.5], [9, 2, 79, 2],
  [10, 0, 79, 1], [10, 1, 76, 0.5], [10, 1.5, 74, 0.5], [10, 2, 71, 1], [10, 3, 74, 1],
  [11, 0, 76, 3], [11, 3, 72, 1],
  [12, 0, 81, 1], [12, 1, 79, 0.5], [12, 1.5, 76, 0.5], [12, 2, 77, 1], [12, 3, 81, 1],
  [13, 0, 79, 1.5], [13, 1.5, 76, 0.5], [13, 2, 74, 2],
  [14, 0, 72, 1], [14, 1, 76, 1], [14, 2, 79, 1], [14, 3, 84, 1],
  [15, 0, 83, 2], [15, 2, 79, 2],
];

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Small seeded random generator so the music is the same every time. */
function seeded(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/**
 * One plucked nylon string (Karplus-Strong): a burst of soft noise in a
 * delay line, averaged each pass so it mellows and fades like a real string.
 */
function pluck(freq: number, sampleRate: number, seconds: number, rand: () => number): Float32Array {
  const out = new Float32Array(Math.floor(sampleRate * seconds));
  const period = Math.max(2, Math.round(sampleRate / freq));
  const line = new Float32Array(period);
  // Softened noise: a nylon string, not a steel one.
  let last = 0;
  for (let i = 0; i < period; i++) {
    last = last * 0.5 + (rand() * 2 - 1) * 0.5;
    line[i] = last;
  }
  const decay = 0.994;
  let index = 0;
  for (let i = 0; i < out.length; i++) {
    const next = (index + 1) % period;
    const value = line[index]!;
    line[index] = (value + line[next]!) * 0.5 * decay;
    out[i] = value;
    index = next;
  }
  // Fade the tail so a cut-off never clicks.
  const fade = Math.min(out.length, Math.floor(sampleRate * 0.08));
  for (let i = 0; i < fade; i++) out[out.length - 1 - i]! *= i / fade;
  return out;
}

/** Renders the whole loop as mono samples (seamless: the tails wrap round to the start). */
export function renderMusic(sampleRate: number): Float32Array {
  const beat = 60 / BPM;
  const bar = beat * BEATS_PER_BAR;
  const total = Math.round(PROGRESSION.length * bar * sampleRate);
  const mix = new Float32Array(total);
  const rand = seeded(42);
  const add = (start: number, sound: Float32Array, gain: number) => {
    const at = Math.round(start * sampleRate) % total;
    // Up to the end of the loop, then the rest wraps round to the start.
    const first = Math.min(sound.length, total - at);
    for (let i = 0; i < first; i++) mix[at + i]! += sound[i]! * gain;
    for (let i = first; i < sound.length; i++) mix[i - first]! += sound[i]! * gain;
  };

  // Notes are rendered once and reused wherever they repeat, which keeps this quick.
  const cache = new Map<string, Float32Array>();
  const once = (key: string, make: () => Float32Array) => {
    let sound = cache.get(key);
    if (!sound) {
      sound = make();
      cache.set(key, sound);
    }
    return sound;
  };
  const plucks = new Map<number, Float32Array>();
  const stringOf = (midi: number) => {
    let sound = plucks.get(midi);
    if (!sound) {
      sound = pluck(hz(midi), sampleRate, 0.9, rand);
      plucks.set(midi, sound);
    }
    return sound;
  };

  PROGRESSION.forEach((name, barIndex) => {
    const notes = CHORDS[name]!;
    const barStart = barIndex * bar;
    // Ukulele strums: down strokes go low to high, up strokes high to low.
    for (const [at, down, loud] of STRUM) {
      const order = down ? notes : [...notes].reverse();
      order.forEach((midi, i) => add(barStart + at * beat + i * (down ? 0.012 : 0.009), stringOf(midi), 0.16 * loud));
    }
    // Bass on beats 1 and 3 (the fifth on 3), a warm plucked sine.
    const root = BASS[name]!;
    // The fifth on beat 3 goes below the root when the root is already high.
    const fifth = root + 7 > 57 ? root - 5 : root + 7;
    add(barStart, once(`b${root}`, () => bassNote(hz(root), sampleRate, beat * 1.8)), 0.2);
    add(barStart + 2 * beat, once(`b${fifth}`, () => bassNote(hz(fifth), sampleRate, beat * 1.8)), 0.16);
    // Shaker on every eighth, a little louder off the beat (four takes, so it isn't robotic).
    for (let e = 0; e < 8; e++) add(barStart + e * beat * 0.5, once(`s${(barIndex + e) % 4}`, () => shaker(sampleRate, rand)), e % 2 ? 0.05 : 0.03);
  });

  for (const [barIndex, at, midi, length] of MELODY) {
    add(barIndex * bar + at * beat, once(`m${midi}:${length}`, () => marimba(hz(midi), sampleRate, length * beat)), 0.16);
  }

  // Leave headroom: the game's sound effects play on top.
  let peak = 0;
  for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(mix[i]!));
  const gain = peak > 0 ? 0.8 / peak : 1;
  for (let i = 0; i < total; i++) mix[i]! *= gain;
  return mix;
}

function bassNote(freq: number, sampleRate: number, seconds: number): Float32Array {
  const out = new Float32Array(Math.floor(sampleRate * seconds));
  for (let i = 0; i < out.length; i++) {
    const t = i / sampleRate;
    const env = Math.min(1, t / 0.01) * Math.exp(-t * 3.5);
    // A touch of the octave so it's heard on phone speakers.
    out[i] = (Math.sin(2 * Math.PI * freq * t) + 0.35 * Math.sin(4 * Math.PI * freq * t)) * env;
  }
  return out;
}

function marimba(freq: number, sampleRate: number, seconds: number): Float32Array {
  const out = new Float32Array(Math.floor(sampleRate * Math.min(1.2, seconds + 0.4)));
  for (let i = 0; i < out.length; i++) {
    const t = i / sampleRate;
    const env = Math.min(1, t / 0.004) * Math.exp(-t * 6);
    out[i] = (Math.sin(2 * Math.PI * freq * t) + 0.25 * Math.sin(2 * Math.PI * freq * 4 * t) * Math.exp(-t * 20)) * env;
  }
  return out;
}

function shaker(sampleRate: number, rand: () => number): Float32Array {
  const out = new Float32Array(Math.floor(sampleRate * 0.05));
  let prev = 0;
  for (let i = 0; i < out.length; i++) {
    const noise = rand() * 2 - 1;
    // High-pass: the difference of neighbouring samples keeps only the hiss.
    const hiss = noise - prev;
    prev = noise;
    const t = i / out.length;
    out[i] = hiss * (t < 0.15 ? t / 0.15 : (1 - t) ** 2);
  }
  return out;
}
