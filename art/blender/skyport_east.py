"""Skyport International (Chapter 4, Part C): the tower and VIP side, east of the terminal.

sp_pier and sp_vip stand at the origin and are built at the town's own coordinates
(src/data/towns/skyport/layout.json; the game's (x, z) is (x, -y) here), as sp_wing is. The rest stand on
their own bases, fronts to -Y here (+Z in the game) unless said:

sp_tower: the control tower (about 18 m): a block at its foot with its door to the front (marker
sp_tower_sign over it), a tapering shaft, the glass cab with its walkway, the roof with bulbs round its edge,
the radar on the mast (sp_tower_radar, turning about Z), marker _beacon at the mast's top.

sp_pier: Gate 4's lounge, low glass walls like the wing's with a door in the north wall (marker
sp_pier_gate4 for its sign over the door), lamp columns, planters.

sp_stairtruck: the stair truck that serves the wide-body: its top landing at the origin's -X end at the
door's sill (3.14 m), the stairs coming down along +X to the ground about 5.6 m out, the cab under the
landing.

sp_beltloader: a belt loader for the holds: its belt rising along -X to the hold door (top end at the
origin, 1.65 m up); the belt's cleats sp_beltloader_belt slide along it.

sp_vip: the VIP lounge, low glass walls trimmed in gold, a doorway north (to the private jet) and south
(to the limousine), each under a VIP arch (markers sp_vip_sign, sp_vip_sign2); the champagne bar (marker
sp_vip_bar), sofas, palms, velvet ropes, two photographers' lamps outside the south door.

sp_carpet: a red carpet one metre long, running along +Y here (-Z in the game); the game stretches it.

sp_limo: a black stretch limousine, its wheels sp_limo_wheel_f/_r (pairs, rolling about X).

sp_mogul: Mogul Air's office, counter to the front: the routes board on the back wall (marker
sp_mogul_board, where the game hangs its map), the souvenir shelf beside it (markers sp_mogul_slot0..11, open to the front),
a globe, a little plane on a pole, the sign (marker sp_mogul_sign). Its awning and panels are the
airline's colour (#7a3fd0), which the game repaints in the player's brand colour.

sp_souvenirs: twelve souvenirs side by side (sp_souvenirs_s0..s11), one from each city Mogul Air flies to.

sp_shuttle: the shuttle bus, its doors on the right (-X here), wheels sp_shuttle_wheel_f/_r, sliding door
sp_shuttle_door, markers _sign (the destination board) and _side.

sp_busstop: the shuttle's shelter: canopy, glass back, bench, a post with its sign (marker sp_busstop_sign).

sp_sorter: the bag sorter by the belt: a housing with a scanner arch, the loop of belt on top
(sp_sorter_belt), a chute per gate colour out of the back (+Y, towards the hall's wall), the pusher arm
sp_sorter_arm (turning about Z), its lights.

Usage: python art/blender/skyport_east.py <out.glb> [preview.png]
(out names the tower's file; the others are written beside it: skyport-pier, -vip, -mogul, -shuttle.)
"""
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import kit  # noqa: E402

kit.reset()
import rig  # noqa: E402
from rig import Model, blob, rod  # noqa: E402

PI = math.pi
LAYOUT = json.loads((Path(__file__).parents[2] / 'src/data/towns/skyport/layout.json').read_text())
WHITE = '#f7f8fa'
PANE = '#bfeef0'
AQUA = '#22c3c9'
NAVY = '#17324d'
SUN = '#ffd24a'
ORANGE = '#ff8a3d'
PINK = '#ff5fa8'
PURPLE = '#8a4fd8'
MINT = '#7ee0c3'
STEEL = '#c9d2dc'
CHROME = '#dfe6ee'
GREY = '#9aa4b0'
DARK = '#3b3f4a'
RUBBER = '#2b2f38'
GLASS = '#30465e'
CAB = '#5fa8c8'
SCREEN = '#1f2a36'
BULB = '#fff3a0'
RED = '#e8493f'
GREEN = '#5fb84f'
BLUE = '#2c62d6'
LEAF = '#4fae5a'
WOOD = '#c98a52'
CREAM = '#ffe9c4'
GOLD = '#d9a62e'
VELVET = '#b0213a'
LIMO = '#22252d'
AIRLINE = '#7a3fd0'
HIVIS = '#ff9f1c'


def g(x, z, h=0.0):
    """The game's (x, z) at height h, here."""
    return (x, -z, h)


def wheel(at, r, width, verts=16):
    rot = (0, PI / 2, 0)
    return [
        kit.cylinder(r, width, at, RUBBER, verts=verts, bevel=min(0.04, r * 0.15), rot=rot),
        kit.cylinder(r * 0.56, width + 0.02, at, STEEL, verts=12, rot=rot),
        kit.cylinder(r * 0.2, width + 0.05, at, GREY, verts=8, rot=rot),
    ]


def wall_run(x0, z0, x1, z1, trim=AQUA):
    """A low glass wall from (x0, z0) to (x1, z1) in the game's coordinates, as the hall's and the wing's."""
    out = []
    length = math.hypot(x1 - x0, z1 - z0)
    if length < 0.05:
        return out
    ang = math.atan2(-(z1 - z0), x1 - x0)
    mx, mz = (x0 + x1) / 2, (z0 + z1) / 2
    rot = (0, 0, ang)
    out.append(kit.box((length, 0.34, 0.26), g(mx, mz, 0.13), WHITE, bevel=0.04, rot=rot))
    out.append(kit.box((length, 0.1, 1.05), g(mx, mz, 0.78), PANE, bevel=0.0, rot=rot))
    out.append(kit.box((length + 0.06, 0.3, 0.12), g(mx, mz, 1.34), WHITE, bevel=0.04, rot=rot))
    out.append(kit.box((length, 0.12, 0.06), g(mx, mz, 1.42), trim, bevel=0.0, rot=rot))
    n = max(1, round(length / 1.5))
    for k in range(n + 1):
        t = k / n
        x, z = x0 + (x1 - x0) * t, z0 + (z1 - z0) * t
        out.append(kit.box((0.1, 0.16, 1.1), g(x, z, 0.78), WHITE, bevel=0.02, rot=rot))
    return out


