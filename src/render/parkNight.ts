// Starlight Fun Park after dark: a warm pool of light under every lamp and
// a halo round its bulb, strings of coloured bulbs looped from lamp to lamp
// along the paths, a wash of colour round each ride (brighter, and pulsing,
// while it runs), a ring of chasing marquee lights round each ride's
// platform (racing while it runs), and searchlights sweeping the sky by the
// gate and the wheel. None of it is a real light (a phone draws a lit scene again for
// every light): it's all unlit and added on top, and shown only as the
// evening comes on (the bulbs on the strings show by day too, unlit).
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
  type Scene,
  type Vector3,
} from 'three';
import type { Point, Rect } from '../core/config';

/** A lamp's bulb (its middle), how far its pool of light reaches, and the pool's colour. */
const LAMP_BULB = 3.5;
const LAMP_POOL = 3.8;
const LAMP_COLOUR = new Color('#ffb04a');
/** Strings of bulbs hang from just under the lamps' bulbs, between lamps this far apart (metres), sagging this much a metre. */
const STRING_TOP = 3.25;
const STRING_SPAN: [number, number] = [4, 10];
const STRING_SAG = 0.11;
/** A bulb on a string every this far, this big, in these colours. */
const STRING_STEP = 0.55;
const STRING_BULB = 0.075;
const STRING_COLOURS = ['#ff4fa3', '#ffd23a', '#47d7ff', '#7dff5a', '#c07bff', '#ff8a2a'].map((c) => new Color(c));
/** Halos: a lamp's, and a string bulb's (metres across). */
const LAMP_HALO = 2.6;
const BULB_HALO = 0.75;
/** A searchlight's beam: how long, how wide at its far end, and how fast it sweeps. */
const BEAM_LENGTH = 36;
const BEAM_WIDTH = 1.7;
const BEAM_SWEEP = 0.45;
/** Below this much evening, none of it shows. */
const DARK_ENOUGH = 0.02;
/** A marquee light's halo (metres across); how many lights in each lit run, and how fast the runs chase round (lights a second), idle and running. */
const MARQUEE_HALO = 0.85;
const MARQUEE_RUN = 3;
const MARQUEE_CHASE = [2.5, 9];
const MARQUEE_COLOURS = ['#ffe066', '#ff5fa8', '#5bdcff'].map((c) => new Color(c));

/** A ride's wash of colour on the ground: where, how far, what colour, and whether it's running now. */
export interface RideGlow {
  at: Point;
  radius: number;
  color: string;
  running: () => boolean;
}

