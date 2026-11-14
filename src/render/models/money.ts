// The game's money: green banknotes, bundled with a sunny paper band (the cash piles), and loose notes
// (the ones that fly to the player and into pads). No currency is printed on them: just a frame and two
// round seals, like the green note icon the interface uses.
import type { BufferGeometry } from 'three';
import { box, cylinder, mergeParts, type Part } from './build';

/** A bundle's size (metres): what a pile stacks, four to a layer. */
export const BUNDLE = { width: 0.44, height: 0.1, depth: 0.26 } as const;

const DARK = '#3fae5f';
const MID = '#5cc977';
const FACE = '#8be6a0';
const PRINT = '#2f9e57';
const SEAL = '#d9f8df';
const BAND = '#ffd24a';
const BAND_EDGE = '#e0a800';

/** The printing on a note's face (`y`: its top): a frame round the edge and a round seal at each end. */
function print(w: number, d: number, y: number): Part[] {
  const line = 0.008;
  const inset = 0.03;
  return [
    { geometry: box(w - inset * 2, 0.004, line), color: PRINT, y, z: d / 2 - inset },
    { geometry: box(w - inset * 2, 0.004, line), color: PRINT, y, z: -(d / 2 - inset) },
    { geometry: box(line, 0.004, d - inset * 2), color: PRINT, y, x: w / 2 - inset },
    { geometry: box(line, 0.004, d - inset * 2), color: PRINT, y, x: -(w / 2 - inset) },
    ...[-1, 1].flatMap((side): Part[] => [
      { geometry: cylinder(0.046, 0.004, 14), color: PRINT, y, x: side * w * 0.3 },
      { geometry: cylinder(0.034, 0.006, 14), color: SEAL, y: y + 0.001, x: side * w * 0.3 },
    ]),
  ];
}

let bundle: BufferGeometry | null = null;

/** A bundle of notes: a few sheets a little out of line (their edges show as stripes), a paper band round the middle. */
export function bundleGeometry(): BufferGeometry {
  if (bundle) return bundle;
  const { width: w, height: h, depth: d } = BUNDLE;
  const sheet = (h - 0.012) / 3;
  const parts: Part[] = [
    { geometry: box(w, sheet, d), color: DARK, y: -h / 2 + sheet / 2, ry: 0.025 },
    { geometry: box(w, sheet, d), color: MID, y: -h / 2 + sheet * 1.5, ry: -0.02, x: 0.006 },
    { geometry: box(w, sheet, d), color: DARK, y: -h / 2 + sheet * 2.5, ry: 0.012, x: -0.004 },
    // The top note, a lighter green, with its printing.
    { geometry: box(w, 0.012, d), color: FACE, y: h / 2 - 0.006 },
    ...print(w, d, h / 2 + 0.002),
    // The band: a touch bigger than the stack, so it wraps it; a darker line along each edge.
    { geometry: box(0.09, h + 0.012, d + 0.014), color: BAND },
    { geometry: box(0.094, 0.006, d + 0.016), color: BAND_EDGE, y: h / 2 + 0.004 },
  ];
  bundle = mergeParts(parts);
  return bundle;
}

let note: BufferGeometry | null = null;

/** One note on its own, folded a little (it flies, turning, from a pile to the player or into a pad). */
export function noteGeometry(): BufferGeometry {
  if (note) return note;
  const w = 0.42;
  const d = 0.24;
  const t = 0.018;
  note = mergeParts([
    { geometry: box(w / 2, t, d), color: FACE, x: -w / 4, rz: 0.12, y: 0.012 },
    { geometry: box(w / 2, t, d), color: MID, x: w / 4, rz: -0.12, y: 0.012 },
    { geometry: box(0.07, t + 0.012, d + 0.008), color: BAND },
    ...[-1, 1].map((side): Part => ({ geometry: cylinder(0.035, 0.006, 12), color: SEAL, x: side * w * 0.28, y: 0.034 })),
  ]);
  return note;
}
