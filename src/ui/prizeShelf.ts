// The prize shelf's panel (Starlight Fun Park): the twelve plush toys to win
// at ring toss, those on the shelf so far, and what the full sets add to
// every ride ticket.
import type { GameState } from '../core/gameState';
import { TUNING } from '../core/config';
import { PLUSH, shelf, shelfBonus } from '../systems/prizes';
import { openDialog } from './dialog';
import { t } from './strings';

export function showPrizeShelf(root: HTMLElement, state: GameState): void {
  const found = new Set(shelf(state).map((p) => p.id));
  const grid = document.createElement('div');
  grid.className = 'shelf-grid';
  for (const plush of PLUSH) {
    const tile = document.createElement('div');
    const have = found.has(plush.id);
    tile.className = `shelf-tile${have ? ' is-found' : ''}${plush.golden ? ' is-golden' : ''}`;
    tile.textContent = have ? plush.icon : '?';
    tile.title = have ? plush.id : '';
    grid.appendChild(tile);
  }
  const { setSize, setBonus } = TUNING.park.prizes;
  const sets = Math.floor(found.size / setSize);
  openDialog(root, {
    icon: '🧸',
    title: t('shelfTitle', { found: found.size, all: PLUSH.length }),
    body: t('shelfBody', { size: setSize, percent: Math.round(setBonus * 100), now: Math.round(shelfBonus(found.size) * 100), sets }),
    content: grid,
    buttons: [{ label: 'OK', kind: 'plain', onTap: () => {} }],
  });
}