let glowTexture: CanvasTexture | null = null;
/** A soft round glow, white in the middle and fading to nothing at the edge. */
function glow(): CanvasTexture {
  if (glowTexture) return glowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(0.65, 'rgba(255,255,255,0.16)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  glowTexture = new CanvasTexture(canvas);
  return glowTexture;
}

const additive = { transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false, toneMapped: false } as const;

export class ParkNight {
  private readonly group = new Group();
  private readonly pools: InstancedMesh;
  private readonly poolMaterial: MeshBasicMaterial;
  private readonly rideMaterial: MeshBasicMaterial;
  private readonly rides: { glow: RideGlow; mesh: Mesh; phase: number }[] = [];
  private readonly lampHalos: PointsMaterial;
  private readonly bulbHalos: PointsMaterial;
  private readonly bulbMaterial: MeshBasicMaterial;
  private readonly wireMaterial: LineBasicMaterial;
  private readonly beams: { mesh: Mesh; phase: number }[] = [];
  private readonly marquees: { colors: Float32BufferAttribute; tint: Color[]; running: () => boolean; at: number }[] = [];
  private readonly marqueeMaterial: PointsMaterial;
  private readonly beamMaterial: MeshBasicMaterial;
  /** The strings of bulbs, shown by day too. */
  private readonly strings = new Group();
  private clock = 0;

  constructor(
    scene: Scene,
    lamps: Point[],
    /** The paths: strings hang only between two lamps beside the same one. */
    paths: Rect[],
  ) {
    this.group.name = 'fx:night';
    this.strings.name = 'fx:strings';
    const texture = glow();
    // Pools of lamplight on the ground.
    this.poolMaterial = new MeshBasicMaterial({ map: texture, color: LAMP_COLOUR, ...additive });
    const flat = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.pools = new InstancedMesh(flat, this.poolMaterial, Math.max(1, lamps.length));
    const place = new Object3D();
    lamps.forEach((lamp, i) => {
      place.position.set(lamp.x, 0.04, lamp.z);
      place.scale.set(LAMP_POOL * 2, 1, LAMP_POOL * 2);
      place.updateMatrix();
      this.pools.setMatrixAt(i, place.matrix);
    });
    this.pools.count = lamps.length;
    this.pools.frustumCulled = false;
    this.pools.renderOrder = 1;
    this.group.add(this.pools);
    // A halo round each lamp's bulb.
    this.lampHalos = new PointsMaterial({ map: texture, size: LAMP_HALO, color: '#ffd9a0', ...additive });
    const halos = new BufferGeometry();
    halos.setAttribute('position', new Float32BufferAttribute(lamps.flatMap((l) => [l.x, LAMP_BULB, l.z]), 3));
    const lampPoints = new Points(halos, this.lampHalos);
    lampPoints.frustumCulled = false;
    lampPoints.renderOrder = 2;
    this.group.add(lampPoints);
    // Ride washes share one material (each its own colour through a copy).
    this.rideMaterial = new MeshBasicMaterial({ map: texture, ...additive });
    // Strings of bulbs between lamps along the same path.
    const bulbs: { x: number; y: number; z: number; color: Color }[] = [];
    const wire: number[] = [];
    const beside = (p: Point, r: Rect) => p.x >= r.minX - 1.6 && p.x <= r.maxX + 1.6 && p.z >= r.minZ - 1.6 && p.z <= r.maxZ + 1.6;
    let colour = 0;
    for (let i = 0; i < lamps.length; i++) {
      for (let j = i + 1; j < lamps.length; j++) {
        const a = lamps[i]!;
        const b = lamps[j]!;
        const span = Math.hypot(b.x - a.x, b.z - a.z);
        if (span < STRING_SPAN[0] || span > STRING_SPAN[1] || !paths.some((r) => beside(a, r) && beside(b, r))) continue;
        const n = Math.max(2, Math.round(span / STRING_STEP));
        const sag = STRING_SAG * span;
        let last: [number, number, number] | null = null;
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          const p: [number, number, number] = [a.x + (b.x - a.x) * t, STRING_TOP - sag * 4 * t * (1 - t), a.z + (b.z - a.z) * t];
          if (last) wire.push(...last, ...p);
          last = p;
          if (k > 0 && k < n) bulbs.push({ x: p[0], y: p[1] - 0.06, z: p[2], color: STRING_COLOURS[colour++ % STRING_COLOURS.length]! });
        }
      }
    }
    this.wireMaterial = new LineBasicMaterial({ color: '#8a8296' });
    const wires = new BufferGeometry();
    wires.setAttribute('position', new Float32BufferAttribute(wire, 3));
    this.strings.add(new LineSegments(wires, this.wireMaterial));
    this.bulbMaterial = new MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    const bulbMesh = new InstancedMesh(new IcosahedronGeometry(STRING_BULB, 0), this.bulbMaterial, Math.max(1, bulbs.length));
    bulbs.forEach((bulb, i) => {
      place.position.set(bulb.x, bulb.y, bulb.z);
      place.scale.setScalar(1);
      place.updateMatrix();
      bulbMesh.setMatrixAt(i, place.matrix);
      bulbMesh.setColorAt(i, bulb.color);
    });
    bulbMesh.count = bulbs.length;
    bulbMesh.frustumCulled = false;
    this.strings.add(bulbMesh);
    // Each string bulb's halo, in its own colour.
    this.bulbHalos = new PointsMaterial({ map: texture, size: BULB_HALO, vertexColors: true, ...additive });
    const bulbGlow = new BufferGeometry();
    bulbGlow.setAttribute('position', new Float32BufferAttribute(bulbs.flatMap((b) => [b.x, b.y, b.z]), 3));
    bulbGlow.setAttribute('color', new Float32BufferAttribute(bulbs.flatMap((b) => [b.color.r, b.color.g, b.color.b]), 3));
    const bulbPoints = new Points(bulbGlow, this.bulbHalos);
    bulbPoints.frustumCulled = false;
    bulbPoints.renderOrder = 2;
    this.group.add(bulbPoints);
    this.marqueeMaterial = new PointsMaterial({ map: texture, size: MARQUEE_HALO, vertexColors: true, ...additive });
    // Searchlight beams: bright at the lamp, fading out along the beam.
    this.beamMaterial = new MeshBasicMaterial({ color: '#cfe0ff', vertexColors: true, side: DoubleSide, ...additive });
    this.group.visible = false;
    scene.add(this.group, this.strings);
  }

  /** Puts a ride's wash of colour on the ground round it. */
  addRide(glow: RideGlow): void {
    const material = this.rideMaterial.clone();
    material.color.set(glow.color);
    const mesh = new Mesh(new PlaneGeometry(glow.radius * 2, glow.radius * 2).rotateX(-Math.PI / 2), material);
    mesh.position.set(glow.at.x, 0.05, glow.at.z);
    mesh.renderOrder = 1;
    this.group.add(mesh);
    this.rides.push({ glow, mesh, phase: this.rides.length * 1.7 });
  }

  /**
   * A ring (or a line) of marquee lights at `points` (in the world, or in
   * `parent`'s own terms, to go round with it): runs of lit bulbs chase
   * round it in its colours, racing while the ride runs.
   */
  addMarquee(points: Vector3[], tint: string[], running: () => boolean, parent: Object3D | null = null): void {
    if (points.length === 0) return;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(points.flatMap((p) => [p.x, p.y, p.z]), 3));
    const colors = new Float32BufferAttribute(new Float32Array(points.length * 3), 3);
    geometry.setAttribute('color', colors);
    const lights = new Points(geometry, this.marqueeMaterial);
    lights.frustumCulled = false;
    lights.renderOrder = 2;
    (parent ?? this.group).add(lights);
    if (parent) this.parented.push(lights);
    this.marquees.push({ colors, tint: tint.map((c) => new Color(c)), running, at: 0 });
  }
  /** Marquee lights that go round with a ride (shown and hidden with the rest). */
  private readonly parented: Points[] = [];

  /** A searchlight on the ground at `at`, sweeping the sky. */
  addSearchlight(at: Point): void {
    const geometry = new CylinderGeometry(BEAM_WIDTH, 0.16, BEAM_LENGTH, 14, 1, true).translate(0, BEAM_LENGTH / 2, 0);
    const position = geometry.getAttribute('position');
    const colors = new Float32Array(position.count * 4);
    for (let i = 0; i < position.count; i++) {
      const along = position.getY(i) / BEAM_LENGTH;
      const fade = 0.32 * (1 - along) * (1 - along);
      colors.set([fade, fade, fade, fade], i * 4);
    }
    geometry.setAttribute('color', new BufferAttribute(colors, 4));
    const mesh = new Mesh(geometry, this.beamMaterial);
    mesh.position.set(at.x, 0.3, at.z);
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    this.group.add(mesh);
    this.beams.push({ mesh, phase: this.beams.length * 2.3 });
  }

  /** One frame: `evening` is how dark it is (0 by day, 1 at night). */
  update(dt: number, evening: number): void {
    this.clock += dt;
    const on = evening > DARK_ENOUGH;
    this.group.visible = on;
    for (const lights of this.parented) lights.visible = on;
    // The strings' bulbs are paint by day and lit at night.
    const lit = 0.62 + 0.9 * evening;
    this.bulbMaterial.color.setRGB(lit, lit, lit);
    if (!on) return;
    const flicker = 1 + 0.04 * Math.sin(this.clock * 7.3);
    this.poolMaterial.opacity = 0.95 * evening * flicker;
    this.lampHalos.opacity = 0.75 * evening;
    // The string bulbs twinkle a little, all together.
    this.bulbHalos.opacity = evening * (0.75 + 0.25 * Math.sin(this.clock * 2.6));
    for (const ride of this.rides) {
      const running = ride.glow.running();
      const pulse = running ? 0.8 + 0.2 * Math.sin(this.clock * 5 + ride.phase) : 0.6;
      (ride.mesh.material as MeshBasicMaterial).opacity = 1.25 * evening * pulse;
    }
    // The marquees: runs of lit bulbs chasing round, in the ride's colours.
    for (const marquee of this.marquees) {
      marquee.at += dt * MARQUEE_CHASE[marquee.running() ? 1 : 0]!;
      const n = marquee.colors.count;
      const tint = marquee.tint.length > 0 ? marquee.tint : MARQUEE_COLOURS;
      for (let i = 0; i < n; i++) {
        const step = Math.floor(i - marquee.at);
        const lit = ((step % (MARQUEE_RUN * 2)) + MARQUEE_RUN * 2) % (MARQUEE_RUN * 2) < MARQUEE_RUN ? 1 : 0.22;
        const c = tint[Math.floor(((i / MARQUEE_RUN) % tint.length + tint.length) % tint.length)]!;
        marquee.colors.setXYZ(i, c.r * lit, c.g * lit, c.b * lit);
      }
      marquee.colors.needsUpdate = true;
    }
    this.marqueeMaterial.opacity = evening;
    for (const beam of this.beams) {
      const t = this.clock * BEAM_SWEEP + beam.phase;
      beam.mesh.rotation.set(-0.42 + 0.16 * Math.sin(t * 0.7), 0, 0.55 * Math.sin(t));
    }
    this.beamMaterial.opacity = evening;
  }

  dispose(): void {
    for (const lights of this.parented) lights.removeFromParent();
    this.group.removeFromParent();
    this.strings.removeFromParent();
  }
}
