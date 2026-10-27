/** The raw platform calls; youtube.ts wraps them with safe, typed functions. */
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
  requestRewardedAd(rewardId: string): Promise<boolean>;
  requestInterstitialAd(): Promise<void>;
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
