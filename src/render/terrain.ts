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
import { mergeParts, toyMaterial, type Part } from './models/build';

const GRASS_A = new Color('#8fd46a');
const GRASS_B = new Color('#6fc35a');
const DIRT_A = new Color('#e6cc9a');
const DIRT_B = new Color('#d4b27c');
const GROUND_SIZE = 140;
const GROUND_SEGMENTS = 70;

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

/** Grass with colour variation and gentle bumps; the dirt lot blends in with a soft, uneven edge. */
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
    // Distance outside the lot (0 inside), with a ragged edge.
    const dx = Math.max(lot.minX - x, 0, x - lot.maxX);
    const dz = Math.max(lot.minZ - z, 0, z - lot.maxZ);
    const out = Math.hypot(dx, dz) + n * 0.6;
    const dirt = Math.min(1, Math.max(0, 1 - out / 1.2));
    c.copy(GRASS_A).lerp(GRASS_B, 0.5 + n * 0.5);
    c.lerp(DIRT_A.clone().lerp(DIRT_B, 0.5 + wobble(x * 2, z * 2) * 0.5), dirt);
    colors.set([c.r, c.g, c.b], i * 3);
    const nearRoad = Math.abs(z - roadZ) < 4;
    pos.setY(i, dirt > 0 || nearRoad ? -0.02 : Math.max(0, n) * 0.25 - 0.02);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return new Mesh(geometry, new MeshLambertMaterial({ vertexColors: true }));
}

const flat = (w: number, d: number, color: string, x: number, z: number, y: number): Part => ({
  geometry: new PlaneGeometry(w, d),
  color,
  x,
  y,
  z,
  rx: -Math.PI / 2,
});

/** Road with kerbs and dashes, and concrete lanes through the lot. */
function roads(layout: LocationLayout, bayXs: number[]): Mesh {
  const { roadZ, exitZ, exitX } = layout;
  const parts: Part[] = [
    flat(160, 3.6, '#6b7280', 0, roadZ, 0.02),
    { geometry: new BoxGeometry(160, 0.16, 0.3), color: '#e9edf2', z: roadZ - 1.95, y: 0.08 },
    { geometry: new BoxGeometry(160, 0.16, 0.3), color: '#e9edf2', z: roadZ + 1.95, y: 0.08 },
    flat(160, 1.4, '#cfd5dc', 0, roadZ - 2.8, 0.025),
  ];
  for (let x = -78; x < 80; x += 3.2) parts.push(flat(1.5, 0.2, '#ffd85c', x, roadZ, 0.03));
  const laneTop = roadZ + 1.8;
  for (const x of bayXs) {
    const length = exitZ - laneTop + 1.2;
    parts.push(flat(2.3, length, '#c4bba9', x, laneTop + length / 2, 0.03));
  }
  const left = Math.min(...bayXs) - 1.3;
  parts.push(flat(exitX + 30 - left, 2.3, '#c4bba9', (left + exitX + 30) / 2, exitZ, 0.031));
  return new Mesh(mergeParts(parts), toyMaterial);
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
  return mesh;
}

/** Fence around the lot, open to the road and where cars drive out. */
function fence(layout: LocationLayout): InstancedMesh {
  const { lot, exitZ } = layout;
  const SEG = 1.5;
  const items: { x: number; z: number; s: number; r: number }[] = [];
  // The road side stays open; fence on the other three sides.
  for (let x = lot.minX + SEG / 2; x < lot.maxX; x += SEG) items.push({ x, z: lot.maxZ, s: SEG, r: 0 });
  for (let z = lot.minZ + SEG / 2; z < lot.maxZ; z += SEG) {
    items.push({ x: lot.minX, z, s: SEG, r: Math.PI / 2 });
    if (Math.abs(z - exitZ) > 1.9) items.push({ x: lot.maxX, z, s: SEG, r: Math.PI / 2 });
  }
  return scatter('nature:fence_simple', items);
}

/** Trees, bushes, grass and flowers around the lot; a few buildings across the road. */
function scenery(layout: LocationLayout): Group {
  const group = new Group();
  const rand = seeded(7);
  const { lot, roadZ, exitZ } = layout;
  const blocked = (x: number, z: number, margin: number) =>
    inside(x, z, lot, margin) || Math.abs(z - roadZ) < 3.6 + margin || (x > lot.maxX - 1 && Math.abs(z - exitZ) < 2 + margin);
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
  // A few weeds in the dusty lot (the GDD's "cracked dirt with weeds").
  const weeds: { x: number; z: number; s: number; r: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const side = i % 2 === 0 ? lot.minX + 0.6 + rand() * 1.2 : lot.maxX - 0.6 - rand() * 1.2;
    weeds.push({ x: side, z: lot.minZ + 1 + rand() * (lot.maxZ - lot.minZ - 2), s: 1.6, r: rand() * 6 });
  }
  group.add(scatter('nature:grass_leafs', weeds));

  // A row of trees along the far side of the road.
  const row: { x: number; z: number; s: number; r: number }[] = [];
  for (let x = -26; x <= 26; x += 3.2 + rand() * 1.5) row.push({ x, z: roadZ - 4.6 - rand() * 1.5, s: 2.6 + rand() * 0.8, r: rand() * 6 });
  group.add(scatter('nature:tree_oak', row));
  return group;
}

/** All static ground and scenery for a location. */
export function terrain(layout: LocationLayout, bayXs: number[]): Group {
  const group = new Group();
  group.add(ground(layout), roads(layout, bayXs), fence(layout), scenery(layout));
  return group;
}
