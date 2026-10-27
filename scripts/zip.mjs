// Packs dist/ into bubble-wash.zip with index.html at the root, ready for
// the Playables Developer Portal. Pure JavaScript (fflate), so it works in
// Termux without the zip binary. Fails on file names YouTube rejects.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { zipSync } from 'fflate';

const DIST = 'dist';
const OUT = 'bubble-wash.zip';
const SAFE_NAME = /^[A-Za-z0-9_.-]+$/;
const MAX_FILES = 8000;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(DIST);
const bad = files.filter((f) => relative(DIST, f).split(/[\\/]/).some((part) => !SAFE_NAME.test(part)));
if (bad.length) {
  console.error(`Unsafe file names:\n${bad.join('\n')}`);
  process.exit(1);
}
if (!files.includes(join(DIST, 'index.html'))) {
  console.error('dist/index.html missing; run the build first.');
  process.exit(1);
}
if (files.length > MAX_FILES) {
  console.error(`${files.length} files; YouTube allows at most ${MAX_FILES}.`);
  process.exit(1);
}

const entries = {};
for (const f of files) entries[relative(DIST, f).split('\\').join('/')] = readFileSync(f);
const zip = zipSync(entries, { level: 9 });
writeFileSync(OUT, zip);
console.log(`${OUT}: ${files.length} files, ${(zip.length / 1024).toFixed(1)} KiB`);
