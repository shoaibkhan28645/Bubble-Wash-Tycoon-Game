import * as platform from '../platform/youtube';
import { SoundManager } from '../audio/sound';
import { getLoadingScreen } from '../ui/loadingScreen';
import { setLanguage } from '../ui/strings';
import { loadAssets, swapTownModels } from '../render/assets';
import { createStage } from '../render/stage';
import { createGame, preloadGame, type Game } from './game';
import { Lifecycle } from './lifecycle';
import { parseSave } from './migrate';
import { SaveManager } from './save';
import { TUNING, setTown, town } from './config';
import { START_TOWN_ID, loadTown, townIds } from './towns';
import type { GameState } from './gameState';
import { backgroundEarner, empireOfflineEarnings, switchTown } from './empire';

/** Boot sequence from the Tech Guide. gameReady() only once the game is playable. */
export async function boot(root: HTMLElement): Promise<void> {
  /** Milliseconds from page load to playable (shown in the debug panel; budget: under 5 s). */
  let readyMs = 0;
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
  // A town this build doesn't have (a save from a newer version): keep its progress, play the first town.
  if (!townIds().includes(state.currentTown)) switchTown(state, START_TOWN_ID);
  setTown(await loadTown(state.currentTown));
  // A later town's own code downloads alongside its models and sounds.
  preloadGame(town().kind);
  loading.setProgress(0.5);
  // Models and sounds load side by side; the bar shows the slower of the two.
  let models = 0;
  let audio = 0;
  const progress = () => loading.setProgress(0.5 + Math.min(models, audio) * 0.4);
  await Promise.all([
    loadAssets((fraction) => {
      models = fraction;
      progress();
    }, town().models),
    sound.load((fraction) => {
      audio = fraction;
      progress();
    }),
  ]);

  // One renderer for the whole session; each town fills and empties its scene.
  const stage = createStage(root);
  const debug = new URLSearchParams(window.location.search).has('debug');
  let debugTicker: ((dt: number) => void) | null = null;
  let game: Game;
  /** Builds the town being played and draws its first frame (behind the loading screen). */
  const openTown = async (): Promise<void> => {
    game = await createGame(root, stage, state, lifecycle, saves, sound, travel);
    // Towns the hero isn't in keep earning while he plays.
    game.addTicker(backgroundEarner(state));
    if (debugTicker) game.addTicker(debugTicker);
    // Dev-only handle for automated play tests; stripped from production builds.
    if (import.meta.env.DEV) Object.assign(window, { mogul: { state, game, sound, travel } });
    try {
      game.renderOnce();
    } catch (error) {
      // A GPU crash during the first draw must not leave the loading screen up.
      platform.logError(error);
    }
  };

  /** Takes the hero to another town: saves, takes this town down, loads the next one's data and models, opens it. */
  const travel = async (id: string): Promise<void> => {
    await saves.saveNow();
    loading.show();
    const from = town();
    game.dispose();
    switchTown(state, id);
    const to = await loadTown(id);
    preloadGame(to.kind);
    loading.setProgress(0.3);
    await swapTownModels(from.models, to.models, (fraction) => loading.setProgress(0.3 + fraction * 0.6));
    setTown(to);
    await openTown();
    loading.setProgress(1);
    await saves.saveNow();
    await loading.hide();
    game.start();
  };

  // When the game was last saved: taken now, before the town opens (opening it can save: a story beat, a goal).
  const lastSaved = state.savedAt;
  await openTown();
  // Offline earnings since the last save (Tech Guide boot sequence).
  const offline = applyOffline(state, lastSaved);
  loading.setProgress(1);

  if (debug) {
    const { createDebugOverlay } = await import('../ui/debugOverlay');
    debugTicker = createDebugOverlay({ root, game: () => game, state, saves, lifecycle, dev: platform.devControls, readyMs: () => readyMs, travel });
    game!.addTicker(debugTicker);
  }

  await loading.hide();
  game!.start();
  platform.gameReady();
  readyMs = performance.now();
  // The music isn't needed to play: make it now, after the start.
  setTimeout(() => sound.prepareMusic(), 300);
  if (offline.cash > 0) game!.welcomeBack(offline);

  // A long pause inside YouTube counts as time away too.
  let pausedAt = 0;
  lifecycle.onPause(() => (pausedAt = Date.now()));
  lifecycle.onResume(() => {
    if (Date.now() - pausedAt < TUNING.offline.resumeAwaySeconds * 1000) return;
    const away = applyOffline(state, pausedAt);
    if (away.cash > 0) game.welcomeBack(away);
  });
}

/** Adds every town's offline earnings straight away (so closing YouTube before tapping Collect loses nothing). */
function applyOffline(state: GameState, since: number): { cash: number; seconds: number } {
  const earned = empireOfflineEarnings(state, since, Date.now());
  state.cash += earned.cash;
  return earned;
}
