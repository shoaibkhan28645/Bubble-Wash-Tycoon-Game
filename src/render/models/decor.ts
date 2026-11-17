// The boutique's decorations (shop.json `decor`), built from simple shapes in the towns' toy style. Each
// is made facing +z (the camera) at its spot; some move a little (a tube dancer flails, bees buzz round
// their hives, a balloon bobs over the lake, a globe turns) and some puff particles (bubbles, sparkles, spray).
import { AnimationMixer, BufferGeometry, Color, ConeGeometry, CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, Shape, SphereGeometry, TorusGeometry, Vector3, type Object3D } from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { CHARACTERS } from '../../core/config';
import type { ParticleKind } from '../effects/particles';
import { asset } from '../assets';
import { box, cylinder, mergeParts, rbox, sphere, toyMaterial, type Part } from './build';
import { hatGeometry } from './hats';

/** Where a decoration's particles go: the town's effects, called with world positions. */
export type Puff = (kind: ParticleKind, at: Vector3, count: number, speed: number, spread: number) => void;

/** A decoration as drawn: its model, and what it does each frame (time `t` since it went up, in seconds). */
export interface BuiltDecor {
  object: Object3D;
  update?: (dt: number, t: number, puff: Puff) => void;
}

/** What a decoration may need besides its own spot: where bunting runs to, and the hat the hero wears (the statue). */
export interface DecorContext {
  /** The far end of a string of bunting, from its spot (metres along x and z). */
  to?: { x: number; z: number };
  hat?: string | null;
}

const MARBLE = '#eeebe4';
const GOLD = '#f2c230';
const GOLD_DARK = '#c9971c';

const mesh = (parts: Part[]): Mesh => new Mesh(mergeParts(parts), toyMaterial);
const cone = (radius: number, height: number, segments = 10): BufferGeometry => new ConeGeometry(radius, height, segments);
const ball = (radius: number, sx: number, sy: number, sz: number, segments = 12): BufferGeometry => new SphereGeometry(radius, segments, Math.ceil(segments * 0.75)).scale(sx, sy, sz);

/** A marble plinth with a gold trim round its top and a gold plaque at the front. */
function plinth(w: number, h: number, d: number): Part[] {
  return [
    { geometry: rbox(w, h, d, 0.06), color: MARBLE, y: h / 2 },
    { geometry: rbox(w + 0.06, 0.06, d + 0.06, 0.02), color: GOLD, y: h - 0.03 },
    { geometry: box(Math.min(0.7, w * 0.5), h * 0.4, 0.02), color: GOLD, y: h * 0.5, z: d / 2 + 0.01 },
  ];
}

/** A string of little flags from the spot to `to`, sagging between two tall poles. */
function bunting(context: DecorContext): BuiltDecor {
  const to = context.to ?? { x: 4, z: 0 };
  const length = Math.hypot(to.x, to.z);
  const turn = Math.atan2(-to.z, to.x);
  const TOP = 4.2;
  const SAG = 0.9;
  const parts: Part[] = [];
  for (const x of [0, length]) {
    parts.push({ geometry: cylinder(0.06, TOP + 0.1, 8), color: '#f4f6f8', x, y: (TOP + 0.1) / 2 });
    parts.push({ geometry: sphere(0.11, 8), color: '#ff5fa8', x, y: TOP + 0.15 });
  }
  const colours = ['#ff5fa8', '#22c3c9', '#ffd24a', '#ffffff', '#ff8a3d'];
  const height = (x: number): number => TOP - SAG * 4 * (x / length) * (1 - x / length);
  const step = 0.7;
  for (let x = 0; x < length; x += step) {
    const next = Math.min(length, x + step);
    const a = height(x);
    const b = height(next);
    parts.push({ geometry: box(Math.hypot(next - x, b - a), 0.02, 0.02), color: '#3b3f4a', x: (x + next) / 2, y: (a + b) / 2, rz: Math.atan2(b - a, next - x) });
    if (x > 0.3) parts.push({ geometry: cone(0.17, 0.36, 3).scale(1, 1, 0.2), color: colours[Math.round(x / step) % colours.length]!, x, y: a - 0.2, rx: Math.PI });
  }
  const object = new Group();
  object.add(mesh(parts));
  object.rotation.y = turn;
  return { object };
}

/** An inflatable tube dancer on its fan: five floppy segments, two arms and a grin, flailing. */
function tubeDancer(): BuiltDecor {
  const object = new Group();
  object.add(mesh([
    { geometry: rbox(0.6, 0.4, 0.6, 0.06), color: '#3b4a5e', y: 0.2 },
    { geometry: cylinder(0.22, 0.03, 14), color: '#9aa3ae', y: 0.415 },
  ]));
  const RED = '#ff4f3a';
  const segments: Object3D[] = [];
  let parent: Object3D = object;
  for (let i = 0; i < 5; i++) {
    const segment = new Group();
    segment.position.y = i === 0 ? 0.42 : 0.42;
    const parts: Part[] = [{ geometry: cylinder(0.2 - i * 0.012, 0.44, 12), color: i % 2 ? '#ff6a4f' : RED, y: 0.22 }];
    if (i === 2) {
      for (const side of [-1, 1]) parts.push({ geometry: cylinder(0.07, 0.62, 8), color: '#ffd24a', x: side * 0.4, y: 0.32, rz: side * -1.1 });
    }
    if (i === 4) {
      parts.push({ geometry: sphere(0.2, 12), color: RED, y: 0.45 });
      for (const side of [-1, 1]) {
        parts.push({ geometry: sphere(0.06, 8), color: '#ffffff', x: side * 0.08, y: 0.5, z: 0.16 });
        parts.push({ geometry: sphere(0.03, 6), color: '#1c1c22', x: side * 0.08, y: 0.5, z: 0.21 });
      }
      parts.push({ geometry: box(0.16, 0.035, 0.02), color: '#1c1c22', y: 0.38, z: 0.19 });
      parts.push({ geometry: cone(0.12, 0.3, 6), color: '#ffd24a', y: 0.72, rz: 0.4 });
      parts.push({ geometry: cone(0.1, 0.26, 6), color: '#ffd24a', x: -0.08, y: 0.7, rz: -0.5 });
    }
    segment.add(mesh(parts));
    parent.add(segment);
    segments.push(segment);
    parent = segment;
  }
  return {
    object,
    update: (_dt, t) => {
      segments.forEach((s, i) => {
        s.rotation.z = Math.sin(t * 5.2 + i * 0.9) * (0.12 + i * 0.05);
        s.rotation.x = Math.sin(t * 3.7 + i * 1.3) * (0.06 + i * 0.03);
      });
    },
  };
}

