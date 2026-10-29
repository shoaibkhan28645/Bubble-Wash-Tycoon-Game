import { Vector3 } from 'three';
import { TUNING, type Point } from '../core/config';
import type { GameState } from '../core/gameState';
import type { Label, WorldLabels } from '../ui/worldLabels';

/** What the guide can see this frame. */
export interface GuideView {
  /** The car in bay 1 if it's waiting to be washed. */
  firstCar: Point | null;
  /** The fullest cash pile, if any has cash. */
  pile: Point | null;
  /** The next unlock pad and how much is still owed on it. */
  pad: { at: Point; owed: number } | null;
  shelf: Point | null;
  /** The bay lowest on soap, if one is nearly out. */
  lowBay: Point | null;
  carryingSoap: boolean;
  /** The car at the first fuel pump, if it's waiting to be filled up. */
  fuelCar: Point | null;
}

/** The tutorial ends once the first washer is hired (GDD minute 6: "automation, the hook"). */
export function tutorialActive(state: GameState): boolean {
  return !state.unlocked.includes('washer');
}

/**
 * Where the pointing hand should go (GDD: a pointing hand and an arrow are
 * the only tutorial). Wash the first car, collect the cash, keep the first
 * bay stocked with soap, fill up the first car at the pump, then build each
 * pad once it's affordable.
 */
export function guideTarget(state: GameState, view: GuideView): Point | null {
  if (!tutorialActive(state)) return null;
  const has = (flag: string) => state.flags.includes(flag);
  if (!has('washed')) return view.firstCar;
  if (!has('collected')) return view.pile;
  if (!has('supplied') && view.lowBay) return view.carryingSoap ? view.lowBay : view.shelf;
  if (!has('fueled') && view.fuelCar) return view.fuelCar;
  if (view.pad && state.cash >= view.pad.owed) return view.pad.at;
  return null;
}

/** The bouncing hand over the guide's target. */
export class GuideHand {
  private readonly label: Label;
  private readonly at = new Vector3();

  constructor(labels: WorldLabels) {
    const el = document.createElement('div');
    el.className = 'guide-hand';
    el.textContent = '👇';
    el.setAttribute('aria-hidden', 'true');
    this.label = labels.add(el, this.at);
    this.label.visible = false;
  }

  point(target: Point | null): void {
    this.label.visible = !!target;
    if (target) this.at.set(target.x, TUNING.guide.height, target.z);
  }
}
