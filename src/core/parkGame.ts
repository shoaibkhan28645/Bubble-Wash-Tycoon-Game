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
import { Color, Vector3, type Object3D } from 'three';
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
import { copies, parkland, ropes } from '../render/parkland';
import { DeliveryTruck, LitterView } from '../render/parkProps';
import { loadPeople } from '../render/assets';
import { blobShadows } from '../render/models/actors';
import { nightGlow, skinnedToyMaterial } from '../render/models/build';
import { warmRigidSkin } from '../render/models/rigid';
import { PARK_SOLIDS, RideView, Spinners, overRide, parkModel, parkPadModel } from '../render/models/park';
import { PadModel } from '../render/models/padModel';
import { PersonAvatar, type Tool } from '../render/models/person';
import { perk } from '../systems/career';
import { CashSystem } from '../systems/cash';
import { Carrier, carriedItems } from '../systems/carry';
import { takeFinished } from '../systems/construction';
import { levelFactor, levelStep, nextStars, tipFor } from '../systems/economy';
import { GuideHand, type GuideStep } from '../systems/guide';
import { Input } from '../systems/input';
import { NavGrid } from '../systems/nav';
import { IncomeTracker } from '../systems/offline';
import { PadSystem } from '../systems/pads';
import { Litter, type LitterPiece } from '../systems/litter';
import { ParkCrowd, eveningAt, middleOf, type Launch, type ParkAvatar, type ParkVisitor, type Ride } from '../systems/park';
import { ParkSupplies, STALL_SUPPLY, type ParkSupply, type SupplyStall } from '../systems/parkSupplies';
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
/** A stall's stock floats this high over it, and the shed's. */
const STOCK_LABEL_Y = 3.9;
/** The hero picks up litter this close (like cash). */
const LITTER_REACH = 0.8;
/** A broken-down ride puffs smoke this often (seconds). */
const SMOKE_SECONDS = 0.45;
/** What each stall hands over (held while walking away), and its icon. */
const STALL_GOODS: Record<string, { tool: Tool; icon: string }> = {
  cart: { tool: 'floss', icon: '🍭' },
  ringtoss: { tool: 'plush', icon: '🧸' },
  burger: { tool: 'burger', icon: '🍔' },
};
/** The supplies' icons. */
const SUPPLY_ICONS: Record<ParkSupply, string> = { sugar: '🍬', buns: '🥯', prizes: '🎁' };

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

/** Dusk at the fair: an orange-and-purple sky, warm low sun, the bulbs lit (never too dark to see the hero). */
const PARK_EVENING: Look = {
  sky: 0x6b4fa3,
  fogNear: 60,
  fogFar: 160,
  skyLight: 0xb09aff,
  groundLight: 0x3c3366,
  ambient: 0.8,
  sun: 0xff8f5a,
  sunStrength: 1.05,
};

/** A thunderstorm: grey sky, flat light. */
const PARK_STORM: Look = {
  sky: 0x6f7c8c,
  fogNear: 45,
  fogFar: 130,
  skyLight: 0xc9d2de,
  groundLight: 0x5d6b62,
  ambient: 1.0,
  sun: 0xc6cfdb,
  sunStrength: 0.9,
};

