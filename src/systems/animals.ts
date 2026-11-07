// The farm's hens (Chapter 2, Part B). Each hen house's hens lay on the
// clock, also while the game is closed, into nest boxes that hold so many
// eggs. Whoever stands at the egg table packs them into cartons, six eggs a
// carton, onto their back, for the stand. Once the feed store is built, corn
// tipped into it feeds the hens: fed hens lay faster, eating feed as they go.
// Hens never go hungry in any worse way than laying at their normal pace.
import { TUNING, type FarmLayout, type Point, type Rect } from '../core/config';
import type { GameState } from '../core/gameState';
import type { CrateCarrier } from './crops';
import { insideRect } from './stations';

/** The feed store's stock, in the town's supplies. */
const FEED = 'feed';

export interface Coop {
  id: string;
  zone: Rect;
  table: Point;
  run: Rect;
  trough: Point;
}

export class Poultry {
  readonly coops: Coop[] = [];
  /** Who is packing a carton right now, and how far along (0–1). */
  readonly packing = new Map<CrateCarrier, { coop: Coop; progress: number }>();
  private readonly feeders: { id: string; zone: Rect }[] = [];

  constructor(
    private readonly state: GameState,
    private readonly layout: FarmLayout,
    /** How many hens a hen house has (more with its upgrade). */
    private readonly hens: (coopId: string) => number,
    /** A carton was packed. */
    private readonly onPacked: (carrier: CrateCarrier, coop: Coop) => void = () => {},
    /** A crate of corn went into the feed store. */
    private readonly onFed: (carrier: CrateCarrier) => void = () => {},
  ) {}

  /** Opens a built hen house: its hens start laying now. */
  addCoop(padId: string, now: number): void {
    const spot = this.layout.coops[padId];
    if (!spot || this.coops.some((c) => c.id === padId)) return;
    this.coops.push({ id: padId, ...spot });
    this.state.plots[`${padId}.laid`] ??= now;
  }

  /** Opens a built feed store. */
  addFeeder(padId: string): void {
    const spot = this.layout.feeders[padId];
    if (!spot || this.feeders.some((f) => f.id === padId)) return;
    this.feeders.push({ id: padId, zone: spot.zone });
  }

  get hasFeeder(): boolean {
    return this.feeders.length > 0;
  }

  /** Eggs waiting in a hen house's nest boxes. */
  eggs(coopId: string): number {
    return this.state.supplies[`${coopId}.eggs`] ?? 0;
  }

  /** Feed in the store (the hens all eat from it). */
  get feed(): number {
    return this.state.supplies[FEED] ?? 0;
  }

  /** The hens are fed: there's a feed store and something in it. */
  get fed(): boolean {
    return this.hasFeeder && this.feed >= 1;
  }

  /** Cartons ready to pack at a hen house. */
  cartons(coopId: string): number {
    return Math.floor(this.eggs(coopId) / TUNING.hens.eggsPerCarton);
  }

  /**
   * Counts the eggs laid up to `now` (wall-clock ms) in every hen house:
   * while there's feed the hens lay `fedSpeed` times as fast and each egg
   * eats one feed. Full nest boxes stop the laying. Time away counts up to
   * `awayHours`; a clock set back starts counting afresh.
   */
  lay(now: number): void {
    const { layEvery, nestCap, fedSpeed, awayHours } = TUNING.hens;
    for (const coop of this.coops) {
      const key = `${coop.id}.laid`;
      const since = this.state.plots[key] ?? now;
      let left = Math.min(now - since, awayHours * 3600_000);
      if (left <= 0 || this.eggs(coop.id) >= nestCap) {
        this.state.plots[key] = now;
        continue;
      }
      let counted = now - left;
      const hens = this.hens(coop.id);
      while (this.eggs(coop.id) < nestCap) {
        const fed = this.fed;
        const msPerEgg = (layEvery * 1000) / hens / (fed ? fedSpeed : 1);
        if (msPerEgg > left) break;
        left -= msPerEgg;
        counted += msPerEgg;
        this.state.supplies[`${coop.id}.eggs`] = this.eggs(coop.id) + 1;
        if (fed) this.state.supplies[FEED] = this.feed - 1;
      }
      // Partly laid eggs carry over; full boxes waste no time.
      this.state.plots[key] = this.eggs(coop.id) >= nestCap ? now : Math.round(counted);
    }
  }

  /**
   * One frame: hens lay; whoever stands at an egg table with room on their
   * back packs a carton every `packSeconds`; whoever brings corn to the feed
   * store tips it in, a crate at a time, while there's room.
   */
  update(dt: number, now: number, carriers: readonly CrateCarrier[]): void {
    this.lay(now);
    const { eggsPerCarton, packSeconds, feedPerCrate, feedCap } = TUNING.hens;
    for (const carrier of carriers) {
      const coop = carrier.full ? null : this.coops.find((c) => insideRect(carrier.position, c.zone) && this.cartons(c.id) > 0);
      if (!coop) this.packing.delete(carrier);
      else {
        const current = this.packing.get(carrier);
        const progress = (current?.coop === coop ? current.progress : 0) + dt / packSeconds;
        if (progress < 1) this.packing.set(carrier, { coop, progress });
        else {
          this.packing.delete(carrier);
          this.state.supplies[`${coop.id}.eggs`] = this.eggs(coop.id) - eggsPerCarton;
          carrier.push('eggs');
          this.onPacked(carrier, coop);
        }
      }
      if (carrier.timer > 0 || carrier.count('corn') === 0 || this.feed + feedPerCrate > feedCap) continue;
      if (!this.feeders.some((f) => insideRect(carrier.position, f.zone))) continue;
      carrier.remove('corn');
      this.state.supplies[FEED] = this.feed + feedPerCrate;
      carrier.timer = TUNING.supplies.handSeconds;
      this.onFed(carrier);
    }
  }

  /** Room in the feed store for another crate of corn. */
  get wantsFeed(): boolean {
    return this.hasFeeder && this.feed + TUNING.hens.feedPerCrate <= TUNING.hens.feedCap;
  }

  /** Running low: a farmhand should bring corn. */
  get hungry(): boolean {
    return this.hasFeeder && this.feed < TUNING.hens.feedCap * 0.4;
  }

  /** Where corn is tipped in (the first feed store's spot), if there is one. */
  get feedAt(): Point | null {
    const f = this.feeders[0];
    return f ? { x: (f.zone.minX + f.zone.maxX) / 2, z: (f.zone.minZ + f.zone.maxZ) / 2 } : null;
  }
}