/** A bubble machine on a stand: its wand wheel turns and bubbles float off it. */
function bubbleBlower(): BuiltDecor {
  const object = new Group();
  object.add(mesh([
    { geometry: cylinder(0.38, 0.12, 16), color: '#f4f6f8', y: 0.06 },
    { geometry: cylinder(0.05, 0.75, 8), color: '#c9d2dc', y: 0.5 },
    { geometry: rbox(0.62, 0.42, 0.5, 0.1), color: '#7ee0c3', y: 1.05 },
    { geometry: rbox(0.5, 0.08, 0.4, 0.03), color: '#ff8fc8', y: 1.3 },
    { geometry: sphere(0.08, 8), color: '#ffd24a', x: 0.18, y: 1.38 },
    { geometry: cylinder(0.12, 0.1, 12), color: '#3b4a5e', y: 1.05, z: 0.27, rx: Math.PI / 2 },
  ]));
  const wheel = new Mesh(
    mergeParts([0, 1, 2, 3, 4, 5].map((i): Part => {
      const a = (i / 6) * Math.PI * 2;
      return { geometry: new TorusGeometry(0.07, 0.015, 5, 10), color: '#ff5fa8', x: Math.cos(a) * 0.2, y: Math.sin(a) * 0.2 };
    })),
    toyMaterial,
  );
  wheel.position.set(0, 1.05, 0.34);
  object.add(wheel);
  const at = new Vector3();
  let next = 0;
  return {
    object,
    update: (dt, t, puff) => {
      wheel.rotation.z += dt * 2.4;
      if (t < next) return;
      next = t + 0.35;
      wheel.getWorldPosition(at);
      puff('bubble', at, 2, 1.3, 0.3);
    },
  };
}

/** A car in gold on a marble plinth, now and then glinting. */
function goldenCar(): BuiltDecor {
  const object = new Group();
  object.add(mesh([
    ...plinth(3.3, 0.5, 1.45),
    { geometry: rbox(2.7, 0.5, 1.2, 0.18), color: GOLD, y: 0.85 },
    { geometry: rbox(1.45, 0.48, 1.06, 0.16), color: '#f7d25a', x: -0.1, y: 1.28 },
    { geometry: box(1.2, 0.3, 1.08), color: GOLD_DARK, x: -0.1, y: 1.3 },
    ...[-0.9, 0.9].flatMap((x) => [-0.6, 0.6].map((z): Part => ({ geometry: cylinder(0.27, 0.2, 14), color: GOLD_DARK, x, y: 0.72, z, rx: Math.PI / 2 }))),
    { geometry: box(0.06, 0.12, 0.9), color: '#fff3c4', x: 1.36, y: 0.9 },
  ]));
  const at = new Vector3();
  let next = 1;
  return {
    object,
    update: (_dt, t, puff) => {
      if (t < next) return;
      next = t + 1.6;
      object.localToWorld(at.set((Math.random() - 0.5) * 2, 1.6, 0));
      puff('sparkle', at, 2, 1.2, 0.6);
    },
  };
}

/** A scarecrow on its post: a plaid shirt, straw at the cuffs, a burlap face and a straw hat; it sways. */
function scarecrow(): BuiltDecor {
  const STRAW = '#e3c25a';
  const object = new Group();
  const body = mesh([
    { geometry: cylinder(0.05, 1.7, 8), color: '#8a5a32', y: 0.85 },
    { geometry: box(1.2, 0.07, 0.07), color: '#8a5a32', y: 1.3 },
    { geometry: rbox(0.5, 0.58, 0.3, 0.06), color: '#c8452e', y: 1.12 },
    { geometry: box(0.52, 0.06, 0.32), color: '#7a2a1c', y: 0.98 },
    { geometry: rbox(1.05, 0.2, 0.22, 0.06), color: '#2f6fb8', y: 1.3 },
    ...[-1, 1].flatMap((side): Part[] => [
      { geometry: cone(0.09, 0.2, 6), color: STRAW, x: side * 0.6, y: 1.3, rz: side * (Math.PI / 2) },
      { geometry: cone(0.07, 0.24, 6), color: STRAW, x: side * 0.12, y: 0.74, rx: Math.PI },
    ]),
    { geometry: sphere(0.21, 12), color: '#e3c58c', y: 1.6 },
    { geometry: sphere(0.03, 6), color: '#2d2a26', x: -0.07, y: 1.64, z: 0.19 },
    { geometry: sphere(0.03, 6), color: '#2d2a26', x: 0.07, y: 1.64, z: 0.19 },
    { geometry: box(0.14, 0.02, 0.02), color: '#2d2a26', y: 1.53, z: 0.2 },
    { geometry: cylinder(0.34, 0.03, 14), color: '#d9b45a', y: 1.76 },
    { geometry: cylinder(0.17, 0.2, 12), color: '#d9b45a', y: 1.86 },
    { geometry: cylinder(0.175, 0.05, 12), color: '#c8452e', y: 1.8 },
  ]);
  object.add(body);
  return { object, update: (_dt, t) => void (body.rotation.z = Math.sin(t * 1.3) * 0.035) };
}

