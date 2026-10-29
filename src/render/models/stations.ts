// Wash stations: waxing and the detailing garage. Both share the kit's
// tiled pad, columns and striped canopy. (The hand wash bays, brush tunnel
// and dryer are Blender models: washBay.ts, tunnel.ts, dryer.ts.)
import { Group, Mesh, TorusGeometry, type BufferGeometry } from 'three';
import { cylinder, mergeParts, rbox, sphere, toyMaterial, type Part } from './build';
import { C, canopy, plate, signFrame, washPad } from './kit';

const geometries = new Map<string, BufferGeometry>();

/** One merged mesh per model and size, built once. */
function merged(key: string, build: () => Part[]): Mesh {
  let geometry = geometries.get(key);
  if (!geometry) {
    geometry = mergeParts(build());
    geometries.set(key, geometry);
  }
  return new Mesh(geometry, toyMaterial);
}

/** A canopy station with its sign on the far beam. */
function withSign(body: Mesh, length: number, text: string, color: string, width = 1.76): Group {
  const group = new Group();
  const sign = plate(text, width, 0.66, color);
  sign.position.set(0, 4.0, -(length / 2 - 0.2) + 0.065);
  group.add(body, sign);
  return group;
}

/** Waxing: golden canopy, buffer pads either side, a spray arch and a cart of wax tins. */
export function waxModel(width: number, length: number): Group {
  const body = merged(`wax:${width}:${length}`, () => {
    const hx = width / 2 + 0.1;
    const parts = [...washPad(width, length, '#f4ead2', '#e0d0aa'), ...canopy(width, length, C.gold), ...signFrame(-(length / 2 - 0.2), 1.9)];
    for (const sx of [-1, 1]) {
      parts.push({ geometry: rbox(0.16, 1.7, 0.16, 0.05), color: C.steel, x: sx * (hx - 0.1), y: 0.95, z: 0.5 });
      parts.push({ geometry: cylinder(0.5, 0.26, 16), color: '#fff3c4', x: sx * (hx - 0.32), y: 1.0, z: 0.5, rz: Math.PI / 2 });
      parts.push({ geometry: cylinder(0.52, 0.08, 16), color: C.gold, x: sx * (hx - 0.2), y: 1.0, z: 0.5, rz: Math.PI / 2 });
    }
    // Spray arch with nozzles.
    for (const sx of [-1, 1]) parts.push({ geometry: rbox(0.12, 2.4, 0.12, 0.04), color: C.white, x: sx * (hx - 0.15), y: 1.3, z: -0.7 });
    parts.push({ geometry: rbox(width - 0.1, 0.14, 0.14, 0.05), color: C.white, y: 2.5, z: -0.7 });
    for (let i = 0; i < 5; i++) parts.push({ geometry: sphere(0.08, 8), color: C.gold, x: -width / 2 + 0.5 + (i * (width - 1)) / 4, y: 2.4, z: -0.7 });
    // Cart with wax tins on the worker's side.
    const cart = { x: -width / 2 - 0.6, z: length / 2 - 0.55 };
    parts.push({ geometry: rbox(0.6, 0.08, 0.8, 0.03), color: C.white, ...cart, y: 0.6 });
    parts.push({ geometry: rbox(0.6, 0.08, 0.8, 0.03), color: C.white, ...cart, y: 0.2 });
    for (const sz of [-1, 1]) parts.push({ geometry: rbox(0.06, 0.7, 0.06, 0.02), color: C.steel, x: cart.x, y: 0.4, z: cart.z + sz * 0.35 });
    for (let i = 0; i < 3; i++) parts.push({ geometry: cylinder(0.11, 0.16, 12), color: i % 2 ? C.gold : C.yellow, x: cart.x, y: 0.72, z: cart.z - 0.25 + i * 0.25 });
    return parts;
  });
  return withSign(body, length, 'WAX', '#e0a020');
}

/** Detailing garage: lilac canopy with low side walls, roll-up doors, a vacuum and a tyre stack. */
export function garageModel(width: number, length: number): Group {
  const body = merged(`garage:${width}:${length}`, () => {
    const hx = width / 2 + 0.1;
    const hz = length / 2 - 0.2;
    const parts = [...washPad(width, length, '#ece4fb', '#d6c9f2'), ...canopy(width, length, C.lilac), ...signFrame(-hz, 2.4)];
    for (const sx of [-1, 1]) {
      parts.push({ geometry: rbox(0.22, 1.1, length - 0.6, 0.06), color: C.white, x: sx * hx, y: 0.6 });
      parts.push({ geometry: rbox(0.28, 0.1, length - 0.5, 0.04), color: C.lilac, x: sx * hx, y: 1.18 });
    }
    // Roll-up doors, rolled up under each striped beam.
    for (const sz of [-1, 1]) parts.push({ geometry: cylinder(0.2, width + 0.1, 12), color: '#d9dee6', y: 2.72, z: sz * hz, rz: Math.PI / 2 });
    // Vacuum and tyre stack outside the worker's wall.
    const side = -hx - 0.55;
    parts.push({ geometry: rbox(0.5, 0.7, 0.5, 0.12), color: C.yellow, x: side, y: 0.35, z: -hz + 0.3 });
    parts.push({ geometry: new TorusGeometry(0.2, 0.05, 6, 12), color: C.dark, x: side, y: 0.85, z: -hz + 0.3, rx: Math.PI / 2 });
    for (let i = 0; i < 3; i++) parts.push({ geometry: cylinder(0.3, 0.2, 14), color: C.dark, x: side, y: 0.12 + i * 0.22, z: hz - 0.2 });
    return parts;
  });
  return withSign(body, length, 'DETAILING', '#9a7cf0', 2.3);
}
