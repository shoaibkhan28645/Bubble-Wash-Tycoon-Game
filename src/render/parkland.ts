// The ground of the theme park (Chapter 3): bright lawns, the road along the
// top with its pavements, cream paths looping through the park and the
// entrance plaza's pastel squares, a clipped hedge all round (open at the
// gate), the park's arch, lamps, trees, flower beds, and the town's shops
// across the road. Static, merged into a few meshes.
import { BoxGeometry, Color, Float32BufferAttribute, Group, IcosahedronGeometry, Matrix4, Mesh, MeshLambertMaterial, PlaneGeometry, Quaternion, Vector3, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ParkLayout, Rect } from '../core/config';
import { mergeParts, toyMaterial, type Part } from './models/build';
import { plain } from './assets';
import { parkPiece, signedModel, type Spinners } from './models/park';
import { townModel } from './models/town';
import { scatter, seeded } from './terrain';

const SIZE = 220;
const SEGMENTS = 110;
const GRASS_A = new Color('#8ad67d');
const GRASS_B = new Color('#78c96e');
const ASPHALT = '#646b77';
const PAVEMENT = '#e9dfcf';
const KERB = '#cdd2d9';
const DASH = '#ffffff';
const PATH = '#f6e3c6';
const PATH_EDGE = '#e4c79e';
const CHECK_A = '#ffc9e1';
const CHECK_B = '#fff1de';
const HEDGE = '#4fa95a';
const HEDGE_LIGHT = '#61bd68';
/** Half the road's width, kerb to kerb. */
const ROAD_HALF = 2.5;

const flat = (w: number, d: number, color: string, x: number, z: number, y: number): Part => ({
  geometry: new PlaneGeometry(w, d).rotateX(-Math.PI / 2),
  color,
  x,
  y,
  z,
});

/** Gently mottled lawn everywhere. */
function lawn(): Mesh {
  const geometry = new PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS).rotateX(-Math.PI / 2);
  const pos = geometry.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const n = Math.sin(x * 0.21 + Math.cos(z * 0.17)) * Math.cos(z * 0.19 - Math.sin(x * 0.13));
    c.copy(GRASS_A).lerp(GRASS_B, 0.5 + n * 0.5);
    colors.set([c.r, c.g, c.b], i * 3);
    pos.setY(i, -0.02);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const mesh = new Mesh(geometry, new MeshLambertMaterial({ vertexColors: true }));
  mesh.receiveShadow = true;
  mesh.name = 'lawn';
  return mesh;
}

