// Graybox models for everything the player builds. Replaced in the art pass.
import { BufferGeometry, Mesh } from 'three';
import { box, cylinder, mergeParts, sphere, toyMaterial, type Part } from './build';

const WHITE = '#f4f7fb';
const PINK = '#ff8fc8';
const BLUE = '#6cc4ff';
const MINT = '#7ee0c3';
const YELLOW = '#ffd85c';
const SLAB = '#c9d6e3';
const DARK = '#4a5566';

const cache = new Map<string, BufferGeometry>();

function cached(key: string, build: () => Part[]): Mesh {
  let geometry = cache.get(key);
  if (!geometry) {
    geometry = mergeParts(build());
    cache.set(key, geometry);
  }
  return new Mesh(geometry, toyMaterial);
}

/** Garden hose: post with a reel. */
export function hoseModel(): Mesh {
  return cached('hose', () => [
    { geometry: box(0.9, 0.12, 0.9), color: SLAB, y: 0.06 },
    { geometry: box(0.22, 1.5, 0.22), color: WHITE, y: 0.75 },
    { geometry: cylinder(0.42, 0.24, 16), color: BLUE, y: 1.05, z: 0.22, rx: Math.PI / 2 },
    { geometry: cylinder(0.18, 0.28, 12), color: MINT, y: 1.05, z: 0.24, rx: Math.PI / 2 },
  ]);
}

/** Cash register counter. */
export function registerModel(): Mesh {
  return cached('register', () => [
    { geometry: box(2, 1, 0.9), color: MINT, y: 0.5 },
    { geometry: box(2.1, 0.12, 1), color: WHITE, y: 1.06 },
    { geometry: box(0.7, 0.45, 0.5), color: DARK, y: 1.35, z: 0.05 },
    { geometry: box(0.5, 0.06, 0.3), color: YELLOW, y: 1.6, z: 0.05 },
  ]);
}

/** Supply shelf with soap bottles. */
export function shelfModel(): Mesh {
  return cached('shelf', () => {
    const parts: Part[] = [
      { geometry: box(2.2, 0.1, 0.8), color: WHITE, y: 0.05 },
      { geometry: box(2.2, 0.1, 0.8), color: WHITE, y: 0.85 },
      { geometry: box(2.2, 0.1, 0.8), color: WHITE, y: 1.65 },
    ];
    for (const sx of [-1, 1]) parts.push({ geometry: box(0.1, 1.7, 0.8), color: WHITE, x: sx * 1.05, y: 0.85 });
    const colors = [PINK, BLUE, MINT, YELLOW];
    for (let i = 0; i < 4; i++) {
      const x = -0.75 + i * 0.5;
      parts.push({ geometry: cylinder(0.16, 0.55), color: colors[i]!, x, y: 0.38 });
      parts.push({ geometry: cylinder(0.16, 0.55), color: colors[(i + 2) % 4]!, x, y: 1.18 });
      parts.push({ geometry: sphere(0.08, 8), color: WHITE, x, y: 1.5 });
    }
    return parts;
  });
}

/** Gantry over the finishing lane (dryer, wax): posts at the four corners and a top frame. */
function gantry(width: number, length: number, beam: string): Part[] {
  const parts: Part[] = [
    { geometry: box(width + 0.3, 0.1, length + 0.3), color: '#aeb6c2', y: 0.05 },
    { geometry: box(width, 0.12, length), color: '#e3e8ee', y: 0.07 },
  ];
  const hx = width / 2 + 0.05;
  const hz = length / 2 - 0.15;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) parts.push({ geometry: cylinder(0.16, 2.8, 12), color: WHITE, x: sx * hx, y: 1.4, z: sz * hz });
    parts.push({ geometry: box(0.3, 0.32, length), color: beam, x: sx * hx, y: 2.85 });
  }
  for (const sz of [-1, 1]) parts.push({ geometry: box(width + 0.4, 0.32, 0.3), color: beam, y: 2.85, z: sz * hz });
  return parts;
}

/** Dryer: blue gantry with two big blower nozzles and a towel rack. */
export function dryerModel(width: number, length: number): Mesh {
  return cached(`dryer:${width}:${length}`, () => {
    const parts = gantry(width, length, BLUE);
    for (const sx of [-1, 1]) {
      parts.push({ geometry: cylinder(0.42, 0.9, 16), color: '#d9e6f2', x: sx * (width / 2 - 0.25), y: 1.6, rz: Math.PI / 2 });
      parts.push({ geometry: cylinder(0.3, 0.12, 16), color: '#5a6b80', x: sx * (width / 2 - 0.72), y: 1.6, rz: Math.PI / 2 });
    }
    parts.push({ geometry: box(width - 0.4, 0.5, 0.5), color: '#d9e6f2', y: 2.45 });
    // Towel rack by the worker's side.
    parts.push({ geometry: box(0.1, 1, 0.9), color: WHITE, x: -width / 2 - 0.55, y: 0.5, z: length / 2 - 0.5 });
    for (let i = 0; i < 3; i++) parts.push({ geometry: box(0.36, 0.08, 0.7), color: [PINK, MINT, YELLOW][i]!, x: -width / 2 - 0.55, y: 0.3 + i * 0.25, z: length / 2 - 0.5 });
    return parts;
  });
}

/** Waxing station: golden gantry with spinning buffer pads either side. */
export function waxModel(width: number, length: number): Mesh {
  return cached(`wax:${width}:${length}`, () => {
    const parts = gantry(width, length, '#ffc94d');
    for (const sx of [-1, 1]) {
      parts.push({ geometry: box(0.14, 1.6, 0.14), color: '#8b95a3', x: sx * (width / 2 - 0.15), y: 1.1 });
      parts.push({ geometry: cylinder(0.5, 0.3, 16), color: '#fff3c4', x: sx * (width / 2 - 0.4), y: 1.0, rz: Math.PI / 2 });
    }
    parts.push({ geometry: box(0.9, 0.5, 0.2), color: '#ffc94d', y: 3.3, z: -length / 2 + 0.15 });
    return parts;
  });
}

/** Waiting bench beside the queue. */
export function benchModel(): Mesh {
  return cached('bench', () => [
    { geometry: box(2.2, 0.12, 0.6), color: '#c98a52', y: 0.5 },
    { geometry: box(2.2, 0.5, 0.1), color: '#c98a52', y: 0.85, z: -0.28 },
    { geometry: box(0.12, 0.5, 0.5), color: '#7a5434', x: -0.95, y: 0.25 },
    { geometry: box(0.12, 0.5, 0.5), color: '#7a5434', x: 0.95, y: 0.25 },
    { geometry: cylinder(0.3, 0.1, 12), color: '#cfeeff', x: 1.5, y: 0.05 },
  ]);
}
