// The Mini-Mart: drivers walk over from the pumps, line up, get served, walk back.
import { describe, expect, it } from 'vitest';
import { CARS, LOCATION1, TUNING } from '../src/core/config';
import type { CarModel } from '../src/render/models/actors';
import { Car } from '../src/systems/cars';
import { Mart } from '../src/systems/mart';
import { Station } from '../src/systems/stations';

function carAtPump(pump: Station): Car {
  const car = new Car({ mesh: { position: { x: pump.at.x, y: 0, z: pump.at.z } } } as unknown as CarModel);
  car.def = CARS[0]!;
  car.needs = ['fuel', 'snack'];
  car.served = [];
  return car;
}

const pump = new Station('pump1', 'pump', LOCATION1.pads.pump1!, LOCATION1.pump, 0.5, null);

/** Runs the shop for a while at a given till work rate. */
function run(mart: Mart, seconds: number, rate: number): void {
  for (let t = 0; t < seconds; t += 0.1) mart.update(0.1, rate, 1);
}

describe('the Mini-Mart', () => {
  it('a driver walks over, waits at the till until served, then walks back with a snack', () => {
    const served: Car[] = [];
    const mart = new Mart(LOCATION1, null, null, (car) => served.push(car));
    const car = carAtPump(pump);
    mart.sendShopper(car, pump);
    expect(car.shopping).toBe(true);
    run(mart, 20, 0);
    expect(mart.counter.needsWork).toBe(true);
    expect(served).toEqual([]);
    run(mart, TUNING.stations.counter.seconds + 0.2, 1);
    expect(served).toEqual([car]);
    expect(car.served).toEqual([]);
    run(mart, 20, 0);
    expect(car.served).toEqual(['snack']);
    expect(car.shopping).toBe(false);
    expect(mart.count).toBe(0);
  });

  it('serves the line in order, the next stepping up to the till', () => {
    const order: Car[] = [];
    const mart = new Mart(LOCATION1, null, null, (car) => order.push(car));
    const first = carAtPump(pump);
    const second = carAtPump(pump);
    mart.sendShopper(first, pump);
    mart.sendShopper(second, pump);
    run(mart, 20, 0);
    run(mart, 2 * (TUNING.stations.counter.seconds + 2), 1);
    expect(order).toEqual([first, second]);
  });

  it('a car that gives up takes its driver with it', () => {
    const mart = new Mart(LOCATION1, null, null, () => {});
    const car = carAtPump(pump);
    mart.sendShopper(car, pump);
    run(mart, 5, 0);
    mart.cancel(car);
    expect(car.shopping).toBe(false);
    expect(mart.count).toBe(0);
    expect(mart.counter.needsWork).toBe(false);
  });

  it('only sells once it is open and its shoppers can be drawn', () => {
    const mart = new Mart(LOCATION1, null, null, () => {});
    expect(mart.selling).toBe(false);
    mart.isOpen = true;
    expect(mart.selling).toBe(false);
    mart.ready = true;
    expect(mart.selling).toBe(true);
  });
});
