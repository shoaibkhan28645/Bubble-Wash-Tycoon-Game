"""Skyport International (Chapter 4, Part E): the Sky Queen, the biggest plane there is, the airport's landmark.

A double-deck, four-engined airliner in Mogul Air's colours (repainted by the game as the airliners are): an
oval fuselage taller than it's wide, with a long row of windows on each deck, the cockpit low in a bulbous
nose under the upper deck's brow, a long swept wing with tip fences, four big turbofans under it, a tall fin
with the airline's star, and a four-wheeled bogie under each wing root. Built as the twin-engine jet is
(art/blender/skyport_jet.py), nose to -Y here (+Z in the game), then scaled to its length in the game
(QUEEN_SCALE: 24 metres).

Moving parts (empties at their pivots, rig.py), the airliners' names so the game's PlaneModel moves them:
sp_queen_fanl/_fanr/_fanl2/_fanr2 (the fans), sp_queen_door (the main deck's front door on its left, hinged
at its front edge), sp_queen_galley (the main deck's back door), sp_queen_hold (the forward cargo door on its
right, hinged at its top), sp_queen_flapl/_flapr, sp_queen_gearl/_gearr/_gearn (fold up after take-off),
sp_queen_nose (the nose wheel's steering), sp_queen_wheel_l/_r/_n (roll). Markers: _beacon, _navl, _navr,
_strobe, _taxi, _blurl/_blurr/_blurl2/_blurr2.

Usage: python art/blender/skyport_queen.py <out.glb> [preview.png]
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import kit  # noqa: E402

kit.reset()
import rig  # noqa: E402
from rig import Model, blob, rod  # noqa: E402

bpy = kit.bpy
PI = math.pi
NAME = 'sp_queen'
QUEEN_SCALE = 24 / 14

ACCENT = '#e8493f'
ACCENT2 = '#ffc21a'
WHITE = '#f7f8fa'
BELLY = '#dce3ea'
GREYWING = '#e3e9ef'
FLAP = '#cdd6df'
WINDOW = '#26364a'
GLASS = '#30465e'
TYRE = '#2b2f38'
HUB = '#c9d2dc'
STEEL = '#9aa6b4'
FANBLADE = '#4a525e'
DARK = '#1f2a36'
RADOME = '#56616f'
NACELLE = '#eef2f6'
CHROME = '#d9e0e8'
GOLD = '#ffd24a'

# The fuselage: (y, cx, cz, rx, rz) nose to tail. An oval barrel, taller than it's wide, its crown high
# over a bulbous nose (the cockpit sits low in it, under the upper deck's brow), an upswept tail cone.
SPINE = (
    (-7.00, 0, 2.55, 0.04, 0.04),
    (-6.96, 0, 2.57, 0.24, 0.24),
    (-6.86, 0, 2.62, 0.46, 0.50),
    (-6.68, 0, 2.70, 0.70, 0.82),
    (-6.46, 0, 2.78, 0.87, 1.02),
    (-6.20, 0, 2.86, 1.01, 1.20),
    (-5.90, 0, 2.93, 1.13, 1.36),
    (-5.45, 0, 2.98, 1.23, 1.52),
    (-4.95, 0, 3.00, 1.29, 1.60),
    (-4.50, 0, 3.00, 1.30, 1.62),
    (3.00, 0, 3.00, 1.30, 1.62),
    (3.80, 0, 3.08, 1.27, 1.52),
    (4.60, 0, 3.22, 1.16, 1.30),
    (5.40, 0, 3.40, 0.96, 1.02),
    (6.15, 0, 3.60, 0.68, 0.66),
    (6.70, 0, 3.75, 0.38, 0.34),
    (7.00, 0, 3.85, 0.12, 0.10),
)
R = 1.30
CZ = 3.0
RZ = 1.62


def centre_at(y):
    for a, b in zip(SPINE, SPINE[1:]):
        if a[0] <= y <= b[0]:
            t = (y - a[0]) / (b[0] - a[0])
            return tuple(a[k] + (b[k] - a[k]) * t for k in (2, 3, 4))
    s = SPINE[0] if y < SPINE[0][0] else SPINE[-1]
    return s[2], s[3], s[4]


def on_body(y, angle, out=0.0):
    """A point on the fuselage's skin (pushed `out` from it) at `y`, `angle` round from the top (towards +X)."""
    cz, rx, rz = centre_at(y)
    return ((rx + out) * math.sin(angle), y, cz + (rz + out) * math.cos(angle))


