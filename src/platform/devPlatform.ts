import { Emitter } from '../core/events';
import { TESTER, TESTER_SAVE_KEY } from './tester';
import type { DevControls, PlatformBackend } from './types';

// Kept from the game's first name so existing dev saves still load; the tester build keeps its own.
const SAVE_KEY = TESTER ? TESTER_SAVE_KEY : 'bubble-wash-dev-save';
/** Saves kept in the browser: on the dev server and in the tester build. */
const KEEP = import.meta.env.DEV || TESTER;
const FAKE_AD_MS = 1500;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Stand-in for the SDK outside YouTube. In `npm run dev` and the tester
 * build saves go to localStorage so progress survives a reload; in the build
 * for YouTube that code is stripped and saves only live in memory.
 */
export function createDevPlatform(): { backend: PlatformBackend; controls: DevControls } {
  let memorySave = '';
  let audioEnabled = true;
  let paused = false;
  const audioChange = new Emitter<boolean>();
  const pauseEvents = new Emitter();
  const resumeEvents = new Emitter();

  const readSave = (): string => {
    if (KEEP) {
      try {
        return window.localStorage.getItem(SAVE_KEY) ?? '';
      } catch {
        return memorySave;
      }
    }
    return memorySave;
  };

  const writeSave = (data: string): void => {
    memorySave = data;
    if (KEEP) {
      try {
        window.localStorage.setItem(SAVE_KEY, data);
      } catch {
        // Storage blocked: the in-memory copy still works for this session.
      }
    }
  };

  /** A visible stand-in for YouTube's ad player; the game is paused while it shows, as on YouTube. */
  const fakeAd = async (label: string): Promise<void> => {
    const screen = document.createElement('div');
    screen.className = 'dev-ad';
    screen.textContent = `📺 ${label} (dev stand-in)`;
    document.body.appendChild(screen);
    const wasPaused = paused;
    if (!wasPaused) {
      paused = true;
      pauseEvents.emit();
    }
    await wait(FAKE_AD_MS);
    screen.remove();
    if (!wasPaused) {
      paused = false;
      resumeEvents.emit();
    }
  };

  const backend: PlatformBackend = {
    firstFrameReady: () => {},
    gameReady: () => {},
    loadData: async () => readSave(),
    saveData: async (data) => writeSave(data),
    isAudioEnabled: () => audioEnabled,
    onAudioEnabledChange: (callback) => void audioChange.on(callback),
    onPause: (callback) => void pauseEvents.on(callback),
    onResume: (callback) => void resumeEvents.on(callback),
    getLanguage: async () => 'en',
    // Stats events stay in the page, for the tests and the playthrough bot to read (`window.__events`).
    trackEvent: (name, data) => {
      const log = ((window as unknown as { __events?: { name: string; data: Record<string, string | number> }[] }).__events ??= []);
      log.push({ name, data });
    },
    rewardedSupported: () => true,
    muteButton: () => false,
    requestRewardedAd: async () => {
      await fakeAd('Rewarded ad');
      return true;
    },
    requestInterstitialAd: () => fakeAd('Interstitial ad'),
    sendScore: async () => {},
    logError: () => {},
    logWarning: () => {},
  };

  const controls: DevControls = {
    pause() {
      if (paused) return;
      paused = true;
      pauseEvents.emit();
    },
    resume() {
      if (!paused) return;
      paused = false;
      resumeEvents.emit();
    },
    isPaused: () => paused,
    setAudioEnabled(enabled) {
      if (enabled === audioEnabled) return;
      audioEnabled = enabled;
      audioChange.emit(enabled);
    },
    isAudioEnabled: () => audioEnabled,
    clearSave() {
      memorySave = '';
      if (KEEP) {
        try {
          window.localStorage.removeItem(SAVE_KEY);
        } catch {
          // Nothing to clear.
        }
      }
    },
  };

  return { backend, controls };
}
