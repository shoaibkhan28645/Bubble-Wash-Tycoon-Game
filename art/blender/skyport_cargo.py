"""Skyport International (Chapter 4, Part D): the cargo apron and the hangars, east of the tower.

sp_cargoshed, sp_hangar and sp_jetwash stand at the origin and are built at the town's own coordinates
(src/data/towns/skyport/layout.json), as Gate 4's pier is; sp_kloader is a vehicle the game puts in place.

sp_cargoshed: the cargo shed: corrugated walls, a roof with skylights, a canopy over the dock and a roller
door (sp_cargoshed_shutter, hinged at its drum: the game rolls it up by squashing it), pallets by the door,
marker sp_cargoshed_sign for its name board.

sp_kloader: the container loader that docks at the freighter's main-deck door: a long low chassis on six
wheels with a cab at the back, and at the front a platform on scissor arms (sp_kloader_lift, the arms,
which the game stretches upward; sp_kloader_platform, which rises with them to the door's sill). Front to -Y.

sp_hangar: the maintenance hangar: tall corrugated walls on three sides with a people door at the back,
open arched trusses overhead (so the plane inside can be seen), three sliding door leaves each side of the
front (sp_hangar_doorl0..2 and _doorr0..2, the game slides them aside), an overhead crane running along the
hangar (sp_hangar_crane) with its hook (sp_hangar_hook), a workbench, tool chest, engine stand and steps.
Markers: sp_hangar_sign (the name board over the door), sp_hangar_lamp0..3 (lamps under the trusses).

sp_jetwash: the jet wash, the car wash's colours a size up: columns and girders, splash walls, the control
room at the back with its window, and the gantry (sp_jetwash_gantry) that rolls the length of the bay on
floor rails, carrying two upright brushes (sp_jetwash_brushl/_brushr, spinning about their axes), a
roller brush across the top (sp_jetwash_brusht) and spray bars (markers sp_jetwash_spray0..5 for the
water). Marker sp_jetwash_sign for its board.

Usage: python art/blender/skyport_cargo.py <out-cargo.glb> [contact.png]
(out names the cargo file; the others are written beside it: skyport-hangar, skyport-jetwash.)
"""
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import kit  # noqa: E402

kit.reset()
import rig  # noqa: E402
from rig import Model, rod  # noqa: E402

PI = math.pi
LAYOUT = json.loads((Path(__file__).parents[2] / 'src/data/towns/skyport/layout.json').read_text())
WHITE = '#f7f8fa'
CLAD = '#e6ebf1'
RIB = '#d3dbe4'
NAVY = '#17324d'
AQUA = '#22c3c9'
SUN = '#ffd24a'
HIVIS = '#ff9f1c'
STEEL = '#c9d2dc'
GREY = '#9aa4b0'
DARK = '#3b3f4a'
RUBBER = '#2b2f38'
GLASS = '#30465e'
PANE = '#bfeef0'
RED = '#e8493f'
GREEN = '#5fb84f'
WOOD = '#c98a52'
PINK = '#ff5fa8'
BLUE = '#3bb4ff'
FOAM = '#eaf6ff'
BULB = '#fff3a0'
TOOLRED = '#d8423a'


def g(x, z, h=0.0):
    """The game's (x, z) at height h, here."""
    return (x, -z, h)


def wheel(at, r, width, verts=16):
    rot = (0, PI / 2, 0)
    return [
        kit.cylinder(r, width, at, RUBBER, verts=verts, bevel=min(0.04, r * 0.15), rot=rot),
        kit.cylinder(r * 0.56, width + 0.02, at, STEEL, verts=12, rot=rot),
    ]


