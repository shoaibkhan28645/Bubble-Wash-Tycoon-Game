// An airport (Chapter 4, Skyport International): planes land, are turned round at their gates and leave
// full, on time. Passengers come by taxi and buy their tickets at the check-in desk (the hero sells them,
// later the check-in agent), wait by their gate and board when it's opened. A plane parks with a clock
// over it: open its gate, fill its tanks and load its cases (once those are bought), then step onto the
// ramp pad in front of its nose to clear it for take-off (as the ring closes, for a perfect one). Every
// seat pays its fare, more for a full plane and for one that beats its clock, and each on-time flight in
// a row pays a little more than the last.
// The shared pieces (the player, pads, cash piles, upgrades, the camera, the side bar, the hero's career
// and the town's story) are the same as in the other towns.
import { Object3D, Vector3 } from 'three';
import { Loop } from './loop';
import { GameClock } from './clock';
import { CHARACTERS, TUNING, UPGRADES, type GateSpot, type Point, type Rect } from './config';
import type { Game } from './game';
import type { GameState } from './gameState';
import type { Lifecycle } from './lifecycle';
import type { SaveManager } from './save';
import type { AirportTown } from './towns';
import { createMeta } from './meta';
import { createTown } from './town';
import { createPress } from './press';
import { createHero } from './hero';
import { createJobs } from './jobs';
import { createStoryline } from './storyline';
import { LotView, SIDE_BAR_PX } from './view';
import * as platform from '../platform/youtube';
import type { SoundManager } from '../audio/sound';
import type { Look, Stage } from '../render/stage';
import { withShadows } from '../render/stage';
import { CameraRig } from '../render/cameraRig';
import { Particles } from '../render/effects/particles';
import { Ambience, airfield as airfieldGround, wingFloor } from '../render/airfield';
import { AirportNight } from '../render/airportNight';
import { nightGlow } from '../render/models/build';
import { loadPeople } from '../render/assets';
import { blobShadows } from '../render/models/actors';
import {
  BaggageBelt,
  Cafe,
  JET,
  CateringTruck,
  DutyFree,
  FuelTruck,
  GATE_COLOURS,
  JetBridge,
  Kitchen,
  PLANES,
  SecurityLane,
  wingModel,
  wingWalls,
  Hall,
  LIVERIES,
  NameSign,
  PROP,
  PlaneModel,
  STAIRS,
  TimingRing,
  Windsock,
  airStairs,
  checkinDesk,
  entranceSign,
  footprint,
  skyModel,
  fuelHose,
  gateBarrier,
  hallWalls,
  loungeSeats,
  podium,
  loungeSeatSolids,
  seatAt,
  standKit,
  taxiCar,
  type PlanePose,
} from '../render/models/airport';
import { SkyportScenery } from '../render/skyportScenery';
import type { CarModel } from '../render/models/actors';
import { PadModel } from '../render/models/padModel';
import { PersonAvatar } from '../render/models/person';
import { TownDecor } from '../render/townDecor';
import { Airfield, flightPay, planeAt, podiumFront, ringAt, type Flight } from '../systems/airport';
import { unlockedSum } from '../systems/arrivals';
import { perk } from '../systems/career';
import { CashSystem } from '../systems/cash';
import { Carrier, carriedItems, type CaseItem, type CarryItem } from '../systems/carry';
import { levelFactor, levelStep, money, nextStars, tipFor } from '../systems/economy';
import { GuideHand, type GuideStep } from '../systems/guide';
import { Input } from '../systems/input';
import { IncomeTracker } from '../systems/offline';
import { PadSystem } from '../systems/pads';
import { Passengers, type Passenger, type ShopId } from '../systems/passengers';
import { Player, pushOut } from '../systems/player';
import { NavGrid } from '../systems/nav';
import { insideRect } from '../systems/stations';
import type { Paid } from '../systems/till';
import { UpgradePads } from '../systems/upgrades';
import { Floaters } from '../ui/carBubbles';
import { EdgePointer } from '../ui/edgePointer';
import { EventChips } from '../ui/eventChips';
import { showEndScreen } from '../ui/endScreen';
import { openEmpireMap } from '../ui/empireMap';
import { Hud } from '../ui/hud';
import { rich } from '../ui/icons';
import { t } from '../ui/strings';
import { UpgradePanel } from '../ui/upgradePanel';
import { WorldLabels, type Label } from '../ui/worldLabels';

const AIRPORT = TUNING.airport;
/** A new building grows into place over this long. */
const REVEAL_SECONDS = 0.6;
/** Upgrade pads appear once the fuel truck is built (one thing at a time). */
const UPGRADES_AFTER = 'fuel';
/** The newcomer's pointing hand helps until there's a check-in agent. */
const GUIDE_UNTIL = 'agent';
/** Standing this close to a spot is standing on it. */
const SPOT_REACH = 1.0;
/** Stood on a ramp pad since before its plane was ready, the hero clears it after this long (no ring, no tip). */
const STAND_CLEAR_SECONDS = 0.8;
/** Standing still with a plane landing or taking off, the camera eases back this much further to show it (wide screens need more). */
const SHOW_ZOOM = { tall: 1.3, wide: 1.75 };
const SHOW_AFTER_SECONDS = 0.6;
/** Sounds are full within this far of the hero (metres) and die away over the next stretch. */
const HEAR_NEAR = 16;
const HEAR_FADE = 60;
/** Where the baggage tug's parked, out of everyone's way at the east end of the service road. */
const TUG_AT = { x: -1.55, z: 8.6 };
/** What the ramp dispatcher's doing. */
type DispatchJob = 'idle' | 'toGate' | 'toPad' | 'home';
/** The ramp dispatcher waits this long before stepping in (seconds): the hero's chance to do it. */
const DISPATCH_WAIT = 1.6;
/** The service road the dispatcher walks along, between the stands and the hall (z). */
const DISPATCH_ROAD_Z = 9.0;
/** Where taxis come from and go to along the road (x, off the screen either side). */
const TAXI_FROM = 46;
const TAXI_TO = -62;
/** The crew's walking speed (m/s), and how much slower than the hero the agent checks in. */
const CREW_SPEED = 3.3;
const AGENT_RATE = 0.85;

/** A bright day's flying: blue sky, white light, long views. */
const SKY_LOOK: Look = {
  sky: 0xbfe6ff,
  fogNear: 110,
  fogFar: 260,
  skyLight: 0xf7fbff,
  groundLight: 0xa4cf8c,
  ambient: 1.35,
  sun: 0xfff1d6,
  sunStrength: 2.75,
};

/** Night over the airfield (Part B, once the runway lights are in): a deep blue, the lamps doing the work. */
const NIGHT_LOOK: Look = {
  sky: 0x0d1d3a,
  fogNear: 70,
  fogFar: 210,
  skyLight: 0x4d6aa8,
  groundLight: 0x1a2c3c,
  ambient: 0.62,
  sun: 0x9fb4ff,
  sunStrength: 0.55,
};
function mixLook(a: Look, b: Look, t: number): Look {
  const mix = (x: number, y: number) => x + (y - x) * t;
  const colour = (x: number, y: number) => {
    const ch = (v: number, s: number) => (v >> s) & 255;
    return (Math.round(mix(ch(x, 16), ch(y, 16))) << 16) | (Math.round(mix(ch(x, 8), ch(y, 8))) << 8) | Math.round(mix(ch(x, 0), ch(y, 0)));
  };
  return {
    sky: colour(a.sky, b.sky),
    fogNear: mix(a.fogNear, b.fogNear),
    fogFar: mix(a.fogFar, b.fogFar),
    skyLight: colour(a.skyLight, b.skyLight),
    groundLight: colour(a.groundLight, b.groundLight),
    ambient: mix(a.ambient, b.ambient),
    sun: colour(a.sun, b.sun),
    sunStrength: mix(a.sunStrength, b.sunStrength),
  };
}
/** 0 by day, 1 at night: `day` seconds of day, then the night, fading in and out over `fade` (the park's evenings, system/park.ts). */
function nightAt(seconds: number, rules: { day: number; evening: number; fade: number }): number {
  const t = seconds % (rules.day + rules.evening);
  if (t < rules.day - rules.fade) return 0;
  if (t < rules.day) return (t - (rules.day - rules.fade)) / rules.fade;
  const into = t - rules.day;
  return into > rules.evening - rules.fade ? Math.max(0, (rules.evening - into) / rules.fade) : 1;
}

const near = (a: Point, b: Point, reach = SPOT_REACH): boolean => Math.abs(a.x - b.x) < reach && Math.abs(a.z - b.z) < reach;
const around = (at: Point, hw: number, hd = hw): Rect => ({ minX: at.x - hw, maxX: at.x + hw, minZ: at.z - hd, maxZ: at.z + hd });

/** A taxi on the road in front: it pulls up, sets its passengers down one by one, and drives off. */
interface Taxi {
  car: CarModel;
  state: 'away' | 'in' | 'stop' | 'out';
  x: number;
  kerb: Point;
  riders: number;
  timer: number;
}

/** One of the crew, walking between jobs. */
class CrewMember {
  x: number;
  z: number;
  path: Point[] = [];
  constructor(
    readonly avatar: PersonAvatar,
    at: Point,
  ) {
    this.x = at.x;
    this.z = at.z;
    avatar.root.position.set(at.x, 0, at.z);
  }
  /** Walks on; true once there's nowhere left to go. */
  walk(dt: number, speed: number): boolean {
    let left = speed * dt;
    while (left > 0 && this.path.length > 0) {
      const next = this.path[0]!;
      const dx = next.x - this.x;
      const dz = next.z - this.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.01) this.avatar.root.rotation.y = Math.atan2(dx, dz);
      if (d <= left) {
        this.x = next.x;
        this.z = next.z;
        left -= d;
        this.path.shift();
      } else {
        this.x += (dx / d) * left;
        this.z += (dz / d) * left;
        left = 0;
      }
    }
    this.avatar.root.position.set(this.x, 0, this.z);
    return this.path.length === 0;
  }
}

/** What's drawn for a flight: its plane, and the label over it (its clock, and how its turnaround's going). */
interface FlightView {
  model: PlaneModel;
  /** Where it was and which way it faced last frame (to roll its wheels and steer its nose wheel). */
  last: { x: number; z: number; heading: number } | null;
  label: Label;
  at: Vector3;
  shown: string;
  lateSaid: boolean;
}

/** What stands at a gate once it's built. */
interface GateView {
  key: string;
  spot: GateSpot;
  pad: PadModel;
  ring: TimingRing;
  fuelPad: PadModel;
  holdPad: PadModel;
  doorLabel: Label;
  truck: FuelTruck | null;
  hose: Object3D | null;
  /** Chocks at its wheels and cones off its wingtips while a plane's parked. */
  kit: Object3D;
  /** A jet's gate: the bridge it boards over, the catering truck at its galley door, the pad where meals go aboard. */
  bridge: JetBridge | null;
  catering: CateringTruck | null;
  galleyPad: PadModel | null;
  /** The hero was on the ramp pad last frame, and for how long while the plane's been ready. */
  onPad: boolean;
  stood: number;
}