/** The road, its dashes and kerbs, the pavements on both sides; the paths, the plaza's squares. */
function paving(layout: ParkLayout): Mesh {
  const { roadZ } = layout;
  const parts: Part[] = [];
  parts.push(flat(SIZE, ROAD_HALF * 2, ASPHALT, 0, roadZ, 0.01));
  for (let x = -SIZE / 2 + 2; x < SIZE / 2; x += 4) parts.push(flat(2, 0.18, DASH, x, roadZ, 0.02));
  for (const side of [-1, 1]) {
    parts.push({ geometry: new BoxGeometry(SIZE, 0.14, 0.25), color: KERB, x: 0, y: 0.07, z: roadZ + side * (ROAD_HALF + 0.12) });
    parts.push(flat(SIZE, 2.0, PAVEMENT, 0, roadZ + side * (ROAD_HALF + 1.25), 0.06));
  }
  // Each path: a darker edge, then the paving.
  layout.paths.forEach((p, i) => {
    const w = p.maxX - p.minX;
    const d = p.maxZ - p.minZ;
    const x = (p.minX + p.maxX) / 2;
    const z = (p.minZ + p.maxZ) / 2;
    // Paths cross each other: each a hair higher than the last, so their tops never fight.
    const y = 0.025 + i * 0.0015;
    parts.push(flat(w + 0.3, d + 0.3, PATH_EDGE, x, z, y));
    parts.push(flat(w, d, PATH, x, z, y + 0.012));
  });
  // The service yard's concrete, and the drive in from the road.
  for (const r of layout.yard) parts.push(flat(r.maxX - r.minX, r.maxZ - r.minZ, '#cfd6de', (r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2, 0.02));
  // The plaza: pink and cream squares, 2 m.
  const { plaza } = layout;
  parts.push(flat(plaza.maxX - plaza.minX + 0.3, plaza.maxZ - plaza.minZ + 0.3, '#f0bcd6', (plaza.minX + plaza.maxX) / 2, (plaza.minZ + plaza.maxZ) / 2, 0.05));
  for (let x = plaza.minX; x < plaza.maxX - 0.01; x += 2) {
    for (let z = plaza.minZ; z < plaza.maxZ - 0.01; z += 2) {
      const odd = (Math.round((x - plaza.minX) / 2) + Math.round((z - plaza.minZ) / 2)) % 2 === 1;
      parts.push(flat(Math.min(2, plaza.maxX - x), Math.min(2, plaza.maxZ - z), odd ? CHECK_A : CHECK_B, x + 1, z + 1, 0.062));
    }
  }
  const mesh = new Mesh(mergeParts(parts), toyMaterial);
  mesh.receiveShadow = true;
  mesh.name = 'paving';
  return mesh;
}

/** The clipped hedge round the park: along the road (open at the gate), down both sides and along the back; bumpy tops. */
function hedges(layout: ParkLayout): Mesh {
  const parts: Part[] = [];
  const rand = seeded(7);
  const { hedgeZ, gate, hedgeSides: sides } = layout;
  const run = (x0: number, z0: number, x1: number, z1: number) => {
    const length = Math.hypot(x1 - x0, z1 - z0);
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    parts.push({ geometry: new BoxGeometry(alongX ? length : 0.8, 0.85, alongX ? 0.8 : length), color: HEDGE, x: (x0 + x1) / 2, y: 0.425, z: (z0 + z1) / 2 });
    for (let t = 0.3; t < length; t += 0.6) {
      const k = t / length;
      parts.push({
        geometry: new IcosahedronGeometry(0.42 + rand() * 0.08, 0),
        color: rand() < 0.5 ? HEDGE : HEDGE_LIGHT,
        x: x0 + (x1 - x0) * k,
        y: 0.8,
        z: z0 + (z1 - z0) * k,
      });
    }
  };
  // Along the road: open at the service gate and at the park's gate.
  const service = layout.serviceGate;
  run(sides.minX, hedgeZ, service.minX, hedgeZ);
  run(service.maxX, hedgeZ, gate.minX - 0.6, hedgeZ);
  run(gate.maxX + 0.6, hedgeZ, sides.maxX, hedgeZ);
  run(sides.minX, hedgeZ, sides.minX, sides.maxZ);
  run(sides.maxX, hedgeZ, sides.maxX, sides.maxZ);
  run(sides.minX, sides.maxZ, sides.maxX, sides.maxZ);
  const mesh = new Mesh(mergeParts(parts), toyMaterial);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'hedge';
  return mesh;
}

/** One model placed many times, merged into one mesh (lamps, flower beds, rope posts). */
export function copies(name: string, at: { x: number; z: number; rot?: number; scaleX?: number }[]): Mesh {
  const base = parkPiece(name);
  base.updateMatrixWorld(true);
  const inverseBase = new Matrix4().copy(base.matrixWorld).invert();
  const place = new Matrix4();
  const pieces: BufferGeometry[] = [];
  for (const p of at) {
    place.compose(new Vector3(p.x, 0, p.z), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), p.rot ?? 0), new Vector3(p.scaleX ?? 1, 1, 1));
    base.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const local = new Matrix4().multiplyMatrices(inverseBase, node.matrixWorld);
      pieces.push(plain(node.geometry as BufferGeometry).applyMatrix4(new Matrix4().multiplyMatrices(place, local)));
    });
  }
  const geometry = mergeGeometries(pieces);
  for (const piece of pieces) piece.dispose();
  if (!geometry) throw new Error(`Could not merge ${name}`);
  const mesh = new Mesh(geometry, toyMaterial);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.name = name;
  return mesh;
}

