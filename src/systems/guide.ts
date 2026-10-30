import { Vector3 } from 'three';
import { TUNING, type Point } from '../core/config';
import type { GameState } from '../core/gameState';
import { t, type StringKey } from '../ui/strings';
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
  /** The first bay's upgrade pad, once there's a second bay and its first upgrade is affordable. */
  upgrade: Point | null;
}

/** Where the hand points, and what it says (GDD: one thing at a time, at most eight words). */
export interface GuideStep {
  at: Point;
  text: StringKey;
}

/** The tutorial ends once the first washer is hired (GDD minute 6: "automation, the hook"). */
export function tutorialActive(state: GameState): boolean {
  return !state.unlocked.includes('washer');
}

/**
 * GDD Onboarding: the side buttons appear one by one as each becomes useful
 * (once the pad it waits for is built), and none that plays an ad in a new
 * player's first minutes.
 */
export function sideButtonOpen(state: GameState, action: string): boolean {
  const { sideButtons, adsAfterSeconds } = TUNING.onboarding;
  const after = (sideButtons as Record<string, string | undefined>)[action];
  if (after && !state.unlocked.includes(after)) return false;
  return action === 'calendar' || action === 'missions' || state.playSeconds >= adsAfterSeconds;
}

/**
 * Where the pointing hand should go, and what it says (GDD Onboarding: a
 * hand, an arrow and a few words are the only tutorial). Wash the first
 * car, collect the cash, keep the first bay stocked with soap, fill up the
 * first car at the pump, buy the first upgrade, then build each pad once
 * it's affordable.
 */
export function guideTarget(state: GameState, view: GuideView): GuideStep | null {
  if (!tutorialActive(state)) return null;
  const has = (flag: string) => state.flags.includes(flag);
  const step = (at: Point | null, text: StringKey) => (at ? { at, text } : null);
  if (!has('washed')) return step(view.firstCar, 'guideWash');
  if (!has('collected')) return step(view.pile, 'guideCash');
  if (!has('supplied') && view.lowBay) return view.carryingSoap ? step(view.lowBay, 'guideSoapBay') : step(view.shelf, 'guideShelf');
  if (!has('fueled') && view.fuelCar) return step(view.fuelCar, 'guideFuel');
  if (!has('upgraded') && view.upgrade) return step(view.upgrade, 'guideUpgrade');
  if (view.pad && state.cash >= view.pad.owed) return step(view.pad.at, 'guideBuild');
  return null;
}

/** The bouncing hand over the guide's target, with its few words above (kept on screen). */
export class GuideHand {
  private readonly hand: Label;
  private readonly words: Label;
  private readonly at = new Vector3();
  private shown: StringKey | null = null;

  constructor(private readonly labels: WorldLabels) {
    const hand = document.createElement('div');
    hand.className = 'guide-hand';
    hand.textContent = '👇';
    hand.setAttribute('aria-hidden', 'true');
    this.hand = labels.add(hand, this.at);
    const words = document.createElement('div');
    words.className = 'guide-words';
    this.words = labels.add(words, this.at, true);
    this.hand.visible = this.words.visible = false;
  }

  point(step: GuideStep | null): void {
    this.hand.visible = this.words.visible = !!step;
    if (!step) return;
    this.at.set(step.at.x, TUNING.guide.height, step.at.z);
    if (step.text !== this.shown) {
      this.shown = step.text;
      this.words.el.textContent = t(step.text);
      this.labels.remeasure(this.words);
    }
  }
}
