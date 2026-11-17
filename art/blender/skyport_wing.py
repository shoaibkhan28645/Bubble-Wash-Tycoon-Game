"""Skyport International (Chapter 4, Part B): the terminal's new wing and what's in it.

sp_wing stands at the origin and is built at the town's own coordinates (src/data/towns/skyport/layout.json;
the game's (x, z) is (x, -y) here), like sp_hall: the hall's low glass walls carried on east past where the
hoarding stood, lamp columns, a portal over the jet bridge's door (marker sp_wing_gate3 for its sign), a
frame over the doorway out to the apron (marker sp_wing_apron), the hatch in the east wall the kitchen
serves through.

The rest stand on their own bases, fronts to -Y here (+Z in the game) unless said:

sp_jetbridge: the jet bridge, its rotunda on a column at the origin and its tunnel reaching out along +Y
here (-Z in the game). The outer tunnel sp_jetbridge_outer slides out along +Y; the cab at its end,
sp_jetbridge_cab, turns about Z to meet the plane's door; its wheels sp_jetbridge_wheels; marker _beacon.

sp_catering: the catering truck, cab to -Y, its galley box sp_catering_box rising on scissor arms
(sp_catering_arma / _armb, folding about X) to a jet's back door behind it (+Y); markers _sign, _beacon.

sp_cafe: the café counter, customers' side to -Y: a striped awning on posts, the giant coffee cup on top
(sp_cafe_cup, turning), the espresso machine behind (marker sp_cafe_steam), markers _sign and _menu.
sp_cafetable: a round table and two chairs.

sp_dutyfree: the duty-free shop, customers' side to -Y: a low double-sided display of bottles behind, a glass counter of
watches, a gondola either side, a giant perfume bottle turning on its plinth (sp_dutyfree_turn), marker _sign
(on the front of the board over the display; the game hangs another on its back, which the camera sees).

sp_security: the security lane, people walking through along +X: the arch (marker sp_security_lamp over
it), the X-ray machine beside it on the -Y side here (+Z in the game) with its belt sp_security_belt and
its curtain flaps sp_security_flap0..3, trays, the screen.

sp_kitchen (in a file of its own with sp_security): the catering kitchen (8 by 11 m), its hatch in the west wall (marker sp_kitchen_hatch on the
shelf where trays wait), the roller door on the north side, two extractor fans on the roof
(sp_kitchen_fan1 / _fan2), the flue (marker sp_kitchen_steam), a giant dish on the roof whose lid lifts
(sp_kitchen_lid), marker _sign over the front.

Usage: python art/blender/skyport_wing.py <out.glb> [preview.png]
"""
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import kit  # noqa: E402

kit.reset()
import rig  # noqa: E402
from rig import Model, blob, rod, tube  # noqa: E402

PI = math.pi
LAYOUT = json.loads((Path(__file__).parents[2] / 'src/data/towns/skyport/layout.json').read_text())
WHITE = '#f7f8fa'
PANE = '#bfeef0'
AQUA = '#22c3c9'
AQUA_DEEP = '#14959b'
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
SCREEN = '#1f2a36'
BULB = '#fff3a0'
AMBER = '#ffb02e'
RED = '#e8493f'
GREEN = '#5fb84f'
WOOD = '#c98a52'
WOOD_DARK = '#9a6236'
CREAM = '#ffe9c4'
COFFEE = '#6b3f26'
FRAME = '#dfe6ee'

wing = LAYOUT['wing']
gate3 = LAYOUT['gates']['gate3']


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


def wall_run(x0, z0, x1, z1):
    """A low glass wall from (x0, z0) to (x1, z1) in the game's coordinates, as the hall's (skyport_terminal.py)."""
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
    out.append(kit.box((length, 0.12, 0.06), g(mx, mz, 1.42), AQUA, bevel=0.0, rot=rot))
    n = max(1, round(length / 1.5))
    for k in range(n + 1):
        t = k / n
        x, z = x0 + (x1 - x0) * t, z0 + (z1 - z0) * t
        out.append(kit.box((0.1, 0.16, 1.1), g(x, z, 0.78), WHITE, bevel=0.02, rot=rot))
    return out


def column(x, z):
    """A lamp column as along the hall's walls: white, an aqua cap, a globe."""
    return [
        kit.box((0.5, 0.5, 2.3), g(x, z, 1.15), WHITE, bevel=0.08),
        kit.box((0.66, 0.66, 0.2), g(x, z, 2.36), AQUA, bevel=0.05),
        kit.sphere(0.24, g(x, z, 2.68), BULB, segments=12),
        kit.cylinder(0.12, 0.12, g(x, z, 2.5), STEEL, verts=10),
    ]


