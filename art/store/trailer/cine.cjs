// A cinematic trailer shot from the real game: a saved game, no interface, a camera that eases along a path
// (from/at, start to end), the hero posed (placed, turned, scrubbing), the game's clock frozen and stepped
// 1/30 s per frame with only the saved frames drawn.  node cine.cjs <shots/N.json> <outDir> [still]
// (With "still", one frame from the middle of the shot, to check its framing.) Needs the dev server on port 5190.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const [shotFile, out, still] = process.argv.slice(2);
const shot = JSON.parse(fs.readFileSync(shotFile, 'utf8'));
// The save, relative to this folder (saves/), with the hero's top hat bought and worn.
const raw = JSON.parse(fs.readFileSync(path.resolve(__dirname, shot.save), 'utf8'));
raw.wardrobe.owned = [...new Set([...(raw.wardrobe.owned ?? []), 'tophat'])];
raw.wardrobe.equipped = { ...raw.wardrobe.equipped, hat: 'tophat' };
if (shot.supplies) raw.supplies = { ...raw.supplies, ...shot.supplies };
const save = JSON.stringify({ ...raw, savedAt: Date.now() });
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.clock.install();
  await page.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('bubble-wash-dev-save', s); sessionStorage.setItem('seeded', '1'); } }, save);
  await page.goto('http://localhost:5190/', { waitUntil: 'load' });
  const until = async (fn, label, max = 400) => {
    for (let i = 0; i < max; i++) {
      if (await page.evaluate(fn)) return;
      await page.clock.runFor(200);
      await page.waitForTimeout(50);
    }
    throw new Error('timed out: ' + label);
  };
  const clear = () => page.evaluate(() => {
    const o = document.querySelector('.welcome-overlay');
    if (!o) return false;
    const b = [...o.querySelectorAll('button')].filter((x) => !x.disabled && !x.classList.contains('welcome-double'));
    const label = (x) => `${x.getAttribute('aria-label') ?? ''} ${x.className} ${x.textContent ?? ''}`;
    (b.find((x) => /close/i.test(label(x))) ?? b.find((x) => /collect|not now|ok|continue|let|go|get it|show me/i.test(label(x))) ?? b[0])?.click();
    return true;
  });
  const patchDraw = () => page.evaluate(() => {
    const r = window.mogul.game.stage.renderer;
    if (r.__drawPatched) return;
    const draw = r.render.bind(r);
    r.render = (...a) => { if (window.__draw) draw(...a); };
    r.__drawPatched = true;
  });
  await until(() => !!window.mogul?.game, 'game');
  await patchDraw();
  if (shot.town !== (await page.evaluate(() => window.mogul.state.currentTown))) {
    await page.evaluate((t) => { window.__travelled = false; window.mogul.travel(t).then(() => (window.__travelled = true)); }, shot.town);
    await until(() => window.__travelled, 'travel');
    await patchDraw();
  }
  // While the game warms up, the hero can be kept to one side (so a car waits in its bay for the shot).
  if (shot.heroWarm)
    await page.evaluate((p) => window.mogul.game.addTicker(() => {
      if (window.__shooting) return;
      const m = window.mogul.game.player.mesh;
      m.position.set(p[0], m.position.y, p[1]);
    }), shot.heroWarm);
  for (let i = 0; i < (shot.warm ?? 30); i++) { await clear(); await page.clock.runFor(500); }
  await page.addStyleTag({ content: `#app > *:not(canvas):not(.game-root), .game-root > *:not(canvas), .welcome-overlay, .toast, .speech-tip { display: none !important; }` });
  const setCash = (c) => page.evaluate((v) => (window.mogul.state.cash = v), c);
  if (shot.cash !== undefined) await setCash(shot.cash);
  // The camera and the hero, set after the game's own frame (a ticker), then drawn again.
  await page.evaluate((s) => {
    window.__t = 0;
    window.__shooting = true;
    window.mogul.game.addTicker(() => {
      const g = window.mogul.game, stage = g.stage, c = stage.camera, scene = stage.scene, pl = g.player, st = window.mogul.state;
      const t = window.__t, e = t * t * (3 - 2 * t);
      const lerp = (a, b) => a.map((v, i) => v + (b[i] - v) * e);
      const h = s.hero;
      if (h) {
        // Held on its spot; with "until", only till that pad's built, then (with "after") a step to one side.
        const built = !!h.until && st.unlocked.includes(h.until);
        const spot = built ? h.after : h;
        if (spot) {
          pl.mesh.position.set(spot.at[0], pl.mesh.position.y, spot.at[1]);
          if (spot.yaw !== undefined) pl.mesh.rotation.y = spot.yaw;
        }
        pl.scrubbing = !!h.scrub;
      }
      const ghost = pl.mesh.getObjectByName('see-through');
      if (ghost) ghost.visible = false;
      if (scene.fog && !window.__fog) { window.__fog = true; scene.fog.near *= s.fog ?? 2.5; scene.fog.far *= s.fog ?? 2.5; }
      const from = lerp(s.cam.from[0], s.cam.from[1]);
      const at = lerp(s.cam.at[0], s.cam.at[1]);
      c.position.set(...from); c.fov = s.cam.fov ?? 40; c.near = 0.1; c.far = 900; c.updateProjectionMatrix(); c.lookAt(...at);
      stage.render();
    });
  }, shot);
  const frames = still ? 1 : shot.frames;
  for (let f = 0; f < frames; f++) {
    // Money arriving part-way through the shot (so a pad's built on camera, not before).
    if (shot.cashLater && f === shot.cashLater.frame) await setCash(shot.cashLater.cash);
    await page.evaluate((t) => (window.__t = t), still ? 0.5 : f / Math.max(1, frames - 1));
    await page.clock.runFor(1000 / 30 - 17);
    await page.evaluate(() => (window.__draw = true));
    await page.clock.runFor(17);
    await page.evaluate(() => (window.__draw = false));
    if (f % 15 === 0) await clear();
    await page.screenshot({ path: `${out}/f${String(f).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
  }
  console.log('shot', shotFile, frames, 'frames');
  await browser.close();
})();
