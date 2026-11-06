// A farm village (Chapter 2, Willowbrook): no cars. Crops ripen in the
// fields; the hero (later a farmhand) picks them into crates, carries them to
// the farm stand, and serves the villagers who walk up to it from the road.
// The shared pieces (the player, pads, cash piles, upgrades, staff, the
// camera, the side bar, the hero's career and the town's story) are the same
// as in the car wash town.
import { Vector3, type Object3D } from 'three';
import { Loop } from './loop';
import { GameClock } from './clock';
import { CHARACTERS, CROPS, TUNING, UPGRADES, fixedSolids, type Point, type Rect } from './config';
import type { Game } from './game';
import type { GameState } from './gameState';
import type { Lifecycle } from './lifecycle';
import type { SaveManager } from './save';
import type { FarmTown } from './towns';
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
import { farmland } from '../render/farmland';
import { loadPeople } from '../render/assets';
import { blobShadows } from '../render/models/actors';
import { CropPlots, FARM_SOLIDS, farmPadModel } from '../render/models/farm';
import { PersonAvatar } from '../render/models/person';
import { ConstructionSites } from '../render/models/site';
import { unlockedSum } from '../systems/arrivals';
import { perk } from '../systems/career';
import { CashSystem } from '../systems/cash';
import { Carrier } from '../systems/carry';
import { takeFinished } from '../systems/construction';
import { Crops, StandStock, type CropId, type CrateCarrier } from '../systems/crops';
import { levelFactor, levelStep, nextStars, tipFor } from '../systems/economy';
import { GuideHand, type GuideStep } from '../systems/guide';
import { Input } from '../systems/input';
import { IncomeTracker } from '../systems/offline';
import { PadSystem } from '../systems/pads';
import { Player } from '../systems/player';
import { StaffSystem } from '../systems/staff';
import { insideRect } from '../systems/stations';
import type { Paid } from '../systems/till';
import { UpgradePads } from '../systems/upgrades';
import { WalkUps, type ServedVisitor, type Visitor, type WalkUpCounter } from '../systems/walkups';
import { Floaters } from '../ui/carBubbles';
import { EdgePointer } from '../ui/edgePointer';
import { showEndScreen } from '../ui/endScreen';
import { openEmpireMap } from '../ui/empireMap';
import { Hud } from '../ui/hud';
import { t } from '../ui/strings';
import { UpgradePanel } from '../ui/upgradePanel';
import { WorldLabels } from '../ui/worldLabels';

/** A new building grows into place over this long. */
const REVEAL_SECONDS = 0.6;
/** Upgrade pads appear once the well is dug (one thing at a time). */
const UPGRADES_AFTER = 'well';
/** The newcomer's pointing hand helps until the stand has a helper. */
const GUIDE_UNTIL = 'standhand';
/** The stand's stock count floats this high over it. */
const STOCK_LABEL_Y = 3.4;

/** Warm late-afternoon countryside light: a soft sky, golden sun, long views over the hills. */
const FARM_LOOK: Look = {
  sky: 0xc4e8f7,
  fogNear: 75,
  fogFar: 175,
  skyLight: 0xfff5e2,
  groundLight: 0xa9c47c,
  ambient: 1.3,
  sun: 0xffd9a3,
  sunStrength: 2.85,
};

