import { Emitter } from '../core/events';
import type { DevControls, PlatformBackend } from './types';

const SAVE_KEY = 'bubble-wash-dev-save';
const FAKE_AD_MS = 800;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Stand-in for the SDK outside YouTube. In `npm run dev` saves go to
 * localStorage so progress survives a reload; in production builds that
 * code is stripped and saves only live in memory.
 */
export function createDevPlatform(): { backend: PlatformBackend; controls: DevControls } {
  let memorySave = '';
  let audioEnabled = true;
  let paused = false;
  const audioChange = new Emitter<boolean>();
  const pauseEvents = new Emitter();
  const resumeEvents = new Emitter();

  const readSave = (): string => {
    if (import.meta.env.DEV) {
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
    if (import.meta.env.DEV) {
      try {
        window.localStorage.setItem(SAVE_KEY, data);
      } catch {
        // Storage blocked: the in-memory copy still works for this session.
      }
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
    requestRewardedAd: async () => {
      await wait(FAKE_AD_MS);
      return true;
    },
    requestInterstitialAd: () => wait(FAKE_AD_MS),
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
      if (import.meta.env.DEV) {
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
