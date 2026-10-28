// Props around the lot: hose reel, pay kiosk, supply shelf, bench, vending
// machine, roadside sign and the truck to the next town.
import { Group, Mesh, TorusGeometry, type BufferGeometry, type Object3D } from 'three';
import { mergedModel } from '../assets';
import { box, cylinder, mergeParts, rbox, sphere, toyMaterial, type Part } from './build';
import { C, plate } from './kit';

const cache = new Map<string, BufferGeometry>();

function cached(key: string, build: () => Part[]): Mesh {
  let geometry = cache.get(key);
  if (!geometry) {
    geometry = mergeParts(build());
    cache.set(key, geometry);
  }
  return new Mesh(geometry, toyMaterial);
}

/** Garden hose on a wheeled reel, with a puddle under the nozzle. */
export function hoseModel(): Mesh {
  return cached('hose', () => [
    { geometry: cylinder(0.5, 0.02, 16), color: '#a9cfe6', x: 0.25, y: 0.01, z: 0.3 },
    { geometry: rbox(0.8, 0.14, 0.6, 0.05), color: C.blue, y: 0.25 },
    ...[-1, 1].map((sx) => ({ geometry: cylinder(0.16, 0.1, 12), color: C.dark, x: sx * 0.42, y: 0.16, z: -0.15, rz: Math.PI / 2 })),
    ...[-1, 1].map((sx) => ({ geometry: rbox(0.08, 0.9, 0.12, 0.03), color: C.white, x: sx * 0.32, y: 0.75 })),
    { geometry: cylinder(0.12, 0.6, 10), color: C.white, y: 1.05, rz: Math.PI / 2 },
    { geometry: new TorusGeometry(0.28, 0.08, 6, 16), color: C.yellow, y: 1.05, ry: Math.PI / 2 },
    { geometry: new TorusGeometry(0.2, 0.07, 6, 16), color: C.yellow, y: 1.05, ry: Math.PI / 2, x: 0.12 },
    { geometry: rbox(0.12, 0.34, 0.16, 0.04), color: C.dark, x: 0.3, y: 0.55, z: 0.32 },
  ]);
}

/** Pay kiosk: rounded counter, till with a screen, and a candy-striped awning. */
export function registerModel(): Mesh {
  return cached('register', () => {
    const parts: Part[] = [
      { geometry: rbox(2, 1, 0.9, 0.12), color: C.mint, y: 0.5 },
      { geometry: rbox(2.12, 0.12, 1.02, 0.05), color: C.white, y: 1.06 },
      { geometry: rbox(0.7, 0.36, 0.5, 0.08), color: C.dark, x: -0.3, y: 1.3, z: 0.05 },
      { geometry: rbox(0.5, 0.3, 0.06, 0.03), color: '#9fe3ff', x: -0.3, y: 1.62, z: -0.08, rx: -0.3 },
      { geometry: box(0.5, 0.06, 0.3), color: C.yellow, x: -0.3, y: 1.5, z: 0.12 },
      // A jar of tips.
      { geometry: cylinder(0.14, 0.3, 12), color: '#cfeeff', x: 0.55, y: 1.27 },
      { geometry: cylinder(0.1, 0.12, 10), color: '#5cc45c', x: 0.55, y: 1.2 },
    ];
    for (const sx of [-1, 1]) parts.push({ geometry: rbox(0.1, 1.5, 0.1, 0.03), color: C.white, x: sx * 0.95, y: 1.85, z: -0.4 });
    for (let i = 0; i < 6; i++) parts.push({ geometry: rbox(0.36, 0.08, 0.9, 0.03), color: i % 2 ? C.white : C.pink, x: -0.9 + i * 0.36, y: 2.62, z: -0.05, rx: 0.25 });
    return parts;
  });
}

/** Supply shelf: soap bottles below, towel stacks in the middle, wax tins on top. */
export function shelfModel(): Mesh {
  return cached('shelf', () => {
    const parts: Part[] = [];
    for (const y of [0.08, 0.86, 1.64]) parts.push({ geometry: rbox(2.2, 0.1, 0.8, 0.04), color: C.white, y });
    for (const sx of [-1, 1]) parts.push({ geometry: rbox(0.12, 1.8, 0.82, 0.05), color: C.blue, x: sx * 1.08, y: 0.9 });
    parts.push({ geometry: rbox(2.2, 1.6, 0.06, 0.03), color: '#e3eef7', y: 0.9, z: -0.38 });
    for (let i = 0; i < 5; i++) {
      const x = -0.8 + i * 0.4;
      parts.push({ geometry: rbox(0.24, 0.5, 0.24, 0.1), color: i % 2 ? C.pink : C.blue, x, y: 0.38 });
      parts.push({ geometry: cylinder(0.06, 0.1, 8), color: C.white, x, y: 0.68 });
    }
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) parts.push({ geometry: rbox(0.5, 0.14, 0.5, 0.06), color: [C.mint, C.yellow, C.pink][(i + j) % 3]!, x: -0.7 + i * 0.7, y: 0.99 + j * 0.15 });
    }
    for (let i = 0; i < 5; i++) parts.push({ geometry: cylinder(0.14, 0.18, 12), color: i % 2 ? C.gold : C.yellow, x: -0.8 + i * 0.4, y: 1.8 });
    return parts;
  });
}

