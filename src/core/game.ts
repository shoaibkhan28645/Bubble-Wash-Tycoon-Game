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

export interface Game {
  readonly stage: Stage;
  readonly clock: GameClock;
  readonly player: Player;
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
  stage.shadowArea({ ...layout.lot, minZ: layout.roadZ - 3 });
  const clock = new GameClock();
  const tickers: ((dt: number) => void)[] = [];
  const rig = new CameraRig(stage.camera);
  const labels = new WorldLabels(root);
  const hud = new Hud(root, state.cash);
  const input = new Input(root, lifecycle);
  const effects = new Particles(stage.scene);

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
  const traffic = new Traffic(new CarPool(stage.scene), layout, state, cash, effects, sound, labels, floaters, (paid) => {
    if (paid.automated) income.add(clock.now, paid.amount);
    else flag('washed');
  });

  const staff = new StaffSystem(stage.scene, layout, state, labels, cash);

  const addBuilt = (id: string, animate: boolean): void => {
    buildings.show(id, animate);
    traffic.addStation(id);
    staff.hire(id);
  };
  for (const id of state.unlocked) addBuilt(id, false);

  const pads = new PadSystem(stage.scene, layout, TUNING.pads, state, effects, sound, labels, (id) => {
    addBuilt(id, true);
    refitView();
    void saves.saveNow();
    if (PADS.find((p) => p.id === id)?.effects.endOfContent) {
      flag('ended');
      showEndScreen(root, () => {});
    }
  });

  const panel = new UpgradePanel(root, (key) => upgrades.buy(key), () => {});
  const upgrades = new UpgradePads(stage.scene, layout, state, panel, labels, sound, effects, () => void saves.saveNow());

  /** Where the player may walk: the lot, limited to what the camera shows. */
  let walkable: Rect = layout.lot;
  const refitView = (instant = false): void => {
    const view = activeRect();
    rig.setRect(view, instant);
    walkable = {
      minX: Math.max(layout.lot.minX, view.minX),
      maxX: Math.min(layout.lot.maxX, view.maxX),
      minZ: Math.max(layout.lot.minZ, view.minZ),
      maxZ: Math.min(layout.lot.maxZ, view.maxZ),
    };
  };

  /** Everything built plus the next pad must stay on screen. */
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
    }
    const next = pads.footprint;
    if (next) grow(next);
    for (const footprint of upgrades.footprints()) grow(footprint);
    return rect;
  };

  // Builds the free first bay before the first frame.
  pads.update(0, player.position);
  refitView(true);
  stage.onResize(() => rig.refit(true));

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

  /** What the tutorial hand can point at this frame. */
  const guideView = (): GuideView => {
    const first = traffic.bays[0]?.car;
    const perItem = TUNING.stations.usesPerItem;
    const low = traffic.bays.find((b) => b.supply === 'soap' && (state.supplies[`${b.id}.soap`] ?? 0) <= perItem);
    return {
      firstCar: first && (first.state === 'waiting' || first.state === 'entering') ? first.position : null,
      pile: cash.fullestPile()?.at ?? null,
      pad: pads.next,
      shelf: state.unlocked.includes('soap') ? (layout.pads.soap ?? null) : null,
      lowBay: low?.at ?? null,
      carryingSoap: playerCarry.count('soap') > 0,
    };
  };

  let lastPadRect = '';
  let rateTimer = 0;
  const loop = new Loop((dt) => {
    clock.advance(dt);
    state.playSeconds += dt;
    player.update(dt, input.read(), [...buildings.obstacles(), ...traffic.obstacles()], walkable);
    pads.update(dt, player.position);
    upgrades.update(dt, player.position);
    staff.update(dt, traffic.all(), supplies, buildings.obstacles(), (station) => insideRect(player.position, station.zone), traffic.valetCall);
    supplies.update(dt, [playerCarry, ...staff.carriers()]);
    playerCarry.update(dt, player.isMoving);
    player.scrubbing = traffic.update(dt, work, supplies);
    if (cash.update(player.position)) flag('collected');
    hand.point(tutorialActive(state) ? guideTarget(state, guideView()) : null);
    floaters.update(dt);
    rateTimer += dt;
    if (rateTimer >= 5) {
      rateTimer = 0;
      state.autoRate = income.perMinute(clock.now);
    }
    buildings.update(dt, traffic.tunnelBusy);
    effects.update(dt);
    saves.update(dt);

    const padRect = JSON.stringify(pads.footprint) + upgrades.footprints().length;
    if (padRect !== lastPadRect) {
      lastPadRect = padRect;
      refitView();
    }
    rig.update(dt);
    stage.render();
    labels.update(stage.camera, stage.size.width, stage.size.height);
    hud.update(dt, state.cash, state.stars);
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
    get frameMs() {
      return loop.busyMs;
    },
    renderOnce() {
      stage.render();
      labels.update(stage.camera, stage.size.width, stage.size.height);
    },
    start() {
      if (!lifecycle.paused) loop.start();
    },
    addTicker: (ticker) => void tickers.push(ticker),
  };
}
