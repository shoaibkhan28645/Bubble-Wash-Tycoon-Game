// Loads the Kenney CC0 models (public/models) before the game starts and
// turns them into cheap, mergeable pieces.
import {
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
import { CARS, CHARACTERS } from '../core/config';

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

/** Every model the game needs at start, by id → relative path. */
function manifest(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const car of CARS) files[`car:${car.model}`] = `models/cars/${car.model}.glb`;
  files['car:delivery'] = 'models/cars/delivery.glb';
  // Buildings modelled in Blender (art/blender).
  files['building:tunnel'] = 'models/buildings/tunnel.glb';
  files['building:wash-bay'] = 'models/buildings/wash-bay.glb';
  files['building:fuel-canopy'] = 'models/buildings/fuel-canopy.glb';
  files['building:fuel-pump'] = 'models/buildings/fuel-pump.glb';
  files['building:dryer'] = 'models/buildings/dryer.glb';
  for (const person of [CHARACTERS.player, ...Object.values(CHARACTERS.staff)]) {
    files[`person:${person}`] = `models/people/character-${person}.glb`;
  }
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
/** Every Car Kit and Mini Characters model points at the same colour texture; keep one copy per image. */
const textures = new Map<unknown, Texture>();

/** Loads everything in the manifest; `onProgress` gets 0..1. */
export async function loadAssets(onProgress: (fraction: number) => void): Promise<void> {
  // Files loaded twice (the shared colour textures) come from memory the second time.
  Cache.enabled = true;
  const loader = new GLTFLoader();
  const entries = Object.entries(manifest());
  let done = 0;
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

/** Loads one more model after the start (the Car of the Day, the shoppers), unless it's already here. */
export async function loadModel(id: string, path: string): Promise<void> {
  if (assets.has(id)) return;
  const gltf = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + path);
  prepare(gltf.scene);
  if (id.startsWith('person:')) mergeSkinnedParts(gltf.scene);
  assets.set(id, { scene: gltf.scene, animations: gltf.animations });
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
    node.material = toLambert(node.material as Material);
  });
}

function toLambert(material: Material): MeshLambertMaterial {
  let lambert = lambertCache.get(material);
  if (lambert) return lambert;
  const source = material as MeshStandardMaterial;
  const color = RECOLOR[source.name] ? new Color(RECOLOR[source.name]) : source.color?.clone() ?? new Color(0xffffff);
  lambert = new MeshLambertMaterial({ map: shared(source.map), color, name: source.name });
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