def column(x, z, cap=AQUA):
    """A lamp column as along the hall's walls: white, a coloured cap, a globe."""
    return [
        kit.box((0.5, 0.5, 2.3), g(x, z, 1.15), WHITE, bevel=0.08),
        kit.box((0.66, 0.66, 0.2), g(x, z, 2.36), cap, bevel=0.05),
        kit.sphere(0.24, g(x, z, 2.68), BULB, segments=12),
        kit.cylinder(0.12, 0.12, g(x, z, 2.5), STEEL, verts=10),
    ]


def planter(x, z):
    out = [kit.box((1.2, 0.7, 0.5), g(x, z, 0.25), WHITE, bevel=0.06)]
    for k in range(3):
        out.append(blob((0.36, 0.3, 0.42), g(x - 0.32 + k * 0.32, z, 0.78 + (k % 2) * 0.1), LEAF, segments=10))
    return out


def palm(at, h=2.2):
    x, y, _ = at
    out = [kit.cylinder(0.32, 0.5, (x, y, 0.25), WHITE, verts=14), kit.cylinder(0.34, 0.08, (x, y, 0.52), GOLD, verts=14)]
    out.append(kit.cone(0.1, 0.07, h - 0.4, (x, y, 0.5 + (h - 0.4) / 2), WOOD, verts=8))
    for k in range(6):
        a = k * PI / 3
        out.append(blob((0.55, 0.16, 0.05), (x + math.cos(a) * 0.45, y + math.sin(a) * 0.45, h + 0.05), LEAF, segments=8, rot=(0, -0.35, a)))
    return out


# =========================================================================================================
# --- The control tower. ---
X = 0.0
m = Model('sp_tower', X)
p = []
# The block at its foot: white with an aqua band, the door to the front, windows round it.
p.append(kit.box((5.0, 5.0, 3.2), (X, 0, 1.6), WHITE, bevel=0.12))
p.append(kit.box((5.08, 5.08, 0.3), (X, 0, 3.0), AQUA, bevel=0.05))
p.append(kit.box((5.1, 5.1, 0.14), (X, 0, 0.07), GREY, bevel=0.03))
p.append(kit.box((1.5, 0.14, 2.2), (X, -2.52, 1.1), GLASS, bevel=0.02))
p.append(kit.box((1.8, 0.2, 0.18), (X, -2.55, 2.26), NAVY, bevel=0.03))
for e in (-1, 1):
    p.append(kit.box((0.16, 0.2, 2.3), (X + e * 0.84, -2.55, 1.15), NAVY, bevel=0.02))
    for k in (-1, 1):
        p.append(kit.box((0.9, 0.1, 0.8), (X + e * 2.52, k * 1.2, 1.9), GLASS, bevel=0.02, rot=(0, 0, PI / 2)))
p.append(kit.box((2.6, 0.12, 0.62), (X, -2.56, 3.55), NAVY, bevel=0.04))
m.marker('sign', (X, -2.64, 3.55))
# The shaft: tapering up, white with an aqua stripe and a column of stair windows to the front.
p.append(kit.cone(1.45, 1.1, 8.6, (X, 0, 3.2 + 4.3), WHITE, verts=24))
p.append(kit.box((0.34, 0.2, 8.4), (X, -1.24, 7.5), AQUA, bevel=0.03, rot=(-0.04, 0, 0)))
for k in range(5):
    z = 4.4 + k * 1.5
    r = 1.45 - (z - 3.2) / 8.6 * 0.35
    p.append(kit.box((0.36, 0.12, 0.5), (X + 0.5, -r + 0.04, z), GLASS, bevel=0.03))
# Hazard bands near its top, as on real towers.
for k, col in enumerate((ORANGE, WHITE, ORANGE)):
    p.append(kit.cylinder(1.16, 0.3, (X, 0, 10.75 + k * 0.3), col, verts=24))
# The cab's floor and the walkway round it, its rail.
p.append(kit.cone(1.15, 2.1, 0.6, (X, 0, 11.95), NAVY, verts=24))
p.append(kit.cylinder(2.3, 0.18, (X, 0, 12.3), STEEL, verts=32))
p.append(kit.torus(2.28, 0.04, (X, 0, 12.95), STEEL, major_segments=40, minor_segments=5))
for k in range(16):
    a = k * 2 * PI / 16
    p.append(kit.cylinder(0.035, 0.6, (X + math.cos(a) * 2.28, math.sin(a) * 2.28, 12.65), STEEL, verts=5))
# The cab: eight panes of glass leaning out, mullions between.
p.append(kit.cone(1.85, 2.35, 2.4, (X, 0, 13.6), CAB, verts=8, rot=(0, 0, PI / 8)))
for k in range(8):
    a = k * 2 * PI / 8
    base = (X + math.cos(a) * 1.85, math.sin(a) * 1.85, 12.4)
    top = (X + math.cos(a) * 2.35, math.sin(a) * 2.35, 14.8)
    p.append(rod(base, top, 0.07, WHITE, verts=6))
p.append(kit.cylinder(1.9, 0.14, (X, 0, 12.45), WHITE, verts=8, rot=(0, 0, PI / 8)))
# The roof: a broad cap with an aqua rim and bulbs round its edge, a little dome.
p.append(kit.cylinder(2.7, 0.36, (X, 0, 15.0), NAVY, verts=32))
p.append(kit.cylinder(2.76, 0.12, (X, 0, 15.2), AQUA, verts=32))
p.append(kit.sphere(0.9, (X, 0, 15.25), WHITE, segments=16))
for k in range(14):
    a = k * 2 * PI / 14
    p.append(kit.sphere(0.09, (X + math.cos(a) * 2.72, math.sin(a) * 2.72, 14.82), BULB, segments=6))
# The mast, the radar's pedestal, two whip aerials.
p.append(rod((X, 0, 15.9), (X, 0, 17.6), 0.09, STEEL))
p.append(kit.cylinder(0.32, 0.3, (X, 0, 16.05), GREY, verts=14))
for e in (-1, 1):
    p.append(rod((X + e * 1.6, 0.6, 15.3), (X + e * 1.6, 0.6, 16.9), 0.025, DARK, verts=5))
