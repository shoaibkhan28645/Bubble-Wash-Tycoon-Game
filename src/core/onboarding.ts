// GDD Onboarding, the first ten minutes: the game opens on a muddy car in
// the first bay, and a pointing hand with a few words teaches one thing at
// a time; the first combo and each helper get a word when they happen.
import { PADS, TUNING, type LocationLayout } from './config';
import type { GameState } from './gameState';
import type { CashSystem } from '../systems/cash';
import type { Carrier } from '../systems/carry';
import { GuideHand, guideTarget, tutorialActive, type GuideStep, type GuideView } from '../systems/guide';
import type { PadSystem } from '../systems/pads';
import type { Paid, Traffic } from '../systems/traffic';
import { costOf } from '../systems/upgrades';
import { toast } from '../ui/dialog';
import { t } from '../ui/strings';
import type { WorldLabels } from '../ui/worldLabels';

export interface Onboarding {
  /** Points the hand at this frame's step; returns it (null once the tutorial is over). */
  update(): GuideStep | null;
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
  cash: CashSystem;
  pads: PadSystem;
  playerCarry: Carrier;
  /** Records a one-off milestone and saves it. */
  flag: (name: string) => void;
}): Onboarding {
  const { root, labels, layout, state, traffic, cash, pads, playerCarry, flag } = deps;
  const hand = new GuideHand(labels);
  if (!state.flags.includes('washed')) traffic.arrivals.parkFirstCar();

  /** What the tutorial hand can point at this frame. */
  const view = (): GuideView => {
    const first = traffic.bays[0]?.car;
    const perItem = TUNING.stations.usesPerItem;
    const low = traffic.bays.find((b) => b.supply === 'soap' && (state.supplies[`${b.id}.soap`] ?? 0) <= perItem);
    const pumpCar = traffic.forecourt.pumps[0]?.car;
    if (pumpCar?.manual && pumpCar.served.includes('fuel')) flag('fueled');
    const upgradeAt = layout.upgradePads.bay1;
    const upgrade = state.unlocked.includes('bay2') && upgradeAt && state.cash >= costOf('bay1.speed', state.levels['bay1.speed'] ?? 0);
    return {
      firstCar: first && (first.state === 'waiting' || first.state === 'entering') ? first.position : null,
      pile: cash.fullestPile()?.at ?? null,
      pad: pads.next,
      shelf: state.unlocked.includes('soap') ? (layout.pads.soap ?? null) : null,
      lowBay: low?.at ?? null,
      carryingSoap: playerCarry.count('soap') > 0,
      fuelCar: pumpCar?.state === 'waiting' ? pumpCar.position : null,
      upgrade: upgrade ? upgradeAt : null,
    };
  };

  return {
    update() {
      const step = tutorialActive(state) ? guideTarget(state, view()) : null;
      hand.point(step);
      return step;
    },
    onBuilt(id) {
      // GDD minute 5–6: the player sees a station run without them.
      const pad = PADS.find((p) => p.id === id);
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