# =========================================================================================================
# --- The wing, built where it stands. ---
m = Model('sp_wing', 0.0)
p = []
north, south = wing['minZ'], wing['maxZ']
west, east = wing['minX'], wing['maxX']
apron = gate3['apron']['x']
door = gate3['door']['x']
HATCH = (LAYOUT['kitchen']['hatch']['z'] - 0.8, LAYOUT['kitchen']['hatch']['z'] + 0.8)
p += wall_run(west, north, apron - 1.5, north)
p += wall_run(apron + 1.5, north, door - 0.75, north)
p += wall_run(door + 0.75, north, east, north)
p += wall_run(west, south, east, south)
p += wall_run(east, north, east, HATCH[0])
p += wall_run(east, HATCH[1], east, south)
# Lamp columns along the long walls, clear of the doorways; a column at each corner where the wing meets the hall.
for x in (west, west + 3.6, 2.2, 9.6, east):
    for z in (north, south):
        if z == north and (abs(x - apron) < 2.0 or abs(x - door) < 1.6):
            continue
        p += column(x, z)
for z in (14.0, 22.0):
    p += column(east, z)
# The frame over the doorway out to the apron: posts, a header with lamps, a small canopy.
for e in (-1, 1):
    p.append(kit.box((0.36, 0.5, 3.0), g(apron + e * 1.65, north, 1.5), NAVY, bevel=0.06))
p.append(kit.box((3.7, 0.5, 0.6), g(apron, north, 3.0), NAVY, bevel=0.06))
p.append(kit.box((3.8, 0.56, 0.12), g(apron, north, 3.36), AQUA, bevel=0.04))
for k in range(4):
    p.append(kit.sphere(0.06, g(apron - 1.2 + k * 0.8, north - 0.3, 3.36), BULB, segments=6))
m.marker('apron', g(apron, north + 0.26, 3.0))
# The portal over the jet bridge's door: taller, its sign over the door, boarding lights.
for e in (-1, 1):
    p.append(kit.box((0.34, 0.5, 3.6), g(door + e * 0.95, north, 1.8), NAVY, bevel=0.06))
p.append(kit.box((2.5, 0.5, 0.95), g(door, north, 3.55), NAVY, bevel=0.07))
p.append(kit.box((2.6, 0.56, 0.14), g(door, north, 4.06), AQUA, bevel=0.04))
for k in range(4):
    p.append(kit.sphere(0.07, g(door - 0.9 + k * 0.6, north - 0.3, 4.06), BULB, segments=6))
# The glass door into the bridge, open (folded back either side).
for e in (-1, 1):
    p.append(kit.box((0.1, 0.42, 2.3), g(door + e * 0.72, north + 0.22, 1.2), PANE, bevel=0.0))
p.append(kit.box((1.5, 0.3, 0.14), g(door, north, 2.42), FRAME, bevel=0.02))
m.marker('gate3', g(door, north + 0.26, 3.55))
# The kitchen's hatch in the east wall: a stainless counter under it, a frame round it.
hz = (HATCH[0] + HATCH[1]) / 2
p.append(kit.box((0.5, HATCH[1] - HATCH[0], 0.95), g(east, hz, 0.48), WHITE, bevel=0.04))
for e in (-1, 1):
    p.append(kit.box((0.4, 0.14, 2.4), g(east, hz + e * 0.85, 1.2), NAVY, bevel=0.03))
p.append(kit.box((0.4, 1.84, 0.2), g(east, hz, 2.4), NAVY, bevel=0.03))
p.append(kit.box((0.42, 1.86, 0.08), g(east, hz, 2.54), ORANGE, bevel=0.02))
# Planters along the south wall, and a big round rug where Gate 3's lounge meets the shops.
for x in (0.6, 12.6):
    p.append(kit.box((1.2, 0.7, 0.5), g(x, south - 0.6, 0.25), WHITE, bevel=0.06))
    for k in range(3):
        p.append(blob((0.36, 0.3, 0.42), g(x - 0.32 + k * 0.32, south - 0.6, 0.78 + (k % 2) * 0.1), '#4fae5a', segments=10))
m.mesh(p)

# =========================================================================================================
# --- The jet bridge: rotunda at the origin on its column, the tunnel along +Y here. ---
FLOOR = 2.2
m = Model('sp_jetbridge', 30.0)
X = 30.0
p = [kit.cylinder(0.32, FLOOR - 0.15, (X, 0, (FLOOR - 0.15) / 2), STEEL, verts=14)]
p.append(kit.cylinder(0.7, 0.18, (X, 0, 0.09), GREY, verts=16))
p.append(kit.cylinder(1.25, 0.3, (X, 0, FLOOR - 0.1), DARK, verts=24))
p.append(kit.cylinder(1.22, 2.3, (X, 0, FLOOR + 1.15), WHITE, verts=24))
p.append(kit.cylinder(1.24, 0.5, (X, 0, FLOOR + 1.25), GLASS, verts=24))
p.append(kit.cylinder(1.3, 0.16, (X, 0, FLOOR + 2.35), AQUA, verts=24))
p.append(kit.cylinder(1.18, 0.12, (X, 0, FLOOR + 2.48), WHITE, verts=24))
# The stair tower beside the rotunda, for the ground crew.
p.append(kit.box((0.9, 0.9, FLOOR), (X + 1.45, 0.3, FLOOR / 2), GREY, bevel=0.02))
for k in range(7):
    p.append(kit.box((0.85, 0.24, 0.05), (X + 1.45, 0.55 - k * 0.0, 0.3 + k * 0.28), SUN, bevel=0.0))
