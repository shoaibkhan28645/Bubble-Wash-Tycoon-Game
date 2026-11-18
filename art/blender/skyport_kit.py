"""Skyport International (Chapter 4): what stands and drives on the apron and in the hall.

Each model stands on its own named base; fronts face -Y here (+Z in the game,
towards the camera) unless its notes say otherwise. Moving parts nest in
empties at their pivots (rig.py).

Apron: sp_stairs (towable air stairs under a canopy; foot at the origin,
climbing towards -X to a plane's door 1.02 m up), sp_fuel (the fuel truck,
cab to -Y: wheels sp_fuel_wheel_*, the hose reel sp_fuel_reel turning about
X, the amber beacon sp_fuel_beacon), sp_belt (the baggage hatch in the hall's
north wall at y = -0.7 with rubber flaps sp_belt_flap0..3, a conveyor whose
slats sp_belt_slats run towards +Y, a baggage cart beyond it), sp_tug (the cart's tug, nose to +Y), sp_case0..5 (suitcases, lying flat), sp_gpu (a ground power
unit), sp_cone, sp_chocks, sp_flood (a floodlight mast), sp_sign (a
taxiway sign, its face left blank for the game to paint).

Hall: sp_desk (the check-in desk, passengers' side to -Y: counter, screens,
scale and bag belt, the sign board on two posts, left blank), sp_queue (the
belt barriers either side of the check-in line, 3 m of it from the
desk's window), sp_podium (a gate's podium, its screen to -Y), sp_seats_a /
sp_seats_b (a beam of four seats facing -Y), sp_barrier (across a gate's
door until the gate's bought), sp_board (a departures board, its screen left
blank), sp_vending, sp_plant, sp_bin, sp_bench.

Outside: sp_windsock (the sock turns on sp_windsock_sock, each of its rings
sp_windsock_ring0..3 swings), sp_radar (its dish sp_radar_dish turns),
sp_flag (a flag of four strips sp_flag_s0..3 that wave), sp_gaplane (a little
single-engined plane, its propeller sp_gaplane_prop), sp_clubhouse (the
flying club's old hangar), sp_gull (a gull, for the birds on the apron).

Usage: python art/blender/skyport_kit.py <out.glb> [preview.png]
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import kit  # noqa: E402

kit.reset()
import rig  # noqa: E402
from rig import Model, blob, rod, tube, smooth  # noqa: E402

PI = math.pi
WHITE = '#f7f8fa'
AQUA = '#22c3c9'
AQUA_DEEP = '#14959b'
NAVY = '#17324d'
BLUE = '#2c62d6'
SUN = '#ffd24a'
ORANGE = '#ff8a3d'
PINK = '#ff5fa8'
PURPLE = '#8a4fd8'
MINT = '#7ee0c3'
STEEL = '#c9d2dc'
GREY = '#9aa4b0'
DARK = '#3b3f4a'
RUBBER = '#2b2f38'
GLASS = '#30465e'
SCREEN = '#1f2a36'
BULB = '#fff3a0'
AMBER = '#ffb02e'
RED = '#e8493f'
GREEN = '#5fb84f'
LEAF = '#4fae5a'
CREAM = '#ffe9c4'
WOOD = '#c98a52'


def wheel(at, r, width, axis='x', hub=STEEL, tyre=RUBBER, verts=16):
    """A tyre and its hub, turning about X (or Y)."""
    rot = (0, PI / 2, 0) if axis == 'x' else (PI / 2, 0, 0)
    return [
        kit.cylinder(r, width, at, tyre, verts=verts, bevel=min(0.04, r * 0.15), rot=rot),
        kit.cylinder(r * 0.56, width + 0.02, at, hub, verts=12, rot=rot),
        kit.cylinder(r * 0.2, width + 0.05, at, GREY, verts=8, rot=rot),
    ]


def chevrons(x0, x1, y, z, h, a=SUN, b=RUBBER, n=8, depth=0.02):
    """A strip of hazard stripes along X."""
    out = []
    w = (x1 - x0) / n
    for i in range(n):
        out.append(kit.box((w, depth, h), (x0 + w * (i + 0.5), y, z), a if i % 2 else b, bevel=0.0))
    return out


# --- Air stairs: towable, a canopy over the top; foot at the origin, climbing towards -X. ---
X = 0.0
m = Model('sp_stairs', X)
RISE = 1.02
p = [kit.box((4.0, 1.2, 0.16), (X - 1.9, 0, 0.32), NAVY, bevel=0.04)]
for x in (-0.55, -3.3):
    for y in (-0.72, 0.72):
        p += wheel((X + x, y, 0.22), 0.22, 0.16)
    p.append(kit.cylinder(0.05, 1.5, (X + x, 0, 0.22), GREY, verts=8, rot=(PI / 2, 0, 0)))
STEPS = 6
for i in range(STEPS):
    top = 0.32 + (i + 1) * (RISE - 0.32) / STEPS
    x = X - 0.18 - i * 0.44
    p.append(kit.box((0.44, 1.18, top - 0.32), (x, 0, 0.32 + (top - 0.32) / 2), AQUA if i % 2 else AQUA_DEEP, bevel=0.02))
    p.append(kit.box((0.44, 1.2, 0.05), (x, 0, top), '#dfe5ec', bevel=0.015))
    p.append(kit.box((0.06, 1.2, 0.055), (x + 0.2, 0, top + 0.005), SUN, bevel=0.0))
p.append(kit.box((1.2, 1.3, 0.1), (X - 3.25, 0, RISE - 0.04), '#dfe5ec', bevel=0.03))
p.append(kit.box((1.2, 1.24, RISE - 0.4), (X - 3.25, 0, 0.32 + (RISE - 0.4) / 2), NAVY, bevel=0.03))
# Side panels, the airport's colour, with hazard stripes along the foot.
for y in (-0.64, 0.64):
    p.append(kit.box((2.75, 0.06, 0.34), (X - 1.42, y, 0.5 + 0.31), WHITE, bevel=0.02, rot=(0, (RISE - 0.32) / 2.64 * 0.95, 0)))
    p += chevrons(X - 0.4, X + 0.1, y * 1.05, 0.42, 0.14, n=4)
# Handrails, yellow, on posts; up the stairs and round the top on both sides.
for y in (-0.66, 0.66):
    rail = [(X - 0.05, y, 1.0), (X - 2.7, y, RISE + 1.0), (X - 3.82, y, RISE + 1.0)]
    p += tube(rail, 0.04, SUN, verts=8)
    p += tube([(X - 0.05, y, 0.42), (X - 2.7, y, RISE + 0.42), (X - 3.82, y, RISE + 0.42)], 0.025, SUN, verts=6)
    for x, z in ((-0.05, 0.42), (-1.0, 0.6), (-1.95, 0.8), (-2.75, RISE), (-3.8, RISE)):
        h = 1.0 + (RISE + 1.0 - 1.0) * (min(2.7, -x) / 2.7) if -x <= 2.7 else RISE + 1.0
        p.append(rod((X + x, y, z), (X + x, y, h), 0.035, SUN, verts=6))
# The canopy over the top, on four posts.
for x in (-2.78, -3.8):
    for y in (-0.62, 0.62):
        p.append(rod((X + x, y, RISE), (X + x, y, 2.55), 0.04, WHITE, verts=6))
p.append(kit.box((1.35, 1.5, 0.1), (X - 3.28, 0, 2.6), WHITE, bevel=0.04))
p.append(kit.box((1.4, 1.55, 0.08), (X - 3.28, 0, 2.52), AQUA, bevel=0.03))
# Tow bar and a stop lamp at the foot.
p.append(rod((X + 0.05, 0, 0.32), (X + 0.75, 0, 0.26), 0.05, DARK, verts=8))
p.append(kit.torus(0.08, 0.025, (X + 0.8, 0, 0.26), DARK, rot=(0, 0, 0), major_segments=10, minor_segments=4))
for y in (-0.5, 0.5):
    p.append(kit.box((0.04, 0.12, 0.08), (X + 0.12, y, 0.38), RED, bevel=0.01))
m.mesh(p)

# --- The fuel truck: cab to -Y, a tank in the airport's aqua, a hose reel on the right (+X) side. ---
X = 14.0
m = Model('sp_fuel', X)
p = [kit.box((1.9, 6.2, 0.32), (X, 0.1, 0.62), DARK, bevel=0.04)]
# Cab: white, an aqua band, a big windscreen, side windows, mirrors, headlamps, a grille and bumper.
p.append(kit.box((2.2, 1.85, 1.55), (X, -2.25, 1.5), WHITE, bevel=0.22, segments=3))
p.append(kit.box((2.22, 1.87, 0.22), (X, -2.25, 1.05), AQUA, bevel=0.05))
p.append(kit.box((1.9, 0.08, 0.62), (X, -3.16, 1.82), GLASS, bevel=0.06, rot=(-0.12, 0, 0)))
for e in (-1, 1):
    p.append(kit.box((0.06, 1.0, 0.5), (X + e * 1.1, -2.35, 1.82), GLASS, bevel=0.04))
    p.append(kit.box((0.08, 0.1, 0.32), (X + e * 1.26, -2.9, 1.7), DARK, bevel=0.02))
    p.append(rod((X + e * 1.1, -2.9, 1.92), (X + e * 1.26, -2.9, 1.86), 0.025, DARK, verts=5))
    p.append(kit.cylinder(0.12, 0.06, (X + e * 0.78, -3.2, 1.0), BULB, verts=12, rot=(PI / 2, 0, 0)))
    p.append(kit.box((0.32, 0.08, 0.12), (X + e * 0.78, -3.18, 0.8), AMBER, bevel=0.02))
p.append(kit.box((1.0, 0.06, 0.34), (X, -3.19, 0.98), DARK, bevel=0.03))
p.append(kit.box((2.1, 0.22, 0.24), (X, -3.25, 0.6), GREY, bevel=0.06))
p.append(kit.box((0.5, 0.06, 0.18), (X, -3.36, 0.62), SUN, bevel=0.02))
p.append(kit.box((1.6, 0.6, 0.12), (X, -2.2, 2.3), AQUA_DEEP, bevel=0.04))
# The tank, banded white, a walkway with a folded rail on top, hatches, a ladder at the back.
tank = rig.loft([(y, X, 1.78, 1.05, 0.92) for y in (-1.25, -1.15, 0.0, 1.5, 2.85, 2.95)], AQUA, verts=28, name='tank')
rig.paint(tank, lambda c: WHITE if any(abs(c.y - b) < 0.12 for b in (-0.55, 1.1, 2.4)) else AQUA)
p.append(tank)
for y in (-1.25, 2.95):
    p.append(kit.cylinder(0.94, 0.06, (X, y + (0.03 if y > 0 else -0.03), 1.78), WHITE, verts=28, rot=(PI / 2, 0, 0)))
p.append(kit.box((0.7, 3.8, 0.05), (X, 0.85, 2.72), GREY, bevel=0.0))
for y in (-0.2, 1.0, 2.2):
    p.append(kit.cylinder(0.24, 0.1, (X, y, 2.72), STEEL, verts=14))
for e in (-1, 1):
    p += tube([(X + e * 0.38, -0.95, 2.74), (X + e * 0.38, -0.95, 2.95), (X + e * 0.38, 2.6, 2.95), (X + e * 0.38, 2.6, 2.74)], 0.025, SUN, verts=5)
for k in range(5):
    p.append(kit.box((0.5, 0.04, 0.04), (X, 3.05, 0.95 + k * 0.36), GREY, bevel=0.0))
for e in (-1, 1):
    p.append(rod((X + e * 0.25, 3.05, 0.8), (X + e * 0.25, 3.05, 2.75), 0.025, GREY, verts=5))
    # Mudguards and lockers between the wheels, a fire extinguisher, the rear lamps.
    p.append(kit.box((0.6, 1.3, 0.55), (X + e * 0.75, 0.45, 0.9), WHITE, bevel=0.06))
    p.append(kit.box((0.04, 1.1, 0.4), (X + e * 1.06, 0.45, 0.9), STEEL, bevel=0.0))
    p.append(kit.box((0.14, 0.08, 0.1), (X + e * 0.85, 3.12, 0.72), RED, bevel=0.02))
p.append(kit.cylinder(0.08, 0.36, (X - 1.02, -1.3, 1.0), RED, verts=10))
# Hose cabinet on the right side, round the reel.
p.append(kit.box((0.32, 1.2, 1.15), (X + 0.92, -0.55, 1.2), WHITE, bevel=0.06))
p += chevrons(X - 1.0, X + 1.0, 3.28, 0.62, 0.22, n=10)
m.mesh(p)
for name, y in (('fl', -2.25), ('fr', -2.25), ('ml', 1.25), ('mr', 1.25), ('bl', 2.35), ('br', 2.35)):
    e = 1 if name.endswith('l') else -1
    m.part('wheel_' + name, (X + e * 1.0, y, 0.44), wheel((X + e * 1.0, y, 0.44), 0.44, 0.34))
# The reel: a drum with the hose wound on it, its nozzle hanging off it.
reel = [kit.cylinder(0.5, 0.06, (X + 1.12, -0.55, 1.22), GREY, verts=20, rot=(0, PI / 2, 0))]
reel.append(kit.cylinder(0.38, 0.22, (X + 1.24, -0.55, 1.22), RUBBER, verts=20, rot=(0, PI / 2, 0)))
reel.append(kit.cylinder(0.5, 0.05, (X + 1.37, -0.55, 1.22), GREY, verts=20, rot=(0, PI / 2, 0)))
for k in range(4):
    a = k * PI / 2
    reel.append(kit.box((0.04, 0.84, 0.06), (X + 1.4, -0.55, 1.22), STEEL, bevel=0.0, rot=(a, 0, 0)))
m.part('reel', (X + 1.24, -0.55, 1.22), reel)
m.marker('nozzle', (X + 1.32, -0.55, 0.78))
# The beacon on the cab: an amber dome with a mirror turning inside.
b = [kit.cylinder(0.16, 0.1, (X, -2.2, 2.42), DARK, verts=12)]
b.append(blob((0.15, 0.15, 0.17), (X, -2.2, 2.55), AMBER, segments=12))
m.mesh(b)
m.part('beacon', (X, -2.2, 2.55), [kit.box((0.2, 0.05, 0.16), (X, -2.2, 2.56), BULB, bevel=0.01)])

# --- The baggage hatch, conveyor, cart and tug. The hall's wall is at y = -0.7; the cart lies beyond the belt. ---
X = 28.0
m = Model('sp_belt', X)
p = []
# The hatch: a navy frame with a dark opening.
p.append(kit.box((1.9, 0.34, 1.65), (X, -0.72, 0.82), NAVY, bevel=0.06))
p.append(kit.box((1.3, 0.36, 1.05), (X, -0.72, 0.72), SCREEN, bevel=0.03))
p.append(kit.box((2.0, 0.4, 0.14), (X, -0.72, 1.7), AQUA, bevel=0.04))
p += chevrons(X - 0.95, X + 0.95, -0.52, 1.55, 0.12, n=8)
# The conveyor: a steel frame on legs, rollers at each end, a bed the slats run over.
for e in (-1, 1):
    p.append(kit.box((0.08, 2.1, 0.22), (X + e * 0.6, 0.1, 0.72), STEEL, bevel=0.02))
    p += chevrons(-1.0, 1.0, 0, 0, 0, n=1)[:0]
    p.append(kit.box((0.02, 1.9, 0.1), (X + e * 0.645, 0.15, 0.72), SUN, bevel=0.0))
    for y in (-0.3, 0.85):
        p.append(kit.box((0.08, 0.08, 0.62), (X + e * 0.55, y, 0.31), GREY, bevel=0.01))
p.append(kit.box((1.1, 2.0, 0.06), (X, 0.1, 0.68), '#7d8794', bevel=0.0))
for y in (-0.88, 1.1):
    p.append(kit.cylinder(0.1, 1.14, (X, y, 0.72), GREY, verts=12, rot=(0, PI / 2, 0)))
# End stop and a little light on a post.
p.append(kit.box((1.2, 0.1, 0.3), (X, 1.2, 0.82), SUN, bevel=0.03))
p.append(rod((X + 0.75, 1.1, 0.4), (X + 0.75, 1.1, 1.5), 0.03, GREY, verts=6))
p.append(blob((0.09, 0.09, 0.12), (X + 0.75, 1.1, 1.58), AMBER, segments=10))
# The baggage cart: a flat bed with low rails, a tow bar, four wheels.
CART_Y = 2.0
p.append(kit.box((1.9, 2.5, 0.16), (X, CART_Y, 0.52), GREY, bevel=0.05))
p.append(kit.box((1.94, 2.54, 0.06), (X, CART_Y, 0.44), DARK, bevel=0.0))
for e in (-1, 1):
    p += tube([(X + e * 0.92, CART_Y - 1.2, 0.6), (X + e * 0.92, CART_Y - 1.2, 0.9), (X + e * 0.92, CART_Y + 1.2, 0.9), (X + e * 0.92, CART_Y + 1.2, 0.6)], 0.03, SUN, verts=5)
    for y in (CART_Y - 0.9, CART_Y + 0.9):
        p += wheel((X + e * 0.88, y, 0.24), 0.24, 0.16)
p.append(kit.box((1.9, 0.08, 0.6), (X, CART_Y + 1.26, 0.82), AQUA, bevel=0.03))
p.append(rod((X, CART_Y + 1.3, 0.45), (X, CART_Y + 1.95, 0.42), 0.05, DARK, verts=8))
m.mesh(p)
# Rubber flaps over the hatch, which swing as a case comes through, and the belt's slats.
for k in range(4):
    x = X - 0.48 + k * 0.32
    m.part(f'flap{k}', (x, -0.53, 1.24), [kit.box((0.3, 0.03, 0.96), (x, -0.53, 0.76), '#454b57', bevel=0.0)])
SLAT = 0.25
slats = []
for k in range(9):
    y = -0.95 + k * SLAT
    slats.append(kit.box((1.04, SLAT - 0.06, 0.04), (X, y, 0.73), RUBBER, bevel=0.0))
m.part('slats', (X, 0, 0.73), slats)

# --- The baggage tug: a little tractor, its nose to +Y (the game's -Z), a roof on posts, a beacon. ---
X = 186.0
m = Model('sp_tug', X)
TUG_Y = 0.0
p = []
p.append(kit.box((1.4, 1.9, 0.5), (X, TUG_Y, 0.62), SUN, bevel=0.12, segments=2))
p.append(kit.box((1.3, 0.7, 0.42), (X, TUG_Y + 0.55, 1.05), SUN, bevel=0.1, segments=2))
p.append(kit.box((1.2, 0.06, 0.28), (X, TUG_Y + 0.93, 0.85), DARK, bevel=0.02))
p.append(kit.box((0.6, 0.5, 0.12), (X, TUG_Y - 0.2, 0.95), NAVY, bevel=0.04))
p.append(kit.box((0.6, 0.12, 0.45), (X, TUG_Y - 0.45, 1.15), NAVY, bevel=0.04))
p.append(rod((X, TUG_Y + 0.15, 0.9), (X, TUG_Y + 0.05, 1.3), 0.025, DARK, verts=5))
p.append(kit.torus(0.16, 0.025, (X, TUG_Y + 0.03, 1.32), DARK, rot=(0.5, 0, 0), major_segments=12, minor_segments=4))
for e in (-1, 1):
    p.append(rod((X + e * 0.6, TUG_Y - 0.65, 0.85), (X + e * 0.6, TUG_Y - 0.65, 2.05), 0.035, DARK, verts=6))
    p.append(rod((X + e * 0.6, TUG_Y + 0.25, 1.2), (X + e * 0.6, TUG_Y + 0.25, 2.05), 0.035, DARK, verts=6))
    p += wheel((X + e * 0.72, TUG_Y - 0.6, 0.3), 0.3, 0.22)
    p += wheel((X + e * 0.72, TUG_Y + 0.6, 0.3), 0.3, 0.22)
    p.append(kit.cylinder(0.08, 0.05, (X + e * 0.45, TUG_Y + 0.96, 0.85), BULB, verts=10, rot=(PI / 2, 0, 0)))
p.append(kit.box((1.45, 1.2, 0.08), (X, TUG_Y - 0.2, 2.1), WHITE, bevel=0.04))
p.append(blob((0.1, 0.1, 0.12), (X, TUG_Y - 0.2, 2.22), AMBER, segments=10))
m.mesh(p)

# --- Suitcases, lying flat: a hard shell with ribs, a handle on top, little wheels at one end, a tag. ---
CASES = (PINK, AQUA, SUN, ORANGE, PURPLE, MINT)
for i, col in enumerate(CASES):
    X = 40.0 + i * 1.2
    m = Model(f'sp_case{i}', X)
    p = [kit.box((0.5, 0.7, 0.3), (X, 0, 0.17), col, bevel=0.07, segments=2)]
    for y in (-0.18, 0.0, 0.18):
        p.append(kit.box((0.52, 0.035, 0.31), (X, y, 0.17), col, bevel=0.015))
    p.append(kit.box((0.52, 0.72, 0.03), (X, 0, 0.17), WHITE, bevel=0.01))
    p.append(kit.box((0.06, 0.2, 0.05), (X, -0.05, 0.34), DARK, bevel=0.02))
    for e in (-1, 1):
        p.append(kit.box((0.05, 0.05, 0.06), (X + e * 0.04, -0.05 - 0.09, 0.33), DARK, bevel=0.0))
        p.append(kit.cylinder(0.04, 0.04, (X + e * 0.19, 0.36, 0.06), RUBBER, verts=8, rot=(0, PI / 2, 0)))
    p.append(kit.box((0.1, 0.02, 0.12), (X + 0.16, -0.36, 0.22), WHITE, bevel=0.0))
    m.mesh(p)

# --- The check-in desk: passengers' side to -Y. ---
X = 52.0
m = Model('sp_desk', X)
p = [kit.box((3.0, 0.8, 1.0), (X, 0, 0.5), BLUE, bevel=0.08)]
p.append(kit.box((3.16, 0.96, 0.08), (X, 0, 1.04), WHITE, bevel=0.03))
p.append(kit.box((3.02, 0.06, 0.16), (X, -0.41, 0.72), SUN, bevel=0.0))
p.append(kit.box((3.02, 0.06, 0.08), (X, -0.41, 0.5), AQUA, bevel=0.0))
# A raised ledge for passports on the passengers' side, the agents' worktop lower behind.
p.append(kit.box((3.0, 0.3, 0.14), (X, -0.32, 1.15), WHITE, bevel=0.04))
for e in (-1, 1):
    # Two windows: a screen each (turned to the agent), a keyboard, a printer.
    x = X + e * 0.75
    p.append(kit.box((0.62, 0.05, 0.42), (x, 0.0, 1.42), DARK, bevel=0.03, rot=(-0.15, 0, 0)))
    p.append(kit.box((0.56, 0.02, 0.34), (x, 0.03, 1.42), '#5bbcff', bevel=0.0, rot=(-0.15, 0, 0)))
    p.append(kit.box((0.08, 0.08, 0.2), (x, -0.02, 1.16), DARK, bevel=0.01))
    p.append(kit.box((0.44, 0.16, 0.03), (x, 0.25, 1.09), DARK, bevel=0.01))
    p.append(kit.box((0.28, 0.22, 0.14), (x + e * 0.4, 0.2, 1.15), WHITE, bevel=0.03))
    p.append(kit.box((0.18, 0.02, 0.1), (x + e * 0.4, 0.09, 1.2), SUN, bevel=0.0))
# The scale beside the desk, and the bag belt behind it, running off to the back with its flaps.
p.append(kit.box((1.0, 0.95, 0.26), (X + 2.1, 0, 0.13), STEEL, bevel=0.04))
p.append(kit.box((0.86, 0.8, 0.04), (X + 2.1, 0, 0.27), RUBBER, bevel=0.0))
p.append(kit.box((0.3, 0.06, 0.22), (X + 2.1, -0.5, 0.4), DARK, bevel=0.02))
p.append(kit.box((0.24, 0.02, 0.14), (X + 2.1, -0.53, 0.42), '#7ee0c3', bevel=0.0))
p.append(kit.box((1.0, 1.8, 0.24), (X + 2.1, 1.35, 0.12), STEEL, bevel=0.04))
p.append(kit.box((0.86, 1.8, 0.04), (X + 2.1, 1.35, 0.26), RUBBER, bevel=0.0))
p.append(kit.box((1.1, 0.4, 1.1), (X + 2.1, 2.3, 0.55), NAVY, bevel=0.05))
for k in range(3):
    p.append(kit.box((0.26, 0.04, 0.7), (X + 1.84 + k * 0.27, 2.08, 0.5), '#454b57', bevel=0.0))
# The sign board on two posts at the back (its words painted by the game), lamps along its top.
for e in (-1, 1):
    p.append(kit.cylinder(0.07, 3.0, (X + e * 1.95, 0.55, 1.5), WHITE, verts=10))
    p.append(kit.cylinder(0.12, 0.1, (X + e * 1.95, 0.55, 0.05), STEEL, verts=12))
p.append(kit.box((4.2, 0.16, 0.95), (X, 0.55, 3.1), NAVY, bevel=0.06))
p.append(kit.box((4.3, 0.22, 0.12), (X, 0.55, 3.62), AQUA, bevel=0.04))
for k in range(7):
    p.append(kit.sphere(0.06, (X - 1.8 + k * 0.6, 0.46, 3.62), BULB, segments=6))
# A little plant on the desk's end.
p.append(kit.cylinder(0.14, 0.2, (X - 1.3, 0.25, 1.18), WHITE, verts=10))
p.append(blob((0.16, 0.16, 0.18), (X - 1.3, 0.25, 1.38), LEAF, segments=8))
m.mesh(p)
m.marker('sign', (X, 0.46, 3.1))

# --- The belt barriers along both sides of the check-in line: four posts, 3 m of it from the desk's window
# (ending well short of the hall's door, so the hero walks round their ends with room to spare), wide enough
# for the hero to get past a passenger in it (the game's solids match: core/skyportGame.ts). ---
QUEUE_HALF = 1.15
QUEUE_POSTS = 4
QUEUE_STEP = 0.95
X = 64.0
m = Model('sp_queue', X)
p = []
for e in (-1, 1):
    posts = [(X + e * QUEUE_HALF, -0.35 - k * QUEUE_STEP) for k in range(QUEUE_POSTS)]
    for (x, y) in posts:
        p.append(kit.cylinder(0.17, 0.05, (x, y, 0.025), STEEL, verts=14))
        p.append(kit.cylinder(0.035, 0.92, (x, y, 0.48), STEEL, verts=8))
        p.append(kit.cylinder(0.05, 0.1, (x, y, 0.93), GREY, verts=10))
    for (x0, y0), (x1, y1) in zip(posts, posts[1:]):
        p.append(kit.box((0.012, abs(y1 - y0) - 0.08, 0.06), (x0, (y0 + y1) / 2, 0.88), BLUE, bevel=0.0))
m.mesh(p)

# --- A gate's podium: its screen to -Y, where whoever opens the gate stands. ---
X = 70.0
m = Model('sp_podium', X)
p = [kit.box((1.3, 0.62, 1.0), (X, 0, 0.5), AQUA, bevel=0.08)]
p.append(kit.box((1.42, 0.74, 0.08), (X, 0, 1.03), WHITE, bevel=0.03))
p.append(kit.box((1.32, 0.04, 0.14), (X, -0.32, 0.72), NAVY, bevel=0.0))
p.append(kit.box((0.62, 0.06, 0.42), (X - 0.15, 0.05, 1.32), DARK, bevel=0.03, rot=(0.25, 0, 0)))
p.append(kit.box((0.56, 0.02, 0.34), (X - 0.15, 0.015, 1.32), '#7ee0c3', bevel=0.0, rot=(0.25, 0, 0)))
p.append(kit.box((0.22, 0.2, 0.12), (X + 0.4, 0.0, 1.13), WHITE, bevel=0.03))
p.append(kit.cylinder(0.05, 0.6, (X + 0.55, 0.22, 1.35), STEEL, verts=8))
p.append(kit.cylinder(0.11, 0.04, (X + 0.55, 0.22, 1.66), GREEN, verts=12, rot=(PI / 2, 0, 0)))
m.mesh(p)

# --- Seats: a beam of four, facing -Y, two colours. ---
for k, (name, col) in enumerate((('sp_seats_a', NAVY), ('sp_seats_b', AQUA_DEEP))):
    X = 76.0 + k * 5.0
    m = Model(name, X)
    p = [kit.box((3.7, 0.14, 0.1), (X, 0.05, 0.3), STEEL, bevel=0.03)]
    for e in (-1, 1):
        p.append(kit.box((0.08, 0.5, 0.06), (X + e * 1.75, 0.05, 0.03), STEEL, bevel=0.01))
        p.append(kit.box((0.08, 0.08, 0.28), (X + e * 1.75, 0.05, 0.16), STEEL, bevel=0.01))
    for i in range(4):
        x = X - 1.35 + i * 0.9
        p.append(kit.box((0.78, 0.62, 0.12), (x, -0.02, 0.44), col, bevel=0.05, segments=2))
        p.append(kit.box((0.78, 0.12, 0.66), (x, 0.3, 0.8), col, bevel=0.05, segments=2, rot=(0.18, 0, 0)))
        p.append(kit.box((0.66, 0.04, 0.4), (x, 0.24, 0.84), WHITE if k == 0 else CREAM, bevel=0.02, rot=(0.18, 0, 0)))
    for i in range(5):
        x = X - 1.8 + i * 0.9
        p.append(kit.box((0.06, 0.5, 0.05), (x, 0.0, 0.66), STEEL, bevel=0.01))
        p.append(kit.box((0.05, 0.05, 0.2), (x, -0.18, 0.56), STEEL, bevel=0.0))
    m.mesh(p)

# --- The barrier across a gate's door until the gate is bought. ---
X = 88.0
m = Model('sp_barrier', X)
p = []
for e in (-1, 1):
    p.append(kit.box((0.5, 0.6, 0.12), (X + e * 1.4, 0, 0.06), DARK, bevel=0.03))
    p.append(kit.box((0.14, 0.14, 1.05), (X + e * 1.4, 0, 0.6), WHITE, bevel=0.03))
    p.append(blob((0.1, 0.1, 0.12), (X + e * 1.4, 0, 1.22), AMBER, segments=10))
for z in (0.55, 0.95):
    for k in range(6):
        p.append(kit.box((0.46, 0.1, 0.2), (X - 1.15 + k * 0.46, 0, z), ORANGE if k % 2 == 0 else WHITE, bevel=0.02))
p.append(kit.box((1.1, 0.06, 0.5), (X, -0.08, 1.45), SUN, bevel=0.03))
p.append(kit.box((0.06, 0.08, 0.42), (X, -0.12, 1.46), DARK, bevel=0.0))
p.append(kit.box((0.06, 0.08, 0.08), (X, -0.12, 1.24), DARK, bevel=0.0))
for e in (-1, 1):
    p.append(rod((X + e * 0.4, -0.05, 1.05), (X + e * 0.4, -0.05, 1.2), 0.025, DARK, verts=5))
m.mesh(p)

# --- A departures board on two legs, its screen left blank (the game shows the flights on it). ---
X = 94.0
m = Model('sp_board', X)
p = []
for e in (-1, 1):
    p.append(kit.box((0.14, 0.14, 2.3), (X + e * 1.35, 0.05, 1.15), WHITE, bevel=0.04))
    p.append(kit.box((0.5, 0.5, 0.1), (X + e * 1.35, 0.05, 0.05), STEEL, bevel=0.03))
p.append(kit.box((2.95, 0.2, 1.55), (X, 0.05, 1.75), NAVY, bevel=0.07))
p.append(kit.box((2.75, 0.04, 1.3), (X, -0.06, 1.72), SCREEN, bevel=0.0))
p.append(kit.box((3.0, 0.26, 0.14), (X, 0.05, 2.56), AQUA, bevel=0.04))
for k in range(5):
    p.append(kit.sphere(0.05, (X - 1.2 + k * 0.6, -0.08, 2.56), BULB, segments=6))
m.mesh(p)
m.marker('screen', (X, -0.09, 1.72))

# --- A drinks machine, a big plant, a bin, a bench. ---
X = 100.0
m = Model('sp_vending', X)
p = [kit.box((1.0, 0.8, 1.9), (X, 0, 0.95), AQUA, bevel=0.08)]
p.append(kit.box((0.62, 0.04, 1.3), (X - 0.12, -0.41, 1.15), BULB, bevel=0.02))
for r in range(4):
    for c in range(3):
        p.append(kit.cylinder(0.06, 0.18, (X - 0.3 + c * 0.18, -0.42, 0.7 + r * 0.3), (PINK, SUN, ORANGE, MINT)[(r + c) % 4], verts=8))
p.append(kit.box((0.2, 0.04, 0.5), (X + 0.33, -0.41, 1.3), DARK, bevel=0.02))
p.append(kit.box((0.62, 0.05, 0.2), (X - 0.12, -0.41, 0.3), DARK, bevel=0.03))
p.append(kit.box((1.04, 0.84, 0.14), (X, 0, 1.92), WHITE, bevel=0.05))
m.mesh(p)

X = 103.0
m = Model('sp_plant', X)
p = [kit.cylinder(0.42, 0.62, (X, 0, 0.31), WHITE, verts=16, bevel=0.03)]
p.append(kit.torus(0.41, 0.05, (X, 0, 0.62), AQUA, major_segments=16, minor_segments=6))
p.append(kit.cylinder(0.38, 0.04, (X, 0, 0.63), '#6b4a2f', verts=16))
p.append(rod((X, 0, 0.6), (X + 0.05, 0.02, 1.7), 0.07, '#8f6036', verts=8))
for k in range(7):
    a = k * 2 * PI / 7
    p.append(blob((0.5, 0.14, 0.05), (X + 0.05 + 0.4 * math.cos(a), 0.02 + 0.4 * math.sin(a), 1.62), LEAF if k % 2 else GREEN, segments=8, rot=(0, 0.35, a)))
p.append(blob((0.2, 0.2, 0.16), (X + 0.05, 0.02, 1.72), GREEN, segments=8))
m.mesh(p)

X = 106.0
m = Model('sp_bin', X)
p = [kit.cylinder(0.26, 0.8, (X, 0, 0.4), STEEL, verts=14, bevel=0.03)]
p.append(kit.cylinder(0.28, 0.1, (X, 0, 0.82), AQUA, verts=14, bevel=0.02))
p.append(kit.cylinder(0.12, 0.04, (X, 0, 0.88), DARK, verts=10))
m.mesh(p)

X = 109.0
m = Model('sp_bench', X)
p = []
for k in range(3):
    p.append(kit.box((2.0, 0.14, 0.06), (X, -0.12 + k * 0.16, 0.45), WOOD, bevel=0.02))
for k in range(2):
    p.append(kit.box((2.0, 0.06, 0.14), (X, 0.27, 0.68 + k * 0.18), WOOD, bevel=0.02, rot=(0.12, 0, 0)))
for e in (-1, 1):
    p.append(kit.box((0.08, 0.5, 0.42), (X + e * 0.85, 0.05, 0.21), NAVY, bevel=0.02))
    p.append(kit.box((0.08, 0.08, 0.5), (X + e * 0.85, 0.3, 0.65), NAVY, bevel=0.02))
m.mesh(p)

# --- On the apron: a ground power unit, a cone, chocks, a floodlight mast, a taxiway sign. ---
X = 113.0
m = Model('sp_gpu', X)
p = [kit.box((1.1, 1.6, 0.8), (X, 0, 0.62), SUN, bevel=0.08)]
p.append(kit.box((1.12, 1.62, 0.1), (X, 0, 1.06), WHITE, bevel=0.03))
p.append(kit.box((0.04, 0.8, 0.4), (X - 0.57, -0.1, 0.65), DARK, bevel=0.0))
for k in range(4):
    p.append(kit.box((0.02, 0.7, 0.04), (X + 0.57, 0.0, 0.48 + k * 0.1), DARK, bevel=0.0))
for e in (-1, 1):
    for y in (-0.55, 0.55):
        p += wheel((X + e * 0.5, y, 0.2), 0.2, 0.12)
p.append(rod((X, -0.8, 0.35), (X, -1.4, 0.3), 0.04, DARK, verts=6))
p += tube([(X + 0.35, -0.6, 0.9), (X + 0.6, -1.0, 0.5), (X + 0.5, -1.5, 0.08), (X + 0.0, -2.0, 0.08)], 0.05, RUBBER, verts=6)
m.mesh(p)

X = 116.0
m = Model('sp_cone', X)
p = [kit.box((0.42, 0.42, 0.05), (X, 0, 0.025), ORANGE, bevel=0.02)]
bands_ = ((0.05, 0.28, ORANGE), (0.28, 0.38, WHITE), (0.38, 0.48, ORANGE), (0.48, 0.56, WHITE), (0.56, 0.68, ORANGE))
for z0, z1, col in bands_:
    r0 = 0.17 - (z0 - 0.05) * 0.22
    r1 = 0.17 - (z1 - 0.05) * 0.22
    p.append(kit.cone(r0, r1, z1 - z0, (X, 0, (z0 + z1) / 2), col, verts=14))
m.mesh(p)

X = 118.0
m = Model('sp_chocks', X)
p = []
for e in (-1, 1):
    p.append(kit.prism((0.5, 0.18, 0.16), (X, e * 0.3, 0), SUN))
p.append(rod((X, -0.3, 0.05), (X, 0.3, 0.05), 0.02, DARK, verts=5))
m.mesh(p)

X = 121.0
m = Model('sp_flood', X)
p = [kit.box((0.9, 0.9, 0.3), (X, 0, 0.15), STEEL, bevel=0.05)]
p.append(kit.cylinder(0.12, 7.4, (X, 0, 3.95), '#dfe5ec', verts=10))
p.append(kit.box((1.6, 0.3, 0.6), (X, 0.12, 7.75), DARK, bevel=0.05, rot=(0.45, 0, 0)))
for c in range(3):
    for r in range(2):
        p.append(kit.cylinder(0.17, 0.08, (X - 0.5 + c * 0.5, -0.02, 7.6 + r * 0.32), BULB, verts=12, rot=(PI / 2 - 0.45, 0, 0)))
for k in range(9):
    p.append(kit.box((0.36, 0.03, 0.03), (X, -0.16, 0.6 + k * 0.7), GREY, bevel=0.0))
p.append(rod((X - 0.17, -0.16, 0.4), (X - 0.17, -0.16, 6.6), 0.02, GREY, verts=5))
p.append(rod((X + 0.17, -0.16, 0.4), (X + 0.17, -0.16, 6.6), 0.02, GREY, verts=5))
p.append(kit.sphere(0.1, (X, 0, 8.15), RED, segments=8))
m.mesh(p)

X = 124.0
m = Model('sp_sign', X)
p = [kit.box((1.8, 0.24, 0.9), (X, 0, 0.75), RUBBER, bevel=0.04)]
p.append(kit.box((0.86, 0.04, 0.72), (X - 0.44, -0.12, 0.75), SUN, bevel=0.0))
p.append(kit.box((0.86, 0.04, 0.72), (X + 0.44, -0.12, 0.75), RUBBER, bevel=0.0))
for e in (-1, 1):
    p.append(kit.box((0.14, 0.14, 0.32), (X + e * 0.7, 0, 0.16), WHITE, bevel=0.02))
m.mesh(p)
m.marker('face', (X, -0.15, 0.75))

# --- The windsock: a striped sock on a pole; it turns into the wind, its rings swing. ---
X = 128.0
m = Model('sp_windsock', X)
p = [kit.box((1.0, 1.0, 0.2), (X, 0, 0.1), STEEL, bevel=0.04)]
pole = kit.cylinder(0.09, 5.0, (X, 0, 2.6), WHITE, verts=10)
rig.paint(pole, lambda c: RED if int((c.z - 0.1) / 0.8) % 2 else WHITE)
p.append(pole)
p.append(kit.sphere(0.14, (X, 0, 5.18), RED, segments=8))
m.mesh(p)
m.part('sock', (X, 0, 4.9), [kit.torus(0.42, 0.04, (X + 0.1, 0, 4.9), DARK, rot=(0, PI / 2, 0), major_segments=16, minor_segments=4), rod((X, 0, 4.9), (X + 0.1, 0, 4.9), 0.04, DARK, verts=6)])
on = 'sock'
for k in range(4):
    r0 = 0.42 - k * 0.07
    x0 = X + 0.1 + k * 0.62
    ring = rig.loft([(0.0, 0, 0, r0, r0), (0.62, 0, 0, r0 - 0.07, r0 - 0.07)], ORANGE if k % 2 == 0 else WHITE, verts=16, cap=False, name='ring')
    # The loft runs along Y: turn it to run along X from the ring's start.
    ring.rotation_euler = (0, 0, -PI / 2)
    kit._apply_all(ring)
    ring.location = (x0, 0, 4.9)
    bpy_ = kit.bpy
    bpy_.ops.object.select_all(action='DESELECT')
    ring.select_set(True)
    bpy_.context.view_layer.objects.active = ring
    bpy_.ops.object.transform_apply(location=True, rotation=False, scale=False)
    ring.data.shade_smooth()
    m.part(f'ring{k}', (x0, 0, 4.9), [ring], on=on)
    on = f'ring{k}'

# --- The radar: a hut with a mast, its dish turning on top. ---
X = 134.0
m = Model('sp_radar', X)
p = [kit.box((2.6, 2.6, 2.0), (X, 0, 1.0), WHITE, bevel=0.08)]
p.append(kit.box((2.8, 2.8, 0.22), (X, 0, 2.08), AQUA, bevel=0.05))
p.append(kit.box((0.7, 0.06, 1.3), (X, -1.31, 0.65), NAVY, bevel=0.03))
p.append(kit.box((0.6, 0.06, 0.4), (X + 0.75, -1.31, 1.25), GLASS, bevel=0.03))
p.append(kit.cylinder(0.2, 1.5, (X, 0, 2.95), STEEL, verts=12))
p.append(kit.cylinder(0.32, 0.2, (X, 0, 3.7), GREY, verts=14))
for e in (-1, 1):
    p += tube([(X + e * 1.2, -1.2, 2.2), (X + e * 1.2, -1.2, 2.6), (X + e * 1.2, 1.2, 2.6), (X + e * 1.2, 1.2, 2.2)], 0.025, SUN, verts=5)
m.mesh(p)
dish = [kit.box((0.25, 0.25, 0.25), (X, 0, 3.92), DARK, bevel=0.04)]
d = rig.loft([(-0.05, X, 4.05, 0.05, 0.05), (0.15, X, 4.05, 1.2, 0.55), (0.3, X, 4.05, 1.45, 0.66)], WHITE, verts=24, cap=False, name='dish')
rig.paint(d, lambda c: ORANGE if c.y > 0.22 else WHITE)
d.data.shade_smooth()
dish.append(d)
dish.append(rod((X, 0.05, 4.05), (X, -0.7, 4.05), 0.03, DARK, verts=5))
dish.append(kit.sphere(0.08, (X, -0.72, 4.05), RED, segments=8))
m.part('dish', (X, 0, 3.8), dish)

# --- A flag on a pole: four strips that wave in turn. ---
X = 140.0
m = Model('sp_flag', X)
p = [kit.cylinder(0.22, 0.2, (X, 0, 0.1), STEEL, verts=12)]
p.append(kit.cylinder(0.05, 6.0, (X, 0, 3.1), WHITE, verts=8))
p.append(kit.sphere(0.09, (X, 0, 6.15), SUN, segments=8))
m.mesh(p)
on = None
FLAG_H = 1.1
for k in range(4):
    x0 = X + 0.06 + k * 0.42
    cols = (AQUA, AQUA, WHITE, AQUA)
    s = [kit.box((0.42, 0.03, FLAG_H), (x0 + 0.21, 0, 5.45), cols[k], bevel=0.0)]
    if k == 1:
        s.append(kit.cylinder(0.24, 0.04, (x0 + 0.21, 0, 5.45), SUN, verts=14, rot=(PI / 2, 0, 0)))
    if k == 2:
        s.append(kit.box((0.42, 0.04, 0.22), (x0 + 0.21, 0, 5.2), BLUE, bevel=0.0))
    m.part(f's{k}', (x0, 0, 5.45), s, on=on)
    on = f's{k}'

# --- A little high-winged single-engined plane, tied down on the grass by the flying club. ---
X = 146.0
m = Model('sp_gaplane', X)
GA = rig.loft([(-1.95, X, 0.95, 0.02, 0.02), (-1.85, X, 0.95, 0.32, 0.32), (-1.3, X, 1.0, 0.48, 0.52), (-0.4, X, 1.08, 0.55, 0.6), (0.6, X, 1.1, 0.42, 0.45), (1.8, X, 1.2, 0.16, 0.2), (2.6, X, 1.32, 0.06, 0.06)], WHITE, verts=20)
rig.paint(GA, lambda c: RED if 0.92 < c.z < 1.05 and abs(c.x - X) > 0.25 else WHITE)
p = [GA]
p.append(blob((0.42, 0.42, 0.24), (X, -0.55, 1.42), GLASS, segments=12, rot=(0.35, 0, 0)))
w = rig.wing((0.0, -0.75, 1.6, 1.15, 0.8), (3.6, -0.7, 1.66, 0.95, 0.75), WHITE)
w.location = (X, 0, 0)
kit._apply_all(w)
kit.bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
rig.paint(w, lambda c: RED if abs(c.x - X) > 3.1 else WHITE)
p.append(w)
for e in (-1, 1):
    p.append(rod((X + e * 0.45, -0.3, 0.9), (X + e * 1.5, -0.4, 1.58), 0.03, STEEL, verts=5))
    p.append(rod((X + e * 0.4, -0.5, 0.55), (X + e * 0.95, -0.4, 0.18), 0.035, STEEL, verts=5))
    p += wheel((X + e * 0.98, -0.4, 0.18), 0.18, 0.1)
    # Tie-down ropes to pegs.
    p.append(rod((X + e * 2.9, -0.3, 1.58), (X + e * 3.2, -0.6, 0.02), 0.012, '#b08a5a', verts=4))
    p.append(kit.box((0.06, 0.06, 0.1), (X + e * 3.2, -0.6, 0.04), DARK, bevel=0.0))
p.append(rod((X, -1.6, 0.6), (X, -1.6, 0.17), 0.03, STEEL, verts=5))
p += wheel((X, -1.6, 0.15), 0.15, 0.08)
p.append(rig.wing((0.0, 1.95, 1.25, 0.6, 0.6), (1.2, 2.15, 1.27, 0.38, 0.6), WHITE))
p[-1].location = (X, 0, 0)
kit._apply_all(p[-1])
kit.bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
fin = kit.box((0.06, 0.75, 0.75), (X, 2.25, 1.62), RED, bevel=0.04, rot=(-0.35, 0, 0))
p.append(fin)
m.mesh(p)
m.part('prop', (X, -1.98, 0.97), [kit.cone(0.13, 0.02, 0.22, (X, -2.02, 0.97), RED, verts=12, rot=(PI / 2, 0, 0)), kit.box((0.09, 0.03, 1.5), (X, -1.98, 0.97), DARK, bevel=0.015, rot=(0, 0.3, 0))])

# --- The flying club's old hangar: a barrel roof over a wide door, its windows, a club sign. ---
X = 156.0
m = Model('sp_clubhouse', X)
W, D, H = 9.0, 7.0, 3.2
p = [kit.box((W, D, H), (X, 0, H / 2), '#e9e4d8', bevel=0.05)]
roof = rig.loft([(y, X, H - 0.2, W / 2 + 0.25, 1.9) for y in (-D / 2 - 0.25, D / 2 + 0.25)], '#7fa8c9', verts=40, name='roof')
import shapes  # noqa: E402
shapes.cut(roof, (X, 0, H - 0.25), (0, 0, 1))
rig.paint(roof, lambda c: '#7fa8c9' if int((c.x - X + W) / 0.7) % 2 else '#6f98ba')
p.append(roof)
# Gable ends: the door wide open, a dark inside, faded red trim.
p.append(kit.box((6.0, 0.1, 2.8), (X, -D / 2 - 0.02, 1.4), '#3a3f47', bevel=0.0))
for e in (-1, 1):
    p.append(kit.box((0.25, 0.3, 3.0), (X + e * 3.15, -D / 2 - 0.1, 1.5), RED, bevel=0.03))
    p.append(kit.box((1.2, 0.08, 0.9), (X + e * 3.9, -D / 2 - 0.06, 3.6), GLASS, bevel=0.03))
p.append(kit.box((6.6, 0.3, 0.25), (X, -D / 2 - 0.1, 3.0), RED, bevel=0.03))
p.append(kit.box((3.6, 0.1, 0.7), (X, -D / 2 - 0.15, 4.25), WHITE, bevel=0.04))
for k in range(3):
    p.append(kit.box((1.0, 0.08, 0.7), (X - 3.5 + k * 3.5, D / 2 + 0.04, 1.8), GLASS, bevel=0.03))
m.mesh(p)
m.marker('sign', (X, -D / 2 - 0.21, 4.25))

# --- On the plaza: a lamp post, a planter of flowers, the taxi rank's sign; round the airfield, a fence. ---
X = 166.0
m = Model('sp_lamp', X)
p = [kit.cylinder(0.2, 0.3, (X, 0, 0.15), NAVY, verts=12)]
p.append(kit.cylinder(0.07, 4.2, (X, 0, 2.3), WHITE, verts=10))
p.append(kit.cylinder(0.11, 0.3, (X, 0, 1.0), AQUA, verts=12))
p.append(rod((X, 0, 4.3), (X + 0.6, 0, 4.45), 0.05, WHITE, verts=8))
p.append(kit.cylinder(0.34, 0.12, (X + 0.75, 0, 4.42), NAVY, verts=16, bevel=0.03))
p.append(kit.cylinder(0.26, 0.04, (X + 0.75, 0, 4.35), BULB, verts=16))
# A banner hanging from the post: the airport's colours.
p.append(kit.box((0.04, 0.5, 1.1), (X, -0.3, 3.3), AQUA, bevel=0.0))
p.append(kit.box((0.05, 0.5, 0.18), (X, -0.3, 3.2), SUN, bevel=0.0))
p.append(rod((X, 0, 3.85), (X, -0.55, 3.85), 0.02, WHITE, verts=5))
m.mesh(p)

X = 170.0
m = Model('sp_planter', X)
p = [kit.box((2.4, 0.8, 0.5), (X, 0, 0.25), WHITE, bevel=0.06)]
p.append(kit.box((2.46, 0.86, 0.08), (X, 0, 0.52), AQUA, bevel=0.03))
p.append(kit.box((2.2, 0.6, 0.06), (X, 0, 0.52), '#6b4a2f', bevel=0.0))
for k in range(9):
    x = X - 1.0 + k * 0.25
    y = -0.15 + (k % 3) * 0.15
    p.append(blob((0.16, 0.16, 0.14), (x, y, 0.62), LEAF if k % 2 else GREEN, segments=8))
    p.append(kit.sphere(0.06, (x + 0.05, y - 0.08, 0.75), (PINK, SUN, '#ffffff', ORANGE)[k % 4], segments=6))
m.mesh(p)

X = 174.0
m = Model('sp_taxisign', X)
p = [kit.cylinder(0.06, 2.6, (X, 0, 1.3), DARK, verts=8)]
p.append(kit.box((1.0, 0.1, 0.5), (X, 0, 2.55), SUN, bevel=0.04))
p.append(kit.box((0.9, 0.12, 0.08), (X, 0, 2.28), DARK, bevel=0.0))
m.mesh(p)
m.marker('face', (X, -0.07, 2.55))

X = 178.0
m = Model('sp_fence', X)
# One 3 m stretch of chain-link: a post at each end, top and bottom rails, the mesh as a grey panel
# with a darker grid, barbed wire on arms at the top.
p = []
for e in (0, 1):
    p.append(kit.cylinder(0.05, 2.2, (X + e * 3.0, 0, 1.1), GREY, verts=8))
    p.append(rod((X + e * 3.0, 0, 2.15), (X + e * 3.0, 0.25, 2.4), 0.025, GREY, verts=5))
for z in (0.08, 2.0):
    p.append(rod((X, 0, z), (X + 3.0, 0, z), 0.025, GREY, verts=6))
for k in range(6):
    p.append(rod((X + k * 0.5, 0, 0.08), (X + k * 0.5 + 0.5, 0, 2.0), 0.008, '#8a95a3', verts=3))
    p.append(rod((X + k * 0.5 + 0.5, 0, 0.08), (X + k * 0.5, 0, 2.0), 0.008, '#8a95a3', verts=3))
for k in range(2):
    p.append(rod((X, 0.1 + k * 0.12, 2.25 + k * 0.1), (X + 3.0, 0.1 + k * 0.12, 2.25 + k * 0.1), 0.01, '#8a95a3', verts=3))
m.mesh(p)

# --- A gull, standing, its beak to -Y (the birds on the apron, a rush job). ---
X = 190.0
m = Model('sp_gull', X)
p = [blob((0.16, 0.26, 0.15), (X, 0.02, 0.36), WHITE, segments=12)]
p.append(blob((0.11, 0.12, 0.11), (X, -0.2, 0.5), WHITE, segments=10))
p.append(kit.cone(0.035, 0.0, 0.14, (X, -0.36, 0.49), SUN, verts=8, rot=(PI / 2 + 0.15, 0, 0)))
p.append(kit.sphere(0.02, (X - 0.06, -0.27, 0.53), RUBBER, segments=6))
p.append(kit.sphere(0.02, (X + 0.06, -0.27, 0.53), RUBBER, segments=6))
for e in (-1, 1):
    # Folded wings, grey with black tips, crossing over the tail.
    p.append(blob((0.05, 0.24, 0.07), (X + e * 0.12, 0.08, 0.4), '#b9c3cc', segments=10, rot=(0.18, 0, e * 0.12)))
    p.append(blob((0.04, 0.09, 0.05), (X + e * 0.08, 0.3, 0.37), RUBBER, segments=8, rot=(0.25, 0, 0)))
    p.append(rod((X + e * 0.05, 0.03, 0.24), (X + e * 0.06, 0.02, 0.02), 0.012, ORANGE, verts=5))
    p.append(kit.box((0.05, 0.08, 0.012), (X + e * 0.06, -0.01, 0.008), ORANGE, bevel=0.0))
p.append(blob((0.08, 0.1, 0.04), (X, 0.28, 0.34), WHITE, segments=8, rot=(0.3, 0, 0)))
m.mesh(p)

out = Path(sys.argv[1] if len(sys.argv) > 1 else 'skyport.glb')
# Four files, each well under a Playables file's 512 KiB: the apron's kit, its two big vehicles, the hall's
# furniture, and what stands round the airfield.
GROUPS = {
    '-apron': ['sp_stairs', 'sp_tug', 'sp_gpu', 'sp_cone', 'sp_chocks', 'sp_sign', 'sp_flood', 'sp_fence'] + [f'sp_case{i}' for i in range(6)],
    '-vehicles': ['sp_fuel', 'sp_belt'],
    '-hall': ['sp_desk', 'sp_queue', 'sp_podium', 'sp_seats_a', 'sp_seats_b', 'sp_barrier', 'sp_board', 'sp_vending', 'sp_plant', 'sp_bin', 'sp_bench', 'sp_lamp', 'sp_planter', 'sp_taxisign'],
    '-field': ['sp_windsock', 'sp_radar', 'sp_flag', 'sp_gaplane', 'sp_clubhouse', 'sp_gull'],
}
named = {b.name: b for b in rig.bases}
assert sorted(named) == sorted(n for g in GROUPS.values() for n in g), set(named) ^ {n for g in GROUPS.values() for n in g}
for suffix, names in GROUPS.items():
    rig.export_all(out.with_name(out.stem + suffix + out.suffix), [named[n] for n in names])
if len(sys.argv) > 2:
    rig.contact_sheet(sys.argv[2], rig.bases)
