// Skyport's two Part C menus, in the contracts board's cards: the control tower's flights waiting to land
// (choose which comes in next), and Mogul Air's routes (where the player's own plane flies next).
import type { City } from '../systems/airline';
import { formatClock } from '../systems/construction';
import { money } from '../systems/economy';
import type { FlightCard } from '../systems/tower';
import { openDialog } from './dialog';
import { setRich } from './icons';
import { t, type StringKey } from './strings';

const CARD_ICONS: Record<string, string> = { regular: '✈️', charter: '🏖️', hopper: '💸' };

function row(icon: string, head: string, text: string, side: string, button: { label: string; disabled: boolean; onTap: () => void } | null): HTMLElement {
  const el = document.createElement('div');
  el.className = 'contract-card';
  const badge = document.createElement('div');
  badge.className = 'contract-icon';
  badge.textContent = icon;
  const top = document.createElement('div');
  top.className = 'contract-head';
  const client = document.createElement('div');
  client.className = 'contract-client';
  client.textContent = head;
  const task = document.createElement('div');
  task.className = 'mission-text';
  task.textContent = text;
  top.append(client, task);
  const time = document.createElement('div');
  time.className = 'contract-time';
  setRich(time, side);
  el.append(badge, top, time);
  if (button) {
    const foot = document.createElement('div');
    foot.className = 'contract-foot';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mission-claim';
    b.textContent = button.label;
    b.disabled = button.disabled;
    b.addEventListener('click', button.onTap);
    foot.append(document.createElement('span'), b);
    el.append(foot);
  }
  return el;
}

export interface TowerView {
  cards: readonly FlightCard[];
  chosen: number | null;
  /** What each card pays (an ordinary flight's fare at the next free gate, times the card's). */
  fare: (card: FlightCard) => number;
  city: (card: FlightCard) => string;
}

/** The tower's flights waiting to land; choosing one brings it in next. */
export function showTower(root: HTMLElement, view: () => TowerView, choose: (i: number) => void): { close: () => void } {
  const list = document.createElement('div');
  list.className = 'contract-list';
  const render = (): void => {
    const now = view();
    list.replaceChildren(
      ...now.cards.map((card, i) =>
        row(CARD_ICONS[card.kind] ?? '✈️', t('cardFrom', { city: now.city(card) }), t(`card_${card.kind}` as StringKey), `💵 ×${card.fare}`, {
          label: now.chosen === i ? t('landingNext') : t('landNext'),
          disabled: false,
          onTap: () => {
            choose(i);
            render();
          },
        }),
      ),
    );
    // What each kind means, under the cards.
    const info = document.createElement('div');
    info.className = 'contract-client';
    info.style.padding = '4px 6px';
    info.textContent = [...new Set(now.cards.map((c) => c.kind))].map((k) => `${CARD_ICONS[k]} ${t(`card_${k}` as StringKey)}: ${t(`cardInfo_${k}` as StringKey)}`).join('   ');
    list.append(info);
  };
  render();
  return openDialog(root, { icon: '🗼', title: t('towerTitle'), body: t('towerBody'), content: list, buttons: [{ label: 'OK', kind: 'plain', onTap: () => {} }] });
}

export interface RoutesView {
  cities: readonly City[];
  opened: (id: string) => boolean;
  souvenir: (id: string) => boolean;
  unlocked: (tier: number) => boolean;
  /** How many more cities of the tier before it are needed to open a tier. */
  needed: (tier: number) => number;
  takings: (city: City) => number;
  seconds: (city: City) => number;
  /** Where the plane is: home (choosing), or away (to `city`, `left` seconds). */
  status: string;
  /** Whether it can be sent now (it's home, on its stand). */
  canFly: boolean;
  bonus: number;
}

/** Mogul Air's routes by tier; choosing one sends the plane (once it's home). */
export function showRoutes(root: HTMLElement, view: () => RoutesView, fly: (id: string) => void): { close: () => void } {
  const list = document.createElement('div');
  list.className = 'contract-list';
  let dialog: { close: () => void } | null = null;
  const render = (): void => {
    const now = view();
    const parts: HTMLElement[] = [];
    const status = document.createElement('div');
    status.className = 'mission-text';
    status.style.padding = '2px 6px 6px';
    status.textContent = now.status + (now.bonus > 0 ? `  ·  ${t('routeSet', { n: Math.round(now.bonus * 100) })}` : '');
    parts.push(status);
    for (const tier of [1, 2, 3]) {
      const head = document.createElement('div');
      head.className = 'contract-client';
      head.style.padding = '6px 6px 0';
      head.textContent = t(`tier${tier}` as StringKey);
      parts.push(head);
      if (!now.unlocked(tier)) {
        const locked = document.createElement('div');
        locked.className = 'contract-card contract-empty';
        locked.textContent = `🔒 ${t('tierLocked', { n: now.needed(tier) })}`;
        parts.push(locked);
        continue;
      }
      for (const city of now.cities.filter((c) => c.tier === tier)) {
        const marks = `${now.opened(city.id) ? '✅' : '🆕'}${now.souvenir(city.id) ? ' 🎁' : ''}`;
        parts.push(
          row(city.icon, marks, t(`city_${city.id}` as StringKey), t('routeTakings', { cash: money(now.takings(city)), time: formatClock(now.seconds(city)) }), {
            label: t('routeFly'),
            disabled: !now.canFly,
            onTap: () => {
              fly(city.id);
              dialog?.close();
            },
          }),
        );
      }
    }
    list.replaceChildren(...parts);
  };
  render();
  dialog = openDialog(root, { icon: '✈️', title: t('routesTitle'), body: t('routesBody'), content: list, buttons: [{ label: 'OK', kind: 'plain', onTap: () => {} }] });
  return dialog;
}
