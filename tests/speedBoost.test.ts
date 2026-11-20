import { describe, expect, it } from 'vitest';
import { t } from '../src/ui/strings';

// The speed boost's words in each town (src/core/meta.ts picks them by the town's kind).
const towns = ['carWash', 'farm', 'park', 'airport'] as const;
const words = (town: (typeof towns)[number]) => ({
  title: t(town === 'carWash' ? 'speedTitle' : `speedTitle_${town}`),
  body: t(town === 'carWash' ? 'speedBody' : `speedBody_${town}`),
});

describe('the speed boost', () => {
  it('has its own words in every town', () => {
    for (const town of towns) {
      const { title, body } = words(town);
      expect(title).toMatch(/^2× /);
      expect(body).toContain('3 minutes');
    }
    expect(new Set(towns.map((town) => words(town).title)).size).toBe(towns.length);
  });

  it('talks about washing only in the car wash', () => {
    expect(words('carWash').title.toLowerCase()).toContain('wash');
    for (const town of towns.filter((x) => x !== 'carWash')) {
      const { title, body } = words(town);
      expect(`${title} ${body}`.toLowerCase()).not.toContain('wash');
    }
  });
});