/** A patch of pumpkins, big and small, on a bed of soil with a few leaves. */
function pumpkins(): BuiltDecor {
  const parts: Part[] = [{ geometry: box(2.6, 0.06, 1.8), color: '#7a5233', y: 0.03 }];
  const patch: [number, number, number][] = [[-0.8, -0.4, 0.42], [0.35, -0.5, 0.3], [0.9, 0.3, 0.36], [-0.25, 0.45, 0.26], [-1.0, 0.5, 0.2], [0.2, 0.05, 0.18]];
  for (const [x, z, r] of patch) {
    parts.push({ geometry: ball(r, 1, 0.75, 1, 14), color: r > 0.3 ? '#ff8a2a' : '#ff9f3f', x, y: r * 0.72, z });
    parts.push({ geometry: cylinder(0.035, 0.12, 6), color: '#4f7a2a', x, y: r * 1.45 + 0.04, z });
    parts.push({ geometry: ball(0.16, 1, 0.25, 0.7, 8), color: '#4f9a3f', x: x + r * 0.7, y: 0.08, z: z + 0.1, ry: x });
  }
  return { object: mesh(parts) };
}

/** Three hives on a low wooden stand, and bees buzzing round them. */
function beehives(): BuiltDecor {
  const object = new Group();
  const parts: Part[] = [{ geometry: box(2.4, 0.18, 0.7), color: '#8a5a32', y: 0.09 }];
  for (const x of [-0.8, 0, 0.8]) {
    parts.push({ geometry: rbox(0.55, 0.28, 0.5, 0.03), color: '#f6e7a8', x, y: 0.32 });
    parts.push({ geometry: rbox(0.55, 0.28, 0.5, 0.03), color: '#f2d27a', x, y: 0.6 });
    parts.push({ geometry: rbox(0.66, 0.08, 0.6, 0.03), color: '#c98a52', x, y: 0.78 });
    parts.push({ geometry: box(0.18, 0.04, 0.02), color: '#3b2a1a', x, y: 0.22, z: 0.26 });
  }
  object.add(mesh(parts));
  const beeGeometry = mergeParts([
    { geometry: ball(0.05, 1.3, 1, 1, 8), color: '#ffcc22' },
    { geometry: box(0.025, 0.1, 0.1), color: '#1c1c22' },
    { geometry: ball(0.035, 1, 0.3, 1.4, 6), color: '#ffffff', y: 0.05 },
  ]);
  const bees = [0, 1, 2, 3, 4, 5].map(() => {
    const bee = new Mesh(beeGeometry, toyMaterial);
    object.add(bee);
    return bee;
  });
  return {
    object,
    update: (_dt, t) => {
      bees.forEach((bee, i) => {
        const a = t * (1.4 + i * 0.2) + i * 1.7;
        const home = (i % 3) - 1;
        bee.position.set(home * 0.8 + Math.cos(a) * 0.55, 1.0 + Math.sin(a * 2.3) * 0.25, Math.sin(a) * 0.45);
        bee.rotation.y = -a;
      });
    },
  };
}

/** A cow in gold on a marble plinth, glinting now and then. */
function goldenCow(): BuiltDecor {
  const object = new Group();
  object.add(mesh([
    ...plinth(1.9, 0.5, 1.25),
    { geometry: rbox(1.25, 0.6, 0.62, 0.16), color: GOLD, y: 1.15 },
    { geometry: rbox(0.4, 0.42, 0.42, 0.1), color: GOLD, x: 0.72, y: 1.38 },
    { geometry: rbox(0.22, 0.2, 0.36, 0.06), color: '#f7d25a', x: 0.94, y: 1.28 },
    ...[-1, 1].map((side): Part => ({ geometry: cone(0.04, 0.16, 6), color: '#fff3c4', x: 0.7, y: 1.65, z: side * 0.14, rx: side * -0.5 })),
    ...[-1, 1].map((side): Part => ({ geometry: ball(0.08, 1, 0.5, 1.4, 6), color: GOLD_DARK, x: 0.62, y: 1.52, z: side * 0.25 })),
    ...[-0.42, 0.42].flatMap((x) => [-0.2, 0.2].map((z): Part => ({ geometry: cylinder(0.08, 0.42, 8), color: GOLD_DARK, x, y: 0.71, z }))),
    { geometry: cylinder(0.025, 0.5, 6), color: GOLD_DARK, x: -0.68, y: 1.0, rz: -0.35 },
    { geometry: sphere(0.13, 8), color: '#f7d25a', x: -0.05, y: 0.82 },
  ]));
  const at = new Vector3();
  let next = 1.3;
  return {
    object,
    update: (_dt, t, puff) => {
      if (t < next) return;
      next = t + 1.8;
      object.localToWorld(at.set((Math.random() - 0.5) * 1.2, 1.7, 0));
      puff('sparkle', at, 2, 1.1, 0.5);
    },
  };
}