def clad_wall(x0, z0, x1, z1, height, base=NAVY, trim=AQUA, every=0.9, gaps=()):
    """A corrugated wall from (x0, z0) to (x1, z1) in the game's coordinates: a dark plinth, the cladding with
    its ribs, a coloured band at the top. `gaps` are (along, half-width, height) doorways cut from it."""
    out = []
    length = math.hypot(x1 - x0, z1 - z0)
    ang = math.atan2(-(z1 - z0), x1 - x0)
    rot = (0, 0, ang)
    ux, uz = (x1 - x0) / length, (z1 - z0) / length
    cuts = sorted(gaps)
    # The wall in runs between its doorways (and above each doorway, a lintel).
    edges = [0.0]
    for along, half, _ in cuts:
        edges += [along - half, along + half]
    edges.append(length)
    for a, b in zip(edges[::2], edges[1::2]):
        if b - a < 0.05:
            continue
        m = (a + b) / 2
        x, z = x0 + ux * m, z0 + uz * m
        out.append(kit.box((b - a, 0.3, 0.6), g(x, z, 0.3), base, bevel=0.03, rot=rot))
        out.append(kit.box((b - a, 0.22, height - 0.9), g(x, z, 0.6 + (height - 0.9) / 2), CLAD, bevel=0.0, rot=rot))
        n = max(1, int((b - a) / every))
        for k in range(n):
            t = a + (k + 0.5) * (b - a) / n
            out.append(kit.box((0.12, 0.3, height - 0.95), g(x0 + ux * t, z0 + uz * t, 0.6 + (height - 0.95) / 2), RIB, bevel=0.0, rot=rot))
    for along, half, top in cuts:
        x, z = x0 + ux * along, z0 + uz * along
        out.append(kit.box((2 * half + 0.1, 0.26, height - top), g(x, z, top + (height - top) / 2), CLAD, bevel=0.0, rot=rot))
        for e in (-1, 1):
            out.append(kit.box((0.14, 0.34, top), g(x + ux * e * (half + 0.07), z + uz * e * (half + 0.07), top / 2), base, bevel=0.02, rot=rot))
        out.append(kit.box((2 * half + 0.3, 0.34, 0.14), g(x, z, top + 0.07), base, bevel=0.02, rot=rot))
    out.append(kit.box((length + 0.1, 0.36, 0.36), g((x0 + x1) / 2, (z0 + z1) / 2, height - 0.12), trim, bevel=0.04, rot=rot))
    return out


def lamp(at, h):
    return [rod(g(*at, h + 1.0), g(*at, h + 0.3), 0.03, DARK, verts=5), kit.cone(0.42, 0.12, 0.3, g(*at, h + 0.2), NAVY, verts=14), kit.sphere(0.16, g(*at, h + 0.05), BULB, segments=8)]


# =========================================================================================================
# --- The cargo shed, built where it stands: its dock door on the north side, facing the apron. ---
cg = LAYOUT['cargo']
shed = cg['shed']
door = cg['door']
m = Model('sp_cargoshed', 0.0)
p = []
W0, W1, N, S = shed['minX'], shed['maxX'], shed['minZ'], shed['maxZ']
H = 5.4
DOOR_W, DOOR_H = 4.6, 4.0
p += clad_wall(W0, N, W1, N, H, gaps=((door['x'] - W0, DOOR_W / 2, DOOR_H), (W1 - 1.8 - W0, 0.55, 2.2)))
p += clad_wall(W0, S, W1, S, H)
p += clad_wall(W0, N, W0, S, H)
p += clad_wall(W1, N, W1, S, H)
# The roof: a shallow gable, ribbed, with a row of skylights along each slope.
for side in (-1, 1):
    mz = (N + S) / 2 + side * (S - N) / 4
    p.append(kit.box((W1 - W0 + 0.5, (S - N) / 2 + 0.3, 0.16), g((W0 + W1) / 2, mz, H + 0.35), RIB, bevel=0.02, rot=(side * 0.12, 0, 0)))
    for k in range(4):
        p.append(kit.box((1.8, 1.2, 0.08), g(W0 + 1.8 + k * 3.2, mz, H + 0.48), PANE, bevel=0.02, rot=(side * 0.12, 0, 0)))
p.append(kit.box((W1 - W0 + 0.6, 0.3, 0.3), g((W0 + W1) / 2, (N + S) / 2, H + 0.75), NAVY, bevel=0.03))
# The dock: a raised lip in front of the door, yellow-and-black bumpers, the leveller plate, a canopy above.
p.append(kit.box((DOOR_W + 2.4, 1.2, 0.36), g(door['x'], N - 0.55, 0.18), GREY, bevel=0.04))
p.append(kit.box((DOOR_W - 0.3, 1.0, 0.06), g(door['x'], N - 0.6, 0.39), STEEL, bevel=0.0))
for e in (-1, 1):
    for k in range(3):
        p.append(kit.box((0.36, 0.2, 0.16), g(door['x'] + e * (DOOR_W / 2 + 0.7), N - 1.17, 0.09 + k * 0.17), SUN if k % 2 == 0 else DARK, bevel=0.01))
