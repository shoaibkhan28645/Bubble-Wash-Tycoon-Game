import { Loop } from './loop';
import * as platform from '../platform/youtube';
import { GameClock } from './clock';
import { CARS, CHARACTERS, TUNING, UPGRADES, fixedSolids, roadLaneAt, type Point, type Rect } from './config';
import type { Game } from './game';
import { townIds, type RoadsideTown } from './towns';

/** The truck to the next town drives off this long after it pops in. */
const TRAVEL_DELAY_MS = 1500;
import type { GameState } from './gameState';
import type { Lifecycle } from './lifecycle';
import type { SaveManager } from './save';
import type { SoundManager } from '../audio/sound';
import type { Stage } from '../render/stage';
import { CameraRig } from '../render/cameraRig';
import { terrain } from '../render/terrain';
import { Particles } from '../render/effects/particles';
import { Hud } from '../ui/hud';
import { WorldLabels } from '../ui/worldLabels';
import { Input } from '../systems/input';
import { Player } from '../systems/player';
import { Car, CarPool } from '../systems/cars';
import { RoadRules } from '../systems/roadRules';
import { CashSystem } from '../systems/cash';
import { Traffic, type Paid, type Work } from '../systems/traffic';
import { insideRect, type Station } from '../systems/stations';
import { IncomeTracker } from '../systems/offline';
import { createJobs } from './jobs';
import { EventChips } from '../ui/eventChips';
import { tutorialActive } from '../systems/guide';
import { Floaters } from '../ui/carBubbles';
import { Carrier, carriedItems } from '../systems/carry';
import { Supplies } from '../systems/supplies';
import { StaffSystem } from '../systems/staff';
import { UpgradePads } from '../systems/upgrades';
import { UpgradePanel } from '../ui/upgradePanel';
import { showEndScreen } from '../ui/endScreen';
import { levelStep } from '../systems/economy';
import { perk } from '../systems/career';
import { Buildings } from '../systems/buildings';
import { PadSystem } from '../systems/pads';
import { createMeta } from './meta';
import { WashSounds } from '../audio/washSounds';
import { WaitingDrivers } from '../systems/waitingDrivers';
import { NavGrid } from '../systems/nav';
import { PersonAvatar } from '../render/models/person';
import { loadPeople } from '../render/assets';
import { CarModel, blobShadows } from '../render/models/actors';
import { FuelHoses } from '../render/models/fuel';
import { ConstructionSites } from '../render/models/site';
import { takeFinished } from '../systems/construction';
import { createMart } from './shops';
import { EdgePointer } from '../ui/edgePointer';
import { createTown } from './town';
import { createOnboarding, type Onboarding } from './onboarding';
import { createPress } from './press';
import { createHero } from './hero';
import { createStoryline } from './storyline';
import { openEmpireMap } from '../ui/empireMap';
import { createStreetLife } from './streetLife';
import { LotView, SIDE_BAR_PX } from './view';