/** Shrubs dotted round the outside of the hedge and across the road, kept off the paths and the road. */
function scenery(layout: ParkLayout): Group {
  const group = new Group();
  const rand = seeded(29);
  const { lot, roadZ } = layout;
  const off = (x: number, z: number, margin: number, rects: Rect[]) =>
    rects.some((r) => x > r.minX - margin && x < r.maxX + margin && z > r.minZ - margin && z < r.maxZ + margin);
  const trees = layout.trees.map((t) => ({ x: t.x, z: t.z, s: 2.6 * (t.size ?? 1), r: rand() * 6 }));
  group.add(scatter('nature:tree_oak', trees.filter((_, i) => i % 2 === 0)), scatter('nature:tree_default', trees.filter((_, i) => i % 2 === 1)));
  group.add(scatter('nature:tree_oak', layout.streetTrees.map((t) => ({ ...t, s: 2.8 + rand() * 0.6, r: rand() * 6 }))));
  // Woods beyond the park's sides and back.
  const outside: { x: number; z: number; s: number; r: number }[] = [];
  let tries = 0;
  while (outside.length < 70 && tries++ < 4000) {
    const x = -70 + rand() * 150;
    const z = roadZ - 30 + rand() * 100;
    if (off(x, z, 2.5, [lot]) || Math.abs(z - roadZ) < ROAD_HALF + 8 || (z < roadZ && Math.abs(x) < 50)) continue;
    outside.push({ x, z, s: 2.4 + rand() * 1.2, r: rand() * 6 });
  }
  group.add(scatter('nature:tree_fat', outside.filter((_, i) => i % 3 === 0)), scatter('nature:tree_detailed', outside.filter((_, i) => i % 3 === 1)), scatter('nature:tree_oak', outside.filter((_, i) => i % 3 === 2)));
  // Flowers along the inside of the hedge.
  const flowers: { x: number; z: number; s: number; r: number }[] = [];
  const { hedgeSides: sides, hedgeZ } = layout;
  for (let z = hedgeZ + 2; z < sides.maxZ - 1; z += 1.4 + rand()) {
    for (const x of [sides.minX + 0.9, sides.maxX - 0.9]) if (!off(x, z, 0.4, layout.paths)) flowers.push({ x: x + (rand() - 0.5) * 0.3, z, s: 1.5 + rand() * 0.5, r: rand() * 6 });
  }
  group.add(scatter('nature:flower_yellowA', flowers.filter((_, i) => i % 3 === 0)), scatter('nature:flower_redA', flowers.filter((_, i) => i % 3 === 1)), scatter('nature:flower_purpleA', flowers.filter((_, i) => i % 3 === 2)));
  return group;
}

/** All the static ground of the park; the arch's star turns. */
export function parkland(layout: ParkLayout, spinners: Spinners): Group {
  const group = new Group();
  const gate = signedModel('pk_gate');
  gate.position.set((layout.gate.minX + layout.gate.maxX) / 2, 0, layout.hedgeZ);
  gate.traverse((node) => (node.castShadow = node.receiveShadow = true));
  spinners.watch(gate);
  const village = townModel(layout);
  group.add(
    lawn(),
    paving(layout),
    hedges(layout),
    gate,
    copies('pk_lamp', layout.lamps),
    copies('pk_flowers', layout.flowerBeds),
    scenery(layout),
    village,
  );
  return group;
}

/** The queue ropes of rides: posts and a sagging rope from each point to the next. */
export function ropes(segments: { x: number; z: number }[][]): Mesh {
  const posts = segments.flatMap((pair) => {
    const [a, b] = pair;
    if (!a || !b) return [];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    return [{ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, rot: -Math.atan2(b.z - a.z, b.x - a.x), scaleX: length / 2 }];
  });
  return copies('pk_rope', posts);
}
