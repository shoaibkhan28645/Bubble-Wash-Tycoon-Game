// The detailing garage: the kit's tiled pad, columns and striped canopy.
// (The hand wash bays, brush tunnel, dryer and wax station are Blender
// models: washBay.ts, tunnel.ts, dryer.ts, wax.ts.)
import { Group, Mesh, TorusGeometry, type BufferGeometry } from 'three';
import { cylinder, mergeParts, rbox, toyMaterial, type Part } from './build';
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
