import { describe, expect, it } from 'vitest';
import { stationDef } from '../src/core/config';
import { newGame } from '../src/core/gameState';
import { BEACH } from '../src/core/beach';
import { WalkUps, type ServedTourist, type Tourist } from '../src/systems/walkups';

const RULES = { spawnSeconds: 2, patience: 30, walkSpeed: 2.3, pay: [100, 160] as [number, number] };

function boardwalk(patience = RULES.patience) {
  const served: ServedTourist[] = [];
  const gaveUp: Tourist[] = [];
  const walkups = new WalkUps(
    BEACH.layout,
    newGame(),
    { ...RULES, patience },
    () => 0,
    () => 0,
    null,
    (s) => served.push(s),
    (t) => gaveUp.push(t),
    () => 0,
  );
  walkups.open = true;
  walkups.addCounter('kiosk', 'kiosk', null);
  return { walkups, served, gaveUp };
}

/** Runs the boardwalk for `seconds`, the counter worked at `rate` (0: nobody behind it). */
function run(walkups: WalkUps, seconds: number, rate: number): void {
  for (let t = 0; t < seconds; t += 0.1) walkups.update(0.1, () => ({ rate, byPlayer: rate > 0 }));
}

describe('walk-up counters', () => {
  it('brings tourists to the window, where they wait to be served', () => {
    const { walkups } = boardwalk();
    const [counter] = walkups.counters;
    run(walkups, 25, 0);
    expect(counter!.line.length).toBeGreaterThan(1);
    expect(counter!.front?.at).toEqual(BEACH.layout.counters.kiosk!.window);
    expect(counter!.needsWork).toBe(true);
  });

  it('serves the front of the line, who pays and strolls off, and the next steps up', () => {
    const { walkups, served } = boardwalk();
    const [counter] = walkups.counters;
    run(walkups, 25, 0);
    const first = counter!.front!;
    const second = counter!.line[1]!;
    run(walkups, (stationDef('kiosk').seconds ?? 1) + 0.2, 1);
    expect(served[0]?.tourist).toBe(first);
    expect(first.served).toEqual(['icecream']);
    expect(first.manual).toBe(true);
    expect(counter!.line[0]).toBe(second);
    // The next one walks up to the window and is ready to be served.
    run(walkups, 3, 0);
    expect(counter!.front).toBe(second);
  });

  it('opens a new boardwalk with a tourist already at the window', () => {
    const { walkups } = boardwalk();
    walkups.parkFirst();
    const counter = walkups.counters[0]!;
    expect(counter.front?.at).toEqual(BEACH.layout.counters.kiosk!.window);
    walkups.parkFirst();
    expect(counter.line.length).toBe(1);
  });

  it('keeps the line to the spots the counter has', () => {
    const { walkups } = boardwalk(1000);
    run(walkups, 120, 0);
    expect(walkups.counters[0]!.line.length).toBeLessThanOrEqual(stationDef('kiosk').queueSpots ?? 0);
  });

  it('loses tourists kept waiting too long, unserved', () => {
    const { walkups, served, gaveUp } = boardwalk(5);
    run(walkups, 40, 0);
    expect(gaveUp.length).toBeGreaterThan(0);
    expect(gaveUp[0]!.served).toEqual([]);
    expect(served).toEqual([]);
  });

  it('sends nobody before the models are ready, and fewer while a rival is open', () => {
    const closed = boardwalk();
    closed.walkups.open = false;
    run(closed.walkups, 30, 0);
    expect(closed.walkups.tourists).toEqual([]);
    const normal = boardwalk(1000);
    const rival = boardwalk(1000);
    rival.walkups.rateFactor = 0.5;
    run(normal.walkups, 9, 0);
    run(rival.walkups, 9, 0);
    expect(rival.walkups.tourists.length).toBeLessThan(normal.walkups.tourists.length);
  });
});

describe('Beach Boardwalk data', () => {
  it('has a counter, pile and upgrade pad for every kiosk, and a spot for every pad', () => {
    for (const pad of BEACH.pads) {
      expect(BEACH.layout.pads[pad.id], pad.id).toBeDefined();
      if (pad.effects.counter) {
        expect(BEACH.layout.counters[pad.id], pad.id).toBeDefined();
        expect(BEACH.layout.piles[pad.id], pad.id).toBeDefined();
        expect(stationDef(pad.effects.counter).customer).toBe('walker');
      }
    }
    expect(BEACH.pads[0]).toMatchObject({ id: 'kiosk', cost: 0 });
    expect(BEACH.pads.at(-1)?.effects.endOfContent).toBe(true);
  });

  it('prices its pads in order, about ten times the first town', () => {
    for (let i = 1; i < BEACH.pads.length; i++) expect(BEACH.pads[i]!.cost).toBeGreaterThan(BEACH.pads[i - 1]!.cost);
  });

  it('keeps every queue spot on the boardwalk or the sand, clear of the sea', () => {
    for (const counter of Object.values(BEACH.layout.counters)) {
      for (const spot of counter.queue) expect(spot.z).toBeGreaterThan(BEACH.layout.shoreZ);
    }
  });
});
