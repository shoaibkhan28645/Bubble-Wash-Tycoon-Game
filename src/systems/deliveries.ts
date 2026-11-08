// Delivery orders (Chapter 2, Part C). The orders board shows a few orders
// from around the village ("12 cartons of eggs for the café"), each paying
// more than the stand would. A van takes an order (picked by the hero on the
// board, or by the delivery driver once hired), waits at its bay while
// crates, cartons or bottles are carried into it, then drives off. The trip
// runs on the clock, also while the game is closed; when the van is back the
// order pays out at the yard. An order nobody takes runs out and is replaced.
import { GOODS, TUNING } from '../core/config';
import type { DeliveriesState, GameState, Order } from '../core/gameState';
import type { CrateCarrier, GoodId } from './crops';
import { insideRect } from './stations';
import type { Rect } from '../core/config';

/** What a kind of van carries and how much (tuning.json `vans`), by its pad id. */
export interface VanDef {
  goods: string[];
  /** Fewest and most of a good an order for this van asks for. */
  load: [number, number];
  /** Seconds there and back. */
  trip: number;
}

export const VANS = TUNING.vans as unknown as Record<string, VanDef>;

export function newDeliveries(): DeliveriesState {
  return { orders: [], trips: {}, nextId: 1, refillAt: 0, buyerDay: '', fairDay: '' };
}

export class Deliveries {
  constructor(
    private readonly state: GameState,
    /** The vans built so far (pad ids). */
    private readonly vans: () => string[],
    /** The goods the farm makes so far. */
    private readonly goods: () => GoodId[],
    /** A driver takes orders by himself. */
    private readonly auto: () => boolean,
    /** A van is back: the order is paid. */
    private readonly onDone: (order: Order, van: string) => void,
    private readonly random: () => number = Math.random,
  ) {}

  /** How many of a good the farm has to hand (in the barn, on the shelves, ripe): the driver takes orders he can fill. */
  onHand: (good: GoodId) => number = () => Infinity;
  /** An order ran out while its van was still loading: what was loaded comes back off the van. */
  onDropped: (order: Order) => void = () => {};

  private get d(): DeliveriesState {
    return this.state.deliveries;
  }

  get orders(): readonly Order[] {
    return this.d.orders;
  }

  /** The van is in the yard (not on a trip). */
  atYard(van: string): boolean {
    return !this.d.trips[van];
  }

  /** How far along a van's trip is (0–1), or null in the yard. */
  tripProgress(van: string, now: number): number | null {
    const trip = this.d.trips[van];
    if (!trip) return null;
    return Math.min(1, Math.max(0, (now - trip.leftAt) / Math.max(1, trip.backAt - trip.leftAt)));
  }

  /** The order a van has taken, loading or on the road. */
  orderOf(van: string): Order | undefined {
    return this.d.orders.find((o) => o.van === van);
  }

  canCarry(van: string, good: string): boolean {
    return !!VANS[van]?.goods.includes(good);
  }

  /** The hero gives an order to a van (from the board). False if the van is busy or carries other goods. */
  assign(orderId: number, van: string): boolean {
    const order = this.d.orders.find((o) => o.id === orderId);
    if (!order || order.van || !this.vans().includes(van) || !this.atYard(van) || this.orderOf(van) || !this.canCarry(van, order.good)) return false;
    order.van = van;
    return true;
  }

  /** How much shorter each van's trips are (its upgrade): 1 normally. */
  tripScale: (van: string) => number = () => 1;

  /** One more of what a waiting van wants goes in, straight from the barn. */
  fill(van: string): void {
    const order = this.orderOf(van);
    if (order && this.atYard(van) && order.loaded < order.qty) order.loaded++;
  }

  /** Goods a van in the yard is waiting for, and how many more. */
  wants(van: string): { good: GoodId; more: number } | null {
    const order = this.orderOf(van);
    if (!order || !this.atYard(van) || order.loaded >= order.qty) return null;
    return { good: order.good as GoodId, more: order.qty - order.loaded };
  }

  /**
   * One frame (or the catch-up on opening the game): vans back from their
   * trips pay out, untaken orders run out, empty slots fill, the driver
   * takes the best orders, and loaded vans set off. `now` is wall-clock ms.
   */
  update(now: number): void {
    const { refillSeconds } = TUNING.deliveries;
    for (const [van, trip] of Object.entries(this.d.trips)) {
      if (trip.backAt > now) continue;
      delete this.d.trips[van];
      const order = this.d.orders.find((o) => o.id === trip.order);
      if (!order) continue;
      this.remove(order, now);
      this.state.counts.delivery = (this.state.counts.delivery ?? 0) + 1;
      this.onDone(order, van);
    }
    // Orders run out: untaken, or still loading when time's up (the buyer goes elsewhere and the van is free again).
    const travelling = new Set(Object.values(this.d.trips).map((trip) => trip.order));
    for (const order of [...this.d.orders]) {
      if (order.endsAt > now || travelling.has(order.id)) continue;
      this.remove(order, now);
      if (order.van && order.loaded > 0) this.onDropped(order);
    }
    const vans = this.vans();
    if (vans.length === 0) return;
    const slots = this.slots;
    this.specials(now);
    const usual = this.d.orders.filter((o) => !o.special).length;
    // A van in the yard with nothing on the board it could take gets an order even when the board is full.
    const idle = vans.filter((v) => this.atYard(v) && !this.orderOf(v) && !this.d.orders.some((o) => !o.van && this.canCarry(v, o.good))).length;
    if (usual < slots + idle && now >= this.d.refillAt) {
      const order = this.make(now);
      if (order) this.d.orders.push(order);
      // A new board fills at once; afterwards one order at a time.
      this.d.refillAt = usual + 1 < slots && usual + 1 < 2 ? now : now + refillSeconds * 1000;
    }
    if (this.auto()) {
      // The driver takes the best order he can fill soonest (its pay, less for what isn't to hand yet), and none
      // the farm has nothing towards: then the van waits in the yard.
      const worth = (o: Order) => o.pay * (0.1 + 0.9 * Math.min(1, this.onHand(o.good as GoodId) / Math.max(1, o.qty - o.loaded)));
      for (const van of vans) {
        if (!this.atYard(van) || this.orderOf(van)) continue;
        const best = this.d.orders.filter((o) => !o.van && this.canCarry(van, o.good) && this.onHand(o.good as GoodId) > 0).sort((a, b) => worth(b) - worth(a))[0];
        if (best) best.van = van;
      }
    }
    for (const order of this.d.orders) {
      if (!order.van || order.loaded < order.qty || !this.atYard(order.van)) continue;
      this.d.trips[order.van] = { order: order.id, leftAt: now, backAt: now + (VANS[order.van]?.trip ?? 60) * 1000 * this.tripScale(order.van) };
    }
  }

