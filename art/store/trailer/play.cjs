// A gameplay shot for the trailer, from the real game as a player sees it: the game's own camera and HUD, the
// game running at normal speed, the hero moving as a player moves them (the joystick pushed right over, at the
// game's own speed), along the real way round things, and doing the town's work. Frames are drawn 30 a second with the game's clock stepped 1/30 s each.
//   node play.cjs <shots/N.json> <outDir> [preview]     (preview: every 10th frame only, to check the plan)
// A shot file: { save, town, warm, cash?, start?: [x, z], speed?: m/s (a slower push), seconds, steps: [...] }, each step one of
//   { go: [x, z] }      walk there (the game's own route round things)
//   { wait: s }         stand still (working, if that's where the work is)
//   { bay: id }         walk to the side of a car wash station's car, and wash it
//   { pile: id }        walk onto a cash pile (collecting it)
//   { cash: n }         the money in hand from now (so a pad gets built on camera)
// Needs the dev server on port 5190.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const [shotFile, out, preview] = process.argv.slice(2);
const shot = JSON.parse(fs.readFileSync(shotFile, 'utf8'));
const raw = JSON.parse(fs.readFileSync(path.resolve(path.dirname(shotFile), shot.save), 'utf8'));
// The hero in the top hat, as on the covers.
raw.wardrobe.owned = [...new Set([...(raw.wardrobe.owned ?? []), 'tophat'])];
raw.wardrobe.equipped = { ...raw.wardrobe.equipped, hat: 'tophat' };
if (shot.supplies) raw.supplies = { ...raw.supplies, ...shot.supplies };
const save = JSON.stringify({ ...raw, savedAt: Date.now() });
fs.mkdirSync(out, { recursive: true });

