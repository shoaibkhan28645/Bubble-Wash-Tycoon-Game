import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  MeshLambertMaterial,
  SphereGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
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
/**
 * The same paint for models drawn skinned (an animal or a machine, rigid.ts)
 * and for instanced ones (carried crates). Each needs its own shader, and the
 * renderer draws things grouped by material: sharing toyMaterial, they were
 * mixed in with everything else and the shader was swapped over and over a frame.
 */
export const skinnedToyMaterial = toyMaterial.clone();
export const instancedToyMaterial = toyMaterial.clone();

/**
 * How far into the evening it is (0 day, 1 night). The lamp bulbs (anything
 * painted the bulb colour, BULB in art/blender) light up as it gets dark:
 * the park's lamps, the rides' rims, the signs. Nothing glows elsewhere.
 */
export const nightGlow = { value: 0 };
const BULB = new Color('#fff3a0');
/** The haunted house's windows (SPOOK in art/blender/park.py): they glow green after dark. */
const SPOOK = new Color('#b8ff6a');
/** A vertex this close to the bulb colour (linear RGB) glows. */
const BULB_MATCH = 0.06;
for (const material of [toyMaterial, skinnedToyMaterial, instancedToyMaterial]) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = nightGlow;
    shader.uniforms.uBulb = { value: BULB };
    shader.uniforms.uSpook = { value: SPOOK };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;\nuniform vec3 uBulb;\nuniform vec3 uSpook;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
#ifdef USE_COLOR
  totalEmissiveRadiance += vColor.rgb * (1.0 - step(${BULB_MATCH.toFixed(3)}, distance(vColor.rgb, uBulb))) * uNight * 2.6;
  totalEmissiveRadiance += vColor.rgb * (1.0 - step(${BULB_MATCH.toFixed(3)}, distance(vColor.rgb, uSpook))) * uNight * 1.4;
#endif`,
      );
  };
}

export const box = (w: number, h: number, d: number) => new BoxGeometry(w, h, d);
/** Box with bevelled edges (reads as a toy rather than a raw cube); one bevel step keeps it cheap. */
export const rbox = (w: number, h: number, d: number, radius = 0.06) =>
  new RoundedBoxGeometry(w, h, d, 1, Math.min(radius, w / 2, h / 2, d / 2));
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
  // Rounded boxes come without an index; everything must match to merge.
  const mixed = pieces.some((g) => !g.index) && pieces.some((g) => g.index);
  const merged = mergeGeometries(mixed ? pieces.map((g) => (g.index ? g.toNonIndexed() : g)) : pieces);
  for (const piece of pieces) piece.dispose();
  if (!merged) throw new Error('Could not merge model parts');
  return merged;
}
