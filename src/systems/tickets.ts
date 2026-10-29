// Service tickets: what each car comes in for (a wash, fuel, a snack from the
// Mini-Mart while filling up), and the combo bonus for several in one visit.
import { TUNING } from '../core/config';

export type Need = 'wash' | 'fuel' | 'snack';

export interface TicketKind {
  /** In the order the car visits them: the forecourt by the road comes first. */
  needs: Need[];
  weight: number;
}

const KINDS = TUNING.tickets.kinds as TicketKind[];

/** Icons shown in a car's bubble for each need. */
export const NEED_ICONS: Record<Need, string> = { wash: '🫧', fuel: '⛽', snack: '🥤' };

/**
 * A new car's needs, picked by weight from the tickets the lot can serve
 * now (no fuel before the first pump is built). Always at least a wash.
 */
export function rollTicket(canServe: (need: Need) => boolean, rand: () => number, kinds: readonly TicketKind[] = KINDS): Need[] {
  const options = kinds.filter((kind) => kind.needs.every(canServe));
  const total = options.reduce((sum, kind) => sum + kind.weight, 0);
  let pick = rand() * total;
  for (const kind of options) {
    pick -= kind.weight;
    if (pick < 0) return [...kind.needs];
  }
  return ['wash'];
}

/** Pay multiplier for serving this many needs in one visit (1 for a single need). */
export function comboMultiplier(served: number, combo: readonly number[] = TUNING.tickets.combo): number {
  return combo[Math.min(served, combo.length - 1)] ?? 1;
}
