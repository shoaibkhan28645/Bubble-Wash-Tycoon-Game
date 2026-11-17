"""Skyport International (Chapter 4), the redesign's decoration: what fills the land round the terminal.

Each model stands on its own named base; fronts face -Y here (+Z in the game, towards the camera) unless its
notes say otherwise. Moving parts nest in empties at their pivots (rig.py). The camera looks down from the
south, so what it sees of a building is its roof and its south side: signs stand on the roofs facing it.

Landside (skyport-landside.glb):
  sp_fountain   the forecourt's fountain: a stone basin, two bowls, the spout sp_fountain_jet, the curtain
                falling from the top bowl sp_fountain_spill, six arcs from the rim sp_fountain_arcs, ripples on
                the pool sp_fountain_ripple0..1 (the game pulses and spreads them).
  sp_ops        the operations building behind the tower: two storeys, its door to +Y (the service road), the
                dish on its roof sp_ops_dish (turning), a mast with the beacon sp_ops_beacon, sp_ops_sign.
  sp_crewhouse  Mogul Air's crew house beside its office, in the airline's purple (the game repaints it in the
                player's colour), door to +Y, a bench and bikes on the south side, sp_crewhouse_sign.
  sp_grandstand the Sky Queen's viewing stand: four tiers facing +Y (her), a canopy, the back to the camera.
  sp_hotel      the airport hotel across the road: three storeys, its door to +Y (the road), balconies to -Y,
                a pool on the roof, sp_hotel_sign.
  sp_car0..2    parked cars (a hatchback, a saloon, an estate), noses to -Y.

Yard (skyport-yard.glb):
  sp_firestation  the airport fire station: two bays opening to -Y (one open, one shut), the hose tower,
                  sp_firestation_sign, the siren sp_firestation_siren.
  sp_firetruck    the crash tender, nose to -Y: six wheels, the roof cannon sp_firetruck_turret (sweeping),
                  beacons sp_firetruck_beacon0..1.
  sp_workshop     the maintenance workshop: a saw-tooth roof, its roller door to +Y, sp_workshop_sign.
  sp_engine       a spare jet engine on its cradle, intake to -Y, the fan sp_engine_fan (windmilling).
  sp_tyres        stacks of aircraft tyres.
  sp_pallets      pallets of crates, oil drums, a parts rack.
  sp_forklift     a forklift, forks to -Y, its carriage sp_forklift_forks (up and down).
  sp_boxtruck     a cargo box truck, cab to -Y, its back to the dock.
  sp_fuelfarm     the fuel farm across the road: three tanks in a bund, a pipe rack, a pump house.

Usage: python art/blender/skyport_landside.py <out-landside.glb> [preview.png]
(writes <out>-landside and the yard beside it, swapping 'landside' in the name for 'yard').
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import kit  # noqa: E402

kit.reset()
import rig  # noqa: E402
from rig import Model, blob, rod, tube  # noqa: E402

PI = math.pi

# (Decoration is seen from afar and some of it many times over: only the big pieces get rounded edges, and round
# things are made of fewer sides, so the two files stay small.)
_box, _cylinder, _torus, _cone = kit.box, kit.cylinder, kit.torus, kit.cone


def _lean_box(size, at, col, bevel=0.0, segments=1, rot=(0, 0, 0)):
    return _box(size, at, col, bevel if min(size) >= 0.6 else 0.0, segments, rot)


def _lean_cylinder(radius, depth, at, col, verts=16, bevel=0.0, rot=(0, 0, 0)):
    return _cylinder(radius, depth, at, col, min(verts, 24 if radius > 1.5 else 14 if radius > 0.4 else 10), bevel if radius > 1.0 else 0.0, rot)


def _lean_torus(major, minor, at, col, rot=(0, 0, 0), major_segments=24, minor_segments=8):
    return _torus(major, minor, at, col, rot, min(major_segments, 20 if major > 1 else 14), min(minor_segments, 5))


def _lean_cone(radius_bottom, radius_top, depth, at, col, verts=16, rot=(0, 0, 0)):
    return _cone(radius_bottom, radius_top, depth, at, col, min(verts, 24 if radius_bottom > 1.5 else 12), rot)


kit.box, kit.cylinder, kit.torus, kit.cone = _lean_box, _lean_cylinder, _lean_torus, _lean_cone
WHITE = '#f7f8fa'
CREAM = '#ffe9c4'
STONE = '#e7e1d4'
STONE_D = '#cfc6b4'
AQUA = '#22c3c9'
AQUA_DEEP = '#14959b'
WATER = '#7fd8ea'
FOAM = '#e9fbff'
NAVY = '#17324d'
BLUE = '#2c62d6'
SKY = '#5fa8e8'
SUN = '#ffd24a'
GOLD = '#d9a62e'
ORANGE = '#ff8a3d'
PINK = '#ff5fa8'
STEEL = '#c9d2dc'
CHROME = '#dfe6ee'
GREY = '#9aa4b0'
CONCRETE = '#b9c0c8'
DARK = '#3b3f4a'
RUBBER = '#2b2f38'
GLASS = '#30465e'
PANE = '#bfeef0'
BULB = '#fff3a0'
RED = '#e8493f'
FIRE = '#d8342c'
GREEN = '#5fb84f'
LEAF = '#4fae5a'
WOOD = '#c98a52'
AIRLINE = '#7a3fd0'
HIVIS = '#ff9f1c'
TERRACOTTA = '#d9774f'


def wheel(at, r, width, hub=STEEL, verts=12):
    """A tyre and its hub, turning about X."""
    rot = (0, PI / 2, 0)
    return [kit.cylinder(r, width, at, RUBBER, verts=verts, rot=rot), kit.cylinder(r * 0.58, width + 0.02, at, hub, verts=8, rot=rot)]


def windows_x(x0, x1, y, z, w, h, n, face, glass=GLASS, frame=WHITE, sill=None):
    """A row of `n` windows across X on a wall at y, facing `face` (-1: -Y, 1: +Y), each `w` by `h`, middles at z."""
    out = []
    for k in range(n):
        x = x0 + (k + 0.5) * (x1 - x0) / n
        out.append(kit.box((w + 0.16, 0.06, h + 0.16), (x, y + face * 0.03, z), frame, bevel=0.0))
        out.append(kit.box((w, 0.06, h), (x, y + face * 0.06, z), glass, bevel=0.0))
        if sill:
            out.append(kit.box((w + 0.3, 0.2, 0.08), (x, y + face * 0.12, z - h / 2 - 0.06), sill, bevel=0.0))
    return out


def windows_y(y0, y1, x, z, w, h, n, face, glass=GLASS, frame=WHITE):
    """The same along Y, on a wall at x facing `face` (-1: -X, 1: +X)."""
    out = []
    for k in range(n):
        y = y0 + (k + 0.5) * (y1 - y0) / n
        out.append(kit.box((0.06, w + 0.16, h + 0.16), (x + face * 0.03, y, z), frame, bevel=0.0))
        out.append(kit.box((0.06, w, h), (x + face * 0.06, y, z), glass, bevel=0.0))
    return out


def ac_unit(at):
    x, y, z = at
    return [
        kit.box((1.1, 0.8, 0.6), (x, y, z + 0.3), STEEL, bevel=0.04),
        kit.cylinder(0.3, 0.05, (x, y, z + 0.62), DARK, verts=14),
        kit.box((0.06, 0.55, 0.04), (x, y, z + 0.66), GREY, bevel=0.0),
    ]


def shrub(at, r=0.5, col=LEAF):
    x, y, z = at
    return [blob((r, r, r * 0.8), (x, y, z + r * 0.7), col, segments=8), blob((r * 0.6, r * 0.6, r * 0.5), (x + r * 0.4, y - r * 0.3, z + r * 1.1), GREEN, segments=8)]


def planter_box(at, w, d):
    x, y, z = at
    out = [kit.box((w, d, 0.5), (x, y, z + 0.25), STONE, bevel=0.05), kit.box((w - 0.2, d - 0.2, 0.06), (x, y, z + 0.5), '#6b4a2f', bevel=0.0)]
    n = max(1, int(w / 0.6))
    for k in range(n):
        out.append(blob((0.3, 0.3, 0.26), (x - w / 2 + (k + 0.5) * w / n, y, z + 0.66), LEAF if k % 2 else GREEN, segments=8))
    return out


# =========================================================================================================
# --- The forecourt's fountain: a round stone basin, a pedestal with two bowls, water falling and spouting. ---
X = 0.0
m = Model('sp_fountain', X)
R = 2.6
p = []
# The basin: a low wall, a wide coping to sit on, a darker plinth; the pool inside.
p.append(kit.cylinder(R, 0.5, (X, 0, 0.25), STONE, verts=32, bevel=0.03))
p.append(kit.cylinder(R + 0.12, 0.12, (X, 0, 0.56), STONE_D, verts=32, bevel=0.03))
p.append(kit.cylinder(R + 0.25, 0.08, (X, 0, 0.04), STONE_D, verts=32))
p.append(kit.cylinder(R - 0.2, 0.06, (X, 0, 0.47), WATER, verts=32))
# Mosaic tiles round the basin's outside: aqua and white.
for k in range(10):
    a = k * 2 * PI / 10
    p.append(kit.box((0.5, 0.05, 0.22), (X + (R + 0.01) * math.cos(a), (R + 0.01) * math.sin(a), 0.26), AQUA if k % 2 else WHITE, bevel=0.0, rot=(0, 0, a + PI / 2)))
# The pedestal and its bowls: a wide lower bowl, a smaller one above, a finial.
p.append(kit.cylinder(0.42, 1.0, (X, 0, 0.95), STONE, verts=18, bevel=0.04))
p.append(kit.cone(0.3, 1.2, 0.35, (X, 0, 1.55), STONE, verts=24))
p.append(kit.cylinder(1.12, 0.05, (X, 0, 1.71), WATER, verts=24))
p.append(kit.torus(1.2, 0.07, (X, 0, 1.72), STONE_D, major_segments=24, minor_segments=6))
p.append(kit.cylinder(0.2, 0.7, (X, 0, 2.05), STONE, verts=14))
p.append(kit.cone(0.16, 0.62, 0.22, (X, 0, 2.48), STONE, verts=20))
p.append(kit.cylinder(0.58, 0.04, (X, 0, 2.58), WATER, verts=20))
p.append(kit.torus(0.62, 0.05, (X, 0, 2.59), STONE_D, major_segments=20, minor_segments=6))
# Little brass nozzles round the rim for the arcs.
for k in range(6):
    a = k * PI / 3
    p.append(kit.sphere(0.07, (X + (R - 0.25) * math.cos(a), (R - 0.25) * math.sin(a), 0.55), GOLD, segments=6))
m.mesh(p)
# The spout from the top bowl.
jet = [blob((0.09, 0.09, 0.55), (X, 0, 3.1), FOAM, segments=10), blob((0.2, 0.2, 0.14), (X, 0, 3.62), FOAM, segments=10)]
for k in range(4):
    a = k * PI / 2
    jet.append(kit.sphere(0.06, (X + 0.24 * math.cos(a), 0.24 * math.sin(a), 3.5), FOAM, segments=6))
m.part('jet', (X, 0, 2.6), jet)
# The curtain falling from the lower bowl's rim into the pool, and from the top bowl into the lower.
spill = [kit.cone(1.2, 1.32, 1.18, (X, 0, 1.12), WATER, verts=28), kit.cone(0.62, 0.72, 0.62, (X, 0, 2.27), WATER, verts=20)]
for s in spill:
    s.data.shade_smooth()
m.part('spill', (X, 0, 1.72), spill)
# Six arcs from the rim, curving in towards the pedestal.
arcs = []
for k in range(6):
    a = k * PI / 3
    pts = []
    for i in range(5):
        t = i / 4
        r = (R - 0.25) - t * (R - 0.25 - 0.55)
        pts.append((X + r * math.cos(a), r * math.sin(a), 0.58 + 1.1 * math.sin(PI * t) - 0.1 * t))
    arcs += [rod(a_, b_, 0.04, FOAM, verts=5) for a_, b_ in zip(pts, pts[1:])]
m.part('arcs', (X, 0, 0.5), arcs)
for k in range(2):
    m.part(f'ripple{k}', (X, 0, 0.51), [kit.torus(0.9 + k * 0.7, 0.03, (X, 0, 0.51), FOAM, major_segments=28, minor_segments=4)])

# =========================================================================================================
# --- The operations building: two storeys behind the tower, the dish on its roof. ---
X = 30.0
m = Model('sp_ops', X)
W, D, H1, H2 = 12.5, 7.4, 3.2, 6.6
p = []
p.append(kit.box((W + 0.4, D + 0.4, 0.2), (X, 0, 0.1), CONCRETE, bevel=0.03))
# Ground floor: white piers between tall windows all round; the door under a canopy on the north (+Y) side.
p.append(kit.box((W, D, H1), (X, 0, H1 / 2 + 0.2), WHITE, bevel=0.04))
p += windows_x(X - W / 2 + 0.6, X + W / 2 - 0.6, -D / 2, 1.75, 1.5, 1.9, 5, -1)
p += windows_x(X - W / 2 + 0.6, X - 1.2, D / 2, 1.75, 1.5, 1.9, 3, 1)
p += windows_x(X + 2.8, X + W / 2 - 0.6, D / 2, 1.75, 1.5, 1.9, 1, 1)
p += windows_y(-D / 2 + 0.6, D / 2 - 0.6, X - W / 2, 1.75, 1.4, 1.9, 3, -1)
p += windows_y(-D / 2 + 0.6, D / 2 - 0.6, X + W / 2, 1.75, 1.4, 1.9, 3, 1)
p.append(kit.box((1.8, 0.1, 2.4), (X + 1.6, D / 2 + 0.04, 1.4), GLASS, bevel=0.0))
p.append(kit.box((0.06, 0.12, 2.4), (X + 1.6, D / 2 + 0.08, 1.4), CHROME, bevel=0.0))
p.append(kit.box((3.2, 1.6, 0.16), (X + 1.6, D / 2 + 0.8, 2.85), NAVY, bevel=0.03))
for e in (-1, 1):
    p.append(rod((X + 1.6 + e * 1.4, D / 2 + 1.45, 0.2), (X + 1.6 + e * 1.4, D / 2 + 1.45, 2.8), 0.05, STEEL, verts=8))
# The first floor: a band of glass all round the control room, a navy band below it, the aqua parapet.
p.append(kit.box((W + 0.2, D + 0.2, 0.35), (X, 0, H1 + 0.38), NAVY, bevel=0.03))
p.append(kit.box((W, D, H2 - H1 - 0.55), (X, 0, H1 + 0.55 + (H2 - H1 - 0.55) / 2), WHITE, bevel=0.04))
for face in (-1, 1):
    p.append(kit.box((W - 0.8, 0.08, 1.6), (X, face * D / 2 + face * 0.03, H1 + 1.85), PANE, bevel=0.0))
    for k in range(9):
        p.append(kit.box((0.08, 0.1, 1.6), (X - W / 2 + 0.4 + k * (W - 0.8) / 8, face * D / 2 + face * 0.06, H1 + 1.85), NAVY, bevel=0.0))
for face in (-1, 1):
    p.append(kit.box((0.08, D - 0.8, 1.6), (X + face * W / 2 + face * 0.03, 0, H1 + 1.85), PANE, bevel=0.0))
p.append(kit.box((W + 0.3, D + 0.3, 0.4), (X, 0, H2 + 0.05), AQUA, bevel=0.05))
p.append(kit.box((W - 0.4, D - 0.4, 0.1), (X, 0, H2 + 0.22), '#d7dde4', bevel=0.0))
# On the roof: air conditioners, a stair hut, the dish's pedestal, a lattice mast with a beacon.
p += ac_unit((X - 4.4, 1.8, H2 + 0.25))
p += ac_unit((X - 2.9, 1.8, H2 + 0.25))
p.append(kit.box((2.2, 2.0, 2.0), (X - 3.8, -1.6, H2 + 1.25), WHITE, bevel=0.04))
p.append(kit.box((2.4, 2.2, 0.16), (X - 3.8, -1.6, H2 + 2.3), NAVY, bevel=0.03))
p.append(kit.box((0.8, 0.06, 1.5), (X - 3.4, -2.62, H2 + 0.98), GLASS, bevel=0.0))
p.append(kit.cylinder(0.55, 0.5, (X + 1.5, 0.4, H2 + 0.5), GREY, verts=16))
p.append(kit.cylinder(0.25, 0.9, (X + 1.5, 0.4, H2 + 1.15), STEEL, verts=12))
MX, MY = X + 5.0, 2.4
for dx, dy in ((-0.35, -0.35), (0.35, -0.35), (0.35, 0.35), (-0.35, 0.35)):
    p.append(rod((MX + dx, MY + dy, H2 + 0.25), (MX + dx * 0.3, MY + dy * 0.3, H2 + 5.2), 0.035, RED, verts=5))
for k in range(3):
    z = H2 + 1.0 + k * 1.5
    s_ = 0.35 * (1 - 0.7 * (z - H2 - 0.25) / 4.95)
    ring = [(MX - s_, MY - s_, z), (MX + s_, MY - s_, z), (MX + s_, MY + s_, z), (MX - s_, MY + s_, z), (MX - s_, MY - s_, z)]
    p += [rod(a_, b_, 0.018, WHITE if k % 2 else RED, verts=4) for a_, b_ in zip(ring, ring[1:])]
p.append(kit.cylinder(0.03, 1.2, (MX, MY, H2 + 5.8), STEEL, verts=6))
m.mesh(p)
m.marker('beacon', (MX, MY, H2 + 6.45))
# The sign on a frame along the roof's south edge, facing the camera.
sg = [kit.box((6.2, 0.14, 1.0), (X + 0.6, -D / 2 + 0.4, H2 + 1.15), NAVY, bevel=0.04)]
for e in (-1, 1):
    sg.append(rod((X + 0.6 + e * 2.6, -D / 2 + 0.55, H2 + 0.25), (X + 0.6 + e * 2.6, -D / 2 + 0.55, H2 + 0.7), 0.05, STEEL, verts=6))
m.mesh(sg)
m.marker('sign', (X + 0.6, -D / 2 + 0.31, H2 + 1.15))
# The dish: a parabolic reflector on a yoke, tipped up, turning about the pedestal.
dish = [kit.box((0.5, 0.5, 0.35), (X + 1.5, 0.4, H2 + 1.75), DARK, bevel=0.05)]
for e in (-1, 1):
    dish.append(kit.box((0.08, 0.3, 0.7), (X + 1.5 + e * 0.32, 0.4, H2 + 2.1), STEEL, bevel=0.02))
d = rig.loft([(-0.05, 0.0, 0.0, 0.08, 0.08), (0.18, 0.0, 0.0, 0.9, 0.9), (0.38, 0.0, 0.0, 1.25, 1.25), (0.42, 0.0, 0.0, 1.3, 1.3)], WHITE, verts=28, cap=False, name='dish')
rig.paint(d, lambda c: ORANGE if c.y > 0.36 else WHITE)
d.data.shade_smooth()
d.rotation_euler = (0.75, 0, 0)
d.location = (X + 1.5, 0.4, H2 + 2.45)
kit._apply_all(d)
dish.append(d)
dish.append(rod((X + 1.5, 0.4, H2 + 2.45), (X + 1.5, 0.4 + 0.9 * math.cos(0.75), H2 + 2.45 + 0.9 * math.sin(0.75)), 0.03, DARK, verts=5))
dish.append(kit.sphere(0.09, (X + 1.5, 0.4 + 0.9 * math.cos(0.75), H2 + 2.45 + 0.9 * math.sin(0.75)), RED, segments=8))
m.part('dish', (X + 1.5, 0.4, H2 + 1.6), dish)

# =========================================================================================================
# --- Mogul Air's crew house: a single storey in the airline's colour, door to the service road (+Y). ---
X = 50.0
m = Model('sp_crewhouse', X)
W, D, H = 7.0, 6.2, 3.4
p = [kit.box((W + 0.3, D + 0.3, 0.16), (X, 0, 0.08), CONCRETE, bevel=0.03)]
p.append(kit.box((W, D, H), (X, 0, H / 2 + 0.16), WHITE, bevel=0.05))
p.append(kit.box((W + 0.06, D + 0.06, 0.5), (X, 0, 0.4), AIRLINE, bevel=0.03))
p.append(kit.box((W + 0.3, D + 0.3, 0.32), (X, 0, H + 0.3), AIRLINE, bevel=0.05))
p.append(kit.box((W - 0.3, D - 0.3, 0.08), (X, 0, H + 0.48), '#d7dde4', bevel=0.0))
# A raised clerestory along the roof's middle, its glass to the south.
p.append(kit.box((W - 2.2, 1.6, 0.8), (X, 0.3, H + 0.85), WHITE, bevel=0.04))
p.append(kit.box((W - 2.6, 0.06, 0.45), (X, 0.3 - 0.82, H + 0.85), PANE, bevel=0.0))
p.append(kit.box((W - 2.0, 1.8, 0.12), (X, 0.3, H + 1.3), AIRLINE, bevel=0.03))
p += ac_unit((X + 2.6, 1.9, H + 0.46))
# Windows: big ones to the south (the crew room), the door and a window north, one each end.
p += windows_x(X - W / 2 + 0.5, X + W / 2 - 0.5, -D / 2, 1.9, 1.7, 1.5, 3, -1, sill=AIRLINE)
p += windows_x(X + 0.6, X + W / 2 - 0.4, D / 2, 1.9, 1.6, 1.3, 1, 1)
p += windows_y(-D / 2 + 1.0, D / 2 - 1.0, X - W / 2, 1.9, 1.6, 1.3, 1, -1)
p += windows_y(-D / 2 + 1.0, D / 2 - 1.0, X + W / 2, 1.9, 1.6, 1.3, 1, 1)
p.append(kit.box((1.1, 0.1, 2.2), (X - 1.6, D / 2 + 0.04, 1.26), NAVY, bevel=0.0))
p.append(kit.box((0.6, 0.08, 0.8), (X - 1.6, D / 2 + 0.1, 1.7), PANE, bevel=0.0))
p.append(kit.sphere(0.05, (X - 1.25, D / 2 + 0.14, 1.2), GOLD, segments=6))
p.append(kit.box((2.0, 1.2, 0.12), (X - 1.6, D / 2 + 0.55, 2.6), AIRLINE, bevel=0.03))
# The south side: a bench, a bike stand with two bikes, a planter of shrubs.
p.append(kit.box((1.8, 0.45, 0.08), (X - 2.0, -D / 2 - 0.55, 0.5), WOOD, bevel=0.02))
p.append(kit.box((1.8, 0.08, 0.45), (X - 2.0, -D / 2 - 0.35, 0.78), WOOD, bevel=0.02))
for e in (-1, 1):
    p.append(kit.box((0.08, 0.45, 0.48), (X - 2.0 + e * 0.8, -D / 2 - 0.55, 0.24), DARK, bevel=0.0))
for k in range(2):
    bx = X + 1.0 + k * 0.7
    for yy in (-D / 2 - 0.35, -D / 2 - 1.35):
        p.append(kit.torus(0.3, 0.03, (bx, yy, 0.32), RUBBER, rot=(0, PI / 2, 0), major_segments=14, minor_segments=4))
    p.append(rod((bx, -D / 2 - 0.35, 0.32), (bx, -D / 2 - 0.85, 0.75), 0.025, [RED, AQUA][k], verts=5))
    p.append(rod((bx, -D / 2 - 0.85, 0.75), (bx, -D / 2 - 1.35, 0.32), 0.025, [RED, AQUA][k], verts=5))
    p.append(rod((bx, -D / 2 - 0.85, 0.75), (bx, -D / 2 - 0.45, 0.8), 0.025, [RED, AQUA][k], verts=5))
    p.append(kit.box((0.1, 0.22, 0.05), (bx, -D / 2 - 1.15, 0.86), DARK, bevel=0.0))
p.append(rod((X + 0.7, -D / 2 - 0.3, 0.05), (X + 0.7, -D / 2 - 0.3, 0.5), 0.03, GREY, verts=5))
p.append(rod((X + 2.1, -D / 2 - 0.3, 0.05), (X + 2.1, -D / 2 - 0.3, 0.5), 0.03, GREY, verts=5))
p.append(rod((X + 0.7, -D / 2 - 0.3, 0.5), (X + 2.1, -D / 2 - 0.3, 0.5), 0.03, GREY, verts=5))
p += planter_box((X + 3.0, -D / 2 - 0.7, 0), 0.9, 0.9)
m.mesh(p)
sg = [kit.box((3.6, 0.12, 0.7), (X, -D / 2 + 0.6, H + 1.0), NAVY, bevel=0.04)]
m.mesh(sg)
m.marker('sign', (X, -D / 2 + 0.53, H + 1.0))

# =========================================================================================================
# --- The Sky Queen's viewing stand: four tiers facing +Y (her), a canopy; its back to the camera. ---
X = 70.0
m = Model('sp_grandstand', X)
W, D = 13.0, 4.6
TIERS = 4
p = []
# The tiers: each a step up towards the back (-Y), a row of seats on each, gold and navy.
for k in range(TIERS):
    y = D / 2 - 0.55 - k * 1.05
    top = 0.45 + k * 0.62
    p.append(kit.box((W, 1.1, top), (X, y, top / 2), CONCRETE if k % 2 else '#c8ced6', bevel=0.02))
    n = 6
    for i in range(n):
        x = X - W / 2 + 1.0 + i * (W - 2.0) / (n - 1)
        col = [SUN, NAVY][(i + k) % 2]
        p.append(kit.box((1.8, 0.42, 0.1), (x, y + 0.1, top + 0.24), col))
        p.append(kit.box((1.8, 0.08, 0.42), (x, y - 0.13, top + 0.45), col))
        p.append(kit.box((0.04, 0.44, 0.5), (x, y + 0.02, top + 0.42), DARK))
# The back wall, the camera's side: the Sky Queen's colours, a crown, stripes.
BACK = D / 2 - 0.55 - (TIERS - 1) * 1.05 - 0.6
p.append(kit.box((W + 0.2, 0.25, 3.0), (X, BACK, 1.5), NAVY, bevel=0.04))
for k in range(5):
    p.append(kit.box((W + 0.22, 0.06, 0.12), (X, BACK - 0.13, 0.5 + k * 0.5), GOLD if k % 2 == 0 else WHITE, bevel=0.0))
star = kit.star_disc(0.62, 0.28, 0.08, (X, BACK - 0.18, 2.4), GOLD, points=5)
star.rotation_euler = (PI / 2, 0, 0)
kit._apply_all(star)
p.append(star)
# Ends: stair flights up the sides, rails along the front and the ends.
for e in (-1, 1):
    ex = X + e * (W / 2 + 0.45)
    for k in range(TIERS * 2):
        y = D / 2 - 0.3 - k * 0.52
        p.append(kit.box((0.8, 0.52, 0.31 * (k + 1)), (ex, y, 0.155 * (k + 1)), '#c8ced6', bevel=0.0))
    p += tube([(ex + e * 0.42, D / 2 - 0.2, 1.0), (ex + e * 0.42, BACK + 0.4, 0.45 + (TIERS - 1) * 0.62 + 1.0)], 0.035, AQUA, verts=6)
p += tube([(X - W / 2, D / 2 + 0.05, 0.95), (X + W / 2, D / 2 + 0.05, 0.95)], 0.04, AQUA, verts=6)
for k in range(7):
    x = X - W / 2 + k * W / 6
    p.append(rod((x, D / 2 + 0.05, 0.45), (x, D / 2 + 0.05, 0.95), 0.03, AQUA, verts=5))
p.append(kit.box((W, 0.04, 0.42), (X, D / 2 + 0.06, 0.7), PANE, bevel=0.0))
# The canopy: columns at the back, a roof sloping up to the front, its edge in aqua, flags along it.
CH = 0.45 + (TIERS - 1) * 0.62 + 2.6
for k in range(4):
    x = X - W / 2 + 0.6 + k * (W - 1.2) / 3
    p.append(rod((x, BACK + 0.1, 0.1), (x, BACK + 0.1, CH), 0.1, WHITE, verts=10))
    p.append(rod((x, BACK + 0.1, CH - 0.2), (x, BACK + 2.4, CH + 0.1), 0.06, STEEL, verts=6))
p.append(kit.box((W + 0.8, D + 0.6, 0.14), (X, (BACK + D / 2) / 2 + 0.3, CH + 0.2), WHITE, bevel=0.03, rot=(-0.1, 0, 0)))
p.append(kit.box((W + 0.9, 0.2, 0.3), (X, D / 2 + 0.55, CH + 0.5), AQUA, bevel=0.03))
p.append(kit.box((W + 0.9, 0.2, 0.3), (X, BACK - 0.05, CH - 0.05), NAVY, bevel=0.03))
for k in range(5):
    x = X - W / 2 + 0.4 + k * (W - 0.8) / 4
    p.append(kit.cylinder(0.03, 1.5, (x, BACK - 0.05, CH + 0.8), STEEL, verts=6))
    p.append(kit.box((0.7, 0.03, 0.42), (x + 0.36, BACK - 0.05, CH + 1.3), [SUN, AQUA, PINK, AQUA, SUN][k], bevel=0.0))
m.mesh(p)

# =========================================================================================================
# --- The airport hotel: three storeys, its door to the road (+Y), balconies to the south, a pool on the roof. ---
X = 100.0
m = Model('sp_hotel', X)
W, D = 16.0, 9.0
FLOOR = 3.1
p = [kit.box((W + 1.0, D + 1.0, 0.18), (X, 0, 0.09), CONCRETE, bevel=0.03)]
# The ground floor: the lobby in glass to the road, a cream base all round.
p.append(kit.box((W, D, FLOOR), (X, 0, FLOOR / 2 + 0.18), CREAM, bevel=0.05))
p.append(kit.box((8.0, 0.1, 2.5), (X, D / 2 + 0.04, 1.45), GLASS, bevel=0.0))
for k in range(9):
    p.append(kit.box((0.08, 0.14, 2.5), (X - 4.0 + k, D / 2 + 0.08, 1.45), CHROME, bevel=0.0))
p.append(kit.box((9.0, 2.6, 0.22), (X, D / 2 + 1.3, 2.9), TERRACOTTA, bevel=0.04))
p.append(kit.box((9.1, 0.12, 0.34), (X, D / 2 + 2.58, 2.85), SUN, bevel=0.02))
for e in (-1, 1):
    p.append(rod((X + e * 4.2, D / 2 + 2.4, 0.18), (X + e * 4.2, D / 2 + 2.4, 2.8), 0.07, CHROME, verts=8))
p += windows_x(X - W / 2 + 0.4, X + W / 2 - 0.4, -D / 2, 1.7, 1.6, 1.6, 6, -1, sill=TERRACOTTA)
for face in (-1, 1):
    p += windows_y(-D / 2 + 0.6, D / 2 - 0.6, X + face * W / 2, 1.7, 1.4, 1.6, 3, face)
# The two floors of rooms: a window each to the road, a balcony each to the south; a stripe between floors.
for f in (1, 2):
    z0 = 0.18 + f * FLOOR
    p.append(kit.box((W, D, FLOOR), (X, 0, z0 + FLOOR / 2), WHITE, bevel=0.04))
    p.append(kit.box((W + 0.1, D + 0.1, 0.2), (X, 0, z0 + 0.05), TERRACOTTA, bevel=0.02))
    p += windows_x(X - W / 2 + 0.4, X + W / 2 - 0.4, D / 2, z0 + 1.6, 1.3, 1.5, 7, 1, sill=TERRACOTTA)
    for face in (-1, 1):
        p += windows_y(-D / 2 + 0.6, D / 2 - 0.6, X + face * W / 2, z0 + 1.6, 1.3, 1.5, 2, face)
    for k in range(6):
        x = X - W / 2 + (k + 0.5) * W / 6
        p.append(kit.box((1.3, 0.06, 2.2), (x, -D / 2 - 0.03, z0 + 1.3), GLASS, bevel=0.0))
        p.append(kit.box((2.0, 0.9, 0.12), (x, -D / 2 - 0.45, z0 + 0.25), WHITE, bevel=0.02))
        p.append(kit.box((2.0, 0.04, 0.7), (x, -D / 2 - 0.88, z0 + 0.6), PANE, bevel=0.0))
        if (k + f) % 3 == 0:
            p.append(kit.box((0.5, 0.5, 0.06), (x + 0.5, -D / 2 - 0.45, z0 + 0.62), WOOD, bevel=0.0))
            p.append(blob((0.2, 0.2, 0.25), (x - 0.6, -D / 2 - 0.5, z0 + 0.55), LEAF, segments=8))
TOP = 0.18 + 3 * FLOOR
p.append(kit.box((W + 0.4, D + 0.4, 0.4), (X, 0, TOP + 0.1), TERRACOTTA, bevel=0.05))
p.append(kit.box((W - 0.2, D - 0.2, 0.08), (X, 0, TOP + 0.32), '#d7dde4', bevel=0.0))
# The roof: a pool with its deck, loungers and parasols, a lift hut, a water tank.
p.append(kit.box((7.4, 4.2, 0.12), (X - 2.6, -0.8, TOP + 0.38), WOOD, bevel=0.0))
p.append(kit.box((5.6, 2.6, 0.14), (X - 2.6, -0.8, TOP + 0.42), SKY, bevel=0.0))
p.append(kit.box((5.8, 2.8, 0.1), (X - 2.6, -0.8, TOP + 0.4), WHITE, bevel=0.0))
for k in range(4):
    lx = X - 5.4 + k * 1.9
    p.append(kit.box((0.6, 1.4, 0.12), (lx, -3.2, TOP + 0.6), WHITE, bevel=0.02))
    p.append(kit.box((0.6, 0.5, 0.1), (lx, -2.6, TOP + 0.8), WHITE, bevel=0.02, rot=(0.6, 0, 0)))
    p.append(kit.box((0.56, 1.2, 0.04), (lx, -3.25, TOP + 0.68), [PINK, AQUA, SUN, ORANGE][k], bevel=0.0))
for k, px in enumerate((X - 4.6, X - 0.8)):
    p.append(kit.cylinder(0.03, 1.8, (px, -3.9, TOP + 1.25), STEEL, verts=6))
    p.append(kit.cone(1.0, 0.05, 0.4, (px, -3.9, TOP + 2.15), [ORANGE, AQUA][k], verts=12))
p.append(kit.box((2.6, 2.4, 2.4), (X + 4.8, 1.6, TOP + 1.5), WHITE, bevel=0.04))
p.append(kit.box((2.8, 2.6, 0.16), (X + 4.8, 1.6, TOP + 2.78), TERRACOTTA, bevel=0.03))
p.append(kit.cylinder(0.9, 1.8, (X + 5.4, -2.6, TOP + 1.25), STEEL, verts=16))
p.append(kit.cone(0.95, 0.2, 0.4, (X + 5.4, -2.6, TOP + 2.35), GREY, verts=16))
p += planter_box((X + 1.6, -3.6, TOP + 0.3), 2.2, 0.6)
# Shrubs either side of the door; a flagpole at each end of the canopy.
for e in (-1, 1):
    p += planter_box((X + e * 6.2, D / 2 + 1.2, 0.18), 2.4, 1.0)
    p.append(kit.cylinder(0.05, 6.0, (X + e * 7.6, D / 2 + 2.6, 3.0), WHITE, verts=8))
    p.append(kit.box((1.2, 0.03, 0.8), (X + e * 7.6 + 0.62, D / 2 + 2.6, 5.5), [AQUA, TERRACOTTA][max(0, e)], bevel=0.0))
m.mesh(p)
sg = [kit.box((6.4, 0.16, 1.2), (X + 0.4, -D / 2 + 0.6, TOP + 1.25), NAVY, bevel=0.05)]
for e in (-1, 1):
    sg.append(rod((X + 0.4 + e * 2.8, -D / 2 + 0.75, TOP + 0.3), (X + 0.4 + e * 2.8, -D / 2 + 0.75, TOP + 0.7), 0.05, STEEL, verts=6))
m.mesh(sg)
m.marker('sign', (X + 0.4, -D / 2 + 0.51, TOP + 1.25))


# =========================================================================================================
# --- Parked cars, noses to -Y: a hatchback, a saloon, an estate. ---
def car(name, x, body, length, roof_from, roof_to, roof_h=1.42, boot=0.82):
    """A little car along Y (nose to -Y): its body's side profile pushed out across X, glass on top, wheels, lamps."""
    mm = Model(name, x)
    L = length / 2
    q = []
    side = [(-L, 0.38), (-L, 0.8), (-L + 0.15, 0.92), (-L + 0.9, 0.98), (roof_from - 0.25, 1.0), (roof_from, roof_h), (roof_to, roof_h), (roof_to + 0.25, boot + 0.15), (L - 0.12, boot), (L, 0.75), (L, 0.38)]
    q.append(kit.profile(side, 1.72, x, body, bevel=0.0))
    glass = [(roof_from - 0.18, 1.02), (roof_from + 0.04, roof_h - 0.04), (roof_to - 0.04, roof_h - 0.04), (roof_to + 0.2, boot + 0.18)]
    q.append(kit.profile(glass + [(roof_to + 0.2, 1.0), (roof_from - 0.18, 1.0)], 1.6, x, GLASS, bevel=0.0))
    q.append(kit.box((1.6, 0.06, 0.06), (x, roof_from + 0.7, roof_h + 0.02), DARK, bevel=0.0))
    for yy in (-L + 0.75, L - 0.75):
        for e in (-1, 1):
            q.append(kit.cylinder(0.34, 0.24, (x + e * 0.8, yy, 0.34), RUBBER, verts=8, rot=(0, PI / 2, 0)))
    for e in (-1, 1):
        q.append(kit.box((0.32, 0.06, 0.16), (x + e * 0.6, -L - 0.01, 0.78), BULB, bevel=0.02))
        q.append(kit.box((0.3, 0.06, 0.14), (x + e * 0.62, L + 0.01, 0.78), RED, bevel=0.02))
        q.append(kit.box((0.12, 0.2, 0.08), (x + e * 0.92, roof_from - 0.35, 1.0), body, bevel=0.02))
    q.append(kit.box((1.0, 0.08, 0.2), (x, -L - 0.02, 0.5), DARK, bevel=0.02))
    q.append(kit.box((1.74, 0.12, 0.2), (x, -L + 0.04, 0.42), GREY, bevel=0.03))
    q.append(kit.box((1.74, 0.12, 0.2), (x, L - 0.04, 0.42), GREY, bevel=0.03))
    q.append(kit.box((0.5, 0.04, 0.12), (x, L + 0.02, 0.6), WHITE, bevel=0.0))
    mm.mesh(q)