def shell(angle0, angle1, y0, y1, out, thick, col, segs=8):
    """A curved panel on the oval barrel (a door or its outline): angles from the top, between y0 and y1."""
    bm = rig.bmesh.new()
    rows = []
    for k in range(segs + 1):
        a = angle0 + (angle1 - angle0) * k / segs
        row = []
        for y in (y0, y1):
            for o in (out, out + thick):
                row.append(bm.verts.new(on_body(y, a, o)))
        rows.append(row)
    for r0, r1 in zip(rows, rows[1:]):
        bm.faces.new((r0[1], r1[1], r1[3], r0[3]))
        bm.faces.new((r0[0], r0[2], r1[2], r1[0]))
        bm.faces.new((r0[0], r1[0], r1[1], r0[1]))
        bm.faces.new((r0[2], r0[3], r1[3], r1[2]))
    for row, flip in ((rows[0], False), (rows[-1], True)):
        f = (row[0], row[1], row[3], row[2])
        bm.faces.new(tuple(reversed(f)) if flip else f)
    rig.bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new('shell')
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new('shell', mesh)
    bpy.context.scene.collection.objects.link(obj)
    kit._paint(obj, col)
    return obj


def spun(obj, hub, angle):
    """Turns a part made pointing up from the origin round the Y axis by `angle`, and moves it to `hub`."""
    kit.set_origin(obj, (0, 0, 0))
    obj.rotation_euler = (0, angle, 0)
    kit._apply_all(obj)
    obj.location = hub
    kit._apply_all(obj)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    return obj


# (The tail fin and winglets: the same either side, from rig.)
fin = rig.fin


m = Model(NAME, 0.0)
p = []

# --- The fuselage: white over a grey belly, the airline's colour in a broad band low down each side (under
# the main deck's windows) and over the top of the tail cone, a gold pinstripe, a dark radome.
body = rig.loft(SPINE, WHITE, verts=48)


def livery(c):
    cz, rx, rz = centre_at(c.y)
    if c.y < -6.93:
        return RADOME
    a = math.atan2(abs(c.x) / max(rx, 0.01), (c.z - cz) / max(rz, 0.01))
    # The windscreen: a dark band round the nose, low under the brow.
    if -6.62 < c.y < -6.36 and 0.75 < a < 1.45:
        return GLASS
    if c.y > 4.6 and a < 1.1:
        return ACCENT
    if 2.2 < a < 2.4:
        return ACCENT
    if 2.4 < a < 2.5:
        return ACCENT2
    if a > 2.62:
        return BELLY
    return WHITE


rig.paint(body, livery)
p.append(body)

# The cockpit's side windows, behind the windscreen.
for side in (-1, 1):
    x, _, z = on_body(-6.12, side * 1.12, 0.0)
    p.append(kit.box((0.05, 0.32, 0.2), (x, -6.12, z), GLASS, bevel=0.03, rot=(0, -side * math.radians(26), 0)))

# Doors (their places): the main deck's at the front and back on the left (+X), an upper deck door outlined
# over the front one, the forward cargo door on the right (-X).
DOOR_Y = (-4.85, -4.2)
GALLEY_Y = (3.25, 3.85)
DOOR_A = (1.66, 2.16)
UPPER_Y = (-3.95, -3.4)
UPPER_A = (0.74, 1.2)
HOLD_Y = (-4.2, -3.35)
HOLD_A = (-2.78, -2.3)

# The windows: a long row on each deck down each side.
for side in (-1, 1):
    for deck, angle, y0, n in (('upper', 0.98, -3.15, 16), ('main', 1.86, -3.95, 18)):
        for i in range(n):
            y = y0 + i * 0.4
            if side > 0 and deck == 'main' and GALLEY_Y[0] - 0.25 < y < GALLEY_Y[1] + 0.2:
                continue
            x, _, z = on_body(y, side * angle, 0.0)
            p.append(kit.box((0.06, 0.2, 0.26), (x, y, z), WINDOW, bevel=0.0, rot=(0, side * (angle - PI / 2), 0)))

for (y0, y1), (a0, a1) in ((DOOR_Y, DOOR_A), (GALLEY_Y, DOOR_A), (UPPER_Y, UPPER_A)):
    p.append(shell(a0 - 0.03, a1 + 0.03, y0 - 0.03, y1 + 0.03, 0.004, 0.012, DARK))
p.append(shell(HOLD_A[0] - 0.03, HOLD_A[1] + 0.03, HOLD_Y[0] - 0.03, HOLD_Y[1] + 0.03, 0.004, 0.012, DARK))
# (The upper deck's door stays shut: its panel, a window in it.)
p.append(shell(UPPER_A[0], UPPER_A[1], UPPER_Y[0], UPPER_Y[1], 0.018, 0.04, '#eef2f6', segs=8))
x, _, z = on_body(-3.67, 0.9, 0.06)
p.append(kit.box((0.03, 0.16, 0.2), (x, -3.67, z), WINDOW, bevel=0.02, rot=(0, -math.radians(38), 0)))

