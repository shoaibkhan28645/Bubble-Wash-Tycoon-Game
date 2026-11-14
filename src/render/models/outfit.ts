// Repaints the hero's suit for the boutique's outfits (art/blender/kenney_tycoon.py paints it): every navy,
// red or white vertex is one of the suit's, the tie's or the shirt's shades.
import type { BufferGeometry, Mesh } from 'three';
import { familyPainter } from '../repaint';

/** The colours to paint: the suit (jacket and trousers), the tie, the shirt. */
export interface OutfitColours {
  suit: string;
  tie: string;
  shirt?: string;
}

/**
 * Gets a mesh ready to be repainted (it gets its own copy of the geometry, so other copies of the model
 * keep their paint) and returns the painter. `base` is the colour of each family as the model is painted.
 */
export function outfitPainter(mesh: Mesh, base: Required<OutfitColours>): (outfit: OutfitColours) => void {
  const geometry = (mesh.geometry as BufferGeometry).clone();
  mesh.geometry = geometry;
  const paint = familyPainter(geometry, [
    // Navy: blue clearly over red, and dark (the shoes and glasses are near-grey, the skin warm).
    { base: base.suit, test: (r, _g, b) => b - r > 18 && r < 80 && b < 130 },
    // Red: the tie (skin has far more green).
    { base: base.tie, test: (r, g, b) => r > 140 && g < 75 && b < 80 },
    // White: the shirt.
    { base: base.shirt, test: (r, g, b) => Math.min(r, g, b) > 195 && Math.max(r, g, b) - Math.min(r, g, b) < 24 },
  ]);
  return (outfit) => paint([outfit.suit, outfit.tie, outfit.shirt ?? base.shirt]);
}
