// Skyport International's models, made in Blender (art/blender/skyport_plane.py, skyport_kit.py and
// skyport_terminal.py) and drawn here: the airliner in each airline's colours, with its propellers, doors,
// flaps, gear, wheels and lights; the air stairs, fuel truck and baggage belt; the check-in desk, the
// gates' podiums, the lounges' seats; the hall with its sliding doors; the airport's name; the windsock,
// the radar and the flags. A model with moving parts is drawn as one skinned mesh (rigid.ts): one draw
// call, its parts still turned by name. The words on signs are painted here.
import {
  Box3,
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
  'building:skyport-jet',
  'building:skyport-wing',
  'building:skyport-shops',
  'building:skyport-kitchen',
  'building:skyport-apron',
  'building:skyport-vehicles',
  'building:skyport-hall',
  'building:skyport-field',
  'building:skyport-terminal',
  'building:skyport-name',
  'building:skyport-wide',
  'building:skyport-freighter',
  'building:skyport-cargo',
  'building:skyport-hangar',
  'building:skyport-jetwash',
  'building:skyport-private',
  'building:skyport-tower',
  'building:skyport-pier',
  'building:skyport-vip',
  'building:skyport-mogul',
  'building:skyport-shuttle',
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

/** Each model's outline on the ground (its own space, the base at the origin), measured once. */
const outlines = new Map<string, Rect>();

/**
 * Where a model stands on the ground once placed at (x, z), turned `rot` about y: its outline as a
 * rectangle (the box round it, if it's turned at an angle), shrunk by `inset` all round (a little, so
 * the hero can brush past a rounded edge).
 */
export function footprint(name: string, x: number, z: number, rot = 0, inset = 0): Rect {
  let local = outlines.get(name);
  if (!local) {
    const base = skyPiece(name);
    base.updateMatrixWorld(true);
    const inverse = new Matrix4().copy(base.matrixWorld).invert();
    const box = new Box3();
    const part = new Box3();
    base.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const geometry = node.geometry as BufferGeometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      box.union(part.copy(geometry.boundingBox!).applyMatrix4(new Matrix4().multiplyMatrices(inverse, node.matrixWorld)));
    });
    local = { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z };
    outlines.set(name, local);
  }
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const xs: number[] = [];
  const zs: number[] = [];
  for (const [lx, lz] of [[local.minX, local.minZ], [local.maxX, local.minZ], [local.minX, local.maxZ], [local.maxX, local.maxZ]] as const) {
    // A turn about y: (x, z) → (x cos + z sin, -x sin + z cos).
    xs.push(x + lx * c + lz * s);
    zs.push(z - lx * s + lz * c);
  }
  return { minX: Math.min(...xs) + inset, maxX: Math.max(...xs) - inset, minZ: Math.min(...zs) + inset, maxZ: Math.max(...zs) - inset };
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
/** The same board on the back of what the marker's on, `depth` behind it (for a counter turned to face away from the camera). */
function backSignAt(model: Object3D, marker: string, text: string, width: number, height: number, background: string, colour: string, depth: number): Mesh {
  const sign = signAt(model, marker, text, width, height, background, colour);
  sign.rotation.y = Math.PI;
  sign.position.z -= depth;
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
  // Goldsby Air, Rex's cut-price airline (the tower's hops): always last.
  { accent: '#2b2f38', accent2: '#ffc21a' },
];
/** Goldsby Air's colours (the last livery): the others are the airlines that come and go. */
export const GOLDSBY = LIVERIES.length - 1;

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
/**
 * What's solid of a parked plane (its middle at the origin, nose to +z): half its fuselage's width and where
 * it starts and ends along it, and the low things round it a person bumps into (wheels, propellers, engines
 * under the wing): their middles (the right-hand one of each pair; the left's is its mirror) and half-sizes.
 */
export interface PlaneSolid {
  half: number;
  tail: number;
  nose: number;
  parts: { x: number; z: number; hx: number; hz: number }[];
}
export const PROP_SOLID: PlaneSolid = { half: 1.05, tail: -4.4, nose: 4.5, parts: [{ x: 2.4, z: 0.5, hx: 0.35, hz: 0.45 }, { x: 2.4, z: 2.2, hx: 1.0, hz: 0.18 }] };
/** The jet's (art/blender/skyport_jet.py), and where its engines hang (out from its middle, along it). */
export const JET = { length: 14, span: 14.4, radius: 1.3, ride: 2.55, sill: 2.2, wingY: 1.9 } as const;
export const JET_SOLID: PlaneSolid = { half: 1.4, tail: -7.0, nose: 7.0, parts: [{ x: 3.5, z: 1.95, hx: 0.66, hz: 1.2 }, { x: 1.75, z: -0.55, hx: 0.42, hz: 0.55 }] };
/** The wide-body (Gate 4): the jet half as big again, with a second, smaller engine further out under each wing. */
const S = 20 / 14;
export const WIDE = { length: 20, span: 14.4 * S, radius: 1.3 * S, ride: 2.55 * S, sill: 2.2 * S, wingY: 1.9 * S } as const;
export const WIDE_SOLID: PlaneSolid = {
  half: 1.4 * S,
  tail: -10,
  nose: 10,
  parts: [
    { x: 3.5 * S, z: 1.95 * S, hx: 0.66 * S, hz: 1.2 * S },
    { x: 5.95 * S, z: 0.97 * S, hx: 0.56 * S, hz: 1.02 * S },
    { x: 1.75 * S, z: -0.55 * S, hx: 0.42 * S, hz: 0.55 * S },
  ],
};
/** The golden private jet (art/blender/skyport_private.py): its engines on the back of the fuselage. */
export const PRIVATE = { length: 11, span: 10.4, radius: 0.9, ride: 1.6, sill: 1.05, wingY: 1.0 } as const;
export const PRIVATE_SOLID: PlaneSolid = { half: 0.95, tail: -5.5, nose: 5.5, parts: [{ x: 1.42, z: -2.75, hx: 0.5, hz: 0.95 }, { x: 1.25, z: -1.0, hx: 0.3, hz: 0.4 }] };
/**
 * Each plane's size, its solid outline, its model, its propellers' (or fans') part names (`spinner` + each of
 * `fans`) and their blur discs' radius, its wheels' radii (main, nose), whether the airline's colours are
 * painted on it, and how its passenger door opens (swung round on its front edge, or folded down as steps).
 */
