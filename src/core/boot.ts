import * as platform from '../platform/youtube';
import { SoundManager } from '../audio/sound';
import { getLoadingScreen } from '../ui/loadingScreen';
import { setLanguage } from '../ui/strings';
import { loadAssets } from '../render/assets';
import { createGame } from './game';
import { Lifecycle } from './lifecycle';
import { parseSave } from './migrate';
import { SaveManager } from './save';
import { TUNING } from './config';
import type { GameState } from './gameState';
import { offlineEarnings } from '../systems/offline';
import { showWelcomeBack } from '../ui/welcomeBack';

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
  loading.setProgress(0.5);
  await loadAssets((fraction) => loading.setProgress(0.5 + fraction * 0.4));

  const game = createGame(root, state, lifecycle, saves, sound);
  // Offline earnings since the last save (Tech Guide boot sequence).
  const offline = applyOffline(state, state.savedAt);
  try {
    game.renderOnce();
  } catch (error) {
    // A GPU crash during the first draw must not leave the loading screen up.
    platform.logError(error);
  }
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
  if (offline.cash > 0) welcome(root, offline, saves);

  // A long pause inside YouTube counts as time away too.
  let pausedAt = 0;
  lifecycle.onPause(() => (pausedAt = Date.now()));
  lifecycle.onResume(() => {
    if (Date.now() - pausedAt < TUNING.offline.resumeAwaySeconds * 1000) return;
    const away = applyOffline(state, pausedAt);
    if (away.cash > 0) welcome(root, away, saves);
  });
}

/** Adds offline earnings straight away (so closing YouTube before tapping Collect loses nothing). */
function applyOffline(state: GameState, since: number): { cash: number; seconds: number } {
  const hasManager = state.unlocked.includes('manager');
  const capLevel = state.levels['manager.offlineHours'] ?? 0;
  const earned = offlineEarnings(state.autoRate, since, Date.now(), TUNING.offline, hasManager, capLevel);
  state.cash += earned.cash;
  return earned;
}

function welcome(root: HTMLElement, earned: { cash: number; seconds: number }, saves: SaveManager): void {
  void saves.saveNow();
  showWelcomeBack(root, earned.cash, earned.seconds, () => {});
}
