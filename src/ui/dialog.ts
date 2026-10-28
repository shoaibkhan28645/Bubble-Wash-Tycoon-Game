import { t } from './strings';

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
 * A modal card in the game's style. Taps on it never reach the joystick;
 * Escape closes it. Buttons are disabled while their action runs (an ad).
 */
export function openDialog(root: HTMLElement, options: DialogOptions): { close: () => void } {
  const overlay = document.createElement('div');
  overlay.className = 'welcome-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', options.title);
  const card = document.createElement('div');
  card.className = 'welcome-card';
  const icon = document.createElement('div');
  icon.className = 'dialog-icon';
  icon.textContent = options.icon;
  const title = document.createElement('h2');
  title.textContent = options.title;
  card.append(icon, title);
  if (options.body) {
    const body = document.createElement('p');
    body.className = 'end-body';
    body.textContent = options.body;
    card.appendChild(body);
  }
  if (options.content) card.appendChild(options.content);
  const row = document.createElement('div');
  row.className = 'dialog-buttons';
  card.appendChild(row);
  overlay.appendChild(card);
  overlay.addEventListener('pointerdown', (e) => e.stopPropagation());

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKey);
    overlay.remove();
    options.onClose?.();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };

  const buttons = options.buttons.map((spec) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `dialog-button dialog-${spec.kind ?? 'primary'}`;
    button.textContent = spec.label;
    button.disabled = !!spec.disabled;
    button.addEventListener('click', async () => {
      for (const b of buttons) b.disabled = true;
      const keepOpen = (await spec.onTap()) === false;
      if (!keepOpen) close();
      else buttons.forEach((b, i) => (b.disabled = !!options.buttons[i]!.disabled));
    });
    row.appendChild(button);
    return button;
  });
  window.addEventListener('keydown', onKey);
  root.appendChild(overlay);
  buttons.find((b) => !b.disabled)?.focus();
  return { close };
}

/** "Watch an ad, or pay gems, or not now": resolves with the player's choice. */
export function offer(
  root: HTMLElement,
  options: { icon: string; title: string; body: string; gems: number; haveGems: number },
): Promise<'ad' | 'gems' | null> {
  return new Promise((resolve) => {
    let choice: 'ad' | 'gems' | null = null;
    openDialog(root, {
      icon: options.icon,
      title: options.title,
      body: options.body,
      buttons: [
        { label: `📺 ${t('watchAd')}`, kind: 'ad', onTap: () => void (choice = 'ad') },
        { label: `💎 ${options.gems}`, kind: 'gems', disabled: options.haveGems < options.gems, onTap: () => void (choice = 'gems') },
        { label: t('notNow'), kind: 'plain', onTap: () => {} },
      ],
      onClose: () => resolve(choice),
    });
  });
}

/** A short message that floats in at the top and fades. */
export function toast(root: HTMLElement, text: string): void {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  root.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}
