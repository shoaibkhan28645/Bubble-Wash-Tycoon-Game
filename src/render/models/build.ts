import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  MeshLambertMaterial,
  SphereGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** One coloured shape in a model, placed relative to the model's origin. */
export interface Part {
  geometry: BufferGeometry;
  color: number | string;
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
}

/** Shared flat material for all static, vertex-coloured models. */
export const toyMaterial = new MeshLambertMaterial({ vertexColors: true });

export const box = (w: number, h: number, d: number) => new BoxGeometry(w, h, d);
export const cylinder = (radius: number, height: number, segments = 12) =>
  new CylinderGeometry(radius, radius, height, segments);
export const sphere = (radius: number, segments = 12) => new SphereGeometry(radius, segments, Math.ceil(segments * 0.75));

/** Merges parts into one vertex-coloured geometry, so a whole model is one draw call. */
export function mergeParts(parts: Part[]): BufferGeometry {
  const color = new Color();
  const pieces = parts.map((part) => {
    const g = part.geometry;
    color.set(part.color);
    const count = g.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3);
    g.setAttribute('color', new Float32BufferAttribute(colors, 3));
    if (part.rx) g.rotateX(part.rx);
    if (part.ry) g.rotateY(part.ry);
    if (part.rz) g.rotateZ(part.rz);
    g.translate(part.x ?? 0, part.y ?? 0, part.z ?? 0);
    return g;
  });
  const merged = mergeGeometries(pieces);
  for (const piece of pieces) piece.dispose();
  if (!merged) throw new Error('Could not merge model parts');
  return merged;
}
