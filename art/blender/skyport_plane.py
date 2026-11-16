"""Skyport International (Chapter 4): the twin-propeller airliner every flight uses.

Nose to -Y here (+Z in the game), wheels on the ground at z = 0. A rounded
fuselage tapering to a pointed nose and an upswept tail, a T-tail, a high
wing over the cabin with two engines under it, six-bladed propellers with
yellow tips, twin wheels in the engine nacelles and under the nose.

Moving parts (empties at their pivots, rig.py): sp_plane_propl/_propr (spin
about the plane's length), sp_plane_door (the passenger door on its left,
hinged at its front edge), sp_plane_hold (the cargo door on its right,
hinged at its top), sp_plane_flapl/_flapr (lower behind the wing),
sp_plane_gearl/_gearr/_gearn (fold up after take-off), sp_plane_nose (the
nose wheel's steering), sp_plane_wheel_l/_r/_n (roll). Markers: _beacon,
_navl, _navr, _strobe, _taxi (the game lights them), _blurl/_blurr (where
the propellers' blur discs go).

The airline's colours are painted in two marker paints the game repaints per
livery: ACCENT (the tail, the cheatline, the engine lips, the wingtips) and
ACCENT2 (a pinstripe, the spinners, the logo's star).

Usage: python art/blender/skyport_plane.py <out.glb> [preview.png]
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

# Marker paints the game swaps for each airline's colours (src/render/models/airport.ts).
ACCENT = '#e8493f'
ACCENT2 = '#ffc21a'
WHITE = '#f7f8fa'
BELLY = '#dce3ea'
GREYWING = '#e8edf2'
FLAP = '#cdd6df'
WINDOW = '#26364a'
GLASS = '#30465e'
TYRE = '#2b2f38'
HUB = '#c9d2dc'
STEEL = '#9aa6b4'
BLADE = '#3a414c'
TIP = '#ffd84d'
DOORLINE = '#c3ccd6'
DARK = '#1f2a36'
RADOME = '#56616f'

R = 0.95
CZ = 1.72
SPINE = (
    # (y, cx, cz, rx, rz): nose to tail.
    (-4.50, 0, 1.56, 0.04, 0.04),
    (-4.44, 0, 1.565, 0.2, 0.19),
    (-4.32, 0, 1.58, 0.38, 0.36),
    (-4.14, 0, 1.61, 0.56, 0.53),
    (-3.90, 0, 1.65, 0.72, 0.70),
    (-3.60, 0, 1.69, 0.85, 0.84),
    (-3.25, 0, 1.715, 0.93, 0.93),
    (-2.85, 0, 1.72, 0.95, 0.95),
    (-1.0, 0, 1.72, 0.95, 0.95),
    (1.3, 0, 1.72, 0.95, 0.95),
    (1.9, 0, 1.78, 0.93, 0.9),
    (2.5, 0, 1.9, 0.85, 0.78),
    (3.1, 0, 2.06, 0.70, 0.60),
    (3.7, 0, 2.24, 0.50, 0.42),
    (4.2, 0, 2.40, 0.30, 0.25),
    (4.5, 0, 2.50, 0.10, 0.09),
)


def centre_at(y):
    """The fuselage's centre height and half sizes at `y` (between the rings)."""
    for a, b in zip(SPINE, SPINE[1:]):
        if a[0] <= y <= b[0]:
            t = (y - a[0]) / (b[0] - a[0])
            return tuple(a[k] + (b[k] - a[k]) * t for k in (2, 3, 4))
    s = SPINE[0] if y < SPINE[0][0] else SPINE[-1]
    return s[2], s[3], s[4]


def on_body(y, angle, out=0.0):
    """A point on the fuselage's skin at `y`, `angle` from the top towards +X, `out` beyond it."""
    cz, rx, rz = centre_at(y)
    return ((rx + out) * math.sin(angle), y, cz + (rz + out) * math.cos(angle))


