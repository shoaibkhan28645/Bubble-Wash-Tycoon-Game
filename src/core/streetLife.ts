// The town going about its day: people strolling the pavements and cars
// passing along Main Street. The extra people load after the start (the
// first download stays small).
import { TUNING, type LocationLayout, type Point, type Rect } from './config';
import type { Scene } from 'three';
import * as platform from '../platform/youtube';
import { loadPeople } from '../render/assets';
import { PersonAvatar } from '../render/models/person';
import type { CarPool } from '../systems/cars';
import { PassingTraffic } from '../systems/passing';
import { Pedestrians, type BenchVisit } from '../systems/pedestrians';
import { benchSeats } from '../systems/waitingDrivers';

export interface StreetLife {
  update(dt: number): void;
  /** Where the people out walking are. */
  people(): Point[];
}

export function createStreetLife(scene: Scene, layout: LocationLayout, pool: CarPool, cars: () => readonly Rect[]): StreetLife {
  const characters = TUNING.streetLife.characters;
  let made = 0;
  // The benches on the lot people can walk in and sit on: each faces the way its town piece is turned.
  const visits: BenchVisit[] = (layout.benchVisits ?? []).map((v) => {
    const piece = layout.town.find((p) => p.model === 'prop_bench' && Math.hypot(p.x - v.bench.x, p.z - v.bench.z) < 0.1);
    return { from: v.from, via: v.via, seats: benchSeats(v.bench, piece?.rot ?? 0) };
  });
  const people = new Pedestrians(
    layout.walkways,
    () => {
      const avatar = new PersonAvatar(characters[made++ % characters.length]!, 'bag');
      scene.add(avatar.root);
      return avatar;
    },
    Math.random,
    cars,
    visits,
  );
  let ready = false;
  loadPeople(characters)
    .then(() => (ready = true))
    .catch((error) => platform.logWarning(error));
  const inTheWay = (): Point[] => [...[...pool.active].map((car) => car.position), ...people.positions()];
  const passing = new PassingTraffic(pool, layout, inTheWay);
  return {
    update(dt) {
      passing.update(dt);
      if (ready) people.update(dt);
    },
    people: () => people.positions(),
  };
}