  /** Carriers at a waiting van's bay hand over what it's waiting for, one item each `handSeconds`. */
  load(van: string, bay: Rect, carriers: readonly CrateCarrier[], onLoaded: (carrier: CrateCarrier) => void = () => {}): void {
    const order = this.orderOf(van);
    if (!order || !this.atYard(van)) return;
    for (const carrier of carriers) {
      if (order.loaded >= order.qty) return;
      if (carrier.timer > 0 || !insideRect(carrier.position, bay) || carrier.count(order.good as GoodId) === 0) continue;
      carrier.remove(order.good as GoodId);
      order.loaded++;
      carrier.timer = TUNING.supplies.handSeconds;
      onLoaded(carrier);
    }
  }

  /** Orders the board shows: one more for each van after the first, so every van has something to take. */
  get slots(): number {
    return TUNING.deliveries.slots + Math.max(0, this.vans().length - 1);
  }

  /**
   * Once a day the Buyer of the Day comes with one big order at three times
   * the price; on Saturdays and Sundays the county fair wants a prize-winning
   * few, paying double and gems. Neither takes up a usual slot.
   */
  private specials(now: number): void {
    const date = new Date(now);
    const today = localDay(date);
    const t = TUNING.deliveries;
    if (this.d.buyerDay !== today) {
      const order = this.make(now, 'buyer');
      if (order) {
        this.d.buyerDay = today;
        this.d.orders.push(order);
      }
    }
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    if (weekend && this.d.fairDay !== today) {
      const order = this.make(now, 'fair');
      if (order) {
        this.d.fairDay = today;
        this.d.orders.push({ ...order, gems: t.fairGems });
      }
    }
  }

  private remove(order: Order, now: number): void {
    this.d.orders.splice(this.d.orders.indexOf(order), 1);
    this.d.refillAt = Math.max(this.d.refillAt, now + TUNING.deliveries.refillSeconds * 1000);
  }

  /** A new order for something the farm makes and a van can carry, from someone in the village (or a special visitor). */
  private make(now: number, special?: 'buyer' | 'fair'): Order | null {
    const vans = this.vans();
    const made = this.goods().filter((g) => vans.some((v) => this.canCarry(v, g)));
    if (made.length === 0) return null;
    // A van in the yard with nothing on the board it could take comes first; then goods with no order yet.
    const idle = vans.filter((v) => this.atYard(v) && !this.orderOf(v) && !this.d.orders.some((o) => !o.van && this.canCarry(v, o.good)));
    const forIdle = made.filter((g) => idle.some((v) => this.canCarry(v, g)));
    const fresh = made.filter((g) => !this.d.orders.some((o) => o.good === g));
    const pool = forIdle.length > 0 ? forIdle : fresh.length > 0 ? fresh : made;
    const good = pool[Math.floor(this.random() * pool.length)]!;
    const van = vans.find((v) => this.canCarry(v, good))!;
    const [low, high] = VANS[van]!.load;
    const t = TUNING.deliveries;
    // The Buyer of the Day wants a big load; the fair, a few of the best.
    const qty = special === 'buyer' ? Math.round(high * 1.5) : special === 'fair' ? low : low + Math.floor(this.random() * (high - low + 1));
    const names = special === 'buyer' ? t.buyersOfDay : special === 'fair' ? ['the county fair'] : t.buyers;
    const buyer = names[Math.floor(this.random() * names.length)]!;
    const premium = special === 'buyer' ? t.buyerPremium : special === 'fair' ? t.fairPremium : t.premium;
    const pay = Math.round((qty * GOODS[good]!.price * premium) / 10) * 10;
    const [shortest, longest] = t.minutes as [number, number];
    const endsAt = now + (special ? t.specialMinutes : shortest + this.random() * (longest - shortest)) * 60_000;
    return { id: this.d.nextId++, good, qty, pay, buyer, endsAt, van: null, loaded: 0, ...(special ? { special } : {}) };
  }
}

/** A local date as YYYY-MM-DD (the player's own calendar day). */
function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
