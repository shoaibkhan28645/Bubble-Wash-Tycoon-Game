import type { WebGLRenderer } from 'three';

const REFRESH_SECONDS = 0.5;

/** `?debug` overlay: FPS, draw calls and triangles. Loaded only when the flag is set. */
export function createDebugOverlay(parent: HTMLElement, renderer: WebGLRenderer): (dt: number) => void {
  const panel = document.createElement('div');
  panel.className = 'debug-overlay';
  parent.appendChild(panel);

  let frames = 0;
  let elapsed = 0;

  return (dt) => {
    frames++;
    elapsed += dt;
    if (elapsed < REFRESH_SECONDS) return;
    const fps = Math.round(frames / elapsed);
    const { calls, triangles } = renderer.info.render;
    panel.textContent = `FPS ${fps} · calls ${calls} · tris ${triangles}`;
    frames = 0;
    elapsed = 0;
  };
}
