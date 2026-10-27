import { Loop } from './loop';
import { GameClock } from './clock';
import type { Lifecycle } from './lifecycle';
import type { SaveManager } from './save';
import type { SoundManager } from '../audio/sound';
import { createStage, type Stage } from '../render/stage';
import { createDemoCube } from '../render/models/demoCube';

export interface Game {
  readonly stage: Stage;
  readonly clock: GameClock;
  /** Draws one frame without starting the loop (behind the loading screen). */
  renderOnce(): void;
  start(): void;
  /** Extra per-frame work, e.g. the debug overlay. */
  addTicker(ticker: (dt: number) => void): void;
}

/** Builds the scene and the loop, and wires pause/resume to loop, audio, input and saving. */
export function createGame(
  root: HTMLElement,
  lifecycle: Lifecycle,
  saves: SaveManager,
  sound: SoundManager,
): Game {
  const stage = createStage(root);
  const clock = new GameClock();
  const tickers: ((dt: number) => void)[] = [];

  const cube = createDemoCube();
  stage.scene.add(cube.mesh);
  stage.setFocusRadius(cube.radius);

  const loop = new Loop((dt) => {
    clock.advance(dt);
    cube.mesh.rotation.y += dt * 0.9;
    cube.mesh.rotation.x += dt * 0.35;
    saves.update(dt);
    stage.render();
    for (const ticker of tickers) ticker(dt);
  });

  // Input: any tap or key unlocks audio; a tap pops (placeholder until gameplay).
  root.addEventListener('pointerdown', () => {
    if (lifecycle.paused) return;
    sound.unlock();
    sound.pop();
  });
  window.addEventListener('keydown', () => {
    if (!lifecycle.paused) sound.unlock();
  });

  lifecycle.onPause(() => {
    loop.stop();
    sound.setPaused(true);
    void saves.saveNow();
  });
  lifecycle.onResume(() => {
    sound.setPaused(false);
    loop.start();
  });

  return {
    stage,
    clock,
    renderOnce: () => stage.render(),
    start() {
      if (!lifecycle.paused) loop.start();
    },
    addTicker: (ticker) => void tickers.push(ticker),
  };
}
