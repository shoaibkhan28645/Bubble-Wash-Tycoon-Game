// Repaints colour families on vertex-painted models (the hero's suit, the staff's polos, the farm's vans).
// The Blender models carry their shading baked into the vertex colours: every shade of one paint is a
// "family". Each vertex is matched to its family once, and repainted as the new colour at the same
// brightness next to the family's own colour, so the folds and shadows stay.
import { Color, type BufferAttribute, type BufferGeometry } from 'three';

/** A paint on a model: which vertex colours (sRGB, 0–255) are its shades, and the paint itself. */
export interface PaintFamily {
  test: (r: number, g: number, b: number) => boolean;
  base: string;
}

const luminance = (c: Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

/**
 * Reads a geometry's vertex colours once and returns its painter: given a colour for each family (null
 * keeps that family as it was painted), it repaints them in place. Families are tried in order; the
 * first that matches a vertex has it.
 */
export function familyPainter(geometry: BufferGeometry, families: readonly PaintFamily[]): (targets: readonly (string | null | undefined)[]) => void {
  const colors = geometry.getAttribute('color') as BufferAttribute | undefined;
  if (!colors) return () => {};
  const count = colors.count;
  /** Each vertex's family, 1-based (0: none). */
  const family = new Uint8Array(count);
  /** Its brightness next to its family's own colour (1 = the paint itself). */
  const shade = new Float32Array(count);
  const original = new Float32Array(count * 3);
  const baseLum = families.map((f) => luminance(new Color(f.base)));
  const c = new Color();
  const srgb = new Color();
  for (let i = 0; i < count; i++) {
    c.setRGB(colors.getX(i), colors.getY(i), colors.getZ(i));
    original[i * 3] = c.r;
    original[i * 3 + 1] = c.g;
    original[i * 3 + 2] = c.b;
    srgb.copy(c).convertLinearToSRGB();
    const f = families.findIndex((fam) => fam.test(srgb.r * 255, srgb.g * 255, srgb.b * 255));
    if (f < 0) continue;
    family[i] = f + 1;
    shade[i] = luminance(c) / baseLum[f]!;
  }
  const target = families.map(() => new Color());
  return (targets) => {
    families.forEach((_, f) => {
      const t = targets[f];
      if (t) target[f]!.set(t);
    });
    for (let i = 0; i < count; i++) {
      const f = family[i]!;
      if (f === 0) continue;
      const t = targets[f - 1];
      if (!t) {
        colors.setXYZ(i, original[i * 3]!, original[i * 3 + 1]!, original[i * 3 + 2]!);
        continue;
      }
      const to = target[f - 1]!;
      const k = shade[i]!;
      colors.setXYZ(i, Math.min(1, to.r * k), Math.min(1, to.g * k), Math.min(1, to.b * k));
    }
    colors.needsUpdate = true;
  };
}
