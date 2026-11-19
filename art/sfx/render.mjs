// Renders the sound effects designed in code (art/sfx/synth.ts) to the mp3
// files the game plays: public/audio/sfx/<name>-<variant>.mp3, mono 44.1 kHz,
// the same as the game's other effects. Run after changing synth.ts:
//   node art/sfx/render.mjs
// Needs ffmpeg (with libmp3lame) on the PATH.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const RATE = 44100;
const OUT = 'public/audio/sfx';
/** Loops (the airport's engine drone) get a little more bitrate: they play for minutes. */
const LOOPS = new Set(['drone']);

const temp = mkdtempSync(join(tmpdir(), 'sfx-'));
try {
  const bundle = join(temp, 'synth.mjs');
  await build({ entryPoints: ['art/sfx/synth.ts'], bundle: true, format: 'esm', platform: 'node', outfile: bundle, logLevel: 'error' });
  const { renderSynth } = await import(pathToFileURL(bundle).href);
  mkdirSync(OUT, { recursive: true });
  for (const [name, variants] of Object.entries(renderSynth(RATE))) {
    variants.forEach((samples, i) => {
      const file = join(OUT, `${name}-${i + 1}.mp3`);
      const kbps = LOOPS.has(name) ? 96 : 64;
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(RATE), '-ac', '1', '-i', '-', '-codec:a', 'libmp3lame', '-b:a', `${kbps}k`, file], {
        input: Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength),
      });
      console.log(`${file}: ${(samples.length / RATE).toFixed(2)} s`);
    });
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
