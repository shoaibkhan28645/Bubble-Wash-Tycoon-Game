import type { LocationLayout, Point, Rect } from './config';
import type { GameState } from './gameState';
import type { CameraRig } from '../render/cameraRig';
import type { Stage } from '../render/stage';

/** Width of the side button column plus its margins, in CSS pixels. */
export const SIDE_BAR_PX = 64;
/** Height of the cash and stars bar at the top (the forecourt across the road sits just under it). */
const HUD_PX = 56;
/** On a tall screen the town goals bar sits under it. */
const GOALS_BAR_PX = 40;
/** How far past the built area the following camera may look, in metres. */
const CAMERA_MARGIN = 2.5;
/** More at the back: tall things there (the canopy's sign, the tunnel's) rise up the screen past their footprint. */
const CAMERA_BACK_MARGIN = 6;

/**
 * What the camera may show and where the player may walk: everything built
 * or being built, plus the pads on offer. Grows as the lot does; the side
 * buttons and the HUD keep strips of the screen clear.
 */
export class LotView {
  /** Where the player may walk: the lot and across the road, as far as it's built so far. */
  walkable: Rect;
  private shownKey = '';

  constructor(
    private readonly stage: Stage,
    private readonly rig: CameraRig,
    private readonly layout: LocationLayout,
    private readonly state: GameState,
    /** Footprints of the pads on offer (the next unlock pad, the upgrade pads). */
    private readonly offered: () => Rect[],
  ) {
    this.walkable = layout.walk;
  }

  /** Pixels at the top kept clear: the HUD, and on a tall screen the goals bar under it. */
  get topInset(): number {
    return this.stage.size.height > this.stage.size.width ? HUD_PX + GOALS_BAR_PX : HUD_PX;
  }

  /** At the start and whenever the screen changes size: the lot is framed beside the side buttons, under the HUD. */
  fitScreen(): void {
    this.rig.setRightInset(SIDE_BAR_PX, this.stage.size.width);
    this.rig.setTopInset(this.topInset, this.stage.size.height);
    this.rig.refit();
  }

  /** Recomputes the area from what's built; with `snapTo`, the camera jumps there. */
  refit(snapTo?: Point): void {
    const area = this.activeRect();
    // The camera may look a little past the edge, so the player is never right at the screen's edge.
    const m = CAMERA_MARGIN;
    this.rig.setArea({ minX: area.minX - m, maxX: area.maxX + m, minZ: area.minZ - CAMERA_BACK_MARGIN, maxZ: area.maxZ + m });
    const walk = this.layout.walk;
    this.walkable = {
      minX: Math.max(walk.minX, area.minX),
      maxX: Math.min(walk.maxX, area.maxX),
      minZ: Math.max(walk.minZ, area.minZ),
      maxZ: Math.min(walk.maxZ, area.maxZ),
    };
    if (snapTo) this.rig.snap(snapTo);
  }

  /** One frame: refits when a pad comes or goes, and follows the player. */
  update(dt: number, focus: Point): void {
    const key = JSON.stringify(this.offered()) + Object.keys(this.state.building).join();
    if (key !== this.shownKey) {
      this.shownKey = key;
      this.refit();
    }
    this.rig.update(dt, focus);
  }

  /** Everything built plus the pads on offer: where the player can go, and the camera can show. */
  private activeRect(): Rect {
    const { layout, state } = this;
    const rect = { ...layout.cameraBase };
    const grow = (r: Rect) => {
      rect.minX = Math.min(rect.minX, r.minX);
      rect.maxX = Math.max(rect.maxX, r.maxX);
      rect.minZ = Math.min(rect.minZ, r.minZ);
      rect.maxZ = Math.max(rect.maxZ, r.maxZ);
    };
    for (const id of state.unlocked) {
      const at = layout.pads[id];
      if (at) grow({ minX: at.x - 1.5, maxX: at.x + 1.5, minZ: at.z - 1.5, maxZ: at.z + 1.5 });
      const area = layout.areas[id];
      if (area) grow(area);
    }
    for (const id of Object.keys(state.building)) {
      const site = layout.sites[id];
      if (site) grow({ minX: site.x - site.width / 2, maxX: site.x + site.width / 2, minZ: site.z - site.depth / 2, maxZ: site.z + site.depth / 2 });
    }
    for (const view of layout.views) if (state.unlocked.includes(view.after)) grow(view);
    for (const footprint of this.offered()) grow(footprint);
    return rect;
  }
}