/** Three clipped shrubs in terracotta pots: a ball on a stem, a tiered cone and a bunny. */
function topiary(): BuiltDecor {
  const LEAF = '#3f9a45';
  const LIGHT = '#5fb84f';
  const POT = '#d0774a';
  const pot = (x: number, z: number): Part[] => [
    { geometry: cylinder(0.32, 0.36, 12), color: POT, x, y: 0.18, z },
    { geometry: cylinder(0.35, 0.06, 12), color: '#b8603a', x, y: 0.37, z },
  ];
  return {
    object: mesh([
      ...pot(-0.6, -0.4),
      { geometry: cylinder(0.05, 0.6, 6), color: '#7a5233', x: -0.6, y: 0.7, z: -0.4 },
      { geometry: sphere(0.38, 12), color: LEAF, x: -0.6, y: 1.25, z: -0.4 },
      ...pot(0.6, -0.3),
      { geometry: sphere(0.34, 10), color: LEAF, x: 0.6, y: 0.66, z: -0.3 },
      { geometry: sphere(0.26, 10), color: LIGHT, x: 0.6, y: 1.06, z: -0.3 },
      { geometry: sphere(0.17, 10), color: LEAF, x: 0.6, y: 1.38, z: -0.3 },
      { geometry: sphere(0.09, 8), color: LIGHT, x: 0.6, y: 1.6, z: -0.3 },
      ...pot(0, 0.5),
      { geometry: ball(0.3, 1, 0.9, 1.15, 12), color: LEAF, y: 0.66, z: 0.45 },
      { geometry: sphere(0.2, 10), color: LIGHT, y: 0.98, z: 0.68 },
      ...[-1, 1].map((side): Part => ({ geometry: ball(0.07, 1, 3, 0.7, 8), color: LEAF, x: side * 0.08, y: 1.3, z: 0.66, rz: side * -0.2 })),
      { geometry: sphere(0.09, 8), color: LIGHT, y: 0.68, z: 0.12 },
    ]),
  };
}

/** A striped hot-air balloon floating over the lake, bobbing, its burner flickering. */
function airBalloon(): BuiltDecor {
  const object = new Group();
  const stripes = ['#ff5fa8', '#ffd24a', '#22c3c9', '#ffffff'];
  const parts: Part[] = [];
  const SLICES = 12;
  for (let i = 0; i < SLICES; i++) {
    const g = new SphereGeometry(1.7, 3, 10, (i / SLICES) * Math.PI * 2, (Math.PI * 2) / SLICES).scale(1, 1.18, 1);
    parts.push({ geometry: g, color: stripes[i % stripes.length]! });
  }
  parts.push({ geometry: new CylinderGeometry(0.55, 0.85, 0.7, 12, 1, true), color: '#ff5fa8', y: -1.9 });
  parts.push({ geometry: rbox(0.8, 0.55, 0.8, 0.08), color: '#a8693a', y: -3.1 });
  parts.push({ geometry: box(0.84, 0.08, 0.84), color: '#7a4a24', y: -2.82 });
  for (const [x, z] of [[-0.36, -0.36], [0.36, -0.36], [-0.36, 0.36], [0.36, 0.36]] as const) {
    parts.push({ geometry: cylinder(0.015, 0.75, 4), color: '#5a3a1e', x: x * 1.2, y: -2.45, z: z * 1.2 });
  }
  object.add(mesh(parts));
  const flame = new Mesh(cone(0.12, 0.35, 8), new MeshBasicMaterial({ color: '#ffb52e' }));
  flame.position.y = -2.45;
  object.add(flame);
  const base = { set: false, y: 0 };
  return {
    object,
    update: (_dt, t) => {
      if (!base.set) {
        base.y = object.position.y;
        base.set = true;
      }
      object.position.y = base.y + Math.sin(t * 0.55) * 0.35;
      object.rotation.y = t * 0.08;
      flame.scale.setScalar(0.7 + Math.abs(Math.sin(t * 9.1)) * 0.6);
    },
  };
}

/** A round stone fountain whose jet glows through the colours, throwing up spray. */
function fountain(): BuiltDecor {
  const object = new Group();
  object.add(mesh([
    { geometry: new CylinderGeometry(1.45, 1.55, 0.45, 24, 1, true), color: '#d9dde2', y: 0.22 },
    { geometry: new TorusGeometry(1.45, 0.08, 6, 24), color: '#eef1f5', y: 0.45, rx: Math.PI / 2 },
    { geometry: cylinder(1.42, 0.05, 24), color: '#8fd3ff', y: 0.36 },
    { geometry: cylinder(0.22, 0.85, 12), color: '#d9dde2', y: 0.6 },
    { geometry: cylinder(0.6, 0.14, 18), color: '#eef1f5', y: 1.05 },
    { geometry: cylinder(0.52, 0.04, 18), color: '#8fd3ff', y: 1.12 },
  ]));
  const glow = new MeshBasicMaterial({ color: '#7ee0ff', transparent: true, opacity: 0.85 });
  const jet = new Mesh(new CylinderGeometry(0.05, 0.12, 1, 10).translate(0, 0.5, 0), glow);
  jet.position.y = 1.12;
  object.add(jet);
  const colour = new Color();
  const at = new Vector3();
  let next = 0;
  return {
    object,
    update: (_dt, t, puff) => {
      jet.scale.y = 0.9 + Math.sin(t * 2.2) * 0.3;
      glow.color.copy(colour.setHSL((t * 0.08) % 1, 0.75, 0.68));
      if (t < next) return;
      next = t + 0.22;
      object.localToWorld(at.set(0, 1.12 + jet.scale.y, 0));
      puff('water', at, 3, 2.2, 0.15);
    },
  };
}