def shell(angle0, angle1, y0, y1, radius, thick, col, segs=8):
    """A curved panel on the barrel (a door): angles from the top, between y0 and y1."""
    bm = rig.bmesh.new()
    rows = []
    for k in range(segs + 1):
        a = angle0 + (angle1 - angle0) * k / segs
        row = []
        for y in (y0, y1):
            for r in (radius, radius + thick):
                row.append(bm.verts.new((r * math.sin(a), y, CZ + r * math.cos(a))))
        rows.append(row)
    # Each row: (y0 in, y0 out, y1 in, y1 out).
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


def fin(root, tip, col):
    """A vertical surface: `root` and `tip` are (z, y_leading, chord, thickness scale), standing at x = 0."""
    bm = rig.bmesh.new()

    def section(z, y0, chord, k):
        pts = list(rig.AIRFOIL_TOP) + list(rig.AIRFOIL_BOTTOM)
        # Symmetrical: the top side's thickness either side of the chord.
        return [bm.verts.new((h * chord * k * (1 if i < len(rig.AIRFOIL_TOP) else -2.6), y0 + u * chord, z)) for i, (u, h) in enumerate(pts)]

    s0 = section(*root)
    s1 = section(*tip)
    n = len(s0)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((s0[i], s0[j], s1[j], s1[i]))
    bm.faces.new(s0)
    bm.faces.new(s1)
    rig.bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new('fin')
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new('fin', mesh)
    bpy.context.scene.collection.objects.link(obj)
    kit._paint(obj, col)
    return obj


m = Model('sp_plane', 0.0)
p = []

# --- The fuselage, painted: white over a grey belly, the cheatline and a pinstripe down each side,
# the cheatline sweeping up over the tail cone, a dark radome on the nose.
body = rig.loft(SPINE, WHITE, verts=36)


def livery(c):
    cz, rx, rz = centre_at(c.y)
    if c.y < -4.4:
        return RADOME
    a = math.atan2(abs(c.x) / max(rx, 0.01), (c.z - cz) / max(rz, 0.01))
    if c.y > 2.9 and a > 1.2:
        return ACCENT
    if 1.57 < a < 1.92:
        return ACCENT
    if 1.92 < a < 2.09:
        return ACCENT2
    if a > 2.26:
        return BELLY
    return WHITE


rig.paint(body, livery)
p.append(body)

# The cockpit: a dark visor over the nose with a white frame down its middle, and side windows.
p.append(blob((0.58, 0.33, 0.13), (0, -3.95, 2.21), GLASS, segments=18, rot=(0.66, 0, 0)))
p.append(kit.box((0.05, 0.5, 0.05), (0, -3.96, 2.26), WHITE, bevel=0.0, rot=(0.66, 0, 0)))
for side in (-1, 1):
    p.append(blob((0.06, 0.2, 0.12), (side * 0.66, -3.74, 2.12), GLASS, segments=10, rot=(0, side * -0.55, 0)))
    p.append(blob((0.05, 0.16, 0.1), (side * 0.76, -3.42, 2.08), GLASS, segments=10, rot=(0, side * -0.65, 0)))

# Cabin windows: a row down each side, above the cheatline (the passenger door's side has one fewer).
for side in (-1, 1):
    for i in range(9):
        y = -2.4 + i * 0.48
        x, _, z = on_body(y, side * math.radians(73), 0.0)
        p.append(kit.box((0.06, 0.24, 0.29), (x, y, z), WINDOW, bevel=0.025, segments=2, rot=(0, -side * math.radians(17), 0)))

# Doors. The passenger door on the left (+X): a dark doorway the door closes over. The cargo door on
# the right (-X), behind the wing, over its own dark hatch.
DOOR_Y = (-3.48, -2.72)
DOOR_A = (math.radians(52), math.radians(128))
p.append(shell(DOOR_A[0] - 0.03, DOOR_A[1] + 0.03, DOOR_Y[0] - 0.03, DOOR_Y[1] + 0.03, R + 0.004, 0.012, DARK))
HOLD_Y = (1.36, 2.2)
HOLD_A = (-math.radians(128), -math.radians(64))
p.append(shell(HOLD_A[0] - 0.03, HOLD_A[1] + 0.03, HOLD_Y[0] - 0.03, HOLD_Y[1] + 0.03, R + 0.004, 0.012, DARK))

