// The barn as a store (Chapter 2, Part D): crates unloaded at its doors (from
// the pickup, the combine, the baker, or anyone's back) are kept in the barn,
// and the barn hands them on by itself: a crate to the stand whenever it has
// room, and to any van in the yard waiting for that good. The machines bring
// in far more than anyone could carry, and the barn makes sure none of it waits.
import { GOODS, TUNING, type Rect } from '../core/config';
import type { GameState } from '../core/gameState';
import type { CrateCarrier, GoodId, StandStock } from './crops';
import { insideRect } from './stations';

const KEY = 'barnstore';

export class BarnStore {
  private restockTimer = 0;
  private vanTimer = 0;
  /** Crates of a good kept back, not passed on (the mill's corn and apples). */
  keep: (good: GoodId) => number = () => 0;

  constructor(
    private readonly state: GameState,
    /** Where crates are unloaded (in front of the barn doors). */
    private readonly door: Rect,
    /** How many crates the barn holds. */
    private readonly capacity: () => number,
  ) {}

  count(good: GoodId): number {
    return this.state.supplies[`${KEY}.${good}`] ?? 0;
  }

  get total(): number {
    return (Object.keys(GOODS) as GoodId[]).reduce((sum, g) => sum + this.count(g), 0);
  }

  get hasRoom(): boolean {
    return this.total < this.capacity();
  }

  /** In reach of the barn doors. */
  atDoor(p: { x: number; z: number }): boolean {
    return insideRect(p, this.door);
  }

  /**
   * One frame: carriers at the doors unload a crate each `handSeconds`
   * (`fast` ones ten times as quick); then the barn passes a
   * crate on to the stand every `restockSeconds` if it has room, and loads
   * vans waiting for what it holds.
   */
  update(
    dt: number,
    carriers: readonly CrateCarrier[],
    fast: ReadonlySet<CrateCarrier>,
    stand: { id: string; stock: StandStock } | null,
    vans: { wants: () => { good: GoodId; more: number } | null; fill: () => void }[],
  ): void {
    for (const carrier of carriers) {
      if (carrier.timer > 0 || carrier.stack.length === 0 || !this.hasRoom || !this.atDoor(carrier.position)) continue;
      const good = carrier.stack[carrier.stack.length - 1]!;
      carrier.remove(good);
      this.add(good, 1);
      carrier.timer = TUNING.supplies.handSeconds / (fast.has(carrier) ? 10 : 1);
    }
    const { restockSeconds } = TUNING.barn;
    this.restockTimer += dt;
    if (stand && this.restockTimer >= restockSeconds) {
      this.restockTimer = 0;
      // The good the stand has least of, among what the barn holds.
      const goods = (Object.keys(GOODS) as GoodId[]).filter((g) => this.count(g) > this.keep(g));
      const good = goods.sort((a, b) => stand.stock.stock(stand.id, a) - stand.stock.stock(stand.id, b))[0];
      if (good && stand.stock.hasRoom(stand.id)) {
        this.add(good, -1);
        this.state.supplies[`${stand.id}.${good}`] = stand.stock.stock(stand.id, good) + 1;
      }
    }
    this.vanTimer += dt;
    if (this.vanTimer >= restockSeconds / 2) {
      this.vanTimer = 0;
      for (const van of vans) {
        const wants = van.wants();
        if (!wants || this.count(wants.good) <= this.keep(wants.good)) continue;
        this.add(wants.good, -1);
        van.fill();
      }
    }
  }

  /** Takes a crate out (the bakery's mill). False if there's none. */
  take(good: GoodId): boolean {
    if (this.count(good) <= 0) return false;
    this.add(good, -1);
    return true;
  }

  /** Puts crates straight into the barn (the combine), as many as fit. Returns how many went in. */
  store(good: GoodId, n: number): number {
    const fits = Math.max(0, Math.min(n, this.capacity() - this.total));
    this.add(good, fits);
    return fits;
  }

  private add(good: GoodId, n: number): void {
    this.state.supplies[`${KEY}.${good}`] = this.count(good) + n;
  }
}
