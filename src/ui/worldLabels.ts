import { Vector3, type PerspectiveCamera } from 'three';

interface Label {
  el: HTMLElement;
  at: Vector3;
  visible: boolean;
  /** What's on the page now, so unchanged labels aren't touched (style writes are slow on phones). */
  shownAs: boolean | null;
  x: number;
  y: number;
  /** Kept fully on screen (sideways), e.g. the tutorial's words; its measured width, once known. */
  clamp: boolean;
  width: number | null;
  height: number | null;
  /**
   * Off the screen it's drawn small at the screen's edge, on the line towards it (`is-edge`, `data-side`), kept
   * clear of the other labels there and of `keepOut`; on screen, kept fully on it sideways. (A gate's clock.)
   */
  edge: boolean;
  /** Its size drawn small at the edge, once measured. */
  edgeSize: { w: number; h: number } | null;
  /** The side of the screen it's at the edge of ('' while it's on the screen). */
  side: string;
  /** Fades while it's over the hero, so it never hides them. */
  fade: boolean;
  faded: boolean;
  /** On the screen, moved up or down as little as it takes to keep clear of the other such labels and of `keepOut`. */
  avoid: boolean;
  /**
   * Which of those gives way: a higher rank is placed after (and so moves for) a lower one, whatever their heights
   * on the screen. (A gate's "Gate closed" moves for its plane's label, never the other way round.)
   */
  rank: number;
  /** How far it's been moved (pixels, down positive): where it was put last, and where it's easing to now. */
  moved: number;
  movedTo: number;
}

/** A box on the screen (CSS pixels, its centre and half sizes). */
interface Box {
  x: number;
  y: number;
  hw: number;
  hh: number;
}

/** What the labels keep clear of: the HUD along the top, the side buttons, the hero, other things at the edges. */
interface LabelFrame {
  top: number;
  right: number;
  /** Boxes the edge labels keep clear of (the arrows to the next thing to do, the event chips). */
  keepOut: readonly Box[];
  /** The hero, whose labels fade while over them. */
  hero: Vector3 | null;
}

/** Space kept between a clamped label and the screen's edge. */
const EDGE_PX = 6;
/** Space kept between a label at the screen's edge and the edge (room for its arrow pointing out). */
const OUT_PX = 14;
/** Space kept between two labels at the screen's edge. */
const GAP_PX = 10;
const NO_FRAME: LabelFrame = { top: 0, right: 0, keepOut: [], hero: null };
/** A label that's moved keeps to the same place while that's still clear, unless one this much nearer opens up. */
const STAY_PX = 28;
/** How much of the way to its new place a moved label goes each frame (it glides there rather than jumping). */
const GLIDE = 0.25;

const overlaps = (a: Box, b: Box): boolean => Math.abs(a.x - b.x) < a.hw + b.hw && Math.abs(a.y - b.y) < a.hh + b.hh;

/** HTML elements pinned to 3D points (sharp text at any screen density). */
export class WorldLabels {
  private readonly layer: HTMLElement;
  private readonly labels = new Set<Label>();
  private readonly p = new Vector3();
  private readonly atEdge: { label: Label; box: Box; side: string; along: number }[] = [];
  private readonly placed: Box[] = [];
  private readonly floating: { label: Label; box: Box }[] = [];

  constructor(root: HTMLElement) {
    this.layer = document.createElement('div');
    this.layer.className = 'world-labels';
    root.appendChild(this.layer);
  }

  add(el: HTMLElement, at: Vector3, clamp = false): Label {
    const label: Label = { el, at, visible: true, shownAs: null, x: NaN, y: NaN, clamp, width: null, height: null, edge: false, edgeSize: null, side: '', fade: false, faded: false, avoid: false, rank: 0, moved: 0, movedTo: 0 };
    el.classList.add('world-label');
    this.layer.appendChild(el);
    this.labels.add(label);
    return label;
  }

  /** A clamped label's text changed: measure it again. */
  remeasure(label: Label): void {
    label.width = null;
    label.height = null;
    label.edgeSize = null;
    label.x = NaN;
  }

  remove(label: Label): void {
    label.el.remove();
    this.labels.delete(label);
  }

