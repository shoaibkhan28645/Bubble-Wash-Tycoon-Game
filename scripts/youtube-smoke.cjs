// Plays the YouTube build (dist-youtube, `npm run build:youtube`) in Chromium with a stand-in for YouTube's
// Playables SDK, and checks what YouTube's certification asks of a running game
// (https://developers.google.com/youtube/gaming/playables/certification/requirements_integration):
//   - firstFrameReady while the loading screen shows, then gameReady once it has gone, each once;
//   - loadData before any saveData, and the save's size;
//   - the bytes downloaded before gameReady (the "initial bundle": MUST be under 30 MiB, SHOULD be under 15);
//   - onPause stops the game (the picture freezes) and onResume starts it again;
//   - sound starts with no tap (YouTube may give a Playable focus by itself; Chromium runs with autoplay allowed, as
//     YouTube's frame does), stops on pause and when YouTube's audio is off, and no mute button of the game's own;
//   - no request outside the build and the SDK, no uncaught error, the JS heap well under 512 MB.
// It is not YouTube's own Test Suite, which still has to be run on the uploaded build.
//   node scripts/youtube-smoke.cjs [outDir]
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = Number(process.env.PORT || 5192);
const ORIGIN = `http://localhost:${PORT}`;
const SDK = 'https://www.youtube.com/game_api/v1';
const MIB = 1024 * 1024;
const out = process.argv[2] || 'youtube-smoke';
fs.mkdirSync(out, { recursive: true });

// The stand-in SDK: records every call, with the time and whether the loading screen was showing.
const MOCK_SDK = `(() => {
  const loading = () => { const el = document.getElementById('loading'); return !!el && el.isConnected && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && Number(getComputedStyle(el).opacity) > 0.05; };
  const yt = (window.__yt = { calls: [], saved: '', audio: true, pause: [], resume: [], audioChange: [] });
  const note = (name, extra) => yt.calls.push({ name, at: performance.now(), loading: loading(), ...extra });
  window.ytgame = {
    IN_PLAYABLES_ENV: true,
    SDK_VERSION: 'stand-in',
    game: {
      firstFrameReady: () => note('firstFrameReady'),
      gameReady: () => note('gameReady'),
      loadData: async () => { note('loadData'); return yt.saved; },
      saveData: async (data) => { note('saveData', { bytes: data.length }); yt.saved = data; },
    },
    system: {
      isAudioEnabled: () => yt.audio,
      onAudioEnabledChange: (cb) => { yt.audioChange.push(cb); return () => {}; },
      onPause: (cb) => { yt.pause.push(cb); return () => {}; },
      onResume: (cb) => { yt.resume.push(cb); return () => {}; },
      getLanguage: async () => 'en',
    },
    ads: {
      requestInterstitialAd: async () => note('interstitial'),
      requestRewardedAd: async (id) => { note('rewarded', { id }); return true; },
    },
    engagement: { sendScore: async (s) => note('sendScore', { value: s.value }) },
    health: { logError: () => note('logError'), logWarning: () => note('logWarning') },
  };
})();`;

const results = [];
const check = (ok, what) => {
  results.push({ ok, what });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
};

