// A celebrity's visit (Chapter 4, Part C): a golden private jet lands at the VIP stand and its star wants
// three things — the red carpet rolled out to the jet, a glass of champagne from the lounge's bar, and the
// limousine brought round to the kerb. Each granted tips the hero; all three, and the photographers have their
// picture and the tip's doubled. Patience runs out, and the star goes with what they got. Greeting them stays
// the hero's own job (no crew does it). Pure logic: the game walks the star and pays.
import type { Tuning } from '../core/config';

type Rules = Tuning['airport']['vip'];
export type Wish = 'carpet' | 'champagne' | 'limo';
export const WISHES: readonly Wish[] = ['carpet', 'champagne', 'limo'];

export class Celebrity {
  readonly granted = new Set<Wish>();
  /** Seconds of patience left. */
  patience: number;
  /** Gone: every wish granted, or out of patience. */
  done = false;

  constructor(
    private readonly rules: Rules,
    /** What a tip's worth here (the fares' scale, the VIP lounge's upgrade). */
    private readonly pay = 1,
  ) {
    this.patience = rules.patience;
  }

  get happy(): boolean {
    return this.granted.size === WISHES.length;
  }

  /** Grants a wish: the tip it earns (0 if it was granted already, or they're gone); with the last, the bonus too. */
  grant(wish: Wish): number {
    if (this.done || this.granted.has(wish)) return 0;
    this.granted.add(wish);
    let tip = this.rules.tip * this.pay;
    if (this.happy) {
      tip += this.rules.allBonus * this.pay;
      this.done = true;
    }
    return Math.round(tip);
  }

  /** One step: true the moment their patience runs out. */
  update(dt: number): boolean {
    if (this.done) return false;
    this.patience = Math.max(0, this.patience - dt);
    if (this.patience > 0) return false;
    this.done = true;
    return true;
  }
}
