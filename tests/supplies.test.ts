import { describe, expect, it } from 'vitest';
import { Group } from 'three';
import { LOCATION1, TUNING } from '../src/core/config';
import { newGame } from '../src/core/gameState';
import { Carrier } from '../src/systems/carry';
import { Station } from '../src/systems/stations';
import { Supplies } from '../src/systems/supplies';
import type { SoundManager } from '../src/audio/sound';

const silent = { play: () => {} } as unknown as SoundManager;
const shelf = LOCATION1.pads.soap!;
const USES = TUNING.stations.usesPerItem;
/** A full station, counted in uses (cars). */
const CAP = TUNING.stations.supplyCapacity * USES;

function setup(unlocked = ['bay1', 'soap']) {
  const state = { ...newGame(), unlocked: [...unlocked] };
  const stations = [new Station('bay1', 'bay', LOCATION1.pads.bay1!, LOCATION1.bay, 0.9, null)];
  if (unlocked.includes('dryer')) stations.push(new Station('dryer', 'dryer', LOCATION1.pads.dryer!, LOCATION1.station, 1, null));
  const supplies = new Supplies(state, LOCATION1, () => stations, silent, null);
  let at = { x: 0, z: 0 };
  const carrier = new Carrier(new Group(), () => at, () => 3);
  const moveTo = (p: { x: number; z: number }) => (at = p);
  const tick = (seconds = 0.2) => {
    supplies.update(seconds, [carrier]);
    carrier.update(seconds, false);
  };
  return { state, stations, supplies, carrier, moveTo, tick };
}

describe('supplies', () => {
  it('nothing needs supplies before the shelf is built', () => {
    const { stations, supplies, tick } = setup(['bay1']);
    tick();
    expect(stations[0]!.supply).toBeNull();
    expect(supplies.take(stations[0]!)).toBe(true);
  });

  it('one item serves several cars', () => {
    const { state, stations, supplies, tick } = setup();
    tick();
    state.supplies['bay1.soap'] = USES;
    for (let i = 0; i < USES; i++) expect(supplies.take(stations[0]!)).toBe(true);
    expect(supplies.take(stations[0]!)).toBe(false);
  });

  it('a bay starts full of soap and each car uses one', () => {
    const { state, stations, supplies, tick } = setup();
    tick();
    expect(stations[0]!.supply).toBe('soap');
    expect(state.supplies['bay1.soap']).toBe(CAP);
    expect(supplies.take(stations[0]!)).toBe(true);
    expect(state.supplies['bay1.soap']).toBe(CAP - 1);
  });

  it('an empty station stops (take fails)', () => {
    const { state, stations, supplies, tick } = setup();
    tick();
    state.supplies['bay1.soap'] = 0;
    expect(supplies.take(stations[0]!)).toBe(false);
  });

  it('picks up only what stations need, up to the carry limit', () => {
    const { state, carrier, moveTo, tick } = setup();
    tick();
    state.supplies['bay1.soap'] = USES; // room for 5 more items
    moveTo(shelf);
    for (let i = 0; i < 10; i++) tick();
    expect(carrier.stack).toEqual(['soap', 'soap', 'soap']);
    state.supplies['bay1.soap'] = CAP - USES; // now needs just 1 item, and we carry 3
    for (let i = 0; i < 10; i++) tick();
    // The 2 extra go back on the shelf instead of clogging the carrier's hands.
    expect(carrier.stack).toEqual(['soap']);
  });

  it('drops off inside the station, never over capacity', () => {
    const { state, carrier, moveTo, tick } = setup();
    tick();
    state.supplies['bay1.soap'] = CAP - 2 * USES;
    carrier.push('soap');
    carrier.push('soap');
    carrier.push('soap');
    moveTo({ x: 0, z: 9 }); // far from everything
    tick();
    expect(carrier.stack.length).toBe(3);
    moveTo(LOCATION1.pads.bay1!);
    for (let i = 0; i < 10; i++) tick();
    expect(state.supplies['bay1.soap']).toBe(CAP);
    expect(carrier.stack.length).toBe(1);
  });

  it('towels appear once the dryer exists, and go to the dryer', () => {
    const { state, supplies, carrier, moveTo, tick } = setup(['bay1', 'soap', 'dryer']);
    tick();
    expect(supplies.types()).toEqual(['soap', 'towel']);
    state.supplies['bay1.soap'] = CAP;
    state.supplies['dryer.towel'] = 2 * USES;
    moveTo(shelf);
    for (let i = 0; i < 5; i++) tick();
    expect(carrier.stack.every((item) => item === 'towel')).toBe(true);
  });

  it('the shelf restocks over time up to its capacity, more with bigger storage', () => {
    const { state, supplies, tick } = setup();
    tick();
    state.supplies['shelf.soap'] = 0;
    for (let i = 0; i < 100; i++) tick(TUNING.supplies.restockSeconds);
    expect(state.supplies['shelf.soap']).toBe(TUNING.supplies.shelfCapacity);
    state.levels['soap.storage'] = 2;
    expect(supplies.shelfCapacity()).toBe(TUNING.supplies.shelfCapacity + 4);
  });
});

describe('supply priority', () => {
  it('fetches for an empty station first, even if another type has more room', () => {
    const { state, carrier, moveTo, tick } = setup(['bay1', 'soap', 'dryer']);
    tick();
    state.supplies['bay1.soap'] = USES; // room for 5 items
    state.supplies['dryer.towel'] = 0; // room for 6 and blocking cars
    moveTo(shelf);
    tick();
    expect(carrier.stack[0]).toBe('towel');
  });

  it('alternates once the empty station is covered by what is carried', () => {
    const { state, carrier, moveTo, tick } = setup(['bay1', 'soap', 'dryer']);
    tick();
    state.supplies['bay1.soap'] = USES;
    state.supplies['dryer.towel'] = 0;
    moveTo(shelf);
    for (let i = 0; i < 6; i++) tick();
    expect(carrier.stack.sort()).toEqual(['soap', 'towel', 'towel']);
  });
});
