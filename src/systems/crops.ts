// A farm's crops and its stand (Chapter 2). Fields are rows of plots; a
// plot ripens on the clock (also while the game is closed). Whoever stands on
// a ripe plot for a moment harvests a crate of it onto their back, and the
// plot is planted again at once. Crates carried to the stand become its
// stock, and every villager served fills a basket with one of each good the
// stand has (eggs come from the hen house: animals.ts).
import { CROPS, GOODS, PLOT, TUNING, type FarmLayout, type Point, type Rect } from '../core/config';
import type { GameState } from '../core/gameState';
import type { Carrier } from './carry';
import { insideRect } from './stations';

/** The crops a farm grows (crops.json). */
export type CropId = 'veg' | 'corn';
/** Everything a farm sells (crops, then goods.json): crates of produce, cartons of eggs, bottles of milk. */
export type GoodId = CropId | 'eggs' | 'milk';

/** One plot of a field: a patch of one crop. */
export interface Plot {
  /** Its key in the save: "<field pad id>.<index>". */
  readonly id: string;
  readonly field: string;
  readonly crop: CropId;
  readonly at: Point;
  /** The ground it covers: standing anywhere on it harvests it. */
  readonly rect: Rect;
}

/** Someone carrying crates and cartons: the hero, the farmhand, the egg collector. */
export type CrateCarrier = Carrier<GoodId>;

export class Crops {
  readonly plots: Plot[] = [];
  /** Who is harvesting which plot right now, and how far along (0–1). */
  readonly harvesting = new Map<CrateCarrier, { plot: Plot; progress: number }>();

  constructor(
    private readonly state: GameState,
    private readonly layout: FarmLayout,
    /** How fast a field's crops grow: 1 normally, more with the well and the field's upgrades. */
    private readonly speed: (field: string) => number,
    private readonly onHarvest: (carrier: CrateCarrier, plot: Plot) => void = () => {},
  ) {}

  /** Plants a built field's plots (they start ripe). */
  addField(padId: string, crop: CropId): void {
    const spot = this.layout.fields[padId];
    if (!spot || this.plots.some((p) => p.field === padId)) return;
    spot.plots.forEach((at, i) => {
      const rect = { minX: at.x - PLOT.width / 2, maxX: at.x + PLOT.width / 2, minZ: at.z - PLOT.depth / 2, maxZ: at.z + PLOT.depth / 2 };
      this.plots.push({ id: `${padId}.${i}`, field: padId, crop, at, rect });
    });
  }

  /** Milliseconds a plot's crop takes to grow, sped up by the well and the field's upgrades. */
  growMs(plot: Plot): number {
    return (CROPS[plot.crop]!.growSeconds * 1000) / this.speed(plot.field);
  }

  /** How grown a plot is, 0 (just planted) to 1 (ripe). */
  growth(plot: Plot, now: number): number {
    const ripeAt = this.state.plots[plot.id];
    if (ripeAt === undefined || ripeAt <= now) return 1;
    return Math.max(0, 1 - (ripeAt - now) / this.growMs(plot));
  }

  ripe(plot: Plot, now: number): boolean {
    return this.growth(plot, now) >= 1;
  }

  /** The ripe plot nearest a point, leaving out some (another farmhand's), or null if none is ripe. */
  nearestRipe(from: Point, now: number, skip: (plot: Plot) => boolean = () => false): Plot | null {
    let best: Plot | null = null;
    let bestDistance = Infinity;
    for (const plot of this.plots) {
      if (!this.ripe(plot, now) || skip(plot)) continue;
      const d = Math.hypot(plot.at.x - from.x, plot.at.z - from.z);
      if (d < bestDistance) {
        best = plot;
        bestDistance = d;
      }
    }
    return best;
  }

  /** The plot a point is on, if any. */
  plotAt(p: Point): Plot | null {
    return this.plots.find((plot) => insideRect(p, plot.rect)) ?? null;
  }

