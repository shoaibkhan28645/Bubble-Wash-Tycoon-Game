// The Mogul's Boutique: the hero's outfits, hats and trails, the business's brand colour and the towns'
// decorations (bought with gems, just for looks), today's featured things, the sets and the things only
// earned, and the gem boosts gathered in one place. A window above the shop shows what's picked up close
// (the hero, a staff member, a decoration in its spot) before it's bought.
import { ADS, RANKS, SHOP } from '../core/config';
import type { GameState } from '../core/gameState';
import { JOURNEY } from '../systems/journey';
import {
  adGemsLeft,
  buy,
  chooseTitle,
  collection,
  decorShown,
  equip,
  equipped,
  featuredToday,
  nextGift,
  owns,
  priceOf,
  SETS,
  setProgress,
  shopItem,
  shopItems,
  titles,
  toggleDecor,
  unequip,
  type EarnRule,
  type ShopItem,
  type Slot,
} from '../systems/wardrobe';
import { t, type StringKey } from './strings';

export type ShopTab = Slot | 'today' | 'sets' | 'boosts';

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
  /** The town being played (a decoration elsewhere can't be seen from here). */
  town: string;
  /**
   * Shows something tried on in a slot, bought or not (an outfit on the hero, a brand on the staff, a
   * decoration in its spot) over what's saved, and points the close-up at it; null tries on the slot's
   * "none". With no slot (the Boosts tab, or the shop closing), everything shows as saved.
   */
  tryOn: (slot: Slot | null, id: string | null) => void;
  /** Starts the close-up of the hero in this window (null stops it). */
  preview: (element: HTMLElement | null) => void;
  /** The town's gem boosts, as they stand right now. */
  boosts: () => BoostView[];
  /** Something was bought (save, a cheer) or put on (save). */
  bought: (item: ShopItem) => void;
  changed: () => void;
  click: () => void;
  /** Today's local date (the featured things, the day's ads). */
  today: string;
  /** Plays a rewarded ad for gems: true if they were paid. */
  watchForGems: () => Promise<boolean>;
  /** Days of the daily calendar claimed this round (0–6): the 7th brings the weekly gift. */
  calendarDay: number;
}

const TABS: { id: ShopTab; icon: string; label: StringKey }[] = [
  { id: 'today', icon: '⭐', label: 'shopToday' },
  { id: 'outfit', icon: '👔', label: 'shopOutfits' },
  { id: 'hat', icon: '🎩', label: 'shopHats' },
  { id: 'trail', icon: '✨', label: 'shopTrails' },
  { id: 'brand', icon: '🎨', label: 'shopBrand' },
  { id: 'decor', icon: '🌷', label: 'shopDecor' },
  { id: 'sets', icon: '📖', label: 'shopSets' },
  { id: 'boosts', icon: '⚡', label: 'shopBoosts' },
];

/** How something only earned is earned, in words. */
export function earnText(rule: EarnRule): string {
  if (rule.flag) return t('earnFinish', { town: townName(rule.town ?? '') });
  if (rule.count === 'ribbon') return t('earnRibbon');
  if (rule.rank) return t('earnRank', { rank: RANKS.find((r) => r.id === rule.rank)?.name ?? rule.rank });
  if (rule.set) return t('earnSet', { set: SETS.find((s) => s.id === rule.set)?.name ?? rule.set });
  return '';
}

