// The fuel forecourt across the road: its own paving with the lanes marked
// out, the canopy, island and pumps (Blender models), and hoses that reach
// over to the car being filled.
import { CatmullRomCurve3, Group, Mesh, MeshLambertMaterial, PlaneGeometry, TubeGeometry, Vector3, type BufferGeometry, type Object3D } from 'three';
import { PADS, type LocationLayout, type Point, type Rect } from '../../core/config';
import type { Station } from '../../systems/stations';
import { asset } from '../assets';
import { box, mergeParts, toyMaterial, type Part } from './build';
import { plate } from './kit';

const LANE = 2.7;
const CONCRETE = '#d9d2c4';
const ASPHALT = '#646b77';
const HOSE_COLOR = '#2d3440';
/** The canopy sign's front face (art/blender/fuel.py, in the game's axes). */
const SIGN = { y: 4.97, z: -2.94 };
/** Each lane's pump stands this far along the island from its middle; its nozzle holster sits at NOZZLE from the pump. */
const PUMP_X = 0.45;
const NOZZLE = { x: 0.22, y: 0.86, z: 0.3 };

let pavingGeometry: BufferGeometry | null = null;
const glassMaterial = new MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.22, depthWrite: false });

/** Which side of the island (-1 towards the far side, +1 towards the road) a pump's lane runs. */
export function laneSide(layout: LocationLayout, pumpId: string): -1 | 1 {
  const island = layout.buildAt[pumpId];
  const at = layout.pads[pumpId];
  return island && at && at.z < island.z ? -1 : 1;
}

/** A Blender model with the game's materials: the toy colours, see-through glass. */
function blenderModel(id: string): Object3D {
  const model = asset(id).scene.clone(true);
  model.traverse((node) => {
    if (node instanceof Mesh) node.material = node.name.endsWith('_glass') ? glassMaterial : toyMaterial;
  });
  return model;
}

/**
 * The forecourt, centred on the island (`layout.buildAt`): the paving (drawn
 * here to fit the layout) and the canopy, island and price sign modelled in
 * Blender (art/blender/fuel.py), with the first pump.
 */
export function forecourtModel(layout: LocationLayout, firstPump: string): Group {
  pavingGeometry ??= mergeParts(pavingParts(layout, firstPump));
  const group = new Group();
  const sign = plate('FUEL', 1.9, 0.58, '#ff5c6c', false);
  sign.position.set(0, SIGN.y, SIGN.z);
  group.add(new Mesh(pavingGeometry, toyMaterial), blenderModel('building:fuel-canopy'), sign, dispenserModel(laneSide(layout, firstPump)));
  return group;
}

/** The pump for the lane on one side of the island, standing on the island and facing its lane. */
export function dispenserModel(side: -1 | 1): Object3D {
  const pump = blenderModel('building:fuel-pump');
  pump.position.x = side * PUMP_X;
  // Modelled facing the road side (+z); the far lane's pump turns round.
  if (side < 0) pump.rotation.y = Math.PI;
  return pump;
}

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
    const from = new Vector3(island.x + side * (PUMP_X + NOZZLE.x), NOZZLE.y, island.z + side * NOZZLE.z);
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
