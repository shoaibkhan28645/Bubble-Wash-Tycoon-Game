// The farm's animals (Chapter 2): hens in the hen house (Part B), cows in
// the cow barn (Part C). Each pen's animals make goods on the clock, also
// while the game is closed: hens lay eggs into nest boxes, cows fill the
// dairy's milk tank. Whoever stands at the pen's work spot packs them onto
// their back (eggs six to a carton at the egg table, milk a bottle at a time
// at the dairy) for the stand or a van. Once the feed store is built, corn
// tipped into it feeds every animal: fed animals make goods faster, eating
// feed as they go. Animals never suffer: unfed, they just work at their
// normal pace.
import { TUNING, type FarmLayout, type PenSpot, type Point, type Rect } from '../core/config';
import type { GameState } from '../core/gameState';
import type { CrateCarrier, GoodId } from './crops';
import { insideRect } from './stations';

/** The feed store's stock, in the town's supplies. */
const FEED = 'feed';

export type AnimalKind = 'hens' | 'cows';

/** How a kind of animal works (tuning.json `animals`). */
export interface AnimalDef {
  /** How many a new pen has (its upgrade adds more). */
  count: number;
  /** Seconds one animal takes to make one unit (an egg, a bottle of milk). */
  every: number;
  /** Units the pen holds before the animals stop. */
  cap: number;
  /** Units that make one carton or bottle carried away. */
  perPack: number;
  packSeconds: number;
  /** Fed animals work this many times as fast… */
  fedSpeed: number;
  /** …and each unit eats this much feed. */
  feedEach: number;
  good: GoodId;
}

export const ANIMALS = TUNING.animals as Record<AnimalKind, AnimalDef>;

export interface Pen extends PenSpot {
  id: string;
}

export class Livestock {
  readonly pens: Pen[] = [];
  /** Who is packing right now, and how far along (0–1). */
  readonly packing = new Map<CrateCarrier, { pen: Pen; progress: number }>();
  private readonly feeders: { id: string; zone: Rect }[] = [];

  constructor(
    private readonly state: GameState,
    private readonly layout: FarmLayout,
    /** How many animals a pen has (more with its upgrade). */
    private readonly animals: (penId: string) => number,
    /** A carton or bottle was packed. */
    private readonly onPacked: (carrier: CrateCarrier, pen: Pen) => void = () => {},
    /** A crate of corn went into the feed store. */
    private readonly onFed: (carrier: CrateCarrier) => void = () => {},
  ) {}

  /** Opens a built pen: its animals start work now. */
  addPen(padId: string, now: number): void {
    const spot = this.layout.pens[padId];
    if (!spot || this.pens.some((c) => c.id === padId)) return;
    this.pens.push({ id: padId, ...spot });
    this.state.plots[`${padId}.laid`] ??= now;
  }

  /** Opens a built feed store. */
  addFeeder(padId: string): void {
    const spot = this.layout.feeders[padId];
    if (!spot || this.feeders.some((f) => f.id === padId)) return;
    this.feeders.push({ id: padId, zone: spot.zone });
  }

  pen(id: string): Pen | undefined {
    return this.pens.find((p) => p.id === id);
  }

  /** The first pen of a kind (the hen house, the cow barn). */
  first(kind: AnimalKind): Pen | undefined {
    return this.pens.find((p) => p.animal === kind);
  }

  get hasFeeder(): boolean {
    return this.feeders.length > 0;
  }

  /** Units waiting in a pen: eggs in the nest boxes, bottles' worth of milk in the tank. */
  made(penId: string): number {
    const pen = this.pen(penId);
    return pen ? (this.state.supplies[`${penId}.${ANIMALS[pen.animal].good}`] ?? 0) : 0;
  }

  /** Cartons or bottles ready to pack at a pen. */
  packs(penId: string): number {
    const pen = this.pen(penId);
    return pen ? Math.floor(this.made(penId) / ANIMALS[pen.animal].perPack) : 0;
  }

