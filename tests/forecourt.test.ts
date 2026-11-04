// The fuel forecourt: one line for the pumps, and where cars go once filled up.
import { describe, expect, it } from 'vitest';
import { CARS, TUNING } from '../src/core/config';
import { ROADSIDE } from '../src/core/towns';
import type { CarModel } from '../src/render/models/actors';
import { Car } from '../src/systems/cars';
import { Forecourt } from '../src/systems/forecourt';
import { Station } from '../src/systems/stations';
import type { Need } from '../src/systems/tickets';

function car(needs: Need[]): Car {
  const c = new Car({ mesh: { position: { x: 0, y: 0, z: 0 }, visible: true } } as unknown as CarModel);
  c.def = CARS[0]!;
  c.needs = needs;
  c.served = ['fuel'];
  c.patienceMax = 60;
  c.patience = 10;
  return c;
}

function open(...ids: string[]): Forecourt {
  const forecourt = new Forecourt(ROADSIDE.layout, null);
  for (const id of ids) forecourt.addPump(id);
  return forecourt;
}

describe('the forecourt line', () => {
  it('has no room before a pump is built, then room for the pump and one waiting', () => {
    expect(open().hasRoom).toBe(false);
    const forecourt = open('pump1');
    expect(forecourt.hasRoom).toBe(true);
    forecourt.line.push(car(['fuel']));
    forecourt.advance();
    expect(forecourt.pumps[0]!.customer).not.toBeNull();
    forecourt.line.push(car(['fuel']));
    expect(forecourt.hasRoom).toBe(false);
  });

  it('sends the first car in line to whichever pump is free', () => {
    const forecourt = open('pump1', 'pump2');
    const busy = car(['fuel']);
    forecourt.pumps[0]!.customer = busy;
    const next = car(['fuel']);
    forecourt.line.push(next);
    forecourt.advance();
    expect(forecourt.pumps[1]!.customer).toBe(next);
    expect(next.state).toBe('entering');
    expect(forecourt.line).toHaveLength(0);
  });

  it('gives every pump a spot for its worker, beside the island', () => {
    const forecourt = open('pump1', 'pump2');
    const [a, b] = forecourt.pumps.map((p) => p.side!);
    expect(a!.x).toBe(b!.x);
    expect(a!.z).not.toBe(b!.z);
  });
});

describe('leaving the pump', () => {
  const lane = () => new Station('bay1', 'bay', ROADSIDE.layout.pads.bay1!, ROADSIDE.layout.bay, 0.9, null);

  it('fuel only: pays and drives away, freeing the pump', () => {
    const forecourt = open('pump1');
    const pump = forecourt.pumps[0]!;
    const c = car(['fuel']);
    pump.customer = c;
    expect(forecourt.depart(c, pump, null)).toBe('away');
    expect(pump.customer).toBeNull();
    expect(c.state).toBe('leaving');
  });

  it('fuel and a wash: drives over to the wash lane, with some patience back', () => {
    const forecourt = open('pump1');
    const pump = forecourt.pumps[0]!;
    const c = car(['fuel', 'wash']);
    pump.customer = c;
    const bay = lane();
    expect(forecourt.depart(c, pump, bay)).toBe('wash');
    expect(bay.queue).toEqual([c]);
    expect(c.state).toBe('arriving');
    expect(c.patience).toBe(10 + 60 * TUNING.fuel.patienceRefill);
  });

  it('one car at a time drives out along the exit both pumps share', () => {
    const forecourt = open('pump1', 'pump2');
    const [one, two] = forecourt.pumps;
    const [a, b] = [car(['fuel']), car(['fuel'])];
    one!.customer = a;
    two!.customer = b;
    a.model.mesh.position.z = one!.at.z;
    expect(forecourt.depart(a, one!, null)).toBe('away');
    expect(forecourt.depart(b, two!, null)).toBe('stay');
    // Out on the road: the next car may go.
    a.model.mesh.position.z = ROADSIDE.layout.roadZ;
    expect(forecourt.depart(b, two!, null)).toBe('away');
  });

  it('waits a little for room in a wash lane, then gives the wash a miss', () => {
    const forecourt = open('pump1');
    const pump = forecourt.pumps[0]!;
    const c = car(['fuel', 'wash']);
    pump.customer = c;
    expect(forecourt.depart(c, pump, null)).toBe('stay');
    expect(pump.customer).toBe(c);
    c.timer = TUNING.cars.leaveDelay + TUNING.fuel.washWaitSeconds;
    expect(forecourt.depart(c, pump, null)).toBe('away');
    expect(c.needs).toEqual(['fuel']);
  });
});
