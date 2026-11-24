// When the game points a player at the Bubble Shop: the free starter pick, and the suggestions in play (the
// carry and lost-customer hints). Kept apart from the UI so the rules can be tested.
import type { GameState } from '../core/gameState';
import type { PerkKind } from './perks';
import { equipped, forSale, owns, priceOf, shopItems, starterDue, type ShopItem } from './wardrobe';

/** What the hero wears (the slots the hints look through). */
export const WORN_SLOTS = ['outfit', 'hat', 'trail', 'brand'] as const;

/**
 * Seconds of play before the starter pick is offered by itself: past the first town's opening cards (the first
 * helper, Mabel's gift at 200 s and the empire map at 245 s), so it comes on its own, not in a pile of cards.
 */
export const STARTER_PLAY_SECONDS = 270;
/** How long nothing else must have been on screen first. */
export const STARTER_CALM_SECONDS = 20;
/** And never in a visit's first moments (the welcome back, the daily gift). */
export const STARTER_SESSION_SECONDS = 20;

/**
 * Whether to offer the free starter pick now: not picked yet, the tutorial over and the opening cards done, and
 * nothing else on screen for a while. (Not straight after the first goal reward, as 1.4 did: that came in the
 * first half-minute, two full-screen cards before the first build.)
 */
export function starterOfferDue(
  state: GameState,
  at: { tutorial: boolean; calmSeconds: number; sessionSeconds: number },
): boolean {
  return (
    starterDue(state) &&
    !at.tutorial &&
    state.playSeconds >= STARTER_PLAY_SECONDS &&
    at.sessionSeconds >= STARTER_SESSION_SECONDS &&
    at.calmSeconds >= STARTER_CALM_SECONDS
  );
}

/** How a hint offers an item: put on one owned, buy one the gems cover, or save up for one. */
export type Offer = 'owned' | 'buy' | 'save';

/**
 * The best thing to wear for a perk in this town: the strongest owned but not worn; else the cheapest the gems
 * buy; else, if nothing with the perk is worn, the cheapest on sale, to save up for. Null: nothing to suggest.
 */
export function itemFor(state: GameState, kind: PerkKind, today: string): { item: ShopItem; offer: Offer } | null {
  const town = state.currentTown;
  const fits = WORN_SLOTS.flatMap((slot) => shopItems(slot)).filter((i) => i.perk?.kind === kind && (!i.perk.town || i.perk.town === town));
  const worn = (i: ShopItem): boolean => equipped(state, i.slot)?.id === i.id;
  const owned = fits.filter((i) => owns(state, i.id) && !worn(i)).sort((a, b) => b.perk!.value - a.perk!.value);
  if (owned[0]) return { item: owned[0], offer: 'owned' };
  const onSale = fits.filter((i) => forSale(i) && !owns(state, i.id)).sort((a, b) => priceOf(state, a.id, today) - priceOf(state, b.id, today));
  const buy = onSale.find((i) => priceOf(state, i.id, today) <= state.gems);
  if (buy) return { item: buy, offer: 'buy' };
  // Something with the perk on already: no nagging to save up for more.
  if (!onSale[0] || fits.some(worn)) return null;
  return { item: onSale[0], offer: 'save' };
}