# The fixed inner tunnel: white with a window strip each side and an aqua band.
IN0, IN1 = 1.1, 4.3


def tunnel(y0, y1, w, h, col_band):
    out = [kit.box((w, y1 - y0, h), (X, (y0 + y1) / 2, FLOOR - 0.15 + h / 2), WHITE, bevel=0.06)]
    for e in (-1, 1):
        out.append(kit.box((0.04, y1 - y0 - 0.3, 0.42), (X + e * (w / 2 + 0.005), (y0 + y1) / 2, FLOOR + 1.35), GLASS, bevel=0.0))
        out.append(kit.box((0.04, y1 - y0, 0.16), (X + e * (w / 2 + 0.01), (y0 + y1) / 2, FLOOR + 0.55), col_band, bevel=0.0))
    out.append(kit.box((w + 0.04, y1 - y0, 0.1), (X, (y0 + y1) / 2, FLOOR - 0.15 + h), CHROME, bevel=0.02))
    for k in range(int((y1 - y0) / 0.9) + 1):
        out.append(kit.box((w + 0.06, 0.05, h + 0.04), (X, y0 + 0.2 + k * 0.9, FLOOR - 0.15 + h / 2), STEEL, bevel=0.0))
    return out


p += tunnel(IN0, IN1, 1.9, 2.3, AQUA)
m.mesh(p)
# The outer tunnel, sliding over the inner one; its wheels on a leg near its end; the cab beyond.
OUT0, OUT1 = 3.7, 6.1
q = tunnel(OUT0, OUT1, 2.1, 2.5, AQUA_DEEP)
LEG_Y = OUT1 - 0.6
for e in (-1, 1):
    q.append(rod((X + e * 0.55, LEG_Y, FLOOR - 0.2), (X + e * 0.55, LEG_Y, 0.55), 0.09, STEEL, verts=8))
q.append(kit.box((1.5, 0.4, 0.22), (X, LEG_Y, 0.55), DARK, bevel=0.03))
m.part('outer', (X, OUT0, FLOOR), q)
m.part('wheels', (X, LEG_Y, 0.32), wheel((X - 0.55, LEG_Y, 0.32), 0.32, 0.22) + wheel((X + 0.55, LEG_Y, 0.32), 0.32, 0.22), on='outer')
# The cab: a box with a bellows canopy that meets the plane, a control window, a beacon on its roof.
CAB_Y = OUT1 + 0.55
c = [kit.box((2.4, 1.1, 2.6), (X, CAB_Y, FLOOR - 0.15 + 1.3), WHITE, bevel=0.07)]
c.append(kit.box((2.42, 0.6, 0.5), (X, CAB_Y - 0.1, FLOOR + 1.35), GLASS, bevel=0.0))
for k in range(5):
    c.append(kit.box((2.3 - k * 0.06, 0.12, 2.4 - k * 0.06), (X, CAB_Y + 0.6 + k * 0.12, FLOOR - 0.15 + 1.25), RUBBER if k % 2 else DARK, bevel=0.02))
c.append(kit.box((2.5, 1.2, 0.1), (X, CAB_Y, FLOOR + 2.5), AQUA, bevel=0.03))
m.part('cab', (X, CAB_Y, FLOOR), c, on='outer')
m.marker('beacon', (X, CAB_Y, FLOOR + 2.65), on='cab')
m.marker('door', (X, CAB_Y + 1.25, FLOOR), on='cab')

# =========================================================================================================
# --- The catering truck: cab to -Y, the galley box over the chassis on scissor arms. ---
X = 36.0
m = Model('sp_catering', X)
p = [kit.box((2.0, 5.6, 0.3), (X, 0.1, 0.55), DARK, bevel=0.04)]
for y in (-1.6, 1.6):
    for e in (-1, 1):
        p += wheel((X + e * 0.95, y, 0.42), 0.42, 0.3)
# Cab: white, aqua band, windscreen, a roof beacon.
p.append(kit.box((2.1, 1.5, 1.7), (X, -2.15, 1.55), WHITE, bevel=0.1))
p.append(kit.box((2.12, 0.08, 0.75), (X, -2.9, 1.85), GLASS, bevel=0.0))
p.append(kit.box((2.14, 1.52, 0.18), (X, -2.15, 1.05), AQUA, bevel=0.03))
for e in (-1, 1):
    p.append(kit.box((0.06, 0.8, 0.6), (X + e * 1.06, -2.1, 1.9), GLASS, bevel=0.0))
    p.append(kit.box((0.22, 0.06, 0.12), (X + e * 0.75, -2.93, 0.95), BULB, bevel=0.01))
