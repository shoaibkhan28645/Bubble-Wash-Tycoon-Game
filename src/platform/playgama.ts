// The Playgama build (`npm run zip:playgama`, Vite's `playgama` mode): the game
// talks to the Playgama Bridge SDK (wiki.playgama.com/playgama/bridge-sdk), which
// runs it on Playgama, its partner sites and YouTube Playables. Bridge's script is
// the first one in the page (the build puts it there), so `window.bridge` is
// there before any game code; it must finish initialising before the game loads
// anything (Required step 2), which boot() waits for.
// PLAYGAMA is a constant Vite fixes at build time, so no other build has any of this.
import type {} from '@playgama/bridge/global';
import type { PlatformBackend } from './types';

export const PLAYGAMA = import.meta.env.MODE === 'playgama';

/** The one storage key: the whole save, as the JSON string the game already writes. */
export const SAVE_KEY = 'main-street-mogul-save';

/** An interstitial Bridge doesn't start within this long was skipped (too soon after the last: Bridge decides). */
const INTERSTITIAL_START_MS = 1500;
/** After a reward's earned, the ad should close; if it never says so, the game carries on anyway. */
const REWARDED_CLOSE_MS = 30_000;
/** Bridge that never finishes starting: the game starts without it (and won't save, rather than lose a save). */
const INIT_TIMEOUT_MS = 10_000;

type Bridge = NonNullable<typeof window.bridge>;

/** Starts Bridge; true once it's ready. Never throws. */
export async function initBridge(b: Bridge): Promise<boolean> {
  try {
    await Promise.race([
      b.initialize(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Bridge did not initialise in time')), INIT_TIMEOUT_MS)),
    ]);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

export function bridgeBackend(b: Bridge): PlatformBackend {
  const { EVENT_NAME } = b;
  return {
    // Bridge's own loading screen is off (playgama-bridge-config.json); the game shows its own.
    firstFrameReady: () => {},
    gameReady: () => void b.platform.sendMessage('game_ready'),
    loadData: async () => {
      // The save is a JSON string: kept as it is (Bridge would otherwise parse it).
      const [value] = (await b.storage.get([SAVE_KEY], false)) as unknown[];
      return typeof value === 'string' ? value : '';
    },
    saveData: (data) => b.storage.set([SAVE_KEY], [data]),
    isAudioEnabled: () => b.platform.isAudioEnabled,
    onAudioEnabledChange: (callback) => b.platform.on(EVENT_NAME.AUDIO_STATE_CHANGED, (enabled: boolean) => callback(enabled)),
    // Bridge pauses the game for a hidden tab, an ad, or the platform's own reasons.
    onPause: (callback) => {
      b.platform.on(EVENT_NAME.PAUSE_STATE_CHANGED, (paused: boolean) => paused && callback());
      if (b.platform.isPaused) callback();
    },
    onResume: (callback) => b.platform.on(EVENT_NAME.PAUSE_STATE_CHANGED, (paused: boolean) => !paused && callback()),
    getLanguage: async () => b.platform.language,
    rewardedSupported: () => b.advertisement.isRewardedSupported,
    // A reward only once the ad says it's earned ('rewarded'), never just for closing it.
    requestRewardedAd: (placement) =>
      new Promise<boolean>((resolve) => {
        const ads = b.advertisement;
        if (!ads.isRewardedSupported) {
          resolve(false);
          return;
        }
        let earned = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const finish = (): void => {
          ads.off(EVENT_NAME.REWARDED_STATE_CHANGED, onState);
          clearTimeout(timer);
          resolve(earned);
        };
        const onState = (state: string): void => {
          if (state === 'rewarded') {
            earned = true;
            timer = setTimeout(finish, REWARDED_CLOSE_MS);
          } else if (state === 'closed' || state === 'failed') finish();
        };
        ads.on(EVENT_NAME.REWARDED_STATE_CHANGED, onState);
        ads.showRewarded(placement);
      }),
    // At every natural pause; Bridge decides whether one is shown (the first one's delay, the gap between them).
    requestInterstitialAd: () =>
      new Promise<void>((resolve) => {
        const ads = b.advertisement;
        if (!ads.isInterstitialSupported) {
          resolve();
          return;
        }
        let started = false;
        const finish = (): void => {
          ads.off(EVENT_NAME.INTERSTITIAL_STATE_CHANGED, onState);
          resolve();
        };
        const onState = (state: string): void => {
          if (state === 'loading' || state === 'opened') started = true;
          else if (state === 'closed' || state === 'failed') finish();
        };
        ads.on(EVENT_NAME.INTERSTITIAL_STATE_CHANGED, onState);
        ads.showInterstitial();
        setTimeout(() => !started && finish(), INTERSTITIAL_START_MS);
      }),
    managesAdTiming: true,
    // Playgama asks for a mute button in the game (3.3.3); YouTube asks for none (it has its own).
    muteButton: () => b.platform.id !== b.PLATFORM_ID.YOUTUBE,
    // Bridge has no score or health reports the game uses.
    sendScore: async () => {},
    logError: () => {},
    logWarning: () => {},
  };
}
