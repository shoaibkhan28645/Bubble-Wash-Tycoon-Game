import { Color, type MeshLambertMaterial } from 'three';

/** Per-material settings the mud shader reads every frame. */
export interface MudUniforms {
  /** Mud shows where the mud field is above this (raised as the car gets cleaner). */
  uClean: { value: number };
  uMudColor: { value: Color };
  /** Height of the model (its own units), so mud can splash up from the bottom. */
  uTop: { value: number };
  /** Soap foam, 0..1: builds up while washing, rinsed off at the end. */
  uFoam: { value: number };
  /** The car's paint, for the parts modelled in the paint key colour (magenta). */
  uPaint: { value: Color };
}

// Cheap 3D value noise, so the mud breaks up in blotches instead of fading evenly.
const NOISE = /* glsl */ `
varying vec3 vMudPos;
uniform float uClean;
uniform vec3 uMudColor;
uniform float uTop;
uniform float uFoam;
uniform vec3 uPaint;
float mudHash(vec3 p) { return fract(sin(dot(p, vec3(17.1, 113.5, 71.7))) * 43758.5453); }
float mudNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(mudHash(i), mudHash(i + vec3(1, 0, 0)), f.x), mix(mudHash(i + vec3(0, 1, 0)), mudHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(mudHash(i + vec3(0, 0, 1)), mudHash(i + vec3(1, 0, 1)), f.x), mix(mudHash(i + vec3(0, 1, 1)), mudHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
`;

/**
 * The car's paint and mud-to-shine. Parts modelled in the paint key colour
 * (magenta, art/blender/cars.py) take the car's own paint. Then mud splashed
 * up from the wheels, thickest low down, in blotches and drips so the paint
 * still shows on top; it dissolves as `uClean` rises. A dull film over the
 * rest of the paint goes too.
 */
export function addMud(material: MeshLambertMaterial): MudUniforms {
  const uniforms: MudUniforms = {
    uClean: { value: 0 },
    uMudColor: { value: new Color('#8a6a48') },
    uTop: { value: 1 },
    uFoam: { value: 0 },
    uPaint: { value: new Color('#c9ced6') },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMudPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMudPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${NOISE}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        #ifdef USE_COLOR
        if (vColor.r > 0.9 && vColor.g < 0.1 && vColor.b > 0.9) diffuseColor.rgb = uPaint;
        #endif
        float mudLow = 1.0 - clamp(vMudPos.y / uTop, 0.0, 1.0);
        float mudDrip = mudNoise(vec3(vMudPos.x * 9.0, vMudPos.y * 1.3, vMudPos.z * 9.0));
        float mudN = mudNoise(vMudPos * 2.6) * 0.55 + mudNoise(vMudPos * 8.0) * 0.2 + mudDrip * 0.25;
        float mudField = mudN * 0.75 + mudLow * mudLow * 0.7;
        float mudMask = smoothstep(uClean - 0.03, uClean + 0.03, mudField);
        vec3 mudTone = uMudColor * (0.75 + 0.4 * mudNoise(vMudPos * 15.0));
        // Dull, dusty film until washed.
        float mudFilm = clamp(1.25 - uClean, 0.0, 1.0) * 0.55;
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb, uMudColor, 0.45), mudFilm);
        diffuseColor.rgb = mix(diffuseColor.rgb, mudTone, mudMask * 0.95);
        // Foam: white suds in bubbly clumps, thickest on top.
        float foamN = mudNoise(vMudPos * 16.0) * 0.65 + mudNoise(vMudPos * 36.0) * 0.35 + (1.0 - mudLow) * 0.25;
        float foamMask = smoothstep(1.08 - uFoam * 0.42, 1.13 - uFoam * 0.42, foamN);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.97, 0.98, 1.0), foamMask * 0.92);`,
      );
  };
  material.customProgramCacheKey = () => 'mud';
  return uniforms;
}
