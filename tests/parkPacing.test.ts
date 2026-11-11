// The pacing simulator on Chapter 3, Starlight Fun Park. `npm run pacing` prints the full report.
import { describe, expect, it } from 'vitest';
import { STARLIGHT } from '../src/core/starlight';
import { PARK_PACING, parkStage, simulateParkPacing } from '../src/sim/parkPacing';

// Tests run in Node; the project has no Node types, so just what's used here.
declare const process: { env: Record<string, string | undefined> };

const report = simulateParkPacing(STARLIGHT);

describe('park pacing simulator', () => {
  it('buys every pad of the park, in order', () => {
    const minutes = report.pads.map((p) => p.boughtMinute);
    expect(minutes.every((m) => m !== null)).toBe(true);
    // The highway may come straight after the wheel (bought with what the park earned while it was built).
    for (let i = 1; i < minutes.length; i++) expect(minutes[i]!).toBeGreaterThanOrEqual(minutes[i - 1]!);
  });

  it("earns more as the park grows: each new zone's rides lift the takings", () => {
    const pads = STARLIGHT.pads;
    const upTo = (id: string) => new Set(pads.slice(0, pads.findIndex((p) => p.id === id) + 1).map((p) => p.id));
    const rates = ['carousel', 'bumper', 'teacups', 'swings', 'haunted', 'flume', 'coaster'].map((id) => parkStage(STARLIGHT, upTo(id)).perSecond);
    for (let i = 1; i < rates.length; i++) expect(rates[i]!).toBeGreaterThan(rates[i - 1]!);
    // The park outgrows the other towns' background income well before the end.
    expect(rates.at(-1)! * 60).toBeGreaterThan(5 * PARK_PACING.background);
  });

  it('keeps the crowd within what the park holds', () => {
    for (const { stage } of report.stages) expect(stage.visitors).toBeLessThanOrEqual(40 + 12);
  });

  // The planned minutes are a player who buys upgrades (tests/journey.test.ts holds every pad to them). This bot
  // never buys one: the park earns about half as much by the end, so the land takes it far longer to save for.
  it('never buying an upgrade, gets to the land within two and a half times the planned length', () => {
    const land = report.pads.at(-1)!;
    expect(land.boughtMinute!).toBeGreaterThan(land.targetMinute);
    expect(land.boughtMinute!).toBeLessThan(land.targetMinute * 2.5);
  });

  it.runIf(process.env.PACING_REPORT)('prints the report', () => {
    const rows = report.pads.map((p) => ({
      pad: p.name,
      cost: `$${p.cost.toLocaleString('en-US')}`,
      target: p.targetMinute,
      simulated: p.boughtMinute,
      off: p.boughtMinute === null || p.targetMinute === 0 ? '' : `${Math.round((p.boughtMinute / p.targetMinute - 1) * 100)}%`,
    }));
    console.log(`\nPacing: ${STARLIGHT.layout.name} (minutes of play; a model, see src/sim/parkPacing.ts)`);
    console.table(rows);
    console.log(`The park's own income at the end: $${report.finalIncomePerMinute.toLocaleString('en-US')} a minute (plus the other towns')`);
    if (report.awayMinutes > 0) console.log(`Away while long builds finished (not counted above): ${report.awayMinutes} min`);
  });
});
