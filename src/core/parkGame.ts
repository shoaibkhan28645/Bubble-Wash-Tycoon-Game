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
import { Fireworks } from '../render/effects/fireworks';
import { ParkNight } from '../render/parkNight';
import { PlushShelf } from '../render/plushShelf';
import { Particles } from '../render/effects/particles';
import { copies, parkland, ropes } from '../render/parkland';
import { DeliveryTruck, LitterView } from '../render/parkProps';
import { Parade, dressAsStarry } from '../render/parade';
import { loadPeople } from '../render/assets';
import { blobShadows } from '../render/models/actors';
import { nightGlow, skinnedToyMaterial } from '../render/models/build';
import { warmRigidSkin } from '../render/models/rigid';
import { ConstructionSites } from '../render/models/site';
import { PARK_SOLIDS, RideView, Spinners, lightSigns, overRide, parkModel, parkPadModel } from '../render/models/park';
import { PadModel } from '../render/models/padModel';
import { PersonAvatar, type Tool } from '../render/models/person';
import { perk } from '../systems/career';
import { CashSystem } from '../systems/cash';
import { Carrier, carriedItems } from '../systems/carry';
import { formatClock, takeFinished } from '../systems/construction';
import { levelFactor, levelStep, nextStars, tipFor } from '../systems/economy';
import { GuideHand, type GuideStep } from '../systems/guide';
import { Input } from '../systems/input';
import { NavGrid } from '../systems/nav';
import { IncomeTracker } from '../systems/offline';
import { createJobs } from './jobs';
import { PadSystem } from '../systems/pads';
import { Litter, type LitterPiece } from '../systems/litter';
import { ParkCrowd, eveningAt, middleOf, type Launch, type ParkAvatar, type ParkVisitor, type Ride } from '../systems/park';
import { ParkSupplies, STALL_SUPPLY, type ParkSupply, type SupplyStall } from '../systems/parkSupplies';
import { PLUSH, shelf, shelfBonus, winPlush } from '../systems/prizes';
import { localDate } from '../systems/daily';
import { Player, stepOutOf } from '../systems/player';
import { StaffSystem } from '../systems/staff';
import { unlockedSum } from '../systems/arrivals';
import { insideRect } from '../systems/stations';
import type { Paid } from '../systems/till';
import { UpgradePads } from '../systems/upgrades';
import type { WalkUpCounter } from '../systems/walkups';
import { Floaters } from '../ui/carBubbles';
import { EdgePointer } from '../ui/edgePointer';
import { toast } from '../ui/dialog';
import { showPrizeShelf } from '../ui/prizeShelf';
import { EventChips } from '../ui/eventChips';
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
/** A perfect-launch rush job comes for a ride with this share of a load on it or in line. */
const PERFECT_JOB_LOAD = 0.75;
/** Near a lever, the camera looks this far (a share of the way) from the hero towards the ride's middle. */
const LEVER_FOCUS = 0.55;
const LEVER_FOCUS_REACH = 1.4;
/** Visitors walk round each other and what's built, this far clear. */
const NAV_RADIUS = 0.35;
/** A metre across the grass is worth this many along a path: visitors keep to the paths, and step off near where they're going. */
const OFF_PATH = 2.5;
/** Half the width of a tree's trunk (at its size 1) and a lamp post's foot, solid (metres). */
const TRUNK = 0.32;
const LAMP_POST = 0.16;

