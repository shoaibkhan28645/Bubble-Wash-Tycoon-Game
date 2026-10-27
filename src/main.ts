import './ui/base.css';
import { Loop } from './core/loop';
import { createStage } from './render/stage';
import { createDemoCube } from './render/models/demoCube';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app element');

const stage = createStage(root);
const cube = createDemoCube();
stage.scene.add(cube.mesh);
stage.setFocusRadius(cube.radius);

let updateDebug: ((dt: number) => void) | null = null;
if (new URLSearchParams(window.location.search).has('debug')) {
  void import('./ui/debugOverlay').then(({ createDebugOverlay }) => {
    updateDebug = createDebugOverlay(root, stage.renderer);
  });
}

const loop = new Loop((dt) => {
  cube.mesh.rotation.y += dt * 0.9;
  cube.mesh.rotation.x += dt * 0.35;
  stage.render();
  updateDebug?.(dt);
});
loop.start();
