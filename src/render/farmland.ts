// The ground of a farm village (Chapter 2, Willowbrook): rolling meadows
// with hills beyond the farm, the village road and its verges, dirt tracks
// across the farm, the rail fence round it, the duck pond, trees, hedges
// and wildflowers, and the village houses, shops and chapel across the road.
import {
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  type Object3D,
} from 'three';
import type { FarmLayout, Rect } from '../core/config';
import { mergeParts, toyMaterial, type Part } from './models/build';
import { farmModel } from './models/farm';
import { townModel } from './models/town';
import { scatter, seeded } from './terrain';

const GRASS_A = new Color('#93d36a');
const GRASS_B = new Color('#72c058');
/** Sunny meadow patches, a little golden. */
const MEADOW = new Color('#b9d867');
const SIZE = 220;
/** Half the village lane's width: a narrow country road. */
const ROAD_HALF = 1.9;
const SEGMENTS = 88;

const ASPHALT = '#7b7f86';
const ROAD_EDGE = '#efe6cf';
const VERGE = '#d9bd8c';
const PAVEMENT = '#e4dccb';
const DIRT = '#d2ab74';
const RUT = '#b98f58';
const POST = '#8f6036';
const RAIL = '#c08a55';
const WATER_NEAR = '#6fd0e6';
const WATER = '#3fa9d6';
const SHORE = '#cdb98a';
const REED = '#6c9e3c';

const wobble = (x: number, z: number) =>
  Math.sin(x * 0.23 + z * 0.11) * 0.5 + Math.sin(x * 0.09 - z * 0.27) * 0.35 + Math.sin(x * 0.9 + z * 1.1) * 0.15;

