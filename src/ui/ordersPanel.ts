// The orders board's pop-up (Chapter 2's farm): the delivery orders on the
// board, each with who wants it, how much, what it pays and its time left,
// and the button that sends a van for it. Taken orders show the van loading
// or out on the road.
import { GOODS } from '../core/config';
import type { Order } from '../core/gameState';
import { formatClock } from '../systems/construction';
import { formatCash } from '../systems/economy';
import { openDialog } from './dialog';
import { t, type StringKey } from './strings';

export interface OrdersView {
  orders: readonly Order[];
  /** Wall-clock ms. */
  now: number;
  /** The vans built, and for each order the vans that could take it now. */
  vans: string[];
  canSend: (order: Order, van: string) => boolean;
  /** When a van on the road is back (wall-clock ms), or null in the yard. */
  backAt: (van: string) => number | null;
  /** A driver takes orders by himself. */
  auto: boolean;
  /** When the next order comes, if a slot is empty. */
  refillAt: number;
  slots: number;
}

/** "8 cartons of eggs", "12 bottles of milk"… */
export function orderText(order: Pick<Order, 'good' | 'qty'>): string {
  return t(`unit_${order.good}` as StringKey, { n: order.qty });
}

const vanName = (van: string): string => t(`vanName_${van}` as StringKey);

/** An order's time line: time left on the board, the van loading, or time until the van is back. */
function timeText(order: Order, view: OrdersView): string {
  const back = order.van ? view.backAt(order.van) : null;
  if (!order.van) return `⏱ ${t('contractLeft', { time: formatClock(Math.max(0, order.endsAt - view.now) / 1000) })}`;
  if (back !== null) return `🚚 ${t('orderOnRoad', { time: formatClock(Math.max(0, back - view.now) / 1000) })}`;
  return `📦 ${t('orderLoading', { van: vanName(order.van), time: formatClock(Math.max(0, order.endsAt - view.now) / 1000) })}`;
}

function card(order: Order, view: OrdersView, onSend: (van: string) => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'contract-card';
  const icon = document.createElement('div');
  icon.className = 'contract-icon';
  icon.textContent = GOODS[order.good]?.icon ?? '📦';
  const head = document.createElement('div');
  head.className = 'contract-head';
  const client = document.createElement('div');
  client.className = 'contract-client';
  const badge = order.special === 'buyer' ? `⭐ ${t('buyerOfDay')} · ` : order.special === 'fair' ? `🎀 ${t('countyFair')} · ` : '';
  client.textContent = badge + t('orderFor', { buyer: order.buyer });
  if (order.special) el.classList.add('order-special');
  const task = document.createElement('div');
  task.className = 'mission-text';
  task.textContent = orderText(order);
  head.append(client, task);
  const time = document.createElement('div');
  time.className = 'contract-time';
  time.dataset.order = String(order.id);
  time.textContent = timeText(order, view);
  const bar = document.createElement('div');
  bar.className = 'mission-bar contract-bar';
  const fill = document.createElement('div');
  fill.className = 'mission-fill';
  fill.style.width = `${(order.loaded / order.qty) * 100}%`;
  bar.appendChild(fill);
  const count = document.createElement('div');
  count.className = 'mission-count';
  count.textContent = `${order.loaded} / ${order.qty}`;
  const reward = document.createElement('div');
  reward.className = 'contract-reward';
  reward.textContent = `💵 ${formatCash(order.pay)}${order.gems ? `  💎 ${order.gems}` : ''}`;
  const foot = document.createElement('div');
  foot.className = 'contract-foot';
  const buttons = document.createElement('div');
  buttons.className = 'contract-buttons';
  if (!order.van && !view.auto) {
    for (const van of view.vans) {
      const send = document.createElement('button');
      send.type = 'button';
      send.className = 'mission-claim';
      send.textContent = t('sendVan', { van: vanName(van) });
      send.disabled = !view.canSend(order, van);
      send.addEventListener('click', () => onSend(van));
      if (!send.disabled || view.vans.length === 1) buttons.appendChild(send);
    }
  }
  foot.append(reward, buttons);
  el.append(icon, head, time, bar, count, foot);
  return el;
}

/** Opens the board; its timers keep ticking while open. `onSend` gives an order to a van; the board redraws after. */
export function showOrders(root: HTMLElement, view: () => OrdersView, onSend: (orderId: number, van: string) => void): { close: () => void } {
  const list = document.createElement('div');
  list.className = 'contract-list';
  // The cards are rebuilt only when the orders change (so a tap never lands on a card being replaced); the clocks tick in place.
  let shown = '';
  const render = (): void => {
    const now = view();
    const key = JSON.stringify([now.orders.map((o) => [o.id, o.van, o.loaded, o.van ? now.backAt(o.van) !== null : 0]), now.vans.map((v) => now.backAt(v) !== null), now.auto]);
    if (key === shown) {
      for (const el of list.querySelectorAll<HTMLElement>('[data-order]')) {
        const order = now.orders.find((o) => String(o.id) === el.dataset.order);
        if (order) el.textContent = timeText(order, now);
      }
      return;
    }
    shown = key;
    const cards = now.orders.map((order) =>
      card(order, now, (van) => {
        onSend(order.id, van);
        render();
      }),
    );
    for (let i = now.orders.length; i < now.slots; i++) {
      const empty = document.createElement('div');
      empty.className = 'contract-card contract-empty';
      empty.textContent = `📭 ${t('orderNew', { time: formatClock(Math.max(0, now.refillAt - now.now) / 1000) })}`;
      cards.push(empty);
    }
    list.replaceChildren(...cards);
  };
  render();
  const timer = window.setInterval(render, 1000);
  return openDialog(root, {
    icon: '🚚',
    title: t('ordersTitle'),
    body: t(view().auto ? 'ordersBodyAuto' : 'ordersBody'),
    content: list,
    buttons: [{ label: 'OK', kind: 'plain', onTap: () => {} }],
    onClose: () => window.clearInterval(timer),
  });
}
