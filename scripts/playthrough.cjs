// The whole game, played by a bot from a brand-new save on a phone screen: the tutorial, every pad in every town,
// the goals each town's land waits for, and on to the next town, with the real economy (no cash handed out).
// Time runs on Playwright's fake clock in 50 ms frames with drawing skipped (pictures now and then), so a few hours
// of play take about an hour. The bot plays like a keen player: it follows the guide's hand, does every rush job,
// buys each pad once it can, buys upgrades as the pacing model's bot does (the cheapest, at most a quarter of the
// next pad's price), collects cash, claims goals, missions and contracts, and says "not now" to ads and gems.
//
// Needs the dev server (npx vite --port 5190) and Playwright with Chromium.
// node scripts/playthrough.cjs <outDir> [maxGameMinutes]   env: START=<checkpoint.json> to begin from a saved game
//   (ARRIVED=<seconds of play> to time that town from when it was arrived in),
//                                                     RELOAD=1 to reload the page once in each town (saves).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = '/home/user/Bubble-Wash-Tycoon-Game/src/data/towns/';
const STEP_MS = 50;
const CHUNK_MS = 1000;
const out = process.argv[2];
const maxMinutes = Number(process.argv[3] || 400);
fs.mkdirSync(out, { recursive: true });
const logFile = fs.createWriteStream(path.join(out, 'log.txt'));
const log = (...a) => {
  const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  console.log(line);
  logFile.write(line + '\n');
};

// When the pacing model (tests/journey.test.ts) has each pad bought, in minutes after arriving in its town.
const MODEL = {
  roadside: { bay1: 0, register: 0.4, bay2: 3.3, pump1: 5.2, washer: 10.8, attendant: 14.3, soap: 18.5, mart: 21.2, dryer: 23.1, runner: 24.3, clerk: 25.2, dryerStaff: 27.3, pump2: 28.8, wax: 31.6, board: 32.6, vending: 33.4, sign: 34.5, tunnel: 35.8, cashier: 37.4, valet: 39.3, manager: 41.8, garage: 45.6, landmark: 50.6, truck: 70.6 },
  willowbrook: { stand: 0, field1: 0, well: 0, field2: 2.8, henhouse: 3.7, barn: 4.4, farmhand: 5.7, eggcollector: 6.6, standhand: 8.4, cowbarn: 9.7, gate: 10.4, feedstore: 11.6, pickup: 14.1, milker: 16.4, van: 22.3, driver: 25.9, tanker: 28.3, cashier: 30.7, orchard: 34.7, orchardhand: 37, feedtruck: 39.4, manager: 45.1, bakery: 50, baker: 55.2, market: 64.2, marketstaff: 69.8, windmill: 73.1, road: 93.1 },
  starlight: { booth: 0, carousel: 0, cart: 3.3, benches: 6.4, bumper: 9.3, seller: 12, shed: 14.3, operator: 17.2, ringtoss: 20.2, mechanic: 23.1, teacups: 25.8, burger: 28.5, vendor: 31, snackrunner: 33.4, sign: 35.9, janitor: 39.1, swings: 42.6, busstop: 46.5, boats: 49.7, haunted: 53, mascot: 56.2, cashier: 58.9, flume: 62.5, giftshop: 65.3, manager: 68.1, fireworks: 71.1, coaster: 74.9, crew: 78.1, wheel: 81.4, highway: 101.4 },
};
const NAMES = {};
for (const town of Object.keys(MODEL)) for (const p of JSON.parse(fs.readFileSync(`${ROOT}${town}/pads.json`, 'utf8'))) NAMES[`${town}:${p.id}`] = p.name;