/** The hero in gold, bigger than life, on a marble plinth, wearing the hat they wear now. */
function statue(context: DecorContext): BuiltDecor {
  const object = new Group();
  object.add(mesh(plinth(1.4, 0.75, 1.4)));
  const gold = new MeshLambertMaterial({ color: '#f0c040', emissive: '#3a2800' });
  const { scene, animations } = asset(`person:${CHARACTERS.player}`);
  const model = cloneSkinned(scene);
  model.scale.setScalar(2.5);
  model.position.y = 0.75;
  model.traverse((node) => {
    if (node instanceof Mesh) node.material = gold;
  });
  // Stood in a proud pose: the "yes" nod, held part way through.
  const clip = animations.find((a) => a.name === 'emote-yes') ?? animations.find((a) => a.name === 'idle');
  if (clip) {
    const mixer = new AnimationMixer(model);
    mixer.clipAction(clip).play();
    mixer.update(clip.duration * 0.35);
  }
  const hat = context.hat ? hatGeometry(context.hat) : null;
  const head = model.getObjectByName('head');
  if (hat && head) head.add(new Mesh(hat, gold));
  object.add(model);
  return { object };
}

/** A gold cup on a wooden stand with a blue prize rosette: won at the county fair. */
function trophy(): BuiltDecor {
  const object = new Group();
  object.add(mesh([
    { geometry: rbox(0.9, 0.5, 0.9, 0.06), color: '#a8693a', y: 0.25 },
    { geometry: rbox(0.96, 0.06, 0.96, 0.02), color: '#7a4a24', y: 0.52 },
    { geometry: cylinder(0.2, 0.08, 14), color: GOLD_DARK, y: 0.59 },
    { geometry: cylinder(0.05, 0.22, 10), color: GOLD, y: 0.74 },
    { geometry: new CylinderGeometry(0.26, 0.12, 0.4, 16), color: GOLD, y: 1.05 },
    { geometry: cylinder(0.27, 0.04, 16), color: '#f7d25a', y: 1.26 },
    ...[-1, 1].map((side): Part => ({ geometry: new TorusGeometry(0.1, 0.025, 6, 12, Math.PI), color: GOLD, x: side * 0.26, y: 1.08, rz: side * (Math.PI / 2) })),
    // The rosette on the stand's front, with its two tails.
    { geometry: cylinder(0.17, 0.03, 16), color: '#2f6fd1', y: 0.3, z: 0.47, rx: Math.PI / 2 },
    { geometry: cylinder(0.1, 0.035, 14), color: '#ffffff', y: 0.3, z: 0.49, rx: Math.PI / 2 },
    { geometry: cylinder(0.05, 0.04, 10), color: '#ffc24a', y: 0.3, z: 0.5, rx: Math.PI / 2 },
    ...[-1, 1].map((side): Part => ({ geometry: box(0.07, 0.24, 0.01), color: '#2f6fd1', x: side * 0.06, y: 0.12, z: 0.47, rz: side * 0.25 })),
  ]));
  const at = new Vector3();
  let next = 1;
  return {
    object,
    update: (_dt, t, puff) => {
      if (t < next) return;
      next = t + 2.2;
      object.localToWorld(at.set(0, 1.4, 0));
      puff('sparkle', at, 2, 1, 0.3);
    },
  };
}

// Skyport's: a plane-spotter's scope by the Sky Queen, a globe with a plane flying round it, a vintage biplane,
// a golden jumbo, and the monument the whole journey earns.
const AQUA = '#22c3c9';

/** A coin-op viewer on a post, looking out at the airfield (to -z), slowly sweeping the sky for planes. */
function telescope(): BuiltDecor {
  const object = new Group();
  object.add(mesh([
    { geometry: cylinder(0.32, 0.08, 16), color: '#9aa3ae', y: 0.04 },
    { geometry: cylinder(0.07, 1.0, 10), color: '#3b4a5e', y: 0.58 },
    { geometry: rbox(0.5, 0.12, 0.3, 0.04), color: '#d9dde2', y: 0.06, z: 0.42 },
  ]));
  const head = new Group();
  head.position.y = 1.12;
  head.add(mesh([
    { geometry: rbox(0.42, 0.26, 0.34, 0.08), color: AQUA },
    ...[-1, 1].flatMap((side): Part[] => [
      { geometry: new CylinderGeometry(0.085, 0.07, 0.36, 12), color: AQUA, x: side * 0.1, y: 0.03, z: -0.26, rx: Math.PI / 2 },
      { geometry: cylinder(0.07, 0.02, 12), color: '#8fd3ff', x: side * 0.1, y: 0.03, z: -0.45, rx: Math.PI / 2 },
      { geometry: cylinder(0.045, 0.1, 10), color: '#1c1c22', x: side * 0.1, y: 0.03, z: 0.2, rx: Math.PI / 2 },
    ]),
    { geometry: rbox(0.36, 0.05, 0.12, 0.02), color: '#1c8f94', y: 0.14, z: 0.18 },
    { geometry: rbox(0.14, 0.14, 0.1, 0.03), color: GOLD, y: -0.2, z: 0.08 },
    { geometry: box(0.06, 0.012, 0.012), color: '#1c1c22', y: -0.16, z: 0.135 },
    ...[-1, 1].map((side): Part => ({ geometry: cylinder(0.025, 0.24, 8), color: '#3b4a5e', x: side * 0.25, y: -0.04, z: 0.12, rz: Math.PI / 2 })),
  ]));
  head.rotation.x = 0.18;
  object.add(head);
  return {
    object,
    update: (_dt, t) => {
      head.rotation.y = Math.sin(t * 0.45) * 0.7 + Math.sin(t * 1.3) * 0.08;
      head.rotation.x = 0.16 + Math.sin(t * 0.7) * 0.06;
    },
  };
}

