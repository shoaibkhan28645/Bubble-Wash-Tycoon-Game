// Wash stations: hand bays, dryer, waxing, detailing garage and the brush
// tunnel. All share the kit's tiled pad, columns and striped canopy.
import { Group, Mesh, MeshLambertMaterial, TorusGeometry, type BufferGeometry } from 'three';
import { box, cylinder, mergeParts, rbox, sphere, toyMaterial, type Part } from './build';
import { C, canopy, column, plate, signFrame, stripedBeam, washPad } from './kit';

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

/** Hand-wash bay: tiled pad, blue and pink canopy, hose reel, soap dispenser and bucket. */
export function bayModel(width: number, length: number, label: string): Group {
  const body = merged(`bay:${width}:${length}`, () => {
    const hx = width / 2 + 0.1;
    const hz = length / 2 - 0.2;
    const parts = [...washPad(width, length, '#d3e6f0', '#b6cbd8'), ...canopy(width, length, C.blue, C.pink), ...signFrame(-hz, 1.9)];
    for (const sx of [-1, 1]) parts.push({ geometry: sphere(0.13, 10), color: '#fff3b0', x: sx * (width / 4), y: 2.85, z: -hz });
    // Hose reel on the near right column, with its coiled hose and spray gun.
    const reel = { x: hx - 0.05, z: hz - 0.32 };
    parts.push({ geometry: cylinder(0.3, 0.14, 16), color: C.blue, ...reel, y: 1.45, rx: Math.PI / 2 });
    parts.push({ geometry: new TorusGeometry(0.24, 0.06, 6, 16), color: C.yellow, ...reel, y: 1.45, z: reel.z - 0.1 });
    parts.push({ geometry: rbox(0.1, 0.32, 0.14, 0.03), color: C.dark, x: reel.x + 0.02, y: 1.05, z: reel.z - 0.14 });
    // Soap dispenser on the near left column.
    parts.push({ geometry: rbox(0.3, 0.46, 0.2, 0.05), color: C.pink, x: -hx + 0.02, y: 1.3, z: hz - 0.28 });
    parts.push({ geometry: rbox(0.32, 0.08, 0.22, 0.03), color: C.white, x: -hx + 0.02, y: 1.57, z: hz - 0.28 });
    // Bucket with a sponge in the corner.
    parts.push({ geometry: cylinder(0.26, 0.42, 12), color: C.yellow, x: hx - 0.55, y: 0.25, z: length / 2 - 0.6 });
    parts.push({ geometry: cylinder(0.2, 0.05, 12), color: '#bfe9ff', x: hx - 0.55, y: 0.46, z: length / 2 - 0.6 });
    parts.push({ geometry: rbox(0.3, 0.14, 0.2, 0.05), color: C.pink, x: hx - 0.5, y: 0.52, z: length / 2 - 0.55, ry: 0.4 });
    return parts;
  });
  return withSign(body, length, label, '#2f80d1');
}

