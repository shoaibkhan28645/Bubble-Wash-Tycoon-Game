import { Vector3 } from 'three';
import { TUNING, type LocationLayout, type Point } from '../core/config';
import type { GameState } from '../core/gameState';
import type { SoundManager } from '../audio/sound';
import type { Floaters } from '../ui/carBubbles';
import type { Car } from './cars';
import type { CashSystem } from './cash';
import { nextStars, ticketPay, tipFor, type Outcome } from './economy';
import type { Station } from './stations';
import { comboMultiplier } from './tickets';
import { unlockedSum } from './arrivals';

/** What a car pays at checkout: everything on its ticket it got, its quality, the combo bonus, and a tip if it didn't wait long. */
export function bill(car: Pick<Car, 'payDef' | 'stages' | 'served' | 'quality' | 'patience' | 'patienceMax'>): { pay: number; tip: number } {
  const pay = ticketPay(car.payDef, car.stages, car.served, car.quality);
  return { pay, tip: tipFor(pay, car.patience / car.patienceMax, TUNING.customers) };
}

export interface Paid {
  amount: number;
  tip: number;
  automated: boolean;
  at: Point;
  /** The car that paid; absent for vending snacks. */
  car?: Car;
}

/**
 * Takes cars' money: into the forecourt's pile, the register once there is
 * one, or the bay's own pile; with the floating "+$" texts, and the star
 * rating that follows from how each visit went.
 */
export class Till {
  constructor(
    private readonly layout: LocationLayout,
    private readonly state: GameState,
    private readonly cash: CashSystem,
    private readonly floaters: Floaters,
    private readonly sound: SoundManager,
    private readonly onPaid: (paid: Paid) => void,
  ) {}

  /** Pays for everything on the ticket the car got (a combo for several), plus a tip if it didn't wait long. */
  checkout(car: Car, last: Station): void {
    const { pay, tip } = this.bill(car);
    const pileId = last.kind === 'pump' ? 'fuel' : this.state.unlocked.includes('register') ? 'register' : last.id;
    const at = this.pay(pileId, pay + tip, last.at);
    this.floaters.show(`+$${pay}`, new Vector3(at.x, 1.2, at.z), car.vip ? 'tip' : 'cash');
    if (tip > 0) this.floaters.show(`+$${tip} tip`, new Vector3(at.x + 0.6, 1.9, at.z), 'tip');
    if (car.served.length > 1) this.floaters.show(`COMBO ×${comboMultiplier(car.served.length)}`, new Vector3(at.x - 0.4, 2.6, at.z), 'combo');
    this.rate(tip > 0 ? 'happy' : 'okay');
    this.sound.play('ching');
    this.onPaid({ amount: pay + tip, tip, automated: !car.manual, at, car });
  }

  /** A car that ran out of patience still pays for what it got (its fuel), at the forecourt. */
  payServed(car: Car): void {
    if (car.served.length === 0) return;
    const pay = this.bill(car).pay;
    const at = this.pay('fuel', pay, car.position);
    this.floaters.show(`+$${pay}`, new Vector3(at.x, 1.2, at.z), 'cash');
    this.onPaid({ amount: pay, tip: 0, automated: !car.manual, at, car });
  }

  /** A waiting driver buys a snack from the vending machine. */
  sellSnack(at: Point): void {
    this.cash.add('vending', TUNING.vending.pay);
    this.floaters.show(`+$${TUNING.vending.pay} 🥤`, new Vector3(at.x, 2.2, at.z), 'tip');
    this.onPaid({ amount: TUNING.vending.pay, tip: 0, automated: true, at });
  }

  /** The bill, with the lot's bonus on every bill (the landmark). */
  private bill(car: Car): { pay: number; tip: number } {
    const { pay, tip } = bill(car);
    const bonus = unlockedSum(this.state, (e) => e.payBonus);
    return bonus > 0 ? { pay: Math.round(pay * (1 + bonus)), tip } : { pay, tip };
  }

  rate(outcome: Outcome): void {
    this.state.stars = nextStars(this.state.stars, outcome, TUNING.stars);
  }

  /** Adds to a cash pile; returns where the pile is. */
  private pay(pileId: string, amount: number, fallback: Point): Point {
    this.cash.add(pileId, amount);
    return this.layout.piles[pileId] ?? fallback;
  }
}
