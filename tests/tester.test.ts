import { describe, expect, it } from 'vitest';
import { TESTER, BUILD_LABEL, testerCash } from '../src/platform/tester';

describe('tester build', () => {
  it('is off outside the tester build (tests, the dev server, the build for YouTube)', () => {
    expect(TESTER).toBe(false);
    expect(BUILD_LABEL).toBe('');
  });

  it("adds enough money for about five of the town's next builds, never under 1,000", () => {
    const pads = [
      { id: 'a', cost: 50 },
      { id: 'b', cost: 4000 },
      { id: 'c', cost: 900000 },
    ];
    expect(testerCash(pads, [])).toBe(1000);
    expect(testerCash(pads, ['a'])).toBe(20000);
    expect(testerCash(pads, ['a', 'b'])).toBe(4500000);
    // Everything built: five times the dearest build.
    expect(testerCash(pads, ['a', 'b', 'c'])).toBe(4500000);
  });
});
