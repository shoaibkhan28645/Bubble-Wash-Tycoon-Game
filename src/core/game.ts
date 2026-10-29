import { Loop } from './loop';
import { GameClock } from './clock';
import { LOCATION1, PADS, TUNING, UPGRADES, type Rect } from './config';
import type { GameState } from './gameState';
import type { Lifecycle } from './lifecycle';
import type { SaveManager } from './save';
import type { SoundManager } from '../audio/sound';
import { createStage, type Stage } from '../render/stage';
import { CameraRig } from '../render/cameraRig';
import { terrain } from '../render/terrain';
import { Particles } from '../render/effects/particles';
import { Hud } from '../ui/hud';
import { WorldLabels } from '../ui/worldLabels';
import { Input } from '../systems/input';
import { Player } from '../systems/player';
import { CarPool } from '../systems/cars';
import { CashSystem } from '../systems/cash';
import { Traffic, type Work } from '../systems/traffic';
import { insideRect, type Station } from '../systems/stations';
import { IncomeTracker } from '../systems/offline';
import { Floaters } from '../ui/carBubbles';
import { Carrier } from '../systems/carry';
import { Supplies } from '../systems/supplies';
import { StaffSystem } from '../systems/staff';
import { UpgradePads } from '../systems/upgrades';
import { UpgradePanel } from '../ui/upgradePanel';
import { GuideHand, guideTarget, tutorialActive, type GuideView } from '../systems/guide';
import { showEndScreen } from '../ui/endScreen';
import { levelStep } from '../systems/economy';
import { Buildings } from '../systems/buildings';
import { PadSystem } from '../systems/pads';
import { createMeta } from './meta';
import { WashSounds } from '../audio/washSounds';
import { blobShadows } from '../render/models/actors';
import { FuelHoses } from '../render/models/fuel';
import { ConstructionSites } from '../render/models/site';
import { takeFinished } from '../systems/construction';
import { createMart } from './shops';
import { EdgePointer } from '../ui/edgePointer';
import { createTown } from './town';

/** Width of the side button column plus its margins, in CSS pixels. */
const SIDE_BAR_PX = 64;
/** Height of the cash and stars bar at the top (the forecourt across the road sits just under it). */
const HUD_PX = 56;
/** On a tall screen the town goals bar sits under it. */
const GOALS_BAR_PX = 40;
/** How far past the built area the following camera may look, in metres. */
const CAMERA_MARGIN = 2.5;
/** More at the back: tall things there (the canopy's sign, the tunnel's) rise up the screen past their footprint. */
const CAMERA_BACK_MARGIN = 6;

export interface Game {
  readonly stage: Stage;
  readonly clock: GameClock;
  readonly player: Player;
  /** Offline earnings screen (cash already banked), with Collect 2×. */
  welcomeBack(earned: { cash: number; seconds: number }): void;
  /** Cars, stations and staff (the dev console and play-test bot look at them). */
  readonly traffic: Traffic;
  readonly staff: StaffSystem;
  /** Average JavaScript milliseconds per frame, for the debug panel. */
  readonly frameMs: number;
  /** Draws one frame without starting the loop (behind the loading screen). */
  renderOnce(): void;
  start(): void;
  /** Extra per-frame work, e.g. the debug overlay. */
  addTicker(ticker: (dt: number) => void): void;
}

