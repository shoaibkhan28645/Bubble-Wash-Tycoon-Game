import {
  BoxGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
} from 'three';
import type { LocationLayout, Rect } from '../core/config';
import { mergedModel } from './assets';
import { GRAPHICS } from './graphics';
import { lotSurface } from './lotSurface';
import { mergeParts, toyMaterial, type Part } from './models/build';

const GRASS_A = new Color('#8fd46a');
const GRASS_B = new Color('#6fc35a');
const KERB = '#cdd2d9';
const GROUND_SIZE = 140;
const GROUND_SEGMENTS = 48;

/** Small seeded random generator so the scenery is the same every time. */
function seeded(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** Smooth-ish 2D noise from a few sine waves (no texture needed). */
const wobble = (x: number, z: number) =>
  Math.sin(x * 0.37 + z * 0.11) * 0.5 + Math.sin(x * 0.13 - z * 0.41) * 0.35 + Math.sin(x * 1.3 + z * 1.7) * 0.15;

function inside(x: number, z: number, r: Rect, margin = 0): boolean {
  return x > r.minX - margin && x < r.maxX + margin && z > r.minZ - margin && z < r.maxZ + margin;
}

/** Grass with colour variation and gentle bumps; flat where the paved lot and the road go. */
function ground(layout: LocationLayout): Mesh {
  const geometry = new PlaneGeometry(GROUND_SIZE, GROUND_SIZE, GROUND_SEGMENTS, GROUND_SEGMENTS).rotateX(-Math.PI / 2);
  const pos = geometry.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new Color();
  const { lot, roadZ } = layout;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const n = wobble(x, z);
    c.copy(GRASS_A).lerp(GRASS_B, 0.5 + n * 0.5);
    colors.set([c.r, c.g, c.b], i * 3);
    const flat = inside(x, z, lot, 1.5) || Math.abs(z - roadZ) < 4;
    pos.setY(i, flat ? -0.02 : Math.max(0, n) * 0.25 - 0.02);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new Mesh(geometry, new MeshLambertMaterial({ vertexColors: true }));
  mesh.receiveShadow = true;
  return mesh;
}

const flat = (w: number, d: number, color: string, x: number, z: number, y: number): Part => ({
  geometry: new PlaneGeometry(w, d),
  color,
  x,
  y,
  z,
  rx: -Math.PI / 2,
});

/** The street with kerbs and dashes, the exits out to it, and kerbs around the lot. */
function roads(layout: LocationLayout): Mesh {
  const { roadZ, exitZ, earlyExitZ, exitX, lot } = layout;
  const W = 2.7;
  const parts: Part[] = [
    flat(160, 3.6, '#6b7280', 0, roadZ, 0.02),
    { geometry: new BoxGeometry(160, 0.16, 0.3), color: '#e9edf2', z: roadZ - 1.95, y: 0.08 },
    { geometry: new BoxGeometry(160, 0.16, 0.3), color: '#e9edf2', z: roadZ + 1.95, y: 0.08 },
    flat(160, 1.4, '#cfd5dc', 0, roadZ - 2.8, 0.025),
  ];
  for (let x = -78; x < 80; x += 3.2) parts.push(flat(1.5, 0.2, '#ffd85c', x, roadZ, 0.03));
  // The two ways out, from the lot's edge across the grass.
  for (const z of [earlyExitZ, exitZ]) {
    const length = exitX + 30 - lot.maxX;
    parts.push(flat(length, W, '#646b77', lot.maxX + length / 2, z, 0.03));
  }
  // Kerbs on the three sides away from the road, open where cars drive out.
  const kerb = (x0: number, z0: number, x1: number, z1: number) =>
    parts.push({ geometry: new BoxGeometry(Math.max(0.24, x1 - x0), 0.14, Math.max(0.24, z1 - z0)), color: KERB, x: (x0 + x1) / 2, y: 0.07, z: (z0 + z1) / 2 });
  kerb(lot.minX, lot.maxZ, lot.maxX, lot.maxZ);
  kerb(lot.minX, lot.minZ + 0.2, lot.minX, lot.maxZ);
  const gaps = [earlyExitZ, exitZ].sort((a, b) => a - b);
  let from = lot.minZ + 0.2;
  for (const z of gaps) {
    kerb(lot.maxX, from, lot.maxX, z - W / 2);
    from = z + W / 2;
  }
  kerb(lot.maxX, from, lot.maxX, lot.maxZ);
  const mesh = new Mesh(mergeParts(parts), toyMaterial);
  mesh.receiveShadow = true;
  return mesh;
}

/** Many copies of one Kenney model in a single draw call. */
function scatter(id: string, items: { x: number; z: number; s: number; r: number }[]): InstancedMesh {
  const { geometry, material } = mergedModel(id);
  const mesh = new InstancedMesh(geometry, material, items.length);
  const dummy = new Object3D();
  items.forEach((item, i) => {
    dummy.position.set(item.x, 0, item.z);
    dummy.rotation.set(0, item.r, 0);
    dummy.scale.setScalar(item.s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  // Only trees and the fence: small plants and rocks aren't worth a shadow pass.
  mesh.castShadow = /tree|fence/.test(id);
  return mesh;
}

/** Fence around the lot, open to the road and where cars drive out. */
function fence(layout: LocationLayout): InstancedMesh {
  const { lot, exitZ, earlyExitZ } = layout;
  const SEG = 1.5;
  const items: { x: number; z: number; s: number; r: number }[] = [];
  // The road side stays open; fence on the other three sides.
  for (let x = lot.minX + SEG / 2; x < lot.maxX; x += SEG) items.push({ x, z: lot.maxZ, s: SEG, r: 0 });
  for (let z = lot.minZ + SEG / 2; z < lot.maxZ; z += SEG) {
    items.push({ x: lot.minX, z, s: SEG, r: Math.PI / 2 });
    if (Math.abs(z - exitZ) > 1.9 && Math.abs(z - earlyExitZ) > 1.9) items.push({ x: lot.maxX, z, s: SEG, r: Math.PI / 2 });
  }
  return scatter('nature:fence_simple', items);
}

/** Trees, bushes, grass and flowers around the lot; a few buildings across the road. */
function scenery(layout: LocationLayout): Group {
  const group = new Group();
  const rand = seeded(7);
  const { lot, roadZ, exitZ, earlyExitZ } = layout;
  const onExit = (z: number, margin: number) => Math.abs(z - exitZ) < 2 + margin || Math.abs(z - earlyExitZ) < 2 + margin;
  const blocked = (x: number, z: number, margin: number) =>
    inside(x, z, lot, margin) || Math.abs(z - roadZ) < 3.6 + margin || (x > lot.maxX - 1 && onExit(z, margin));
  const kinds: { id: string; count: number; scale: [number, number]; margin: number; near?: number }[] = [
    { id: 'nature:tree_oak', count: 14, scale: [2.6, 3.4], margin: 1.6 },
    { id: 'nature:tree_default', count: 12, scale: [2.4, 3.2], margin: 1.6 },
    { id: 'nature:tree_fat', count: 8, scale: [2.4, 3], margin: 1.6 },
    { id: 'nature:tree_detailed', count: 8, scale: [2.4, 3], margin: 1.6 },
    { id: 'nature:plant_bushLarge', count: 14, scale: [1.6, 2.2], margin: 0.8, near: 4 },
    { id: 'nature:plant_bush', count: 18, scale: [1.6, 2.2], margin: 0.6, near: 3 },
    { id: 'nature:plant_bushDetailed', count: 10, scale: [1.6, 2], margin: 0.6, near: 3 },
    { id: 'nature:grass_large', count: 40, scale: [1.8, 2.6], margin: 0.3, near: 5 },
    { id: 'nature:grass', count: 40, scale: [1.8, 2.6], margin: 0.3 },
    { id: 'nature:grass_leafs', count: 24, scale: [1.6, 2.2], margin: 0.3 },
    { id: 'nature:flower_redA', count: 16, scale: [1.6, 2], margin: 0.4, near: 4 },
    { id: 'nature:flower_yellowA', count: 16, scale: [1.6, 2], margin: 0.4, near: 4 },
    { id: 'nature:flower_purpleA', count: 12, scale: [1.6, 2], margin: 0.4, near: 4 },
    { id: 'nature:rock_smallA', count: 12, scale: [1.4, 2.2], margin: 0.4 },
    { id: 'nature:rock_largeA', count: 5, scale: [1.2, 1.8], margin: 1 },
  ];
  for (const kind of kinds) {
    const items: { x: number; z: number; s: number; r: number }[] = [];
    let tries = 0;
    while (items.length < kind.count && tries++ < kind.count * 60) {
      const x = (rand() - 0.5) * 50;
      const z = lot.minZ - 12 + rand() * (lot.maxZ - lot.minZ + 26);
      if (blocked(x, z, kind.margin)) continue;
      if (kind.near && !inside(x, z, lot, kind.near)) continue;
      items.push({ x, z, s: kind.scale[0] + rand() * (kind.scale[1] - kind.scale[0]), r: rand() * Math.PI * 2 });
    }
    group.add(scatter(kind.id, items));
  }
  // A row of trees along the far side of the road.
  const row: { x: number; z: number; s: number; r: number }[] = [];
  for (let x = -26; x <= 26; x += 3.2 + rand() * 1.5) row.push({ x, z: roadZ - 4.6 - rand() * 1.5, s: 2.6 + rand() * 0.8, r: rand() * 6 });
  group.add(scatter('nature:tree_oak', row));
  return group;
}

/** All static ground and scenery for a location. */
export function terrain(layout: LocationLayout, bayXs: number[]): Group {
  const group = new Group();
  group.add(ground(layout), roads(layout), fence(layout), scenery(layout));
  if (GRAPHICS.lot) group.add(lotSurface(layout, bayXs));
  return group;
}
