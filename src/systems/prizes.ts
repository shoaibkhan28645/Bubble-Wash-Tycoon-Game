// The prize shelf (Starlight Fun Park): twelve plush toys to collect, shown
// in the gift shop. A ring-toss win now and then puts a new one on the shelf
// (the golden star is rare); every full set of four makes every ride ticket
// worth a little more, for good. Prizes come only from the visitors' play.
import { TUNING } from '../core/config';
import type { GameState } from '../core/gameState';

export interface Plush {
  id: string;
  icon: string;
  /** Its colour on the gift shop's shelf. */
  color: string;
  golden?: boolean;
}

/** The shelf, in order: a duck from the car wash, a cow from the farm, and the park's own. */
export const PLUSH: readonly Plush[] = [
  { id: 'duck', icon: '🦆', color: '#ffd84a' },
  { id: 'cow', icon: '🐮', color: '#f4f1ea' },
  { id: 'star', icon: '⭐', color: '#ffb52e' },
  { id: 'rocket', icon: '🚀', color: '#ff5c5c' },
  { id: 'bear', icon: '🧸', color: '#b9824f' },
  { id: 'bunny', icon: '🐰', color: '#ffb3d1' },
  { id: 'cat', icon: '🐱', color: '#ff9a45' },
  { id: 'dog', icon: '🐶', color: '#d9b48a' },
  { id: 'unicorn', icon: '🦄', color: '#c9a7ff' },
  { id: 'frog', icon: '🐸', color: '#6fd36a' },
  { id: 'panda', icon: '🐼', color: '#3a3a44' },
  { id: 'golden', icon: '🌟', color: '#ffe066', golden: true },
];

const RULES = TUNING.park.prizes;
const flagOf = (plush: Plush) => `plush:${plush.id}`;

/** The plush toys on the shelf so far. */
export function shelf(state: GameState): Plush[] {
  return PLUSH.filter((p) => state.flags.includes(flagOf(p)));
}

/** The lasting bonus on ride tickets from the shelf: a share for every full set (0.05 a set of four). */
export function shelfBonus(found: number): number {
  return Math.floor(found / RULES.setSize) * RULES.setBonus;
}

/**
 * A ring-toss win: now and then a plush for the shelf (the golden one only
 * rarely). Returns the plush if it's new to the shelf (and puts it there).
 */
export function winPlush(state: GameState, random: () => number = Math.random): Plush | null {
  if (random() >= RULES.chance) return null;
  const golden = PLUSH.find((p) => p.golden)!;
  const plain = PLUSH.filter((p) => !p.golden);
  const plush = random() < RULES.goldenChance ? golden : plain[Math.floor(random() * plain.length)]!;
  if (state.flags.includes(flagOf(plush))) return null;
  state.flags.push(flagOf(plush));
  return plush;
}
