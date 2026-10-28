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

/** Loads everything in the manifest; `onProgress` gets 0..1. */
export async function loadAssets(onProgress: (fraction: number) => void): Promise<void> {
  const loader = new GLTFLoader();
  const entries = Object.entries(manifest());
  let done = 0;
  await Promise.all(
    entries.map(async ([id, path]) => {
      const gltf = await loader.loadAsync(import.meta.env.BASE_URL + path);
      prepare(gltf.scene);
      assets.set(id, { scene: gltf.scene, animations: gltf.animations });
      onProgress(++done / entries.length);
    }),
  );
}

export function asset(id: string): ModelAsset {
  const found = assets.get(id);
  if (!found) throw new Error(`Model not loaded: ${id}`);
  return found;
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
  lambert = new MeshLambertMaterial({ map: source.map ?? null, color, name: source.name });
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