/** A world globe on a marble pedestal, tilted on its axis and turning, with a little plane flying round it. */
function globe(): BuiltDecor {
  const object = new Group();
  object.add(mesh([
    ...plinth(1.2, 0.5, 1.2),
    { geometry: new CylinderGeometry(0.1, 0.22, 0.42, 12), color: GOLD_DARK, y: 0.71 },
    { geometry: cylinder(0.26, 0.05, 16), color: GOLD, y: 0.93 },
  ]));
  const tilt = new Group();
  tilt.position.y = 1.72;
  tilt.rotation.z = 0.41;
  object.add(tilt);
  tilt.add(mesh([
    { geometry: new TorusGeometry(0.88, 0.035, 6, 36, Math.PI * 1.5), color: GOLD, rz: Math.PI * 0.75 },
    ...[-1, 1].map((side): Part => ({ geometry: sphere(0.05, 8), color: GOLD, y: side * 0.88 })),
  ]));
  const earth = new Group();
  tilt.add(earth);
  const land: Part[] = [];
  // Blobs of land poking out of the sea, and the ice caps (latitude, longitude, size, colour).
  const blobs: [number, number, number, string][] = [
    [0.5, 0.2, 0.28, '#5fb84f'], [0.35, 0.8, 0.24, '#5fb84f'], [0.15, 0.55, 0.2, '#e8d48a'], [-0.35, 0.9, 0.22, '#5fb84f'],
    [0.55, 2.3, 0.3, '#5fb84f'], [0.2, 2.7, 0.22, '#4aa344'], [-0.4, 2.6, 0.2, '#5fb84f'], [0.6, 3.9, 0.32, '#5fb84f'],
    [0.25, 4.2, 0.22, '#e8d48a'], [-0.2, 4.0, 0.2, '#4aa344'], [-0.5, 5.3, 0.22, '#5fb84f'], [0.4, 5.6, 0.2, '#4aa344'],
  ];
  for (const [lat, lon, size, colour] of blobs) {
    const d = 0.62;
    land.push({ geometry: sphere(size, 10), color: colour, x: Math.cos(lat) * Math.sin(lon) * d, y: Math.sin(lat) * d, z: Math.cos(lat) * Math.cos(lon) * d });
  }
  earth.add(mesh([
    { geometry: sphere(0.78, 22), color: '#3a8fd8' },
    ...land,
    ...[-1, 1].map((side): Part => ({ geometry: sphere(0.3, 12), color: '#f4f6f8', y: side * 0.6 })),
  ]));
  // The little plane, round the globe's middle, nose first.
  const orbit = new Group();
  object.add(orbit);
  orbit.position.y = 1.72;
  const plane = mesh([
    { geometry: new CylinderGeometry(0.035, 0.055, 0.34, 10), color: '#f4f6f8', rx: Math.PI / 2 },
    { geometry: cone(0.055, 0.1, 10), color: '#f4f6f8', z: -0.22, rx: -Math.PI / 2 },
    { geometry: box(0.42, 0.015, 0.09), color: '#ff5fa8', z: -0.02 },
    { geometry: box(0.15, 0.012, 0.05), color: '#ff5fa8', z: 0.15 },
    { geometry: box(0.012, 0.09, 0.07), color: '#ff5fa8', y: 0.05, z: 0.15 },
  ]);
  plane.position.x = 1.08;
  orbit.add(plane);
  return {
    object,
    update: (_dt, t) => {
      earth.rotation.y = t * 0.35;
      orbit.rotation.y = t * 0.9;
      orbit.rotation.x = Math.sin(t * 0.9) * 0.12;
      plane.rotation.z = -0.35;
    },
  };
}

