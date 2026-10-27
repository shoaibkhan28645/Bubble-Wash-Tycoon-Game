import { formatCash } from '../systems/economy';

export interface UpgradeRow {
  key: string;
  title: string;
  effect: string;
  level: number;
  max: number;
  cost: number;
}

/**
 * Bottom-sheet pop-up listing a station's upgrades (GDD: pop-ups only for
 * hires, upgrades and rewards). Closes with ✕, Esc, or by walking away.
 */
export class UpgradePanel {
  private readonly el: HTMLElement;
  private readonly title: HTMLElement;
  private readonly list: HTMLElement;
  private rows: () => UpgradeRow[] = () => [];
  private cash: () => number = () => 0;
  private lastRender = '';
  openId: string | null = null;

  constructor(
    root: HTMLElement,
    private readonly onBuy: (key: string) => void,
    private readonly onClose: () => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'upgrade-panel';
    this.el.setAttribute('role', 'dialog');
    this.el.hidden = true;
    const header = document.createElement('div');
    header.className = 'upgrade-header';
    this.title = document.createElement('h2');
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'upgrade-close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '✕';
    close.addEventListener('click', () => this.close());
    header.append(this.title, close);
    this.list = document.createElement('div');
    this.list.className = 'upgrade-list';
    this.el.append(header, this.list);
    // Taps on the panel must not start the joystick.
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.list.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-key]');
      if (button && !button.disabled) this.onBuy(button.dataset.key!);
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.openId) this.close();
    });
    root.appendChild(this.el);
  }

  open(id: string, title: string, rows: () => UpgradeRow[], cash: () => number): void {
    this.openId = id;
    this.title.textContent = title;
    this.rows = rows;
    this.cash = cash;
    this.lastRender = '';
    this.el.hidden = false;
    this.refresh();
  }

  close(): void {
    if (!this.openId) return;
    this.openId = null;
    this.el.hidden = true;
    this.onClose();
  }

  /** Re-renders only when levels, costs or affordability change. */
  refresh(): void {
    if (!this.openId) return;
    const cash = this.cash();
    const rows = this.rows();
    const signature = rows.map((r) => `${r.key}:${r.level}:${r.cost}:${cash >= r.cost}`).join('|');
    if (signature === this.lastRender) return;
    this.lastRender = signature;
    this.list.replaceChildren(
      ...rows.map((row) => {
        const item = document.createElement('div');
        item.className = 'upgrade-row';
        const text = document.createElement('div');
        text.className = 'upgrade-text';
        const name = document.createElement('strong');
        name.textContent = row.title;
        const effect = document.createElement('span');
        effect.textContent = row.effect;
        const pips = document.createElement('span');
        pips.className = 'upgrade-level';
        pips.textContent = `Lv ${row.level}/${row.max}`;
        text.append(name, effect, pips);
        const buy = document.createElement('button');
        buy.type = 'button';
        buy.dataset.key = row.key;
        const maxed = row.level >= row.max;
        buy.disabled = maxed || cash < row.cost;
        buy.textContent = maxed ? 'MAX' : `⬆ ${formatCash(row.cost)}`;
        item.append(text, buy);
        return item;
      }),
    );
  }
}
