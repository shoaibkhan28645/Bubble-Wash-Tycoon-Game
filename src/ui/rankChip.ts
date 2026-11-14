import type { RankDef } from '../core/config';
import { formatCash } from '../systems/economy';
import { t } from './strings';

/**
 * The hero's rank under the cash counter, with a bar filling towards the
 * next one. Tapping it opens the empire map. The page is only touched when
 * what it shows changes.
 */
export class RankChip {
  private readonly el: HTMLButtonElement;
  private readonly icon: HTMLElement;
  private readonly name: HTMLElement;
  private readonly fill: HTMLElement;
  private shown = '';

  constructor(root: HTMLElement, onTap: () => void) {
    this.el = document.createElement('button');
    this.el.type = 'button';
    this.el.className = 'rank-chip';
    this.icon = document.createElement('span');
    this.icon.className = 'rank-icon';
    this.icon.setAttribute('aria-hidden', 'true');
    this.name = document.createElement('span');
    this.name.className = 'rank-name';
    const bar = document.createElement('span');
    bar.className = 'rank-bar';
    this.fill = document.createElement('span');
    this.fill.className = 'rank-fill';
    bar.appendChild(this.fill);
    this.el.append(this.icon, this.name, bar);
    // Taps on the chip must not start the joystick.
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('click', onTap);
    // In the HUD's row, after the cash, stars and gems.
    (root.querySelector('.hud') ?? root).appendChild(this.el);
  }

  /** `title`: an earned title (a completed set's), shown in place of the rank's name. */
  update(rank: RankDef, next: { rank: RankDef; progress: number } | null, worth: number, title: string | null = null): void {
    const percent = next ? Math.floor(next.progress * 100) : 100;
    const key = `${rank.id}|${percent}|${next?.rank.id ?? ''}|${title ?? ''}`;
    if (key === this.shown) return;
    this.shown = key;
    this.icon.textContent = rank.icon;
    this.name.textContent = title ?? rank.name;
    this.el.classList.toggle('rank-titled', !!title);
    this.fill.style.width = `${percent}%`;
    this.el.setAttribute(
      'aria-label',
      next
        ? t('rankLabelNext', { rank: rank.name, worth: formatCash(worth), next: next.rank.name, at: formatCash(next.rank.netWorth) })
        : t('rankLabel', { rank: rank.name, worth: formatCash(worth) }),
    );
  }
}