car('sp_car0', 130.0, RED, 3.7, -0.7, 0.95, boot=1.2)
car('sp_car1', 134.0, WHITE, 4.4, -0.75, 0.75)
car('sp_car2', 138.0, BLUE, 4.6, -0.75, 1.75, roof_h=1.48, boot=1.36)

# =========================================================================================================
# ====================================== The yard ==========================================================
# --- The fire station: two bays opening to -Y (one open, one shut), the hose tower behind. ---
X = 160.0
m = Model('sp_firestation', X)
W, D, H = 11.0, 9.0, 5.2
BAY = 4.0
p = [kit.box((W + 0.4, D + 0.4, 0.18), (X, 0, 0.09), CONCRETE, bevel=0.03)]
bays = (X - 2.6, X + 2.6)
# The walls: red brick-red below, white above; the bays' openings in the front.
for k, (a, b) in enumerate(((X - W / 2, bays[0] - BAY / 2 - 0.2), (bays[0] + BAY / 2 + 0.2, bays[1] - BAY / 2 - 0.2), (bays[1] + BAY / 2 + 0.2, X + W / 2))):
    p.append(kit.box((b - a, 0.3, H), ((a + b) / 2, -D / 2 + 0.15, H / 2 + 0.18), WHITE, bevel=0.03))
    p.append(kit.box((b - a + 0.02, 0.32, 1.0), ((a + b) / 2, -D / 2 + 0.15, 0.68), FIRE, bevel=0.02))
