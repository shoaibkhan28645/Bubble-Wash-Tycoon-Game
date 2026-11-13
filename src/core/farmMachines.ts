// The farm's machines (Chapter 2, Part D), as played: the farm pickup, parked
// on the track between the fields, which the farmhand loads as he picks and
// which takes each full load to the barn doors (backing out again, and
// backing into its spot when it's home); and the feed truck that comes from
// town when the feed store runs low. Both drive as the farm's vans do
// (systems/farmTraffic.ts).
import { Group, Vector3, type Object3D, type Scene } from 'three';
import { GOODS, TUNING, type FarmLayout, type Rect } from './config';
import type { GameState } from './gameState';
import { farmMover } from '../render/models/farm';
import { VanFleet, vehicleSize } from '../render/models/vans';
import type { FarmMotion } from '../render/farmMotion';
import type { Livestock } from '../systems/animals';
import type { BarnStore } from '../systems/barn';
import type { StaffSystem } from '../systems/staff';
import { Carrier } from '../systems/carry';
import type { CrateCarrier, GoodId } from '../systems/crops';
import type { Driver, FarmTraffic } from '../systems/farmTraffic';
import { insideRect } from '../systems/stations';
import type { Label, WorldLabels } from '../ui/worldLabels';

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

type PickupPhase = 'parked' | 'out' | 'unloading' | 'back';

export function createMachines(deps: {
  scene: Scene;
  layout: FarmLayout;
  state: GameState;
  labels: WorldLabels;
  barn: BarnStore;
  livestock: Livestock;
  /** The farm's staff: the pickup speeds the farmhand up (no more walks to the barn). */
  staff: StaffSystem;
  /** Turns wheels, leans bodies, lights lamps and puffs exhaust (render/farmMotion.ts). */
  motion: FarmMotion;
  /** The farm's vehicles on the move: the pickup and the feed truck drive among the vans. */
  traffic: FarmTraffic;
  /** Makes a spot solid: where the pickup parks (people walk round it). */
  solid: (rect: Rect) => void;
}): Machines {
  const { scene, layout, state, labels, barn, livestock, traffic } = deps;
  // The feed truck drives its visit (the delivery vans are the farm game's own).
  const fleet = new VanFleet(traffic, (model, driver) => deps.motion.vehicle(model, driver));
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
  const route = spots.pickupOut;
  const park = route[0]!;
  const parkFacing = Math.atan2(route[1]!.x - park.x, route[1]!.z - park.z);
  const { bed: bedSize, wait, unloadSeconds } = TUNING.machines.pickup;
  let pickup: {
    model: Object3D;
    driver: Driver;
    bed: CrateCarrier;
    phase: PickupPhase;
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
    const { length, width } = vehicleSize('fm_pickup');
    const driver = traffic.add('pickup', length, width);
    traffic.park(driver, park, parkFacing);
    // Crates stand in the bed in two rows of three, two layers, squarely inside its sides and tailgate (the carrier
    // draws its stack 1 m up and half a metre back, at 1.6 times size: the bed is 1.56 m across inside, 1.79 m long).
    // They ride on the body, leaning and pitching with it.
    const pile = new Group();
    pile.position.set(0, -0.08, -0.35);
    pile.userData.rides = true;
    model.add(pile);
    deps.motion.vehicle(model, driver);
    // Where it parks is solid (people walk round to its tailgate), lengthwise along the track.
    const [hl, hw] = [length / 2, width / 2];
    const alongX = Math.abs(Math.sin(parkFacing)) > Math.abs(Math.cos(parkFacing));
    deps.solid({ minX: park.x - (alongX ? hl : hw), maxX: park.x + (alongX ? hl : hw), minZ: park.z - (alongX ? hw : hl), maxZ: park.z + (alongX ? hw : hl) });
    const bed = new Carrier<GoodId>(pile, () => ({ x: model.position.x, z: model.position.z }), () => bedSize);
    bed.arrange = (i) => [((i % 2) - 0.5) * 0.46, Math.floor(i / 6) * 0.27, ((Math.floor(i / 2) % 3) - 1) * 0.35];
    for (const good of Object.keys(GOODS) as GoodId[]) for (let i = 0; i < (state.supplies[`pickup.${good}`] ?? 0); i++) bed.push(good);
    pickup = { model, driver, bed, phase: 'parked', idle: 0, timer: 0 };
    place();
  };
  /** Draws the pickup where it has driven to. */
  const place = (): void => {
    if (!pickup) return;
    pickup.model.position.set(pickup.driver.position.x, 0, pickup.driver.position.z);
    pickup.model.rotation.y = pickup.driver.facing;
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
        // Off when it's full (or has a load and nobody's loading it), and the main track's clear.
        const out = [{ path: route }];
        if ((bed.full || (bed.stack.length >= MIN_LOAD && pickup.idle >= wait)) && traffic.clear(pickup.driver, out)) {
          traffic.plan(pickup.driver, out, 0, true);
          pickup.phase = 'out';
        }
        break;
      }
      case 'out':
        if (traffic.drive(pickup.driver, dt)) {
          pickup.phase = 'unloading';
          pickup.timer = 0;
        }
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
        // Backs out of the barn's track, drives up the main track and backs into its spot: once the main track's
        // clear (it waits at the barn doors, out of the way, rather than back up to the main track and stand there
        // in the way of the feed truck or a van turning off it).
        if ((bed.stack.length === 0 || !barn.hasRoom) && traffic.clear(pickup.driver, spots.pickupBack)) {
          traffic.plan(pickup.driver, spots.pickupBack, 0, true);
          pickup.phase = 'back';
        }
        break;
      case 'back':
        if (traffic.drive(pickup.driver, dt)) {
          traffic.park(pickup.driver, park, parkFacing);
          pickup.phase = 'parked';
          pickup.idle = 0;
        }
        break;
    }
    place();
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
  const buildFeedTruck = (): void => fleet.addVisit('feedtruck', 'fm_feedtruck', spots.feedTruckVisit);
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

  return {
    pickupBay() {
      return pickup?.phase === 'parked' ? spots.pickupBay : null;
    },
    built(id) {
      if (!state.unlocked.includes(id)) return;
      if (id === 'pickup') buildPickup();
      if (id === 'feedtruck') buildFeedTruck();
    },
    update(dt, now, carriers) {
      runPickup(dt, carriers);
      if (has('feedtruck')) runFeedTruck(now);
      fleet.update(
        dt,
        () => {
          const { left, back } = feedTruck();
          return left !== undefined && back !== undefined ? Math.min(1, (now - left) / Math.max(1, back - left)) : null;
        },
        () => TUNING.machines.feedTruck.trip,
      );
    },
  };
}
