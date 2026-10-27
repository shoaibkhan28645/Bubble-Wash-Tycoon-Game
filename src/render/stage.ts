import {
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { fitDistance } from './cameraFit';

const MAX_PIXEL_RATIO = 2;
const FOV_DEG = 40;
const FIT_MARGIN = 1.1;
const BACKGROUND = 0xbfe9ff;
/** Fixed 3/4 view: looking down at 45 degrees from the front. */
const VIEW_DIR = new Vector3(0, 1, 1).normalize();

export interface Stage {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  /** Radius of the area (around the origin) that must always stay in view. */
  setFocusRadius(radius: number): void;
  render(): void;
}

export function createStage(container: HTMLElement): Stage {
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(BACKGROUND);
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  scene.add(new HemisphereLight(0xffffff, 0xc9b8a6, 2));
  const sun = new DirectionalLight(0xffffff, 1.4);
  sun.position.set(3, 6, 4);
  scene.add(sun);

  const camera = new PerspectiveCamera(FOV_DEG, 1, 0.1, 100);
  let focusRadius = 1;

  const fit = (): void => {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    renderer.setSize(width, height, false);

    camera.aspect = width / height;
    const distance = fitDistance(focusRadius, FOV_DEG, camera.aspect, FIT_MARGIN);
    camera.position.copy(VIEW_DIR).multiplyScalar(distance);
    camera.near = Math.max(0.01, distance - focusRadius * 2);
    camera.far = distance + focusRadius * 2;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
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
    setFocusRadius(radius) {
      focusRadius = radius;
      fit();
    },
    render() {
      renderer.render(scene, camera);
    },
  };
}