m.mesh(p)
# The radar: a curved bar on a pivot, white with its back struts, turning about Z.
RADAR = (X, 0, 16.35)
r = [kit.cylinder(0.12, 0.3, (X, 0, 16.3), DARK, verts=10)]
for k in range(9):
    t = (k - 4) / 4
    r.append(kit.box((0.34, 0.12, 0.5), (X + t * 1.35, 0.18 + 0.22 * t * t, 16.55), WHITE, bevel=0.03, rot=(0, 0, -t * 0.32)))
r.append(rod((X, 0, 16.4), (X, 0.25, 16.55), 0.05, STEEL, verts=6))
r.append(kit.box((0.18, 0.14, 0.12), (X, 0.25, 16.42), RED, bevel=0.02))
m.part('radar', RADAR, r)
m.marker('beacon', (X, 0, 17.75))

# =========================================================================================================
# --- Gate 4's pier, built where it stands. ---
pier = LAYOUT['pier']
gate4 = LAYOUT['gates']['gate4']
m = Model('sp_pier', 0.0)
p = []
north, south, west, east = pier['minZ'], pier['maxZ'], pier['minX'], pier['maxX']
door = gate4['door']['x']
p += wall_run(west, north, door - 0.75, north)
p += wall_run(door + 0.75, north, east, north)
# The south wall's door from the plaza, where its passengers come in through their own security lane.
lane = LAYOUT['pierSecurity']['arch']['x']
p += wall_run(west, south, lane - 0.9, south)
p += wall_run(lane + 0.9, south, east, south)
for e in (-1, 1):
    p.append(kit.box((0.26, 0.4, 2.6), g(lane + e * 1.0, south, 1.3), NAVY, bevel=0.05))
p.append(kit.box((2.3, 0.4, 0.34), g(lane, south, 2.75), NAVY, bevel=0.05))
p.append(kit.box((2.1, 0.44, 0.1), g(lane, south, 2.98), AQUA, bevel=0.03))
p += wall_run(west, north, west, south)
p += wall_run(east, north, east, south)
for x in (west, (west + door) / 2 - 1.0, east):
    for z in (north, south):
        p += column(x, z)
p += column(west, (north + south) / 2)
p += column(east, (north + south) / 2)
# The portal over the door: its sign, boarding lights, the glass door folded back.
for e in (-1, 1):
    p.append(kit.box((0.34, 0.5, 3.4), g(door + e * 0.95, north, 1.7), NAVY, bevel=0.06))
p.append(kit.box((2.5, 0.5, 0.9), g(door, north, 3.35), NAVY, bevel=0.07))
p.append(kit.box((2.6, 0.56, 0.14), g(door, north, 3.85), AQUA, bevel=0.04))
for k in range(4):
    p.append(kit.sphere(0.07, g(door - 0.9 + k * 0.6, north - 0.3, 3.85), BULB, segments=6))
for e in (-1, 1):
    p.append(kit.box((0.1, 0.42, 2.3), g(door + e * 0.72, north + 0.22, 1.2), PANE, bevel=0.0))
m.marker('gate4', g(door, north - 0.27, 3.35))
for x, z in ((west + 1.0, south - 0.6), (east - 1.0, south - 0.6)):
    p += planter(x, z)
m.mesh(p)

# =========================================================================================================
# --- The stair truck: landing at the origin's -X end, stairs down along +X. ---
X = 20.0
SILL = 2.2 * 20 / 14
m = Model('sp_stairtruck', X)
p = []
# The cab under the landing, the bed under the stairs, hi-vis bands, the wheels.
p.append(kit.box((1.9, 2.1, 1.7), (X + 1.15, 0, 1.15), WHITE, bevel=0.12))
p.append(kit.box((0.1, 1.7, 0.8), (X + 0.2, 0, 1.5), GLASS, bevel=0.03))
for e in (-1, 1):
    p.append(kit.box((1.0, 0.08, 0.6), (X + 1.0, e * 1.06, 1.55), GLASS, bevel=0.02))
p.append(kit.box((5.2, 2.1, 0.5), (X + 3.0, 0, 0.62), AQUA, bevel=0.06))
p.append(kit.box((5.24, 2.14, 0.14), (X + 3.0, 0, 0.42), HIVIS, bevel=0.02))
for wx in (X + 1.2, X + 4.7):
    for e in (-1, 1):
        p += wheel((wx, e * 1.0, 0.42), 0.42, 0.3)
# The landing: a deck at the sill with a hood over it and rails, the stairs down to the ground.
p.append(kit.box((1.2, 1.5, 0.14), (X + 0.6, 0, SILL - 0.07), STEEL, bevel=0.02))
p.append(kit.box((1.3, 1.7, 0.12), (X + 0.65, 0, SILL + 2.25), WHITE, bevel=0.05))
for e in (-1, 1):
    p.append(kit.box((1.2, 0.08, 2.2), (X + 0.65, e * 0.8, SILL + 1.15), PANE, bevel=0.0))
    p.append(kit.box((0.12, 0.12, 2.3), (X + 1.25, e * 0.8, SILL + 1.15), WHITE, bevel=0.02))
RUN = 4.4
STEPS = 13
for k in range(STEPS):
    t = (k + 0.5) / STEPS
    p.append(kit.box((RUN / STEPS + 0.04, 1.3, 0.07), (X + 1.2 + t * RUN, 0, SILL * (1 - t) + 0.02), GREY, bevel=0.01))
for e in (-1, 1):
    p.append(rod((X + 1.2, e * 0.72, SILL + 0.95), (X + 1.2 + RUN, e * 0.72, 0.95), 0.045, SUN, verts=6))
    p.append(rod((X + 1.2, e * 0.72, SILL), (X + 1.2 + RUN, e * 0.72, 0.05), 0.07, STEEL, verts=6))
    for k in range(4):
        t = k / 3
        p.append(rod((X + 1.2 + t * RUN, e * 0.72, SILL * (1 - t)), (X + 1.2 + t * RUN, e * 0.72, SILL * (1 - t) + 0.95), 0.03, SUN, verts=5))
m.mesh(p)

