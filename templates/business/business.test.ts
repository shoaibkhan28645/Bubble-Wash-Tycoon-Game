// TEMPLATE: copy to tests/<business>.test.ts once the business's data is in
// the game, then fill in its own rules. This copy is type-checked (so it
// keeps up with the game's code) but not run.
import { describe, expect, it } from 'vitest';
import { CARS, NEEDS, STATIONS } from '../../src/core/config';
import { ticketPay } from '../../src/systems/economy';

const KIND = 'kiosk';
const NEED = 'icecream';

describe.skip(`${KIND} (template)`, () => {
  it('is a station kind that serves its need', () => {
    expect(STATIONS[KIND]?.serves).toBe(NEED);
    expect(NEEDS[NEED]).toBeDefined();
  });

  it('pays its share of the customer base price', () => {
    const customer = CARS[0]!;
    const factor = NEEDS[NEED]?.payFactor ?? 0;
    expect(ticketPay(customer, [], [NEED])).toBe(Math.round(customer.basePay * factor));
  });
});
