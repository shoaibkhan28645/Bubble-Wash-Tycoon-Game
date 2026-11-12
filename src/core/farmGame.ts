// A farm village (Chapter 2, Willowbrook): no cars. Crops ripen in the
// fields, hens lay and cows give milk; the hero (later the farm's staff) picks,
// packs and bottles them, carries them to the farm stand, and serves the
// villagers who walk up to it from the road, or loads the vans that deliver
// big orders round the village.
// The shared pieces (the player, pads, cash piles, upgrades, staff, the
// camera, the side bar, the hero's career and the town's story) are the same
// as in the car wash town.
import { Group, Vector3, type Object3D } from 'three';
import { Loop } from './loop';
import { GameClock } from './clock';
import { CHARACTERS, CROPS, GOODS, TUNING, UPGRADES, fixedSolids, type Point, type Rect } from './config';
import type { Game } from './game';
import type { GameState } from './gameState';
import type { Lifecycle } from './lifecycle';
import type { SaveManager } from './save';
import { townIds, type FarmTown } from './towns';
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
import { farmland, heightAt } from '../render/farmland';
import { FarmMotion } from '../render/farmMotion';
import { tickWind } from '../render/wind';
import { loadPeople } from '../render/assets';
import { blobShadows } from '../render/models/actors';
import { skinnedToyMaterial } from '../render/models/build';
import { warmRigidSkin } from '../render/models/rigid';
import { CropPlots, FARM_SOLIDS, farmModel, farmPadModel } from '../render/models/farm';
import { PensView } from '../render/models/pens';
import { VanFleet } from '../render/models/vans';
import { FarmTraffic } from '../systems/farmTraffic';
import { PersonAvatar } from '../render/models/person';
import { ConstructionSites } from '../render/models/site';
import { unlockedSum } from '../systems/arrivals';
import { perk } from '../systems/career';
import { CashSystem } from '../systems/cash';
import { Carrier, carriedItems } from '../systems/carry';
import { takeFinished } from '../systems/construction';
import { Crops, StandStock, type CropId, type CrateCarrier, type GoodId, type Plot } from '../systems/crops';
import { ANIMALS, Livestock, type AnimalKind } from '../systems/animals';
import { Deliveries, VANS } from '../systems/deliveries';
import { BarnStore } from '../systems/barn';
import { Bakery } from '../systems/bakery';
import { createMachines } from './farmMachines';
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
import { showOrders } from '../ui/ordersPanel';
import { WorldLabels } from '../ui/worldLabels';

/** Helpers take goods to the nearer counter: this many metres of extra walk count as one more crate there. */
const OUTLET_WALK = 6;