function inside(x: number, z: number, r: Rect, margin = 0): boolean {
  return x > r.minX - margin && x < r.maxX + margin && z > r.minZ - margin && z < r.maxZ + margin;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * How far the countryside may rise here: 0 where the ground stays flat (the
 * farm, the road and the village along it, the pond), up to 1 a few metres out.
 */
function flatAt(layout: FarmLayout, x: number, z: number): number {
  const { lot, roadZ, pond } = layout;
  if (inside(x, z, pond, 2) || Object.values(layout.areas).some((a) => inside(x, z, a, 2))) return 0;
  const outside = Math.max(lot.minX - x, x - lot.maxX, lot.minZ - z, z - lot.maxZ, 0);
  // The road and the village make a flat strip right across, behind the farm.
  const behindVillage = z >= lot.minZ ? 1 : clamp01((roadZ - 16 - z) / 6);
  return Math.min(clamp01((outside - 1.5) / 6), behindVillage);
}

/** Height of the countryside: the hills, and gentle bumps everywhere else off the flat ground. */
export function heightAt(layout: FarmLayout, x: number, z: number): number {
  let h = Math.max(0, wobble(x, z)) * 0.35;
  for (const hill of layout.hills) {
    // A little flat top, room for something to stand on it (the windmill).
    const d = Math.max(0, Math.hypot(x - hill.x, z - hill.z) / hill.radius - 0.22) / 0.78;
    if (d < 1) h += hill.height * (0.5 + 0.5 * Math.cos(d * Math.PI));
  }
  return h * flatAt(layout, x, z);
}

function ground(layout: FarmLayout): Mesh {
  const geometry = new PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS).rotateX(-Math.PI / 2);
  const pos = geometry.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const n = wobble(x * 0.7, z * 0.7);
    c.copy(GRASS_A).lerp(GRASS_B, 0.5 + n * 0.5);
    // Golden meadow patches here and there, and a little sun on the hilltops.
    const meadow = Math.max(0, Math.sin(x * 0.11 + 1.3) * Math.sin(z * 0.13 - 0.4)) * 0.7;
    c.lerp(MEADOW, meadow);
    const y = heightAt(layout, x, z);
    c.lerp(MEADOW, Math.min(0.35, y * 0.12));
    colors.set([c.r, c.g, c.b], i * 3);
    pos.setY(i, y - 0.03);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new Mesh(geometry, new MeshLambertMaterial({ vertexColors: true }));
  mesh.receiveShadow = true;
  mesh.name = 'meadows';
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

/** The village road: warm grey with pale edge lines, a dirt verge on the farm's side and a pavement on the village's. */
function road(layout: FarmLayout): Mesh {
  const { roadZ, fenceZ } = layout;
  const half = ROAD_HALF;
  const parts: Part[] = [flat(SIZE, half * 2, ASPHALT, 0, roadZ, 0.02)];
  for (const side of [-1, 1]) parts.push(flat(SIZE, 0.14, ROAD_EDGE, 0, roadZ + side * (half - 0.3), 0.03));
  for (let x = -SIZE / 2 + 2; x < SIZE / 2; x += 4.4) parts.push(flat(1.8, 0.14, ROAD_EDGE, x, roadZ, 0.03));
  // The verge between the road and the farm's fence, where villagers walk.
  const verge = fenceZ - (roadZ + half);
  parts.push(flat(SIZE, verge + 0.6, VERGE, 0, roadZ + half + verge / 2, 0.015));
  parts.push(flat(SIZE, 1.6, PAVEMENT, 0, roadZ - half - 0.8, 0.025));
  parts.push({ geometry: new BoxGeometry(SIZE, 0.14, 0.24), color: '#f2ede2', x: 0, y: 0.07, z: roadZ - half - 0.05 });
  // Paths from the pavement to the village's doors.
  const from = roadZ - half - 1.6;
  for (const piece of layout.town) {
    if (!/^(house|shop)/.test(piece.model) && piece.model !== 'fm_chapel') continue;
    const to = piece.z + (piece.model === 'fm_chapel' ? 3.4 : 2.6);
    if (to < from) parts.push(flat(1.3, from - to, PAVEMENT, piece.x, (from + to) / 2, 0.02));
  }
  const mesh = new Mesh(mergeParts(parts), toyMaterial);
  mesh.receiveShadow = true;
  mesh.name = 'road';
  return mesh;
}

/** Dirt tracks across the farm, with two wheel ruts and a grassy crown where they run long. */
function tracks(layout: FarmLayout): Mesh {
  const parts: Part[] = [];
  for (const t of layout.tracks) {
    const w = t.maxX - t.minX;
    const d = t.maxZ - t.minZ;
    const x = (t.minX + t.maxX) / 2;
    const z = (t.minZ + t.maxZ) / 2;
    parts.push(flat(w, d, DIRT, x, z, 0.012));
    const alongX = w > d;
    for (const side of [-1, 1]) {
      const off = side * Math.min(w, d) * 0.27;
      parts.push(alongX ? flat(w - 0.4, 0.22, RUT, x, z + off, 0.016) : flat(0.22, d - 0.4, RUT, x + off, z, 0.016));
    }
  }
  // The farm yard in front of the gate.
  const { gate, fenceZ } = layout;
  parts.push(flat(gate.maxX - gate.minX + 1.6, 3.4, DIRT, (gate.minX + gate.maxX) / 2, fenceZ + 1.5, 0.011));
  const mesh = new Mesh(mergeParts(parts), toyMaterial);
  mesh.receiveShadow = true;
  mesh.name = 'tracks';
  return mesh;
}

/** The rail fence round the farm: a post every two metres, two rails, open at the gate. */
function fence(layout: FarmLayout): Mesh {
  const { fenceZ, gate, fenceSides: sides } = layout;
  const parts: Part[] = [];
  const rand = seeded(11);
  const run = (x0: number, z0: number, x1: number, z1: number) => {
    const length = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(length / 2));
    const angle = Math.atan2(z1 - z0, x1 - x0);
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      parts.push({ geometry: new BoxGeometry(0.16, 1.05 + rand() * 0.08, 0.16), color: POST, x: x0 + (x1 - x0) * k, y: 0.52, z: z0 + (z1 - z0) * k, ry: rand() * 0.2 });
    }
    for (const y of [0.45, 0.82]) {
      parts.push({ geometry: new BoxGeometry(length, 0.1, 0.07), color: RAIL, x: (x0 + x1) / 2, y, z: (z0 + z1) / 2, ry: -angle });
    }
  };
  // Along the road, open at the farm gate and at any side gates (the market's).
  const gaps = [gate, ...layout.sideGates].sort((a, b) => a.minX - b.minX);
  let from = sides.minX;
  for (const g of gaps) {
    if (g.minX > from) run(from, fenceZ, g.minX, fenceZ);
    from = g.maxX;
  }
  if (from < sides.maxX) run(from, fenceZ, sides.maxX, fenceZ);
  run(sides.minX, fenceZ, sides.minX, sides.maxZ);
  run(sides.maxX, fenceZ, sides.maxX, sides.maxZ);
  // Along the front, open where the track comes through.
  const track = layout.tracks[0]!;
  run(sides.minX, sides.maxZ, track.minX - 0.4, sides.maxZ);
  run(track.maxX + 0.4, sides.maxZ, sides.maxX, sides.maxZ);
  const mesh = new Mesh(mergeParts(parts), toyMaterial);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'fence';
  return mesh;
}

