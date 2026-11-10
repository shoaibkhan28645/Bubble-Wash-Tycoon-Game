// The park's supplies (Chapter 3): once the supply shed is built, the
// delivery truck drops sugar, buns and prizes there, and the stalls sell
// from what's been brought to them: candy floss needs sugar, burgers buns,
// and ring toss prizes. The hero (later the snack runner) picks boxes up at
// the shed's door and hands them over behind the stalls' counters, one at a
// time. A stall with nothing left can't serve; its line waits. (Before the
// shed, the candy floss cart brings its own sugar.)
import { TUNING, type Point, type Rect } from '../core/config';
import type { GameState } from '../core/gameState';
import type { Carrier } from './carry';
import { insideRect } from './stations';

export type ParkSupply = 'sugar' | 'buns' | 'prizes';

/** What each kind of stall sells from. */
export const STALL_SUPPLY: Partial<Record<string, ParkSupply>> = { cart: 'sugar', burger: 'buns', ringtoss: 'prizes', giftshop: 'prizes' };

const RULES = TUNING.park.supplies;
/** The save remembers that the shed's first load came (it, and the stalls, start full). */
const OPENED = 'shed.opened';

/** A stall that sells from supplies: its pad, kind and serving zone (where boxes are handed over). */
export interface SupplyStall {
  id: string;
  kind: string;
  zone: Rect;
}

export class ParkSupplies {
  /** The shed is built: stalls sell from supplies from now on. */
  open = false;

  constructor(private readonly state: GameState) {}

  /** Boxes of an item at the shed. */
  shed(item: ParkSupply): number {
    return this.state.supplies[`shed.${item}`] ?? 0;
  }

  /** What a stall has left to sell. */
  stock(stallId: string): number {
    return this.state.supplies[`${stallId}.stock`] ?? 0;
  }

  get capacity(): number {
    return RULES.stall;
  }

  /** The stall can serve: it has stock, or doesn't need any (yet). */
  hasStock(stall: { id: string; kind: string }): boolean {
    return !this.open || !STALL_SUPPLY[stall.kind] || this.stock(stall.id) > 0;
  }

  /** A sale uses one serving. */
  use(stall: { id: string; kind: string }): void {
    if (!this.open || !STALL_SUPPLY[stall.kind]) return;
    this.state.supplies[`${stall.id}.stock`] = Math.max(0, this.stock(stall.id) - 1);
  }

  /** The shed opens: the first time, it and every stall start full. */
  openShed(stalls: readonly SupplyStall[]): void {
    this.open = true;
    if (this.state.supplies[OPENED]) return;
    this.state.supplies[OPENED] = 1;
    for (const item of ['sugar', 'buns', 'prizes'] as const) this.state.supplies[`shed.${item}`] = RULES.shed;
    for (const stall of stalls) this.fillStall(stall);
  }

  /** A new stall opens full (once the shed is open). */
  fillStall(stall: SupplyStall): void {
    if (this.open && STALL_SUPPLY[stall.kind] && this.state.supplies[`${stall.id}.stock`] === undefined) this.state.supplies[`${stall.id}.stock`] = RULES.stall;
  }

  /** The truck's load: some of each, up to what the shed holds. Returns how many boxes went in. */
  deliver(): number {
    let added = 0;
    for (const item of ['sugar', 'buns', 'prizes'] as const) {
      const now = this.shed(item);
      const next = Math.min(RULES.shed, now + RULES.truckLoad);
      this.state.supplies[`shed.${item}`] = next;
      added += next - now;
    }
    return added;
  }

  /** The shed could take another load. */
  get wantsTruck(): boolean {
    return this.open && (['sugar', 'buns', 'prizes'] as const).some((item) => this.shed(item) < RULES.shed - RULES.truckLoad / 2);
  }

  /** How short a stall is, counting what's on its way to it on someone's back. */
  private short(stall: SupplyStall, carried: readonly ParkSupply[]): number {
    const item = STALL_SUPPLY[stall.kind];
    if (!item) return 0;
    return RULES.stall - this.stock(stall.id) - carried.filter((c) => c === item).length;
  }

  /** What to take from the shed: the item the stalls are shortest of (counting what's being carried), if any. */
  wanted(stalls: readonly SupplyStall[], carried: readonly ParkSupply[]): ParkSupply | null {
    let best: ParkSupply | null = null;
    let most = 0;
    for (const stall of stalls) {
      const item = STALL_SUPPLY[stall.kind];
      const short = this.short(stall, carried);
      if (item && short > most && this.shed(item) > 0) [best, most] = [item, short];
    }
    return best;
  }

  /** The stall that most needs something this carrier has, if any. */
  stallFor(stalls: readonly SupplyStall[], carrier: Carrier<ParkSupply>): SupplyStall | null {
    let best: SupplyStall | null = null;
    let most = 0;
    for (const stall of stalls) {
      const item = STALL_SUPPLY[stall.kind];
      const room = RULES.stall - this.stock(stall.id);
      if (item && room > 0 && carrier.count(item) > 0 && room > most) [best, most] = [stall, room];
    }
    return best;
  }

  /**
   * One frame: anyone standing at the shed's door picks up what the stalls
   * need, one box at a time; anyone standing behind a stall's counter hands
   * over what it sells from.
   */
  update(
    carriers: readonly Carrier<ParkSupply>[],
    stalls: readonly SupplyStall[],
    door: Rect,
    onPick?: (carrier: Carrier<ParkSupply>) => void,
    onHand?: (carrier: Carrier<ParkSupply>, stall: SupplyStall) => void,
  ): void {
    if (!this.open) return;
    for (const carrier of carriers) {
      if (carrier.timer > 0) continue;
      const at: Point = carrier.position;
      if (insideRect(at, door) && !carrier.full) {
        const item = this.wanted(stalls, carrier.stack);
        if (item) {
          this.state.supplies[`shed.${item}`] = this.shed(item) - 1;
          carrier.push(item);
          carrier.timer = RULES.pickSeconds;
          onPick?.(carrier);
        }
        continue;
      }
      for (const stall of stalls) {
        const item = STALL_SUPPLY[stall.kind];
        if (!item || !insideRect(at, stall.zone) || carrier.count(item) === 0 || this.stock(stall.id) >= RULES.stall) continue;
        carrier.remove(item);
        this.state.supplies[`${stall.id}.stock`] = this.stock(stall.id) + 1;
        carrier.timer = RULES.handSeconds;
        onHand?.(carrier, stall);
        break;
      }
    }
  }
}
