// The upgrade rework: every upgrade pad shows its own list (the Mini-Mart's
// showed the pumps'), the upgrades taken out stay out, and a town's income
// a minute (what it earns while the hero is elsewhere) can't be blown up.
import { describe, expect, it } from 'vitest';
import { TUNING, UPGRADES } from '../src/core/config';
import { backgroundIncome, steadyRate } from '../src/core/empire';
import { newGame, newTownState } from '../src/core/gameState';
import { REMOVED_UPGRADES } from '../src/core/migrate';
import { STARLIGHT } from '../src/core/starlight';
import { ROADSIDE } from '../src/core/towns';
import { WILLOWBROOK } from '../src/core/willowbrook';
import { gameJourney, playJourney } from '../src/sim/journey';

const TOWNS = [ROADSIDE, WILLOWBROOK, STARLIGHT];

describe('upgrade pads', () => {
  it('each have a list of their own, the Mini-Mart its checkout and clerk', () => {
    for (const town of TOWNS) {
      for (const pad of Object.keys(town.layout.upgradePads)) expect(UPGRADES.panels[pad]?.length, `${town.id} ${pad}`).toBeGreaterThan(0);
    }
    expect(UPGRADES.panels.mart).toEqual(['mart.speed', 'clerk.staffSpeed']);
    expect(UPGRADES.panels.mart).not.toContain('pump1.speed');
  });

  it('no longer offer walk speed, or quality anywhere but the wash itself', () => {
    const offered = Object.values(UPGRADES.panels).flat();
    for (const key of Object.keys(REMOVED_UPGRADES)) expect(offered).not.toContain(key);
    expect(UPGRADES.kinds.walk).toBeUndefined();
    const washQuality = offered.filter((k) => k.endsWith('.quality') && ROADSIDE.pads.some((p) => p.id === k.split('.')[0]));
    expect(washQuality.sort()).toEqual(['bay1.quality', 'bay2.quality', 'tunnel.quality']);
  });
});

describe("a town's income a minute", () => {
  const max = TUNING.offline.maxRate as Record<string, number>;

  it("holds a rate an old save blew up (a lucky golden VIP) to the most the town can make", () => {
    const town = { ...newTownState(), autoRate: 60000, unlocked: ['manager'] };
    expect(steadyRate('roadside', town)).toBe(max.roadside);
    const state = { ...newGame(), currentTown: 'willowbrook', towns: { roadside: town } };
    expect(backgroundIncome(state) * 60).toBeCloseTo(max.roadside!);
    // A real rate is left alone.
    expect(steadyRate('roadside', { ...town, autoRate: 2400 })).toBe(2400);
  });

  it("leaves room above a fully upgraded town's takings", () => {
    const legs = playJourney(gameJourney(ROADSIDE, WILLOWBROOK, STARLIGHT));
    legs.forEach((leg, i) => expect(max[TOWNS[i]!.id]!, leg.name).toBeGreaterThan(leg.endSteady * 1.5));
  });
});
