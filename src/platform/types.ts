/** The raw platform calls (YouTube's, Playgama Bridge's, or the stand-in's); youtube.ts wraps them with safe, typed functions. */
export interface PlatformBackend {
  firstFrameReady(): void;
  gameReady(): void;
  loadData(): Promise<string>;
  saveData(data: string): Promise<void>;
  isAudioEnabled(): boolean;
  onAudioEnabledChange(callback: (enabled: boolean) => void): void;
  onPause(callback: () => void): void;
  onResume(callback: () => void): void;
  getLanguage(): Promise<string>;
  /** Rewarded ads can be shown here (else the game hides every "watch an ad" button). */
  rewardedSupported(): boolean;
  requestRewardedAd(rewardId: string): Promise<boolean>;
  requestInterstitialAd(): Promise<void>;
  /** The platform decides when an interstitial is actually shown (Bridge): the game asks at every natural pause. */
  managesAdTiming?: boolean;
  /** The game shows its own mute button (Playgama asks for one; YouTube asks for none). */
  muteButton(): boolean;
  /** A whole number, at most Number.MAX_SAFE_INTEGER; YouTube shows the highest sent. */
  sendScore(value: number): Promise<void>;
  logError(): void;
  logWarning(): void;
}

/** Buttons for the ?debug overlay to fake what YouTube does. Null inside YouTube. */
export interface DevControls {
  pause(): void;
  resume(): void;
  isPaused(): boolean;
  setAudioEnabled(enabled: boolean): void;
  isAudioEnabled(): boolean;
  clearSave(): void;
}
