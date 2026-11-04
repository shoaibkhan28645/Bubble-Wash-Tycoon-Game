import type { SoundManager } from '../audio/sound';
import type { GameState } from '../core/gameState';
import { loadedTown, townIds, type TownDef } from '../core/towns';
import { currentRank, netWorth, nextRank } from '../systems/career';
import { formatCash } from '../systems/economy';
import { JOURNEY, stopStatus } from '../systems/journey';
import { openDialog } from './dialog';
import { t } from './strings';

/**
 * The empire map: the hero's rank and net worth, then every town on the
 * journey: the one he's in, the ones he owns (with what they earn), the
 * next one he can open, and the rest still locked (strategy doc, section 10).
 */
export function openEmpireMap(deps: {
  root: HTMLElement;
  state: GameState;
  sound: SoundManager;
  town: TownDef;
  travel: (id: string) => Promise<void>;
}): void {
  const { root, state, sound, town, travel } = deps;
  sound.play('open');
  const worth = netWorth(state, town, loadedTown);
  const rank = currentRank(state);
  const next = nextRank(state);

  const content = document.createElement('div');
  content.className = 'empire-map';
  const summary = document.createElement('div');
  summary.className = 'empire-summary';
  summary.textContent = next
    ? t('mapSummaryNext', { icon: rank.icon, rank: rank.name, worth: formatCash(worth), next: next.rank.name, at: formatCash(next.rank.netWorth) })
    : t('mapSummary', { icon: rank.icon, rank: rank.name, worth: formatCash(worth) });
  const stars = document.createElement('div');
  stars.className = 'empire-stars';
  stars.textContent = t('mapStars', { stars: state.franchiseStars });
  content.append(summary, stars);

  const list = document.createElement('ol');
  list.className = 'empire-towns';
  let dialog: { close: () => void } | null = null;
  for (const stop of JOURNEY) {
    const status = stopStatus(stop, state, (id) => townIds().includes(id));
    const item = document.createElement('li');
    item.className = `empire-town empire-${status}`;
    const icon = document.createElement('span');
    icon.className = 'empire-icon';
    icon.textContent = status === 'locked' ? '🔒' : stop.icon;
    const text = document.createElement('div');
    text.className = 'empire-text';
    const name = document.createElement('strong');
    name.textContent = t('mapChapter', { n: stop.chapter, name: stop.name });
    const line = document.createElement('span');
    line.textContent = stop.teaser;
    const statusLine = document.createElement('span');
    statusLine.className = 'empire-status';
    const rate = status === 'here' ? state.autoRate : (state.towns[stop.id]?.autoRate ?? 0);
    statusLine.textContent =
      status === 'here'
        ? t('mapHere', { rate: formatCash(rate) })
        : status === 'owned'
          ? t('mapOwned', { rate: formatCash(rate) })
          : status === 'open'
            ? t('mapOpen')
            : status === 'soon'
              ? t('mapSoon')
              : t('mapLocked', { stars: stop.franchiseStars });
    text.append(name, line, statusLine);
    item.append(icon, text);
    if (status === 'owned' || status === 'open') {
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'empire-go';
      go.textContent = t('mapTravel');
      go.addEventListener('click', () => {
        dialog?.close();
        void travel(stop.id);
      });
      item.appendChild(go);
    }
    list.appendChild(item);
  }
  content.appendChild(list);
  dialog = openDialog(root, { icon: '🗺️', title: t('mapTitle'), content, buttons: [{ label: t('mapClose'), kind: 'plain', onTap: () => {} }] });
}
