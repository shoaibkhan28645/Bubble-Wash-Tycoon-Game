// Skyport's control tower (Chapter 4, Part C): the next flights wait as cards, and whoever's in the tower
// picks which comes in next — a holiday charter that pays well but brings more cases and takes longer, an
// ordinary flight, or one of Rex Goldsby's cut-price hops (quick, no cases, a smaller fare). Nobody choosing,
// the card at the front comes in. And now and then fog rolls in: no landings until it lifts, then everything
// that's been waiting comes in one after another. Pure logic; the game draws the cards and the fog.
import type { Tuning } from '../core/config';
import type { FlightTerms } from './airport';

type Rules = Tuning['airport'];
export type CardKind = Rules['tower']['cards'][number]['id'];

/** A flight waiting to come in: its kind's terms, its airline's colours and where it's from. */
export interface FlightCard extends FlightTerms {
  kind: CardKind;
  livery: number;
  /** Where it's from (an index into the tower's cities). */
  from: number;
}

export class Tower {
  /** The cards waiting, front first. */
  readonly cards: FlightCard[] = [];
  /** The card chosen to come in next (its place in `cards`), if one has been. */
  chosen: number | null = null;
  /** Flights brought in on a chosen card (rather than the front one). */
  picks = 0;

  constructor(
    private readonly rules: Rules['tower'],
    private readonly liveries: number,
    private readonly random: () => number = Math.random,
  ) {
    this.fill();
  }

  private deal(): FlightCard {
    const total = this.rules.cards.reduce((sum, c) => sum + c.weight, 0);
    let roll = this.random() * total;
    const def = this.rules.cards.find((c) => (roll -= c.weight) < 0) ?? this.rules.cards[0]!;
    return {
      kind: def.id,
      fare: def.fare,
      cases: def.cases,
      clock: def.clock,
      livery: Math.floor(this.random() * this.liveries),
      from: Math.floor(this.random() * this.rules.cities.length),
    };
  }

  /** Keeps the queue full; never three of one kind (there's always a choice to make). */
  private fill(): void {
    while (this.cards.length < this.rules.queue) {
      let card = this.deal();
      for (let tries = 0; tries < 6 && this.cards.length > 0 && this.cards.every((c) => c.kind === card.kind); tries++) card = this.deal();
      this.cards.push(card);
    }
  }

  /** Chooses a card to come in next (choosing it again un-chooses it). */
  choose(i: number): void {
    if (i < 0 || i >= this.cards.length) return;
    this.chosen = this.chosen === i ? null : i;
  }

  /** The card that pays best (the tower controller's pick): the highest fare. */
  best(): number {
    let best = 0;
    this.cards.forEach((c, i) => {
      if (c.fare > this.cards[best]!.fare) best = i;
    });
    return best;
  }

  /** The next flight in: the chosen card, else (with `auto`, the controller's pick, else) the front one; the queue's topped up. */
  take(auto: boolean): FlightCard {
    const picked = this.chosen ?? (auto ? this.best() : 0);
    if (this.chosen !== null) this.picks += 1;
    const [card] = this.cards.splice(picked, 1);
    this.chosen = null;
    this.fill();
    return card!;
  }
}

/** Fog: it rolls in now and then and holds every landing until it lifts; `level` eases in and out for its look. */
export class Fog {
  /** Seconds until the next fog (counting down while it's clear), or of fog left (while it's down). */
  timer: number;
  down = false;
  /** How thick it looks (0 clear, 1 thick), easing towards whether it's down. */
  level = 0;

  constructor(
    private readonly rules: Rules['fog'],
    private readonly random: () => number = Math.random,
  ) {
    this.timer = rules.first;
  }

  private gap(): number {
    const [low, high] = this.rules.every as [number, number];
    return low + this.random() * (high - low);
  }

  /** One step: 'in' the moment it rolls in, 'out' the moment it lifts. */
  update(dt: number): 'in' | 'out' | null {
    this.level += ((this.down ? 1 : 0) - this.level) * (1 - Math.exp(-dt / this.rules.fade));
    this.timer -= dt;
    if (this.timer > 0) return null;
    this.down = !this.down;
    this.timer = this.down ? this.rules.seconds : this.gap();
    return this.down ? 'in' : 'out';
  }
}