# A grab rail by the door, the antennas, the pitot tubes.
p.append(kit.box((0.04, 0.4, 0.04), (0.97, -2.6, 2.05), STEEL, bevel=0.0, rot=(0, 0, 0)))
p.append(kit.box((0.04, 0.22, 0.3), (0, 0.4, 2.76), DARK, bevel=0.01, rot=(0.35, 0, 0)))
p.append(kit.box((0.04, 0.16, 0.24), (0, 2.2, 0.82), DARK, bevel=0.01, rot=(-0.4, 0, 0)))
for side in (-1, 1):
    p.append(rod((side * 0.62, -3.95, 1.4), (side * 0.66, -4.18, 1.4), 0.018, STEEL, verts=5))

# --- The wing, high on top of the cabin on a fairing: tapered, with an airfoil, its tips in the airline's colour.
SPAN = 10.6
WING_Z = 2.68
p.append(blob((0.62, 1.3, 0.34), (0, -0.05, 2.6), WHITE, segments=16))
w = rig.wing((0.0, -1.0, WING_Z, 1.9, 0.95), (SPAN / 2, -0.72, WING_Z + 0.06, 1.15, 0.85), GREYWING)
rig.paint(w, lambda c: ACCENT if abs(c.x) > SPAN / 2 - 0.42 else GREYWING)
p.append(w)
for side in (-1, 1):
    p.append(blob((0.1, 0.62, 0.09), (side * (SPAN / 2 + 0.02), -0.15, WING_Z + 0.1), ACCENT, segments=10))
    # Walkway lines and a fence on top of the wing.
    p.append(kit.box((0.04, 1.2, 0.02), (side * 1.25, -0.15, WING_Z + 0.17), '#c9d3dd', bevel=0.0))
    p.append(kit.box((0.04, 1.0, 0.02), (side * 3.9, -0.2, WING_Z + 0.16), '#c9d3dd', bevel=0.0))

# --- The engines, slung under the wing: nacelles with the airline's colour round their intakes.
ENG_X = 2.4
ENG_Z = 2.22
PROP_Y = -2.2
for side in (-1, 1):
    x = side * ENG_X
    nac = rig.loft(
        (
            (-2.12, x, ENG_Z, 0.3, 0.3),
            (-2.04, x, ENG_Z, 0.4, 0.4),
            (-1.7, x, ENG_Z - 0.01, 0.45, 0.47),
            (-0.8, x, ENG_Z - 0.03, 0.45, 0.52),
            (0.2, x, ENG_Z + 0.02, 0.39, 0.46),
            (1.0, x, ENG_Z + 0.18, 0.24, 0.27),
            (1.5, x, ENG_Z + 0.3, 0.06, 0.06),
        ),
        WHITE,
        verts=24,
    )
    rig.paint(nac, lambda c: ACCENT if c.y < -1.86 else (BELLY if c.z < ENG_Z - 0.34 else WHITE))
    p.append(nac)
    p.append(kit.torus(0.34, 0.06, (x, -2.12, ENG_Z), ACCENT2, rot=(PI / 2, 0, 0), major_segments=20, minor_segments=6))
    # The air scoop under the spinner and the exhaust on the outside.
    p.append(kit.box((0.3, 0.3, 0.14), (x, -1.9, ENG_Z - 0.44), DARK, bevel=0.05))
    p.append(kit.cylinder(0.1, 0.36, (x + side * 0.42, -0.3, ENG_Z + 0.05), DARK, verts=10, rot=(PI / 2 - 0.25, 0, 0)))
    # Gear doors, open beside the wheel well.
    for e in (-1, 1):
        p.append(kit.box((0.03, 0.9, 0.28), (x + e * 0.3, -0.45, 1.6), WHITE, bevel=0.01, rot=(0, e * 0.25, 0)))
    p.append(kit.box((0.42, 1.0, 0.06), (x, -0.45, 1.72), DARK, bevel=0.0))