# =========================================================================================================
# --- The belt loader: its belt's top end at the origin, rising along -X. ---
X = 30.0
TOP = 1.65
m = Model('sp_beltloader', X)
p = []
p.append(kit.box((3.4, 1.3, 0.45), (X + 2.0, 0, 0.55), WHITE, bevel=0.06))
p.append(kit.box((3.44, 1.34, 0.12), (X + 2.0, 0, 0.4), HIVIS, bevel=0.02))
for wx in (X + 0.8, X + 3.2):
    for e in (-1, 1):
        p += wheel((wx, e * 0.62, 0.3), 0.3, 0.22)
# The driver's seat and wheel by the low end.
p.append(kit.box((0.5, 0.5, 0.4), (X + 3.2, 0.3, 1.0), DARK, bevel=0.05))
p.append(kit.box((0.1, 0.5, 0.6), (X + 3.45, 0.3, 1.3), DARK, bevel=0.03))
p.append(rod((X + 2.8, 0.3, 1.0), (X + 2.7, 0.3, 1.35), 0.025, DARK, verts=5))
# The belt: a frame on two struts, rising from 0.7 m at +X to TOP at the origin, side rails.
L0, L1 = X + 3.4, X + 0.1
ang = math.atan2(TOP - 0.7, L0 - L1)
mid = ((L0 + L1) / 2, 0, (TOP + 0.7) / 2)
blen = math.hypot(L0 - L1, TOP - 0.7)
p.append(kit.box((blen, 0.8, 0.14), mid, GREY, bevel=0.02, rot=(0, ang, 0)))
for e in (-1, 1):
    p.append(kit.box((blen, 0.06, 0.18), (mid[0], e * 0.43, mid[2] + 0.08), SUN, bevel=0.01, rot=(0, ang, 0)))
p.append(rod((X + 1.2, 0, 0.8), (X + 1.0, 0, TOP - 0.25), 0.06, STEEL))
p.append(rod((X + 2.2, 0, 0.8), (X + 2.0, 0, 1.1), 0.06, STEEL))
m.mesh(p)
# The belt's cleats: ribs along it (the game slides them, one rib's spacing at a time).
c = []
for k in range(10):
    t = (k + 0.5) / 10
    c.append(kit.box((0.05, 0.72, 0.05), (L1 + (L0 - L1) * t, 0, TOP + (0.7 - TOP) * t + 0.09), DARK, bevel=0.0, rot=(0, ang, 0)))
m.part('belt', (X, 0, TOP), c)

# =========================================================================================================
# --- The VIP lounge, built where it stands. ---
vip = LAYOUT['vip']
lounge = vip['lounge']
m = Model('sp_vip', 0.0)
p = []
north, south, west, east = lounge['minZ'], lounge['maxZ'], lounge['minX'], lounge['maxX']
dx = vip['door']['x']
p += wall_run(west, north, dx - 0.95, north, GOLD)
p += wall_run(dx + 0.95, north, east, north, GOLD)
p += wall_run(west, south, dx - 0.95, south, GOLD)
p += wall_run(dx + 0.95, south, east, south, GOLD)
p += wall_run(west, north, west, south, GOLD)
p += wall_run(east, north, east, south, GOLD)
for x in (west, east):
    for z in (north, south):
        p += column(x, z, GOLD)
# The arches over both doorways: gold posts, a navy header for the sign, bulbs.
for z, name in ((north, 'sign'), (south, 'sign2')):
    for e in (-1, 1):
        p.append(kit.box((0.3, 0.5, 3.2), g(dx + e * 1.15, z, 1.6), GOLD, bevel=0.06))
        p.append(kit.sphere(0.2, g(dx + e * 1.15, z, 3.32), GOLD, segments=12))
    p.append(kit.box((2.6, 0.46, 0.8), g(dx, z, 2.95), NAVY, bevel=0.07))
    for k in range(5):
        p.append(kit.sphere(0.06, g(dx - 1.0 + k * 0.5, z + (0.3 if z == south else -0.3), 3.42), BULB, segments=6))
    m.marker(name, g(dx, z + (0.26 if z == south else -0.26), 2.95))
# Velvet ropes along the way through, on gold posts.
for e in (-1, 1):
    for k in range(5):
        z = north + 1.4 + k * (south - north - 2.8) / 4
        p.append(kit.cylinder(0.05, 0.95, g(dx + e * 1.0, z, 0.48), GOLD, verts=8))
        p.append(kit.sphere(0.08, g(dx + e * 1.0, z, 0.98), GOLD, segments=8))
        p.append(kit.cylinder(0.18, 0.05, g(dx + e * 1.0, z, 0.03), GOLD, verts=12))
    p += rig.tube([g(dx + e * 1.0, north + 1.4 + k * (south - north - 2.8) / 4, 0.86) for k in range(5)], 0.035, VELVET, verts=6)
# The champagne bar: a gold-topped counter, bottles on a mirrored shelf behind, an ice bucket.
bx, bz = vip['bar']['x'], vip['bar']['z']
p.append(kit.box((0.75, 2.6, 1.05), g(bx, bz, 0.52), NAVY, bevel=0.05))
p.append(kit.box((0.85, 2.7, 0.08), g(bx, bz, 1.08), GOLD, bevel=0.03))
p.append(kit.box((0.3, 2.8, 2.0), g(west + 0.35, bz, 1.0), '#dfe9f2', bevel=0.03))
for row in range(2):
    p.append(kit.box((0.34, 2.6, 0.04), g(west + 0.45, bz, 1.0 + row * 0.55), GOLD, bevel=0.0))
    for k in range(7):
        y = bz - 1.1 + k * 0.37
        col = (GREEN, '#2f5d3a', GOLD, '#7a1f2b')[(k + row) % 4]
        p.append(kit.cylinder(0.06, 0.32, g(west + 0.45, y, 1.18 + row * 0.55), col, verts=10))
        p.append(kit.cylinder(0.025, 0.1, g(west + 0.45, y, 1.39 + row * 0.55), GOLD, verts=6))
