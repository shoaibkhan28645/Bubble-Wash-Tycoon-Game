// What the camera saw last frame, so things off screen can skip work nobody
// would see (a person's walk animation, an animal's head turning).
import { Frustum, Matrix4, Sphere, type Camera, type Vector3 } from 'three';

const frustum = new Frustum();
const viewProjection = new Matrix4();
const probe = new Sphere();
let known = false;

/** After each frame is drawn: remembers what that camera could see. */
export function updateOnScreen(camera: Camera): void {
  viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(viewProjection);
  known = true;
}

/** Leaving a town: until the next frame is drawn, everything counts as on screen. */
export function forgetOnScreen(): void {
  known = false;
}

/** True if a sphere was on screen last frame (or nothing's been drawn yet). */
export function onScreen(at: Vector3, radius: number): boolean {
  if (!known) return true;
  probe.center.copy(at);
  probe.radius = radius;
  return frustum.intersectsSphere(probe);
}