p.append(kit.box((DOOR_W + 3.0, 2.6, 0.16), g(door['x'], N - 1.1, DOOR_H + 0.75), NAVY, bevel=0.04, rot=(-0.1, 0, 0)))
for e in (-1, 1):
    p.append(rod(g(door['x'] + e * (DOOR_W / 2 + 1.3), N - 2.25, 0), g(door['x'] + e * (DOOR_W / 2 + 1.3), N - 2.25, DOOR_H + 0.62), 0.07, STEEL, verts=8))
p.append(kit.cylinder(0.4, DOOR_W + 0.3, g(door['x'], N - 0.05, DOOR_H + 0.25), GREY, verts=14, rot=(0, PI / 2, 0)))
# Pallets and a drum by the wall, a light either side of the door.
for k, (dx, dz) in enumerate(((-5.0, -0.6), (-5.0, -1.9), (5.4, -0.7))):
    x, z = door['x'] + dx, N + dz
    p.append(kit.box((1.2, 1.0, 0.14), g(x, z, 0.07), WOOD, bevel=0.01))
    p.append(kit.box((1.1, 0.9, 0.7), g(x, z, 0.5), ['#2c62d6', HIVIS, AQUA][k], bevel=0.05))
    for e in (-1, 1):
        p.append(kit.box((1.12, 0.04, 0.05), g(x, z + e * 0.3, 0.86), DARK, bevel=0.0))
p.append(kit.cylinder(0.32, 0.9, g(door['x'] + 6.7, N - 0.5, 0.45), RED, verts=14))
for e in (-1, 1):
    p.append(kit.box((0.4, 0.26, 0.26), g(door['x'] + e * (DOOR_W / 2 + 0.6), N - 0.2, DOOR_H + 0.2), BULB, bevel=0.03))
m.marker('sign', g(door['x'], N - 2.42, DOOR_H + 0.95))
m.mesh(p)
# The roller door: slats down from its drum (the game squashes it upward to open it).
sh = []
for k in range(14):
    sh.append(kit.box((DOOR_W - 0.1, 0.1, DOOR_H / 14 - 0.03), g(door['x'], N - 0.02, DOOR_H - (k + 0.5) * DOOR_H / 14), CLAD if k % 2 else RIB, bevel=0.0))
sh.append(kit.box((DOOR_W - 0.1, 0.16, 0.12), g(door['x'], N - 0.04, 0.06), HIVIS, bevel=0.02))
m.part('shutter', g(door['x'], N, DOOR_H), sh)

# =========================================================================================================
# --- The K-loader: front (the platform) to -Y, the cab at the back. ---
X = 30.0
m = Model('sp_kloader', X)
p = []
L, Wd = 5.4, 2.2
p.append(kit.box((Wd, L, 0.5), (X, 0.2, 0.62), HIVIS, bevel=0.08))
p.append(kit.box((Wd + 0.06, L - 0.4, 0.12), (X, 0.2, 0.92), DARK, bevel=0.02))
for k in range(5):
    p.append(kit.box((0.06, 0.4, 0.3), (X + Wd / 2 + 0.01, -2.0 + k * 1.0, 0.62), SUN if k % 2 else DARK, bevel=0.0))
# The cab at the back, its window, a beacon on its roof.
p.append(kit.box((1.5, 1.3, 1.5), (X + 0.3, 2.3, 1.65), WHITE, bevel=0.12))
p.append(kit.box((1.3, 0.06, 0.7), (X + 0.3, 1.63, 1.95), GLASS, bevel=0.02))
p.append(kit.box((0.06, 1.0, 0.6), (X + 1.06, 2.3, 1.95), GLASS, bevel=0.02))
p.append(kit.cylinder(0.12, 0.16, (X + 0.3, 2.3, 2.5), HIVIS, verts=10))
# Six small wheels.
for y in (-2.0, 0.2, 2.2):
    for e in (-1, 1):
        p += wheel((X + e * (Wd / 2 - 0.05), y, 0.38), 0.38, 0.32)
# The rails the scissor arms run in.
for e in (-1, 1):
    p.append(kit.box((0.14, 2.6, 0.14), (X + e * 0.9, -1.2, 1.0), STEEL, bevel=0.02))
m.mesh(p)
# The scissor arms: a cross pair each side, a unit high (the game stretches it up to the platform).
LIFT_Y = -1.2
arms = []
for e in (-1, 1):
    for t in (-1, 1):
        arms.append(kit.box((0.1, 0.12, 1.42), (X + e * 0.9, LIFT_Y, 0.5), STEEL, bevel=0.02, rot=(t * 1.0, 0, 0)))
    arms.append(kit.cylinder(0.08, 0.16, (X + e * 0.9, LIFT_Y, 0.5), DARK, verts=8, rot=(0, PI / 2, 0)))
