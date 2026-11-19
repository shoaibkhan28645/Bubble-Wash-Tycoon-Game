// One trailer clip from the real game: a saved game, the game's clock frozen and stepped 1/30 s per frame,
// the hero walking by the keys in `moves`, each frame saved as a JPEG.
// node clip.cjs <save.json> <town> <outDir> <frames> <x,z|-> <moves>   moves: "ArrowRight+ArrowDown:40,ArrowLeft:30"
const { chromium } = require('playwright');
const fs = require('fs');
const [saveFile, town, out, framesArg, at, movesArg = ''] = process.argv.slice(2);
const frames = +framesArg;
const raw = JSON.parse(fs.readFileSync(saveFile, 'utf8'));
raw.wardrobe.owned = [...new Set([...(raw.wardrobe.owned ?? []), 'tophat'])];
raw.wardrobe.equipped = { ...raw.wardrobe.equipped, hat: 'tophat' };
const save = JSON.stringify({ ...raw, savedAt: Date.now() });
const moves = movesArg ? movesArg.split(',').map((m) => { const [keys, n] = m.split(':'); return { keys: keys.split('+').filter(Boolean), n: +n }; }) : [];
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
  await until(() => !!window.mogul?.game, 'game');
  // No drawing except for the frames saved (the game runs much faster): window.__draw turns it on.
  const patchDraw = () => page.evaluate(() => {
    const r = window.mogul.game.stage.renderer;
    if (r.__drawPatched) return;
    const draw = r.render.bind(r);
    r.render = (...a) => { if (window.__draw) draw(...a); };
    r.__drawPatched = true;
  });
  await patchDraw();
  if (town !== (await page.evaluate(() => window.mogul.state.currentTown))) {
    await page.evaluate((t) => { window.__travelled = false; window.mogul.travel(t).then(() => (window.__travelled = true)); }, town);
    await until(() => window.__travelled, 'travel');
    await patchDraw();
  }
  // Let the town come alive (cars, crews, planes) and clear any cards, on the game's own clock.
  for (let i = 0; i < 30; i++) { await clear(); await page.clock.runFor(500); }
  if (at && at !== '-') {
    const [x, z] = at.split(',').map(Number);
    await page.evaluate(([x, z]) => { const m = window.mogul.game.player.mesh; m.position.set(x, m.position.y, z); }, [x, z]);
  }
  for (let i = 0; i < 40; i++) { await clear(); await page.clock.runFor(100); }
  // Frames: 1/30 s of game time each, keys held as planned.
  let moveIndex = 0, moveLeft = moves[0]?.n ?? Infinity, held = [];
  const hold = async (keys) => {
    for (const k of held) if (!keys.includes(k)) await page.keyboard.up(k);
    for (const k of keys) if (!held.includes(k)) await page.keyboard.down(k);
    held = keys;
  };
  for (let f = 0; f < frames; f++) {
    if (moves.length) {
      if (moveLeft <= 0 && moveIndex < moves.length - 1) { moveIndex++; moveLeft = moves[moveIndex].n; }
      await hold(moveIndex < moves.length && moveLeft > 0 ? moves[moveIndex].keys : []);
      moveLeft--;
    }
    // Most of the 1/30 s undrawn, then one drawn frame for the picture.
    await page.clock.runFor(1000 / 30 - 17);
    await page.evaluate(() => (window.__draw = true));
    await page.clock.runFor(17);
    await page.evaluate(() => (window.__draw = false));
    if (f % 15 === 0) await clear();
    await page.screenshot({ path: `${out}/f${String(f).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 90 });
  }
  await hold([]);
  console.log('frames', frames, 'in', out);
  await browser.close();
})();
