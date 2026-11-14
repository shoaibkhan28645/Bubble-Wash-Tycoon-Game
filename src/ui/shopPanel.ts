// The Mogul's Boutique: the hero's outfits, hats and trails (bought with gems, just for looks), and the
// gem boosts gathered in one place. A window above the shop shows the hero up close, wearing whatever
// is picked, before it's bought.
import type { GameState } from '../core/gameState';
import { collection, equip, equipped, lookWith, owns, shopItems, unequip, buy, type Look, type ShopItem, type Slot } from '../systems/wardrobe';
import { t, type StringKey } from './strings';

export type ShopTab = Slot | 'boosts';

/** One gem boost as the Boosts tab shows it. */
export interface BoostView {
  icon: string;
  title: string;
  body: string;
  /** What it costs in gems; an ad pays for it too, unless `noAd` (the ad was already used). */
  gems: number;
  noAd?: boolean;
  /** Why it can't be used right now (it's running, cooling down, nothing to do), or '' if it can. */
  status: string;
  use: () => void;
}

export interface ShopDeps {
  root: HTMLElement;
  state: GameState;
  /** Dresses the hero (a look being tried on, or what's worn). */
  dress: (look: Look) => void;
  /** Starts the close-up of the hero in this window (null stops it). */
  preview: (element: HTMLElement | null) => void;
  /** The town's gem boosts, as they stand right now. */
  boosts: () => BoostView[];
  /** Something was bought (save, a cheer) or put on (save). */
  bought: (item: ShopItem) => void;
  changed: () => void;
  click: () => void;
}

const TABS: { id: ShopTab; icon: string; label: StringKey }[] = [
  { id: 'outfit', icon: '👔', label: 'shopOutfits' },
  { id: 'hat', icon: '🎩', label: 'shopHats' },
  { id: 'trail', icon: '✨', label: 'shopTrails' },
  { id: 'boosts', icon: '⚡', label: 'shopBoosts' },
];

/** A little suit in the outfit's colours, for its tile. */
function suitIcon(item: ShopItem): string {
  if (item.slot !== 'outfit') return '';
  const shirt = item.shirt ?? '#f4f6f8';
  return `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M7 38V15q0-6 7-8l6 5 6-5q7 2 7 8v23z" fill="${item.suit}" stroke="rgba(0,0,0,.25)" stroke-width="1"/><path d="M14 7l6 15 6-15-6 5z" fill="${shirt}"/><path d="M18.6 12h2.8l1.3 12-2.7 3.4-2.7-3.4z" fill="${item.tie}"/><path d="M14 7l3 12 3-7M26 7l-3 12-3-7" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="1.2"/></svg>`;
}