m.part('lift', (X, LIFT_Y, 1.0), arms)
# The platform: a deck of rollers with railings, a striped front lip to meet the door.
pl = [kit.box((Wd + 0.3, 2.9, 0.22), (X, LIFT_Y, 1.12), GREY, bevel=0.04)]
for k in range(7):
    pl.append(kit.cylinder(0.07, Wd - 0.1, (X, LIFT_Y - 1.2 + k * 0.4, 1.27), STEEL, verts=8, rot=(0, PI / 2, 0)))
for e in (-1, 1):
    pl.append(kit.box((0.06, 2.7, 0.06), (X + e * (Wd / 2 + 0.1), LIFT_Y + 0.05, 2.0), SUN, bevel=0.0))
    for y in (-1.2, 0.0, 1.2):
        pl.append(rod((X + e * (Wd / 2 + 0.1), LIFT_Y + y, 1.2), (X + e * (Wd / 2 + 0.1), LIFT_Y + y, 2.0), 0.03, SUN, verts=5))
for k in range(6):
    pl.append(kit.box((Wd / 6, 0.2, 0.12), (X - Wd / 2 + (k + 0.5) * Wd / 6, LIFT_Y - 1.5, 1.2), SUN if k % 2 else DARK, bevel=0.0))
m.part('platform', (X, LIFT_Y, 1.12), pl)

# =========================================================================================================
# --- The maintenance hangar, built where it stands: open to the taxiway at the north, a door at the back. ---
hg = LAYOUT['hangar']
hall = hg['hall']
m = Model('sp_hangar', 0.0)
p = []
H0, H1, HN, HS = hall['minX'], hall['maxX'], hall['minZ'], hall['maxZ']
HH = 6.6
CX = (H0 + H1) / 2
p += clad_wall(H0, HN, H0, HS, HH)
p += clad_wall(H1, HN, H1, HS, HH)
p += clad_wall(H0, HS, H1, HS, HH, gaps=((hg['door']['x'] - H0, 0.8, 2.4),))
# The arched trusses: a curved top chord over a straight bottom tie, struts between, every few metres.
RISE = 2.6
SPAN = H1 - H0


def arch_y(x):
    u = (x - CX) / (SPAN / 2)
    return HH + RISE * (1 - u * u)


ARCHES = [HN + 0.2, HN + 4.0, HN + 8.0, HN + 12.0, HN + 16.0, HS - 0.2]
for z in ARCHES:
    pts = [H0 + SPAN * k / 12 for k in range(13)]
    for a, b in zip(pts, pts[1:]):
        ya, yb = arch_y(a), arch_y(b)
        p.append(rod(g(a, z, ya), g(b, z, yb), 0.12, NAVY, verts=6))
    p.append(rod(g(H0, z, HH - 0.1), g(H1, z, HH - 0.1), 0.08, STEEL, verts=6))
    for a in pts[1:-1:2]:
        p.append(rod(g(a, z, HH - 0.1), g(a, z, arch_y(a)), 0.05, STEEL, verts=5))
# Purlins along the hangar at the crown and either side, and the eaves roofed over the walls.
for x in (CX, CX - 5.0, CX + 5.0, H0 + 1.0, H1 - 1.0):
    p.append(rod(g(x, HN + 0.2, arch_y(x) + 0.08), g(x, HS - 0.2, arch_y(x) + 0.08), 0.07, NAVY, verts=6))
for side in (-1, 1):
    x = H0 + 1.4 if side < 0 else H1 - 1.4
    p.append(kit.box((3.0, HS - HN, 0.14), g(x, (HN + HS) / 2, HH + 0.6), RIB, bevel=0.02, rot=(0, side * 0.28, 0)))
# The front: tall posts and a deep lintel carrying the name board, rails for the door leaves.
for x in (H0, H1):
    p.append(kit.box((0.6, 0.6, HH + 0.4), g(x, HN, (HH + 0.4) / 2), NAVY, bevel=0.06))
p.append(kit.box((SPAN + 0.6, 0.7, 0.9), g(CX, HN, HH + 0.1), NAVY, bevel=0.06))
p.append(kit.box((SPAN + 0.4, 0.74, 0.16), g(CX, HN, HH - 0.42), SUN, bevel=0.03))
for k in range(3):
    p.append(kit.box((SPAN, 0.08, 0.08), g(CX, HN - 0.12 - k * 0.24, 0.04), STEEL, bevel=0.0))
