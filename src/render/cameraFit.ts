/**
 * Distance from the focus point at which a sphere of `radius` fits fully
 * inside a perspective camera's view, for any aspect ratio.
 *
 * The camera keeps a fixed vertical field of view. On tall screens the
 * horizontal angle is the narrow one, so the camera backs off further;
 * on wide screens the vertical angle limits it.
 */
export function fitDistance(
  radius: number,
  verticalFovDeg: number,
  aspect: number,
  margin = 1,
): number {
  const halfVertical = (verticalFovDeg * Math.PI) / 360;
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * aspect);
  const halfAngle = Math.min(halfVertical, halfHorizontal);
  return (radius * margin) / Math.sin(halfAngle);
}