# Antennas, the pitot tubes, a crown on the upper deck's roof (the Sky Queen's own), the name on the brow.
p.append(kit.box((0.05, 0.3, 0.36), (0, -0.5, CZ + RZ + 0.12), DARK, bevel=0.01, rot=(0.35, 0, 0)))
p.append(kit.box((0.05, 0.22, 0.28), (0, 2.5, CZ - RZ - 0.1), DARK, bevel=0.01, rot=(-0.4, 0, 0)))
for side in (-1, 1):
    p.append(rod((side * 0.86, -6.3, 2.35), (side * 0.92, -6.6, 2.35), 0.022, STEEL, verts=5))
crown_at = (0, -2.2, CZ + RZ + 0.02)
p.append(kit.cylinder(0.32, 0.12, crown_at, GOLD, verts=16))
for i in range(5):
    a = i * 2 * PI / 5
    p.append(kit.cone(0.07, 0.0, 0.22, (crown_at[0] + 0.24 * math.cos(a), crown_at[1] + 0.24 * math.sin(a), crown_at[2] + 0.16), GOLD, verts=6))

# --- The wing: long, low and swept, with a big fairing under the fuselage and tip fences in the airline's
# colour above and below each tip.
SPAN = 12.4
WING_Z = 1.72
p.append(blob((1.25, 3.2, 0.62), (0, 0.15, 1.62), BELLY, segments=20))
WING_ROOT = (0.0, -2.0, WING_Z, 3.7, 1.0)
WING_TIP = (SPAN / 2, 1.3, WING_Z + 0.6, 1.1, 0.85)
w = rig.wing(WING_ROOT, WING_TIP, GREYWING)
p.append(w)
for side in (-1, 1):
    x = side * SPAN / 2
    for up, (z0, z1, c0, c1) in ((1, (WING_Z + 0.6, WING_Z + 1.25, 1.0, 0.45)), (-1, (WING_Z + 0.6, WING_Z + 0.2, 0.7, 0.3))):
        f = fin((z0, 1.2, c0, 0.8), (z1, 1.2 + (c0 - c1) * 0.9, c1, 0.7), ACCENT)
        f.location = (x, 0, 0)
        kit._apply_all(f)
        bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
        p.append(f)
    p.append(kit.box((0.04, 1.8, 0.02), (side * 1.8, -0.6, WING_Z + 0.22), '#c9d3dd', bevel=0.0))

# --- The engines: four big round nacelles on pylons under the wing, the outer pair a little smaller,
# further out and further back with the wing's sweep: the back of each nacelle under the wing's front, its
# pylon up into the wing.
FAN_Y = -3.02
ENGINES = [(2.95, -1.95, 1.16, 1.0, ''), (5.0, -0.8, 1.38, 0.85, '2')]


def wing_at(x):
    """The wing's section at `x` along the span: (leading edge y, z, chord, thickness scale), as rig.wing draws it."""
    t = min(1.0, abs(x) / WING_TIP[0])
    return tuple(a + (b - a) * t for a, b in zip(WING_ROOT[1:], WING_TIP[1:]))


def pylon(x, front, back, nacelle_top, k):
    """The pylon from over the nacelle's intake (`front`) back under the wing to `back`, up into its underside."""
    y_le, wz, chord, thick = wing_at(x)
    back = max(back, y_le + 0.4 * chord)
    # Its top just inside the wing (under the leading edge's point, over the wing's lower skin).
    top = wz - 0.025 * chord * thick + 0.04
    bottom = nacelle_top - 0.25 * k
    return kit.box((0.18 * k, back - front, top - bottom), (x, (front + back) / 2, (top + bottom) / 2), WHITE, bevel=0.05)