  /** Feed in the store (every animal eats from it). */
  get feed(): number {
    return this.state.supplies[FEED] ?? 0;
  }

  /** The animals are fed: there's a feed store and something in it. */
  get fed(): boolean {
    return this.hasFeeder && this.feed >= 1;
  }

  /**
   * Counts what every pen's animals have made up to `now` (wall-clock ms):
   * while there's feed they work `fedSpeed` times as fast, each unit eating
   * `feedEach`. A full pen stops. Time away counts up to `awayHours`; a
   * clock set back starts counting afresh.
   */
  work(now: number): void {
    const { awayHours } = TUNING.feed;
    for (const pen of this.pens) {
      const def = ANIMALS[pen.animal];
      const key = `${pen.id}.laid`;
      const goodKey = `${pen.id}.${def.good}`;
      const since = this.state.plots[key] ?? now;
      let left = Math.min(now - since, awayHours * 3600_000);
      if (left <= 0 || this.made(pen.id) >= def.cap) {
        this.state.plots[key] = now;
        continue;
      }
      let counted = now - left;
      const animals = this.animals(pen.id);
      while (this.made(pen.id) < def.cap) {
        const fed = this.hasFeeder && this.feed >= def.feedEach;
        const msPerUnit = (def.every * 1000) / animals / (fed ? def.fedSpeed : 1);
        if (msPerUnit > left) break;
        left -= msPerUnit;
        counted += msPerUnit;
        this.state.supplies[goodKey] = this.made(pen.id) + 1;
        if (fed) this.state.supplies[FEED] = this.feed - def.feedEach;
      }
      // Part-made units carry over; a full pen wastes no time.
      this.state.plots[key] = this.made(pen.id) >= def.cap ? now : Math.round(counted);
    }
  }

  /**
   * One frame: the animals work; whoever stands at a pen's work spot with
   * room on their back packs a carton or bottle every `packSeconds`; whoever
   * brings corn to the feed store tips it in, a crate at a time, while
   * there's room.
   */
  update(dt: number, now: number, carriers: readonly CrateCarrier[]): void {
    this.work(now);
    const { perCrate, cap } = TUNING.feed;
    for (const carrier of carriers) {
      const pen = carrier.full ? null : this.pens.find((c) => insideRect(carrier.position, c.zone) && this.packs(c.id) > 0);
      if (!pen) this.packing.delete(carrier);
      else {
        const def = ANIMALS[pen.animal];
        const current = this.packing.get(carrier);
        const progress = (current?.pen === pen ? current.progress : 0) + dt / def.packSeconds;
        if (progress < 1) this.packing.set(carrier, { pen, progress });
        else {
          this.packing.delete(carrier);
          this.state.supplies[`${pen.id}.${def.good}`] = this.made(pen.id) - def.perPack;
          carrier.push(def.good);
          this.onPacked(carrier, pen);
        }
      }
      if (carrier.timer > 0 || carrier.count('corn') === 0 || this.feed + perCrate > cap) continue;
      if (!this.feeders.some((f) => insideRect(carrier.position, f.zone))) continue;
      carrier.remove('corn');
      this.state.supplies[FEED] = this.feed + perCrate;
      carrier.timer = TUNING.supplies.handSeconds;
      this.onFed(carrier);
    }
  }

  /** Room in the feed store for another crate of corn. */
  get wantsFeed(): boolean {
    return this.hasFeeder && this.feed + TUNING.feed.perCrate <= TUNING.feed.cap;
  }

  /** Running low: a farmhand should bring corn. */
  get hungry(): boolean {
    return this.hasFeeder && this.feed < TUNING.feed.cap * 0.4;
  }

  /** Where corn is tipped in (the first feed store's spot), if there is one. */
  get feedAt(): Point | null {
    const f = this.feeders[0];
    return f ? { x: (f.zone.minX + f.zone.maxX) / 2, z: (f.zone.minZ + f.zone.maxZ) / 2 } : null;
  }
}
