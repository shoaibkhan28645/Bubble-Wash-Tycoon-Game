// An airport (Chapter 4, Skyport International): planes land, are turned round at their gates and leave
// full, on time. Passengers come by taxi and buy their tickets at the check-in desk (the hero sells them,
// later the check-in agent), wait by their gate and board when it's opened. A plane parks with a clock
// over it: open its gate, fill its tanks and load its cases (once those are bought), then step onto the
// ramp pad in front of its nose to clear it for take-off (as the ring closes, for a perfect one). Every
// seat pays its fare, more for a full plane and for one that beats its clock, and each on-time flight in
// a row pays a little more than the last.
// The shared pieces (the player, pads, cash piles, upgrades, the camera, the side bar, the hero's career
// and the town's story) are the same as in the other towns.
import { Mesh, Object3D, Plane, Vector3, type Material } from 'three';
import { Loop } from './loop';
import { GameClock } from './clock';
import { CHARACTERS, TUNING, UPGRADES, type GateSpot, type Point, type Rect } from './config';
import type { Game } from './game';
import type { GameState } from './gameState';
import type { Lifecycle } from './lifecycle';
import type { SaveManager } from './save';
import { townIds, type AirportTown } from './towns';
import { createMeta } from './meta';
import { createTown } from './town';
import { createPress } from './press';
import { createHero } from './hero';
import { createJobs } from './jobs';
import { createStoryline } from './storyline';
import { LotView, SIDE_BAR_PX } from './view';
import * as platform from '../platform/youtube';
import type { SoundManager } from '../audio/sound';
import { mixLook, type Look, type Stage } from '../render/stage';
import { withShadows } from '../render/stage';
import { CameraRig } from '../render/cameraRig';
import { Particles } from '../render/effects/particles';
import { Ambience, airfield as airfieldGround, queenStand, roomFloor, secondRunway, wingFloor } from '../render/airfield';
import { ConstructionSites } from '../render/models/site';
import { AirportNight } from '../render/airportNight';
import { nightGlow } from '../render/models/build';
import { loadPeople } from '../render/assets';
import { blobShadows } from '../render/models/actors';
import {
  AIRLINE_PAINT,
  BagSorter,
  BeltLoader,
  ControlTower,
  GOLDSBY,
  MogulOffice,
  crewHouseModel,
  RedCarpet,
  RoadVehicle,
  WIDE,
  busStop,
  pierModel,
  roomWalls,
  stairTruck,
  vipModel,
  BaggageBelt,
  Cafe,
  CargoShed,
  HangarModel,
  JetWash,
  KLoader,
  TowerCrane,
  queenGantry,
  JET,
  CateringTruck,
  DutyFree,
  FuelTruck,
  GATE_COLOURS,
  JetBridge,
  Kitchen,
  PLANES,
  SecurityLane,
  securityLaneSolids,
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
import { Airfield, flightPay, planeAt, podiumFront, ringAt, type Flight, type PlaneKind } from '../systems/airport';
import { Airline } from '../systems/airline';
import { formatClock, secondsLeft, takeFinished } from '../systems/construction';
import { Fog, Tower } from '../systems/tower';
import { Celebrity, WISHES, type Wish } from '../systems/vip';
import { brandColours } from '../render/brand';
import { showRoutes, showTower, type RoutesView } from '../ui/airportPanels';
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
import { ease, eastLimit, mayTurn, swingOut, westLimit, type Lane, type RoadUser } from '../systems/road';
import type { Paid } from '../systems/till';
import { UpgradePads } from '../systems/upgrades';
import { Floaters } from '../ui/carBubbles';
import { EdgePointer } from '../ui/edgePointer';
import { EventChips } from '../ui/eventChips';
import { showEndScreen } from '../ui/endScreen';
import { openEmpireMap } from '../ui/empireMap';
import { Hud } from '../ui/hud';
import { rich } from '../ui/icons';
import { t, type StringKey } from '../ui/strings';
import { UpgradePanel } from '../ui/upgradePanel';
import { WorldLabels, type Box, type Label } from '../ui/worldLabels';

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
const SHOW_ZOOM = { tall: 1.55, wide: 2.25 };
const SHOW_AFTER_SECONDS = 0.6;
/** Sounds are full within this far of the hero (metres) and die away over the next stretch. */
const HEAR_NEAR = 16;
const HEAR_FADE = 60;
/** How far ahead of a jet's back door its catering truck stands (m): its box clear of the tailplane, still at the door. */
const CATERING_FORWARD = 0.6;
/** How long a catering truck takes to drive up to a jet's door, or back out past its wingtip (s). */
const CATERING_DRIVE_SECONDS = 2.2;
/** Where the baggage tug's parked, out of everyone's way at the east end of the service road. */
const TUG_AT = { x: -1.55, z: 8.6 };
/** What the ramp dispatcher's doing. */
type DispatchJob = 'idle' | 'toGate' | 'toPad' | 'home';
/** The ramp dispatcher waits this long before stepping in (seconds): the hero's chance to do it. */
const DISPATCH_WAIT = 1.6;
/** The service road the dispatcher walks along, between the stands and the hall (z). */
const DISPATCH_ROAD_Z = 9.0;
/** Where taxis come from and go to along the road (x, off the screen either side: past the Sky Queen's plaza to
 * the east, past the jet wash to the west). */
const TAXI_FROM = 124;
const TAXI_TO = -126;
/** The crew's walking speed (m/s), and how much slower than the hero the agent checks in. */
const CREW_SPEED = 3.3;
const AGENT_RATE = 0.85;

/** A bright day's flying: blue sky, white light, long views. */
/** After the land for the next town is bought, the hero sets off this long after (the pad's pop first). */
const TRAVEL_DELAY_MS = 1500;

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

/**
 * Night over the airfield (Part B, once the runway lights are in): a deep blue for the runway's lights, the
 * lamps and the terminal's windows to shine against, but (like the park's evenings) never so dark the hero
 * is hard to see.
 */
const NIGHT_LOOK: Look = {
  sky: 0x132150,
  fogNear: 70,
  fogFar: 200,
  skyLight: 0x7a8ee0,
  groundLight: 0x33356f,
  ambient: 0.86,
  sun: 0x9fb0f5,
  sunStrength: 0.55,
};
/** Fog (Part C, once there's a tower): a pale, close sky the runway fades into. */
const FOG_LOOK: Look = {
  sky: 0xdfe6ec,
  fogNear: 8,
  fogFar: 58,
  skyLight: 0xeef2f5,
  groundLight: 0xa7b2bc,
  ambient: 1.0,
  sun: 0xe4e9ee,
  sunStrength: 0.3,
};
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
  /** Its speed, and how far it's swung out to pass the limousine's bay (0–1). */
  v: number;
  swing: number;
}

