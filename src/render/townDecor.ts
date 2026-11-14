// The boutique's decorations in the town being played: each on its spot (shop.json), animated while on
// screen, and solid to the hero where it stands on the ground.
import { Box3, Group, Sphere, Vector3, type Scene } from 'three';
import type { Rect } from '../core/config';
import type { DecorDef } from '../systems/wardrobe';
import type { Particles } from './effects/particles';
import { buildDecor, type BuiltDecor, type Puff } from './models/decor';
import { onScreen } from './onScreen';

/** How far round a decoration's spot still counts as on screen (metres; a balloon floats high). */
const VIEW_RADIUS = 6;

interface Shown {
  def: DecorDef;
  built: BuiltDecor;
  /** The hat it was built with (the statue wears the hero's). */
  hat: string | null;
  t: number;
}

export class TownDecor {
  private readonly group = new Group();
  private readonly shown = new Map<string, Shown>();
  private rects: Rect[] = [];
  private readonly at = new Vector3();
  private readonly puff: Puff;

  constructor(scene: Scene, effects: Pick<Particles, 'burst'>) {
    this.group.name = 'decor';
    scene.add(this.group);
    this.puff = (kind, at, count, speed, spread) => effects.burst(kind, at, count, speed, spread);
  }

  /** Puts up exactly these decorations (taking down any others); `hat` is the hero's, for the statue. */
  sync(defs: readonly DecorDef[], hat: string | null): void {
    const wanted = new Set(defs.map((d) => d.id));
    for (const [id, s] of this.shown) {
      if (wanted.has(id) && !(id === 'statue' && s.hat !== hat)) continue;
      this.group.remove(s.built.object);
      this.shown.delete(id);
    }
    for (const def of defs) {
      if (this.shown.has(def.id)) continue;
      const built = buildDecor(def.id, { to: def.to ? { x: def.to.x - def.x, z: def.to.z - def.z } : undefined, hat });
      if (!built) continue;
      const object = built.object;
      object.position.set(def.x, def.y ?? 0, def.z);
      if (def.rot) object.rotation.y += def.rot;
      this.group.add(object);
      this.shown.set(def.id, { def, built, hat, t: 0 });
    }
    this.rects = [...this.shown.values()].flatMap(({ def }) => (def.solid ? [footprint(def, def.solid)] : []));
  }

  /** The ground the decorations up take, solid to the hero. */
  solids(): readonly Rect[] {
    return this.rects;
  }

  /**
   * What the shop's close-up should take in for one of this town's decorations: a ball round the whole of
   * it (a string of bunting: a stretch of it near its first pole; one put away: its spot).
   */
  frame(def: DecorDef): Sphere {
    if (def.to) return new Sphere(new Vector3(def.x + (def.to.x - def.x) * 0.25, 3.4, def.z + (def.to.z - def.z) * 0.25), 4.5);
    const s = this.shown.get(def.id);
    // Put away: its empty spot.
    if (!s) return new Sphere(new Vector3(def.x, (def.y ?? 0) + 0.8, def.z), 1.6);
    s.built.object.updateMatrixWorld(true);
    return new Box3().setFromObject(s.built.object).getBoundingSphere(new Sphere());
  }

  update(dt: number): void {
    for (const s of this.shown.values()) {
      s.t += dt;
      if (!s.built.update) continue;
      if (!onScreen(this.at.set(s.def.x, s.def.y ?? 0, s.def.z), VIEW_RADIUS)) continue;
      s.built.update(dt, s.t, this.puff);
    }
  }
}

/** A decoration's ground (half-widths across x and z before it's turned), as an axis-aligned box once turned. */
export function footprint(def: Pick<DecorDef, 'x' | 'z' | 'rot'>, [hw, hd]: readonly [number, number]): Rect {
  const c = Math.abs(Math.cos(def.rot ?? 0));
  const s = Math.abs(Math.sin(def.rot ?? 0));
  const x = c * hw + s * hd;
  const z = s * hw + c * hd;
  return { minX: def.x - x, maxX: def.x + x, minZ: def.z - z, maxZ: def.z + z };
}
