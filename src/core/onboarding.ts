// GDD Onboarding, the first ten minutes: the game opens on a muddy car in
// the first bay, and a pointing hand with a few words teaches one thing at
// a time; the first combo and each helper get a word when they happen.
import { TUNING, town, type LocationLayout, type Point } from './config';
import type { GameState } from './gameState';
import type { CashSystem } from '../systems/cash';
import type { Carrier, SupplyType } from '../systems/carry';
import { GuideHand, guideTarget, helpTarget, tutorialActive, type GuideStep, type GuideView } from '../systems/guide';
import { Counter } from '../systems/mart';
import type { PadSystem } from '../systems/pads';
import type { Station } from '../systems/stations';
import type { Paid, Traffic } from '../systems/traffic';
import { costOf } from '../systems/upgrades';
import { toast } from '../ui/dialog';
import { t } from '../ui/strings';
import type { WorldLabels } from '../ui/worldLabels';

/** Someone's kept waiting at a station this long (seconds) before the hand points there. */
const WAIT_SECONDS = 6;

export interface Onboarding {
  /** Points the hand at this frame's step; returns it (the tutorial's, then help with what's holding things up). */
  update(dt: number): GuideStep | null;
  /** A pad was just built (helpers say what they'll do). */
  onBuilt(id: string): void;
  onPaid(paid: Paid): void;
}

export function createOnboarding(deps: {
  root: HTMLElement;
  labels: WorldLabels;
  layout: LocationLayout;
  state: GameState;
  traffic: Traffic;
  /** How fast staff work a station (0: nobody's at it but maybe the hero). */
  staffRate: (station: Station) => number;
  cash: CashSystem;
  pads: PadSystem;
  playerCarry: Carrier;
  /** Records a one-off milestone and saves it. */
  flag: (name: string) => void;
}): Onboarding {
  const { root, labels, layout, state, traffic, cash, pads, playerCarry, flag } = deps;
  /** How long someone's been kept waiting at each station with nobody to serve them. */
  const waits = new Map<Station, number>();
  const kept = (dt: number): { at: Point; kind: string } | null => {
    let worst: Station | null = null;
    for (const s of traffic.all()) {
      const someone = s instanceof Counter ? s.serving : s.customer?.state === 'waiting';
      if (!someone || deps.staffRate(s) > 0) {
        waits.delete(s);
        continue;
      }
      const t = (waits.get(s) ?? 0) + dt;
      waits.set(s, t);
      if (t >= WAIT_SECONDS && (!worst || t > waits.get(worst)!)) worst = s;
    }
    return worst ? { at: worst.side ?? worst.at, kind: worst.kind } : null;
  };
  const hand = new GuideHand(labels);
  if (!state.flags.includes('washed')) traffic.arrivals.parkFirstCar();

  /** What the tutorial hand can point at this frame. */
  const view = (dt: number): GuideView => {
    const first = traffic.bays[0]?.customer;
    const perItem = TUNING.stations.usesPerItem;
    // The station lowest on its supply, if it's nearly out (an empty one stops its cars).
    let low: (typeof traffic.bays)[number] | null = null;
    let lowest = Infinity;
    for (const s of traffic.all()) {
      if (!s.supply) continue;
      const stock = state.supplies[`${s.id}.${s.supply}`] ?? 0;
      if (stock <= perItem && stock < lowest) {
        low = s;
        lowest = stock;
      }
    }
    const pumpCar = traffic.forecourt.pumps[0]?.customer;
    if (pumpCar?.manual && pumpCar.served.includes('fuel')) flag('fueled');
    const upgradeAt = layout.upgradePads.bay1;
    const upgrade = state.unlocked.includes('bay2') && upgradeAt && state.cash >= costOf('bay1.speed', state.levels['bay1.speed'] ?? 0);
    return {
      firstCar: first && (first.state === 'waiting' || first.state === 'entering') ? first.position : null,
      pile: cash.fullestPile()?.at ?? null,
      pad: pads.next,
      shelf: state.unlocked.includes('soap') ? (layout.pads.soap ?? null) : null,
      lowStation: low?.at ?? null,
      carrying: !!low?.supply && playerCarry.count(low.supply as SupplyType) > 0,
      lowOnSoap: low?.supply === 'soap',
      waiting: kept(dt),
      fuelCar: pumpCar?.state === 'waiting' ? pumpCar.position : null,
      upgrade: upgrade ? upgradeAt : null,
    };
  };

  return {
    update(dt) {
      // The tutorial; then help with whatever's holding the business up.
      const step = tutorialActive(state) ? guideTarget(state, view(dt)) : helpTarget(state, view(dt));
      hand.point(step);
      return step;
    },
    onBuilt(id) {
      // GDD minute 5–6: the player sees a station run without them.
      const pad = town().pads.find((p) => p.id === id);
      if (pad?.effects.staff) toast(root, `👷 ${t('hired', { name: pad.name, adds: pad.adds })}`);
    },
    onPaid(paid) {
      if (paid.car && paid.car.served.length > 1 && !state.flags.includes('comboShown')) {
        flag('comboShown');
        toast(root, `🎉 ${t('firstCombo')}`);
      }
    },
  };
}
