// The pacing simulator on Chapter 2, Willowbrook. `npm run pacing` prints the full report.
import { describe, expect, it } from 'vitest';
import { WILLOWBROOK } from '../src/core/willowbrook';
import { FARM_PACING, farmIncomePerSecond, simulateFarmPacing } from '../src/sim/farmPacing';

// Tests run in Node; the project has no Node types, so just what's used here.
declare const process: { env: Record<string, string | undefined> };

const report = simulateFarmPacing(WILLOWBROOK, { maxMinutes: 400 });

describe('farm pacing simulator', () => {
  it('buys every pad of the farm, in order', () => {
    const minutes = report.pads.map((p) => p.boughtMinute);
    expect(minutes.every((m) => m !== null)).toBe(true);
    for (let i = 1; i < minutes.length; i++) expect(minutes[i]!).toBeGreaterThanOrEqual(minutes[i - 1]!);
  });

  it('earns more as more is built', () => {
    const pads = WILLOWBROOK.pads;
    const first = new Set(['stand', 'field1']);
    const later = new Set(pads.slice(0, 12).map((p) => p.id));
    const all = new Set(pads.map((p) => p.id));
    const rates = [first, later, all].map((built) => farmIncomePerSecond(pads, built, FARM_PACING));
    expect(rates[0]).toBeGreaterThan(0);
    expect(rates[1]).toBeGreaterThan(rates[0]!);
    expect(rates[2]).toBeGreaterThan(rates[1]!);
  });

  // The planned minutes are a keen player who buys upgrades and does the rush jobs (tests/journey.test.ts holds every
  // pad to them). This bot does neither: the farm earns about a third as much by the end (its production upgrades
  // pay in full), and nothing else comes in, so the land takes it far longer to save for.
  it('never buying an upgrade nor doing a rush job, gets to the land within three and a half times the planned length', () => {
    const land = report.pads.at(-1)!;
    expect(land.boughtMinute!).toBeGreaterThan(land.targetMinute);
    expect(land.boughtMinute!).toBeLessThan(land.targetMinute * 3.5);
  });

  it.runIf(process.env.PACING_REPORT)('prints the report', () => {
    const rows = report.pads.map((p) => ({
      pad: p.name,
      cost: `$${p.cost.toLocaleString('en-US')}`,
      target: p.targetMinute,
      simulated: p.boughtMinute,
      off: p.boughtMinute === null || p.targetMinute === 0 ? '' : `${Math.round((p.boughtMinute / p.targetMinute - 1) * 100)}%`,
    }));
    console.log(`\nPacing: ${WILLOWBROOK.layout.name} (minutes of play; a model, see src/sim/farmPacing.ts)`);
    console.table(rows);
    console.log(`Income at the end: $${report.finalIncomePerMinute.toLocaleString('en-US')} a minute`);
    if (report.awayMinutes > 0) console.log(`Away while long builds finished (not counted above): ${report.awayMinutes} min`);
  });
});
