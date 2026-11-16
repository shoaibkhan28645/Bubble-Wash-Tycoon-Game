// Skyport International's models, made in Blender (art/blender/skyport_plane.py, skyport_kit.py and
// skyport_terminal.py) and drawn here: the airliner in each airline's colours, with its propellers, doors,
// flaps, gear, wheels and lights; the air stairs, fuel truck and baggage belt; the check-in desk, the
// gates' podiums, the lounges' seats; the hall with its sliding doors; the airport's name; the windsock,
// the radar and the flags. A model with moving parts is drawn as one skinned mesh (rigid.ts): one draw
// call, its parts still turned by name. The words on signs are painted here.
import {
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  SRGBColorSpace,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { AirportLayout, CarDef, GateSpot, Point, Rect } from '../../core/config';
import { asset, hasModel, plain } from '../assets';
import { familyPainter, type PaintFamily } from '../repaint';
import { CarModel } from './actors';
import { mergeParts, skinnedToyMaterial, toyMaterial } from './build';
import { rigidSkin } from './rigid';

const PI = Math.PI;
export const AIR = {
  white: '#f7f8fa',
  aqua: '#22c3c9',
  pink: '#ff5fa8',
  sun: '#ffd24a',
  orange: '#ff8a3d',
  navy: '#17324d',
  dark: '#3b3f4a',
} as const;

// ---- the model files -------------------------------------------------------------------------------------------

/** The airport's model files (src/core/skyport.ts says where each is). */
export const SKYPORT_FILES = [
  'building:skyport-plane',
  'building:skyport-apron',
  'building:skyport-vehicles',
  'building:skyport-hall',
  'building:skyport-field',
  'building:skyport-terminal',
  'building:skyport-name',
];

/** The named model's node in whichever of the airport's files has it (not a copy). */
export function skyPiece(name: string): Object3D {
  for (const file of SKYPORT_FILES) {
    const found = hasModel(file) ? asset(file).scene.getObjectByName(name) : undefined;
    if (found) return found;
  }
  throw new Error(`No airport model called ${name}`);
}

/** A copy of a model, standing on its own base at the origin, casting and catching shadows. */
export function skyModel(name: string): Object3D {
  const copy = skyPiece(name).clone(true);
  copy.position.set(0, 0, 0);
  copy.traverse((node) => {
    if (node instanceof Mesh) {
      node.material = toyMaterial;
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  return copy;
}

/** Kinds of model whose shared geometry has been repainted already (by key). */
const painted = new Set<string>();

/**
 * A copy of a model whose parts move, drawn as one skinned mesh. `key` names its geometry (copies with the
 * same key share it); `paint` repaints that geometry the first time a key is made.
 */
function skyMover(name: string, key = name, paint?: (geometry: BufferGeometry) => void): Object3D {
  const model = skyModel(name);
  const skinned = rigidSkin(model, toyMaterial, key, skinnedToyMaterial);
  if (skinned && paint && !painted.has(key)) {
    paint(skinned.geometry);
    painted.add(key);
  }
  return model;
}

/** A model's part by its name (an empty stand-in if it's missing, so nothing breaks). */
function part(model: Object3D, name: string): Object3D {
  return model.getObjectByName(name) ?? new Object3D();
}

/** One model placed many times, merged into one mesh: lamps, fences, benches. */
export function skyCopies(name: string, at: readonly { x: number; z: number; rot?: number; scale?: number }[]): Mesh {
  const base = skyPiece(name);
  base.updateMatrixWorld(true);
  const inverseBase = new Matrix4().copy(base.matrixWorld).invert();
  const place = new Matrix4();
  const pieces: BufferGeometry[] = [];
  for (const p of at) {
    place.compose(new Vector3(p.x, 0, p.z), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), p.rot ?? 0), new Vector3().setScalar(p.scale ?? 1));
    base.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const local = new Matrix4().multiplyMatrices(inverseBase, node.matrixWorld);
      pieces.push(plain(node.geometry as BufferGeometry).applyMatrix4(new Matrix4().multiplyMatrices(place, local)));
    });
  }
  const geometry = mergeGeometries(pieces);
  for (const piece of pieces) piece.dispose();
  if (!geometry) throw new Error(`Could not merge ${name}`);
  const mesh = new Mesh(geometry, toyMaterial);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.name = name;
  return mesh;
}

