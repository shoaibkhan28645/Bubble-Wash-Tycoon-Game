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

const MAX_PIXEL_RATIO = 2;
const FOV_DEG = 35;
const BACKGROUND = 0xbfe9ff;
/** Where the sunlight comes from: high, from the left and a little in front, so shadows fall back and right. */
const SUN_DIRECTION = { x: -0.45, y: 1, z: 0.25 };
const SHADOW_MAP_SIZE = 2048;

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
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  scene.add(new HemisphereLight(0xf4f8ff, 0x9fbf8a, 1.35));
  const sun = new DirectionalLight(0xffeccc, 2.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 2;
  scene.add(sun, sun.target);

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
      renderer.render(scene, camera);
    },
  };
}
