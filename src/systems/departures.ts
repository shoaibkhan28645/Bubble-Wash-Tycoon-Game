import { Vector3 } from 'three';
import { TUNING } from '../core/config';
import type { Particles } from '../render/effects/particles';
import type { SoundManager } from '../audio/sound';
import type { Floaters } from '../ui/carBubbles';
import type { Car, CarPool } from './cars';

const POOF_SECONDS = 0.6;
const ANGRY_HEIGHT = 3.2;

/**
 * Cars on their way out: driving off along their route once they've paid,
 * or (out of patience) honking and shrinking away in a puff of bubbles.
 * Either way the car goes back to the pool at the end.
 */
export class Departures {
  private readonly cars = new Set<Car>();

  constructor(
    private readonly pool: CarPool,
    private readonly effects: Particles,
    private readonly sound: SoundManager,
    private readonly floaters: Floaters,
    /** The car's mood bubble goes away with it. */
    private readonly hideMood: (car: Car) => void,
  ) {}

  /** Already following its route out. */
  driveOff(car: Car): void {
    this.cars.add(car);
  }

  stormOff(car: Car): void {
    car.state = 'angry';
    car.timer = 0;
    this.cars.add(car);
    this.sound.play('honk');
    const p = car.position;
    this.floaters.show('😡', new Vector3(p.x, ANGRY_HEIGHT, p.z), 'star');
  }

  update(dt: number): void {
    for (const car of [...this.cars]) {
      if (car.state === 'angry') {
        car.timer += dt;
        const t = car.timer / POOF_SECONDS;
        car.model.mesh.scale.setScalar(Math.max(0.01, 1 - t * t));
        if (car.timer >= POOF_SECONDS) {
          const p = car.position;
          this.effects.burst('bubble', new Vector3(p.x, 0.6, p.z), 14, 3, 2);
          this.release(car);
        }
        continue;
      }
      car.update(dt, TUNING.cars.speed);
      if (car.arrived) this.release(car);
    }
  }

  private release(car: Car): void {
    this.cars.delete(car);
    this.hideMood(car);
    this.pool.release(car);
  }
}