export function createSkyportGame(
  container: HTMLElement,
  stage: Stage,
  state: GameState,
  lifecycle: Lifecycle,
  saves: SaveManager,
  sound: SoundManager,
  travelTo: (id: string) => Promise<void>,
  current: AirportTown,
): Game {
  const { layout } = current;
  // Everything this town puts on the page goes in here, so leaving the town removes it all at once.
  const root = document.createElement('div');
  root.className = 'game-root';
  container.prepend(root);
  const cleanups: (() => void)[] = [];
  stage.setLook(SKY_LOOK);
  stage.shadowArea(layout.lot);
  const clock = new GameClock();
  const tickers: ((dt: number) => void)[] = [];
  const rig = new CameraRig(stage.camera);
  rig.setZoom(AIRPORT.zoom, true);
  const labels = new WorldLabels(root);
  const hud = new Hud(root, state.cash);
  const input = new Input(root, lifecycle);
  const effects = new Particles(stage.scene);
  const decor = new TownDecor(stage.scene, effects);
  blobShadows.attach(stage.scene);
  carriedItems.attach(stage.scene);
  // The whoosh of a plane going over and the crowd's cheer are among the park's sounds.
  void sound.loadSet('park');

  // The ground, the hall, and what's always there.
  stage.scene.add(airfieldGround(layout));
  const ambience = new Ambience(stage.scene, layout);
  ambience.onOverhead = () => sound.play('whoosh', 0.22);
  const hall = new Hall(layout);
  stage.scene.add(hall.root);
  const nameSign = new NameSign();
  const nameAt = entranceSign(layout);
  nameSign.root.position.set(nameAt.x, 0, nameAt.z);
  stage.scene.add(nameSign.root);
  const scenery = new SkyportScenery(layout);
  const windsockAt = { x: layout.apron.minX + 2.5, z: layout.taxiway.z + layout.taxiway.half + 2.6 };
  stage.scene.add(scenery.group);
  const desk = checkinDesk();
  desk.position.set(layout.desk.at.x, 0, layout.desk.at.z);
  stage.scene.add(withShadows(desk));
  const windsock = new Windsock();
  windsock.root.position.set(windsockAt.x, 0, windsockAt.z);
  stage.scene.add(windsock.root);

  const level = (key: string) => state.levels[key] ?? 0;
  const built = (id: string) => state.unlocked.includes(id);
  const player = new Player(stage.scene, layout.playerStart, TUNING.player, () => 1 + perk(state, 'walk'));
  player.onFootstep(() => sound.play('step'));
  /** How loud a sound at `at` is to the hero (1 close by, 0 far off). */
  const hearing = (at: Point): number => Math.max(0, Math.min(1, 1 - (Math.hypot(at.x - player.position.x, at.z - player.position.z) - HEAR_NEAR) / HEAR_FADE));
  const cash = new CashSystem(stage.scene, layout, { ...TUNING.cash, pileCap: AIRPORT.pileCap }, state, effects, sound);
  const floaters = new Floaters(labels);
  const chips = new EventChips(root);
  const heroCarry = new Carrier<CarryItem>(player.mesh, () => player.position, () => TUNING.supplies.carryBase + levelStep(UPGRADES.kinds.carry, level('player.carry')));
  /** A gate's colour of case (Gate 1 pink, 2 blue, 3 green, in order). */
  const caseFor = (gate: string): CaseItem => (['case1', 'case2', 'case3'] as const)[Math.max(0, Object.keys(layout.gates).indexOf(gate)) % 3]!;
  /** Whether a case goes into `gate`'s hold: its own colour, or the golden one (any hold takes it). */
  const caseFits = (item: CarryItem, gate: string): boolean => item === caseFor(gate) || item === 'caseGold';
  const isCase = (item: CarryItem): item is CaseItem => item === 'case1' || item === 'case2' || item === 'case3' || item === 'caseGold';
  const income = new IncomeTracker(TUNING.offline.incomeWindowSeconds, state.autoRate);
  const flag = (name: string): void => {
    if (state.flags.includes(name)) return;
    state.flags.push(name);
    void saves.saveNow();
  };
  const servedFlag = `served:${current.id}`;
  const gateFlag = `gate:${current.id}`;
  const clearedFlag = `cleared:${current.id}`;
  const onTimeFlag = `ontime:${current.id}`;
  const count = (key: string, n = 1) => (state.counts[key] = (state.counts[key] ?? 0) + n);
  const streakKey = `streak:${current.id}`;
  /** How fast everyone works (the rewarded boost). */
  let boost = 1;

  // What's solid: the hall's walls, the desk, the trees; then whatever's built.
  const { desk: deskSpot } = layout;
  const hallEast: Rect = { minX: layout.hall.maxX - 0.25, maxX: layout.hall.maxX + 0.25, minZ: layout.hall.minZ, maxZ: layout.hall.maxZ };
  const solids: Rect[] = [
    ...hallWalls(layout, true),
    ...(built('gate3') ? [] : [hallEast]),
    ...scenery.solids,
    // The desk's counter, its scale and bag belt off to the side, its sign's posts.
    { minX: deskSpot.at.x - 1.58, maxX: deskSpot.at.x + 1.58, minZ: deskSpot.at.z - 0.48, maxZ: deskSpot.at.z + 0.48 },
    { minX: deskSpot.at.x + 1.6, maxX: deskSpot.at.x + 2.6, minZ: deskSpot.at.z - 2.5, maxZ: deskSpot.at.z + 0.48 },
    around({ x: deskSpot.at.x - 1.95, z: deskSpot.at.z - 0.55 }, 0.1),
    // The belt barriers either side of the line.
    ...[-0.72, 0.72].map((dx) => ({ minX: deskSpot.at.x + dx - 0.06, maxX: deskSpot.at.x + dx + 0.06, minZ: deskSpot.at.z + 1.3, maxZ: deskSpot.at.z + 5.25 })),
    ...layout.trees.map((tree) => around(tree, 0.45 * (tree.size ?? 1))),
    around(entranceSign(layout), 3.85, 0.55),
    around(windsockAt, 0.5),
  ];
  // The hedge either side of the hall's door (render/airfield.ts).
  for (let x = layout.hall.minX + 1.2; x <= layout.hall.maxX - 1; x += 1.5) {
    if (Math.abs(x - layout.entrance.x) >= 6) solids.push(around({ x, z: layout.hall.maxZ + 0.95 }, 0.7));
  }
  // The baggage tug, parked out of the way at the east end of the service road.
  const tug = skyModel('sp_tug');
  tug.position.set(TUG_AT.x, 0, TUG_AT.z);
  tug.rotation.y = Math.PI / 2;
  stage.scene.add(tug);
  solids.push(footprint('sp_tug', TUG_AT.x, TUG_AT.z, Math.PI / 2, 0.05));

  // The way round all that for passengers and the crew: a walking grid, made again whenever something's
  // built (or a barrier goes), with every stand taken as if a plane were parked on it.
  /** What's solid of a plane standing with its middle at (x, mid), nose to +z: its fuselage, its wheels (and a jet's engines). */
  const planeSolids = (kind: 'prop' | 'jet', x: number, mid: number): Rect[] => {
    const solid = PLANES[kind].solid;
    const body = { minX: x - solid.half, maxX: x + solid.half, minZ: mid + solid.tail, maxZ: mid + solid.nose };
    if (kind === 'jet') {
      const jet = PLANES.jet.solid;
      return [
        body,
        ...[-1, 1].flatMap((side) => [
          { minX: x + side * jet.engineX - jet.engineHalf, maxX: x + side * jet.engineX + jet.engineHalf, minZ: mid + jet.engineBack, maxZ: mid + jet.engineFront },
          around({ x: x + side * 1.75, z: mid - 0.55 }, 0.42, 0.55),
        ]),
      ];
    }
    return [
      body,
      ...[-1, 1].flatMap((side) => [
        around({ x: x + side * 2.4, z: mid + 0.5 }, 0.35, 0.45),
        around({ x: x + side * 2.4, z: mid + 2.2 }, 1.0, 0.18),
      ]),
    ];
  };
  const standSolids = (spot: GateSpot): Rect[] => planeSolids(planeAt(spot), spot.x, spot.noseZ - PLANES[planeAt(spot)].size.length / 2);
  const NAV_AREA: Rect = { ...layout.walk, maxZ: layout.roadZ - 2 };
  let nav: NavGrid | null = null;
  const solidsChanged = (): void => void (nav = null);
  const route = (from: Point, to: Point): Point[] => {
    nav ??= new NavGrid(NAV_AREA, [...solids, ...Object.values(layout.gates).flatMap(standSolids)], 0.3);
    return nav.findPath(from, to);
  };
  /** Sends one of the crew off along the way round to `to`. */
  const go = (member: CrewMember, to: Point): void => {
    member.path = route({ x: member.x, z: member.z }, to);
  };
  const growing: { mesh: Object3D; age: number }[] = [];
  const show = (mesh: Object3D, animate: boolean, cast = true): Object3D => {
    stage.scene.add(cast ? withShadows(mesh) : mesh);
    if (animate) {
      mesh.scale.setScalar(0.001);
      growing.push({ mesh, age: 0 });
    }
    return mesh;
  };

  // Flights, and the planes drawn for them.
  const views = new Map<Flight, FlightView>();
  const airfield = new Airfield(layout, AIRPORT, LIVERIES.length, {
    onTouchdown: (flight) => {
      // A puff of smoke off each main wheel.
      for (const side of [-1.9, 1.9]) effects.puff(new Vector3(flight.x - 0.5, 0.3, flight.z + side), new Vector3(-1, 0, 0), 5);
      sound.play('whoosh', hearing(flight) * 0.7);
      sound.play('screech', hearing(flight));
    },
    onParked: (flight) => {
      flight.needsFuel = built('fuel');
      // (A jet has twice the passengers, and their cases.)
      flight.needsCases = built('bags') ? AIRPORT.bags.cases * (flight.kind === 'jet' ? 2 : 1) : 0;
      flight.needsMeals = flight.kind === 'jet' && built('kitchen') ? AIRPORT.meals.trays : 0;
      for (let i = 0; i < flight.needsCases; i++) beltCases.push(Math.random() < AIRPORT.caseGold ? 'caseGold' : caseFor(flight.gate));
      // More to do: longer to do it in.
      const extra = (flight.needsFuel ? AIRPORT.fuel.clockSeconds : 0) + (flight.needsCases > 0 ? AIRPORT.bags.clockSeconds : 0) + (flight.needsMeals > 0 ? AIRPORT.meals.clockSeconds : 0);
      flight.clock += extra;
      flight.clockMax += extra;
      if (flight.marshalled) {
        flight.clock += AIRPORT.marshal.clockSeconds;
        flight.clockMax += AIRPORT.marshal.clockSeconds;
        floaters.show(`👍 ${t('niceParking')}`, new Vector3(flight.spot.marshal.x, 2.4, flight.spot.marshal.z), 'star');
        effects.burst('sparkle', new Vector3(flight.spot.marshal.x, 1.2, flight.spot.marshal.z), 12, 3, 0.8);
        sound.play('sparkle');
      }
    },
    onPushback: (flight) => {
      sound.play('honk', hearing(flight) * 0.6);
      sound.play('spool', hearing(flight));
    },
    onAirborne: (flight) => sound.play('whoosh', Math.max(0.35, hearing(flight))),
    onGone: (flight) => {
      const view = views.get(flight);
      if (!view) return;
      view.model.dispose();
      labels.remove(view.label);
      views.delete(flight);
    },
  });
  /** Cases on the belt's cart, waiting to be carried out, in the order they came off (each in its gate's colour). */
  const beltCases: CaseItem[] = [];

  // People: drawn once their models load (they're not in the first download). Avatars are used again and again.
  let peopleReady = false;
  const avatars: PersonAvatar[] = [];
  let made = 0;
  const makeAvatar = (): PersonAvatar | null => {
    if (!peopleReady) return null;
    const spare = avatars.find((a) => !a.root.visible);
    if (spare) {
      spare.root.visible = true;
      spare.seated = false;
      return spare;
    }
    const avatar = new PersonAvatar(CHARACTERS.visitors[made++ % CHARACTERS.visitors.length]!, 'case');
    avatar.holding = made % 3 !== 0;
    stage.scene.add(avatar.root);
    avatars.push(avatar);
    return avatar;
  };
  const gateKeys = (): string[] => Object.keys(layout.gates).filter((key) => built(key));
  const arrivals = { rateFactor: 1, rush: null as { dirt: never; payMultiplier: number } | null };
  const payBonus = () => 1 + unlockedSum(state, (e) => e.payBonus);

  const onPaid = (paid: Paid): void => {
    // The town's steady crew takings: what it earns while the hero is elsewhere.
    if (paid.automated && !paid.bonus) income.add(clock.now, paid.amount);
    meta.onPaid(paid);
    town.onPaid(paid);
  };
  const passengers = new Passengers(layout, AIRPORT, airfield, gateKeys, makeAvatar, {
    onCheckedIn: (p: Passenger) => {
      const pay = Math.round(AIRPORT.passengers.ticket * levelFactor(UPGRADES.kinds.price, level('checkin.price')));
      const tip = tipFor(pay, p.patience / p.patienceMax, TUNING.customers);
      cash.add('checkin', pay + tip);
      const at = layout.piles.checkin ?? layout.desk.at;
      floaters.show(`+${money(pay)}`, new Vector3(at.x, 1.2, at.z), 'cash');
      if (tip > 0) floaters.show(`+${money(tip)} tip`, new Vector3(at.x + 0.6, 1.9, at.z), 'tip');
      state.stars = nextStars(state.stars, tip > 0 ? 'happy' : 'okay', TUNING.stars);
      if (p.manual) flag(servedFlag);
      sound.play('ching');
      onPaid({ amount: pay + tip, tip, automated: !p.manual, at });
    },
    onServed: (p, id, manual) => {
      if (id === 'security') {
        security?.passed();
        sound.play('scan', hearing(layout.security.arch));
        return;
      }
      let price = AIRPORT.shops[id].price * levelFactor(UPGRADES.kinds.price, level(`${id}.price`)) * payBonus();
      let icon = id === 'cafe' ? '☕' : '🛍️';
      if (id === 'cafe' && cafeTrays && cafeTrays.stack.length > 0) {
        cafeTrays.remove('tray');
        price *= AIRPORT.shops.cafe.meal;
        icon = '🥪';
      }
      const pay = Math.round(price);
      cash.add(id, pay);
      const at = layout.piles[id] ?? layout[id].at;
      floaters.show(`${icon} +${money(pay)}`, new Vector3(at.x, 1.4, at.z), 'cash');
      if (id === 'cafe' && cafe) effects.puff(cafe.steam.getWorldPosition(new Vector3()), new Vector3(0, 1, 0), 3);
      state.stars = nextStars(state.stars, 'happy', TUNING.stars);
      count(id === 'cafe' ? 'coffees' : 'dutyfree');
      if (id === 'cafe') meta.count('coffees');
      sound.play('ching', hearing(at));
      onPaid({ amount: pay, tip: 0, automated: !manual, at });
      void p;
    },
    onGaveUp: (p: Passenger) => {
      state.stars = nextStars(state.stars, 'angry', TUNING.stars);
      floaters.show('😠', new Vector3(p.x, 2.2, p.z), 'star');
      sound.play('pop');
    },
    onBoarded: (_p: Passenger, flight: Flight) => {
      count('boarded');
      meta.count('boardPax');
      if (flight.full) {
        floaters.show(`👥 ${t('boardingDone')}`, new Vector3(flight.x, 4.6, flight.z), 'star');
        sound.play('sparkle');
      }
    },
  }, (from, to) => route(from, to));
  passengers.screened = (gate) => !!layout.gates[gate]?.bridge && built('gate3');
  passengers.gateSpeed = (gate) => 1 / levelFactor(UPGRADES.kinds.speed, level(`${gate}.speed`));

  // The crew: the check-in agent behind the desk, the ground handler out on the apron, the ramp dispatcher
  // who opens the gates and waves the planes off.
  let agent: CrewMember | null = null;
  let handler: (CrewMember & { carrier: Carrier<CarryItem>; job: 'idle' | 'toBelt' | 'toHold' | 'toFuel' | 'fuelling' | 'home'; flight: Flight | null; wait: number }) | null = null;
  let dispatcher: (CrewMember & { job: DispatchJob; gate: GateView | null }) | null = null;
  // Part B's: the fuel crew (fuels every plane, so the handler only loads cases), the catering runner (trays
  // from the kitchen's hatch to the jets and the café), the barista and the duty-free clerk.
  let fueler: (CrewMember & { job: 'idle' | 'toFuel' | 'fuelling' | 'home'; flight: Flight | null }) | null = null;
  let runner: (CrewMember & { carrier: Carrier<CarryItem>; job: 'idle' | 'toHatch' | 'toGalley' | 'toCafe' | 'home'; flight: Flight | null; wait: number }) | null = null;
  let barista: CrewMember | null = null;
  let clerk: CrewMember | null = null;
  const hire = (id: string): void => {
    if (!peopleReady) return;
    if (id === 'agent' && !agent) {
      const avatar = new PersonAvatar(CHARACTERS.staff.seller);
      stage.scene.add(avatar.root);
      agent = new CrewMember(avatar, layout.staffSpots.agent ?? layout.desk.at);
      avatar.root.rotation.y = 0;
    }
    if (id === 'handler' && !handler) {
      const avatar = new PersonAvatar(CHARACTERS.staff.attendant);
      stage.scene.add(avatar.root);
      const member = new CrewMember(avatar, layout.staffSpots.handler ?? layout.belt.at);
      handler = Object.assign(member, {
        carrier: new Carrier<CarryItem>(avatar.root, () => ({ x: member.x, z: member.z }), () => AIRPORT.bags.handlerCarry + levelStep(UPGRADES.kinds.staffCarry, level('handler.staffCarry'))),
        job: 'idle' as const,
        flight: null,
        wait: 0,
      });
    }
    if (id === 'dispatcher' && !dispatcher) {
      const avatar = new PersonAvatar(CHARACTERS.staff.dispatcher);
      stage.scene.add(avatar.root);
      dispatcher = Object.assign(new CrewMember(avatar, layout.staffSpots.dispatcher ?? layout.belt.at), { job: 'idle' as DispatchJob, gate: null as GateView | null });
    }
    if (id === 'fuelcrew' && !fueler) {
      const avatar = new PersonAvatar(CHARACTERS.staff.fueler);
      stage.scene.add(avatar.root);
      fueler = Object.assign(new CrewMember(avatar, layout.staffSpots.fueler ?? layout.belt.at), { job: 'idle' as const, flight: null as Flight | null });
    }
    if (id === 'caterer' && !runner) {
      const avatar = new PersonAvatar(CHARACTERS.staff.caterer);
      stage.scene.add(avatar.root);
      const member = new CrewMember(avatar, layout.staffSpots.caterer ?? layout.kitchen.pick);
      runner = Object.assign(member, {
        carrier: new Carrier<CarryItem>(avatar.root, () => ({ x: member.x, z: member.z }), () => AIRPORT.meals.runnerCarry + levelStep(UPGRADES.kinds.staffCarry, level('caterer.staffCarry'))),
        job: 'idle' as const,
        flight: null as Flight | null,
        wait: 0,
      });
    }
    if (id === 'shops') {
      // Behind each counter, facing its customers (north, to -z).
      if (!barista) {
        const avatar = new PersonAvatar(CHARACTERS.staff.barista);
        stage.scene.add(avatar.root);
        barista = new CrewMember(avatar, layout.staffSpots.barista ?? layout.cafe.at);
        avatar.root.rotation.y = Math.PI;
      }
      if (!clerk) {
        const avatar = new PersonAvatar(CHARACTERS.staff.dutyclerk);
        stage.scene.add(avatar.root);
        clerk = new CrewMember(avatar, layout.staffSpots.clerk ?? layout.dutyfree.at);
        avatar.root.rotation.y = Math.PI;
      }
    }
  };

  // The gates: what stands at each once it's built, and a barrier across its door until then.
  const gates: GateView[] = [];
  const barriers = new Map<string, Object3D>();
  const barrierSolids = new Map<string, Rect>();
  for (const [key, spot] of Object.entries(layout.gates)) {
    if (built(key) || spot.bridge || current.pads.find((p) => p.id === key)?.cost === 0) continue;
    const barrier = gateBarrier(spot);
    barriers.set(key, barrier);
    const rect = around(spot.door, 1.65, 0.3);
    barrierSolids.set(key, rect);
    solids.push(rect);
    stage.scene.add(withShadows(barrier));
  }
  const spotPad = (at: Point, size: number, tint: number): PadModel => {
    const pad = new PadModel(size, tint);
    pad.group.position.set(at.x, 0, at.z);
    pad.group.visible = false;
    stage.scene.add(pad.group);
    return pad;
  };
  const addTruck = (gate: GateView, animate: boolean): void => {
    if (gate.truck) return;
    gate.truck = new FuelTruck();
    show(gate.truck.root, animate);
    gate.truck.root.position.set(gate.spot.truck.x, 0, gate.spot.truck.z);
    gate.hose = fuelHose();
    stage.scene.add(gate.hose);
    solids.push(footprint('sp_fuel', gate.spot.truck.x, gate.spot.truck.z, 0, 0.05));
    solidsChanged();
  };
  const addSeats = (spot: GateSpot, animate: boolean): void => {
    show(loungeSeats(spot.lounge), animate);
    solids.push(...loungeSeatSolids(spot.lounge));
    solidsChanged();
  };
  const openGate = (key: string, animate: boolean): void => {
    const spot = layout.gates[key];
    if (!spot || gates.some((g) => g.key === key)) return;
    barriers.get(key)?.removeFromParent();
    const gone = barrierSolids.get(key);
    if (gone) solids.splice(solids.indexOf(gone), 1);
    solidsChanged();
    let bridge: JetBridge | null = null;
    let catering: CateringTruck | null = null;
    let galleyPad: PadModel | null = null;
    if (spot.bridge) {
      bridge = new JetBridge(spot.bridge);
      bridge.update(10, spot.planeDoor, false);
      show(bridge.root, animate);
      // Its column and the crew's stair tower beside it (the drum and the tunnel are overhead).
      solids.push(around(spot.bridge, 0.42));
      const turn = bridge.root.rotation.y;
      solids.push(around({ x: spot.bridge.x + Math.cos(turn) * 1.45 - Math.sin(turn) * 0.3, z: spot.bridge.z - Math.sin(turn) * 1.45 - Math.cos(turn) * 0.3 }, 0.5));
      if (spot.galley) {
        // The catering truck behind the wing, its galley box's platform at the jet's back door.
        const mid = spot.noseZ - JET.length / 2;
        const doorX = spot.x + JET.radius + 0.03;
        const at = { x: doorX + 3.55, z: mid - 4.74 };
        catering = new CateringTruck();
        catering.root.position.set(at.x, 0, at.z);
        catering.root.rotation.y = Math.PI / 2;
        show(catering.root, animate);
        solids.push(footprint('sp_catering', at.x, at.z, Math.PI / 2, 0.08));
        galleyPad = spotPad(spot.galley, 1.5, 0xffb02e);
      }
    } else {
      const stairs = show(airStairs(), animate);
      stairs.position.set(spot.stairsFoot.x, 0, spot.stairsFoot.z);
      solids.push({ minX: spot.stairsFoot.x - STAIRS.run - 0.12, maxX: spot.stairsFoot.x + 0.02, minZ: spot.stairsFoot.z - 0.8, maxZ: spot.stairsFoot.z + 0.8 });
    }
    const stand = show(podium(), animate);
    stand.position.set(spot.podium.x, 0, spot.podium.z);
    solids.push(around(spot.podium, 0.72, 0.38));
    const pad = new PadModel(2.2, 0x22c3c9);
    pad.group.position.set(spot.marshal.x, 0, spot.marshal.z);
    stage.scene.add(pad.group);
    const ring = new TimingRing();
    ring.mesh.position.set(spot.marshal.x, 0.09, spot.marshal.z);
    stage.scene.add(ring.mesh);
    const door = document.createElement('div');
    door.className = 'upgrade-icon flight-door';
    door.innerHTML = rich(`🚪 ${t('gateClosed')}`);
    const doorLabel = labels.add(door, new Vector3(spot.podium.x, 2.6, spot.podium.z));
    doorLabel.visible = false;
    const kind = planeAt(spot);
    const kit = standKit(kind);
    kit.position.set(spot.x, 0, spot.noseZ - PLANES[kind].size.length / 2);
    kit.visible = false;
    stage.scene.add(kit);
    // (Each gate's hold pad in its cases' colour.)
    const colour = parseInt(GATE_COLOURS[Math.max(0, Object.keys(layout.gates).indexOf(key)) % GATE_COLOURS.length]!.slice(1), 16);
    const gate: GateView = { key, spot, pad, ring, fuelPad: spotPad(spot.fuelSpot, 1.5, 0xff8a3d), holdPad: spotPad(spot.hold, 1.5, colour), doorLabel, truck: null, hose: null, kit, bridge, catering, galleyPad, onPad: false, stood: 0 };
    night.addStand({ x: spot.x, z: spot.noseZ - 5 });
    gates.push(gate);
    if (built('fuel')) addTruck(gate, animate);
    if (built('seats')) addSeats(spot, animate);
    // The first gate's first plane is nearly down as the hero arrives; a new gate's comes after a moment.
    airfield.openGate(key, animate ? 2 : gates.length === 1 ? 0 : 6);
  };

  let belt: BaggageBelt | null = null;
  // The cases on the belt's cart, each in its colour (drawn with the carried ones): two layers of six.
  const cartAt = new Object3D();
  cartAt.position.set(layout.belt.at.x, 0, layout.belt.at.z);
  const cartCases = new Carrier<CarryItem>(cartAt, () => layout.belt.at, () => 12);
  cartCases.arrange = (i) => [((i % 2 ? 0.42 : -0.42) - 0) / 1.6, (0.6 + Math.floor(i / 6) * 0.33 - 1.0) / 1.6, (-1.1 - (Math.floor(i / 2) % 3) * 0.8 + 0.5) / 1.6];
  /** Keeps the cart showing the first dozen of the belt's cases. */
  const showCart = (): void => {
    const want = beltCases.slice(0, 12);
    if (want.length === cartCases.stack.length && want.every((c, i) => cartCases.stack[i] === c)) return;
    while (cartCases.stack.length > 0) cartCases.remove(cartCases.stack[cartCases.stack.length - 1]!);
    for (const c of want) cartCases.push(c);
  };

  // Part B's terminal: what's built of it, drawn and solid.
  let wing: Object3D | null = null;
  let security: SecurityLane | null = null;
  let cafe: Cafe | null = null;
  let dutyFree: DutyFree | null = null;
  let kitchen: Kitchen | null = null;
  /** Trays of meals waiting on the kitchen's hatch, and on the café's counter (sandwiches). */
  let hatchTrays: Carrier<CarryItem> | null = null;
  let cafeTrays: Carrier<CarryItem> | null = null;
  let trayTimer = AIRPORT.kitchen.seconds;
  const night = new AirportNight(stage.scene, layout);
  night.setTerminal([layout.hall]);
  cleanups.push(() => {
    night.dispose();
    nightGlow.value = 0;
  });
  /** Seconds of the day-and-night (once the runway lights are in), and how dark it is now (0–1). */
  let nightTime = 0;
  let dark = 0;
  /** A row of trays on a counter (`count` along x, a little apart), in a carrier's own space. */
  const trayRow = (carrier: Carrier<CarryItem>, step: number): void => {
    carrier.arrange = (i) => [((i % 4) - 1.5) * step, Math.floor(i / 4) * 0.06, 0];
  };
  const buildWing = (animate: boolean): void => {
    if (wing) return;
    hall.hoarding.visible = false;
    const east = solids.indexOf(hallEast);
    if (east >= 0) solids.splice(east, 1);
    solids.push(...wingWalls(layout));
    wing = show(wingModel(Object.keys(layout.gates).indexOf('gate3') + 1), animate);
    stage.scene.add(wingFloor(layout, layout.gates.gate3?.lounge ?? null));
    // The security lane at the wing's door from the hall: its arch, the X-ray machine, the belts guiding its line.
    const arch = layout.security.arch;
    security = new SecurityLane();
    security.root.position.set(arch.x, 0, arch.z);
    show(security.root, animate);
    solids.push(around({ x: arch.x, z: arch.z - 0.6 }, 0.16, 0.26), around({ x: arch.x, z: arch.z + 0.6 }, 0.16, 0.26));
    solids.push({ minX: arch.x - 1.85, maxX: arch.x + 1.65, minZ: arch.z + 0.66, maxZ: arch.z + 1.48 });
    solids.push({ minX: arch.x - 3.45, maxX: arch.x - 0.95, minZ: arch.z - 0.79, maxZ: arch.z - 0.71 });
    solids.push({ minX: arch.x - 3.45, maxX: arch.x - 0.95, minZ: arch.z + 0.56, maxZ: arch.z + 0.64 });
    night.setTerminal([layout.hall, layout.wing]);
    solidsChanged();
  };
  const buildShop = (id: ShopId, animate: boolean): void => {
    const spot = layout[id];
    if (id === 'cafe' && !cafe) {
      cafe = new Cafe();
      cafe.root.position.set(spot.at.x, 0, spot.at.z);
      cafe.root.rotation.y = Math.PI;
      show(cafe.root, animate);
      // The counter, the back counter by the wall, the awning's front posts; a table and chairs to one side.
      solids.push(around(spot.at, 1.66, 0.46), { minX: spot.at.x - 1.62, maxX: spot.at.x + 1.62, minZ: spot.at.z + 1.4, maxZ: spot.at.z + 1.85 });
      for (const dx of [-1.6, 1.6]) solids.push(around({ x: spot.at.x + dx, z: spot.at.z - 0.6 }, 0.12));
      const table = { x: spot.at.x - 3.3, z: spot.at.z - 0.5 };
      const copy = skyModel('sp_cafetable');
      copy.position.set(table.x, 0, table.z);
      show(copy, animate);
      solids.push(footprint('sp_cafetable', table.x, table.z, 0, 0.05));
      // Sandwiches waiting on its counter (from the kitchen).
      const shelf = new Object3D();
      shelf.position.set(spot.at.x + 0.9, 1.08, spot.at.z - 0.05);
      stage.scene.add(shelf);
      cafeTrays = new Carrier<CarryItem>(shelf, () => spot.at, () => AIRPORT.kitchen.cafeShelf);
      trayRow(cafeTrays, 0.2);
    }
    if (id === 'dutyfree' && !dutyFree) {
      dutyFree = new DutyFree();
      dutyFree.root.position.set(spot.at.x, 0, spot.at.z);
      dutyFree.root.rotation.y = Math.PI;
      show(dutyFree.root, animate);
      // The counter, the display behind, a gondola either side, the perfume's plinth.
      solids.push(around(spot.at, 1.34, 0.44), { minX: spot.at.x - 2.32, maxX: spot.at.x + 2.32, minZ: spot.at.z + 1.42, maxZ: spot.at.z + 2.1 });
      for (const dx of [-2.2, 2.2]) solids.push({ minX: spot.at.x + dx - 0.42, maxX: spot.at.x + dx + 0.42, minZ: spot.at.z - 0.07, maxZ: spot.at.z + 1.47 });
      solids.push(around({ x: spot.at.x + 1.75, z: spot.at.z - 0.55 }, 0.46));
    }
    passengers.open[id] = true;
    solidsChanged();
  };
  const buildKitchen = (animate: boolean): void => {
    if (kitchen) return;
    const at = layout.kitchen.at;
    kitchen = new Kitchen();
    kitchen.root.position.set(at.x, 0, at.z);
    show(kitchen.root, animate);
    solids.push(footprint('sp_kitchen', at.x, at.z, 0, 0.05));
    hatchTrays = new Carrier<CarryItem>(kitchen.hatch, () => layout.kitchen.hatch, () => AIRPORT.kitchen.shelf);
    trayRow(hatchTrays, 0.22);
    hatchTrays.arrange = (i) => [0, Math.floor(i / 3) * 0.06 / 1.6, (((i % 3) - 1) * 0.42) / 1.6];
    solidsChanged();
  };
  const addBuilt = (id: string, animate: boolean): void => {
    const effects_ = current.pads.find((p) => p.id === id)?.effects;
    if (effects_?.gate) openGate(effects_.gate, animate);
    if (effects_?.fuel) for (const gate of gates) addTruck(gate, animate);
    if (effects_?.lounge) {
      for (const gate of gates) addSeats(gate.spot, animate);
      passengers.seats = seatAt;
      passengers.reseat();
    }
    if (effects_?.wing) buildWing(animate);
    if (effects_?.shop) buildShop(effects_.shop, animate);
    if (effects_?.kitchen) buildKitchen(animate);
    if (effects_?.bags && !belt) {
      belt = new BaggageBelt();
      show(belt.root, animate);
      belt.root.position.set(layout.belt.at.x, 0, layout.belt.at.z);
      stage.scene.add(cartAt);
      solids.push(footprint('sp_belt', layout.belt.at.x, layout.belt.at.z, 0, 0.04));
      solidsChanged();
    }
    if (effects_?.staff) hire(id);
    solidsChanged();
    stage.refreshShadows();
  };
  // The check-in desk and Gate 1 come with the airfield: there the moment the hero arrives.
  for (const pad of current.pads) if (pad.cost === 0 && !built(pad.id)) state.unlocked.push(pad.id);
  for (const id of state.unlocked) addBuilt(id, false);
  // The first plane's on short final as the hero arrives.
  if (built('gate1')) airfield.send('gate1', 0.5);

  void loadPeople([...CHARACTERS.visitors, CHARACTERS.staff.seller, CHARACTERS.staff.attendant, CHARACTERS.staff.dispatcher, CHARACTERS.staff.fueler, CHARACTERS.staff.caterer, CHARACTERS.staff.barista, CHARACTERS.staff.dutyclerk]).then(() => {
    peopleReady = true;
    for (const id of state.unlocked) hire(id);
    // A few are already in line.
    for (let i = 0; i < AIRPORT.passengers.opening; i++) passengers.spawn(layout.desk.window, 0, true);
  });

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
        showEndScreen(root, () => meta.screenClosed(), { title: t('endTitleSkyport'), body: t('endBodySkyport') });
      }
    },
    () => {
      view.refit();
      void saves.saveNow();
    },
  );
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

  // Taxis on the road in front.
  // (Two to each stopping place: the next pulls in as the one before pulls out.)
  const taxis: Taxi[] = [...layout.kerb, ...layout.kerb].map((kerb) => {
    const car = taxiCar();
    car.mesh.visible = false;
    // Driving west, nose to -x.
    car.mesh.rotation.y = -Math.PI / 2;
    stage.scene.add(car.mesh);
    return { car, state: 'away' as const, x: TAXI_FROM, kerb, riders: 0, timer: 0 };
  });
  const taxiZ = layout.roadZ - 1.7;
  let spawnTimer = 2;
  const updateTaxis = (dt: number): void => {
    const rate = (1 + unlockedSum(state, (e) => e.arrivalBonus)) * (1 + (state.stars - TUNING.stars.start) * TUNING.stars.arrivalPerStar) * arrivals.rateFactor * boost;
    spawnTimer -= dt * rate;
    const taxi = taxis.find((x) => x.state === 'away' && !taxis.some((y) => y.kerb === x.kerb && (y.state === 'in' || y.state === 'stop' || (y.state === 'out' && y.x > y.kerb.x - 7))));
    const coming = taxis.reduce((sum, x) => sum + (x.state === 'away' ? 0 : x.riders), 0);
    if (spawnTimer <= 0 && taxi && peopleReady && passengers.all.length + coming < AIRPORT.passengers.max && passengers.line.length + coming < layout.desk.queue.length) {
      const [low, high] = AIRPORT.passengers.group as [number, number];
      taxi.riders = Math.round(low + Math.random() * (high - low));
      taxi.state = 'in';
      taxi.x = TAXI_FROM;
      taxi.car.mesh.visible = true;
      spawnTimer = AIRPORT.passengers.spawnSeconds * taxi.riders;
    }
    for (const x of taxis) {
      if (x.state === 'away') continue;
      if (x.state === 'in') {
        const left = x.x - x.kerb.x;
        x.x -= Math.min(left, dt * Math.max(2.5, Math.min(16, left * 1.7)));
        if (left < 0.05) {
          x.state = 'stop';
          x.timer = 0.3;
          if (hearing({ x: x.kerb.x, z: taxiZ }) > 0.7 && Math.random() < 0.25) sound.play('honk', 0.4);
        }
      } else if (x.state === 'stop') {
        x.timer -= dt;
        if (x.timer <= 0) {
          if (x.riders > 0 && passengers.spawn({ x: x.kerb.x + (x.riders % 2 ? 0.7 : -0.7), z: taxiZ - 1.5 }, unlockedSum(state, (e) => e.patienceBonus))) {
            x.riders -= 1;
            x.timer = 0.45;
          } else {
            x.riders = 0;
            x.state = 'out';
          }
        }
      } else {
        x.x -= dt * Math.min(16, 3 + (x.kerb.x - x.x) * 2);
        if (x.x < TAXI_TO) {
          x.state = 'away';
          x.car.mesh.visible = false;
        }
      }
      x.car.mesh.position.set(x.x, 0, taxiZ);
      x.car.animate(dt, x.state === 'in' || x.state === 'out', x.state === 'stop');
    }
  };

  /** How hard the check-in desk is worked this frame: the hero behind it, or the agent (whichever's faster). */
  const deskService = (): { rate: number; byPlayer: boolean } => {
    const speed = 1 / levelFactor(UPGRADES.kinds.speed, level('checkin.speed'));
    const byPlayer = insideRect(player.position, layout.desk.zone) ? speed : 0;
    const byAgent = agent ? (speed * AGENT_RATE) / levelFactor(UPGRADES.kinds.staffSpeed, level('agent.staffSpeed')) : 0;
    return { rate: Math.max(byPlayer, byAgent), byPlayer: byPlayer > 0 && byPlayer >= byAgent };
  };

  /** A plane's fuselage, as a rectangle on the ground, while it's on or near its stand. */
  const parkedSolids = (flight: Flight): Rect[] => (flight.phase === 'parked' ? planeSolids(flight.kind, flight.x, flight.z).slice(1) : []);
  const hull = (flight: Flight): Rect | null => {
    if (!['taxiIn', 'parked', 'pushback'].includes(flight.phase) || flight.z < layout.taxiway.z + 5) return null;
    const solid = PLANES[flight.kind].solid;
    return { minX: flight.x - solid.half, maxX: flight.x + solid.half, minZ: flight.z + solid.tail, maxZ: flight.z + solid.nose };
  };

  /** Clears a flight for take-off: it pays for every seat, and more for leaving full and on time. */
  const clear = (flight: Flight, gate: GateView, perfect: boolean, byCrew = false): void => {
    flight.cleared = true;
    flight.perfect = perfect;
    const nightFlight = built('lights') && dark >= 0.5;
    const fare = AIRPORT.planes[flight.kind].fare * levelFactor(UPGRADES.kinds.price, level(`${gate.key}.price`)) * payBonus() * (nightFlight ? 1 + AIRPORT.night.pay : 1);
    const streak = state.counts[streakKey] ?? 0;
    const { pay, onTime } = flightPay(flight, fare, streak, AIRPORT);
    const tip = perfect ? Math.round(pay * AIRPORT.flight.perfectTip) : 0;
    cash.add(gate.key, pay + tip);
    const at = layout.piles[gate.key] ?? gate.spot.marshal;
    const top = new Vector3(flight.x, 5.2, flight.z);
    floaters.show(`+${money(pay)} ✈️`, new Vector3(at.x, 1.2, at.z), 'cash');
    if (flight.full) floaters.show(`🎉 ${t('flightFull')}`, new Vector3(top.x, top.y + 0.9, top.z), 'star');
    if (nightFlight) {
      floaters.show(`🌙 ${t('nightFlight')}`, new Vector3(top.x, top.y + 1.8, top.z), 'star');
      count('nightFlights');
    }
    if (flight.kind === 'jet') count('jets');
    if (onTime) {
      state.counts[streakKey] = streak + 1;
      count('ontime');
      meta.count('onTime');
      flag(onTimeFlag);
      floaters.show(`🕐 ${t('flightOnTime')}`, top, 'star');
      effects.burst('confetti', new Vector3(flight.x, 3.4, flight.z + 3), 26, 4.5, 1.2);
    } else {
      state.counts[streakKey] = 0;
    }
    if (perfect) {
      count('perfectTakeoff');
      meta.count('perfectTakeoff');
      floaters.show(`⭐ ${t('perfectTakeoff')} +${money(tip)}`, new Vector3(gate.spot.marshal.x, 3, gate.spot.marshal.z), 'tip');
      effects.burst('sparkle', new Vector3(gate.spot.marshal.x, 1.2, gate.spot.marshal.z), 20, 4, 1);
      sound.play('reward');
    } else sound.play('ching');
    state.stars = nextStars(state.stars, onTime ? 'happy' : 'okay', TUNING.stars);
    flag(clearedFlag);
    onPaid({ amount: pay + tip, tip, automated: byCrew, at });
    void saves.saveNow();
  };

  /** Says "wrong colour" no more often than this (seconds). */
  let wrongSaid = 0;
  /** A tray of meals into a jet's galley (the hero's, or the runner's). */
  const loadMeal = (flight: Flight, spot: GateSpot): void => {
    flight.meals += 1;
    sound.play('drop', hearing(spot.galley ?? spot.hold));
    count('meals');
    if (flight.meals >= flight.needsMeals && spot.galley) floaters.show(`🍱 ${t('mealsLoaded')}`, new Vector3(spot.galley.x, 2.6, spot.galley.z), 'star');
  };

  /** The hero's work at a gate this frame: marshalling, opening it, fuelling, loading cases, and clearance. */
  const workGate = (dt: number, gate: GateView): void => {
    const flight = airfield.at(gate.key);
    const { spot } = gate;
    const onPad = near(player.position, spot.marshal, AIRPORT.marshal.reach);
    const parked = flight?.phase === 'parked' && !flight.cleared ? flight : null;
    // Guiding it in: on the ramp pad as it comes down the line to the stand.
    if (flight?.phase === 'taxiIn' && onPad && flight.z > layout.taxiway.z + 4) flight.marshalled = true;
    // Opening the gate: at the podium.
    if (parked && !parked.boarding && near(player.position, podiumFront(spot), 1.3)) {
      parked.boarding = true;
      flag(gateFlag);
      floaters.show(`🚪 ${t('gateOpen')}`, new Vector3(spot.door.x, 3.2, spot.door.z), 'star');
      sound.play('chime');
    }
    gate.doorLabel.visible = !!parked && !parked.boarding && parked.waiting > 0;
    // Fuel: by the hose (or the ground handler's there).
    const wantsFuel = !!parked && parked.needsFuel && parked.fuel < 1;
    const fuelling = wantsFuel && (near(player.position, spot.fuelSpot) || (handler?.job === 'fuelling' && handler.flight === parked) || (fueler?.job === 'fuelling' && fueler.flight === parked));
    if (parked && fuelling) {
      const before = parked.fuel;
      // (A jet's tanks take longer; the gate's speed upgrade quickens it.)
      const tanks = AIRPORT.fuel.seconds * (parked.kind === 'jet' ? 1.6 : 1) * levelFactor(UPGRADES.kinds.speed, level(`${gate.key}.speed`));
      parked.fuel = Math.min(1, parked.fuel + (dt * boost) / tanks);
      if (Math.floor(before * 5) !== Math.floor(parked.fuel * 5)) sound.play('glug', hearing(spot.fuelSpot));
      if (parked.fuel >= 1) {
        floaters.show(`⛽ ${t('fuelFull')}`, new Vector3(spot.fuelSpot.x, 2.6, spot.fuelSpot.z), 'star');
        sound.play('fueled');
      }
    }
    gate.fuelPad.group.visible = wantsFuel;
    gate.fuelPad.update(dt, !!fuelling);
    if (wantsFuel) gate.fuelPad.setProgress(parked!.fuel);
    gate.truck?.update(dt, wantsFuel, !!fuelling);
    gate.kit.visible = flight?.phase === 'parked';
    if (gate.hose && gate.truck) {
      gate.hose.visible = !!fuelling;
      if (fuelling) {
        // From the truck's reel up to the wing.
        const from = gate.truck.nozzle(new Vector3());
        const to = flight!.kind === 'jet' ? new Vector3(spot.x + (spot.truck.x > spot.x ? 3.5 : -3.5), JET.wingY, flight!.z - 1.0) : new Vector3(spot.x - 3.5, PROP.wingY - 0.05, flight!.z + 0.3);
        gate.hose.position.copy(from);
        gate.hose.lookAt(to);
        gate.hose.scale.set(1, 1, from.distanceTo(to));
      }
    }
    // Cases: the hero's stack into the hold, one at a time.
    const wantsCases = !!parked && parked.cases < parked.needsCases;
    gate.holdPad.group.visible = wantsCases;
    const atHold = wantsCases && near(player.position, spot.hold, 1.1);
    gate.holdPad.update(dt, atHold);
    if (wantsCases) gate.holdPad.setProgress(parked!.cases / parked!.needsCases);
    // (Only its own colour goes in, or the golden one; that one's a gem.)
    const fits = parked && atHold && heroCarry.timer <= 0 ? heroCarry.stack.find((item) => caseFits(item, gate.key)) : undefined;
    if (parked && fits) {
      heroCarry.remove(fits);
      heroCarry.timer = AIRPORT.bags.handSeconds;
      parked.cases += 1;
      sound.play('drop');
      if (fits === 'caseGold') {
        state.gems += 1;
        floaters.show(`💎 ${t('goldenCase')}`, new Vector3(spot.hold.x, 2.2, spot.hold.z), 'tip');
        effects.burst('sparkle', new Vector3(spot.hold.x, 1.2, spot.hold.z), 18, 3.5, 1);
        sound.play('reward');
        count('goldenCases');
      }
      if (parked.cases >= parked.needsCases) floaters.show(`🧳 ${t('bagsLoaded')}`, new Vector3(spot.hold.x, 2.6, spot.hold.z), 'star');
    } else if (parked && atHold && heroCarry.timer <= 0 && heroCarry.stack.some(isCase) && wrongSaid <= 0) {
      wrongSaid = 3;
      floaters.show(`🎨 ${t('wrongCase')}`, new Vector3(spot.hold.x, 2.4, spot.hold.z), 'star');
    }
    // Meals: a jet's trays go aboard at its galley (the hero's, or the catering runner's), the catering truck's box up at its door.
    const wantsMeals = !!parked && parked.meals < parked.needsMeals;
    if (gate.galleyPad && spot.galley) {
      gate.galleyPad.group.visible = wantsMeals;
      const atGalley = wantsMeals && near(player.position, spot.galley, 1.1);
      gate.galleyPad.update(dt, atGalley);
      if (wantsMeals) gate.galleyPad.setProgress(parked!.meals / parked!.needsMeals);
      if (parked && atGalley && heroCarry.count('tray') > 0 && heroCarry.timer <= 0) {
        heroCarry.remove('tray');
        heroCarry.timer = AIRPORT.meals.handSeconds;
        loadMeal(parked, spot);
      }
    }
    gate.catering?.update(dt, !!flight && flight.phase === 'parked' && flight.needsMeals > 0 && !flight.cleared, JET.sill - 1.12);
    if (gate.bridge) {
      // To the jet's door once it's parked, back as it's cleared to go.
      const docked = flight?.phase === 'parked' && !flight.cleared;
      const door = flight && (flight.phase === 'parked' || flight.phase === 'taxiIn') ? { x: flight.x + JET.radius + 0.05, z: flight.z + 2.45 } : spot.planeDoor;
      gate.bridge.update(dt, door, docked);
    }
    // Clearance: stepping onto the ramp pad when it's ready (on the ring for a perfect take-off).
    const ready = !!parked && parked.ready;
    if (ready) {
      const ring = ringAt(parked!.readyFor, AIRPORT.ring);
      gate.ring.show(ring.radius, ring.onTarget);
      if (onPad && !gate.onPad) clear(parked!, gate, ring.onTarget);
      else if (onPad) {
        gate.stood += dt;
        if (gate.stood >= STAND_CLEAR_SECONDS) clear(parked!, gate, false);
      }
    } else {
      gate.ring.show(null);
      gate.stood = 0;
    }
    gate.pad.update(dt, onPad || ready);
    gate.onPad = onPad;
  };

  /**
   * The ramp dispatcher: opens a gate once its plane has parked and people are waiting, and waves a plane
   * off once it's been ready a moment (the hero has that moment to make it a perfect take-off). Walks the
   * service road between jobs, through the gate's door to its podium.
   */
  const workDispatcher = (dt: number): void => {
    const d = dispatcher;
    if (!d) return;
    const speed = (CREW_SPEED * boost) / levelFactor(UPGRADES.kinds.staffSpeed, level('dispatcher.staffSpeed'));
    const arrived = d.walk(dt, speed);
    d.avatar.update(dt);
    if (!arrived) return;
    const road = DISPATCH_ROAD_Z;
    const gate = d.gate;
    if (d.job === 'toGate' && gate) {
      const flight = airfield.parkedAt(gate.key);
      if (flight && !flight.cleared && !flight.boarding) {
        flight.boarding = true;
        floaters.show(`🚪 ${t('gateOpen')}`, new Vector3(gate.spot.door.x, 3.2, gate.spot.door.z), 'star');
        sound.play('chime', hearing(gate.spot.door));
      }
      d.job = 'idle';
      go(d, { x: gate.spot.door.x, z: road });
      return;
    }
    if (d.job === 'toPad' && gate) {
      const flight = airfield.parkedAt(gate.key);
      if (flight && !flight.cleared && flight.ready) {
        clear(flight, gate, false, true);
        d.avatar.wave();
      }
      d.job = 'idle';
      go(d, { x: gate.spot.marshal.x + 1.6, z: road });
      return;
    }
    // What's next: a plane that's ready, then a gate to open, else home.
    const parked = gates.map((g) => ({ g, f: airfield.parkedAt(g.key) })).filter((x): x is { g: GateView; f: Flight } => !!x.f && !x.f.cleared);
    const ready = parked.find((x) => x.f.ready && x.f.readyFor >= DISPATCH_WAIT && !near(player.position, x.g.spot.marshal, 2.2));
    if (ready) {
      d.job = 'toPad';
      d.gate = ready.g;
      go(d, ready.g.spot.marshal);
      return;
    }
    const closed = parked.find((x) => !x.f.boarding && x.f.waiting > 0 && x.f.parkedFor >= DISPATCH_WAIT);
    if (closed) {
      d.job = 'toGate';
      d.gate = closed.g;
      go(d, podiumFront(closed.g.spot));
      return;
    }
    const home = layout.staffSpots.dispatcher ?? layout.belt.at;
    if (d.job !== 'home' && Math.hypot(d.x - home.x, d.z - home.z) > 0.5) {
      d.job = 'home';
      go(d, home);
    } else if (d.job === 'home') {
      d.job = 'idle';
      d.avatar.root.rotation.y = Math.PI;
    }
  };

  /** The ground handler: cases from the cart to whichever plane wants them, then its fuel. */
  const workHandler = (dt: number): void => {
    const h = handler;
    if (!h) return;
    const speed = (CREW_SPEED * boost) / levelFactor(UPGRADES.kinds.staffSpeed, level('handler.staffSpeed'));
    const arrived = h.walk(dt, speed);
    h.carrier.update(dt, !arrived);
    h.avatar.update(dt);
    // (Whichever plane has least time left comes first.)
    const parkedFlights = gates
      .map((g) => airfield.parkedAt(g.key))
      .filter((f): f is Flight => !!f && !f.cleared)
      .sort((a, b) => a.clock - b.clock);
    const home = layout.staffSpots.handler ?? layout.belt.side;
    if (!arrived) return;
    h.wait = Math.max(0, h.wait - dt);
    if (h.wait > 0) return;
    if (h.job === 'toBelt') {
      const flight = h.flight && h.flight.phase === 'parked' && !h.flight.cleared && h.flight.cases < h.flight.needsCases ? h.flight : parkedFlights.find((f) => f.cases < f.needsCases);
      while (flight && !h.carrier.full && h.carrier.stack.length < flight.needsCases - flight.cases) {
        const i = beltCases.findIndex((c) => caseFits(c, flight.gate));
        if (i < 0) break;
        h.carrier.push(beltCases.splice(i, 1)[0]!);
      }
      if (flight && h.carrier.stack.length > 0) {
        h.job = 'toHold';
        h.flight = flight;
        go(h, flight.spot.hold);
        sound.play('pick', hearing(h));
      } else h.job = 'idle';
      h.wait = 0.4;
      return;
    }
    if (h.job === 'toHold') {
      const flight = h.flight;
      if (flight && flight.phase === 'parked' && !flight.cleared) {
        while (h.carrier.stack.length > 0 && flight.cases < flight.needsCases) {
          h.carrier.remove(h.carrier.stack[h.carrier.stack.length - 1]!);
          flight.cases += 1;
        }
        sound.play('drop', hearing(h));
      }
      // Anything left over goes back on the cart.
      while (h.carrier.stack.length > 0) {
        const item = h.carrier.stack[h.carrier.stack.length - 1]!;
        h.carrier.remove(item);
        if (isCase(item)) beltCases.push(item);
      }
      h.job = 'idle';
      h.wait = 0.3;
      return;
    }
    if (h.job === 'toFuel') {
      h.job = h.flight && h.flight.phase === 'parked' && !h.flight.cleared && h.flight.fuel < 1 ? 'fuelling' : 'idle';
      if (h.flight) h.avatar.root.rotation.y = Math.atan2(h.flight.spot.x - 2.4 - h.x, 0.5 - h.z);
      return;
    }
    if (h.job === 'fuelling') {
      const flight = h.flight;
      if (flight && flight.phase === 'parked' && !flight.cleared && flight.fuel < 1) return;
      h.job = 'idle';
      return;
    }
    // Idle (or home): what's next? One plane at a time, whichever has least time left: its cases, then its fuel.
    const needsCases = (f: Flight): boolean => f.cases < f.needsCases && beltCases.some((c) => caseFits(c, f.gate));
    const needsFuel = (f: Flight): boolean => !fueler && f.needsFuel && f.fuel < 1 && !near(player.position, f.spot.fuelSpot);
    const target = parkedFlights.find((f) => needsCases(f) || needsFuel(f));
    if (target && needsCases(target)) {
      h.job = 'toBelt';
      h.flight = target;
      go(h, home);
      return;
    }
    const wantsFuel = target;
    if (wantsFuel) {
      h.job = 'toFuel';
      h.flight = wantsFuel;
      go(h, wantsFuel.spot.fuelSpot);
      return;
    }
    if (h.job !== 'home' && Math.hypot(h.x - home.x, h.z - home.z) > 0.5) {
      h.job = 'home';
      go(h, home);
    } else if (h.job === 'home') {
      h.job = 'idle';
      h.avatar.root.rotation.y = Math.PI;
    }
  };

  /** The fuel crew: to whichever parked plane needs fuel with least time left, fuels it there, then the next. */
  const workFueler = (dt: number): void => {
    const f = fueler;
    if (!f) return;
    const speed = (CREW_SPEED * boost) / levelFactor(UPGRADES.kinds.staffSpeed, level('fuelcrew.staffSpeed'));
    const arrived = f.walk(dt, speed);
    f.avatar.update(dt);
    if (!arrived) return;
    if (f.job === 'toFuel') {
      f.job = f.flight && f.flight.phase === 'parked' && !f.flight.cleared && f.flight.fuel < 1 ? 'fuelling' : 'idle';
      if (f.flight) f.avatar.root.rotation.y = Math.atan2(f.flight.x - f.x, f.flight.z - f.z);
      return;
    }
    if (f.job === 'fuelling') {
      const flight = f.flight;
      if (flight && flight.phase === 'parked' && !flight.cleared && flight.fuel < 1) return;
      f.job = 'idle';
    }
    const dry = gates
      .map((g) => airfield.parkedAt(g.key))
      .filter((fl): fl is Flight => !!fl && !fl.cleared && fl.needsFuel && fl.fuel < 1 && !near(player.position, fl.spot.fuelSpot))
      .sort((a, b) => a.clock - b.clock)[0];
    if (dry) {
      f.job = 'toFuel';
      f.flight = dry;
      go(f, dry.spot.fuelSpot);
      return;
    }
    const home = layout.staffSpots.fueler ?? layout.belt.side;
    if (f.job !== 'home' && Math.hypot(f.x - home.x, f.z - home.z) > 0.5) {
      f.job = 'home';
      go(f, home);
    } else if (f.job === 'home') f.job = 'idle';
  };

  /** Jets parked that still want meals (least time left first). */
  const hungry = (): Flight[] =>
    gates
      .map((g) => airfield.parkedAt(g.key))
      .filter((fl): fl is Flight => !!fl && !fl.cleared && fl.meals < fl.needsMeals)
      .sort((a, b) => a.clock - b.clock);
  /** Where trays go on the café's counter: from its open end, by the barista. */
  const cafeDrop = (): Point => ({ x: layout.cafe.zone.maxX + 0.75, z: (layout.cafe.zone.minZ + layout.cafe.zone.maxZ) / 2 });

  /**
   * The catering runner: trays from the hatch to a jet that wants meals (before anything), else to the café's
   * counter while it has room; home between.
   */
  const workRunner = (dt: number): void => {
    const r = runner;
    if (!r || !hatchTrays) return;
    const speed = (CREW_SPEED * boost) / levelFactor(UPGRADES.kinds.staffSpeed, level('caterer.staffSpeed'));
    const arrived = r.walk(dt, speed);
    r.carrier.update(dt, !arrived);
    r.avatar.update(dt);
    if (!arrived) return;
    r.wait = Math.max(0, r.wait - dt);
    if (r.wait > 0) return;
    const cafeRoom = cafe && cafeTrays ? AIRPORT.kitchen.cafeShelf - cafeTrays.stack.length : 0;
    if (r.job === 'toHatch') {
      const want = Math.max(0, (r.flight ? r.flight.needsMeals - r.flight.meals : cafeRoom) - r.carrier.stack.length);
      for (let i = 0; i < want && !r.carrier.full && hatchTrays.stack.length > 0; i++) {
        hatchTrays.remove('tray');
        r.carrier.push('tray');
      }
      if (r.carrier.stack.length > 0) {
        r.job = r.flight ? 'toGalley' : 'toCafe';
        go(r, r.flight?.spot.galley ?? cafeDrop());
        sound.play('pick', hearing(r));
      } else r.job = 'idle';
      r.wait = 0.4;
      return;
    }
    if (r.job === 'toGalley') {
      const flight = r.flight;
      while (flight && flight.phase === 'parked' && !flight.cleared && flight.meals < flight.needsMeals && r.carrier.count('tray') > 0) {
        r.carrier.remove('tray');
        loadMeal(flight, flight.spot);
      }
      r.flight = null;
      r.job = r.carrier.count('tray') > 0 && cafeRoom > 0 ? 'toCafe' : 'idle';
      if (r.job === 'toCafe') go(r, cafeDrop());
      r.wait = 0.3;
      return;
    }
    if (r.job === 'toCafe') {
      while (cafeTrays && cafeTrays.stack.length < AIRPORT.kitchen.cafeShelf && r.carrier.count('tray') > 0) {
        r.carrier.remove('tray');
        cafeTrays.push('tray');
      }
      // (What's left goes back to the hatch, or into the next jet.)
      r.job = 'idle';
      r.wait = 0.3;
      return;
    }
    const jet = hungry().find((fl) => !near(player.position, fl.spot.galley ?? fl.spot.hold, 1.4));
    if (jet && (hatchTrays.stack.length > 0 || r.carrier.count('tray') > 0)) {
      r.flight = jet;
      if (r.carrier.count('tray') >= jet.needsMeals - jet.meals) {
        r.job = 'toGalley';
        go(r, jet.spot.galley ?? jet.spot.hold);
      } else {
        r.job = 'toHatch';
        go(r, layout.kitchen.pick);
      }
      return;
    }
    if (cafeRoom > 0 && (hatchTrays.stack.length > 0 || r.carrier.count('tray') > 0)) {
      r.flight = null;
      if (r.carrier.count('tray') > 0) {
        r.job = 'toCafe';
        go(r, cafeDrop());
      } else {
        r.job = 'toHatch';
        go(r, layout.kitchen.pick);
      }
      return;
    }
    const home = layout.staffSpots.caterer ?? layout.kitchen.pick;
    if (r.job !== 'home' && Math.hypot(r.x - home.x, r.z - home.z) > 0.5) {
      r.job = 'home';
      go(r, home);
    } else if (r.job === 'home') r.job = 'idle';
  };

  /** How hard a shop's counter is worked this frame: the hero behind it, or its assistant (whichever's faster). */
  const shopService = (id: ShopId): { rate: number; byPlayer: boolean } => {
    if (!built(id)) return { rate: 0, byPlayer: false };
    const speed = 1 / levelFactor(UPGRADES.kinds.speed, level(`${id}.speed`));
    const byPlayer = insideRect(player.position, layout[id].zone) ? speed : 0;
    const helper = id === 'cafe' ? barista : clerk;
    const byStaff = helper ? (speed * AGENT_RATE) / levelFactor(UPGRADES.kinds.staffSpeed, level('shops.staffSpeed')) : 0;
    return { rate: Math.max(byPlayer, byStaff), byPlayer: byPlayer > 0 && byPlayer >= byStaff };
  };

  /** The kitchen cooks a tray every few seconds while its hatch has room; the hero picks them up there and leaves them at the café. */
  const workKitchen = (dt: number): void => {
    if (!kitchen || !hatchTrays) return;
    kitchen.update(dt);
    trayTimer -= (dt * boost) / levelFactor(UPGRADES.kinds.speed, level('kitchen.speed'));
    if (trayTimer <= 0) {
      trayTimer = AIRPORT.kitchen.seconds;
      if (hatchTrays.stack.length < AIRPORT.kitchen.shelf) {
        hatchTrays.push('tray');
        effects.puff(kitchen.steam.getWorldPosition(new Vector3()), new Vector3(0, 1, 0), 4);
        if (hearing(layout.kitchen.hatch) > 0.6) sound.play('ding');
      }
    }
    if (hatchTrays.stack.length > 0 && !heroCarry.full && heroCarry.timer <= 0 && near(player.position, layout.kitchen.pick, 1.0)) {
      hatchTrays.remove('tray');
      heroCarry.push('tray');
      heroCarry.timer = AIRPORT.meals.handSeconds;
      sound.play('pick');
    }
    if (cafe && cafeTrays && heroCarry.count('tray') > 0 && heroCarry.timer <= 0 && cafeTrays.stack.length < AIRPORT.kitchen.cafeShelf && (insideRect(player.position, layout.cafe.zone) || near(player.position, cafeDrop(), 0.9))) {
      heroCarry.remove('tray');
      cafeTrays.push('tray');
      heroCarry.timer = AIRPORT.meals.handSeconds;
      sound.play('drop');
    }
  };

  /** A flight's label: its clock, who's aboard, and what it's still waiting for. */
  const describe = (flight: Flight): string => {
    if (flight.cleared) return `<span class="flight-chip is-go">${rich(`✈️ ${t(flight.phase === 'parked' ? 'flightHolding' : 'flightCleared')}`)}</span>`;
    const left = Math.ceil(flight.clock);
    const share = flight.clockMax > 0 ? flight.clock / flight.clockMax : 0;
    const clockClass = flight.late ? 'is-late' : share < 0.25 ? 'is-low' : '';
    let html = `<span class="flight-clock ${clockClass}" style="--left:${(share * 100).toFixed(0)}%">${flight.late ? '!' : left}</span>`;
    html += `<span class="flight-chip${flight.full ? ' is-done' : ''}">${rich(`👥 ${flight.boarded}/${flight.seats}`)}</span>`;
    if (flight.needsFuel) html += `<span class="flight-chip${flight.fuel >= 1 ? ' is-done' : ''}">${rich(flight.fuel >= 1 ? '⛽ ✓' : `⛽ ${Math.floor(flight.fuel * 100)}%`)}</span>`;
    if (flight.needsCases > 0) html += `<span class="flight-chip${flight.cases >= flight.needsCases ? ' is-done' : ''}">${rich(`🧳 ${flight.cases}/${flight.needsCases}`)}</span>`;
    if (flight.needsMeals > 0) html += `<span class="flight-chip${flight.meals >= flight.needsMeals ? ' is-done' : ''}">${rich(`🍱 ${flight.meals}/${flight.needsMeals}`)}</span>`;
    if (flight.ready) html += `<span class="flight-chip is-go">${t('flightReady')}</span>`;
    return html;
  };
  /**
   * How a flight's plane stands: its doors open once it's parked (the hold's only for cases), flaps down to
   * land and half down to take off, gear folded once it's well up, the nose wheel steering into its turns,
   * its wheels rolling as far as it went on the ground.
   */
  const pose = (flight: Flight, v: FlightView, dt: number): PlanePose => {
    const onGround = flight.y < 0.05;
    let roll = 0;
    let steer = 0;
    if (v.last && dt > 0 && onGround) {
      const dx = flight.x - v.last.x;
      const dz = flight.z - v.last.z;
      roll = dx * Math.sin(flight.heading) + dz * Math.cos(flight.heading);
      if (Math.abs(roll) > 3) roll = 0;
      const turned = Math.atan2(Math.sin(flight.heading - v.last.heading), Math.cos(flight.heading - v.last.heading));
      steer = Math.max(-0.6, Math.min(0.6, (turned / dt) * 0.9 * Math.sign(roll || 1)));
    }
    v.last = { x: flight.x, z: flight.z, heading: flight.heading };
    const parked = flight.phase === 'parked';
    const landing = flight.phase === 'approach' || flight.phase === 'rollout';
    const leaving = flight.phase === 'taxiOut' || flight.phase === 'hold' || flight.phase === 'lineup' || flight.phase === 'takeoff' || (flight.phase === 'climb' && flight.y < 14);
    return {
      engines: flight.engines,
      door: parked && !flight.cleared ? 1 : 0,
      hold: parked && !flight.cleared && flight.needsCases > 0 ? 1 : 0,
      galley: parked && !flight.cleared && flight.needsMeals > 0 ? 1 : 0,
      flaps: landing ? 1 : leaving ? 0.5 : 0,
      gear: (flight.phase === 'climb' && flight.y > 5) || (flight.phase === 'approach' && flight.approach < 0.2) ? 0 : 1,
      steer: onGround ? steer : 0,
      roll,
      taxiLight: onGround && !parked && flight.engines > 0.1,
    };
  };
  const drawFlights = (dt: number): void => {
    for (const flight of airfield.flights) {
      let v = views.get(flight);
      if (!v) {
        const model = new PlaneModel(LIVERIES[flight.livery % LIVERIES.length]!, flight.kind);
        stage.scene.add(model.root, model.shadow);
        const el = document.createElement('div');
        el.className = 'flight-label';
        const at = new Vector3();
        const label = labels.add(el, at, true);
        v = { model, label, at, shown: '', lateSaid: false, last: null };
        views.set(flight, v);
      }
      v.model.root.position.set(flight.x, flight.y, flight.z);
      v.model.root.rotation.set(-flight.pitch, flight.heading, -flight.bank);
      v.model.update(dt, pose(flight, v, dt));
      // (Low over its back: clear of the counters along the top of the screen, and of the hints by its nose.)
      // (Each gate's a row lower than the one before, so two side by side never overlap.)
      v.at.set(flight.x, flight.kind === 'jet' ? 5.0 : 4.0, flight.z + 0.6 + Math.max(0, Object.keys(layout.gates).indexOf(flight.gate)) * 2.6);
      v.label.visible = flight.phase === 'parked';
      // (A plane off the top of the screen keeps its clock in sight, under the counters.)
      const row = Math.max(0, Object.keys(layout.gates).indexOf(flight.gate));
      v.label.minY = view.topInset + 62 + row * 44;
      if (v.label.visible) {
        const html = describe(flight);
        if (html !== v.shown) {
          v.shown = html;
          v.label.el.innerHTML = html;
          labels.remeasure(v.label);
        }
      }
      if (flight.late && !v.lateSaid) {
        v.lateSaid = true;
        state.stars = nextStars(state.stars, 'angry', TUNING.stars);
        floaters.show(`⏱ ${t('flightLate')}`, new Vector3(flight.x, 5.2, flight.z), 'star');
        sound.play('pop');
      }
    }
  };

  const pointer = new EdgePointer(root);
  const hand = new GuideHand(labels);
  /** Where the guide's hand points this frame (the play-test bot follows it). */
  let hint: GuideStep | null = null;
  const guide = (): GuideStep | null => {
    // Each job's hint stays until someone's hired to do it: the gates and clearance until the ramp dispatcher,
    // fuel and cases until the ground handler, the rest (the newcomer's tutorial) until the check-in agent.
    const parked = gates.map((g) => ({ gate: g, flight: airfield.parkedAt(g.key) })).filter((x): x is { gate: GateView; flight: Flight } => !!x.flight && !x.flight.cleared);
    if (!built('dispatcher')) {
      const ready = parked.find((x) => x.flight.ready);
      if (ready) return { at: ready.gate.spot.marshal, text: 'guideClear' };
      const closed = parked.find((x) => !x.flight.boarding && x.flight.waiting > 0);
      if (closed) return { at: podiumFront(closed.gate.spot), text: 'guideGate' };
    }
    // Enough for the next thing (as often as not the crew who'll take a chore off the hero's hands): that first.
    const next = pads.next;
    if (next && state.cash >= next.owed) return { at: next.at, text: 'guideBuild' };
    // Meals for a jet (until there's a catering runner): to the hatch for trays, then the galley.
    if (!built('caterer')) {
      const jet = parked.find((x) => x.flight.meals < x.flight.needsMeals);
      if (jet && jet.gate.spot.galley) {
        if (heroCarry.count('tray') > 0) return { at: jet.gate.spot.galley, text: 'guideGalley' };
        if (hatchTrays && hatchTrays.stack.length > 0) return { at: layout.kitchen.pick, text: 'guideTrays' };
      }
    }
    // A shop's line with nobody serving (until there are shop assistants): behind its counter.
    if (!built('shops')) {
      for (const id of ['cafe', 'dutyfree'] as const) {
        if (!built(id) || passengers.lineAt(id).length === 0 || insideRect(player.position, layout[id].zone)) continue;
        const zone = layout[id].zone;
        return { at: { x: (zone.minX + zone.maxX) / 2, z: (zone.minZ + zone.maxZ) / 2 }, text: id === 'cafe' ? 'guideCafe' : 'guideDutyFree' };
      }
    }
    if (!built('handler')) {
      const dry = parked.find((x) => x.flight.needsFuel && x.flight.fuel < 1 && !fueler);
      if (dry) return { at: dry.gate.spot.fuelSpot, text: 'guideFuelPlane' };
      const light = parked.find((x) => x.flight.cases < x.flight.needsCases);
      if (light) {
        const own = heroCarry.stack.some((item) => caseFits(item, light.gate.key));
        if (own) return { at: light.gate.spot.hold, text: 'guideHold' };
        // (Carrying another gate's cases: to that gate's hold first.)
        const other = parked.find((x) => x.flight.cases < x.flight.needsCases && heroCarry.stack.some((item) => caseFits(item, x.gate.key)));
        if (other) return { at: other.gate.spot.hold, text: 'guideHold' };
        if (beltCases.length > 0) return { at: layout.belt.side, text: 'guideBelt' };
      }
    }
    if (built(GUIDE_UNTIL)) return null;
    // The very first plane: wave it in.
    const inbound = gates.map((g) => ({ gate: g, flight: airfield.at(g.key) })).find((x) => x.flight?.phase === 'taxiIn');
    if (inbound && !state.flags.includes(clearedFlag) && passengers.line.length === 0) return { at: inbound.gate.spot.marshal, text: 'guideMarshal' };
    const pile = cash.fullestPile();
    const inPile = pile ? (state.piles[pile.id] ?? 0) : 0;
    // Cash that buys the next thing is worth leaving the desk for.
    if (pile && next && state.cash + inPile >= next.owed) return { at: pile.at, text: 'guideCash' };
    // The line at the desk (nothing to say while the hero's behind it).
    if (passengers.line.length > 0 && passengers.roomAnywhere && !agent) {
      if (insideRect(player.position, layout.desk.zone)) return null;
      return { at: { x: (layout.desk.zone.minX + layout.desk.zone.maxX) / 2, z: (layout.desk.zone.minZ + layout.desk.zone.maxZ) / 2 }, text: 'guideCheckin' };
    }
    return pile && inPile > 0 ? { at: pile.at, text: 'guideCash' } : null;
  };

  const meta = createMeta({
    root,
    state,
    saves,
    sound,
    traffic: null,
    pads,
    supplies: null,
    setBoost: (m) => (boost = m),
    town: 'airport',
    hero: { player, hud, stage, effects, decor, labels },
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
  // Rush jobs: once there's a check-in agent (before that a job would leave the line to give up), a short job for
  // the hero now and then: a suitcase left behind, someone running late for their gate, gulls on the apron.
  let gullsMade = 0;
  const jobs = createJobs({
    root,
    scene: stage.scene,
    labels,
    chips,
    state,
    layout,
    town: 'airport',
    pads,
    hero: { position: () => player.position, mesh: player.mesh, speed: () => player.topSpeed },
    effects,
    floaters,
    sound,
    makePerson: () => {
      if (!peopleReady) return null;
      const n = state.counts.jobs ?? 0;
      return new PersonAvatar(CHARACTERS.visitors[(n + 3) % CHARACTERS.visitors.length]!, 'case');
    },
    makeThing: (kind) => {
      if (kind === 'lostcase') return skyModel(`sp_case${(state.counts.jobs ?? 0) % 6}`);
      if (kind !== 'bird') return null;
      const gull = skyModel('sp_gull');
      gull.rotation.y = (gullsMade++ * 2.4) % (Math.PI * 2);
      return gull;
    },
    allowed: () => peopleReady && built(GUIDE_UNTIL),
    blocked: () => false,
    solids: () => [...solids, ...Object.values(layout.gates).flatMap(standSolids)],
    walkable: () => view.walkable,
    mentor: current.story.mentor,
    onPaid: (amount, at) => meta.onPaid({ amount, tip: 0, automated: false, at, bonus: true }),
    onDone: () => meta.count('jobs'),
    double: (pay) => meta.doubleJob(pay),
    save: () => void saves.saveNow(),
  });
  cleanups.push(() => jobs.dispose());
  const press = createPress(root, sound, () => meta.screenClosed());
  const empireMap = (): void => openEmpireMap({ root, state, sound, town: current, travel: (id) => travelTo(id) });
  const hero = createHero({ root, state, town: current, sound, press, flag, save: () => saves.saveNow(), onChipTap: empireMap });
  const storyline = createStoryline({ state, town: current, press, arrivals, flag });

  if (import.meta.env.DEV)
    Object.assign(window, {
      skyport: {
        airfield,
        passengers,
        gates,
        clear,
        layout,
        rig,
        views,
        solids,
        standSolids,
        route,
        crew: () => [agent, handler, dispatcher, fueler, runner, barista, clerk],
        terminal: () => ({ hatch: hatchTrays?.stack.length ?? 0, cafe: cafeTrays?.stack.length ?? 0, belt: [...beltCases], dark }),
        /** Jump the night-and-day clock (seconds since the runway lights went in). */
        setNightTime: (seconds: number) => {
          nightTime = seconds;
        },
      },
    });

  /** Who's near the hall's doors this frame (they slide open for anyone). */
  const doorNear: Point[] = [];
  /** Till the gulls on the apron call again. */
  let cawIn = 0;
  let rateTimer = 0;
  let stillFor = 0;
  let showShift = 0;
  let hallFullSaid = 0;
  const loop = new Loop((dt) => {
    clock.advance(dt);
    state.playSeconds += dt;
    const hulls = airfield.flights.map(hull).filter((r): r is Rect => !!r);
    player.update(dt, input.read(), [...solids, ...hulls, ...airfield.flights.flatMap(parkedSolids), ...decor.solids(), ...jobs.solids()], view.walkable);
    // A plane rolling onto its stand eases the hero out of its way.
    for (const rect of hulls) pushOut(player.mesh.position, TUNING.player.radius, rect);
    pads.update(dt, player.position);
    upgrades.update(dt, player.position);
    heroCarry.update(dt, player.isMoving);
    // Cases off the cart onto the hero's back.
    if (belt && beltCases.length > 0 && !heroCarry.full && heroCarry.timer <= 0 && insideRect(player.position, layout.belt.pick)) {
      heroCarry.push(beltCases.shift()!);
      heroCarry.timer = AIRPORT.bags.handSeconds;
      sound.play('pick');
    }
    showCart();
    wrongSaid -= dt;
    airfield.update(dt);
    for (const gate of gates) workGate(dt, gate);
    workHandler(dt);
    workDispatcher(dt);
    workFueler(dt);
    workRunner(dt);
    workKitchen(dt);
    agent?.avatar.update(dt);
    barista?.avatar.update(dt);
    clerk?.avatar.update(dt);
    passengers.update(dt, deskService(), boost, shopService);
    cafe?.update(dt);
    dutyFree?.update(dt);
    security?.update(dt, passengers.lineAt('security').length > 0);
    // Night and day, once the runway lights are in: the look, the lamps glowing, the lights on the field.
    if (built('lights')) nightTime += dt;
    dark = built('lights') ? nightAt(nightTime, AIRPORT.night) : 0;
    if (built('lights')) stage.setLook(mixLook(SKY_LOOK, NIGHT_LOOK, dark));
    nightGlow.value = dark;
    night.update(
      dt,
      dark,
      airfield.flights.filter((f) => f.phase === 'approach' || f.phase === 'rollout' || f.phase === 'takeoff' || (f.phase === 'climb' && f.y < 30) || f.phase === 'lineup').map((f) => ({ x: f.x + Math.sin(f.heading) * 3.2, y: f.y + 1.2, z: f.z + Math.cos(f.heading) * 3.2 })),
    );
    updateTaxis(dt);
    drawFlights(dt);
    // The hall's full and the line's stuck: say so, now and then.
    hallFullSaid -= dt;
    if (passengers.line.length >= 4 && !passengers.roomAnywhere && hallFullSaid <= 0) {
      hallFullSaid = 14;
      floaters.show(t('hallFull'), new Vector3(layout.desk.at.x, 3.6, layout.desk.at.z), 'star');
    }
    const streak = state.counts[streakKey] ?? 0;
    chips.set('streak', streak >= 2 ? `🔥 ${t('onTimeStreak', { n: streak })}` : null);
    windsock.update(dt);
    ambience.update(dt);
    belt?.update(dt, beltCases.length > 0 && airfield.flights.some((f) => f.phase === 'parked' && f.cases < f.needsCases));
    nameSign.update(dt);
    let drone = 0;
    for (const f of airfield.flights) drone = Math.max(drone, f.engines * hearing(f) * (f.y > 25 ? 0.5 : 1));
    sound.loop('engines', drone);
    cawIn -= dt;
    const birds = jobs.board.active?.def.id === 'birds' ? jobs.board.active : null;
    if (birds && cawIn <= 0) {
      cawIn = 1.6 + Math.random() * 2.2;
      sound.play('caw', hearing(birds.from) * 0.8);
    }
    scenery.update(dt, airfield.flights);
    doorNear.length = 0;
    doorNear.push(player.position);
    for (const p of passengers.all) doorNear.push(p);
    hall.update(dt, doorNear);
    if (cash.update(player.position)) flag('collected');
    floaters.update(dt);
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
    decor.update(dt);
    saves.update(dt);
    meta.update(dt);
    storyline.update(dt);
    hero.update(dt);
    press.update(dt);
    town.update(dt, player.position);
    // Standing still out on the apron while a plane lands or takes off, the camera eases back to show it.
    stillFor = player.isMoving ? 0 : stillFor + dt;
    const flying = airfield.flights.some((f) => (f.phase === 'approach' && f.approach > 0.3) || f.phase === 'rollout' || f.phase === 'takeoff' || (f.phase === 'climb' && f.y < 24));
    const watching = flying && stillFor > SHOW_AFTER_SECONDS && player.position.z < layout.hall.minZ + 2;
    const wide = stage.size.width > stage.size.height * 1.2;
    rig.setZoom(AIRPORT.zoom * (watching ? (wide ? SHOW_ZOOM.wide : SHOW_ZOOM.tall) : 1));
    showShift += ((watching ? 1 : 0) - showShift) * (1 - Math.exp(-dt * 1.8));
    const focusZ = player.position.z + (layout.runway.z + 8 - player.position.z) * (wide ? 0.42 : 0.22) * showShift;
    view.update(dt, { x: player.position.x, z: focusZ });
    jobs.update(dt, stage.camera, stage.size.width, stage.size.height, { top: view.topInset, right: SIDE_BAR_PX });
    player.scrubbing = jobs.working;
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
    staff: null,
    jobs,
    bot: {
      get hint() {
        return hint;
      },
      pads,
      upgrades,
      cash,
      carrying: () => heroCarry.stack.length,
      solids: () => [...solids, ...Object.values(layout.gates).flatMap(standSolids)],
    },
    welcomeBack: (earned) => meta.welcomeBack(earned),
    get frameMs() {
      return loop.busyMs;
    },
    get frameErrors() {
      return { count: loop.errors, last: loop.lastError };
    },
    renderOnce() {
      drawFlights(0);
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
      sound.stopLoops();
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