for bx in bays:
    p.append(kit.box((BAY + 0.4, 0.34, H - 4.4), (bx, -D / 2 + 0.15, 4.4 + (H - 4.4) / 2 + 0.18), WHITE, bevel=0.02))
    p.append(kit.box((BAY + 0.6, 0.4, 0.22), (bx, -D / 2 + 0.1, 4.55), FIRE, bevel=0.03))
    p.append(kit.box((BAY - 0.2, 0.06, 0.12), (bx, -D / 2 - 0.08, 0.2), SUN, bevel=0.0))
    for e in (-1, 1):
        for kk in range(5):
            p.append(kit.box((0.18, 0.06, 0.3), (bx + e * (BAY / 2 + 0.11), -D / 2 - 0.03, 0.45 + kk * 0.8), SUN if kk % 2 == 0 else DARK, bevel=0.0))
p.append(kit.box((W, 0.3, H), (X, D / 2 - 0.15, H / 2 + 0.18), WHITE, bevel=0.03))
for face in (-1, 1):
    p.append(kit.box((0.3, D, H), (X + face * (W / 2 - 0.15), 0, H / 2 + 0.18), WHITE, bevel=0.03))
    p.append(kit.box((0.32, D, 1.0), (X + face * (W / 2 - 0.15), 0, 0.68), FIRE, bevel=0.02))
    p += windows_y(-D / 2 + 1.0, D / 2 - 1.0, X + face * W / 2, 3.1, 1.3, 1.2, 3, face)
