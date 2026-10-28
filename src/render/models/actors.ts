// Player and car models from the Kenney packs (Mini Characters, Car Kit).
import {
  AnimationMixer,
  LoopOnce,
  type BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  type AnimationAction,
} from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { CarDef } from '../../core/config';
import { asset, mergedModel } from '../assets';
import { addMud, type MudUniforms } from '../mud';
import { GRAPHICS } from '../graphics';
import { cylinder, mergeParts, rbox, toyMaterial, type Part } from './build';

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

/** Soft blob shadow, added as a child just above the ground. */
export function blobShadow(width: number, length: number): Mesh {
  const shadow = new Mesh(shadowGeometry, getShadowMaterial());
  shadow.scale.set(width, 1, length);
  shadow.position.y = 0.03;
  shadow.renderOrder = -1;
  shadow.userData.noShadow = true;
  return shadow;
}

type Pose = 'idle' | 'walk' | 'sprint' | 'scrub';
/** What a person holds while working. */
export type Tool = 'sponge' | 'towel' | 'polisher';

const TOOL_PARTS: Record<Tool, Part[]> = {
  sponge: [{ geometry: rbox(0.13, 0.07, 0.09, 0.03), color: '#ffd24a' }],
  towel: [{ geometry: rbox(0.16, 0.03, 0.12, 0.012), color: '#7ee0c3' }],
  polisher: [
    { geometry: cylinder(0.08, 0.04, 12), color: '#fff3c4', y: -0.03 },
    { geometry: rbox(0.06, 0.07, 0.06, 0.02), color: '#3b4a5e', y: 0.02 },
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

  constructor(character: string, tool: Tool | null = null) {
    const { scene, animations } = asset(`person:${character}`);
    const model = cloneSkinned(scene);
    model.scale.setScalar(PERSON_SCALE);
    // People keep their soft blob shadow: real ones would draw every
    // animated character a second time each frame.
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
    if (this.tool) this.tool.visible = scrubbing && speed <= 0.05;
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

/** A pooled car: one Car Kit model (one draw call). The windows are opaque, so no visible driver. */
export class CarModel {
  readonly mesh = new Group();
  private readonly body = new Mesh();
  private readonly shadow = blobShadow(1, 1);
  private mud: MudUniforms | null = null;
  private wasMoving = false;
  private dip = 0;
  private dipSpeed = 0;
  private time = 0;

  constructor() {
    this.body.castShadow = this.body.receiveShadow = true;
    this.mesh.add(this.body, this.shadow);
  }

  setType(def: CarDef): void {
    const { geometry, material } = mergedModel(`car:${def.model}`);
    const own = material.clone();
    if (def.tint) own.color = new Color(def.tint);
    this.mud = GRAPHICS.mud ? addMud(own) : null;
    if (this.mud) this.mud.uTop.value = def.size[1] / def.scale;
    this.body.geometry = geometry;
    (this.body.material as { dispose?: () => void }).dispose?.();
    this.body.material = own;
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
    if (!this.mud) return;
    this.mud.uMudColor.value.set(MUD[dirt] ?? MUD.dusty!);
    // How high the mud reaches on a dirty car: dust stays low, swamp mud covers most of it.
    const start = DIRT_START[dirt] ?? DIRT_START.dusty!;
    this.mud.uClean.value = clean >= 1 ? 9 : start + clean * (1.2 - start);
    // Suds build up quickly, then the last fifth of the wash rinses them off.
    this.mud.uFoam.value = clean <= 0 || clean >= 1 ? 0 : Math.min(1, clean * 4) * Math.min(1, (1 - clean) * 5);
  }
}
