// The fuel forecourt across the road: its own paving with the lanes marked
// out, a striped canopy, the pump island between the two lanes with a
// dispenser for each, and hoses that reach over to the car being filled.
import { CatmullRomCurve3, Group, Mesh, MeshLambertMaterial, PlaneGeometry, TubeGeometry, Vector3, type BufferGeometry, type Object3D } from 'three';
import { PADS, type LocationLayout, type Point, type Rect } from '../../core/config';
import type { Station } from '../../systems/stations';
import { box, cylinder, mergeParts, rbox, sphere, toyMaterial, type Part } from './build';
import { C, column, plate, stripedBeam } from './kit';

const CANOPY = { width: 6, length: 6.4, height: 3.6 };
const HALF_ISLAND = 1.4;
const LANE = 2.7;
const CONCRETE = '#d9d2c4';
const ASPHALT = '#646b77';
const HOSE_COLOR = '#2d3440';

let forecourtGeometry: BufferGeometry | null = null;
const dispenserGeometries = new Map<number, BufferGeometry>();

/** Which side of the island (-1 towards the far side, +1 towards the road) a pump's lane runs. */
export function laneSide(layout: LocationLayout, pumpId: string): -1 | 1 {
  const island = layout.buildAt[pumpId];
  const at = layout.pads[pumpId];
  return island && at && at.z < island.z ? -1 : 1;
}

/** Paving, island, canopy and the first pump's dispenser, centred on the island (`layout.buildAt`). */
export function forecourtModel(layout: LocationLayout, firstPump: string): Group {
  forecourtGeometry ??= mergeParts([...pavingParts(layout, firstPump), ...islandParts()]);
  const group = new Group();
  const sign = plate('FUEL', 2, 0.7, '#ff5c6c', false);
  sign.position.set(0, CANOPY.height + 0.75, -CANOPY.length / 2 + 0.065);
  group.add(new Mesh(forecourtGeometry, toyMaterial), sign, dispenserModel(laneSide(layout, firstPump)));
  return group;
}

/** The pump for the lane on one side of the island, placed on the island. */
export function dispenserModel(side: -1 | 1): Mesh {
  let geometry = dispenserGeometries.get(side);
  if (!geometry) {
    geometry = mergeParts(dispenserParts(side));
    dispenserGeometries.set(side, geometry);
  }
  return new Mesh(geometry, toyMaterial);
}

/** Where a lane's dispenser stands along the island, so the two don't overlap. */
const dispenserX = (side: number) => side * 0.45;

const flat = (r: Rect, color: string, y: number): Part => ({
  geometry: new PlaneGeometry(r.maxX - r.minX, r.maxZ - r.minZ),
  color,
  x: (r.minX + r.maxX) / 2,
  y,
  z: (r.minZ + r.maxZ) / 2,
  rx: -Math.PI / 2,
});

/**
 * Concrete around the edge, asphalt over the lanes and the two driveways
 * out to the road (with a dropped kerb), and a parking box at each pump.
 */
function pavingParts(layout: LocationLayout, firstPump: string): Part[] {
  const island = layout.buildAt[firstPump]!;
  const { entryX, exitX } = layout.forecourt;
  const laneZs = PADS.filter((p) => p.effects.pump && layout.pads[p.id]).map((p) => layout.pads[p.id]!.z - island.z);
  const half = LANE / 2;
  const x0 = exitX - island.x;
  const x1 = entryX - island.x;
  const far = Math.min(...laneZs) - half;
  const near = Math.max(...laneZs) + half;
  // The road's kerb, relative to the island.
  const kerb = layout.roadZ - 1.95 - island.z;
  const parts: Part[] = [
    flat({ minX: x0 - 1.6, maxX: x1 + 1.6, minZ: far - 1.6, maxZ: kerb - 1.15 }, CONCRETE, 0.016),
    flat({ minX: x0 - half, maxX: x1 + half, minZ: far, maxZ: near }, ASPHALT, 0.02),
  ];
  for (const x of [x0, x1]) {
    parts.push(flat({ minX: x - half, maxX: x + half, minZ: near - 0.01, maxZ: kerb }, ASPHALT, 0.03));
    parts.push({ geometry: box(LANE, 0.02, 0.32), color: ASPHALT, x, y: 0.165, z: kerb });
  }
  // White parking boxes where cars stop at the pumps.
  for (const z of laneZs) {
    for (const edge of [-1, 1]) parts.push(flat({ minX: -2.1, maxX: 2.1, minZ: z + edge * (half - 0.2) - 0.05, maxZ: z + edge * (half - 0.2) + 0.05 }, '#ffffff', 0.025));
    for (const end of [-1, 1]) parts.push(flat({ minX: end * 2.1 - 0.05, maxX: end * 2.1 + 0.05, minZ: z - half + 0.15, maxZ: z + half - 0.15 }, '#ffffff', 0.025));
  }
  return parts;
}