def engine(x, fan_y, z, k):
    """One nacelle (scaled by k about its fan) with its intake, exhaust cone and pylon."""
    nac = rig.loft(
        tuple((fan_y + (y - FAN_Y) * k, x, z + dz * k, r * k, r * k) for y, dz, r in ((-3.15, 0, 0.52), (-3.08, 0, 0.66), (-2.8, 0, 0.7), (-1.7, 0, 0.68), (-1.0, 0.02, 0.55), (-0.75, 0.03, 0.42))),
        NACELLE,
        verts=28,
        cap=False,
    )
    rig.paint(nac, lambda c: ACCENT if c.y < fan_y + 0.1 * k else NACELLE)
    out = [nac]
    at = lambda y: fan_y + (y - FAN_Y) * k
    out.append(kit.torus(0.64 * k, 0.05 * k, (x, at(-3.1), z), CHROME, rot=(PI / 2, 0, 0), major_segments=24, minor_segments=5))
    out.append(kit.cylinder(0.64 * k, 0.12 * k, (x, at(-2.7), z), DARK, verts=24, rot=(PI / 2, 0, 0)))
    out.append(kit.cylinder(0.4 * k, 0.12 * k, (x, at(-0.82), z + 0.03 * k), DARK, verts=18, rot=(PI / 2, 0, 0)))
    out.append(kit.cone(0.34 * k, 0.05 * k, 0.62 * k, (x, at(-0.5), z + 0.03 * k), STEEL, verts=16, rot=(-PI / 2, 0, 0)))
    # A gold ring round each nacelle's middle: the Sky Queen's trim.
    out.append(kit.torus(0.69 * k, 0.025 * k, (x, at(-1.75), z), GOLD, rot=(PI / 2, 0, 0), major_segments=20, minor_segments=3))
    # The pylon up into the wing.
    out.append(pylon(x, at(-2.7), at(-1.0), z + 0.68 * k, k))
    return out


for ex, ey, ez, ek, _ in ENGINES:
    for side in (-1, 1):
        p += engine(side * ex, ey, ez, ek)

# --- The tail: a tall swept fin in the airline's colour with its star, a big tailplane either side.
p.append(blob((0.22, 1.7, 0.32), (0, 4.9, 4.1), ACCENT, segments=12))
FIN = ((3.95, 3.9, 2.9, 1.25), (8.2, 6.2, 1.35, 1.0))
p.append(fin(*FIN, ACCENT))
p += rig.fin_logo(*FIN, (5.98, 5.6), 0.6, (0.46, 0.19), WHITE, ACCENT2)
tp = rig.wing((0.0, 4.95, 3.75, 1.85, 0.9), (3.4, 6.35, 4.0, 0.85, 0.85), WHITE)
rig.paint(tp, lambda c: ACCENT if abs(c.x) > 2.9 else WHITE)
p.append(tp)
m.mesh(p)

# --- The fans: a spinner with a gold swirl and eighteen blades, turning about the plane's length.
for ex, ey, ez, ek, tag in ENGINES:
    for side, name in ((1, 'fanl'), (-1, 'fanr')):
        hub = (side * ex, ey, ez)
        q = [kit.cone(0.21 * ek, 0.02, 0.44 * ek, (hub[0], ey - 0.16 * ek, ez), WHITE, verts=18, rot=(PI / 2, 0, 0))]
        q.append(kit.box((0.03, 0.02, 0.19 * ek), (hub[0], ey - 0.34 * ek, ez + 0.07 * ek), GOLD, bevel=0.0, rot=(0, 0, 0.6)))
        blades = 18
        for i in range(blades):
            a = i * 2 * PI / blades
            blade = kit.box((0.12 * ek * (20 / blades) ** 0.5, 0.03, 0.44 * ek), (0, 0, 0.38 * ek), FANBLADE, bevel=0.0, rot=(0, 0, 0.55))
            q.append(spun(blade, hub, a))
        m.part(name + tag, hub, q)
        m.marker('blur' + name[-1] + tag, (hub[0], ey - 0.03, ez))

# --- Doors: the main deck's front and back doors hinged at their front edges, the cargo door along its top.
for name, (y0, y1) in (('door', DOOR_Y), ('galley', GALLEY_Y)):
    d = [shell(DOOR_A[0], DOOR_A[1], y0, y1, 0.018, 0.05, '#eef2f6', segs=10)]
    for k in range(2):
        yk = y0 + 0.18 + k * 0.28
        x, _, z = on_body(yk, 1.8, 0.07)
        d.append(kit.box((0.03, 0.15, 0.2), (x, yk, z), WINDOW, bevel=0.02, rot=(0, math.radians(14), 0)))
    d.append(kit.box((0.03, 0.14, 0.05), on_body((y0 + y1) / 2, 2.0, 0.07), STEEL, bevel=0.0))
    hinge = on_body(y0, (DOOR_A[0] + DOOR_A[1]) / 2, 0.03)
    m.part(name, hinge, d)

hold_pivot = on_body((HOLD_Y[0] + HOLD_Y[1]) / 2, HOLD_A[1], 0.03)
h = [shell(HOLD_A[0], HOLD_A[1], HOLD_Y[0], HOLD_Y[1], 0.018, 0.05, '#eef2f6', segs=8)]
m.part('hold', hold_pivot, h)