p.append(kit.cylinder(0.17, 0.26, g(bx, bz + 0.6, 1.25), CHROME, verts=16))
p.append(kit.cylinder(0.06, 0.4, g(bx, bz + 0.6, 1.4), '#2f5d3a', verts=10, rot=(0.25, 0, 0)))
for k in range(3):
    p.append(kit.cone(0.05, 0.03, 0.2, g(bx, bz - 0.5 + k * 0.2, 1.22), PANE, verts=8))
m.marker('bar', g(bx, bz, 1.12))
# Two sofas facing over a low table, palms in the corners, a rug.
sx, sz = vip['seat']['x'], vip['seat']['z']
p.append(kit.cylinder(1.6, 0.03, g(sx, sz, 0.015), '#6b2a7a', verts=32))
p.append(kit.cylinder(0.55, 0.42, g(sx, sz, 0.21), GOLD, verts=20))
p.append(kit.cylinder(0.58, 0.05, g(sx, sz, 0.44), WHITE, verts=20))
for e in (-1, 1):
    p.append(kit.box((2.0, 0.8, 0.42), g(sx, sz + e * 1.35, 0.21), CREAM, bevel=0.12))
    p.append(kit.box((2.0, 0.25, 0.75), g(sx, sz + e * 1.68, 0.5), PURPLE, bevel=0.1))
    for k in (-1, 1):
        p.append(kit.box((0.25, 0.8, 0.6), g(sx + k * 1.0, sz + e * 1.35, 0.35), PURPLE, bevel=0.09))
for x, z in ((east - 0.7, north + 0.7), (east - 0.7, south - 0.7), (west + 0.7, south - 0.7)):
    p += palm(g(x, z), 2.0)
# The photographers' lamps outside the south door.
for e in (-1, 1):
    lx, lz = dx + e * 3.2, south + 2.6
    p.append(rod(g(lx, lz, 0.0), g(lx, lz, 2.0), 0.04, DARK, verts=6))
    for k in range(3):
        a = k * 2 * PI / 3
        p.append(rod(g(lx, lz, 0.9), g(lx + math.cos(a) * 0.45, lz + math.sin(a) * 0.45, 0.0), 0.025, DARK, verts=5))
    p.append(kit.box((0.45, 0.4, 0.35), g(lx, lz, 2.15), DARK, bevel=0.05, rot=(0.5 * (-1), 0, 0)))
    p.append(kit.box((0.36, 0.04, 0.28), g(lx, lz - 0.21, 2.12), BULB, bevel=0.0))
m.mesh(p)

# --- The red carpet: a metre of it, along +Y here, gold-edged. ---
X = 40.0
m = Model('sp_carpet', X)
p = [kit.box((1.3, 1.0, 0.03), (X, 0.5, 0.015), VELVET, bevel=0.0)]
for e in (-1, 1):
    p.append(kit.box((0.08, 1.0, 0.035), (X + e * 0.62, 0.5, 0.018), GOLD, bevel=0.0))
m.mesh(p)

# =========================================================================================================
# --- The limousine: long, black, chrome and gold. ---
X = 46.0
m = Model('sp_limo', X)
p = []
LEN = 6.6
p.append(kit.box((1.9, LEN, 0.62), (X, 0, 0.62), LIMO, bevel=0.14))
p.append(kit.box((1.74, LEN - 2.3, 0.5), (X, 0.25, 1.15), LIMO, bevel=0.12))
p.append(kit.box((1.78, 0.5, 0.42), (X, -LEN / 2 + 1.55, 1.1), GLASS, bevel=0.08, rot=(-0.45, 0, 0)))
p.append(kit.box((1.78, 0.4, 0.4), (X, LEN / 2 - 0.85, 1.1), GLASS, bevel=0.08, rot=(0.4, 0, 0)))
for e in (-1, 1):
    for k in range(4):
        y = -1.6 + k * 1.15
        p.append(kit.box((0.04, 0.95, 0.34), (X + e * 0.88, y, 1.18), GLASS, bevel=0.02))
    p.append(kit.box((0.04, LEN - 0.4, 0.05), (X + e * 0.96, 0, 0.84), GOLD, bevel=0.0))
    p.append(kit.box((0.3, 0.06, 0.16), (X + e * 0.65, -LEN / 2 - 0.02, 0.72), BULB, bevel=0.02))
    p.append(kit.box((0.3, 0.06, 0.14), (X + e * 0.65, LEN / 2 + 0.02, 0.74), RED, bevel=0.02))
p.append(kit.box((1.2, 0.08, 0.3), (X, -LEN / 2 - 0.03, 0.55), CHROME, bevel=0.03))
p.append(kit.box((1.95, 0.16, 0.12), (X, -LEN / 2 + 0.02, 0.38), CHROME, bevel=0.04))
p.append(kit.box((1.95, 0.16, 0.12), (X, LEN / 2 - 0.02, 0.38), CHROME, bevel=0.04))
p.append(kit.sphere(0.08, (X, -LEN / 2 + 0.2, 0.98), GOLD, segments=8))
m.mesh(p)
for name, y in (('wheel_f', -LEN / 2 + 1.05), ('wheel_r', LEN / 2 - 1.05)):
    w = []
    for e in (-1, 1):
        w += wheel((X + e * 0.88, y, 0.36), 0.36, 0.26)
    m.part(name, (X, y, 0.36), w)

# =========================================================================================================
# --- Mogul Air's office: counter to the front, the routes board behind, the souvenir shelf to the left. ---
X = 60.0
m = Model('sp_mogul', X)
office = LAYOUT['mogul']['office']
W = office['maxX'] - office['minX']
D = office['maxZ'] - office['minZ']
p = []
# The floor, the back wall with the routes board, the side walls (the left one holds the shelf).
p.append(kit.box((W, D, 0.1), (X, 0, 0.05), '#e8eef4', bevel=0.02))
p.append(kit.box((W, 0.3, 3.3), (X, D / 2 - 0.15, 1.65), WHITE, bevel=0.06))
p.append(kit.box((W + 0.04, 0.34, 0.24), (X, D / 2 - 0.15, 3.35), AIRLINE, bevel=0.05))
p.append(kit.box((4.4, 0.08, 2.1), (X + 1.15, D / 2 - 0.33, 1.95), NAVY, bevel=0.03))
m.marker('board', (X + 1.15, D / 2 - 0.38, 1.95))
for e in (-1, 1):
    p.append(kit.box((0.3, D, 1.3), (X + e * (W / 2 - 0.15), 0, 0.65), WHITE, bevel=0.05))
    p.append(kit.box((0.34, D, 0.12), (X + e * (W / 2 - 0.15), 0, 1.32), AIRLINE, bevel=0.03))
