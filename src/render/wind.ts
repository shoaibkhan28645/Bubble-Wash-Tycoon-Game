// A breeze through the fields: a vertex-coloured material whose vertices
// sway, the more the higher they stand above the ground, in gusts that roll
// across the map. Worked out in world space, so it suits merged meshes,
// instanced ones and quantized models alike.
import { MeshLambertMaterial } from 'three';

const time = { value: 0 };
const materials = new Map<number, MeshLambertMaterial>();

/** Ground level the sway is measured from (crop beds stand a little above 0). */
const ROOT = 0.1;

const SWAY = /* glsl */ `
vec4 swayed = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	swayed = batchingMatrix * swayed;
#endif
#ifdef USE_INSTANCING
	swayed = instanceMatrix * swayed;
#endif
swayed = modelMatrix * swayed;
float swayHeight = max( 0.0, swayed.y - ${ROOT.toFixed(2)} );
float gust = sin( uWindTime * 1.6 + swayed.x * 0.45 + swayed.z * 0.3 ) + 0.45 * sin( uWindTime * 2.7 + swayed.x * 1.3 - swayed.z * 0.7 );
swayed.x += gust * uSway * swayHeight * swayHeight;
swayed.z += gust * uSway * 0.35 * swayHeight * swayHeight;
vec4 mvPosition = viewMatrix * swayed;
gl_Position = projectionMatrix * mvPosition;
`;

/**
 * The swaying material, `strength` metres of sway per metre of height,
 * squared: about 0.05 for crops a metre high, less for trees.
 */
export function swayMaterial(strength: number): MeshLambertMaterial {
  const known = materials.get(strength);
  if (known) return known;
  const material = new MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = time;
    shader.uniforms.uSway = { value: strength };
    shader.vertexShader = `uniform float uWindTime;\nuniform float uSway;\n${shader.vertexShader.replace('#include <project_vertex>', SWAY)}`;
  };
  material.customProgramCacheKey = () => `sway:${strength}`;
  materials.set(strength, material);
  return material;
}

/** Moves the breeze on (once a frame). */
export function tickWind(dt: number): void {
  time.value = (time.value + dt) % 3600;
}