/** A red and cream biplane on a low plinth, nose up a little, its propeller turning over in the breeze. */
function biplane(): BuiltDecor {
  const RED = '#d8352a';
  const CREAM = '#f4f1e8';
  const object = new Group();
  object.add(mesh([
    { geometry: rbox(2.5, 0.3, 1.5, 0.08), color: MARBLE, y: 0.15 },
    { geometry: rbox(2.56, 0.05, 1.56, 0.02), color: GOLD, y: 0.28 },
    { geometry: box(0.7, 0.14, 0.02), color: GOLD, y: 0.15, z: 0.76 },
  ]));
  const plane = new Group();
  plane.position.y = 0.3;
  plane.rotation.z = 0.07;
  object.add(plane);
  const Y = 0.78;
  plane.add(mesh([
    // The fuselage, its cowling, the cockpit and the tail.
    { geometry: new CylinderGeometry(0.11, 0.24, 1.9, 14), color: RED, y: Y, rz: Math.PI / 2 },
    { geometry: cylinder(0.25, 0.26, 16), color: CREAM, x: 1.02, y: Y, rz: Math.PI / 2 },
    { geometry: box(0.36, 0.06, 0.26), color: '#2d2a26', x: 0.1, y: Y + 0.2 },
    { geometry: box(0.03, 0.14, 0.24), color: '#bfe9ff', x: 0.3, y: Y + 0.27, rz: -0.3 },
    { geometry: rbox(0.36, 0.04, 0.95, 0.02), color: CREAM, x: -0.88, y: Y + 0.04 },
    { geometry: rbox(0.4, 0.44, 0.04, 0.02), color: RED, x: -0.9, y: Y + 0.24, rz: -0.25 },
    // The two wings, their struts and the yellow stripes near the tips.
    { geometry: rbox(0.56, 0.06, 2.7, 0.03), color: CREAM, x: 0.4, y: Y - 0.16 },
    { geometry: rbox(0.56, 0.06, 2.7, 0.03), color: RED, x: 0.48, y: Y + 0.52 },
    ...[-1, 1].flatMap((side): Part[] => [
      { geometry: box(0.57, 0.065, 0.12), color: '#ffd24a', x: 0.4, y: Y - 0.16, z: side * 1.12 },
      { geometry: box(0.57, 0.065, 0.12), color: '#ffd24a', x: 0.48, y: Y + 0.52, z: side * 1.12 },
      { geometry: cylinder(0.022, 0.66, 6), color: '#5a3a1e', x: 0.3, y: Y + 0.18, z: side * 0.95 },
      { geometry: cylinder(0.022, 0.66, 6), color: '#5a3a1e', x: 0.62, y: Y + 0.18, z: side * 0.95 },
      { geometry: cylinder(0.018, 0.42, 6), color: '#5a3a1e', x: 0.5, y: Y + 0.32, z: side * 0.2, rx: side * -0.3 },
      // The wheels and their legs, and the tail skid.
      { geometry: cylinder(0.16, 0.08, 14), color: '#1f2026', x: 0.62, y: 0.16, z: side * 0.36, rx: Math.PI / 2 },
      { geometry: cylinder(0.06, 0.09, 10), color: CREAM, x: 0.62, y: 0.16, z: side * 0.36, rx: Math.PI / 2 },
      { geometry: cylinder(0.022, 0.5, 6), color: '#3b3f4a', x: 0.6, y: 0.4, z: side * 0.22, rx: side * 0.45 },
    ]),
    { geometry: cylinder(0.02, 0.4, 6), color: '#3b3f4a', x: -0.85, y: 0.45, rz: 0.6 },
    { geometry: cone(0.08, 0.18, 10), color: CREAM, x: 1.2, y: Y, rz: -Math.PI / 2 },
  ]));
  const prop = new Group();
  prop.position.set(1.22, Y, 0);
  prop.add(mesh([{ geometry: rbox(0.04, 1.05, 0.1, 0.02), color: '#6b4a2f' }]));
  plane.add(prop);
  return {
    object,
    update: (dt, t) => {
      prop.rotation.x += dt * (3 + Math.sin(t * 0.4) * 2.5);
    },
  };
}

/** An airliner in gold on a pylon over a marble plinth, climbing away, glinting. */
function goldenJumbo(): BuiltDecor {
  const object = new Group();
  object.add(mesh([
    ...plinth(1.7, 0.6, 1.1),
    { geometry: cylinder(0.09, 0.95, 10), color: GOLD_DARK, x: -0.1, y: 1.05, rz: 0.12 },
    { geometry: sphere(0.13, 10), color: GOLD_DARK, x: -0.16, y: 1.52 },
  ]));
  const plane = new Group();
  plane.position.set(-0.05, 1.74, 0);
  plane.rotation.z = 0.2;
  object.add(plane);
  /** Where a point `d` metres out along a wing swept back by `sweep` lies (from a root `root` out from the middle). */
  const along = (d: number, sweep: number, root: number, side: number): { x: number; z: number } => ({ x: -d * Math.sin(sweep), z: side * (root + d * Math.cos(sweep)) });
  const SWEEP = 0.45;
  plane.add(mesh([
    { geometry: cylinder(0.22, 2.2, 16), color: GOLD, rz: Math.PI / 2 },
    { geometry: ball(0.22, 1.6, 1, 1, 14), color: GOLD, x: 1.1 },
    { geometry: ball(0.13, 1.5, 0.85, 1.2, 12), color: '#f7d25a', x: 0.75, y: 0.13 },
    { geometry: new CylinderGeometry(0.22, 0.06, 0.75, 14), color: GOLD, x: -1.47, y: 0.06, rz: Math.PI / 2 - 0.12 },
    { geometry: box(0.12, 0.06, 0.34), color: '#fff3c4', x: 1.33, y: 0.09 },
    ...[-1, 1].flatMap((side): Part[] => {
      const wing = along(0.62, SWEEP, 0.18, side);
      const inner = along(0.36, SWEEP, 0.18, side);
      const outer = along(0.8, SWEEP, 0.18, side);
      const tail = along(0.26, SWEEP + 0.1, 0.06, side);
      return [
        { geometry: box(0.58, 0.05, 1.25), color: GOLD_DARK, x: wing.x - 0.05, y: -0.08, z: wing.z, ry: -side * SWEEP },
        { geometry: cylinder(0.085, 0.34, 12), color: GOLD_DARK, x: inner.x + 0.1, y: -0.2, z: inner.z, rz: Math.PI / 2 },
        { geometry: cylinder(0.07, 0.3, 12), color: GOLD_DARK, x: outer.x + 0.08, y: -0.18, z: outer.z, rz: Math.PI / 2 },
        { geometry: box(0.3, 0.04, 0.52), color: GOLD_DARK, x: -1.45 + tail.x, y: 0.1, z: tail.z, ry: -side * (SWEEP + 0.1) },
      ];
    }),
    { geometry: box(0.48, 0.62, 0.05), color: GOLD_DARK, x: -1.45, y: 0.42, rz: -0.42 },
  ]));
  const at = new Vector3();
  let next = 1;
  return {
    object,
    update: (_dt, t, puff) => {
      if (t < next) return;
      next = t + 1.5;
      object.localToWorld(at.set((Math.random() - 0.5) * 2, 2.0, (Math.random() - 0.5) * 1.2));
      puff('sparkle', at, 2, 1.2, 0.5);
    },
  };
}

