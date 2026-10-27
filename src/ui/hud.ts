import { formatCash } from '../systems/economy';

const COIN_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#ffd85c" stroke="#e0a800" stroke-width="2"/><text x="12" y="16.5" text-anchor="middle" font-size="12" font-weight="700" fill="#b07a00">$</text></svg>`;

/** Cash counter at the top. Counts up smoothly and bumps when cash arrives. */
export class Hud {
  private readonly amount: HTMLElement;
  private readonly pill: HTMLElement;
  private readonly starText: HTMLElement;
  private lastStars = '';
  private shown = 0;
  private last = '';

  constructor(root: HTMLElement, cash: number) {
    const hud = document.createElement('div');
    hud.className = 'hud';
    this.pill = document.createElement('div');
    this.pill.className = 'cash-pill';
    this.pill.innerHTML = COIN_SVG;
    this.amount = document.createElement('span');
    this.amount.className = 'cash-amount';
    this.pill.appendChild(this.amount);
    const stars = document.createElement('div');
    stars.className = 'stars-pill';
    stars.innerHTML = '<span class="star-icon" aria-hidden="true">★</span>';
    this.starText = document.createElement('span');
    stars.appendChild(this.starText);
    hud.append(this.pill, stars);
    root.appendChild(hud);
    this.shown = cash;
    this.render();
  }

  update(dt: number, cash: number, stars: number): void {
    const starText = stars.toFixed(1);
    if (starText !== this.lastStars) {
      this.starText.textContent = starText;
      this.lastStars = starText;
    }
    if (cash > this.shown + 0.5) {
      this.shown += Math.max(1, (cash - this.shown) * Math.min(1, dt * 8));
      this.bump();
    } else {
      this.shown = cash;
    }
    this.render();
  }

  private bump(): void {
    this.pill.classList.remove('bump');
    // Restart the CSS animation.
    void this.pill.offsetWidth;
    this.pill.classList.add('bump');
  }

  private render(): void {
    const text = formatCash(Math.min(this.shown, Number.MAX_SAFE_INTEGER));
    if (text !== this.last) {
      this.amount.textContent = text;
      this.last = text;
    }
  }
}