# --- Flaps behind the inner wing.
for side, name in ((1, 'flapl'), (-1, 'flapr')):
    x0, x1 = side * 1.45, side * 4.5
    pivot = (side * 2.95, 0.95, WING_Z + 0.2)
    f = [kit.box((abs(x1 - x0), 0.78, 0.07), ((x0 + x1) / 2, 1.4, WING_Z + 0.18), FLAP, bevel=0.02, rot=(0, side * -0.06, 0))]
    m.part(name, pivot, f)

# --- The landing gear: a four-wheeled bogie on a leg under each wing root, two wheels under the nose.
WHEEL_Y = 0.55


def bogie(cx, y, z, r, width, gap, pitch):
    """Two axles of twin wheels, `pitch` apart along the plane."""
    out = []
    for dy in (-pitch / 2, pitch / 2):
        for e in (-1, 1):
            out.append(kit.cylinder(r, width, (cx + e * gap, y + dy, z), TYRE, verts=16, rot=(0, PI / 2, 0)))
            out.append(kit.cylinder(r * 0.55, width + 0.02, (cx + e * gap, y + dy, z), HUB, verts=10, rot=(0, PI / 2, 0)))
            out.append(kit.cylinder(r * 0.18, width + 0.05, (cx + e * gap, y + dy, z), STEEL, verts=8, rot=(0, PI / 2, 0)))
        out.append(kit.cylinder(0.05, gap * 2 + width, (cx, y + dy, z), STEEL, verts=8, rot=(0, PI / 2, 0)))
    out.append(kit.box((0.12, pitch + 0.2, 0.1), (cx, y, z + 0.06), STEEL, bevel=0.02))
    return out


for side, name in ((1, 'l'), (-1, 'r')):
    x = side * 1.85
    top = (x, 0.4, 1.7)
    axle = (x, WHEEL_Y, 0.42)
    g = [rod(top, (x, WHEEL_Y, 0.66), 0.11, STEEL), rod((x, WHEEL_Y, 1.0), (x, WHEEL_Y, 0.5), 0.07, HUB)]
    g.append(rod((x - side * 0.95, 0.2, 1.6), (x, WHEEL_Y + 0.05, 1.0), 0.05, STEEL, verts=6))
    m.part('gear' + name, top, g)
    m.part('wheel_' + name, axle, bogie(x, WHEEL_Y, 0.42, 0.42, 0.2, 0.18, 0.95), on='gear' + name)

NOSE_Y = -5.6
ntop = (0, NOSE_Y + 0.05, 1.6)
m.part('gearn', ntop, [kit.box((0.42, 0.62, 0.06), (0, NOSE_Y + 0.02, 1.58), DARK, bevel=0.0)])
m.part('nose', ntop, [rod(ntop, (0, NOSE_Y, 0.38), 0.075, STEEL), rod((0, NOSE_Y - 0.05, 0.95), (0, NOSE_Y - 0.34, 1.5), 0.04, STEEL, verts=6)], on='gearn')
m.part('wheel_n', (0, NOSE_Y, 0.34), [*bogie(0, NOSE_Y, 0.34, 0.34, 0.14, 0.12, 0.0)[:7]], on='nose')

# Lights: the beacon on top, red on the left wingtip, green on the right, a strobe on the tail, a taxi
# light on the nose leg.
m.marker('beacon', (0, 1.0, CZ + RZ + 0.1))
m.marker('navl', (SPAN / 2 + 0.05, 1.5, WING_Z + 0.65))
m.marker('navr', (-SPAN / 2 - 0.05, 1.5, WING_Z + 0.65))
m.marker('strobe', (0, 7.0, 3.95))
m.marker('taxi', (0, NOSE_Y - 0.14, 0.8), on='nose')

# Everything scaled to the Sky Queen's length: the meshes about their own origins (their pivots), every
# node's place.
from mathutils import Matrix  # noqa: E402

for ob in m.base.children_recursive:
    if ob.type == 'MESH':
        ob.data.transform(Matrix.Scale(QUEEN_SCALE, 4))
    ob.location = ob.location * QUEEN_SCALE
out = Path(sys.argv[1] if len(sys.argv) > 1 else 'skyport-queen.glb')
rig.export_all(out)
if len(sys.argv) > 2:
    kit.preview(sys.argv[2], look_at=(0, 0, 3.0 * QUEEN_SCALE), distance=26 * QUEEN_SCALE, size=(1100, 800), ground='#cfd6de', angles=((0.55, -1, 0.85), (-0.9, 0.5, 0.6), (0.01, -0.02, 1.0)))
