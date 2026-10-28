import { describe, expect, it } from 'vitest';
import AUDIO from '../src/data/audio.json';
import { renderMusic } from '../src/audio/music';
import { renderSynth } from '../src/audio/synth';

const files = Object.keys(import.meta.glob('../public/audio/*.mp3')).map((f) => f.replace('../public/audio/', '').replace('.mp3', ''));

describe('sound list', () => {
  const synth = renderSynth(8000);
  it('every sound has a file that exists or a made-in-code sound', () => {
    for (const [name, def] of Object.entries(AUDIO.sounds) as [string, { files?: string[]; synth?: string }][]) {
      expect(def.files?.length || def.synth, name).toBeTruthy();
      for (const file of def.files ?? []) expect(files, name).toContain(file);
      if (def.synth) expect(Object.keys(synth), name).toContain(def.synth);
    }
  });

  it('made-in-code sounds are clean (no NaN, no clipping, not silent)', () => {
    for (const [name, variants] of Object.entries(synth)) {
      for (const v of variants) {
        const peak = v.reduce((m, s) => Math.max(m, Math.abs(s)), 0);
        expect(Number.isFinite(peak), name).toBe(true);
        expect(peak, name).toBeGreaterThan(0.05);
        expect(peak, name).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('music', () => {
  const rate = 8000;
  const music = renderMusic(rate);

  it('is a loop of 16 bars at 104 BPM, with headroom', () => {
    expect(music.length / rate).toBeCloseTo((16 * 4 * 60) / 104, 1);
    const peak = music.reduce((m, s) => Math.max(m, Math.abs(s)), 0);
    expect(peak).toBeCloseTo(0.8, 2);
    expect(music.every(Number.isFinite)).toBe(true);
  });

  it('loops without a click: the end flows into the start', () => {
    const jump = Math.abs(music[music.length - 1]! - music[0]!);
    const typical = music.slice(1000, 5000).reduce((m, s, i, a) => (i ? Math.max(m, Math.abs(s - a[i - 1]!)) : m), 0);
    expect(jump).toBeLessThanOrEqual(typical);
  });
});