p.append(kit.box((0.4, 0.4, 0.14), (X, -2.15, 2.47), DARK, bevel=0.03))
m.marker('beacon', (X, -2.15, 2.62))
# The platform the arms stand on.
p.append(kit.box((1.9, 3.4, 0.16), (X, 1.0, 0.85), GREY, bevel=0.03))
m.mesh(p)
# Scissor arms, folding about X; the box rides on top (the game lifts it to the jet's door).
for name, e in (('arma', -1), ('armb', 1)):
    a = [kit.box((0.1, 3.2, 0.14), (X + e * 0.85, 1.0, 0.95), STEEL, bevel=0.02)]
    a.append(kit.box((0.1, 3.2, 0.14), (X + e * 0.85, 1.0, 0.95), STEEL, bevel=0.02, rot=(0.0, 0, 0)))
    m.part(name, (X, 1.0, 0.95), a)
BOX_Z = 1.15
b = [kit.box((2.2, 3.2, 1.9), (X, 1.0, BOX_Z + 0.95), WHITE, bevel=0.08)]
b.append(kit.box((2.22, 3.22, 0.32), (X, 1.0, BOX_Z + 0.35), AQUA, bevel=0.03))
b.append(kit.box((2.24, 3.24, 0.08), (X, 1.0, BOX_Z + 1.88), SUN, bevel=0.02))
# The platform out of its back, with rails, to the jet's door.
b.append(kit.box((1.6, 0.8, 0.1), (X, 3.0, BOX_Z + 0.05), GREY, bevel=0.02))
for e in (-1, 1):
    b += tube([(X + e * 0.78, 2.62, BOX_Z + 0.1), (X + e * 0.78, 2.62, BOX_Z + 1.0), (X + e * 0.78, 3.38, BOX_Z + 1.0)], 0.03, SUN, verts=6)
m.part('box', (X, 1.0, BOX_Z), b)
m.marker('sign', (X + 1.13, 1.0, BOX_Z + 1.1), on='box')

# =========================================================================================================
# --- The café: the counter, customers to -Y, the back counter behind it, a striped awning on posts. ---
X = 44.0
m = Model('sp_cafe', X)
p = []
# The counter: wood-slatted front, a cream top, a glass case of pastries on its left.
p.append(kit.box((3.2, 0.8, 1.0), (X, 0, 0.5), WOOD, bevel=0.05))
for k in range(9):
    p.append(kit.box((0.06, 0.04, 0.82), (X - 1.45 + k * 0.36, -0.42, 0.5), WOOD_DARK, bevel=0.0))
p.append(kit.box((3.3, 0.92, 0.07), (X, 0, 1.03), CREAM, bevel=0.03))
p.append(kit.box((3.22, 0.06, 0.14), (X, -0.44, 0.1), AQUA, bevel=0.0))
p.append(kit.box((1.2, 0.62, 0.48), (X - 0.9, 0.0, 1.3), PANE, bevel=0.03))
p.append(kit.box((1.22, 0.64, 0.05), (X - 0.9, 0.0, 1.56), WHITE, bevel=0.02))
for k in range(4):
    x = X - 1.32 + k * 0.28
    p.append(blob((0.11, 0.07, 0.05), (x, 0.05, 1.12), '#e3a64f', segments=8))
    p.append(kit.torus(0.07, 0.03, (x, -0.12, 1.33), PINK if k % 2 else COFFEE, major_segments=12, minor_segments=5))
    p.append(kit.cylinder(0.06, 0.09, (x + 0.1, 0.16, 1.3), '#d98a4e', verts=10))
    p.append(blob((0.07, 0.07, 0.05), (x + 0.1, 0.16, 1.38), PINK, segments=8))
# The till and a jar of cookies on the right; a little stack of cups.
p.append(kit.box((0.4, 0.34, 0.26), (X + 1.05, 0.05, 1.2), DARK, bevel=0.03))
p.append(kit.box((0.34, 0.06, 0.2), (X + 1.05, -0.1, 1.38), SCREEN, bevel=0.01, rot=(0.4, 0, 0)))
p.append(kit.cylinder(0.12, 0.22, (X + 0.45, -0.1, 1.18), PANE, verts=12))
for k in range(4):
    p.append(kit.cylinder(0.06, 0.08, (X + 0.15, 0.1, 1.11 + k * 0.07), WHITE, verts=10))
# The back counter against the wall: the espresso machine, a grinder, syrups, cups (room for whoever serves between).
BACK = 1.6
p.append(kit.box((3.2, 0.4, 0.95), (X, BACK, 0.48), WHITE, bevel=0.04))
p.append(kit.box((3.24, 0.44, 0.06), (X, BACK, 0.98), STEEL, bevel=0.02))
p.append(kit.box((1.1, 0.4, 0.5), (X - 0.5, BACK, 1.26), CHROME, bevel=0.05))
p.append(kit.box((1.12, 0.42, 0.12), (X - 0.5, BACK, 1.55), RED, bevel=0.03))
for e in (-1, 1):
    p.append(kit.cylinder(0.06, 0.14, (X - 0.5 + e * 0.28, BACK - 0.24, 1.1), DARK, verts=8, rot=(PI / 2, 0, 0)))
    p.append(kit.cylinder(0.05, 0.06, (X - 0.5 + e * 0.28, BACK - 0.3, 1.02), WHITE, verts=8))