// The bot's brain, in the page: chooses where to go and steers the hero's joystick there along the real way round.
function brain() {
  const bot = (window.__bot = {
    game: null,
    cfg: null,
    target: null,
    why: '',
    decideIn: 0,
    plan: { at: 0, way: [], to: null },
    stuck: 0,
    side: 0,
    last: null,
    /** Targets given up on for a while (key → until, seconds of play). */
    avoid: {},
    /** Seconds spent going for the same target. */
    onTarget: 0,
    /** Upgrade pads lately visited (id → seconds of play). */
    visited: {},
    events: [],
  });
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  /** Where to go now, and why. */
  const decide = (g) => {
    const s = window.mogul.state;
    const now = s.playSeconds;
    const hero = g.player.position;
    const view = g.bot;
    const layout = bot.cfg ? bot.cfg.town().layout : null;
    const ok = (key) => !(bot.avoid[key] > now);
    const pads = view?.pads;
    const next = pads?.next;
    const nextCost = pads?.nextCost ?? null;
    // The guide's hand first (the tutorial, then whatever's holding the business up).
    if (view?.hint && ok('hint:' + view.hint.text)) return { at: view.hint.at, why: 'hint:' + view.hint.text };
    // A rush job (a keen player does them all).
    const job = g.jobs?.board.active;
    if (job && ok('job:' + job.def.id)) {
      const t = g.jobs.board.target(hero);
      if (t) return { at: t, why: 'job:' + job.def.id, job };
    }
    if (next && s.cash >= next.owed && ok('pad')) return { at: next.at, why: 'pad:' + pads.nextName };
    // A finished contract to claim on the board.
    if (layout && s.contracts?.slots?.some((c) => c.kind && c.progress >= c.goal) && layout.pads.board && s.unlocked.includes('board') && ok('board')) {
      return { at: { x: layout.pads.board.x, z: layout.pads.board.z + 1.6 }, why: 'contracts' };
    }
    // Cash lying in a pile, if it's worth going for now (a good share of the next pad, or enough to buy it).
    const pile = view?.cash.fullestPile();
    const inPile = pile ? (s.piles[pile.id] ?? 0) : 0;
    // (A pile only holds so much before a cashier's hired: one half full is worth fetching too.)
    const cap = view?.cash.unlimited?.() ? Infinity : (view?.cash.tuning?.pileCap ?? Infinity);
    if (pile && inPile > 0 && ok('pile:' + pile.id) && (inPile >= 0.5 * cap || inPile >= 0.2 * (nextCost ?? Math.max(1000, s.cash)) || (next && s.cash + inPile >= next.owed))) return { at: pile.at, why: 'cash' };
    // The car wash: a car waiting at a station nobody works (wash it, fill it up…): stand beside it.
    if (g.traffic && g.staff) {
      let best = null;
      for (const st of g.traffic.all()) {
        const waiting = st.kind === 'counter' ? st.serving : st.customer?.state === 'waiting';
        if (!waiting || g.staff.rateFor(st) > 0 || !ok('station:' + st.id)) continue;
        const z = st.zone;
        const half = (z.maxX - z.minX) / 2;
        const off = Math.min(1.25, half - 0.3);
        const spots = st.side ? [st.side] : [{ x: st.at.x - off, z: st.at.z }, { x: st.at.x + off, z: st.at.z }];
        for (const at of spots) if (!best || dist(hero, at) < dist(hero, best.at)) best = { at, id: st.id };
      }
      if (best) return { at: best.at, why: 'station:' + best.id };
    }
    // An upgrade worth buying: the cheapest, at most a quarter of the next pad's price.
    if (view?.upgrades && layout) {
      let best = null;
      for (const id of view.upgrades.pads.keys()) {
        if (now - (bot.visited[id] ?? -1e9) < 25 || !ok('up:' + id)) continue;
        for (const row of view.upgrades.rows(id)) {
          if (row.level >= row.max || row.cost > s.cash) continue;
          if (nextCost !== null && row.cost > nextCost * 0.25) continue;
          if (!best || row.cost < best.cost) best = { id, cost: row.cost, key: row.key };
        }
      }
      if (best) return { at: layout.upgradePads[best.id], why: 'upgrade:' + best.id, upgrade: best.id };
    }
    if (pile && inPile > 0 && ok('pile:' + pile.id) && next) return { at: pile.at, why: 'cash' };
    // Nothing else: wait on the next pad (it fills as the cash comes in).
    if (next && ok('pad')) return { at: next.at, why: 'wait on pad:' + pads.nextName };
    // Nothing at all: off any upgrade pad (its open panel would hold the rush jobs), back where the town starts.
    if (layout?.playerStart) return { at: layout.playerStart, why: 'idle' };
    return null;
  };

  /** Steers: the joystick towards the next point of the way there, side-stepping when stuck. */
  const steer = (g, dt, move) => {
    const s = window.mogul.state;
    const hero = g.player.position;
    bot.decideIn -= dt;
    if (bot.decideIn <= 0) {
      bot.decideIn = 0.25;
      const choice = decide(g);
      const key = choice ? choice.why : '';
      if (key !== bot.why) bot.onTarget = 0;
      bot.target = choice;
      bot.why = key;
    }
    bot.onTarget += dt;
    const choice = bot.target;
    if (!choice) return { x: 0, z: 0 };
    // Going for the same thing far too long: give it up a while (and say so).
    const limit = choice.job ? 90 : choice.why.startsWith('wait') ? 1e9 : 60;
    if (bot.onTarget > limit) {
      const key = choice.job ? 'job:' + choice.job.def.id : choice.why.startsWith('hint:') || choice.why.startsWith('station:') ? choice.why : choice.why.startsWith('pad') ? 'pad' : choice.upgrade ? 'up:' + choice.upgrade : choice.why === 'contracts' ? 'board' : choice.why === 'cash' ? 'pile' : choice.why;
      bot.avoid[key] = s.playSeconds + 45;
      bot.events.push({ at: s.playSeconds, gaveUp: choice.why, hero: { ...hero }, to: choice.at });
      bot.onTarget = 0;
      bot.decideIn = 0;
      return { x: 0, z: 0 };
    }
    const job = choice.job;
    // Somewhere to work or wait (a car, a lever): stay there.
    if (job && (job.def.pattern === 'work' || job.def.pattern === 'signal') && dist(hero, job.from) <= (job.def.reach ?? 1.1) * 0.85) {
      bot.stuck = 0;
      bot.side = 0;
      bot.last = { ...hero };
      if (job.def.pattern === 'work') return { x: 0, z: 0 };
      const d = dist(hero, job.from) || 1;
      return { x: ((job.from.x - hero.x) / d) * 0.3, z: ((job.from.z - hero.z) / d) * 0.3 };
    }
    // At an upgrade pad: stand on it a moment (the panel opens, the driver buys), then on.
    if (choice.upgrade && dist(hero, choice.at) < 0.5) {
      bot.visited[choice.upgrade] = s.playSeconds;
      return { x: 0, z: 0 };
    }
    // Close enough to a spot to stand on (a pad, a pile, a counter): stop there.
    if (!job && dist(hero, choice.at) < 0.35) {
      bot.stuck = 0;
      return { x: 0, z: 0 };
    }
    let target = choice.at;
    const plan = bot.plan;
    plan.at -= dt;
    if (plan.at <= 0 || !plan.to || dist(plan.to, target) > 0.3) {
      plan.way = g.jobs ? g.jobs.path(hero, target) : [target];
      plan.to = { ...target };
      plan.at = 0.6;
    }
    while (plan.way.length > 1 && dist(plan.way[0], hero) < 0.6) plan.way.shift();
    if (plan.way.length > 0) target = plan.way[0];
    let dx = target.x - hero.x;
    let dz = target.z - hero.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    // Slow down onto a spot (so as not to overshoot it in a big step).
    const slow = !job && plan.way.length <= 1 && d < 1 ? Math.max(0.35, d) : 1;
    if (bot.last && dist(hero, bot.last) < 0.5 * dt) bot.stuck += dt;
    else bot.stuck = Math.max(0, bot.stuck - dt);
    // Wedged somewhere tight (side-stepping hasn't got it closer): off in a random direction a moment.
    if (bot.escape > 0) {
      bot.escape -= dt;
      bot.last = { ...hero };
      return { x: Math.sin(bot.escapeDir), z: Math.cos(bot.escapeDir) };
    }
    if (bot.stuck > 0.6 && bot.side === 0) {
      bot.side = 1.0;
      bot.sides = (bot.sides ?? 0) + 1;
      const d = dist(hero, choice.at);
      if (bot.sideFrom === undefined || d < bot.sideFrom - 1) {
        bot.sides = 1;
        bot.sideFrom = d;
      }
      if (bot.sides >= 3) {
        bot.sides = 0;
        bot.sideFrom = undefined;
        bot.escape = 1.5;
        bot.escapeDir = Math.random() * Math.PI * 2;
        bot.events.push({ at: s.playSeconds, escape: choice.why, hero: { ...hero } });
      }
    }
    if (bot.side > 0) {
      bot.side -= dt;
      const sx = -dz;
      const sz = dx;
      dx = dx * 0.3 + sx;
      dz = dz * 0.3 + sz;
      const n = Math.hypot(dx, dz);
      dx /= n;
      dz /= n;
      if (bot.side <= 0) {
        bot.side = 0;
        bot.stuck = 0;
        plan.at = 0;
      }
    }
    bot.last = { ...hero };
    return { x: dx * slow, z: dz * slow };
  };

  /** Takes over the hero of the game being played now (again after a trip or a reload). */
  window.__botAttach = async () => {
    const g = window.mogul?.game;
    if (!g || g === bot.game || !g.player) return false;
    if (!bot.cfg) bot.cfg = await import('/src/core/config.ts');
    bot.game = g;
    const up = g.player.update.bind(g.player);
    g.player.update = (dt, move, obstacles, bounds) => up(dt, steer(g, dt, move), obstacles, bounds);
    // No drawing between pictures (the game runs much faster); window.__draw turns it back on.
    const r = g.stage.renderer;
    if (!r.__drawPatched) {
      const draw = r.render.bind(r);
      r.render = (...a) => {
        if (window.__draw) draw(...a);
      };
      r.__drawPatched = true;
    }
    return true;
  };
}