(async () => {
  const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-youtube', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  try {
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(ORIGIN)).ok) break;
      } catch {
        // not up yet
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    const browser = await chromium.launch({ args: ['--enable-precise-memory-info', '--autoplay-policy=no-user-gesture-required'] });
    const page = await browser.newPage({ viewport: { width: 400, height: 860 }, isMobile: true, hasTouch: true });
    // Every AudioContext the game makes, to read its state (running = sound plays).
    await page.addInitScript(() => {
      const Base = window.AudioContext;
      window.AudioContext = class extends Base {
        constructor(...args) {
          super(...args);
          (window.__audio ||= []).push(this);
        }
      };
      // And every looping track started (the town's music): a running context alone may just be the browser's.
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        if (this.loop) window.__loops = (window.__loops || 0) + 1;
        return start.apply(this, args);
      };
    });
    const audioState = () => page.evaluate(() => (window.__audio || []).map((c) => c.state).join(',') || 'none');
    const loopsStarted = () => page.evaluate(() => window.__loops || 0);
    const errors = [];
    const outside = new Set();
    const downloads = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('request', (r) => {
      const url = r.url();
      if (!url.startsWith(ORIGIN) && url !== SDK && !url.startsWith('data:') && !url.startsWith('blob:')) outside.add(url);
    });
    page.on('response', async (r) => {
      if (!r.url().startsWith(ORIGIN)) return;
      const at = Date.now();
      try {
        downloads.push({ at, bytes: (await r.body()).length });
      } catch {
        // a redirect or an aborted request has no body
      }
    });
    await page.route(SDK, (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: MOCK_SDK }));
    const startedAt = Date.now();
    await page.goto(`${ORIGIN}/`);
    await page.waitForFunction(() => window.__yt && window.__yt.calls.some((c) => c.name === 'gameReady'), null, { timeout: 60000 });
    const readyAt = Date.now();
    await page.waitForTimeout(1500);

    const calls = await page.evaluate(() => window.__yt.calls);
    const first = calls.filter((c) => c.name === 'firstFrameReady');
    const ready = calls.filter((c) => c.name === 'gameReady');
    check(first.length === 1 && ready.length === 1, `firstFrameReady and gameReady called once each (${first.length}, ${ready.length})`);
    check(first[0]?.loading === true, 'firstFrameReady called while the loading screen shows');
    check(ready[0]?.loading === false, 'gameReady called once the loading screen has gone');
    check(first[0] && ready[0] && first[0].at < ready[0].at, `gameReady after firstFrameReady (${Math.round(ready[0]?.at - first[0]?.at)} ms later)`);
    const before = downloads.filter((d) => d.at <= readyAt).reduce((s, d) => s + d.bytes, 0);
    check(before < 15 * MIB, `downloaded before gameReady: ${(before / MIB).toFixed(1)} MiB uncompressed (MUST < 30, SHOULD < 15)`);
    check(readyAt - startedAt < 5000, `ready ${((readyAt - startedAt) / 1000).toFixed(1)} s after the page started loading (SHOULD < 5 s; local server)`);
    await page.waitForTimeout(1500);
    const noTap = await audioState();
    const music = await loopsStarted();
    check(noTap === 'running' && music > 0, `music plays before any tap (audio: ${noTap}, tracks started: ${music})`);
    await page.evaluate(() => {
      window.__yt.audio = false;
      window.__yt.audioChange.forEach((cb) => cb(false));
    });
    await page.waitForTimeout(400);
    const off = await audioState();
    check(off === 'suspended', `YouTube's audio off silences the game (audio: ${off})`);
    await page.evaluate(() => {
      window.__yt.audio = true;
      window.__yt.audioChange.forEach((cb) => cb(true));
    });
    await page.waitForTimeout(400);
    const on = await audioState();
    check(on === 'running', `YouTube's audio back on brings the sound back (audio: ${on})`);

    // Play a little: the first car arrives and is served by itself only when tapped, so tap round the lot.
    for (let i = 0; i < 12; i++) {
      await page.mouse.click(200 + ((i * 37) % 80) - 40, 430 + ((i * 53) % 120) - 60);
      await page.waitForTimeout(800);
    }
    // Save at a progress point: a pause saves.
    await page.evaluate(() => window.__yt.pause.forEach((cb) => cb()));
    await page.waitForTimeout(600);
    const a = await page.screenshot();
    await page.waitForTimeout(2000);
    const b = await page.screenshot();
    check(a.equals(b), 'onPause freezes the game (two pictures 2 s apart are identical)');
    const paused = await audioState();
    check(paused === 'suspended', `onPause silences the game (audio: ${paused})`);
    await page.evaluate(() => window.__yt.resume.forEach((cb) => cb()));
    await page.waitForTimeout(2500);
    const c = await page.screenshot();
    check(!b.equals(c), 'onResume starts it again (the picture moves)');
    const resumed = await audioState();
    check(resumed === 'running', `onResume brings the sound back (audio: ${resumed})`);
    fs.writeFileSync(path.join(out, 'after-resume.png'), c);

    const all = await page.evaluate(() => window.__yt.calls);
    const loadAt = all.find((x) => x.name === 'loadData')?.at ?? Infinity;
    const saves = all.filter((x) => x.name === 'saveData');
    check(saves.length > 0 && saves.every((s) => s.at > loadAt), `loadData before every saveData (${saves.length} saves)`);
    const biggest = Math.max(0, ...saves.map((s) => s.bytes));
    check(biggest < 500 * 1024, `largest save ${(biggest / 1024).toFixed(1)} KiB (MUST < 3 MiB, SHOULD < 500 KiB)`);
    check((await page.locator('.mute-button').count()) === 0, 'no mute button of the game\'s own');
    const heap = await page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : 0));
    check(heap > 0 && heap < 256 * MIB, `JS heap ${(heap / MIB).toFixed(0)} MB (MUST < 512 MB)`);
    const logged = all.filter((x) => x.name === 'logError').length;
    check(errors.length === 0 && logged === 0, `no uncaught errors (${errors.length} page, ${logged} reported)`);
    check(outside.size === 0, `no requests outside the build and the SDK${outside.size ? `: ${[...outside].join(', ')}` : ''}`);

    fs.writeFileSync(path.join(out, 'calls.json'), JSON.stringify(all, null, 1));
    await browser.close();
  } finally {
    server.kill();
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `${failed} check(s) failed` : 'All checks passed.');
  process.exit(failed ? 1 : 0);
})();