/** A square `half` metres either side of `at`. */
function around(at: Point, half: number): Rect {
  return { minX: at.x - half, maxX: at.x + half, minZ: at.z - half, maxZ: at.z + half };
}
/** A child is drawn this much smaller. */
const CHILD_SCALE = 0.72;
/** A ride's sign floats this high over its middle. */
const RIDE_LABEL_Y = 6.4;
/** A stall's stock floats this high over it, and the shed's. */
const STOCK_LABEL_Y = 3.9;
/** The hero picks up litter this close (like cash). */
const LITTER_REACH = 0.8;
/** The festival parade's way round the park's main paths. */
const PARADE_ROUTE: Point[] = [
  { x: -19.5, z: -3.5 },
  { x: 16.5, z: -3.5 },
  { x: 16.5, z: 13.5 },
  { x: -19.5, z: 13.5 },
  { x: -19.5, z: -3.5 },
];
/** Which zones' rides each operator launches (rides.json `zone`). */
const OPERATOR_ZONES: Record<'operator' | 'boats' | 'crew', readonly string[]> = {
  operator: ['kiddie', 'midway'],
  boats: ['lakeside'],
  crew: ['thrill'],
};
/** Sounds are full within this far of the hero (metres) and die away over the next stretch. */
const HEAR_NEAR = 10;
const HEAR_FADE = 28;
/** Fireworks carry further. */
const BANG_NEAR = 24;
const BANG_FADE = 50;
/** The lift chain clanks this often (seconds). */
const CLANK_SECONDS = 0.45;
/** A share of bursts that draws an "ooh" from the crowd. */
const OOH_CHANCE = 0.18;
/** A broken-down ride puffs smoke this often (seconds). */
const SMOKE_SECONDS = 0.45;
/** What each stall hands over (held while walking away), and its icon. */
const STALL_GOODS: Record<string, { tool: Tool; icon: string }> = {
  cart: { tool: 'floss', icon: '🍭' },
  ringtoss: { tool: 'plush', icon: '🧸' },
  burger: { tool: 'burger', icon: '🍔' },
  giftshop: { tool: 'balloon', icon: '🎈' },
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

/**
 * Night at the fair: a deep blue sky and cool moonlight, dark enough for
 * the bulbs, the lamps' pools of light, the strings of coloured bulbs and
 * the rides' washes of colour to shine (parkNight.ts), never so dark the
 * hero is hard to see.
 */
const PARK_EVENING: Look = {
  sky: 0x141c4f,
  fogNear: 70,
  fogFar: 175,
  skyLight: 0x8094e6,
  groundLight: 0x3a3176,
  ambient: 0.9,
  sun: 0x9aaaf5,
  sunStrength: 0.55,
};
/** Marquee lights round a ride: its round platform's edge, or its station's deck (a light every 60 cm or so). */
function marqueeRound(ride: Ride): Vector3[] {
  const points: Vector3[] = [];
  // A station's deck; a round platform; or the ride's footprint (the bumper cars' arena, the haunted house).
  const box = PARK_SOLIDS[ride.id]?.[0];
  const deck =
    ride.spot.deck ??
    (ride.def.board !== 'ring' && box
      ? { minX: ride.spot.at.x + (box[2] ?? 0) - box[0] - 0.15, maxX: ride.spot.at.x + (box[2] ?? 0) + box[0] + 0.15, minZ: ride.spot.at.z + (box[3] ?? 0) - box[1] - 0.15, maxZ: ride.spot.at.z + (box[3] ?? 0) + box[1] + 0.15 }
      : null);
  const y = ride.spot.deck ? ride.def.deck + 0.12 : ride.def.board === 'ring' ? ride.def.deck + 0.12 : 0.25;
  if (ride.def.board !== 'ring' && !deck) return points;
  if (deck) {
    const corners = [
      [deck.minX, deck.maxZ],
      [deck.maxX, deck.maxZ],
      [deck.maxX, deck.minZ],
      [deck.minX, deck.minZ],
    ];
    for (let c = 0; c < 4; c++) {
      const [ax = 0, az = 0] = corners[c]!;
      const [bx = 0, bz = 0] = corners[(c + 1) % 4]!;
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 0.6));
      for (let k = 0; k < n; k++) points.push(new Vector3(ax + ((bx - ax) * k) / n, y, az + ((bz - az) * k) / n));
    }
    return points;
  }
  const r = ride.def.plinth + (ride.def.board === 'ring' ? 0.05 : 0.3);
  const n = Math.round((2 * Math.PI * r) / 0.6);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * 2 * Math.PI;
    points.push(new Vector3(ride.spot.at.x + r * Math.cos(a), y, ride.spot.at.z - r * Math.sin(a)));
  }
  return points;
}
/** Each ride's wash of colour after dark. */
const RIDE_GLOW: Record<string, string> = {
  carousel: '#ff4fa3',
  teacups: '#3fd0ff',
  bumper: '#b06bff',
  swings: '#ffc93a',
  boats: '#3ff0e0',
  haunted: '#6dff4a',
  flume: '#4fb0ff',
  coaster: '#ff4f7a',
  wheel: '#c07bff',
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
  // The park's own sounds and music (a fairground tune) load as the hero arrives.
  void sound.loadSet('park');
  sound.useMusic('park');
  stage.scene.add(withShadows(parkland(layout, spinners), false, true));

  const level = (key: string) => state.levels[key] ?? 0;
  const player = new Player(stage.scene, layout.playerStart, TUNING.player, () => 1 + perk(state, 'walk'));
  player.onFootstep(() => sound.play('step'));
  /** How loud a sound at `at` is to the hero (1 close by, 0 far off). */
  const hearing = (at: Point, near = HEAR_NEAR, fade = HEAR_FADE): number =>
    Math.max(0, Math.min(1, 1 - (Math.hypot(at.x - player.position.x, at.z - player.position.z) - near) / fade));
  // The park takes far more a ride than a car wash: its piles hold more before the cashier comes.
  const cash = new CashSystem(stage.scene, layout, { ...TUNING.cash, pileCap: PARK.pileCap }, state, effects, sound);
  const floaters = new Floaters(labels);
  const chips = new EventChips(root);
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
  /** How far into the evening it is (0 by day, 1 at night), and whether the fireworks barge is built. */
  let evening = 0;
  /** A festival weekend (Saturday or Sunday, once the park has its lights): double fireworks, a parade, more visitors. */
  let festival = false;
  const fireworksBuilt = (): boolean => state.unlocked.some((id) => current.pads.find((p) => p.id === id)?.effects.fireworks);

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
  for (const tree of layout.trees) solids.push(around(tree, TRUNK * (tree.size ?? 1)));
  for (const lamp of layout.lamps) solids.push(around(lamp, LAMP_POST));
  const grow = (mesh: Object3D, animate: boolean): void => {
    if (!animate) return;
    mesh.scale.setScalar(0.001);
    growing.push({ mesh, age: 0 });
  };
  /** The fireworks barge, bobbing on the lake; the gift shop's shelves of plush toys. */
  let barge: Object3D | null = null;
  let plushShelf: PlushShelf | null = null;
  const showBuilding = (id: string, animate: boolean): void => {
    const at = layout.buildAt[id] ?? layout.pads[id];
    const mesh = parkPadModel(id);
    if (!mesh || !at) return;
    mesh.position.set(at.x, 0, at.z);
    if (id === 'fireworks') barge = mesh;
    if (id === 'giftshop') {
      plushShelf = new PlushShelf(stage.scene, at);
      plushShelf.show(shelf(state));
    }
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
      nav = new NavGrid(layout.walk, [...solids, ...fixedSolids(layout)], NAV_RADIUS, { paved: [...layout.paths, layout.plaza], offPath: OFF_PATH });
      navSolids = solids.length;
    }
    return nav.findPath(from, to);
  };

  const onPaid = (paid: Paid): void => {
    // The town's steady staff takings: what it earns while the hero is elsewhere (one-offs left out).
    if (paid.automated && !paid.bonus) income.add(clock.now, paid.amount);
    meta.onPaid(paid);
    town.onPaid(paid);
  };
  // A ride's (or the gate's) quality upgrade became its ticket price: an older save's levels move across.
  for (const id of ['booth', ...current.pads.filter((p) => p.effects.ride).map((p) => p.id)]) {
    const old = state.levels[`${id}.quality`];
    if (!old) continue;
    state.levels[`${id}.price`] = Math.max(old, state.levels[`${id}.price`] ?? 0);
    delete state.levels[`${id}.quality`];
  }
  /** What a ride's ticket (or a stall's sale) is worth, with its ticket price or quality upgrades. */
  const quality = (id: string) =>
    levelFactor(UPGRADES.kinds.quality, level(`${id}.quality`)) * levelFactor(UPGRADES.kinds.price, level(`${id}.price`));
  // A spotless park (no litter about for a while, with a crowd in) pays a little more until the next wrapper drops.
  let spotlessFor = 0;
  let spotless = false;
  const payBonus = () => 1 + unlockedSum(state, (e) => e.payBonus) + (spotless ? PARK.spotless.bonus : 0);
  const onServed = (visitor: ParkVisitor, counter: WalkUpCounter): void => {
    const ticket = counter === crowd.booth;
    const base = ticket ? visitor.basePay : ((PARK.stalls as Record<string, number>)[counter.kind] ?? 0);
    const goods = STALL_GOODS[counter.kind];
    if (!ticket) supplies.use(counter);
    if (goods) (visitor.avatar as PersonAvatar | null)?.holdTool(goods.tool);
    // In a storm the stalls do a roaring trade (the booth doesn't: nobody comes to a park in the rain for its own sake).
    const storm = crowd.storm && !ticket ? PARK.storm.pay : 1;
    // Litter lying about near it puts people off a little.
    const mess = litter.messAt(counter.at);
    const pay = Math.round(base * quality(counter.id) * payBonus() * storm * (1 - mess) * (crowd.rush?.payMultiplier ?? 1));
    if (counter.kind === 'ringtoss') {
      count('prizes');
      meta.count('prize');
      // Now and then the prize is a plush the shelf hasn't got yet.
      const plush = winPlush(state);
      if (plush) {
        count('shelf');
        const won = shelf(state).length;
        plushShelf?.show(shelf(state));
        floaters.show(`${plush.icon} ${t('newPlush', { found: won, all: PLUSH.length })}`, new Vector3(counter.at.x, 3.2, counter.at.z), 'star');
        effects.burst('confetti', new Vector3(counter.at.x, 2.4, counter.at.z), 24, 4, 0.8);
        sound.play('reward');
        void saves.saveNow();
      }
    }
    const tip = tipFor(pay, visitor.patience / visitor.patienceMax, TUNING.customers);
    cash.add(counter.id, pay + tip);
    visitor.spent += pay + tip;
    const at = layout.piles[counter.id] ?? counter.at;
    floaters.show(`+$${pay} ${ticket ? '🎟️' : (goods?.icon ?? '')}${mess > 0 ? ' 🗑️' : ''}`, new Vector3(at.x, 1.2, at.z), 'cash');
    if (tip > 0) floaters.show(`+$${tip} tip`, new Vector3(at.x + 0.6, 1.9, at.z), 'tip');
    state.stars = nextStars(state.stars, tip > 0 ? 'happy' : 'okay', TUNING.stars);
    if (visitor.manual) flag(soldFlag);
    sound.play('ching');
    onPaid({ amount: pay + tip, tip, automated: !visitor.manual, at });
  };
  /** Who's given up where (the play-test bot looks): a window's line, a ride's, or 'idle' (every line they wanted full). */
  const gaveUp: Record<string, number> = {};
  const onGaveUp = (visitor: ParkVisitor, where: string): void => {
    gaveUp[where] = (gaveUp[where] ?? 0) + 1;
    state.stars = nextStars(state.stars, 'angry', TUNING.stars);
    floaters.show(visitor.vip ? '💔' : '😠', new Vector3(visitor.at.x, 2.2, visitor.at.z), 'star');
    if (visitor.vip) toast(root, `💔 ${t('vipGaveUp')}`);
    sound.play('pop');
  };
  const onLaunch = (ride: Ride, launch: Launch): void => {
    const rules = PARK.rides;
    const storm = crowd.storm && ride.def.indoor ? PARK.storm.pay : 1;
    const night = fireworksBuilt() && evening >= 0.5 ? 1 + PARK.fireworks.nightPay : 1;
    const seat = ride.def.price * quality(ride.id) * payBonus() * storm * night * (1 + shelfBonus(shelf(state).length)) * (crowd.rush?.payMultiplier ?? 1);
    const mess = litter.messAt(ride.spot.at);
    const pay = Math.round(launch.riders * seat * (1 - mess) * (launch.full ? 1 + rules.fullBonus : 1) * (launch.serviced ? 1 + rules.serviceBonus : 1));
    const tip = launch.perfect ? Math.round(pay * rules.perfectTip) : 0;
    cash.add(ride.id, pay + tip);
    for (const rider of ride.seats) if (rider) rider.spent += Math.round(seat * (1 - mess) * (launch.full ? 1 + rules.fullBonus : 1));
    if (trip) trip.rides += ride.seats.filter((v) => v?.trip && v.step === 'seated').length;
    const at = layout.piles[ride.id] ?? ride.spot.lever;
    floaters.show(`+$${pay} ${ride.def.icon}${mess > 0 ? ' 🗑️' : ''}`, new Vector3(at.x, 1.2, at.z), 'cash');
    const top = overRide(ride, 4.6);
    if (launch.full) floaters.show(`🎉 ${t('fullHouse')}`, top, 'star');
    if (launch.perfect) {
      // A rush job may be waiting for just this: a perfect launch on this ride, by the hero.
      if (launch.by === 'hero') jobs.signal(`perfect:${ride.id}`);
      floaters.show(`⭐ ${t('perfectLaunch')} +$${tip}`, new Vector3(top.x, top.y + 0.9, top.z), 'tip');
      effects.burst('sparkle', new Vector3(ride.spot.lever.x, 1.4, ride.spot.lever.z), 18, 4, 0.9);
    }
    effects.burst('sparkle', new Vector3(ride.spot.at.x, 3.8, ride.spot.at.z), launch.full ? 26 : 10, 5, 1.2);
    count('riders', launch.riders);
    if (launch.full) {
      count('fullhouse');
      meta.count('fullRide');
      flag(fullFlag);
    }
    if (launch.perfect) count('perfect');
    if (launch.by === 'hero') flag(launchedFlag);
    state.stars = nextStars(state.stars, launch.full ? 'happy' : 'okay', TUNING.stars);
    if (launch.by === 'hero') sound.play(launch.full ? 'mission' : 'ching');
    else sound.play('ching', hearing(ride.spot.at));
    if (launch.full || launch.perfect) sound.play('cheer', hearing(ride.spot.at));
    onPaid({ amount: pay + tip, tip, automated: launch.by !== 'hero', at });
  };
  // Wish bubbles: what each visitor wants, over their head for a moment once they have a ticket (the Visitor of the Day's all day).
  const bubbles = new Map<ParkVisitor, { el: HTMLElement; label: Label; left: number; shown: string }>();
  const wishIcon = (id: string): string => {
    const ride = crowd.ride(id);
    if (ride) return ride.def.icon;
    const counter = crowd.counters.find((c) => c.id === id);
    return counter ? (STALL_GOODS[counter.kind]?.icon ?? '') : '';
  };
  const showWishes = (visitor: ParkVisitor): void => {
    if (bubbles.has(visitor)) return;
    const el = document.createElement('div');
    el.className = visitor.vip ? 'wish-bubble is-vip' : 'wish-bubble';
    const label = labels.add(el, new Vector3(visitor.at.x, 2.4, visitor.at.z));
    bubbles.set(visitor, { el, label, left: visitor.vip ? Infinity : PARK.wishBubbleSeconds, shown: '' });
  };
  const updateBubbles = (dt: number): void => {
    for (const [visitor, bubble] of bubbles) {
      bubble.left -= dt;
      if (bubble.left <= 0 || !crowd.visitors.includes(visitor)) {
        labels.remove(bubble.label);
        bubbles.delete(visitor);
        continue;
      }
      const icons = visitor.wishes.map(wishIcon).join('');
      // The Visitor of the Day: a gold star from the moment they arrive, then what they still want (a heart when that's all done).
      const text = visitor.vip ? (visitor.wished === 0 ? '⭐' : `⭐ ${icons || '❤️'}`) : icons;
      if (text !== bubble.shown) {
        bubble.shown = text;
        bubble.el.textContent = text;
        labels.remeasure(bubble.label);
      }
      bubble.label.at.set(visitor.at.x, visitor.y + (visitor.child ? 1.75 : 2.3), visitor.at.z);
      bubble.label.visible = visitor.avatar?.root.visible !== false;
    }
  };
  const crowd = new ParkCrowd(
    layout,
    state,
    // With fireworks, half as many visitors again come for the evening show.
    () => unlockedSum(state, (e) => e.arrivalBonus) + (fireworksBuilt() ? PARK.fireworks.crowd * evening : 0) + (festival ? PARK.festival.crowd : 0),
    () => unlockedSum(state, (e) => e.patienceBonus) - litter.patiencePenalty,
    makeAvatar,
    route,
    {
      onServed,
      onGaveUp,
      onLaunch,
      onPerfectDay: (visitor) => {
        floaters.show('❤️', new Vector3(visitor.at.x, 2.3, visitor.at.z), 'star');
        (visitor.avatar as PersonAvatar | null)?.wave();
        // The Visitor of the Day had a perfect day: they pay five times over.
        if (visitor.vip) {
          const bonus = Math.round(visitor.spent * (PARK.vip.pay - 1));
          cash.add('booth', bonus);
          floaters.show(`⭐ ${t('vipPaid')} +$${bonus.toLocaleString('en-US')}`, new Vector3(visitor.at.x, 3.2, visitor.at.z), 'tip');
          effects.burst('confetti', new Vector3(visitor.at.x, 2, visitor.at.z), 40, 5, 1);
          count('vipDays');
          sound.play('reward');
          onPaid({ amount: bonus, tip: bonus, automated: false, at: visitor.at });
        } else if (visitor.spent > 0) {
          // Anyone else with a perfect day tips on their way out: half as much again as they spent.
          const tip = Math.round(visitor.spent * PARK.perfectDay.tip);
          cash.add('booth', tip);
          floaters.show(`❤️ ${t('perfectDayTip')} +$${tip.toLocaleString('en-US')}`, new Vector3(visitor.at.x, 2.9, visitor.at.z), 'tip');
          onPaid({ amount: tip, tip, automated: true, at: visitor.at });
        }
        state.stars = nextStars(state.stars, 'happy', TUNING.stars);
        count('perfectDay');
        meta.count('perfectDay');
      },
      onBroken: (ride) => {
        const top = overRide(ride, 4.2);
        floaters.show(`🔧 ${t('brokeDown')}`, top, 'star');
        effects.burst('smoke', new Vector3(top.x, 2.4, top.z), 14, 2.5, 0.8);
        count('breakdowns');
        flag(`broke:${current.id}`);
        sound.play('pop');
      },
      onServiced: (ride) => {
        const top = overRide(ride, 4.2);
        floaters.show(`🛠️ ${t('rideServiced', { runs: PARK.rides.serviceRuns })}`, top, 'star');
        effects.burst('sparkle', new Vector3(top.x, 2.6, top.z), 18, 4, 1);
        count('services');
        count('upkeep');
        sound.play('upgrade');
      },
      onFixed: (ride, byHero) => {
        const top = overRide(ride, 4.2);
        floaters.show(`✅ ${t('fixedRide')}`, top, 'star');
        effects.burst('sparkle', new Vector3(top.x, 2.6, top.z), 22, 4, 1);
        count('fixes');
        count('upkeep');
        meta.count('fix');
        if (byHero) flag(`fixed:${current.id}`);
        sound.play('mission');
      },
      onWishes: (visitor) => showWishes(visitor),
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
  /** The lever of the ride in `zones` that most needs launching (full first, then the longest wait), or null. */
  const leverIn = (zones: readonly string[]): Point | null => {
    const ready = crowd.rides.filter((r) => zones.includes(r.def.zone) && r.phase === 'loading' && r.seated > 0 && !r.broken && !r.paused);
    if (ready.length === 0) return null;
    return ready.reduce((a, b) => ((Number(b.full) - Number(a.full) || b.waited - a.waited) > 0 ? b : a)).spot.lever;
  };
  // One operator a zone, walking from lever to lever: the ride operator in Kiddie Corner and the Midway, the dock hand
  // at Lakeside (the boats and the sky swings), the coaster crew in the Thrill Zone.
  staff.walkPlans.operator = () => leverIn(OPERATOR_ZONES.operator);
  const near = (p: Point | null, q: Point, reach: number) => !!p && Math.hypot(p.x - q.x, p.z - q.z) <= reach;
  const staffAt = (role: 'mechanic' | 'janitor' | 'boats' | 'mascot' | 'crew'): Point | null => {
    const avatar = staff.avatarOf(role);
    return avatar ? { x: avatar.root.position.x, z: avatar.root.position.z } : null;
  };
  // The coaster crew: from the coaster's lever to the flume's, to whichever has riders waiting (a full one first).
  staff.walkPlans.crew = () => leverIn(OPERATOR_ZONES.crew) ?? crowd.ride('coaster')?.spot.lever ?? null;
  staff.walkPlans.boats = () => leverIn(OPERATOR_ZONES.boats) ?? crowd.ride('boats')?.spot.lever ?? null;
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
  staff.walkPlans.mechanic = () => {
    const broken = crowd.rides.find((r) => r.broken);
    if (broken) return broken.spot.lever;
    const worn = crowd.rides.filter((r) => r.wear >= PARK.rides.serviceAt && !r.paused).sort((a, b) => b.wear - a.wear)[0];
    return worn?.spot.lever ?? null;
  };
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
  const rideViews: { ride: Ride; view: RideView; pad: PadModel; sign: { el: HTMLElement; words: HTMLElement; fill: HTMLElement; label: Label; shown: string; worn: number } }[] = [];
  /** Rides built before the night's lights were set up get their colours then; later ones as they're built. */
  let nightReady = false;
  let addRideGlow: (ride: Ride, view: RideView) => void = () => {};
  const addRide = (id: string, kind: string, animate: boolean): void => {
    const ride = crowd.addRide(id, kind);
    if (!ride) return;
    if (animate) crowd.openRide(id);
    const view = new RideView(ride, stage.scene, layout.lake);
    view.onBump = (at) => {
      effects.burst('sparkle', at, 6, 2.5, 0.5);
      sound.play('pop');
    };
    // The flume's logs splash down into the pool; the coaster's riders scream over the top.
    view.onMark = (kind, at) => {
      if (kind === 'splash') {
        effects.burst('water', new Vector3(at.x, 0.7, at.z), 40, 5.5, 1.2);
        effects.burst('bubble', new Vector3(at.x, 0.6, at.z), 10, 2, 1.4);
        floaters.show('💦', new Vector3(at.x, 2.4, at.z), 'star');
        sound.play('splash', hearing(at));
      } else {
        floaters.show(`😱 ${t('coasterDrop')}`, new Vector3(at.x, at.y + 2.2, at.z), 'star');
        sound.play('whoosh', hearing(at));
        effects.burst('sparkle', new Vector3(at.x, at.y + 1, at.z), 10, 3, 1);
      }
    };
    ride.wear = state.supplies[`wear.${id}`] ?? 0;
    ride.broken = (state.supplies[`broken.${id}`] ?? 0) > 0;
    ride.bonusRuns = state.supplies[`serviced.${id}`] ?? 0;
    stage.scene.add(view.group);
    grow(view.group, animate);
    const pad = new PadModel(1.1, 0xffd24a);
    pad.group.position.set(ride.spot.lever.x, 0, ride.spot.lever.z);
    stage.scene.add(pad.group);
    stage.scene.add(withShadows(ropes(ride.spot.ropes)));
    const el = document.createElement('div');
    el.className = 'shelf-stock ride-sign';
    const words = document.createElement('span');
    const gauge = document.createElement('span');
    gauge.className = 'wear-gauge';
    const fill = document.createElement('i');
    gauge.appendChild(fill);
    el.append(words, gauge);
    const label = labels.add(el, overRide(ride, RIDE_LABEL_Y));
    rideViews.push({ ride, view, pad, sign: { el, words, fill, label, shown: '', worn: -1 } });
    solid(id, ride.spot.at);
    solids.push(...view.solids);
    if (nightReady) addRideGlow(ride, view);
    const leverAt = ride.spot.lever;
    const toRide = Math.atan2(ride.spot.at.x - leverAt.x, ride.spot.at.z - leverAt.z);
    const box = { x: leverAt.x + Math.sin(toRide) * 0.65, z: leverAt.z + Math.cos(toRide) * 0.65 };
    solids.push({ minX: box.x - 0.32, maxX: box.x + 0.32, minZ: box.z - 0.3, maxZ: box.z + 0.3 });
    stage.refreshShadows();
  };
  /** Who operates a ride: the ride operator, the dock hand or the coaster crew (by its zone). */
  const operatorOf = (ride: Ride): string =>
    (Object.entries(OPERATOR_ZONES) as [string, readonly string[]][]).find(([, zones]) => zones.includes(ride.def.zone))?.[0] ?? 'operator';
  /** The ride's zone has its operator hired (they launch a full ride). */
  const hasOperator = (ride: Ride): boolean =>
    (Object.entries(OPERATOR_ZONES) as [string, readonly string[]][]).some(([role, zones]) => zones.includes(ride.def.zone) && state.unlocked.includes(role));
  const showRides = (): void => {
    for (const { ride, sign } of rideViews) {
      const { icon } = ride.def;
      const seats = ride.seats.length;
      const text = ride.paused
        ? t('rideStorm', { icon })
        : ride.broken
        ? ride.fixing > 0
          ? t('rideFixing', { percent: Math.round(ride.fixing * 100) })
          : t(state.unlocked.includes('mechanic') ? 'rideBroken' : 'rideBrokenFix')
        : ride.servicing
          ? t('rideServicing', { percent: Math.round(ride.fixing * 100) })
          : ride.phase === 'running'
          ? t('rideRunning', { icon })
          : ride.full
            ? t(hasOperator(ride) ? 'rideFull' : 'rideFullPull', { icon })
            : t('rideLoading', { icon, seated: ride.seated, seats });
      const shown = litter.messAt(ride.spot.at) > 0 ? `${text} 🗑️` : text;
      // The wear gauge: green, amber, then red once it's worth servicing (in steps of 5%, so the page isn't touched every frame).
      const worn = ride.broken ? 20 : Math.min(20, Math.round(ride.wear * 20));
      if (worn !== sign.worn) {
        sign.worn = worn;
        sign.fill.style.width = `${worn * 5}%`;
        sign.fill.className = worn >= PARK.rides.serviceAt * 20 ? 'is-worn' : worn >= 10 ? 'is-used' : '';
      }
      if (shown === sign.shown) continue;
      sign.shown = shown;
      sign.words.textContent = shown;
      sign.el.classList.toggle('is-full', ride.full && ride.phase === 'loading' && !ride.broken);
      sign.el.classList.toggle('is-empty', ride.broken);
      labels.remeasure(sign.label);
    }
  };

  const addBuilt = (id: string, animate: boolean): void => {
    const effects = current.pads.find((p) => p.id === id)?.effects;
    if (effects?.ride) addRide(id, effects.ride, animate);
    else showBuilding(id, animate);
    // Bought standing on its pad, in the middle of where it goes up: the hero steps out of it (a stall's
    // counter and walls would otherwise shut them in, its side doors too narrow to squeeze through).
    const at = layout.buildAt[id] ?? layout.pads[id];
    const boxes = PARK_SOLIDS[id] ?? [];
    if (animate && at && boxes.length > 0) {
      const footprint = {
        minX: Math.min(...boxes.map(([hw, , dx = 0]) => at.x + dx - hw)),
        maxX: Math.max(...boxes.map(([hw, , dx = 0]) => at.x + dx + hw)),
        minZ: Math.min(...boxes.map(([, hd, , dz = 0]) => at.z + dz - hd)),
        maxZ: Math.max(...boxes.map(([, hd, , dz = 0]) => at.z + dz + hd)),
      };
      stepOutOf(player.mesh.position, TUNING.player.radius, footprint, [...solids, ...fixedSolids(layout)], layout.walk);
    }
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
    dressAsStarry(avatar, parkModel('pk_mascot'));
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
  // The prize shelf's count over the gift shop, once it's open.
  const shelfLabel = stockLabel(layout.buildAt.giftshop ?? layout.pads.giftshop ?? { x: 0, z: 0 }, STOCK_LABEL_Y + 0.8);
  const showShelf = (): void => {
    const open = state.unlocked.includes('giftshop');
    showLabel(shelfLabel, open ? t('prizeShelf', { found: shelf(state).length, all: PLUSH.length }) : null);
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
        showEndScreen(root, () => meta.screenClosed(), { title: t('endTitlePark'), body: t('endBodyPark') });
      }
      // The highway to the next town: off the hero goes, once it has popped in. A town this version doesn't have yet
      // ends the chapter instead.
      const next = done?.travel;
      if (next) {
        flag(`ended:${current.id}`);
        if (townIds().includes(next)) setTimeout(() => void travelTo(next), TRAVEL_DELAY_MS);
        else showEndScreen(root, () => meta.screenClosed(), { title: t('endTitleStarlight'), body: t('endBodyStarlight') });
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

  /** How hard each counter is worked this frame: the hero behind it, or a worker (the faster counts), sped up by its upgrade. */
  const work = (counter: WalkUpCounter): { rate: number; byPlayer: boolean } => {
    const byStaff = staff.rateFor(counter);
    const byPlayer = insideRect(player.position, counter.zone) ? 1 : 0;
    const speed = levelFactor(UPGRADES.kinds.speed, level(`${counter.id}.speed`));
    return { rate: Math.max(byStaff, byPlayer) / speed, byPlayer: byPlayer > 0 && byPlayer >= byStaff };
  };
  crowd.served = (counter) => work(counter).rate > 0;
  const lever = (ride: Ride) => {
    const hero = near(player.position, ride.spot.lever, LEVER_REACH);
    return {
      hero,
      // The hero on the lever takes it over: the operator leaves the launching to them.
      staff:
        !hero &&
        ((OPERATOR_ZONES.operator.includes(ride.def.zone) && near(operatorAt(), ride.spot.lever, LEVER_REACH)) ||
          (OPERATOR_ZONES.boats.includes(ride.def.zone) && near(staffAt('boats'), ride.spot.lever, LEVER_REACH)) ||
          (OPERATOR_ZONES.crew.includes(ride.def.zone) && near(staffAt('crew'), ride.spot.lever, LEVER_REACH))),
      mechanic: near(staffAt('mechanic'), ride.spot.lever, LEVER_REACH),
      // Out for a perfect launch on this ride (a rush job): stepping on waits for a full load.
      waitFull: hero && jobs.board.active?.def.pattern === 'signal' && jobs.board.active.from.id === ride.id,
    };
  };

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
  /**
   * A breakdown, every time until there's a mechanic (a broken ride's line all go home cross, and only the hero
   * can fix it); the first empty stall, the first time.
   */
  const helpStep = (): GuideStep | null => {
    const broken = crowd.rides.find((r) => r.broken);
    if (broken && !state.unlocked.includes('mechanic')) return { at: broken.spot.lever, text: 'guideFix' };
    if (!supplies.open || state.unlocked.includes('snackrunner') || state.flags.includes(`stocked:${current.id}`)) return null;
    const list = stalls();
    const stall = supplies.stallFor(list, heroCarry);
    if (stall) return { at: middleOf(stall.zone), text: 'guideSupplies' };
    const empty = list.some((s) => supplies.stock(s.id) === 0);
    return empty && supplies.wanted(list, heroCarry.stack) ? { at: middleOf(layout.shed.door), text: 'guideShed' } : null;
  };
  /** Where the guide's hand points this frame (the play-test bot follows it). */
  let hint: GuideStep | null = null;
  const guide = (): GuideStep | null => {
    const help = helpStep();
    if (help) return help;
    if (state.unlocked.includes(GUIDE_UNTIL)) return null;
    const next = pads.next;
    const build: GuideStep | null = next && state.cash >= next.owed ? { at: next.at, text: 'guideBuild' } : null;
    const booth = crowd.booth;
    const carousel = crowd.rides[0];
    if (booth?.front && !state.flags.includes(soldFlag)) return { at: middleOf(booth.zone), text: 'guideTickets' };
    if (carousel && carousel.phase === 'loading' && carousel.seated > 0 && !state.flags.includes(launchedFlag)) return { at: carousel.spot.lever, text: 'guideLever' };
    const pile = cash.fullestPile();
    if (pile) return { at: pile.at, text: 'guideCash' };
    // A pad that can be bought: buying it takes a moment, so it comes before serving (or in a busy park, the hand
    // would keep the hero at the booth however much cash there was).
    if (build) return build;
    // Someone waiting at a window with nobody behind it.
    const waiting = crowd.counters.find((c) => c.front && staff.rateFor(c) === 0 && !insideRect(player.position, c.zone));
    return waiting ? { at: middleOf(waiting.zone), text: waiting === booth ? 'guideTickets' : 'guideCart' } : null;
  };
  const meta = createMeta({
    root,
    state,
    saves,
    sound,
    traffic: null,
    pads,
    supplies: null,
    setBoost: (m) => (crowd.boost = m),
    town: 'park',
    // The rewarded fix: every broken-down ride runs again at once.
    rides: {
      broken: () => crowd.rides.filter((r) => r.broken).length,
      fixAll: () => {
        for (const ride of crowd.rides) {
          if (!ride.broken) continue;
          ride.broken = false;
          ride.fixing = 0;
          ride.wear = 0;
          const top = overRide(ride, 4.2);
          floaters.show(`✅ ${t('fixedRide')}`, top, 'star');
          effects.burst('sparkle', new Vector3(top.x, 2.6, top.z), 22, 4, 1);
        }
      },
    },
    // The prize shelf's panel, once there's a ring toss to win plush toys at.
    shelf: {
      count: () => (state.unlocked.includes('ringtoss') ? shelf(state).length : -1),
      open: () => showPrizeShelf(root, state),
    },
  });
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
  // Rush jobs: whenever the next purchase is a while off, a short job for the hero (a lost child to take back to
  // the ticket booth, balloons got away, prizes for the ring toss, a ride's safety check, a perfect launch).
  // Never while a school trip is on.
  const jobs = createJobs({
    root,
    scene: stage.scene,
    labels,
    chips,
    state,
    layout,
    town: 'park',
    pads,
    hero: { position: () => player.position, mesh: player.mesh, speed: () => player.topSpeed },
    effects,
    floaters,
    sound,
    makePerson: (who) => {
      if (!peopleReady) return null;
      const n = state.counts.jobs ?? 0;
      const avatar = new PersonAvatar(CHARACTERS.visitors[(who === 'child' ? n : n + 3) % CHARACTERS.visitors.length]!, who === 'child' ? 'balloon' : null);
      if (who === 'child') avatar.root.scale.setScalar(CHILD_SCALE);
      return avatar;
    },
    // A perfect launch: on a ride that's working and busy, with most of a load on it or in line (the hero on its
    // lever holds it for the rest).
    usable: (def, spot) => {
      if (def.pattern !== 'signal') return true;
      const ride = crowd.rides.find((r) => r.id === spot.id);
      return !!ride && !ride.broken && !ride.paused && ride.seats.filter((v) => v).length + ride.line.length >= Math.ceil(ride.seats.length * PERFECT_JOB_LOAD);
    },
    // Not while the hero's the only one at the counter (the tutorial, till the ticket seller's hired): a job then leaves the line to give up.
    allowed: () => peopleReady && state.unlocked.includes(GUIDE_UNTIL),
    blocked: () => trip !== null,
    solids: () => [...solids, ...fixedSolids(layout)],
    walkable: () => view.walkable,
    mentor: current.story.mentor,
    onPaid: (amount, at) => meta.onPaid({ amount, tip: 0, automated: false, at, bonus: true }),
    onDone: () => meta.count('jobs'),
    double: (pay) => meta.doubleJob(pay),
    save: () => void saves.saveNow(),
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
  // School trips: now and then (once there's a bus stop) the school bus brings a class; enough rides in time earns a reward.
  let trip: { left: number; rides: number; goal: number } | null = null;
  let schoolTimer = PARK.school.firstSeconds;
  const schoolBus = new DeliveryTruck(
    stage.scene,
    { truckIn: layout.busStop.busIn, truckOut: layout.busStop.busOut },
    () => {
      const kids = crowd.spawnTrip(layout.busStop.stop, PARK.school.children);
      if (kids.length === 0) return;
      trip = { left: PARK.school.seconds, rides: 0, goal: kids.length * PARK.school.ridesPerChild };
      floaters.show(`🎒 +${kids.length}`, new Vector3(layout.busStop.stop.x, 2.6, layout.busStop.stop.z), 'star');
      toast(root, `🚌 ${t('tripArrived', { goal: trip.goal, minutes: Math.round(PARK.school.seconds / 60) })}`);
      sound.play('vip');
    },
    'pk_schoolbus',
    false,
  );
  // The festival's parade: once round the main paths, Starry leading performers with balloons.
  const parade = new Parade(stage.scene, PARADE_ROUTE, () =>
    Array.from({ length: PARK.festival.performers }, (_, i) => {
      // Visitors' people (loaded once the park opens), the first dressed as Starry.
      const avatar = new PersonAvatar(CHARACTERS.visitors[i % CHARACTERS.visitors.length]!, i === 0 ? null : 'balloon');
      if (i === 0) dressAsStarry(avatar, parkModel('pk_mascot'));
      else avatar.holding = true;
      return avatar;
    }),
  );
  let paradeTimer = PARK.festival.firstParadeSeconds;
  // The dev console can send the school bus, start a festival and its parade (to see them without waiting for a weekend).
  let festivalForced = false;
  if (import.meta.env.DEV) {
    Object.assign(window, {
      parkEvents: {
        schoolTrip: () => schoolBus.send(),
        festival: (on = true) => ((festivalForced = on), (festivalTimer = 0)),
        parade: () => parade.start(),
        fill: (id: string) => {
          const ride = crowd.ride(id);
          if (ride) crowd.seatEveryone(ride);
        },
      },
    });
  }
  let confettiTimer = 0;
  let festivalTimer = 0;
  const built = (effect: 'evenings' | 'bus' | 'fireworks') => state.unlocked.some((id) => current.pads.find((p) => p.id === id)?.effects[effect]);
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
  let clankTimer = 0;
  let vipTimer = PARK.vip.afterSeconds;
  let showing = false;
  let rocketTimer = 0;
  const fireworks = new Fireworks(stage.scene, PARK.fireworks.sparks);
  // After dark: the lamps' light, strings of bulbs, the rides' colours, searchlights by the gate (and the wheel, once built).
  const night = new ParkNight(stage.scene, layout.lamps, [...layout.paths, layout.plaza]);
  for (const x of [layout.gate.minX - 0.6, layout.gate.maxX + 0.6]) night.addSearchlight({ x, z: layout.hedgeZ - 0.8 });
  addRideGlow = (ride: Ride, view: RideView): void => {
    const deck = ride.spot.deck;
    const at = deck ? { x: (deck.minX + deck.maxX) / 2, z: (deck.minZ + deck.maxZ) / 2 } : ride.spot.at;
    const radius = deck ? Math.max(deck.maxX - deck.minX, deck.maxZ - deck.minZ) / 2 + 2.6 : ride.def.plinth + 3;
    const colour = RIDE_GLOW[ride.id] ?? '#ffffff';
    const running = () => ride.phase === 'running';
    night.addRide({ at, radius: Math.max(5, radius), color: colour, running });
    // Chasing marquee lights round its platform's edge (or its station's), in its colour, gold and white.
    night.addMarquee(marqueeRound(ride), [colour, '#ffe066', '#ffffff'], running);
    // The wheel: its rim's bulbs chase round as it turns, and it lights up the sky too, from beside its back feet.
    const rim = view.wheelRim;
    if (rim) {
      const lights = Array.from({ length: 48 }, (_, k) => new Vector3(rim.radius * Math.cos((k / 48) * 2 * Math.PI), rim.radius * Math.sin((k / 48) * 2 * Math.PI), rim.front));
      night.addMarquee(lights, ['#ffe066', '#c07bff', '#5bdcff', '#ff5fa8'], running, rim.node);
      for (const dx of [-4.4, 4.4]) night.addSearchlight({ x: ride.spot.at.x + dx, z: ride.spot.at.z - 1.9 });
    }
  };
  for (const built of rideViews) addRideGlow(built.ride, built.view);
  nightReady = true;
  fireworks.onBurst = (at) => {
    const level = hearing(at, BANG_NEAR, BANG_FADE);
    sound.play('firework', level);
    if (Math.random() < OOH_CHANCE) sound.play('ooh', level);
  };
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
      ride.waitScale = levelFactor(UPGRADES.kinds.launch, level(`${operatorOf(ride)}.launch`));
      ride.setSeats(ride.def.seats + level(`${ride.id}.seats`));
    }
    const serving = crowd.update(dt, work, lever);
    // Fixing a broken-down ride at its lever: the hero gets busy with his hands, and sparks fly.
    const fixing = crowd.rides.find((r) => (r.broken || r.servicing) && near(player.position, r.spot.lever, LEVER_REACH));
    player.scrubbing = serving || !!fixing || jobs.working;
    sparkTimer -= dt;
    if (sparkTimer <= 0) {
      sparkTimer = SMOKE_SECONDS;
      for (const ride of crowd.rides) {
        if (ride.servicing) effects.burst('sparkle', new Vector3(ride.spot.lever.x, 1.0, ride.spot.lever.z), 5, 3, 0.4);
        if (!ride.broken) continue;
        effects.burst('smoke', new Vector3(ride.spot.at.x, 2.6, ride.spot.at.z), 2, 1.2, 0.4);
        const fixer = near(player.position, ride.spot.lever, LEVER_REACH) || near(staffAt('mechanic'), ride.spot.lever, LEVER_REACH);
        if (fixer) effects.burst('sparkle', new Vector3(ride.spot.lever.x, 1.0, ride.spot.lever.z), 6, 3, 0.4);
      }
    }
    // The mechanic at work on a broken ride, wrench in hand.
    const mechanicAt = staffAt('mechanic');
    const repairing = crowd.rides.find((r) => (r.broken || r.servicing) && near(mechanicAt, r.spot.lever, LEVER_REACH));
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
      meta.count('litter');
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
    clankTimer -= dt;
    let musicBox = 0;
    for (const { ride, view: rideView, pad } of rideViews) {
      rideView.update(dt);
      // The lift chain clanks under a train (or a log) being hauled up; the carousel plays its music box as it turns.
      if (rideView.lifting && clankTimer <= 0) sound.play('clank', hearing(rideView.lifting));
      if (ride.id === 'carousel' && ride.phase === 'running') musicBox = hearing(ride.spot.at, 4, 18);
      pad.update(dt, near(player.position, ride.spot.lever, LEVER_REACH));
      state.supplies[`wear.${ride.id}`] = ride.wear;
      state.supplies[`broken.${ride.id}`] = ride.broken ? 1 : 0;
      state.supplies[`serviced.${ride.id}`] = ride.bonusRuns;
    }
    if (clankTimer <= 0) clankTimer = CLANK_SECONDS;
    sound.loop('musicbox', musicBox);
    // Evenings, and the storm.
    if (built('evenings')) dayTime += dt;
    if (state.unlocked.includes('haunted') && !state.flags.includes(stormFlag)) {
      flag(stormFlag);
      stormLeft = PARK.storm.seconds;
    }
    stormLeft = Math.max(0, stormLeft - dt);
    crowd.storm = stormLeft > 0;
    stormMix += ((crowd.storm ? 1 : 0) - stormMix) * Math.min(1, dt * 0.6);
    evening = built('evenings') ? eveningAt(dayTime, PARK.evening) : 0;
    night.update(dt, evening);
    lightSigns(evening * 0.9);
    nightGlow.value = Math.max(evening, stormMix * 0.6);
    stage.setLook(mixLook(mixLook(PARK_LOOK, PARK_EVENING, evening), PARK_STORM, stormMix));
    sound.loop('rain', stormMix);
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
    // The Visitor of the Day: once a day, once the park has enough to show them.
    vipTimer -= dt;
    if (vipTimer <= 0) {
      vipTimer = 5;
      const today = Number(localDate(new Date()).replaceAll('-', ''));
      const attractions = crowd.rides.length + crowd.counters.length - 1;
      const vip = (state.supplies['vip.day'] ?? 0) !== today && attractions >= PARK.vip.attractions && peopleReady ? crowd.spawnVip() : null;
      if (vip) {
        showWishes(vip);
        state.supplies['vip.day'] = today;
        toast(root, `⭐ ${t('vipArrived')}`);
        sound.play('vip');
      }
    }
    updateBubbles(dt);
    // Spotless: no litter on the ground for a while, with a crowd in (once there's a snack to drop a wrapper from).
    const clean = litter.pieces.length === 0 && crowd.visitors.length >= PARK.spotless.minVisitors && state.unlocked.includes('cart');
    spotlessFor = clean ? spotlessFor + dt : 0;
    const nowSpotless = spotlessFor >= PARK.spotless.seconds;
    if (nowSpotless && !spotless) {
      floaters.show(`✨ ${t('spotless')}`, new Vector3(player.position.x, 2.6, player.position.z), 'star');
      effects.burst('sparkle', new Vector3(player.position.x, 1.6, player.position.z), 16, 3, 1);
      sound.play('sparkle');
      count('spotless');
    }
    spotless = nowSpotless;
    const opening = crowd.rides.find((r) => crowd.openingLeft(r.id) > 0);
    chips.set('opening', opening ? `🎉 ${t('openingChip', { name: opening.def.name, time: formatClock(crowd.openingLeft(opening.id)) })}` : null, 'party');
    chips.set('spotless', spotless ? `✨ ${t('spotlessChip', { percent: Math.round(PARK.spotless.bonus * 100) })}` : null, 'good');
    // The fireworks show over the lake, every evening once there's a barge.
    const show = fireworksBuilt() && evening > 0.6;
    if (show && !showing) count('shows');
    showing = show;
    if (show) {
      rocketTimer -= dt;
      if (rocketTimer <= 0) {
        const [low, high] = PARK.fireworks.rocketSeconds as [number, number];
        rocketTimer = (low + Math.random() * (high - low)) / (festival ? 2 : 1);
        const from = layout.buildAt.fireworks ?? layout.lake;
        fireworks.launch(new Vector3(from.x + (Math.random() - 0.5) * 2.4, 1.2, from.z + (Math.random() - 0.5) * 1.6), 9 + Math.random() * 5);
      }
    }
    fireworks.update(dt);
    // The barge bobs on the water.
    if (barge) {
      barge.position.y = 0.05 * Math.sin(dayTime * 1.4 + state.playSeconds * 0.9);
      barge.rotation.z = 0.025 * Math.sin(state.playSeconds * 1.1);
      barge.rotation.x = 0.02 * Math.sin(state.playSeconds * 0.8);
    }
    // The tour bus (not while the school bus is at the stop).
    if (built('bus')) {
      busTimer -= dt;
      if (busTimer <= 0 && !schoolBus.busy) {
        busTimer = PARK.bus.seconds;
        bus.send();
      }
      schoolTimer -= dt;
      if (schoolTimer <= 0 && !trip && !bus.busy && peopleReady) {
        schoolTimer = PARK.school.everySeconds;
        schoolBus.send();
      }
    }
    bus.update(dt);
    schoolBus.update(dt);
    // The school trip's countdown: the class's rides, against the clock.
    if (trip) {
      trip.left -= dt;
      if (trip.rides >= trip.goal) {
        const reward = Math.max(PARK.school.minCash, Math.round(state.autoRate * PARK.school.minutesOfIncome));
        cash.add('booth', reward);
        state.gems += PARK.school.gems;
        floaters.show(`🎒 ${t('tripDone')} +$${reward.toLocaleString('en-US')} +${PARK.school.gems}💎`, new Vector3(player.position.x, 3, player.position.z), 'tip');
        effects.burst('confetti', new Vector3(player.position.x, 2.2, player.position.z), 40, 5, 1);
        sound.play('reward');
        count('trips');
        onPaid({ amount: reward, tip: 0, automated: false, at: player.position });
        trip = null;
      } else if (trip.left <= 0) {
        toast(root, `🚌 ${t('tripOver', { rides: trip.rides, goal: trip.goal })}`);
        trip = null;
      }
    }
    chips.set('trip', trip ? `🚌 ${t('tripChip', { rides: trip.rides, goal: trip.goal, time: formatClock(trip.left) })}` : null, 'trip');
    // A festival weekend: Saturdays and Sundays, once the park has its lights.
    festivalTimer -= dt;
    if (festivalTimer <= 0) {
      festivalTimer = 20;
      const day = new Date().getDay();
      const now = ((day === 0 || day === 6) && built('evenings')) || festivalForced;
      if (now && !festival) {
        toast(root, `🎉 ${t('festivalOn')}`);
        sound.play('mission');
      }
      festival = now;
    }
    chips.set('festival', festival ? `🎉 ${t('festivalChip')}` : null, 'party');
    if (festival) {
      paradeTimer -= dt;
      if (paradeTimer <= 0 && !parade.active && peopleReady) {
        paradeTimer = PARK.festival.paradeSeconds;
        parade.start();
      }
    }
    parade.update(dt);
    const lead = parade.lead;
    if (lead) {
      confettiTimer -= dt;
      if (confettiTimer <= 0) {
        confettiTimer = 1.2;
        effects.burst('confetti', new Vector3(lead.x, 2.6, lead.z), 10, 3, 0.6);
        if (hearing(lead) > 0.5) sound.play('cheer', hearing(lead) * 0.6);
      }
    }
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
    sites.update(state, Date.now());
    showShelf();
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
    jobs.update(dt, stage.camera, stage.size.width, stage.size.height, { top: view.topInset, right: SIDE_BAR_PX });
    view.update(dt, leverFocus() ?? player.position);
    blobShadows.update();
    carriedItems.update();
    stage.render();
    labels.update(stage.camera, stage.size.width, stage.size.height);
    const step = guide();
    hint = step;
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
    jobs,
    bot: {
      get hint() {
        return hint;
      },
      pads,
      upgrades,
      cash,
      crowd,
      gaveUp,
    },
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
      fireworks.dispose();
      night.dispose();
      lightSigns(0);
      parade.dispose();
      sound.stopLoops();
      sound.useMusic(null);
      for (const cleanup of cleanups) cleanup();
      input.dispose();
      panel.dispose();
      jobs.dispose();
      // The scene first, while the blob shadows are still in it, so the renderer lets go of everything.
      stage.reset();
      blobShadows.detach();
      carriedItems.detach();
      tickers.length = 0;
      root.remove();
    },
  };
}
