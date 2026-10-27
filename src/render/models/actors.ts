// Player and car models from the Kenney packs (Cube Pets, Car Kit).
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
import { CHARACTERS, type CarDef } from '../../core/config';
import { asset, mergedModel } from '../assets';
import { addMud, type MudUniforms } from '../mud';

const PLAYER_SCALE = 0.95;
const DRIVER_SCALE = 0.42;
/** Driver pops out of the roof, a little towards the front. */
const DRIVER_SEAT = { y: 0.62, z: 0.15 };

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

/** The player's cat, with Cube Pets' own idle / walk / run animations. */
export class PlayerAvatar {
  readonly root = new Group();
  private readonly mixer: AnimationMixer;
  private readonly actions: Record<'static' | 'walk' | 'run', AnimationAction | undefined>;
  private current: AnimationAction | undefined;

  constructor() {
    const { scene, animations } = asset(`pet:${CHARACTERS.player}`);
    const model = cloneSkinned(scene);
    model.scale.setScalar(PLAYER_SCALE);
    this.root.add(model, blobShadow(1.3, 1.3));
    this.mixer = new AnimationMixer(model);
    const clip = (name: string) => animations.find((a) => a.name === name);
    const action = (name: string) => {
      const c = clip(name);
      return c ? this.mixer.clipAction(c) : undefined;
    };
    this.actions = { static: action('static'), walk: action('walk'), run: action('run') };
    this.play('static');
  }

  /** speed: 0 idle, up to 1 full speed. */
  update(dt: number, speed: number): void {
    this.play(speed > 0.7 ? 'run' : speed > 0.05 ? 'walk' : 'static');
    this.mixer.update(dt);
  }

  private play(name: 'static' | 'walk' | 'run'): void {
    const next = this.actions[name];
    if (!next || next === this.current) return;
    next.reset().fadeIn(0.15).play();
    this.current?.fadeOut(0.15);
    this.current = next;
  }
}

/** A pooled car: Car Kit body (one draw call) + a Cube Pets driver (one draw call). */
export class CarModel {
  readonly mesh = new Group();
  private readonly body = new Mesh();
  private readonly driver = new Mesh();
  private readonly shadow = blobShadow(1, 1);
  private mud: MudUniforms | null = null;
  private time = Math.random() * 10;

  constructor() {
    this.mesh.add(this.body, this.driver, this.shadow);
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

    const pet = CHARACTERS.drivers[Math.floor(Math.random() * CHARACTERS.drivers.length)]!;
    const driver = mergedModel(`pet:${pet}`);
    this.driver.geometry = driver.geometry;
    this.driver.material = driver.material;
    this.driver.scale.setScalar(DRIVER_SCALE * def.scale);
    this.driver.position.set(0, DRIVER_SEAT.y * def.scale + def.size[1] * 0.35, DRIVER_SEAT.z * def.scale);
    this.shadow.scale.set(def.size[0] * 1.35, 1, def.size[2] * 1.2);
  }

  /** 0 = fully muddy, 1 = sparkling clean. */
  setClean(dirt: string, clean: number): void {
    if (!this.mud) return;
    this.mud.uMudColor.value.set(MUD[dirt] ?? MUD.dusty!);
    // The noise mostly sits mid-range, so stretch the threshold to use all of it.
    this.mud.uClean.value = clean <= 0 ? -1 : clean >= 1 ? 2 : 0.18 + clean * 0.66;
  }

  /** Little driver bob so the cars feel alive. */
  update(dt: number, moving: boolean): void {
    this.time += dt * (moving ? 14 : 3);
    this.driver.rotation.z = Math.sin(this.time) * (moving ? 0.06 : 0.03);
  }
}
