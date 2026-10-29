// Milestone 5: who uses which lane, the valet, the tunnel conveyor, the
// garage, VIP pay and the tutorial hand.
import { describe, expect, it } from 'vitest';
import { CARS, LOCATION1, PADS, STAGES, TUNING } from '../src/core/config';
import { newGame } from '../src/core/gameState';
import type { Car } from '../src/systems/cars';
import { jobSeconds } from '../src/systems/economy';
import { guideTarget, tutorialActive, type GuideView } from '../src/systems/guide';
import { canUse, nextStop, pickRebalance, type Lane } from '../src/systems/lanes';
import { bill } from '../src/systems/traffic';
import { Tunnel } from '../src/systems/tunnel';

const def = (id: string) => CARS.find((c) => c.id === id)!;
const stage = (id: string) => STAGES.find((s) => s.id === id)!;

function queued(id = 'sedan', vip = false): Car {
  return { def: def(id), vip, state: 'queued' } as unknown as Car;
}

function lane(kind: string, queue: Car[], idle: boolean): Lane {
  return { kind, queue, idle };
}

describe('which lane a car may use', () => {
  it('swamp mud needs the tunnel; the VIP is washed by hand', () => {
    expect(canUse(queued('monster'), { kind: 'tunnel' })).toBe(true);
    expect(canUse(queued('monster'), { kind: 'bay' })).toBe(false);
    expect(canUse(queued('vip', true), { kind: 'bay' })).toBe(true);
    expect(canUse(queued('vip', true), { kind: 'tunnel' })).toBe(false);
    expect(canUse(queued('sedan'), { kind: 'tunnel' })).toBe(true);
    expect(canUse(queued('sedan'), { kind: 'bay' })).toBe(true);
  });
});

describe('valet rebalancing', () => {
  it('moves the front car of the longest line to an idle empty lane', () => {
    const a = queued();
    const short = lane('bay', [queued()], false);
    const long = lane('bay', [a, queued(), queued()], false);
    const empty = lane('bay', [], true);
    expect(pickRebalance([short, long, empty])).toEqual({ car: a, from: long, to: empty });
  });

  it('does nothing when no lane is idle', () => {
    expect(pickRebalance([lane('bay', [queued()], false), lane('bay', [], false)])).toBeNull();
  });

  it('never moves a monster truck into a bay, or a car still driving in', () => {
    const tunnel = lane('tunnel', [queued('monster')], false);
    expect(pickRebalance([tunnel, lane('bay', [], true)])).toBeNull();
    const driving = { ...queued(), state: 'arriving' } as unknown as Car;
    expect(pickRebalance([lane('bay', [driving], false), lane('bay', [], true)])).toBeNull();
  });

  it('skips a line whose front car cannot go there and tries the next', () => {
    const sedan = queued();
    const tunnelLine = lane('tunnel', [queued('monster'), queued('monster')], false);
    const bayLine = lane('bay', [sedan], false);
    expect(pickRebalance([tunnelLine, bayLine, lane('bay', [], true)])?.car).toBe(sedan);
  });
});

describe('after the wash', () => {
  const dryer = { kind: 'dryer' };
  const wax = { kind: 'wax' };
  const garage = { kind: 'garage' };
  const bay = { kind: 'bay' };
  const finishing = [dryer, wax, garage];

  it('goes dryer, wax, then the garage only if it wants detailing', () => {
    expect(nextStop(finishing, bay, false)).toBe(dryer);
    expect(nextStop(finishing, dryer, false)).toBe(wax);
    expect(nextStop(finishing, wax, false)).toBeUndefined();
    expect(nextStop(finishing, wax, true)).toBe(garage);
    expect(nextStop(finishing, garage, true)).toBeUndefined();
  });

  it('tunnel cars were dried by its blowers, so they go straight to wax', () => {
    expect(nextStop(finishing, { kind: 'tunnel' }, false)).toBe(wax);
  });
});

describe('pay', () => {
  const car = (payDef = def('sedan'), patience = 0) =>
    ({ payDef, stages: [stage('prerinse')], served: ['wash'], quality: 1, patience, patienceMax: 50 }) as Parameters<typeof bill>[0];

  it('base pay, plus a tip only when served before half patience is used', () => {
    expect(bill(car())).toEqual({ pay: 15, tip: 0 });
    expect(bill(car(def('sedan'), 40)).tip).toBeGreaterThan(0);
  });

  it('the golden VIP pays 5x the best regular car', () => {
    const best = def('sports');
    expect(bill(car({ ...def('vip'), basePay: best.basePay })).pay).toBe(5 * best.basePay);
  });

  it('detailing doubles the pay', () => {
    const detailed = { ...car(), stages: [stage('prerinse'), stage('detail')] };
    expect(bill(detailed).pay).toBe(30);
  });

  it('fuel pays a share of base pay; fuel and a wash together pay the combo bonus', () => {
    const fuel = TUNING.fuel.payFactor;
    expect(bill({ ...car(), stages: [], served: ['fuel'] }).pay).toBe(Math.round(15 * fuel));
    const combo = TUNING.tickets.combo[2]!;
    expect(bill({ ...car(), served: ['fuel', 'wash'] }).pay).toBe(Math.round(15 * (1 + fuel) * combo));
  });

  it('a car that got nothing pays nothing', () => {
    expect(bill({ ...car(), served: [] }).pay).toBe(0);
  });
});

