import { Color, type MeshLambertMaterial } from 'three';

/** Per-material settings the mud shader reads every frame. */
export interface MudUniforms {
  uClean: { value: number };
  uMudColor: { value: Color };
}

// Cheap 3D value noise, so the mud breaks up in blotches instead of fading evenly.
const NOISE = /* glsl */ `
varying vec3 vMudPos;
uniform float uClean;
uniform vec3 uMudColor;
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
 * Mud-to-shine: a dirt layer dissolves in noisy blotches as `uClean`
 * goes from 0 (muddy) to 1 (clean). One shader for every car.
 */
export function addMud(material: MeshLambertMaterial): MudUniforms {
  const uniforms: MudUniforms = { uClean: { value: 0 }, uMudColor: { value: new Color('#8a6a48') } };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMudPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMudPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${NOISE}`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float mudN = mudNoise(vMudPos * 2.2) * 0.75 + mudNoise(vMudPos * 7.0) * 0.25;
        float mudMask = smoothstep(uClean - 0.06, uClean + 0.06, mudN);
        vec3 mudTone = uMudColor * (0.8 + 0.35 * mudNoise(vMudPos * 13.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, mudTone, mudMask * 0.92);`,
      );
  };
  material.customProgramCacheKey = () => 'mud';
  return uniforms;
}