p.append(kit.box((W - 0.2, 0.32, 1.0), (X, D / 2 - 0.15, 0.68), FIRE, bevel=0.02))
p += windows_x(X - W / 2 + 0.6, X + W / 2 - 0.6, D / 2, 3.1, 1.5, 1.2, 4, 1)
# Inside the open bay: its dark floor and walls (the truck stands half out of it).
p.append(kit.box((BAY, D - 0.6, H - 0.4), (bays[0], 0.1, (H - 0.4) / 2 + 0.2), '#2e333c', bevel=0.0))
p.append(kit.box((W - 0.4, D - 0.4, 0.06), (X, 0, 0.21), '#5a6270', bevel=0.0))
# The shut bay's red roller door.
for kk in range(10):
    p.append(kit.box((BAY - 0.05, 0.08, 0.41), (bays[1], -D / 2 + 0.02, 0.4 + kk * 0.42), FIRE if kk % 2 else '#c22c25', bevel=0.0))
p.append(kit.cylinder(0.3, BAY + 0.2, (bays[1], -D / 2 + 0.25, 4.3), GREY, verts=12, rot=(0, PI / 2, 0)))
# The roof: flat, a red parapet, a light bar over each bay, a siren on a stalk.
p.append(kit.box((W + 0.4, D + 0.4, 0.4), (X, 0, H + 0.3), FIRE, bevel=0.05))
p.append(kit.box((W - 0.2, D - 0.2, 0.08), (X, 0, H + 0.52), '#d7dde4', bevel=0.0))
for bx in bays:
    p.append(kit.box((1.2, 0.18, 0.18), (bx, -D / 2 - 0.05, 4.95), BULB, bevel=0.03))
