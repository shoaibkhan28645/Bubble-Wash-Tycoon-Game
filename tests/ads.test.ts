import { describe, expect, it } from 'vitest';
import { ADS } from '../src/core/config';
import { Ads, interstitialAllowed } from '../src/systems/ads';

const MIN = 60_000;

describe('interstitial rules', () => {
  const rules = ADS.interstitial;
  it('never in a new player first minutes or as a session starts', () => {
    expect(interstitialAllowed(10 * MIN, -Infinity, 0, rules.newPlayerSeconds - 1)).toBe(false);
    expect(interstitialAllowed(10_000, -Infinity, 0, 9999)).toBe(false);
    expect(interstitialAllowed(10 * MIN, -Infinity, 0, 9999)).toBe(true);
  });

  it('at most one every few minutes, counting rewarded ads', () => {
    expect(interstitialAllowed(10 * MIN, 9 * MIN, 0, 9999)).toBe(false);
    expect(interstitialAllowed(10 * MIN, 10 * MIN - rules.minGapSeconds * 1000, 0, 9999)).toBe(true);
  });
});

describe('Ads', () => {
  function setup(rewardResult = true) {
    let now = 0;
    const calls: string[] = [];
    const ads = new Ads(
      {
        requestRewardedAd: async (id) => {
          calls.push(`rewarded:${id}`);
          return rewardResult;
        },
        requestInterstitialAd: async () => void calls.push('interstitial'),
      },
      () => 9999,
      () => now,
    );
    return { ads, calls, at: (ms: number) => (now = ms) };
  }

  it('passes the reward result through and plays one ad at a time', async () => {
    const { ads, calls } = setup();
    const first = ads.rewarded('speed');
    expect(ads.busy).toBe(true);
    expect(await ads.rewarded('convoy')).toBe(false);
    expect(await first).toBe(true);
    expect(calls).toEqual(['rewarded:speed']);
    expect((await setup(false).ads.rewarded('x'))).toBe(false);
  });

  it('skips the interstitial right after a rewarded ad', async () => {
    const { ads, calls, at } = setup();
    at(10 * MIN);
    await ads.rewarded('double');
    await ads.betweenScreens();
    expect(calls).toEqual(['rewarded:double']);
    at(20 * MIN);
    await ads.betweenScreens();
    expect(calls).toEqual(['rewarded:double', 'interstitial']);
  });
});