# --- The tail: a swept fin in the airline's colour, the logo on it, a tailplane right on top.
p.append(blob((0.14, 0.9, 0.22), (0, 2.25, 2.62), ACCENT, segments=12))
p.append(fin((2.55, 2.3, 2.15, 1.25), (4.55, 3.62, 1.08, 1.0), ACCENT))
for side in (-1, 1):
    p.append(kit.cylinder(0.42, 0.025, (side * 0.11, 3.42, 3.5), WHITE, verts=24, rot=(0, PI / 2, 0)))
    star = kit.star_disc(0.32, 0.14, 0.02, (side * 0.13, 3.42, 3.5), ACCENT2, points=5, twist=0)
    star.rotation_euler = (0, PI / 2, 0)
    kit._apply_all(star)
    p.append(star)
tp = rig.wing((0.0, 3.5, 4.5, 1.15, 1.0), (2.15, 3.95, 4.55, 0.68, 0.9), WHITE)
rig.paint(tp, lambda c: ACCENT if abs(c.x) > 1.75 else WHITE)
p.append(tp)
p.append(blob((0.16, 0.7, 0.14), (0, 4.0, 4.55), ACCENT, segments=10))
m.mesh(p)

# --- Propellers: a spinner and six blades with yellow tips, turning about the plane's length.
for side, name in ((1, 'propl'), (-1, 'propr')):
    hub = (side * ENG_X, PROP_Y, ENG_Z)
    q = [kit.cone(0.25, 0.03, 0.55, (hub[0], PROP_Y - 0.24, ENG_Z), ACCENT2, verts=20, rot=(PI / 2, 0, 0))]
    q.append(kit.cylinder(0.26, 0.12, (hub[0], PROP_Y + 0.05, ENG_Z), ACCENT2, verts=20, rot=(PI / 2, 0, 0)))
    for i in range(6):
        a = i * PI / 3
        blade = kit.box((0.15, 0.045, 0.78), (0, 0, 0.53), BLADE, bevel=0.02, rot=(0, 0, 0.42))
        q.append(spun(blade, hub, a))
        tipb = kit.box((0.152, 0.047, 0.16), (0, 0, 0.98), TIP, bevel=0.02, rot=(0, 0, 0.42))
        q.append(spun(tipb, hub, a))
    m.part(name, hub, q)
    m.marker('blur' + name[-1], (hub[0], PROP_Y - 0.02, ENG_Z))

# --- The passenger door, hinged at its front edge; the cargo door, hinged along its top.
door = shell(DOOR_A[0], DOOR_A[1], DOOR_Y[0], DOOR_Y[1], R + 0.018, 0.045, '#eef2f6', segs=10)
d = [door]
d.append(kit.box((0.03, 0.12, 0.05), (on_body(-3.0, math.radians(92), 0.07)), STEEL, bevel=0.0))
for k in range(3):
    y = -3.36 + k * 0.26
    x, _, z = on_body(y, math.radians(66), 0.06)
    d.append(kit.box((0.03, 0.14, 0.18), (x, y, z), WINDOW, bevel=0.02, rot=(0, -math.radians(24), 0)))
m.part('door', (R + 0.03, DOOR_Y[0], CZ), d)

hold_pivot = on_body(1.78, HOLD_A[1], 0.03)
h = [shell(HOLD_A[0], HOLD_A[1], HOLD_Y[0], HOLD_Y[1], R + 0.018, 0.045, '#eef2f6', segs=8)]
h.append(kit.box((0.04, 0.3, 0.06), on_body(1.78, -math.radians(110), 0.07), STEEL, bevel=0.0, rot=(0, math.radians(20), 0)))
m.part('hold', (hold_pivot[0], 1.78, hold_pivot[2]), h)

