// Skyport International's models, built in code in the game's toy style (the same vertex-coloured
// material as everything else): the propeller plane, with its spinning propellers, lights and shadow;
// the check-in hall; the air stairs, fuel truck, baggage belt and taxis; the windsock. Nothing here is
// fetched: the airport adds no model files to the download.
import {
  CanvasTexture,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  SRGBColorSpace,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  type BufferGeometry,
  type Object3D,
} from 'three';
import type { AirportLayout, GateSpot, Rect, Point } from '../../core/config';
import { cylinder, mergeParts, rbox, sphere, toyMaterial, type Part } from './build';

const PI = Math.PI;
export const AIR = {
  white: '#f7f8fa',
  glass: '#bfeef0',
  aqua: '#22c3c9',
  aquaDeep: '#14959b',
  pink: '#ff5fa8',
  sun: '#ffd24a',
  orange: '#ff8a3d',
  navy: '#17324d',
  red: '#e8493f',
  purple: '#8a4fd8',
  mint: '#7ee0c3',
  steel: '#cfd6de',
  dark: '#3b3f4a',
  tyre: '#2b2f38',
  cream: '#ffe9c4',
} as const;

const mesh = (parts: Part[], cast = true): Mesh => {
  const m = new Mesh(mergeParts(parts), toyMaterial);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
};

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

// ---- the propeller plane -------------------------------------------------------------------------------------

/** A wing (or tailplane) seen from above: both sides in one tapered slab, its leading edge's root at the origin. */
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
function wing(span: number, rootChord: number, tipChord: number, sweep: number, thick: number): BufferGeometry {
  const g = new ExtrudeGeometry(wingShape(span, rootChord, tipChord, sweep), { depth: thick, bevelEnabled: false });
  // The outline's "up" becomes forward (+z, the nose's way); the slab hangs down from y = 0.
  g.rotateX(PI / 2);
  return g;
}
/** The fin: a swept slab standing on the tail, its foot's front at the origin (z back, y up). */
function fin(foot: number, top: number, height: number, lean: number, thick: number): BufferGeometry {
  const s = new Shape();
  s.moveTo(0, 0);
  s.lineTo(-foot, 0);
  s.lineTo(-lean - top, height);
  s.lineTo(-lean, height);
  s.closePath();
  const g = new ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
  // The outline's x becomes z; its depth, x (centred).
  g.rotateY(-PI / 2);
  g.translate(thick / 2, 0, 0);
  return g;
}

/** A plane's colours: its body, and the airline's colour on its tail, stripe and tips. */
export interface Livery {
  body?: string;
  accent: string;
  tips?: string;
}
export const LIVERIES: Livery[] = [
  { accent: AIR.red },
  { accent: AIR.orange },
  { accent: AIR.purple },
  { accent: AIR.aqua, tips: AIR.pink },
  { accent: AIR.pink, tips: AIR.sun },
  { accent: '#2c62d6', tips: AIR.sun },
];

/** The propeller plane's size (metres): nose to tail, wingtip to wingtip, how fat, and how high its middle rides. */
export const PROP = { length: 9, span: 10.6, radius: 0.95, ride: 1.72, sill: 1.02, wingY: 2.62 } as const;
/** Half the fuselage's width and where it starts and ends along the plane, for what's solid when it's parked. */
export const PROP_SOLID = { half: 1.05, tail: -4.4, nose: 4.5 } as const;
/** The engines: out along the wing, how far forward their propellers are, and the propeller's reach. */
const ENGINE = { x: 2.4, z: 2.05, y: 2.22, blade: 1.02 } as const;

/**
 * A twin-engined propeller plane, nose to +z, wheels on the ground at y = 0. Its wing sits on top of
 * the fuselage, high enough to walk under. The propellers spin, the beacon blinks, and a shadow in its
 * own shape lies on the ground under it (further off, and fainter, the higher it flies).
 */
export class PlaneModel {
  readonly root = new Group();
  readonly shadow: Mesh;
  private readonly props: Group[] = [];
  private readonly blades: Mesh[] = [];
  private readonly discs: Mesh[] = [];
  private readonly beacon: Mesh;
  private readonly tips: Mesh[] = [];
  private turn = 0;
  private time = Math.random() * 3;

