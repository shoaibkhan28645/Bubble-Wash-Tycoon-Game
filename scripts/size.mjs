// Short size report for dist/: initial download (index.html, every file it
// references, and the models loaded before gameReady), total size, and any
// file over the 512 KiB target.
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
// Car of the Day models load later, one a day, so they don't count towards the start.
const daily = JSON.parse(readFileSync('src/data/daily.json', 'utf8'));
const cars = JSON.parse(readFileSync('src/data/cars.json', 'utf8'));
const atStart = new Set([...cars.map((c) => c.model), 'delivery']);
const lazy = new Set(daily.carOfDay.cars.map((c) => `models/cars/${c.model}.glb`).filter((f) => !atStart.has(f.slice(12, -4))));
const models = [...sizes.keys()].filter((f) => f.startsWith('models/') && !f.endsWith('.md') && !lazy.has(f));
const sounds = [...sizes.keys()].filter((f) => f.startsWith('audio/') && f.endsWith('.mp3'));
const initial = ['index.html', ...referenced, ...models, ...sounds].filter((f) => sizes.has(f));

const sum = (names, key) => names.reduce((total, n) => total + sizes.get(n)[key], 0);
const all = [...sizes.keys()];

console.log(`Initial: ${kib(sum(initial, 'gz'))} gzip (${kib(sum(initial, 'raw'))} raw), ${initial.length} files`);
console.log(`Loaded later (Car of the Day): ${kib(sum([...lazy].filter((f) => sizes.has(f)), 'gz'))} gzip, ${lazy.size} files`);
console.log(`dist total: ${kib(sum(all, 'raw'))} raw, ${all.length} files`);
for (const [name, { raw }] of sizes) {
  if (raw > FILE_TARGET) console.log(`Over 512 KiB: ${name} (${kib(raw)})`);
}