/** The duck pond: shallow water, a sandy shore, reeds and lily pads. */
function pond(layout: FarmLayout): { group: Group; ducks: Object3D[] } {
  const r = layout.pond;
  const cx = (r.minX + r.maxX) / 2;
  const cz = (r.minZ + r.maxZ) / 2;
  const rx = (r.maxX - r.minX) / 2;
  const rz = (r.maxZ - r.minZ) / 2;
  const ellipse = (sx: number, sz: number, color: string, y: number): Part => ({
    geometry: new CircleGeometry(1, 28).scale(sx, sz, 1),
    color,
    x: cx,
    y,
    z: cz,
    rx: -Math.PI / 2,
  });
  const rand = seeded(5);
  const parts: Part[] = [ellipse(rx + 0.7, rz + 0.6, SHORE, 0.02), ellipse(rx, rz, WATER_NEAR, 0.03), ellipse(rx * 0.72, rz * 0.66, WATER, 0.035)];
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    if (Math.sin(a) > 0.2) continue; // reeds on the far side, so the water shows
    const h = 0.6 + rand() * 0.6;
    parts.push({ geometry: new CylinderGeometry(0.03, 0.04, h, 4), color: REED, x: cx + Math.cos(a) * (rx + 0.15), y: h / 2, z: cz + Math.sin(a) * (rz + 0.1) });
    if (i % 3 === 0) parts.push({ geometry: new CylinderGeometry(0.06, 0.06, 0.22, 6), color: '#8a5a32', x: cx + Math.cos(a) * (rx + 0.15), y: h + 0.05, z: cz + Math.sin(a) * (rz + 0.1) });
  }
  for (let i = 0; i < 6; i++) {
    const a = rand() * Math.PI * 2;
    const d = 0.3 + rand() * 0.5;
    parts.push({ geometry: new CylinderGeometry(0.3, 0.3, 0.02, 10), color: i % 2 ? '#4fae4a' : '#62c25a', x: cx + Math.cos(a) * rx * d, y: 0.045, z: cz + Math.sin(a) * rz * d });
  }
  const group = new Group();
  const mesh = new Mesh(mergeParts(parts), toyMaterial);
  mesh.receiveShadow = true;
  group.add(mesh);
  const ducks = [0, 1, 2].map((i) => {
    const duck = farmModel('fm_duck');
    duck.position.set(cx + (i - 1) * rx * 0.4, 0.02, cz + (i % 2 ? 0.5 : -0.4));
    duck.userData.phase = i * 2.1;
    group.add(duck);
    return duck;
  });
  group.name = 'pond';
  return { group, ducks };
}

