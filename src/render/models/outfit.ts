// Repaints the hero's suit for the boutique's outfits. The hero's model is painted in vertex colours with
// shading baked in (art/blender/kenney_tycoon.py): every navy, red or white vertex is one of the suit's,
// the tie's or the shirt's shades. Each is matched to its colour family once, and repainted as the new
// colour at the same brightness relative to the family's own colour, so the folds and shadows stay.
import { Color, type BufferAttribute, type BufferGeometry, type Mesh } from 'three';

/** The colours to paint: the suit (jacket and trousers), the tie, the shirt. */
export interface OutfitColours {
  suit: string;
  tie: string;
  shirt?: string;
}

/** The colour families a vertex can belong to (the codebase uses no enums). */
const Family = { None: 0, Suit: 1, Tie: 2, Shirt: 3 } as const;
type Family = (typeof Family)[keyof typeof Family];

/** Which family an sRGB colour (0–255) is a shade of; skin, hair, shoes, glasses and the gold watch are none. */
function family(r: number, g: number, b: number): Family {
  // Navy: blue clearly over red, and dark (the shoes and glasses are near-grey, the skin warm).
  if (b - r > 18 && r < 80 && b < 130) return Family.Suit;
  // Red: the tie (skin has far more green).
  if (r > 140 && g < 75 && b < 80) return Family.Tie;
  // White: the shirt.
  if (Math.min(r, g, b) > 195 && Math.max(r, g, b) - Math.min(r, g, b) < 24) return Family.Shirt;
  return Family.None;
}

const luminance = (c: Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

/**
 * Gets a mesh ready to be repainted (it gets its own copy of the geometry, so other copies of the model
 * keep their paint) and returns the painter. `base` is the colour of each family as the model is painted.
 */
export function outfitPainter(mesh: Mesh, base: Required<OutfitColours>): (outfit: OutfitColours) => void {
  const geometry = (mesh.geometry as BufferGeometry).clone();
  mesh.geometry = geometry;
  const colors = geometry.getAttribute('color') as BufferAttribute | undefined;
  if (!colors) return () => {};
  const count = colors.count;
  const families = new Uint8Array(count);
  /** Each vertex's brightness next to its family's own colour (1 = the family's colour itself). */
  const shade = new Float32Array(count);
  const original = new Float32Array(count * 3);
  const baseLum = [0, luminance(new Color(base.suit)), luminance(new Color(base.tie)), luminance(new Color(base.shirt))];
  const c = new Color();
  const srgb = new Color();
  for (let i = 0; i < count; i++) {
    c.setRGB(colors.getX(i), colors.getY(i), colors.getZ(i));
    original.set([c.r, c.g, c.b], i * 3);
    srgb.copy(c).convertLinearToSRGB();
    const f = family(srgb.r * 255, srgb.g * 255, srgb.b * 255);
    families[i] = f;
    if (f !== Family.None) shade[i] = luminance(c) / baseLum[f]!;
  }
  const target = [new Color(), new Color(), new Color(), new Color()];
  return (outfit) => {
    target[Family.Suit]!.set(outfit.suit);
    target[Family.Tie]!.set(outfit.tie);
    target[Family.Shirt]!.set(outfit.shirt ?? base.shirt);
    for (let i = 0; i < count; i++) {
      const f = families[i]!;
      if (f === Family.None) {
        colors.setXYZ(i, original[i * 3]!, original[i * 3 + 1]!, original[i * 3 + 2]!);
        continue;
      }
      const t = target[f]!;
      const k = shade[i]!;
      colors.setXYZ(i, Math.min(1, t.r * k), Math.min(1, t.g * k), Math.min(1, t.b * k));
    }
    colors.needsUpdate = true;
  };
}
