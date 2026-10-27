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

/** Open hand-wash bay: floor slab with a gantry frame. */
export function bayModel(width: number, length: number): Mesh {
  return cached(`bay:${width}:${length}`, () => {
    const parts: Part[] = [{ geometry: box(width, 0.08, length), color: SLAB, y: 0.04 }];
    const hx = width / 2 - 0.12;
    const hz = length / 2 - 0.12;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) parts.push({ geometry: box(0.24, 2.6, 0.24), color: WHITE, x: sx * hx, y: 1.3, z: sz * hz });
      parts.push({ geometry: box(0.3, 0.3, length), color: PINK, x: sx * hx, y: 2.6 });
      // Stripe on the floor edge.
      parts.push({ geometry: box(0.14, 0.1, length - 0.6), color: BLUE, x: sx * (width / 2 - 0.4), y: 0.06 });
    }
    parts.push({ geometry: box(width, 0.35, 0.3), color: BLUE, y: 2.75, z: -hz });
    return parts;
  });
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