  /** A machine passing over a point harvests the ripe plot there at once (replanting it). Returns the plot, or null. */
  harvestAt(p: Point, now: number, crop?: CropId): Plot | null {
    const plot = this.plotAt(p);
    if (!plot || !this.ripe(plot, now) || (crop && plot.crop !== crop)) return null;
    this.state.plots[plot.id] = Math.round(now + this.growMs(plot));
    return plot;
  }

  /**
   * One frame: everyone standing on a ripe plot with room on their back
   * harvests it, a crate after `harvestSeconds`; it's replanted at once.
   * `now` is wall-clock ms.
   */
  update(dt: number, now: number, carriers: readonly CrateCarrier[]): void {
    for (const carrier of carriers) {
      const plot = carrier.full ? null : this.plotAt(carrier.position);
      if (!plot || !this.ripe(plot, now)) {
        this.harvesting.delete(carrier);
        continue;
      }
      const current = this.harvesting.get(carrier);
      const progress = (current?.plot === plot ? current.progress : 0) + dt / TUNING.farm.harvestSeconds;
      if (progress < 1) {
        this.harvesting.set(carrier, { plot, progress });
        continue;
      }
      this.harvesting.delete(carrier);
      this.state.plots[plot.id] = Math.round(now + this.growMs(plot));
      carrier.push(plot.crop);
      this.onHarvest(carrier, plot);
    }
  }
}

/** A stand's drop-off: where carriers hand over crates (its serving zone, and a little round it). */
export interface StandSpot {
  id: string;
  zone: Rect;
}

/** How far round a stand's serving zone a carrier can hand over crates. */
const DROP_REACH = 0.8;

/**
 * The crates and cartons at each stand, kept in the town's supplies ("stand.veg", "stand.eggs").
 * Carriers in reach hand theirs over one at a time, up to what it holds.
 */
export class StandStock {
  constructor(
    private readonly state: GameState,
    /** Extra crates each stand holds, from what's built (the barn). */
    private readonly extra: () => number,
    /** A carrier just handed a crate over (the tutorial listens). */
    private readonly onDrop: (carrier: CrateCarrier, standId: string) => void = () => {},
  ) {}

  get capacity(): number {
    return TUNING.farm.standCapacity + this.extra();
  }

  stock(standId: string, good: GoodId): number {
    return this.state.supplies[`${standId}.${good}`] ?? 0;
  }

  /** Everything at a stand, whatever the good. */
  total(standId: string): number {
    return (Object.keys(GOODS) as GoodId[]).reduce((sum, good) => sum + this.stock(standId, good), 0);
  }

  /** Room for more. */
  hasRoom(standId: string): boolean {
    return this.total(standId) < this.capacity;
  }

  /** Is a point close enough to hand crates over? */
  inReach(p: Point, stand: StandSpot): boolean {
    const { zone } = stand;
    return insideRect(p, { minX: zone.minX - DROP_REACH, maxX: zone.maxX + DROP_REACH, minZ: zone.minZ - DROP_REACH, maxZ: zone.maxZ + DROP_REACH });
  }

  /** One frame: carriers by a stand with room hand over a crate each `handSeconds`. */
  update(stands: readonly StandSpot[], carriers: readonly CrateCarrier[]): void {
    for (const carrier of carriers) {
      if (carrier.timer > 0 || carrier.stack.length === 0) continue;
      const stand = stands.find((s) => this.inReach(carrier.position, s) && this.hasRoom(s.id));
      if (!stand) continue;
      const good = carrier.stack[carrier.stack.length - 1]!;
      carrier.remove(good);
      const key = `${stand.id}.${good}`;
      this.state.supplies[key] = (this.state.supplies[key] ?? 0) + 1;
      carrier.timer = TUNING.supplies.handSeconds;
      this.onDrop(carrier, stand.id);
    }
  }

  /**
   * A villager is served: they fill a basket with one of everything the stand
   * has (a crate of each crop, a carton of eggs), so each good the farm adds
   * is another sale. Empty if the stand is.
   */
  takeBasket(standId: string): GoodId[] {
    const basket = (Object.keys(GOODS) as GoodId[]).filter((good) => this.stock(standId, good) > 0);
    for (const good of basket) this.state.supplies[`${standId}.${good}`] = this.stock(standId, good) - 1;
    return basket;
  }

}
