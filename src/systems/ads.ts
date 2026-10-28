// YouTube ads (GDD "Monetization", Tech Guide "Ads"): rewarded ads only when
// the player taps a clearly labelled button, never needed to progress;
// interstitials only between two screens, and rarely.
import { ADS } from '../core/config';

export interface AdBackend {
  requestRewardedAd(rewardId: string): Promise<boolean>;
  requestInterstitialAd(): Promise<void>;
}

/**
 * May an interstitial play now? Never in a new player's first minutes, never
 * as a session starts (YouTube has just shown its own ad), and at most one
 * every few minutes counting any ad, rewarded ones included.
 */
export function interstitialAllowed(nowMs: number, lastAdMs: number, sessionStartMs: number, playSeconds: number): boolean {
  const rules = ADS.interstitial;
  if (playSeconds < rules.newPlayerSeconds) return false;
  if (nowMs - sessionStartMs < rules.sessionGraceSeconds * 1000) return false;
  return nowMs - lastAdMs >= rules.minGapSeconds * 1000;
}

/** One ad at a time, and the bookkeeping for the interstitial limits. */
export class Ads {
  private lastAdMs = Number.NEGATIVE_INFINITY;
  private readonly sessionStartMs: number;
  private showing = false;

  constructor(
    private readonly backend: AdBackend,
    private readonly playSeconds: () => number,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.sessionStartMs = now();
  }

  /** An ad is playing (buttons stay disabled meanwhile). */
  get busy(): boolean {
    return this.showing;
  }

  /** Plays a rewarded ad; true only if the player watched it to the end. */
  async rewarded(rewardId: string): Promise<boolean> {
    if (this.showing) return false;
    this.showing = true;
    try {
      return await this.backend.requestRewardedAd(rewardId);
    } finally {
      this.showing = false;
      this.lastAdMs = this.now();
    }
  }

  /** Call when moving between two screens; plays an interstitial only if the rules allow. */
  async betweenScreens(): Promise<void> {
    if (this.showing || !interstitialAllowed(this.now(), this.lastAdMs, this.sessionStartMs, this.playSeconds())) return;
    this.showing = true;
    try {
      await this.backend.requestInterstitialAd();
    } finally {
      this.showing = false;
      this.lastAdMs = this.now();
    }
  }
}
