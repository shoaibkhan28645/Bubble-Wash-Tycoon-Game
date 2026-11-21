// Meshopt-compresses the game's models in public/models (about a third of the size to download; the game
// unpacks them as it loads, src/render/assets.ts). A model already compressed is left as it is, so after
// exporting a new or changed model, run `npm run models` and commit the result.
//   node scripts/compress-models.mjs [files...]     (default: every .glb in public/models)
//
// Medium level: no lossy filters, only quantizing (positions to 14 bits, normals to 10, UVs to 12) and
// reordering, which look the same in the game. A model with a skin (the people) is quantized
// over the whole model's bounds, not each part's: its parts share one rig, and each part's own bounds would
// give each part different bind matrices, which the loader's merge of a character's parts can't take. Its
// vertex colours keep 16 bits (the staff's uniforms are repainted by picking out their colours).
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CLI = '@gltf-transform/cli@4.2.1';

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith('.glb') ? [path] : [];
  });
}

/** The glTF JSON chunk of a .glb. */
function gltfJson(path) {
  const data = readFileSync(path);
  const length = data.readUInt32LE(12);
  return JSON.parse(data.subarray(20, 20 + length).toString('utf8'));
}

const files = process.argv.length > 2 ? process.argv.slice(2) : walk('public/models');
let before = 0;
let after = 0;
for (const file of files) {
  const json = gltfJson(file);
  if (json.extensionsUsed?.includes('EXT_meshopt_compression')) continue;
  const skinned = !!json.skins?.length;
  const volume = skinned ? 'scene' : 'mesh';
  const colour = skinned ? ['--quantize-color', '16'] : [];
  const out = `${file}.tmp.glb`;
  execFileSync('npx', ['-y', CLI, 'meshopt', file, out, '--level', 'medium', '--quantization-volume', volume, ...colour], { stdio: 'ignore' });
  const size = statSync(file).size;
  const packed = statSync(out).size;
  renameSync(out, file);
  before += size;
  after += packed;
  console.log(`${file}: ${(size / 1024).toFixed(0)} KiB -> ${(packed / 1024).toFixed(0)} KiB (${volume})`);
}
if (before) console.log(`${(before / 1024 / 1024).toFixed(2)} MiB -> ${(after / 1024 / 1024).toFixed(2)} MiB`);
else console.log('Every model is already compressed.');