p.append(kit.cylinder(0.13, 0.42, (X + 0.45, BACK, 1.22), DARK, verts=12))
p.append(kit.cone(0.15, 0.06, 0.24, (X + 0.45, BACK, 1.55), PANE, verts=12))
for k, col in enumerate((PINK, SUN, MINT, ORANGE)):
    p.append(kit.cylinder(0.05, 0.26, (X + 0.9 + k * 0.13, BACK, 1.14), col, verts=8))
m.marker('steam', (X - 0.5, BACK, 1.7))
# The menu board on the wall, on two posts; the awning over the counter with bulbs along its edge.
for e in (-1, 1):
    p.append(kit.box((0.12, 0.12, 2.9), (X + e * 1.6, BACK + 0.18, 1.45), NAVY, bevel=0.02))
    p.append(kit.box((0.14, 0.14, 2.6), (X + e * 1.6, -0.6, 1.3), WHITE, bevel=0.03))
p.append(kit.box((3.1, 0.08, 0.95), (X, BACK + 0.2, 2.15), NAVY, bevel=0.03))
m.marker('menu', (X, BACK + 0.15, 2.15))
STRIPES = 8
for k in range(STRIPES):
    x = X - 1.75 + (k + 0.5) * 3.5 / STRIPES
    p.append(kit.box((3.5 / STRIPES, 2.2, 0.06), (x, 0.4, 2.62), AQUA if k % 2 else WHITE, bevel=0.0, rot=(-0.16, 0, 0)))
for k in range(STRIPES):
    x = X - 1.75 + (k + 0.5) * 3.5 / STRIPES
    p.append(blob((3.5 / STRIPES / 2, 0.06, 0.16), (x, -0.72, 2.4), AQUA if k % 2 else WHITE, segments=8))
for k in range(9):
    p.append(kit.sphere(0.05, (X - 1.6 + k * 0.4, -0.72, 2.26), BULB, segments=6))
p.append(kit.box((1.9, 0.1, 0.42), (X, -0.74, 2.95), NAVY, bevel=0.03))
m.marker('sign', (X, -0.8, 2.95))
m.mesh(p)
# The giant coffee cup on top of the awning, steam swirling up, turning slowly.
CUP_Z = 3.3
c = [kit.cone(0.32, 0.42, 0.62, (X, 0.5, CUP_Z + 0.31), WHITE, verts=20)]
c.append(kit.cylinder(0.43, 0.08, (X, 0.5, CUP_Z + 0.6), COFFEE, verts=20))
c.append(kit.cylinder(0.44, 0.14, (X, 0.5, CUP_Z + 0.32), AQUA, verts=20))
c.append(kit.torus(0.16, 0.05, (X + 0.42, 0.5, CUP_Z + 0.34), WHITE, rot=(PI / 2, 0, 0), major_segments=14, minor_segments=6))
c.append(kit.cylinder(0.5, 0.06, (X, 0.5, CUP_Z + 0.02), WHITE, verts=20))
for k in range(3):
    c.append(blob((0.09, 0.09, 0.16), (X - 0.12 + k * 0.12, 0.5, CUP_Z + 0.85 + (k % 2) * 0.16), '#f2f4f7', segments=8))
c.append(rod((X, 0.5, 2.68), (X, 0.5, CUP_Z), 0.05, STEEL, verts=8))
m.part('cup', (X, 0.5, CUP_Z), c)

# --- A café table and two chairs. ---
X = 50.0
m = Model('sp_cafetable', X)
p = [kit.cylinder(0.38, 0.05, (X, 0, 0.74), WHITE, verts=18), kit.cylinder(0.05, 0.7, (X, 0, 0.38), STEEL, verts=8)]
p.append(kit.cylinder(0.24, 0.04, (X, 0, 0.03), STEEL, verts=14))
p.append(kit.cylinder(0.06, 0.08, (X - 0.1, 0.05, 0.8), WHITE, verts=10))
for e in (-1, 1):
    cx = X + e * 0.62
    p.append(kit.box((0.4, 0.4, 0.06), (cx, 0, 0.46), AQUA if e < 0 else ORANGE, bevel=0.03))
    p.append(kit.box((0.06, 0.4, 0.46), (cx + e * 0.19, 0, 0.72), AQUA if e < 0 else ORANGE, bevel=0.03))
    for dx in (-0.16, 0.16):
        for dy in (-0.16, 0.16):
            p.append(rod((cx + dx, dy, 0.45), (cx + dx, dy, 0.0), 0.02, STEEL, verts=5))
m.mesh(p)

