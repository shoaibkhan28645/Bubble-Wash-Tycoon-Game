// The only file that talks to YouTube (`ytgame`). Everything else uses these
// typed functions, which never throw. Outside YouTube a dev fallback is used.
import { createDevPlatform } from './devPlatform';
import type { DevControls, PlatformBackend } from './types';

const LOAD_ATTEMPTS = 3;
const LOAD_RETRY_MS = 500;
/** Our own save target; YouTube's hard limit is 3 MiB. */
const SAVE_WARN_BYTES = 50 * 1024;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function youtubeBackend(yt: typeof ytgame): PlatformBackend {
  return {
    firstFrameReady: () => yt.game.firstFrameReady(),
    gameReady: () => yt.game.gameReady(),
    loadData: () => yt.game.loadData(),
    saveData: (data) => yt.game.saveData(data),
    isAudioEnabled: () => yt.system.isAudioEnabled(),
    onAudioEnabledChange: (callback) => void yt.system.onAudioEnabledChange(callback),
    onPause: (callback) => void yt.system.onPause(callback),
    onResume: (callback) => void yt.system.onResume(callback),
    getLanguage: () => yt.system.getLanguage(),
    requestRewardedAd: (rewardId) => yt.ads.requestRewardedAd(rewardId),
    requestInterstitialAd: () => yt.ads.requestInterstitialAd(),
    logError: () => yt.health.logError(),
    logWarning: () => yt.health.logWarning(),
  };
}

const sdk = window.ytgame?.IN_PLAYABLES_ENV ? window.ytgame : undefined;
const dev = sdk ? null : createDevPlatform();
const backend: PlatformBackend = sdk ? youtubeBackend(sdk) : dev!.backend;

/** True inside YouTube (including the Playables Test Suite). */
export const inYouTube = sdk !== undefined;
/** Fake pause/mute controls for the debug overlay; null inside YouTube. */
export const devControls: DevControls | null = dev?.controls ?? null;

export function logError(error: unknown): void {
  console.error(error);
  try {
    backend.logError();
  } catch {
    // Reporting must never cause another error.
  }
}

export function logWarning(message: unknown): void {
  console.warn(message);
  try {
    backend.logWarning();
  } catch {
    // As above.
  }
}

/** Report uncaught errors to YouTube's health dashboard. */
export function installErrorReporting(): void {
  window.addEventListener('error', (event) => logError(event.error ?? event.message));
  window.addEventListener('unhandledrejection', (event) => logError(event.reason));
}

export function firstFrameReady(): void {
  try {
    backend.firstFrameReady();
  } catch (error) {
    logError(error);
  }
}

export function gameReady(): void {
  try {
    backend.gameReady();
  } catch (error) {
    logError(error);
  }
}

/**
 * The saved string ("" for a new player), or null if loading kept failing.
 * On null the game must not save this session, or it would overwrite real progress.
 */
export async function loadData(): Promise<string | null> {
  for (let attempt = 1; attempt <= LOAD_ATTEMPTS; attempt++) {
    try {
      return await backend.loadData();
    } catch (error) {
      logWarning(error);
      if (attempt < LOAD_ATTEMPTS) await wait(LOAD_RETRY_MS * attempt);
    }
  }
  logError(new Error('loadData failed; saving disabled this session'));
  return null;
}

/** Resolves true when the save was accepted. */
export async function saveData(data: string): Promise<boolean> {
  if (data.length > SAVE_WARN_BYTES) logWarning(`Save is ${data.length} bytes`);
  try {
    await backend.saveData(data);
    return true;
  } catch (error) {
    logError(error);
    return false;
  }
}

export function isAudioEnabled(): boolean {
  try {
    return backend.isAudioEnabled();
  } catch (error) {
    logError(error);
    return true;
  }
}

export function onAudioEnabledChange(callback: (enabled: boolean) => void): void {
  backend.onAudioEnabledChange(callback);
}

export function onPause(callback: () => void): void {
  backend.onPause(callback);
}

export function onResume(callback: () => void): void {
  backend.onResume(callback);
}

/** BCP-47 tag from YouTube; "en" if unavailable. */
export async function getLanguage(): Promise<string> {
  try {
    return (await backend.getLanguage()) || 'en';
  } catch (error) {
    logWarning(error);
    return 'en';
  }
}

/** Only call from a clearly labelled button the player tapped. Resolves true if earned. */
export async function requestRewardedAd(rewardId: string): Promise<boolean> {
  try {
    return await backend.requestRewardedAd(rewardId);
  } catch (error) {
    logWarning(error);
    return false;
  }
}

/** Only call between two different screens, never during play. */
export async function requestInterstitialAd(): Promise<void> {
  try {
    await backend.requestInterstitialAd();
  } catch (error) {
    logWarning(error);
  }
}
