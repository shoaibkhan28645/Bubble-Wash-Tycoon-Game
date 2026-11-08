// The farm's machines (Chapter 2, Part D), as played: the farm pickup, parked
// on the track between the fields, which the farmhand loads as he picks and
// which takes each full load to the barn doors and comes back; the feed truck
// that comes from town when the feed store runs low; and the combine that
// sweeps the corn field whenever it's ripe.
import { Group, Vector3, type Object3D, type Scene } from 'three';
import { GOODS, TUNING, type FarmLayout, type Rect } from './config';
import type { GameState } from './gameState';
import { farmMover } from '../render/models/farm';
import { VanFleet } from '../render/models/vans';
import type { FarmMotion } from '../render/farmMotion';
import type { Livestock } from '../systems/animals';
import type { BarnStore } from '../systems/barn';
import type { StaffSystem } from '../systems/staff';
import { Carrier } from '../systems/carry';
import type { CrateCarrier, Crops, GoodId } from '../systems/crops';
import { insideRect } from '../systems/stations';
import { routeAt, routeMarks } from '../systems/vehicles';
import type { Floaters } from '../ui/carBubbles';
import type { Label, WorldLabels } from '../ui/worldLabels';

/** Seconds the pickup takes to turn round at either end of its run. */
const TURN_SECONDS = 1.1;
/** It sets off with this many crates aboard once nobody has loaded it for a while (or with a full bed). */
const MIN_LOAD = 4;

export interface Machines {
  /** Where to load the pickup while it's parked (null while it's away, or not bought). */
  pickupBay(): Rect | null;
  /** A pad was built (or was already built on arrival). */
  built(id: string): void;
  /** One frame: the pickup is loaded from `carriers` at its bay and runs to the barn; the other machines run. */
  update(dt: number, now: number, carriers: readonly CrateCarrier[]): void;
}

type PickupPhase = 'parked' | 'out' | 'unloading' | 'turnBack' | 'back' | 'turnHome';

