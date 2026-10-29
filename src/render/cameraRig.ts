import { PerspectiveCamera, Plane, Ray, Vector3 } from 'three';
import type { Point, Rect } from '../core/config';
import { fitCameraToRect } from './cameraFit';

/** Fixed 3/4 view, looking down at about 50 degrees. */
const VIEW_DIR = new Vector3(0, 1.2, 1).normalize();
/** Tallest thing on the lot, so roofs and labels aren't cut off. */
const CONTENT_HEIGHT = 3;
/** How much ground the camera shows around the player (width × depth, metres): about two wash bays across. */
const VIEW = { width: 11, depth: 13 };
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
  private distance = 30;
  /** From the point the player should be at to where the camera looks (the screen's usable middle). */
  private offset = new Vector3();
  /** How far the screen reaches on the ground from the player, each way (top and left are negative). */
  private reach = { left: -VIEW.width / 2, right: VIEW.width / 2, top: -VIEW.depth / 2, bottom: VIEW.depth / 2 };
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

  /** Call after the camera's aspect or the insets change: works out the zoom for the view size. */
  refit(): void {
    const rect = { minX: -VIEW.width / 2, maxX: VIEW.width / 2, minZ: -VIEW.depth / 2, maxZ: VIEW.depth / 2 };
    const fit = fitCameraToRect(this.camera.fov, this.camera.aspect, VIEW_DIR, rect, CONTENT_HEIGHT, undefined, this.insetRight, this.insetTop);
    this.distance = fit.distance;
    this.offset.copy(fit.target);
    this.measureReach();
  }

  /**
   * With the player at the origin, where the edges of the usable screen
   * (clear of the HUD and side buttons) meet the ground: a tall phone sees
   * more ground up and down than the view box, a wide one more sideways.
   */
  private measureReach(): void {
    const probe = new PerspectiveCamera(this.camera.fov, this.camera.aspect, 0.1, 1000);
    probe.position.copy(this.offset).addScaledVector(VIEW_DIR, this.distance);
    probe.lookAt(this.offset);
    probe.updateMatrixWorld();
    const right = 1 - this.insetRight;
    const top = 1 - this.insetTop;
    const midX = (right - 1) / 2;
    const midY = (top - 1) / 2;
    const ground = (x: number, y: number): Vector3 => {
      const ray = new Ray();
      ray.origin.copy(probe.position);
      ray.direction.set(x, y, 0.5).unproject(probe).sub(probe.position).normalize();
      return ray.intersectPlane(GROUND, new Vector3()) ?? new Vector3();
    };
    this.reach = {
      top: ground(midX, top).z,
      bottom: ground(midX, -1).z,
      left: ground(-1, midY).x,
      right: ground(right, midY).x,
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
    this.camera.position.copy(this.target).addScaledVector(VIEW_DIR, this.distance);
    this.camera.near = Math.max(0.5, this.distance * 0.3);
    this.camera.far = this.distance * 3 + 50;
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
  }
}
