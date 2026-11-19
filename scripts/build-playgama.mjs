// Builds the Playgama version of the game (src/platform/playgama.ts) into
// dist-playgama/: the game with Playgama Bridge, shipped inside the build
// (Playgama allows no external resources), and Bridge's config, both next to
// index.html. `npm run zip:playgama` then packs it for developer.playgama.com.
import { copyFileSync } from 'node:fs';
import { build } from 'vite';

const OUT = 'dist-playgama';
await build({ mode: 'playgama', build: { outDir: OUT, emptyOutDir: true } });
copyFileSync('node_modules/@playgama/bridge/dist/playgama-bridge.js', `${OUT}/playgama-bridge.js`);
copyFileSync('src/platform/playgama-bridge-config.json', `${OUT}/playgama-bridge-config.json`);
console.log(`Built the Playgama version in ${OUT}/`);
