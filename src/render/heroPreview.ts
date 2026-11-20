import { InstancedMesh, Mesh, PerspectiveCamera, Raycaster, SkinnedMesh, Vector3, type Object3D } from 'three';
import type { Stage } from './stage';

/** How far the close-up camera stands from a person, how high, and the height it looks at (metres). */
const DISTANCE = 5.4;
const EYE_HEIGHT = 2.1;
const LOOK_HEIGHT = 1.2;
/** The camera swings this far either side of its subject's front (radians), once every this many seconds. */
const SWING = 0.75;
const SWING_SECONDS = 9;

/**
 * What the close-up looks at: a person (the hero, a staff member), framed from in front of them; or a spot
 * (a decoration), seen from the camera's side at `distance`, from `eye` metres above it, looking at `look`.
 */
export type PreviewTarget = { person: Object3D } | { spot: Vector3; look: number; eye: number; distance: number };

/**
 * The boutique's close-up: a camera that stands in front of what's being shown (the hero by default),
 * slowly swinging from one side to the other, drawn into the shop's preview window while it's open.
 */
export class HeroPreview {
  private readonly camera = new PerspectiveCamera(30, 0.8, 0.3, 120);
  private time = 0;
  private open = false;
  private target: PreviewTarget;

  constructor(
    private readonly stage: Stage,
    private readonly hero: Object3D,
  ) {
    this.target = { person: hero };
  }

  /** Shows the close-up in `element` (null hides it, and it goes back to the hero). */
  show(element: HTMLElement | null): void {
    this.open = !!element;
    this.time = 0;
    if (!element) this.target = { person: this.hero };
    else this.aim();
    this.stage.setPreview(element ? { camera: this.camera, element } : null);
  }

  /** Points the close-up at something else (null: the hero). */
  focus(target: PreviewTarget | null): void {
    this.target = target ?? { person: this.hero };
    if (this.open) this.aim();
  }

  /**
   * Whether a person standing at `at` and facing `yaw` would be in clear view of the close-up, from the middle
   * and both ends of its swing: nothing solid between the camera and their chest, and nothing over the spot
   * they'd stand on. People (they move about), `skip` (and what's in it) and hidden things don't count.
   */
  canSee(at: Vector3, yaw: number, skip: readonly Object3D[]): boolean {
    const solids = solidMeshes(this.stage.scene, skip);
    const chest = new Vector3(at.x, at.y + CHEST, at.z);
    // Something already standing there (a counter, a wall): straight down onto the spot.
    ray.set(new Vector3(at.x, at.y + 3, at.z), DOWN);
    ray.far = 3 - 0.25;
    if (ray.intersectObjects(solids, false).length) return false;
    for (const swing of [0, -SWING, SWING]) {
      const angle = yaw + swing;
      const eye = new Vector3(at.x + Math.sin(angle) * DISTANCE, at.y + EYE_HEIGHT, at.z + Math.cos(angle) * DISTANCE);
      const toward = chest.clone().sub(eye);
      ray.far = toward.length() - 0.5;
      ray.set(eye, toward.normalize());
      if (ray.intersectObjects(solids, false).length) return false;
    }
    return true;
  }

  update(dt: number): void {
    if (!this.open) return;
    this.time += dt;
    this.aim();
  }

  private aim(): void {
    const swing = Math.sin((this.time / SWING_SECONDS) * Math.PI * 2) * SWING;
    const target = this.target;
    if ('person' in target) {
      const at = target.person.getWorldPosition(spot);
      const angle = target.person.rotation.y + swing;
      this.camera.position.set(at.x + Math.sin(angle) * DISTANCE, at.y + EYE_HEIGHT, at.z + Math.cos(angle) * DISTANCE);
      this.camera.lookAt(at.x, at.y + LOOK_HEIGHT, at.z);
      return;
    }
    const at = target.spot;
    const angle = swing * 0.8;
    this.camera.position.set(at.x + Math.sin(angle) * target.distance, at.y + target.eye, at.z + Math.cos(angle) * target.distance);
    this.camera.lookAt(at.x, at.y + target.look, at.z);
  }
}

const spot = new Vector3();
const ray = new Raycaster();
const DOWN = new Vector3(0, -1, 0);
/** The height of a person's chest, what the close-up must be able to see (metres). */
const CHEST = 1.0;

/** Every solid thing in the scene a sight line can be blocked by: shown meshes, not people, not in `skip`. */
function solidMeshes(scene: Object3D, skip: readonly Object3D[]): Mesh[] {
  const out: Mesh[] = [];
  const walk = (node: Object3D): void => {
    if (!node.visible || node.name === 'person' || skip.includes(node)) return;
    // Animals and the like (skinned) are small and costly to test; the many-copies meshes (grass, crops) too low to matter.
    if (node instanceof Mesh && !(node instanceof SkinnedMesh) && !(node instanceof InstancedMesh)) {
      const material = Array.isArray(node.material) ? node.material[0] : node.material;
      if (material?.visible !== false && !(material?.transparent && material.opacity < 0.5)) out.push(node);
    }
    for (const child of node.children) walk(child);
  };
  walk(scene);
  return out;
}