p += ac_unit((X + 3.5, 2.6, H + 0.5))
# The hose tower at the back corner: tall, a window slot each storey, a lookout roof, the sign on its face.
TX, TY, TW = X - W / 2 + 1.6, D / 2 - 1.6, 2.8
p.append(kit.box((TW, TW, 9.0), (TX, TY, 4.6), WHITE, bevel=0.04))
for kk in range(3):
    p.append(kit.box((0.5, 0.06, 1.2), (TX, TY - TW / 2 - 0.03, 2.2 + kk * 2.4), GLASS, bevel=0.0))
for kk in range(4):
    p.append(kit.box((TW + 0.04, TW + 0.04, 0.16), (TX, TY, 1.2 + kk * 2.2), FIRE, bevel=0.0))
p.append(kit.box((TW + 0.5, TW + 0.5, 0.2), (TX, TY, 9.2), FIRE, bevel=0.04))
for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
    p.append(rod((TX + dx * TW / 2, TY + dy * TW / 2, 9.3), (TX + dx * TW / 2, TY + dy * TW / 2, 10.3), 0.06, WHITE, verts=6))
p.append(kit.cone(2.3, 0.2, 0.9, (TX, TY, 10.75), FIRE, verts=4, rot=(0, 0, PI / 4)))
p.append(kit.box((TW - 0.2, 0.1, 0.9), (TX, TY - TW / 2 - 0.05, 7.9), NAVY, bevel=0.02))
m.mesh(p)
m.marker('sign', (TX, TY - TW / 2 - 0.12, 7.9))
m.marker('siren', (X + 4.2, -1.0, H + 1.3))
m.mesh([rod((X + 4.2, -1.0, H + 0.5), (X + 4.2, -1.0, H + 1.1), 0.05, STEEL, verts=6), kit.cylinder(0.22, 0.3, (X + 4.2, -1.0, H + 1.25), RED, verts=12)])

