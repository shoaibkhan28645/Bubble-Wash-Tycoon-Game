// The pacing simulator on Town 1. `npm run pacing` prints the full report.
import { describe, expect, it } from 'vitest';
import { ROADSIDE } from '../src/core/towns';
import { DEFAULT_PACING, incomePerSecond, simulatePacing } from '../src/sim/pacing';

// Tests run in Node; the project has no Node types, so just what's used here.
declare const process: { env: Record<string, string | undefined> };

const report = simulatePacing(ROADSIDE);

describe('pacing simulator', () => {
  it('buys every pad of the first town, in order', () => {
    const minutes = report.pads.map((p) => p.boughtMinute);
    expect(minutes.every((m) => m !== null)).toBe(true);
    for (let i = 1; i < minutes.length; i++) expect(minutes[i]!).toBeGreaterThanOrEqual(minutes[i - 1]!);
  });

  it('earns more as more is built', () => {
    const first = new Set(['bay1']);
    const later = new Set(ROADSIDE.pads.slice(0, 12).map((p) => p.id));
    const all = new Set(ROADSIDE.pads.map((p) => p.id));
    const rates = [first, later, all].map((built) => incomePerSecond(ROADSIDE.pads, built, DEFAULT_PACING, 600));
    expect(rates[0]).toBeGreaterThan(0);
    expect(rates[1]).toBeGreaterThan(rates[0]!);
    expect(rates[2]).toBeGreaterThan(rates[1]!);
  });

  it('finishes the first town within half to double its planned length', () => {
    const last = report.pads.at(-1)!;
    expect(last.boughtMinute!).toBeGreaterThan(last.targetMinute / 2);
    expect(last.boughtMinute!).toBeLessThan(last.targetMinute * 2);
  });

  it.runIf(process.env.PACING_REPORT)('prints the report', () => {
    const rows = report.pads.map((p) => ({
      pad: p.name,
      cost: `$${p.cost.toLocaleString('en-US')}`,
      target: p.targetMinute,
      simulated: p.boughtMinute,
      off: p.boughtMinute === null || p.targetMinute === 0 ? '' : `${Math.round((p.boughtMinute / p.targetMinute - 1) * 100)}%`,
    }));
    console.log(`\nPacing: ${ROADSIDE.layout.name} (minutes of play; a model, see src/sim/pacing.ts)`);
    console.table(rows);
    console.log(`Income at the end: $${report.finalIncomePerMinute.toLocaleString('en-US')} a minute`);
    if (report.awayMinutes > 0) console.log(`Away while long builds finished (not counted above): ${report.awayMinutes} min`);
  });
});
