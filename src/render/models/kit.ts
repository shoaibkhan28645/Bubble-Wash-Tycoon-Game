// Shared pieces for the code-built models (props, the Mini-Mart, building
// sites): the palette and painted signs. The big buildings are Blender
// models (art/blender), which use the same palette.
import { CanvasTexture, Mesh, MeshLambertMaterial, PlaneGeometry, SRGBColorSpace } from 'three';

export const C = {
  white: '#f6f8fb',
  pink: '#ff8fc8',
  blue: '#5bbcff',
  mint: '#7ee0c3',
  yellow: '#ffd24a',
  gold: '#ffbf3c',
  lilac: '#b79cff',
  red: '#ff5c6c',
  kerb: '#c3cad4',
  steel: '#8d98a7',
  dark: '#3b4a5e',
  wood: '#c98a52',
} as const;

const plates = new Map<string, MeshLambertMaterial>();

/**
 * A painted sign (text on a rounded board, optional bubble), facing +z.
 * Materials are cached per text, so each sign is drawn only once.
 */
export function plate(text: string, width: number, height: number, background: string, bubble = true): Mesh {
  const key = `${text}|${background}|${bubble}|${width / height}`;
  let material = plates.get(key);
  if (!material) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = Math.round((256 * height) / width);
    const ctx = canvas.getContext('2d')!;
    const h = canvas.height;
    ctx.fillStyle = background;
    ctx.beginPath();
    ctx.roundRect(4, 4, 248, h - 8, Math.min(22, h / 4));
    ctx.fill();
    const lines = text.split('\n');
    const size = Math.min(54, (h * 0.62) / lines.length, 330 / Math.max(...lines.map((l) => l.length)));
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${Math.round(size)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const textX = bubble ? 150 : 128;
    lines.forEach((line, i) => ctx.fillText(line, textX, h / 2 + (i - (lines.length - 1) / 2) * size * 1.05 + 2));
    if (bubble) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(46, h / 2, Math.min(22, h / 4), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(39, h / 2 - 7, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    material = new MeshLambertMaterial({ map: texture });
    plates.set(key, material);
  }
  return new Mesh(new PlaneGeometry(width, height), material);
}
