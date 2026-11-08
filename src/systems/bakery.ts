// The mill and bakery (Chapter 2, Part E): it takes corn from the barn,
// grinds it and bakes, on the clock (also while the game is closed): a crate
// of corn makes two loaves of bread, or with a crate of apples, an apple
// pie. The baking waits on the bread table until someone packs it onto
// their back for the stand, the market or a van.
import { TUNING, type Point, type Rect } from '../core/config';
import type { GameState } from '../core/gameState';
import type { BarnStore } from './barn';
import type { CrateCarrier, GoodId } from './crops';
import { insideRect } from './stations';

const BAKED: readonly GoodId[] = ['pie', 'bread'];

export class Bakery {
  /** Who is packing the baking right now, and how far along (0–1). */
  readonly packing = new Map<CrateCarrier, number>();
  open = false;

  constructor(
    private readonly state: GameState,
    /** Where to stand to pick up the baking, and the bread table. */
    readonly spot: { zone: Rect; table: Point },
    private readonly barn: BarnStore,
    /** How much faster it bakes (its upgrade): 1 normally. */
    private readonly speed: () => number = () => 1,
    private readonly onPacked: (carrier: CrateCarrier, good: GoodId) => void = () => {},
  ) {}

  made(good: GoodId): number {
    return this.state.supplies[`bakery.${good}`] ?? 0;
  }

  get total(): number {
    return BAKED.reduce((sum, g) => sum + this.made(g), 0);
  }

  /** Opens the bakery: it starts baking now. */
  start(now: number): void {
    this.open = true;
    this.state.plots['bakery.baked'] ??= now;
  }

  /**
   * Bakes everything due up to `now` (wall-clock ms), a batch every
   * `seconds`: a pie when the barn has corn and apples, else two loaves when
   * it has corn. A full bread table, or an empty barn, stops it. Time away
   * counts up to the feed store's `awayHours`.
   */
  bake(now: number): void {
    if (!this.open) return;
    const { seconds, shelf } = TUNING.bakery;
    const key = 'bakery.baked';
    const since = this.state.plots[key] ?? now;
    let left = Math.min(now - since, TUNING.feed.awayHours * 3600_000);
    const batch = (seconds * 1000) / this.speed();
    let counted = now - left;
    while (left >= batch && this.total < shelf) {
      if (this.barn.count('corn') > 0 && this.barn.count('apple') > 0) {
        this.barn.take('corn');
        this.barn.take('apple');
        this.add('pie', 1);
      } else if (this.barn.take('corn')) {
        this.add('bread', 2);
      } else break;
      left -= batch;
      counted += batch;
    }
    // Waiting for corn, or a full table: no time banks up.
    const idle = this.total >= shelf || this.barn.count('corn') === 0;
    this.state.plots[key] = idle ? now : Math.round(counted);
  }

  /** One frame: bake, and whoever stands at the bread table with room on their back packs the baking, pies first. */
  update(dt: number, now: number, carriers: readonly CrateCarrier[]): void {
    this.bake(now);
    if (!this.open) return;
    for (const carrier of carriers) {
      const good = BAKED.find((g) => this.made(g) > 0);
      if (!good || carrier.full || !insideRect(carrier.position, this.spot.zone)) {
        this.packing.delete(carrier);
        continue;
      }
      const progress = (this.packing.get(carrier) ?? 0) + dt / TUNING.bakery.packSeconds;
      if (progress < 1) {
        this.packing.set(carrier, progress);
        continue;
      }
      this.packing.delete(carrier);
      this.add(good, -1);
      carrier.push(good);
      this.onPacked(carrier, good);
    }
  }

  private add(good: GoodId, n: number): void {
    this.state.supplies[`bakery.${good}`] = Math.max(0, this.made(good) + n);
  }
}
