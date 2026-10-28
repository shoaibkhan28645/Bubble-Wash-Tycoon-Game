import { Vector3 } from 'three';
import { TUNING, UPGRADES, type LocationLayout } from '../core/config';
import type { GameState } from '../core/gameState';
import type { SoundManager } from '../audio/sound';
import type { Label, WorldLabels } from '../ui/worldLabels';
import { levelStep } from './economy';
import type { Carrier, SupplyType } from './carry';
import { insideRect, type Station } from './stations';
import type { SupplyCheck } from './traffic';

const SHELF = 'soap';
const ICONS: Record<SupplyType, string> = { soap: '🧴', towel: '🧺', wax: '✨' };

/**
 * Soap, towels and wax (GDD). Deliveries restock the shelf; carriers pick up
 * what the stations need and drop it off; each car uses one unit, and a
 * station that runs out stops.
 */
export class Supplies implements SupplyCheck {
  private restockTimer = 0;
  private readonly shelfLabel: Label | null = null;
  private readonly shelfText: HTMLElement | null = null;
  private lastText = '';

  constructor(
    private readonly state: GameState,
    private readonly layout: LocationLayout,
    private readonly stations: () => Station[],
    private readonly sound: SoundManager,
    /** Null in tests (no page to draw on). */
    labels: WorldLabels | null,
    /** Called whenever a carrier drops supplies at a station (the tutorial listens). */
    private readonly onDrop: (carrier: Carrier) => void = () => {},
  ) {
    const at = layout.pads[SHELF];
    if (!labels || !at) return;
    this.shelfText = document.createElement('div');
    this.shelfText.className = 'shelf-stock';
    this.shelfLabel = labels.add(this.shelfText, new Vector3(at.x, 2.5, at.z));
  }

  /** Station stock is counted in uses (cars); each item carried in adds several. */
  private maxUses(): number {
    return TUNING.stations.supplyCapacity * TUNING.stations.usesPerItem;
  }

  /** Called by traffic when a car needs this station's supply. */
  take(station: Station): boolean {
    if (!station.supply) return true;
    const key = `${station.id}.${station.supply}`;
    const stock = this.state.supplies[key] ?? 0;
    if (stock <= 0) return false;
    this.state.supplies[key] = stock - 1;
    return true;
  }

  update(dt: number, carriers: Carrier[]): void {
    const hasShelf = this.state.unlocked.includes(SHELF);
    for (const station of this.stations()) this.assignSupply(station, hasShelf);
    if (!hasShelf) {
      if (this.shelfLabel) this.shelfLabel.visible = false;
      return;
    }
    this.restock(dt);
    for (const carrier of carriers) {
      if (carrier.timer > 0) continue;
      if (this.dropOff(carrier) || this.pickUp(carrier)) carrier.timer = TUNING.supplies.handSeconds;
    }
    this.showShelf();
  }

  /** Types the shelf stocks: soap, plus towels and wax once their stations exist. */
  types(): SupplyType[] {
    const used = new Set<SupplyType>();
    for (const station of this.stations()) if (station.supply) used.add(station.supply as SupplyType);
    return (['soap', 'towel', 'wax'] as SupplyType[]).filter((t) => used.has(t));
  }

  /** How many more items of a type the stations could take, minus what's already being carried. */
  need(type: SupplyType, carriers: readonly Carrier[] = []): number {
    let room = 0;
    for (const station of this.stations()) {
      if (station.supply !== type) continue;
      const uses = this.state.supplies[`${station.id}.${type}`] ?? 0;
      room += Math.floor((this.maxUses() - uses) / TUNING.stations.usesPerItem);
    }
    return room - carriers.reduce((sum, c) => sum + c.count(type), 0);
  }

  /** Items' worth of stock in the emptiest station that uses this type. */
  lowestStock(type: SupplyType): number {
    let low = Infinity;
    for (const station of this.stations()) {
      if (station.supply !== type) continue;
      low = Math.min(low, (this.state.supplies[`${station.id}.${type}`] ?? 0) / TUNING.stations.usesPerItem);
    }
    return low;
  }

