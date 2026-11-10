// Litter in the park (Chapter 3): visitors who finish a snack drop the
// wrapper or the cup where they are, less often once there are bins. The
// hero picks litter up just by walking over it (like cash), and the janitor
// sweeps it up. A messy park makes visitors a little less patient. It never
// piles up past a few pieces.
import { TUNING, type Point } from '../core/config';

const RULES = TUNING.park.litter;

export interface LitterPiece {
  at: Point;
  /** Which kind of rubbish (the game draws it): a cup, a wrapper or a floss stick. */
  kind: number;
  /** Someone is sweeping it up. */
  taken: boolean;
}

export class Litter {
  readonly pieces: LitterPiece[] = [];

  constructor(private readonly random: () => number = Math.random) {}

  /**
   * Someone finished a snack here: it lands as litter now and then (less
   * often with bins), unless the park is already as messy as it gets.
   */
  drop(at: Point, bins: boolean): LitterPiece | null {
    if (this.pieces.length >= RULES.max || this.random() >= (bins ? RULES.binChance : RULES.chance)) return null;
    const piece = { at: { x: at.x + (this.random() - 0.5) * 0.5, z: at.z + (this.random() - 0.5) * 0.5 }, kind: Math.floor(this.random() * 3), taken: false };
    this.pieces.push(piece);
    return piece;
  }

  /** Pieces within `radius` of `at`, taken off the ground. */
  pickUp(at: Point, radius: number): LitterPiece[] {
    const near = this.pieces.filter((p) => Math.hypot(p.at.x - at.x, p.at.z - at.z) <= radius);
    for (const piece of near) this.pieces.splice(this.pieces.indexOf(piece), 1);
    return near;
  }

  /** The piece nearest `at` that nobody's sweeping yet. */
  nearest(at: Point): LitterPiece | null {
    let best: LitterPiece | null = null;
    let d = Infinity;
    for (const piece of this.pieces) {
      const e = Math.hypot(piece.at.x - at.x, piece.at.z - at.z);
      if (!piece.taken && e < d) [best, d] = [piece, e];
    }
    return best;
  }

  /** Less patience in a messy park: a little per piece. */
  get patiencePenalty(): number {
    return this.pieces.length * RULES.patiencePerPiece;
  }
}
