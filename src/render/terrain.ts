import {
  BoxGeometry,
  IcosahedronGeometry,
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
const GROUND_SEGMENTS = 32;

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
  const areas = Object.values(layout.areas);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const n = wobble(x, z);
    c.copy(GRASS_A).lerp(GRASS_B, 0.5 + n * 0.5);
    colors.set([c.r, c.g, c.b], i * 3);
    const flat = inside(x, z, lot, 1.5) || Math.abs(z - roadZ) < 4 || inside(x, z, sideStreet(layout), 1) || areas.some((a) => inside(x, z, a, 1.5));
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

const ASPHALT = '#646b77';
const PAVEMENT = '#cfd5dc';
const DASH = '#ffd85c';
/** Half the width of a street (kerb to kerb), and of the lot's driveways. */
const STREET = 1.9;
const DRIVE = 1.35;
/** Where the zebra crossing goes over Main Street: between the two bays' lanes. */
const CROSSING_X = -1.5;

/**
 * Main Street with its pavements and kerbs; Bubble Lane, the side street the
 * cars leave by, with the lot's two driveways out to it; zebra crossings;
 * and kerbs round the lot.
 */
function roads(layout: LocationLayout): Mesh {
  const { roadZ, exitZ, earlyExitZ, sideStreetX: sx, lot } = layout;
  const end = lot.maxZ + 14;
  const parts: Part[] = [flat(160, STREET * 2, ASPHALT, 0, roadZ, 0.02), flat(160, 1.4, PAVEMENT, 0, roadZ - 2.8, 0.025)];
  const box = (x0: number, z0: number, x1: number, z1: number, color: string, h = 0.14) =>
    parts.push({ geometry: new BoxGeometry(Math.max(0.24, x1 - x0), h, Math.max(0.24, z1 - z0)), color, x: (x0 + x1) / 2, y: h / 2, z: (z0 + z1) / 2 });
  // Main Street: kerbs (open where Bubble Lane joins), dashes, the pavement on the lot's side beyond it.
  box(-80, roadZ - STREET - 0.15, 80, roadZ - STREET + 0.15, '#e9edf2', 0.16);
  box(-80, roadZ + STREET - 0.15, sx - STREET, roadZ + STREET + 0.15, '#e9edf2', 0.16);
  box(sx + STREET, roadZ + STREET - 0.15, 80, roadZ + STREET + 0.15, '#e9edf2', 0.16);
  for (let x = -78; x < 80; x += 3.2) if (Math.abs(x - sx) > STREET + 0.8) parts.push(flat(1.5, 0.2, DASH, x, roadZ, 0.03));
  for (const [x0, x1] of [[-80, lot.minX], [lot.maxX, sx - STREET], [sx + STREET, 80]] as const) {
    parts.push(flat(x1 - x0, 1.4, PAVEMENT, (x0 + x1) / 2, roadZ + STREET + 0.7, 0.025));
  }
  // Bubble Lane, from Main Street down past the lot: centre dashes, kerbs, a pavement on the far side.
  const top = roadZ + STREET - 0.1;
  parts.push(flat(STREET * 2, end - top, ASPHALT, sx, (top + end) / 2, 0.021));
  for (let z = top + 2.5; z < end; z += 3.2) parts.push(flat(0.2, 1.5, DASH, sx, z, 0.03));
  parts.push(flat(1.4, end - top, PAVEMENT, sx + STREET + 0.7, (top + end) / 2, 0.025));
  box(sx + STREET - 0.15, top + 0.2, sx + STREET + 0.15, end, '#e9edf2', 0.16);
  // The lot's driveways out, and kerbs between them along the lot's edge.
  const exits = [earlyExitZ, exitZ].sort((a, b) => a - b);
  for (const z of exits) parts.push(flat(sx - STREET - lot.maxX + 0.2, DRIVE * 2, ASPHALT, (lot.maxX + sx - STREET) / 2, z, 0.022));
  parts.push(flat(sx - STREET - lot.maxX, end - top, PAVEMENT, (lot.maxX + sx - STREET) / 2, (top + end) / 2, 0.018));
  let from = top + 0.2;
  for (const z of [...exits, end + DRIVE]) {
    box(sx - STREET - 0.15, from, sx - STREET + 0.15, z - DRIVE, '#e9edf2', 0.16);
    from = z + DRIVE;
  }
  // Zebra crossings: over Main Street between the bay lanes, over Bubble Lane by the corner.
  for (let z = roadZ - STREET + 0.35; z < roadZ + STREET - 0.2; z += 0.75) parts.push(flat(2.4, 0.38, '#ffffff', CROSSING_X, z, 0.032));
  for (let x = sx - STREET + 0.35; x < sx + STREET - 0.2; x += 0.75) parts.push(flat(0.38, 2.4, '#ffffff', x, roadZ + STREET + 2.6, 0.032));
  // Kerbs round the lot on the two sides away from the streets.
  box(lot.minX, lot.maxZ - 0.15, lot.maxX, lot.maxZ + 0.15, KERB);
  box(lot.minX - 0.15, lot.minZ + 0.2, lot.minX + 0.15, lot.maxZ, KERB);
  const mesh = new Mesh(mergeParts(parts), toyMaterial);
  mesh.receiveShadow = true;
  return mesh;
}

/** Many copies of one Kenney model in a single draw call, standing at height `y`. */
function scatter(id: string, items: { x: number; z: number; s: number; r: number }[], y = 0): InstancedMesh {
  const { geometry, material } = mergedModel(id);
  const mesh = new InstancedMesh(geometry, material, items.length);
  const dummy = new Object3D();
  items.forEach((item, i) => {
    dummy.position.set(item.x, y, item.z);
    dummy.rotation.set(0, item.r, 0);
    dummy.scale.setScalar(item.s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.name = id;
  // Only trees and the fence: small plants and rocks aren't worth a shadow pass.
  mesh.castShadow = /tree|fence/.test(id);
  return mesh;
}

/** Trimmed hedges round the lot (not on the street side), open where cars drive out; bumpy tops. */
function hedges(layout: LocationLayout): Mesh {
  const { lot, exitZ, earlyExitZ } = layout;
  const parts: Part[] = [];
  const rand = seeded(3);
  const run = (x0: number, z0: number, x1: number, z1: number) => {
    const length = Math.hypot(x1 - x0, z1 - z0);
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    parts.push({ geometry: new BoxGeometry(alongX ? length : 0.7, 0.75, alongX ? 0.7 : length), color: HEDGE, x: (x0 + x1) / 2, y: 0.375, z: (z0 + z1) / 2 });
    for (let t = 0.3; t < length; t += 0.62) {
      const k = t / length;
      parts.push({ geometry: new IcosahedronGeometry(0.42 * (0.8 + rand() * 0.4), 0), color: rand() < 0.5 ? HEDGE : HEDGE_LIGHT, x: x0 + (x1 - x0) * k, y: 0.78, z: z0 + (z1 - z0) * k });
    }
  };
  const inset = 0.45;
  run(lot.minX - inset, lot.minZ + 1.6, lot.minX - inset, lot.maxZ + inset);
  run(lot.minX - inset, lot.maxZ + inset, lot.maxX + inset, lot.maxZ + inset);
  const exits = [earlyExitZ, exitZ].sort((a, b) => a - b);
  let from = lot.minZ + 1.6;
  for (const z of [...exits, lot.maxZ + inset + DRIVE]) {
    if (z - DRIVE - 0.4 > from) run(lot.maxX + inset, from, lot.maxX + inset, z - DRIVE - 0.4);
    from = z + DRIVE + 0.4;
  }
  const mesh = new Mesh(mergeParts(parts), toyMaterial);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const HEDGE = '#4fa244';
const HEDGE_LIGHT = '#5fb84f';

/** Raised flower beds on the lot: a kerb, grass, flowers and bushes, and trees in the bigger ones. */
function planters(layout: LocationLayout): Group {
  const group = new Group();
  const parts: Part[] = [];
  const rand = seeded(5);
  const flowers = ['#ff8fc8', '#ffd24a', '#ffffff', '#ff5c6c', '#b79cff'];
  const trees: { x: number; z: number; s: number; r: number }[] = [];
  const bushes: { x: number; z: number; s: number; r: number }[] = [];
  for (const p of layout.planters) {
    const w = p.maxX - p.minX;
    const d = p.maxZ - p.minZ;
    const x = (p.minX + p.maxX) / 2;
    const z = (p.minZ + p.maxZ) / 2;
    parts.push({ geometry: new BoxGeometry(w, 0.32, d), color: KERB, x, y: 0.16, z });
    parts.push({ geometry: new BoxGeometry(w - 0.24, 0.06, d - 0.24), color: '#6fc35a', x, y: 0.33, z });
    const count = Math.round(w * d * 2.2);
    for (let i = 0; i < count; i++) {
      parts.push({
        geometry: new IcosahedronGeometry(0.11 * (0.7 + rand() * 0.6), 0),
        color: flowers[Math.floor(rand() * flowers.length)]!,
        x: p.minX + 0.25 + rand() * (w - 0.5),
        y: 0.42,
        z: p.minZ + 0.25 + rand() * (d - 0.5),
      });
    }
    for (let i = 0; i < p.trees; i++) trees.push({ x, z: p.minZ + (d * (i + 0.5)) / p.trees, s: 2.6 + rand() * 0.6, r: rand() * 6 });
    for (let zz = p.minZ + 0.6; zz < p.maxZ - 0.4; zz += 1.6) bushes.push({ x: x + (rand() - 0.5) * (w - 0.8), z: zz, s: 1.3 + rand() * 0.4, r: rand() * 6 });
  }
  const mesh = new Mesh(mergeParts(parts), toyMaterial);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh, scatter('nature:plant_bushDetailed', bushes, 0.3));
  if (trees.length) group.add(scatter('nature:tree_oak', trees, 0.3));
  return group;
}

/** Trees, bushes, grass and flowers around the lot; a few buildings across the road. */
function scenery(layout: LocationLayout): Group {
  const group = new Group();
  const rand = seeded(7);
  const { lot, roadZ } = layout;
  const areas = Object.values(layout.areas);
  const blocked = (x: number, z: number, margin: number) =>
    inside(x, z, lot, margin + 0.8) ||
    Math.abs(z - roadZ) < 3.6 + margin ||
    inside(x, z, sideStreet(layout), margin) ||
    areas.some((a) => inside(x, z, a, margin));
  const kinds: { id: string; count: number; scale: [number, number]; margin: number; near?: number }[] = [
    { id: 'nature:tree_oak', count: 14, scale: [2.6, 3.4], margin: 1.6 },
    { id: 'nature:tree_default', count: 12, scale: [2.4, 3.2], margin: 1.6 },
    { id: 'nature:tree_fat', count: 8, scale: [2.4, 3], margin: 1.6 },
    { id: 'nature:tree_detailed', count: 8, scale: [2.4, 3], margin: 1.6 },
    { id: 'nature:plant_bushLarge', count: 14, scale: [1.6, 2.2], margin: 0.8, near: 4 },
    { id: 'nature:plant_bush', count: 18, scale: [1.6, 2.2], margin: 0.6, near: 3 },
    { id: 'nature:plant_bushDetailed', count: 10, scale: [1.6, 2], margin: 0.6, near: 3 },
    { id: 'nature:grass_large', count: 14, scale: [1.8, 2.6], margin: 0.3, near: 4 },
    { id: 'nature:grass', count: 18, scale: [1.8, 2.6], margin: 0.3, near: 6 },
    { id: 'nature:grass_leafs', count: 24, scale: [1.6, 2.2], margin: 0.3 },
    { id: 'nature:flower_redA', count: 9, scale: [1.6, 2], margin: 0.4, near: 4 },
    { id: 'nature:flower_yellowA', count: 9, scale: [1.6, 2], margin: 0.4, near: 4 },
    { id: 'nature:flower_purpleA', count: 7, scale: [1.6, 2], margin: 0.4, near: 4 },
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
  for (let x = -26; x <= 26; x += 3.2 + rand() * 1.5) {
    const z = roadZ - 4.6 - rand() * 1.5;
    const s = 2.6 + rand() * 0.8;
    const r = rand() * 6;
    if (!areas.some((a) => inside(x, z, a, 1.2))) row.push({ x, z, s, r });
  }
  group.add(scatter('nature:tree_oak', row));
  return group;
}

/** Bubble Lane and its pavements, from the lot's edge to past its far side. */
function sideStreet(layout: LocationLayout): Rect {
  return { minX: layout.lot.maxX, maxX: layout.sideStreetX + STREET + 1.4, minZ: layout.roadZ, maxZ: layout.lot.maxZ + 14 };
}

/** All static ground and scenery for a location. */
export function terrain(layout: LocationLayout, bayXs: number[], tunnelX: number | null): Group {
  const group = new Group();
  group.add(ground(layout), roads(layout), hedges(layout), planters(layout), scenery(layout));
  if (GRAPHICS.lot) group.add(lotSurface(layout, bayXs, tunnelX));
  return group;
}
