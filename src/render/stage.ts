import {
  DirectionalLight,
  Fog,
  HemisphereLight,
  type Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { GRAPHICS } from './graphics';

const MAX_PIXEL_RATIO = 2;
const FOV_DEG = 35;
const BACKGROUND = 0xbfe9ff;
/** Where the sunlight comes from: high, from the left and a little in front, so shadows fall back and right. */
const SUN_DIRECTION = { x: -0.45, y: 1, z: 0.25 };
const SHADOW_MAP_SIZE = 1024;

/** Marks a model as casting (and receiving) real sun shadows. Returns it, for chaining. */
export function withShadows<T extends Object3D>(object: T, cast = true, receive = true): T {
  object.traverse((node) => {
    if (node.userData.noShadow) return;
    node.castShadow = cast;
    node.receiveShadow = receive;
  });
  return object;
}

export interface Stage {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  /** Size of the drawing area in CSS pixels (for placing HTML labels). */
  readonly size: { width: number; height: number };
  /** The phone's GPU, for the debug panel. */
  readonly gpu: string;
  /** How many times the browser dropped the 3D canvas (a GPU crash or reset). */
  readonly contextLosses: number;
  readonly shadows: boolean;
  /** Turns real shadows on or off (they're turned off for good after a GPU crash). */
  setShadows(on: boolean): void;
  /** Points the sun's shadow camera at an area (the lot), so shadows stay sharp there. */
  shadowArea(rect: { minX: number; maxX: number; minZ: number; maxZ: number }): void;
  /** Called after every resize, once the camera's aspect is updated. */
  onResize(callback: () => void): void;
  render(): void;
}

export function createStage(container: HTMLElement): Stage {
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(BACKGROUND);
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  scene.fog = new Fog(BACKGROUND, 70, 160);
  renderer.shadowMap.type = PCFShadowMap;
  scene.add(new HemisphereLight(0xf4f8ff, 0x9fbf8a, 1.35));
  const sun = new DirectionalLight(0xffeccc, 2.7);
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 2;
  scene.add(sun, sun.target);
  const setShadows = (on: boolean): void => {
    renderer.shadowMap.enabled = on;
    sun.castShadow = on;
  };
  setShadows(GRAPHICS.shadows);

  // If the GPU crashes or resets, three.js waits for the canvas to come back;
  // when it does, carry on without shadows, the heaviest thing we draw.
  const canvas = renderer.domElement;
  let contextLosses = 0;
  let contextLost = false;
  canvas.addEventListener('webglcontextlost', () => {
    contextLosses++;
    contextLost = true;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    setShadows(false);
  });
  const gl = renderer.getContext();
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? 'unknown');

  const camera = new PerspectiveCamera(FOV_DEG, 1, 0.5, 200);
  const size = { width: 1, height: 1 };
  const listeners: (() => void)[] = [];

  const fit = (): void => {
    size.width = Math.max(1, container.clientWidth);
    size.height = Math.max(1, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    renderer.setSize(size.width, size.height, false);
    camera.aspect = size.width / size.height;
    camera.updateProjectionMatrix();
    for (const listener of listeners) listener();
  };

  // ResizeObserver catches layout changes; window resize also catches
  // pixel-ratio changes (zoom, moving between screens).
  new ResizeObserver(fit).observe(container);
  window.addEventListener('resize', fit);
  fit();

  return {
    renderer,
    scene,
    camera,
    size,
    gpu,
    get contextLosses() {
      return contextLosses;
    },
    get shadows() {
      return renderer.shadowMap.enabled;
    },
    setShadows,
    shadowArea(rect) {
      const cx = (rect.minX + rect.maxX) / 2;
      const cz = (rect.minZ + rect.maxZ) / 2;
      const half = Math.hypot(rect.maxX - rect.minX, rect.maxZ - rect.minZ) / 2 + 2;
      const len = Math.hypot(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z);
      sun.target.position.set(cx, 0, cz);
      sun.position.set(cx + (SUN_DIRECTION.x / len) * 40, (SUN_DIRECTION.y / len) * 40, cz + (SUN_DIRECTION.z / len) * 40);
      const cam = sun.shadow.camera;
      cam.left = cam.bottom = -half;
      cam.right = cam.top = half;
      cam.near = 1;
      cam.far = 90;
      cam.updateProjectionMatrix();
    },
    onResize: (callback) => void listeners.push(callback),
    render() {
      if (!contextLost) renderer.render(scene, camera);
    },
  };
}