/** Trees round the countryside and along the road, orchard rows behind the farmhouse, bushes, flowers and rocks. */
function scenery(layout: FarmLayout): Group {
  const group = new Group();
  const rand = seeded(23);
  const { lot, roadZ, pond: water } = layout;
  const village = layout.town.filter((p) => !p.model.startsWith('fm_') || p.model === 'fm_chapel' || p.model === 'fm_windmill');
  const blocked = (x: number, z: number, margin: number) =>
    inside(x, z, lot, margin + 0.6) ||
    Math.abs(z - roadZ) < ROAD_HALF + 3.4 + margin ||
    inside(x, z, water, margin + 1) ||
    village.some((p) => Math.hypot(x - p.x, z - p.z) < 5 + margin);
  const kinds: { id: string; count: number; scale: [number, number]; margin: number; area: Rect }[] = [
    { id: 'nature:tree_oak', count: 26, scale: [2.6, 3.6], margin: 1.6, area: { minX: -60, maxX: 60, minZ: -60, maxZ: 30 } },
    { id: 'nature:tree_default', count: 22, scale: [2.4, 3.4], margin: 1.6, area: { minX: -60, maxX: 60, minZ: -60, maxZ: 30 } },
    { id: 'nature:tree_fat', count: 14, scale: [2.4, 3.2], margin: 1.6, area: { minX: -50, maxX: 50, minZ: -50, maxZ: 26 } },
    { id: 'nature:tree_detailed', count: 12, scale: [2.4, 3.2], margin: 1.6, area: { minX: -50, maxX: 50, minZ: -50, maxZ: 26 } },
    { id: 'nature:plant_bushLarge', count: 22, scale: [1.6, 2.4], margin: 0.8, area: { minX: -30, maxX: 30, minZ: -36, maxZ: 18 } },
    { id: 'nature:plant_bush', count: 24, scale: [1.6, 2.2], margin: 0.6, area: { minX: -30, maxX: 30, minZ: -36, maxZ: 18 } },
    { id: 'nature:grass_large', count: 30, scale: [1.8, 2.6], margin: 0.3, area: { minX: -28, maxX: 28, minZ: -34, maxZ: 16 } },
    { id: 'nature:grass', count: 30, scale: [1.8, 2.6], margin: 0.3, area: { minX: -28, maxX: 28, minZ: -34, maxZ: 16 } },
    { id: 'nature:flower_redA', count: 18, scale: [1.6, 2.2], margin: 0.3, area: { minX: -26, maxX: 26, minZ: -34, maxZ: 14 } },
    { id: 'nature:flower_yellowA', count: 22, scale: [1.6, 2.2], margin: 0.3, area: { minX: -26, maxX: 26, minZ: -34, maxZ: 14 } },
    { id: 'nature:flower_purpleA', count: 16, scale: [1.6, 2.2], margin: 0.3, area: { minX: -26, maxX: 26, minZ: -34, maxZ: 14 } },
    { id: 'nature:rock_smallA', count: 12, scale: [1.4, 2.2], margin: 0.4, area: { minX: -30, maxX: 30, minZ: -30, maxZ: 20 } },
    { id: 'nature:rock_largeA', count: 5, scale: [1.2, 1.8], margin: 1, area: { minX: -40, maxX: 40, minZ: -40, maxZ: 24 } },
  ];
  for (const kind of kinds) {
    const items: { x: number; z: number; s: number; r: number; y: number }[] = [];
    let tries = 0;
    while (items.length < kind.count && tries++ < kind.count * 80) {
      const { area } = kind;
      const x = area.minX + rand() * (area.maxX - area.minX);
      const z = area.minZ + rand() * (area.maxZ - area.minZ);
      if (blocked(x, z, kind.margin)) continue;
      items.push({ x, z, s: kind.scale[0] + rand() * (kind.scale[1] - kind.scale[0]), r: rand() * Math.PI * 2, y: heightAt(layout, x, z) });
    }
    group.add(...byHeight(kind.id, items));
  }
  // Wildflowers along the fence inside the farm, and a hedge of bushes outside it along the sides.
  const flowers: { x: number; z: number; s: number; r: number }[] = [];
  const { fenceSides: sides, fenceZ } = layout;
  for (let z = fenceZ + 1; z < sides.maxZ - 1; z += 1.3 + rand()) {
    for (const x of [sides.minX + 0.6, sides.maxX - 0.6]) if (!layout.town.some((p) => Math.hypot(p.x - x, p.z - z) < 1.2)) flowers.push({ x: x + (rand() - 0.5) * 0.4, z, s: 1.6 + rand() * 0.5, r: rand() * 6 });
  }
  group.add(scatter('nature:flower_yellowA', flowers.filter((_, i) => i % 3 === 0)), scatter('nature:flower_redA', flowers.filter((_, i) => i % 3 === 1)), scatter('nature:flower_purpleA', flowers.filter((_, i) => i % 3 === 2)));
  const hedge: { x: number; z: number; s: number; r: number }[] = [];
  for (let z = fenceZ + 0.5; z < sides.maxZ + 3; z += 1.5) for (const x of [sides.minX - 1.2, sides.maxX + 1.2]) if (!inside(x, z, water, 1.5)) hedge.push({ x, z, s: 1.8 + rand() * 0.5, r: rand() * 6 });
  group.add(scatter('nature:plant_bushDetailed', hedge, 0.1));
  // Trees along the far side of the road, in front of the village.
  const row: { x: number; z: number; s: number; r: number }[] = layout.streetTrees.map((t) => ({ ...t, s: 2.8 + rand() * 0.6, r: rand() * 6 }));
  group.add(scatter('nature:tree_oak', row));
  return group;
}

