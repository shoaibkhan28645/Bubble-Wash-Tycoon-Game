import { describe, expect, it } from 'vitest';
import { Group } from 'three';
import { LOCATION1, TUNING, type Point, type Rect } from '../src/core/config';
import { newGame } from '../src/core/gameState';
import type { Car } from '../src/systems/cars';
import { SOLID } from '../src/systems/buildings';
import { Carrier } from '../src/systems/carry';
import { bayWorkSpot } from '../src/systems/traffic';
import { Forecourt } from '../src/systems/forecourt';
import { NavGrid } from '../src/systems/nav';
import { pickStation, planRunner } from '../src/systems/staffPlan';
import { Station } from '../src/systems/stations';
import { Supplies } from '../src/systems/supplies';
import type { SoundManager } from '../src/audio/sound';

const silent = { play: () => {} } as unknown as SoundManager;

/** Every solid prop from buildings.ts, where it's built (the whole lot built), and the grass beside the lot. */
function solids(): Rect[] {
  const props = Object.entries(SOLID).flatMap(([id, boxes]) => {
    const at = LOCATION1.buildAt[id] ?? LOCATION1.pads[id];
    if (!at) return [];
    return boxes.map(([hw, hd, dx = 0, dz = 0]) => ({ minX: at.x + dx - hw, maxX: at.x + dx + hw, minZ: at.z + dz - hd, maxZ: at.z + dz + hd }));
  });
  return [...props, ...LOCATION1.blocked];
}

/** Walks a path like the staff do and reports whether the target was reached without entering a prop. */
function walk(nav: NavGrid, from: Point, to: Point, obstacles: Rect[]): boolean {
  const path = nav.findPath(from, to);
  let p = { ...from };
  for (const next of path) {
    const steps = Math.ceil(Math.hypot(next.x - p.x, next.z - p.z) / 0.05);
    for (let s = 1; s <= steps; s++) {
      const q = { x: p.x + ((next.x - p.x) * s) / steps, z: p.z + ((next.z - p.z) * s) / steps };
      if (obstacles.some((o) => q.x > o.minX && q.x < o.maxX && q.z > o.minZ && q.z < o.maxZ)) return false;
    }
    p = { ...next };
  }
  return Math.hypot(p.x - to.x, p.z - to.z) < 0.01;
}

describe('staff pathfinding', () => {
  const obstacles = solids();
  const nav = new NavGrid(LOCATION1.walk, obstacles, 0.45);
  const shelfSpot = { x: LOCATION1.pads.soap!.x, z: LOCATION1.pads.soap!.z + 1 };

  const bay1 = bayWorkSpot(LOCATION1.pads.bay1!);
  const bay2 = bayWorkSpot(LOCATION1.pads.bay2!);

  it('goes around the shelf when coming from bay 1 (used to walk into it and stop)', () => {
    expect(walk(nav, bay1, shelfSpot, obstacles)).toBe(true);
  });

  it('walks into a bay through its open end, never through its walls', () => {
    expect(walk(nav, LOCATION1.staffSpots.washer!, bay1, obstacles)).toBe(true);
    expect(walk(nav, bay1, bay2, obstacles)).toBe(true);
  });

  it('goes around the register between the shelf and bay 2', () => {
    expect(walk(nav, shelfSpot, bay2, obstacles)).toBe(true);
    expect(walk(nav, { x: 0, z: 9 }, { x: 0, z: 3 }, obstacles)).toBe(true);
  });

  it('reaches every station side and home spot from everywhere it works', () => {
    const forecourt = new Forecourt(LOCATION1, null);
    forecourt.addPump('pump1');
    forecourt.addPump('pump2');
    const pumpSides = forecourt.pumps.map((p) => p.side!);
    const dryer = LOCATION1.pads.dryer!;
    const dryerSide = { x: dryer.x - 1.35, z: dryer.z + 2.2 };
    const wax = LOCATION1.pads.wax!;
    const waxSide = { x: wax.x - 1.35, z: wax.z + 2.2 };
    const garage = LOCATION1.pads.garage!;
    const garageSide = { x: garage.x - 1.3, z: garage.z + 1.2 };
    const spots = [shelfSpot, bay1, bay2, dryerSide, waxSide, garageSide, ...pumpSides, ...Object.values(LOCATION1.staffSpots)];
    for (const a of spots) for (const b of spots) expect(walk(nav, a, b, obstacles)).toBe(true);
  });

  it('a clear line is one straight step', () => {
    expect(nav.findPath({ x: -6, z: 0 }, { x: -6, z: 3 })).toEqual([{ x: -6, z: 3 }]);
  });
});

