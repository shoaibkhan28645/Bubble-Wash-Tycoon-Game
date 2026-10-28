import type { Game } from '../core/game';
import type { GameState } from '../core/gameState';
import type { Lifecycle } from '../core/lifecycle';
import type { SaveManager } from '../core/save';
import type { DevControls } from '../platform/types';

const REFRESH_SECONDS = 0.5;
const DEBUG_CASH = 1000;
const FAKE_PAUSE_MS = 3000;

interface DebugDeps {
  root: HTMLElement;
  game: Game;
  state: GameState;
  saves: SaveManager;
  lifecycle: Lifecycle;
  /** Fake YouTube pause/mute; null inside YouTube. */
  dev: DevControls | null;
}

/** `?debug` overlay: stats, +$1,000, and (outside YouTube) fake pause/mute. Off by default. */
export function createDebugOverlay({ root, game, state, saves, lifecycle, dev }: DebugDeps): (dt: number) => void {
  const panel = document.createElement('div');
  panel.className = 'debug-overlay';
  const stats = document.createElement('div');
  const gpu = document.createElement('div');
  gpu.className = 'debug-gpu';
  const buttons = document.createElement('div');
  buttons.className = 'debug-buttons';
  panel.append(stats, gpu, buttons);
  root.appendChild(panel);
  // Taps on the panel must not reach the game.
  panel.addEventListener('pointerdown', (event) => event.stopPropagation());

  const addButton = (label: string, onTap: (button: HTMLButtonElement) => void): void => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => onTap(button));
    buttons.appendChild(button);
  };

  addButton(`+$${DEBUG_CASH.toLocaleString('en')}`, () => {
    state.cash += DEBUG_CASH;
    void saves.saveNow();
    showStats();
  });

  const shadowLabel = () => `Shadows ${game.stage.shadows ? 'on' : 'off'}`;
  addButton(shadowLabel(), () => {
    game.stage.setShadows(!game.stage.shadows);
    showStats();
  });
  const shadowButton = buttons.lastElementChild as HTMLButtonElement;

  if (dev) {
    addButton('Pause 3s', () => {
      dev.pause();
      setTimeout(() => dev.resume(), FAKE_PAUSE_MS);
    });
    const muteLabel = () => (dev.isAudioEnabled() ? 'Mute' : 'Unmute');
    addButton(muteLabel(), (button) => {
      dev.setAudioEnabled(!dev.isAudioEnabled());
      button.textContent = muteLabel();
    });
    addButton('Reset save', () => {
      dev.clearSave();
      window.location.reload();
    });
  }

  let fps = 0;
  let frames = 0;
  let elapsed = 0;

  function showStats(): void {
    const { calls, triangles } = game.stage.renderer.info.render;
    const status = lifecycle.paused ? 'PAUSED · ' : '';
    stats.textContent = `${status}FPS ${fps} · calls ${calls} · tris ${triangles} · $${Math.floor(state.cash)}`;
    const lost = game.stage.contextLosses;
    gpu.textContent = `GPU ${game.stage.gpu} · res ${game.stage.pixelRatio.toFixed(2)}×${lost ? ` · crashed ${lost}×` : ''}`;
    // Shadows also switch off by themselves after a GPU crash.
    shadowButton.textContent = shadowLabel();
  }

  lifecycle.onPause(showStats);
  lifecycle.onResume(showStats);
  showStats();

  return (dt) => {
    frames++;
    elapsed += dt;
    if (elapsed < REFRESH_SECONDS) return;
    fps = Math.round(frames / elapsed);
    frames = 0;
    elapsed = 0;
    showStats();
  };
}
