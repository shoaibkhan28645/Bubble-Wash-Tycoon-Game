// Mogul Air (Chapter 4, Part C): the player's own plane, in their colours. From its stand it flies a route
// the player picks on the office's board (or, left alone a while, the last one again); it's away for the
// route's time and comes home with the takings, and now and then a souvenir from the city for the office's
// shelf. Cities come in three tiers, further and better paid: a tier opens once enough of the one before
// have been flown to, and every full tier of souvenirs puts a little on every fare at the airport.
// Kept in the town's numbers (`supplies`): air.open.<city>, air.souv.<city>, air.route (the last city + 1),
// air.away (seconds left on the trip; 0 at home). Pure logic: the game flies the plane and pays.
//
// Part D: a second plane (its numbers air.route.2, air.away.2, ...), and wear. Once there's a hangar, every
// trip wears a plane (further cities more); a worn plane brings home less, until it's serviced in the hangar,
// after which its next few trips bring home more (air.wear, air.fresh, and .2 for the second plane).
import type { Tuning } from '../core/config';

type Rules = Tuning['airport']['airline'];
type HangarRules = Tuning['airport']['hangar'];
export type City = Rules['cities'][number];

/** What a trip home brought: the takings, and the city's souvenir if it came back with it (`first`: the first ever from there). */
export interface Homecoming {
  city: City;
  takings: number;
  souvenir: boolean;
  first: boolean;
  /** Whether the plane came home worn (it wants the hangar). */
  worn: boolean;
}

export class Airline {
  /** Whether trips wear the planes (once there's a hangar to service them in). */
  wears = false;

  constructor(
    private readonly rules: Rules,
    /** The town's numbers (the save). */
    private readonly store: Record<string, number>,
    private readonly random: () => number = Math.random,
    private readonly hangar?: HangarRules,
  ) {}

  /** A number's key for plane `k` (the first plane's are the plain ones). */
  private key(name: string, k: number): string {
    return k ? `${name}.${k + 1}` : name;
  }

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

  /** The first plane's last route (to fly again, left alone), or null before its first. */
  get route(): City | null {
    return this.routeOf(0);
  }

  /** Seconds left on the first plane's trip (0: at home). */
  get away(): number {
    return this.awayOf(0);
  }

  /** Plane `k`'s last route, or null before its first. */
  routeOf(k: number): City | null {
    const i = (this.store[this.key('air.route', k)] ?? 0) - 1;
    return this.rules.cities[i] ?? null;
  }

  /** Seconds left on plane `k`'s trip (0: at home). */
  awayOf(k: number): number {
    return this.store[this.key('air.away', k)] ?? 0;
  }

  /** How worn plane `k` is (0 new, 1 and more: badly). */
  wearOf(k: number): number {
    return this.store[this.key('air.wear', k)] ?? 0;
  }

  /** Whether plane `k` wants servicing (it brings home less until it's been). */
  worn(k: number): boolean {
    return !!this.hangar && this.wearOf(k) >= this.hangar.serviceAt;
  }

  /** Trips left on plane `k`'s fresh service (each brings home more). */
  freshOf(k: number): number {
    return this.store[this.key('air.fresh', k)] ?? 0;
  }

  /** Plane `k` serviced in the hangar: good as new, and its next few trips bring home more. */
  service(k: number): void {
    if (!this.hangar) return;
    this.store[this.key('air.wear', k)] = 0;
    this.store[this.key('air.fresh', k)] = this.hangar.freshTrips;
  }

  /**
   * Where plane `k` flies when it's left alone at home: somewhere it's never been (of the tiers that are open),
   * else somewhere it's not brought a souvenir home from yet, else the best-paying city it can fly to (for the
   * time it takes); never where the other plane's off to, if there's anywhere else.
   */
  next(k: number): City {
    const other = this.routeOf(k ? 0 : 1);
    const open = this.rules.cities.filter((c) => this.unlocked(c.tier));
    const pick = (cities: City[]): City | undefined => cities.find((c) => c !== other) ?? cities[0];
    return (
      pick(open.filter((c) => !this.opened(c.id))) ??
      pick(open.filter((c) => !this.hasSouvenir(c.id))) ??
      [...open].sort((a, b) => b.takings / b.seconds - a.takings / a.seconds)[0]!
    );
  }

  /** Sets plane `k` off for a city (if its tier's open): the trip's clock starts once the plane's gone. */
  choose(id: string, k = 0): City | null {
    const i = this.rules.cities.findIndex((c) => c.id === id);
    const city = this.rules.cities[i];
    if (!city || !this.unlocked(city.tier)) return null;
    this.store[this.key('air.route', k)] = i + 1;
    return city;
  }

  /** Plane `k` off on its chosen route (it's left the airport): away for `speed`-shortened time. */
  depart(speed = 1, k = 0): void {
    const city = this.routeOf(k);
    if (city) this.store[this.key('air.away', k)] = city.seconds / speed;
  }

  /** One step of plane `k`'s trip: true the moment it's over (the plane's on its way back). */
  update(dt: number, k = 0): boolean {
    const key = this.key('air.away', k);
    const left = this.store[key] ?? 0;
    if (left <= 0) return false;
    this.store[key] = Math.max(0, left - dt);
    return this.store[key] === 0;
  }

  /**
   * Plane `k` home from its route: the takings (`pay` times the city's, less if it was worn, more on a fresh
   * service), the city opened, maybe its souvenir; and the trip's wear on the plane.
   */
  homecoming(pay = 1, k = 0): Homecoming | null {
    const city = this.routeOf(k);
    if (!city) return null;
    const first = !this.opened(city.id);
    this.store[`air.open.${city.id}`] = 1;
    const souvenir = !this.hasSouvenir(city.id) && (first ? this.random() < this.rules.firstSouvenir : this.random() < this.rules.souvenirChance);
    if (souvenir) this.store[`air.souv.${city.id}`] = 1;
    let factor = 1;
    const hangar = this.hangar;
    if (hangar && this.wears) {
      if (this.worn(k)) factor *= 1 - hangar.wornPenalty;
      const fresh = this.freshOf(k);
      if (fresh > 0) {
        factor *= 1 + hangar.freshBonus;
        this.store[this.key('air.fresh', k)] = fresh - 1;
      }
      this.store[this.key('air.wear', k)] = this.wearOf(k) + (hangar.wear[city.tier - 1] ?? hangar.wear.at(-1)!);
    }
    return { city, takings: Math.round(city.takings * pay * factor), souvenir, first, worn: this.worn(k) };
  }
}