# The souvenir shelf on the back wall beside the board, open to the front: three shelves of four.
SX = X - W / 2 + 1.12
p.append(kit.box((2.0, 0.08, 2.2), (SX, D / 2 - 0.36, 1.2), WOOD, bevel=0.02))
for e in (-1, 1):
    p.append(kit.box((0.08, 0.5, 2.2), (SX + e * 0.98, D / 2 - 0.6, 1.2), WOOD, bevel=0.02))
p.append(kit.box((2.04, 0.5, 0.08), (SX, D / 2 - 0.6, 2.3), WOOD, bevel=0.02))
slot = 0
for row in range(3):
    zf = 0.42 + row * 0.62
    p.append(kit.box((1.9, 0.48, 0.05), (SX, D / 2 - 0.6, zf), CREAM, bevel=0.0))
    for k in range(4):
        m.marker(f'slot{slot}', (SX - 0.69 + k * 0.46, D / 2 - 0.62, zf + 0.03))
        slot += 1
# The counter: the airline's colour, a white top, a till, a little plane on a pole, a globe.
p.append(kit.box((W - 1.8, 0.8, 1.05), (X + 0.6, -D / 2 + 0.9, 0.52), AIRLINE, bevel=0.06))
p.append(kit.box((W - 1.7, 0.9, 0.08), (X + 0.6, -D / 2 + 0.9, 1.09), WHITE, bevel=0.03))
p.append(kit.box((0.4, 0.32, 0.24), (X + 2.2, -D / 2 + 0.95, 1.25), DARK, bevel=0.03))
p.append(kit.box((0.34, 0.05, 0.2), (X + 2.2, -D / 2 + 0.78, 1.4), SCREEN, bevel=0.01, rot=(0.4, 0, 0)))
gx, gy = X + W / 2 - 0.75, -D / 2 + 1.0
p.append(kit.cylinder(0.25, 0.08, (gx, gy, 0.04), GOLD, verts=14))
p.append(rod((gx, gy, 0.08), (gx, gy, 1.0), 0.04, GOLD, verts=6))
p.append(kit.sphere(0.45, (gx, gy, 1.45), BLUE, segments=18))
for k in range(4):
    p.append(blob((0.18, 0.2, 0.12), (gx + math.cos(k * 1.7) * 0.36, gy + math.sin(k * 1.7) * 0.36, 1.45 + (k - 1.5) * 0.18), GREEN, segments=8))
p.append(kit.torus(0.5, 0.025, (gx, gy, 1.45), GOLD, rot=(0.4, 0, 0), major_segments=24, minor_segments=4))
# The awning over the counter in the airline's colour, the sign over it, a little plane up on a pole.
STR = 7
for k in range(STR):
    x = X - W / 2 + (k + 0.5) * W / STR
    p.append(kit.box((W / STR, 1.4, 0.06), (x, -D / 2 + 0.8, 2.7), AIRLINE if k % 2 else WHITE, bevel=0.0, rot=(0.18, 0, 0)))
for e in (-1, 1):
    p.append(kit.box((0.12, 0.12, 2.75), (X + e * (W / 2 - 0.2), -D / 2 + 0.15, 1.37), WHITE, bevel=0.03))
p.append(kit.box((3.6, 0.12, 0.6), (X, -D / 2 + 0.12, 3.25), NAVY, bevel=0.04))
m.marker('sign', (X, -D / 2 + 0.04, 3.25))
px, py = X - W / 2 + 0.35, -D / 2 + 0.3
p.append(rod((px, py, 0), (px, py, 3.8), 0.05, STEEL, verts=6))
p.append(blob((0.14, 0.6, 0.14), (px, py, 3.95), WHITE, segments=10))
p.append(kit.box((1.0, 0.22, 0.04), (px, py - 0.05, 3.95), AIRLINE, bevel=0.01))
p.append(kit.box((0.04, 0.2, 0.3), (px, py + 0.5, 4.1), AIRLINE, bevel=0.01))
m.mesh(p)

# --- The souvenirs: one from each of Mogul Air's twelve cities, side by side. ---
X = 70.0
m = Model('sp_souvenirs', X)


