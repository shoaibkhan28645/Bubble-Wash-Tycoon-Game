// Drivers waiting in a wash line get out: a seat on the bench, a can from the vending machine, back in time.
import { describe, expect, it } from 'vitest';
import { CARS, TUNING } from '../src/core/config';
import { ROADSIDE } from '../src/core/towns';
import type { CarModel } from '../src/render/models/actors';
import { Car } from '../src/systems/cars';
import { pickRebalance } from '../src/systems/lanes';
import { Station } from '../src/systems/stations';
import { WaitingDrivers } from '../src/systems/waitingDrivers';

const layout = ROADSIDE.layout;

function car(x: number, z: number): Car {
  const c = new Car({ mesh: { position: { x, y: 0, z } } } as unknown as CarModel);
  c.def = CARS[0]!;
  c.needs = ['wash'];
  c.served = [];
  return c;
}

/** Bay 1 washing one car, with another waiting in line on the lot. */
function bayWithLine(progress = 0.1) {
  const bay = new Station('bay1', 'bay', layout.pads.bay1!, layout.bay, 0.9, null);
  const washing = car(bay.at.x, bay.at.z);
  washing.state = 'waiting';
  washing.progress = progress;
  bay.customer = washing;
  const waiting = car(bay.at.x, bay.at.z - layout.queueGap);
  waiting.state = 'queued';
  bay.queue.push(waiting);
  return { bay, washing, waiting };
}

function drivers(built: string[], snacks: unknown[] = []) {
  return new WaitingDrivers(layout, (id) => built.includes(id), null, (_from, to) => [to], (at) => snacks.push(at), () => 0);
}

function run(d: WaitingDrivers, lanes: Station[], seconds: number): void {
  for (let t = 0; t < seconds; t += 0.05) d.update(0.05, lanes);
}

describe('drivers waiting in line', () => {
  it('get out and sit on the bench while the bay ahead is busy; the car waits for them', () => {
    const { bay, waiting } = bayWithLine();
    const d = drivers(['bench']);
    d.ready = true;
    run(d, [bay], 6);
    expect(waiting.away).toBe(true);
    expect(d.sitting).toBe(1);
  });

  it('hurry back once the car ahead is nearly done, and get in', () => {
    const { bay, washing, waiting } = bayWithLine();
    const d = drivers(['bench']);
    d.ready = true;
    run(d, [bay], 6);
    washing.progress = 0.9;
    run(d, [bay], 6);
    expect(d.sitting).toBe(0);
    expect(waiting.away).toBe(false);
    expect(d.count).toBe(0);
  });

  it('a long wait: up from the bench for a can at the vending machine (sold there), then back to the bench', () => {
    const snacks: { x: number; z: number }[] = [];
    const { bay, waiting } = bayWithLine();
    const d = drivers(['bench', 'vending'], snacks);
    d.ready = true;
    run(d, [bay], 20);
    expect(snacks).toHaveLength(1);
    expect(snacks[0]).toEqual(layout.pads.vending);
    expect(waiting.snacked).toBe(true);
    expect(d.sitting).toBe(1);
  });

  it('with only the vending machine: a can, then straight back', () => {
    const snacks: unknown[] = [];
    const { bay, waiting } = bayWithLine();
    const d = drivers(['vending'], snacks);
    d.ready = true;
    run(d, [bay], 20);
    expect(snacks).toHaveLength(1);
    expect(waiting.away).toBe(false);
  });

  it('out of patience, the driver comes straight back (before storming off)', () => {
    const { bay, waiting } = bayWithLine();
    const d = drivers(['bench']);
    d.ready = true;
    run(d, [bay], 3);
    expect(waiting.away).toBe(true);
    waiting.recall = true;
    run(d, [bay], 8);
    expect(waiting.away).toBe(false);
  });

  it('stay in the car with nothing built, while it is still on the road, or once it has had its chance', () => {
    const { bay, waiting } = bayWithLine();
    run(drivers([]), [bay], 5);
    expect(waiting.away).toBe(false);
    const road = bayWithLine();
    road.waiting.model.mesh.position.z = layout.lot.minZ - 3;
    const d = drivers(['bench']);
    d.ready = true;
    run(d, [road.bay], 5);
    expect(road.waiting.away).toBe(false);
    expect(TUNING.waitingDrivers.chance).toBeGreaterThan(0);
  });

  it('two seats on the bench: never more than two sitting', () => {
    const lines = [bayWithLine(), bayWithLine(), bayWithLine()];
    const d = drivers(['bench']);
    d.ready = true;
    run(d, lines.map((l) => l.bay), 6);
    expect(d.sitting).toBeLessThanOrEqual(2);
  });

  it('the valet never moves a car whose driver is out', () => {
    const { bay, waiting } = bayWithLine();
    waiting.away = true;
    const empty = new Station('bay2', 'bay', layout.pads.bay2!, layout.bay, 0.9, null);
    expect(pickRebalance([bay, empty])).toBeNull();
    waiting.away = false;
    expect(pickRebalance([bay, empty])?.car).toBe(waiting);
  });
});