function islandParts(): Part[] {
  const { width, length, height } = CANOPY;
  const hz = length / 2;
  // The island: a raised kerb with yellow ends and a bollard at each end.
  const parts: Part[] = [
    { geometry: rbox(HALF_ISLAND * 2, 0.22, 0.9, 0.06), color: C.white, y: 0.11 },
    { geometry: rbox(HALF_ISLAND * 2 + 0.04, 0.06, 0.94, 0.03), color: C.kerb, y: 0.03 },
  ];
  for (const sx of [-1, 1]) {
    parts.push({ geometry: rbox(0.3, 0.24, 0.92, 0.06), color: C.yellow, x: sx * (HALF_ISLAND - 0.15), y: 0.12 });
    parts.push({ geometry: cylinder(0.09, 0.8, 10), color: C.yellow, x: sx * (HALF_ISLAND + 0.2), y: 0.6 });
    parts.push({ geometry: sphere(0.1, 8), color: C.yellow, x: sx * (HALF_ISLAND + 0.2), y: 1.02 });
  }
  // Two columns on the island hold up the canopy; its edge is candy-striped all round.
  for (const sx of [-1, 1]) parts.push(...column(sx * 1.05, 0, C.red, height - 0.2));
  for (const sz of [-1, 1]) parts.push(...stripedBeam(width, height + 0.1, sz * hz, C.red, false, 0, 11));
  for (const sx of [-1, 1]) parts.push(...stripedBeam(length - 0.44, height + 0.1, 0, C.red, true, sx * (width / 2 - 0.22), 11));
  // No roof: from the camera's angle a roof over the island hides the car in the back lane.
  // Beams from the columns to the striped edge, and the sign's posts on the far edge.
  for (const sx of [-1, 1]) parts.push({ geometry: rbox(0.22, 0.22, length - 0.4, 0.06), color: C.white, x: sx * 1.05, y: height + 0.05 });
  for (const sx of [-1, 1]) parts.push({ geometry: rbox(0.1, 0.5, 0.1, 0.03), color: C.white, x: sx * 0.7, y: height + 0.55, z: -hz });
  return parts;
}

function dispenserParts(side: -1 | 1): Part[] {
  const x = dispenserX(side);
  const face = side * 0.27;
  return [
    // Body with a red hood and a dark screen facing its lane.
    { geometry: rbox(0.75, 1.3, 0.5, 0.08), color: C.white, x, y: 0.87 },
    { geometry: rbox(0.8, 0.24, 0.54, 0.06), color: C.red, x, y: 1.6 },
    { geometry: rbox(0.5, 0.32, 0.06, 0.02), color: C.dark, x, y: 1.2, z: face },
    { geometry: box(0.36, 0.08, 0.07), color: '#7ee0c3', x, y: 1.27, z: face },
    // Price buttons and the holster with its green nozzle.
    ...[-0.12, 0, 0.12].map((dx) => ({ geometry: box(0.08, 0.05, 0.06), color: C.yellow, x: x + dx, y: 0.95, z: face })),
    { geometry: rbox(0.16, 0.22, 0.1, 0.03), color: '#3fae5a', x: x + 0.22, y: 0.62, z: face + side * 0.04 },
  ];
}

const nozzleGeometry = box(0.14, 0.12, 0.2);

/**
 * Hoses from the dispensers to the cars at the pumps: drawn while a car is
 * parked there, drooping from the pump to the car's filler cap.
 */
export class FuelHoses {
  private readonly hoses = new Map<Station, { mesh: Mesh; nozzle: Mesh; car: Station['car'] }>();
  private readonly material = new MeshLambertMaterial({ color: HOSE_COLOR });
  private readonly nozzleMaterial = new MeshLambertMaterial({ color: '#3fae5a' });

  constructor(
    private readonly scene: Object3D,
    private readonly layout: LocationLayout,
  ) {}

  update(pumps: readonly Station[]): void {
    for (const pump of pumps) {
      const car = pump.car && (pump.car.state === 'waiting' || pump.car.state === 'done') ? pump.car : null;
      const hose = this.hoses.get(pump);
      if (hose && hose.car !== car) {
        this.scene.remove(hose.mesh, hose.nozzle);
        hose.mesh.geometry.dispose();
        this.hoses.delete(pump);
      }
      if (car && !this.hoses.has(pump)) this.attach(pump, car);
    }
  }

  private attach(pump: Station, car: NonNullable<Station['car']>): void {
    const island: Point = this.layout.buildAt[pump.id] ?? pump.at;
    const side = laneSide(this.layout, pump.id);
    const from = new Vector3(island.x + dispenserX(side) + 0.22, 1.05, island.z + side * 0.32);
    // Arcing over to the back of the car: the filler cap on the island side
    // would be out of sight behind the car in the lane nearer the road.
    const heading = car.model.mesh.rotation.y;
    const [, height, length] = car.def.size;
    const back = length / 2 - 0.12;
    const to = new Vector3(pump.at.x - Math.sin(heading) * back, height * 0.5, pump.at.z - Math.cos(heading) * back);
    const top = from.clone().lerp(to, 0.55).setY(Math.max(from.y, height) + 0.35);
    const curve = new CatmullRomCurve3([from, top, to]);
    const mesh = new Mesh(new TubeGeometry(curve, 16, 0.045, 5), this.material);
    const nozzle = new Mesh(nozzleGeometry, this.nozzleMaterial);
    nozzle.position.copy(to);
    this.scene.add(mesh, nozzle);
    this.hoses.set(pump, { mesh, nozzle, car });
  }
}
