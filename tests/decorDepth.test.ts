// No decoration has two surfaces of different colours in the same place, facing the same way: they'd fight over
// which is drawn and flicker as the camera moves (the gold trim on the marble plinths did).
import { describe, expect, it } from 'vitest';
import { Mesh, Vector3, type BufferGeometry } from 'three';
import { DECOR_MODELS, buildDecor } from '../src/render/models/decor';

/** Two faces this close (m), facing the same way, count as level with each other. */
const TOL = 0.004;
/** Overlapping by more than this (m²) counts (touching along an edge doesn't). */
const MIN_AREA = 2e-4;

interface Face {
  /** Where its plane is along the axis it faces, and its corners across the other two. */
  at: number;
  corners: [number, number][];
  colour: string;
}

/** The area two convex polygons share (clipping one by the other). */
function sharedArea(a: [number, number][], b: [number, number][]): number {
  const area = (p: [number, number][]): number => p.reduce((s, q, i) => s + q[0] * p[(i + 1) % p.length]![1] - p[(i + 1) % p.length]![0] * q[1], 0) / 2;
  const clip = area(b) < 0 ? [...b].reverse() : b;
  let out = area(a) < 0 ? [...a].reverse() : a;
  for (let i = 0; i < clip.length && out.length > 0; i++) {
    const [ax, ay] = clip[i]!;
    const [bx, by] = clip[(i + 1) % clip.length]!;
    const side = (p: [number, number]) => (bx - ax) * (p[1] - ay) - (by - ay) * (p[0] - ax);
    const next: [number, number][] = [];
    out.forEach((p, j) => {
      const q = out[(j + 1) % out.length]!;
      const sp = side(p);
      const sq = side(q);
      if (sp >= 0) next.push(p);
      if (sp * sq < 0) {
        const k = sp / (sp - sq);
        next.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]);
      }
    });
    out = next;
  }
  return out.length < 3 ? 0 : Math.abs(area(out));
}

/** Every face of the decoration lying flat along one of the six directions, by direction. */
function faces(id: string): Map<string, Face[]> {
  const built = buildDecor(id, { to: { x: 4, z: 0 } })!;
  built.object.updateMatrixWorld(true);
  const byWay = new Map<string, Face[]>();
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const n = new Vector3();
  built.object.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const geometry = node.geometry as BufferGeometry;
    const pos = geometry.getAttribute('position');
    const col = geometry.getAttribute('color');
    const index = geometry.index;
    const count = index ? index.count : pos.count;
    for (let i = 0; i < count; i += 3) {
      const [ia, ib, ic] = [0, 1, 2].map((k) => (index ? index.getX(i + k) : i + k)) as [number, number, number];
      a.fromBufferAttribute(pos, ia).applyMatrix4(node.matrixWorld);
      b.fromBufferAttribute(pos, ib).applyMatrix4(node.matrixWorld);
      c.fromBufferAttribute(pos, ic).applyMatrix4(node.matrixWorld);
      n.subVectors(b, a).cross(new Vector3().subVectors(c, a));
      if (n.lengthSq() < 1e-12) continue;
      n.normalize();
      const axis = (['x', 'y', 'z'] as const).find((k) => Math.abs(n[k]) > 0.995);
      if (!axis) continue;
      const [u, v] = (['x', 'y', 'z'] as const).filter((k) => k !== axis);
      const colour = col ? [col.getX(ia), col.getY(ia), col.getZ(ia)].map((x) => x.toFixed(3)).join(',') : `${node.id}`;
      const way = `${axis}${n[axis] > 0 ? '+' : '-'}`;
      // (Underneath: the camera's always above, looking down.)
      if (way === 'y-') continue;
      const list = byWay.get(way) ?? [];
      // (How far its plane is along its own facing: a tilted model's faces are tilted too.)
      list.push({ at: n.dot(a) * Math.sign(n[axis]), corners: [a, b, c].map((p) => [p[u!], p[v!]] as [number, number]), colour });
      byWay.set(way, list);
    }
  });
  return byWay;
}

describe('decorations have no surfaces fighting for the same place', () => {
  // (The statue's figure is the hero's model, loaded in the game; its plinth is everyone else's.)
  for (const id of DECOR_MODELS.filter((d) => d !== 'statue')) {
    it(id, () => {
      const fights: string[] = [];
      for (const [way, list] of faces(id)) {
        list.sort((p, q) => p.at - q.at);
        for (let i = 0; i < list.length; i++) {
          for (let j = i + 1; j < list.length && list[j]!.at - list[i]!.at < TOL; j++) {
            const p = list[i]!;
            const q = list[j]!;
            if (p.colour === q.colour) continue;
            const area = sharedArea(p.corners, q.corners);
            if (area > MIN_AREA) fights.push(`${way} at ${p.at.toFixed(3)}: ${p.colour} / ${q.colour} share ${area.toFixed(4)} m²`);
          }
        }
      }
      expect(fights.slice(0, 5)).toEqual([]);
    });
  }
});
