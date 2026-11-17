// Small status chips under the top bar for what's going on in the park right
// now: a spotless park's bonus, a school trip's countdown, a festival
// weekend. The page is only touched when a chip's words change.
import { setRich } from './icons';
import type { Box } from './worldLabels';

export class EventChips {
  private readonly row: HTMLElement;
  private readonly chips = new Map<string, { el: HTMLElement; text: string }>();

  constructor(root: HTMLElement) {
    this.row = document.createElement('div');
    this.row.className = 'event-chips';
    root.appendChild(this.row);
  }

  /** Where the chips are on the screen, relative to `origin`'s top left (the labels at the edges keep clear of them). */
  boxes(origin: DOMRect, out: Box[]): void {
    for (const { el } of this.chips.values()) {
      const r = el.getBoundingClientRect();
      if (r.width > 0) out.push({ x: r.left - origin.left + r.width / 2, y: r.top - origin.top + r.height / 2, hw: r.width / 2, hh: r.height / 2 });
    }
  }

  /** Shows chip `id` with `text`, or takes it away (null). */
  set(id: string, text: string | null, kind = ''): void {
    const chip = this.chips.get(id);
    if (text === null) {
      if (chip) {
        chip.el.remove();
        this.chips.delete(id);
      }
      return;
    }
    if (chip) {
      if (chip.text !== text) {
        chip.text = text;
        setRich(chip.el, text);
      }
      return;
    }
    const el = document.createElement('div');
    el.className = kind ? `event-chip is-${kind}` : 'event-chip';
    setRich(el, text);
    this.row.appendChild(el);
    this.chips.set(id, { el, text });
  }
}
