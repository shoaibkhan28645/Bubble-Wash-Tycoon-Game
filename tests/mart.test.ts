// The Mini-Mart: drivers walk over from the pumps, line up, get served, walk back.
import { describe, expect, it } from 'vitest';
import { stationDef, CARS } from '../src/core/config';
import { ROADSIDE } from '../src/core/towns';
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

const pump = new Station('pump1', 'pump', ROADSIDE.layout.pads.pump1!, ROADSIDE.layout.pump, 0.5, null);

/** Runs the shop for a while at a given till work rate. */
function run(mart: Mart, seconds: number, rate: number): void {
  for (let t = 0; t < seconds; t += 0.1) mart.update(0.1, rate, 1);
}

describe('the Mini-Mart', () => {
  it('a driver walks over, waits at the till until served, then walks back with a snack', () => {
    const served: Car[] = [];
    const mart = new Mart(ROADSIDE.layout, null, null, (car) => served.push(car));
    const car = carAtPump(pump);
    mart.sendShopper(car, pump);
    expect(car.shopping).toBe(true);
    run(mart, 20, 0);
    expect(mart.counter.needsWork).toBe(true);
    expect(served).toEqual([]);
    run(mart, stationDef('counter').seconds! + 0.2, 1);
    expect(served).toEqual([car]);
    expect(car.served).toEqual([]);
    run(mart, 20, 0);
    expect(car.served).toEqual(['snack']);
    expect(car.shopping).toBe(false);
    expect(mart.count).toBe(0);
  });

  it('serves the line in order, the next stepping up to the till', () => {
    const order: Car[] = [];
    const mart = new Mart(ROADSIDE.layout, null, null, (car) => order.push(car));
    const first = carAtPump(pump);
    const second = carAtPump(pump);
    mart.sendShopper(first, pump);
    mart.sendShopper(second, pump);
    run(mart, 20, 0);
    run(mart, 2 * (stationDef('counter').seconds! + 2), 1);
    expect(order).toEqual([first, second]);
  });

  it('sends the served back along the shopfront nearer the road, never back past the line', () => {
    let servedAt = -1;
    const mart = new Mart(ROADSIDE.layout, null, null, () => (servedAt = 0));
    mart.sendShopper(carAtPump(pump), pump);
    run(mart, 20, 0);
    const line = ROADSIDE.layout.mart.queue;
    const [west, east] = [Math.min(...line.map((p) => p.x)), Math.max(...line.map((p) => p.x))];
    const back: { x: number; z: number }[] = [];
    for (let t = 0; t < 40 && mart.count > 0; t += 0.1) {
      mart.update(0.1, 1, 1);
      if (servedAt >= 0) back.push(...mart.positions());
    }
    expect(mart.count).toBe(0);
    // Every step of the way back that passes the line (west of the till, its front) is on the road side of it.
    const pastLine = back.filter((at) => at.x > west - 0.3 && at.x < east - 0.1);
    expect(pastLine.length).toBeGreaterThan(5);
    for (const at of pastLine) expect(at.z).toBeGreaterThan(line[0]!.z + 0.5);
  });

  it('a car that gives up takes its driver with it', () => {
    const mart = new Mart(ROADSIDE.layout, null, null, () => {});
    const car = carAtPump(pump);
    mart.sendShopper(car, pump);
    run(mart, 5, 0);
    mart.cancel(car);
    expect(car.shopping).toBe(false);
    expect(mart.count).toBe(0);
    expect(mart.counter.needsWork).toBe(false);
  });

  it('only sells once it is open and its shoppers can be drawn', () => {
    const mart = new Mart(ROADSIDE.layout, null, null, () => {});
    expect(mart.selling).toBe(false);
    mart.isOpen = true;
    expect(mart.selling).toBe(false);
    mart.ready = true;
    expect(mart.selling).toBe(true);
  });
});