/** Words on a board (a sign's face), drawn once the game's display font is ready. */
export function signBoard(text: string, width: number, height: number, background: string, colour = '#ffffff'): Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = Math.max(32, Math.round((512 * height) / width));
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const draw = (): void => {
    const g = canvas.getContext('2d')!;
    g.fillStyle = background;
    g.fillRect(0, 0, canvas.width, canvas.height);
    const size = Math.round(canvas.height * 0.68);
    g.font = `400 ${size}px "Lilita One", Nunito, Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = colour;
    g.fillText(text, canvas.width / 2, canvas.height * 0.54, canvas.width * 0.92);
    texture.needsUpdate = true;
  };
  draw();
  void document.fonts?.load('400 64px "Lilita One"').then(draw);
  const board = new Mesh(new PlaneGeometry(width, height), new MeshBasicMaterial({ map: texture }));
  board.name = 'sign';
  return board;
}

/** A sign painted onto a model's marker (its face to +z), `width` × `height` metres. */
function signAt(model: Object3D, marker: string, text: string, width: number, height: number, background: string, colour: string): Mesh {
  const sign = signBoard(text, width, height, background, colour);
  const at = part(model, marker);
  sign.position.copy(at.position);
  at.parent?.add(sign);
  return sign;
}

// ---- the airliner ----------------------------------------------------------------------------------------------

/** An airline's colours: its main colour (the tail, the cheatline, the engines' lips) and its second. */
export interface Livery {
  accent: string;
  accent2: string;
}
export const LIVERIES: Livery[] = [
  { accent: '#e8493f', accent2: '#ffc21a' },
  { accent: '#ff8a3d', accent2: '#17324d' },
  { accent: '#8a4fd8', accent2: '#ff5fa8' },
  { accent: '#22c3c9', accent2: '#ff5fa8' },
  { accent: '#ff5fa8', accent2: '#ffd24a' },
  { accent: '#2c62d6', accent2: '#ffd24a' },
];

/** The marker paints the airliner is modelled in (art/blender/skyport_plane.py: ACCENT and ACCENT2). */
const near = (hex: string): PaintFamily['test'] => {
  const n = parseInt(hex.slice(1), 16);
  const [r0, g0, b0] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (r, g, b) => Math.abs(r - r0) < 9 && Math.abs(g - g0) < 9 && Math.abs(b - b0) < 9;
};
const PLANE_PAINTS: PaintFamily[] = [
  { test: near('#e8493f'), base: '#e8493f' },
  { test: near('#ffc21a'), base: '#ffc21a' },
];

/** The airliner's size (metres): nose to tail, wingtip to wingtip, how fat, how high its middle rides, its door's sill. */
export const PROP = { length: 9, span: 10.6, radius: 0.95, ride: 1.72, sill: 1.02, wingY: 2.68 } as const;
/** Half the fuselage's width and where it starts and ends along the plane, for what's solid when it's parked. */
export const PROP_SOLID = { half: 1.05, tail: -4.4, nose: 4.5 } as const;
/** Its wheels' radii: the main wheels and the nose wheel. */
const WHEEL = { main: 0.36, nose: 0.3 } as const;

/** A wing (or tailplane) seen from above: both sides in one tapered outline, its leading edge's root at the origin. */
function wingShape(span: number, rootChord: number, tipChord: number, sweep: number): Shape {
  const s = new Shape();
  s.moveTo(0, 0);
  s.lineTo(span / 2, -sweep);
  s.lineTo(span / 2, -sweep - tipChord);
  s.lineTo(0, -rootChord);
  s.lineTo(-span / 2, -sweep - tipChord);
  s.lineTo(-span / 2, -sweep);
  s.closePath();
  return s;
}

/** How the airliner's moving parts stand this frame. */
export interface PlanePose {
  /** How hard the engines run (0 stopped, 1 flat out). */
  engines: number;
  /** Doors open (1) or shut (0): the passengers' door, the hold's. */
  door: number;
  hold: number;
  /** Flaps down (1) or up (0); gear down (1) or folded away (0). */
  flaps: number;
  gear: number;
  /** The nose wheel's turn (radians), and how far it rolled since the last frame (metres; back is less than 0). */
  steer: number;
  roll: number;
  /** The taxi light on the nose leg. */
  taxiLight: boolean;
}

/**
 * The twin-propeller airliner (Blender), nose to +z, wheels on the ground at y = 0, in an airline's
 * colours. The propellers spin (a blur over them at speed), the doors open, the flaps lower, the gear folds
 * away after take-off and the wheels roll; the beacon blinks while the engines run, the wingtips glow red
 * and green, the tail strobes in the air. A shadow in its own shape lies on the ground under it (further
 * off, and fainter, the higher it flies).
 */
export class PlaneModel {
  readonly root = new Group();
  readonly shadow: Mesh;
  private readonly props: Object3D[];
  private readonly discs: Mesh[] = [];
  private readonly door: Object3D;
  private readonly hold: Object3D;
  private readonly flaps: Object3D[];
  private readonly mainGear: Object3D[];
  private readonly noseGear: Object3D;
  private readonly nose: Object3D;
  private readonly wheels: { node: Object3D; radius: number }[];
  private readonly beacon: Mesh;
  private readonly strobe: Mesh;
  private readonly taxi: Mesh;
  private readonly eased = { door: 0, hold: 0, flaps: 0, gear: 1 };
  private turn = 0;
  private time = Math.random() * 3;

  constructor(livery: Livery) {
    const key = `sp_plane:${livery.accent}:${livery.accent2}`;
    const model = skyMover('sp_plane', key, (geometry) => familyPainter(geometry, PLANE_PAINTS)([livery.accent, livery.accent2]));
    // Its own flat shadow follows it (the sun's would be left behind on the shadow map).
    model.traverse((node) => (node.castShadow = false));
    this.root.add(model);
    this.root.rotation.order = 'YXZ';
    this.props = ['l', 'r'].map((s) => part(model, `sp_plane_prop${s}`));
    this.door = part(model, 'sp_plane_door');
    this.hold = part(model, 'sp_plane_hold');
    this.flaps = ['l', 'r'].map((s) => part(model, `sp_plane_flap${s}`));
    this.mainGear = ['l', 'r'].map((s) => part(model, `sp_plane_gear${s}`));
    this.noseGear = part(model, 'sp_plane_gearn');
    this.nose = part(model, 'sp_plane_nose');
    this.wheels = [
      { node: part(model, 'sp_plane_wheel_l'), radius: WHEEL.main },
      { node: part(model, 'sp_plane_wheel_r'), radius: WHEEL.main },
      { node: part(model, 'sp_plane_wheel_n'), radius: WHEEL.nose },
    ];

    // The propellers' blur, shown over them when they're spinning fast.
    const discMaterial = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false });
    for (const s of ['l', 'r']) {
      const disc = new Mesh(new CircleGeometry(1.06, 24), discMaterial);
      disc.position.z = 0.02;
      disc.visible = false;
      part(model, `sp_plane_blur${s}`).add(disc);
      this.discs.push(disc);
    }
    // Lights: the beacon on its back, red on the left wingtip and green on the right, the tail's strobe,
    // the taxi light on the nose leg.
    const light = (marker: string, colour: number, radius: number): Mesh => {
      const bulb = new Mesh(new SphereGeometry(radius, 8, 6), new MeshBasicMaterial({ color: colour }));
      part(model, marker).add(bulb);
      return bulb;
    };
    this.beacon = light('sp_plane_beacon', 0xff3b30, 0.13);
    light('sp_plane_navl', 0xff3b30, 0.11);
    light('sp_plane_navr', 0x35d06a, 0.11);
    this.strobe = light('sp_plane_strobe', 0xffffff, 0.14);
    this.taxi = light('sp_plane_taxi', 0xfff6c8, 0.1);

    // Its shadow on the ground, in its own shape.
    const outline = new ShapeGeometry(wingShape(PROP.span, 1.9, 1.15, 0.28)).rotateX(PI / 2).translate(0, 0, 1.0);
    const tail = new ShapeGeometry(wingShape(4.3, 1.15, 0.68, 0.45)).rotateX(PI / 2).translate(0, 0, -3.5);
    const trunk = new CircleGeometry(1, 20).rotateX(-PI / 2).scale(PROP.radius * 0.98, 1, PROP.length / 2);
    for (const g of [outline, tail, trunk]) for (const name of ['normal', 'uv']) g.deleteAttribute(name);
    const flat = mergeParts([{ geometry: outline.toNonIndexed(), color: '#000000' }, { geometry: tail.toNonIndexed(), color: '#000000' }, { geometry: trunk.toNonIndexed(), color: '#000000' }]);
    this.shadow = new Mesh(flat, new MeshBasicMaterial({ color: 0x0b1f2e, transparent: true, opacity: 0.24, depthWrite: false, side: 2 }));
    this.shadow.name = 'plane-shadow';
    this.shadow.renderOrder = 1;
  }

  /** One frame. The shadow follows on the ground, slipping away from under the plane as it climbs (the sun's in the south-west). */
  update(dt: number, pose: PlanePose): void {
    this.time += dt;
    const ease = (from: number, to: number, rate: number): number => from + (to - from) * (1 - Math.exp(-dt * rate));
    const e = this.eased;
    e.door = ease(e.door, pose.door, 2.2);
    e.hold = ease(e.hold, pose.hold, 2.2);
    e.flaps = ease(e.flaps, pose.flaps, 1.4);
    e.gear = ease(e.gear, pose.gear, 1.1);
    // Propellers: a visible turn while they wind up and down, a blur over a steady whirl when they're fast.
    const blur = pose.engines > 0.45;
    this.turn += dt * (blur ? 9 : (2 + pose.engines * 20) * Math.min(1, pose.engines * 6));
    for (let i = 0; i < this.props.length; i++) {
      this.props[i]!.rotation.z = this.turn * (i ? 1 : -1);
      this.discs[i]!.visible = blur;
    }
    this.door.rotation.y = -2.7 * e.door;
    this.hold.rotation.z = -1.45 * e.hold;
    for (const flap of this.flaps) flap.rotation.x = -0.5 * e.flaps;
    for (const gear of this.mainGear) gear.rotation.x = -1.55 * (1 - e.gear);
    this.noseGear.rotation.x = 1.55 * (1 - e.gear);
    this.nose.rotation.y = ease(this.nose.rotation.y, pose.steer, 6);
    for (const wheel of this.wheels) wheel.node.rotation.x += pose.roll / wheel.radius;
    this.beacon.visible = pose.engines > 0.02 && this.time % 1.1 < 0.16;
    this.strobe.visible = pose.engines > 0.6 && this.time % 1.3 < 0.07;
    this.taxi.visible = pose.taxiLight;
    const { x, y, z } = this.root.position;
    this.shadow.position.set(x + y * 0.45, 0.04, z - y * 0.25);
    this.shadow.rotation.y = this.root.rotation.y;
    this.shadow.scale.setScalar(1 + y * 0.012);
    (this.shadow.material as MeshBasicMaterial).opacity = 0.24 / (1 + y * 0.09);
  }

  dispose(): void {
    this.root.removeFromParent();
    this.shadow.removeFromParent();
  }
}

// ---- things on the apron ---------------------------------------------------------------------------------------

/** How high the air stairs climb, and how long they are from foot to door. */
export const STAIRS = { rise: PROP.sill, run: 3.8 } as const;
/** Air stairs under their canopy: their foot at the origin, climbing towards -x to the plane's door. */
export function airStairs(): Object3D {
  return skyModel('sp_stairs');
}

/** Wheel chocks and cones round a parked plane (its middle at the origin, nose to +z). */
export function standKit(): Object3D {
  const group = new Group();
  group.add(
    skyCopies('sp_chocks', [
      { x: 2.4, z: 0.5, rot: PI / 2 },
      { x: -2.4, z: 0.5, rot: PI / 2 },
      { x: 0, z: 3.3, rot: PI / 2 },
    ]),
    skyCopies('sp_cone', [
      { x: 5.75, z: 0.2 },
      { x: -5.75, z: 0.2 },
      { x: 0, z: -4.9 },
    ]),
  );
  return group;
}

/**
 * The fuel truck, cab to +z, its hose reel on its right (+x) side: the reel turns while it's fuelling,
 * the amber beacon on its cab spins while it's on duty.
 */
export class FuelTruck {
  readonly root: Object3D;
  private readonly reel: Object3D;
  private readonly beacon: Object3D;
  private readonly nozzleAt: Object3D;
  constructor() {
    this.root = skyMover('sp_fuel');
    this.reel = part(this.root, 'sp_fuel_reel');
    this.beacon = part(this.root, 'sp_fuel_beacon');
    this.nozzleAt = part(this.root, 'sp_fuel_nozzle');
  }
  /** Where the hose leaves the reel, in the world. */
  nozzle(out: Vector3): Vector3 {
    this.root.updateMatrixWorld(true);
    return this.nozzleAt.getWorldPosition(out);
  }
  update(dt: number, onDuty: boolean, fuelling: boolean): void {
    if (onDuty) this.beacon.rotation.y += dt * 7;
    if (fuelling) this.reel.rotation.x -= dt * 2.4;
  }
}

/** The hose from a fuel truck to a wing: a tube from the origin along +z, one metre long (stretched to fit). */
export function fuelHose(): Mesh {
  const tube = new CylinderGeometry(0.07, 0.07, 1, 8, 1, true).rotateX(PI / 2).translate(0, 0, 0.5);
  const hose = new Mesh(mergeParts([{ geometry: tube, color: '#2b2f38' }]), toyMaterial);
  hose.visible = false;
  return hose;
}

/**
 * The baggage hatch in the hall's north wall, its belt and the cart beyond it with its tug: the belt's end
 * at the origin, the wall to +z. While cases are coming the slats run and the hatch's rubber flaps swing.
 */
export class BaggageBelt {
  readonly root: Object3D;
  private readonly flaps: Object3D[];
  private readonly slats: Object3D;
  private readonly slatsZ: number;
  private run = 0;
  private time = 0;
  constructor() {
    this.root = skyMover('sp_belt');
    this.flaps = [0, 1, 2, 3].map((k) => part(this.root, `sp_belt_flap${k}`));
    this.slats = part(this.root, 'sp_belt_slats');
    this.slatsZ = this.slats.position.z;
  }
  update(dt: number, running: boolean): void {
    this.time += dt;
    if (running) this.run = (this.run + dt * 0.7) % 0.25;
    this.slats.position.z = this.slatsZ - this.run;
    this.flaps.forEach((flap, k) => {
      const swing = running ? 0.35 * Math.max(0, Math.sin(this.time * 4.5 + k * 1.3)) : 0;
      flap.rotation.x += (swing - flap.rotation.x) * Math.min(1, dt * 8);
    });
  }
}

/** Cases piled on the belt's cart (art/blender: sp_case0..5): `count` of them shown, up to 12, as one mesh. */
export class CasePile {
  readonly root: Mesh;
  private readonly ends: number[] = [0];
  constructor() {
    const pieces: BufferGeometry[] = [];
    const place = new Matrix4();
    for (let i = 0; i < 12; i++) {
      const base = skyPiece(`sp_case${i % 6}`);
      base.updateMatrixWorld(true);
      const inverse = new Matrix4().copy(base.matrixWorld).invert();
      place.compose(
        new Vector3(i % 2 ? 0.42 : -0.42, 0.6 + Math.floor(i / 6) * 0.33, -1.1 - (Math.floor(i / 2) % 3) * 0.8),
        new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), ((i * 1.7) % 0.5) - 0.25),
        new Vector3(1, 1, 1),
      );
      const parts: BufferGeometry[] = [];
      base.traverse((node) => {
        if (node instanceof Mesh) parts.push(plain(node.geometry as BufferGeometry).applyMatrix4(new Matrix4().multiplyMatrices(place, new Matrix4().multiplyMatrices(inverse, node.matrixWorld))));
      });
      const one = parts.length === 1 ? parts[0]! : mergeGeometries(parts)!;
      pieces.push(one);
      this.ends.push(this.ends.at(-1)! + (one.index ? one.index.count : one.getAttribute('position').count));
    }
    this.root = new Mesh(mergeGeometries(pieces)!, toyMaterial);
    this.root.receiveShadow = true;
    this.show(0);
  }
  show(count: number): void {
    const n = Math.max(0, Math.min(12, count));
    this.root.geometry.setDrawRange(0, this.ends[n]!);
    this.root.visible = n > 0;
  }
}

// ---- the check-in hall -----------------------------------------------------------------------------------------

/** The check-in desk, its window to +z, with its sign painted; the belt barriers along its line. */
export function checkinDesk(): Object3D {
  const desk = skyModel('sp_desk');
  signAt(desk, 'sp_desk_sign', 'CHECK-IN', 4.0, 0.78, AIR.navy, AIR.sun);
  const queue = skyModel('sp_queue');
  queue.position.z = 1.0;
  desk.add(queue);
  return desk;
}

/** A gate's podium: whoever opens the gate stands in front of it (+z), its screen towards them. */
export function podium(): Object3D {
  return skyModel('sp_podium');
}

/** Rows of seats filling a lounge: two beams of four in each row, two rows (the front navy, the back teal). */
export function loungeSeats(lounge: Rect): Object3D {
  const cx = (lounge.minX + lounge.maxX) / 2;
  const group = new Group();
  for (const [row, name] of [[0, 'sp_seats_a'], [1, 'sp_seats_b']] as const) {
    const z = lounge.minZ + (row ? 2.9 : 1.0) + 0.08;
    group.add(skyCopies(name, [{ x: cx - 2.6, z }, { x: cx + 2.3, z }]));
  }
  return group;
}
/** Where people sit in a lounge with seats: spot `i` of 16. */
export function seatAt(lounge: Rect, i: number): { x: number; z: number } {
  const cx = (lounge.minX + lounge.maxX) / 2;
  const row = Math.floor(i / 8) % 2;
  const col = i % 8;
  return { x: cx + (col < 4 ? -2.6 : 2.3) - 1.35 + (col % 4) * 0.9, z: lounge.minZ + (row ? 2.9 : 1.0) + 0.1 };
}

/** The hall's walls as rectangles (solid), with gaps at the entrance and each gate's door. */
export function hallWalls(layout: AirportLayout): Rect[] {
  const { hall, entrance } = layout;
  const t = 0.25;
  const rects: Rect[] = [];
  const run = (z: number, gaps: [number, number][]): void => {
    let from = hall.minX;
    for (const [x, half] of [...gaps].sort((a, b) => a[0] - b[0])) {
      rects.push({ minX: from, maxX: x - half, minZ: z - t, maxZ: z + t });
      from = x + half;
    }
    rects.push({ minX: from, maxX: hall.maxX, minZ: z - t, maxZ: z + t });
  };
  run(hall.minZ, Object.values(layout.gates).map((g): [number, number] => [g.door.x, 1.5]));
  run(hall.maxZ, [[entrance.x, 2.5]]);
  rects.push({ minX: hall.minX - t, maxX: hall.minX + t, minZ: hall.minZ, maxZ: hall.maxZ });
  rects.push({ minX: hall.maxX - t, maxX: hall.maxX + t, minZ: hall.minZ, maxZ: hall.maxZ });
  return rects;
}

/** Where the airport's name stands, on the plaza beside the entrance. */
export function entranceSign(layout: AirportLayout): Point {
  return { x: layout.entrance.x - 9.4, z: layout.hall.maxZ + 3.4 };
}

/**
 * The check-in hall (built where it stands): glass walls, lamp columns, a portal with its sign over each
 * gate's door, the entrance with its sliding doors (they open as anyone comes near), the hoarding where the
 * new terminal will go.
 */
export class Hall {
  readonly root: Object3D;
  private readonly doors: { node: Object3D; x: number; side: number }[];
  private open = 0;
  constructor(private readonly layout: AirportLayout) {
    this.root = skyMover('sp_hall');
    Object.keys(layout.gates).forEach((key, i) => signAt(this.root, `sp_hall_${key}`, `GATE ${i + 1}`, 3.5, 0.78, AIR.navy, AIR.sun));
    signAt(this.root, 'sp_hall_entry', 'DEPARTURES', 5.3, 0.62, AIR.navy, '#ffffff');
    this.doors = [
      { node: part(this.root, 'sp_hall_doorl'), x: 0, side: -1 },
      { node: part(this.root, 'sp_hall_doorr'), x: 0, side: 1 },
    ];
    for (const door of this.doors) door.x = door.node.position.x;
  }
  /** The doors slide open while anyone's within a step or two of them. */
  update(dt: number, near: readonly Point[]): void {
    const { entrance, hall } = this.layout;
    const someone = near.some((p) => Math.abs(p.x - entrance.x) < 3.2 && Math.abs(p.z - hall.maxZ) < 2.4);
    this.open += ((someone ? 1 : 0) - this.open) * Math.min(1, dt * 5);
    for (const door of this.doors) door.node.position.x = door.x + door.side * 1.2 * this.open;
  }
}

/** The airport's name in big letters on its plinth, a little plane circling over it. */
export class NameSign {
  readonly root: Object3D;
  private readonly plane: Object3D;
  constructor() {
    this.root = skyMover('sp_name');
    this.plane = part(this.root, 'sp_name_plane');
  }
  update(dt: number): void {
    this.plane.rotation.y -= dt * 0.9;
  }
}

/** A barrier across a gate's door until the gate is bought. */
export function gateBarrier(gate: GateSpot): Object3D {
  const barrier = skyModel('sp_barrier');
  barrier.position.set(gate.door.x, 0, gate.door.z);
  return barrier;
}

// ---- outside ---------------------------------------------------------------------------------------------------

/** A taxi (the town's yellow cab, art/blender/cars_special.py), nose to +z; its wheels roll as it drives. */
export function taxiCar(): CarModel {
  const car = new CarModel();
  car.setType({ id: 'taxi', name: 'Taxi', model: 'taxi', scale: 0.92, size: [1.58, 1.38, 3.42], paints: ['#ffd24a'] } as unknown as CarDef);
  return car;
}

/** The windsock: the sock turns into the wind and its rings swing as it blows. */
export class Windsock {
  readonly root: Object3D;
  private readonly sock: Object3D;
  private readonly rings: Object3D[];
  private time = Math.random() * 10;
  constructor() {
    this.root = skyMover('sp_windsock');
    this.sock = part(this.root, 'sp_windsock_sock');
    this.rings = [0, 1, 2, 3].map((k) => part(this.root, `sp_windsock_ring${k}`));
  }
  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    this.sock.rotation.y = 0.5 + Math.sin(t * 0.35) * 0.35 + Math.sin(t * 1.9) * 0.06;
    this.rings.forEach((ring, k) => {
      ring.rotation.z = -0.05 - k * 0.025 + Math.sin(t * 2.6 - k * 0.8) * 0.05;
      ring.rotation.y = Math.sin(t * 3.1 - k * 0.9) * 0.07;
    });
  }
}

/** The radar on its hut: the dish goes round. */
export class Radar {
  readonly root: Object3D;
  private readonly dish: Object3D;
  constructor() {
    this.root = skyMover('sp_radar');
    this.dish = part(this.root, 'sp_radar_dish');
  }
  update(dt: number): void {
    this.dish.rotation.y += dt * 1.1;
  }
}

/** A flag on its pole: its four strips wave, each a moment after the last. */
export class Flag {
  readonly root: Object3D;
  private readonly strips: Object3D[];
  private time = Math.random() * 10;
  constructor() {
    this.root = skyMover('sp_flag');
    this.strips = [0, 1, 2, 3].map((k) => part(this.root, `sp_flag_s${k}`));
  }
  update(dt: number): void {
    this.time += dt;
    this.strips.forEach((strip, k) => (strip.rotation.y = Math.sin(this.time * 3.4 - k * 1.1) * (0.18 + k * 0.05)));
  }
}

/** A little single-engined plane on the grass, its propeller ticking over (or still). */
export class LightPlane {
  readonly root: Object3D;
  private readonly prop: Object3D;
  constructor(private readonly running: boolean) {
    this.root = skyMover('sp_gaplane');
    this.prop = part(this.root, 'sp_gaplane_prop');
  }
  update(dt: number): void {
    if (this.running) this.prop.rotation.z += dt * 14;
  }
}

/**
 * The ring a ramp pad shows when its plane is ready to go: it closes in on the pad, over and over. Step
 * onto the pad as it meets the pad's edge for a perfect take-off.
 */
export class TimingRing {
  readonly mesh: Mesh;
  constructor() {
    this.mesh = new Mesh(new RingGeometry(0.93, 1, 48).rotateX(-PI / 2), new MeshBasicMaterial({ color: 0xff5fa8, transparent: true, opacity: 0.95, depthWrite: false }));
    this.mesh.position.y = 0.09;
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
  }
  /** Shows the ring at `radius` metres (null hides it), brighter the nearer the pad's edge. */
  show(radius: number | null, onTarget = false): void {
    this.mesh.visible = radius !== null;
    if (radius === null) return;
    this.mesh.scale.set(radius, 1, radius);
    (this.mesh.material as MeshBasicMaterial).color.setHex(onTarget ? 0xffd24a : 0xff5fa8);
  }
}