m.marker('sign', g(CX, HN - 0.38, HH + 0.12))
# The floor's markings: the stand's centre line, its stop bar, a hatched box by the bench.
stand = LAYOUT['stands']['hangar']
p.append(kit.box((0.22, HS - HN - 3.0, 0.02), g(stand['x'], (HN + HS) / 2 - 1.0, 0.015), SUN, bevel=0.0))
p.append(kit.box((2.4, 0.3, 0.02), g(stand['x'], stand['noseZ'] + 0.4, 0.015), SUN, bevel=0.0))
for k in range(5):
    p.append(kit.box((0.18, 1.6, 0.02), g(H0 + 1.4 + k * 0.6, HS - 2.6, 0.015), SUN, bevel=0.0, rot=(0, 0, 0.6)))
# Along the back wall: a workbench with a vice and tools, a red tool chest, shelves of parts.
bz = HS - 0.75
p.append(kit.box((4.2, 0.9, 0.12), g(H0 + 3.4, bz, 0.95), WOOD, bevel=0.02))
for x in (H0 + 1.5, H0 + 5.3):
    p.append(kit.box((0.1, 0.8, 0.95), g(x, bz, 0.47), DARK, bevel=0.0))
p.append(kit.box((0.3, 0.3, 0.25), g(H0 + 2.2, bz, 1.14), GREY, bevel=0.02))
p.append(kit.box((3.6, 0.06, 1.0), g(H0 + 3.4, HS - 0.25, 1.9), '#c7ced8', bevel=0.0))
for k in range(6):
    p.append(kit.box((0.08, 0.04, 0.4), g(H0 + 1.9 + k * 0.6, HS - 0.3, 1.9), [TOOLRED, SUN, STEEL][k % 3], bevel=0.0))
p.append(kit.box((1.2, 0.7, 1.2), g(H0 + 7.4, bz, 0.6), TOOLRED, bevel=0.06))
for k in range(4):
    p.append(kit.box((1.1, 0.04, 0.03), g(H0 + 7.4, bz - 0.36, 0.3 + k * 0.25), STEEL, bevel=0.0))
for k in range(3):
    p.append(kit.box((2.2, 0.6, 0.06), g(H1 - 5.4, bz, 0.5 + k * 0.7), GREY, bevel=0.01))
    for j in range(3):
        p.append(kit.box((0.5, 0.45, 0.4), g(H1 - 6.1 + j * 0.7, bz, 0.73 + k * 0.7), [AQUA, HIVIS, '#2c62d6'][(j + k) % 3], bevel=0.03))
for x in (H1 - 6.5, H1 - 4.3):
    p.append(kit.box((0.08, 0.6, 2.2), g(x, bz, 1.1), DARK, bevel=0.0))
# A spare engine on its stand, a set of steps by the nose, a fire extinguisher, a tool cart.
ex, ez = H0 + 3.0, HN + 5.0
p.append(kit.box((1.4, 2.4, 0.3), g(ex, ez, 0.3), SUN, bevel=0.04))
for e in (-1, 1):
    p += wheel(g(ex + e * 0.65, ez - 0.9, 0.14), 0.14, 0.12, verts=10)
    p += wheel(g(ex + e * 0.65, ez + 0.9, 0.14), 0.14, 0.12, verts=10)
p.append(kit.cylinder(0.62, 2.0, g(ex, ez, 1.15), '#eef2f6', verts=20, rot=(PI / 2, 0, 0)))
p.append(kit.torus(0.6, 0.06, g(ex, ez - 1.0, 1.15), RED, rot=(PI / 2, 0, 0), major_segments=20, minor_segments=6))
p.append(kit.cylinder(0.5, 0.1, g(ex, ez - 0.96, 1.15), DARK, verts=18, rot=(PI / 2, 0, 0)))
sx, sz = stand['x'] - 3.4, stand['noseZ'] + 0.6
for k in range(5):
    p.append(kit.box((1.0, 0.36, 0.08), g(sx, sz + 0.9 - k * 0.36, 0.3 + k * 0.32), SUN, bevel=0.01))
for e in (-1, 1):
    p.append(rod(g(sx + e * 0.5, sz + 1.1, 0), g(sx + e * 0.5, sz - 0.7, 1.6), 0.05, DARK, verts=6))
    p.append(rod(g(sx + e * 0.5, sz - 0.7, 0), g(sx + e * 0.5, sz - 0.7, 2.4), 0.05, DARK, verts=6))