/** Waiting bench: wooden slats on metal legs, with a potted plant. */
export function benchModel(): Mesh {
  return cached('bench', () => {
    const parts: Part[] = [];
    for (let i = 0; i < 3; i++) parts.push({ geometry: rbox(2.2, 0.08, 0.17, 0.03), color: C.wood, y: 0.52, z: -0.2 + i * 0.2 });
    for (let i = 0; i < 2; i++) parts.push({ geometry: rbox(2.2, 0.15, 0.06, 0.03), color: C.wood, y: 0.8 + i * 0.2, z: -0.33 });
    for (const sx of [-1, 1]) parts.push({ geometry: rbox(0.08, 1.1, 0.5, 0.03), color: C.dark, x: sx * 0.95, y: 0.55, z: -0.08 });
    parts.push({ geometry: cylinder(0.24, 0.4, 12), color: '#e07a5f', x: 1.5, y: 0.2 });
    parts.push({ geometry: sphere(0.34, 10), color: '#6fc35a', x: 1.5, y: 0.6 });
    parts.push({ geometry: sphere(0.2, 8), color: '#8fd46a', x: 1.6, y: 0.85, z: 0.05 });
    return parts;
  });
}

/** Snack vending machine with a lit panel on top. */
export function vendingModel(): Object3D {
  const body = cached('vending', () => {
    const parts: Part[] = [
      { geometry: rbox(1.3, 2.1, 0.9, 0.12), color: C.red, y: 1.05 },
      { geometry: rbox(0.86, 1.3, 0.06, 0.03), color: '#cfeeff', x: -0.15, y: 1.25, z: 0.45 },
      { geometry: rbox(0.26, 0.5, 0.06, 0.03), color: C.dark, x: 0.45, y: 1.45, z: 0.45 },
      { geometry: rbox(0.6, 0.18, 0.08, 0.04), color: C.dark, x: -0.15, y: 0.4, z: 0.45 },
    ];
    const snacks = [C.yellow, C.blue, C.mint, C.pink];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        parts.push({ geometry: rbox(0.2, 0.2, 0.08, 0.04), color: snacks[(row + col) % 4]!, x: -0.42 + col * 0.27, y: 0.85 + row * 0.38, z: 0.47 });
      }
    }
    return parts;
  });
  const group = new Group();
  const panel = plate('SNACKS', 1.2, 0.34, '#ff8a3c', false);
  panel.position.set(0, 1.92, 0.46);
  group.add(body, panel);
  return group;
}

/** Roadside sign: a tall pole, a rounded board facing the lot, and bubbles. */
export function signModel(): Object3D {
  const pole = cached('sign', () => [
    { geometry: rbox(0.6, 0.2, 0.6, 0.06), color: C.kerb, y: 0.1 },
    { geometry: cylinder(0.12, 4.2), color: C.white, y: 2.2 },
    { geometry: rbox(2, 1.5, 0.2, 0.1), color: C.pink, y: 4.2 },
    { geometry: sphere(0.3), color: '#ffffff', x: 0.95, y: 5.05 },
    { geometry: sphere(0.2), color: '#cfeeff', x: 1.25, y: 5.4 },
    { geometry: sphere(0.22), color: '#ffffff', x: -1, y: 4.95 },
  ]);
  const group = new Group();
  group.add(pole);
  // Text on both faces: the road and the lot.
  for (const side of [-1, 1]) {
    const board = plate('BUBBLE\nWASH', 1.8, 1.3, '#ff6fb0', false);
    board.position.set(0, 4.2, side * 0.11);
    if (side < 0) board.rotation.y = Math.PI;
    group.add(board);
  }
  return group;
}

/** The truck to the next town: Car Kit delivery truck, a bit bigger than cars. */
export function truckModel(): Mesh {
  const { geometry, material } = mergedModel('car:delivery');
  const mesh = new Mesh(geometry, material);
  mesh.scale.setScalar(1.35);
  mesh.rotation.y = Math.PI / 2;
  return mesh;
}
