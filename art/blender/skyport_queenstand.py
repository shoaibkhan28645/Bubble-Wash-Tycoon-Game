"""Skyport International (Chapter 4, Part E): the Sky Queen's stand, and the cranes that build her.

sp_towercrane: a tower crane, yellow lattice on a concrete base, that stands by the Sky Queen's stand while
she's put together (20 minutes). Its jib swings (sp_towercrane_jib, turning about the tower's top), its
trolley runs along the jib (sp_towercrane_trolley, on the jib), the hook hangs from the trolley on its cable
(sp_towercrane_cable, a cable a metre long the game stretches down; sp_towercrane_hook, the hook block the
game lowers to the cable's end). The jib reaches out to -Y (+Z in the game) at rest.

sp_queensign: the gantry over the front of the Sky Queen's stand, facing the camera (-Y): two white pylons
with gold bands, a navy beam (marker sp_queensign_sign for its name board), a big gold crown on top, lamps
along it (painted the bulb colour: they glow at night).

Usage: python art/blender/skyport_queenstand.py <out.glb> [preview.png]
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import kit  # noqa: E402

kit.reset()
import rig  # noqa: E402
from rig import Model, rod  # noqa: E402

PI = math.pi
SUN = '#ffd24a'
HIVIS = '#ff9f1c'
NAVY = '#17324d'
WHITE = '#f7f8fa'
CONCRETE = '#b9bfc7'
DARK = '#3b3f4a'
STEEL = '#9aa5b3'
GLASS = '#30465e'
RED = '#e8493f'
GOLD = '#ffc21a'
BULB = '#fff3a0'

# =========================================================================================================
# --- The tower crane. ---
X = 0.0
m = Model('sp_towercrane', X)
p = []
TOWER = 15.0
HALF = 0.55
# A concrete base with its ballast blocks.
p.append(kit.box((3.2, 3.2, 0.5), (X, 0, 0.25), CONCRETE, bevel=0.05))
for e in (-1, 1):
    p.append(kit.box((1.2, 2.6, 0.5), (X + e * 0.85, 0, 0.75), '#9aa1aa', bevel=0.04))
# The mast: four chords, a horizontal and a diagonal on each face every section.
SECTION = 1.5
corners = [(X + sx * HALF, sy * HALF) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
for cx, cy in corners:
    p.append(rod((cx, cy, 0.5), (cx, cy, TOWER), 0.07, SUN, verts=5))
n = int((TOWER - 0.5) / SECTION)
for k in range(n + 1):
    z = 0.5 + k * SECTION
    for i in range(4):
        a = corners[i]
        b = corners[(i + 1) % 4]
        p.append(rod((a[0], a[1], z), (b[0], b[1], z), 0.04, SUN, verts=4))
        if k < n:
            p.append(rod((a[0], a[1], z), (b[0], b[1], z + SECTION), 0.035, SUN, verts=4))
# A ladder up one face, a little platform at the top.
p.append(kit.box((1.6, 1.6, 0.12), (X, 0, TOWER + 0.06), DARK, bevel=0.02))
m.mesh(p)

# The jib, swinging on the slewing ring at the mast's top: the cab, the jib out to -Y, the counter-jib
# behind with its concrete counterweights, the tower head with its tie bars.
TOP = TOWER + 0.12
JIB = 14.0
CJIB = 5.0
j = [kit.cylinder(0.8, 0.3, (X, 0, TOP + 0.15), DARK, verts=16)]
j.append(kit.box((1.3, 1.3, 1.25), (X + 0.95, -0.4, TOP + 0.95), WHITE, bevel=0.08))
j.append(kit.box((1.32, 0.06, 0.6), (X + 0.95, -1.06, TOP + 1.15), GLASS, bevel=0.02))
j.append(kit.box((0.06, 1.0, 0.55), (X + 1.61, -0.4, TOP + 1.15), GLASS, bevel=0.02))
# The jib: a triangular lattice, two bottom chords and one on top, braced.
JZ = TOP + 0.45
for e in (-1, 1):
    j.append(rod((X + e * 0.4, 0.4, JZ), (X + e * 0.4, -JIB, JZ), 0.05, SUN, verts=4))
j.append(rod((X, 0.4, JZ + 0.9), (X, -JIB + 0.4, JZ + 0.2), 0.05, SUN, verts=4))
for k in range(int(JIB / 1.0)):
    y = 0.4 - k * 1.0
    zt = JZ + 0.9 - 0.7 * k / JIB
    for e in (-1, 1):
        j.append(rod((X + e * 0.4, y, JZ), (X, y - 0.5, zt - 0.035), 0.025, SUN, verts=4))
        j.append(rod((X, y - 0.5, zt - 0.035), (X + e * 0.4, y - 1.0, JZ), 0.025, SUN, verts=4))
    j.append(rod((X - 0.4, y, JZ), (X + 0.4, y, JZ), 0.025, SUN, verts=4))
# Red and white tips, a beacon at the jib's end.
j.append(kit.box((0.9, 0.3, 0.3), (X, -JIB, JZ + 0.1), RED, bevel=0.02))
j.append(kit.sphere(0.14, (X, -JIB, JZ + 0.4), RED, segments=8))
# The counter-jib with its walkway and the counterweights.
for e in (-1, 1):
    j.append(rod((X + e * 0.4, 0.4, JZ), (X + e * 0.4, CJIB, JZ), 0.05, SUN, verts=4))
j.append(kit.box((0.9, CJIB - 0.6, 0.06), (X, CJIB / 2 + 0.3, JZ + 0.05), DARK, bevel=0.0))
for k in range(3):
    j.append(kit.box((1.2, 0.6, 1.1), (X, CJIB - 0.5 - k * 0.65, JZ - 0.5), CONCRETE, bevel=0.04))
# The tower head and its tie bars down to the jib and the counter-jib.
HEAD = JZ + 3.0
for e in (-1, 1):
    j.append(rod((X + e * 0.4, -0.3, JZ), (X, 0, HEAD), 0.05, SUN, verts=4))
    j.append(rod((X + e * 0.4, 0.3, JZ), (X, 0, HEAD), 0.05, SUN, verts=4))
j.append(rod((X, 0, HEAD), (X, -JIB * 0.62, JZ + 0.8), 0.025, STEEL, verts=4))
j.append(rod((X, 0, HEAD), (X, CJIB - 0.3, JZ + 0.1), 0.025, STEEL, verts=4))
j.append(kit.box((1.6, 0.3, 0.4), (X, 0, JZ - 0.2), HIVIS, bevel=0.03))
m.part('jib', (X, 0, TOP), j)

# The trolley on the jib's bottom chords, the cable down from it, the hook block.
TROLLEY_Y = -8.0
t = [kit.box((1.0, 0.7, 0.3), (X, TROLLEY_Y, JZ - 0.2), DARK, bevel=0.03)]
for e in (-1, 1):
    for f in (-1, 1):
        t.append(kit.cylinder(0.09, 0.08, (X + e * 0.4, TROLLEY_Y + f * 0.25, JZ - 0.02), STEEL, verts=8, rot=(0, PI / 2, 0)))
m.part('trolley', (X, TROLLEY_Y, JZ - 0.3), t, on='jib')
# (A cable a metre long, its top at the trolley: the game stretches it down to the hook.)
m.part('cable', (X, TROLLEY_Y, JZ - 0.35), [rod((X, TROLLEY_Y, JZ - 0.35), (X, TROLLEY_Y, JZ - 1.35), 0.03, DARK, verts=5)], on='trolley')
hook = [kit.box((0.45, 0.3, 0.55), (X, TROLLEY_Y, JZ - 1.6), SUN, bevel=0.06)]
hook.append(kit.torus(0.16, 0.05, (X, TROLLEY_Y, JZ - 2.05), STEEL, rot=(PI / 2, 0, 0), major_segments=12, minor_segments=5))
m.part('hook', (X, TROLLEY_Y, JZ - 1.35), hook, on='trolley')

# =========================================================================================================
# --- The gantry over the Sky Queen's stand. ---
X = 30.0
m = Model('sp_queensign', X)
p = []
SPAN = 12.0
H = 6.4
for e in (-1, 1):
    x = X + e * SPAN / 2
    p.append(kit.box((0.9, 0.9, 0.4), (x, 0, 0.2), CONCRETE, bevel=0.05))
    p.append(kit.box((0.6, 0.6, H), (x, 0, H / 2), WHITE, bevel=0.08))
    for z in (1.2, H - 0.9):
        p.append(kit.box((0.66, 0.66, 0.24), (x, 0, z), GOLD, bevel=0.04))
    p.append(kit.cylinder(0.34, 0.3, (x, 0, H + 0.15), NAVY, verts=14))
# The beam carrying the name board, gold trim along its top and bottom.
p.append(kit.box((SPAN + 0.8, 0.7, 1.6), (X, 0, H - 0.3), NAVY, bevel=0.08))
for z in (H - 1.14, H + 0.54):
    p.append(kit.box((SPAN + 0.9, 0.74, 0.12), (X, 0, z), GOLD, bevel=0.02))
# Lamps along the beam's underside, facing the stand.
for k in range(7):
    x = X - SPAN / 2 + 1.0 + k * (SPAN - 2.0) / 6
    p.append(kit.box((0.36, 0.3, 0.16), (x, -0.1, H - 1.28), DARK, bevel=0.02))
    p.append(kit.box((0.28, 0.24, 0.05), (x, -0.1, H - 1.37), BULB, bevel=0.0))
# The crown on top: a gold band with five points, a jewel on each.
CROWN = (X, 0, H + 0.6)
p.append(kit.cylinder(1.2, 0.6, (CROWN[0], CROWN[1], CROWN[2] + 0.3), GOLD, verts=24))
for i in range(5):
    a = PI / 2 + i * 2 * PI / 5
    cx, cy = CROWN[0] + 1.05 * math.cos(a), CROWN[1] + 1.05 * math.sin(a)
    p.append(kit.cone(0.32, 0.0, 0.9, (cx, cy, CROWN[2] + 1.05), GOLD, verts=8))
    p.append(kit.sphere(0.13, (cx, cy, CROWN[2] + 1.55), RED if i % 2 else '#3bb4ff', segments=8))
p.append(kit.torus(1.2, 0.08, (CROWN[0], CROWN[1], CROWN[2] + 0.1), '#ffdf6a', rot=(0, 0, 0), major_segments=24, minor_segments=5))
m.marker('sign', (X, -0.38, H - 0.3))
m.mesh(p)

out = Path(sys.argv[1] if len(sys.argv) > 1 else 'skyport-queenstand.glb')
rig.export_all(out)
if len(sys.argv) > 2:
    kit.preview(sys.argv[2], look_at=(15, -3, 6), distance=40, size=(1100, 800), ground='#cfd6de', angles=((0.3, -1, 0.6), (-0.6, -1, 0.9)))