/** What's on screen to tap, as a player would: papers, offers ("not now"), claims, the panels. */
function tapUI() {
  const done = [];
  const text = (el) => (el?.innerText || '').replace(/\s+/g, ' ').trim();
  const free = (b) => !b.disabled && !/📺|Watch|2×|💎/.test(b.innerText);
  const g = window.mogul?.game;
  const s = window.mogul?.state;
  // The paper.
  const news = document.querySelector('.news-overlay');
  if (news) {
    const b = news.querySelector('button');
    if (b) {
      done.push({ news: text(news).slice(0, 160) });
      b.click();
      return done;
    }
  }
  // A card or dialog: claims first, then the way out that costs nothing.
  const card = document.querySelector('.welcome-card');
  if (card) {
    const all = text(card);
    const buttons = [...card.querySelectorAll('button')];
    const claim = buttons.find((b) => b.classList.contains('mission-claim') && !b.disabled && !/📺|Watch|2×/.test(b.innerText));
    if (claim) {
      done.push({ claim: all.slice(0, 120), button: text(claim) });
      claim.click();
      return done;
    }
    const close = buttons.find((b) => free(b) && /not now|^ok$|collect|back|continue|keep|claim|later|close/i.test(text(b))) ?? buttons.find(free);
    if (close) {
      done.push({ card: all.slice(0, 220), button: text(close) });
      close.click();
      return done;
    }
  }
  // An upgrade pad's panel: buy what the bot came for (the cheapest, at most a quarter of the next pad's price).
  const panel = document.querySelector('.upgrade-panel:not([hidden])');
  if (panel && g?.bot) {
    const nextCost = g.bot.pads.nextCost;
    const rows = [];
    for (const id of g.bot.upgrades.pads.keys()) for (const row of g.bot.upgrades.rows(id)) rows.push(row);
    const want = rows
      .filter((r) => r.level < r.max && r.cost <= s.cash && (nextCost === null || r.cost <= nextCost * 0.25))
      .sort((a, b) => a.cost - b.cost);
    for (const r of want) {
      const b = panel.querySelector(`button[data-key="${r.key}"]`);
      if (b && !b.disabled) {
        b.click();
        done.push({ upgrade: r.key, cost: r.cost });
        return done;
      }
    }
  }
  // The goals: claim any done.
  const goals = document.querySelector('.goals-bar');
  if (goals && !goals.hidden && /claim/i.test(goals.innerText)) {
    goals.click();
    done.push({ goals: text(goals) });
    return done;
  }
  // Side buttons with something waiting (missions, the calendar).
  for (const b of document.querySelectorAll('.side-button.side-missions, .side-button.side-calendar')) {
    const badge = b.querySelector('.side-badge');
    if (badge && !badge.hidden && badge.textContent.trim() && b.offsetParent) {
      b.click();
      done.push({ side: b.getAttribute('aria-label') });
      return done;
    }
  }
  return done;
}

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const p = await context.newPage();
  const errs = [];
  p.on('pageerror', (e) => {
    errs.push(e.message);
    log('PAGE ERROR', e.message, (e.stack || '').split('\n').slice(0, 5).join(' | '));
  });
  p.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/GL Driver|KHR_parallel|favicon|youtube/i.test(t)) return;
    errs.push(t);
    log('CONSOLE ERROR', t.slice(0, 300));
  });
  await p.route('**/youtube.com/**', (r) => r.abort());
  await p.clock.install();
  await p.addInitScript((step) => {
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), step);
    window.cancelAnimationFrame = (id) => clearTimeout(id);
  }, STEP_MS);
  if (process.env.START) {
    const save = fs.readFileSync(process.env.START, 'utf8');
    await p.addInitScript((data) => {
      if (!sessionStorage.getItem('bot-started')) {
        localStorage.setItem('bubble-wash-dev-save', data);
        sessionStorage.setItem('bot-started', '1');
      }
    }, save);
  }
  await p.addInitScript(brain);
  await p.goto('http://localhost:5190/', { waitUntil: 'load' });

  const loaded = async (what) => {
    for (let i = 0; i < 1200; i++) {
      await p.clock.runFor(200);
      if (await p.evaluate(() => !!window.mogul?.game && document.querySelector('#loading')?.hidden)) return true;
    }
    log('NEVER LOADED', what);
    return false;
  };
  if (!(await loaded('start'))) process.exit(1);

  const snap = () =>
    p.evaluate(() => {
      const s = window.mogul.state;
      const g = window.mogul.game;
      return {
        town: s.currentTown,
        play: s.playSeconds,
        cash: Math.round(s.cash),
        gems: s.gems,
        stars: Math.round(s.stars * 100) / 100,
        unlocked: [...s.unlocked],
        building: Object.keys(s.building ?? {}),
        goals: (s.goals?.done ?? []).length,
        jobs: s.counts.jobs ?? 0,
        next: g.bot?.pads.nextName ?? null,
        nextCost: g.bot?.pads.nextCost ?? null,
        owed: g.bot?.pads.next?.owed ?? null,
        why: window.__bot?.why ?? '',
        hero: g.player.position,
        frameErrors: g.frameErrors,
        autoRate: Math.round(s.autoRate),
      };
    });
  let shotNo = 0;
  const shot = async (name) => {
    await p.evaluate(() => (window.__draw = true));
    await p.clock.runFor(150);
    await p.screenshot({ path: path.join(out, `${String(++shotNo).padStart(3, '0')}-${name}.png`) });
    await p.evaluate(() => (window.__draw = false));
  };

  await p.evaluate(() => window.__botAttach());
  let s = await snap();
  log('start', { town: s.town, play: s.play, unlocked: s.unlocked.length });
  await shot('start');
  let town = s.town;
  let arrived = process.env.ARRIVED !== undefined ? Number(process.env.ARRIVED) : s.play;
  let known = new Set(s.unlocked);
  let lastBuy = s.play;
  let lastStatus = s.play;
  let reloaded = {};
  const bought = [];
  const story = [];
  const start = Date.now();
  let frameErrors = 0;
  let lastLow = null;
  let lastSave = 0;

  while (true) {
    await p.clock.runFor(CHUNK_MS);
    const attached = await p.evaluate(() => window.__botAttach());
    if (attached) log('bot took over the hero', await p.evaluate(() => window.mogul.state.currentTown));
    // Tap what's on screen (a few times, papers come in stacks).
    for (let i = 0; i < 4; i++) {
      const tapped = await p.evaluate(tapUI);
      if (tapped.length === 0) break;
      for (const t of tapped) {
        log('  ui', t);
        if (t.news || t.card) story.push({ play: Math.round((await p.evaluate(() => window.mogul.state.playSeconds)) / 6) / 10, ...t });
      }
      await p.clock.runFor(100);
    }
    // Loading (a trip): wait it out.
    if (await p.evaluate(() => !document.querySelector('#loading')?.hidden)) {
      log('loading…');
      if (!(await loaded('trip'))) break;
      await p.evaluate(() => window.__botAttach());
    }
    s = await snap();
    // Arrived somewhere new.
    if (s.town !== town) {
      log(`ARRIVED in ${s.town} after ${((s.play - arrived) / 60).toFixed(1)} min in ${town}`);
      fs.writeFileSync(path.join(out, `save-${s.town}.json`), await p.evaluate(() => localStorage.getItem('bubble-wash-dev-save')));
      town = s.town;
      arrived = s.play;
      known = new Set(s.unlocked);
      lastBuy = s.play;
      await shot(`arrive-${town}`);
    }
    // Bought something.
    for (const id of [...s.unlocked, ...s.building]) {
      if (known.has(id)) continue;
      known.add(id);
      const minute = (s.play - arrived) / 60;
      const model = MODEL[town]?.[id];
      const off = model ? Math.round(((minute - model) / Math.max(model, 1)) * 100) : null;
      bought.push({ town, id, minute: Math.round(minute * 10) / 10, model, off });
      log(`BUY ${town}:${id} (${NAMES[`${town}:${id}`] ?? id}) at ${minute.toFixed(1)} min (model ${model ?? '-'}${off !== null ? `, ${off > 0 ? '+' : ''}${off}%` : ''}) cash ${s.cash} stars ${s.stars} jobs ${s.jobs}`);
      lastBuy = s.play;
      if (bought.filter((x) => x.town === town).length % 4 === 0) await shot(`${town}-${id}`);
    }
    // Once in each town, part way: reload the page (the save must bring it all back).
    if (process.env.RELOAD === '1' && !reloaded[town] && s.unlocked.length >= 10) {
      reloaded[town] = true;
      const before = { cash: s.cash, unlocked: s.unlocked.length, play: s.play };
      await p.evaluate(() => window.mogul.game && null);
      await p.reload({ waitUntil: 'load' });
      await loaded('reload');
      await p.evaluate(() => window.__botAttach());
      const after = await snap();
      log('RELOADED', { before, after: { cash: after.cash, unlocked: after.unlocked.length, play: after.play, town: after.town } });
    }
    if (s.frameErrors.count > frameErrors) {
      frameErrors = s.frameErrors.count;
      log('FRAME ERROR', s.frameErrors);
    }
    if (s.play - lastSave >= 600) {
      lastSave = s.play;
      fs.writeFileSync(path.join(out, 'save-latest.json'), await p.evaluate(() => localStorage.getItem('bubble-wash-dev-save')));
    }
    const events = await p.evaluate(() => window.__bot.events.splice(0));
    for (const e of events) log('  bot', e);
    if (s.play - lastStatus >= 120) {
      lastStatus = s.play;
      log(`status ${((s.play - arrived) / 60).toFixed(1)} min in ${s.town} | cash ${s.cash} | next ${s.next} $${s.nextCost} owed ${s.owed} | ${s.why} | stars ${s.stars} goals ${s.goals} jobs ${s.jobs} | wall ${((Date.now() - start) / 60000).toFixed(1)} min`);
    }
    // The rating falling low: what's going on (every 2 minutes while it lasts), and the save, to look at again.
    if (s.stars < 3 && s.play - (lastLow ?? -1e9) >= 120) {
      lastLow = s.play;
      const why = await p.evaluate(() => {
        const g = window.mogul.game;
        const st = window.mogul.state;
        const stations = g.traffic
          ? g.traffic.all().map((x) => ({
              id: x.id,
              kind: x.kind,
              car: x.customer?.state ?? null,
              queue: x.queue?.length ?? 0,
              staff: Math.round(g.staff.rateFor(x) * 100) / 100,
              supply: x.supply ? st.supplies[`${x.id}.${x.supply}`] ?? 0 : null,
              serving: x.kind === 'counter' ? x.serving : undefined,
            }))
          : null;
        return { hero: g.player.position, why: window.__bot.why, carrying: g.player.carry?.stack ?? null, stations, shelf: st.supplies['shelf.soap'] };
      });
      log('LOW RATING', s.stars, JSON.stringify(why));
      fs.writeFileSync(path.join(out, `save-low-${Math.round(s.play)}.json`), await p.evaluate(() => localStorage.getItem('bubble-wash-dev-save')));
      await shot(`low-${Math.round(s.play / 60)}`);
    }
    // Stalled: nothing bought for a long while.
    if (s.play - lastBuy > 25 * 60) {
      log('STALLED', s);
      await shot('stalled');
      lastBuy = s.play;
    }
    if (s.unlocked.includes('highway') && town === 'starlight') {
      await p.clock.runFor(3000);
      await shot('the-end');
      log('THE END: the last land bought');
      break;
    }
    if (s.play / 60 > maxMinutes) {
      log('time up');
      break;
    }
  }
  await shot('last');
  fs.writeFileSync(path.join(out, 'bought.json'), JSON.stringify(bought, null, 1));
  fs.writeFileSync(path.join(out, 'story.json'), JSON.stringify(story, null, 1));
  fs.writeFileSync(path.join(out, 'save-last.json'), await p.evaluate(() => localStorage.getItem('bubble-wash-dev-save')));
  log('errors', errs.length, errs.slice(0, 10));
  log('wall minutes', ((Date.now() - start) / 60000).toFixed(1));
  await b.close();
})();