  /** A station has run dry (offer the instant-delivery reward). */
  anyEmpty(): boolean {
    return this.stations().some((s) => s.supply !== null && (this.state.supplies[`${s.id}.${s.supply}`] ?? 0) <= 0);
  }

  /** Rewarded ad: every station filled to the top at once. */
  fillAll(): void {
    for (const s of this.stations()) if (s.supply) this.state.supplies[`${s.id}.${s.supply}`] = this.maxUses();
  }

  shelfCapacity(): number {
    return TUNING.supplies.shelfCapacity + levelStep(UPGRADES.kinds.storage, this.state.levels[`${SHELF}.storage`] ?? 0);
  }

  /** Bays use soap once the shelf exists; the dryer uses towels; the waxing station wax. */
  private assignSupply(station: Station, hasShelf: boolean): void {
    const wanted = !hasShelf ? null : station.kind === 'bay' ? 'soap' : TUNING.stations[station.kind].supply;
    if (wanted === station.supply) return;
    station.supply = wanted;
    // A station starts full the first time it needs a supply.
    const key = `${station.id}.${wanted}`;
    if (wanted && this.state.supplies[key] === undefined) this.state.supplies[key] = this.maxUses();
  }

  private restock(dt: number): void {
    this.restockTimer += dt;
    if (this.restockTimer < TUNING.supplies.restockSeconds) return;
    this.restockTimer = 0;
    const cap = this.shelfCapacity();
    for (const type of this.types()) {
      const key = `shelf.${type}`;
      this.state.supplies[key] = Math.min(cap, (this.state.supplies[key] ?? cap) + 1);
    }
  }

  private pickUp(carrier: Carrier): boolean {
    const at = this.layout.pads[SHELF];
    if (!at) return false;
    if (Math.hypot(carrier.position.x - at.x, carrier.position.z - at.z) > TUNING.supplies.reach) return false;
    // First put back anything no station can take, so it never clogs the carrier's hands.
    for (const type of new Set(carrier.stack)) {
      if (this.need(type, [carrier]) >= 0) continue;
      carrier.remove(type);
      const key = `shelf.${type}`;
      this.state.supplies[key] = Math.min(this.shelfCapacity(), (this.state.supplies[key] ?? this.shelfCapacity()) + 1);
      this.sound.play('drop');
      return true;
    }
    if (carrier.full) return false;
    // Most urgent first: the type whose emptiest station is lowest (an empty one blocks cars).
    let best: SupplyType | null = null;
    let bestLow = Infinity;
    for (const type of this.types()) {
      if (this.need(type, [carrier]) <= 0) continue;
      if ((this.state.supplies[`shelf.${type}`] ?? this.shelfCapacity()) <= 0) continue;
      const low = this.lowestStock(type) + carrier.count(type);
      if (low < bestLow) {
        best = type;
        bestLow = low;
      }
    }
    if (!best) return false;
    const key = `shelf.${best}`;
    this.state.supplies[key] = (this.state.supplies[key] ?? this.shelfCapacity()) - 1;
    carrier.push(best);
    this.sound.play('pick');
    return true;
  }

  private dropOff(carrier: Carrier): boolean {
    for (const station of this.stations()) {
      const type = station.supply as SupplyType | null;
      if (!type || carrier.count(type) === 0 || !insideRect(carrier.position, station.zone)) continue;
      const key = `${station.id}.${type}`;
      const stock = this.state.supplies[key] ?? 0;
      if (stock + TUNING.stations.usesPerItem > this.maxUses()) continue;
      carrier.remove(type);
      this.state.supplies[key] = stock + TUNING.stations.usesPerItem;
      this.sound.play('drop');
      this.onDrop(carrier);
      return true;
    }
    return false;
  }

  private showShelf(): void {
    if (!this.shelfLabel || !this.shelfText) return;
    this.shelfLabel.visible = true;
    const cap = this.shelfCapacity();
    const text = this.types()
      .map((type) => `${ICONS[type]} ${this.state.supplies[`shelf.${type}`] ?? cap}`)
      .join('  ');
    if (text !== this.lastText) {
      this.shelfText.textContent = text;
      this.lastText = text;
    }
  }
}