# --- The crash tender: nose to -Y, six wheels, a roof cannon. ---
X = 180.0
m = Model('sp_firetruck', X)
L, Wt = 8.2, 2.6
p = []
# The chassis, the cab at the front (-Y) with a big windscreen, the tank body behind.
p.append(kit.box((Wt - 0.2, L - 0.4, 0.4), (X, 0, 0.75), DARK, bevel=0.04))
p.append(kit.box((Wt, 2.3, 2.1), (X, -L / 2 + 1.15, 1.95), FIRE, bevel=0.12))
p.append(kit.box((Wt - 0.3, 0.1, 0.9), (X, -L / 2 - 0.0, 2.4), GLASS, bevel=0.02, rot=(-0.2, 0, 0)))
for e in (-1, 1):
    p.append(kit.box((0.08, 1.4, 0.8), (X + e * Wt / 2, -L / 2 + 1.1, 2.35), GLASS, bevel=0.02))
p.append(kit.box((Wt + 0.04, 0.3, 0.3), (X, -L / 2 + 0.05, 1.05), GREY, bevel=0.04))
for e in (-1, 1):
    p.append(kit.box((0.4, 0.08, 0.22), (X + e * 0.9, -L / 2 - 0.03, 1.4), BULB, bevel=0.02))
p.append(kit.box((Wt, L - 2.4, 2.3), (X, 1.15, 2.05), FIRE, bevel=0.12))
# A yellow stripe all round, roller lockers down the sides, a ladder at the back.
for e in (-1, 1):
    p.append(kit.box((0.05, L - 0.2, 0.22), (X + e * (Wt / 2 + 0.01), 0, 1.25), SUN, bevel=0.0))
    for kk in range(3):
        p.append(kit.box((0.05, 1.5, 1.2), (X + e * (Wt / 2 + 0.01), -0.6 + kk * 1.7, 2.1), CHROME, bevel=0.02))
p.append(kit.box((Wt + 0.04, 0.05, 0.22), (X, L / 2 - 0.08, 1.25), SUN, bevel=0.0))
for e in (-1, 1):
    p.append(rod((X + e * 0.35, L / 2 + 0.03, 0.9), (X + e * 0.35, L / 2 + 0.03, 3.1), 0.03, STEEL, verts=5))
for kk in range(6):
    p.append(rod((X - 0.35, L / 2 + 0.03, 1.1 + kk * 0.35), (X + 0.35, L / 2 + 0.03, 1.1 + kk * 0.35), 0.02, STEEL, verts=4))
p.append(kit.box((Wt - 0.2, L - 2.6, 0.1), (X, 1.2, 3.25), CHROME, bevel=0.02))
for e in (-1, 1):
    p.append(rod((X + e * (Wt / 2 - 0.2), -0.1, 3.4), (X + e * (Wt / 2 - 0.2), L / 2 - 0.3, 3.4), 0.03, CHROME, verts=5))
# Six big wheels.
for yy in (-L / 2 + 1.3, 1.2, L / 2 - 1.1):
    for e in (-1, 1):
        p += wheel((X + e * (Wt / 2 - 0.15), yy, 0.6), 0.6, 0.42, hub=SUN)
m.mesh(p)
for k, e in enumerate((-1, 1)):
    m.marker(f'beacon{k}', (X + e * 0.85, -L / 2 + 0.7, 3.15))
m.mesh([kit.box((1.9, 0.3, 0.16), (X, -L / 2 + 0.7, 3.05), DARK, bevel=0.03)] + [kit.box((0.4, 0.26, 0.18), (X + e * 0.75, -L / 2 + 0.7, 3.16), [RED, BLUE][k], bevel=0.04) for k, e in enumerate((-1, 1))])
tur = [kit.cylinder(0.32, 0.3, (X, -L / 2 + 2.6, 3.5), DARK, verts=14)]
tur.append(kit.box((0.3, 0.3, 0.3), (X, -L / 2 + 2.6, 3.75), CHROME, bevel=0.04))
tur.append(rod((X, -L / 2 + 2.6, 3.8), (X, -L / 2 + 1.0, 4.15), 0.09, CHROME, verts=10))
tur.append(kit.cone(0.13, 0.09, 0.3, (X, -L / 2 + 0.95, 4.16), DARK, verts=10, rot=(PI / 2 + 0.22, 0, 0)))
m.part('turret', (X, -L / 2 + 2.6, 3.5), tur)

# --- The maintenance workshop: a saw-tooth roof, its roller door to +Y (the service road). ---
X = 200.0
m = Model('sp_workshop', X)
W, D, H = 12.0, 8.0, 4.6
p = [kit.box((W + 0.4, D + 0.4, 0.18), (X, 0, 0.09), CONCRETE, bevel=0.03)]
p.append(kit.box((W, D, H), (X, 0, H / 2 + 0.18), '#e6ebf1', bevel=0.04))
p.append(kit.box((W + 0.04, D + 0.04, 0.7), (X, 0, 0.53), NAVY, bevel=0.03))
for k in range(int(W / 0.9)):
    x = X - W / 2 + 0.45 + k * 0.9
    for face in (-1, 1):
        p.append(kit.box((0.1, 0.06, H - 0.9), (x, face * (D / 2 + 0.02), 0.9 + (H - 0.9) / 2), '#d3dbe4', bevel=0.0))
p.append(kit.box((W + 0.1, D + 0.1, 0.3), (X, 0, H + 0.1), HIVIS, bevel=0.03))
# The saw-tooth roof: three teeth, their glazing facing +Y, the slopes to the camera.
for k in range(3):
    y = -D / 2 + (k + 0.5) * D / 3
    p.append(kit.box((W + 0.3, D / 3 * 1.08, 0.12), (X, y - 0.05, H + 0.95), STEEL, bevel=0.0, rot=(0.42, 0, 0)))
    p.append(kit.box((W - 0.2, 0.08, 1.15), (X, y + D / 6 - 0.04, H + 0.85), PANE, bevel=0.0))
# The roller door to the north, a person door beside it, windows to the south, a lamp over the door.
p.append(kit.box((4.6, 0.1, 3.6), (X - 1.2, D / 2 + 0.04, 2.0), '#c3ccd6', bevel=0.0))
for kk in range(12):
    p.append(kit.box((4.6, 0.12, 0.05), (X - 1.2, D / 2 + 0.07, 0.4 + kk * 0.3), GREY, bevel=0.0))
p += [kit.box((5.0, 0.2, 0.2), (X - 1.2, D / 2 + 0.1, 3.9), HIVIS, bevel=0.02)]
p.append(kit.box((0.95, 0.1, 2.1), (X + 3.4, D / 2 + 0.04, 1.25), NAVY, bevel=0.0))
p += windows_x(X - W / 2 + 0.6, X + W / 2 - 0.6, -D / 2, 2.3, 1.6, 1.3, 4, -1)
p.append(kit.box((0.4, 0.3, 0.2), (X + 3.4, D / 2 + 0.2, 2.6), BULB, bevel=0.03))
# A rack of gas bottles and a bin by the south wall.
for k in range(4):
    p.append(kit.cylinder(0.14, 1.3, (X + 3.8 + k * 0.32, -D / 2 - 0.3, 0.83), [GREEN, SUN, GREEN, SKY][k], verts=10))
p.append(rod((X + 3.6, -D / 2 - 0.5, 1.1), (X + 5.0, -D / 2 - 0.5, 1.1), 0.03, DARK, verts=5))
p.append(kit.box((1.2, 0.9, 1.0), (X - 4.6, -D / 2 - 0.6, 0.68), GREEN, bevel=0.05))
p.append(kit.box((1.26, 0.96, 0.08), (X - 4.6, -D / 2 - 0.6, 1.22), DARK, bevel=0.02))
m.mesh(p)
sg = [kit.box((5.2, 0.14, 0.8), (X, -D / 2 + 0.3, H + 1.5), NAVY, bevel=0.04)]
for e in (-1, 1):
    sg.append(rod((X + e * 2.2, -D / 2 + 0.45, H + 0.3), (X + e * 2.2, -D / 2 + 0.45, H + 1.1), 0.05, STEEL, verts=6))