function bayWith(id: string, x: number, patience: number | null): Station {
  const station = new Station(id, 'bay', { x, z: -3 }, LOCATION1.bay, 0.9, null);
  if (patience !== null) station.car = { state: 'waiting', patience, patienceMax: 60 } as unknown as Car;
  return station;
}

describe('which car the washer serves', () => {
  const nobody = () => false;

  it('serves both bays, picking the car that has waited longest', () => {
    const bay1 = bayWith('bay1', -2.2, 50);
    const bay2 = bayWith('bay2', 2.2, 12);
    expect(pickStation([bay1, bay2], ['bay'], null, nobody)).toBe(bay2);
  });

  it('finishes the car it started before switching', () => {
    const bay1 = bayWith('bay1', -2.2, 50);
    const bay2 = bayWith('bay2', 2.2, 5);
    expect(pickStation([bay1, bay2], ['bay'], bay1, nobody)).toBe(bay1);
  });

  it('leaves the bay the player is washing to the player', () => {
    const bay1 = bayWith('bay1', -2.2, 50);
    const bay2 = bayWith('bay2', 2.2, 5);
    expect(pickStation([bay1, bay2], ['bay'], null, (s) => s === bay2)).toBe(bay1);
  });

  it('waits when no car needs washing, and ignores the dryer', () => {
    const empty = bayWith('bay1', -2.2, null);
    const dryer = new Station('dryer', 'dryer', LOCATION1.pads.dryer!, LOCATION1.station, 1, null);
    dryer.car = { state: 'waiting', patience: 1, patienceMax: 60 } as unknown as Car;
    expect(pickStation([empty, dryer], ['bay'], null, nobody)).toBeNull();
  });
});

describe('runner never jams', () => {
  const uses = TUNING.stations.usesPerItem;
  const full = TUNING.stations.supplyCapacity * uses;

  function setup() {
    const state = { ...newGame(), unlocked: ['bay1', 'soap', 'dryer'] };
    const stations = [
      new Station('bay1', 'bay', LOCATION1.pads.bay1!, LOCATION1.bay, 0.9, null),
      new Station('dryer', 'dryer', LOCATION1.pads.dryer!, LOCATION1.station, 1, null),
    ];
    const supplies = new Supplies(state, LOCATION1, () => stations, silent, null);
    let at: Point = LOCATION1.pads.soap!;
    const carrier = new Carrier(new Group(), () => at, () => 3);
    supplies.update(0, [carrier]);
    return { state, stations, supplies, carrier, moveTo: (p: Point) => (at = p) };
  }

  it('with hands full of towels nobody needs, goes back to swap them for soap', () => {
    const { state, stations, supplies, carrier } = setup();
    state.supplies['dryer.towel'] = full;
    state.supplies['bay1.soap'] = 0;
    for (let i = 0; i < 3; i++) carrier.push('towel');
    expect(planRunner(carrier, stations, state, supplies)).toEqual({ kind: 'shelf' });
    for (let i = 0; i < 12; i++) {
      supplies.update(0.2, [carrier]);
      carrier.update(0.2, false);
    }
    expect(carrier.count('towel')).toBe(0);
    expect(carrier.count('soap')).toBeGreaterThan(0);
  });

  it('delivers to the emptiest station first', () => {
    const { state, stations, supplies, carrier } = setup();
    state.supplies['bay1.soap'] = 2 * uses;
    carrier.push('soap');
    const plan = planRunner(carrier, stations, state, supplies);
    expect(plan.kind === 'drop' && plan.station.id).toBe('bay1');
  });

  it('rests at home when everything is stocked', () => {
    const { state, stations, supplies, carrier } = setup();
    state.supplies['bay1.soap'] = full;
    state.supplies['dryer.towel'] = full;
    expect(planRunner(carrier, stations, state, supplies)).toEqual({ kind: 'home' });
  });
});
