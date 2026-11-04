// Loads the models (public/models: Blender-made buildings and cars, Kenney
// CC0 people and nature) before the game starts and turns them into cheap,
// mergeable pieces.
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Material,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  SkinnedMesh,
  Cache,
  type Texture,
  type AnimationClip,
  type Object3D,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CHARACTERS } from '../core/config';

export interface ModelAsset {
  scene: Group;
  animations: AnimationClip[];
}

/** Nature Kit colours swapped for the game's brighter palette, by material name. */
const RECOLOR: Record<string, string> = {
  leafsGreen: '#5fcf6a',
  leafsDark: '#3fae5a',
  grass: '#7bd45f',
  woodBark: '#b77b4c',
  woodBarkDark: '#8d5a36',
  stone: '#c9ccd6',
  dirt: '#c99a6a',
};

const SCENERY = [
  'tree_oak', 'tree_default', 'tree_fat', 'tree_detailed', 'plant_bush', 'plant_bushLarge',
  'plant_bushDetailed', 'grass', 'grass_large', 'grass_leafs', 'flower_redA', 'flower_yellowA',
  'flower_purpleA', 'rock_smallA', 'rock_largeA', 'fence_simple',
];

/** The customers' car files, in the order they're searched for a model. */
export const CAR_FILES = ['cars:small', 'cars:family', 'cars:large', 'cars:big', 'cars:monster'];

/**
 * Every model every town needs, by id → relative path. A town's own
 * buildings are listed in its TownDef (`models`) and come and go with it.
 */
function sharedManifest(): Record<string, string> {
  const files: Record<string, string> = {};
  // Cars modelled in Blender (art/blender/cars.py); the Car of the Day specials load when first needed.
  for (const file of CAR_FILES) files[file] = `models/cars/cars-${file.slice(5)}.glb`;
  // The player and the staff (Kenney Mini Characters); shoppers and people out walking load later (loadPeople).
  for (const person of [CHARACTERS.player, ...Object.values(CHARACTERS.staff)]) files[`person:${person}`] = personPath(person);
  for (const name of SCENERY) files[`nature:${name}`] = `models/nature/${name}.glb`;
  return files;
}

interface Merged {
  geometry: BufferGeometry;
  /** Shared; clone it before changing it per object. */
  material: MeshLambertMaterial;
}

const assets = new Map<string, ModelAsset>();
const mergedCache = new Map<string, Merged>();
const lambertCache = new Map<Material, MeshLambertMaterial>();
/** Every Mini Characters and Nature Kit model points at a shared colour texture; keep one copy per image. */
const textures = new Map<unknown, Texture>();

/** Loads the shared models and the first town's (`townModels`); `onProgress` gets 0..1. */
export async function loadAssets(onProgress: (fraction: number) => void, townModels: Record<string, string> = {}): Promise<void> {
  // Files loaded twice (the shared colour textures) come from memory the second time.
  Cache.enabled = true;
  await loadAll({ ...sharedManifest(), ...townModels }, onProgress);
}

async function loadAll(files: Record<string, string>, onProgress: (fraction: number) => void): Promise<void> {
  const loader = new GLTFLoader();
  const entries = Object.entries(files).filter(([id]) => !assets.has(id));
  let done = 0;
  if (entries.length === 0) onProgress(1);
  await Promise.all(
    entries.map(async ([id, path]) => {
      const gltf = await loader.loadAsync(import.meta.env.BASE_URL + path);
      prepare(gltf.scene);
      if (id.startsWith('person:')) mergeSkinnedParts(gltf.scene);
      assets.set(id, { scene: gltf.scene, animations: gltf.animations });
      onProgress(++done / entries.length);
    }),
  );
}

/**
 * Travelling: drops the models only the old town used and loads the new
 * town's. Call once the old town's game is taken down.
 */
export async function swapTownModels(
  from: Record<string, string>,
  to: Record<string, string>,
  onProgress: (fraction: number) => void,
): Promise<void> {
  for (const id of Object.keys(from)) if (!(id in to)) unloadModel(id);
  await loadAll(to, onProgress);
}

/** Forgets a model and frees what only it used (its shared colour textures stay). */
function unloadModel(id: string): void {
  const model = assets.get(id);
  if (!model) return;
  assets.delete(id);
  const merged = mergedCache.get(id);
  if (merged) {
    merged.geometry.dispose();
    merged.material.dispose();
    mergedCache.delete(id);
  }
  const materials = new Set<Material>();
  model.scene.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    (node.geometry as BufferGeometry).dispose();
    materials.add(node.material as Material);
  });
  for (const [source, lambert] of lambertCache) {
    if (!materials.has(lambert)) continue;
    lambert.dispose();
    lambertCache.delete(source);
  }
}

/** How many models are loaded (the debug panel, and the travel test). */
export function loadedModelCount(): number {
  return assets.size;
}

/** Loads one more model after the start (the Car of the Day, the shoppers), unless it's already here. */
export async function loadModel(id: string, path: string): Promise<void> {
  if (assets.has(id)) return;
  const gltf = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + path);
  prepare(gltf.scene);
  if (id.startsWith('person:')) mergeSkinnedParts(gltf.scene);
  assets.set(id, { scene: gltf.scene, animations: gltf.animations });
}

