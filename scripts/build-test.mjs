// Builds the tester version of the game (src/platform/tester.ts) into dist-test/,
// labelled with its commit count (one more with every change) and the day it was
// made: "Test build 412 · 18 Nov". `npm run zip:test` then packs it for itch.io.
import { execSync } from 'node:child_process';
import { build } from 'vite';

let count = '';
try {
  count = execSync('git rev-list --count HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
} catch {
  // No git here: the date alone.
}
const day = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
process.env.VITE_BUILD_LABEL = count ? `Test build ${count} · ${day}` : `Test build · ${day}`;
await build({ mode: 'tester', build: { outDir: 'dist-test', emptyOutDir: true } });
console.log(`Built ${process.env.VITE_BUILD_LABEL} in dist-test/`);