def souvenir(k, x):
    """A small souvenir about 0.35 m tall standing at (x, 0, 0)."""
    o = []
    if k == 0:  # A pink seashell (Sunny Cove).
        o.append(blob((0.16, 0.14, 0.12), (x, 0, 0.12), '#ffb3c8', segments=12))
        o.append(kit.cone(0.1, 0.01, 0.22, (x, 0.08, 0.12), '#ff8fb0', verts=10, rot=(-1.3, 0, 0)))
    elif k == 1:  # A jar of maple syrup with a leaf (Maple Falls).
        o.append(kit.cylinder(0.11, 0.24, (x, 0, 0.12), '#c8761e', verts=14))
        o.append(kit.cylinder(0.12, 0.06, (x, 0, 0.27), RED, verts=14))
        o.append(kit.star_disc(0.08, 0.04, 0.02, (x, -0.115, 0.13), RED, points=5, twist=0))
    elif k == 2:  # A striped lighthouse (Port Willow).
        for j in range(4):
            o.append(kit.cone(0.1 - j * 0.012, 0.088 - j * 0.012, 0.075, (x, 0, 0.04 + j * 0.075), RED if j % 2 == 0 else WHITE, verts=12))
        o.append(kit.cylinder(0.06, 0.06, (x, 0, 0.36), BULB, verts=10))
        o.append(kit.cone(0.07, 0.0, 0.07, (x, 0, 0.42), RED, verts=10))
    elif k == 3:  # A cactus in a pot (Cactus Springs).
        o.append(kit.cone(0.1, 0.08, 0.1, (x, 0, 0.05), '#d87a4a', verts=12))
        o.append(blob((0.06, 0.06, 0.15), (x, 0, 0.24), '#4f9e4a', segments=10))
        o.append(blob((0.035, 0.035, 0.07), (x + 0.07, 0, 0.26), '#4f9e4a', segments=8))
        o.append(kit.sphere(0.025, (x, 0, 0.39), PINK, segments=6))
    elif k == 4:  # A snow globe (Snow Peak).
        o.append(kit.cylinder(0.11, 0.08, (x, 0, 0.04), WOOD, verts=14))
        o.append(kit.sphere(0.12, (x, 0, 0.19), '#d9f2ff', segments=14))
        o.append(kit.cone(0.05, 0.0, 0.12, (x, 0, 0.17), '#3f7a5a', verts=8))
    elif k == 5:  # A branch of coral (Coral Bay).
        o.append(kit.cylinder(0.08, 0.04, (x, 0, 0.02), CREAM, verts=10))
        for a, h in ((0.0, 0.3), (0.6, 0.22), (-0.6, 0.24), (1.4, 0.16)):
            o.append(rod((x, 0, 0.03), (x + math.sin(a) * 0.12, math.cos(a) * 0.03, h), 0.025, '#ff7a6b', verts=6))
    elif k == 6:  # A ship in a bottle (Old Harbour).
        o.append(kit.cylinder(0.08, 0.3, (x, 0, 0.09), '#cfeee6', verts=12, rot=(0, PI / 2, 0)))
        o.append(kit.cylinder(0.035, 0.08, (x + 0.19, 0, 0.09), WOOD, verts=8, rot=(0, PI / 2, 0)))
        o.append(kit.box((0.14, 0.04, 0.03), (x, 0, 0.06), WOOD, bevel=0.0))
        o.append(kit.box((0.01, 0.03, 0.08), (x, 0, 0.11), WHITE, bevel=0.0))
        o.append(kit.box((0.2, 0.05, 0.02), (x, 0, 0.0), DARK, bevel=0.0))
    elif k == 7:  # A paper lantern (Lantern City).
        o.append(blob((0.12, 0.12, 0.14), (x, 0, 0.18), RED, segments=12))
        for z in (0.05, 0.31):
            o.append(kit.cylinder(0.07, 0.03, (x, 0, z), GOLD, verts=12))
        o.append(kit.box((0.01, 0.01, 0.06), (x, 0, 0.01), GOLD, bevel=0.0))
    elif k == 8:  # A sandstone pyramid (Pyramid Sands).
        o.append(kit.cone(0.17, 0.0, 0.26, (x, 0, 0.13), '#e3c27a', verts=4, rot=(0, 0, PI / 4)))
    elif k == 9:  # A parrot on its perch (Rainforest Reach).
        o.append(rod((x - 0.1, 0, 0.12), (x + 0.1, 0, 0.12), 0.015, WOOD, verts=5))
        o.append(rod((x, 0, 0.0), (x, 0, 0.12), 0.015, WOOD, verts=5))
        o.append(blob((0.06, 0.06, 0.1), (x, 0, 0.22), RED, segments=10))
        o.append(kit.sphere(0.05, (x, -0.01, 0.33), RED, segments=10))
        o.append(kit.cone(0.02, 0.0, 0.05, (x, -0.06, 0.32), SUN, verts=6, rot=(PI / 2, 0, 0)))
        for e in (-1, 1):
            o.append(blob((0.02, 0.05, 0.08), (x + e * 0.055, 0.01, 0.22), BLUE, segments=8))
        o.append(blob((0.025, 0.03, 0.1), (x, 0.03, 0.1), SUN, segments=8, rot=(0.3, 0, 0)))
    elif k == 10:  # A polar bear plush (Aurora North).
        o.append(blob((0.1, 0.09, 0.09), (x, 0, 0.1), WHITE, segments=12))
        o.append(kit.sphere(0.075, (x, -0.04, 0.24), WHITE, segments=12))
        for e in (-1, 1):
            o.append(kit.sphere(0.025, (x + e * 0.05, -0.04, 0.31), WHITE, segments=6))
        o.append(kit.sphere(0.015, (x, -0.11, 0.24), DARK, segments=6))
    else:  # A coconut drink with a paper umbrella (Paradise Isles).
        o.append(blob((0.12, 0.12, 0.09), (x, 0, 0.09), '#7a4a2a', segments=12))
        o.append(kit.cylinder(0.1, 0.02, (x, 0, 0.17), WHITE, verts=12))
        o.append(rod((x, 0, 0.16), (x + 0.05, 0, 0.32), 0.01, PINK, verts=5))
        o.append(kit.cone(0.09, 0.0, 0.05, (x - 0.04, 0, 0.3), MINT, verts=8))
    return o


for k in range(12):
    sx = X + k * 0.6
    m.part(f's{k}', (sx, 0, 0), souvenir(k, sx))

# =========================================================================================================
# --- The shuttle bus: doors on the right (-X here), front to -Y. ---
X = 90.0
m = Model('sp_shuttle', X)
p = []
BL = 8.4
p.append(kit.box((2.4, BL, 2.4), (X, 0, 1.55), WHITE, bevel=0.22))
p.append(kit.box((2.44, BL - 0.2, 0.55), (X, 0, 0.62), AQUA, bevel=0.1))
p.append(kit.box((2.46, BL - 0.3, 0.12), (X, 0, 0.98), SUN, bevel=0.03))
p.append(kit.box((2.3, 0.1, 1.05), (X, -BL / 2 - 0.02, 1.85), GLASS, bevel=0.05))
p.append(kit.box((1.6, 0.06, 0.32), (X, -BL / 2 - 0.05, 2.55), DARK, bevel=0.03))
m.marker('sign', (X, -BL / 2 - 0.09, 2.55))
for e in (-1, 1):
    for k in range(5):
        y = -2.6 + k * 1.45
        if e < 0 and k == 0:
            continue
        p.append(kit.box((0.06, 1.25, 0.9), (X + e * 1.2, y, 1.95), GLASS, bevel=0.03))
    p.append(kit.box((0.32, 0.06, 0.18), (X + e * 0.82, -BL / 2 - 0.03, 0.85), BULB, bevel=0.02))
    p.append(kit.box((0.28, 0.06, 0.2), (X + e * 0.85, BL / 2 + 0.03, 0.95), RED, bevel=0.02))
