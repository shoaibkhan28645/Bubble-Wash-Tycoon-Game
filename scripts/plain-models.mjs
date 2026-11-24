// Unpacks meshopt-compressed models (scripts/compress-models.mjs) in a build folder, for builds that must not
// run WebAssembly in the player's browser: the YouTube build (scripts/build-youtube.mjs). The meshes keep their
// quantized form (KHR_mesh_quantization, plain typed arrays three.js reads directly), so they look exactly the
// same; only the extra meshopt packing is removed. This runs in Node at build time, where WebAssembly is fine.
//   node scripts/plain-models.mjs <folder>
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const MESHOPT = 'EXT_meshopt_compression';

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith('.glb') ? [path] : [];
  });
}

/** Unpacks every compressed .glb under `dir` in place. Returns the sizes before and after, in bytes. */
export async function unpackModels(dir) {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  let before = 0;
  let after = 0;
  let count = 0;
  for (const file of walk(dir)) {
    const size = statSync(file).size;
    const doc = await io.read(file);
    const packed = doc.getRoot().listExtensionsUsed().filter((ext) => ext.extensionName === MESHOPT);
    if (packed.length === 0) continue;
    for (const ext of packed) ext.dispose();
    await io.write(file, doc);
    before += size;
    after += statSync(file).size;
    count++;
  }
  return { count, before, after };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/plain-models.mjs <folder>');
    process.exit(1);
  }
  const { count, before, after } = await unpackModels(dir);
  console.log(`Unpacked ${count} models: ${(before / 1048576).toFixed(2)} MiB -> ${(after / 1048576).toFixed(2)} MiB`);
}
