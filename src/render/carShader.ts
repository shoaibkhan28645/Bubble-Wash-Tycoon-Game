// The car's life on its material (with the mud, mud.ts): wheels that roll
// and front wheels that steer (in the vertex shader, so a car stays one
// draw call; carGeometry.ts tags each wheel's vertices with its centre),
// brake lights that glow when it slows or waits, indicators that blink
// before a turn, headlights that look lit, and the sky in the glass and a
// sheen along the paint's edges.
import type { WebGLProgramParametersWithUniforms } from 'three';

/** Per-car settings the shader reads every frame. */
export interface DriveUniforms {
  /** How far round the wheels have rolled, and the front wheels' steering angle (radians). */
  uSpin: { value: number };
  uSteer: { value: number };
  /** Brake lights, 0..1. */
  uBrake: { value: number };
  /** Left and right indicators, 0 (off) or 1 (lit), blinking. */
  uBlinkL: { value: number };
  uBlinkR: { value: number };
  /** How bright the headlights are. */
  uLights: { value: number };
}

export function driveUniforms(): DriveUniforms {
  return { uSpin: { value: 0 }, uSteer: { value: 0 }, uBrake: { value: 0 }, uBlinkL: { value: 0 }, uBlinkR: { value: 0 }, uLights: { value: 0.35 } };
}

// The lamps' colours in the models (art/blender/car_kit.py), as the shader sees them (linear).
const VERTEX = /* glsl */ `
attribute vec4 wheel;
uniform float uSpin;
uniform float uSteer;
vec3 carTurn(vec3 v) {
  if (wheel.w < 0.5) return v;
  float c = cos(uSpin), s = sin(uSpin);
  v = vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
  if (wheel.w > 1.5) {
    float c2 = cos(uSteer), s2 = sin(uSteer);
    v = vec3(v.x * c2 + v.z * s2, v.y, -v.x * s2 + v.z * c2);
  }
  return v;
}
`;

const FRAGMENT = /* glsl */ `
uniform float uBrake;
uniform float uBlinkL;
uniform float uBlinkR;
uniform float uLights;
`;

/** The lamps' glow, by their colour: tail lights (#d81c34), indicators (#ffa630), headlights (#fff6d8). */
export const LAMPS = /* glsl */ `
vec3 carGlow = vec3(0.0);
#ifdef USE_COLOR
if (abs(vColor.r - 0.687) < 0.02 && vColor.g < 0.02 && abs(vColor.b - 0.034) < 0.012) carGlow = vec3(1.0, 0.1, 0.08) * (0.12 + 0.9 * uBrake);
else if (vColor.r > 0.97 && abs(vColor.g - 0.381) < 0.02 && vColor.b < 0.05) carGlow = vec3(1.0, 0.45, 0.02) * (vMudPos.x > 0.0 ? uBlinkL : uBlinkR);
else if (vColor.r > 0.97 && vColor.g > 0.9 && abs(vColor.b - 0.687) < 0.03) carGlow = vec3(1.0, 0.95, 0.8) * uLights;
#endif
`;

/** Rolls and steers the wheels; adds the glow and the sky's reflection (`carGlass`, `carPaint`, `mudMask` from mud.ts). */
export function patchDrive(shader: WebGLProgramParametersWithUniforms, uniforms: DriveUniforms): void {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VERTEX}`)
    .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = carTurn(objectNormal);')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nif (wheel.w > 0.5) transformed = carTurn(transformed - wheel.xyz) + wheel.xyz;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${FRAGMENT}`)
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += carGlow * (1.0 - mudMask * 0.8);')
    .replace(
      '#include <opaque_fragment>',
      `float carFres = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.0);
      outgoingLight += vec3(0.62, 0.78, 0.95) * (carGlass * (0.04 + 0.22 * carFres) + carPaint * 0.14 * carFres) * (1.0 - mudMask);
      #include <opaque_fragment>`,
    );
}
