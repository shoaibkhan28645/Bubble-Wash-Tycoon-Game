import { MathUtils, PerspectiveCamera, Plane, Ray, Vector3 } from 'three';
import type { Point, Rect } from '../core/config';

/**
 * How much of the town the screen shows, whatever its shape: as much as a
 * square this many metres across, at the hero. A tall phone sees it as a
 * column and a wide one as a strip, but the hero and the buildings come out
 * the same size on the same phone either way, turned up or turned sideways.
 */
const VIEW_METRES = 17.5;
/** Field of view up and down on a tall or square screen (degrees). */
const FOV_TALL = 35;
/** The widest field of view across a wide screen (degrees): any wider and things at the sides look stretched. */
const MAX_FOV_ACROSS = 42;
/** How far the camera looks down (degrees): 50 on a tall screen, a little lower on a wide one so the buildings stand up. */
const PITCH_TALL = 50;
const PITCH_WIDE = 43;
/** From this aspect (width / height) a screen counts as wide: the pitch eases from tall to wide on the way there. */
const WIDE_ASPECT = 1.8;
/** How quickly the camera catches up with the player (per second). */
const FOLLOW = 4;
const GROUND = new Plane(new Vector3(0, 1, 0), 0);

/**
 * Follows the player at a fixed, close zoom, panning smoothly as they walk.
 * The view never drifts past the edge of what's built (the `area`), so the
 * lot stays framed instead of showing empty grass.
 */
export class CameraRig {
  private readonly target = new Vector3();
  private readonly goal = new Vector3();
  /** From the point the camera looks at towards the camera. */
  private readonly viewDir = new Vector3(0, 1.2, 1).normalize();
  private distance = 30;
  /** From the point the player should be at to where the camera looks (the screen's usable middle). */
  private offset = new Vector3();
  /** How far the screen reaches on the ground from the player, each way (top and left are negative). */
  private reach = { left: -5, right: 5, top: -6, bottom: 6 };
  private area: Rect = { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
  /** Screen strips on the right and at the top kept clear for the side buttons and the HUD (normalised units). */
  private insetRight = 0;
  private insetTop = 0;

  constructor(private readonly camera: PerspectiveCamera) {}

  /** Where the view may go: the lot as built so far. */
  setArea(area: Rect): void {
    this.area = area;
  }

  /** Keeps `pixels` on the right of a `width`-pixel screen clear of the lot. */
  setRightInset(pixels: number, width: number): void {
    this.insetRight = (2 * pixels) / Math.max(1, width);
  }

  /** Keeps `pixels` at the top of a `height`-pixel screen clear of the lot. */
  setTopInset(pixels: number, height: number): void {
    this.insetTop = (2 * pixels) / Math.max(1, height);
  }

  /** The camera's angle and zoom for a screen of this shape (width / height). */
  static framing(aspect: number): { fov: number; pitch: number; distance: number } {
    const wide = MathUtils.clamp((aspect - 1) / (WIDE_ASPECT - 1), 0, 1);
    const pitch = MathUtils.lerp(PITCH_TALL, PITCH_WIDE, wide);
    // Up and down stays at FOV_TALL until the view across would be wider than MAX_FOV_ACROSS.
    const halfAcross = Math.tan(MathUtils.degToRad(MAX_FOV_ACROSS) / 2);
    const halfTall = Math.tan(MathUtils.degToRad(FOV_TALL) / 2);
    const half = Math.min(halfTall, halfAcross / aspect);
    const fov = MathUtils.radToDeg(2 * Math.atan(half));
    // The view at the hero is 2·d·tan(fov/2) high and `aspect` times that wide; its area is VIEW_METRES².
    const distance = VIEW_METRES / (2 * Math.sqrt(aspect) * half);
    return { fov, pitch, distance };
  }

  /** Call after the camera's aspect or the insets change: works out the angle and zoom for the screen. */
  refit(): void {
    const { fov, pitch, distance } = CameraRig.framing(this.camera.aspect);
    const down = MathUtils.degToRad(pitch);
    this.viewDir.set(0, Math.sin(down), Math.cos(down));
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    this.distance = distance;
    this.measure();
  }

  /**
   * Puts the player in the middle of the screen clear of the HUD and side
   * buttons, and works out where the edges of that part of the screen meet
   * the ground: a tall phone sees more ground up and down, a wide one more
   * sideways.
   */
  private measure(): void {
    const probe = new PerspectiveCamera(this.camera.fov, this.camera.aspect, 0.1, 1000);
    probe.position.copy(this.viewDir).multiplyScalar(this.distance);
    probe.lookAt(0, 0, 0);
    probe.updateMatrixWorld();
    const right = 1 - this.insetRight;
    const top = 1 - this.insetTop;
    const midX = (right - 1) / 2;
    const midY = (top - 1) / 2;
    const ray = new Ray();
    const ground = (x: number, y: number): Vector3 => {
      ray.origin.copy(probe.position);
      ray.direction.set(x, y, 0.5).unproject(probe).sub(probe.position).normalize();
      return ray.intersectPlane(GROUND, new Vector3()) ?? new Vector3();
    };
    const middle = ground(midX, midY);
    this.offset.copy(middle).negate();
    this.reach = {
      top: ground(midX, top).z - middle.z,
      bottom: ground(midX, -1).z - middle.z,
      left: ground(-1, midY).x - middle.x,
      right: ground(right, midY).x - middle.x,
    };
  }

  /** Jumps straight to the player (at the start, after a resize). */
  snap(focus: Point): void {
    this.aim(focus);
    this.target.copy(this.goal);
    this.apply();
  }

  update(dt: number, focus: Point): void {
    this.aim(focus);
    this.target.lerp(this.goal, 1 - Math.exp(-dt * FOLLOW));
    this.apply();
  }

  /** The player in the middle, unless that would show past the built area's edge. */
  private aim(focus: Point): void {
    // Keep `value + near` ≥ min and `value + far` ≤ max; if the area is smaller than the screen, centre it.
    const clamp = (value: number, min: number, max: number, near: number, far: number) => {
      const low = min - near;
      const high = max - far;
      return low > high ? (low + high) / 2 : Math.min(high, Math.max(low, value));
    };
    const { area, reach } = this;
    const x = clamp(focus.x, area.minX, area.maxX, reach.left, reach.right);
    const z = clamp(focus.z, area.minZ, area.maxZ, reach.top, reach.bottom);
    this.goal.set(x, 0, z).add(this.offset);
  }

  private apply(): void {
    this.camera.position.copy(this.target).addScaledVector(this.viewDir, this.distance);
    this.camera.near = Math.max(0.5, this.distance * 0.3);
    this.camera.far = this.distance * 3 + 50;
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
  }
}
