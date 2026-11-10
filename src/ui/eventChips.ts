// Small status chips under the top bar for what's going on in the park right
// now: a spotless park's bonus, a school trip's countdown, a festival
// weekend. The page is only touched when a chip's words change.

export class EventChips {
  private readonly row: HTMLElement;
  private readonly chips = new Map<string, { el: HTMLElement; text: string }>();

  constructor(root: HTMLElement) {
    this.row = document.createElement('div');
    this.row.className = 'event-chips';
    root.appendChild(this.row);
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
        chip.el.textContent = text;
      }
      return;
    }
    const el = document.createElement('div');
    el.className = kind ? `event-chip is-${kind}` : 'event-chip';
    el.textContent = text;
    this.row.appendChild(el);
    this.chips.set(id, { el, text });
  }
}
