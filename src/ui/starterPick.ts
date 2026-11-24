// A new player's first goal reward comes with a free pick of one of three simple items, each with its own
// perk (walk faster, carry more, work faster), so the first visit to the Bubble Shop shows that what the
// hero wears does something.
import type { GameState } from '../core/gameState';
import { pickStarter, shopItem, STARTER_PICKS, starterDue } from '../systems/wardrobe';
import { openDialog } from './dialog';
import { perkShort } from './shopPanel';
import { t } from './strings';

/** Offers the pick, if it's due; `picked` runs once one is chosen (save, a cheer, the hero's new look). */
export function offerStarterPick(root: HTMLElement, state: GameState, picked: (id: string) => void): void {
  if (!starterDue(state)) return;
  const dialog = openDialog(root, {
    icon: '🎁',
    title: t('starterTitle'),
    body: t('starterBody'),
    buttons: STARTER_PICKS.map((id) => {
      const item = shopItem(id)!;
      const icon = item.slot === 'hat' || item.slot === 'trail' ? item.icon : '👔';
      return {
        label: `${icon} ${item.name} · ${item.perk ? perkShort(item.perk) : ''}`,
        onTap: () => {
          if (pickStarter(state, id)) picked(id);
          dialog.close();
        },
      };
    }),
  });
}
