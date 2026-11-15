// An airport (Chapter 4, Skyport International): planes land, are turned round at their gates and leave
// full, on time. Passengers come by taxi and buy their tickets at the check-in desk (the hero sells them,
// later the check-in agent), wait by their gate and board when it's opened. A plane parks with a clock
// over it: open its gate, fill its tanks and load its cases (once those are bought), then step onto the
// ramp pad in front of its nose to clear it for take-off (as the ring closes, for a perfect one). Every
// seat pays its fare, more for a full plane and for one that beats its clock, and each on-time flight in
// a row pays a little more than the last.
// The shared pieces (the player, pads, cash piles, upgrades, the camera, the side bar, the hero's career
// and the town's story) are the same as in the other towns.
import { Vector3, type Object3D } from 'three';
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
import { createStoryline } from './storyline';
import { LotView, SIDE_BAR_PX } from './view';
import * as platform from '../platform/youtube';
import type { SoundManager } from '../audio/sound';
import type { Look, Stage } from '../render/stage';
import { withShadows } from '../render/stage';
import { CameraRig } from '../render/cameraRig';
import { Particles } from '../render/effects/particles';
import { Ambience, airfield as airfieldGround } from '../render/airfield';
import { loadPeople } from '../render/assets';
import { blobShadows } from '../render/models/actors';
import {
  CasePile,
  LIVERIES,
  PROP,
  PROP_SOLID,
  PlaneModel,
  STAIRS,
  TimingRing,
  Windsock,
  airStairs,
  baggageBelt,
  checkinDesk,
  entranceSign,
  fuelHose,
  fuelTruck,
  gateBarrier,
  hallModel,
  hallWalls,
  loungeSeats,
  podium,
  seatAt,
  taxiModel,
} from '../render/models/airport';
import { PadModel } from '../render/models/padModel';
import { PersonAvatar } from '../render/models/person';
import { TownDecor } from '../render/townDecor';
import { Airfield, flightPay, ringAt, type Flight } from '../systems/airport';
import { unlockedSum } from '../systems/arrivals';
import { perk } from '../systems/career';
import { CashSystem } from '../systems/cash';
import { Carrier, carriedItems } from '../systems/carry';
import { levelFactor, levelStep, money, nextStars, tipFor } from '../systems/economy';
import { GuideHand, type GuideStep } from '../systems/guide';
import { Input } from '../systems/input';
import { IncomeTracker } from '../systems/offline';
import { PadSystem } from '../systems/pads';
import { Passengers, type Passenger } from '../systems/passengers';
import { Player, pushOut } from '../systems/player';
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

const near = (a: Point, b: Point, reach = SPOT_REACH): boolean => Math.abs(a.x - b.x) < reach && Math.abs(a.z - b.z) < reach;
/** Where the hero stands to open a gate: in front of its podium. */
const podiumFront = (spot: GateSpot): Point => ({ x: spot.podium.x - 0.3, z: spot.podium.z + 0.8 });
const around = (at: Point, hw: number, hd = hw): Rect => ({ minX: at.x - hw, maxX: at.x + hw, minZ: at.z - hd, maxZ: at.z + hd });