# --- Flaps behind the inner wing, which lower for landing and take-off.
for side, name in ((1, 'flapl'), (-1, 'flapr')):
    x0, x1 = side * 1.0, side * 3.9
    pivot = (side * 2.45, 0.62, WING_Z - 0.02)
    f = [kit.box((abs(x1 - x0), 0.5, 0.06), ((x0 + x1) / 2, 0.86, WING_Z - 0.01), FLAP, bevel=0.02)]
    m.part(name, pivot, f)

# --- The landing gear: twin wheels on a leg under each engine, and under the nose. Each leg folds up
# (forward into the nacelle, back into the nose); the wheels roll, the nose wheel steers.
WHEEL_Y = -0.5


def wheels(cx, y, z, r, width, gap):
    out = []
    for e in (-1, 1):
        out.append(kit.cylinder(r, width, (cx + e * gap, y, z), TYRE, verts=18, bevel=0.03, rot=(0, PI / 2, 0)))
        out.append(kit.cylinder(r * 0.55, width + 0.02, (cx + e * gap, y, z), HUB, verts=14, rot=(0, PI / 2, 0)))
        out.append(kit.cylinder(r * 0.18, width + 0.05, (cx + e * gap, y, z), STEEL, verts=8, rot=(0, PI / 2, 0)))
    out.append(kit.cylinder(0.045, gap * 2 + width, (cx, y, z), STEEL, verts=8, rot=(0, PI / 2, 0)))
    return out


for side, name in ((1, 'l'), (-1, 'r')):
    x = side * ENG_X
    top = (x, -0.35, 1.8)
    axle = (x, WHEEL_Y, 0.36)
    g = [rod(top, (x, WHEEL_Y + 0.02, 0.62), 0.08, STEEL), rod((x, WHEEL_Y, 0.85), (x, WHEEL_Y, 0.42), 0.055, HUB)]
    g.append(rod((x, 0.15, 1.75), (x, WHEEL_Y + 0.05, 0.95), 0.04, STEEL, verts=6))
    m.part('gear' + name, top, g)
    m.part('wheel_' + name, axle, wheels(x, WHEEL_Y, 0.36, 0.36, 0.18, 0.15), on='gear' + name)

NOSE_Y = -3.3
ntop = (0, NOSE_Y + 0.05, 0.86)
m.part('gearn', ntop, [kit.box((0.36, 0.5, 0.06), (0, NOSE_Y + 0.02, 0.86), DARK, bevel=0.0)])
m.part('nose', ntop, [rod(ntop, (0, NOSE_Y, 0.32), 0.06, STEEL), rod((0, NOSE_Y - 0.05, 0.7), (0, NOSE_Y - 0.25, 0.86), 0.035, STEEL, verts=6)], on='gearn')
m.part('wheel_n', (0, NOSE_Y, 0.3), wheels(0, NOSE_Y, 0.3, 0.3, 0.13, 0.1), on='nose')

# Lights the game lights: the beacon on top, red on the left wingtip, green on the right, a white strobe
# on the tail, a taxi light on the nose leg.
m.marker('beacon', (0, 1.55, 2.72))
m.marker('navl', (SPAN / 2 + 0.08, -0.3, WING_Z + 0.1))
m.marker('navr', (-SPAN / 2 - 0.08, -0.3, WING_Z + 0.1))
m.marker('strobe', (0, 4.62, 4.62))
m.marker('taxi', (0, NOSE_Y - 0.12, 0.62), on='nose')

out = Path(sys.argv[1] if len(sys.argv) > 1 else 'skyport-plane.glb')
rig.export_all(out)
if len(sys.argv) > 2:
    prev = Path(sys.argv[2])
    kit.preview(str(prev), look_at=(0, 0, 1.6), distance=16, size=(1100, 800), ground='#cfd6de', angles=((0.55, -1, 0.95), (-0.9, 0.5, 0.6), (0.01, -0.02, 1.0)))
