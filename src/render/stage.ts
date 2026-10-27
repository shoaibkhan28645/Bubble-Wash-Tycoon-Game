import {
  DirectionalLight,
  Fog,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';

const MAX_PIXEL_RATIO = 2;
const FOV_DEG = 35;
const BACKGROUND = 0xbfe9ff;

export interface Stage {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  /** Size of the drawing area in CSS pixels (for placing HTML labels). */
  readonly size: { width: number; height: number };
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
  scene.add(new HemisphereLight(0xfff8ee, 0x9fbf8a, 2.1));
  const sun = new DirectionalLight(0xfff2dd, 1.7);
  sun.position.set(-4, 8, 5);
  scene.add(sun);

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
    onResize: (callback) => void listeners.push(callback),
    render() {
      renderer.render(scene, camera);
    },
  };
}
