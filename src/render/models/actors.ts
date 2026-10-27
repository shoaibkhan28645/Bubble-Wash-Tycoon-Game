// Player and car models from the Kenney packs (Mini Characters, Car Kit).
import {
  AnimationMixer,
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

/** Mini Characters are 0.8 units tall; this makes them about car-roof height. */
const PERSON_SCALE = 2;

const MUD: Record<string, string> = { dusty: '#a4825c', muddy: '#7a5a3a', swamp: '#5a6636' };

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
  return shadow;
}

type Pose = 'idle' | 'walk' | 'sprint' | 'scrub';

/** A person (Kenney Mini Characters) with the pack's own animations. */
export class PersonAvatar {
  readonly root = new Group();
  private readonly mixer: AnimationMixer;
  private readonly actions = new Map<Pose, AnimationAction>();
  private current: AnimationAction | undefined;

  constructor(character: string) {
    const { scene, animations } = asset(`person:${character}`);
    const model = cloneSkinned(scene);
    model.scale.setScalar(PERSON_SCALE);
    this.root.add(model, blobShadow(1.2, 1.2));
    this.mixer = new AnimationMixer(model);
    const clips: Record<Pose, string> = { idle: 'idle', walk: 'walk', sprint: 'sprint', scrub: 'interact-right' };
    for (const [pose, name] of Object.entries(clips) as [Pose, string][]) {
      const clip = animations.find((a) => a.name === name);
      if (clip) this.actions.set(pose, this.mixer.clipAction(clip));
    }
    this.play('idle');
  }

  /** speed: 0 idle, up to 1 full speed. Scrubbing shows when standing still. */
  update(dt: number, speed: number, scrubbing: boolean): void {
    this.play(speed > 0.75 ? 'sprint' : speed > 0.05 ? 'walk' : scrubbing ? 'scrub' : 'idle');
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

  constructor() {
    this.mesh.add(this.body, this.shadow);
  }

  setType(def: CarDef): void {
    const { geometry, material } = mergedModel(`car:${def.model}`);
    const own = material.clone();
    if (def.tint) own.color = new Color(def.tint);
    this.mud = addMud(own);
    this.body.geometry = geometry;
    (this.body.material as { dispose?: () => void }).dispose?.();
    this.body.material = own;
    this.body.scale.setScalar(def.scale);
    this.shadow.scale.set(def.size[0] * 1.35, 1, def.size[2] * 1.2);
  }

/** 0 = fully muddy, 1 = sparkling clean. */
  setClean(dirt: string, clean: number): void {
    if (!this.mud) return;
    this.mud.uMudColor.value.set(MUD[dirt] ?? MUD.dusty!);
    // The noise mostly sits mid-range, so stretch the threshold to use all of it.
    this.mud.uClean.value = clean <= 0 ? -1 : clean >= 1 ? 2 : 0.18 + clean * 0.66;
  }
}
