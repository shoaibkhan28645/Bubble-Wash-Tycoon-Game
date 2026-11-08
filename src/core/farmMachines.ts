// The farm's machines (Chapter 2, Part D), as played: the tractor the hero
// climbs into and drives over the fields (its trailer fills with whatever
// ripe crops it passes, and empties at the barn doors), the tractor driver
// who takes it over, the farmhand's pickup, the feed truck that comes from
// town when the feed store runs low, and the combine that sweeps the corn
// field whenever it's ripe.
import { Group, Vector3, type Object3D, type Scene } from 'three';
import { TUNING, UPGRADES, type FarmLayout, type Point, type Rect } from './config';
import type { GameState } from './gameState';
import type { SoundManager } from '../audio/sound';
import { farmModel } from '../render/models/farm';
import { VanFleet } from '../render/models/vans';
import type { FarmMotion } from '../render/farmMotion';
import type { Livestock } from '../systems/animals';
import type { BarnStore } from '../systems/barn';
import { Carrier } from '../systems/carry';
import { GOODS } from './config';
import type { CrateCarrier, Crops, GoodId } from '../systems/crops';
import { levelFactor, levelStep } from '../systems/economy';
import type { GuideStep } from '../systems/guide';
import type { MoveInput } from '../systems/input';
import type { Player } from '../systems/player';
import type { StaffSystem } from '../systems/staff';
import { Rig, TractorDriver, routeAt, routeMarks } from '../systems/vehicles';
import type { Floaters } from '../ui/carBubbles';
import { t } from '../ui/strings';
import type { Label, WorldLabels } from '../ui/worldLabels';

/** How close to the tractor's door the hero climbs in, and how long after getting out before climbing back in is allowed. */
const DOOR_REACH = 1.6;
const REBOARD_SECONDS = 1.2;
/** The hero sits this high in the tractor. */
const SEAT = { y: 0.85, back: 0.55 };

export interface Machines {
  /** The hero is driving the tractor (the player doesn't walk). */
  readonly driving: boolean;
  /** The trailer, for unloading at the barn and van bays (null before the tractor is built). */
  readonly trailer: CrateCarrier | null;
  /** A pad was built (or was already built on arrival). */
  built(id: string): void;
  /**
   * One frame, before the hero walks: the tractor drives (by the stick, or
   * its driver), harvests what it passes, and the other machines run.
   */
  update(dt: number, now: number, move: MoveInput, obstacles: readonly Rect[], bounds: Rect): void;
  /** What the guide hand should point at for the machines, if anything. */
  guide(): GuideStep | null;
  dispose(): void;
}