/** Builds the car wash town (Chapter 1) and its loop, and wires pause/resume to loop, audio, input and saving. */
export function createRoadsideGame(
  container: HTMLElement,
  /** The renderer and scene, shared by every town in the session. */
  stage: Stage,
  state: GameState,
  lifecycle: Lifecycle,
  saves: SaveManager,
  sound: SoundManager,
  /** Takes the hero to another town (the empire map's travel buttons). */
  travelTo: (id: string) => Promise<void>,
  current: RoadsideTown,
): Game {
  const { layout } = current;
  // Everything this town puts on the page goes in here, so leaving the town removes it all at once.
  const root = document.createElement('div');
  root.className = 'game-root';
  // First, under the page's other overlays (the debug panel stays on top after a trip).
  container.prepend(root);
  /** Undone when the town is taken down. */
  const cleanups: (() => void)[] = [];
  stage.shadowArea({ ...layout.lot, minZ: layout.walk.minZ });
  const clock = new GameClock();
  const tickers: ((dt: number) => void)[] = [];
  const rig = new CameraRig(stage.camera);
  const labels = new WorldLabels(root);
  const hud = new Hud(root, state.cash);
  const input = new Input(root, lifecycle);
  const effects = new Particles(stage.scene);
  CarModel.exhaust = (at, back) => effects.puff(at, back);
  blobShadows.attach(stage.scene);
  carriedItems.attach(stage.scene);

  const bayIds = current.pads.filter((pad) => pad.effects.bay).map((pad) => pad.effects.bay!);
  stage.scene.add(terrain(layout, bayIds.map((id) => layout.pads[id]!.x), layout.pads.tunnel?.x ?? null));
  const level = (key: string) => state.levels[key] ?? 0;
  // Walk upgrades and the Entrepreneur rank add speed.
  const player = new Player(stage.scene, layout.playerStart, TUNING.player, () => 1 + perk(state, 'walk'));
  player.onFootstep(() => sound.play('step'));
  const playerCarry = new Carrier(
    player.mesh,
    () => player.position,
    () => TUNING.supplies.carryBase + levelStep(UPGRADES.kinds.carry, level('player.carry')),
  );
  const buildings = new Buildings(stage.scene, layout);
  const cash = new CashSystem(stage.scene, layout, TUNING.cash, state, effects, sound);
  const floaters = new Floaters(labels);
  const income = new IncomeTracker(TUNING.offline.incomeWindowSeconds, state.autoRate);
  /** Records a one-off milestone (tutorial steps, end of content) and saves it. */
  const flag = (name: string): void => {
    if (state.flags.includes(name)) return;
    state.flags.push(name);
    void saves.saveNow();
  };
  /** Set up once the free first bay is built (before the first frame). */
  let onboarding: Onboarding | null = null;
  const { mart, loadShoppers } = createMart({ scene: stage.scene, layout, state, labels, floaters, sound });
  const pool = new CarPool(stage.scene);
  const onPaid = (paid: Paid): void => {
    // The town's steady staff takings: what it earns while the hero is elsewhere (one-offs left out).
    if (paid.automated && !paid.bonus) income.add(clock.now, paid.amount);
    else flag('washed');
    meta.onPaid(paid);
    town.onPaid(paid);
    onboarding?.onPaid(paid);
  };
  /** Every car's footprint this frame: nobody walks through a car, parked or moving. */
  let carRects: Rect[] = [];
  // Drivers who get out while they wait in line: a can from the vending machine, a seat on the bench.
  let driversMade = 0;
  const drivers = new WaitingDrivers(
    layout,
    (id) => state.unlocked.includes(id),
    () => {
      const avatar = new PersonAvatar(CHARACTERS.shoppers[driversMade++ % CHARACTERS.shoppers.length]!, 'soda');
      stage.scene.add(avatar.root);
      return avatar;
    },
    // Round what's built and round the cars (a driver from the far bay walks round the near bay's line).
    (from: Point, to: Point) => new NavGrid(layout.walk, [...buildings.obstacles(), ...fixedSolids(layout), ...carRects], 0.3).findPath(from, to),
    (at) => traffic.sellSnack(at),
  );
  /** Their people load once there's something to get out for. */
  const loadDrivers = (): void => {
    if (drivers.ready || !state.unlocked.includes('vending')) return;
    loadPeople(CHARACTERS.shoppers)
      .then(() => (drivers.ready = true))
      .catch((error) => platform.logWarning(error));
  };
  const traffic = new Traffic(pool, layout, state, cash, effects, sound, labels, floaters, onPaid, mart, drivers);
  const street = createStreetLife(stage.scene, layout, pool, () => carRects);

  const staff = new StaffSystem(stage.scene, layout, state, labels, cash);
  Car.rules = new RoadRules(
    () => pool.active,
    () => [player.position, ...staff.positions(), ...mart.positions(), ...drivers.positions(), ...street.people()],
    (p) => roadLaneAt(layout, p),
  );

  const addBuilt = (id: string, animate: boolean): void => {
    buildings.show(id, animate);
    traffic.addStation(id);
    staff.hire(id);
    if (id === 'vending') loadDrivers();
  };
  for (const id of state.unlocked) addBuilt(id, false);

  const sites = new ConstructionSites(stage.scene, labels, layout);
  for (const id of Object.keys(state.building)) sites.show(id);
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
      onboarding?.onBuilt(id);
      void saves.saveNow();
      const effects = current.pads.find((p) => p.id === id)?.effects;
      if (effects?.endOfContent) {
        flag('ended');
        showEndScreen(root, () => meta.screenClosed());
      }
      // The truck to the next town: off the hero goes, once it has popped in. A town this version doesn't have yet
      // ends the content instead.
      const next = effects?.travel;
      if (next) {
        flag('ended');
        if (townIds().includes(next)) setTimeout(() => void travelTo(next), TRAVEL_DELAY_MS);
        else showEndScreen(root, () => meta.screenClosed());
      }
    },
    (id) => {
      sites.show(id);
      stage.refreshShadows();
      if (id === 'mart') loadShoppers();
      view.refit();
      void saves.saveNow();
    },
  );
  /** Buildings whose construction finished (also while the game was closed) open now. */
  const finishBuilds = (): void => {
    for (const id of takeFinished(state, Date.now())) {
      sites.remove(id);
      pads.finishConstruction(id);
    }
  };

  const panel = new UpgradePanel(root, (key) => upgrades.buy(key), () => {});
  const upgrades = new UpgradePads(stage.scene, layout, state, panel, labels, sound, effects, () => {
    meta.onUpgrade();
    flag('upgraded');
    void saves.saveNow();
  });

  const view = new LotView(stage, rig, layout, state, () => [...(pads.footprint ? [pads.footprint] : []), ...upgrades.footprints()]);
  view.fitScreen();
  // Builds the free first bay before the first frame.
  pads.update(0, player.position);
  view.refit(player.position);
  stage.onResize(() => {
    view.fitScreen();
    rig.snap(player.position);
  });

  /** Who is working each station this frame: the player, staff, or both (the faster counts). */
  const work = (station: Station): Work => {
    const byStaff = staff.rateFor(station);
    const byPlayer = insideRect(player.position, station.zone) ? 1 : 0;
    return { rate: Math.max(byStaff, byPlayer), byPlayer: byPlayer > 0 && byPlayer >= byStaff };
  };
  const supplies = new Supplies(state, layout, () => traffic.all(), sound, labels, (carrier) => {
    if (carrier === playerCarry) flag('supplied');
  });
  const pointer = new EdgePointer(root);
  const hoses = new FuelHoses(stage.scene, layout);
  const washSounds = new WashSounds(sound);
  const meta = createMeta({ root, state, saves, sound, traffic, pads, supplies, setBoost: (m) => (traffic.boost = m) });
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

  // Rush jobs: whenever the next purchase is a while off, a short job for the hero (spilled soap to gather up).
  // The people in rush jobs (a trucker, a lost driver): the shoppers, loaded once there's a Mini-Mart to send them to.
  let shoppers: 'no' | 'loading' | 'ready' = 'no';
  const shoppersReady = (): boolean => {
    if (shoppers === 'no' && state.unlocked.includes('mart')) {
      shoppers = 'loading';
      loadPeople(CHARACTERS.shoppers)
        .then(() => (shoppers = 'ready'))
        .catch((error) => platform.logWarning(error));
    }
    return shoppers === 'ready';
  };
  const vip = CARS.find((car) => car.id === 'vip');
  const jobs = createJobs({
    root,
    scene: stage.scene,
    labels,
    chips: new EventChips(root),
    state,
    layout,
    town: 'carWash',
    pads,
    hero: { position: () => player.position, mesh: player.mesh, speed: () => player.topSpeed },
    effects,
    floaters,
    sound,
    makePerson: () => (shoppersReady() ? new PersonAvatar(CHARACTERS.shoppers[(state.counts.jobs ?? 0) % CHARACTERS.shoppers.length]!, null) : null),
    // A dusty golden VIP car, parked, that comes clean as the hero polishes it.
    makeThing: (kind) => {
      if (kind !== 'vip' || !vip) return null;
      const car = new CarModel();
      car.setType(vip);
      car.setClean(vip.dirt, 0);
      car.mesh.userData.progress = (share: number) => car.setClean(vip.dirt, share);
      return car.mesh;
    },
    people: shoppersReady,
    allowed: () => !tutorialActive(state),
    blocked: () => false,
    solids: () => [...buildings.obstacles(), ...fixed],
    mentor: current.story.mentor,
    onPaid: (amount, at) => meta.onPaid({ amount, tip: 0, automated: false, at, bonus: true }),
    onDone: () => meta.count('jobs'),
    double: (pay) => meta.doubleJob(pay),
    save: () => void saves.saveNow(),
  });

  onboarding = createOnboarding({ root, labels, layout, state, traffic, cash, pads, playerCarry, flag });

  // The hero's career and the town's story, both told in the town paper. Closing a card is a break between
  // screens, so an interstitial may follow.
  const press = createPress(root, sound, () => meta.screenClosed());
  const empireMap = (): void => openEmpireMap({ root, state, sound, town: current, travel: (id) => travelTo(id) });
  const hero = createHero({ root, state, town: current, sound, press, flag, save: () => saves.saveNow(), onChipTap: empireMap });
  const storyline = createStoryline({ state, town: current, press, arrivals: traffic.arrivals, flag });

  let rateTimer = 0;
  let buildTimer = 0;
  const fixed = fixedSolids(layout);
  const loop = new Loop((dt) => {
    clock.advance(dt);
    state.playSeconds += dt;
    carRects = [...pool.active].filter((car) => car.model.mesh.visible && car.state !== 'angry').map((car) => car.footprint);
    player.update(dt, input.read(), [...buildings.obstacles(), ...fixed, ...carRects, ...jobs.solids()], view.walkable);
    pads.update(dt, player.position);
    upgrades.update(dt, player.position);
    staff.update(dt, traffic.all(), supplies, buildings.obstacles(), (station) => insideRect(player.position, station.zone), traffic.valetCall, carRects);
    supplies.update(dt, [playerCarry, ...staff.carriers()]);
    playerCarry.update(dt, player.isMoving);
    // Washing a car, or working at a rush job (polishing the VIP car).
    player.scrubbing = traffic.update(dt, work, supplies) || jobs.working;
    street.update(dt);
    hoses.update(traffic.forecourt.pumps);
    washSounds.update(dt, player.scrubbing);
    if (cash.update(player.position)) flag('collected');
    const guide = onboarding?.update() ?? null;
    floaters.update(dt);
    buildTimer -= dt;
    if (buildTimer <= 0) {
      buildTimer = 0.5;
      finishBuilds();
    }
    sites.update(state, Date.now());
    rateTimer += dt;
    if (rateTimer >= 5) {
      rateTimer = 0;
      state.autoRate = income.perMinute(clock.now);
    }
    // The shadow map only changes while a new building pops in.
    const busy = { tunnel: traffic.tunnelBusy, dryer: traffic.busy('dryer'), wax: traffic.busy('wax') };
    if (buildings.update(dt, busy)) stage.refreshShadows();
    effects.update(dt);
    saves.update(dt);
    meta.update(dt);
    storyline.update(dt);
    hero.update(dt);
    press.update(dt);
    town.update(dt, player.position);
    jobs.update(dt, stage.camera, stage.size.width, stage.size.height, { top: view.topInset, right: SIDE_BAR_PX });
    view.update(dt, player.position);
    blobShadows.update();
    carriedItems.update();
    stage.render();
    labels.update(stage.camera, stage.size.width, stage.size.height);
    // Off screen, the tutorial's next step or a pad the player can now afford gets an arrow at the edge.
    const next = pads.next;
    const goal = guide?.at ?? (next && state.cash >= next.owed ? next.at : null);
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
    traffic,
    staff,
    jobs,
    welcomeBack: (earned) => meta.welcomeBack(earned),
    get frameMs() {
      return loop.busyMs;
    },
    get frameErrors() {
      return { count: loop.errors, last: loop.lastError };
    },
    renderOnce() {
      // Compile every material now, behind the loading screen, not mid-game.
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
      jobs.dispose();
      // The scene first, while the blob shadows are still in it, so the renderer lets go of everything.
      stage.reset();
      blobShadows.detach();
      carriedItems.detach();
      Car.rules = null;
      CarModel.exhaust = null;
      tickers.length = 0;
      root.remove();
    },
  };
}