/** Opens the boutique on a tab. Returns how to close it. */
export function openShop(deps: ShopDeps, firstTab: ShopTab = 'outfit'): { close: () => void } {
  const { root, state } = deps;
  const overlay = document.createElement('div');
  overlay.className = 'shop-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', t('shopTitle'));
  overlay.addEventListener('pointerdown', (e) => e.stopPropagation());

  const window_ = document.createElement('div');
  window_.className = 'shop-preview';
  const caption = document.createElement('div');
  caption.className = 'shop-caption';
  window_.appendChild(caption);

  const sheet = document.createElement('div');
  sheet.className = 'shop-sheet';
  const head = document.createElement('div');
  head.className = 'shop-head';
  const title = document.createElement('h2');
  title.textContent = `🛍️ ${t('shopTitle')}`;
  const gems = document.createElement('span');
  gems.className = 'shop-gems';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'upgrade-close';
  closeButton.textContent = '✕';
  closeButton.setAttribute('aria-label', 'close');
  head.append(title, gems, closeButton);

  const tabs = document.createElement('div');
  tabs.className = 'shop-tabs';
  const tabButtons = new Map<ShopTab, HTMLButtonElement>();
  for (const tab of TABS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'shop-tab';
    b.innerHTML = `<span aria-hidden="true">${tab.icon}</span>`;
    b.append(t(tab.label));
    b.addEventListener('click', () => {
      deps.click();
      show(tab.id);
    });
    tabs.appendChild(b);
    tabButtons.set(tab.id, b);
  }

  const body = document.createElement('div');
  body.className = 'shop-body';
  const foot = document.createElement('div');
  foot.className = 'shop-foot';
  sheet.append(head, tabs, body, foot);
  overlay.append(window_, sheet);

  let tab: ShopTab = firstTab;
  /** The item picked on this tab (null: the slot's "none"). */
  let picked: string | null = null;

  const refreshGems = (): void => {
    gems.textContent = `💎 ${state.gems}`;
  };

  /** Puts the picked item on the hero (bought or not) and names it under the close-up. */
  const tryOn = (): void => {
    if (tab === 'boosts') {
      deps.dress(lookWith(state, null));
      return;
    }
    deps.dress(lookWith(state, { slot: tab, id: picked }));
  };

  const pick = (id: string | null): void => {
    picked = id;
    // Something owned is put on straight away; something else is only tried on until it's bought.
    if (tab !== 'boosts') {
      if (id === null && tab !== 'outfit') {
        if (equipped(state, tab)) {
          unequip(state, tab);
          deps.changed();
        }
      } else if (id && owns(state, id) && equipped(state, tab)?.id !== id) {
        equip(state, id);
        deps.changed();
      }
    }
    tryOn();
    render();
  };

  const tile = (item: ShopItem | null, slot: Slot): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `shop-tile rarity-${item?.rarity ?? 'none'}`;
    const id = item?.id ?? null;
    if (id === picked) b.classList.add('shop-picked');
    const worn = id === null ? !equipped(state, slot) : equipped(state, slot)?.id === id || (slot === 'outfit' && !equipped(state, 'outfit') && item?.gems === 0);
    if (worn) b.classList.add('shop-worn');
    const icon = document.createElement('span');
    icon.className = 'shop-icon';
    if (item?.slot === 'outfit') icon.innerHTML = suitIcon(item);
    else icon.textContent = item && 'icon' in item ? item.icon : '🚫';
    const name = document.createElement('span');
    name.className = 'shop-name';
    name.textContent = item ? item.name : t(slot === 'hat' ? 'shopNoHat' : 'shopNoTrail');
    const price = document.createElement('span');
    price.className = 'shop-price';
    if (!item || owns(state, item.id)) price.textContent = worn ? '✓' : item?.gems === 0 ? t('shopFree') : '';
    else price.textContent = `💎 ${item.gems}`;
    if (item && !owns(state, item.id) && state.gems < item.gems) price.classList.add('shop-short');
    b.append(icon, name, price);
    b.addEventListener('click', () => {
      deps.click();
      pick(id);
    });
    return b;
  };

  const renderItems = (slot: Slot): void => {
    const grid = document.createElement('div');
    grid.className = 'shop-grid';
    if (slot !== 'outfit') grid.appendChild(tile(null, slot));
    for (const item of shopItems(slot)) grid.appendChild(tile(item, slot));
    const hint = document.createElement('p');
    hint.className = 'shop-hint';
    hint.textContent = `${t('shopHint')} ${t('shopEarn')}`;
    body.replaceChildren(grid, hint);

    const item = picked ? shopItems(slot).find((i) => i.id === picked) : null;
    const label = document.createElement('div');
    label.className = 'shop-pick';
    const name = document.createElement('strong');
    const rarity = document.createElement('span');
    if (item) {
      name.textContent = item.name;
      rarity.className = `shop-rarity rarity-${item.rarity}`;
      rarity.textContent = t(`rarity_${item.rarity}` as StringKey);
    } else {
      name.textContent = t(slot === 'hat' ? 'shopNoHat' : slot === 'trail' ? 'shopNoTrail' : 'shopNone');
      const { owned, total } = collection(state);
      rarity.className = 'shop-rarity';
      rarity.textContent = t('shopCollection', { owned, total });
    }
    label.append(name, rarity);
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'shop-action';
    if (item && !owns(state, item.id)) {
      const short = item.gems - state.gems;
      action.textContent = `💎 ${item.gems}`;
      action.classList.add('shop-buy');
      action.disabled = short > 0;
      if (short > 0) {
        const need = document.createElement('span');
        need.className = 'shop-need';
        need.textContent = t('shopNeed', { gems: short });
        label.appendChild(need);
      }
      action.addEventListener('click', () => {
        if (buy(state, item.id) !== 'bought') return;
        deps.bought(item);
        refreshGems();
        tryOn();
        render();
      });
    } else {
      action.textContent = t('shopWearing');
      action.disabled = true;
    }
    foot.replaceChildren(label, action);
    caption.textContent = item ? item.name : '';
    window_.className = `shop-preview rarity-${item?.rarity ?? 'none'}`;
  };

  const renderBoosts = (): void => {
    const list = document.createElement('div');
    list.className = 'shop-boosts';
    for (const boost of deps.boosts()) {
      const row = document.createElement('div');
      row.className = 'upgrade-row';
      const icon = document.createElement('span');
      icon.className = 'shop-boost-icon';
      icon.textContent = boost.icon;
      const text = document.createElement('div');
      text.className = 'upgrade-text';
      const name = document.createElement('strong');
      name.textContent = boost.title;
      const what = document.createElement('span');
      what.textContent = boost.status || boost.body;
      if (boost.status) what.className = 'upgrade-level';
      text.append(name, what);
      const use = document.createElement('button');
      use.type = 'button';
      use.className = 'shop-use';
      // Nothing to price yet (nothing being built): just the ad's sign.
      use.textContent = boost.gems <= 0 ? '📺' : boost.noAd ? `💎 ${boost.gems}` : `📺 / 💎 ${boost.gems}`;
      use.disabled = !!boost.status;
      use.addEventListener('click', () => {
        deps.click();
        close();
        boost.use();
      });
      row.append(icon, text, use);
      list.appendChild(row);
    }
    const note = document.createElement('p');
    note.className = 'shop-hint';
    note.textContent = `${t('boostsNote')} ${t('shopEarn')}`;
    body.replaceChildren(list, note);
    foot.replaceChildren();
    caption.textContent = '';
    window_.className = 'shop-preview rarity-none';
  };

  const render = (): void => {
    refreshGems();
    for (const [id, b] of tabButtons) b.classList.toggle('shop-tab-on', id === tab);
    sheet.classList.toggle('shop-boosts-on', tab === 'boosts');
    if (tab === 'boosts') renderBoosts();
    else renderItems(tab);
  };

  const show = (next: ShopTab): void => {
    tab = next;
    picked = next === 'boosts' ? null : next === 'outfit' ? (equipped(state, 'outfit')?.id ?? shopItems('outfit')[0]!.id) : (equipped(state, next)?.id ?? null);
    tryOn();
    render();
    body.scrollTop = 0;
  };

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKey);
    deps.preview(null);
    deps.dress(lookWith(state, null));
    overlay.remove();
    root.classList.remove('shop-open');
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };
  closeButton.addEventListener('click', () => {
    deps.click();
    close();
  });
  // A tap on the town around the shop closes it.
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  window.addEventListener('keydown', onKey);

  root.appendChild(overlay);
  // The town's labels, hints and buttons step aside while shopping (they'd float over the close-up; the shop shows the gems).
  root.classList.add('shop-open');
  show(firstTab);
  deps.preview(window_);
  return { close };
}
