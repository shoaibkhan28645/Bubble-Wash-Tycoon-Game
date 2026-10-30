// The town going about its day: people strolling the pavements and cars
// passing along Main Street. The extra people load after the start (the
// first download stays small).
import { TUNING, type LocationLayout, type Point, type Rect } from './config';
import type { Scene } from 'three';
import * as platform from '../platform/youtube';
import { hasModel, loadModel } from '../render/assets';
import { PersonAvatar } from '../render/models/actors';
import type { CarPool } from '../systems/cars';
import { PassingTraffic } from '../systems/passing';
import { Pedestrians } from '../systems/pedestrians';

export interface StreetLife {
  update(dt: number): void;
  /** Where the people out walking are. */
  people(): Point[];
}

export function createStreetLife(scene: Scene, layout: LocationLayout, pool: CarPool, cars: () => readonly Rect[]): StreetLife {
  const characters = TUNING.streetLife.characters;
  let made = 0;
  const people = new Pedestrians(
    layout.walkways,
    () => {
      const avatar = new PersonAvatar(characters[made++ % characters.length]!, 'bag');
      scene.add(avatar.root);
      return avatar;
    },
    Math.random,
    cars,
  );
  let ready = false;
  Promise.all(characters.filter((c) => !hasModel(`person:${c}`)).map((c) => loadModel(`person:${c}`, `models/people/character-${c}.glb`)))
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