m.mesh(sg)
m.marker('sign', (X, -D / 2 + 0.22, H + 1.5))

# --- A spare jet engine on its cradle: intake to -Y, the fan windmilling. ---
X = 220.0
m = Model('sp_engine', X)
p = []
p.append(kit.box((2.0, 3.2, 0.16), (X, 0, 0.5), SUN, bevel=0.03))
for e in (-1, 1):
    p.append(kit.box((0.16, 3.2, 0.2), (X + e * 0.95, 0, 0.62), SUN, bevel=0.02))
    for yy in (-1.3, 1.3):
        p.append(rod((X + e * 0.85, yy, 0.6), (X + e * 0.85, yy, 0.25), 0.05, DARK, verts=6))
        p.append(kit.cylinder(0.14, 0.12, (X + e * 0.85, yy, 0.16), RUBBER, verts=10, rot=(0, PI / 2, 0)))
    for yy in (-0.8, 0.8):
        p.append(kit.box((0.14, 0.3, 0.9), (X + e * 0.62, yy, 1.05), SUN, bevel=0.02))
nac = rig.loft([(-1.45, X, 1.85, 0.98, 0.98), (-1.3, X, 1.85, 1.05, 1.05), (-0.6, X, 1.85, 1.08, 1.08), (0.6, X, 1.85, 0.98, 0.98), (1.1, X, 1.85, 0.75, 0.75), (1.45, X, 1.85, 0.55, 0.55)], WHITE, verts=28, cap=False, name='nacelle')
rig.paint(nac, lambda c: AQUA if -1.4 < c.y < -1.2 else WHITE)
nac.data.shade_smooth()
p.append(nac)
p.append(kit.torus(1.0, 0.07, (X, -1.45, 1.85), CHROME, rot=(PI / 2, 0, 0), major_segments=28, minor_segments=6))
p.append(kit.cylinder(0.95, 0.06, (X, -1.0, 1.85), DARK, verts=28, rot=(PI / 2, 0, 0)))
p.append(kit.cone(0.5, 0.18, 0.7, (X, 1.75, 1.85), GREY, verts=16, rot=(-PI / 2, 0, 0)))
p.append(kit.cone(0.3, 0.02, 0.5, (X, 2.15, 1.85), DARK, verts=12, rot=(-PI / 2, 0, 0)))
# A tag on a string, a red cover over the exhaust strap.
p.append(kit.box((0.3, 0.02, 0.18), (X + 0.7, -1.5, 1.2), RED, bevel=0.0))
p.append(kit.box((2.1, 0.12, 0.1), (X, 0.0, 2.95), RED, bevel=0.02))
m.mesh(p)
fan = [kit.cone(0.26, 0.04, 0.4, (X, -1.25, 1.85), CHROME, verts=14, rot=(PI / 2, 0, 0))]
for k in range(12):
    a = k * 2 * PI / 12
    # (Each blade's long side out from the hub, turned a little about its length for its pitch.)
    blade = kit.box((0.16, 0.03, 0.75), (X + 0.55 * math.cos(a), -1.08, 1.85 + 0.55 * math.sin(a)), STEEL, bevel=0.0)
    blade.rotation_mode = 'ZYX'
    blade.rotation_euler = (0.0, PI / 2 - a, 0.35)
    kit._apply_all(blade)
    fan.append(blade)
m.part('fan', (X, -1.1, 1.85), fan)

# --- Stacks of aircraft tyres. ---
X = 230.0
m = Model('sp_tyres', X)
p = []
for sx, sy, n in ((0.0, 0.0, 4), (1.15, 0.2, 3), (0.5, 1.15, 2)):
    for k in range(n):
        p.append(kit.torus(0.42, 0.17, (X + sx, sy, 0.18 + k * 0.34), RUBBER, major_segments=12, minor_segments=4))
    p.append(kit.cylinder(0.3, 0.34 * n, (X + sx, sy, 0.01 + 0.17 * n), GREY, verts=10))
p.append(kit.torus(0.42, 0.17, (X - 0.9, 0.6, 0.62), RUBBER, rot=(0.25, PI / 2, 0), major_segments=20, minor_segments=8))
p.append(kit.cylinder(0.3, 0.3, (X - 0.9, 0.6, 0.62), GREY, verts=12, rot=(0, PI / 2 - 0.25, 0)))
m.mesh(p)

# --- Pallets of crates, oil drums, a parts rack. ---
X = 240.0
m = Model('sp_pallets', X)
p = []
for k, (px, py) in enumerate(((0.0, 0.0), (1.4, 0.1), (0.6, 1.3))):
    p.append(kit.box((1.2, 1.0, 0.14), (X + px, py, 0.07), WOOD, bevel=0.01))
    for kk in range(2 if k != 2 else 1):
        p.append(kit.box((1.0, 0.86, 0.6), (X + px, py, 0.45 + kk * 0.62), [WOOD, '#b47a45', '#d9a066'][(k + kk) % 3], bevel=0.04))
        p.append(kit.box((1.02, 0.04, 0.06), (X + px, py - 0.43, 0.45 + kk * 0.62), DARK, bevel=0.0))