function personPath(person: string): string {
  return `models/people/character-${person}.glb`;
}

/** Loads these people after the start (shoppers, people out walking), unless they're already here. */
export async function loadPeople(people: readonly string[]): Promise<void> {
  await Promise.all(people.map((p) => loadModel(`person:${p}`, personPath(p))));
}

export function hasModel(id: string): boolean {
  return assets.has(id);
}

export function asset(id: string): ModelAsset {
  const found = assets.get(id);
  if (!found) throw new Error(`Model not loaded: ${id}`);
  return found;
}

/**
 * Mini Characters come as a body and a head, two skinned meshes on the same
 * bones with the same material and bind pose: joined, each person is one
 * draw call instead of two.
 */
function mergeSkinnedParts(scene: Object3D): void {
  const parts: SkinnedMesh[] = [];
  scene.traverse((node) => {
    if (node instanceof SkinnedMesh) parts.push(node);
  });
  const [first, ...rest] = parts;
  if (!first || rest.length === 0) return;
  const sameRig = rest.every(
    (p) =>
      p.material === first.material &&
      p.skeleton.bones.length === first.skeleton.bones.length &&
      p.skeleton.bones.every((bone, i) => bone === first.skeleton.bones[i]) &&
      p.bindMatrix.equals(first.bindMatrix),
  );
  if (!sameRig) return;
  const merged = mergeGeometries(parts.map((p) => p.geometry as BufferGeometry));
  if (!merged) return;
  first.geometry.dispose();
  first.geometry = merged;
  for (const part of rest) {
    part.removeFromParent();
    part.geometry.dispose();
  }
}

/** The first texture seen for an image; later copies of it are dropped. */
function shared(map: Texture | null): Texture | null {
  if (!map) return null;
  const key = map.source.data ?? map;
  const known = textures.get(key);
  if (known) {
    if (known !== map) map.dispose();
    return known;
  }
  textures.set(key, map);
  return map;
}

/** Lambert instead of PBR (much cheaper on phones); drop data we never use. */
function prepare(scene: Object3D): void {
  scene.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const geometry = node.geometry as BufferGeometry;
    geometry.deleteAttribute('tangent');
    node.material = toLambert(node.material as Material, geometry.hasAttribute('color'));
  });
}

/** `vertexColors`: the Blender models are painted in vertex colours (the player, the buildings). */
function toLambert(material: Material, vertexColors = false): MeshLambertMaterial {
  let lambert = lambertCache.get(material);
  if (lambert) return lambert;
  const source = material as MeshStandardMaterial;
  const color = RECOLOR[source.name] ? new Color(RECOLOR[source.name]) : source.color?.clone() ?? new Color(0xffffff);
  lambert = new MeshLambertMaterial({ map: shared(source.map), color, name: source.name, vertexColors });
  lambertCache.set(material, lambert);
  material.dispose();
  return lambert;
}

/**
 * Bakes a model into a single geometry (one draw call). Textured models
 * keep their shared texture material; colour-only models (Nature Kit)
 * get their material colours baked into vertex colours.
 */
export function mergedModel(id: string): Merged {
  const cached = mergedCache.get(id);
  if (cached) return cached;
  const { scene } = asset(id);
  scene.updateMatrixWorld(true);
  const pieces: BufferGeometry[] = [];
  const materials = new Set<MeshLambertMaterial>();
  scene.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const material = node.material as MeshLambertMaterial;
    materials.add(material);
    let g = (node.geometry as BufferGeometry).clone().applyMatrix4(node.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    const count = g.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.set([material.color.r, material.color.g, material.color.b], i * 3);
    g.setAttribute('color', new Float32BufferAttribute(colors, 3));
    pieces.push(g);
  });
  const geometry = mergeGeometries(pieces);
  for (const piece of pieces) piece.dispose();
  if (!geometry) throw new Error(`Could not merge ${id}`);
  const first = [...materials][0]!;
  const textured = first.map !== null;
  const material = textured
    ? new MeshLambertMaterial({ map: first.map })
    : new MeshLambertMaterial({ vertexColors: true });
  const merged = { geometry, material };
  mergedCache.set(id, merged);
  return merged;
}

/** A copy of a geometry with plain float attributes (the Blender files are quantized), so it can be moved and merged. */
export function plain(geometry: BufferGeometry): BufferGeometry {
  const out = new BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const a = geometry.getAttribute(name);
    if (!a) continue;
    const array = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) array[i * a.itemSize + k] = a.getComponent(i, k);
    out.setAttribute(name, new BufferAttribute(array, a.itemSize));
  }
  if (geometry.index) out.setIndex(new BufferAttribute(Uint32Array.from(geometry.index.array), 1));
  return out;
}

/** A Car of the Day special's own file (loaded when first needed). */
export function specialCarFile(model: string): { id: string; path: string } {
  return { id: `cars:special-${model}`, path: `models/cars/special-${model}.glb` };
}