describe('job times', () => {
  const state = newGame();

  it('garage, dryer and wax take their tuning seconds; speed upgrades shorten them', () => {
    expect(jobSeconds('garage', 'garage', 'dusty', state, false)).toBe(TUNING.stations.garage.seconds);
    const faster = { ...state, levels: { 'garage.speed': 2 } };
    expect(jobSeconds('garage', 'garage', 'dusty', faster, false)).toBeLessThan(TUNING.stations.garage.seconds);
  });

  it('muddier cars take longer in a bay', () => {
    expect(jobSeconds('bay1', 'bay', 'muddy', state, true)).toBeGreaterThan(jobSeconds('bay1', 'bay', 'dusty', state, true));
  });
});

/** A car on the tunnel's conveyor, without a 3D model. */
function rider(state: string, progress = 0): Car {
  return {
    state,
    progress,
    clean: 0,
    supplied: false,
    arrived: true,
    model: { mesh: { position: { x: 0, z: 0 } } },
    update() {},
  } as unknown as Car;
}

describe('brush tunnel', () => {
  const make = () => {
    const tunnel = new Tunnel(LOCATION1.pads.tunnel!, LOCATION1.tunnel, null);
    tunnel.supply = TUNING.stations.tunnel.supply;
    return tunnel;
  };
  const noop = { onMoving() {}, onFinished() {}, onWaiting() {}, onDone() {} };
  const soap = (n: number) => ({ take: () => n-- > 0 });

  it('lets the next car in only once the one ahead is a third of the way through', () => {
    const tunnel = make();
    expect(tunnel.canAccept).toBe(true);
    tunnel.inside.push(rider('entering'));
    expect(tunnel.canAccept).toBe(false);
    tunnel.inside[0]!.state = 'waiting';
    tunnel.inside[0]!.progress = 0.2;
    expect(tunnel.canAccept).toBe(false);
    tunnel.inside[0]!.progress = 0.4;
    expect(tunnel.canAccept).toBe(true);
  });

  it('holds at most three cars', () => {
    const tunnel = make();
    tunnel.inside.push(rider('waiting', 0.9), rider('waiting', 0.6), rider('waiting', 0.4));
    expect(tunnel.canAccept).toBe(false);
    expect(tunnel.idle).toBe(false);
    expect(tunnel.needsWork).toBe(false);
  });

  it('carries a soaped car through on its own and reports it finished', () => {
    const tunnel = make();
    const car = rider('waiting');
    tunnel.inside.push(car);
    let finished = 0;
    for (let i = 0; i < 200 && !finished; i++) tunnel.run(0.1, 0, soap(1), { ...noop, onFinished: () => finished++ });
    expect(finished).toBe(1);
    expect(car.progress).toBe(1);
    expect(car.model.mesh.position.z).toBeCloseTo(tunnel.exit.z);
  });

  it('stops without soap, and while the front car waits at the exit', () => {
    const tunnel = make();
    const car = rider('waiting');
    tunnel.inside.push(car);
    tunnel.run(1, 0, soap(0), noop);
    expect(car.progress).toBe(0);
    const done = rider('done', 1);
    const behind = rider('waiting', 0.5);
    behind.supplied = true;
    const blocked = make();
    blocked.inside.push(done, behind);
    blocked.run(1, 0, soap(5), noop);
    expect(behind.progress).toBe(0.5);
  });
});

describe('tutorial hand', () => {
  const at = (x: number) => ({ x, z: 0 });
  const view: GuideView = {
    firstCar: at(1),
    pile: at(2),
    pad: { at: at(3), owed: 50 },
    shelf: at(4),
    lowBay: at(5),
    carryingSoap: false,
    fuelCar: null,
  };

  it('points at the car, then the cash, then the soap, then an affordable pad', () => {
    const state = newGame();
    expect(guideTarget(state, view)).toEqual(at(1));
    state.flags.push('washed');
    expect(guideTarget(state, view)).toEqual(at(2));
    state.flags.push('collected');
    expect(guideTarget(state, view)).toEqual(at(4));
    expect(guideTarget(state, { ...view, carryingSoap: true })).toEqual(at(5));
    state.flags.push('supplied');
    state.cash = 10;
    expect(guideTarget(state, view)).toBeNull();
    state.cash = 50;
    expect(guideTarget(state, view)).toEqual(at(3));
  });

  it('points at the first car at the fuel pump until the player has filled one up', () => {
    const state = newGame();
    state.flags.push('washed', 'collected', 'supplied');
    state.cash = 50;
    expect(guideTarget(state, { ...view, fuelCar: at(6) })).toEqual(at(6));
    state.flags.push('fueled');
    expect(guideTarget(state, { ...view, fuelCar: at(6) })).toEqual(at(3));
  });

  it('goes away once the first washer is hired', () => {
    const state = newGame();
    state.unlocked.push('washer');
    expect(tutorialActive(state)).toBe(false);
    expect(guideTarget(state, view)).toBeNull();
  });
});

describe('location 1 has room for everything', () => {
  it('every pad has a place on the lot', () => {
    for (const pad of PADS) expect(LOCATION1.pads[pad.id], pad.id).toBeDefined();
  });
});