for k in range(4):
    p.append(kit.cylinder(0.3, 0.88, (X - 1.5 + (k % 2) * 0.64, -0.2 + (k // 2) * 0.64, 0.44), [BLUE, RED, BLUE, SUN][k], verts=14))
    p.append(kit.torus(0.3, 0.025, (X - 1.5 + (k % 2) * 0.64, -0.2 + (k // 2) * 0.64, 0.6), DARK, major_segments=14, minor_segments=4))
for e in (-1, 1):
    p.append(rod((X + 2.6 + e * 0.9, 1.6, 0), (X + 2.6 + e * 0.9, 1.6, 2.0), 0.04, HIVIS, verts=5))
    p.append(rod((X + 2.6 + e * 0.9, 2.2, 0), (X + 2.6 + e * 0.9, 2.2, 2.0), 0.04, HIVIS, verts=5))
for z in (0.3, 1.0, 1.7):
    p.append(kit.box((1.9, 0.7, 0.05), (X + 2.6, 1.9, z), STEEL, bevel=0.0))
    for kk in range(3):
        p.append(kit.box((0.45, 0.4, 0.3), (X + 2.0 + kk * 0.6, 1.9, z + 0.18), [SKY, SUN, GREY][(kk + int(z)) % 3], bevel=0.03))
m.mesh(p)

# --- A forklift: forks to -Y, a cage over the seat, its carriage up and down. ---
X = 250.0
m = Model('sp_forklift', X)
p = []
p.append(kit.box((1.1, 2.0, 0.7), (X, 0.2, 0.65), SUN, bevel=0.08))
p.append(kit.box((1.12, 0.7, 0.9), (X, 1.0, 0.85), DARK, bevel=0.08))
p.append(kit.box((0.5, 0.5, 0.12), (X, 0.4, 1.06), RUBBER, bevel=0.03))
p.append(kit.box((0.5, 0.12, 0.5), (X, 0.66, 1.32), RUBBER, bevel=0.03))
for dx, dy in ((-0.5, -0.4), (0.5, -0.4), (-0.5, 0.8), (0.5, 0.8)):
    p.append(rod((X + dx, dy, 1.0), (X + dx, dy, 2.15), 0.035, DARK, verts=6))
p.append(kit.box((1.1, 1.3, 0.06), (X, 0.2, 2.17), DARK, bevel=0.02))
for e in (-1, 1):
    p.append(kit.box((0.08, 0.1, 2.3), (X + e * 0.35, -0.85, 1.25), GREY, bevel=0.0))
p.append(kit.box((0.8, 0.1, 0.08), (X, -0.85, 2.38), GREY, bevel=0.0))
for yy, r in ((-0.5, 0.3), (0.95, 0.26)):
    for e in (-1, 1):
        p += wheel((X + e * 0.48, yy, r), r, 0.2)
p.append(kit.box((0.3, 0.1, 0.12), (X, 1.36, 2.24), ORANGE, bevel=0.03))
m.mesh(p)
fk = [kit.box((0.8, 0.08, 0.6), (X, -0.95, 0.4), DARK, bevel=0.02)]
for e in (-1, 1):
    fk.append(kit.box((0.12, 1.1, 0.05), (X + e * 0.25, -1.5, 0.12), GREY, bevel=0.0))
fk.append(kit.box((0.9, 0.8, 0.12), (X, -1.5, 0.2), WOOD, bevel=0.01))
fk.append(kit.box((0.75, 0.7, 0.55), (X, -1.5, 0.54), '#b47a45', bevel=0.04))
m.part('forks', (X, -0.95, 0.1), fk)

# --- A cargo box truck: cab to -Y, its back to the dock. ---
X = 260.0
m = Model('sp_boxtruck', X)
L = 7.4
p = []
p.append(kit.box((2.1, L - 0.4, 0.35), (X, 0, 0.7), DARK, bevel=0.03))
cab = [(-L / 2, 0.55), (-L / 2, 1.6), (-L / 2 + 0.25, 2.5), (-L / 2 + 0.6, 2.75), (-L / 2 + 2.0, 2.75), (-L / 2 + 2.0, 0.55)]
p.append(kit.profile(cab, 2.3, X, WHITE, bevel=0.08, segments=2))
p.append(kit.profile([(-L / 2 + 0.05, 1.7), (-L / 2 + 0.28, 2.45), (-L / 2 + 0.62, 2.62), (-L / 2 + 0.62, 1.7)], 2.2, X, GLASS, bevel=0.02))
for e in (-1, 1):
    p.append(kit.box((0.06, 0.8, 0.7), (X + e * 1.16, -L / 2 + 1.25, 2.05), GLASS, bevel=0.0))
    p.append(kit.box((0.36, 0.06, 0.2), (X + e * 0.8, -L / 2 - 0.01, 1.1), BULB, bevel=0.02))
    p.append(rod((X + e * 1.16, -L / 2 + 0.6, 2.2), (X + e * 1.4, -L / 2 + 0.6, 2.2), 0.025, DARK, verts=4))
    p.append(kit.box((0.06, 0.18, 0.3), (X + e * 1.42, -L / 2 + 0.6, 2.1), DARK, bevel=0.0))
p.append(kit.box((2.32, 0.12, 0.3), (X, -L / 2 + 0.03, 0.75), GREY, bevel=0.03))
p.append(kit.box((1.4, 0.06, 0.3), (X, -L / 2 - 0.02, 1.4), DARK, bevel=0.0))
p.append(kit.box((2.4, L - 2.2, 2.7), (X, 1.0, 2.15), WHITE, bevel=0.05))
for e in (-1, 1):
    p.append(kit.box((0.04, L - 2.3, 0.42), (X + e * 1.21, 1.0, 1.4), AQUA, bevel=0.0))
    p.append(kit.box((0.04, L - 2.3, 0.12), (X + e * 1.21, 1.0, 1.72), SUN, bevel=0.0))
p.append(kit.box((2.2, 0.06, 2.4), (X, L / 2 - 0.08, 2.1), '#d3dbe4', bevel=0.0))
for kk in range(8):
    p.append(kit.box((2.2, 0.08, 0.04), (X, L / 2 - 0.05, 1.0 + kk * 0.3), GREY, bevel=0.0))
for e in (-1, 1):
    p.append(kit.box((0.3, 0.06, 0.16), (X + e * 0.95, L / 2 - 0.02, 0.9), RED, bevel=0.02))
p.append(kit.box((2.2, 0.3, 0.1), (X, L / 2 - 0.1, 0.55), SUN, bevel=0.0))
for yy in (-L / 2 + 1.2, L / 2 - 1.6, L / 2 - 0.7):
    for e in (-1, 1):
        p += wheel((X + e * 0.95, yy, 0.48), 0.48, 0.32)
m.mesh(p)

# --- The fuel farm: three tanks in a bund, a pipe rack along the front, a pump house. ---
X = 290.0
m = Model('sp_fuelfarm', X)
p = []
BW, BD = 24.0, 10.5
p.append(kit.box((BW, BD, 0.1), (X, 0, 0.05), '#a9b1ba', bevel=0.0))
for face in (-1, 1):
    p.append(kit.box((BW + 0.4, 0.4, 0.8), (X, face * BD / 2, 0.4), CONCRETE, bevel=0.04))
    p.append(kit.box((0.4, BD, 0.8), (X + face * BW / 2, 0, 0.4), CONCRETE, bevel=0.04))
for k in range(3):
    tx = X - 7.4 + k * 7.4
    r = 3.0
    p.append(kit.cylinder(r, 5.4, (tx, 0.6, 2.8), WHITE, verts=24))
    p.append(kit.cylinder(r + 0.02, 0.5, (tx, 0.6, 4.6), AQUA, verts=32))
    p.append(kit.cylinder(r + 0.03, 0.14, (tx, 0.6, 3.9), NAVY, verts=32))
    p.append(kit.cone(r + 0.1, 0.4, 0.8, (tx, 0.6, 5.9), '#d7dde4', verts=32))
    p.append(kit.cylinder(0.35, 0.3, (tx, 0.6, 6.4), GREY, verts=10))
    # The stair winding up its side, a rail round the top.
    for kk in range(7):
        a = -PI / 2 - 0.9 + kk * 0.29
        p.append(kit.box((0.7, 0.42, 0.06), (tx + (r + 0.35) * math.cos(a), 0.6 + (r + 0.35) * math.sin(a), 0.6 + kk * 0.74), STEEL, bevel=0.0, rot=(0, 0, a + PI / 2)))
    rail = [(tx + (r + 0.6) * math.cos(-PI / 2 - 0.9 + i * 0.4), 0.6 + (r + 0.6) * math.sin(-PI / 2 - 0.9 + i * 0.4), 1.5 + i * 1.04) for i in range(5)]
    p += [rod(a_, b_, 0.025, SUN, verts=4) for a_, b_ in zip(rail, rail[1:])]
    p.append(kit.torus(r - 0.2, 0.03, (tx, 0.6, 6.1), SUN, major_segments=28, minor_segments=4))
    # Its number on the side facing the camera.
    p.append(kit.box((1.0, 0.04, 1.0), (tx, 0.6 - r + 0.02, 2.4), NAVY, bevel=0.0, rot=(0, 0, 0)))
    for kk in range(k + 1):
        p.append(kit.box((0.14, 0.05, 0.6), (tx - 0.2 * k + 0.4 * kk, 0.6 - r - 0.01, 2.4), WHITE, bevel=0.0))
# The pipe rack along the front (-Y) side, a pipe up to each tank.
for yy, col in ((-BD / 2 + 1.0, SUN), (-BD / 2 + 1.35, GREY)):
    p.append(rod((X - BW / 2 + 0.6, yy, 0.9), (X + BW / 2 - 3.0, yy, 0.9), 0.12, col, verts=10))
for k in range(3):
    tx = X - 7.4 + k * 7.4
    p.append(rod((tx + 1.5, -BD / 2 + 1.0, 0.9), (tx + 1.5, 0.6 - 2.6, 0.9), 0.1, SUN, verts=8))
    p.append(kit.cylinder(0.22, 0.25, (tx + 1.5, -BD / 2 + 1.7, 0.9), RED, verts=10, rot=(0, PI / 2, 0)))
for k in range(6):
    x = X - BW / 2 + 1.0 + k * (BW - 4.0) / 5
    p.append(kit.box((0.12, 0.8, 0.12), (x, -BD / 2 + 1.17, 0.7), DARK, bevel=0.0))
    p.append(rod((x, -BD / 2 + 1.17, 0.1), (x, -BD / 2 + 1.17, 0.7), 0.05, DARK, verts=5))
# The pump house in the corner, a fence along the back.
PX = X + BW / 2 - 1.8
p.append(kit.box((2.6, 2.4, 2.4), (PX, -BD / 2 + 2.0, 1.3), CREAM, bevel=0.04))
p.append(kit.box((2.8, 2.6, 0.18), (PX, -BD / 2 + 2.0, 2.58), AQUA, bevel=0.03))
p.append(kit.box((0.9, 0.06, 1.8), (PX, -BD / 2 + 0.78, 1.0), NAVY, bevel=0.0))
p.append(kit.box((0.8, 0.06, 0.6), (PX - 0.2, -BD / 2 + 0.6, 2.0), RED, bevel=0.0))
for k in range(int(BW / 4.0)):
    x = X - BW / 2 + 0.2 + k * 4.0
    p.append(kit.cylinder(0.05, 1.6, (x, BD / 2 + 0.6, 0.8), GREY, verts=6))
    p.append(kit.box((4.0, 0.03, 1.4), (x + 2.0, BD / 2 + 0.6, 0.8), '#8a95a3', bevel=0.0))
m.mesh(p)

# =========================================================================================================
out = Path(sys.argv[1] if len(sys.argv) > 1 else 'skyport-landside.glb')
FILES = {
    'landside': ('sp_fountain', 'sp_ops', 'sp_crewhouse', 'sp_grandstand', 'sp_hotel', 'sp_car0', 'sp_car1', 'sp_car2'),
    'yard': ('sp_firestation', 'sp_firetruck', 'sp_workshop', 'sp_engine', 'sp_tyres', 'sp_pallets', 'sp_forklift', 'sp_boxtruck', 'sp_fuelfarm'),
}
assert sorted(b.name for b in rig.bases) == sorted(n for names in FILES.values() for n in names)
for key, names in FILES.items():
    rig.export_all(out.with_name(out.stem.replace('landside', key) + out.suffix), [b for b in rig.bases if b.name in names])
if len(sys.argv) > 2:
    rig.contact_sheet(sys.argv[2], list(rig.bases), size=(460, 380), cols=6)
