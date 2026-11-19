import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVE_KEY, bridgeBackend } from '../src/platform/playgama';
import { Ads } from '../src/systems/ads';

/** A stand-in for Playgama Bridge: just what the game uses, with its events. */
function fakeBridge(opts: { platform?: string; rewarded?: boolean; interstitial?: boolean } = {}) {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const emitter = {
    on: (name: string, cb: (...args: unknown[]) => void) => void (listeners.get(name) ?? listeners.set(name, new Set()).get(name)!).add(cb),
    off: (name: string, cb: (...args: unknown[]) => void) => void listeners.get(name)?.delete(cb),
  };
  const emit = (name: string, ...args: unknown[]) => listeners.get(name)?.forEach((cb) => cb(...args));
  const store = new Map<string, unknown>();
  const calls: string[] = [];
  const bridge = {
    EVENT_NAME: { AUDIO_STATE_CHANGED: 'audio', PAUSE_STATE_CHANGED: 'pause', REWARDED_STATE_CHANGED: 'rewarded', INTERSTITIAL_STATE_CHANGED: 'interstitial' },
    PLATFORM_ID: { YOUTUBE: 'youtube' },
    platform: { ...emitter, id: opts.platform ?? 'playgama', language: 'en', isAudioEnabled: true, isPaused: false, sendMessage: async (m: string) => void calls.push(m) },
    storage: {
      get: async (keys: string[], tryParseJson: boolean) => {
        calls.push(`get:${String(tryParseJson)}`);
        return keys.map((k) => store.get(k) ?? null);
      },
      set: async (keys: string[], values: unknown[]) => keys.forEach((k, i) => store.set(k, values[i])),
    },
    advertisement: {
      ...emitter,
      isRewardedSupported: opts.rewarded ?? true,
      isInterstitialSupported: opts.interstitial ?? true,
      showRewarded: (placement: string) => void calls.push(`rewarded:${placement}`),
      showInterstitial: () => void calls.push('interstitial'),
    },
  };
  return { bridge, emit, store, calls };
}

type Bridge = Parameters<typeof bridgeBackend>[0];

describe('the Playgama Bridge backend', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('keeps the save as one string under one key, never parsed by Bridge', async () => {
    const { bridge, store, calls } = fakeBridge();
    const backend = bridgeBackend(bridge as unknown as Bridge);
    expect(await backend.loadData()).toBe('');
    const save = JSON.stringify({ version: 16, cash: 42 });
    await backend.saveData(save);
    expect(store.get(SAVE_KEY)).toBe(save);
    expect(await backend.loadData()).toBe(save);
    expect(calls).toContain('get:false');
  });

  it("tells the platform the game's ready (game_ready)", () => {
    const { bridge, calls } = fakeBridge();
    bridgeBackend(bridge as unknown as Bridge).gameReady();
    expect(calls).toContain('game_ready');
  });

  it("follows Bridge's pause and sound", () => {
    const { bridge, emit } = fakeBridge();
    const backend = bridgeBackend(bridge as unknown as Bridge);
    const seen: string[] = [];
    backend.onPause(() => seen.push('pause'));
    backend.onResume(() => seen.push('resume'));
    backend.onAudioEnabledChange((on) => seen.push(on ? 'sound on' : 'sound off'));
    emit('pause', true);
    emit('audio', false);
    emit('pause', false);
    emit('audio', true);
    expect(seen).toEqual(['pause', 'sound off', 'resume', 'sound on']);
  });

  it("rewards only when the ad says it's earned, not for closing it", async () => {
    const { bridge, emit } = fakeBridge();
    const backend = bridgeBackend(bridge as unknown as Bridge);
    const skipped = backend.requestRewardedAd('speed-boost');
    emit('rewarded', 'opened');
    emit('rewarded', 'closed');
    expect(await skipped).toBe(false);
    const watched = backend.requestRewardedAd('speed-boost');
    emit('rewarded', 'opened');
    emit('rewarded', 'rewarded');
    emit('rewarded', 'closed');
    expect(await watched).toBe(true);
    const failed = backend.requestRewardedAd('gems');
    emit('rewarded', 'failed');
    expect(await failed).toBe(false);
  });

  it('has no rewarded ads (and hides their buttons) where Bridge has none', async () => {
    const { bridge, calls } = fakeBridge({ rewarded: false });
    const backend = bridgeBackend(bridge as unknown as Bridge);
    expect(backend.rewardedSupported()).toBe(false);
    expect(await backend.requestRewardedAd('gems')).toBe(false);
    expect(calls.some((c) => c.startsWith('rewarded:'))).toBe(false);
  });

  it('waits for an interstitial that opens, and carries on when Bridge skips one', async () => {
    const { bridge, emit } = fakeBridge();
    const backend = bridgeBackend(bridge as unknown as Bridge);
    let done = false;
    const shown = backend.requestInterstitialAd().then(() => (done = true));
    emit('interstitial', 'opened');
    await vi.advanceTimersByTimeAsync(5000);
    expect(done).toBe(false);
    emit('interstitial', 'closed');
    await shown;
    // Too soon after the last: Bridge shows nothing, and the game doesn't wait for it.
    const skipped = backend.requestInterstitialAd();
    await vi.advanceTimersByTimeAsync(2000);
    await expect(skipped).resolves.toBeUndefined();
  });

  it('shows its own mute button on Playgama, not on YouTube', () => {
    expect(bridgeBackend(fakeBridge().bridge as unknown as Bridge).muteButton()).toBe(true);
    expect(bridgeBackend(fakeBridge({ platform: 'youtube' }).bridge as unknown as Bridge).muteButton()).toBe(false);
  });

  it('asks for an interstitial at every natural pause: Bridge decides when one is shown', async () => {
    const asked: number[] = [];
    const backend = { requestRewardedAd: async () => true, requestInterstitialAd: async () => void asked.push(1), managesAdTiming: true };
    const ads = new Ads(backend, () => 0);
    await ads.betweenScreens();
    await ads.betweenScreens();
    expect(asked).toHaveLength(2);
    // Without Bridge (YouTube), the game's own limits apply: none for a brand-new player.
    const own = new Ads({ ...backend, managesAdTiming: false }, () => 0);
    await own.betweenScreens();
    expect(asked).toHaveLength(2);
  });
});
