// Mogul Air (Chapter 4, Part C): the player's own plane, in their colours. From its stand it flies a route
// the player picks on the office's board (or, left alone a while, the last one again); it's away for the
// route's time and comes home with the takings, and now and then a souvenir from the city for the office's
// shelf. Cities come in three tiers, further and better paid: a tier opens once enough of the one before
// have been flown to, and every full tier of souvenirs puts a little on every fare at the airport.
// Kept in the town's numbers (`supplies`): air.open.<city>, air.souv.<city>, air.route (the last city + 1),
// air.away (seconds left on the trip; 0 at home). Pure logic: the game flies the plane and pays.
import type { Tuning } from '../core/config';

type Rules = Tuning['airport']['airline'];
export type City = Rules['cities'][number];

/** What a trip home brought: the takings, and the city's souvenir if it came back with it (`first`: the first ever from there). */
export interface Homecoming {
  city: City;
  takings: number;
  souvenir: boolean;
  first: boolean;
}

export class Airline {
  constructor(
    private readonly rules: Rules,
    /** The town's numbers (the save). */
    private readonly store: Record<string, number>,
    private readonly random: () => number = Math.random,
  ) {}

  get cities(): readonly City[] {
    return this.rules.cities;
  }

  opened(id: string): boolean {
    return (this.store[`air.open.${id}`] ?? 0) > 0;
  }

  hasSouvenir(id: string): boolean {
    return (this.store[`air.souv.${id}`] ?? 0) > 0;
  }

  get openedCount(): number {
    return this.rules.cities.filter((c) => this.opened(c.id)).length;
  }

  get souvenirCount(): number {
    return this.rules.cities.filter((c) => this.hasSouvenir(c.id)).length;
  }

  /** Whether a tier's cities can be flown to: the first always; the next once enough of the one before have been. */
  unlocked(tier: number): boolean {
    if (tier <= 1) return true;
    const before = this.rules.cities.filter((c) => c.tier === tier - 1 && this.opened(c.id)).length;
    return before >= this.rules.unlock;
  }

  /** The tiers whose souvenirs are all on the shelf. */
  get fullSets(): number {
    const tiers = [...new Set(this.rules.cities.map((c) => c.tier))];
    return tiers.filter((t) => this.rules.cities.filter((c) => c.tier === t).every((c) => this.hasSouvenir(c.id))).length;
  }

  /** What full sets put on every fare (0.04 a set). */
  get fareBonus(): number {
    return this.fullSets * this.rules.setBonus;
  }

  /** The last route flown (to fly again, left alone), or null before the first. */
  get route(): City | null {
    const i = (this.store['air.route'] ?? 0) - 1;
    return this.rules.cities[i] ?? null;
  }

  /** Seconds left on the trip (0: at home). */
  get away(): number {
    return this.store['air.away'] ?? 0;
  }

  /** Sets off for a city (if its tier's open): the trip's clock starts once the plane's gone. */
  choose(id: string): City | null {
    const i = this.rules.cities.findIndex((c) => c.id === id);
    const city = this.rules.cities[i];
    if (!city || !this.unlocked(city.tier)) return null;
    this.store['air.route'] = i + 1;
    return city;
  }

  /** Off on the chosen route (the plane's left the airport): away for `speed`-shortened time. */
  depart(speed = 1): void {
    const city = this.route;
    if (city) this.store['air.away'] = city.seconds / speed;
  }

  /** One step of a trip: true the moment it's over (the plane's on its way back). */
  update(dt: number): boolean {
    const left = this.away;
    if (left <= 0) return false;
    this.store['air.away'] = Math.max(0, left - dt);
    return this.store['air.away'] === 0;
  }

  /** Home from the route: the takings (`pay` times the city's), the city opened, maybe its souvenir. */
  homecoming(pay = 1): Homecoming | null {
    const city = this.route;
    if (!city) return null;
    const first = !this.opened(city.id);
    this.store[`air.open.${city.id}`] = 1;
    const souvenir = !this.hasSouvenir(city.id) && (first ? this.random() < this.rules.firstSouvenir : this.random() < this.rules.souvenirChance);
    if (souvenir) this.store[`air.souv.${city.id}`] = 1;
    return { city, takings: Math.round(city.takings * pay), souvenir, first };
  }
}