/** A new building grows into place over this long. */
const REVEAL_SECONDS = 0.6;
/** The farmhand's watering round: the first a little after the start, then this often (seconds), if a field is growing. */
const WATER_FIRST_SECONDS = 15;
const WATER_EVERY_SECONDS = 40;
const WATER_RETRY_SECONDS = 5;
/** A round that takes longer than this (seconds) is given up. */
const WATER_GIVE_UP_SECONDS = 30;
/** Seconds filling the can at the well, and pouring it over the plot. */
const FILL_SECONDS = 1.3;
const POUR_SECONDS = 2.4;
/** How far from the well's middle the farmhand stands to fill the can (the well is about 1.9 m across). */
const WELL_REACH = 1.75;
/** Upgrade pads appear once the well is dug (one thing at a time). */
const UPGRADES_AFTER = 'well';
/** The newcomer's pointing hand helps until the stand has a helper. */
const GUIDE_UNTIL = 'standhand';
/** The stand's stock count floats this high over it. */
const STOCK_LABEL_Y = 3.4;
/** After the road to the next town is built, the hero sets off this long after (the pad's pop first). */
const TRAVEL_DELAY_MS = 1500;
/** Pads taken out of the game, and what they cost: a save that bought one is paid back. */
const RETIRED_PADS: Record<string, number> = { tractor: 8250, tractordriver: 17000, combine: 54000 };
/** Half the width of the windmill's tower at the ground (metres): solid. */
const WINDMILL_BASE = 2.1;
/** The windmill's sails turn this fast (radians a second). */
const SAILS_TURN = 0.6;

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
  carriedItems.attach(stage.scene);
  warmRigidSkin(stage.scene, skinnedToyMaterial);
  const ground = farmland(layout);
  stage.scene.add(withShadows(ground.group, false, true));
  // Weathervanes, the chapel bell, chimney smoke and the vehicles' wheels.
  const motion = new FarmMotion();
  stage.scene.add(motion.group);
  motion.watch(ground.group);
  // The fence, trees and buildings cast shadows; the ground only takes them.
  ground.group.traverse((node) => {
    if (node.name === 'fence' || /^town:|tree/.test(node.name)) node.castShadow = true;
  });

  const level = (key: string) => state.levels[key] ?? 0;
  const player = new Player(stage.scene, layout.playerStart, TUNING.player, () => 1 + perk(state, 'walk'));
  player.onFootstep(() => sound.play('step'));
  const playerCarry: CrateCarrier = new Carrier<GoodId>(
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
  const packedFlag = `packed:${current.id}`;
  const bottledFlag = `bottled:${current.id}`;
  const sentFlag = `sent:${current.id}`;

  // The crops: each field's plots ripen on the clock; the well and the field's upgrades speed them up.
  const crops = new Crops(
    state,
    layout,
    (field) => (1 + unlockedSum(state, (e) => e.growBonus)) / levelFactor(UPGRADES.kinds.grow, level(`${field}.grow`)),
    (carrier, plot) => {
      state.counts.harvest = (state.counts.harvest ?? 0) + 1;
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
  // The animals: hens lay and cows fill the milk tank on the clock; eggs are packed into cartons at the egg
  // table, milk bottled at the dairy; corn in the feed store makes them all work faster.
  const UPGRADE: Record<AnimalKind, string> = { hens: 'flock', cows: 'herd' };
  const animals = (penId: string) => {
    const kind = layout.pens[penId]?.animal;
    const upgrade = UPGRADES.kinds[UPGRADE[kind ?? 'hens']];
    return kind ? ANIMALS[kind].count + levelStep(upgrade, Math.min(upgrade?.max ?? 0, level(`${penId}.${UPGRADE[kind]}`))) : 0;
  };
  const livestock = new Livestock(
    state,
    layout,
    animals,
    (carrier, pen) => {
      if (carrier !== playerCarry) return;
      flag(pen.animal === 'hens' ? packedFlag : bottledFlag);
      floaters.show(`+1 ${GOODS[ANIMALS[pen.animal].good]!.icon}`, new Vector3(pen.table.x, 1.6, pen.table.z), 'star');
      sound.play('pop');
    },
    (carrier) => {
      const at = livestock.feedAt;
      if (at) effects.burst('sparkle', new Vector3(at.x, 0.6, at.z - 1), 10, 3, 0.8);
      if (carrier === playerCarry) sound.play('chip');
    },
  );
  // A cow that stops to moo says so.
  const pensView = new PensView(livestock, animals, (at) => floaters.show('Moo!', new Vector3(at.x, 2.4, at.z), 'star'));
  stage.scene.add(pensView.group);
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
    motion.watch(mesh);
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
  // Delivery orders: built vans take orders from the board, are loaded at their bays, and pay at the yard when back.
  const vanIds = () => current.pads.filter((p) => p.effects.van && state.unlocked.includes(p.id)).map((p) => p.id);
  const autoVans = () => current.pads.some((p) => p.effects.driver && state.unlocked.includes(p.id));
  const madeGoods = (): GoodId[] => {
    const goods: GoodId[] = ['veg'];
    if (state.unlocked.includes('field2')) goods.push('corn');
    for (const pen of livestock.pens) goods.push(ANIMALS[pen.animal].good);
    if (state.unlocked.includes('orchard')) goods.push('apple');
    if (state.unlocked.includes('bakery')) goods.push('bread', 'pie');
    return goods;
  };
  const deliveries = new Deliveries(state, vanIds, madeGoods, autoVans, (order, van) => {
    const pay = Math.round(order.pay * (1 + unlockedSum(state, (e) => e.payBonus)));
    cash.add('yard', pay);
    const at = layout.piles.yard ?? layout.vans[van]!.route[0]!;
    floaters.show(`+$${pay} 🚚`, new Vector3(at.x, 1.4, at.z), 'cash');
    // The county fair also pays gems, and a prize ribbon.
    if (order.gems) {
      state.gems += order.gems;
      state.counts.ribbon = (state.counts.ribbon ?? 0) + 1;
      floaters.show(`🎀 +${order.gems} 💎`, new Vector3(at.x, 2.3, at.z), 'star');
    }
    sound.play('ching');
    onPaid({ amount: pay, tip: 0, automated: autoVans(), at, bonus: !!order.special });
  });
  deliveries.tripScale = (van) => levelFactor(UPGRADES.kinds.trip, level(`${van}.trip`));
  // The farm's vehicles drive as the town's cars do: they stop for people and each other, and take turns on the main track.
  const traffic = new FarmTraffic(
    () => [player.position, ...staff.positions(), ...walkups.positions()],
    layout.narrows,
  );
  const fleet = new VanFleet(traffic, (model, driver) => motion.vehicle(model, driver));
  stage.scene.add(fleet.group);
  // The barn keeps what's unloaded at its doors, and passes it on to the stand and the vans.
  const barn = new BarnStore(state, layout.machines.barnDoor, () => TUNING.barn.capacity + unlockedSum(state, (e) => e.storage));
  const bakedFlag = `baked:${current.id}`;
  const bakery = new Bakery(
    state,
    layout.bakery,
    barn,
    () => levelFactor(UPGRADES.kinds.oven, level('bakery.oven')),
    (carrier, good) => {
      if (carrier !== playerCarry) return;
      flag(bakedFlag);
      floaters.show(`+1 ${GOODS[good]!.icon}`, new Vector3(layout.bakery.table.x, 1.6, layout.bakery.table.z), 'star');
      sound.play('pop');
    },
  );
  // The driver takes orders the farm can fill from what it has to hand (in the barn, on the bread table, packed
  // at the pens, ripe in the fields); an order that runs out while its van is loading goes back into the barn.
  deliveries.onHand = (good) => {
    const kind = (Object.keys(ANIMALS) as AnimalKind[]).find((k) => ANIMALS[k].good === good);
    const pen = kind ? livestock.first(kind) : undefined;
    const now = Date.now();
    const ripe = crops.plots.filter((p) => p.crop === good && crops.ripe(p, now)).length;
    return Math.max(0, barn.count(good) - barn.keep(good)) + bakery.made(good) + (pen ? livestock.packs(pen.id) : 0) + ripe;
  };
  deliveries.onDropped = (order) => {
    barn.store(order.good as GoodId, order.loaded);
  };
  // Once the mill is open, the barn keeps a few crates of corn and apples back for it.
  const forMill = (good: GoodId): boolean => bakery.open && (good === 'corn' || good === 'apple');
  barn.keep = (good) => (forMill(good) ? TUNING.bakery.reserve : 0);
  /** The bay of the first van in the yard waiting for a good, if any. */
  const bayWanting = (good: GoodId): Point | null => {
    for (const van of vanIds()) {
      const wants = deliveries.wants(van);
      if (wants?.good === good) return dropAt(layout.vans[van]!.bay);
    }
    return null;
  };
  /** The first van bay waiting for something on a carrier's back, if any. */
  const bayFor = (carrier: { count: (good: GoodId) => number }): Point | null => {
    for (const van of vanIds()) {
      const wants = deliveries.wants(van);
      if (wants && carrier.count(wants.good) > 0) return dropAt(layout.vans[van]!.bay);
    }
    return null;
  };

  const onPaid = (paid: Paid): void => {
    // The town's steady staff takings: what it earns while the hero is elsewhere (one-offs left out).
    if (paid.automated && !paid.bonus) income.add(clock.now, paid.amount);
    else flag(servedFlag);
    meta.onPaid(paid);
    town.onPaid(paid);
  };
  const onServed = ({ visitor, counter }: ServedVisitor): void => {
    const basket = stock.takeBasket(counter.id);
    const quality = levelFactor(UPGRADES.kinds.quality, level(`${counter.id}.quality`));
    const bonus = 1 + unlockedSum(state, (e) => e.payBonus);
    const price = basket.reduce((sum, good) => sum + GOODS[good]!.price, 0);
    // The farmers' market's shoppers pay top prices.
    const market = counter.kind === 'stall' ? TUNING.market.premium : 1;
    const pay = Math.round(price * quality * bonus * market * (walkups.rush?.payMultiplier ?? 1));
    const tip = tipFor(pay, visitor.patience / visitor.patienceMax, TUNING.customers);
    cash.add(counter.id, pay + tip);
    const at = layout.piles[counter.id] ?? counter.at;
    floaters.show(`+$${pay} ${basket.map((g) => GOODS[g]!.icon).join('')}`, new Vector3(at.x, 1.2, at.z), 'cash');
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
  walkups.vehicles = () => traffic.footprints();
  // Villagers wait for the next crate at an empty counter: running out costs sales, not the rating.
  walkups.stocked = (counter) => stock.total(counter.id) > 0;
  loadPeople(CHARACTERS.villagers)
    .then(() => {
      peopleReady = walkups.open = true;
      if (!state.flags.includes(servedFlag)) walkups.parkFirst();
    })
    .catch((error) => platform.logWarning(error));

  const staff = new StaffSystem(stage.scene, layout, state, labels, cash);
  const standSpots = () => walkups.counters.map((c) => ({ id: c.id, zone: c.spot.zone }));
  /**
   * Where goods go to be sold: the stand or the market, whichever has least (and room), the market on a tie.
   * From somewhere on the farm, a longer walk counts as more there already (one crate every OUTLET_WALK m).
   */
  const outlet = (from?: Point): WalkUpCounter | undefined => {
    const open = walkups.counters.filter((c) => stock.hasRoom(c.id));
    const load = (c: WalkUpCounter) => stock.total(c.id) + (from ? Math.hypot(c.at.x - from.x, c.at.z - from.z) / OUTLET_WALK : 0);
    return open.sort((a, b) => load(a) - load(b) || (b.kind === 'stall' ? 1 : 0) - (a.kind === 'stall' ? 1 : 0))[0] ?? walkups.counters[0];
  };
  /** Middle of a stand's serving zone: where crates are handed over. */
  const dropAt = (zone: Rect): Point => ({ x: (zone.minX + zone.maxX) / 2, z: (zone.minZ + zone.maxZ) / 2 });
  /**
   * Deliver now rather than fill up first: the helper's back is half full
   * and the stand has run out, or the helper is at the stand already, still
   * handing things over.
   */
  const deliverNow = (carrier: CrateCarrier, stand: WalkUpCounter | undefined): boolean => {
    if (!stand || carrier.stack.length === 0 || !stock.hasRoom(stand.id)) return false;
    if (stock.inReach(carrier.position, { id: stand.id, zone: stand.spot.zone })) return true;
    return stock.total(stand.id) === 0 && carrier.stack.length >= Math.ceil(carrier.capacity() / 2);
  };
  // The farmhand's round: pick the nearest ripe plot until the crate stack is full (or nothing's ripe), then stock the stand.
  // Hungry hens come first: then corn is picked before anything else, and taken to the feed store.
  // The old well at work: now and then (unless their load is full), the farmhand fills a watering can
  // at the well and waters a field that's still growing (the well's faster crops, there to see).
  const wellAt = layout.pads.well;
  const fillSpot = wellAt ? { x: wellAt.x - WELL_REACH, z: wellAt.z } : null;
  const watering: { stage: 'idle' | 'toWell' | 'filling' | 'toField' | 'watering'; due: number; plot: Plot | null; pour: number; took: number } = {
    stage: 'idle',
    due: WATER_FIRST_SECONDS,
    plot: null,
    pour: 0,
    took: 0,
  };
  /** The growing vegetable or corn plot nearest `at` (the orchard's trees are left to their picker). */
  const growingPlot = (at: Point, now: number): Plot | null => {
    let best: Plot | null = null;
    let bestDistance = Infinity;
    for (const plot of crops.plots) {
      if (plot.crop === 'apple' || crops.ripe(plot, now)) continue;
      const d = Math.hypot(plot.at.x - at.x, plot.at.z - at.z);
      if (d < bestDistance) [best, bestDistance] = [plot, d];
    }
    return best;
  };
  const waterRound = (dt: number, now: number): void => {
    const hand = staff.avatarOf('farmhand');
    if (!hand || !fillSpot || !wellAt || !state.unlocked.includes('well')) return;
    const at = { x: hand.root.position.x, z: hand.root.position.z };
    const near = (p: Point, reach: number) => Math.hypot(p.x - at.x, p.z - at.z) <= reach;
    if (watering.stage === 'idle') {
      watering.due -= dt;
      const carrier = staff.crateCarriers<GoodId>('farmhand')[0];
      if (watering.due > 0 || !carrier || carrier.full) return;
      watering.plot = growingPlot(at, now);
      if (!watering.plot) {
        watering.due = WATER_RETRY_SECONDS;
        return;
      }
      watering.stage = 'toWell';
      watering.took = 0;
      return;
    }
    // Something in the way for too long: give it up until next time.
    watering.took += dt;
    if (watering.took > WATER_GIVE_UP_SECONDS) {
      hand.holding = false;
      watering.stage = 'idle';
      watering.due = WATER_EVERY_SECONDS;
      return;
    }
    if (watering.stage === 'toWell' && near(fillSpot, 0.4)) {
      staff.act('farmhand', FILL_SECONDS, wellAt);
      hand.holding = true;
      effects.burst('water', new Vector3(wellAt.x, 1.1, wellAt.z), 6, 1.6, 0.3);
      watering.stage = 'filling';
    } else if (watering.stage === 'filling' && !staff.isActing('farmhand')) {
      // The plot may have ripened meanwhile: the nearest one still growing.
      watering.plot = growingPlot(at, now) ?? watering.plot;
      watering.stage = 'toField';
    } else if (watering.stage === 'toField' && watering.plot && near(watering.plot.at, 0.5)) {
      staff.act('farmhand', POUR_SECONDS, watering.plot.at);
      hand.holding = false;
      sound.play('spray');
      watering.stage = 'watering';
      watering.pour = 0;
    } else if (watering.stage === 'watering') {
      const plot = watering.plot!;
      watering.pour -= dt;
      if (watering.pour <= 0) {
        watering.pour = 0.18;
        effects.burst('water', new Vector3(plot.at.x + (Math.random() - 0.5) * 1.6, 0.9, plot.at.z + (Math.random() - 0.5) * 1.6), 3, 1.4, 0.4);
      }
      if (!staff.isActing('farmhand')) {
        watering.stage = 'idle';
        watering.due = WATER_EVERY_SECONDS;
        watering.plot = null;
      }
    }
  };
  staff.carryPlans.farmhand = (carrier, at) => {
    // On the watering round: to the well, then to the growing plot.
    if (watering.stage === 'toWell' || watering.stage === 'filling') return fillSpot;
    if ((watering.stage === 'toField' || watering.stage === 'watering') && watering.plot) return watering.plot.at;
    const stand = outlet(at);
    const now = Date.now();
    const carrying = carrier.stack.length > 0;
    const feedAt = livestock.feedAt;
    const feeding = !!feedAt && livestock.hungry && livestock.wantsFeed;
    if (feeding && carrier.count('corn') > 0 && (carrier.full || !crops.plots.some((p) => p.crop === 'corn' && crops.ripe(p, now)))) return feedAt;
    // Plots to leave alone: the one the hero is picking, and the apple trees once the orchard has its own picker.
    const picker = state.unlocked.includes('orchardhand');
    const taken = (p: { rect: Rect; crop: CropId }) => insideRect(player.position, p.rect) || (picker && p.crop === 'apple');
    const corn = feeding && !carrier.full && !deliverNow(carrier as CrateCarrier, stand) ? crops.nearestRipe(at, now, (p) => p.crop !== 'corn' || taken(p)) : null;
    if (corn) return corn.at;
    if (feeding && carrier.count('corn') > 0) return feedAt;
    // The pickup parked between the fields: pick, and hand it all up at the tailgate (it takes it to the barn).
    const tailgate = machines.pickupBay();
    if (tailgate) {
      const next = carrier.full ? null : crops.nearestRipe(at, now, taken);
      if (carrying && (carrier.full || !next)) return dropAt(tailgate);
      return next ? next.at : null;
    }
    // A van waiting for a crop: pick that crop first, while any is ripe.
    const wanted = vanIds().map((v) => deliveries.wants(v)?.good).find((g): g is CropId => g === 'veg' || g === 'corn');
    const wantedRipe = !!wanted && crops.plots.some((p) => p.crop === wanted && crops.ripe(p, now) && !taken(p));
    const ripe = carrier.full ? null : crops.nearestRipe(at, now, (p) => taken(p) || (wantedRipe && p.crop !== wanted));
    const bay = bayFor(carrier as CrateCarrier);
    if (bay && (carrier.full || !ripe)) return bay;
    // Apples for the mill, while it's short of them: everything picked goes in at the barn doors (the barn passes it on).
    const mill = bakery.open && carrier.count('apple') > 0 && barn.count('apple') < TUNING.bakery.reserve && barn.hasRoom;
    if (mill && (carrier.full || !ripe)) return dropAt(layout.machines.barnDoor);
    if (ripe && !deliverNow(carrier as CrateCarrier, stand)) return ripe.at;
    if (bay) return bay;
    if (mill) return dropAt(layout.machines.barnDoor);
    if (carrying && stand && stock.hasRoom(stand.id)) return dropAt(stand.spot.zone);
    return null;
  };
  // The orchard picker's round: the nearest ripe apple tree until their back is full (or none is ripe), then
  // in at the barn doors (the barn passes the apples on: the bakery's pies, the stalls, the vans). With the
  // barn full, to whichever stall has room.
  staff.carryPlans.orchardhand = (carrier, at) => {
    const now = Date.now();
    const next = carrier.full ? null : crops.nearestRipe(at, now, (p) => p.crop !== 'apple' || insideRect(player.position, p.rect));
    if (carrier.stack.length > 0 && (carrier.full || !next)) {
      if (barn.hasRoom) return dropAt(layout.machines.barnDoor);
      const stall = outlet(at);
      if (stall && stock.hasRoom(stall.id)) return dropAt(stall.spot.zone);
    }
    return next ? next.at : null;
  };
  // The egg collector's and the milker's rounds: pack cartons or bottles at their pen, then take them to a van
  // waiting for them, or else to the stand (sooner if it's empty).
  const packerPlan = (kind: AnimalKind) => (carrier: CrateCarrier): Point | null => {
    const stand = outlet(carrier.position);
    const pen = livestock.first(kind);
    const good = ANIMALS[kind].good;
    const bay = bayWanting(good);
    const wants = bay ? vanIds().map((v) => deliveries.wants(v)).find((w) => w?.good === good) : null;
    const packs = pen ? livestock.packs(pen.id) : 0;
    const carrying = carrier.stack.length > 0;
    if (bay && carrier.count(good) > 0 && (carrier.full || packs === 0 || carrier.count(good) >= (wants?.more ?? 1))) return bay;
    if (pen && !carrier.full && packs > 0 && (bay || !deliverNow(carrier, stand))) return dropAt(pen.zone);
    if (bay && carrier.count(good) > 0) return bay;
    if (carrying && stand && stock.hasRoom(stand.id)) return dropAt(stand.spot.zone);
    return null;
  };
  staff.carryPlans.eggcollector = (carrier) => packerPlan('hens')(carrier as CrateCarrier);
  staff.carryPlans.milker = (carrier) => packerPlan('cows')(carrier as CrateCarrier);
  // The baker's round: pick up the baking at the bread table, then to a van wanting it, or to the stand or market.
  staff.carryPlans.baker = (c) => {
    const carrier = c as CrateCarrier;
    const stand = outlet(carrier.position);
    const bay = bayFor(carrier);
    const carrying = carrier.stack.length > 0;
    if (bay && (carrier.full || bakery.total === 0)) return bay;
    if (!carrier.full && bakery.total > 0 && !deliverNow(carrier, stand)) return dropAt(bakery.spot.zone);
    if (bay) return bay;
    // The barn is nearer than the counters, and passes the baking on to them and the vans.
    if (carrying && barn.hasRoom) return dropAt(layout.machines.barnDoor);
    if (carrying && stand && stock.hasRoom(stand.id)) return dropAt(stand.spot.zone);
    return null;
  };

  // The orders board: built with the first van; standing in front of it opens it.
  let boardShown = false;
  const showBoard = (): void => {
    if (boardShown) return;
    boardShown = true;
    const board = farmModel('fm_orders');
    board.position.set(layout.board.x, 0, layout.board.z);
    stage.scene.add(withShadows(board));
    const { x, z } = layout.board;
    solids.push({ minX: x - 1.1, maxX: x + 1.1, minZ: z - 0.25, maxZ: z + 0.25 });
  };
  let onBoardSpot = false;
  const openBoard = (): void => {
    showOrders(
      root,
      () => ({
        orders: deliveries.orders,
        now: Date.now(),
        vans: vanIds(),
        canSend: (order, van) => deliveries.atYard(van) && !deliveries.orderOf(van) && deliveries.canCarry(van, order.good),
        backAt: (van) => state.deliveries.trips[van]?.backAt ?? null,
        auto: autoVans(),
        refillAt: state.deliveries.refillAt,
        slots: deliveries.slots,
      }),
      (orderId, van) => {
        if (!deliveries.assign(orderId, van)) return;
        flag(sentFlag);
        sound.play('click');
        void saves.saveNow();
      },
    );
  };

  const machines = createMachines({
    motion,
    traffic,
    solid: (rect) => solids.push(rect),
    scene: stage.scene,
    layout,
    state,
    labels,
    barn,
    livestock,
    staff,
  });

  // The windmill: none until it's bought; then it goes up in the farm's west paddock (a construction site meanwhile)
  // and stands there with its sails turning. Nobody walks through its tower.
  let windmill: Object3D | null = null;
  let sails: Object3D | null = null;
  const showWindmill = (): void => {
    if (windmill) return;
    const { x, z } = layout.windmill;
    windmill = new Group();
    windmill.position.set(x, heightAt(layout, x, z) - 0.05, z);
    windmill.rotation.y = 0.35;
    windmill.add(farmModel('fm_windmill_fixed'));
    // The sails turn about the hub, at the front of the cap (art/blender/farm.py).
    const hub = new Group();
    hub.position.set(0, 6.9, 1.75);
    const model = farmModel('fm_sails');
    model.position.set(0, -6.9, -1.75);
    hub.add(model);
    windmill.add(hub);
    sails = hub;
    solids.push({ minX: x - WINDMILL_BASE, maxX: x + WINDMILL_BASE, minZ: z - WINDMILL_BASE, maxZ: z + WINDMILL_BASE });
    stage.scene.add(withShadows(windmill));
    stage.refreshShadows();
  };

  const addBuilt = (id: string, animate: boolean): void => {
    showBuilding(id, animate);
    const effects = current.pads.find((p) => p.id === id)?.effects;
    if (effects?.counter) walkups.addCounter(id, effects.counter, labels);
    if (effects?.field) {
      crops.addField(id, effects.field as CropId);
      plots.addField(id);
    }
    if (effects?.pen) {
      livestock.addPen(id, Date.now());
      const pen = livestock.pen(id);
      if (pen) {
        pensView.addPen(pen, layout.buildAt[id] ?? layout.pads[id]!);
        // Nobody walks through the run, the pasture, the egg table or the dairy.
        const { table } = pen;
        const [hw, hd] = pen.animal === 'cows' ? [1.45, 0.8] : [0.9, 0.45];
        solids.push({ ...pen.run }, { minX: table.x - hw, maxX: table.x + hw, minZ: table.z - hd, maxZ: table.z + hd });
      }
    }
    if (effects?.feeder) livestock.addFeeder(id);
    if (effects?.van) {
      const spot = layout.vans[id];
      if (spot) {
        fleet.addRound(id, id === 'tanker' ? 'fm_tanker' : 'fm_van', spot.route, spot.back);
        // Where it parks is solid (people walk round to its bay), lengthwise along its way out.
        const [at, next] = spot.route as [Point, Point];
        const [half, side] = id === 'tanker' ? [2.75, 1.05] : [2.05, 1.0];
        const alongX = Math.abs(next.x - at.x) > Math.abs(next.z - at.z);
        solids.push({ minX: at.x - (alongX ? half : side), maxX: at.x + (alongX ? half : side), minZ: at.z - (alongX ? side : half), maxZ: at.z + (alongX ? side : half) });
      }
      showBoard();
    }
    staff.hire(id);
    machines.built(id);
    if (id === 'bakery') bakery.start(Date.now());
    if (id === 'windmill') showWindmill();
  };
  // The tractor and its driver were retired (the pickup does their job), and the combine harvester: a save
  // that had bought them, or was building them, gets their price back, and anything part-paid on their pads.
  for (const [id, price] of Object.entries(RETIRED_PADS)) {
    const owned = state.unlocked.includes(id) || !!state.building[id];
    state.cash += owned ? price : (state.padPaid[id] ?? 0);
    for (const list of [state.unlocked, state.staff]) if (list.includes(id)) list.splice(list.indexOf(id), 1);
    delete state.building[id];
    delete state.padPaid[id];
  }
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
      const done = current.pads.find((p) => p.id === id)?.effects;
      if (done?.endOfContent) {
        flag(`ended:${current.id}`);
        showEndScreen(root, () => meta.screenClosed(), { title: t('endTitleFarm'), body: t('endBodyFarm') });
      }
      // The road to the next town: off the hero goes, once it has popped in. A town this version doesn't have yet
      // ends the chapter instead.
      const next = done?.travel;
      if (next) {
        flag(`ended:${current.id}`);
        if (townIds().includes(next)) setTimeout(() => void travelTo(next), TRAVEL_DELAY_MS);
        else showEndScreen(root, () => meta.screenClosed(), { title: t('endTitleWillowbrook'), body: t('endBodyWillowbrook') });
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

  // Each counter's goods, counted over it; it asks for more when empty.
  const stockLabels = new Map<string, { el: HTMLElement; label: ReturnType<typeof labels.add>; shown: string }>();
  const showStock = (): void => {
    const made = madeGoods();
    for (const stand of walkups.counters) {
      let entry = stockLabels.get(stand.id);
      if (!entry) {
        const at = layout.pads[stand.id] ?? stand.at;
        const el = document.createElement('div');
        el.className = 'shelf-stock';
        entry = { el, label: labels.add(el, new Vector3(at.x, STOCK_LABEL_Y + (stand.kind === 'stall' ? 0.6 : 0), at.z)), shown: '' };
        stockLabels.set(stand.id, entry);
      }
      const total = stock.total(stand.id);
      // Each good the farm makes so far, and how many the counter holds.
      const sold = (Object.keys(GOODS) as GoodId[]).filter((g) => made.includes(g) || stock.stock(stand.id, g) > 0);
      const text = total === 0 ? `🧺 ${t('standEmpty')}` : `${sold.map((g) => `${GOODS[g]!.icon} ${stock.stock(stand.id, g)}`).join(' ')}  / ${stock.capacity}`;
      if (text === entry.shown) continue;
      entry.shown = text;
      entry.el.textContent = text;
      entry.el.classList.toggle('is-empty', total === 0);
      labels.remeasure(entry.label);
    }
  };

  // The eggs waiting at each hen house, and the feed store's stock (it asks for corn when empty).
  const counter = (at: Point | undefined) => {
    const el = document.createElement('div');
    el.className = 'shelf-stock';
    const label = labels.add(el, new Vector3(at?.x ?? 0, STOCK_LABEL_Y + 1, at?.z ?? 0));
    label.visible = false;
    return { el, label, shown: '' };
  };
  const eggCount = counter(layout.pads.henhouse);
  const barnCount = counter(layout.buildAt.barn ?? layout.pads.barn);
  const bakeryCount = counter(layout.bakery.table);
  const milkCount = counter(layout.pens.cowbarn?.table);
  const feedCount = counter(layout.pads.feedstore);
  const vanCounts = Object.fromEntries(Object.entries(layout.vans).map(([id, spot]) => [id, counter(spot.route[0])]));
  const show = (c: ReturnType<typeof counter>, text: string | null, empty = false): void => {
    c.label.visible = text !== null;
    if (text === null || text === c.shown) return;
    c.shown = text;
    c.el.textContent = text;
    c.el.classList.toggle('is-empty', empty);
    labels.remeasure(c.label);
  };
  const showAnimals = (): void => {
    show(barnCount, barn.total > 0 ? `🏚️ ${t('barnStore', { n: barn.total })}` : null);
    show(bakeryCount, bakery.open ? `🍞 ${bakery.made('bread')}  🥧 ${bakery.made('pie')}` : null);
    const hens = livestock.first('hens');
    show(eggCount, hens ? `🥚 ${livestock.made(hens.id)} / ${ANIMALS.hens.cap}` : null);
    const cows = livestock.first('cows');
    show(milkCount, cows ? `🥛 ${livestock.made(cows.id)} / ${ANIMALS.cows.cap}` : null);
    const fed = livestock.fed;
    show(feedCount, livestock.hasFeeder ? (fed ? `🌽 ${livestock.feed} / ${TUNING.feed.cap}` : `🐮 ${t('feedEmpty')}`) : null, !fed);
    // Over each van in the yard: what it's waiting for, or a nudge to pick an order.
    const vans = vanIds();
    for (const [id, c] of Object.entries(vanCounts)) {
      const order = deliveries.orderOf(id);
      if (!vans.includes(id) || !deliveries.atYard(id)) show(c, null);
      else if (order) show(c, `${GOODS[order.good]?.icon ?? '📦'} ${order.loaded} / ${order.qty}`);
      else show(c, autoVans() ? null : `📋 ${t('vanPick')}`, true);
    }
  };

  const pointer = new EdgePointer(root);
  // A pointing hand for a newcomer to the farm: pick the ripe crops, carry them to the stand,
  // serve, collect the cash, then on to the next pad, until the stand has a helper.
  const hand = new GuideHand(labels);
  /** Until the driver comes, the vans need the hero: pick an order on the board, then carry the goods into the van. */
  const vanGuide = (): GuideStep | null => {
    const vans = vanIds();
    if (vans.length === 0 || autoVans()) return null;
    for (const van of vans) {
      const wants = deliveries.wants(van);
      if (wants && playerCarry.count(wants.good) > 0) return { at: dropAt(layout.vans[van]!.bay), text: 'guideLoadVan' };
    }
    if (!state.flags.includes(sentFlag) && vans.some((v) => deliveries.atYard(v) && !deliveries.orderOf(v)) && deliveries.orders.length > 0) {
      return { at: dropAt(layout.boardSpot), text: 'guideOrders' };
    }
    const cows = livestock.first('cows');
    if (cows && !state.flags.includes(bottledFlag) && livestock.packs(cows.id) > 0) return { at: dropAt(cows.zone), text: 'guideMilk' };
    return null;
  };
  const guide = (): GuideStep | null => {
    const vanStep = vanGuide();
    if (vanStep) return vanStep;
    // The first baking: pick it up at the bread table.
    if (bakery.open && bakery.total > 0 && !state.flags.includes(bakedFlag) && !state.unlocked.includes('baker')) {
      return { at: dropAt(bakery.spot.zone), text: 'guideBakery' };
    }
    if (state.unlocked.includes(GUIDE_UNTIL)) {
      const cows = livestock.first('cows');
      return cows && !state.flags.includes(bottledFlag) && livestock.packs(cows.id) > 0 ? { at: dropAt(cows.zone), text: 'guideMilk' } : null;
    }
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
    // The first eggs: pack a carton, then take it to the stand.
    const coop = livestock.first('hens');
    if (coop && !state.flags.includes(packedFlag) && livestock.packs(coop.id) > 0) return { at: dropAt(coop.zone), text: 'guideEggs' };
    if (playerCarry.count('eggs') > 0 && stock.stock(stand.id, 'eggs') === 0) return { at: dropAt(stand.spot.zone), text: 'guideStock' };
    // Someone waiting at an empty stand: go and pick more.
    if (waiting && stock.total(stand.id) === 0 && !state.unlocked.includes('farmhand')) return harvestOrStock();
    const next = pads.next;
    return next && state.cash >= next.owed ? { at: next.at, text: 'guideBuild' } : null;
  };
  const meta = createMeta({ root, state, saves, sound, traffic: null, pads, supplies: null, setBoost: (m) => (walkups.boost = m), town: 'farm' });
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
    const move = input.read();
    traffic.tick();
    // Nobody walks through a vehicle on its way (parked ones stand on solid spots of their own).
    const vehicles = traffic.footprints();
    player.update(dt, move, [...solids, ...fixed, ...vehicles], view.walkable);
    pads.update(dt, player.position);
    upgrades.update(dt, player.position);
    staff.update(dt, walkups.counters, null, solids, (counter) => insideRect(player.position, counter.zone), null, vehicles);
    waterRound(dt, now);
    const carriers = [playerCarry, ...staff.crateCarriers<GoodId>()];
    machines.update(dt, now, carriers);
    // Only the hero and the farmhand pick crops (the egg collector just walks across the fields), and the orchard picker apples.
    crops.update(dt, now, [playerCarry, ...staff.crateCarriers<GoodId>('farmhand')]);
    crops.update(dt, now, staff.crateCarriers<GoodId>('orchardhand'), (crop) => crop === 'apple');
    livestock.update(dt, now, carriers);
    bakery.update(dt, now, carriers);
    deliveries.update(now);
    for (const van of vanIds()) {
      const spot = layout.vans[van];
      if (spot) deliveries.load(van, spot.bay, carriers, (carrier) => carrier === playerCarry && sound.play('chip'));
    }
    if (state.unlocked.includes('barn')) {
      const stand = outlet();
      barn.update(
        dt,
        carriers,
        new Set(),
        stand ? { id: stand.id, stock } : null,
        vanIds().map((v) => ({ wants: () => deliveries.wants(v), fill: () => deliveries.fill(v) })),
      );
    }
    fleet.update(dt, (van) => deliveries.tripProgress(van, now), (van) => VANS[van]?.trip ?? 60);
    // Standing in front of the orders board opens it (once each time).
    const onSpot = boardShown && insideRect(player.position, layout.boardSpot);
    if (onSpot && !onBoardSpot) openBoard();
    onBoardSpot = onSpot;
    stock.update(standSpots(), carriers);
    playerCarry.update(dt, player.isMoving);
    const serving = walkups.update(dt, work);
    player.scrubbing = serving || crops.harvesting.has(playerCarry) || livestock.packing.has(playerCarry) || bakery.packing.has(playerCarry);
    if (sails) sails.rotation.z += SAILS_TURN * dt;
    plots.update(dt, now);
    pensView.update(dt);
    showStock();
    showAnimals();
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
    tickWind(dt);
    motion.update(dt);
    effects.update(dt);
    saves.update(dt);
    meta.update(dt);
    storyline.update(dt);
    hero.update(dt);
    press.update(dt);
    town.update(dt, player.position);
    view.update(dt, player.position);
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