export function createFarmGame(
  container: HTMLElement,
  stage: Stage,
  state: GameState,
  lifecycle: Lifecycle,
  saves: SaveManager,
  sound: SoundManager,
  travelTo: (id: string) => Promise<void>,
  current: FarmTown,
): Game {
  const { layout } = current;
  // Everything this town puts on the page goes in here, so leaving the town removes it all at once.
  const root = document.createElement('div');
  root.className = 'game-root';
  container.prepend(root);
  const cleanups: (() => void)[] = [];
  stage.setLook(FARM_LOOK);
  stage.shadowArea(layout.lot);
  const clock = new GameClock();
  const tickers: ((dt: number) => void)[] = [];
  const rig = new CameraRig(stage.camera);
  const labels = new WorldLabels(root);
  const hud = new Hud(root, state.cash);
  const input = new Input(root, lifecycle);
  const effects = new Particles(stage.scene);
  blobShadows.attach(stage.scene);
  const ground = farmland(layout);
  stage.scene.add(withShadows(ground.group, false, true));
  // The fence, trees and buildings cast shadows; the ground only takes them.
  ground.group.traverse((node) => {
    if (node.name === 'fence' || /^town:|tree/.test(node.name)) node.castShadow = true;
  });

  const level = (key: string) => state.levels[key] ?? 0;
  const player = new Player(stage.scene, layout.playerStart, TUNING.player, () => 1 + levelStep(UPGRADES.kinds.walk, level('player.walk')) + perk(state, 'walk'));
  player.onFootstep(() => sound.play('step'));
  const playerCarry: CrateCarrier = new Carrier<CropId>(
    player.mesh,
    () => player.position,
    () => TUNING.supplies.carryBase + levelStep(UPGRADES.kinds.carry, level('player.carry')),
  );
  const cash = new CashSystem(stage.scene, layout, TUNING.cash, state, effects, sound);
  const floaters = new Floaters(labels);
  const income = new IncomeTracker(TUNING.offline.incomeWindowSeconds, state.autoRate);
  const flag = (name: string): void => {
    if (state.flags.includes(name)) return;
    state.flags.push(name);
    void saves.saveNow();
  };
  const servedFlag = `served:${current.id}`;
  const stockedFlag = `stocked:${current.id}`;

  // The crops: each field's plots ripen on the clock; the well and the field's upgrades speed them up.
  const crops = new Crops(
    state,
    layout,
    (field) => (1 + unlockedSum(state, (e) => e.growBonus)) / levelFactor(UPGRADES.kinds.grow, level(`${field}.grow`)),
    (carrier, plot) => {
      const crop = CROPS[plot.crop]!;
      if (carrier === playerCarry) {
        floaters.show(`+1 ${crop.icon}`, new Vector3(plot.at.x, 1.6, plot.at.z), 'star');
        sound.play('pop');
      }
      effects.burst('sparkle', new Vector3(plot.at.x, 0.4, plot.at.z), 8, 3, 0.8);
    },
  );
  const plots = new CropPlots(crops);
  stage.scene.add(plots.group);
  const stock = new StandStock(
    state,
    () => unlockedSum(state, (e) => e.storage) + levelStep(UPGRADES.kinds.crates, level('stand.crates')),
    (carrier) => {
      if (carrier !== playerCarry) return;
      flag(stockedFlag);
      sound.play('chip');
    },
  );

  // The buildings: each pad's model grows into place, and what's solid about it stops the player.
  const solids: Rect[] = [];
  const growing: { mesh: Object3D; age: number }[] = [];
  const showBuilding = (id: string, animate: boolean): void => {
    const at = layout.buildAt[id] ?? layout.pads[id];
    const mesh = farmPadModel(id);
    if (!mesh || !at) return;
    mesh.position.set(at.x, 0, at.z);
    stage.scene.add(withShadows(mesh));
    if (animate) {
      mesh.scale.setScalar(0.001);
      growing.push({ mesh, age: 0 });
    }
    for (const [hw, hd, dx = 0, dz = 0] of FARM_SOLIDS[id] ?? []) {
      solids.push({ minX: at.x + dx - hw, maxX: at.x + dx + hw, minZ: at.z + dz - hd, maxZ: at.z + dz + hd });
    }
    stage.refreshShadows();
  };

  // Villagers: drawn once their models load (they're not in the first download).
  let made = 0;
  let peopleReady = false;
  const makeAvatar = () => {
    if (!peopleReady) return null;
    const avatar = new PersonAvatar(CHARACTERS.villagers[made++ % CHARACTERS.villagers.length]!, 'bag');
    stage.scene.add(avatar.root);
    return avatar;
  };
  const onPaid = (paid: Paid): void => {
    if (paid.automated) income.add(clock.now, paid.amount);
    else flag(servedFlag);
    meta.onPaid(paid);
    town.onPaid(paid);
  };
  const onServed = ({ visitor, counter }: ServedVisitor): void => {
    const crop = CROPS[stock.take(counter.id) ?? 'veg']!;
    const quality = levelFactor(UPGRADES.kinds.quality, level(`${counter.id}.quality`));
    const bonus = 1 + unlockedSum(state, (e) => e.payBonus);
    const pay = Math.round(crop.price * quality * bonus * (walkups.rush?.payMultiplier ?? 1));
    const tip = tipFor(pay, visitor.patience / visitor.patienceMax, TUNING.customers);
    cash.add(counter.id, pay + tip);
    const at = layout.piles[counter.id] ?? counter.at;
    floaters.show(`+$${pay} ${crop.icon}`, new Vector3(at.x, 1.2, at.z), 'cash');
    if (tip > 0) floaters.show(`+$${tip} tip`, new Vector3(at.x + 0.6, 1.9, at.z), 'tip');
    state.stars = nextStars(state.stars, tip > 0 ? 'happy' : 'okay', TUNING.stars);
    sound.play('ching');
    onPaid({ amount: pay + tip, tip, automated: !visitor.manual, at });
  };
  const onGaveUp = (visitor: Visitor): void => {
    state.stars = nextStars(state.stars, 'angry', TUNING.stars);
    floaters.show('😠', new Vector3(visitor.at.x, 2.2, visitor.at.z), 'star');
    sound.play('pop');
  };
  const walkups = new WalkUps(
    layout,
    state,
    TUNING.villagers as { spawnSeconds: number; patience: number; walkSpeed: number; pay: [number, number] },
    () => unlockedSum(state, (e) => e.arrivalBonus),
    () => unlockedSum(state, (e) => e.patienceBonus),
    makeAvatar,
    onServed,
    onGaveUp,
  );
  loadPeople(CHARACTERS.villagers)
    .then(() => {
      peopleReady = walkups.open = true;
      if (!state.flags.includes(servedFlag)) walkups.parkFirst();
    })
    .catch((error) => platform.logWarning(error));

  const staff = new StaffSystem(stage.scene, layout, state, labels, cash);
  const standSpots = () => walkups.counters.map((c) => ({ id: c.id, zone: c.spot.zone }));
  /** Middle of a stand's serving zone: where crates are handed over. */
  const dropAt = (zone: Rect): Point => ({ x: (zone.minX + zone.maxX) / 2, z: (zone.minZ + zone.maxZ) / 2 });
  // The farmhand's round: pick the nearest ripe plot until the crate stack is full (or nothing's ripe), then stock the stand.
  staff.farmPlan = (carrier, at) => {
    const stand = walkups.counters[0];
    const carrying = carrier.stack.length > 0;
    const ripe = carrier.full ? null : crops.nearestRipe(at, Date.now(), (p) => insideRect(player.position, p.rect));
    if (ripe && !(carrying && stand && stock.total(stand.id) === 0)) return ripe.at;
    if (carrying && stand && stock.hasRoom(stand.id)) return dropAt(stand.spot.zone);
    return null;
  };

  const addBuilt = (id: string, animate: boolean): void => {
    showBuilding(id, animate);
    const effects = current.pads.find((p) => p.id === id)?.effects;
    if (effects?.counter) walkups.addCounter(id, effects.counter, labels);
    if (effects?.field) {
      crops.addField(id, effects.field as CropId);
      plots.addField(id);
    }
    staff.hire(id);
  };
  // The stand and the first field come with the farm: they're there the moment the hero arrives.
  for (const pad of current.pads) if (pad.cost === 0 && !state.unlocked.includes(pad.id)) state.unlocked.push(pad.id);
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
      void saves.saveNow();
      if (current.pads.find((p) => p.id === id)?.effects.endOfContent) {
        flag(`ended:${current.id}`);
        showEndScreen(root, () => meta.screenClosed(), { title: t('endTitleFarm'), body: t('endBodyFarm') });
      }
    },
    (id) => {
      sites.show(id);
      stage.refreshShadows();
      view.refit();
      void saves.saveNow();
    },
  );
  const finishBuilds = (): void => {
    for (const id of takeFinished(state, Date.now())) {
      sites.remove(id);
      pads.finishConstruction(id);
    }
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

  /**
   * How hard each counter is worked this frame: the hero behind it, or a
   * worker (the faster counts), sped up by its upgrade. Nobody can sell
   * from an empty stand.
   */
  const work = (counter: WalkUpCounter): { rate: number; byPlayer: boolean } => {
    if (stock.total(counter.id) === 0) return { rate: 0, byPlayer: false };
    const byStaff = staff.rateFor(counter);
    const byPlayer = insideRect(player.position, counter.zone) ? 1 : 0;
    const speed = levelFactor(UPGRADES.kinds.speed, level(`${counter.id}.speed`));
    return { rate: Math.max(byStaff, byPlayer) / speed, byPlayer: byPlayer > 0 && byPlayer >= byStaff };
  };

  // The stand's crates, counted over it; it asks for more when empty.
  const standAt = layout.pads.stand ?? layout.playerStart;
  const stockText = document.createElement('div');
  stockText.className = 'shelf-stock';
  const stockLabel = labels.add(stockText, new Vector3(standAt.x, STOCK_LABEL_Y, standAt.z));
  let shownStock = '';
  const showStock = (): void => {
    const stand = walkups.counters[0];
    if (!stand) return;
    const total = stock.total(stand.id);
    // Each crop the farm grows (corn once its field is planted), and how many the stand holds.
    const grown = (Object.keys(CROPS) as CropId[]).filter((c) => c === 'veg' || stock.stock(stand.id, c) > 0 || state.unlocked.includes('field2'));
    const text = total === 0 ? `🧺 ${t('standEmpty')}` : `${grown.map((c) => `${CROPS[c]!.icon} ${stock.stock(stand.id, c)}`).join('  ')}  / ${stock.capacity}`;
    if (text === shownStock) return;
    shownStock = text;
    stockText.textContent = text;
    stockText.classList.toggle('is-empty', total === 0);
    labels.remeasure(stockLabel);
  };

  const pointer = new EdgePointer(root);
  // A pointing hand for a newcomer to the farm: pick the ripe crops, carry them to the stand,
  // serve, collect the cash, then on to the next pad, until the stand has a helper.
  const hand = new GuideHand(labels);
  const guide = (): GuideStep | null => {
    if (state.unlocked.includes(GUIDE_UNTIL)) return null;
    const stand = walkups.counters[0];
    if (!stand) return null;
    const waiting = stand.front;
    const ripeNear = () => crops.nearestRipe(player.position, Date.now());
    const harvestOrStock = (): GuideStep | null => {
      if (playerCarry.stack.length > 0 && (playerCarry.full || !ripeNear())) return { at: dropAt(stand.spot.zone), text: 'guideStock' };
      const ripe = ripeNear();
      return ripe ? { at: ripe.at, text: 'guideHarvest' } : null;
    };
    if (!state.flags.includes(servedFlag)) {
      if (stock.total(stand.id) > 0 && (playerCarry.stack.length === 0 || state.flags.includes(stockedFlag))) {
        return waiting ? { at: dropAt(stand.spot.zone), text: 'guideServe' } : null;
      }
      return harvestOrStock();
    }
    const pile = cash.fullestPile();
    if (pile) return { at: pile.at, text: 'guideCash' };
    // Someone waiting at an empty stand: go and pick more.
    if (waiting && stock.total(stand.id) === 0 && !state.unlocked.includes('farmhand')) return harvestOrStock();
    const next = pads.next;
    return next && state.cash >= next.owed ? { at: next.at, text: 'guideBuild' } : null;
  };
  const meta = createMeta({ root, state, saves, sound, traffic: null, pads, supplies: null, setBoost: (m) => (walkups.boost = m) });
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
  const storyline = createStoryline({ state, town: current, press, arrivals: walkups, flag });

  let rateTimer = 0;
  let buildTimer = 0;
  const fixed = fixedSolids(layout);
  const loop = new Loop((dt) => {
    clock.advance(dt);
    state.playSeconds += dt;
    const now = Date.now();
    player.update(dt, input.read(), [...solids, ...fixed], view.walkable);
    pads.update(dt, player.position);
    upgrades.update(dt, player.position);
    staff.update(dt, walkups.counters, null, solids, (counter) => insideRect(player.position, counter.zone), null, []);
    const carriers = [playerCarry, ...staff.crateCarriers<CropId>()];
    crops.update(dt, now, carriers);
    stock.update(standSpots(), carriers);
    playerCarry.update(dt, player.isMoving);
    const serving = walkups.update(dt, work);
    player.scrubbing = serving || crops.harvesting.has(playerCarry);
    plots.update(dt, now);
    showStock();
    if (cash.update(player.position)) flag('collected');
    floaters.update(dt);
    buildTimer -= dt;
    if (buildTimer <= 0) {
      buildTimer = 0.5;
      finishBuilds();
    }
    sites.update(state, now);
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
    ground.update(dt);
    effects.update(dt);
    saves.update(dt);
    meta.update(dt);
    storyline.update(dt);
    hero.update(dt);
    press.update(dt);
    town.update(dt, player.position);
    view.update(dt, player.position);
    blobShadows.update();
    stage.render();
    labels.update(stage.camera, stage.size.width, stage.size.height);
    const step = guide();
    hand.point(step);
    const next = pads.next;
    const goal = step?.at ?? (next && state.cash >= next.owed ? next.at : null);
    pointer.update(stage.camera, stage.size.width, stage.size.height, goal, { top: view.topInset, right: SIDE_BAR_PX });
    hud.update(dt, state.cash, state.stars, state.gems);
    for (const ticker of tickers) ticker(dt);
  });

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
    renderOnce() {
      stage.renderer.compile(stage.scene, stage.camera);
      blobShadows.update();
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
      tickers.length = 0;
      root.remove();
    },
  };
}