/** In the page: takes the hero through the shot's steps by the joystick, as a player's thumb would. */
function driver(shot) {
  const g = window.mogul.game;
  const s = window.mogul.state;
  const view = g.bot;
  const layout = view?.upgrades?.layout;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const play = (window.__play = { i: 0, t: 0, way: null, to: null, dir: { x: 0, z: 0 }, log: [] });
  // (Flat out unless the shot asks for a slower push.)
  const speed = shot.speed ?? Infinity;
  /** Where a step wants the hero (null: nowhere, stand still). */
  const goal = (step) => {
    if (step.go) return { x: step.go[0], z: step.go[1] };
    if (step.pile) return layout.piles[step.pile];
    if (step.bay) {
      const st = g.traffic.all().find((x) => x.id === step.bay);
      const z = st.zone;
      const off = Math.min(1.25, (z.maxX - z.minX) / 2 - 0.3);
      return st.side ?? { x: st.at.x + (step.side ?? 1) * off, z: st.at.z };
    }
    return null;
  };
  const up = g.player.update.bind(g.player);
  g.player.update = (dt, _move, obstacles, bounds) => {
    const hero = g.player.position;
    let move = { x: 0, z: 0 };
    const step = shot.steps[play.i];
    if (step) {
      play.t += dt;
      if (step.cash !== undefined) {
        s.cash = step.cash;
        play.i++;
        play.t = 0;
      } else if (step.wait !== undefined) {
        if (play.t >= step.wait) {
          play.i++;
          play.t = 0;
        }
      } else {
        const to = goal(step);
        if (!play.to || dist(play.to, to) > 0.3) {
          play.way = g.jobs ? g.jobs.path(hero, to) : [to];
          play.to = { ...to };
        }
        while (play.way.length > 1 && dist(play.way[0], hero) < 0.6) play.way.shift();
        const next = play.way[0] ?? to;
        const d = dist(hero, to);
        // A spot only passed on the way (another walk straight after): kept moving through it, not stopped at.
        const after = shot.steps[play.i + 1];
        const passing = !!after && after.wait === undefined && after.cash === undefined;
        // There: on to the next step (a bay's car is washed by standing there: a wait follows it in the plan).
        if (d < (step.near ?? (passing ? 0.9 : 0.35)) || play.t > (step.giveUp ?? 20)) {
          play.log.push({ step: play.i, at: hero, t: +play.t.toFixed(1) });
          play.i++;
          play.t = 0;
          play.to = null;
        } else {
          let dx = next.x - hero.x;
          let dz = next.z - hero.z;
          const n = Math.hypot(dx, dz) || 1;
          dx /= n;
          dz /= n;
          // Up against something (no headway for a moment): a step to the side, as a player would.
          const moved = play.last ? dist(hero, play.last) : 1;
          play.last = { ...hero };
          play.stuck = moved < 0.3 * dt ? (play.stuck ?? 0) + dt : Math.max(0, (play.stuck ?? 0) - dt);
          if (play.stuck > 0.5) play.side = 0.6;
          if (play.side > 0) {
            play.side -= dt;
            const sx = -dz;
            const sz = dx;
            dx = dx * 0.3 + sx;
            dz = dz * 0.3 + sz;
          }
          // A thumb turns smoothly, not in jumps.
          const k = Math.min(1, dt * 7);
          play.dir.x += (dx - play.dir.x) * k;
          play.dir.z += (dz - play.dir.z) * k;
          const m = Math.hypot(play.dir.x, play.dir.z) || 1;
          // The joystick pushed (right over, unless the shot says), easing off onto a spot where the hero stops.
          const push = Math.min(1, speed / g.player.topSpeed) * (passing ? 1 : Math.max(0.35, Math.min(1, d / 1.2)));
          move = { x: (play.dir.x / m) * push, z: (play.dir.z / m) * push };
        }
      }
    }
    return up(dt, move, obstacles, bounds);
  };
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: preview ? 0.75 : 1.5 });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.clock.install();
  await page.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('bubble-wash-dev-save', s); sessionStorage.setItem('seeded', '1'); } }, save);
  await page.goto('http://localhost:5190/', { waitUntil: 'load' });
  const until = async (fn, label, max = 400) => {
    for (let i = 0; i < max; i++) {
      if (await page.evaluate(fn)) return;
      await page.clock.runFor(200);
      await page.waitForTimeout(30);
    }
    throw new Error('timed out: ' + label);
  };
  // Anything that pops up (a welcome back, a goal done): closed, as a player would.
  const clear = () => page.evaluate(() => {
    for (const o of document.querySelectorAll('.welcome-overlay')) {
      const b = [...o.querySelectorAll('button')].filter((x) => !x.disabled && !x.classList.contains('welcome-double'));
      const label = (x) => `${x.getAttribute('aria-label') ?? ''} ${x.className} ${x.textContent ?? ''}`;
      (b.find((x) => /close/i.test(label(x))) ?? b.find((x) => /collect|grab|not now|ok|continue|let|go|get it|show me/i.test(label(x))) ?? b[0])?.click();
    }
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
  // The town runs a while first (cars come, crews get going); the hero stands where the shot starts.
  const place = () => shot.start && page.evaluate((p) => { const m = window.mogul.game.player.mesh; m.position.set(p[0], m.position.y, p[1]); }, shot.start);
  for (let i = 0; i < (shot.warm ?? 20); i++) { await clear(); await place(); await page.clock.runFor(500); }
  // (The guide's hand and pop-ups aren't part of a player's walk here; the joystick's never shown without a thumb.)
  await page.addStyleTag({ content: '.guide-hand, .welcome-overlay { display: none !important; }' });
  if (shot.cash !== undefined) await page.evaluate((c) => (window.mogul.state.cash = c), shot.cash);
  // The camera settles on the hero before the first frame.
  await page.clock.runFor(1500);
  // From here the game's clock moves only as the frames are stepped: left running, it also moved with the real
  // seconds each frame takes to draw, and the game (taking at most a short step a frame) ran two or three times
  // faster than the footage.
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 50);
  await page.evaluate(driver, shot);
  const startedAt = await page.evaluate(() => window.mogul.state.playSeconds);
  const frames = Math.round((shot.seconds ?? 7) * 30);
  for (let f = 0; f < frames; f++) {
    await page.clock.runFor(1000 / 30 - 17);
    const keep = !preview || f % 10 === 0;
    if (keep) await page.evaluate(() => (window.__draw = true));
    await page.clock.runFor(17);
    if (keep) {
      await page.evaluate(() => (window.__draw = false));
      await page.screenshot({ path: `${out}/f${String(f).padStart(4, '0')}.jpg`, type: 'jpeg', quality: preview ? 70 : 92 });
    }
    if (f % 15 === 0) await clear();
  }
  // The game's own seconds over the shot, against the footage's (they should match: normal speed).
  const played = (await page.evaluate(() => window.mogul.state.playSeconds)) - startedAt;
  console.log('shot', shotFile, frames, 'frames,', (frames / 30).toFixed(2), 's of footage,', played.toFixed(2), 's of play', JSON.stringify(await page.evaluate(() => ({ step: window.__play.i, log: window.__play.log }))));
  await browser.close();
})();