/** Builds location 1 and the loop, and wires pause/resume to loop, audio, input and saving. */
export function createGame(
  root: HTMLElement,
  state: GameState,
  lifecycle: Lifecycle,
  saves: SaveManager,
  sound: SoundManager,
): Game {
  const layout = LOCATION1;
  const stage = createStage(root);
  stage.shadowArea({ ...layout.lot, minZ: layout.walk.minZ });
  const clock = new GameClock();
  const tickers: ((dt: number) => void)[] = [];
  const rig = new CameraRig(stage.camera);
  const labels = new WorldLabels(root);
  const hud = new Hud(root, state.cash);
  const input = new Input(root, lifecycle);
  const effects = new Particles(stage.scene);
  blobShadows.attach(stage.scene);

  const bayIds = PADS.filter((pad) => pad.effects.bay).map((pad) => pad.effects.bay!);
  stage.scene.add(terrain(layout, bayIds.map((id) => layout.pads[id]!.x)));
  const level = (key: string) => state.levels[key] ?? 0;
  const player = new Player(stage.scene, layout.playerStart, TUNING.player, () => 1 + levelStep(UPGRADES.kinds.walk, level('player.walk')));
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
  const { mart, loadShoppers } = createMart({ scene: stage.scene, layout, state, labels, floaters, sound });
  const traffic = new Traffic(
    new CarPool(stage.scene),
    layout,
    state,
    cash,
    effects,
    sound,
    labels,
    floaters,
    (paid) => {
      if (paid.automated) income.add(clock.now, paid.amount);
      else flag('washed');
      meta.onPaid(paid);
      town.onPaid(paid);
    },
    mart,
  );

  const staff = new StaffSystem(stage.scene, layout, state, labels, cash);

  const addBuilt = (id: string, animate: boolean): void => {
    buildings.show(id, animate);
    traffic.addStation(id);
    staff.hire(id);
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
      refitView();
      void saves.saveNow();
      if (PADS.find((p) => p.id === id)?.effects.endOfContent) {
        flag('ended');
        showEndScreen(root, () => meta.screenClosed());
      }
    },
    (id) => {
      sites.show(id);
      stage.refreshShadows();
      if (id === 'mart') loadShoppers();
      refitView();
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
    void saves.saveNow();
  });

  /** Where the player may walk: the lot and across the road, as far as it's built so far. */
  let walkable: Rect = layout.walk;
  const refitView = (instant = false): void => {
    const area = activeRect();
    // The camera may look a little past the edge, so the player is never right at the screen's edge.
    const margin = CAMERA_MARGIN;
    rig.setArea({ minX: area.minX - margin, maxX: area.maxX + margin, minZ: area.minZ - CAMERA_BACK_MARGIN, maxZ: area.maxZ + margin });
    walkable = {
      minX: Math.max(layout.walk.minX, area.minX),
      maxX: Math.min(layout.walk.maxX, area.maxX),
      minZ: Math.max(layout.walk.minZ, area.minZ),
      maxZ: Math.min(layout.walk.maxZ, area.maxZ),
    };
    if (instant) rig.snap(player.position);
  };

  /** Everything built plus the next pad: where the player can go, and the camera can show. */
  const activeRect = (): Rect => {
    const rect = { ...layout.cameraBase };
    const grow = (r: Rect) => {
      rect.minX = Math.min(rect.minX, r.minX);
      rect.maxX = Math.max(rect.maxX, r.maxX);
      rect.minZ = Math.min(rect.minZ, r.minZ);
      rect.maxZ = Math.max(rect.maxZ, r.maxZ);
    };
    for (const id of state.unlocked) {
      const at = layout.pads[id];
      if (at) grow({ minX: at.x - 1.5, maxX: at.x + 1.5, minZ: at.z - 1.5, maxZ: at.z + 1.5 });
      const area = layout.areas[id];
      if (area) grow(area);
    }
    for (const id of Object.keys(state.building)) {
      const site = layout.sites[id];
      if (site) grow({ minX: site.x - site.width / 2, maxX: site.x + site.width / 2, minZ: site.z - site.depth / 2, maxZ: site.z + site.depth / 2 });
    }
    const next = pads.footprint;
    if (next) grow(next);
    for (const footprint of upgrades.footprints()) grow(footprint);
    return rect;
  };

  // Builds the free first bay before the first frame.
  // The side buttons take a strip on the right; the lot is framed beside them.
  const hudPx = () => (stage.size.height > stage.size.width ? HUD_PX + GOALS_BAR_PX : HUD_PX);
  const fitSideBar = () => {
    rig.setRightInset(SIDE_BAR_PX, stage.size.width);
    rig.setTopInset(hudPx(), stage.size.height);
    rig.refit();
  };
  fitSideBar();
  pads.update(0, player.position);
  refitView(true);
  stage.onResize(() => {
    fitSideBar();
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
  const hand = new GuideHand(labels);
  const pointer = new EdgePointer(root);
  const hoses = new FuelHoses(stage.scene, layout);
  const washSounds = new WashSounds(sound);
  const meta = createMeta({ root, state, saves, sound, traffic, pads, supplies });
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

  /** What the tutorial hand can point at this frame. */
  const guideView = (): GuideView => {
    const first = traffic.bays[0]?.car;
    const perItem = TUNING.stations.usesPerItem;
    const low = traffic.bays.find((b) => b.supply === 'soap' && (state.supplies[`${b.id}.soap`] ?? 0) <= perItem);
    const pumpCar = traffic.forecourt.pumps[0]?.car;
    if (pumpCar?.manual && pumpCar.served.includes('fuel')) flag('fueled');
    return {
      firstCar: first && (first.state === 'waiting' || first.state === 'entering') ? first.position : null,
      pile: cash.fullestPile()?.at ?? null,
      pad: pads.next,
      shelf: state.unlocked.includes('soap') ? (layout.pads.soap ?? null) : null,
      lowBay: low?.at ?? null,
      carryingSoap: playerCarry.count('soap') > 0,
      fuelCar: pumpCar?.state === 'waiting' ? pumpCar.position : null,
    };
  };

  let lastPadRect = '';
  let rateTimer = 0;
  let buildTimer = 0;
  const loop = new Loop((dt) => {
    clock.advance(dt);
    state.playSeconds += dt;
    player.update(dt, input.read(), [...buildings.obstacles(), ...layout.blocked, ...traffic.obstacles()], walkable);
    pads.update(dt, player.position);
    upgrades.update(dt, player.position);
    staff.update(dt, traffic.all(), supplies, buildings.obstacles(), (station) => insideRect(player.position, station.zone), traffic.valetCall);
    supplies.update(dt, [playerCarry, ...staff.carriers()]);
    playerCarry.update(dt, player.isMoving);
    player.scrubbing = traffic.update(dt, work, supplies);
    hoses.update(traffic.forecourt.pumps);
    washSounds.update(dt, player.scrubbing);
    if (cash.update(player.position)) flag('collected');
    const guide = tutorialActive(state) ? guideTarget(state, guideView()) : null;
    hand.point(guide);
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
    town.update(dt, player.position);

    const padRect = JSON.stringify(pads.footprint) + upgrades.footprints().length + Object.keys(state.building).join();
    if (padRect !== lastPadRect) {
      lastPadRect = padRect;
      refitView();
    }
    rig.update(dt, player.position);
    blobShadows.update();
    stage.render();
    labels.update(stage.camera, stage.size.width, stage.size.height);
    // Off screen, the tutorial's next step or a pad the player can now afford gets an arrow at the edge.
    const next = pads.next;
    const goal = guide ?? (next && state.cash >= next.owed ? next.at : null);
    pointer.update(stage.camera, stage.size.width, stage.size.height, goal, { top: hudPx(), right: SIDE_BAR_PX });
    hud.update(dt, state.cash, state.stars, state.gems);
    for (const ticker of tickers) ticker(dt);
  });

  // Any tap or key unlocks audio (browsers need a gesture first).
  root.addEventListener('pointerdown', () => {
    if (!lifecycle.paused) sound.unlock();
  });
  window.addEventListener('keydown', () => {
    if (!lifecycle.paused) sound.unlock();
  });

  lifecycle.onPause(() => {
    loop.stop();
    root.classList.add('is-paused');
    sound.setPaused(true);
    void saves.saveNow();
  });
  lifecycle.onResume(() => {
    root.classList.remove('is-paused');
    sound.setPaused(false);
    loop.start();
  });

  return {
    stage,
    clock,
    player,
    traffic,
    staff,
    welcomeBack: (earned) => meta.welcomeBack(earned),
    get frameMs() {
      return loop.busyMs;
    },
    renderOnce() {
      // Compile every material now, behind the loading screen, not mid-game.
      stage.renderer.compile(stage.scene, stage.camera);
      blobShadows.update();
      stage.render();
      labels.update(stage.camera, stage.size.width, stage.size.height);
    },
    start() {
      if (!lifecycle.paused) loop.start();
    },
    addTicker: (ticker) => void tickers.push(ticker),
  };
}
