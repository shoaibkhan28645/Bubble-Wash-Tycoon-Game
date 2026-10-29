// The Mini-Mart across the road: a little shop with a big window full of
// snacks, a striped awning, and its till out front where drivers are served.
import { Group, Mesh, PlaneGeometry, type BufferGeometry } from 'three';
import { box, cylinder, mergeParts, rbox, sphere, toyMaterial, type Part } from './build';
import { C, plate } from './kit';

const WIDTH = 4.6;
const DEPTH = 3.6;
const WALL = 2.6;
/** How far in front of the shop (its +z face) the till stands, from the shop's middle. */
export const MART_TILL_Z = 3.6;

let geometry: BufferGeometry | null = null;

/** Centred on the shop; the till stands out front (towards +z). */
export function martModel(): Group {
  geometry ??= mergeParts(martParts());
  const group = new Group();
  const sign = plate('MINI MART', 3.2, 0.7, '#ff5fa8', false);
  sign.position.set(0, WALL + 0.75, DEPTH / 2 + 0.08);
  group.add(new Mesh(geometry, toyMaterial), sign);
  return group;
}

function martParts(): Part[] {
  const hw = WIDTH / 2;
  const hd = DEPTH / 2;
  const parts: Part[] = [
    // Paving from the forecourt's edge out to the pavement by the road.
    { geometry: new PlaneGeometry(WIDTH + 1.2, DEPTH + 3.9), color: '#d9d2c4', y: 0.016, z: 1.95, rx: -Math.PI / 2 },
    { geometry: box(WIDTH + 0.3, 0.12, DEPTH + 0.3), color: C.kerb, y: 0.06 },
    // Back and side walls, with a mint band along the bottom.
    { geometry: rbox(WIDTH, WALL, 0.2, 0.05), color: C.white, y: WALL / 2, z: -hd + 0.1 },
    ...[-1, 1].map((sx) => ({ geometry: rbox(0.2, WALL, DEPTH, 0.05), color: C.white, x: sx * (hw - 0.1), y: WALL / 2 })),
    ...[-1, 1].map((sx) => ({ geometry: box(0.24, 0.5, DEPTH + 0.02), color: C.mint, x: sx * (hw - 0.1), y: 0.37 })),
    // Front: a door on the left, and a big window full of snacks.
    { geometry: rbox(WIDTH, 0.5, 0.2, 0.05), color: C.mint, y: 0.37, z: hd - 0.1 },
    { geometry: rbox(WIDTH, 0.5, 0.2, 0.05), color: C.white, y: WALL - 0.25, z: hd - 0.1 },
    { geometry: rbox(0.9, 1.9, 0.12, 0.04), color: C.pink, x: -hw + 0.75, y: 1.05, z: hd - 0.05 },
    { geometry: sphere(0.06, 8), color: C.yellow, x: -hw + 1.05, y: 1.05, z: hd + 0.03 },
    { geometry: box(2.9, 1.5, 0.08), color: '#bfe3f7', x: 0.55, y: 1.37, z: hd - 0.08 },
    { geometry: box(0.12, 1.6, 0.14), color: C.white, x: 0.55, y: 1.37, z: hd - 0.05 },
    // Roof with a lip, and the sign's posts.
    { geometry: rbox(WIDTH + 0.4, 0.24, DEPTH + 0.4, 0.06), color: C.pink, y: WALL + 0.12 },
    { geometry: rbox(WIDTH + 0.2, 0.1, DEPTH + 0.2, 0.04), color: C.white, y: WALL + 0.29 },
    ...[-1, 1].map((sx) => ({ geometry: rbox(0.1, 0.5, 0.1, 0.03), color: C.white, x: sx * 1.1, y: WALL + 0.5, z: hd })),
  ];
  // Snacks on the shelves behind the window: rows of little coloured packets.
  const colours = [C.red, C.yellow, C.blue, C.mint, C.lilac, C.gold];
  for (let row = 0; row < 3; row++) {
    parts.push({ geometry: box(2.7, 0.04, 0.3), color: C.white, x: 0.55, y: 0.85 + row * 0.42, z: hd - 0.3 });
    for (let i = 0; i < 7; i++) {
      parts.push({ geometry: box(0.22, 0.28, 0.12), color: colours[(i + row * 2) % colours.length]!, x: -0.65 + i * 0.4, y: 1.0 + row * 0.42, z: hd - 0.3 });
    }
  }
  // Striped awning sloping out over the till.
  const stripes = 8;
  for (let i = 0; i < stripes; i++) {
    const x = -hw + (WIDTH / stripes) * (i + 0.5);
    parts.push({ geometry: box(WIDTH / stripes + 0.01, 0.06, 1.6), color: i % 2 ? C.white : C.pink, x, y: WALL - 0.45, z: hd + 0.75, rx: 0.32 });
  }
  // The till: a counter with the register, a jar of lollies and a rack of crisps.
  const till = MART_TILL_Z;
  parts.push({ geometry: rbox(2.2, 0.9, 0.6, 0.08), color: C.mint, y: 0.45, z: till });
  parts.push({ geometry: rbox(2.3, 0.08, 0.7, 0.03), color: C.white, y: 0.94, z: till });
  parts.push({ geometry: rbox(0.5, 0.26, 0.36, 0.05), color: C.dark, x: 0.45, y: 1.11, z: till - 0.05 });
  parts.push({ geometry: box(0.36, 0.2, 0.04), color: '#9fe3ff', x: 0.45, y: 1.34, z: till - 0.18, rx: -0.3 });
  parts.push({ geometry: cylinder(0.13, 0.26, 10), color: '#cfeeff', x: -0.15, y: 1.11, z: till });
  parts.push({ geometry: cylinder(0.09, 0.12, 10), color: C.red, x: -0.15, y: 1.06, z: till });
  for (let i = 0; i < 3; i++) parts.push({ geometry: box(0.18, 0.24, 0.1), color: colours[i]!, x: -0.75 + i * 0.2, y: 1.1, z: till + 0.12 });
  return parts;
}