p.append(kit.cylinder(0.14, 0.6, g(H1 - 0.5, HS - 1.8, 0.3), RED, verts=10))
cx_, cz_ = H1 - 2.4, HN + 6.0
p.append(kit.box((1.2, 0.7, 0.08), g(cx_, cz_, 0.95), TOOLRED, bevel=0.02))
p.append(kit.box((1.2, 0.7, 0.08), g(cx_, cz_, 0.45), TOOLRED, bevel=0.02))
for e in (-1, 1):
    for f in (-1, 1):
        p.append(rod(g(cx_ + e * 0.55, cz_ + f * 0.3, 0.12), g(cx_ + e * 0.55, cz_ + f * 0.3, 0.95), 0.025, DARK, verts=5))
        p += wheel(g(cx_ + e * 0.55, cz_ + f * 0.3, 0.1), 0.1, 0.06, verts=8)
for k, (x, z) in enumerate(((CX - 4.5, HN + 5.0), (CX + 4.5, HN + 5.0), (CX - 4.5, HS - 5.0), (CX + 4.5, HS - 5.0))):
    p += lamp((x, z), arch_y(x) - 1.6)
    m.marker(f'lamp{k}', g(x, z, arch_y(x) - 1.6))
m.mesh(p)
# The door leaves: three each side, on rails one behind another so they stack against the wall when open.
LEAF = SPAN / 6
for side, name in ((-1, 'doorl'), (1, 'doorr')):
    for k in range(3):
        x = CX + side * (SPAN / 2 - (k + 0.5) * LEAF)
        z = HN - 0.2 - k * 0.24
        leaf = [kit.box((LEAF - 0.05, 0.16, HH - 0.4), g(x, z, (HH - 0.4) / 2 + 0.05), CLAD, bevel=0.02)]
        for j in range(4):
            leaf.append(kit.box((0.1, 0.2, HH - 0.6), g(x - LEAF / 2 + 0.4 + j * (LEAF - 0.8) / 3, z, (HH - 0.4) / 2 + 0.05), RIB, bevel=0.0))
        leaf.append(kit.box((LEAF - 0.3, 0.2, 0.7), g(x, z, HH - 1.4), PANE, bevel=0.02))
        leaf.append(kit.box((LEAF - 0.05, 0.22, 0.3), g(x, z, 0.2), NAVY, bevel=0.02))
        leaf.append(kit.box((LEAF - 0.05, 0.22, 0.12), g(x, z, 1.0), SUN, bevel=0.0))
        m.part(f'{name}{k}', g(x, z, 0.0), leaf)
# The overhead crane: a beam across the hangar on wheels running along the side walls' tops, its hoist.
cr = [kit.box((SPAN - 0.6, 0.5, 0.5), g(CX, HN + 3.0, HH - 0.6), SUN, bevel=0.05)]
for e in (-1, 1):
    cr.append(kit.box((0.6, 1.4, 0.4), g(CX + e * (SPAN / 2 - 0.5), HN + 3.0, HH - 0.4), NAVY, bevel=0.04))
cr.append(kit.box((0.8, 0.8, 0.6), g(CX + 2.0, HN + 3.0, HH - 1.15), NAVY, bevel=0.05))
m.part('crane', g(CX, HN + 3.0, HH - 0.6), cr)
hk = [rod(g(CX + 2.0, HN + 3.0, HH - 1.45), g(CX + 2.0, HN + 3.0, HH - 3.4), 0.03, DARK, verts=5), kit.torus(0.16, 0.05, g(CX + 2.0, HN + 3.0, HH - 3.6), SUN, rot=(PI / 2, 0, 0), major_segments=12, minor_segments=5)]
m.part('hook', g(CX + 2.0, HN + 3.0, HH - 1.45), hk, on='crane')

# =========================================================================================================
# --- The jet wash, built where it stands: the car wash's pink and blue, open at the front. ---
jw = LAYOUT['jetwash']
bay = jw['hall']
m = Model('sp_jetwash', 0.0)
p = []
J0, J1, JN, JS = bay['minX'], bay['maxX'], bay['minZ'], bay['maxZ']
JH = 8.6
JX = (J0 + J1) / 2
# Columns down each side, girders across the top, a splash wall between the columns.
cols_z = [JN + k * (JS - JN) / 5 for k in range(6)]
for x in (J0, J1):
    for z in cols_z:
        p.append(kit.box((0.5, 0.5, JH), g(x, z, JH / 2), WHITE, bevel=0.06))
        p.append(kit.box((0.56, 0.56, 0.3), g(x, z, JH - 0.4), PINK, bevel=0.04))
    p.append(kit.box((0.4, JS - JN, 0.5), g(x, (JN + JS) / 2, JH - 0.2), BLUE, bevel=0.04))
    for a, b in zip(cols_z, cols_z[1:]):
        p.append(kit.box((0.18, b - a - 0.4, 2.6), g(x, (a + b) / 2, 1.3), PINK if (a - JN) % 8 < 4 else BLUE, bevel=0.02))
        p.append(kit.box((0.22, b - a - 0.4, 0.14), g(x, (a + b) / 2, 2.62), WHITE, bevel=0.02))
