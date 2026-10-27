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

/** Open hand-wash bay: concrete slab, drain grate, striped arches at both ends, bucket. */
export function bayModel(width: number, length: number): Mesh {
  return cached(`bay:${width}:${length}`, () => {
    const parts: Part[] = [
      { geometry: box(width + 0.3, 0.1, length + 0.3), color: '#aeb6c2', y: 0.05 },
      { geometry: box(width, 0.12, length), color: '#e3e8ee', y: 0.07 },
    ];
    // Drain grate down the middle.
    for (let i = -3; i <= 3; i++) parts.push({ geometry: box(0.7, 0.13, 0.08), color: '#8b95a3', y: 0.075, z: i * 0.18 });
    const hx = width / 2 + 0.05;
    for (const sz of [-1, 1]) {
      const z = sz * (length / 2 - 0.15);
      for (const sx of [-1, 1]) {
        parts.push({ geometry: cylinder(0.16, 2.7, 12), color: WHITE, x: sx * hx, y: 1.35, z });
        parts.push({ geometry: cylinder(0.24, 0.16, 12), color: '#aeb6c2', x: sx * hx, y: 0.08, z });
      }
      // Arch beam with candy stripes.
      parts.push({ geometry: box(width + 0.5, 0.42, 0.36), color: sz < 0 ? BLUE : PINK, y: 2.82, z });
      for (let i = 0; i < 5; i++) {
        const x = -width / 2 + 0.2 + (i * (width - 0.4)) / 4;
        parts.push({ geometry: box(0.28, 0.44, 0.38), color: WHITE, x, y: 2.82, z });
      }
    }
    // Side rails joining the arches.
    for (const sx of [-1, 1]) parts.push({ geometry: box(0.14, 0.14, length - 0.3), color: WHITE, x: sx * hx, y: 2.55 });
    // Bucket with a sponge in the corner.
    parts.push({ geometry: cylinder(0.26, 0.42, 12), color: YELLOW, x: hx - 0.55, y: 0.33, z: length / 2 - 0.55 });
    parts.push({ geometry: cylinder(0.2, 0.05, 12), color: '#bfe9ff', x: hx - 0.55, y: 0.54, z: length / 2 - 0.55 });
    parts.push({ geometry: box(0.3, 0.14, 0.2), color: PINK, x: hx - 0.5, y: 0.6, z: length / 2 - 0.5, ry: 0.4 });
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
