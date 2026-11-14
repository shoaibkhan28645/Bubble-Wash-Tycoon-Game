import { PerspectiveCamera, type Object3D } from 'three';
import type { Stage } from './stage';

/** How far the close-up camera stands from the hero, how high, and the height it looks at (metres). */
const DISTANCE = 5.4;
const EYE_HEIGHT = 2.1;
const LOOK_HEIGHT = 1.2;
/** The camera swings this far either side of the hero's front (radians), once every this many seconds. */
const SWING = 0.75;
const SWING_SECONDS = 9;

/**
 * The boutique's close-up of the hero: a camera that stands in front of them, slowly swinging from one
 * side to the other, drawn into the shop's preview window while it's open.
 */
export class HeroPreview {
  private readonly camera = new PerspectiveCamera(30, 0.8, 0.3, 90);
  private time = 0;
  private open = false;

  constructor(
    private readonly stage: Stage,
    private readonly hero: Object3D,
  ) {}

  /** Shows the close-up in `element` (null hides it). */
  show(element: HTMLElement | null): void {
    this.open = !!element;
    this.time = 0;
    if (element) this.aim();
    this.stage.setPreview(element ? { camera: this.camera, element } : null);
  }

  update(dt: number): void {
    if (!this.open) return;
    this.time += dt;
    this.aim();
  }

  private aim(): void {
    const at = this.hero.position;
    const angle = this.hero.rotation.y + Math.sin((this.time / SWING_SECONDS) * Math.PI * 2) * SWING;
    this.camera.position.set(at.x + Math.sin(angle) * DISTANCE, at.y + EYE_HEIGHT, at.z + Math.cos(angle) * DISTANCE);
    this.camera.lookAt(at.x, at.y + LOOK_HEIGHT, at.z);
  }
}