for z in cols_z:
    p.append(kit.box((J1 - J0, 0.36, 0.42), g(JX, z, JH - 0.25), WHITE, bevel=0.04))
for x in (JX - 4.0, JX, JX + 4.0):
    p.append(kit.box((0.22, JS - JN, 0.22), g(x, (JN + JS) / 2, JH + 0.05), STEEL, bevel=0.02))
# The front beam with its board, bubbles painted on it.
p.append(kit.box((J1 - J0 + 0.8, 0.7, 1.4), g(JX, JN, JH + 0.5), PINK, bevel=0.08))
for k in range(7):
    p.append(kit.sphere(0.18 + 0.08 * (k % 3), g(J0 + 1.2 + k * 2.8, JN - 0.38, JH + 0.2 + 0.3 * (k % 2)), FOAM, segments=8))
m.marker('sign', g(JX, JN - 0.4, JH + 0.6))
# The back: a wall with the control room's window looking down the bay, its console and chair.
p += clad_wall(J0, JS, J1, JS, 6.0, base=BLUE, trim=PINK)
p.append(kit.box((5.0, 0.12, 1.6), g(J0 + 4.0, JS - 0.18, 3.4), GLASS, bevel=0.02))
p.append(kit.box((5.4, 0.3, 0.2), g(J0 + 4.0, JS - 0.2, 2.5), WHITE, bevel=0.02))
p.append(kit.box((5.4, 0.3, 0.2), g(J0 + 4.0, JS - 0.2, 4.3), WHITE, bevel=0.02))
# The floor: a wet blue apron with drains down the middle and the rails the gantry runs on.
p.append(kit.box((J1 - J0 - 0.8, JS - JN - 0.4, 0.04), g(JX, (JN + JS) / 2, 0.02), '#cfe9f5', bevel=0.0))
for k in range(6):
    p.append(kit.box((1.6, 0.4, 0.05), g(JX, JN + 2.0 + k * 3.2, 0.03), DARK, bevel=0.0))
RAIL_X = (J0 + 0.9, J1 - 0.9)
for x in RAIL_X:
    p.append(kit.box((0.24, JS - JN - 0.4, 0.12), g(x, (JN + JS) / 2, 0.06), STEEL, bevel=0.02))
# Hoses coiled on the walls, a bucket and a mop for old times' sake.
for k, x in enumerate((J0 + 0.4, J1 - 0.4)):
    p.append(kit.torus(0.45, 0.07, g(x, JN + 1.4, 1.6), [PINK, BLUE][k], rot=(0, PI / 2, 0), major_segments=16, minor_segments=6))
p.append(kit.cylinder(0.26, 0.4, g(J1 - 1.2, JS - 1.2, 0.2), PINK, verts=12))
p.append(rod(g(J1 - 1.0, JS - 1.2, 0.0), g(J1 - 0.8, JS - 1.4, 1.5), 0.03, WOOD, verts=5))
m.mesh(p)
# The gantry: two legs on the rails and a beam across the top, with its brushes and spray bars.
GZ = JN + 1.2
GH = 7.4
gp = []
for x in RAIL_X:
    gp.append(kit.box((0.7, 1.2, GH), g(x, GZ, GH / 2 + 0.1), WHITE, bevel=0.08))
    gp.append(kit.box((0.76, 1.26, 0.5), g(x, GZ, 1.0), PINK, bevel=0.05))
    gp.append(kit.box((0.76, 1.26, 0.5), g(x, GZ, GH - 0.6), BLUE, bevel=0.05))
    for e in (-1, 1):
        gp += wheel(g(x, GZ + e * 0.45, 0.22), 0.2, 0.28, verts=10)
