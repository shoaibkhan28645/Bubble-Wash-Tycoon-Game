import { Vector3, type Scene } from 'three';
import { CHARACTERS, type LocationLayout } from './config';
import type { GameState } from './gameState';
import type { SoundManager } from '../audio/sound';
import * as platform from '../platform/youtube';
import { loadPeople } from '../render/assets';
import { PersonAvatar } from '../render/models/person';
import { Mart } from '../systems/mart';
import type { Floaters } from '../ui/carBubbles';
import type { WorldLabels } from '../ui/worldLabels';

/**
 * The Mini-Mart and its shoppers. Their models load once the shop is paid
 * for (they aren't needed before), so the first download stays small.
 */
export function createMart(deps: {
  scene: Scene;
  layout: LocationLayout;
  state: GameState;
  labels: WorldLabels;
  floaters: Floaters;
  sound: SoundManager;
}): { mart: Mart; loadShoppers: () => void } {
  const { scene, layout, state, labels, floaters, sound } = deps;
  const shoppers = CHARACTERS.shoppers;
  // Shoppers take turns being one of the shopper characters.
  let made = 0;
  const makeShopper = () => {
    const avatar = new PersonAvatar(shoppers[made++ % shoppers.length]!, 'bag');
    scene.add(avatar.root);
    return avatar;
  };
  const mart = new Mart(layout, labels, makeShopper, () => {
    const till = layout.mart.counter;
    floaters.show('🥤', new Vector3(till.x, 2.2, till.z), 'tip');
    sound.play('pick');
  });
  const loadShoppers = (): void => {
    if (mart.ready) return;
    loadPeople(shoppers)
      .then(() => (mart.ready = true))
      .catch((error) => platform.logWarning(error));
  };
  if (state.unlocked.includes('mart') || state.building.mart) loadShoppers();
  return { mart, loadShoppers };
}