/** Dryer: blue canopy, blower housings either side, an overhead blower bar and a towel rack. */
export function dryerModel(width: number, length: number): Group {
  const body = merged(`dryer:${width}:${length}`, () => {
    const hx = width / 2 + 0.1;
    const parts = [...washPad(width, length, '#d6e8f5', '#b8cfe0'), ...canopy(width, length, C.blue), ...signFrame(-(length / 2 - 0.2), 1.9)];
    for (const sx of [-1, 1]) {
      parts.push({ geometry: rbox(0.5, 1.5, 1.2, 0.12), color: '#dce9f5', x: sx * (hx - 0.05), y: 1.25 });
      parts.push({ geometry: cylinder(0.36, 0.1, 16), color: C.dark, x: sx * (hx - 0.32), y: 1.35, rz: Math.PI / 2 });
      parts.push({ geometry: cylinder(0.24, 0.12, 16), color: C.steel, x: sx * (hx - 0.34), y: 1.35, rz: Math.PI / 2 });
    }
    // Overhead blower bar with its slot.
    parts.push({ geometry: rbox(width - 0.1, 0.38, 0.6, 0.12), color: '#dce9f5', y: 2.65 });
    parts.push({ geometry: box(width - 0.5, 0.06, 0.18), color: C.dark, y: 2.44 });
    // Towel rack on the worker's side.
    const rack = { x: -width / 2 - 0.6, z: length / 2 - 0.55 };
    parts.push({ geometry: rbox(0.12, 1.1, 0.9, 0.04), color: C.white, ...rack, y: 0.55 });
    [C.pink, C.mint, C.yellow].forEach((color, i) => parts.push({ geometry: rbox(0.4, 0.12, 0.7, 0.05), color, ...rack, y: 0.3 + i * 0.28 }));
    return parts;
  });
  return withSign(body, length, 'DRYER', '#2f80d1');
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

/** Automatic brush tunnel: walls with windows, striped arches, curtains at the entrance and spinning brushes. */
export class TunnelModel {
  readonly root = new Group();
  private readonly brushes: Mesh[] = [];

  constructor(width: number, length: number) {
    const hx = width / 2 + 0.1;
    const hz = length / 2 - 0.2;
    const body = merged(`tunnel:${width}:${length}`, () => {
      const parts: Part[] = [{ geometry: box(width + 0.2, 0.04, length), color: '#9aa5b3', y: 0.02 }];
      for (const sx of [-0.5, 0.5]) parts.push({ geometry: rbox(0.18, 0.12, length - 0.4, 0.04), color: C.steel, x: sx, y: 0.08 });
      // Side walls with a window band and a coloured trim.
      for (const sx of [-1, 1]) {
        parts.push({ geometry: rbox(0.24, 1.0, length - 0.5, 0.06), color: C.white, x: sx * hx, y: 0.5 });
        parts.push({ geometry: rbox(0.2, 0.7, length - 0.5, 0.04), color: '#bfe3f7', x: sx * hx, y: 1.35 });
        parts.push({ geometry: rbox(0.28, 0.14, length - 0.5, 0.04), color: C.pink, x: sx * hx, y: 1.75 });
      }
      const arches = 4;
      for (let i = 0; i < arches; i++) {
        const z = -hz + (i * 2 * hz) / (arches - 1);
        for (const sx of [-1, 1]) parts.push(...column(sx * hx, z, i % 2 ? C.pink : C.blue));
        parts.push(...stripedBeam(width + 0.8, 3.18, z, i % 2 ? C.pink : C.blue));
      }
      for (const sx of [-1, 1]) parts.push({ geometry: rbox(0.22, 0.24, length - 0.2, 0.06), color: C.white, x: sx * hx, y: 3.05 });
      // Curtain strips at the entrance.
      const strips = 9;
      for (let i = 0; i < strips; i++) {
        const x = -width / 2 + 0.25 + (i * (width - 0.5)) / (strips - 1);
        parts.push({ geometry: rbox(0.22, 1.3, 0.04, 0.02), color: [C.blue, C.pink, C.yellow][i % 3]!, x, y: 2.25, z: -hz + 0.1 });
      }
      parts.push(...signFrame(-hz, 2.4));
      return parts;
    });
    const sign = plate('TUNNEL', 2.3, 0.66, '#ff6fb0');
    sign.position.set(0, 4.0, -hz + 0.065);
    this.root.add(body, sign);

    // Two pairs of fluffy side brushes and an overhead roller.
    const brushMaterial = new MeshLambertMaterial({ vertexColors: true });
    const side = mergeParts([
      { geometry: cylinder(0.12, 2.3, 8), color: C.steel, y: 1.25 },
      ...[0.45, 0.85, 1.25, 1.65, 2.05].map((y, i) => ({ geometry: cylinder(0.42, 0.34, 8), color: i % 2 ? C.pink : C.blue, y })),
    ]);
    for (const z of [-length / 4, length / 4]) {
      for (const sx of [-1, 1]) {
        const brush = new Mesh(side, brushMaterial);
        brush.position.set(sx * (width / 2 - 0.45), 0, z);
        this.brushes.push(brush);
        this.root.add(brush);
      }
    }
    const roller = new Mesh(
      mergeParts([
        { geometry: cylinder(0.1, width - 0.4, 8), color: C.steel, rz: Math.PI / 2 },
        ...[-0.9, -0.3, 0.3, 0.9].map((x, i) => ({ geometry: cylinder(0.36, 0.5, 8), color: i % 2 ? C.mint : C.yellow, x, rz: Math.PI / 2 })),
      ]),
      brushMaterial,
    );
    roller.position.set(0, 2.2, 0);
    this.brushes.push(roller);
    this.root.add(roller);
  }

  update(dt: number, busy: boolean): void {
    const speed = busy ? 9 : 1.5;
    for (const brush of this.brushes) {
      if (brush.position.y > 1) brush.rotation.x += dt * speed;
      else brush.rotation.y += dt * speed * (brush.position.x > 0 ? 1 : -1);
    }
  }
}
