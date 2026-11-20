"""Skyport International (Chapter 4, Part B): the twin-engine jet that uses Gate 3.

Nose to -Y here (+Z in the game), wheels on the ground at z = 0, about half as long again as the
propeller airliner. A round fuselage with a rounded nose and an upswept tail cone, a low swept wing
with winglets, two turbofans under it, a tall fin and a low tailplane.

Moving parts (empties at their pivots, rig.py): sp_jet_fanl/_fanr (the fans, spinning about the
plane's length), sp_jet_door (the front passenger door on its left, where the jet bridge docks,
hinged at its front edge), sp_jet_galley (the back door on its left, where meals go aboard),
sp_jet_hold (the forward cargo door on its right, hinged at its top), sp_jet_flapl/_flapr,
sp_jet_gearl/_gearr/_gearn (fold up after take-off), sp_jet_nose (the nose wheel's steering),
sp_jet_wheel_l/_r/_n (roll). Markers: _beacon, _navl, _navr, _strobe, _taxi (the game lights them),
_blurl/_blurr (where the fans' blur discs go).

The airline's colours are the same two marker paints as the propeller airliner's (ACCENT and
ACCENT2), repainted per livery by the game.

With WIDE set (art/blender/skyport_wide.py runs this script so), it draws sp_wide instead: the wide-body
that uses Gate 4 (Part C), the same jet half as big again (WIDE_SCALE) with a second, smaller engine further
out under each wing (sp_wide_fanl2/_fanr2, markers _blurl2/_blurr2).

With FREIGHT set too (art/blender/skyport_freighter.py), it draws sp_freighter: the wide-body as a freighter
for the cargo stand (Part D), no cabin windows, and in place of the passengers' door a big main-deck cargo
door on its left ahead of the wing, hinged along its top (sp_freighter_door), where the loader docks.

Usage: python art/blender/skyport_jet.py <out.glb> [preview.png]
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
WIDE = globals().get('WIDE', False)
FREIGHT = globals().get('FREIGHT', False)
WIDE_SCALE = 20 / 14
NAME = 'sp_freighter' if FREIGHT else 'sp_wide' if WIDE else 'sp_jet'

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

R = 1.3
CZ = 2.55
SPINE = (
    # (y, cx, cz, rx, rz): nose to tail.
    (-7.00, 0, 2.28, 0.04, 0.04),
    (-6.96, 0, 2.29, 0.22, 0.2),
    (-6.86, 0, 2.31, 0.42, 0.4),
    (-6.68, 0, 2.35, 0.66, 0.64),
    (-6.50, 0, 2.39, 0.80, 0.79),
    (-6.26, 0, 2.435, 0.95, 0.94),
    (-6.02, 0, 2.47, 1.07, 1.06),
    (-5.55, 0, 2.52, 1.21, 1.21),
    (-5.0, 0, 2.55, 1.29, 1.29),
    (-4.60, 0, 2.55, 1.3, 1.3),
    (3.00, 0, 2.55, 1.3, 1.3),
    (3.80, 0, 2.62, 1.27, 1.22),
    (4.60, 0, 2.78, 1.16, 1.04),
    (5.40, 0, 2.98, 0.96, 0.8),
    (6.15, 0, 3.2, 0.68, 0.52),
    (6.70, 0, 3.38, 0.38, 0.28),
    (7.00, 0, 3.48, 0.12, 0.1),
)


def centre_at(y):
    for a, b in zip(SPINE, SPINE[1:]):
        if a[0] <= y <= b[0]:
            t = (y - a[0]) / (b[0] - a[0])
            return tuple(a[k] + (b[k] - a[k]) * t for k in (2, 3, 4))
    s = SPINE[0] if y < SPINE[0][0] else SPINE[-1]
    return s[2], s[3], s[4]


def on_body(y, angle, out=0.0):
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

# --- The fuselage: white over a grey belly, a broad cheatline and a pinstripe down each side sweeping
# up the tail cone, the airline's colour on the tail cone's top, a dark radome.
body = rig.loft(SPINE, WHITE, verts=40)


def livery(c):
    cz, rx, rz = centre_at(c.y)
    if c.y < -6.93:
        return RADOME
    a = math.atan2(abs(c.x) / max(rx, 0.01), (c.z - cz) / max(rz, 0.01))
    # The windscreen: a dark band round the top of the nose, its frame down the middle.
    if -6.5 < c.y < -6.26 and 0.3 < a < 1.3:
        return GLASS
    if c.y > 4.6 and a < 1.1:
        return ACCENT
    if 1.62 < a < 1.95:
        return ACCENT
    if 1.95 < a < 2.08:
        return ACCENT2
    if a > 2.3:
        return BELLY
    return WHITE


rig.paint(body, livery)
p.append(body)

# The cockpit's side windows, behind the painted windscreen.
for side in (-1, 1):
    x, _, z = on_body(-5.95, side * math.radians(62), 0.0)
    p.append(kit.box((0.05, 0.3, 0.2), (x, -5.95, z), GLASS, bevel=0.03, rot=(0, -side * math.radians(28), 0)))

# Cabin windows: a long row down each side, over the cheatline (a freighter has none).
for side in ((-1, 1) if not FREIGHT else ()):
    for i in range(17):
        y = -3.7 + i * 0.46
        if side > 0 and abs(y - 4.75) < 0.5:
            continue
        x, _, z = on_body(y, side * math.radians(70), 0.0)
        p.append(kit.box((0.06, 0.22, 0.28), (x, y, z), WINDOW, bevel=0.025, segments=2, rot=(0, -side * math.radians(20), 0)))

# Doorways: the passenger door at the front on the left (+X), the galley door at the back on the left,
# the forward cargo door on the right (-X).
DOOR_Y = (-4.95, -4.15)
GALLEY_Y = (4.38, 5.1)
DOOR_A = (math.radians(48), math.radians(118))
HOLD_Y = (-4.35, -3.45)
HOLD_A = (-math.radians(132), -math.radians(78))
# (A freighter's main-deck door: big, up the side from below the cheatline nearly to the crown.)
CARGO_Y = (-4.85, -3.35)
CARGO_A = (math.radians(16), math.radians(100))
for y0, y1 in ((GALLEY_Y,) if FREIGHT else (DOOR_Y, GALLEY_Y)):
    p.append(shell(DOOR_A[0] - 0.03, DOOR_A[1] + 0.03, y0 - 0.03, y1 + 0.03, R + 0.004, 0.012, DARK))
if FREIGHT:
    p.append(shell(CARGO_A[0] - 0.03, CARGO_A[1] + 0.03, CARGO_Y[0] - 0.03, CARGO_Y[1] + 0.03, R + 0.004, 0.012, DARK))
p.append(shell(HOLD_A[0] - 0.03, HOLD_A[1] + 0.03, HOLD_Y[0] - 0.03, HOLD_Y[1] + 0.03, R + 0.004, 0.012, DARK))

# Antennas, a beacon's base, the pitot tubes.
p.append(kit.box((0.05, 0.3, 0.36), (0, -1.0, 3.95), DARK, bevel=0.01, rot=(0.35, 0, 0)))
p.append(kit.box((0.05, 0.22, 0.28), (0, 2.5, 1.18), DARK, bevel=0.01, rot=(-0.4, 0, 0)))
for side in (-1, 1):
    p.append(rod((side * 0.82, -6.2, 2.0), (side * 0.88, -6.5, 2.0), 0.022, STEEL, verts=5))

# --- The wing: low, swept, with a fairing under the fuselage and winglets in the airline's colour.
SPAN = 14.4
WING_Z = 1.62
p.append(blob((1.15, 2.6, 0.55), (0, 0.0, 1.55), BELLY, segments=18))
WING_ROOT = (0.0, -1.7, WING_Z, 3.2, 1.0)
WING_TIP = (SPAN / 2, 1.45, WING_Z + 0.55, 1.05, 0.85)
w = rig.wing(WING_ROOT, WING_TIP, GREYWING)
p.append(w)
for side in (-1, 1):
    x = side * SPAN / 2
    winglet = fin((WING_Z + 0.55, 1.35, 1.0, 0.8), (WING_Z + 1.5, 2.15, 0.5, 0.7), ACCENT)
    winglet.location = (x, 0, 0)
    kit._apply_all(winglet)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    p.append(winglet)
    # Walkway lines and a fence on the wing's top.
    p.append(kit.box((0.04, 1.6, 0.02), (side * 1.6, -0.5, WING_Z + 0.2), '#c9d3dd', bevel=0.0))

# --- The engines: big round nacelles on pylons under the wing, the airline's colour round their lips (the
# wide-body has a second, smaller pair further out, further back with the wing's sweep and a little higher).
# Each hangs with the back of its nacelle under the wing's front, its pylon up into the wing: the wing's swept,
# so at the engines its leading edge is well behind where it is at the root.
ENG_X = 3.5
ENG_Z = 1.04
# (FAN_Y: where the nacelle's shape is drawn from; ENG_BACK: how far behind that the engines hang.)
FAN_Y = -3.02
ENG_BACK = 1.25
ENGINES = [(ENG_X, FAN_Y + ENG_BACK, ENG_Z, 1.0, '')] + ([(5.95, FAN_Y + ENG_BACK + 1.15, ENG_Z + 0.24, 0.84, '2')] if WIDE else [])


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
        tuple((fan_y + (y - FAN_Y) * k, x, z + dz * k, r * k, r * k) for y, dz, r in ((-3.15, 0, 0.5), (-3.08, 0, 0.62), (-2.8, 0, 0.66), (-1.7, 0, 0.64), (-1.0, 0.02, 0.52), (-0.75, 0.03, 0.4))),
        NACELLE,
        verts=28,
        cap=False,
    )
    rig.paint(nac, lambda c: ACCENT if c.y < fan_y + 0.1 * k else NACELLE)
    out = [nac]
    at = lambda y: fan_y + (y - FAN_Y) * k
    out.append(kit.torus(0.6 * k, 0.05 * k, (x, at(-3.1), z), CHROME, rot=(PI / 2, 0, 0), major_segments=28, minor_segments=6))
    # The dark inside of the intake and the exhaust cone.
    out.append(kit.cylinder(0.6 * k, 0.12 * k, (x, at(-2.7), z), DARK, verts=24, rot=(PI / 2, 0, 0)))
    out.append(kit.cylinder(0.38 * k, 0.12 * k, (x, at(-0.82), z + 0.03 * k), DARK, verts=18, rot=(PI / 2, 0, 0)))
    out.append(kit.cone(0.32 * k, 0.05 * k, 0.6 * k, (x, at(-0.5), z + 0.03 * k), STEEL, verts=16, rot=(-PI / 2, 0, 0)))
    # The pylon up into the wing.
    out.append(pylon(x, at(-2.7), at(-1.0), z + 0.64 * k, k))
    return out


for ex, ey, ez, ek, _ in ENGINES:
    for side in (-1, 1):
        p += engine(side * ex, ey, ez, ek)

# --- The tail: a tall swept fin in the airline's colour with the logo, a low tailplane either side.
p.append(blob((0.2, 1.5, 0.3), (0, 5.0, 3.55), ACCENT, segments=12))
FIN = ((3.4, 4.1, 2.6, 1.25), (6.9, 6.25, 1.25, 1.0))
p.append(fin(*FIN, ACCENT))
p += rig.fin_logo(*FIN, (6.11, 5.0), 0.52, (0.4, 0.17), WHITE, ACCENT2)
tp = rig.wing((0.0, 5.0, 3.15, 1.6, 0.9), (2.9, 6.25, 3.4, 0.75, 0.85), WHITE)
rig.paint(tp, lambda c: ACCENT if abs(c.x) > 2.45 else WHITE)
p.append(tp)
m.mesh(p)

# --- The fans: a spinner with a swirl and twenty blades, turning about the plane's length.
for ex, ey, ez, ek, tag in ENGINES:
    for side, name in ((1, 'fanl'), (-1, 'fanr')):
        hub = (side * ex, ey, ez)
        q = [kit.cone(0.2 * ek, 0.02, 0.42 * ek, (hub[0], ey - 0.16 * ek, ez), WHITE, verts=18, rot=(PI / 2, 0, 0))]
        swirl = kit.box((0.03, 0.02, 0.18 * ek), (hub[0], ey - 0.33 * ek, ez + 0.07 * ek), ACCENT2, bevel=0.0, rot=(0, 0, 0.6))
        q.append(swirl)
        blades = 16 if WIDE else 20
        for i in range(blades):
            a = i * 2 * PI / blades
            blade = kit.box((0.12 * ek * (20 / blades) ** 0.5, 0.03, 0.42 * ek), (0, 0, 0.36 * ek), FANBLADE, bevel=0.01, rot=(0, 0, 0.55))
            q.append(spun(blade, hub, a))
        m.part(name + tag, hub, q)
        m.marker('blur' + name[-1] + tag, (hub[0], ey - 0.03, ez))

# --- Doors: the passenger door and the galley door hinged at their front edges, the cargo door along its top.
for name, (y0, y1) in ((('galley', GALLEY_Y),) if FREIGHT else (('door', DOOR_Y), ('galley', GALLEY_Y))):
    d = [shell(DOOR_A[0], DOOR_A[1], y0, y1, R + 0.018, 0.05, '#eef2f6', segs=10)]
    for k in range(2):
        yk = y0 + 0.2 + k * 0.3
        x, _, z = on_body(yk, math.radians(62), 0.06)
        d.append(kit.box((0.03, 0.16, 0.2), (x, yk, z), WINDOW, bevel=0.02, rot=(0, -math.radians(26), 0)))
    d.append(kit.box((0.03, 0.14, 0.05), on_body((y0 + y1) / 2, math.radians(90), 0.07), STEEL, bevel=0.0))
    m.part(name, (R + 0.03, y0, CZ), d)

if FREIGHT:
    # The main-deck door, hinged along its top: the airline's colour in a band across it, its latches below.
    mid = (CARGO_Y[0] + CARGO_Y[1]) / 2
    cd = [shell(CARGO_A[0], CARGO_A[1], CARGO_Y[0], CARGO_Y[1], R + 0.018, 0.05, '#eef2f6', segs=14)]
    cd.append(shell(math.radians(62), math.radians(74), CARGO_Y[0] + 0.05, CARGO_Y[1] - 0.05, R + 0.07, 0.01, ACCENT, segs=4))
    for k in range(3):
        yk = CARGO_Y[0] + 0.3 + k * 0.45
        cd.append(kit.box((0.04, 0.16, 0.06), on_body(yk, math.radians(96), 0.08), STEEL, bevel=0.0))
    top = on_body(mid, CARGO_A[0], 0.03)
    m.part('door', (top[0], mid, top[2]), cd)

hold_pivot = on_body((HOLD_Y[0] + HOLD_Y[1]) / 2, HOLD_A[1], 0.03)
h = [shell(HOLD_A[0], HOLD_A[1], HOLD_Y[0], HOLD_Y[1], R + 0.018, 0.05, '#eef2f6', segs=8)]
m.part('hold', (hold_pivot[0], (HOLD_Y[0] + HOLD_Y[1]) / 2, hold_pivot[2]), h)

# --- Flaps behind the inner wing.
for side, name in ((1, 'flapl'), (-1, 'flapr')):
    x0, x1 = side * 1.4, side * 4.9
    pivot = (side * 3.15, 0.9, WING_Z + 0.18)
    f = [kit.box((abs(x1 - x0), 0.7, 0.07), ((x0 + x1) / 2, 1.22, WING_Z + 0.16), FLAP, bevel=0.02, rot=(0, side * -0.06, 0))]
    m.part(name, pivot, f)

# --- The landing gear: twin wheels on a leg under each wing root, two under the nose.
WHEEL_Y = 0.55


def wheels(cx, y, z, r, width, gap):
    out = []
    for e in (-1, 1):
        out.append(kit.cylinder(r, width, (cx + e * gap, y, z), TYRE, verts=20, bevel=0.03, rot=(0, PI / 2, 0)))
        out.append(kit.cylinder(r * 0.55, width + 0.02, (cx + e * gap, y, z), HUB, verts=14, rot=(0, PI / 2, 0)))
        out.append(kit.cylinder(r * 0.18, width + 0.05, (cx + e * gap, y, z), STEEL, verts=8, rot=(0, PI / 2, 0)))
    out.append(kit.cylinder(0.05, gap * 2 + width, (cx, y, z), STEEL, verts=8, rot=(0, PI / 2, 0)))
    return out


for side, name in ((1, 'l'), (-1, 'r')):
    x = side * 1.75
    top = (x, 0.4, 1.55)
    axle = (x, WHEEL_Y, 0.46)
    g = [rod(top, (x, WHEEL_Y, 0.7), 0.1, STEEL), rod((x, WHEEL_Y, 1.0), (x, WHEEL_Y, 0.52), 0.065, HUB)]
    g.append(rod((x - side * 0.9, 0.2, 1.5), (x, WHEEL_Y + 0.05, 1.0), 0.045, STEEL, verts=6))
    m.part('gear' + name, top, g)
    m.part('wheel_' + name, axle, wheels(x, WHEEL_Y, 0.46, 0.46, 0.2, 0.17), on='gear' + name)

NOSE_Y = -5.55
ntop = (0, NOSE_Y + 0.05, 1.25)
m.part('gearn', ntop, [kit.box((0.4, 0.6, 0.06), (0, NOSE_Y + 0.02, 1.25), DARK, bevel=0.0)])
m.part('nose', ntop, [rod(ntop, (0, NOSE_Y, 0.38), 0.07, STEEL), rod((0, NOSE_Y - 0.05, 0.9), (0, NOSE_Y - 0.32, 1.22), 0.04, STEEL, verts=6)], on='gearn')
m.part('wheel_n', (0, NOSE_Y, 0.34), wheels(0, NOSE_Y, 0.34, 0.34, 0.14, 0.11), on='nose')

# Lights: the beacon on top, red on the left wingtip, green on the right, a strobe on the tail, a taxi
# light on the nose leg.
m.marker('beacon', (0, 1.0, 3.9))
m.marker('navl', (SPAN / 2 + 0.05, 1.6, WING_Z + 0.6))
m.marker('navr', (-SPAN / 2 - 0.05, 1.6, WING_Z + 0.6))
m.marker('strobe', (0, 7.0, 3.55))
m.marker('taxi', (0, NOSE_Y - 0.14, 0.75), on='nose')

if WIDE:
    # Everything half as big again: the meshes about their own origins (their pivots), every node's place.
    from mathutils import Matrix

    for ob in m.base.children_recursive:
        if ob.type == 'MESH':
            ob.data.transform(Matrix.Scale(WIDE_SCALE, 4))
        ob.location = ob.location * WIDE_SCALE
out = Path(sys.argv[1] if len(sys.argv) > 1 else f'skyport-{"freighter" if FREIGHT else "wide" if WIDE else "jet"}.glb')
rig.export_all(out)
if len(sys.argv) > 2:
    kit.preview(sys.argv[2], look_at=(0, 0, 2.0 * (WIDE_SCALE if WIDE else 1)), distance=24 * (WIDE_SCALE if WIDE else 1), size=(1100, 800), ground='#cfd6de', angles=((0.55, -1, 0.85), (-0.9, 0.5, 0.6), (0.01, -0.02, 1.0)))