/** Half the length of the taxis, the shuttle bus and the limousine (with room to spare), as they keep their distance on the road. */
const TAXI_HALF = 1.6;
const BUS_HALF = 4.2;
const LIMO_HALF = 3.3;
/** How far a car swings out to pass the limousine's bay. */
const SWING = 1.0;
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
  /** The belt loader at its hold, once there's a bag sorter. */
  loader: BeltLoader | null;
  catering: CateringTruck | null;
  /**
   * Where the catering truck serves the jet's back door, where it waits clear of the wing (out past the wingtip:
   * it's only there while the jet's parked), and how far it is between them (0 away and gone, 1 at the door).
   */
  cateringRun: { door: Point; away: Point; run: number } | null;
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
  // (Out on the grass past the apron's west end, back from the taxiway: clear of the wingtips of a plane holding there.)
  const windsockAt = { x: layout.links.entry - 8, z: layout.taxiway.z + layout.taxiway.half + 11 };
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
  /** A gate's colour of case (Gate 1 pink, 2 blue, 3 green, 4 orange, in order). */
  const caseFor = (gate: string): CaseItem => (['case1', 'case2', 'case3', 'case4'] as const)[Math.max(0, Object.keys(layout.gates).indexOf(gate)) % 4]!;
  /** Whether a case goes into `gate`'s hold: its own colour, or the golden one (any hold takes it). */
  const caseFits = (item: CarryItem, gate: string): boolean => item === caseFor(gate) || item === 'caseGold';
  const isCase = (item: CarryItem): item is CaseItem => item === 'case1' || item === 'case2' || item === 'case3' || item === 'case4' || item === 'caseGold';
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
  /** What's solid of a plane standing with its middle at (x, mid), nose to +z: its fuselage, then its wheels (and its propellers, or the engines under its wing) either side. */
  const planeSolids = (kind: PlaneKind, x: number, mid: number): Rect[] => {
    const solid = PLANES[kind].solid;
    const body = { minX: x - solid.half, maxX: x + solid.half, minZ: mid + solid.tail, maxZ: mid + solid.nose };
    return [body, ...solid.parts.flatMap((q) => [-1, 1].map((side) => around({ x: x + side * q.x, z: mid + q.z }, q.hx, q.hz)))];
  };
  const standSolids = (spot: { x: number; noseZ: number; plane?: PlaneKind }): Rect[] => planeSolids(planeAt(spot), spot.x, spot.noseZ - PLANES[planeAt(spot)].size.length / 2);
  const NAV_AREA: Rect = { ...layout.walk, maxZ: layout.roadZ - 2 };
  let nav: NavGrid | null = null;
  const solidsChanged = (): void => void (nav = null);
  const route = (from: Point, to: Point): Point[] => {
    nav ??= new NavGrid(NAV_AREA, [...solids, ...[...Object.values(layout.gates), ...Object.values(layout.stands)].flatMap(standSolids)], 0.3);
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
  const airfield = new Airfield(layout, AIRPORT, GOLDSBY, {
    onTouchdown: (flight) => {
      // A puff of smoke off each main wheel.
      for (const side of [-1.9, 1.9]) effects.puff(new Vector3(flight.x - 0.5, 0.3, flight.z + side), new Vector3(-1, 0, 0), 5);
      sound.play('whoosh', hearing(flight) * 0.7);
      sound.play('screech', hearing(flight));
    },
    onParked: (flight) => {
      // (Mogul Air's own plane and the private jets have their own business on their stands.)
      if (!layout.gates[flight.gate]) {
        standParked(flight);
        return;
      }
      flight.needsFuel = built('fuel');
      // (A jet has twice the passengers, and their cases; a wide-body three times; the tower's card more or fewer.)
      const big = flight.kind === 'wide';
      flight.needsCases = built('bags') ? Math.round(AIRPORT.bags.cases * (flight.kind === 'jet' ? 2 : big ? AIRPORT.wide.cases : 1) * (flight.card?.cases ?? 1)) : 0;
      flight.needsMeals = (flight.kind === 'jet' || big) && built('kitchen') ? Math.round(AIRPORT.meals.trays * (big ? AIRPORT.wide.meals : 1)) : 0;
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
      // Mogul Air's off on its route (from its own stand, or from the hangar): away for the route's time.
      const k = planeOf(flight.gate);
      if (k !== null && airline.routeOf(k)) {
        airline.depart(1 / mogulTime(), k);
        state.supplies[tripKey(k)] = 1;
        paintBoard();
      }
      if (flight.gate === 'hangar') hangarJob = null;
      // The Sky Queen's off on a world tour: away for its time, her takings when she's home.
      if (flight.gate === 'skyqueen') {
        state.supplies['queen.away'] = queenTour();
        state.supplies['queen.trip'] = 1;
      }
      if (wash?.flight === flight) wash = null;
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
      const pay = Math.round(AIRPORT.passengers.ticket * levelFactor(UPGRADES.kinds.price, level('checkin.price')) * queenBonus());
      const tip = tipFor(pay, p.patience / p.patienceMax, TUNING.customers);
      cash.add('checkin', pay + tip);
      const at = layout.piles.checkin ?? layout.desk.at;
      // (Checked in at the shuttle station: the ticket shows where they got off.)
      const where = Math.hypot(p.x - at.x, p.z - at.z) > 6 ? { x: p.x, z: p.z } : at;
      floaters.show(`+${money(pay)}`, new Vector3(where.x, 1.2, where.z), 'cash');
      if (tip > 0) floaters.show(`+${money(tip)} tip`, new Vector3(where.x + 0.6, 1.9, where.z), 'tip');
      state.stars = nextStars(state.stars, tip > 0 ? 'happy' : 'okay', TUNING.stars);
      if (p.manual) flag(servedFlag);
      sound.play('ching');
      onPaid({ amount: pay + tip, tip, automated: !p.manual, at });
    },
    onServed: (p, id, manual) => {
      if (id === 'security' || id === 'pierSecurity') {
        const lane = id === 'security' ? security : pierLane;
        lane?.passed();
        sound.play('scan', hearing(id === 'security' ? layout.security.arch : (layout.pierSecurity?.arch ?? layout.security.arch)));
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
  passengers.screened = (gate) => (!!layout.gates[gate]?.bridge && built('gate3')) || (gate === 'gate4' && built('gate4'));
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
  /** Part C's crew: the tower controller (brings in the best-paying flight nobody's chosen), the marshal. */
  let controller: CrewMember | null = null;
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
    if (id === 'controller' && !controller) {
      const avatar = new PersonAvatar(CHARACTERS.staff.controller);
      stage.scene.add(avatar.root);
      controller = new CrewMember(avatar, layout.staffSpots.controller ?? layout.tower.door);
      avatar.root.rotation.y = 0;
    }
    if (id === 'marshal' && !marshal) {
      const avatar = new PersonAvatar(CHARACTERS.staff.marshal);
      stage.scene.add(avatar.root);
      marshal = Object.assign(new CrewMember(avatar, layout.staffSpots.marshal ?? layout.belt.at), { gate: null as string | null });
    }
    // Part D's: the cargo crew (crates from the dock to the freighter's loader), the mechanic (services the
    // planes in the hangar), the airport manager (rounds of the whole airport with a clipboard).
    if (id === 'cargocrew' && !cargoCrew) {
      const avatar = new PersonAvatar(CHARACTERS.staff.cargocrew);
      stage.scene.add(avatar.root);
      const member = new CrewMember(avatar, layout.staffSpots.cargocrew ?? layout.cargo?.dock ?? layout.belt.at);
      cargoCrew = Object.assign(member, {
        carrier: new Carrier<CarryItem>(avatar.root, () => ({ x: member.x, z: member.z }), () => AIRPORT.cargo.carry + levelStep(UPGRADES.kinds.staffCarry, level('cargocrew.staffCarry'))),
        job: 'idle' as const,
        wait: 0,
      });
    }
    if (id === 'engineer' && !engineer) {
      const avatar = new PersonAvatar(CHARACTERS.staff.engineer, 'wrench');
      stage.scene.add(avatar.root);
      engineer = Object.assign(new CrewMember(avatar, layout.staffSpots.engineer ?? layout.hangar?.service ?? layout.belt.at), { job: 'idle' as const });
    }
    if (id === 'manager' && !manager && layout.managerWalk?.length) {
      const avatar = new PersonAvatar(CHARACTERS.staff.manager, 'clipboard');
      avatar.holding = true;
      stage.scene.add(avatar.root);
      manager = Object.assign(new CrewMember(avatar, layout.staffSpots.manager ?? layout.managerWalk[0]!), { leg: 0, pause: 1 });
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
    if (built(key) || spot.bridge || spot.door.x > layout.hall.maxX || current.pads.find((p) => p.id === key)?.cost === 0) continue;
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
    let cateringRun: GateView['cateringRun'] = null;
    /** The catering truck at a jet's back door (a little ahead of it, clear of the tailplane), coming and going from past its wingtip. */
    const addCatering = (kind: 'jet' | 'wide', back: number): void => {
      const size = PLANES[kind].size;
      const mid = spot.noseZ - size.length / 2;
      const side = spot.x + size.radius + 0.03;
      const door = { x: side + 3.55, z: mid - back + CATERING_FORWARD };
      const away = { x: door.x + spot.x + size.span / 2 + 0.5 - side, z: door.z };
      catering = new CateringTruck();
      catering.root.position.set(away.x, 0, away.z);
      catering.root.rotation.y = Math.PI / 2;
      stage.scene.add(withShadows(catering.root));
      catering.fade(0);
      cateringRun = { door, away, run: 0 };
    };
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
        addCatering('jet', 4.74);
        galleyPad = spotPad(spot.galley, 1.5, 0xffb02e);
      }
    } else if (planeAt(spot) === 'wide') {
      // The wide-body's stair truck at its door; the catering truck at its back door, as a jet's.
      const steps = show(stairTruck(), animate);
      steps.position.set(spot.planeDoor.x, 0, spot.planeDoor.z);
      solids.push({ minX: spot.planeDoor.x + 0.1, maxX: spot.stairsFoot.x - 0.35, minZ: spot.stairsFoot.z - 1.1, maxZ: spot.stairsFoot.z + 1.1 });
      if (spot.galley) {
        addCatering('wide', 4.74 * (WIDE.length / JET.length));
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
    // (Kept clear of the planes' labels.)
    doorLabel.avoid = true;
    const kind = planeAt(spot);
    const kit = standKit(kind);
    // (A wide-body's chips sit higher over it.)
    kit.position.set(spot.x, 0, spot.noseZ - PLANES[kind].size.length / 2);
    kit.visible = false;
    stage.scene.add(kit);
    // (Each gate's hold pad in its cases' colour.)
    const colour = parseInt(GATE_COLOURS[Math.max(0, Object.keys(layout.gates).indexOf(key)) % GATE_COLOURS.length]!.slice(1), 16);
    const gate: GateView = { key, spot, pad, ring, fuelPad: spotPad(spot.fuelSpot, 1.5, 0xff8a3d), holdPad: spotPad(spot.hold, 1.5, colour), doorLabel, truck: null, hose: null, kit, bridge, loader: null, catering, cateringRun, galleyPad, onPad: false, stood: 0 };
    if (built('sorter')) addLoader(gate, animate);
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
  /** Gate 4's own security lane, at the pier's door from the plaza (once the pier's built). */
  let pierLane: SecurityLane | null = null;
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
    solids.push(...securityLaneSolids(arch));
    night.setTerminal(terminalRooms());
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
  // ---- Part C: the tower and VIP side --------------------------------------------------------------------------
  // Mogul Air flies in the player's brand colour (the vans' and the tanker's), else its own purple.
  const mogulColour = brandColours()?.vehicle ?? AIRLINE_PAINT;
  const mogulLivery = { accent: mogulColour, accent2: '#ffffff' };
  const airline = new Airline(AIRPORT.airline, state.supplies, Math.random, AIRPORT.hangar);
  const towerQueue = new Tower(AIRPORT.tower, GOLDSBY);
  const fog = new Fog(AIRPORT.fog);
  let towerModel: ControlTower | null = null;
  let towerPanel: { close: () => void } | null = null;
  // The next flight in comes on the tower's card (the controller's pick if nobody's chosen); Goldsby Air flies the hops.
  // (Only the gates': the stands' planes come on business of their own.)
  airfield.terms = (gate) => {
    if (!built('tower') || !layout.gates[gate]) return null;
    const card = towerQueue.take(!!controller);
    return { kind: card.kind, fare: card.fare, cases: card.cases, clock: card.clock, livery: card.kind === 'hopper' ? GOLDSBY : card.livery };
  };
  const buildTower = (animate: boolean): void => {
    if (towerModel) return;
    towerModel = new ControlTower();
    towerModel.root.position.set(layout.tower.at.x, 0, layout.tower.at.z);
    show(towerModel.root, animate);
    solids.push(around(layout.tower.at, 2.6, 2.6));
  };
  const openTower = (): void => {
    towerPanel?.close();
    towerPanel = showTower(
      root,
      () => ({ cards: towerQueue.cards, chosen: towerQueue.chosen, fare: (c) => c.fare, city: (c) => AIRPORT.tower.cities[c.from] ?? '' }),
      (i) => {
        towerQueue.choose(i);
        sound.play('click');
      },
    );
  };

  // The shuttle: a bus from the east along the road into its bay at the stop (the taxis swing out past it), a
  // busload off, a turn round across the road, back east.
  let bus: RoadVehicle | null = null;
  const shuttle = { state: 'away' as 'away' | 'in' | 'stop' | 'turn' | 'out', x: TAXI_FROM, z: 0, riders: 0, timer: 0, wait: 4, turn: 0, swing: 0, v: 0 };
  // The road's two lanes (westbound by the kerb, eastbound beyond), and the limousine's bay at the kerb.
  const laneZ = layout.roadZ - 1.7;
  const farZ = laneZ + 3.4;
  const bayZ = laneZ - 1.2;
  const busBayZ = laneZ - 1.3;
  let shuttleWas = TAXI_FROM;
  const maxPassengers = (): number => AIRPORT.passengers.max + (built('shuttle') ? AIRPORT.shuttle.extra : 0);
  const buildShuttle = (animate: boolean): void => {
    if (bus) return;
    const stop = busStop();
    stop.position.set(layout.shuttle.stop.x, 0, layout.shuttle.stop.z);
    show(stop, animate);
    solids.push(around(layout.shuttle.stop, 2.45, 1.0));
    bus = new RoadVehicle('sp_shuttle', 0.5);
    bus.root.rotation.y = -Math.PI / 2;
    bus.root.visible = false;
    stage.scene.add(withShadows(bus.root));
  };
  const updateShuttle = (dt: number): void => {
    if (!bus) return;
    const s = shuttle;
    const kerb = layout.shuttle.kerb.x;
    // (How fast it went last step, for whatever's turning round ahead of it.)
    s.v = dt > 0 ? Math.abs(s.x - shuttleWas) / dt : 0;
    shuttleWas = s.x;
    if (s.state === 'away') {
      s.wait -= dt * boost;
      if (s.wait <= 0 && peopleReady && passengers.all.length + AIRPORT.shuttle.riders <= maxPassengers()) {
        s.state = 'in';
        s.x = TAXI_FROM;
        s.z = laneZ;
        s.swing = 0;
        s.riders = AIRPORT.shuttle.riders;
        bus.root.visible = true;
        bus.root.rotation.y = -Math.PI / 2;
      }
    } else if (s.state === 'in') {
      // In along the near lane (behind whatever's ahead, swinging out past the limousine), then into the bay.
      const self: RoadUser = { x: s.x, half: BUS_HALF, lane: 'west' };
      const others = roadUsers(shuttle);
      const left = s.x - Math.max(kerb, westLimit(others, self));
      if (left > 0.02) s.x -= Math.min(left, dt * Math.max(2.2, Math.min(13, left * 1.4)));
      s.swing += (swingOut(others, self) - s.swing) * (1 - Math.exp(-dt * 3));
      const into = Math.min(1, Math.max(0, 1 - (s.x - kerb) / 11));
      s.z = laneZ + SWING * s.swing * (1 - into) + (busBayZ - laneZ) * into * into * (3 - 2 * into);
      bus.root.rotation.y = -Math.PI / 2 - Math.sin(Math.PI * into) * 0.1;
      if (s.x - kerb < 0.05) {
        s.state = 'stop';
        s.timer = 0.9;
        bus.root.rotation.y = -Math.PI / 2;
        sound.play('honk', hearing({ x: kerb, z: laneZ }) * 0.5);
        floaters.show(`🚌 ${t('shuttleIn')}`, new Vector3(kerb, 3.6, busBayZ), 'star');
      }
    } else if (s.state === 'stop') {
      s.timer -= dt;
      if (s.timer <= 0) {
        // (They checked in at the station: straight on to security, as there's room in its line.)
        if (s.riders > 0 && passengers.arrive({ x: kerb - 1.6 + (s.riders % 4) * 0.8, z: busBayZ - 1.5 }, unlockedSum(state, (e) => e.patienceBonus))) {
          s.riders -= 1;
          s.timer = 0.6;
        } else if ((s.riders === 0 || s.timer < -25) && mayTurn(roadUsers(shuttle), { x: s.x, half: BUS_HALF + 2, lane: 'bay' })) {
          // (Everyone off, or no seat left for a good while: the rest ride round again. It turns round when
          // nothing's coming past.)
          s.riders = 0;
          s.state = 'turn';
          s.turn = 0;
        }
      }
    } else if (s.state === 'turn') {
      // A U-turn out of the bay across the road onto the far lane, heading back east.
      const r = (farZ - busBayZ) / 2;
      s.turn = Math.min(Math.PI, s.turn + dt * 1.0);
      s.x = kerb - r * Math.sin(s.turn);
      s.z = busBayZ + r * (1 - Math.cos(s.turn));
      bus.root.rotation.y = -Math.PI / 2 + s.turn;
      if (s.turn >= Math.PI) s.state = 'out';
    } else {
      const room = eastLimit(roadUsers(shuttle), { x: s.x, half: BUS_HALF, lane: 'east' }) - s.x;
      if (room > 0) s.x += Math.min(room, dt * Math.min(14, 3 + (s.x - kerb) * 2));
      s.z = farZ;
      bus.root.rotation.y = Math.PI / 2;
      if (s.x > TAXI_FROM) {
        s.state = 'away';
        bus.root.visible = false;
        s.wait = AIRPORT.shuttle.every;
      }
    }
    bus.root.position.set(s.x, 0, s.z);
    bus.update(dt, s.state === 'stop');
  };

  // Mogul Air: the office (its routes board, its shelf of souvenirs), the planes' own stands (Part D: a second
  // plane, and the hangar a worn one comes home to).
  let office: MogulOffice | null = null;
  let boardPad: PadModel | null = null;
  let boardOn = false;
  let routesPanel: { close: () => void } | null = null;
  /** Each plane's own stand. */
  const MOGUL_STANDS = ['mogul', 'mogul2'] as const;
  /** Seconds each plane's stood at home since it landed (left alone a while, it flies its last route again). */
  const mogulHome = [0, 0];
  /** The number that says plane `k`'s out on a trip (its takings are paid once it's home). */
  const tripKey = (k: number): string => (k ? 'air.trip.2' : 'air.trip');
  /** Mogul Air's plane in (or on its way to) the hangar, and how far its service has got (1: done). */
  let hangarJob: { k: number; progress: number } | null = null;
  let hangarModel: HangarModel | null = null;
  let fleet = false;
  /** Which of Mogul Air's planes a stand's plane is (null: not one of them). */
  const planeOf = (gate: string): number | null => (gate === 'mogul' ? 0 : gate === 'mogul2' ? 1 : gate === 'hangar' ? (hangarJob?.k ?? null) : null);
  const fleetSize = (): number => (!office ? 0 : fleet ? 2 : 1);
  /** Plane `k` while it's home: on its own stand, or in the hangar. */
  const homeFlight = (k: number): Flight | null => airfield.parkedAt(MOGUL_STANDS[k]!) ?? (hangarJob?.k === k ? airfield.parkedAt('hangar') : null);
  /** Whether plane `k`'s home and can be sent off (serviced first, if it's in the hangar). */
  const canSend = (k: number): boolean => {
    const plane = homeFlight(k);
    return !!plane && !plane.cleared && !(plane.gate === 'hangar' && (hangarJob?.progress ?? 0) < 1);
  };
  /** The first of the planes that's home and can be sent off, if any is. */
  const readyPlane = (): number | null => {
    for (let k = 0; k < fleetSize(); k++) if (canSend(k)) return k;
    return null;
  };
  /** Plane `k`'s on its way home: to the hangar if it's worn and the hangar's free, else to its own stand. */
  const comeHome = (k: number): void => {
    if (hangarModel && airline.worn(k) && !hangarJob && !airfield.at('hangar') && !airfield.calling('hangar')) {
      hangarJob = { k, progress: 0 };
      airfield.call('hangar');
    } else airfield.call(MOGUL_STANDS[k]!);
  };
  const mogulPay = (): number => levelFactor(UPGRADES.kinds.price, level('mogul.price')) * payBonus();
  const mogulTime = (): number => levelFactor(UPGRADES.kinds.speed, level('mogul.speed'));
  const cityName = (id: string): string => t(`city_${id}` as StringKey);
  const paintBoard = (): void => {
    const away = [0, 1].find((k) => k < Math.max(1, fleetSize()) && airline.awayOf(k) > 0 && !!airline.routeOf(k));
    const flying = away !== undefined ? AIRPORT.airline.cities.indexOf(airline.routeOf(away)!) : null;
    office?.paintBoard(AIRPORT.airline.cities, (i) => airline.opened(AIRPORT.airline.cities[i]!.id), flying, mogulColour);
  };
  const buildMogul = (animate: boolean): void => {
    if (office) return;
    const r = layout.mogul.office;
    office = new MogulOffice(mogulColour);
    office.root.position.set((r.minX + r.maxX) / 2, 0, (r.minZ + r.maxZ) / 2);
    show(office.root, animate);
    solids.push({ minX: r.minX + 0.1, maxX: r.maxX - 0.1, minZ: r.minZ + 0.1, maxZ: r.maxZ - 0.1 });
    // Its crew's house beside it, in the airline's colour.
    const crew = layout.landside?.crewHouse;
    if (crew) {
      const house = crewHouseModel(mogulColour);
      house.position.set(crew.x, 0, crew.z);
      show(house, animate);
      solids.push(footprint('sp_crewhouse', crew.x, crew.z, 0, 0.05));
    }
    solidsChanged();
    AIRPORT.airline.cities.forEach((c, i) => {
      if (airline.hasSouvenir(c.id)) office!.showSouvenir(i);
    });
    paintBoard();
    boardPad = spotPad(layout.mogul.board, 1.8, 0x8a4fd8);
    boardPad.group.visible = true;
    const stand = layout.stands.mogul!;
    airfield.openGate('mogul', 0, true);
    night.addStand({ x: stand.x, z: stand.noseZ - 4.5 });
    // At home (or brand new): it comes in to its stand. Away: it's back when its trip's done.
    if (airline.awayOf(0) <= 0) comeHome(0);
  };
  /** (Part D) Mogul Air's second plane, on its own stand east of the tower. */
  const buildFleet = (): void => {
    const stand = layout.stands.mogul2;
    if (fleet || !office || !stand) return;
    fleet = true;
    airfield.openGate('mogul2', 0, true);
    night.addStand({ x: stand.x, z: stand.noseZ - 4.5 });
    if (airline.awayOf(1) <= 0) comeHome(1);
  };
  /** Sends plane `k` (the first that's home, unless said) to a city. */
  const flyRoute = (id: string, k: number | null = readyPlane()): void => {
    const which = k ?? 0;
    const city = airline.choose(id, which);
    if (!city) return;
    const plane = homeFlight(which);
    if (plane && canSend(which)) {
      plane.cleared = true;
      floaters.show(`${city.icon} ${t('mogulOff', { city: cityName(id) })}`, new Vector3(plane.x, 5, plane.z + 1.5), 'star');
      sound.play('chime');
    }
    paintBoard();
    void saves.saveNow();
  };
  const openRoutes = (): void => {
    routesPanel?.close();
    /** Where plane `k` is: away, leaving, coming in, in for its service, or home to be sent off. */
    const statusOf = (k: number): string => {
      const plane = homeFlight(k);
      const route = airline.routeOf(k);
      const away = airline.awayOf(k);
      if (away > 0 && route) return t('routeAway', { city: cityName(route.id), time: formatClock(away) });
      if (plane?.cleared && route) return t('routeLeaving', { city: cityName(route.id) });
      if (!plane) return t('routeComing');
      if (!canSend(k)) return `🔧 ${t('hangarChip')}`;
      return route ? t('routeHome', { city: cityName(route.id) }) : t('routeFirst');
    };
    routesPanel = showRoutes(
      root,
      (): RoutesView => ({
        cities: AIRPORT.airline.cities,
        opened: (id) => airline.opened(id),
        souvenir: (id) => airline.hasSouvenir(id),
        unlocked: (tier) => airline.unlocked(tier),
        needed: (tier) => Math.max(0, AIRPORT.airline.unlock - AIRPORT.airline.cities.filter((c) => c.tier === tier - 1 && airline.opened(c.id)).length),
        takings: (c) => c.takings * mogulPay(),
        seconds: (c) => c.seconds * mogulTime(),
        status: fleetSize() > 1 ? [0, 1].map((k) => `${t('mogulPlane', { n: k + 1 })}: ${statusOf(k)}`).join('\n') : statusOf(0),
        canFly: readyPlane() !== null,
        bonus: airline.fareBonus,
      }),
      (id) => flyRoute(id),
    );
  };
  /** Plane `k` home from a trip: the takings on the pile by the office, the city opened, maybe a souvenir for the shelf. */
  const homecoming = (k: number, flight: Flight): void => {
    const fresh = airline.wears && airline.freshOf(k) > 0;
    const back = airline.homecoming(mogulPay(), k);
    if (!back) return;
    const at = layout.piles.mogul ?? layout.mogul.pile;
    cash.add('mogul', back.takings);
    floaters.show(`+${money(back.takings)} ✈️`, new Vector3(at.x, 1.2, at.z), 'cash');
    const top = new Vector3(flight.x, 5.2, flight.z + 1.5);
    floaters.show(`${back.city.icon} ${t(back.first ? 'newCity' : 'mogulHome', { city: cityName(back.city.id) })}`, top, 'star');
    // (Fresh from the hangar it brings home more; worn, it wants servicing.)
    if (fresh) floaters.show(`✨ ${t('hangarFresh', { n: Math.round(AIRPORT.hangar.freshBonus * 100) })}`, new Vector3(top.x, top.y + 1.8, top.z), 'tip');
    else if (back.worn && flight.gate !== 'hangar') floaters.show(`🔧 ${t('hangarWorn')}`, new Vector3(top.x, top.y + 1.8, top.z), 'star');
    if (back.souvenir) {
      office?.showSouvenir(AIRPORT.airline.cities.indexOf(back.city));
      floaters.show(`🎁 ${t('souvenirNew', { name: t(`souv_${back.city.id}` as StringKey) })}`, new Vector3(top.x, top.y + 1, top.z), 'tip');
      effects.burst('sparkle', new Vector3(at.x, 1.4, at.z), 18, 3.5, 1);
      sound.play('reward');
    }
    state.counts.destinations = airline.openedCount;
    state.counts.souvenirs = airline.souvenirCount;
    meta.count('routes');
    onPaid({ amount: back.takings, tip: 0, automated: true, at });
    paintBoard();
    void saves.saveNow();
  };
  const workMogul = (dt: number): void => {
    if (!office) return;
    for (let k = 0; k < fleetSize(); k++) {
      if (airline.update(dt * boost, k)) comeHome(k);
      if (!canSend(k)) continue;
      mogulHome[k] = (mogulHome[k] ?? 0) + dt;
      // Left alone a while, it's off again by itself.
      // (Somewhere new, or that's still to send a souvenir home, while there is somewhere; else the best-paying.)
      if (mogulHome[k]! > AIRPORT.airline.waitSeconds) flyRoute(airline.next(k).id, k);
    }
    const on = boardPad ? near(player.position, layout.mogul.board, 1.0) : false;
    if (on && !boardOn) openRoutes();
    boardOn = on;
    boardPad?.update(dt, on);
  };

  // The VIP lounge, the private jets' stand, a star's visit and wishes.
  let vipRoom: Object3D | null = null;
  let carpet: RedCarpet | null = null;
  let limo: RoadVehicle | null = null;
  const limoRun = { state: 'away' as 'away' | 'in' | 'wait' | 'turn' | 'out', x: TAXI_FROM, z: 0, turn: 0, v: 0 };
  let vipTimer: number = AIRPORT.vip.first;
  const wishPads = new Map<Wish, PadModel>();
  const barSpot = (): Point => ({ x: layout.vip.bar.x + 1.05, z: layout.vip.bar.z });
  const limoSpot = (): Point => ({ x: layout.vip.kerb.x - 2.2, z: laneZ - 2.9 });
  const WISH_ICON: Record<Wish, string> = { carpet: '🧣', champagne: '🍾', limo: '🚗' };
  interface StarVisit {
    celeb: Celebrity;
    member: CrewMember | null;
    flight: Flight;
    stage: 'waiting' | 'walking' | 'boarding';
    held: number;
    flashed: boolean;
  }
  let star: StarVisit | null = null;
  const photographers: PersonAvatar[] = [];
  const vipPay = (): number => levelFactor(UPGRADES.kinds.price, level('vip.price')) * payBonus();
  const buildVip = (animate: boolean): void => {
    if (vipRoom) return;
    const { lounge, door, bar, seat } = layout.vip;
    vipRoom = show(vipModel(), animate);
    stage.scene.add(roomFloor(lounge, null, true));
    solids.push(
      ...roomWalls(lounge, [
        { side: 'north', x: door.x, half: 0.95 },
        { side: 'south', x: door.x, half: 0.95 },
      ]),
    );
    solids.push(around(bar, 0.45, 1.35), around(seat, 1.1, 1.95));
    for (const p of [
      { x: lounge.maxX - 0.7, z: lounge.minZ + 0.7 },
      { x: lounge.maxX - 0.7, z: lounge.maxZ - 0.7 },
      { x: lounge.minX + 0.7, z: lounge.maxZ - 0.7 },
    ])
      solids.push(around(p, 0.4));
    carpet = new RedCarpet();
    carpet.root.position.set(door.x, 0.02, door.z);
    stage.scene.add(carpet.root);
    limo = new RoadVehicle('sp_limo', 0.36);
    limo.root.rotation.y = -Math.PI / 2;
    limo.root.visible = false;
    stage.scene.add(withShadows(limo.root));
    wishPads.set('carpet', spotPad(layout.vip.carpet, 1.6, 0xb0213a));
    wishPads.set('champagne', spotPad(barSpot(), 1.4, 0xd9a62e));
    wishPads.set('limo', spotPad(limoSpot(), 1.8, 0x22252d));
    const stand = layout.stands.vip!;
    airfield.openGate('vip', 0, true);
    night.addStand({ x: stand.x, z: stand.noseZ - 5 });
    night.setTerminal(terminalRooms());
  };
  /** Where the star stands waiting: at the foot of the jet's airstair. */
  const starFoot = (): Point => {
    const d = layout.stands.vip!.planeDoor ?? layout.stands.vip!.marshal;
    return { x: d.x + 1.5, z: d.z };
  };
  const meetStar = (flight: Flight): void => {
    if (!peopleReady) {
      flight.cleared = true;
      return;
    }
    const avatar = new PersonAvatar(CHARACTERS.staff.celebrity);
    stage.scene.add(avatar.root);
    const member = new CrewMember(avatar, starFoot());
    avatar.root.rotation.y = Math.PI / 2;
    star = { celeb: new Celebrity(AIRPORT.vip, vipPay()), member, flight, stage: 'waiting', held: 0, flashed: false };
    flag('celebrity:skyport');
    sound.play('reward');
    // The photographers are already at the south door.
    while (photographers.length < layout.vip.photo.length) {
      const p = new PersonAvatar(photographers.length % 2 ? CHARACTERS.visitors[1]! : CHARACTERS.staff.photographer);
      stage.scene.add(p.root);
      photographers.push(p);
    }
    photographers.forEach((p, i) => {
      const at = layout.vip.photo[i]!;
      p.root.position.set(at.x, 0, at.z);
      p.root.rotation.y = Math.atan2(layout.vip.south.x - at.x, layout.vip.south.z - at.z);
      p.root.visible = true;
    });
  };
  const grant = (wish: Wish): void => {
    if (!star) return;
    const tip = star.celeb.grant(wish);
    if (tip <= 0) return;
    const at = layout.piles.vip ?? layout.vip.door;
    cash.add('vip', tip);
    const from = star.member ? new Vector3(star.member.x, 2.8, star.member.z) : new Vector3(at.x, 2.8, at.z);
    floaters.show(`${WISH_ICON[wish]} ${t(`wish_${wish}` as StringKey)} +${money(tip)}`, from, 'tip');
    effects.burst('sparkle', from, 14, 3, 0.9);
    sound.play('ching');
    onPaid({ amount: tip, tip, automated: false, at });
    if (wish === 'carpet') carpet?.set(layout.vip.door.z - (layout.stands.vip!.planeDoor?.z ?? 2) - 0.6);
    if (wish === 'limo' && limoRun.state === 'away') {
      limoRun.state = 'in';
      limoRun.x = TAXI_FROM;
      limoRun.z = laneZ;
      limo!.root.visible = true;
      limo!.root.rotation.y = -Math.PI / 2;
    }
    if (star.celeb.happy) {
      // Every wish granted: along the carpet, through the lounge, out to the limousine (and the cameras).
      count('privateJets');
      meta.count('privateJets');
      floaters.show(`🌟 ${t('vipHappy')}`, new Vector3(from.x, from.y + 1, from.z), 'star');
      effects.burst('confetti', from, 30, 5, 1.3);
      star.stage = 'walking';
      if (star.member) {
        const { door, south, kerb } = layout.vip;
        star.member.path = [
          { x: door.x, z: door.z - 1.2 },
          ...route({ x: door.x, z: door.z - 1.2 }, { x: south.x, z: south.z + 1.0 }),
          ...route({ x: south.x, z: south.z + 1.0 }, { x: kerb.x - 0.6, z: bayZ - 1.0 }),
        ];
      }
    }
  };
  const workVip = (dt: number): void => {
    if (!vipRoom) return;
    carpet?.update(dt);
    // The limousine: in along the near lane, into its bay at the kerb, waits for the star, then turns round
    // across the road (once nothing's coming) and away east.
    if (limo && limoRun.state !== 'away') {
      const kerb = layout.vip.kerb.x;
      const l = limoRun;
      const was = l.x;
      let heading = -Math.PI / 2;
      if (l.state === 'in') {
        const left = l.x - Math.max(kerb, westLimit(roadUsers(l), { x: l.x, half: LIMO_HALF, lane: 'west' }));
        if (left > 0.02) l.x -= Math.min(left, dt * Math.max(2.5, Math.min(15, left * 1.6)));
        const into = Math.min(1, Math.max(0, 1 - (l.x - kerb) / 9));
        l.z = laneZ + (bayZ - laneZ) * into * into * (3 - 2 * into);
        heading -= Math.sin(Math.PI * into) * 0.12;
        if (l.x - kerb < 0.05) l.state = 'wait';
      } else if (l.state === 'wait') {
        if (!star && mayTurn(roadUsers(l), { x: l.x, half: LIMO_HALF + 2, lane: 'bay' })) {
          l.state = 'turn';
          l.turn = 0;
        }
      } else if (l.state === 'turn') {
        const r = (farZ - bayZ) / 2;
        l.turn = Math.min(Math.PI, l.turn + dt * 1.05);
        l.x = kerb - r * Math.sin(l.turn);
        l.z = bayZ + r * (1 - Math.cos(l.turn));
        heading += l.turn;
        if (l.turn >= Math.PI) l.state = 'out';
      } else {
        heading = Math.PI / 2;
        const room = eastLimit(roadUsers(l), { x: l.x, half: LIMO_HALF, lane: 'east' }) - l.x;
        if (room > 0) l.x += Math.min(room, dt * Math.min(15, 3 + (l.x - kerb) * 2));
        l.z = farZ;
        if (l.x > TAXI_FROM) {
          l.state = 'away';
          limo.root.visible = false;
        }
      }
      l.v = dt > 0 ? Math.abs(l.x - was) / dt : 0;
      limo.root.rotation.y = heading;
      limo.root.position.set(l.x, 0, l.z);
      limo.update(dt);
    }
    for (const [wish, pad] of wishPads) pad.group.visible = !!star && star.stage === 'waiting' && !star.celeb.granted.has(wish);
    if (!star) {
      for (const p of photographers) p.root.visible = false;
      if (!airfield.at('vip') && !airfield.calling('vip')) {
        vipTimer -= dt;
        if (vipTimer <= 0) {
          airfield.call('vip');
          const stand = layout.stands.vip!;
          floaters.show(`🌟 ${t('vipLanding')}`, new Vector3(stand.x, 6, stand.noseZ), 'star');
        }
      }
      return;
    }
    const s = star;
    const m = s.member;
    m?.avatar.update(dt);
    for (const p of photographers) p.update(dt);
    if (s.stage === 'waiting') {
      // The red carpet: the hero on its pad a moment. Champagne: a glass from the bar, carried to the star.
      // The limousine: the hero at the kerb a moment.
      const carpetPad = wishPads.get('carpet')!;
      const limoPad = wishPads.get('limo')!;
      const onCarpet = !s.celeb.granted.has('carpet') && near(player.position, layout.vip.carpet, 1.0);
      const onLimo = !s.celeb.granted.has('limo') && near(player.position, limoSpot(), 1.1);
      s.held = onCarpet || onLimo ? s.held + dt : 0;
      carpetPad.update(dt, onCarpet);
      limoPad.update(dt, onLimo);
      if (onCarpet) carpetPad.setProgress(Math.min(1, s.held / AIRPORT.vip.carpetSeconds));
      if (onLimo) limoPad.setProgress(Math.min(1, s.held / AIRPORT.vip.limoSeconds));
      if (onCarpet && s.held >= AIRPORT.vip.carpetSeconds) grant('carpet');
      if (onLimo && s.held >= AIRPORT.vip.limoSeconds) grant('limo');
      const barPad = wishPads.get('champagne')!;
      const atBar = !s.celeb.granted.has('champagne') && near(player.position, barSpot(), 1.0);
      barPad.update(dt, atBar);
      if (atBar && heroCarry.count('champagne') === 0 && !heroCarry.full) {
        heroCarry.push('champagne');
        sound.play('pick');
      }
      if (m && heroCarry.count('champagne') > 0 && near(player.position, { x: m.x, z: m.z }, 1.6)) {
        heroCarry.remove('champagne');
        grant('champagne');
      }
      // Out of patience: back aboard, and away.
      if (s.stage === 'waiting' && s.celeb.update(dt)) {
        s.stage = 'boarding';
        floaters.show(`😤 ${t('vipGone')}`, new Vector3(m?.x ?? 0, 2.8, m?.z ?? 0), 'star');
        sound.play('pop');
        if (m) m.path = [layout.stands.vip!.planeDoor ?? layout.stands.vip!.marshal];
      }
    }
    if (m && s.stage !== 'waiting') {
      const arrived = m.walk(dt, 2.6);
      // The cameras flash as the star comes out of the south door.
      if (!s.flashed && s.stage === 'walking' && m.z > layout.vip.south.z - 0.5) {
        s.flashed = true;
        for (const p of photographers) effects.burst('sparkle', new Vector3(p.root.position.x, 1.8, p.root.position.z), 10, 2.5, 0.5);
        sound.play('flash');
      }
      if (arrived) {
        // Into the limousine (or back aboard): gone, the jet's cleared to go, the limousine drives off.
        m.avatar.root.removeFromParent();
        s.flight.cleared = true;
        carpet?.set(0);
        star = null;
        const [low, high] = AIRPORT.vip.every as [number, number];
        vipTimer = low + Math.random() * (high - low);
      }
    }
  };

  // The bag sorter by the belt, and a belt loader at every hold: cases go aboard by themselves.
  let sorter: BagSorter | null = null;
  const loadTimers = new Map<string, number>();
  const addLoader = (gate: GateView, animate: boolean): void => {
    if (gate.loader) return;
    const half = PLANES[planeAt(gate.spot)].solid.half;
    const side = gate.spot.hold.x < gate.spot.x ? -1 : 1;
    gate.loader = new BeltLoader();
    gate.loader.root.position.set(gate.spot.x + side * (half + 0.15), 0, gate.spot.hold.z);
    gate.loader.root.rotation.y = side < 0 ? Math.PI : 0;
    show(gate.loader.root, animate);
    solids.push(around({ x: gate.spot.x + side * (half + 2.05), z: gate.spot.hold.z }, 1.75, 0.7));
    solidsChanged();
  };
  const buildSorter = (animate: boolean): void => {
    if (sorter) return;
    sorter = new BagSorter();
    sorter.root.position.set(layout.sorter.at.x, 0, layout.sorter.at.z);
    show(sorter.root, animate);
    solids.push(around(layout.sorter.at, 1.45, 1.3));
    for (const gate of gates) addLoader(gate, animate);
  };
  /** The sorter puts a gate's cases aboard (its own colour, or a golden one) from the belt; true while it is. */
  const sortInto = (dt: number, gate: GateView, flight: Flight | null): boolean => {
    if (!sorter || !flight || flight.cases >= flight.needsCases) return false;
    const i = beltCases.findIndex((c) => caseFits(c, gate.key));
    if (i < 0) return false;
    const left = (loadTimers.get(gate.key) ?? 0) - dt * boost;
    loadTimers.set(gate.key, left);
    if (left > 0) return true;
    loadTimers.set(gate.key, 1 / AIRPORT.sorter.perSecond);
    const [item] = beltCases.splice(i, 1);
    flight.cases += 1;
    if (item === 'caseGold') {
      state.gems += 1;
      floaters.show(`💎 ${t('goldenCase')}`, new Vector3(gate.spot.hold.x, 2.2, gate.spot.hold.z), 'tip');
      count('goldenCases');
    }
    if (flight.cases >= flight.needsCases) floaters.show(`🧳 ${t('bagsLoaded')}`, new Vector3(gate.spot.hold.x, 2.6, gate.spot.hold.z), 'star');
    return true;
  };

  // The marshal: out to the ramp pad of each plane coming in, guiding it onto its stand.
  let marshal: (CrewMember & { gate: string | null }) | null = null;
  const workMarshal = (dt: number): void => {
    const mm = marshal;
    if (!mm) return;
    const speed = (CREW_SPEED * boost) / levelFactor(UPGRADES.kinds.staffSpeed, level('marshal.staffSpeed'));
    const arrived = mm.walk(dt, speed);
    mm.avatar.update(dt);
    const order = { taxiIn: 0, rollout: 1, approach: 2 } as Record<string, number>;
    const coming = airfield.flights
      .filter((f) => layout.gates[f.gate] && !f.marshalled && (f.phase === 'approach' || f.phase === 'rollout' || f.phase === 'taxiIn'))
      .sort((a, b) => (order[a.phase] ?? 3) - (order[b.phase] ?? 3))[0];
    if (coming) {
      const spot = layout.gates[coming.gate]!.marshal;
      if (mm.gate !== coming.gate) {
        mm.gate = coming.gate;
        go(mm, spot);
      }
      if (arrived && near({ x: mm.x, z: mm.z }, spot, 0.6)) {
        mm.avatar.root.rotation.y = Math.PI;
        if (coming.phase === 'taxiIn' && coming.z > layout.taxiway.z + 4) coming.marshalled = true;
      }
    } else if (mm.gate !== null && arrived) {
      mm.gate = null;
      go(mm, layout.staffSpots.marshal ?? layout.belt.at);
    }
  };

  /** The rooms the night lights wash: the hall, the wing, Gate 4's pier, the VIP lounge, the hangar and the jet wash as they're built. */
  const terminalRooms = (): Rect[] => [
    layout.hall,
    ...(wing ? [layout.wing] : []),
    ...(pier ? [layout.pier] : []),
    ...(vipRoom ? [layout.vip.lounge] : []),
    ...(hangarModel && layout.hangar ? [layout.hangar.hall] : []),
    ...(jetWash && layout.jetwash ? [layout.jetwash.hall] : []),
  ];
  let pier: Object3D | null = null;
  const buildPier = (animate: boolean): void => {
    if (pier) return;
    pier = show(pierModel(Object.keys(layout.gates).indexOf('gate4') + 1), animate);
    stage.scene.add(roomFloor(layout.pier, layout.gates.gate4?.lounge ?? null));
    // Its passengers come in from the plaza by its own security lane (not through the wing's), to a door on its south side.
    const lane = layout.pierSecurity;
    solids.push(...roomWalls(layout.pier, [{ side: 'north', x: layout.gates.gate4!.door.x, half: 0.75 }, ...(lane ? [{ side: 'south' as const, x: lane.arch.x, half: 0.9 }] : [])]));
    if (lane) {
      // (A paved way in from the plaza under its lane.)
      stage.scene.add(roomFloor({ minX: lane.arch.x - 1.5, maxX: lane.arch.x + 1.7, minZ: layout.pier.maxZ, maxZ: layout.plaza.minZ }, null));
      pierLane = new SecurityLane();
      pierLane.root.position.set(lane.arch.x, 0, lane.arch.z);
      pierLane.root.rotation.y = Math.PI / 2;
      show(pierLane.root, animate);
      solids.push(...securityLaneSolids(lane.arch, true));
      passengers.pierLane = true;
    }
    night.setTerminal(terminalRooms());
  };

  // ---- Part D: cargo and the hangars ----------------------------------------------------------------------------
  // The cargo shed: crates come out onto its dock and are carried (by the hero, or the cargo crew) to the
  // K-loader at the freighter's main-deck door; once it's full it's off, paying for every crate.
  let shed: CargoShed | null = null;
  let kloader: KLoader | null = null;
  let dockCrates: Carrier<CarryItem> | null = null;
  let dockPad: PadModel | null = null;
  let dropPad: PadModel | null = null;
  let restockIn = 0;
  /** Seconds the freighter's stood full (it closes up and goes after a moment), and whether the crew put its last crate aboard. */
  let fullFor = 0;
  let crewLoaded = false;
  let cargoCrew: (CrewMember & { carrier: Carrier<CarryItem>; job: 'idle' | 'toDock' | 'toDrop' | 'home'; wait: number }) | null = null;
  const cargoPay = (): number => AIRPORT.cargo.fare * levelFactor(UPGRADES.kinds.price, level('cargo.price')) * payBonus();
  /** The freighter on its stand, while it's still taking crates. */
  const freighter = (): Flight | null => {
    const f = airfield.parkedAt('cargo');
    return f && !f.cleared && f.cases < f.needsCases ? f : null;
  };
  const buildCargo = (animate: boolean): void => {
    const cg = layout.cargo;
    if (shed || !cg) return;
    shed = new CargoShed();
    show(shed.root, animate);
    kloader = new KLoader();
    kloader.root.position.set(cg.loader.x, 0, cg.loader.z);
    kloader.root.rotation.y = -Math.PI / 2;
    show(kloader.root, animate);
    const { door } = cg;
    solids.push(
      { ...cg.shed },
      // The dock's lip, the pallets and the drum by the door, the canopy's posts, the loader.
      { minX: door.x - 3.5, maxX: door.x + 3.5, minZ: door.z - 1.15, maxZ: door.z },
      around({ x: door.x - 5.0, z: door.z - 0.6 }, 0.62, 0.52),
      around({ x: door.x - 5.0, z: door.z - 1.9 }, 0.62, 0.52),
      around({ x: door.x + 5.4, z: door.z - 0.7 }, 0.62, 0.52),
      around({ x: door.x + 6.7, z: door.z - 0.5 }, 0.36),
      ...[-1, 1].map((e) => around({ x: door.x + e * 3.6, z: door.z - 2.25 }, 0.12)),
      footprint('sp_kloader', cg.loader.x, cg.loader.z, -Math.PI / 2, 0.05),
    );
    // Its trucks, backed up to the shed's far side in the truck yard.
    for (const at of layout.landside?.trucks ?? []) {
      const truck = skyModel('sp_boxtruck');
      truck.position.set(at.x, 0, at.z);
      show(truck, animate);
      solids.push(footprint('sp_boxtruck', at.x, at.z, 0, 0.05));
    }
    // The crates waiting on the dock's lip: two rows of five.
    const lip = new Object3D();
    lip.position.set(cg.stack.x, 0, cg.stack.z);
    stage.scene.add(lip);
    dockCrates = new Carrier<CarryItem>(lip, () => cg.stack, () => AIRPORT.cargo.stack);
    dockCrates.arrange = (i) => [(((i % 5) - 2) * 0.8) / 1.6, (0.36 + Math.floor(i / 5) * 0.49 - 1.0) / 1.6, (0.35 + 0.5) / 1.6];
    for (let i = 0; i < 4; i++) dockCrates.push('cargo');
    dockPad = spotPad(cg.dock, 1.5, 0x2c62d6);
    dropPad = spotPad(cg.drop, 1.5, 0x2c62d6);
    airfield.openGate('cargo', animate ? 8 : 0);
    const stand = layout.stands.cargo!;
    night.addStand({ x: stand.x, z: stand.noseZ - 7 });
    solidsChanged();
  };
  /** A freighter on its stand: its crates to load. */
  const freighterParked = (flight: Flight): void => {
    flight.needsCases = AIRPORT.cargo.crates;
    flight.cases = 0;
    fullFor = 0;
    crewLoaded = false;
  };
  /** A crate onto the K-loader, and aboard. */
  const loadCrate = (flight: Flight, byCrew: boolean): void => {
    flight.cases += 1;
    kloader?.load();
    crewLoaded = byCrew;
    count('crates');
    meta.count('crates');
    sound.play('drop', hearing(layout.cargo!.drop));
    if (flight.cases >= flight.needsCases) floaters.show(`📦 ${t('cargoLoaded')}`, new Vector3(flight.x + 3, 5.4, flight.z + 4), 'star');
  };
  /** Full: off it goes, paying for every crate. */
  const sendFreighter = (flight: Flight): void => {
    flight.cleared = true;
    const n = flight.cases;
    const pay = Math.round(n * cargoPay());
    cash.add('cargo', pay);
    const at = layout.piles.cargo ?? layout.cargo!.pile;
    floaters.show(`📦 +${money(pay)}`, new Vector3(at.x, 1.2, at.z), 'cash');
    floaters.show(`✈️ ${t('cargoPaid', { n })}`, new Vector3(flight.x, 5.6, flight.z + 3), 'star');
    sound.play('ching', hearing(at));
    onPaid({ amount: pay, tip: 0, automated: crewLoaded, at });
    void saves.saveNow();
  };
  /** The shed's roller door is up (for the sound as it goes up or down). */
  let shedOpen = false;
  const workCargo = (dt: number): void => {
    const cg = layout.cargo;
    if (!shed || !kloader || !dockCrates || !dockPad || !dropPad || !cg) return;
    // More crates out onto the dock, while there's room on it.
    restockIn -= dt * boost;
    if (restockIn <= 0) {
      restockIn = AIRPORT.cargo.restock;
      if (dockCrates.stack.length < AIRPORT.cargo.stack) dockCrates.push('cargo');
    }
    const parked = airfield.parkedAt('cargo');
    const loading = parked && !parked.cleared ? parked : null;
    const wanting = freighter();
    const coming = airfield.at('cargo');
    // The hero: crates off the dock (as many as the freighter, there or on its way, still wants), onto the loader.
    const wanted = wanting ? wanting.needsCases - wanting.cases : coming && coming.phase !== 'parked' ? AIRPORT.cargo.crates : 0;
    const want = wanted - heroCarry.count('cargo');
    const atDock = near(player.position, cg.dock, 1.1);
    if (atDock && want > 0 && dockCrates.stack.length > 0 && !heroCarry.full && heroCarry.timer <= 0) {
      dockCrates.remove('cargo');
      heroCarry.push('cargo');
      heroCarry.timer = AIRPORT.bags.handSeconds;
      sound.play('pick');
    }
    const atDrop = near(player.position, cg.drop, 1.1);
    if (wanting && atDrop && heroCarry.count('cargo') > 0 && heroCarry.timer <= 0) {
      heroCarry.remove('cargo');
      heroCarry.timer = AIRPORT.bags.handSeconds;
      loadCrate(wanting, false);
    }
    dockPad.group.visible = want > 0 && dockCrates.stack.length > 0;
    dockPad.update(dt, atDock);
    dropPad.group.visible = !!wanting;
    dropPad.update(dt, atDrop);
    if (wanting) dropPad.setProgress(wanting.cases / wanting.needsCases);
    // Full: a moment to close up, then it's off.
    if (loading && loading.needsCases > 0 && loading.cases >= loading.needsCases) {
      fullFor += dt;
      if (fullFor >= AIRPORT.cargo.wait) sendFreighter(loading);
    }
    if (!!loading !== shedOpen) {
      shedOpen = !!loading;
      sound.play('open', hearing(cg.door) * 0.8);
    }
    shed.update(dt, !!loading);
    kloader.update(dt, loading ? AIRPORT.planes.freighter.sill - 1.12 : 0);
  };
  /** Where the cargo crew picks up and puts down (beside the hero's own spots). */
  const crewDock = (): Point => ({ x: layout.cargo!.dock.x + 1.3, z: layout.cargo!.dock.z });
  const crewDrop = (): Point => ({ x: layout.cargo!.drop.x, z: layout.cargo!.drop.z + 1.1 });
  /** The cargo crew: crates off the dock (as many as it carries, as the freighter wants), out to the loader; home between freighters. */
  const workCargoCrew = (dt: number): void => {
    const c = cargoCrew;
    const cg = layout.cargo;
    if (!c || !cg || !dockCrates) return;
    const speed = (CREW_SPEED * AIRPORT.cargo.crewSpeed * boost) / levelFactor(UPGRADES.kinds.staffSpeed, level('cargocrew.staffSpeed'));
    const arrived = c.walk(dt, speed);
    c.carrier.update(dt, !arrived);
    c.avatar.update(dt);
    if (!arrived) return;
    c.wait = Math.max(0, c.wait - dt);
    if (c.wait > 0) return;
    const f = freighter();
    if (c.job === 'toDock') {
      const want = f ? f.needsCases - f.cases : 0;
      while (!c.carrier.full && c.carrier.stack.length < want && dockCrates.stack.length > 0) {
        dockCrates.remove('cargo');
        c.carrier.push('cargo');
      }
      if (c.carrier.stack.length > 0 && f) {
        c.job = 'toDrop';
        go(c, crewDrop());
        sound.play('pick', hearing(c));
      } else c.job = 'idle';
      c.wait = 0.4;
      return;
    }
    if (c.job === 'toDrop') {
      if (f) {
        while (c.carrier.count('cargo') > 0 && f.cases < f.needsCases) {
          c.carrier.remove('cargo');
          loadCrate(f, true);
        }
        c.avatar.root.rotation.y = -Math.PI / 2;
      }
      c.job = 'idle';
      c.wait = 0.4;
      return;
    }
    if (f && c.carrier.count('cargo') > 0) {
      c.job = 'toDrop';
      go(c, crewDrop());
      return;
    }
    if (f && dockCrates.stack.length > 0) {
      c.job = 'toDock';
      go(c, crewDock());
      return;
    }
    const home = layout.staffSpots.cargocrew ?? cg.dock;
    if (c.job !== 'home' && Math.hypot(c.x - home.x, c.z - home.z) > 0.5) {
      c.job = 'home';
      go(c, home);
    } else if (c.job === 'home') {
      c.job = 'idle';
      c.avatar.root.rotation.y = Math.PI;
    }
  };

  // The maintenance hangar: Mogul Air's worn planes come home to it and are serviced there (the hero at the
  // service pad, or the mechanic), flying better for a few trips after.
  let servicePad: PadModel | null = null;
  let engineer: (CrewMember & { job: 'idle' | 'toWork' | 'working' | 'home' }) | null = null;
  let clankIn = 0;
  /** The hangar's doors are open (for the sound as they slide). */
  let hangarOpen = false;
  const buildHangar = (animate: boolean): void => {
    const hg = layout.hangar;
    const stand = layout.stands.hangar;
    if (hangarModel || !hg || !stand) return;
    const r = hg.hall;
    const third = (r.maxX - r.minX) / 3;
    hangarModel = new HangarModel('HANGAR 1', r.maxX - r.minX);
    show(hangarModel.root, animate);
    solids.push(
      // Its walls (the people's door at the back), the front posts.
      { minX: r.minX - 0.2, maxX: r.minX + 0.2, minZ: r.minZ - 0.3, maxZ: r.maxZ + 0.2 },
      { minX: r.maxX - 0.2, maxX: r.maxX + 0.2, minZ: r.minZ - 0.3, maxZ: r.maxZ + 0.2 },
      { minX: r.minX, maxX: hg.door.x - 0.8, minZ: r.maxZ - 0.2, maxZ: r.maxZ + 0.2 },
      { minX: hg.door.x + 0.8, maxX: r.maxX, minZ: r.maxZ - 0.2, maxZ: r.maxZ + 0.2 },
      // Along the back wall the workbench, the tool chest and the shelves; the spare engine, the steps by
      // the nose, the extinguisher, the tool cart.
      { minX: r.minX + 1.2, maxX: r.minX + 5.5, minZ: r.maxZ - 1.25, maxZ: r.maxZ },
      { minX: r.minX + 6.8, maxX: r.minX + 8.0, minZ: r.maxZ - 1.15, maxZ: r.maxZ },
      { minX: r.maxX - 6.6, maxX: r.maxX - 4.2, minZ: r.maxZ - 1.1, maxZ: r.maxZ },
      around({ x: r.minX + 3.0, z: r.minZ + 5.0 }, 0.72, 1.25),
      around({ x: stand.x - 3.4, z: stand.noseZ + 0.8 }, 0.55, 0.95),
      around({ x: r.maxX - 0.5, z: r.maxZ - 1.8 }, 0.16),
      around({ x: r.maxX - 2.4, z: r.minZ + 6.0 }, 0.65, 0.4),
      // The door leaves stacked either side (the middle ones too while they're shut: movingSolids).
      { minX: r.minX, maxX: r.minX + third, minZ: r.minZ - 0.85, maxZ: r.minZ - 0.05 },
      { minX: r.maxX - third, maxX: r.maxX, minZ: r.minZ - 0.85, maxZ: r.minZ - 0.05 },
    );
    airline.wears = true;
    airfield.openGate('hangar', 0, true);
    servicePad = spotPad(hg.service, 1.6, 0xff9f1c);
    night.addStand({ x: stand.x, z: stand.noseZ - 4.5 });
    night.setTerminal(terminalRooms());
    solidsChanged();
  };
  const workHangar = (dt: number): void => {
    const hg = layout.hangar;
    if (!hangarModel || !hg || !servicePad) return;
    const plane = airfield.parkedAt('hangar');
    const job = hangarJob;
    const onPad = near(player.position, hg.service, 1.1);
    let working = false;
    if (plane && job && job.progress < 1 && !plane.cleared) {
      const byHero = onPad ? 1 : 0;
      const byMechanic = engineer?.job === 'working' ? AIRPORT.hangar.mechanicRate / levelFactor(UPGRADES.kinds.staffSpeed, level('engineer.staffSpeed')) : 0;
      const rate = Math.max(byHero, byMechanic) / (AIRPORT.hangar.seconds * levelFactor(UPGRADES.kinds.speed, level('hangar.speed')));
      working = rate > 0;
      if (working) {
        job.progress = Math.min(1, job.progress + dt * boost * rate);
        // Sparks off the engine now and then, the clank of a spanner.
        clankIn -= dt;
        if (clankIn <= 0) {
          clankIn = 0.7 + Math.random() * 0.6;
          sound.play('clank', hearing(hg.service) * 0.6);
          effects.burst('sparkle', new Vector3(plane.x + 2.4, PROP.wingY - 0.4, plane.z + 1.6), 4, 2, 0.3);
        }
        if (job.progress >= 1) {
          airline.service(job.k);
          count('serviced');
          mogulHome[job.k] = 0;
          floaters.show(`🔧 ${t('hangarDone')}`, new Vector3(plane.x, 5.2, plane.z + 1.5), 'star');
          effects.burst('sparkle', new Vector3(plane.x, 2.4, plane.z), 26, 4, 1.2);
          sound.play('reward');
          void saves.saveNow();
        }
      }
      servicePad.group.visible = true;
      servicePad.setProgress(job.progress);
    } else servicePad.group.visible = false;
    servicePad.update(dt, onPad && servicePad.group.visible);
    // Its doors open for a plane coming in or going, shut while it's being worked on.
    const moving = airfield.flights.some((f) => f.gate === 'hangar' && (f.phase === 'taxiIn' || f.phase === 'pushback' || (f.phase === 'parked' && f.cleared)));
    if (moving !== hangarOpen) {
      hangarOpen = moving;
      sound.play('open', hearing({ x: (hg.hall.minX + hg.hall.maxX) / 2, z: hg.hall.minZ }));
      sound.play('clank', hearing(hg.service) * 0.5);
    }
    hangarModel.update(dt, moving, working);
  };
  /** Where the mechanic works: by the plane's engine, beside the hero's pad. */
  const engineerSpot = (): Point => ({ x: layout.hangar!.service.x, z: layout.hangar!.service.z - 1.7 });
  /** The mechanic: to the plane in the hangar while it wants servicing, back to the bench between. */
  const workEngineer = (dt: number): void => {
    const e = engineer;
    if (!e || !layout.hangar) return;
    const speed = (CREW_SPEED * boost) / levelFactor(UPGRADES.kinds.staffSpeed, level('engineer.staffSpeed'));
    const arrived = e.walk(dt, speed);
    const plane = airfield.parkedAt('hangar');
    const wanted = !!plane && !!hangarJob && hangarJob.progress < 1 && !plane.cleared;
    e.avatar.update(dt, e.job === 'working');
    if (wanted && (e.job === 'idle' || e.job === 'home')) {
      e.job = 'toWork';
      go(e, engineerSpot());
      return;
    }
    if (!arrived) return;
    if (e.job === 'toWork') e.job = wanted ? 'working' : 'idle';
    if (e.job === 'working') {
      if (wanted && plane) {
        e.avatar.root.rotation.y = Math.atan2(plane.x + 2.4 - e.x, plane.z + 1.0 - e.z);
        return;
      }
      e.job = 'idle';
    }
    const home = layout.staffSpots.engineer ?? layout.hangar.service;
    if (e.job !== 'home' && Math.hypot(e.x - home.x, e.z - home.z) > 0.5) {
      e.job = 'home';
      go(e, home);
    } else if (e.job === 'home') {
      e.job = 'idle';
      e.avatar.root.rotation.y = -Math.PI / 2;
    }
  };

  // The jet wash: now and then an airline books a jet in; the gantry rolls the length of the bay and back,
  // brushes spinning, water and foam everywhere (quicker with the hero at the controls), and the fee's paid.
  let jetWash: JetWash | null = null;
  let controlPad: PadModel | null = null;
  let washTimer: number = AIRPORT.jetwash.first;
  let wash: { flight: Flight; progress: number } | null = null;
  let sprayIn = 0;
  let splashIn = 0;
  const sprayAt = new Vector3();
  const washPay = (): number => AIRPORT.jetwash.fee * levelFactor(UPGRADES.kinds.price, level('jetwash.price')) * payBonus();
  const buildJetwash = (animate: boolean): void => {
    const jw = layout.jetwash;
    const stand = layout.stands.jetwash;
    if (jetWash || !jw || !stand) return;
    const r = jw.hall;
    // (The gantry's run: from its place at the front of the bay to the jet's nose.)
    jetWash = new JetWash(stand.noseZ + 0.5 - (r.minZ + 1.2));
    show(jetWash.root, animate);
    solids.push(
      // Its sides (columns and splash walls), the back wall, the bucket and mop in the corner.
      { minX: r.minX - 0.3, maxX: r.minX + 0.3, minZ: r.minZ - 0.3, maxZ: r.maxZ + 0.2 },
      { minX: r.maxX - 0.3, maxX: r.maxX + 0.3, minZ: r.minZ - 0.3, maxZ: r.maxZ + 0.2 },
      { minX: r.minX, maxX: r.maxX, minZ: r.maxZ - 0.2, maxZ: r.maxZ + 0.2 },
      around({ x: r.maxX - 1.1, z: r.maxZ - 1.3 }, 0.4),
    );
    airfield.openGate('jetwash', 0, true);
    controlPad = spotPad(jw.control, 1.6, 0xff5fa8);
    night.addStand({ x: stand.x, z: stand.noseZ - 7 });
    night.setTerminal(terminalRooms());
    solidsChanged();
  };
  const finishWash = (flight: Flight): void => {
    flight.cleared = true;
    wash = null;
    const pay = Math.round(washPay());
    cash.add('jetwash', pay);
    const at = layout.piles.jetwash ?? layout.jetwash!.pile;
    floaters.show(`💦 +${money(pay)}`, new Vector3(at.x, 1.2, at.z), 'cash');
    floaters.show(`✨ ${t('washDone')}`, new Vector3(flight.x, 6, flight.z + 3), 'star');
    effects.burst('sparkle', new Vector3(flight.x, 3, flight.z), 30, 5, 2.5);
    sound.play('sparkle', hearing(flight));
    sound.play('ching', hearing(at));
    count('washes');
    meta.count('washes');
    onPaid({ amount: pay, tip: 0, automated: true, at });
    void saves.saveNow();
  };
  const workJetwash = (dt: number): void => {
    const jw = layout.jetwash;
    const stand = layout.stands.jetwash;
    if (!jetWash || !controlPad || !jw || !stand) return;
    // A booking now and then, while the bay's empty.
    if (!wash && !airfield.at('jetwash') && !airfield.calling('jetwash')) {
      washTimer -= dt * boost;
      if (washTimer <= 0) {
        const [low, high] = AIRPORT.jetwash.every as [number, number];
        washTimer = low + Math.random() * (high - low);
        airfield.call('jetwash');
        floaters.show(`💦 ${t('washBooked')}`, new Vector3(stand.x, 6, stand.noseZ - 4), 'star');
      }
    }
    const w = wash && wash.flight.phase === 'parked' && !wash.flight.cleared ? wash : null;
    const atControls = near(player.position, jw.control, 1.1);
    if (w) {
      const speed = ((atControls ? AIRPORT.jetwash.heroSpeed : 1) * boost) / (AIRPORT.jetwash.seconds * levelFactor(UPGRADES.kinds.speed, level('jetwash.speed')));
      w.progress = Math.min(1, w.progress + dt * speed);
      // Water off the spray bars (and now and then foam), the hiss of it.
      sprayIn -= dt;
      if (sprayIn <= 0) {
        sprayIn = 0.14;
        for (const nozzle of jetWash.sprays) {
          nozzle.getWorldPosition(sprayAt);
          effects.burst(Math.random() < 0.75 ? 'water' : 'bubble', sprayAt, 2, 2.2, 0.25);
        }
      }
      splashIn -= dt;
      if (splashIn <= 0) {
        splashIn = 1.4;
        sound.play('spray', hearing({ x: stand.x, z: stand.noseZ - 5 }) * 0.7);
      }
      if (w.progress >= 1) {
        sound.play('splash', hearing({ x: stand.x, z: stand.noseZ - 5 }) * 0.9);
        finishWash(w.flight);
      }
    }
    controlPad.group.visible = !!w;
    controlPad.update(dt, atControls && !!w);
    if (w) controlPad.setProgress(w.progress);
    jetWash.update(dt, w ? w.progress : null);
  };

  // The second runway: departures take off from it (round the first one's west end), the first takes the
  // landings; Goldsby Air can't keep up and closes.
  let runwayTwo: Object3D | null = null;
  const buildRunway2 = (animate: boolean): void => {
    const second = layout.runway2;
    if (runwayTwo || !second) return;
    runwayTwo = secondRunway(layout);
    stage.scene.add(runwayTwo);
    airfield.runway2 = true;
    towerQueue.closeHops();
    night.addRunway(second, layout.taxiway.z, layout.links.around ?? second.minX + 6, layout.runway.minX);
    if (animate) {
      const at = new Vector3(player.position.x, 4.5, player.position.z);
      floaters.show(`🛫 ${t('runwayTwo')}`, at, 'star');
      floaters.show(`👋 ${t('goldsbyGone')}`, new Vector3(at.x, at.y + 1.2, at.z), 'star');
    }
  };

  /** The airport manager: rounds of the whole airport with a clipboard, a pause at each stop. */
  let manager: (CrewMember & { leg: number; pause: number }) | null = null;
  const workManager = (dt: number): void => {
    const m = manager;
    const walk = layout.managerWalk;
    if (!m || !walk || walk.length === 0) return;
    const arrived = m.walk(dt, 1.9 * boost);
    m.avatar.update(dt);
    if (!arrived) return;
    if (m.pause > 0) {
      m.pause -= dt;
      if (m.pause <= 0) {
        m.leg = (m.leg + 1) % walk.length;
        go(m, walk[m.leg]!);
      }
      return;
    }
    m.pause = 2 + Math.random() * 2;
  };

  // ---- Part E: the Sky Queen ------------------------------------------------------------------------------------
  // Bought, she's put together on her own stand over her construction time: the stand's laid, two tower
  // cranes swing over her and she takes shape from her nose back to her tail. Built, she rolls out in Mogul
  // Air's colours; everything at Skyport earns more for her, and now and then she's off on a world tour (the
  // hero waves her off from the pad at her nose; on the beat of the ring, a perfect send-off).
  const QUEEN_RULES = AIRPORT.skyqueen;
  const queenStandAt = layout.stands.skyqueen;
  /** Her middle, parked (her nose to +z on its stop bar). */
  const queenMid = (): number => (queenStandAt ? queenStandAt.noseZ - PLANES.queen.size.length / 2 : 0);
  let queenFloor: Object3D | null = null;
  let queenBuild: { model: PlaneModel; cut: Plane; cranes: TowerCrane[]; solids: Rect[]; sparkIn: number } | null = null;
  let queenOn = false;
  let queenGantryModel: Object3D | null = null;
  let queenPad: PadModel | null = null;
  let queenRing: TimingRing | null = null;
  let queenFuel: FuelTruck | null = null;
  let queenHose: Object3D | null = null;
  let queenLabel: Label | null = null;
  let queenShown = '';
  /** Seconds she's stood on her stand since she came in, seconds she's been ready to go, the hero on her pad. */
  let queenGround = 0;
  let queenReady = 0;
  let queenOnPad = false;
  let queenStood = 0;
  const queenPay = (): number => QUEEN_RULES.fare * levelFactor(UPGRADES.kinds.price, level('skyqueen.price')) * payBonus();
  const queenTour = (): number => QUEEN_RULES.tour * levelFactor(UPGRADES.kinds.speed, level('skyqueen.speed'));
  /** The landmark's own bonus on the check-in desk's tickets (everything else has it through payBonus). */
  const queenBonus = (): number => (built('skyqueen') ? 1 + (current.pads.find((p) => p.id === 'skyqueen')?.effects.payBonus ?? 0) : 1);
  /** Her stand's paving and paint (laid when she's bought). */
  const layQueenStand = (): void => {
    if (queenFloor || !layout.skyqueen) return;
    queenFloor = queenStand(layout);
    stage.scene.add(queenFloor);
  };
  /** Under construction: her stand laid, the cranes up, her model there to be revealed nose to tail. */
  const startQueenBuild = (): void => {
    if (queenBuild || queenOn || !layout.skyqueen || !queenStandAt || !state.building.skyqueen) return;
    layQueenStand();
    const model = new PlaneModel(mogulLivery, 'queen');
    model.root.position.set(queenStandAt.x, 0, queenMid());
    model.update(0, { engines: 0, door: 0, hold: 0, galley: 0, flaps: 0, gear: 1, steer: 0, roll: 0, taxiLight: false });
    // (Her own copies of the paint, cut away behind the line that moves back along her as she's built.)
    const cut = new Plane(new Vector3(0, 0, 1), -queenStandAt.noseZ - 1);
    model.root.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const from = node.material as Material;
      const copy = from.clone();
      copy.onBeforeCompile = from.onBeforeCompile;
      copy.clippingPlanes = [cut];
      node.material = copy;
    });
    stage.renderer.localClippingEnabled = true;
    stage.scene.add(model.root);
    const solidsHere: Rect[] = [];
    const cranes = layout.skyqueen.cranes.map((at, i) => {
      const crane = new TowerCrane(Math.atan2(queenStandAt.x - at.x, queenMid() - at.z), i);
      crane.root.position.set(at.x, 0, at.z);
      show(crane.root, true);
      solidsHere.push(around(at, 1.65));
      return crane;
    });
    solids.push(...solidsHere);
    solidsChanged();
    queenBuild = { model, cut, cranes, solids: solidsHere, sparkIn: 0 };
  };
  const updateQueenBuild = (dt: number): void => {
    const b = queenBuild;
    const build = state.building.skyqueen;
    if (!b || !build || !queenStandAt) return;
    const total = current.pads.find((p) => p.id === 'skyqueen')?.buildSeconds ?? 1200;
    const done = Math.max(0, Math.min(1, 1 - secondsLeft(build, Date.now()) / total));
    const length = PLANES.queen.size.length + 1;
    const at = queenStandAt.noseZ + 0.5 - done * length;
    b.cut.constant = -at;
    for (const crane of b.cranes) crane.update(dt);
    // Sparks where she's being put together.
    b.sparkIn -= dt;
    if (b.sparkIn <= 0) {
      b.sparkIn = 0.35 + Math.random() * 0.5;
      effects.burst('sparkle', new Vector3(queenStandAt.x + (Math.random() - 0.5) * 6, 1.5 + Math.random() * 6, at), 4, 2.4, 0.4);
      if (hearing({ x: queenStandAt.x, z: at }) > 0.5 && Math.random() < 0.3) sound.play('clank', 0.4);
    }
  };
  const endQueenBuild = (): void => {
    const b = queenBuild;
    if (!b) return;
    b.model.dispose();
    for (const crane of b.cranes) crane.root.removeFromParent();
    for (const r of b.solids) solids.splice(solids.indexOf(r), 1);
    solidsChanged();
    queenBuild = null;
  };
  /** Built: she rolls out on her stand (or, saved while she was away on a tour, she's on her way). */
  const buildQueen = (animate: boolean): void => {
    if (queenOn || !layout.skyqueen || !queenStandAt) return;
    queenOn = true;
    endQueenBuild();
    layQueenStand();
    const { sign } = layout.skyqueen;
    queenGantryModel = show(queenGantry(), animate);
    queenGantryModel.position.set(sign.x, 0, sign.z);
    for (const side of [-1, 1]) solids.push(around({ x: sign.x + side * 6, z: sign.z }, 0.5));
    // Her viewing stand on the plaza behind the gantry, its seats facing her.
    const grandstand = layout.landside?.grandstand;
    if (grandstand) {
      const seats = skyModel('sp_grandstand');
      seats.position.set(grandstand.x, 0, grandstand.z);
      show(seats, animate);
      solids.push(footprint('sp_grandstand', grandstand.x, grandstand.z, 0, 0.05));
    }
    airfield.openGate('skyqueen', 0, true);
    queenPad = new PadModel(2.4, 0xffc21a);
    queenPad.group.position.set(queenStandAt.marshal.x, 0, queenStandAt.marshal.z);
    stage.scene.add(queenPad.group);
    queenRing = new TimingRing();
    queenRing.mesh.position.set(queenStandAt.marshal.x, 0.09, queenStandAt.marshal.z);
    stage.scene.add(queenRing.mesh);
    // Her fuel truck by her right wing, and its hose up to it while she's being got ready.
    const fuelAt = layout.skyqueen.fuel;
    queenFuel = new FuelTruck();
    queenFuel.root.position.set(fuelAt.x, 0, fuelAt.z);
    show(queenFuel.root, animate);
    solids.push(footprint('sp_fuel', fuelAt.x, fuelAt.z, 0, 0.05));
    queenHose = fuelHose();
    queenHose.visible = false;
    stage.scene.add(queenHose);
    night.addStand({ x: queenStandAt.x, z: queenMid() });
    const el = document.createElement('div');
    el.className = 'flight-label';
    queenLabel = labels.add(el, new Vector3(sign.x, 9.6, sign.z));
    queenLabel.visible = false;
    // Home (or brand new): on her stand. Away on a tour: back when it's done. (Her tour over but not yet home when
    // the game was saved: she lands and taxis in, and her takings come as she parks, as ever, once the game's going.)
    if ((state.supplies['queen.away'] ?? 0) <= 0) {
      if ((state.supplies['queen.trip'] ?? 0) > 0) airfield.call('skyqueen');
      else airfield.park('skyqueen');
    }
    if (animate) {
      const mid = queenMid();
      floaters.show(`👑 ${t('queenRollout')}`, new Vector3(queenStandAt.x, 9, mid + 4), 'star');
      for (let i = 0; i < 5; i++) effects.burst('confetti', new Vector3(queenStandAt.x + (i - 2) * 4, 7, mid + (i % 2 ? 4 : -4)), 30, 5, 1.4);
      sound.play('cheer');
      sound.play('reward');
    }
    solidsChanged();
  };
  /** Home from a world tour: the takings on the pile by her stand. */
  const queenHome = (flight: Flight): void => {
    const pay = Math.round(queenPay());
    const at = layout.piles.skyqueen ?? layout.skyqueen!.pile;
    cash.add('skyqueen', pay);
    floaters.show(`+${money(pay)} 👑`, new Vector3(at.x, 1.2, at.z), 'cash');
    floaters.show(`🌍 ${t('queenHome')}`, new Vector3(flight.x, 9, flight.z + 4), 'star');
    effects.burst('confetti', new Vector3(flight.x, 6, flight.z + 4), 24, 4, 1.2);
    sound.play('ching', hearing(at));
    count('tours');
    onPaid({ amount: pay, tip: 0, automated: true, at });
    void saves.saveNow();
  };
  /** Off she goes: on the ring's beat a perfect send-off, a tip on the spot. */
  const sendQueen = (flight: Flight, perfect: boolean): void => {
    flight.cleared = true;
    const top = new Vector3(flight.x, 9, flight.z + 4);
    floaters.show(`👑 ${t('queenOff')}`, top, 'star');
    if (perfect && queenStandAt) {
      const tip = Math.round(queenPay() * QUEEN_RULES.perfectTip);
      const at = layout.piles.skyqueen ?? layout.skyqueen!.pile;
      cash.add('skyqueen', tip);
      floaters.show(`⭐ ${t('queenPerfect')} +${money(tip)}`, new Vector3(queenStandAt.marshal.x, 3, queenStandAt.marshal.z), 'tip');
      effects.burst('sparkle', new Vector3(queenStandAt.marshal.x, 1.2, queenStandAt.marshal.z), 24, 4, 1);
      sound.play('reward');
      count('perfectTakeoff');
      onPaid({ amount: tip, tip, automated: false, at });
    } else sound.play('chime', hearing(flight));
    void saves.saveNow();
  };
  const workQueen = (dt: number): void => {
    if (!queenOn || !queenStandAt || !queenPad || !queenRing) return;
    // Away on a tour: home when it's done.
    const away = state.supplies['queen.away'] ?? 0;
    if (away > 0) {
      const left = Math.max(0, away - dt * boost);
      state.supplies['queen.away'] = left;
      if (left === 0) {
        airfield.call('skyqueen');
        floaters.show(`👑 ${t('queenComing')}`, new Vector3(queenStandAt.x, 9, queenMid()), 'star');
      }
    }
    const flight = airfield.parkedAt('skyqueen');
    const onPad = near(player.position, queenStandAt.marshal, AIRPORT.marshal.reach + 0.3);
    let ready = false;
    let fuelling = false;
    if (flight && !flight.cleared) {
      queenGround += dt * boost;
      fuelling = queenGround < QUEEN_RULES.ground;
      if (!fuelling) {
        ready = true;
        queenReady += dt;
        const ring = ringAt(queenReady, AIRPORT.ring);
        queenRing.show(ring.radius, ring.onTarget);
        if (onPad && !queenOnPad) sendQueen(flight, ring.onTarget);
        else if (onPad && (queenStood += dt) >= STAND_CLEAR_SECONDS) sendQueen(flight, false);
        else if (queenReady >= QUEEN_RULES.sendoff + (onPad ? 2 : 0)) sendQueen(flight, false);
      }
    }
    if (!ready) {
      queenRing.show(null);
      queenStood = 0;
    }
    queenOnPad = onPad;
    queenPad.update(dt, onPad || ready);
    // The fuel truck at her wing while she's got ready.
    if (queenFuel && queenHose) {
      queenFuel.update(dt, !!flight && !flight.cleared, fuelling);
      queenHose.visible = fuelling;
      if (fuelling && flight) {
        const from = queenFuel.nozzle(new Vector3());
        const to = new Vector3(flight.x + 6.4, PLANES.queen.size.wingY + 0.4, flight.z + 1.0);
        queenHose.position.copy(from);
        queenHose.lookAt(to);
        queenHose.scale.set(1, 1, from.distanceTo(to));
      }
    }
    // Over her gantry while she's away: when she's home.
    if (queenLabel) {
      const text = away > 0 ? `👑 ${t('queenAway', { time: formatClock(away) })}` : '';
      queenLabel.visible = text !== '';
      if (text !== queenShown) {
        queenShown = text;
        queenLabel.el.innerHTML = `<span class="flight-chip">${rich(text)}</span>`;
        labels.remeasure(queenLabel);
      }
    }
  };

  /** What of Part D moves and is solid: the hangar's middle door leaves while they're shut, the jet wash's gantry legs. */
  const movingSolids = (): Rect[] => {
    const out: Rect[] = [];
    if (hangarModel && layout.hangar && hangarModel.opened < 0.5) {
      const r = layout.hangar.hall;
      const third = (r.maxX - r.minX) / 3;
      out.push({ minX: r.minX + third, maxX: r.maxX - third, minZ: r.minZ - 0.85, maxZ: r.minZ - 0.05 });
    }
    if (jetWash && layout.jetwash) {
      const r = layout.jetwash.hall;
      for (const x of [r.minX + 0.9, r.maxX - 0.9]) out.push(around({ x, z: jetWash.gantryAt }, 0.4, 0.65));
    }
    // The catering trucks while they're at (or on their way to and from) a jet.
    for (const gate of gates) {
      if (gate.catering && gate.cateringRun && gate.cateringRun.run > 0.05) out.push(footprint('sp_catering', gate.catering.root.position.x, gate.catering.root.position.z, Math.PI / 2, 0.08));
    }
    return out;
  };

  /**
   * A plane on a stand that isn't a gate's: Mogul Air home from a trip (on its own stand, or in the hangar), a
   * star's private jet, a freighter, a jet in for a wash. None of them runs late.
   */
  const standParked = (flight: Flight): void => {
    flight.clock = flight.clockMax = 1e9;
    const k = planeOf(flight.gate);
    if (k !== null) {
      mogulHome[k] = 0;
      if (airline.routeOf(k) && airline.awayOf(k) <= 0 && (state.supplies[tripKey(k)] ?? 0) > 0) {
        state.supplies[tripKey(k)] = 0;
        homecoming(k, flight);
      }
    } else if (flight.gate === 'vip') meetStar(flight);
    else if (flight.gate === 'cargo') freighterParked(flight);
    else if (flight.gate === 'jetwash') {
      wash = { flight, progress: 0 };
      sound.play('splash', hearing(flight) * 0.9);
    }
    else if (flight.gate === 'skyqueen') {
      queenGround = 0;
      queenReady = 0;
      if ((state.supplies['queen.trip'] ?? 0) > 0) {
        state.supplies['queen.trip'] = 0;
        queenHome(flight);
      }
    }
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
    if (effects_?.pier) buildPier(animate);
    if (effects_?.tower) buildTower(animate);
    if (effects_?.shuttle) buildShuttle(animate);
    if (effects_?.airline) buildMogul(animate);
    if (effects_?.vip) buildVip(animate);
    if (effects_?.cargo) buildCargo(animate);
    if (effects_?.hangar) buildHangar(animate);
    if (effects_?.fleet) buildFleet();
    if (effects_?.runway2) buildRunway2(animate);
    if (effects_?.jetwash) buildJetwash(animate);
    if (effects_?.skyqueen) buildQueen(animate);
    if (effects_?.sorter) buildSorter(animate);
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

  void loadPeople([...CHARACTERS.visitors, CHARACTERS.staff.seller, CHARACTERS.staff.attendant, CHARACTERS.staff.dispatcher, CHARACTERS.staff.fueler, CHARACTERS.staff.caterer, CHARACTERS.staff.barista, CHARACTERS.staff.dutyclerk, CHARACTERS.staff.controller, CHARACTERS.staff.marshal, CHARACTERS.staff.celebrity, CHARACTERS.staff.photographer, CHARACTERS.staff.cargocrew, CHARACTERS.staff.engineer, CHARACTERS.staff.manager]).then(() => {
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
      const done = current.pads.find((p) => p.id === id)?.effects;
      if (done?.endOfContent) {
        flag(`ended:${current.id}`);
        showEndScreen(root, () => meta.screenClosed(), { title: t('endTitleSkyport'), body: t('endBodySkyport') });
      }
      // The land for the next town: off the hero goes, once it has popped in. A town this version doesn't have
      // yet ends the chapter instead.
      const next = done?.travel;
      if (next) {
        flag(`ended:${current.id}`);
        if (townIds().includes(next)) setTimeout(() => void travelTo(next), TRAVEL_DELAY_MS);
        else showEndScreen(root, () => meta.screenClosed(), { title: t('endTitleSkyport'), body: t('endBodySkyport') });
      }
    },
    (id) => {
      // Under construction: its site and countdown (the Sky Queen's stand, cranes and all).
      sites.show(id);
      if (id === 'skyqueen') startQueenBuild();
      stage.refreshShadows();
      view.refit();
      void saves.saveNow();
    },
  );
  const sites = new ConstructionSites(stage.scene, labels, layout);
  for (const id of Object.keys(state.building)) sites.show(id);
  startQueenBuild();
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

  // Taxis on the road in front.
  // (Three to each stopping place: the next pulls in as the one before pulls out, another on its way.)
  const taxis: Taxi[] = [...layout.kerb, ...layout.kerb, ...layout.kerb].map((kerb) => {
    const car = taxiCar();
    car.mesh.visible = false;
    // Driving west, nose to -x.
    car.mesh.rotation.y = -Math.PI / 2;
    stage.scene.add(car.mesh);
    return { car, state: 'away' as const, x: TAXI_FROM, kerb, riders: 0, timer: 0, v: 0, swing: 0 };
  });
  const taxiZ = layout.roadZ - 1.7;
  /** Everything on the road in front now (but `except`): the taxis, the shuttle bus, the limousine. */
  const roadUsers = (except: unknown): RoadUser[] => {
    const users: RoadUser[] = [];
    for (const x of taxis) if (x !== except && x.state !== 'away') users.push({ x: x.x, half: TAXI_HALF, lane: 'west', speed: x.state === 'stop' ? 0 : x.v });
    if (bus && shuttle !== except && shuttle.state !== 'away') {
      const lane: Lane = shuttle.state === 'stop' ? 'bay' : shuttle.state === 'turn' ? 'both' : shuttle.state === 'out' ? 'east' : 'west';
      users.push({ x: shuttle.x, half: BUS_HALF + (lane === 'both' ? 2 : 0), lane, speed: shuttle.v });
    }
    if (limo && limoRun !== except && limoRun.state !== 'away') {
      const lane: Lane = limoRun.state === 'wait' ? 'bay' : limoRun.state === 'turn' ? 'both' : limoRun.state === 'out' ? 'east' : 'west';
      users.push({ x: limoRun.x, half: LIMO_HALF + (lane === 'both' ? 2.3 : 0), lane, speed: limoRun.v });
    }
    return users;
  };
  let spawnTimer = 2;
  const updateTaxis = (dt: number): void => {
    const rate = (1 + unlockedSum(state, (e) => e.arrivalBonus)) * (1 + (state.stars - TUNING.stars.start) * TUNING.stars.arrivalPerStar) * arrivals.rateFactor * boost;
    spawnTimer -= dt * rate;
    const taxi = taxis.find((x) => x.state === 'away' && !taxis.some((y) => y.kerb === x.kerb && (y.state === 'in' || y.state === 'stop' || (y.state === 'out' && y.x > y.kerb.x - 7))));
    const coming = taxis.reduce((sum, x) => sum + (x.state === 'away' ? 0 : x.riders), 0);
    if (spawnTimer <= 0 && taxi && peopleReady && passengers.all.length + coming < maxPassengers() && passengers.line.length + coming < layout.desk.queue.length) {
      const [low, high] = AIRPORT.passengers.group as [number, number];
      taxi.riders = Math.round(low + Math.random() * (high - low));
      taxi.state = 'in';
      taxi.x = TAXI_FROM;
      taxi.v = 16;
      taxi.swing = 0;
      taxi.car.mesh.visible = true;
      spawnTimer = AIRPORT.passengers.spawnSeconds * taxi.riders;
    }
    for (const x of taxis) {
      if (x.state === 'away') continue;
      // (Each keeps its distance from whatever's ahead in the near lane, and swings out past the limousine.)
      const self: RoadUser = { x: x.x, half: TAXI_HALF, lane: 'west' };
      const others = x.state === 'stop' ? [] : roadUsers(x);
      const limit = x.state === 'stop' ? -Infinity : westLimit(others, self);
      if (x.state === 'in') {
        const left = x.x - Math.max(x.kerb.x, limit);
        x.v = ease(x.v, left > 0.02 ? Math.max(2.5, Math.min(16, left * 1.7)) : 0, dt, 20);
        x.x -= Math.min(Math.max(0, left), x.v * dt);
        if (x.x - x.kerb.x < 0.05) {
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
        const room = x.x - limit;
        x.v = ease(x.v, Math.min(16, 3 + (x.kerb.x - x.x) * 2, Math.max(0, room - 0.2) * 2), dt, 12);
        x.x -= Math.min(Math.max(0, room), x.v * dt);
        if (x.x < TAXI_TO) {
          x.state = 'away';
          x.car.mesh.visible = false;
        }
      }
      x.swing += ((x.state === 'stop' ? 0 : swingOut(others, self)) - x.swing) * (1 - Math.exp(-dt * 3));
      x.car.mesh.position.set(x.x, 0, taxiZ + SWING * x.swing);
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
    const fare = AIRPORT.planes[flight.kind].fare * levelFactor(UPGRADES.kinds.price, level(`${gate.key}.price`)) * payBonus() * (nightFlight ? 1 + AIRPORT.night.pay : 1) * (flight.card?.fare ?? 1) * (1 + airline.fareBonus);
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
    if (flight.kind === 'wide') count('widebodies');
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
      const tanks = AIRPORT.fuel.seconds * (parked.kind === 'jet' ? 1.6 : parked.kind === 'wide' ? 2.2 : 1) * levelFactor(UPGRADES.kinds.speed, level(`${gate.key}.speed`));
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
        const side = spot.truck.x > spot.x ? 1 : -1;
        const to =
          flight!.kind === 'wide'
            ? new Vector3(spot.x + side * 5.0, WIDE.wingY, flight!.z - 1.43)
            : flight!.kind === 'jet'
              ? new Vector3(spot.x + side * 3.5, JET.wingY, flight!.z - 1.0)
              : new Vector3(spot.x - 3.5, PROP.wingY - 0.05, flight!.z + 0.3);
        gate.hose.position.copy(from);
        gate.hose.lookAt(to);
        gate.hose.scale.set(1, 1, from.distanceTo(to));
      }
    }
    // Cases: the sorter's belt loader puts them aboard; before it, the hero's stack into the hold, one at a time.
    gate.loader?.update(dt, sortInto(dt, gate, parked));
    const wantsCases = !!parked && parked.cases < parked.needsCases && !sorter;
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
    if (gate.catering && gate.cateringRun) {
      // The catering truck: up to the back door once the jet's parked and wants meals, its box up at the door
      // till they're aboard, then away past the wingtip before the jet moves (it's under the wing's way).
      const drive = gate.cateringRun;
      const wanted = !!flight && flight.phase === 'parked' && !flight.cleared && flight.meals < flight.needsMeals;
      drive.run = Math.max(0, Math.min(1, drive.run + ((wanted ? 1 : -1) * dt) / CATERING_DRIVE_SECONDS));
      const k = drive.run * drive.run * (3 - 2 * drive.run);
      gate.catering.root.position.set(drive.away.x + (drive.door.x - drive.away.x) * k, 0, drive.away.z + (drive.door.z - drive.away.z) * k);
      gate.catering.fade(Math.min(1, drive.run / 0.3));
      gate.catering.update(dt, wanted && drive.run >= 1, (flight?.kind === 'wide' ? WIDE.sill : JET.sill) - 1.12);
    }
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
    const needsCases = (f: Flight): boolean => !sorter && f.cases < f.needsCases && beltCases.some((c) => caseFits(c, f.gate));
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
    const k = planeOf(flight.gate);
    if (k !== null) {
      const route = airline.routeOf(k);
      if (flight.cleared) return `<span class="flight-chip is-go">${rich(`✈️ ${t('mogulOff', { city: route ? t(`city_${route.id}` as StringKey) : '' })}`)}</span>`;
      // (In the hangar: how far its service has got.)
      if (flight.gate === 'hangar' && hangarJob && hangarJob.progress < 1) return `<span class="flight-chip">${rich(`🔧 ${t('hangarChip')} ${Math.floor(hangarJob.progress * 100)}%`)}</span>`;
      const left = Math.max(0, Math.ceil(AIRPORT.airline.waitSeconds - (mogulHome[k] ?? 0)));
      const name = fleetSize() > 1 ? `${t('mogulChip')} ${k + 1}` : t('mogulChip');
      const worn = airline.worn(k) ? `<span class="flight-chip">${rich('🔧')}</span>` : '';
      return `<span class="flight-chip">${rich(`✈️ ${name}`)}</span><span class="flight-chip is-go">${rich(`🗺️ ${t('mogulPick')}`)}</span>${route ? `<span class="flight-chip">${rich(`🔁 ${route.icon} ${left}`)}</span>` : ''}${worn}`;
    }
    if (flight.gate === 'cargo') {
      if (flight.cleared) return `<span class="flight-chip is-go">${rich(`📦 ${t('cargoLoaded')}`)}</span>`;
      return `<span class="flight-chip">${rich(`✈️ ${t('cargoChip')}`)}</span><span class="flight-chip${flight.cases >= flight.needsCases ? ' is-done' : ''}">${rich(`📦 ${flight.cases}/${flight.needsCases}`)}</span>`;
    }
    if (flight.gate === 'skyqueen') {
      if (flight.cleared) return `<span class="flight-chip is-go">${rich(`👑 ${t('queenOff')}`)}</span>`;
      if (queenGround < QUEEN_RULES.ground) return `<span class="flight-chip">${rich(`👑 ${t('queenChip')}`)}</span><span class="flight-chip">${rich(`⛽ ${t('queenGetReady')} ${Math.floor((queenGround / QUEEN_RULES.ground) * 100)}%`)}</span>`;
      const share = Math.max(0, 1 - queenReady / QUEEN_RULES.sendoff);
      return `<span class="flight-clock ${share < 0.3 ? 'is-low' : ''}" style="--left:${(share * 100).toFixed(0)}%">${Math.ceil(share * QUEEN_RULES.sendoff)}</span><span class="flight-chip is-go">${rich(`👑 ${t('queenWave')}`)}</span>`;
    }
    if (flight.gate === 'jetwash') {
      if (flight.cleared) return `<span class="flight-chip is-go">${rich(`✨ ${t('washDone')}`)}</span>`;
      return `<span class="flight-chip">${rich(`💦 ${t('washChip')} ${Math.floor((wash?.progress ?? 0) * 100)}%`)}</span>`;
    }
    if (flight.gate === 'vip') {
      if (!star) return `<span class="flight-chip is-go">${rich('🌟')}</span>`;
      const share = star.celeb.patience / AIRPORT.vip.patience;
      let html = `<span class="flight-tag">${rich('🌟')}</span><span class="flight-clock ${share < 0.25 ? 'is-low' : ''}" style="--left:${(share * 100).toFixed(0)}%">${Math.ceil(star.celeb.patience)}</span>`;
      for (const wish of WISHES) html += `<span class="flight-chip${star.celeb.granted.has(wish) ? ' is-done' : ''}">${rich(`${WISH_ICON[wish]} ${star.celeb.granted.has(wish) ? '✓' : t(`wish_${wish}` as StringKey)}`)}</span>`;
      return html;
    }
    if (flight.cleared) return `<span class="flight-chip is-go">${rich(`✈️ ${t(flight.phase === 'parked' ? 'flightHolding' : 'flightCleared')}`)}</span>`;
    const left = Math.ceil(flight.clock);
    const share = flight.clockMax > 0 ? flight.clock / flight.clockMax : 0;
    const clockClass = flight.late ? 'is-late' : share < 0.25 ? 'is-low' : '';
    // (Its gate's number, shown only small at the screen's edge.)
    let html = `<span class="flight-tag">${Object.keys(layout.gates).indexOf(flight.gate) + 1}</span>`;
    html += `<span class="flight-clock ${clockClass}" style="--left:${(share * 100).toFixed(0)}%">${flight.late ? '!' : left}</span>`;
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
      door: parked && !flight.cleared && flight.gate !== 'jetwash' ? 1 : 0,
      hold: parked && !flight.cleared && flight.needsCases > 0 ? 1 : 0,
      galley: parked && !flight.cleared && flight.needsMeals > 0 ? 1 : 0,
      flaps: landing ? 1 : leaving ? 0.5 : 0,
      gear: (flight.phase === 'climb' && flight.y > 5) || (flight.phase === 'approach' && flight.approach < 0.2) ? 0 : 1,
      steer: onGround ? steer : 0,
      roll,
      taxiLight: onGround && !parked && flight.engines > 0.1,
    };
  };
  /** The stands' labels' rows (Mogul Air's planes and the hangar's, the private jet's and the wash's, the freighter's). */
  const STAND_ROWS: Record<string, number> = { mogul: 4, mogul2: 4, hangar: 4, vip: 5, jetwash: 5, cargo: 6, skyqueen: 4 };
  const drawFlights = (dt: number): void => {
    for (const flight of airfield.flights) {
      let v = views.get(flight);
      if (!v) {
        const model = new PlaneModel(planeOf(flight.gate) !== null || flight.gate === 'skyqueen' ? mogulLivery : LIVERIES[flight.livery % LIVERIES.length]!, flight.kind);
        stage.scene.add(model.root, model.shadow);
        const el = document.createElement('div');
        el.className = 'flight-label';
        const at = new Vector3();
        const label = labels.add(el, at);
        // (It fades while it's over the hero, so it never hides them, and keeps clear of the other planes' labels.)
        label.fade = true;
        label.avoid = true;
        v = { model, label, at, shown: '', lateSaid: false, last: null };
        views.set(flight, v);
      }
      v.model.root.position.set(flight.x, flight.y, flight.z);
      v.model.root.rotation.set(-flight.pitch, flight.heading, -flight.bank);
      v.model.update(dt, pose(flight, v, dt));
      // (Low over its back: clear of the counters along the top of the screen, and of the hints by its nose.)
      // (Each gate's a row lower than the one before, so two side by side never overlap.)
      const row = layout.gates[flight.gate] ? Object.keys(layout.gates).indexOf(flight.gate) : (STAND_ROWS[flight.gate] ?? 5);
      v.at.set(flight.x, flight.kind === 'wide' ? 6.4 : flight.kind === 'jet' ? 5.0 : 4.0, flight.z + 0.6 + (row % 4) * 2.6);
      v.label.visible = flight.phase === 'parked';
      // (Off the screen, a gate's clock and a star's patience are kept in sight, small, at the screen's edge
      // towards them: just the clock and the gate's number. The other stands' labels go off with their planes.)
      v.label.edge = !flight.cleared && (!!layout.gates[flight.gate] || (flight.gate === 'vip' && !!star));
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
  // The labels kept clear of the HUD and the side buttons, fading over the hero; a gate's clock off the screen
  // kept clear of the arrows at the edges and of the chips under the counters (where they are, looked at now
  // and then: reading the page's layout every frame is slow on phones).
  const keepOut: Box[] = [];
  const chipBoxes: Box[] = [];
  let chipsLookIn = 0;
  const placeLabels = (dt: number): void => {
    chipsLookIn -= dt;
    if (chipsLookIn <= 0) {
      chipsLookIn = 0.5;
      chipBoxes.length = 0;
      const origin = root.getBoundingClientRect();
      chips.boxes(origin, chipBoxes);
      // (The side buttons: below them, the screen's edge is free.)
      const bar = document.querySelector('.side-bar')?.getBoundingClientRect();
      if (bar && bar.width > 0) chipBoxes.push({ x: bar.left - origin.left + bar.width / 2, y: bar.top - origin.top + bar.height / 2, hw: bar.width / 2 + 4, hh: bar.height / 2 + 4 });
    }
    keepOut.length = 0;
    keepOut.push(...chipBoxes);
    if (pointer.showing) keepOut.push(pointer.box);
    const jobArrow = jobs.pointerBox;
    if (jobArrow) keepOut.push(jobArrow);
    labels.update(stage.camera, stage.size.width, stage.size.height, { top: view.topInset, right: 0, keepOut, hero: player.mesh.position });
  };
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
    // A star's wishes (always the hero's to grant): the carpet, a glass from the bar to the star, the limousine.
    if (star && star.stage === 'waiting') {
      const granted = star.celeb.granted;
      if (!granted.has('carpet')) return { at: layout.vip.carpet, text: 'guideCarpet' };
      if (!granted.has('champagne')) return heroCarry.count('champagne') > 0 && star.member ? { at: { x: star.member.x + 1.0, z: star.member.z }, text: 'guideStar' } : { at: barSpot(), text: 'guideChampagne' };
      if (!granted.has('limo')) return { at: limoSpot(), text: 'guideLimo' };
    }
    // Mogul Air's first route (each plane's).
    for (let k = 0; k < fleetSize(); k++) if (!airline.routeOf(k) && canSend(k)) return { at: layout.mogul.board, text: 'guideRoutes' };
    // A freighter's crates (until there's a cargo crew): off the dock, onto the loader at its door.
    if (!built('cargocrew') && layout.cargo && freighter()) {
      if (heroCarry.count('cargo') > 0) return { at: layout.cargo.drop, text: 'guideLoad' };
      if (dockCrates && dockCrates.stack.length > 0 && !heroCarry.full) return { at: layout.cargo.dock, text: 'guideCrates' };
    }
    // The Sky Queen ready to go, the first couple of times: wave her off from her pad.
    const queenFlight = queenOn && queenStandAt ? airfield.parkedAt('skyqueen') : null;
    if (queenFlight && queenStandAt && !queenFlight.cleared && queenGround >= QUEEN_RULES.ground && (state.counts.tours ?? 0) < 2) return { at: queenStandAt.marshal, text: 'guideSendOff' };
    // A plane in the hangar (until there's a mechanic): service it.
    if (!built('engineer') && layout.hangar && hangarJob && hangarJob.progress < 1 && airfield.parkedAt('hangar')) return { at: layout.hangar.service, text: 'guideService' };
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
    // A jet in the wash, the first few times: the controls make it quicker.
    if (wash && layout.jetwash && (state.counts.washes ?? 0) < 3 && !near(player.position, layout.jetwash.control, 1.1)) return { at: layout.jetwash.control, text: 'guideJetWash' };
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
    tower: { badge: () => (built('tower') ? (fog.down ? '🌫️' : '') : null), open: () => openTower() },
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
        movingSolids,
        route,
        crew: () => [agent, handler, dispatcher, fueler, runner, barista, clerk, controller, marshal, cargoCrew, engineer, manager],
        terminal: () => ({ hatch: hatchTrays?.stack.length ?? 0, cafe: cafeTrays?.stack.length ?? 0, belt: [...beltCases], dark }),
        partC: () => ({
          cards: towerQueue.cards.map((c) => c.kind),
          chosen: towerQueue.chosen,
          fog: fog.down,
          route: airline.route?.id ?? null,
          away: airline.away,
          opened: airline.openedCount,
          souvenirs: airline.souvenirCount,
          star: star ? { stage: star.stage, granted: [...star.celeb.granted], patience: star.celeb.patience } : null,
          vipTimer,
          shuttle: shuttle.state,
          limo: limoRun.state,
          road: roadUsers(null).map((u) => `${u.lane}:${Math.round(u.x)}`),
        }),
        partD: () => {
          const freight = airfield.at('cargo');
          return {
            dock: dockCrates?.stack.length ?? 0,
            freighter: freight ? { phase: freight.phase, cases: freight.cases, needs: freight.needsCases } : null,
            hangar: hangarJob ? { ...hangarJob } : null,
            wear: [airline.wearOf(0), airline.wearOf(1)],
            fresh: [airline.freshOf(0), airline.freshOf(1)],
            away: [airline.awayOf(0), airline.awayOf(1)],
            routes: [airline.routeOf(0)?.id ?? null, airline.routeOf(1)?.id ?? null],
            wash: wash ? wash.progress : null,
            washTimer,
            runway2: airfield.runway2,
            crew: { cargo: cargoCrew?.job ?? null, engineer: engineer?.job ?? null, manager: manager ? manager.leg : null },
          };
        },
        washNow: () => void (washTimer = 0),
        partE: () => ({
          building: state.building.skyqueen ? Math.round(secondsLeft(state.building.skyqueen, Date.now())) : null,
          queen: queenOn,
          away: state.supplies['queen.away'] ?? 0,
          ground: queenGround,
          ready: queenReady,
          tours: state.counts.tours ?? 0,
          flight: airfield.flights.find((f) => f.gate === 'skyqueen')?.phase ?? null,
        }),
        /** Finishes the Sky Queen's build now (or brings her home from her tour). */
        queenNow: () => {
          if (state.building.skyqueen) state.building.skyqueen.endsAt = Date.now();
          else if ((state.supplies['queen.away'] ?? 0) > 0) state.supplies['queen.away'] = 0.01;
        },
        /** Wears plane `k` out (it comes home to the hangar next). */
        wearOut: (k: number) => void (state.supplies[k ? 'air.wear.2' : 'air.wear'] = 5),
        grantWish: (wish: Wish) => grant(wish),
        fogNow: () => void (fog.timer = 0),
        vipNow: () => void (vipTimer = 0),
        chooseCard: (i: number) => towerQueue.choose(i),
        flyRoute: (id: string) => flyRoute(id),
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
  /** Where the camera looks when it eases back to show a plane: the first runway, or the second. */
  let watchZ = layout.runway.z + 8;
  let hallFullSaid = 0;
  const loop = new Loop((dt) => {
    clock.advance(dt);
    state.playSeconds += dt;
    const hulls = airfield.flights.map(hull).filter((r): r is Rect => !!r);
    player.update(dt, input.read(), [...solids, ...hulls, ...airfield.flights.flatMap(parkedSolids), ...movingSolids(), ...decor.solids(), ...jobs.solids()], view.walkable);
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
    workMogul(dt);
    workVip(dt);
    workMarshal(dt);
    workCargo(dt);
    workCargoCrew(dt);
    workHangar(dt);
    workEngineer(dt);
    workJetwash(dt);
    workManager(dt);
    finishBuilds();
    updateQueenBuild(dt);
    workQueen(dt);
    sites.update(state, Date.now());
    updateShuttle(dt);
    towerModel?.update(dt);
    controller?.avatar.update(dt);
    sorter?.update(dt, gates.some((g) => !!g.loader && (airfield.parkedAt(g.key)?.cases ?? 0) < (airfield.parkedAt(g.key)?.needsCases ?? 0)));
    // Fog, once there's a tower: now and then nothing can land until it lifts (the planes waiting land one after another).
    if (towerModel) {
      const turn = fog.update(dt);
      if (turn === 'in') {
        flag('fog:skyport');
        floaters.show(`🌫️ ${t('fogIn')}`, new Vector3(player.position.x, 4, player.position.z), 'star');
      } else if (turn === 'out') floaters.show(`☀️ ${t('fogOut')}`, new Vector3(player.position.x, 4, player.position.z), 'star');
      airfield.paused = fog.down;
    }
    chips.set('fog', fog.down && towerModel ? `🌫️ ${t('fogIn')}` : null);
    agent?.avatar.update(dt);
    barista?.avatar.update(dt);
    clerk?.avatar.update(dt);
    passengers.update(dt, deskService(), boost, shopService);
    cafe?.update(dt);
    dutyFree?.update(dt);
    security?.update(dt, passengers.lineAt('security').length > 0);
    pierLane?.update(dt, passengers.lineAt('pierSecurity').length > 0);
    // Night and day, once the runway lights are in: the look, the lamps glowing, the lights on the field.
    if (built('lights')) nightTime += dt;
    dark = built('lights') ? nightAt(nightTime, AIRPORT.night) : 0;
    if (built('lights') || towerModel) stage.setLook(mixLook(mixLook(SKY_LOOK, NIGHT_LOOK, dark), FOG_LOOK, fog.level * 0.85));
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
    belt?.update(dt, beltCases.length > 0 && airfield.flights.some((f) => f.phase === 'parked' && !!layout.gates[f.gate] && f.cases < f.needsCases));
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
    // (Towards the runway the plane's on: a take-off from the second runway, once there is one, and no landing on the first.)
    const second = layout.runway2;
    const onTwo =
      !!second &&
      airfield.runway2 &&
      airfield.flights.some((f) => (f.phase === 'lineup' || f.phase === 'takeoff' || (f.phase === 'climb' && f.y < 24)) && Math.abs(f.z - second.z) < 3) &&
      !airfield.flights.some((f) => (f.phase === 'approach' && f.approach > 0.3) || f.phase === 'rollout');
    watchZ += ((onTwo ? second.z : layout.runway.z) + 8 - watchZ) * (1 - Math.exp(-dt * 1.2));
    const focusZ = player.position.z + (watchZ - player.position.z) * (wide ? 0.62 : 0.45) * showShift;
    view.update(dt, { x: player.position.x, z: focusZ });
    jobs.update(dt, stage.camera, stage.size.width, stage.size.height, { top: view.topInset, right: SIDE_BAR_PX });
    player.scrubbing = jobs.working;
    blobShadows.update();
    carriedItems.update();
    stage.render();
    const step = guide();
    hint = step;
    hand.point(step);
    const next = pads.next;
    const goal = step?.at ?? (next && state.cash >= next.owed ? next.at : null);
    pointer.update(stage.camera, stage.size.width, stage.size.height, goal, { top: view.topInset, right: SIDE_BAR_PX });
    placeLabels(dt);
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
      placeLabels(0);
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
