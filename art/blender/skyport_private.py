"""Skyport International (Chapter 4, Part C): the golden private jet a celebrity flies in on.

Nose to -Y here (+Z in the game), wheels on the ground at z = 0: a slim business jet about 11 m long,
gold all over with a pearl cheatline, a swept wing with gold winglets, two engines on the back of the
fuselage and a T-tail with a star on the fin.

Moving parts (empties at their pivots, rig.py), named as the airliners' so the game drives them alike:
sp_private_fanl/_fanr (the fans, spinning about the plane's length), sp_private_door (the airstair door
on the left (+X), hinged along its bottom edge: it folds down to the ground as steps), sp_private_hold
(the baggage door at the back on the right), sp_private_galley (a service hatch at the back on the left),
sp_private_flapl/_flapr, sp_private_gearl/_gearr/_gearn (fold up after take-off), sp_private_nose (the
nose wheel's steering), sp_private_wheel_l/_r/_n (roll). Markers: _beacon, _navl, _navr, _strobe, _taxi,
_blurl/_blurr (where the fans' blur discs go).

Its gold is its own (not the airlines' ACCENT paints), so the game never repaints it.

Usage: python art/blender/skyport_private.py <out.glb> [preview.png]
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

GOLD = '#d9a62e'
GOLD_DARK = '#b07f1c'
PEARL = '#fff6dc'
BELLY = '#efe2bd'
WINDOW = '#26364a'
GLASS = '#30465e'
TYRE = '#2b2f38'
HUB = '#c9d2dc'
STEEL = '#9aa6b4'
DARK = '#1f2a36'
FANBLADE = '#4a525e'
CHROME = '#e9eef3'
NAVY = '#17324d'

R = 0.9
CZ = 1.6
SPINE = (
    # (y, cx, cz, rx, rz): nose to tail.
    (-5.50, 0, 1.38, 0.03, 0.03),
    (-5.42, 0, 1.40, 0.2, 0.18),
    (-5.25, 0, 1.43, 0.38, 0.34),
    (-4.95, 0, 1.48, 0.56, 0.52),
    (-4.55, 0, 1.53, 0.72, 0.7),
    (-4.05, 0, 1.58, 0.84, 0.84),
    (-3.40, 0, 1.60, 0.9, 0.9),
    (2.20, 0, 1.60, 0.9, 0.9),
    (3.10, 0, 1.68, 0.84, 0.8),
    (4.00, 0, 1.82, 0.66, 0.6),
    (4.80, 0, 1.98, 0.42, 0.38),
    (5.40, 0, 2.1, 0.16, 0.14),
    (5.55, 0, 2.13, 0.04, 0.04),
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


# (The tail fin and winglets: the same either side, from rig.)
fin = rig.fin


def spun(obj, hub, angle):
    """Turns a part made pointing up from the origin round the Y axis by `angle`, and moves it to `hub`."""
    kit.set_origin(obj, (0, 0, 0))
    obj.rotation_euler = (0, angle, 0)
    kit._apply_all(obj)
    obj.location = hub
    kit._apply_all(obj)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    return obj


m = Model('sp_private', 0.0)
p = []

# --- The fuselage: gold, a pearl cheatline sweeping up to the tail, a paler belly, a dark windscreen.
body = rig.loft(SPINE, GOLD, verts=36)


def livery(c):
    cz, rx, rz = centre_at(c.y)
    if c.y < -5.38:
        return DARK
    a = math.atan2(abs(c.x) / max(rx, 0.01), (c.z - cz) / max(rz, 0.01))
    # The windscreen: a dark wraparound band on the nose's top.
    if -4.95 < c.y < -4.45 and 0.25 < a < 1.25:
        return GLASS
    sweep = max(0.0, (c.y - 1.5) * 0.16)
    if 1.5 - sweep < a < 1.72 - sweep:
        return PEARL
    if 1.72 - sweep < a < 1.8 - sweep:
        return NAVY
    if a > 2.35:
        return BELLY
    return GOLD


rig.paint(body, livery)
p.append(body)

# Cabin windows: five big ovals a side.
for side in (-1, 1):
    for i in range(5):
        y = -3.0 + i * 0.95
        if side > 0 and abs(y - (-3.0)) < 0.3:
            continue
        x, _, z = on_body(y, side * math.radians(66), 0.0)
        p.append(blob((0.05, 0.2, 0.17), (x, y, z), WINDOW, segments=10, rot=(0, -side * math.radians(24), 0)))
# The cockpit's side windows.
for side in (-1, 1):
    x, _, z = on_body(-4.3, side * math.radians(62), 0.0)
    p.append(kit.box((0.05, 0.28, 0.17), (x, -4.3, z), GLASS, bevel=0.03, rot=(0, -side * math.radians(28), 0)))
# The door's outline (left front), the baggage and service hatches (back).
DOOR_Y = (-3.55, -2.75)
DOOR_A = (math.radians(55), math.radians(122))
for side, y0, y1 in ((1, *DOOR_Y), (1, 2.15, 2.55), (-1, 2.0, 2.6)):
    for y in (y0, y1):
        x, _, z = on_body(y, side * math.radians(88), 0.005)
        p.append(kit.box((0.03, 0.03, 0.62 if y0 == DOOR_Y[0] else 0.42), (x, y, z), GOLD_DARK, bevel=0.0))
# Antennas.
p.append(kit.box((0.04, 0.24, 0.28), (0, -1.6, 2.55), DARK, bevel=0.01, rot=(0.35, 0, 0)))
p.append(kit.box((0.04, 0.2, 0.2), (0, 1.0, 0.72), DARK, bevel=0.01, rot=(-0.4, 0, 0)))

# --- The wing: low, swept, slim, gold winglets.
SPAN = 10.4
WING_Z = 1.0
p.append(blob((0.85, 1.9, 0.38), (0, 0.4, 0.98), BELLY, segments=16))
w = rig.wing((0.0, -0.6, WING_Z, 2.3, 0.9), (SPAN / 2, 1.5, WING_Z + 0.42, 0.85, 0.85), PEARL)
rig.paint(w, lambda c: GOLD if abs(c.x) > SPAN / 2 - 0.5 else PEARL)
p.append(w)
for side in (-1, 1):
    winglet = fin((WING_Z + 0.42, 1.42, 0.85, 0.8), (WING_Z + 1.25, 2.05, 0.42, 0.7), GOLD)
    winglet.location = (side * SPAN / 2, 0, 0)
    kit._apply_all(winglet)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    p.append(winglet)

# --- The engines: two pods on short stubs either side of the rear fuselage, gold lips.
ENG_X = 1.42
ENG_Y = 2.75
ENG_Z = 2.02
FAN_Y = ENG_Y - 0.95
for side in (-1, 1):
    x = side * ENG_X
    nac = rig.loft(
        (
            (FAN_Y - 0.12, x, ENG_Z, 0.36, 0.36),
            (FAN_Y - 0.06, x, ENG_Z, 0.45, 0.45),
            (FAN_Y + 0.25, x, ENG_Z, 0.48, 0.48),
            (FAN_Y + 1.35, x, ENG_Z, 0.44, 0.44),
            (FAN_Y + 1.85, x, ENG_Z, 0.32, 0.32),
        ),
        PEARL,
        verts=24,
        cap=False,
    )
    rig.paint(nac, lambda c: GOLD if c.y < FAN_Y + 0.02 else PEARL)
    p.append(nac)
    p.append(kit.torus(0.44, 0.04, (x, FAN_Y - 0.08, ENG_Z), CHROME, rot=(PI / 2, 0, 0), major_segments=24, minor_segments=6))
    p.append(kit.cylinder(0.44, 0.1, (x, FAN_Y + 0.2, ENG_Z), DARK, verts=20, rot=(PI / 2, 0, 0)))
    p.append(kit.cylinder(0.26, 0.1, (x, FAN_Y + 1.82, ENG_Z), DARK, verts=16, rot=(PI / 2, 0, 0)))
    # The stub pylon into the fuselage.
    p.append(kit.box((0.75, 0.9, 0.16), (side * 0.85, FAN_Y + 0.85, ENG_Z - 0.02), GOLD, bevel=0.04))

# --- The T-tail: a swept gold fin with a star, the tailplane on its top.
FIN = ((2.05, 3.65, 2.0, 1.2), (4.3, 5.15, 1.05, 1.0))
p.append(fin(*FIN, GOLD))
p += rig.fin_logo(*FIN, (5.27, 3.35), 0.36, (0.28, 0.12), PEARL, GOLD_DARK)
tp = rig.wing((0.0, 4.95, 4.3, 1.05, 0.8), (1.85, 5.55, 4.42, 0.55, 0.8), GOLD)
p.append(tp)
p.append(blob((0.12, 0.6, 0.12), (0, 5.4, 4.32), GOLD_DARK, segments=10))
m.mesh(p)

# --- The fans: a spinner and sixteen blades, turning about the plane's length.
for side, name in ((1, 'fanl'), (-1, 'fanr')):
    hub = (side * ENG_X, FAN_Y, ENG_Z)
    q = [kit.cone(0.13, 0.02, 0.28, (hub[0], FAN_Y - 0.1, ENG_Z), CHROME, verts=16, rot=(PI / 2, 0, 0))]
    for i in range(16):
        a = i * 2 * PI / 16
        blade = kit.box((0.09, 0.025, 0.3), (0, 0, 0.25), FANBLADE, bevel=0.008, rot=(0, 0, 0.55))
        q.append(spun(blade, hub, a))
    m.part(name, hub, q)
    m.marker('blur' + name[-1], (hub[0], FAN_Y - 0.02, ENG_Z))

# --- The airstair door: hinged along its bottom edge on the left, steps on its inner face; the game folds
# it out and down to the ground (about 100 degrees) when the celebrity steps off.
dx, _, dz = on_body((DOOR_Y[0] + DOOR_Y[1]) / 2, math.radians(90), 0.02)
sill = dz - 0.55
d = [kit.box((0.06, DOOR_Y[1] - DOOR_Y[0], 1.1), (dx, (DOOR_Y[0] + DOOR_Y[1]) / 2, sill + 0.55), GOLD, bevel=0.03)]
d.append(kit.box((0.04, 0.3, 0.22), (dx + 0.03, (DOOR_Y[0] + DOOR_Y[1]) / 2, sill + 0.82), WINDOW, bevel=0.02))
for k in range(4):
    d.append(kit.box((0.2, DOOR_Y[1] - DOOR_Y[0] - 0.1, 0.04), (dx - 0.1, (DOOR_Y[0] + DOOR_Y[1]) / 2, sill + 0.15 + k * 0.26), PEARL, bevel=0.01))
for e in (-1, 1):
    d.append(rod((dx - 0.05, (DOOR_Y[0] + DOOR_Y[1]) / 2 + e * 0.36, sill + 0.05), (dx - 0.05, (DOOR_Y[0] + DOOR_Y[1]) / 2 + e * 0.36, sill + 1.05), 0.02, CHROME, verts=6))
m.part('door', (dx, (DOOR_Y[0] + DOOR_Y[1]) / 2, sill), d)
for name, side, (y0, y1) in (('hold', -1, (2.0, 2.6)), ('galley', 1, (2.15, 2.55))):
    hx, _, hz = on_body((y0 + y1) / 2, side * math.radians(88), 0.02)
    m.part(name, (hx, (y0 + y1) / 2, hz + 0.21), [kit.box((0.05, y1 - y0, 0.42), (hx, (y0 + y1) / 2, hz), GOLD, bevel=0.02)])

# --- Flaps behind the inner wing.
for side, name in ((1, 'flapl'), (-1, 'flapr')):
    x0, x1 = side * 1.0, side * 3.4
    pivot = (side * 2.2, 1.35, WING_Z + 0.12)
    m.part(name, pivot, [kit.box((abs(x1 - x0), 0.45, 0.05), ((x0 + x1) / 2, 1.55, WING_Z + 0.1), '#e8dcb8', bevel=0.015, rot=(0, side * -0.06, 0))])


# --- The landing gear: a wheel pair on each main leg, one pair under the nose.
def wheels(cx, y, z, r, width, gap):
    out = []
    for e in (-1, 1):
        out.append(kit.cylinder(r, width, (cx + e * gap, y, z), TYRE, verts=18, bevel=0.025, rot=(0, PI / 2, 0)))
        out.append(kit.cylinder(r * 0.55, width + 0.02, (cx + e * gap, y, z), HUB, verts=12, rot=(0, PI / 2, 0)))
    out.append(kit.cylinder(0.04, gap * 2 + width, (cx, y, z), STEEL, verts=8, rot=(0, PI / 2, 0)))
    return out


WHEEL_Y = 1.0
for side, name in ((1, 'l'), (-1, 'r')):
    x = side * 1.25
    top = (x, 0.85, 0.95)
    axle = (x, WHEEL_Y, 0.3)
    m.part('gear' + name, top, [rod(top, (x, WHEEL_Y, 0.42), 0.07, STEEL), rod((x - side * 0.6, 0.65, 0.95), (x, WHEEL_Y, 0.65), 0.035, STEEL, verts=6)])
    m.part('wheel_' + name, axle, wheels(x, WHEEL_Y, 0.3, 0.3, 0.13, 0.1), on='gear' + name)
NOSE_Y = -4.15
ntop = (0, NOSE_Y + 0.05, 0.9)
m.part('gearn', ntop, [kit.box((0.3, 0.45, 0.05), (0, NOSE_Y + 0.02, 0.88), DARK, bevel=0.0)])
m.part('nose', ntop, [rod(ntop, (0, NOSE_Y, 0.26), 0.05, STEEL)], on='gearn')
m.part('wheel_n', (0, NOSE_Y, 0.22), wheels(0, NOSE_Y, 0.22, 0.22, 0.1, 0.08), on='nose')

# Lights: the beacon on top, red on the left wingtip, green on the right, a strobe on the tail, a taxi light.
m.marker('beacon', (0, 0.4, 2.55))
m.marker('navl', (SPAN / 2 + 0.05, 1.7, WING_Z + 0.45))
m.marker('navr', (-SPAN / 2 - 0.05, 1.7, WING_Z + 0.45))
m.marker('strobe', (0, 5.6, 4.35))
m.marker('taxi', (0, NOSE_Y - 0.1, 0.55), on='nose')

out = Path(sys.argv[1] if len(sys.argv) > 1 else 'skyport-private.glb')
rig.export_all(out)
if len(sys.argv) > 2:
    kit.preview(sys.argv[2], look_at=(0, 0, 1.5), distance=17, size=(1100, 800), ground='#cfd6de', angles=((0.55, -1, 0.85), (-0.9, 0.5, 0.6), (0.01, -0.02, 1.0)))
