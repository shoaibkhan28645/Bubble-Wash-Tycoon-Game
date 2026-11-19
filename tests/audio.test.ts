import { describe, expect, it } from 'vitest';
import AUDIO from '../src/data/audio.json';
import { renderSynth } from '../art/sfx/synth';

const files = Object.keys(import.meta.glob(['../public/audio/*.mp3', '../public/audio/*/*.mp3'])).map((f) => f.replace('../public/audio/', '').replace('.mp3', ''));

describe('sound list', () => {
  it('every sound plays files that exist (and its layer); none is made in code', () => {
    for (const [name, def] of Object.entries(AUDIO.sounds) as [string, { files?: string[]; layer?: string[] }][]) {
      expect(def.files?.length, name).toBeTruthy();
      for (const file of [...(def.files ?? []), ...(def.layer ?? [])]) expect(files, name).toContain(file);
      expect(def, name).not.toHaveProperty('synth');
    }
  });

  it("every town's music and loops have a file that exists", () => {
    for (const [name, track] of Object.entries(AUDIO.tracks) as [string, { file?: string }][]) {
      expect(track.file, name).toBeTruthy();
      expect(files, name).toContain(track.file);
      expect(track, name).not.toHaveProperty('synth');
    }
  });

  it('the game plays only audio files: no sound is synthesised in its code (Playgama rule 3.3.2)', () => {
    const sources = import.meta.glob('../src/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    for (const [path, source] of Object.entries(sources)) {
      expect(source, path).not.toMatch(/createOscillator|copyToChannel|getChannelData|art\/sfx/);
    }
  });
});

describe('sound effects designed in code (art/sfx), shipped as files', () => {
  const synth = renderSynth(8000);

  it('every one is rendered to its mp3 files (node art/sfx/render.mjs)', () => {
    for (const [name, variants] of Object.entries(synth)) {
      variants.forEach((_, i) => expect(files, name).toContain(`sfx/${name}-${i + 1}`));
    }
  });

  it('the loops loop without a click', () => {
    for (const name of ['drone'] as const) {
      const v = synth[name][0]!;
      const jump = Math.abs(v[v.length - 1]! - v[0]!);
      const typical = v.slice(100, 4000).reduce((m, s, i, a) => (i ? Math.max(m, Math.abs(s - a[i - 1]!)) : m), 0);
      expect(jump, name).toBeLessThanOrEqual(typical);
    }
  });

  it('they are clean (no NaN, no clipping, not silent)', () => {
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
  // Each town's own music, written for the game, loaded with the town and played there.
  const games = import.meta.glob('../src/core/*Game.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  const towns = { roadside: 'roadsideGame', farm: 'farmGame', park: 'parkGame', skyport: 'skyportGame' };
  const tracks = AUDIO.tracks as Record<string, { file?: string; set?: string }>;

  for (const [track, game] of Object.entries(towns)) {
    it(`${track}: its own track, loaded with the town and played there`, () => {
      const def = tracks[track]!;
      expect(def.file).toMatch(new RegExp(`^${def.set}/`));
      const source = games[`../src/core/${game}.ts`]!;
      expect(source).toContain(`sound.loadSet('${def.set}')`);
      expect(source).toContain(`sound.useMusic('${track}')`);
      expect(source).toContain('sound.useMusic(null)');
    });
  }

  it('no two towns share a track', () => {
    const files = Object.keys(towns).map((t) => tracks[t]!.file);
    expect(new Set(files).size).toBe(files.length);
  });
});