/** Grass tufts and wildflowers on the farm's own grass, kept off the fields, tracks, pads and the stand's line. */
function farmGrass(layout: FarmLayout): Object3D[] {
  const rand = seeded(31);
  const { lot } = layout;
  const keepOff: Rect[] = [...Object.values(layout.areas), ...layout.tracks];
  for (const spot of Object.values(layout.counters)) {
    const last = spot.queue[spot.queue.length - 1]!;
    // The stand itself, its line, and the way villagers come round to it.
    keepOff.push({ minX: spot.zone.minX - 1.4, maxX: spot.zone.maxX + 1.4, minZ: spot.zone.minZ - 1.6, maxZ: spot.window.z + 0.6 });
    keepOff.push({ minX: Math.min(spot.window.x, spot.approach.x) - 0.9, maxX: Math.max(spot.window.x, spot.approach.x) + 0.9, minZ: layout.fenceZ - 1, maxZ: last.z + 1 });
  }
  const points = [...Object.values(layout.pads), ...Object.values(layout.upgradePads), ...Object.values(layout.piles), ...Object.values(layout.staffSpots)];
  const pieces = layout.town.filter((p) => inside(p.x, p.z, lot, 2));
  const free = (x: number, z: number) =>
    !keepOff.some((r) => inside(x, z, r, 0.4)) &&
    !points.some((p) => Math.hypot(p.x - x, p.z - z) < 1.9) &&
    !pieces.some((p) => Math.hypot(p.x - x, p.z - z) < (p.solid ? Math.max(...p.solid) + 1 : 1.1));
  const kinds: [string, number][] = [
    ['nature:grass', 34],
    ['nature:grass_large', 16],
    ['nature:flower_yellowA', 12],
    ['nature:flower_redA', 9],
    ['nature:flower_purpleA', 9],
  ];
  return kinds.map(([id, count]) => {
    const items: { x: number; z: number; s: number; r: number }[] = [];
    for (let tries = 0; items.length < count && tries < count * 60; tries++) {
      const x = lot.minX + 0.8 + rand() * (lot.maxX - lot.minX - 1.6);
      const z = layout.fenceZ + 0.8 + rand() * (lot.maxZ - layout.fenceZ - 1.6);
      if (free(x, z)) items.push({ x, z, s: 1.4 + rand() * 0.7, r: rand() * Math.PI * 2 });
    }
    return scatter(id, items);
  });
}

/** Scatters items standing on the hills: each copy is placed at its own height. */
function byHeight(id: string, items: { x: number; z: number; s: number; r: number; y: number }[]): Object3D[] {
  const mesh = scatter(id, items);
  // scatter() places everything at one height; lift each copy onto the ground under it.
  const m = mesh.instanceMatrix.array as Float32Array;
  items.forEach((item, i) => (m[i * 16 + 13] = item.y - 0.05));
  mesh.instanceMatrix.needsUpdate = true;
  return [mesh];
}

export interface Farmland {
  readonly group: Group;
  /** Ducks paddle about. */
  update(dt: number): void;
}

/** All the static ground and scenery of a farm village. */
export function farmland(layout: FarmLayout): Farmland {
  const group = new Group();
  const water = pond(layout);
  // The town's pieces stand on the flat, apart from any on a hilltop (the old windmill), which are lifted onto it.
  const onHills = layout.town.filter((p) => heightAt(layout, p.x, p.z) > 0.05);
  const village = townModel({ ...layout, town: layout.town.filter((p) => !onHills.includes(p)) });
  const lifted = onHills.map((p) => {
    const model = farmModel(p.model);
    model.position.set(p.x, heightAt(layout, p.x, p.z) - 0.05, p.z);
    model.rotation.y = p.rot ?? 0;
    model.traverse((node) => (node.castShadow = node.receiveShadow = true));
    return model;
  });
  group.add(ground(layout), road(layout), tracks(layout), fence(layout), water.group, scenery(layout), ...farmGrass(layout), village, ...lifted);
  let time = 0;
  const { pond: r } = layout;
  const cx = (r.minX + r.maxX) / 2;
  const cz = (r.minZ + r.maxZ) / 2;
  return {
    group,
    update(dt) {
      time += dt;
      water.ducks.forEach((duck, i) => {
        // Slow circles round the pond, bobbing.
        const a = time * 0.18 + (duck.userData.phase as number);
        duck.position.set(cx + Math.cos(a) * (r.maxX - r.minX) * 0.28, 0.02 + Math.sin(time * 2 + i) * 0.02, cz + Math.sin(a) * (r.maxZ - r.minZ) * 0.22);
        duck.rotation.y = -a + (i % 2 ? Math.PI : 0);
      });
    },
  };
}
