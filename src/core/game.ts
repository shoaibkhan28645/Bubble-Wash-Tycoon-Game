import { Loop } from './loop';
import { GameClock } from './clock';
import { LOCATION1, PADS, TUNING, UPGRADES, fixedSolids } from './config';
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
import { Traffic, type Paid, type Work } from '../systems/traffic';
import { insideRect, type Station } from '../systems/stations';
import { IncomeTracker } from '../systems/offline';
import { Floaters } from '../ui/carBubbles';
import { Carrier } from '../systems/carry';
import { Supplies } from '../systems/supplies';
import { StaffSystem } from '../systems/staff';
import { UpgradePads } from '../systems/upgrades';
import { UpgradePanel } from '../ui/upgradePanel';
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
import { createOnboarding, type Onboarding } from './onboarding';
import { createStreetLife } from './streetLife';
import { LotView, SIDE_BAR_PX } from './view';

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
  stage.scene.add(terrain(layout, bayIds.map((id) => layout.pads[id]!.x), layout.pads.tunnel?.x ?? null));
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
  /** Set up once the free first bay is built (before the first frame). */
  let onboarding: Onboarding | null = null;
  const { mart, loadShoppers } = createMart({ scene: stage.scene, layout, state, labels, floaters, sound });
  const pool = new CarPool(stage.scene);
  const onPaid = (paid: Paid): void => {
    if (paid.automated) income.add(clock.now, paid.amount);
    else flag('washed');
    meta.onPaid(paid);
    town.onPaid(paid);
    onboarding?.onPaid(paid);
  };
  const traffic = new Traffic(pool, layout, state, cash, effects, sound, labels, floaters, onPaid, mart);
  const street = createStreetLife(stage.scene, layout, pool);

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
      view.refit();
      onboarding?.onBuilt(id);
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

  onboarding = createOnboarding({ root, labels, layout, state, traffic, cash, pads, playerCarry, flag });

  let rateTimer = 0;
  let buildTimer = 0;
  const fixed = fixedSolids(layout);
  const loop = new Loop((dt) => {
    clock.advance(dt);
    state.playSeconds += dt;
    player.update(dt, input.read(), [...buildings.obstacles(), ...fixed, ...traffic.obstacles()], view.walkable);
    pads.update(dt, player.position);
    upgrades.update(dt, player.position);
    staff.update(dt, traffic.all(), supplies, buildings.obstacles(), (station) => insideRect(player.position, station.zone), traffic.valetCall);
    supplies.update(dt, [playerCarry, ...staff.carriers()]);
    playerCarry.update(dt, player.isMoving);
    player.scrubbing = traffic.update(dt, work, supplies);
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
    town.update(dt, player.position);
    view.update(dt, player.position);
    blobShadows.update();
    stage.render();
    labels.update(stage.camera, stage.size.width, stage.size.height);
    // Off screen, the tutorial's next step or a pad the player can now afford gets an arrow at the edge.
    const next = pads.next;
    const goal = guide?.at ?? (next && state.cash >= next.owed ? next.at : null);
    pointer.update(stage.camera, stage.size.width, stage.size.height, goal, { top: view.topInset, right: SIDE_BAR_PX });
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