# =========================================================================================================
# --- Duty-free: shelves behind, a glass counter, a gondola either side, the perfume bottle turning. ---
X = 56.0
m = Model('sp_dutyfree', X)
p = []
BACK = 1.75
# A low double-sided display: lit shelves of bottles and gift boxes on the shoppers' side and on the side
# that faces the wall (which is the side the camera looks down on over it).
p.append(kit.box((4.6, 0.36, 1.42), (X, BACK, 0.71), WHITE, bevel=0.04))
p.append(kit.box((4.66, 0.42, 0.06), (X, BACK, 1.44), PURPLE, bevel=0.02))
for face in (-1, 1):
    for row in range(3):
        z = 0.3 + row * 0.4
        p.append(kit.box((4.4, 0.18, 0.04), (X, BACK + face * 0.26, z), STEEL, bevel=0.0))
        p.append(kit.box((4.4, 0.02, 0.03), (X, BACK + face * 0.35, z + 0.02), BULB, bevel=0.0))
        for k in range(13):
            x = X - 2.05 + k * 0.34
            col = (PINK, PURPLE, SUN, AQUA, ORANGE, MINT, RED)[(k + row * 3 + (face > 0) * 2) % 7]
            y = BACK + face * 0.27
            if (k + row) % 3 == 0:
                p.append(kit.box((0.22, 0.14, 0.28), (x, y, z + 0.16), col, bevel=0.03))
            else:
                p.append(kit.cylinder(0.07, 0.22, (x, y, z + 0.13), col, verts=10))
                p.append(kit.cylinder(0.035, 0.06, (x, y, z + 0.27), CHROME, verts=8))
# Gift boxes and a big bottle on top of the display.
for k, col in enumerate((PINK, SUN, AQUA, ORANGE, MINT)):
    x = X - 1.8 + k * 0.9
    p.append(kit.box((0.36, 0.3, 0.26), (x, BACK, 1.6), col, bevel=0.03))
    p.append(kit.box((0.38, 0.06, 0.28), (x, BACK, 1.6), WHITE, bevel=0.0))
# The sign up on two posts over it (double-sided, the game hangs a board on each face).
for e in (-1, 1):
    p.append(kit.box((0.12, 0.12, 2.6), (X + e * 2.2, BACK, 1.3), NAVY, bevel=0.02))
p.append(kit.box((4.7, 0.12, 0.5), (X, BACK, 2.4), NAVY, bevel=0.04))
m.marker('sign', (X, BACK - 0.07, 2.4))
for k in range(6):
    p.append(kit.sphere(0.05, (X - 2.0 + k * 0.8, BACK, 2.7), BULB, segments=6))
# The counter: glass over watches, a white base, the till.
p.append(kit.box((2.6, 0.8, 0.85), (X, 0, 0.43), WHITE, bevel=0.05))
p.append(kit.box((2.62, 0.82, 0.12), (X, 0, 0.06), PURPLE, bevel=0.02))
p.append(kit.box((2.5, 0.7, 0.24), (X, 0, 0.98), PANE, bevel=0.02))
p.append(kit.box((2.64, 0.84, 0.05), (X, 0, 1.12), CHROME, bevel=0.02))
for k in range(6):
    x = X - 1.0 + k * 0.4
    p.append(kit.torus(0.07, 0.02, (x, 0.0, 0.9), SUN if k % 2 else CHROME, major_segments=12, minor_segments=4))
    p.append(kit.cylinder(0.05, 0.02, (x, 0.0, 0.91), WHITE, verts=10))