/** Hours and minutes until local midnight (when the featured things change). */
function untilMidnight(): string {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const minutes = Math.max(1, Math.ceil((midnight.getTime() - now.getTime()) / 60000));
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/** The hint under each tab's items. */
const HINTS: Partial<Record<Slot, StringKey>> = { brand: 'shopBrandHint', decor: 'shopDecorHint' };

/** The classic brand's polo colour (art/blender/kenney_staff.py). */
const CLASSIC_POLO = '#22c3c9';

const townName = (id: string): string => JOURNEY.find((stop) => stop.id === id)?.name ?? id;

/** A little suit in the outfit's colours, for its tile. */
function suitIcon(item: ShopItem): string {
  if (item.slot !== 'outfit') return '';
  const shirt = item.shirt ?? '#f4f6f8';
  return `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M7 38V15q0-6 7-8l6 5 6-5q7 2 7 8v23z" fill="${item.suit}" stroke="rgba(0,0,0,.25)" stroke-width="1"/><path d="M14 7l6 15 6-15-6 5z" fill="${shirt}"/><path d="M18.6 12h2.8l1.3 12-2.7 3.4-2.7-3.4z" fill="${item.tie}"/><path d="M14 7l3 12 3-7M26 7l-3 12-3-7" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="1.2"/></svg>`;
}

/** A polo shirt in the brand's colour (with a stripe of its vehicle paint), for its tile. */
function poloIcon(item: ShopItem): string {
  if (item.slot !== 'brand') return '';
  const main = item.main ?? CLASSIC_POLO;
  const stripe = item.vehicle ?? '#3f7a5a';
  return `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M13 6l-9 6 4 7 4-2v19h16V17l4 2 4-7-9-6q-3 4-7 4t-7-4z" fill="${main}" stroke="rgba(0,0,0,.25)" stroke-width="1"/><path d="M13 6q3 4 7 4t7-4l-3-1q-4 3-8 0z" fill="#f6f8fb"/><rect x="12" y="29" width="16" height="4" fill="${stripe}"/><circle cx="24" cy="16" r="2" fill="#f6f8fb"/></svg>`;
}

/** An item's picture: a suit or polo drawn in its colours, or its emoji. */
function iconOf(item: ShopItem | null): { html?: string; text?: string } {
  if (item?.slot === 'outfit') return { html: suitIcon(item) };
  if (item?.slot === 'brand') return { html: poloIcon(item) };
  return { text: item && 'icon' in item ? item.icon : '🚫' };
}

/** Opens the boutique on a tab. Returns how to close it. */
export function openShop(deps: ShopDeps, firstTab: ShopTab = 'today'): { close: () => void } {
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

  /** Shows the picked item (bought or not) and points the close-up at it. */
  const tryOn = (): void => {
    deps.tryOn(tab === 'boosts' || tab === 'today' || tab === 'sets' ? null : tab, picked);
  };

  const pick = (id: string | null): void => {
    picked = id;
    // Something owned is put on straight away; something else is only tried on until it's bought.
    // A decoration is only picked: the button under the shop puts it away or back up.
    if (tab !== 'boosts' && tab !== 'decor' && tab !== 'today' && tab !== 'sets') {
      if (id === null && tab !== 'outfit') {
        if (equipped(state, tab)) {
          unequip(state, tab as 'hat' | 'trail');
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
    const worn =
      slot === 'decor'
        ? !!id && decorShown(state, id)
        : id === null
          ? !equipped(state, slot)
          : equipped(state, slot)?.id === id || ((slot === 'outfit' || slot === 'brand') && !equipped(state, slot) && item?.gems === 0);
    if (worn) b.classList.add('shop-worn');
    b.append(...tileFace(item, slot, worn));
    b.addEventListener('click', () => {
      deps.click();
      pick(id);
    });
    return b;
  };

  /** A tile's picture, name and price (today's, with the old one struck through on a deal), or how it's earned. */
  const tileFace = (item: ShopItem | null, slot: Slot, worn: boolean): HTMLElement[] => {
    const icon = document.createElement('span');
    icon.className = 'shop-icon';
    const face = iconOf(item);
    if (face.html) icon.innerHTML = face.html;
    else icon.textContent = face.text ?? '';
    const name = document.createElement('span');
    name.className = 'shop-name';
    name.textContent = item ? item.name : t(slot === 'hat' ? 'shopNoHat' : 'shopNoTrail');
    const price = document.createElement('span');
    price.className = 'shop-price';
    if (!item || owns(state, item.id)) price.textContent = worn ? '✓' : item?.gems === 0 && !item.earn ? t('shopFree') : slot === 'decor' ? t('shopPutAwayShort') : '';
    else if (item.earn) {
      price.textContent = '🔒';
      price.classList.add('shop-locked');
    } else {
      const cost = priceOf(state, item.id, deps.today);
      price.innerHTML = cost < item.gems ? `<s>${item.gems}</s> 💎 ${cost}` : `💎 ${cost}`;
      if (state.gems < cost) price.classList.add('shop-short');
    }
    const parts: HTMLElement[] = [icon, name, price];
    if (item && !owns(state, item.id) && state.wardrobe.featured.date === deps.today && state.wardrobe.featured.ids.includes(item.id)) {
      const star = document.createElement('span');
      star.className = 'shop-featured';
      star.textContent = state.wardrobe.featured.sale === item.id ? `−${Math.round(SHOP.featured.discount * 100)}%` : '⭐';
      parts.push(star);
    }
    return parts;
  };

  /** Goes to an item's own tab, picked (from Today or a set). */
  const jump = (item: ShopItem): void => {
    show(item.slot);
    pick(item.id);
  };

  const renderItems = (slot: Slot): void => {
    const blocks: HTMLElement[] = [];
    const grid = (): HTMLElement => {
      const g = document.createElement('div');
      g.className = 'shop-grid';
      blocks.push(g);
      return g;
    };
    if (slot === 'decor') {
      // Each town's decorations under its name, this town's first.
      const towns = [...new Set(shopItems('decor').map((d) => (d.slot === 'decor' ? d.town : '')))].sort((a, b) => Number(b === deps.town) - Number(a === deps.town));
      for (const town of towns) {
        const header = document.createElement('div');
        header.className = 'shop-town';
        header.textContent = `${JOURNEY.find((stop) => stop.id === town)?.icon ?? ''} ${townName(town)}`;
        blocks.push(header);
        const g = grid();
        for (const item of shopItems('decor')) if (item.slot === 'decor' && item.town === town) g.appendChild(tile(item, slot));
      }
    } else {
      const g = grid();
      if (slot === 'hat' || slot === 'trail') g.appendChild(tile(null, slot));
      for (const item of shopItems(slot)) g.appendChild(tile(item, slot));
    }
    const hint = document.createElement('p');
    hint.className = 'shop-hint';
    hint.textContent = `${t(HINTS[slot] ?? 'shopHint')} ${t('shopEarn')}`;
    body.replaceChildren(...blocks, hint);

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
    // A decoration for another town goes up there, not here.
    const elsewhere = item?.slot === 'decor' && item.town !== deps.town ? t('shopElsewhere', { town: townName(item.town) }) : '';
    if (elsewhere) {
      const where = document.createElement('span');
      where.className = 'shop-where';
      where.textContent = elsewhere;
      label.appendChild(where);
    }
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'shop-action';
    if (item?.slot === 'decor' && owns(state, item.id)) {
      const up = decorShown(state, item.id);
      action.textContent = t(up ? 'shopPutAway' : 'shopPutUp');
      action.classList.toggle('shop-away', up);
      action.addEventListener('click', () => {
        deps.click();
        toggleDecor(state, item.id);
        deps.changed();
        tryOn();
        render();
      });
    } else if (item?.earn && !owns(state, item.id)) {
      const how = document.createElement('span');
      how.className = 'shop-where';
      how.textContent = earnText(item.earn);
      label.appendChild(how);
      action.textContent = `🔒 ${t('shopEarned')}`;
      action.disabled = true;
    } else if (item && !owns(state, item.id)) {
      const cost = priceOf(state, item.id, deps.today);
      const short = cost - state.gems;
      action.textContent = `💎 ${cost}`;
      action.classList.add('shop-buy');
      action.disabled = short > 0;
      if (short > 0) {
        const need = document.createElement('span');
        need.className = 'shop-need';
        need.textContent = t('shopNeed', { gems: short });
        label.appendChild(need);
      }
      action.addEventListener('click', () => {
        if (buy(state, item.id, deps.today) !== 'bought') return;
        deps.bought(item);
        refreshGems();
        tryOn();
        render();
      });
    } else {
      action.textContent = t(slot === 'brand' ? 'shopInUse' : 'shopWearing');
      action.disabled = true;
    }
    foot.replaceChildren(label, action);
    caption.textContent = elsewhere || (item ? item.name : '');
    window_.className = `shop-preview rarity-${item?.rarity ?? 'none'}`;
  };

  /** A small heading over part of a tab. */
  const heading = (text: string, side = ''): HTMLElement => {
    const h = document.createElement('div');
    h.className = 'shop-town';
    h.textContent = text;
    if (side) {
      const s = document.createElement('span');
      s.className = 'shop-heading-side';
      s.textContent = side;
      h.appendChild(s);
    }
    return h;
  };

  /** A plain card: an icon, words, and maybe a button. */
  const card = (icon: string, title: string, text: string, button?: HTMLButtonElement): HTMLElement => {
    const row = document.createElement('div');
    row.className = 'upgrade-row shop-card';
    const i = document.createElement('span');
    i.className = 'shop-boost-icon';
    i.textContent = icon;
    const words = document.createElement('div');
    words.className = 'upgrade-text';
    const strong = document.createElement('strong');
    strong.textContent = title;
    const span = document.createElement('span');
    span.textContent = text;
    words.append(strong, span);
    row.append(i, words);
    if (button) row.appendChild(button);
    return row;
  };

  /** Today: the featured things (one of them a deal), gems for an ad, and next week's gift. */
  const renderToday = (): void => {
    const blocks: HTMLElement[] = [heading(`⭐ ${t('shopTodayPicks')}`, t('shopNewPicks', { time: untilMidnight() }))];
    const picks = featuredToday(state, deps.today);
    const grid = document.createElement('div');
    grid.className = 'shop-grid shop-featured-grid';
    for (const item of picks) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `shop-tile rarity-${item.rarity}`;
      if (owns(state, item.id)) b.classList.add('shop-worn');
      b.append(...tileFace(item, item.slot, owns(state, item.id)));
      const where = document.createElement('span');
      where.className = 'shop-slot';
      where.textContent = t(TABS.find((x) => x.id === item.slot)!.label);
      b.appendChild(where);
      b.addEventListener('click', () => {
        deps.click();
        jump(item);
      });
      grid.appendChild(b);
    }
    if (picks.length) blocks.push(grid);
    else blocks.push(heading(t('shopAllOwned')));
    // Gems for a short ad, a few times a day.
    const left = adGemsLeft(state, deps.today);
    const watch = document.createElement('button');
    watch.type = 'button';
    watch.className = 'shop-use';
    watch.textContent = `📺 +${ADS.gemAd.gems} 💎`;
    watch.disabled = left <= 0;
    watch.addEventListener('click', async () => {
      deps.click();
      watch.disabled = true;
      await deps.watchForGems();
      render();
    });
    blocks.push(card('📺', t('shopAdTitle', { gems: ADS.gemAd.gems }), left > 0 ? t('shopAdLeft', { n: left }) : t('shopAdDone'), watch));
    // The weekly gift: the calendar's 7th day.
    const gift = nextGift(state);
    if (gift) blocks.push(card('🎁', t('shopGiftTitle'), t('shopGiftBody', { name: gift.name, day: deps.calendarDay + 1 })));
    const hint = document.createElement('p');
    hint.className = 'shop-hint';
    hint.textContent = t('shopEarn');
    blocks.push(hint);
    body.replaceChildren(...blocks);
    foot.replaceChildren();
    caption.textContent = '';
    window_.className = 'shop-preview rarity-none';
  };

  /** The collection book: everything owned so far, the sets and their titles, and the things only earned. */
  const renderSets = (): void => {
    const { owned, total } = collection(state);
    const book = document.createElement('div');
    book.className = 'shop-book';
    book.innerHTML = `<span class="shop-book-count"></span><span class="mission-bar"><span class="mission-fill" style="width:${Math.round((owned / total) * 100)}%"></span></span>`;
    book.querySelector('.shop-book-count')!.textContent = `📖 ${t('shopCollection', { owned, total })}`;
    const blocks: HTMLElement[] = [book];
    // Titles to wear on the rank chip.
    const earned = titles(state);
    if (earned.length) {
      blocks.push(heading(t('shopTitles')));
      const row = document.createElement('div');
      row.className = 'shop-titles';
      for (const set of [null, ...earned]) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'shop-title-chip';
        const id = set?.id ?? '';
        b.classList.toggle('shop-title-on', state.wardrobe.title === id);
        b.textContent = set ? `${set.icon} ${set.title}` : t('shopNoTitle');
        b.addEventListener('click', () => {
          deps.click();
          if (chooseTitle(state, id)) deps.changed();
          render();
        });
        row.appendChild(b);
      }
      blocks.push(row);
    }
    for (const set of SETS) {
      const { owned: have, total: of, done } = setProgress(state, set);
      blocks.push(heading(`${set.icon} ${set.name}`, done ? `✓ ${set.title}` : `${have}/${of} · ${t('shopSetTitle', { title: set.title })}`));
      const grid = document.createElement('div');
      grid.className = 'shop-grid shop-set-grid';
      for (const id of [...set.items, set.reward]) {
        const item = shopItem(id);
        if (!item) continue;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `shop-tile shop-mini rarity-${item.rarity}`;
        if (owns(state, id)) b.classList.add('shop-worn');
        if (id === set.reward) b.classList.add('shop-reward');
        b.append(...tileFace(item, item.slot, owns(state, id)).slice(0, 3));
        b.addEventListener('click', () => {
          deps.click();
          jump(item);
        });
        grid.appendChild(b);
      }
      blocks.push(grid);
    }
    // The things only earned (not a set's reward): finishing a town, a rank, a prize ribbon.
    blocks.push(heading(`🏅 ${t('shopEarnedOnly')}`));
    for (const item of [...shopItems('hat'), ...shopItems('trail'), ...shopItems('decor')]) {
      if (!item.earn || item.earn.set) continue;
      const got = owns(state, item.id);
      const face = iconOf(item);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'shop-use';
      b.textContent = got ? '✓' : '🔒';
      b.disabled = !got;
      b.addEventListener('click', () => {
        deps.click();
        jump(item);
      });
      blocks.push(card(face.text ?? '', item.name, earnText(item.earn), b));
    }
    body.replaceChildren(...blocks);
    foot.replaceChildren();
    caption.textContent = '';
    window_.className = 'shop-preview rarity-none';
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
    else if (tab === 'today') renderToday();
    else if (tab === 'sets') renderSets();
    else renderItems(tab);
  };

  const show = (next: ShopTab): void => {
    tab = next;
    picked =
      next === 'boosts' || next === 'today' || next === 'sets'
        ? null
        : next === 'decor'
          ? (shopItems('decor').find((d) => d.slot === 'decor' && d.town === deps.town)?.id ?? null)
          : next === 'outfit' || next === 'brand'
            ? (equipped(state, next)?.id ?? shopItems(next)[0]!.id)
            : (equipped(state, next)?.id ?? null);
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
    deps.tryOn(null, null);
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
