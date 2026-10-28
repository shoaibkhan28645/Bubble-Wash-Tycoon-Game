import { PerspectiveCamera, Vector3 } from 'three';
import type { Rect } from '../core/config';
import { fitCameraToRect } from './cameraFit';

/** Fixed 3/4 view, looking down at about 50 degrees. */
const VIEW_DIR = new Vector3(0, 1.2, 1).normalize();
/** Tallest thing on the lot, so roofs and labels aren't cut off. */
const CONTENT_HEIGHT = 3;
const EASE = 2.5;

/** Keeps the whole active lot in view; glides out as the lot grows. */
export class CameraRig {
  private readonly target = new Vector3();
  private distance = 30;
  private goalTarget = new Vector3();
  private goalDistance = 30;
  private rect: Rect = { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
  /** Screen strip on the right kept clear for the side buttons (normalised units). */
  private insetRight = 0;

  constructor(private readonly camera: PerspectiveCamera) {}

  /** The area that must stay on screen. `instant` skips the glide (boot, resize). */
  setRect(rect: Rect, instant = false): void {
    this.rect = rect;
    this.refit(instant);
  }

  /** Keeps `pixels` on the right of a `width`-pixel screen clear of the lot. */
  setRightInset(pixels: number, width: number): void {
    this.insetRight = (2 * pixels) / Math.max(1, width);
  }

  /** Call after the camera's aspect changes. */
  refit(instant = true): void {
    const goal = fitCameraToRect(this.camera.fov, this.camera.aspect, VIEW_DIR, this.rect, CONTENT_HEIGHT, undefined, this.insetRight);
    this.goalTarget = goal.target;
    this.goalDistance = goal.distance;
    if (instant) {
      this.target.copy(this.goalTarget);
      this.distance = this.goalDistance;
    }
    this.apply();
  }

  update(dt: number): void {
    const t = 1 - Math.exp(-dt * EASE);
    this.target.lerp(this.goalTarget, t);
    this.distance += (this.goalDistance - this.distance) * t;
    this.apply();
  }

  private apply(): void {
    this.camera.position.copy(this.target).addScaledVector(VIEW_DIR, this.distance);
    this.camera.near = Math.max(0.5, this.distance * 0.3);
    this.camera.far = this.distance * 3 + 50;
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
  }
}