export function createMachines(deps: {
  root: HTMLElement;
  scene: Scene;
  layout: FarmLayout;
  state: GameState;
  sound: SoundManager;
  labels: WorldLabels;
  floaters: Floaters;
  player: Player;
  crops: Crops;
  barn: BarnStore;
  livestock: Livestock;
  staff: StaffSystem;
  flag: (name: string) => void;
  /** The town's id, for its flags. */
  townId: string;
  /** Turns wheels and puffs exhaust (render/farmMotion.ts). */
  motion: FarmMotion;
}): Machines {
  const { root, scene, layout, state, sound, labels, floaters, player, crops, barn, livestock, staff, flag } = deps;
  // The feed truck and the combine drive their routes (the delivery vans are the farm game's own).
  const fleet = new VanFleet((model) => deps.motion.vehicle(model));
  scene.add(fleet.group);
  const { machines: spots } = layout;
  const level = (key: string) => state.levels[key] ?? 0;
  const has = (id: string) => state.unlocked.includes(id);
  const droveFlag = `drove:${deps.townId}`;
  const group = new Group();
  scene.add(group);

  // The tractor and its trailer.
  let rig: Rig | null = null;
  let tractorModel: Object3D | null = null;
  let trailerModel: Object3D | null = null;
  let trailer: CrateCarrier | null = null;
  let driver: TractorDriver | null = null;
  let driving = false;
  let sinceOut = REBOARD_SECONDS;
  const engine = () => levelFactor(UPGRADES.kinds.engine, level('tractor.engine'));
  const trailerSize = () => TUNING.machines.trailer + levelStep(UPGRADES.kinds.trailer, level('tractor.trailer'));

  const doorPoint = (): Point | null => {
    if (!rig) return null;
    // The door is on the tractor's left side.
    return { x: rig.at.x + Math.cos(rig.heading) * 1.3, z: rig.at.z - Math.sin(rig.heading) * 1.3 };
  };
  const prompt = document.createElement('div');
  prompt.className = 'upgrade-icon drive-prompt';
  prompt.textContent = t('driveIn');
  const promptAt = new Vector3();
  const promptLabel: Label = labels.add(prompt, promptAt);
  promptLabel.visible = false;
  const trailerText = document.createElement('div');
  trailerText.className = 'shelf-stock';
  const trailerAt = new Vector3();
  const trailerLabel: Label = labels.add(trailerText, trailerAt);
  trailerLabel.visible = false;
  let trailerShown = '';

  // The "Get out" button while driving.
  const exitButton = document.createElement('button');
  exitButton.type = 'button';
  exitButton.className = 'drive-exit';
  exitButton.textContent = `🚶 ${t('getOut')}`;
  exitButton.hidden = true;
  root.appendChild(exitButton);
  const getOut = (): void => {
    if (!driving) return;
    driving = false;
    sinceOut = 0;
    exitButton.hidden = true;
    const door = doorPoint();
    if (door) player.mesh.position.set(door.x, 0, door.z);
    sound.play('click');
  };
  exitButton.addEventListener('click', getOut);
  // A tap on the button is the button's, not the start of a joystick drag.
  exitButton.addEventListener('pointerdown', (e) => e.stopPropagation());

  /** Keeps the trailer's crates in the save (they're on the trailer, not in any store). */
  const saveTrailer = (): void => {
    if (!trailer) return;
    for (const good of Object.keys(GOODS) as GoodId[]) state.supplies[`trailer.${good}`] = trailer.count(good);
  };

  const buildTractor = (): void => {
    if (rig) return;
    rig = new Rig(spots.tractorPark, spots.tractorHeading);
    tractorModel = farmModel('fm_tractor');
    trailerModel = farmModel('fm_trailer');
    for (const m of [tractorModel, trailerModel]) {
      m.traverse((node) => (node.castShadow = node.receiveShadow = true));
      group.add(m);
      deps.motion.vehicle(m);
    }
    // Crates sit in rows on the trailer's bed (the carrier draws its stack 1 m up and half a metre back).
    const pile = new Group();
    pile.position.set(0, -0.2, 0.5);
    trailerModel.add(pile);
    trailer = new Carrier<GoodId>(pile, () => rig!.at, trailerSize);
    trailer.arrange = (i) => [((i % 2) - 0.5) * 0.5, Math.floor(i / 6) * 0.2, ((Math.floor(i / 2) % 3) - 1) * 0.42];
    for (const good of Object.keys(GOODS) as GoodId[]) for (let i = 0; i < (state.supplies[`trailer.${good}`] ?? 0); i++) trailer.push(good);
    placeModels();
  };
  const placeModels = (): void => {
    if (!rig || !tractorModel || !trailerModel) return;
    tractorModel.position.set(rig.at.x, 0, rig.at.z);
    tractorModel.rotation.y = rig.heading;
    trailerModel.position.set(rig.trailer.at.x, 0, rig.trailer.at.z);
    trailerModel.rotation.y = rig.trailer.heading;
  };
  const hireDriver = (): void => {
    if (!rig || driver) return;
    driver = new TractorDriver(spots.tractorRoute);
    if (driving) getOut();
    // He takes the tractor out to the fields.
    const start = spots.tractorRoute[0]!;
    rig.place(start, -Math.PI / 2);
    driver.rejoin(start);
    placeModels();
  };

  // The farmhand's pickup: drawn in the farmhand's place, faster and carrying more.
  let pickup: Object3D | null = null;
  const buildPickup = (): void => {
    if (pickup) return;
    staff.bonuses.farmhand = { speed: TUNING.machines.pickup.speed, carry: TUNING.machines.pickup.carry };
    pickup = farmModel('fm_pickup');
    pickup.traverse((node) => (node.castShadow = true));
    group.add(pickup);
    deps.motion.vehicle(pickup);
  };

  // The feed truck: a visit from town whenever the feed store runs low.
  const feedTruck = () => ({ left: state.plots['feedtruck.left'], back: state.plots['feedtruck.back'] });
  const buildFeedTruck = (): void => fleet.add('feedtruck', 'fm_feedtruck', spots.feedTruckRoute, 'visit');
  const runFeedTruck = (now: number): void => {
    const { left, back } = feedTruck();
    const { trip, feed } = TUNING.machines.feedTruck;
    if (back !== undefined && left !== undefined) {
      if (now < back) return;
      // Home again: the feed went into the store at the stop.
      state.supplies.feed = Math.min(TUNING.feed.cap, (state.supplies.feed ?? 0) + feed);
      delete state.plots['feedtruck.left'];
      delete state.plots['feedtruck.back'];
      return;
    }
    if (livestock.hasFeeder && livestock.hungry) {
      state.plots['feedtruck.left'] = now;
      state.plots['feedtruck.back'] = now + trip * 1000;
    }
  };

  // The combine: a pass over the corn field whenever most of it is ripe.
  const combineMarks = routeMarks(spots.combineRoute);
  const combineLength = combineMarks[combineMarks.length - 1] ?? 0;
  let combineStart: number | null = null;
  const buildCombine = (): void => fleet.add('combine', 'fm_combine', spots.combineRoute, 'loop');
  const combineSeconds = () => combineLength / TUNING.machines.combine.speed;
  const runCombine = (now: number): void => {
    const corn = crops.plots.filter((p) => p.crop === 'corn');
    if (combineStart === null) {
      const ripe = corn.filter((p) => crops.ripe(p, now)).length;
      if (corn.length > 0 && ripe >= Math.ceil(corn.length * 0.66)) combineStart = now;
      return;
    }
    const along = ((now - combineStart) / 1000) * TUNING.machines.combine.speed;
    if (along >= combineLength) {
      combineStart = null;
      return;
    }
    const { at } = routeAt(spots.combineRoute, combineMarks, along);
    const plot = crops.harvestAt(at, now, 'corn');
    if (!plot) return;
    const { yield: crates, hay } = TUNING.machines.combine;
    barn.store('corn', crates);
    // The straw is baled into hay for the animals.
    if (livestock.hasFeeder) state.supplies.feed = Math.min(TUNING.feed.cap, (state.supplies.feed ?? 0) + hay);
    floaters.show(`+${crates} 🌽`, new Vector3(plot.at.x, 2.2, plot.at.z), 'star');
  };
  const combineProgress = (now: number) => (combineStart === null ? null : Math.min(1, (now - combineStart) / 1000 / combineSeconds()));

  return {
    get driving() {
      return driving;
    },
    get trailer() {
      return trailer;
    },
    built(id) {
      if (!state.unlocked.includes(id)) return;
      if (id === 'tractor') buildTractor();
      if (id === 'tractordriver' && has('tractor')) hireDriver();
      if (id === 'pickup') buildPickup();
      if (id === 'feedtruck') buildFeedTruck();
      if (id === 'combine') buildCombine();
      // The tractor arrives after its driver was hired in an old save: let him drive it.
      if (id === 'tractor' && has('tractordriver')) hireDriver();
    },
    update(dt, now, move, obstacles, bounds) {
      sinceOut += dt;
      if (rig && trailer) {
        if (driving) {
          rig.drive(dt, move, obstacles, bounds, engine());
          // The hero sits in the seat; the camera follows the tractor.
          player.mesh.position.set(rig.at.x - Math.sin(rig.heading) * SEAT.back, SEAT.y, rig.at.z - Math.cos(rig.heading) * SEAT.back);
          player.mesh.rotation.y = rig.heading;
        } else if (driver) {
          const unloading = trailer.stack.length > 0 && barn.atDoor(rig.at) && barn.hasRoom;
          driver.update(dt, rig, unloading, obstacles, bounds, engine());
        } else {
          rig.brake(dt);
        }
        // Whatever ripe crop the tractor passes over goes into the trailer, far faster than by hand.
        const before = trailer.stack.length;
        crops.update(dt * TUNING.machines.tractorHarvest, now, [trailer], (crop) => crop !== 'apple');
        if (trailer.stack.length > before) {
          state.counts.tractorCrate = (state.counts.tractorCrate ?? 0) + 1;
          if (driving) {
            flag(droveFlag);
            sound.play('pop');
            floaters.show(`+1 ${GOODS[trailer.stack[trailer.stack.length - 1]!]!.icon}`, new Vector3(rig.at.x, 2.6, rig.at.z), 'star');
          }
        }
        trailer.update(dt, rig.speed > 0.2);
        placeModels();
        saveTrailer();
        // Climbing in: walk up to the door (not while someone else drives it).
        const door = doorPoint()!;
        const near = Math.hypot(player.position.x - door.x, player.position.z - door.z);
        const canBoard = !driving && !driver && sinceOut >= REBOARD_SECONDS;
        promptLabel.visible = canBoard && near < 5;
        promptAt.set(door.x, 0.4, door.z);
        if (canBoard && near < DOOR_REACH) {
          driving = true;
          exitButton.hidden = false;
          sound.play('click');
        }
        const text = trailer.stack.length > 0 || driving ? `🛻 ${trailer.stack.length} / ${trailer.capacity()}` : null;
        trailerLabel.visible = text !== null;
        trailerAt.set(rig.trailer.at.x, 2.0, rig.trailer.at.z);
        if (text && text !== trailerShown) {
          trailerShown = text;
          trailerText.textContent = text;
          labels.remeasure(trailerLabel);
        }
      }
      if (pickup) {
        const hand = staff.avatarOf('farmhand');
        if (hand) {
          hand.root.visible = false;
          pickup.position.set(hand.root.position.x, 0, hand.root.position.z);
          pickup.rotation.y = hand.root.rotation.y;
        }
      }
      if (has('feedtruck')) runFeedTruck(now);
      if (has('combine')) runCombine(now);
      fleet.update(
        (id) => {
          if (id === 'combine') return combineProgress(now);
          const { left, back } = feedTruck();
          return left !== undefined && back !== undefined ? Math.min(1, (now - left) / Math.max(1, back - left)) : null;
        },
        (id) => (id === 'combine' ? combineSeconds() : TUNING.machines.feedTruck.trip),
      );
    },
    guide() {
      if (!rig || !trailer || driver) return null;
      if (!driving) return state.flags.includes(droveFlag) ? null : { at: doorPoint()!, text: 'guideDrive' };
      const now = Date.now();
      const ripe = crops.nearestRipe(rig.at, now);
      if (trailer.stack.length > 0 && (trailer.full || !ripe)) {
        const d = spots.barnDoor;
        return { at: { x: (d.minX + d.maxX) / 2, z: (d.minZ + d.maxZ) / 2 }, text: 'guideBarnDoor' };
      }
      return !state.flags.includes(droveFlag) && ripe ? { at: ripe.at, text: 'guideTractorHarvest' } : null;
    },
    dispose() {
      exitButton.remove();
    },
  };
}
