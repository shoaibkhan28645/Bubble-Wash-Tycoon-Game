// Builds the YouTube Playables version of the game into dist-youtube/: YouTube's Playables SDK as the page's
// first script (index.html), the game talking to it (src/platform/youtube.ts), and the models unpacked with no
// meshopt decoder, so nothing runs on WebAssembly, which YouTube may decline to certify (vite.config.ts,
// scripts/plain-models.mjs). Then checks the files against YouTube's limits (scripts/check-youtube.mjs).
// `npm run zip:youtube` packs it for the Playables Developer Portal.
import { build } from 'vite';
import { checkYoutube } from './check-youtube.mjs';
import { unpackModels } from './plain-models.mjs';

const OUT = 'dist-youtube';
const MIB = 1024 * 1024;

await build({ mode: 'youtube', build: { outDir: OUT, emptyOutDir: true } });
const models = await unpackModels(`${OUT}/models`);
console.log(`Unpacked ${models.count} models: ${(models.before / MIB).toFixed(2)} MiB -> ${(models.after / MIB).toFixed(2)} MiB`);

const { problems, warnings, files, total } = checkYoutube(OUT);
console.log(`${OUT}: ${files} files, ${(total / MIB).toFixed(1)} MiB`);
for (const w of warnings) console.log(`  note: ${w}`);
for (const p of problems) console.error(`  PROBLEM: ${p}`);
if (problems.length) process.exit(1);
console.log(`Built the YouTube Playables version in ${OUT}/`);
