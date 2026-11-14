// Pictures of the boutique's things for its tiles: each hat and decoration's own model, drawn once into a
// small image (the same toy the town shows, not an emoji standing in for it).
import { Box3, Color, DirectionalLight, HemisphereLight, Mesh, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderTarget, type Object3D, type WebGLRenderer } from 'three';
import { toyMaterial } from './models/build';
import { buildDecor } from './models/decor';
import { hatGeometry } from './models/hats';

/** The picture's side in pixels: sharp in a tile's 84px circle on a dense screen. */
const SIZE = 224;
const FOV = 30;

/** What to draw: a hat by its id, or a decoration (with where its bunting runs to). */
export type ThumbSubject = { hat: string } | { decor: string; to?: { x: number; z: number } };

/** Draws things alone, lit like the towns, on a see-through background; each picture is made once and kept. */
class Thumbnails {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(FOV, 1, 0.05, 200);
  private readonly cache = new Map<string, string | null>();
  private target: WebGLRenderTarget | null = null;

  constructor(private readonly renderer: WebGLRenderer) {
    const sun = new DirectionalLight(0xfff2dd, 2.4);
    sun.position.set(2, 5, 4);
    this.scene.add(new HemisphereLight(0xffffff, 0xb9c9d6, 1.5), sun);
  }

  /** The picture as an image address (null if the thing has no model, or it couldn't be drawn). */
  of(subject: ThumbSubject): string | null {
    const key = 'hat' in subject ? `hat:${subject.hat}` : `decor:${subject.decor}`;
    let url = this.cache.get(key);
    if (url === undefined) {
      url = this.draw(subject);
      this.cache.set(key, url);
    }
    return url;
  }

  private build(subject: ThumbSubject): Object3D | null {
    if ('hat' in subject) {
      const geometry = hatGeometry(subject.hat);
      return geometry ? new Mesh(geometry, toyMaterial) : null;
    }
    // A string of bunting crosses a whole street: a short length of it shows what it is.
    const to = subject.to ? { x: 4.2, z: 0 } : undefined;
    return buildDecor(subject.decor, to ? { to } : {})?.object ?? null;
  }

  private draw(subject: ThumbSubject): string | null {
    const object = this.build(subject);
    if (!object) return null;
    const renderer = this.renderer;
    try {
      this.scene.add(object);
      object.updateMatrixWorld(true);
      const box = new Box3().setFromObject(object);
      const centre = box.getCenter(new Vector3());
      const radius = Math.max(0.05, box.getSize(new Vector3()).length() / 2);
      // From the front, a little to one side and above, far enough for the whole thing to fit.
      const distance = (radius / Math.sin((FOV * Math.PI) / 360)) * 0.92;
      this.camera.position.copy(centre).add(new Vector3(0.45, 0.42, 1).normalize().multiplyScalar(distance));
      this.camera.lookAt(centre);
      this.camera.updateProjectionMatrix();

      this.target ??= new WebGLRenderTarget(SIZE, SIZE, { samples: 4 });
      this.target.texture.colorSpace = SRGBColorSpace;
      const colour = renderer.getClearColor(scratchColour).getHex();
      const alpha = renderer.getClearAlpha();
      renderer.setRenderTarget(this.target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(this.scene, this.camera);
      const pixels = new Uint8Array(SIZE * SIZE * 4);
      renderer.readRenderTargetPixels(this.target, 0, 0, SIZE, SIZE, pixels);
      renderer.setRenderTarget(null);
      renderer.setClearColor(colour, alpha);
      return toImage(pixels);
    } catch {
      renderer.setRenderTarget(null);
      return null;
    } finally {
      this.scene.remove(object);
      // The copy made for the picture is done with (a hat's model is shared, and is drawn again when worn).
      if (!('hat' in subject)) object.traverse((node) => (node as Partial<Mesh>).geometry?.dispose());
    }
  }

}

const scratchColour = new Color();

const made = new WeakMap<WebGLRenderer, Thumbnails>();

/** The one picture-maker for a renderer (its pictures last as long as the renderer does). */
export function thumbnailsFor(renderer: WebGLRenderer): Thumbnails {
  let thumbnails = made.get(renderer);
  if (!thumbnails) made.set(renderer, (thumbnails = new Thumbnails(renderer)));
  return thumbnails;
}

/** GL pixels (bottom row first, colour already multiplied by its see-through-ness) as a PNG address. */
function toImage(pixels: Uint8Array): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const image = context.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) {
    const from = (SIZE - 1 - y) * SIZE * 4;
    const to = y * SIZE * 4;
    for (let x = 0; x < SIZE * 4; x += 4) {
      const a = pixels[from + x + 3]!;
      const k = a > 0 ? 255 / a : 0;
      image.data[to + x] = Math.min(255, pixels[from + x]! * k);
      image.data[to + x + 1] = Math.min(255, pixels[from + x + 1]! * k);
      image.data[to + x + 2] = Math.min(255, pixels[from + x + 2]! * k);
      image.data[to + x + 3] = a;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}
