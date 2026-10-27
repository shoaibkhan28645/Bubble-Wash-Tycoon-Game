// Short size report for dist/: initial download (index.html plus every file
// it references), total size, and any file over the 512 KiB target.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = 'dist';
const FILE_TARGET = 512 * 1024;
const kib = (n) => `${(n / 1024).toFixed(1)} KiB`;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const sizes = new Map(
  walk(DIST).map((f) => {
    const data = readFileSync(f);
    return [relative(DIST, f).split('\\').join('/'), { raw: data.length, gz: gzipSync(data).length }];
  }),
);

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const referenced = [...html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)].map((m) => m[1]);
const initial = ['index.html', ...referenced].filter((f) => sizes.has(f));

const sum = (names, key) => names.reduce((total, n) => total + sizes.get(n)[key], 0);
const all = [...sizes.keys()];

console.log(`Initial: ${kib(sum(initial, 'gz'))} gzip (${kib(sum(initial, 'raw'))} raw), ${initial.length} files`);
console.log(`dist total: ${kib(sum(all, 'raw'))} raw, ${all.length} files`);
for (const [name, { raw }] of sizes) {
  if (raw > FILE_TARGET) console.log(`Over 512 KiB: ${name} (${kib(raw)})`);
}