gp.append(kit.box((RAIL_X[1] - RAIL_X[0] + 0.7, 1.0, 0.8), g(JX, GZ, GH + 0.2), WHITE, bevel=0.08))
gp.append(kit.box((RAIL_X[1] - RAIL_X[0] + 0.76, 1.06, 0.18), g(JX, GZ, GH - 0.1), PINK, bevel=0.03))
# A beacon on each leg's top, a control box on one leg.
for x in RAIL_X:
    gp.append(kit.cylinder(0.16, 0.2, g(x, GZ, GH + 0.7), SUN, verts=10))
gp.append(kit.box((0.5, 0.36, 0.7), g(RAIL_X[0] + 0.55, GZ, 1.8), NAVY, bevel=0.04))
# Spray bars down each leg and along the beam, nozzles on them (markers for the water).
for x in RAIL_X:
    side = 1 if x < JX else -1
    gp.append(rod(g(x + side * 0.45, GZ - 0.55, 0.6), g(x + side * 0.45, GZ - 0.55, GH - 0.5), 0.05, STEEL, verts=6))
gp.append(rod(g(RAIL_X[0] + 0.5, GZ - 0.55, GH - 0.4), g(RAIL_X[1] - 0.5, GZ - 0.55, GH - 0.4), 0.05, STEEL, verts=6))
SPRAYS = [(RAIL_X[0] + 0.5, 1.6), (RAIL_X[0] + 0.5, 4.0), (RAIL_X[1] - 0.5, 1.6), (RAIL_X[1] - 0.5, 4.0), (JX - 3.0, GH - 0.5), (JX + 3.0, GH - 0.5)]
for k, (x, h) in enumerate(SPRAYS):
    gp.append(kit.sphere(0.09, g(x, GZ - 0.6, h), BLUE, segments=6))
m.part('gantry', g(JX, GZ, 0.0), gp)
for k, (x, h) in enumerate(SPRAYS):
    m.marker(f'spray{k}', g(x, GZ - 0.62, h), on='gantry')


def brush_body(r, length, axis):
    """A big round brush: a core with soft stripes of bristle in the car wash's colours, along `axis`."""
    out = []
    n = 9
    for k in range(n):
        t = -length / 2 + (k + 0.5) * length / n
        col = PINK if k % 2 else BLUE
        if axis == 'z':
            out.append(kit.star_disc(r, r * 0.72, length / n * 0.96, (0, 0, t), col, points=14, twist=0.2))
        else:
            disc = kit.star_disc(r, r * 0.72, length / n * 0.96, (0, 0, 0), col, points=14, twist=0.2)
            disc.rotation_euler = (0, PI / 2, 0)
            kit._apply_all(disc)
            disc.location = (t, 0, 0)
            kit._apply_all(disc)
            bpy_apply(disc)
            out.append(disc)
    out.append(kit.cylinder(0.08, length + 0.6, (0, 0, 0), STEEL, verts=8, rot=(0, PI / 2, 0) if axis == 'x' else (0, 0, 0)))
    return out


def bpy_apply(obj):
    kit.bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    kit.bpy.context.view_layer.objects.active = obj
    kit.bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)


def placed(parts, at):
    for q in parts:
        q.location = (q.location[0] + at[0], q.location[1] + at[1], q.location[2] + at[2])
        kit._apply_all(q)
        bpy_apply(q)
    return parts


# The upright brushes hang from the beam just inside the legs; the roller brush runs across under the beam.
BR = 0.75
for name, x in (('brushl', RAIL_X[0] + 1.7), ('brushr', RAIL_X[1] - 1.7)):
    at = g(x, GZ + 0.2, 3.2)
    m.part(name, at, placed(brush_body(BR, 5.4, 'z'), at), on='gantry')
at = g(JX, GZ + 0.2, GH - 1.0)
m.part('brusht', at, placed(brush_body(0.6, RAIL_X[1] - RAIL_X[0] - 4.6, 'x'), at), on='gantry')

out = Path(sys.argv[1] if len(sys.argv) > 1 else 'skyport-cargo.glb')
FILES = {
    'cargo': ('sp_cargoshed', 'sp_kloader'),
    'hangar': ('sp_hangar',),
    'jetwash': ('sp_jetwash',),
}
assert sorted(b.name for b in rig.bases) == sorted(n for names in FILES.values() for n in names)
for key, names in FILES.items():
    rig.export_all(out.with_name(out.stem.replace('cargo', key) + out.suffix), [b for b in rig.bases if b.name in names])
if len(sys.argv) > 2:
    rig.contact_sheet(sys.argv[2], [b for b in rig.bases if b.name == 'sp_kloader'], size=(520, 420), cols=1)