  update(camera: PerspectiveCamera, width: number, height: number, frame: LabelFrame = NO_FRAME): void {
    this.atEdge.length = 0;
    this.floating.length = 0;
    let hero: Box | null = null;
    if (frame.hero) {
      // (The hero's feet and the top of their head, a little round them.)
      this.p.set(frame.hero.x, frame.hero.y, frame.hero.z).project(camera);
      const feet = ((1 - this.p.y) * height) / 2;
      const x = ((this.p.x + 1) * width) / 2;
      this.p.set(frame.hero.x, frame.hero.y + 2.1, frame.hero.z).project(camera);
      const head = ((1 - this.p.y) * height) / 2;
      hero = { x, y: (feet + head) / 2, hw: 22, hh: Math.abs(feet - head) / 2 + 8 };
    }
    // The play area's middle: an edge label sits where the line from it to its point leaves the screen.
    const right = width - frame.right;
    const cx = right / 2;
    const cy = (frame.top + height) / 2;
    for (const label of this.labels) {
      this.p.copy(label.at).project(camera);
      const behind = this.p.z >= 1;
      let x = Math.round((this.p.x + 1) * width) / 2;
      let y = Math.round((1 - this.p.y) * height) / 2;
      const off = behind || x < 0 || x > right || y < frame.top || y > height;
      const edge = label.edge && label.visible && off;
      // (One that keeps clear of the others isn't brought onto the screen from off it: it'd be nowhere near its point.)
      const show = label.visible && (edge || !behind) && !(label.avoid && !label.edge && off);
      if (show !== label.shownAs) {
        label.el.style.display = show ? '' : 'none';
        label.shownAs = show;
      }
      if (!show) continue;
      if (edge) {
        // (Behind the camera, the projection flips: towards the other way.)
        if (behind) {
          x = 2 * cx - x;
          y = 2 * cy - y;
        }
        this.toEdge(label, x - cx, y - cy, cx, cy, right, frame.top, height);
        continue;
      }
      if (label.side !== '') this.setSide(label, '');
      if (label.clamp || label.edge) {
        label.width ??= label.el.offsetWidth;
        const half = label.width / 2 + EDGE_PX;
        x = Math.min(Math.max(x, half), width - half);
      }
      if (label.avoid || label.fade) {
        label.width ??= label.el.offsetWidth;
        label.height ??= label.el.offsetHeight;
      }
      if (label.avoid) {
        this.floating.push({ label, box: { x, y, hw: label.width! / 2, hh: label.height! / 2 } });
        continue;
      }
      this.fadeOver(label, hero, x, y);
      this.place(label, x, y);
    }
    // The labels that keep clear of each other: by rank, then from the top down, each as near its point as it can
    // be (or where it was moved to before, while that's still clear), gliding there.
    this.placed.length = 0;
    for (const k of frame.keepOut) this.placed.push(k);
    if (this.floating.length > 0) {
      this.floating.sort((a, b) => a.label.rank - b.label.rank || a.box.y - b.box.y);
      for (const { label, box } of this.floating) {
        const want = box.y;
        const at = this.settle(box, false, frame.top + box.hh + EDGE_PX, height - box.hh - EDGE_PX, want, want + label.movedTo);
        label.movedTo = Number.isNaN(at) ? 0 : at - want;
        label.moved += (label.movedTo - label.moved) * GLIDE;
        if (Math.abs(label.movedTo - label.moved) < 0.5) label.moved = label.movedTo;
        box.y = want + label.moved;
        this.placed.push({ ...box, y: want + label.movedTo });
        const x = Math.round(box.x * 2) / 2;
        const y = Math.round(box.y * 2) / 2;
        this.fadeOver(label, hero, x, y);
        this.place(label, x, y);
      }
    }
    this.stackEdges(right, frame.top, height);
  }

  /** A label over the hero fades (if it does). */
  private fadeOver(label: Label, hero: Box | null, x: number, y: number): void {
    if (!label.fade) return;
    const over = hero !== null && overlaps(hero, { x, y, hw: label.width! / 2, hh: label.height! / 2 });
    if (over === label.faded) return;
    label.faded = over;
    label.el.classList.toggle('is-faded', over);
  }

  /**
   * Where along one way (`sideways`: across; else up and down) `box` is clear of everything placed, as near `want`
   * as it can be between `min` and `max`: there, or just past one of them; NaN if nowhere.
   */
  private settle(box: Box, sideways: boolean, min: number, max: number, want: number, stay = want): number {
    const half = sideways ? box.hw : box.hh;
    let best = NaN;
    let bestCost = Infinity;
    const test: Box = { x: box.x, y: box.y, hw: box.hw, hh: box.hh };
    const tryAt = (at: number): void => {
      if (at < min || at > max) return;
      // (Staying put counts as nearer by STAY_PX, so a label doesn't hop between above and below.)
      const cost = Math.abs(at - want) - (at === stay && stay !== want ? STAY_PX : 0);
      if (cost >= bestCost) return;
      if (sideways) {
        test.x = at;
        test.hw = box.hw + GAP_PX / 2;
      } else {
        test.y = at;
        test.hh = box.hh + GAP_PX / 2;
      }
      for (const o of this.placed) if (overlaps(test, o)) return;
      best = at;
      bestCost = cost;
    };
    tryAt(want);
    if (stay !== want) tryAt(stay);
    for (const o of this.placed) {
      const c = sideways ? o.x : o.y;
      const r = (sideways ? o.hw : o.hh) + half + GAP_PX;
      tryAt(c - r);
      tryAt(c + r);
    }
    return best;
  }

