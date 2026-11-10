// A theme park (Chapter 3, Starlight Fun Park): no cars and no crops.
// Visitors come along the pavement and buy a ticket at the booth (the hero
// sells them, later the ticket seller), then go round the park's rides and
// stalls on their wish lists. A ride fills seat by seat and goes round when
// it's full, or when the hero (later the ride operator) pulls its lever: a
// full ride pays a bonus, and a lever pulled the moment the last seat fills
// is a perfect launch, with a tip.
// The shared pieces (the player, pads, cash piles, upgrades, staff, the
// camera, the side bar, the hero's career and the town's story) are the same
// as in the first two towns.
import { Vector3, type Object3D } from 'three';
import { Loop } from './loop';
import { GameClock } from './clock';
import { CHARACTERS, TUNING, UPGRADES, fixedSolids, type Point, type Rect } from './config';
import type { Game } from './game';
import type { GameState } from './gameState';
import type { Lifecycle } from './lifecycle';
import type { SaveManager } from './save';
import { townIds, type ParkTown } from './towns';
import { createMeta } from './meta';
import { createTown } from './town';
import { createPress } from './press';
import { createHero } from './hero';
import { createStoryline } from './storyline';
import { LotView, SIDE_BAR_PX } from './view';
import * as platform from '../platform/youtube';
import type { SoundManager } from '../audio/sound';
import type { Look, Stage } from '../render/stage';
import { withShadows } from '../render/stage';
import { CameraRig } from '../render/cameraRig';
import { Particles } from '../render/effects/particles';
import { parkland, ropes } from '../render/parkland';
import { loadPeople } from '../render/assets';
import { blobShadows } from '../render/models/actors';
import { skinnedToyMaterial } from '../render/models/build';
import { warmRigidSkin } from '../render/models/rigid';
import { PARK_SOLIDS, RideView, Spinners, overRide, parkPadModel } from '../render/models/park';
import { PadModel } from '../render/models/padModel';
import { PersonAvatar } from '../render/models/person';
import { perk } from '../systems/career';
import { CashSystem } from '../systems/cash';
import { carriedItems } from '../systems/carry';
import { takeFinished } from '../systems/construction';
import { levelFactor, levelStep, nextStars, tipFor } from '../systems/economy';
import { GuideHand, type GuideStep } from '../systems/guide';
import { Input } from '../systems/input';
import { NavGrid } from '../systems/nav';
import { IncomeTracker } from '../systems/offline';
import { PadSystem } from '../systems/pads';
import { ParkCrowd, middleOf, type Launch, type ParkAvatar, type ParkVisitor, type Ride } from '../systems/park';
import { Player } from '../systems/player';
import { StaffSystem } from '../systems/staff';
import { unlockedSum } from '../systems/arrivals';
import { insideRect } from '../systems/stations';
import type { Paid } from '../systems/till';
import { UpgradePads } from '../systems/upgrades';
import type { WalkUpCounter } from '../systems/walkups';
import { Floaters } from '../ui/carBubbles';
import { EdgePointer } from '../ui/edgePointer';
import { showEndScreen } from '../ui/endScreen';
import { openEmpireMap } from '../ui/empireMap';
import { Hud } from '../ui/hud';
import { t } from '../ui/strings';
import { UpgradePanel } from '../ui/upgradePanel';
import { WorldLabels, type Label } from '../ui/worldLabels';

const PARK = TUNING.park;
/** A new building grows into place over this long. */
const REVEAL_SECONDS = 0.6;
/** Upgrade pads appear once the candy floss cart is built (one thing at a time). */
const UPGRADES_AFTER = 'cart';
/** The newcomer's pointing hand helps until the ticket booth has a seller. */
const GUIDE_UNTIL = 'seller';
/** After the road to the next town is built, the hero sets off this long after (the pad's pop first). */
const TRAVEL_DELAY_MS = 1500;
/** Standing this close to a ride's lever spot is standing on it. */
const LEVER_REACH = 0.6;
/** Near a lever, the camera looks this far (a share of the way) from the hero towards the ride's middle. */
const LEVER_FOCUS = 0.55;
const LEVER_FOCUS_REACH = 1.4;
/** Visitors walk round each other and what's built, this far clear. */
const NAV_RADIUS = 0.35;
/** A child is drawn this much smaller. */
const CHILD_SCALE = 0.72;
/** A ride's sign floats this high over its middle. */
const RIDE_LABEL_Y = 6.4;