export const PLANES = {
  prop: { size: PROP, solid: PROP_SOLID, model: 'sp_plane', spinner: 'prop', fans: ['l', 'r'], blur: 1.06, wheel: { main: 0.36, nose: 0.3 }, livery: true, airstair: false, cargoDoor: false },
  jet: { size: JET, solid: JET_SOLID, model: 'sp_jet', spinner: 'fan', fans: ['l', 'r'], blur: 0.6, wheel: { main: 0.46, nose: 0.34 }, livery: true, airstair: false, cargoDoor: false },
  wide: { size: WIDE, solid: WIDE_SOLID, model: 'sp_wide', spinner: 'fan', fans: ['l', 'r', 'l2', 'r2'], blur: 0.6 * S, wheel: { main: 0.46 * S, nose: 0.34 * S }, livery: true, airstair: false, cargoDoor: false },
  private: { size: PRIVATE, solid: PRIVATE_SOLID, model: 'sp_private', spinner: 'fan', fans: ['l', 'r'], blur: 0.42, wheel: { main: 0.3, nose: 0.22 }, livery: false, airstair: true, cargoDoor: false },
  // (Part D: the wide-body as a freighter, its main-deck door up the left side, hinged along its top.)
  freighter: { size: WIDE, solid: WIDE_SOLID, model: 'sp_freighter', spinner: 'fan', fans: ['l', 'r', 'l2', 'r2'], blur: 0.6 * S, wheel: { main: 0.46 * S, nose: 0.34 * S }, livery: true, airstair: false, cargoDoor: true },
} as const;
export type PlaneKindName = keyof typeof PLANES;

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
  /** Doors open (1) or shut (0): the passengers' door, the hold's, the galley's (a jet's back door, for its meals). */
  door: number;
  hold: number;
  galley?: number;
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
  private readonly galley: Object3D;
  private readonly flaps: Object3D[];
  private readonly mainGear: Object3D[];
  private readonly noseGear: Object3D;
  private readonly nose: Object3D;
  private readonly wheels: { node: Object3D; radius: number }[];
  private readonly beacon: Mesh;
  private readonly strobe: Mesh;
  private readonly taxi: Mesh;
  private readonly eased = { door: 0, hold: 0, galley: 0, flaps: 0, gear: 1 };
  private readonly airstair: boolean;
  private readonly cargoDoor: boolean;
  private turn = 0;
  private time = Math.random() * 3;
  readonly kind: PlaneKindName;

  constructor(livery: Livery, kind: PlaneKindName = 'prop') {
    this.kind = kind;
    const plane = PLANES[kind];
    const name = plane.model;
    // (Mogul Air's and the airlines' colours on an airliner; the private jet's gold is its own.)
    const model = plane.livery ? skyMover(name, `${name}:${livery.accent}:${livery.accent2}`, (geometry) => familyPainter(geometry, PLANE_PAINTS)([livery.accent, livery.accent2])) : skyMover(name);
    // Its own flat shadow follows it (the sun's would be left behind on the shadow map).
    model.traverse((node) => (node.castShadow = false));
    this.root.add(model);
    this.root.rotation.order = 'YXZ';
    this.props = plane.fans.map((s) => part(model, `${name}_${plane.spinner}${s}`));
    this.airstair = plane.airstair;
    this.cargoDoor = plane.cargoDoor;
    this.door = part(model, `${name}_door`);
    this.hold = part(model, `${name}_hold`);
    this.galley = part(model, `${name}_galley`);
    this.flaps = ['l', 'r'].map((s) => part(model, `${name}_flap${s}`));
    this.mainGear = ['l', 'r'].map((s) => part(model, `${name}_gear${s}`));
    this.noseGear = part(model, `${name}_gearn`);
    this.nose = part(model, `${name}_nose`);
    this.wheels = [
      { node: part(model, `${name}_wheel_l`), radius: plane.wheel.main },
      { node: part(model, `${name}_wheel_r`), radius: plane.wheel.main },
      { node: part(model, `${name}_wheel_n`), radius: plane.wheel.nose },
    ];

    // The propellers' (or fans') blur, shown over them when they're spinning fast.
    const discMaterial = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: kind === 'prop' ? 0.22 : 0.3, depthWrite: false });
    for (const s of plane.fans) {
      const disc = new Mesh(new CircleGeometry(plane.blur, 24), discMaterial);
      disc.position.z = 0.02;
      disc.visible = false;
      part(model, `${name}_blur${s}`).add(disc);
      this.discs.push(disc);
    }
    // Lights: the beacon on its back, red on the left wingtip and green on the right, the tail's strobe,
    // the taxi light on the nose leg.
    const light = (marker: string, colour: number, radius: number): Mesh => {
      const bulb = new Mesh(new SphereGeometry(radius, 8, 6), new MeshBasicMaterial({ color: colour }));
      part(model, marker).add(bulb);
      return bulb;
    };
    this.beacon = light(`${name}_beacon`, 0xff3b30, 0.13);
    light(`${name}_navl`, 0xff3b30, 0.11);
    light(`${name}_navr`, 0x35d06a, 0.11);
    this.strobe = light(`${name}_strobe`, 0xffffff, 0.14);
    this.taxi = light(`${name}_taxi`, 0xfff6c8, 0.1);

    // Its shadow on the ground, in its own shape.
    const size = plane.size;
    const shapes = {
      prop: [wingShape(PROP.span, 1.9, 1.15, 0.28), 1.0, wingShape(4.3, 1.15, 0.68, 0.45), -3.5, 1],
      jet: [wingShape(JET.span, 3.2, 1.05, 3.15), 1.7, wingShape(5.8, 1.6, 0.75, 1.25), -5.0, 1],
      wide: [wingShape(JET.span, 3.2, 1.05, 3.15), 1.7, wingShape(5.8, 1.6, 0.75, 1.25), -5.0, S],
      freighter: [wingShape(JET.span, 3.2, 1.05, 3.15), 1.7, wingShape(5.8, 1.6, 0.75, 1.25), -5.0, S],
      private: [wingShape(PRIVATE.span, 2.3, 0.85, 2.1), 0.6, wingShape(3.7, 1.05, 0.55, 0.6), -4.95, 1],
    } as const;
    const [wingAt, wingZ, tailAt, tailZ, scale] = shapes[kind];
    const outline = new ShapeGeometry(wingAt).rotateX(PI / 2).translate(0, 0, wingZ).scale(scale, 1, scale);
    const tail = new ShapeGeometry(tailAt).rotateX(PI / 2).translate(0, 0, tailZ).scale(scale, 1, scale);
    const trunk = new CircleGeometry(1, 20).rotateX(-PI / 2).scale(size.radius * 0.98, 1, size.length / 2);
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
    e.galley = ease(e.galley, pose.galley ?? 0, 2.2);
    e.flaps = ease(e.flaps, pose.flaps, 1.4);
    e.gear = ease(e.gear, pose.gear, 1.1);
    // Propellers (or fans): a visible turn while they wind up and down, a blur over a steady whirl when they're fast.
    const blur = pose.engines > (this.kind === 'prop' ? 0.45 : 0.6);
    this.turn += dt * (blur ? 9 : (2 + pose.engines * 20) * Math.min(1, pose.engines * 6));
    for (let i = 0; i < this.props.length; i++) {
      this.props[i]!.rotation.z = this.turn * (i ? 1 : -1);
      this.discs[i]!.visible = blur;
    }
    // (A private jet's door folds down from its sill to the ground as steps.)
    if (this.airstair) this.door.rotation.z = -1.78 * e.door;
    else if (this.cargoDoor) this.door.rotation.z = 1.55 * e.door;
    else this.door.rotation.y = -2.7 * e.door;
    this.hold.rotation.z = -1.45 * e.hold;
    this.galley.rotation.y = -2.7 * e.galley;
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