  /** Off the screen: drawn small where the line from the middle towards it meets the edge. */
  private toEdge(label: Label, dx: number, dy: number, cx: number, cy: number, right: number, top: number, bottom: number): void {
    const wasSide = label.side;
    // (Small first, then measured: the side's only a guess till then.)
    if (wasSide === '') this.setSide(label, dx < 0 ? 'left' : 'right');
    if (label.faded) {
      label.faded = false;
      label.el.classList.remove('is-faded');
    }
    label.edgeSize ??= { w: label.el.offsetWidth, h: label.el.offsetHeight };
    const hw = label.edgeSize.w / 2 + OUT_PX;
    const hh = label.edgeSize.h / 2 + OUT_PX;
    const left = hw;
    const rightEdge = right - hw;
    const topEdge = top + hh;
    const bottomEdge = bottom - hh;
    const tx = dx ? (dx > 0 ? rightEdge - cx : left - cx) / dx : Infinity;
    const ty = dy ? (dy > 0 ? bottomEdge - cy : topEdge - cy) / dy : Infinity;
    const t = Math.max(0, Math.min(tx, ty));
    const side = tx <= ty ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'top' : 'bottom';
    if (side !== label.side) this.setSide(label, side);
    const x = cx + dx * t;
    const y = cy + dy * t;
    const along = side === 'left' || side === 'right' ? y : x;
    this.atEdge.push({ label, box: { x, y, hw: label.edgeSize.w / 2, hh: label.edgeSize.h / 2 }, side, along });
  }

  /**
   * The labels at the edges, each nearest where it'd be clear of the others there and of what's placed: moved along
   * its side, one way or the other, as little as it takes; with nowhere clear along it (a row of chips right across
   * the top), moved in from the edge past what's in the way, and tried along again.
   */
  private stackEdges(right: number, top: number, bottom: number): void {
    if (this.atEdge.length === 0) return;
    this.atEdge.sort((a, b) => (a.side === b.side ? a.along - b.along : a.side < b.side ? -1 : 1));
    for (const item of this.atEdge) {
      const { box, side } = item;
      const sideways = side === 'top' || side === 'bottom';
      const half = sideways ? box.hw : box.hh;
      const min = sideways ? half + OUT_PX : top + half + OUT_PX;
      const max = sideways ? right - half - OUT_PX : bottom - half - OUT_PX;
      const want = sideways ? box.x : box.y;
      for (let round = 0; round < 4; round++) {
        const at = this.settle(box, sideways, min, max, want);
        if (!Number.isNaN(at)) {
          if (sideways) box.x = at;
          else box.y = at;
          break;
        }
        // Nowhere along the edge: in past whatever's in the way where it wants to be.
        if (sideways) box.x = Math.min(Math.max(want, min), max);
        else box.y = Math.min(Math.max(want, min), max);
        let inward = 0;
        for (const o of this.placed) {
          if (!overlaps(box, o)) continue;
          if (side === 'top') inward = Math.max(inward, o.y + o.hh + box.hh + GAP_PX - box.y);
          else if (side === 'bottom') inward = Math.max(inward, box.y - (o.y - o.hh - box.hh - GAP_PX));
          else if (side === 'left') inward = Math.max(inward, o.x + o.hw + box.hw + GAP_PX - box.x);
          else inward = Math.max(inward, box.x - (o.x - o.hw - box.hw - GAP_PX));
        }
        if (inward <= 0) break;
        if (side === 'top') box.y += inward;
        else if (side === 'bottom') box.y -= inward;
        else if (side === 'left') box.x += inward;
        else box.x -= inward;
      }
      this.placed.push(box);
      this.place(item.label, Math.round(box.x * 2) / 2, Math.round(box.y * 2) / 2);
    }
  }

  private setSide(label: Label, side: string): void {
    label.side = side;
    label.el.classList.toggle('is-edge', side !== '');
    if (side) label.el.dataset.side = side;
    else delete label.el.dataset.side;
    label.x = NaN;
  }

  private place(label: Label, x: number, y: number): void {
    if (x === label.x && y === label.y) return;
    label.x = x;
    label.y = y;
    label.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
  }
}

export type { Box, Label, LabelFrame };