p.append(kit.box((2.0, 0.6, 0.24), (X, 0.6, 2.86), GREY, bevel=0.06))
m.marker('side', (X + 1.23, 0.9, 1.0))
p.append(kit.box((2.3, 0.08, 0.3), (X, -BL / 2 - 0.03, 0.42), DARK, bevel=0.04))
m.mesh(p)
door = [kit.box((0.07, 1.1, 2.0), (X - 1.22, -BL / 2 + 1.0, 1.4), GLASS, bevel=0.03)]
door.append(kit.box((0.08, 1.12, 0.1), (X - 1.23, -BL / 2 + 1.0, 0.45), AQUA, bevel=0.02))
m.part('door', (X - 1.22, -BL / 2 + 1.0, 0.4), door)
for name, y in (('wheel_f', -BL / 2 + 1.6), ('wheel_r', BL / 2 - 1.8)):
    w = []
    for e in (-1, 1):
        w += wheel((X + e * 1.05, y, 0.5), 0.5, 0.34)
    m.part(name, (X, y, 0.5), w)

# --- The shuttle's shelter: a canopy, a glass back, a bench, a post with its sign. ---
X = 100.0
m = Model('sp_busstop', X)
p = []
p.append(kit.box((4.6, 1.8, 0.14), (X, 0, 2.6), AQUA, bevel=0.05, rot=(0.08, 0, 0)))
p.append(kit.box((4.7, 1.9, 0.06), (X, 0, 2.7), WHITE, bevel=0.02, rot=(0.08, 0, 0)))
p.append(kit.box((4.4, 0.08, 2.2), (X, 0.8, 1.35), PANE, bevel=0.0))
for e in (-1, 1):
    p.append(kit.box((0.12, 0.12, 2.6), (X + e * 2.2, 0.8, 1.3), WHITE, bevel=0.03))
    p.append(kit.box((0.12, 0.12, 2.4), (X + e * 2.2, -0.7, 1.2), WHITE, bevel=0.03))
p.append(kit.box((3.2, 0.5, 0.1), (X, 0.45, 0.5), WOOD, bevel=0.03))
for e in (-1, 1):
    p.append(kit.box((0.08, 0.4, 0.5), (X + e * 1.4, 0.45, 0.25), STEEL, bevel=0.02))
p.append(kit.box((1.0, 0.06, 1.4), (X + 1.5, 0.74, 1.4), NAVY, bevel=0.02))
p.append(rod((X - 2.7, -0.8, 0), (X - 2.7, -0.8, 3.0), 0.06, STEEL, verts=8))
p.append(kit.box((1.0, 0.1, 0.62), (X - 2.7, -0.8, 3.0), NAVY, bevel=0.04))
m.marker('sign', (X - 2.7, -0.86, 3.0))
p.append(kit.box((4.8, 2.2, 0.06), (X, 0, 0.03), '#d9dde3', bevel=0.02))
m.mesh(p)

# --- The bag sorter: housing, scanner arch, the belt loop on top, coloured chutes out the back. ---
X = 110.0
m = Model('sp_sorter', X)
p = []
p.append(kit.box((2.8, 2.0, 0.9), (X, 0.1, 0.45), STEEL, bevel=0.08))
p.append(kit.box((2.84, 2.04, 0.12), (X, 0.1, 0.06), DARK, bevel=0.02))
p.append(kit.box((2.6, 1.8, 0.12), (X, 0.1, 0.96), DARK, bevel=0.04))
for e in (-1, 1):
    p.append(kit.box((0.3, 0.5, 1.6), (X + e * 0.75, -0.55, 1.6), AQUA, bevel=0.06))
p.append(kit.box((1.8, 0.5, 0.35), (X, -0.55, 2.4), AQUA, bevel=0.06))
p.append(kit.box((1.2, 0.06, 0.22), (X, -0.81, 2.4), SCREEN, bevel=0.02))
m.marker('lamp', (X, -0.55, 2.62))
for k, col in enumerate((PINK, BLUE, GREEN, ORANGE)):
    cx = X - 1.05 + k * 0.7
    p.append(kit.box((0.5, 1.0, 0.12), (cx, 1.35, 0.8), col, bevel=0.03, rot=(-0.35, 0, 0)))
    for e in (-1, 1):
        p.append(kit.box((0.04, 1.0, 0.18), (cx + e * 0.25, 1.35, 0.88), col, bevel=0.0, rot=(-0.35, 0, 0)))
for k, col in enumerate((GREEN, SUN, RED)):
    p.append(kit.sphere(0.07, (X + 1.25, -0.82, 0.55 + k * 0.2), col, segments=8))
m.mesh(p)
belt = []
for k in range(9):
    belt.append(kit.box((0.26, 1.4, 0.04), (X - 1.1 + k * 0.28, 0.1, 1.05), '#2b2f38', bevel=0.0))
m.part('belt', (X, 0.1, 1.05), belt)
arm = [kit.cylinder(0.08, 0.3, (X + 0.9, 0.6, 1.2), CHROME, verts=10), kit.box((0.9, 0.08, 0.2), (X + 0.5, 0.6, 1.2), SUN, bevel=0.02)]
m.part('arm', (X + 0.9, 0.6, 1.2), arm)

out = Path(sys.argv[1] if len(sys.argv) > 1 else 'skyport-tower.glb')
FILES = {
    'tower': ('sp_tower',),
    'pier': ('sp_pier', 'sp_stairtruck', 'sp_beltloader'),
    'vip': ('sp_vip', 'sp_carpet', 'sp_limo'),
    'mogul': ('sp_mogul', 'sp_souvenirs'),
    'shuttle': ('sp_shuttle', 'sp_busstop', 'sp_sorter'),
}
assert sorted(b.name for b in rig.bases) == sorted(n for names in FILES.values() for n in names)
for key, names in FILES.items():
    rig.export_all(out.with_name(out.stem.replace('tower', key) + out.suffix), [b for b in rig.bases if b.name in names])
if len(sys.argv) > 2:
    rig.contact_sheet(sys.argv[2], [b for b in rig.bases if b.name not in ('sp_pier', 'sp_vip')], size=(520, 420), cols=4)
