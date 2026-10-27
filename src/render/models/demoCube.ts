import { BoxGeometry, Color, Float32BufferAttribute, Mesh, MeshLambertMaterial } from 'three';

/** Candy palette, one colour per face pair (+x/-x, +y/-y, +z/-z). */
const FACE_COLORS = [0xff8fc8, 0xff8fc8, 0xffd85c, 0xffd85c, 0x7ee0c3, 0x7ee0c3];

/** Milestone 1 placeholder: a flat vertex-coloured cube. */
export function createDemoCube(size = 1.2): { mesh: Mesh; radius: number } {
  const geometry = new BoxGeometry(size, size, size);
  const colors: number[] = [];
  const color = new Color();
  // BoxGeometry has 4 vertices per face, faces in +x, -x, +y, -y, +z, -z order.
  for (const hex of FACE_COLORS) {
    color.setHex(hex);
    for (let v = 0; v < 4; v++) colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));

  const mesh = new Mesh(geometry, new MeshLambertMaterial({ vertexColors: true }));
  return { mesh, radius: (size * Math.sqrt(3)) / 2 };
}