  constructor(livery: Livery) {
    const { length: len, span, radius: r, ride: y } = PROP;
    const body = livery.body ?? AIR.white;
    const accent = livery.accent;
    const tips = livery.tips ?? accent;
    const front = len / 2 - r * 1.7;
    const rear = -1.6;
    const parts: Part[] = [
      // Fuselage, nose and tail cone.
      { geometry: new CylinderGeometry(r, r, front - rear, 20), color: body, rx: PI / 2, y, z: (front + rear) / 2 },
      { geometry: new SphereGeometry(r, 20, 14).scale(1, 1, 1.7), color: body, y, z: front },
      { geometry: new CylinderGeometry(r, r * 0.3, len / 2 + rear, 20), color: body, rx: PI / 2, y: y + 0.28, z: (rear - len / 2) / 2 },
      // The airline's stripe down each side, the windows over it, and the colour along its back.
      ...[-1, 1].flatMap((side): Part[] => [
        { geometry: rbox(0.06, 0.24, front - rear + 1.4, 0.02), color: accent, x: side * (r - 0.012), y: y - 0.02, z: (front + rear) / 2 + 0.2 },
        ...Array.from({ length: 6 }, (_, i): Part => ({ geometry: rbox(0.06, 0.3, 0.34, 0.02), color: '#2b3a4a', x: side * (r - 0.03), y: y + 0.36, z: rear + 0.5 + i * 0.62 })),
      ]),
      { geometry: rbox(0.62, 0.1, front - rear + 0.6, 0.04), color: accent, y: y + r - 0.03, z: (front + rear) / 2 - 0.4 },
      // The windscreen, the black nose.
      { geometry: rbox(1.22, 0.42, 0.5, 0.1), color: '#2b3a4a', y: y + 0.5, z: front + 0.62, rx: -0.62 },
      { geometry: new SphereGeometry(0.34, 12, 10).scale(1, 1, 1.2), color: '#39424e', y: y - 0.05, z: len / 2 - 0.3 },
      // The doors: passengers on its left, in front; the hold on its right, behind the wing.
      { geometry: rbox(0.05, 1.42, 0.82, 0.02), color: '#dfe6ee', x: r - 0.01, y: y - 0.02, z: 3.1 },
      { geometry: rbox(0.05, 0.9, 1.1, 0.02), color: '#dfe6ee', x: -(r - 0.01), y: y - 0.28, z: -2.8 },
      // The wing on top, coloured at its tips; the tailplane and the fin.
      { geometry: wing(span, 1.9, 1.15, 0.28, 0.24), color: '#e9eef2', y: PROP.wingY + 0.24, z: 1.0 },
      ...[-1, 1].map((side): Part => ({ geometry: rbox(0.5, 0.28, 1.2, 0.08), color: tips, x: side * (span / 2 - 0.22), y: PROP.wingY + 0.12, z: 0.14 })),
      { geometry: wing(4.3, 1.15, 0.72, 0.22, 0.16), color: '#e9eef2', y: y + 0.72, z: -3.1 },
      { geometry: fin(1.9, 0.95, 2.0, 0.85, 0.2), color: accent, y: y + 0.62, z: -2.5 },
      // Engines under the wing, each with its wheel under it; the nose wheel.
      ...[-1, 1].flatMap((side): Part[] => [
        { geometry: new CylinderGeometry(0.43, 0.34, 2.1, 14), color: body, rx: PI / 2, x: side * ENGINE.x, y: ENGINE.y, z: ENGINE.z - 1.05 },
        { geometry: new CylinderGeometry(0.445, 0.445, 0.3, 14), color: accent, rx: PI / 2, x: side * ENGINE.x, y: ENGINE.y, z: ENGINE.z - 0.2 },
        { geometry: cylinder(0.07, ENGINE.y - 0.5, 8), color: AIR.steel, x: side * ENGINE.x, y: (ENGINE.y + 0.3) / 2, z: 0.5 },
        { geometry: cylinder(0.36, 0.3, 14), color: AIR.tyre, rz: PI / 2, x: side * ENGINE.x, y: 0.36, z: 0.5 },
        { geometry: cylinder(0.16, 0.32, 10), color: AIR.steel, rz: PI / 2, x: side * ENGINE.x, y: 0.36, z: 0.5 },
      ]),
      { geometry: cylinder(0.06, y - r - 0.2, 8), color: AIR.steel, y: (y - r + 0.3) / 2, z: 3.3 },
      { geometry: cylinder(0.3, 0.24, 14), color: AIR.tyre, rz: PI / 2, y: 0.3, z: 3.3 },
    ];
    const hull = mesh(parts, false);
    hull.name = 'plane';
    this.root.add(hull);
    this.root.rotation.order = 'YXZ';

    // Propellers: three blades each, and a blurred disc for when they're spinning fast.
    const bladeGeometry = (): BufferGeometry =>
      mergeParts([
        ...[0, 1, 2].map((i): Part => ({ geometry: rbox(0.17, ENGINE.blade, 0.05, 0.02).translate(0, ENGINE.blade / 2 + 0.06, 0), color: '#39424e', rz: (i * 2 * PI) / 3 })),
        { geometry: new ConeGeometry(0.2, 0.42, 12), color: accent, rx: PI / 2, z: 0.12 },
      ]);
    const discMaterial = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, depthWrite: false });
    for (const side of [-1, 1]) {
      const prop = new Group();
      prop.position.set(side * ENGINE.x, ENGINE.y, ENGINE.z);
      const blades = new Mesh(bladeGeometry(), toyMaterial);
      const disc = new Mesh(new CircleGeometry(ENGINE.blade + 0.05, 20), discMaterial);
      disc.position.z = 0.02;
      disc.visible = false;
      prop.add(blades, disc);
      this.root.add(prop);
      this.props.push(prop);
      this.blades.push(blades);
      this.discs.push(disc);
    }

    // Lights: a red beacon on its back, red on the left wingtip and green on the right.
    this.beacon = new Mesh(new SphereGeometry(0.14, 8, 6), new MeshBasicMaterial({ color: 0xff3b30 }));
    this.beacon.position.set(0, y + r + 0.1, -0.6);
    this.root.add(this.beacon);
    for (const [side, colour] of [[1, 0xff3b30], [-1, 0x35d06a]] as const) {
      const light = new Mesh(new SphereGeometry(0.12, 8, 6), new MeshBasicMaterial({ color: colour }));
      light.position.set(side * (span / 2 + 0.02), PROP.wingY + 0.12, 0.5);
      this.root.add(light);
      this.tips.push(light);
    }

    // Its shadow on the ground, in its own shape.
    const outline = new ShapeGeometry(wingShape(span, 1.9, 1.15, 0.28)).rotateX(PI / 2).translate(0, 0, 1.0);
    const tail = new ShapeGeometry(wingShape(4.3, 1.15, 0.72, 0.22)).rotateX(PI / 2).translate(0, 0, -3.1);
    const trunk = new CircleGeometry(1, 20).rotateX(-PI / 2).scale(r * 0.98, 1, len / 2);
    for (const g of [outline, tail, trunk]) for (const name of ['normal', 'uv']) g.deleteAttribute(name);
    const flat = mergeParts([{ geometry: outline.toNonIndexed(), color: '#000000' }, { geometry: tail.toNonIndexed(), color: '#000000' }, { geometry: trunk.toNonIndexed(), color: '#000000' }]);
    this.shadow = new Mesh(flat, new MeshBasicMaterial({ color: 0x0b1f2e, transparent: true, opacity: 0.24, depthWrite: false, side: 2 }));
    this.shadow.name = 'plane-shadow';
    this.shadow.renderOrder = 1;
  }

  /**
   * One frame: `engines` is how hard they're running (0 stopped, 1 flat out). The shadow follows on
   * the ground, slipping away from under the plane as it climbs (the sun's in the south-west).
   */
  update(dt: number, engines: number): void {
    this.time += dt;
    this.turn += dt * (2 + engines * 34) * Math.min(1, engines * 6);
    const blur = engines > 0.45;
    for (let i = 0; i < this.props.length; i++) {
      this.props[i]!.rotation.z = this.turn * (i ? 1 : -1);
      this.blades[i]!.visible = !blur;
      this.discs[i]!.visible = blur;
    }
    // The beacon flashes while the engines run; the wingtips glow steadily.
    this.beacon.visible = engines > 0.02 && this.time % 1.1 < 0.16;
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
/** Air stairs: their foot at the origin, climbing towards -x to the plane's door. */
export function airStairs(): Mesh {
  const steps = 6;
  const parts: Part[] = [];
  for (let i = 0; i < steps; i++) {
    const h = ((i + 1) / steps) * STAIRS.rise;
    parts.push({ geometry: rbox(0.5, h, 1.3, 0.03), color: i % 2 ? AIR.white : '#e4e9ee', x: -0.3 - i * 0.5, y: h / 2 });
  }
  parts.push({ geometry: rbox(0.9, STAIRS.rise, 1.3, 0.03), color: AIR.white, x: -3.35, y: STAIRS.rise / 2 });
  for (const side of [-1, 1]) {
    // The blue sides, a handrail on posts.
    parts.push({ geometry: rbox(3.9, 0.5, 0.1, 0.03), color: '#2c62d6', x: -1.9, y: 0.3, z: side * 0.7 });
    parts.push({ geometry: rbox(3.4, 0.07, 0.07, 0.02), color: AIR.sun, x: -1.55, y: STAIRS.rise / 2 + 1.05, z: side * 0.68, rz: -Math.atan2(STAIRS.rise, 3) });
    parts.push({ geometry: rbox(0.9, 0.07, 0.07, 0.02), color: AIR.sun, x: -3.35, y: STAIRS.rise + 0.98, z: side * 0.68 });
    for (const [x, h] of [[-0.15, 0.2], [-1.6, 0.6], [-3.0, 1.0], [-3.75, 1.0]] as const) parts.push({ geometry: cylinder(0.035, 1, 6), color: AIR.sun, x, y: h + 0.5, z: side * 0.68 });
    for (const x of [-0.7, -3.2]) parts.push({ geometry: cylinder(0.2, 0.14, 10), color: AIR.tyre, rx: PI / 2, x, y: 0.2, z: side * 0.78 });
  }
  return mesh(parts);
}

/** The fuel truck: cab to +z, a tank in the airline's aqua behind it. */
export function fuelTruck(): Mesh {
  return mesh([
    { geometry: rbox(2.3, 0.5, 6.4, 0.1), color: AIR.dark, y: 0.55 },
    { geometry: rbox(2.2, 1.7, 1.9, 0.25), color: AIR.white, y: 1.5, z: 2.2 },
    { geometry: rbox(2.0, 0.7, 0.1, 0.03), color: '#2b3a4a', y: 1.85, z: 3.16 },
    { geometry: new CylinderGeometry(1.08, 1.08, 4.1, 18), color: AIR.aqua, rx: PI / 2, y: 1.75, z: -0.95 },
    ...[-2.4, -0.95, 0.5].map((z): Part => ({ geometry: new CylinderGeometry(1.11, 1.11, 0.16, 18), color: AIR.white, rx: PI / 2, y: 1.75, z })),
    { geometry: cylinder(0.3, 0.3, 12), color: AIR.steel, y: 2.9, z: -0.95 },
    { geometry: cylinder(0.42, 0.5, 12), color: AIR.sun, rz: PI / 2, x: 1.2, y: 1.2, z: 0.4 },
    ...[-1, 1].flatMap((side): Part[] => [2.2, -0.6, -2.3].map((z): Part => ({ geometry: cylinder(0.42, 0.34, 12), color: AIR.tyre, rz: PI / 2, x: side * 1.02, y: 0.42, z }))),
  ]);
}

/** The hose from a fuel truck to a wing: a tube from the origin along +z, one metre long (stretched to fit). */
export function fuelHose(): Mesh {
  const hose = mesh([{ geometry: new CylinderGeometry(0.07, 0.07, 1, 8), color: AIR.dark, rx: PI / 2, z: 0.5 }], false);
  hose.visible = false;
  return hose;
}

/** The baggage belt out of the hall's wall, and the cart beside it: the belt's end at the origin, the wall to +z. */
export function baggageBelt(): Mesh {
  return mesh([
    { geometry: rbox(1.3, 0.7, 2.0, 0.06), color: AIR.steel, y: 0.45, z: 0.1 },
    { geometry: rbox(1.1, 0.08, 2.0, 0.03), color: AIR.dark, y: 0.84, z: 0.1 },
    ...[-0.8, 0.9].map((z): Part => ({ geometry: cylinder(0.12, 1.34, 8), color: '#9aa4b0', rz: PI / 2, y: 0.84, z })),
    // The flap in the wall the cases come through.
    { geometry: rbox(1.6, 1.3, 0.2, 0.05), color: AIR.navy, y: 1.0, z: 1.05 },
    ...[-0.45, -0.15, 0.15, 0.45].map((x): Part => ({ geometry: rbox(0.26, 0.9, 0.06, 0.02), color: AIR.sun, x, y: 0.95, z: 0.93 })),
    // The cart: a flat bed with a tow bar.
    { geometry: rbox(1.9, 0.2, 2.5, 0.06), color: '#9aa4b0', y: 0.5, z: -2.0 },
    { geometry: rbox(1.9, 0.5, 0.1, 0.03), color: AIR.sun, y: 0.8, z: -3.2 },
    { geometry: rbox(0.12, 0.12, 1.0, 0.03), color: AIR.dark, y: 0.45, z: -3.7 },
    ...[-1, 1].flatMap((side): Part[] => [-1.2, -2.8].map((z): Part => ({ geometry: cylinder(0.26, 0.2, 10), color: AIR.tyre, rz: PI / 2, x: side * 0.9, y: 0.26, z }))),
  ]);
}

/** A suitcase, standing: for the cart's pile and the hold. */
export function caseParts(colour: string): Part[] {
  return [
    { geometry: rbox(0.5, 0.36, 0.7, 0.07), color: colour, y: 0.18 },
    { geometry: rbox(0.52, 0.06, 0.1, 0.02), color: AIR.white, y: 0.18, z: 0.18 },
    { geometry: rbox(0.52, 0.06, 0.1, 0.02), color: AIR.white, y: 0.18, z: -0.18 },
    { geometry: rbox(0.2, 0.05, 0.06, 0.02), color: AIR.dark, y: 0.38 },
  ];
}
const CASE_COLOURS = [AIR.pink, AIR.aqua, AIR.sun, AIR.orange, AIR.purple, AIR.mint];
/** Cases piled on the belt's cart: `count` of them shown (up to 12). */
export class CasePile {
  readonly root = new Group();
  private readonly cases: Mesh[] = [];
  constructor() {
    for (let i = 0; i < 12; i++) {
      const c = mesh(caseParts(CASE_COLOURS[i % CASE_COLOURS.length]!), false);
      c.position.set(i % 2 ? 0.42 : -0.42, 0.6 + Math.floor(i / 6) * 0.38, -1.1 - (Math.floor(i / 2) % 3) * 0.8);
      c.rotation.y = (i * 1.7) % 0.5 - 0.25;
      c.visible = false;
      this.cases.push(c);
      this.root.add(c);
    }
  }
  show(count: number): void {
    for (let i = 0; i < this.cases.length; i++) this.cases[i]!.visible = i < count;
  }
}

// ---- the check-in hall -----------------------------------------------------------------------------------------

/** The check-in desk, its window to +z: counter, screen, scale, and a sign over it on two posts. */
export function checkinDesk(): Object3D {
  const group = new Group();
  group.add(
    mesh([
      { geometry: rbox(3.0, 1.05, 0.9, 0.1), color: '#2c62d6', y: 0.53 },
      { geometry: rbox(3.14, 0.1, 1.04, 0.04), color: AIR.white, y: 1.1 },
      { geometry: rbox(2.6, 0.18, 0.06, 0.02), color: AIR.sun, y: 0.75, z: 0.47 },
      { geometry: rbox(0.6, 0.42, 0.08, 0.03), color: AIR.dark, x: -0.7, y: 1.42, z: -0.15, rx: -0.2 },
      { geometry: rbox(0.1, 0.2, 0.1, 0.02), color: AIR.dark, x: -0.7, y: 1.2, z: -0.2 },
      // The scale for cases, beside the desk.
      { geometry: rbox(1.0, 0.24, 0.9, 0.05), color: AIR.steel, x: 2.1, y: 0.12 },
      { geometry: rbox(0.86, 0.04, 0.76, 0.02), color: AIR.dark, x: 2.1, y: 0.25 },
      ...[-1.9, 1.9].map((x): Part => ({ geometry: cylinder(0.08, 3.3, 8), color: AIR.white, x, y: 1.65, z: -0.6 })),
      { geometry: rbox(4.1, 0.9, 0.16, 0.05), color: AIR.navy, y: 3.2, z: -0.6 },
    ]),
  );
  const sign = signBoard('CHECK-IN', 3.9, 0.7, AIR.navy, AIR.sun);
  sign.position.set(0, 3.2, -0.51);
  group.add(sign);
  return group;
}

/** A gate's podium: where whoever opens the gate stands (behind it, to -z), a screen on top. */
export function podium(): Mesh {
  return mesh([
    { geometry: rbox(1.3, 1.05, 0.6, 0.08), color: AIR.aqua, y: 0.53 },
    { geometry: rbox(1.4, 0.08, 0.7, 0.03), color: AIR.white, y: 1.1 },
    { geometry: rbox(0.5, 0.36, 0.06, 0.02), color: AIR.dark, y: 1.38, z: -0.05, rx: 0.2 },
  ]);
}

/** Rows of seats filling a lounge. */
export function loungeSeats(lounge: Rect): Mesh {
  const parts: Part[] = [];
  const cx = (lounge.minX + lounge.maxX) / 2;
  for (const [z, colour] of [[lounge.minZ + 1.0, AIR.navy], [lounge.minZ + 2.9, AIR.aquaDeep]] as const) {
    for (const off of [-2.6, 2.3]) {
      parts.push({ geometry: rbox(3.6, 0.16, 0.7, 0.06), color: colour, x: cx + off, y: 0.46, z });
      parts.push({ geometry: rbox(3.6, 0.62, 0.14, 0.05), color: colour, x: cx + off, y: 0.82, z: z - 0.34 });
      for (const leg of [-1.5, 1.5]) parts.push({ geometry: cylinder(0.05, 0.4, 6), color: AIR.steel, x: cx + off + leg, y: 0.2, z });
      for (let i = 0; i < 4; i++) parts.push({ geometry: rbox(0.04, 0.3, 0.6, 0.01), color: AIR.steel, x: cx + off - 1.8 + i * 1.2, y: 0.62, z });
    }
  }
  return mesh(parts);
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

/**
 * The check-in hall: open to the sky, so the camera always sees inside. Low glass walls, white columns
 * and beams, a canopy with the airport's name over the door, an arch with its number at each gate, and
 * striped boards along the east end where the terminal will be built.
 */
/** Where the airport's name board stands, on the plaza beside the entrance. */
export function entranceSign(layout: AirportLayout): Point {
  return { x: layout.entrance.x - 9.4, z: layout.hall.maxZ + 3.4 };
}

export function hallModel(layout: AirportLayout): Object3D {
  const { hall, entrance } = layout;
  const group = new Group();
  const parts: Part[] = [];
  const wallH = 1.35;
  const walls = hallWalls(layout);
  walls.forEach((w, i) => {
    const east = i === walls.length - 1;
    const width = w.maxX - w.minX;
    const depth = w.maxZ - w.minZ;
    if (east) {
      // Hoarding: orange and white stripes.
      const n = Math.round(depth / 1.6);
      for (let k = 0; k < n; k++) parts.push({ geometry: rbox(0.3, 2.2, depth / n, 0.02), color: k % 2 ? AIR.white : AIR.orange, x: (w.minX + w.maxX) / 2, y: 1.1, z: w.minZ + (k + 0.5) * (depth / n) });
      return;
    }
    parts.push({ geometry: rbox(Math.max(0.5, width), wallH, Math.max(0.5, depth), 0.08), color: AIR.glass, x: (w.minX + w.maxX) / 2, y: wallH / 2, z: (w.minZ + w.maxZ) / 2 });
    parts.push({ geometry: rbox(Math.max(0.7, width + 0.16), 0.14, Math.max(0.7, depth + 0.16), 0.05), color: AIR.white, x: (w.minX + w.maxX) / 2, y: wallH + 0.05, z: (w.minZ + w.maxZ) / 2 });
  });
  // Posts down both long sides, each with an aqua cap and a lamp (the hall's open to the sky: a roof would
  // hide what's under and behind it).
  const bays = 6;
  for (let i = 0; i <= bays; i++) {
    const x = hall.minX + (i * (hall.maxX - hall.minX)) / bays;
    for (const z of [hall.minZ, hall.maxZ]) {
      // (None in a doorway.)
      if (Math.abs(x - entrance.x) < 2.2 && z === hall.maxZ) continue;
      if (z === hall.minZ && Object.values(layout.gates).some((gate) => Math.abs(x - gate.door.x) < 2.2)) continue;
      parts.push({ geometry: rbox(0.6, 2.3, 0.6, 0.1), color: AIR.white, x, y: 1.15, z });
      parts.push({ geometry: rbox(0.78, 0.22, 0.78, 0.06), color: AIR.aqua, x, y: 2.36, z });
      parts.push({ geometry: sphere(0.24, 10), color: '#fff3b8', x, y: 2.66, z });
    }
  }
  // An arch over each gate's door.
  for (const gate of Object.values(layout.gates)) {
    for (const side of [-1, 1]) parts.push({ geometry: rbox(0.3, 3.1, 0.3, 0.06), color: AIR.navy, x: gate.door.x + side * 1.6, y: 1.55, z: hall.minZ });
    parts.push({ geometry: rbox(3.5, 0.9, 0.3, 0.08), color: AIR.navy, x: gate.door.x, y: 3.3, z: hall.minZ });
  }
  // Plants in the corners.
  for (const [x, z] of [[hall.minX + 1, hall.maxZ - 1], [hall.maxX - 1.1, hall.maxZ - 1], [hall.maxX - 1.1, hall.minZ + 6.2], [hall.minX + 1, hall.minZ + 6.2]] as const) {
    parts.push({ geometry: cylinder(0.42, 0.6, 10), color: AIR.cream, x, y: 0.3, z });
    parts.push({ geometry: new IcosahedronGeometry(0.72, 0), color: '#5fb84f', x, y: 1.15, z });
  }
  // An open frame over the entrance, on four posts (open, so the line under it can be seen), and the
  // airport's name on a board beside it.
  const cz = hall.maxZ + 2.7;
  for (const dz of [-2.4, 2.4]) parts.push({ geometry: rbox(10.4, 0.3, 0.34, 0.08), color: AIR.aqua, x: entrance.x, y: 4.5, z: cz + dz });
  for (const dx of [-5, 5]) parts.push({ geometry: rbox(0.34, 0.3, 5.1, 0.08), color: AIR.aqua, x: entrance.x + dx, y: 4.5, z: cz });
  for (const dx of [-2.5, 0, 2.5]) parts.push({ geometry: rbox(0.14, 0.16, 4.8, 0.04), color: AIR.white, x: entrance.x + dx, y: 4.5, z: cz });
  for (const dx of [-5, 5]) for (const dz of [-2.4, 2.4]) parts.push({ geometry: cylinder(0.2, 4.4, 8), color: AIR.white, x: entrance.x + dx, y: 2.2, z: cz + dz });
  const board = entranceSign(layout);
  parts.push({ geometry: rbox(7.4, 1.5, 0.34, 0.1), color: AIR.navy, x: board.x, y: 1.75, z: board.z });
  parts.push({ geometry: rbox(7.7, 0.3, 0.6, 0.08), color: AIR.aqua, x: board.x, y: 2.6, z: board.z });
  for (const dx of [-3, 3]) parts.push({ geometry: rbox(0.4, 1.1, 0.4, 0.06), color: AIR.white, x: board.x + dx, y: 0.55, z: board.z });
  group.add(mesh(parts));
  const name = signBoard('SKYPORT', 7, 1.2, AIR.navy, '#ffffff');
  name.position.set(board.x, 1.75, board.z + 0.18);
  group.add(name);
  Object.values(layout.gates).forEach((gate, i) => {
    const number = signBoard(`GATE ${i + 1}`, 3.3, 0.7, AIR.navy, AIR.sun);
    number.position.set(gate.door.x, 3.3, hall.minZ + 0.16);
    number.name = `sign:gate${i + 1}`;
    group.add(number);
  });
  return group;
}

/** A barrier across a gate's door until the gate is bought. */
export function gateBarrier(gate: GateSpot): Mesh {
  const barrier = mesh([
    { geometry: rbox(3.0, 0.9, 0.16, 0.04), color: AIR.orange, y: 0.75 },
    ...[-1, 0, 1].map((i): Part => ({ geometry: rbox(0.5, 0.92, 0.18, 0.04), color: AIR.white, x: i * 1.0, y: 0.75 })),
    ...[-1.4, 1.4].map((x): Part => ({ geometry: rbox(0.2, 1.1, 0.5, 0.04), color: AIR.dark, x, y: 0.55 })),
  ]);
  barrier.position.set(gate.door.x, 0, gate.door.z);
  return barrier;
}

// ---- outside ---------------------------------------------------------------------------------------------------

/** A taxi, its nose to +x. */
export function taxiModel(): Mesh {
  return mesh(
    [
      { geometry: rbox(3.7, 0.75, 1.75, 0.2), color: AIR.sun, y: 0.62 },
      { geometry: rbox(1.9, 0.62, 1.52, 0.2), color: '#cfe9f2', x: -0.15, y: 1.2 },
      { geometry: rbox(1.7, 0.08, 1.4, 0.03), color: AIR.sun, x: -0.15, y: 1.54 },
      { geometry: rbox(0.6, 0.22, 0.3, 0.05), color: AIR.dark, x: -0.15, y: 1.7 },
      ...[-1, 1].flatMap((side): Part[] => [-1.15, 1.15].map((x): Part => ({ geometry: cylinder(0.33, 0.26, 12), color: AIR.tyre, rx: PI / 2, x, y: 0.33, z: side * 0.82 }))),
      ...[-1, 1].map((side): Part => ({ geometry: rbox(3.72, 0.16, 0.02, 0.01), color: AIR.dark, y: 0.72, z: side * 0.885 })),
    ],
    false,
  );
}

/** A windsock on its pole: the sock swings round with the wind and lifts as it blows. */
export class Windsock {
  readonly root = new Group();
  private readonly sock = new Group();
  private time = 0;
  constructor() {
    this.root.add(mesh([{ geometry: cylinder(0.1, 5.2, 8), color: AIR.white, y: 2.6 }, { geometry: sphere(0.16, 8), color: AIR.orange, y: 5.25 }]));
    const sock = mesh(
      [0, 1, 2, 3].map((i): Part => ({ geometry: new CylinderGeometry(0.52 - i * 0.09, 0.43 - i * 0.09, 0.7, 12, 1, true), color: i % 2 ? AIR.white : AIR.orange, rz: -PI / 2, x: 0.35 + i * 0.7 })),
      false,
    );
    this.sock.add(sock);
    this.sock.position.y = 4.9;
    this.root.add(this.sock);
  }
  update(dt: number): void {
    this.time += dt;
    this.sock.rotation.y = 0.5 + Math.sin(this.time * 0.35) * 0.35 + Math.sin(this.time * 1.9) * 0.06;
    this.sock.rotation.z = -0.22 + Math.sin(this.time * 2.6) * 0.07;
  }
}

/** A low-poly tree. */
export function treeParts(x: number, z: number, size = 1): Part[] {
  return [
    { geometry: cylinder(0.3 * size, 1.7 * size, 6), color: '#8a5a33', x, y: 0.85 * size, z },
    { geometry: new IcosahedronGeometry(1.75 * size, 0), color: ['#4fb55a', '#5fc468', '#45a851'][Math.abs(Math.round(x * 3 + z)) % 3]!, x, y: 3.0 * size, z, ry: (x + z) % 3 },
  ];
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