export function createMachines(deps: {
  scene: Scene;
  layout: FarmLayout;
  state: GameState;
  labels: WorldLabels;
  floaters: Floaters;
  crops: Crops;
  barn: BarnStore;
  livestock: Livestock;
  /** The farm's staff: the pickup speeds the farmhand up (no more walks to the barn). */
  staff: StaffSystem;
  /** Turns wheels and puffs exhaust (render/farmMotion.ts). */
  motion: FarmMotion;
}): Machines {
  const { scene, layout, state, labels, floaters, crops, barn, livestock } = deps;
  // The feed truck and the combine drive their routes (the delivery vans are the farm game's own).
  const fleet = new VanFleet((model) => deps.motion.vehicle(model));
  scene.add(fleet.group);
  const { machines: spots } = layout;
  const has = (id: string) => state.unlocked.includes(id);
  const group = new Group();
  scene.add(group);

  // Crates left on the old tractor's trailer (a save from before it was retired) go into the barn.
  for (const good of Object.keys(GOODS) as GoodId[]) {
    const key = `trailer.${good}`;
    if (state.supplies[key]) barn.store(good, state.supplies[key]!);
    delete state.supplies[key];
  }

  // The pickup: parked between the fields, its bed loaded from behind the tailgate; off to the barn when full.
  const route = spots.pickupRoute;
  const marks = routeMarks(route);
  const length = marks[marks.length - 1] ?? 0;
  const { bed: bedSize, speed, wait, unloadSeconds } = TUNING.machines.pickup;
  let pickup: {
    model: Object3D;
    bed: CrateCarrier;
    phase: PickupPhase;
    along: number;
    turn: number;
    idle: number;
    timer: number;
  } | null = null;
  const bedText = document.createElement('div');
  bedText.className = 'shelf-stock';
  const bedAt = new Vector3();
  const bedLabel: Label = labels.add(bedText, bedAt);
  bedLabel.visible = false;
  let bedShown = '';

  /** Keeps the bed's crates in the save. */
  const saveBed = (): void => {
    if (!pickup) return;
    for (const good of Object.keys(GOODS) as GoodId[]) state.supplies[`pickup.${good}`] = pickup.bed.count(good);
  };
  const buildPickup = (): void => {
    if (pickup) return;
    // With the pickup parked by the plots the farmhand never walks to the barn: they pick faster and stack more.
    deps.staff.bonuses.farmhand = TUNING.machines.pickup.farmhand;
    const model = farmMover('fm_pickup', 'box');
    group.add(model);
    deps.motion.vehicle(model);
    // Crates stand in the bed in two rows of three, two layers (the carrier draws its stack 1 m up and half a metre back).
    const pile = new Group();
    pile.position.set(0, -0.08, -0.35);
    model.add(pile);
    const bed = new Carrier<GoodId>(pile, () => ({ x: model.position.x, z: model.position.z }), () => bedSize);
    bed.arrange = (i) => [((i % 2) - 0.5) * 0.55, Math.floor(i / 6) * 0.22, ((Math.floor(i / 2) % 3) - 1) * 0.5];
    for (const good of Object.keys(GOODS) as GoodId[]) for (let i = 0; i < (state.supplies[`pickup.${good}`] ?? 0); i++) bed.push(good);
    pickup = { model, bed, phase: 'parked', along: 0, turn: 0, idle: 0, timer: 0 };
    place(0, 0);
  };
  /** Puts the pickup `distance` along its run, turned `extra` radians from the way the run goes. */
  const place = (distance: number, extra: number): void => {
    if (!pickup) return;
    const { at, heading } = routeAt(route, marks, distance);
    pickup.model.position.set(at.x, 0, at.z);
    pickup.model.rotation.y = heading + extra;
  };
  const runPickup = (dt: number, carriers: readonly CrateCarrier[]): void => {
    if (!pickup) return;
    const { bed } = pickup;
    pickup.idle += dt;
    switch (pickup.phase) {
      case 'parked': {
        // Anyone carrying crops behind the tailgate hands them up, one crate at a time.
        for (const carrier of carriers) {
          if (bed.full) break;
          if (carrier.timer > 0 || carrier.stack.length === 0 || !insideRect(carrier.position, spots.pickupBay)) continue;
          const good = carrier.stack[carrier.stack.length - 1]!;
          carrier.remove(good);
          bed.push(good);
          carrier.timer = TUNING.supplies.handSeconds;
          pickup.idle = 0;
        }
        if (bed.full || (bed.stack.length >= MIN_LOAD && pickup.idle >= wait)) pickup.phase = 'out';
        place(0, 0);
        break;
      }
      case 'out':
        pickup.along = Math.min(length, pickup.along + speed * dt);
        place(pickup.along, 0);
        if (pickup.along >= length) pickup.phase = 'unloading';
        break;
      case 'unloading':
        // Crate by crate in at the barn doors; if the barn's full, it brings the rest back.
        pickup.timer -= dt;
        if (pickup.timer <= 0 && bed.stack.length > 0 && barn.hasRoom) {
          pickup.timer = unloadSeconds;
          const good = bed.stack[bed.stack.length - 1]!;
          bed.remove(good);
          barn.store(good, 1);
        }
        if (bed.stack.length === 0 || !barn.hasRoom) {
          pickup.phase = 'turnBack';
          pickup.turn = 0;
        }
        break;
      case 'turnBack':
      case 'turnHome': {
        // A neat turn on the spot, round to face the other way.
        pickup.turn = Math.min(1, pickup.turn + dt / TURN_SECONDS);
        const k = pickup.turn * pickup.turn * (3 - 2 * pickup.turn);
        const home = pickup.phase === 'turnHome';
        place(pickup.along, home ? Math.PI * (1 + k) : Math.PI * k);
        if (pickup.turn >= 1) {
          pickup.phase = home ? 'parked' : 'back';
          pickup.idle = 0;
        }
        break;
      }
      case 'back':
        pickup.along = Math.max(0, pickup.along - speed * dt);
        place(pickup.along, Math.PI);
        if (pickup.along <= 0) {
          pickup.phase = 'turnHome';
          pickup.turn = 0;
        }
        break;
    }
    bed.update(dt, pickup.phase === 'out' || pickup.phase === 'back');
    saveBed();
    const text = `🛻 ${bed.stack.length} / ${bed.capacity()}`;
    bedLabel.visible = bed.stack.length > 0 || pickup.phase === 'parked';
    bedAt.set(pickup.model.position.x, 2.3, pickup.model.position.z);
    if (text !== bedShown) {
      bedShown = text;
      bedText.textContent = text;
      labels.remeasure(bedLabel);
    }
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
    state.counts.harvest = (state.counts.harvest ?? 0) + crates;
    // The straw is baled into hay for the animals.
    if (livestock.hasFeeder) state.supplies.feed = Math.min(TUNING.feed.cap, (state.supplies.feed ?? 0) + hay);
    floaters.show(`+${crates} 🌽`, new Vector3(plot.at.x, 2.2, plot.at.z), 'star');
  };
  const combineProgress = (now: number) => (combineStart === null ? null : Math.min(1, (now - combineStart) / 1000 / combineSeconds()));

  return {
    pickupBay() {
      return pickup?.phase === 'parked' ? spots.pickupBay : null;
    },
    built(id) {
      if (!state.unlocked.includes(id)) return;
      if (id === 'pickup') buildPickup();
      if (id === 'feedtruck') buildFeedTruck();
      if (id === 'combine') buildCombine();
    },
    update(dt, now, carriers) {
      runPickup(dt, carriers);
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
  };
}