/** A bright summer's day at the fair: blue sky, white light, clear views. */
const PARK_LOOK: Look = {
  sky: 0xbfe6ff,
  fogNear: 80,
  fogFar: 190,
  skyLight: 0xf7fbff,
  groundLight: 0xa4cf8c,
  ambient: 1.35,
  sun: 0xfff1d6,
  sunStrength: 2.75,
};

export function createParkGame(
  container: HTMLElement,
  stage: Stage,
  state: GameState,
  lifecycle: Lifecycle,
  saves: SaveManager,
  sound: SoundManager,
  travelTo: (id: string) => Promise<void>,
  current: ParkTown,
): Game {
  const { layout } = current;
  // Everything this town puts on the page goes in here, so leaving the town removes it all at once.
  const root = document.createElement('div');
  root.className = 'game-root';
  container.prepend(root);
  const cleanups: (() => void)[] = [];
  stage.setLook(PARK_LOOK);
  stage.shadowArea(layout.lot);
  const clock = new GameClock();
  const tickers: ((dt: number) => void)[] = [];
  const rig = new CameraRig(stage.camera);
  const labels = new WorldLabels(root);
  const hud = new Hud(root, state.cash);
  const input = new Input(root, lifecycle);
  const effects = new Particles(stage.scene);
  blobShadows.attach(stage.scene);
  carriedItems.attach(stage.scene);
  warmRigidSkin(stage.scene, skinnedToyMaterial);
  const spinners = new Spinners();
  stage.scene.add(withShadows(parkland(layout, spinners), false, true));

  const level = (key: string) => state.levels[key] ?? 0;
  const player = new Player(stage.scene, layout.playerStart, TUNING.player, () => 1 + levelStep(UPGRADES.kinds.walk, level('player.walk')) + perk(state, 'walk'));
  player.onFootstep(() => sound.play('step'));
  const cash = new CashSystem(stage.scene, layout, TUNING.cash, state, effects, sound);
  const floaters = new Floaters(labels);
  const income = new IncomeTracker(TUNING.offline.incomeWindowSeconds, state.autoRate);
  const flag = (name: string): void => {
    if (state.flags.includes(name)) return;
    state.flags.push(name);
    void saves.saveNow();
  };
  const soldFlag = `served:${current.id}`;
  const launchedFlag = `launched:${current.id}`;
  const fullFlag = `fullhouse:${current.id}`;
  const count = (key: string, n = 1) => (state.counts[key] = (state.counts[key] ?? 0) + n);

  // The buildings: each pad's model grows into place, and what's solid about it stops the player (and visitors walk round).
  const solids: Rect[] = [];
  const growing: { mesh: Object3D; age: number }[] = [];
  const solid = (id: string, at: Point): void => {
    for (const [hw, hd, dx = 0, dz = 0] of PARK_SOLIDS[id] ?? []) {
      solids.push({ minX: at.x + dx - hw, maxX: at.x + dx + hw, minZ: at.z + dz - hd, maxZ: at.z + dz + hd });
    }
  };
  solid('gate', { x: (layout.gate.minX + layout.gate.maxX) / 2, z: layout.hedgeZ });
  for (const bed of layout.flowerBeds) solids.push({ minX: bed.x - 1, maxX: bed.x + 1, minZ: bed.z - 1, maxZ: bed.z + 1 });
  const grow = (mesh: Object3D, animate: boolean): void => {
    if (!animate) return;
    mesh.scale.setScalar(0.001);
    growing.push({ mesh, age: 0 });
  };
  const showBuilding = (id: string, animate: boolean): void => {
    const at = layout.buildAt[id] ?? layout.pads[id];
    const mesh = parkPadModel(id);
    if (!mesh || !at) return;
    mesh.position.set(at.x, 0, at.z);
    stage.scene.add(withShadows(mesh));
    spinners.watch(mesh);
    grow(mesh, animate);
    solid(id, at);
    stage.refreshShadows();
  };

  // Visitors: drawn once their models load (they're not in the first download). Some are children, smaller.
  let made = 0;
  let peopleReady = false;
  const makeAvatar = (child: boolean): ParkAvatar | null => {
    if (!peopleReady) return null;
    const avatar = new PersonAvatar(CHARACTERS.visitors[made++ % CHARACTERS.visitors.length]!, 'floss');
    if (child) avatar.root.scale.setScalar(CHILD_SCALE);
    stage.scene.add(avatar.root);
    return avatar;
  };
  // Visitors find their way round what's built (the grid is made again when something new goes up).
  let nav: NavGrid | null = null;
  let navSolids = -1;
  const route = (from: Point, to: Point): Point[] => {
    if (!nav || navSolids !== solids.length) {
      nav = new NavGrid(layout.walk, [...solids, ...fixedSolids(layout)], NAV_RADIUS);
      navSolids = solids.length;
    }
    return nav.findPath(from, to);
  };

  const onPaid = (paid: Paid): void => {
    if (paid.automated) income.add(clock.now, paid.amount);
    meta.onPaid(paid);
    town.onPaid(paid);
  };
  const quality = (id: string) => levelFactor(UPGRADES.kinds.quality, level(`${id}.quality`));
  const payBonus = () => 1 + unlockedSum(state, (e) => e.payBonus);
  const onServed = (visitor: ParkVisitor, counter: WalkUpCounter): void => {
    const ticket = counter === crowd.booth;
    const base = ticket ? visitor.basePay : PARK.cart.price;
    const pay = Math.round(base * quality(counter.id) * payBonus() * (crowd.rush?.payMultiplier ?? 1));
    const tip = tipFor(pay, visitor.patience / visitor.patienceMax, TUNING.customers);
    cash.add(counter.id, pay + tip);
    const at = layout.piles[counter.id] ?? counter.at;
    floaters.show(`+$${pay} ${ticket ? '🎟️' : '🍭'}`, new Vector3(at.x, 1.2, at.z), 'cash');
    if (tip > 0) floaters.show(`+$${tip} tip`, new Vector3(at.x + 0.6, 1.9, at.z), 'tip');
    state.stars = nextStars(state.stars, tip > 0 ? 'happy' : 'okay', TUNING.stars);
    if (visitor.manual) flag(soldFlag);
    sound.play('ching');
    onPaid({ amount: pay + tip, tip, automated: !visitor.manual, at });
  };
  const onGaveUp = (visitor: ParkVisitor): void => {
    state.stars = nextStars(state.stars, 'angry', TUNING.stars);
    floaters.show('😠', new Vector3(visitor.at.x, 2.2, visitor.at.z), 'star');
    sound.play('pop');
  };
  const onLaunch = (ride: Ride, launch: Launch): void => {
    const rules = PARK.rides;
    const seat = ride.def.price * quality(ride.id) * payBonus() * (crowd.rush?.payMultiplier ?? 1);
    const pay = Math.round(launch.riders * seat * (launch.full ? 1 + rules.fullBonus : 1));
    const tip = launch.perfect ? Math.round(pay * rules.perfectTip) : 0;
    cash.add(ride.id, pay + tip);
    const at = layout.piles[ride.id] ?? ride.spot.lever;
    floaters.show(`+$${pay} ${ride.def.icon}`, new Vector3(at.x, 1.2, at.z), 'cash');
    const top = overRide(ride, 4.6);
    if (launch.full) floaters.show(`🎉 ${t('fullHouse')}`, top, 'star');
    if (launch.perfect) {
      floaters.show(`⭐ ${t('perfectLaunch')} +$${tip}`, new Vector3(top.x, top.y + 0.9, top.z), 'tip');
      effects.burst('sparkle', new Vector3(ride.spot.lever.x, 1.4, ride.spot.lever.z), 18, 4, 0.9);
    }
    effects.burst('sparkle', new Vector3(ride.spot.at.x, 3.8, ride.spot.at.z), launch.full ? 26 : 10, 5, 1.2);
    count('riders', launch.riders);
    if (launch.full) {
      count('fullhouse');
      flag(fullFlag);
    }
    if (launch.perfect) count('perfect');
    if (launch.by === 'hero') flag(launchedFlag);
    state.stars = nextStars(state.stars, launch.full ? 'happy' : 'okay', TUNING.stars);
    sound.play(launch.full ? 'mission' : 'ching');
    onPaid({ amount: pay + tip, tip, automated: launch.by !== 'hero', at });
  };
  const crowd = new ParkCrowd(
    layout,
    state,
    () => unlockedSum(state, (e) => e.arrivalBonus),
    () => unlockedSum(state, (e) => e.patienceBonus),
    makeAvatar,
    route,
    {
      onServed,
      onGaveUp,
      onLaunch,
      onPerfectDay: (visitor) => {
        floaters.show('❤️', new Vector3(visitor.at.x, 2.3, visitor.at.z), 'star');
        state.stars = nextStars(state.stars, 'happy', TUNING.stars);
        count('perfectDay');
      },
    },
  );
  // The dev console and the play-test bot look at the crowd.
  if (import.meta.env.DEV) (window as unknown as { park: ParkCrowd }).park = crowd;
  loadPeople(CHARACTERS.visitors)
    .then(() => {
      peopleReady = crowd.open = true;
      if (!state.flags.includes(soldFlag)) crowd.parkFirst();
    })
    .catch((error) => platform.logWarning(error));

  const staff = new StaffSystem(stage.scene, layout, state, labels, cash);
  /** The operator's lever spot, if they're standing on it. */
  const operatorAt = (): Point | null => {
    const avatar = staff.avatarOf('operator');
    return avatar ? { x: avatar.root.position.x, z: avatar.root.position.z } : null;
  };
  // The ride operator's round: to the lever of the ride that needs launching (full, or a rider kept waiting longest).
  staff.walkPlans.operator = () => {
    const ready = crowd.rides.filter((r) => r.phase === 'loading' && r.seated > 0);
    if (ready.length === 0) return null;
    const best = ready.reduce((a, b) => (Number(b.full) - Number(a.full) || b.waited - a.waited) > 0 ? b : a);
    return best.spot.lever;
  };
  const near = (p: Point | null, q: Point, reach: number) => !!p && Math.hypot(p.x - q.x, p.z - q.z) <= reach;

  // Rides: the model turning, the lever, its pad ring, the queue ropes, and a sign over it saying how full it is.
  const rideViews: { ride: Ride; view: RideView; pad: PadModel; sign: { el: HTMLElement; label: Label; shown: string } }[] = [];
  const addRide = (id: string, kind: string, animate: boolean): void => {
    const ride = crowd.addRide(id, kind);
    if (!ride) return;
    const view = new RideView(ride, stage.scene);
    stage.scene.add(view.group);
    grow(view.group, animate);
    const pad = new PadModel(1.1, 0xffd24a);
    pad.group.position.set(ride.spot.lever.x, 0, ride.spot.lever.z);
    stage.scene.add(pad.group);
    stage.scene.add(withShadows(ropes(ride.spot.ropes)));
    const el = document.createElement('div');
    el.className = 'shelf-stock ride-sign';
    const label = labels.add(el, overRide(ride, RIDE_LABEL_Y));
    rideViews.push({ ride, view, pad, sign: { el, label, shown: '' } });
    solid(id, ride.spot.at);
    const leverAt = ride.spot.lever;
    const toRide = Math.atan2(ride.spot.at.x - leverAt.x, ride.spot.at.z - leverAt.z);
    const box = { x: leverAt.x + Math.sin(toRide) * 0.65, z: leverAt.z + Math.cos(toRide) * 0.65 };
    solids.push({ minX: box.x - 0.32, maxX: box.x + 0.32, minZ: box.z - 0.3, maxZ: box.z + 0.3 });
    stage.refreshShadows();
  };
  const showRides = (): void => {
    for (const { ride, sign } of rideViews) {
      const { icon, seats } = ride.def;
      const text =
        ride.phase === 'running'
          ? t('rideRunning', { icon })
          : ride.full
            ? t(state.unlocked.includes('operator') ? 'rideFull' : 'rideFullPull', { icon })
            : t('rideLoading', { icon, seated: ride.seated, seats });
      if (text === sign.shown) continue;
      sign.shown = text;
      sign.el.textContent = text;
      sign.el.classList.toggle('is-full', ride.full && ride.phase === 'loading');
      labels.remeasure(sign.label);
    }
  };

  const addBuilt = (id: string, animate: boolean): void => {
    const effects = current.pads.find((p) => p.id === id)?.effects;
    if (effects?.ride) addRide(id, effects.ride, animate);
    else showBuilding(id, animate);
    if (effects?.counter) crowd.addCounter(id, effects.counter, labels);
    if (layout.benches[id]) crowd.addBenches(id);
    staff.hire(id);
  };
  // The ticket booth and the carousel come with the park: there the moment the hero arrives.
  for (const pad of current.pads) if (pad.cost === 0 && !state.unlocked.includes(pad.id)) state.unlocked.push(pad.id);
  for (const id of state.unlocked) addBuilt(id, false);

  const pads = new PadSystem(
    stage.scene,
    layout,
    TUNING.pads,
    state,
    effects,
    sound,
    labels,
    (id) => {
      addBuilt(id, true);
      view.refit();
      void saves.saveNow();
      const done = current.pads.find((p) => p.id === id)?.effects;
      if (done?.endOfContent) {
        flag(`ended:${current.id}`);
        showEndScreen(root, () => meta.screenClosed(), { title: t('endTitlePark'), body: t('endBodyPark') });
      }
      const next = done?.travel;
      if (next && townIds().includes(next)) {
        flag(`ended:${current.id}`);
        setTimeout(() => void travelTo(next), TRAVEL_DELAY_MS);
      }
    },
    () => {
      stage.refreshShadows();
      view.refit();
      void saves.saveNow();
    },
  );
  const finishBuilds = (): void => {
    for (const id of takeFinished(state, Date.now())) pads.finishConstruction(id);
  };

  const panel = new UpgradePanel(root, (key) => upgrades.buy(key), () => {});
  const upgrades = new UpgradePads(
    stage.scene,
    layout,
    state,
    panel,
    labels,
    sound,
    effects,
    () => {
      meta.onUpgrade();
      void saves.saveNow();
    },
    UPGRADES_AFTER,
  );

  const view = new LotView(stage, rig, layout, state, () => [...(pads.footprint ? [pads.footprint] : []), ...upgrades.footprints()]);
  view.fitScreen();
  view.refit(player.position);
  stage.onResize(() => {
    view.fitScreen();
    rig.snap(player.position);
  });

  /** How hard each counter is worked this frame: the hero behind it, or a worker (the faster counts), sped up by its upgrade. */
  const work = (counter: WalkUpCounter): { rate: number; byPlayer: boolean } => {
    const byStaff = staff.rateFor(counter);
    const byPlayer = insideRect(player.position, counter.zone) ? 1 : 0;
    const speed = levelFactor(UPGRADES.kinds.speed, level(`${counter.id}.speed`));
    return { rate: Math.max(byStaff, byPlayer) / speed, byPlayer: byPlayer > 0 && byPlayer >= byStaff };
  };
  const lever = (ride: Ride) => ({
    hero: near(player.position, ride.spot.lever, LEVER_REACH),
    staff: near(operatorAt(), ride.spot.lever, LEVER_REACH),
  });

  /** At a ride's lever, the camera eases over to show the whole ride, not just the hero beside it. */
  const leverFocus = (): Point | null => {
    const ride = crowd.rides.find((r) => near(player.position, r.spot.lever, LEVER_FOCUS_REACH));
    if (!ride) return null;
    const { x, z } = player.position;
    return { x: x + (ride.spot.at.x - x) * LEVER_FOCUS, z: z + (ride.spot.at.z - z) * LEVER_FOCUS };
  };

  const pointer = new EdgePointer(root);
  // A pointing hand for a newcomer: sell the tickets, launch the carousel, collect the cash, then build.
  const hand = new GuideHand(labels);
  const guide = (): GuideStep | null => {
    if (state.unlocked.includes(GUIDE_UNTIL)) return null;
    const booth = crowd.booth;
    const carousel = crowd.rides[0];
    if (booth?.front && !state.flags.includes(soldFlag)) return { at: middleOf(booth.zone), text: 'guideTickets' };
    if (carousel && carousel.phase === 'loading' && carousel.seated > 0 && !state.flags.includes(launchedFlag)) return { at: carousel.spot.lever, text: 'guideLever' };
    const pile = cash.fullestPile();
    if (pile) return { at: pile.at, text: 'guideCash' };
    // Someone waiting at a window with nobody behind it.
    const waiting = crowd.counters.find((c) => c.front && staff.rateFor(c) === 0 && !insideRect(player.position, c.zone));
    if (waiting) return { at: middleOf(waiting.zone), text: waiting === booth ? 'guideTickets' : 'guideCart' };
    const next = pads.next;
    return next && state.cash >= next.owed ? { at: next.at, text: 'guideBuild' } : null;
  };
  const meta = createMeta({ root, state, saves, sound, traffic: null, pads, supplies: null, setBoost: (m) => (crowd.boost = m) });
  const town = createTown({
    root,
    scene: stage.scene,
    layout,
    state,
    labels,
    sound,
    save: () => void saves.saveNow(),
    rewarded: (id) => meta.rewarded(id),
  });
  const press = createPress(root, sound, () => meta.screenClosed());
  const empireMap = (): void => openEmpireMap({ root, state, sound, town: current, travel: (id) => travelTo(id) });
  const hero = createHero({ root, state, town: current, sound, press, flag, save: () => saves.saveNow(), onChipTap: empireMap });
  const storyline = createStoryline({ state, town: current, press, arrivals: crowd, flag });

  let rateTimer = 0;
  let buildTimer = 0;
  const fixed = fixedSolids(layout);
  const loop = new Loop((dt) => {
    clock.advance(dt);
    state.playSeconds += dt;
    const move = input.read();
    player.update(dt, move, [...solids, ...fixed], view.walkable);
    pads.update(dt, player.position);
    upgrades.update(dt, player.position);
    staff.update(dt, crowd.counters, null, solids, (counter) => insideRect(player.position, counter.zone), null, []);
    for (const ride of crowd.rides) ride.timeScale = levelFactor(UPGRADES.kinds.speed, level(`${ride.id}.speed`));
    player.scrubbing = crowd.update(dt, work, lever);
    for (const { ride, view: rideView, pad } of rideViews) {
      rideView.update();
      pad.update(dt, near(player.position, ride.spot.lever, LEVER_REACH));
    }
    showRides();
    spinners.update(dt);
    if (cash.update(player.position)) flag('collected');
    floaters.update(dt);
    buildTimer -= dt;
    if (buildTimer <= 0) {
      buildTimer = 0.5;
      finishBuilds();
    }
    rateTimer += dt;
    if (rateTimer >= 5) {
      rateTimer = 0;
      state.autoRate = income.perMinute(clock.now);
    }
    for (const g of [...growing]) {
      g.age = Math.min(REVEAL_SECONDS, g.age + dt);
      const k = g.age / REVEAL_SECONDS - 1;
      g.mesh.scale.setScalar(Math.max(0.001, 1 + 2.9 * k * k * k + 1.9 * k * k));
      if (g.age >= REVEAL_SECONDS) growing.splice(growing.indexOf(g), 1);
    }
    if (growing.length > 0) stage.refreshShadows();
    effects.update(dt);
    saves.update(dt);
    meta.update(dt);
    storyline.update(dt);
    hero.update(dt);
    press.update(dt);
    town.update(dt, player.position);
    view.update(dt, leverFocus() ?? player.position);
    blobShadows.update();
    carriedItems.update();
    stage.render();
    labels.update(stage.camera, stage.size.width, stage.size.height);
    const step = guide();
    hand.point(step);
    const next = pads.next;
    const goal = step?.at ?? (next && state.cash >= next.owed ? next.at : null);
    pointer.update(stage.camera, stage.size.width, stage.size.height, goal, { top: view.topInset, right: SIDE_BAR_PX });
    hud.update(dt, state.cash, state.stars, state.gems);
    for (const ticker of tickers) ticker(dt);
  }, (error) => platform.logError(error));

  // Any tap or key unlocks audio (browsers need a gesture first).
  const unlockAudio = (): void => {
    if (!lifecycle.paused) sound.unlock();
  };
  root.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);
  cleanups.push(() => window.removeEventListener('keydown', unlockAudio));
  cleanups.push(
    lifecycle.onPause(() => {
      loop.stop();
      root.classList.add('is-paused');
      sound.setPaused(true);
      void saves.saveNow();
    }),
    lifecycle.onResume(() => {
      root.classList.remove('is-paused');
      sound.setPaused(false);
      loop.start();
    }),
  );

  return {
    stage,
    clock,
    player,
    traffic: null,
    staff,
    welcomeBack: (earned) => meta.welcomeBack(earned),
    get frameMs() {
      return loop.busyMs;
    },
    get frameErrors() {
      return { count: loop.errors, last: loop.lastError };
    },
    renderOnce() {
      stage.renderer.compile(stage.scene, stage.camera);
      blobShadows.update();
      carriedItems.update();
      stage.render();
      labels.update(stage.camera, stage.size.width, stage.size.height);
    },
    start() {
      if (!lifecycle.paused) loop.start();
    },
    addTicker: (ticker) => void tickers.push(ticker),
    dispose() {
      loop.stop();
      for (const cleanup of cleanups) cleanup();
      input.dispose();
      panel.dispose();
      // The scene first, while the blob shadows are still in it, so the renderer lets go of everything.
      stage.reset();
      blobShadows.detach();
      carriedItems.detach();
      tickers.length = 0;
      root.remove();
    },
  };
}