const mixed = { a: new Color(), b: new Color() };
/** A look part way between two. */
function mixLook(a: Look, b: Look, t: number): Look {
  const c = (x: number, y: number) => mixed.a.setHex(x).lerp(mixed.b.setHex(y), t).getHex();
  const n = (x: number, y: number) => x + (y - x) * t;
  return {
    sky: c(a.sky, b.sky),
    fogNear: n(a.fogNear, b.fogNear),
    fogFar: n(a.fogFar, b.fogFar),
    skyLight: c(a.skyLight, b.skyLight),
    groundLight: c(a.groundLight, b.groundLight),
    ambient: n(a.ambient, b.ambient),
    sun: c(a.sun, b.sun),
    sunStrength: n(a.sunStrength, b.sunStrength),
  };
}

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
  // The hero's back: boxes of supplies from the shed to the stalls.
  const heroCarry = new Carrier<ParkSupply>(player.mesh, () => player.position, () => TUNING.supplies.carryBase + levelStep(UPGRADES.kinds.carry, level('player.carry')));
  const supplies = new ParkSupplies(state);
  const litter = new Litter();
  const litterView = new LitterView(stage.scene);
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
    const base = ticket ? visitor.basePay : ((PARK.stalls as Record<string, number>)[counter.kind] ?? 0);
    const goods = STALL_GOODS[counter.kind];
    if (!ticket) supplies.use(counter);
    if (goods) (visitor.avatar as PersonAvatar | null)?.holdTool(goods.tool);
    // In a storm the stalls do a roaring trade (the booth doesn't: nobody comes to a park in the rain for its own sake).
    const storm = crowd.storm && !ticket ? PARK.storm.pay : 1;
    const pay = Math.round(base * quality(counter.id) * payBonus() * storm * (crowd.rush?.payMultiplier ?? 1));
    if (counter.kind === 'ringtoss') count('prizes');
    const tip = tipFor(pay, visitor.patience / visitor.patienceMax, TUNING.customers);
    cash.add(counter.id, pay + tip);
    const at = layout.piles[counter.id] ?? counter.at;
    floaters.show(`+$${pay} ${ticket ? '🎟️' : (goods?.icon ?? '')}`, new Vector3(at.x, 1.2, at.z), 'cash');
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
    const storm = crowd.storm && ride.def.indoor ? PARK.storm.pay : 1;
    const seat = ride.def.price * quality(ride.id) * payBonus() * storm * (crowd.rush?.payMultiplier ?? 1);
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
    () => unlockedSum(state, (e) => e.patienceBonus) - litter.patiencePenalty,
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
      onBroken: (ride) => {
        const top = overRide(ride, 4.2);
        floaters.show(`🔧 ${t('brokeDown')}`, top, 'star');
        effects.burst('smoke', new Vector3(top.x, 2.4, top.z), 14, 2.5, 0.8);
        count('breakdowns');
        flag(`broke:${current.id}`);
        sound.play('pop');
      },
      onFixed: (ride, byHero) => {
        const top = overRide(ride, 4.2);
        floaters.show(`✅ ${t('fixedRide')}`, top, 'star');
        effects.burst('sparkle', new Vector3(top.x, 2.6, top.z), 22, 4, 1);
        count('fixes');
        if (byHero) flag(`fixed:${current.id}`);
        sound.play('mission');
      },
      onLitter: (at) => {
        const piece = litter.drop(at, state.unlocked.some((id) => current.pads.find((p) => p.id === id)?.effects.bins));
        if (piece) litterView.add(piece);
      },
    },
  );
  crowd.stocked = (counter) => supplies.hasStock(counter);
  // A worn ride breaks down only once the park's got going, and one at a time.
  crowd.canBreak = () => (state.counts.riders ?? 0) >= PARK.rides.breakAfterRiders && !crowd.rides.some((r) => r.broken);
  const stalls = (): SupplyStall[] => crowd.counters.filter((c) => STALL_SUPPLY[c.kind]).map((c) => ({ id: c.id, kind: c.kind, zone: c.zone }));
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
    const ready = crowd.rides.filter((r) => r.phase === 'loading' && r.seated > 0 && !r.broken && !r.paused && r.id !== 'boats');
    if (ready.length === 0) return null;
    const best = ready.reduce((a, b) => (Number(b.full) - Number(a.full) || b.waited - a.waited) > 0 ? b : a);
    return best.spot.lever;
  };
  const near = (p: Point | null, q: Point, reach: number) => !!p && Math.hypot(p.x - q.x, p.z - q.z) <= reach;
  const staffAt = (role: 'mechanic' | 'janitor' | 'boats' | 'mascot'): Point | null => {
    const avatar = staff.avatarOf(role);
    return avatar ? { x: avatar.root.position.x, z: avatar.root.position.z } : null;
  };
  // The dock hand stays by the jetty and sends the boats off.
  staff.walkPlans.boats = () => crowd.ride('boats')?.spot.lever ?? null;
  // Starry the mascot goes to the longest line and cheers it up.
  let mascotLine: Point | null = null;
  staff.walkPlans.mascot = () => {
    let best: { at: Point; n: number } | null = null;
    for (const ride of crowd.rides) if (!best || ride.line.length > best.n) best = { at: ride.spot.queue[Math.floor(ride.spot.queue.length / 2)]!, n: ride.line.length };
    for (const c of crowd.counters) if (!best || c.line.length > best.n) best = { at: c.spot.queue[1] ?? c.spot.window, n: c.line.length };
    if (!best || best.n === 0) return null;
    // Beside the line, not in it.
    mascotLine = best.at;
    return { x: best.at.x + 1.3, z: best.at.z + 0.6 };
  };
  // The mechanic's round: to the lever of a broken-down ride, to fix it there.
  staff.walkPlans.mechanic = () => crowd.rides.find((r) => r.broken)?.spot.lever ?? null;
  // The janitor's round: to the nearest litter, to sweep it up.
  let sweeping: LitterPiece | null = null;
  staff.walkPlans.janitor = (at) => sweeping?.at ?? litter.nearest(at)?.at ?? null;
  // The snack runner's round: boxes from the shed, then to the stall that needs what's on their back.
  staff.carryPlans.snackrunner = (c) => {
    const carrier = c as Carrier<ParkSupply>;
    const list = stalls();
    const stall = supplies.stallFor(list, carrier);
    const more = !carrier.full && supplies.wanted(list, carrier.stack) !== null;
    if (stall && !more) return middleOf(stall.zone);
    if (more && supplies.open) return middleOf(layout.shed.door);
    return stall ? middleOf(stall.zone) : null;
  };

  // Rides: the model turning, the lever, its pad ring, the queue ropes, and a sign over it saying how full it is.
  const rideViews: { ride: Ride; view: RideView; pad: PadModel; sign: { el: HTMLElement; label: Label; shown: string } }[] = [];
  const addRide = (id: string, kind: string, animate: boolean): void => {
    const ride = crowd.addRide(id, kind);
    if (!ride) return;
    const view = new RideView(ride, stage.scene, layout.lake);
    view.onBump = (at) => {
      effects.burst('sparkle', at, 6, 2.5, 0.5);
      sound.play('pop');
    };
    ride.wear = state.supplies[`wear.${id}`] ?? 0;
    ride.broken = (state.supplies[`broken.${id}`] ?? 0) > 0;
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
      const text = ride.paused
        ? t('rideStorm', { icon })
        : ride.broken
        ? ride.fixing > 0
          ? t('rideFixing', { percent: Math.round(ride.fixing * 100) })
          : t(state.unlocked.includes('mechanic') ? 'rideBroken' : 'rideBrokenFix')
        : ride.phase === 'running'
          ? t('rideRunning', { icon })
          : ride.full
            ? t(state.unlocked.includes('operator') ? 'rideFull' : 'rideFullPull', { icon })
            : t('rideLoading', { icon, seated: ride.seated, seats });
      if (text === sign.shown) continue;
      sign.shown = text;
      sign.el.textContent = text;
      sign.el.classList.toggle('is-full', ride.full && ride.phase === 'loading' && !ride.broken);
      sign.el.classList.toggle('is-empty', ride.broken);
      labels.remeasure(sign.label);
    }
  };

  const addBuilt = (id: string, animate: boolean): void => {
    const effects = current.pads.find((p) => p.id === id)?.effects;
    if (effects?.ride) addRide(id, effects.ride, animate);
    else showBuilding(id, animate);
    if (effects?.counter) {
      crowd.addCounter(id, effects.counter, labels);
      const stall = stalls().find((s) => s.id === id);
      if (stall) supplies.fillStall(stall);
    }
    if (effects?.supplies) supplies.openShed(stalls());
    if (effects?.bins) {
      stage.scene.add(withShadows(copies('pk_bin', layout.bins)));
      for (const b of layout.bins) solids.push({ minX: b.x - 0.32, maxX: b.x + 0.32, minZ: b.z - 0.32, maxZ: b.z + 0.32 });
    }
    if (layout.benches[id]) crowd.addBenches(id);
    staff.hire(id);
    if (id === 'mascot') dressMascot();
  };
  /** Starry's costume: a big smiling star for a head and a round yellow suit, over a staff member. */
  function dressMascot(): void {
    const avatar = staff.avatarOf('mascot');
    if (!avatar || avatar.root.getObjectByName('pk_mascot_head')) return;
    const costume = parkModel('pk_mascot');
    const head = costume.getObjectByName('pk_mascot_head');
    const suit = costume.getObjectByName('pk_mascot_suit');
    if (head) {
      head.position.set(0, 1.42, 0.02);
      head.scale.setScalar(1.15);
      avatar.root.add(head);
    }
    if (suit) {
      suit.position.set(0, 0.86, 0);
      suit.scale.set(1.3, 1.35, 1.3);
      avatar.root.add(suit);
    }
    avatar.root.traverse((node) => (node.castShadow = false));
  }
  // The delivery truck brings the shed a load when it's running low.
  const truck = new DeliveryTruck(stage.scene, layout.shed, () => {
    const boxes = supplies.deliver();
    const door = middleOf(layout.shed.door);
    if (boxes > 0) floaters.show(`📦 +${boxes}`, new Vector3(door.x, 2.4, door.z), 'star');
  });
  let truckTimer = PARK.supplies.truckSeconds / 2;

  // Stock counts over the stalls (once the shed is open) and over the shed.
  const stockLabel = (at: Point, height: number) => {
    const el = document.createElement('div');
    el.className = 'shelf-stock';
    const label = labels.add(el, new Vector3(at.x, height, at.z));
    label.visible = false;
    return { el, label, shown: '' };
  };
  const stallLabels = new Map<string, ReturnType<typeof stockLabel>>();
  const shedLabel = stockLabel(layout.buildAt.shed ?? layout.pads.shed ?? { x: 0, z: 0 }, STOCK_LABEL_Y + 0.8);
  const showLabel = (entry: ReturnType<typeof stockLabel>, text: string | null, empty = false): void => {
    entry.label.visible = text !== null;
    if (text === null || text === entry.shown) return;
    entry.shown = text;
    entry.el.textContent = text;
    entry.el.classList.toggle('is-empty', empty);
    labels.remeasure(entry.label);
  };
  const showStock = (): void => {
    for (const stall of stalls()) {
      let entry = stallLabels.get(stall.id);
      if (!entry) {
        entry = stockLabel(layout.buildAt[stall.id] ?? layout.pads[stall.id] ?? middleOf(stall.zone), STOCK_LABEL_Y);
        stallLabels.set(stall.id, entry);
      }
      const item = STALL_SUPPLY[stall.kind]!;
      const left = supplies.stock(stall.id);
      showLabel(entry, supplies.open ? (left > 0 ? `${STALL_GOODS[stall.kind]?.icon ?? ''} ${left} / ${supplies.capacity}` : t('stallEmpty', { icon: SUPPLY_ICONS[item] })) : null, left === 0);
    }
    showLabel(shedLabel, supplies.open ? (['sugar', 'buns', 'prizes'] as const).map((i) => `${SUPPLY_ICONS[i]} ${supplies.shed(i)}`).join('  ') : null);
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
    staff: near(operatorAt(), ride.spot.lever, LEVER_REACH) || (ride.id === 'boats' && near(staffAt('boats'), ride.spot.lever, LEVER_REACH)),
    mechanic: near(staffAt('mechanic'), ride.spot.lever, LEVER_REACH),
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
  /** The first breakdown and the first empty stall: shown how to deal with them, the first time. */
  const helpStep = (): GuideStep | null => {
    const broken = crowd.rides.find((r) => r.broken);
    if (broken && !state.unlocked.includes('mechanic') && !state.flags.includes(`fixed:${current.id}`)) return { at: broken.spot.lever, text: 'guideFix' };
    if (!supplies.open || state.unlocked.includes('snackrunner') || state.flags.includes(`stocked:${current.id}`)) return null;
    const list = stalls();
    const stall = supplies.stallFor(list, heroCarry);
    if (stall) return { at: middleOf(stall.zone), text: 'guideSupplies' };
    const empty = list.some((s) => supplies.stock(s.id) === 0);
    return empty && supplies.wanted(list, heroCarry.stack) ? { at: middleOf(layout.shed.door), text: 'guideShed' } : null;
  };
  const guide = (): GuideStep | null => {
    const help = helpStep();
    if (help) return help;
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
  let sparkTimer = 0;
  // The tour bus: every so often (once there's a stop) it pulls up and a crowd gets off.
  const bus = new DeliveryTruck(
    stage.scene,
    { truckIn: layout.busStop.busIn, truckOut: layout.busStop.busOut },
    () => {
      const [low, high] = PARK.bus.riders as [number, number];
      const n = crowd.spawnGroup(layout.busStop.stop, Math.round(low + Math.random() * (high - low)));
      if (n > 0) floaters.show(`🚌 +${n}`, new Vector3(layout.busStop.stop.x, 2.6, layout.busStop.stop.z), 'star');
    },
    'pk_bus',
    false,
  );
  let busTimer = PARK.bus.seconds / 3;
  const built = (effect: 'evenings' | 'bus') => state.unlocked.some((id) => current.pads.find((p) => p.id === id)?.effects[effect]);
  // The day turns to evening and back, once the lights are up; the storm comes with the haunted house.
  let dayTime = 0;
  let stormLeft = 0;
  let stormMix = 0;
  let flashTimer = 3;
  const stormFlag = `storm:${current.id}`;
  const flash = document.createElement('div');
  flash.className = 'storm-flash';
  root.appendChild(flash);
  // The dev console can jump the park's clock (to see the evening) and end the storm.
  if (import.meta.env.DEV) Object.assign(window, { parkClock: (t: number, storm = stormLeft) => ((dayTime = t), (stormLeft = storm)) });
  let mascotWave = 0;
  let photoTimer = PARK.mascot.photoSeconds;
  const fixed = fixedSolids(layout);
  const loop = new Loop((dt) => {
    clock.advance(dt);
    state.playSeconds += dt;
    const move = input.read();
    player.update(dt, move, [...solids, ...fixed], view.walkable);
    pads.update(dt, player.position);
    upgrades.update(dt, player.position);
    staff.update(dt, crowd.counters, null, solids, (counter) => insideRect(player.position, counter.zone), null, []);
    for (const ride of crowd.rides) {
      ride.timeScale = levelFactor(UPGRADES.kinds.speed, level(`${ride.id}.speed`));
      ride.wearScale = levelFactor(UPGRADES.kinds.sturdy, level(`${ride.id}.sturdy`));
    }
    const serving = crowd.update(dt, work, lever);
    // Fixing a broken-down ride at its lever: the hero gets busy with his hands, and sparks fly.
    const fixing = crowd.rides.find((r) => r.broken && near(player.position, r.spot.lever, LEVER_REACH));
    player.scrubbing = serving || !!fixing;
    sparkTimer -= dt;
    if (sparkTimer <= 0) {
      sparkTimer = SMOKE_SECONDS;
      for (const ride of crowd.rides) {
        if (!ride.broken) continue;
        effects.burst('smoke', new Vector3(ride.spot.at.x, 2.6, ride.spot.at.z), 2, 1.2, 0.4);
        const fixer = near(player.position, ride.spot.lever, LEVER_REACH) || near(staffAt('mechanic'), ride.spot.lever, LEVER_REACH);
        if (fixer) effects.burst('sparkle', new Vector3(ride.spot.lever.x, 1.0, ride.spot.lever.z), 6, 3, 0.4);
      }
    }
    // The mechanic at work on a broken ride, wrench in hand.
    const mechanicAt = staffAt('mechanic');
    const repairing = crowd.rides.find((r) => r.broken && near(mechanicAt, r.spot.lever, LEVER_REACH));
    if (repairing && !staff.isActing('mechanic')) staff.act('mechanic', 0.4, repairing.spot.at);
    // The janitor sweeps up the litter they've walked to.
    const janitorAt = staffAt('janitor');
    if (sweeping && !staff.isActing('janitor')) {
      litter.pieces.splice(litter.pieces.indexOf(sweeping), 1);
      litterView.remove(sweeping);
      effects.burst('smoke', new Vector3(sweeping.at.x, 0.3, sweeping.at.z), 3, 1, 0.2);
      sweeping = null;
    }
    const piece = janitorAt && !sweeping ? litter.nearest(janitorAt) : null;
    if (piece && near(janitorAt, piece.at, 0.6)) {
      sweeping = piece;
      piece.taken = true;
      staff.act('janitor', 1.1, piece.at);
    }
    // The hero picks up litter by walking over it.
    for (const picked of litter.pickUp(player.position, LITTER_REACH)) {
      if (picked === sweeping) sweeping = null;
      litterView.remove(picked);
      effects.burst('sparkle', new Vector3(picked.at.x, 0.4, picked.at.z), 5, 2, 0.4);
      count('litter');
      sound.play('pop');
    }
    // Supplies: picked up at the shed's door, handed over behind the stalls.
    heroCarry.update(dt, player.isMoving);
    supplies.update(
      [heroCarry, ...staff.crateCarriers<ParkSupply>('snackrunner')],
      stalls(),
      layout.shed.door,
      (carrier) => carrier === heroCarry && sound.play('chip'),
      (carrier) => {
        if (carrier !== heroCarry) return;
        flag(`stocked:${current.id}`);
        sound.play('pop');
      },
    );
    truckTimer -= dt;
    if (truckTimer <= 0) {
      truckTimer = PARK.supplies.truckSeconds;
      if (supplies.wantsTruck) truck.send();
    }
    truck.update(dt);
    for (const { ride, view: rideView, pad } of rideViews) {
      rideView.update(dt);
      pad.update(dt, near(player.position, ride.spot.lever, LEVER_REACH));
      state.supplies[`wear.${ride.id}`] = ride.wear;
      state.supplies[`broken.${ride.id}`] = ride.broken ? 1 : 0;
    }
    // Evenings, and the storm.
    if (built('evenings')) dayTime += dt;
    if (state.unlocked.includes('haunted') && !state.flags.includes(stormFlag)) {
      flag(stormFlag);
      stormLeft = PARK.storm.seconds;
    }
    stormLeft = Math.max(0, stormLeft - dt);
    crowd.storm = stormLeft > 0;
    stormMix += ((crowd.storm ? 1 : 0) - stormMix) * Math.min(1, dt * 0.6);
    const evening = built('evenings') ? eveningAt(dayTime, PARK.evening) : 0;
    nightGlow.value = Math.max(evening, stormMix * 0.6);
    stage.setLook(mixLook(mixLook(PARK_LOOK, PARK_EVENING, evening), PARK_STORM, stormMix));
    if (stormMix > 0.05) {
      // Rain round the hero, and now and then a flash of lightning.
      for (let k = 0; k < 3; k++) {
        const at = new Vector3(player.position.x + (Math.random() - 0.5) * 22, 7, player.position.z + (Math.random() - 0.5) * 18);
        effects.burst('water', at, 1, 0.4, 0.1);
      }
      flashTimer -= dt;
      if (flashTimer <= 0 && crowd.storm) {
        const [low, high] = PARK.storm.flashSeconds as [number, number];
        flashTimer = low + Math.random() * (high - low);
        flash.classList.remove('is-on');
        void flash.offsetWidth;
        flash.classList.add('is-on');
      }
    }
    // The tour bus.
    if (built('bus')) {
      busTimer -= dt;
      if (busTimer <= 0) {
        busTimer = PARK.bus.seconds;
        bus.send();
      }
    }
    bus.update(dt);
    // Starry the mascot: cheers up the line they're by (waving now and then), and poses for photos.
    const mascot = staffAt('mascot');
    const atLine = !!mascot && !!mascotLine && Math.hypot(mascot.x - mascotLine.x - 1.3, mascot.z - mascotLine.z - 0.6) < 0.8;
    crowd.calm = atLine ? mascot : null;
    if (atLine) {
      mascotWave -= dt;
      photoTimer -= dt;
      if (mascotWave <= 0) {
        mascotWave = PARK.mascot.waveSeconds;
        staff.avatarOf('mascot')?.wave();
      }
      if (photoTimer <= 0) {
        photoTimer = PARK.mascot.photoSeconds;
        const tip = PARK.mascot.photoTip;
        const pile = crowd.rides.find((r) => r.spot.queue.includes(mascotLine!))?.id ?? crowd.counters.find((c) => c.spot.queue.includes(mascotLine!))?.id;
        if (pile) {
          cash.add(pile, tip);
          floaters.show(`📸 +$${tip}`, new Vector3(mascot!.x, 2.6, mascot!.z), 'tip');
          effects.burst('sparkle', new Vector3(mascot!.x, 1.6, mascot!.z), 8, 3, 0.5);
        }
      }
    }
    showRides();
    showStock();
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
      nightGlow.value = 0;
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
