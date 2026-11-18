// The hero seen through whatever stands in front of them (a building, a wall, a plane): a glowing aqua
// outline, see-through, drawn only where they're hidden, so the player always knows where they are.
//
// How: a second copy of the hero's body, on the same skeleton, drawn just before the hero and only where
// something is already nearer the camera (depth test "greater"). The hero then draws over it wherever they're
// in plain sight, so the outline is left only where they're hidden; and since the hero isn't drawn yet, their
// own arms and legs never show through their body. The stencil lets each pixel take the outline once, so
// limbs crossing the body don't double up. It's pulled a little towards the camera so the ground the hero's
// feet stand in (a pad, a kerb, a carpet) doesn't count as being in front.
import { AddEquation, Color, CustomBlending, GreaterDepth, MeshLambertMaterial, NotEqualStencilFunc, OneMinusSrcAlphaFactor, ReplaceStencilOp, SrcAlphaFactor } from 'three';

/** Drawn after everything else that's solid (nothing else is drawn later than 3), the outline first. */
export const OUTLINE_ORDER = 20;
/** The hero, what they hold and what anyone carries: drawn after the outline, so it never shows over them. */
export const OVER_OUTLINE_ORDER = 21;

/** How much nearer the camera the outline is reckoned to be (metres): more than a pad or a kerb is high. */
const PULL = 0.25;

export const seeThroughMaterial = new MeshLambertMaterial({
  color: new Color('#12b5c2'),
  emissive: new Color('#0a6e78'),
  opacity: 0.82,
  // (Not "transparent", which would draw it after the hero: blended all the same.)
  transparent: false,
  blending: CustomBlending,
  blendEquation: AddEquation,
  blendSrc: SrcAlphaFactor,
  blendDst: OneMinusSrcAlphaFactor,
  depthFunc: GreaterDepth,
  depthWrite: false,
  fog: false,
  stencilWrite: true,
  stencilRef: 1,
  stencilFunc: NotEqualStencilFunc,
  stencilZPass: ReplaceStencilOp,
});
seeThroughMaterial.name = 'see-through';
seeThroughMaterial.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader.replace(
    '#include <project_vertex>',
    `#include <project_vertex>
    mvPosition.xyz *= max(0.0, 1.0 - ${PULL.toFixed(2)} / length(mvPosition.xyz));
    gl_Position = projectionMatrix * mvPosition;`,
  );
  // A deep teal that stands out on light roofs and dark ones alike, lighter and more solid towards the edges.
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <dithering_fragment>',
    `float rim = 1.0 - abs(normal.z);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.75, 0.97, 1.0), rim * 0.4);
    gl_FragColor.a = opacity * (0.7 + 0.3 * rim);
    #include <dithering_fragment>`,
  );
};
