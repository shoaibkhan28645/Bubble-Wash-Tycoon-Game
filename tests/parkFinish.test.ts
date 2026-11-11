// Starlight Fun Park's last touches: a new ride's opening rush, the
// operators' quick-launch upgrade, litter costing what's near it, and the
// plush toys for the gift shop's shelves.
import { describe, expect, it } from 'vitest';
import { TUNING, UPGRADES } from '../src/core/config';
import { newGame } from '../src/core/gameState';
import { STARLIGHT } from '../src/core/starlight';
import { Litter } from '../src/systems/litter';
import { ParkCrowd, ParkVisitor, RIDES, Ride } from '../src/systems/park';
import { PLUSH } from '../src/systems/prizes';

const { layout } = STARLIGHT;
const PARK = TUNING.park;

function park(seed: number, opening: string | null) {
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const wishes: string[][] = [];
  const crowd = new ParkCrowd(layout, newGame(), () => 0, () => 0, null, (_from, to) => [to], {
    onServed: () => {},
    onGaveUp: () => {},
    onLaunch: () => {},
    onWishes: (v) => wishes.push([...v.wishes]),
  }, random);
  crowd.open = true;
  crowd.addCounter('booth', 'booth', null);
  for (const id of ['carousel', 'teacups', 'bumper', 'swings', 'haunted']) crowd.addRide(id, id);
  if (opening) crowd.openRide(opening);
  return { crowd, wishes };
}

describe('a new ride\'s opening rush', () => {
  it('puts it on far more wish lists for its first few minutes, then ends', () => {
    const wanted = (opening: string | null) => {
      const { crowd, wishes } = park(31, opening);
      for (let t = 0; t < 150; t += 0.05) crowd.update(0.05, () => ({ rate: 1, byPlayer: false }), () => ({ hero: false, staff: true }));
      return wishes.filter((w) => w.includes('haunted')).length / Math.max(1, wishes.length);
    };
    expect(wanted('haunted')).toBeGreaterThan(wanted(null) * 1.4);
    const { crowd } = park(5, 'haunted');
    expect(crowd.openingLeft('haunted')).toBe(PARK.opening.seconds);
    for (let t = 0; t < PARK.opening.seconds + 1; t += 0.5) crowd.update(0.5, () => ({ rate: 1, byPlayer: false }), () => ({ hero: false, staff: false }));
    expect(crowd.openingLeft('haunted')).toBe(0);
  });
});

describe('the quick-launch upgrade', () => {
  it('has the operators launch a part-full ride sooner', () => {
    const launchAfter = (scale: number) => {
      const ride = new Ride('carousel', RIDES.carousel!, layout.rides.carousel!);
      ride.waitScale = scale;
      ride.seats[0] = new ParkVisitor(null, ride.seatPoint(0), 40, 60, false);
      ride.seats[0].step = 'seated';
      let t = 0;
      while (!ride.lever(0.05, false, true) && t < 60) t += 0.05;
      return t;
    };
    expect(launchAfter(0.5)).toBeLessThan(launchAfter(1) * 0.6);
  });

  it('is on each operator\'s panel: the ride operator, the dock hand and the coaster crew', () => {
    expect(UPGRADES.kinds.launch!.factor).toBeLessThan(1);
    expect(UPGRADES.panels.carousel).toContain('operator.launch');
    expect(UPGRADES.panels.boats).toContain('boats.launch');
    expect(UPGRADES.panels.coaster).toContain('crew.launch');
  });
});

describe('litter near a ride or a stall', () => {
  it('costs it a little of its takings, a piece at a time, up to a limit', () => {
    let seed = 3;
    const litter = new Litter(() => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 0.01);
    const at = { x: 0, z: 0 };
    expect(litter.messAt(at)).toBe(0);
    litter.drop({ x: 1, z: 1 }, false);
    expect(litter.messAt(at)).toBeCloseTo(PARK.litter.payPerPiece);
    for (let i = 0; i < 12; i++) litter.drop({ x: 1, z: -1 }, false);
    expect(litter.messAt(at)).toBe(PARK.litter.payCap);
    // Far away, it doesn't count.
    expect(litter.messAt({ x: 30, z: 30 })).toBe(0);
  });
});

describe('the gift shop\'s shelves', () => {
  it('have a place, and a colour, for every plush toy', () => {
    expect(PLUSH.length).toBeLessThanOrEqual(12);
    for (const plush of PLUSH) expect(plush.color).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('a perfect day', () => {
  it('ends in a tip on the way out', () => {
    expect(PARK.perfectDay.tip).toBeGreaterThan(0);
  });
});