p.append(kit.box((0.4, 0.32, 0.24), (X + 0.95, 0.1, 1.27), DARK, bevel=0.03))
p.append(kit.box((0.32, 0.05, 0.2), (X + 0.95, -0.05, 1.42), SCREEN, bevel=0.01, rot=(0.4, 0, 0)))
# Gondolas either side: low shelves of chocolates and gift boxes.
for e in (-1, 1):
    cx = X + e * 2.2
    p.append(kit.box((0.8, 1.5, 1.1), (cx, 0.7, 0.55), WHITE, bevel=0.04))
    p.append(kit.box((0.82, 1.52, 0.06), (cx, 0.7, 1.12), PURPLE, bevel=0.02))
    for k in range(4):
        for row in range(2):
            p.append(kit.box((0.32, 0.26, 0.22), (cx + (k % 2 - 0.5) * 0.36, 0.2 + (k // 2) * 0.62, 1.27 + row * 0.24), (SUN, PINK, AQUA, ORANGE)[(k + row) % 4], bevel=0.02))
m.mesh(p)
# The giant perfume bottle on a plinth by the counter, turning.
PX, PY = X - 1.75, -0.55
p = [kit.cylinder(0.42, 0.5, (PX, PY, 0.25), WHITE, verts=18), kit.cylinder(0.44, 0.08, (PX, PY, 0.52), SUN, verts=18)]
m.mesh(p)
t = [kit.box((0.5, 0.36, 0.62), (PX, PY, 0.92), PINK, bevel=0.12)]
t.append(kit.box((0.36, 0.22, 0.44), (PX, PY, 0.92), '#ffd1e8', bevel=0.08))
t.append(kit.cylinder(0.08, 0.14, (PX, PY, 1.3), SUN, verts=10))
t.append(blob((0.14, 0.14, 0.1), (PX, PY, 1.44), PURPLE, segments=10))
m.part('turn', (PX, PY, 0.56), t)

# =========================================================================================================
# --- Security: the arch at the origin (people walk through along +X), the X-ray machine beside it. ---
X = 64.0
m = Model('sp_security', X)
p = []
for e in (-1, 1):
    p.append(kit.box((0.26, 0.5, 2.2), (X, e * 0.6, 1.1), STEEL, bevel=0.05))
    p.append(kit.box((0.28, 0.08, 2.0), (X, e * 0.6 - e * 0.27, 1.1), GREY, bevel=0.0))
p.append(kit.box((0.32, 1.48, 0.36), (X, 0, 2.38), NAVY, bevel=0.05))
p.append(kit.box((0.34, 1.0, 0.08), (X, 0, 2.6), AQUA, bevel=0.02))
m.marker('lamp', (X, 0, 2.7))
# Rubber mat through the arch.
p.append(kit.box((1.8, 1.0, 0.05), (X, 0, 0.025), RUBBER, bevel=0.0))
# The X-ray machine on the -Y side here (+Z in the game): a tunnel over a belt, tables at both ends.
MY = -1.05
p.append(kit.box((1.5, 1.0, 1.3), (X - 0.1, MY, 0.95), WHITE, bevel=0.08))
p.append(kit.box((1.52, 1.02, 0.2), (X - 0.1, MY, 1.44), AQUA, bevel=0.03))
p.append(kit.box((0.06, 0.66, 0.5), (X - 0.88, MY, 0.98), DARK, bevel=0.0))
p.append(kit.box((0.06, 0.66, 0.5), (X + 0.68, MY, 0.98), DARK, bevel=0.0))
p.append(kit.box((3.6, 0.8, 0.12), (X - 0.1, MY, 0.66), GREY, bevel=0.02))
for x in (-1.75, 1.55):
    for e in (-1, 1):
        p.append(rod((X + x, MY + e * 0.32, 0.6), (X + x, MY + e * 0.32, 0.0), 0.035, STEEL, verts=6))
# Trays waiting at the loading end, a monitor on a stand at the far end.
for k in range(3):
    p.append(kit.box((0.5, 0.36, 0.06), (X - 1.45, MY + 0.05, 0.75 + k * 0.07), GREY if k % 2 else DARK, bevel=0.02))
p.append(rod((X + 1.3, MY - 0.55, 0.0), (X + 1.3, MY - 0.55, 1.25), 0.03, STEEL, verts=6))
p.append(kit.box((0.5, 0.06, 0.36), (X + 1.3, MY - 0.55, 1.4), SCREEN, bevel=0.02, rot=(0.25, 0, 0.5)))
# Stanchions and belts guiding the line on the way in.
posts = [(-1.0, 0.75), (-2.2, 0.75), (-3.4, 0.75), (-1.0, -0.6), (-2.2, -0.6), (-3.4, -0.6)]
for x, y in posts:
    p.append(kit.cylinder(0.04, 0.95, (X + x, y, 0.48), CHROME, verts=8))
    p.append(kit.cylinder(0.16, 0.04, (X + x, y, 0.02), CHROME, verts=12))
for y in (0.75, -0.6):
    p.append(kit.box((2.4, 0.03, 0.06), (X - 2.2, y, 0.88), NAVY, bevel=0.0))
m.mesh(p)
# The belt's slats (they run towards +X) and the curtain flaps at either mouth.
belt = []
for k in range(12):
    belt.append(kit.box((0.05, 0.62, 0.03), (X - 1.6 + k * 0.28, MY, 0.735), RUBBER, bevel=0.0))
m.part('belt', (X - 0.1, MY, 0.74), belt)
for k in range(4):
    x = X - 0.88 if k < 2 else X + 0.68
    y = MY + (k % 2 - 0.5) * 0.32
    m.part(f'flap{k}', (x, y, 1.22), [kit.box((0.02, 0.3, 0.46), (x, y, 0.99), '#4a5562', bevel=0.0)])

# =========================================================================================================
# --- The catering kitchen: 8 by 11 m at the origin, its hatch in the west wall (-X). ---
X = 76.0
m = Model('sp_kitchen', X)
W, D, H = 8.0, 11.0, 3.4
HZ = LAYOUT['kitchen']['hatch']['z'] - LAYOUT['kitchen']['at']['z']
p = []
# Walls: white with an aqua band and a navy plinth; windows front and back.
p.append(kit.box((W, D, H), (X, 0, H / 2), WHITE, bevel=0.08))
p.append(kit.box((W + 0.04, D + 0.04, 0.4), (X, 0, 0.2), NAVY, bevel=0.03))
p.append(kit.box((W + 0.05, D + 0.05, 0.22), (X, 0, H - 0.45), AQUA, bevel=0.03))
p.append(kit.box((W + 0.3, D + 0.3, 0.2), (X, 0, H + 0.1), CHROME, bevel=0.04))
for k in range(3):
    x = X - 2.6 + k * 2.6
    p.append(kit.box((1.6, 0.08, 1.0), (x, -D / 2 - 0.02, 1.9), GLASS, bevel=0.0))
    p.append(kit.box((1.7, 0.12, 0.08), (x, -D / 2 - 0.04, 1.36), WHITE, bevel=0.01))
# The roller door on the north side (+Y here), ribbed, with hazard stripes at its foot.
p.append(kit.box((3.2, 0.1, 2.7), (X + 1.0, D / 2 + 0.02, 1.35), GREY, bevel=0.0))
for k in range(9):
    p.append(kit.box((3.1, 0.12, 0.05), (X + 1.0, D / 2 + 0.06, 0.3 + k * 0.28), STEEL, bevel=0.0))
for k in range(8):
    p.append(kit.box((0.4, 0.13, 0.16), (X + 1.0 - 1.4 + k * 0.4, D / 2 + 0.07, 0.08), SUN if k % 2 else RUBBER, bevel=0.0))
# The hatch in the west wall: a window with a stainless shelf out into the wing, a heat lamp over it.
HY = -HZ
p.append(kit.box((0.12, 1.5, 1.0), (X - W / 2 - 0.02, HY, 1.45), DARK, bevel=0.0))
p.append(kit.box((1.0, 1.5, 0.08), (X - W / 2 - 0.4, HY, 1.0), CHROME, bevel=0.02))
p.append(kit.box((0.6, 1.5, 0.14), (X - W / 2 - 0.3, HY, 2.08), STEEL, bevel=0.03))
for e in (-1, 1):
    p.append(kit.cone(0.1, 0.16, 0.14, (X - W / 2 - 0.45, HY + e * 0.4, 1.95), ORANGE, verts=10, rot=(PI, 0, 0)))
m.marker('hatch', (X - W / 2 - 0.42, HY, 1.04))
# On the roof: two extractor fans in their housings, the flue, an air-conditioning box.
for name, (x, y) in (('fan1', (X - 2.0, -2.5)), ('fan2', (X - 2.0, 1.5))):
    p.append(kit.cylinder(0.75, 0.6, (x, y, H + 0.5), STEEL, verts=20))
    p.append(kit.torus(0.75, 0.06, (x, y, H + 0.8), DARK, major_segments=20, minor_segments=5))
    blades = [kit.cylinder(0.12, 0.1, (x, y, H + 0.84), DARK, verts=10)]
    for k in range(5):
        a = k * 2 * PI / 5
        blades.append(kit.box((0.6, 0.16, 0.03), (x + math.cos(a) * 0.36, y + math.sin(a) * 0.36, H + 0.84), GREY, bevel=0.0, rot=(0.35, 0, a)))
    m.part(name, (x, y, H + 0.84), blades)
p.append(kit.cylinder(0.24, 2.2, (X + 2.6, 3.2, H + 1.1), STEEL, verts=14))
p.append(kit.cone(0.4, 0.05, 0.3, (X + 2.6, 3.2, H + 2.35), DARK, verts=14))
m.marker('steam', (X + 2.6, 3.2, H + 2.6))
p.append(kit.box((1.4, 1.0, 0.8), (X + 2.4, -3.4, H + 0.6), CHROME, bevel=0.05))
p.append(kit.cylinder(0.32, 0.06, (X + 2.4, -3.92, H + 0.6), DARK, verts=14, rot=(PI / 2, 0, 0)))
# The sign over the front (south, -Y here).
p.append(kit.box((5.6, 0.16, 0.8), (X, -D / 2 - 0.1, H - 0.2), NAVY, bevel=0.04))
m.marker('sign', (X, -D / 2 - 0.2, H - 0.2))
# The giant covered dish on the roof: a plate and its cloche, whose lid lifts now and then.
DX, DY = X + 1.2, -0.6
p.append(kit.cylinder(0.12, 0.6, (DX, DY, H + 0.5), STEEL, verts=10))
p.append(kit.cylinder(1.1, 0.1, (DX, DY, H + 0.85), WHITE, verts=24))
p.append(kit.torus(1.05, 0.06, (DX, DY, H + 0.9), AQUA, major_segments=24, minor_segments=5))
p.append(blob((0.6, 0.6, 0.2), (DX, DY, H + 1.0), '#e3a64f', segments=14))
m.mesh(p)
lid = [blob((0.95, 0.95, 0.75), (DX, DY, H + 0.92), CHROME, segments=20)]
lid.append(kit.cylinder(0.98, 0.06, (DX, DY, H + 0.92), STEEL, verts=24))
lid.append(kit.sphere(0.14, (DX, DY, H + 1.72), SUN, segments=10))
m.part('lid', (DX - 0.95, DY, H + 0.92), lid)

out = Path(sys.argv[1] if len(sys.argv) > 1 else 'skyport-wing.glb')
# Three files, each under a Playables file's 512 KiB: the wing, the bridge and the catering truck; the café and
# duty-free; the kitchen and the security lane.
FILES = {'wing': ('sp_wing', 'sp_jetbridge', 'sp_catering'), 'shops': ('sp_cafe', 'sp_cafetable', 'sp_dutyfree'), 'kitchen': ('sp_kitchen', 'sp_security')}
assert sorted(b.name for b in rig.bases) == sorted(n for names in FILES.values() for n in names)
for key, names in FILES.items():
    rig.export_all(out.with_name(out.stem.replace('wing', key) + out.suffix), [b for b in rig.bases if b.name in names])
if len(sys.argv) > 2:
    rig.contact_sheet(sys.argv[2], [b for b in rig.bases if b.name != 'sp_wing'], size=(520, 420), cols=4)
