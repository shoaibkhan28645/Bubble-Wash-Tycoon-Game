// The business's brand colour (the boutique's Brand tab): one paint for every staff member's polo, in
// every town, and for the farm's delivery vans and milk tanker. Models are painted where they're shared
// (each staff model's geometry, each vehicle's merged geometry), so every copy changes at once.
import type { BufferGeometry } from 'three';
import { familyPainter, type PaintFamily } from './repaint';

/** What a brand paints: a staff model's polo, a van's green livery, the tanker's dairy blue. */
export type BrandPart = 'staff' | 'van' | 'tanker';

/** A theme's paints; null for the town's own colours (the classic look). */
export interface BrandColours {
  /** The staff polos. */
  main: string;
  /** The vans' and the tanker's bodies. */
  vehicle: string;
}

const FAMILIES: Record<BrandPart, PaintFamily[]> = {
  // The team polo (art/blender/kenney_staff.py POLO #22c3c9): aqua shades; the badge's paler bubble is left.
  staff: [{ base: '#22c3c9', test: (r, g, b) => r < 90 && g > 120 && b > 120 && Math.abs(g - b) < 30 }],
  // The farm van's green cab and bands (art/blender/farm.py, #3f7a5a); the carrot's leaf is a brighter green.
  van: [{ base: '#3f7a5a', test: (r, g, b) => r < 90 && g > r + 25 && g > b + 12 && g < 150 }],
  // The milk tanker's dairy blue (#3a7fb0); the windows' pale blue is far lighter.
  tanker: [{ base: '#3a7fb0', test: (r, g, b) => r < 110 && b > g + 25 && b > r + 60 && b < 215 }],
};

const painters = new Map<BufferGeometry, { part: BrandPart; paint: (targets: (string | null)[]) => void }>();
let current: BrandColours | null = null;

function apply(part: BrandPart, paint: (targets: (string | null)[]) => void): void {
  paint([current ? (part === 'staff' ? current.main : current.vehicle) : null]);
}

/** Paints a model's geometry in the brand from now on (once per geometry; the classic look leaves it be). */
export function brandModel(geometry: BufferGeometry, part: BrandPart): void {
  if (painters.has(geometry)) return;
  const paint = familyPainter(geometry, FAMILIES[part]);
  painters.set(geometry, { part, paint });
  if (current) apply(part, paint);
}

/** The brand's colours now (null: the classic look). */
export function brandColours(): BrandColours | null {
  return current;
}

/** Repaints everything in the brand's colours (null: back to the classic look). */
export function setBrand(colours: BrandColours | null): void {
  if (colours?.main === current?.main && colours?.vehicle === current?.vehicle) return;
  current = colours;
  for (const { part, paint } of painters.values()) apply(part, paint);
}