/** A taxi on the road in front: it pulls up, sets its passengers down one by one, and drives off. */
interface Taxi {
  mesh: Object3D;
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
  truck: Object3D | null;
  hose: Object3D | null;
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
  stage.scene.add(withShadows(hallModel(layout)));
  const desk = checkinDesk();
  desk.position.set(layout.desk.at.x, 0, layout.desk.at.z);
  stage.scene.add(withShadows(desk));
  const windsock = new Windsock();
  windsock.root.position.set(layout.apron.minX + 2.5, 0, layout.taxiway.z + layout.taxiway.half + 2.6);
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
  const heroCarry = new Carrier<'case'>(player.mesh, () => player.position, () => TUNING.supplies.carryBase + levelStep(UPGRADES.kinds.carry, level('player.carry')));
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
  const solids: Rect[] = [...hallWalls(layout), { minX: layout.desk.at.x - 1.55, maxX: layout.desk.at.x + 1.55, minZ: layout.desk.at.z - 0.5, maxZ: layout.desk.at.z + 0.5 }];
  for (const tree of layout.trees) solids.push(around(tree, 0.32 * (tree.size ?? 1)));
  solids.push(around(entranceSign(layout), 3.8, 0.3));
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
    },
    onParked: (flight) => {
      flight.needsFuel = built('fuel');
      flight.needsCases = built('bags') ? AIRPORT.bags.cases : 0;
      beltCases += flight.needsCases;
      if (flight.marshalled) {
        flight.clock += AIRPORT.marshal.clockSeconds;
        flight.clockMax += AIRPORT.marshal.clockSeconds;
        floaters.show(`👍 ${t('niceParking')}`, new Vector3(flight.spot.marshal.x, 2.4, flight.spot.marshal.z), 'star');
        effects.burst('sparkle', new Vector3(flight.spot.marshal.x, 1.2, flight.spot.marshal.z), 12, 3, 0.8);
        sound.play('sparkle');
      }
    },
    onPushback: (flight) => sound.play('honk', hearing(flight) * 0.6),
    onAirborne: (flight) => sound.play('whoosh', Math.max(0.35, hearing(flight))),
    onGone: (flight) => {
      const view = views.get(flight);
      if (!view) return;
      view.model.dispose();
      labels.remove(view.label);
      views.delete(flight);
    },
  });
  /** Cases on the belt's cart, waiting to be carried out. */
  let beltCases = 0;

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
  });

  // The crew: the check-in agent behind the desk, the ground handler out on the apron.
  let agent: CrewMember | null = null;
  let handler: (CrewMember & { carrier: Carrier<'case'>; job: 'idle' | 'toBelt' | 'toHold' | 'toFuel' | 'fuelling' | 'home'; flight: Flight | null; wait: number }) | null = null;
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
        carrier: new Carrier<'case'>(avatar.root, () => ({ x: member.x, z: member.z }), () => 2 + levelStep(UPGRADES.kinds.staffCarry, level('handler.staffCarry'))),
        job: 'idle' as const,
        flight: null,
        wait: 0,
      });
    }
  };

  // The gates: what stands at each once it's built, and a barrier across its door until then.
  const gates: GateView[] = [];
  const barriers = new Map<string, Object3D>();
  for (const [key, spot] of Object.entries(layout.gates)) {
    if (built(key) || current.pads.find((p) => p.id === key)?.cost === 0) continue;
    const barrier = gateBarrier(spot);
    barriers.set(key, barrier);
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
    gate.truck = show(fuelTruck(), animate);
    gate.truck.position.set(gate.spot.truck.x, 0, gate.spot.truck.z);
    gate.hose = fuelHose();
    stage.scene.add(gate.hose);
    solids.push({ minX: gate.spot.truck.x - 1.2, maxX: gate.spot.truck.x + 1.2, minZ: gate.spot.truck.z - 3.2, maxZ: gate.spot.truck.z + 3.2 });
  };
  const addSeats = (spot: GateSpot, animate: boolean): void => void show(loungeSeats(spot.lounge), animate);
  const openGate = (key: string, animate: boolean): void => {
    const spot = layout.gates[key];
    if (!spot || gates.some((g) => g.key === key)) return;
    barriers.get(key)?.removeFromParent();
    const stairs = show(airStairs(), animate);
    stairs.position.set(spot.stairsFoot.x, 0, spot.stairsFoot.z);
    solids.push({ minX: spot.stairsFoot.x - STAIRS.run - 0.1, maxX: spot.stairsFoot.x - 0.2, minZ: spot.stairsFoot.z - 0.75, maxZ: spot.stairsFoot.z + 0.75 });
    const stand = show(podium(), animate);
    stand.position.set(spot.podium.x, 0, spot.podium.z);
    solids.push(around(spot.podium, 0.7, 0.35));
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
    const gate: GateView = { key, spot, pad, ring, fuelPad: spotPad(spot.fuelSpot, 1.5, 0xff8a3d), holdPad: spotPad(spot.hold, 1.5, 0xff5fa8), doorLabel, truck: null, hose: null, onPad: false, stood: 0 };
    gates.push(gate);
    if (built('fuel')) addTruck(gate, animate);
    if (built('seats')) addSeats(spot, animate);
    // The first gate's first plane is nearly down as the hero arrives; a new gate's comes after a moment.
    airfield.openGate(key, animate ? 2 : gates.length === 1 ? 0 : 6);
  };

  let belt: Object3D | null = null;
  const casePile = new CasePile();
  const addBuilt = (id: string, animate: boolean): void => {
    const effects_ = current.pads.find((p) => p.id === id)?.effects;
    if (effects_?.gate) openGate(effects_.gate, animate);
    if (effects_?.fuel) for (const gate of gates) addTruck(gate, animate);
    if (effects_?.lounge) {
      for (const gate of gates) addSeats(gate.spot, animate);
      passengers.seats = seatAt;
      passengers.reseat();
    }
    if (effects_?.bags && !belt) {
      belt = show(baggageBelt(), animate);
      belt.position.set(layout.belt.at.x, 0, layout.belt.at.z);
      casePile.root.position.set(layout.belt.at.x, 0, layout.belt.at.z);
      stage.scene.add(casePile.root);
      solids.push({ minX: layout.belt.at.x - 0.7, maxX: layout.belt.at.x + 0.7, minZ: layout.belt.at.z - 0.2, maxZ: layout.belt.at.z + 1.2 });
    }
    if (effects_?.staff) hire(id);
    stage.refreshShadows();
  };
  // The check-in desk and Gate 1 come with the airfield: there the moment the hero arrives.
  for (const pad of current.pads) if (pad.cost === 0 && !built(pad.id)) state.unlocked.push(pad.id);
  for (const id of state.unlocked) addBuilt(id, false);
  // The first plane's on short final as the hero arrives.
  if (built('gate1')) airfield.send('gate1', 0.5);

  void loadPeople([...CHARACTERS.visitors, CHARACTERS.staff.seller, CHARACTERS.staff.attendant]).then(() => {
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
  const taxis: Taxi[] = layout.kerb.map((kerb) => {
    const mesh = taxiModel();
    mesh.visible = false;
    mesh.rotation.y = Math.PI;
    stage.scene.add(mesh);
    return { mesh, state: 'away' as const, x: 60, kerb, riders: 0, timer: 0 };
  });
  const taxiZ = layout.roadZ - 1.7;
  let spawnTimer = 2;
  const updateTaxis = (dt: number): void => {
    const rate = (1 + unlockedSum(state, (e) => e.arrivalBonus)) * (1 + (state.stars - TUNING.stars.start) * TUNING.stars.arrivalPerStar) * arrivals.rateFactor * boost;
    spawnTimer -= dt * rate;
    const taxi = taxis.find((x) => x.state === 'away');
    const coming = taxis.reduce((sum, x) => sum + (x.state === 'away' ? 0 : x.riders), 0);
    if (spawnTimer <= 0 && taxi && peopleReady && passengers.all.length + coming < AIRPORT.passengers.max && passengers.line.length + coming < layout.desk.queue.length) {
      const [low, high] = AIRPORT.passengers.group as [number, number];
      taxi.riders = Math.round(low + Math.random() * (high - low));
      taxi.state = 'in';
      taxi.x = 62;
      taxi.mesh.visible = true;
      spawnTimer = AIRPORT.passengers.spawnSeconds * taxi.riders;
    }
    for (const x of taxis) {
      if (x.state === 'away') continue;
      if (x.state === 'in') {
        const left = x.x - x.kerb.x;
        x.x -= Math.min(left, dt * Math.max(2.5, Math.min(13, left * 1.6)));
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
        x.x -= dt * Math.min(13, 3 + (x.kerb.x - x.x) * 1.8);
        if (x.x < -75) {
          x.state = 'away';
          x.mesh.visible = false;
        }
      }
      x.mesh.position.set(x.x, 0, taxiZ);
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
  const hull = (flight: Flight): Rect | null => {
    if (!['taxiIn', 'parked', 'pushback'].includes(flight.phase) || flight.z < layout.taxiway.z + 5) return null;
    return { minX: flight.x - PROP_SOLID.half, maxX: flight.x + PROP_SOLID.half, minZ: flight.z + PROP_SOLID.tail, maxZ: flight.z + PROP_SOLID.nose };
  };

  /** Clears a flight for take-off: it pays for every seat, and more for leaving full and on time. */
  const clear = (flight: Flight, gate: GateView, perfect: boolean): void => {
    flight.cleared = true;
    flight.perfect = perfect;
    const fare = AIRPORT.planes.prop.fare * levelFactor(UPGRADES.kinds.price, level(`${gate.key}.price`)) * payBonus();
    const streak = state.counts[streakKey] ?? 0;
    const { pay, onTime } = flightPay(flight, fare, streak, AIRPORT);
    const tip = perfect ? Math.round(pay * AIRPORT.flight.perfectTip) : 0;
    cash.add(gate.key, pay + tip);
    const at = layout.piles[gate.key] ?? gate.spot.marshal;
    const top = new Vector3(flight.x, 5.2, flight.z);
    floaters.show(`+${money(pay)} ✈️`, new Vector3(at.x, 1.2, at.z), 'cash');
    if (flight.full) floaters.show(`🎉 ${t('flightFull')}`, new Vector3(top.x, top.y + 0.9, top.z), 'star');
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
    onPaid({ amount: pay + tip, tip, automated: false, at });
    void saves.saveNow();
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
      sound.play('open');
    }
    gate.doorLabel.visible = !!parked && !parked.boarding && parked.waiting > 0;
    // Fuel: by the hose (or the ground handler's there).
    const wantsFuel = !!parked && parked.needsFuel && parked.fuel < 1;
    const fuelling = wantsFuel && (near(player.position, spot.fuelSpot) || (handler?.job === 'fuelling' && handler.flight === parked));
    if (parked && fuelling) {
      const before = parked.fuel;
      parked.fuel = Math.min(1, parked.fuel + (dt * boost) / AIRPORT.fuel.seconds);
      if (Math.floor(before * 5) !== Math.floor(parked.fuel * 5)) sound.play('glug', hearing(spot.fuelSpot));
      if (parked.fuel >= 1) {
        floaters.show(`⛽ ${t('fuelFull')}`, new Vector3(spot.fuelSpot.x, 2.6, spot.fuelSpot.z), 'star');
        sound.play('fueled');
      }
    }
    gate.fuelPad.group.visible = wantsFuel;
    gate.fuelPad.update(dt, !!fuelling);
    if (wantsFuel) gate.fuelPad.setProgress(parked!.fuel);
    if (gate.hose && gate.truck) {
      gate.hose.visible = !!fuelling;
      if (fuelling) {
        // From the truck's reel up to the wing.
        const from = new Vector3(spot.truck.x + 1.2, 1.2, spot.truck.z + 0.4);
        const to = new Vector3(spot.x - 2.4, PROP.wingY - 0.1, flight!.z + 0.6);
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
    if (parked && atHold && heroCarry.stack.length > 0 && heroCarry.timer <= 0) {
      heroCarry.remove('case');
      heroCarry.timer = AIRPORT.bags.handSeconds;
      parked.cases += 1;
      sound.play('drop');
      if (parked.cases >= parked.needsCases) floaters.show(`🧳 ${t('bagsLoaded')}`, new Vector3(spot.hold.x, 2.6, spot.hold.z), 'star');
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

  /** The ground handler: cases from the cart to whichever plane wants them, then its fuel. */
  const workHandler = (dt: number): void => {
    const h = handler;
    if (!h) return;
    const speed = (CREW_SPEED * boost) / levelFactor(UPGRADES.kinds.staffSpeed, level('handler.staffSpeed'));
    const arrived = h.walk(dt, speed);
    h.carrier.update(dt, !arrived);
    h.avatar.update(dt);
    const parkedFlights = gates.map((g) => airfield.parkedAt(g.key)).filter((f): f is Flight => !!f && !f.cleared);
    const road = (layout.serviceRoad.minZ + layout.serviceRoad.maxZ) / 2 - 1.9;
    const lane = (flight: Flight) => flight.spot.x - 3.6;
    const home = layout.staffSpots.handler ?? layout.belt.at;
    if (!arrived) return;
    h.wait = Math.max(0, h.wait - dt);
    if (h.wait > 0) return;
    if (h.job === 'toBelt') {
      const flight = parkedFlights.find((f) => f.cases < f.needsCases);
      while (flight && beltCases > 0 && !h.carrier.full && h.carrier.stack.length < flight.needsCases - flight.cases) {
        h.carrier.push('case');
        beltCases -= 1;
      }
      if (flight && h.carrier.stack.length > 0) {
        h.job = 'toHold';
        h.flight = flight;
        h.path = [{ x: lane(flight), z: road }, { x: lane(flight), z: -1 }, flight.spot.hold];
        sound.play('pick', hearing(h));
      } else h.job = 'idle';
      h.wait = 0.4;
      return;
    }
    if (h.job === 'toHold') {
      const flight = h.flight;
      if (flight && flight.phase === 'parked' && !flight.cleared) {
        while (h.carrier.stack.length > 0 && flight.cases < flight.needsCases) {
          h.carrier.remove('case');
          flight.cases += 1;
        }
        sound.play('drop', hearing(h));
      }
      // Anything left over goes back on the cart.
      beltCases += h.carrier.stack.length;
      while (h.carrier.stack.length > 0) h.carrier.remove('case');
      h.path = flight ? [{ x: lane(flight), z: -1 }, { x: lane(flight), z: road }] : [];
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
      h.path = flight ? [{ x: flight.spot.fuelSpot.x, z: road }] : [];
      h.job = 'idle';
      return;
    }
    // Idle (or home): what's next?
    const wantsCases = parkedFlights.find((f) => f.cases < f.needsCases);
    if (wantsCases && beltCases > 0) {
      h.job = 'toBelt';
      h.path = [{ x: h.x, z: road }, { x: (layout.belt.pick.minX + layout.belt.pick.maxX) / 2, z: road }];
      return;
    }
    const wantsFuel = parkedFlights.find((f) => f.needsFuel && f.fuel < 1 && !near(player.position, f.spot.fuelSpot));
    if (wantsFuel) {
      h.job = 'toFuel';
      h.flight = wantsFuel;
      h.path = [{ x: h.x, z: road }, { x: wantsFuel.spot.fuelSpot.x, z: road }, wantsFuel.spot.fuelSpot];
      return;
    }
    if (h.job !== 'home' && Math.hypot(h.x - home.x, h.z - home.z) > 0.5) {
      h.job = 'home';
      h.path = [{ x: h.x, z: road }, { x: home.x, z: road }, home];
    } else if (h.job === 'home') {
      h.job = 'idle';
      h.avatar.root.rotation.y = Math.PI;
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
    if (flight.ready) html += `<span class="flight-chip is-go">${t('flightReady')}</span>`;
    return html;
  };
  const drawFlights = (dt: number): void => {
    for (const flight of airfield.flights) {
      let v = views.get(flight);
      if (!v) {
        const model = new PlaneModel(LIVERIES[flight.livery % LIVERIES.length]!);
        stage.scene.add(model.root, model.shadow);
        const el = document.createElement('div');
        el.className = 'flight-label';
        const at = new Vector3();
        const label = labels.add(el, at);
        v = { model, label, at, shown: '', lateSaid: false };
        views.set(flight, v);
      }
      v.model.root.position.set(flight.x, flight.y, flight.z);
      v.model.root.rotation.set(-flight.pitch, flight.heading, -flight.bank);
      v.model.update(dt, flight.engines);
      v.at.set(flight.x, 5.6, flight.z - 1.5);
      v.label.visible = flight.phase === 'parked';
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
    if (built(GUIDE_UNTIL)) return null;
    const parked = gates.map((g) => ({ gate: g, flight: airfield.parkedAt(g.key) })).filter((x): x is { gate: GateView; flight: Flight } => !!x.flight && !x.flight.cleared);
    const ready = parked.find((x) => x.flight.ready);
    if (ready) return { at: ready.gate.spot.marshal, text: 'guideClear' };
    const closed = parked.find((x) => !x.flight.boarding && x.flight.waiting > 0);
    if (closed) return { at: podiumFront(closed.gate.spot), text: 'guideGate' };
    const dry = parked.find((x) => x.flight.needsFuel && x.flight.fuel < 1);
    if (dry) return { at: dry.gate.spot.fuelSpot, text: 'guideFuelPlane' };
    const light = parked.find((x) => x.flight.cases < x.flight.needsCases);
    if (light && !built('handler')) {
      if (heroCarry.stack.length > 0) return { at: light.gate.spot.hold, text: 'guideHold' };
      if (beltCases > 0) return { at: { x: (layout.belt.pick.minX + layout.belt.pick.maxX) / 2, z: (layout.belt.pick.minZ + layout.belt.pick.maxZ) / 2 }, text: 'guideBelt' };
    }
    // The very first plane: wave it in.
    const inbound = gates.map((g) => ({ gate: g, flight: airfield.at(g.key) })).find((x) => x.flight?.phase === 'taxiIn');
    if (inbound && !state.flags.includes(clearedFlag) && passengers.line.length === 0) return { at: inbound.gate.spot.marshal, text: 'guideMarshal' };
    const next = pads.next;
    if (next && state.cash >= next.owed) return { at: next.at, text: 'guideBuild' };
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
  const press = createPress(root, sound, () => meta.screenClosed());
  const empireMap = (): void => openEmpireMap({ root, state, sound, town: current, travel: (id) => travelTo(id) });
  const hero = createHero({ root, state, town: current, sound, press, flag, save: () => saves.saveNow(), onChipTap: empireMap });
  const storyline = createStoryline({ state, town: current, press, arrivals, flag });

  if (import.meta.env.DEV) Object.assign(window, { skyport: { airfield, passengers, gates, clear, layout } });

  let rateTimer = 0;
  let stillFor = 0;
  let showShift = 0;
  let hallFullSaid = 0;
  const loop = new Loop((dt) => {
    clock.advance(dt);
    state.playSeconds += dt;
    const hulls = airfield.flights.map(hull).filter((r): r is Rect => !!r);
    player.update(dt, input.read(), [...solids, ...hulls, ...decor.solids()], view.walkable);
    // A plane rolling onto its stand eases the hero out of its way.
    for (const rect of hulls) pushOut(player.mesh.position, TUNING.player.radius, rect);
    pads.update(dt, player.position);
    upgrades.update(dt, player.position);
    heroCarry.update(dt, player.isMoving);
    // Cases off the cart onto the hero's back.
    if (belt && beltCases > 0 && !heroCarry.full && heroCarry.timer <= 0 && insideRect(player.position, layout.belt.pick)) {
      heroCarry.push('case');
      heroCarry.timer = AIRPORT.bags.handSeconds;
      beltCases -= 1;
      sound.play('pick');
    }
    casePile.show(beltCases);
    airfield.update(dt);
    for (const gate of gates) workGate(dt, gate);
    workHandler(dt);
    agent?.avatar.update(dt);
    passengers.update(dt, deskService(), boost);
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
    bot: {
      get hint() {
        return hint;
      },
      pads,
      upgrades,
      cash,
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
