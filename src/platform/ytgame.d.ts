// Type definitions for the YouTube Playables SDK (https://www.youtube.com/game_api/v1).
// Checked against SDK 1.20261019. Only src/platform/youtube.ts may use `ytgame`.

declare namespace ytgame {
  /** True when running inside YouTube (the game is in an iframe). */
  const IN_PLAYABLES_ENV: boolean;
  const SDK_VERSION: string;

  namespace game {
    /** Call when the loading screen is first visible. */
    function firstFrameReady(): void;
    /** Call when the player can actually play. */
    function gameReady(): void;
    /** Resolves to the saved string, or "" when nothing is saved. */
    function loadData(): Promise<string>;
    /** Replaces the cloud save. Rejects if the data is too large or invalid. */
    function saveData(data: string): Promise<void>;
  }

  namespace system {
    function isAudioEnabled(): boolean;
    /** Returns a function that removes the listener. */
    function onAudioEnabledChange(callback: (isAudioEnabled: boolean) => void): () => void;
    function onPause(callback: () => void): () => void;
    function onResume(callback: () => void): () => void;
    /** BCP-47 language tag, e.g. "en" or "pt-BR". */
    function getLanguage(): Promise<string>;
  }

  namespace ads {
    function requestInterstitialAd(): Promise<void>;
    /** Resolves true when the player earned the reward. */
    function requestRewardedAd(rewardId: string): Promise<boolean>;
  }

  namespace health {
    function logError(): void;
    function logWarning(): void;
  }
}

interface Window {
  /** Undefined if the SDK script failed to load (e.g. offline in dev). */
  ytgame?: typeof ytgame;
}
