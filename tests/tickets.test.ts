// Service tickets: what cars come in for, and the combo bonus.
import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/core/config';
import { comboMultiplier, rollTicket, type TicketKind } from '../src/systems/tickets';

const KINDS: TicketKind[] = [
  { needs: ['wash'], weight: 2 },
  { needs: ['fuel'], weight: 1 },
  { needs: ['fuel', 'wash'], weight: 1 },
];

describe('rollTicket', () => {
  it('picks by weight among the tickets the lot can serve', () => {
    const all = () => true;
    expect(rollTicket(all, () => 0, KINDS)).toEqual(['wash']);
    expect(rollTicket(all, () => 0.6, KINDS)).toEqual(['fuel']);
    expect(rollTicket(all, () => 0.99, KINDS)).toEqual(['fuel', 'wash']);
  });

  it('never asks for fuel before there is a pump', () => {
    const washOnly = (need: string) => need === 'wash';
    for (const r of [0, 0.3, 0.6, 0.99]) expect(rollTicket(washOnly, () => r, KINDS)).toEqual(['wash']);
  });

  it('fuel comes before the wash, so cars visit the forecourt by the road first', () => {
    for (const kind of TUNING.tickets.kinds) {
      if (kind.needs.includes('fuel')) expect(kind.needs[0]).toBe('fuel');
    }
  });

  it('returns a copy the car can keep', () => {
    const ticket = rollTicket(() => true, () => 0, KINDS);
    ticket.push('fuel');
    expect(KINDS[0]!.needs).toEqual(['wash']);
  });
});

describe('comboMultiplier', () => {
  it('pays nothing extra for one need, more for each extra, and caps', () => {
    expect(comboMultiplier(1, [1, 1, 1.2, 1.5])).toBe(1);
    expect(comboMultiplier(2, [1, 1, 1.2, 1.5])).toBe(1.2);
    expect(comboMultiplier(3, [1, 1, 1.2, 1.5])).toBe(1.5);
    expect(comboMultiplier(9, [1, 1, 1.2, 1.5])).toBe(1.5);
  });

  it('the tuning only goes up', () => {
    const combo = TUNING.tickets.combo;
    for (let i = 1; i < combo.length; i++) expect(combo[i]).toBeGreaterThanOrEqual(combo[i - 1]!);
  });
});
