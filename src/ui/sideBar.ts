/** What the side buttons show this frame. */
export interface SideView {
  /** Calendar reward waiting. */
  calendar: boolean;
  /** Finished missions waiting to be claimed. */
  missions: number;
  /** Seconds of speed boost left (0 = off, offer it). */
  speedLeft: number;
  /** Seconds until the VIP convoy can be called again (0 = ready). */
  convoyWait: number;
  /** A station has run dry. */
  refill: boolean;
  /** The next pad is within reach of a rewarded finish. */
  finish: boolean;
  /** Seconds left on the building going up soonest (0 = nothing being built). */
  build: number;
  /** Whether the player has got far enough for this button (GDD Onboarding: they appear one by one). */
  available: (action: SideAction) => boolean;
}

export type SideAction = 'calendar' | 'missions' | 'speed' | 'convoy' | 'refill' | 'finish' | 'build';

interface SideButton {
  el: HTMLButtonElement;
  badge: HTMLElement;
  shown: string;
  visible: boolean;
}

/** A button that has just appeared glows this long. */
const NEW_GLOW_MS = 4000;

const ICONS: Record<SideAction, string> = { calendar: '🎁', missions: '📋', speed: '⚡', convoy: '👑', refill: '🧴', finish: '🏗️', build: '🚧' };

const clock = (seconds: number) =>
  seconds >= 3600 ? `${Math.floor(seconds / 3600)}h${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}` : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/**
 * Round buttons down the right edge: daily rewards and missions, the
 * rewarded boosts, and two that only appear when they apply. Each is at
 * least 48 px (Tech Guide touch targets) and the page is only touched when
 * something changes.
 */
export class SideBar {
  private readonly buttons = new Map<SideAction, SideButton>();
  /** The first update only sets up what's there; buttons that appear later glow. */
  private started = false;

  constructor(root: HTMLElement, onTap: (action: SideAction) => void) {
    const bar = document.createElement('div');
    bar.className = 'side-bar';
    bar.addEventListener('pointerdown', (e) => e.stopPropagation());
    for (const action of Object.keys(ICONS) as SideAction[]) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `side-button side-${action}`;
      el.textContent = ICONS[action];
      el.setAttribute('aria-label', action);
      const badge = document.createElement('span');
      badge.className = 'side-badge';
      el.appendChild(badge);
      el.addEventListener('click', () => onTap(action));
      bar.appendChild(el);
      this.buttons.set(action, { el, badge, shown: '', visible: false });
    }
    root.appendChild(bar);
  }

  update(view: SideView): void {
    const open = view.available;
    this.set('calendar', open('calendar'), view.calendar ? '!' : '', view.calendar);
    this.set('missions', open('missions'), view.missions ? String(view.missions) : '', view.missions > 0);
    this.set('speed', open('speed'), view.speedLeft > 0 ? clock(view.speedLeft) : '📺', view.speedLeft > 0);
    this.set('convoy', open('convoy'), view.convoyWait > 0 ? clock(view.convoyWait) : '📺', false, view.convoyWait > 0);
    this.set('refill', view.refill && open('refill'), '📺', false);
    this.set('finish', view.finish && open('finish'), '📺', false);
    this.set('build', view.build > 0 && open('build'), clock(view.build), false);
    this.started = true;
  }

  /** visible, badge text, highlighted (pulsing), and greyed out (still tappable for info). */
  private set(action: SideAction, visible: boolean, badge: string, hot: boolean, dim = false): void {
    const b = this.buttons.get(action)!;
    const key = `${visible}|${badge}|${hot}|${dim}`;
    if (key === b.shown) return;
    b.shown = key;
    b.el.hidden = !visible;
    // Newly unlocked (not just a pop-up offer like refill): it glows for a moment.
    if (visible && !b.visible && this.started && action !== 'refill' && action !== 'finish' && action !== 'build') {
      b.el.classList.add('side-new');
      setTimeout(() => b.el.classList.remove('side-new'), NEW_GLOW_MS);
    }
    b.visible = visible;
    b.badge.textContent = badge;
    b.badge.hidden = !badge;
    b.el.classList.toggle('side-hot', hot);
    b.el.classList.toggle('side-dim', dim);
  }
}
