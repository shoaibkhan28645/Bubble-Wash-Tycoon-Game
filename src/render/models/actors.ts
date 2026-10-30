// People from the Kenney Mini Characters pack; cars modelled in Blender (art/blender/cars.py).
import {
  AnimationMixer,
  LoopOnce,
  type BufferGeometry,
  CanvasTexture,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  Scene,
  type AnimationAction,
} from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { CarDef } from '../../core/config';
import { asset, carGeometry } from '../assets';
import { addMud, type MudUniforms } from '../mud';
import { GRAPHICS } from '../graphics';
import { box, cylinder, mergeParts, rbox, toyMaterial, type Part } from './build';

/** Mini Characters are 0.8 units tall; this makes them about car-roof height. */
const PERSON_SCALE = 2;

const MUD: Record<string, string> = { dusty: '#a4825c', muddy: '#7a5a3a', swamp: '#5a6636' };
/** Mud threshold on a dirty car (lower = more mud): see mud.ts. */
const DIRT_START: Record<string, number> = { dusty: 0.56, muddy: 0.48, swamp: 0.36 };

let shadowMaterial: MeshBasicMaterial | null = null;

/** Soft round shadow texture, drawn once on first use. */
function getShadowMaterial(): MeshBasicMaterial {
  if (shadowMaterial) return shadowMaterial;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(0,0,0,0.42)');
  gradient.addColorStop(0.6, 'rgba(0,0,0,0.25)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  shadowMaterial = new MeshBasicMaterial({ map: new CanvasTexture(canvas), transparent: true, depthWrite: false });
  return shadowMaterial;
}
const shadowGeometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

const MAX_BLOBS = 64;

/**
 * Every soft blob shadow in one draw call. Objects carry an invisible marker;
 * each frame the visible markers' positions go into one InstancedMesh.
 */
class BlobShadows {
  private mesh: InstancedMesh | null = null;
  private readonly markers = new Set<Object3D>();

  attach(scene: Scene): void {
    this.mesh = new InstancedMesh(shadowGeometry, getShadowMaterial(), MAX_BLOBS);
    this.mesh.name = 'blob-shadows';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  add(marker: Object3D): void {
    this.markers.add(marker);
  }

  update(): void {
    const mesh = this.mesh;
    if (!mesh) return;
    let n = 0;
    for (const marker of this.markers) {
      if (n >= MAX_BLOBS || !shown(marker)) continue;
      marker.updateWorldMatrix(true, false);
      mesh.setMatrixAt(n++, marker.matrixWorld);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Visible all the way up to the scene. */
function shown(object: Object3D): boolean {
  let node: Object3D | null = object;
  while (node) {
    if (!node.visible) return false;
    if (node instanceof Scene) return true;
    node = node.parent;
  }
  return false;
}

export const blobShadows = new BlobShadows();

/** Soft blob shadow just above the ground, as a child of the object it belongs to. */
export function blobShadow(width: number, length: number): Object3D {
  const marker = new Object3D();
  marker.scale.set(width, 1, length);
  marker.position.y = 0.03;
  blobShadows.add(marker);
  return marker;
}

type Pose = 'idle' | 'walk' | 'sprint' | 'scrub';
/** What a person holds while working. */
export type Tool = 'sponge' | 'towel' | 'polisher' | 'nozzle' | 'bag';

const TOOL_PARTS: Record<Tool, Part[]> = {
  sponge: [{ geometry: rbox(0.13, 0.07, 0.09, 0.03), color: '#ffd24a' }],
  towel: [{ geometry: rbox(0.16, 0.03, 0.12, 0.012), color: '#7ee0c3' }],
  polisher: [
    { geometry: cylinder(0.08, 0.04, 12), color: '#fff3c4', y: -0.03 },
    { geometry: rbox(0.06, 0.07, 0.06, 0.02), color: '#3b4a5e', y: 0.02 },
  ],
  bag: [
    { geometry: rbox(0.2, 0.24, 0.12, 0.03), color: '#d9a866', y: -0.06 },
    { geometry: box(0.16, 0.04, 0.02), color: '#ff5fa8', y: -0.02, z: 0.065 },
  ],
  nozzle: [
    { geometry: rbox(0.06, 0.12, 0.09, 0.02), color: '#3fae5a' },
    { geometry: cylinder(0.018, 0.14, 6), color: '#3b4a5e', y: -0.04, z: 0.09, rx: Math.PI / 2 },
  ],
};
const toolGeometries = new Map<Tool, BufferGeometry>();

/** A person (Kenney Mini Characters) with the pack's own animations. */
export class PersonAvatar {
  readonly root = new Group();
  private readonly mixer: AnimationMixer;
  private readonly actions = new Map<Pose, AnimationAction>();
  private current: AnimationAction | undefined;
  private readonly tool: Mesh | null = null;
  private readonly gestureAction: AnimationAction | null = null;
  private gestureLeft = 0;
  /** Shows the tool all the time, e.g. a shopping bag being carried. */
  holding = false;

  constructor(character: string, tool: Tool | null = null) {
    const { scene, animations } = asset(`person:${character}`);
    const model = cloneSkinned(scene);
    model.scale.setScalar(PERSON_SCALE);
    // People keep their soft blob shadow: real ones would draw every
    // animated character a second time each frame.
    this.root.name = 'person';
    this.root.add(model, blobShadow(1.2, 1.2));
    this.mixer = new AnimationMixer(model);
    const clips: Record<Pose, string> = { idle: 'idle', walk: 'walk', sprint: 'sprint', scrub: 'interact-right' };
    for (const [pose, name] of Object.entries(clips) as [Pose, string][]) {
      const clip = animations.find((a) => a.name === name);
      if (clip) this.actions.set(pose, this.mixer.clipAction(clip));
    }
    // A tool in the right hand, shown while working.
    const hand = model.getObjectByName('arm-right');
    if (tool && hand) {
      let geometry = toolGeometries.get(tool);
      if (!geometry) {
        geometry = mergeParts(TOOL_PARTS[tool]);
        toolGeometries.set(tool, geometry);
      }
      this.tool = new Mesh(geometry, toyMaterial);
      this.tool.position.set(0, -0.21, 0.03);
      this.tool.visible = false;
      hand.add(this.tool);
    }
    const pick = animations.find((a) => a.name === 'pick-up');
    if (pick) this.gestureAction = this.mixer.clipAction(pick).setLoop(LoopOnce, 1);
    this.play('idle');
  }

  /** Bend down and pick something up (cash, supplies); walking cancels it. */
  pickUp(): void {
    if (!this.gestureAction || this.gestureLeft > 0) return;
    this.current?.fadeOut(0.1);
    this.gestureAction.reset().fadeIn(0.1).play();
    this.current = this.gestureAction;
    this.gestureLeft = this.gestureAction.getClip().duration;
  }

  /** speed: 0 idle, up to 1 full speed. Scrubbing shows when standing still. */
  update(dt: number, speed: number, scrubbing: boolean): void {
    this.gestureLeft -= dt;
    if (this.gestureLeft <= 0 || speed > 0.05) {
      this.gestureLeft = 0;
      this.play(speed > 0.75 ? 'sprint' : speed > 0.05 ? 'walk' : scrubbing ? 'scrub' : 'idle');
    }
    if (this.tool) this.tool.visible = this.holding || (scrubbing && speed <= 0.05);
    this.mixer.update(dt);
  }

  private play(pose: Pose): void {
    const next = this.actions.get(pose);
    if (!next || next === this.current) return;
    next.reset().fadeIn(0.15).play();
    this.current?.fadeOut(0.15);
    this.current = next;
  }
}

/** Paints for a car that doesn't list its own: a common silver. */
const DEFAULT_PAINTS = ['#c9ced6'];

/** A pooled car: one Blender model (one draw call), painted and muddied by its own material. The windows are opaque, so no visible driver. */
export class CarModel {
  readonly mesh = new Group();
  private readonly body = new Mesh(undefined, new MeshLambertMaterial({ vertexColors: true }));
  private readonly shadow = blobShadow(1, 1);
  /** Paint, mud and foam (the mud stays off on low graphics). */
  private readonly mud: MudUniforms;
  private wasMoving = false;
  private dip = 0;
  private dipSpeed = 0;
  private time = 0;

  constructor() {
    // Cars keep their soft blob shadow; they receive the buildings' and trees' shadows.
    this.body.receiveShadow = true;
    this.mud = addMud(this.body.material as MeshLambertMaterial);
    this.mesh.add(this.body, this.shadow);
  }

  /** The model for this kind of car (art/blender/cars.py), in one of its real paint colours. */
  setType(def: CarDef): void {
    this.body.geometry = carGeometry(def.model);
    const paints = def.paints ?? DEFAULT_PAINTS;
    this.mud.uPaint.value.set(paints[Math.floor(Math.random() * paints.length)]!);
    this.mud.uTop.value = def.size[1];
    this.body.scale.setScalar(def.scale);
    this.shadow.scale.set(def.size[0] * 1.35, 1, def.size[2] * 1.2);
  }

  /** A little bob while driving, and the nose dips and springs back when it stops. */
  animate(dt: number, moving: boolean): void {
    this.time += dt;
    if (this.wasMoving && !moving) this.dipSpeed = -2.4;
    this.wasMoving = moving;
    const step = Math.min(dt, 0.05);
    this.dipSpeed += (-70 * this.dip - 8 * this.dipSpeed) * step;
    this.dip += this.dipSpeed * step;
    this.body.rotation.x = -this.dip * 0.05;
    this.body.position.y = moving ? Math.abs(Math.sin(this.time * 13)) * 0.025 : 0;
  }

  /** 0 = fully muddy, 1 = sparkling clean. */
  setClean(dirt: string, clean: number): void {
    if (!GRAPHICS.mud) clean = 1;
    this.mud.uMudColor.value.set(MUD[dirt] ?? MUD.dusty!);
    // How high the mud reaches on a dirty car: dust stays low, swamp mud covers most of it.
    const start = DIRT_START[dirt] ?? DIRT_START.dusty!;
    this.mud.uClean.value = clean >= 1 ? 9 : start + clean * (1.2 - start);
    // Suds build up quickly, then the last fifth of the wash rinses them off.
    this.mud.uFoam.value = clean <= 0 || clean >= 1 ? 0 : Math.min(1, clean * 4) * Math.min(1, (1 - clean) * 5);
  }
}
