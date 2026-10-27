import * as platform from '../platform/youtube';
import { SoundManager } from '../audio/sound';
import { getLoadingScreen } from '../ui/loadingScreen';
import { setLanguage } from '../ui/strings';
import { createGame } from './game';
import { Lifecycle } from './lifecycle';
import { parseSave } from './migrate';
import { SaveManager } from './save';

/** Boot sequence from the Tech Guide. gameReady() only once the game is playable. */
export async function boot(root: HTMLElement): Promise<void> {
  platform.installErrorReporting();
  const loading = getLoadingScreen();
  platform.firstFrameReady();
  loading.setProgress(0.1);

  // Load must finish before any save.
  const raw = await platform.loadData();
  const { state, status } = parseSave(raw ?? '');
  if (status === 'corrupt') platform.logError(new Error('Save was unreadable; starting fresh'));
  if (status === 'failed') platform.logError(new Error('Save could not be migrated'));
  const canSave = raw !== null && status !== 'failed';
  const saves = new SaveManager(state, platform.saveData, canSave);
  loading.setProgress(0.4);

  const sound = new SoundManager();
  sound.setEnabled(platform.isAudioEnabled());
  platform.onAudioEnabledChange((enabled) => sound.setEnabled(enabled));

  const lifecycle = new Lifecycle();
  platform.onPause(() => lifecycle.pause());
  platform.onResume(() => lifecycle.resume());

  setLanguage(await platform.getLanguage());
  loading.setProgress(0.6);

  const game = createGame(root, state, lifecycle, saves, sound);
  // Offline earnings are applied here from Milestone 4.
  game.renderOnce();
  loading.setProgress(1);

  if (new URLSearchParams(window.location.search).has('debug')) {
    const { createDebugOverlay } = await import('../ui/debugOverlay');
    game.addTicker(createDebugOverlay({ root, game, state, saves, lifecycle, dev: platform.devControls }));
  }

  // Dev-only handle for automated play tests; stripped from production builds.
  if (import.meta.env.DEV) Object.assign(window, { bubbleWash: { state, game } });

  await loading.hide();
  game.start();
  platform.gameReady();
}
