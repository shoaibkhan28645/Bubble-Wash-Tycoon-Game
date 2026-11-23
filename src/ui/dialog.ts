import { icon, iconFor, setRich } from './icons';
import { t } from './strings';
import { isEscape } from './keys';
import { rewardedAdsAvailable } from '../platform/youtube';

/** Button clicks and dialogs opening make a sound; the game sets who plays it. */
let uiSound: (name: 'click' | 'open') => void = () => {};
export function setUiSound(play: (name: 'click' | 'open') => void): void {
  uiSound = play;
}

export interface DialogButton {
  label: string;
  /** ad: "📺 Watch ad" (green), gems: pay with gems (blue), plain: a quiet text button. */
  kind?: 'primary' | 'ad' | 'gems' | 'plain';
  disabled?: boolean;
  /** Return false to keep the dialog open. */
  onTap: () => void | boolean | Promise<void | boolean>;
}

export interface DialogOptions {
  icon: string;
  title: string;
  body?: string;
  /** Extra content between the body and the buttons (calendar tiles, mission rows). */
  content?: HTMLElement;
  buttons: DialogButton[];
  onClose?: () => void;
}

/**
 * A modal in the game's style. With no `content` it's a pop-up card (an offer, a confirmation); with
 * content (a calendar, a list of missions, the map) it's a menu that fills the screen, with its title
 * and a close button along the top. Taps on it never reach the joystick; Escape closes it. Buttons are
 * disabled while their action runs (an ad).
 */
export function openDialog(root: HTMLElement, options: DialogOptions): { close: () => void } {
  const page = !!options.content;
  const overlay = document.createElement('div');
  overlay.className = page ? 'welcome-overlay menu-overlay' : 'welcome-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', options.title);
  const title = document.createElement('h2');
  title.textContent = options.title;
  const row = document.createElement('div');
  row.className = 'dialog-buttons';
  const drawn = iconFor(options.icon, page ? 30 : 52);

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKey);
    overlay.remove();
    options.onClose?.();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (isEscape(e)) close();
  };

  if (page) {
    // A menu: [✕] [icon Title] along the top, the content on a sheet that scrolls, its buttons under it.
    const head = document.createElement('div');
    head.className = 'menu-head';
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'menu-close';
    x.setAttribute('aria-label', 'Close');
    x.innerHTML = icon('close', 22);
    x.addEventListener('click', () => {
      uiSound('click');
      close();
    });
    title.className = 'menu-title';
    if (drawn) title.insertAdjacentHTML('afterbegin', drawn);
    head.append(x, title);
    const body = document.createElement('div');
    body.className = 'menu-body';
    const sheet = document.createElement('div');
    sheet.className = 'menu-sheet';
    if (options.body) {
      const note = document.createElement('p');
      note.className = 'menu-note';
      setRich(note, options.body);
      sheet.appendChild(note);
    }
    sheet.appendChild(options.content!);
    body.appendChild(sheet);
    overlay.append(head, body, row);
  } else {
    const card = document.createElement('div');
    card.className = 'welcome-card';
    const badge = document.createElement('div');
    badge.className = 'dialog-icon';
    if (drawn) badge.innerHTML = drawn;
    else badge.textContent = options.icon;
    card.append(badge, title);
    if (options.body) {
      const body = document.createElement('p');
      body.className = 'end-body';
      setRich(body, options.body);
      card.appendChild(body);
    }
    card.appendChild(row);
    overlay.appendChild(card);
  }
  overlay.addEventListener('pointerdown', (e) => e.stopPropagation());

  const buttons: HTMLButtonElement[] = [];
  options.buttons.forEach((spec) => {
    // A menu's ✕ does what its quiet "close" button did.
    if (page && spec.kind === 'plain') return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `dialog-button dialog-${spec.kind ?? 'primary'}`;
    setRich(button, spec.label);
    button.disabled = !!spec.disabled;
    button.addEventListener('click', async () => {
      uiSound('click');
      const was = buttons.map((b) => b.disabled);
      for (const b of buttons) b.disabled = true;
      const keepOpen = (await spec.onTap()) === false;
      if (!keepOpen) close();
      else buttons.forEach((b, i) => (b.disabled = was[i]!));
    });
    row.appendChild(button);
    buttons.push(button);
  });
  if (buttons.length === 0) row.remove();
  window.addEventListener('keydown', onKey);
  root.appendChild(overlay);
  uiSound('open');
  buttons.find((b) => !b.disabled)?.focus();
  return { close };
}

/** "Watch an ad, or pay gems, or not now": resolves with the player's choice. */
export function offer(
  root: HTMLElement,
  /** `noAd`: only gems are on offer (the ad was already used). */
  options: { icon: string; title: string; body: string; gems: number; haveGems: number; noAd?: boolean },
): Promise<'ad' | 'gems' | null> {
  return new Promise((resolve) => {
    let choice: 'ad' | 'gems' | null = null;
    openDialog(root, {
      icon: options.icon,
      title: options.title,
      body: options.body,
      buttons: [
        ...(options.noAd || !rewardedAdsAvailable() ? [] : [{ label: `📺 ${t('watchAd')}`, kind: 'ad' as const, onTap: () => void (choice = 'ad') }]),
        { label: `💎 ${options.gems}`, kind: 'gems', disabled: options.haveGems < options.gems, onTap: () => void (choice = 'gems') },
        { label: t('notNow'), kind: 'plain', onTap: () => {} },
      ],
      onClose: () => resolve(choice),
    });
  });
}

/** Someone says something (the mentor's tip): their face and words float in at the top, stay a while and fade, never in the way. */
export function speech(root: HTMLElement, who: { name: string; icon: string }, text: string, seconds = 7): void {
  const el = document.createElement('div');
  el.className = 'speech-tip';
  el.style.animationDuration = `${seconds}s`;
  const face = document.createElement('span');
  face.className = 'speech-face';
  face.textContent = who.icon;
  const words = document.createElement('span');
  words.className = 'speech-words';
  const name = document.createElement('b');
  name.textContent = who.name;
  words.append(name, document.createTextNode(text));
  el.append(face, words);
  root.appendChild(el);
  setTimeout(() => el.remove(), seconds * 1000);
}

/** A short message that floats in at the top and fades. */
/** A suggestion the player can tap (it opens the shop on the thing it's about), gone after a few seconds. */
export function nudge(root: HTMLElement, text: string, onTap: () => void): void {
  root.querySelector('.nudge')?.remove();
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'nudge';
  setRich(el, `${text} ›`);
  // A tap on it is a tap for the shop, never for the joystick underneath.
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('click', () => {
    el.remove();
    onTap();
  });
  root.appendChild(el);
  setTimeout(() => el.remove(), 9000);
}

export function toast(root: HTMLElement, text: string): void {
  const el = document.createElement('div');
  el.className = 'toast';
  setRich(el, text);
  root.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}