/** Wheel chocks and cones round a parked plane (its middle at the origin, nose to +z): at its wheels, off its wingtips and tail. */
export function standKit(kind: PlaneKindName = 'prop'): Object3D {
  const group = new Group();
  // The chocks at its main wheels and nose wheel, the cones off its wingtips and tail.
  const at: Record<PlaneKindName, { wheel: [number, number]; nose: number; tip: [number, number]; tail: number }> = {
    prop: { wheel: [2.4, 0.5], nose: 3.3, tip: [5.75, 0.2], tail: -4.9 },
    jet: { wheel: [1.75, -0.55], nose: 5.55, tip: [7.7, -2.0], tail: -7.6 },
    wide: { wheel: [1.75 * S, -0.55 * S], nose: 5.55 * S, tip: [7.7 * S, -2.0 * S], tail: -7.6 * S },
    freighter: { wheel: [1.75 * S, -0.55 * S], nose: 5.55 * S, tip: [7.7 * S, -2.0 * S], tail: -7.6 * S },
    private: { wheel: [1.25, -1.0], nose: 4.15, tip: [5.7, -2.2], tail: -6.1 },
  };
  const { wheel: [wx, wz], tip: [tx, tz], nose, tail } = at[kind];
  group.add(
    skyCopies('sp_chocks', [{ x: wx, z: wz, rot: PI / 2 }, { x: -wx, z: wz, rot: PI / 2 }, { x: 0, z: nose, rot: PI / 2 }]),
    skyCopies('sp_cone', [{ x: tx, z: tz }, { x: -tx, z: tz }, { x: 0, z: tail }]),
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

/**
 * A lounge's seats: two beams of four either side of the aisle down from the gate's door (wide enough for the
 * hero to walk with room to spare), in two rows. Across from the lounge's middle, and in from its front.
 */
const SEAT_BEAMS = [-2.75, 2.55] as const;
const SEAT_ROWS = [1.0, 2.9, 4.8] as const;
/** Rows of seats a lounge holds: two, or three if it's deep enough (a jet's 24 passengers). */
const seatRows = (lounge: Rect): number => (lounge.maxZ - lounge.minZ >= SEAT_ROWS[2] + 1.2 ? 3 : 2);
/** Each beam's footprint (sp_seats_a/b), from its spot. */
const BEAM = { minX: -1.85, maxX: 1.85, minZ: -0.41, maxZ: 0.34 } as const;
const beamSpots = (lounge: Rect, row: number): Point[] => {
  const cx = (lounge.minX + lounge.maxX) / 2;
  return SEAT_BEAMS.map((dx) => ({ x: cx + dx, z: lounge.minZ + SEAT_ROWS[row]! + 0.08 }));
};

/** Rows of seats filling a lounge: two beams of four in each row, two rows (the front navy, the back teal). */
export function loungeSeats(lounge: Rect): Object3D {
  const group = new Group();
  for (let row = 0; row < seatRows(lounge); row++) group.add(skyCopies(row % 2 ? 'sp_seats_b' : 'sp_seats_a', beamSpots(lounge, row)));
  return group;
}
/** The seats' solid footprints in a lounge. */
export function loungeSeatSolids(lounge: Rect): Rect[] {
  return Array.from({ length: seatRows(lounge) }, (_, row) => row).flatMap((row) => beamSpots(lounge, row).map((p) => ({ minX: p.x + BEAM.minX, maxX: p.x + BEAM.maxX, minZ: p.z + BEAM.minZ, maxZ: p.z + BEAM.maxZ })));
}
/** Where people sit in a lounge with seats: spot `i` of its 16 (or 24). */
export function seatAt(lounge: Rect, i: number): { x: number; z: number } {
  const row = Math.floor(i / 8) % seatRows(lounge);
  const col = i % 8;
  const beam = beamSpots(lounge, row)[col < 4 ? 0 : 1]!;
  return { x: beam.x - 1.35 + (col % 4) * 0.9, z: beam.z + 0.02 };
}

/**
 * The hall's walls as rectangles (solid), with gaps at the entrance and each of its gates' doors; its east
 * end (the hoarding) only until the wing is built on there.
 */
export function hallWalls(layout: AirportLayout, wing = false): Rect[] {
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
  run(hall.minZ, Object.values(layout.gates).filter((g) => g.door.x > hall.minX && g.door.x < hall.maxX).map((g): [number, number] => [g.door.x, 1.5]));
  run(hall.maxZ, [[entrance.x, 2.5]]);
  rects.push({ minX: hall.minX - t, maxX: hall.minX + t, minZ: hall.minZ, maxZ: hall.maxZ });
  if (!wing) rects.push({ minX: hall.maxX - t, maxX: hall.maxX + t, minZ: hall.minZ, maxZ: hall.maxZ });
  return rects;
}

/**
 * The wing's walls (art/blender/skyport_wing.py) as rectangles: along the apron with the doorway out and the
 * jet bridge's door (its rotunda stands outside it), along the front, and the east end where the kitchen's
 * hatch is (a window over a counter: solid all the same).
 */
export function wingWalls(layout: AirportLayout): Rect[] {
  const { wing } = layout;
  const t = 0.25;
  const gate = Object.values(layout.gates).find((g) => g.door.x > wing.minX && g.door.x < wing.maxX);
  const gaps: [number, number][] = gate ? [[gate.apron?.x ?? gate.door.x, 1.5], [gate.door.x, 0.75]] : [];
  const rects: Rect[] = [];
  let from = wing.minX;
  for (const [x, half] of gaps.sort((a, b) => a[0] - b[0])) {
    rects.push({ minX: from, maxX: x - half, minZ: wing.minZ - t, maxZ: wing.minZ + t });
    from = x + half;
  }
  rects.push({ minX: from, maxX: wing.maxX, minZ: wing.minZ - t, maxZ: wing.minZ + t });
  rects.push({ minX: wing.minX, maxX: wing.maxX, minZ: wing.maxZ - t, maxZ: wing.maxZ + t });
  rects.push({ minX: wing.maxX - t, maxX: wing.maxX + t, minZ: wing.minZ, maxZ: wing.maxZ });
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
  /** The hoarding along its east end, until the wing's built there. */
  readonly hoarding: Object3D;
  constructor(private readonly layout: AirportLayout) {
    this.root = skyMover('sp_hall');
    Object.keys(layout.gates).forEach((key, i) => {
      if (this.root.getObjectByName(`sp_hall_${key}`)) signAt(this.root, `sp_hall_${key}`, `GATE ${i + 1}`, 3.5, 0.78, AIR.navy, AIR.sun);
    });
    this.hoarding = skyModel('sp_hoarding');
    this.root.add(this.hoarding);
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
  // Sparkling clean (a car's muddy until the car wash cleans it).
  car.setClean('dusty', 1);
  return car;
}

// ---- the terminal (Part B) -------------------------------------------------------------------------------------

/** The wing built on east of the hall (where it stands), its signs painted: GATE 3 over the jet bridge's door, RAMP over the doorway out. */
export function wingModel(gateNumber: number): Object3D {
  const wing = skyModel('sp_wing');
  signAt(wing, 'sp_wing_gate3', `GATE ${gateNumber}`, 2.3, 0.78, AIR.navy, AIR.sun);
  signAt(wing, 'sp_wing_apron', 'RAMP', 3.3, 0.5, AIR.navy, '#ffffff');
  return wing;
}

/** Each gate's colour (its cases' and its hold pad's), in gate order. */
export const GATE_COLOURS = ['#ff5fa8', '#2c62d6', '#3fb84a', '#ff8a3d'] as const;

/**
 * The jet bridge, its rotunda by the wing's wall: the tunnel turns to reach the parked jet's door and slides
 * out to it (back in once the jet's gone); the cab at its end squares up to the fuselage; the wheels roll as
 * it goes; its beacon turns while it moves.
 */
export class JetBridge {
  readonly root: Object3D;
  private readonly outer: Object3D;
  private readonly cab: Object3D;
  private readonly wheels: Object3D;
  private readonly beacon: Mesh;
  private readonly outerY: number;
  /** How far the tunnel reaches (from the rotunda to the cab's front) folded right in, and how far out it is now. */
  private readonly folded: number;
  private reach = 0;
  private time = 0;
  constructor(at: Point) {
    this.root = skyMover('sp_jetbridge');
    this.root.position.set(at.x, 0, at.z);
    this.outer = part(this.root, 'sp_jetbridge_outer');
    this.cab = part(this.root, 'sp_jetbridge_cab');
    this.wheels = part(this.root, 'sp_jetbridge_wheels');
    this.outerY = this.outer.position.z;
    const door = part(this.root, 'sp_jetbridge_door');
    // (Along the tunnel, which runs to -z: the cab's door marker, out from the rotunda.)
    this.root.updateMatrixWorld(true);
    const local = this.root.worldToLocal(door.getWorldPosition(new Vector3()));
    this.folded = -local.z;
    this.beacon = new Mesh(new SphereGeometry(0.12, 8, 6), new MeshBasicMaterial({ color: 0xffb02e }));
    part(this.root, 'sp_jetbridge_beacon').add(this.beacon);
  }
  /**
   * One frame: aims along the line to `door` (the jet's, or where it would be) and reaches `docked ? all the way
   * : folded back` (the time it takes is the hero's to watch).
   */
  update(dt: number, door: Point, docked: boolean): void {
    this.time += dt;
    const dx = door.x - this.root.position.x;
    const dz = door.z - this.root.position.z;
    const angle = Math.atan2(-dx, -dz);
    this.root.rotation.y += (angle - this.root.rotation.y) * Math.min(1, dt * 1.6);
    const want = docked ? Math.max(0, Math.hypot(dx, dz) - 0.35 - this.folded) : 0;
    const before = this.reach;
    this.reach += (want - this.reach) * Math.min(1, dt * 1.4);
    const moving = Math.abs(this.reach - before) > dt * 0.05;
    this.outer.position.z = this.outerY - this.reach;
    this.wheels.rotation.x -= (this.reach - before) / 0.32;
    // The cab squares up to the fuselage (which runs along z): it faces -x, whichever way the tunnel turned.
    this.cab.rotation.y = Math.PI / 2 - this.root.rotation.y;
    this.beacon.visible = moving && this.time % 0.8 < 0.4;
  }
}

/** The catering truck by a jet's galley door: its box rises on the scissor arms to the door while it's loading, then sinks. */
export class CateringTruck {
  readonly root: Object3D;
  private readonly box: Object3D;
  private readonly arms: Object3D[];
  private readonly boxZ: number;
  private lift = 0;
  constructor() {
    this.root = skyMover('sp_catering');
    this.box = part(this.root, 'sp_catering_box');
    this.arms = ['a', 'b'].map((s) => part(this.root, `sp_catering_arm${s}`));
    this.boxZ = this.box.position.y;
    signAt(this.root, 'sp_catering_sign', 'SKY KITCHEN', 2.6, 0.5, AIR.aqua, '#ffffff').rotation.y = PI / 2;
  }
  /** Up to `height` metres (a jet's sill, less the box's floor) while `up`, else down. */
  update(dt: number, up: boolean, height = 1.0): void {
    this.lift += ((up ? height : 0) - this.lift) * Math.min(1, dt * 1.2);
    this.box.position.y = this.boxZ + this.lift;
    this.arms.forEach((arm, i) => (arm.rotation.x = (i ? 1 : -1) * Math.min(0.9, this.lift * 0.75)));
  }
}

/** The café (its customers to -z once turned round to face the hall): its giant cup turns; the espresso machine steams while it's serving. */
export class Cafe {
  readonly root: Object3D;
  private readonly cup: Object3D;
  readonly steam: Object3D;
  constructor() {
    this.root = skyMover('sp_cafe');
    this.cup = part(this.root, 'sp_cafe_cup');
    this.steam = part(this.root, 'sp_cafe_steam');
    signAt(this.root, 'sp_cafe_sign', 'SKY CAFÉ', 1.8, 0.38, AIR.navy, AIR.sun).position.z += 0.02;
    signAt(this.root, 'sp_cafe_menu', 'COFFEE · CAKES · SANDWICHES', 2.9, 0.5, AIR.navy, '#ffffff').position.z += 0.05;
    // (It stands by a wall facing away from the camera: its name on the menu board's back too.)
    backSignAt(this.root, 'sp_cafe_menu', 'SKY CAFÉ', 2.6, 0.6, AIR.navy, AIR.sun, 0.11);
  }
  update(dt: number): void {
    this.cup.rotation.y += dt * 0.8;
  }
}

/** Duty-free: its giant perfume bottle turns on its plinth. */
export class DutyFree {
  readonly root: Object3D;
  private readonly turn: Object3D;
  constructor() {
    this.root = skyMover('sp_dutyfree');
    this.turn = part(this.root, 'sp_dutyfree_turn');
    signAt(this.root, 'sp_dutyfree_sign', 'DUTY FREE', 4.4, 0.4, AIR.navy, AIR.pink).position.z += 0.02;
    backSignAt(this.root, 'sp_dutyfree_sign', 'DUTY FREE', 4.4, 0.4, AIR.navy, AIR.pink, 0.16);
  }
  update(dt: number): void {
    this.turn.rotation.y += dt * 0.9;
  }
}

/**
 * A security lane's solid parts round its arch: the arch's posts, the X-ray machine beside the lane, the belts
 * guiding its line. Its line runs along +x (the wing's), or (`north`, the model turned a quarter) along -z (the pier's).
 */
export function securityLaneSolids(arch: { x: number; z: number }, north = false): Rect[] {
  const local: Rect[] = [
    { minX: -0.16, maxX: 0.16, minZ: -0.86, maxZ: -0.34 },
    { minX: -0.16, maxX: 0.16, minZ: 0.34, maxZ: 0.86 },
    { minX: -1.85, maxX: 1.65, minZ: 0.66, maxZ: 1.48 },
    { minX: -3.45, maxX: -0.95, minZ: -0.79, maxZ: -0.71 },
    { minX: -3.45, maxX: -0.95, minZ: 0.56, maxZ: 0.64 },
  ];
  // (Turned a quarter to the left, local x runs to -z and local z to +x.)
  return local.map((r) =>
    north
      ? { minX: arch.x + r.minZ, maxX: arch.x + r.maxZ, minZ: arch.z - r.maxX, maxZ: arch.z - r.minX }
      : { minX: arch.x + r.minX, maxX: arch.x + r.maxX, minZ: arch.z + r.minZ, maxZ: arch.z + r.maxZ },
  );
}

/** The security lane: the X-ray belt runs and its flaps swing while someone's going through; the arch's lamp blinks green for each. */
export class SecurityLane {
  readonly root: Object3D;
  private readonly belt: Object3D;
  private readonly beltX: number;
  private readonly flaps: Object3D[];
  private readonly lamp: Mesh;
  private run = 0;
  private time = 0;
  private flash = 0;
  constructor() {
    this.root = skyMover('sp_security');
    this.belt = part(this.root, 'sp_security_belt');
    this.beltX = this.belt.position.x;
    this.flaps = [0, 1, 2, 3].map((k) => part(this.root, `sp_security_flap${k}`));
    this.lamp = new Mesh(new SphereGeometry(0.11, 8, 6), new MeshBasicMaterial({ color: 0x3fb84a }));
    part(this.root, 'sp_security_lamp').add(this.lamp);
  }
  /** Someone's through: a green blink. */
  passed(): void {
    this.flash = 0.6;
  }
  update(dt: number, busy: boolean): void {
    this.time += dt;
    this.flash = Math.max(0, this.flash - dt);
    if (busy) this.run = (this.run + dt * 0.6) % 0.28;
    this.belt.position.x = this.beltX + this.run;
    this.flaps.forEach((flap, k) => {
      const swing = busy ? 0.4 * Math.max(0, Math.sin(this.time * 4 + k * 1.4)) : 0;
      flap.rotation.z += (swing - flap.rotation.z) * Math.min(1, dt * 8);
    });
    (this.lamp.material as MeshBasicMaterial).color.setHex(this.flash > 0 ? 0x3fff6a : busy ? 0xffb02e : 0x2c8a4a);
  }
}

/** The catering kitchen: its roof fans spin, the giant dish's lid lifts now and then; trays wait on the hatch's shelf. */
export class Kitchen {
  readonly root: Object3D;
  private readonly fans: Object3D[];
  private readonly lid: Object3D;
  readonly hatch: Object3D;
  readonly steam: Object3D;
  private time = 0;
  constructor() {
    this.root = skyMover('sp_kitchen');
    this.fans = ['1', '2'].map((k) => part(this.root, `sp_kitchen_fan${k}`));
    this.lid = part(this.root, 'sp_kitchen_lid');
    this.hatch = part(this.root, 'sp_kitchen_hatch');
    this.steam = part(this.root, 'sp_kitchen_steam');
    signAt(this.root, 'sp_kitchen_sign', 'SKY KITCHEN', 5.2, 0.62, AIR.navy, AIR.sun).position.z += 0.02;
  }
  update(dt: number): void {
    this.time += dt;
    for (const [i, fan] of this.fans.entries()) fan.rotation.y += dt * (5 + i);
    // Every few seconds the lid lifts to show the dish, and settles again.
    const t = this.time % 7;
    const up = t < 1.6 ? Math.sin((t / 1.6) * PI) : 0;
    this.lid.rotation.z = 0.9 * up;
  }
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

// ---- the tower and VIP side (Part C) ---------------------------------------------------------------------------

/** A room's low walls as solid rectangles, with doorways (`x` along the north or south wall, `half` wide either side). */
export function roomWalls(room: Rect, doors: { side: 'north' | 'south'; x: number; half: number }[]): Rect[] {
  const t = 0.25;
  const rects: Rect[] = [];
  for (const side of ['north', 'south'] as const) {
    const z = side === 'north' ? room.minZ : room.maxZ;
    let from = room.minX;
    for (const d of doors.filter((d) => d.side === side).sort((a, b) => a.x - b.x)) {
      rects.push({ minX: from, maxX: d.x - d.half, minZ: z - t, maxZ: z + t });
      from = d.x + d.half;
    }
    rects.push({ minX: from, maxX: room.maxX, minZ: z - t, maxZ: z + t });
  }
  rects.push({ minX: room.minX - t, maxX: room.minX + t, minZ: room.minZ, maxZ: room.maxZ });
  rects.push({ minX: room.maxX - t, maxX: room.maxX + t, minZ: room.minZ, maxZ: room.maxZ });
  return rects;
}

/** Gate 4's pier (built where it stands), its sign over the door. */
export function pierModel(gateNumber: number): Object3D {
  const pier = skyModel('sp_pier');
  signAt(pier, 'sp_pier_gate4', `GATE ${gateNumber}`, 2.3, 0.74, AIR.navy, AIR.sun).position.z += 0.54;
  return pier;
}

/** The control tower: its radar turns, its beacon flashes green and white (and keeps on through fog). */
export class ControlTower {
  readonly root: Object3D;
  private readonly radar: Object3D;
  private readonly beacon: Mesh;
  private time = 0;
  constructor() {
    this.root = skyMover('sp_tower');
    this.radar = part(this.root, 'sp_tower_radar');
    signAt(this.root, 'sp_tower_sign', 'TOWER', 2.4, 0.56, AIR.navy, AIR.sun).position.z += 0.02;
    this.beacon = new Mesh(new SphereGeometry(0.24, 10, 8), new MeshBasicMaterial({ color: 0x3fff6a }));
    part(this.root, 'sp_tower_beacon').add(this.beacon);
  }
  update(dt: number): void {
    this.time += dt;
    this.radar.rotation.y += dt * 1.7;
    (this.beacon.material as MeshBasicMaterial).color.setHex(this.time % 2 < 1 ? 0x3fff6a : 0xffffff);
    this.beacon.visible = this.time % 1 < 0.6;
  }
}

/** The wide-body's stair truck: its landing at the origin at the door's sill, the stairs down along +x. */
export function stairTruck(): Object3D {
  return skyModel('sp_stairtruck');
}

/** A belt loader at a hold: its belt's top at the origin, rising along -x; the cleats run while cases go up. */
export class BeltLoader {
  readonly root: Object3D;
  private readonly belt: Object3D;
  private readonly at: Vector3;
  private run = 0;
  constructor() {
    this.root = skyMover('sp_beltloader');
    this.belt = part(this.root, 'sp_beltloader_belt');
    this.at = this.belt.position.clone();
  }
  update(dt: number, running: boolean): void {
    if (running) this.run = (this.run + dt * 0.9) % 0.33;
    // Up the slope towards the hold (-x, and up by its rise).
    this.belt.position.set(this.at.x - this.run * 0.96, this.at.y + this.run * 0.28, this.at.z);
  }
}

/** The bag sorter by the belt: its belt runs and its pusher arm swings while cases go through; its lamp blinks. */
export class BagSorter {
  readonly root: Object3D;
  private readonly belt: Object3D;
  private readonly arm: Object3D;
  private readonly beltX: number;
  private readonly lamp: Mesh;
  private time = 0;
  private run = 0;
  constructor() {
    this.root = skyMover('sp_sorter');
    this.belt = part(this.root, 'sp_sorter_belt');
    this.arm = part(this.root, 'sp_sorter_arm');
    this.beltX = this.belt.position.x;
    this.lamp = new Mesh(new SphereGeometry(0.1, 8, 6), new MeshBasicMaterial({ color: 0x3fb84a }));
    part(this.root, 'sp_sorter_lamp').add(this.lamp);
  }
  update(dt: number, busy: boolean): void {
    this.time += dt;
    if (busy) this.run = (this.run + dt * 0.7) % 0.28;
    this.belt.position.x = this.beltX + this.run;
    const swing = busy ? 0.55 * Math.max(0, Math.sin(this.time * 5)) : 0;
    this.arm.rotation.y += (swing - this.arm.rotation.y) * Math.min(1, dt * 10);
    (this.lamp.material as MeshBasicMaterial).color.setHex(busy ? (this.time % 0.5 < 0.25 ? 0xffd24a : 0x3fb84a) : 0x2c8a4a);
  }
}

/** The VIP lounge (built where it stands): VIP over both doorways, the side the camera sees. */
export function vipModel(): Object3D {
  const lounge = skyModel('sp_vip');
  signAt(lounge, 'sp_vip_sign', 'VIP LOUNGE', 2.4, 0.62, AIR.navy, '#ffd24a').position.z += 0.52;
  signAt(lounge, 'sp_vip_sign2', 'VIP', 2.4, 0.62, AIR.navy, '#ffd24a').position.z += 0.02;
  return lounge;
}

/** The red carpet from the VIP lounge's door out to the private jet: rolled up, it unrolls to `length`. */
export class RedCarpet {
  readonly root: Object3D;
  private length = 0;
  private want = 0;
  constructor() {
    this.root = skyModel('sp_carpet');
    this.root.scale.set(1, 1, 0.001);
    this.root.visible = false;
  }
  /** Out to `length` metres (0 rolls it back up). */
  set(length: number): void {
    this.want = length;
  }
  get out(): number {
    return this.length;
  }
  update(dt: number): void {
    this.length += (this.want - this.length) * (1 - Math.exp(-dt * 2.4));
    this.root.visible = this.length > 0.05;
    this.root.scale.z = Math.max(0.001, this.length);
  }
}

/** A long vehicle on the road (the limousine, the shuttle bus): its wheels roll as it goes. */
export class RoadVehicle {
  readonly root: Object3D;
  private readonly wheels: Object3D[];
  private readonly door: Object3D | null;
  private readonly doorAt: Vector3 | null;
  private last: Vector3 | null = null;
  private open = 0;
  constructor(
    name: 'sp_limo' | 'sp_shuttle',
    private readonly radius: number,
  ) {
    this.root = skyMover(name);
    this.wheels = [part(this.root, `${name}_wheel_f`), part(this.root, `${name}_wheel_r`)];
    this.door = name === 'sp_shuttle' ? part(this.root, 'sp_shuttle_door') : null;
    this.doorAt = this.door?.position.clone() ?? null;
    if (name === 'sp_shuttle') {
      signAt(this.root, 'sp_shuttle_sign', 'AIRPORT', 1.5, 0.28, '#111820', '#ffb02e').position.z += 0.02;
    }
  }
  /** One frame where it's got to: the wheels roll by how far it moved; the bus's door slides open while it stands with its door open. */
  update(dt: number, doorOpen = false): void {
    const at = this.root.position;
    if (this.last) {
      const moved = at.distanceTo(this.last);
      for (const w of this.wheels) w.rotation.x += moved / this.radius;
    }
    (this.last ??= new Vector3()).copy(at);
    if (this.door && this.doorAt) {
      this.open += ((doorOpen ? 1 : 0) - this.open) * Math.min(1, dt * 5);
      this.door.position.set(this.doorAt.x - 0.08 * this.open, this.doorAt.y, this.doorAt.z + 1.0 * this.open);
    }
  }
}

/** The shuttle's stop on the plaza, its sign. */
export function busStop(): Object3D {
  const stop = skyModel('sp_busstop');
  signAt(stop, 'sp_busstop_sign', 'SHUTTLE', 0.92, 0.5, AIR.navy, '#ffffff').position.z += 0.06;
  return stop;
}

/** One of Mogul Air's twelve souvenirs (in the order of tuning.json's cities), standing at the origin. */
export function souvenirModel(k: number): Object3D {
  const piece = skyPiece(`sp_souvenirs_s${k}`).clone(true);
  piece.position.set(0, 0, 0);
  piece.traverse((node) => {
    if (node instanceof Mesh) {
      node.material = toyMaterial;
      node.castShadow = true;
    }
  });
  return piece;
}

/** The airline's colour in Blender (art/blender/skyport_east.py AIRLINE), repainted in Mogul Air's. */
export const AIRLINE_PAINT = '#7a3fd0';

/**
 * Mogul Air's office: its awning and panels in the airline's colour, its sign, the routes board on the back
 * wall (the game paints the cities on it), the souvenirs on the shelf as they come home.
 */
export class MogulOffice {
  readonly root: Object3D;
  private readonly board: Mesh;
  private readonly canvas: HTMLCanvasElement;
  private readonly texture: CanvasTexture;
  private readonly slots: Object3D[];
  private readonly shown = new Set<number>();
  constructor(colour: string) {
    this.root = skyMover('sp_mogul', `sp_mogul:${colour}`, (geometry) => familyPainter(geometry, [{ base: AIRLINE_PAINT, test: (r, g, b) => b > 150 && r > 90 && r < 160 && g < 90 }])([colour]));
    signAt(this.root, 'sp_mogul_sign', 'MOGUL AIR', 3.4, 0.54, AIR.navy, '#ffffff').position.z += 0.02;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 256;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.board = new Mesh(new PlaneGeometry(4.2, 1.95), new MeshBasicMaterial({ map: this.texture }));
    const at = part(this.root, 'sp_mogul_board');
    this.board.position.copy(at.position);
    this.board.position.z += 0.03;
    at.parent?.add(this.board);
    this.slots = Array.from({ length: 12 }, (_, k) => part(this.root, `sp_mogul_slot${k}`));
  }
  /** Paints the routes board: each city a dot on its tier's ring (opened ones lit), the plane's route drawn out to where it's flying. */
  paintBoard(cities: readonly { icon: string; tier: number }[], opened: (i: number) => boolean, flying: number | null, colour: string): void {
    const g = this.canvas.getContext('2d')!;
    g.fillStyle = '#17324d';
    g.fillRect(0, 0, 512, 256);
    // Faint continents and the rings of the three tiers round home.
    g.fillStyle = '#21486a';
    for (const [x, y, rx, ry] of [[120, 90, 80, 46], [300, 70, 90, 40], [380, 170, 70, 50], [150, 190, 60, 36]] as const) {
      g.beginPath();
      g.ellipse(x, y, rx, ry, 0.3, 0, PI * 2);
      g.fill();
    }
    const home = { x: 256, y: 128 };
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    for (const r of [52, 86, 116]) {
      g.beginPath();
      g.ellipse(home.x, home.y, r * 1.9, r, 0, 0, PI * 2);
      g.stroke();
    }
    const place = (i: number): { x: number; y: number } => {
      const c = cities[i]!;
      const ring = [52, 86, 116][c.tier - 1] ?? 116;
      const a = (i % 4) * (PI / 2) + c.tier * 0.55;
      return { x: home.x + Math.cos(a) * ring * 1.9, y: home.y + Math.sin(a) * ring };
    };
    if (flying !== null && cities[flying]) {
      const to = place(flying);
      g.strokeStyle = colour;
      g.lineWidth = 4;
      g.setLineDash([10, 8]);
      g.beginPath();
      g.moveTo(home.x, home.y);
      g.quadraticCurveTo((home.x + to.x) / 2, Math.min(home.y, to.y) - 40, to.x, to.y);
      g.stroke();
      g.setLineDash([]);
    }
    g.font = '28px "Noto Color Emoji", "Apple Color Emoji", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    cities.forEach((c, i) => {
      const p = place(i);
      g.globalAlpha = opened(i) ? 1 : 0.35;
      g.fillStyle = opened(i) ? '#ffd24a' : '#9fb4c8';
      g.beginPath();
      g.arc(p.x, p.y, 15, 0, PI * 2);
      g.fill();
      g.fillText(c.icon, p.x, p.y + 1);
    });
    g.globalAlpha = 1;
    g.fillStyle = colour;
    g.beginPath();
    g.arc(home.x, home.y, 13, 0, PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = '400 20px "Lilita One", Nunito, Arial, sans-serif';
    g.fillText('SKYPORT', home.x, home.y + 30);
    this.texture.needsUpdate = true;
  }
  /** Puts a souvenir on its slot (once). */
  showSouvenir(k: number): void {
    if (this.shown.has(k) || !this.slots[k]) return;
    this.shown.add(k);
    const s = souvenirModel(k);
    s.scale.setScalar(1.25);
    this.slots[k]!.add(s);
  }
}