/** A five-pointed star, flat across x and y, `depth` thick. */
function star(outer: number, inner: number, depth: number): BufferGeometry {
  const shape = new Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer;
    const a = (i / 10) * Math.PI * 2;
    if (i === 0) shape.moveTo(Math.sin(a) * r, Math.cos(a) * r);
    else shape.lineTo(Math.sin(a) * r, Math.cos(a) * r);
  }
  shape.closePath();
  return new ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 }).translate(0, 0, -depth / 2);
}

/**
 * Earned by finishing the whole journey: a marble column on a stepped base, a gold emblem on each side for the
 * four towns (a soap bubble, a barn, a big wheel, a plane) and a gold star turning on top.
 */
function monument(): BuiltDecor {
  const object = new Group();
  /** Parts made for the front (+z), turned round to another side: each turned on its own first, then about the column. */
  const side = (angle: number, parts: Part[]): Part[] =>
    parts.map(({ geometry, rx, ry, rz, x = 0, z = 0, ...rest }) => {
      if (rx) geometry.rotateX(rx);
      if (ry) geometry.rotateY(ry);
      if (rz) geometry.rotateZ(rz);
      geometry.rotateY(angle);
      return { ...rest, geometry, x: x * Math.cos(angle) + z * Math.sin(angle), z: -x * Math.sin(angle) + z * Math.cos(angle) };
    });
  const FACE = 0.79;
  object.add(mesh([
    { geometry: rbox(1.6, 0.42, 1.6, 0.06), color: MARBLE, y: 0.21 },
    { geometry: rbox(1.66, 0.06, 1.66, 0.02), color: GOLD, y: 0.42 },
    { geometry: rbox(1.15, 0.36, 1.15, 0.05), color: MARBLE, y: 0.63 },
    { geometry: new CylinderGeometry(0.3, 0.42, 2.0, 8), color: MARBLE, y: 1.81 },
    { geometry: cylinder(0.45, 0.08, 16), color: GOLD, y: 0.84 },
    { geometry: cylinder(0.34, 0.1, 16), color: GOLD, y: 2.82 },
    // The car wash: a soap bubble.
    ...side(0, [
      { geometry: cylinder(0.24, 0.03, 18), color: GOLD, y: 0.21, z: FACE, rx: Math.PI / 2 },
      { geometry: sphere(0.13, 12), color: AQUA, y: 0.21, z: FACE + 0.04 },
      { geometry: sphere(0.04, 8), color: '#ffffff', x: 0.05, y: 0.26, z: FACE + 0.14 },
    ]),
    // Willowbrook: a red barn.
    ...side(Math.PI / 2, [
      { geometry: cylinder(0.24, 0.03, 18), color: GOLD, y: 0.21, z: FACE, rx: Math.PI / 2 },
      { geometry: box(0.2, 0.14, 0.06), color: '#c8452e', y: 0.17, z: FACE + 0.03 },
      { geometry: cone(0.15, 0.1, 4), color: '#7a3020', y: 0.29, z: FACE + 0.03, ry: Math.PI / 4 },
    ]),
    // Starlight: the big wheel.
    ...side(Math.PI, [
      { geometry: cylinder(0.24, 0.03, 18), color: GOLD, y: 0.21, z: FACE, rx: Math.PI / 2 },
      { geometry: new TorusGeometry(0.12, 0.02, 6, 18), color: '#ff5fa8', y: 0.23, z: FACE + 0.03 },
      { geometry: box(0.02, 0.24, 0.02), color: '#ff5fa8', y: 0.23, z: FACE + 0.03 },
      { geometry: box(0.24, 0.02, 0.02), color: '#ff5fa8', y: 0.23, z: FACE + 0.03 },
    ]),
    // Skyport: a plane.
    ...side(-Math.PI / 2, [
      { geometry: cylinder(0.24, 0.03, 18), color: GOLD, y: 0.21, z: FACE, rx: Math.PI / 2 },
      { geometry: cylinder(0.03, 0.26, 8), color: '#f4f6f8', y: 0.21, z: FACE + 0.04, rz: Math.PI / 2 },
      { geometry: box(0.06, 0.24, 0.02), color: '#f4f6f8', y: 0.21, z: FACE + 0.04 },
      { geometry: box(0.03, 0.1, 0.02), color: '#f4f6f8', x: -0.11, y: 0.21, z: FACE + 0.04 },
    ]),
  ]));
  const top = mesh([{ geometry: star(0.42, 0.18, 0.12), color: GOLD }]);
  top.position.y = 3.35;
  object.add(top);
  const at = new Vector3();
  let next = 0.8;
  return {
    object,
    update: (_dt, t, puff) => {
      top.rotation.y = t * 0.8;
      top.position.y = 3.35 + Math.sin(t * 1.6) * 0.06;
      if (t < next) return;
      next = t + 1.2;
      object.localToWorld(at.set(0, 3.4, 0));
      puff('sparkle', at, 3, 1.5, 0.4);
    },
  };
}

const BUILDERS: Record<string, (context: DecorContext) => BuiltDecor> = {
  trophy,
  bunting,
  tubeman: tubeDancer,
  blower: bubbleBlower,
  goldcar: goldenCar,
  scarecrow,
  pumpkins,
  beehives,
  goldcow: goldenCow,
  topiary,
  airballoon: airBalloon,
  fountain,
  statue,
  telescope,
  globe,
  biplane,
  goldjet: goldenJumbo,
  monument,
};

/** Builds a decoration (null for an id with no model). */
export function buildDecor(id: string, context: DecorContext = {}): BuiltDecor | null {
  return BUILDERS[id]?.(context) ?? null;
}

/** Ids of every decoration with a model (tests check each one on sale has one). */
export const DECOR_MODELS = Object.keys(BUILDERS);
