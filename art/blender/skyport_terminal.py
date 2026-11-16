"""Skyport International (Chapter 4): the check-in hall and the airport's name, built where they stand.

sp_hall stands at the origin and is built at the town's own coordinates
(src/data/towns/skyport/layout.json; the game's (x, z) is (x, -y) here): its
low glass walls with white mullions round the hall, lamp columns along them,
a portal over each gate's door (markers sp_hall_gate1 / sp_hall_gate2 where
the game hangs each gate's sign), the entrance's frame with its two sliding
glass doors (sp_hall_doorl / sp_hall_doorr, which slide apart along X), the
marker sp_hall_entry for the sign over it, and the striped hoarding along
the east end where the new terminal will go.

sp_name: the airport's name in big raised letters on a plinth, a little plane
flying over it on a stalk (sp_name_plane, which circles).

Usage: python art/blender/skyport_terminal.py <out.glb> [preview.png]
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
AQUA_DEEP = '#14959b'
NAVY = '#17324d'
SUN = '#ffd24a'
ORANGE = '#ff8a3d'
STEEL = '#c9d2dc'
DARK = '#3b3f4a'
BULB = '#fff3a0'
FRAME = '#dfe6ee'

hall = LAYOUT['hall']
entrance = LAYOUT['entrance']
gates = LAYOUT['gates']


def g(x, z, h=0.0):
    """The game's (x, z) at height h, here."""
    return (x, -z, h)


def wall_run(x0, z0, x1, z1, posts=True):
    """A low glass wall from (x0, z0) to (x1, z1) in the game's coordinates: a plinth, panes between white
    mullions, a rail along the top."""
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


m = Model('sp_hall', 0.0)
p = []
north, south = hall['minZ'], hall['maxZ']
west, east = hall['minX'], hall['maxX']
# North wall, with a doorway at each gate.
doors = sorted(v['door']['x'] for v in gates.values())
x = west
for dx in doors:
    p += wall_run(x, north, dx - 1.5, north)
    x = dx + 1.5
p += wall_run(x, north, east, north)
# South wall, with the entrance.
p += wall_run(west, south, entrance['x'] - 2.5, south)
p += wall_run(entrance['x'] + 2.5, south, east, south)
# The west end.
p += wall_run(west, north, west, south)

# Lamp columns along both long walls (not in a doorway): a white column, an aqua cap, a globe on top.
BAYS = 6
for i in range(BAYS + 1):
    x = west + i * (east - west) / BAYS
    for z in (north, south):
        if z == south and abs(x - entrance['x']) < 3.0:
            continue
        if z == north and any(abs(x - dx) < 2.2 for dx in doors):
            continue
        p.append(kit.box((0.5, 0.5, 2.3), g(x, z, 1.15), WHITE, bevel=0.08))
        p.append(kit.box((0.66, 0.66, 0.2), g(x, z, 2.36), AQUA, bevel=0.05))
        p.append(kit.sphere(0.24, g(x, z, 2.68), BULB, segments=12))
        p.append(kit.cylinder(0.12, 0.12, g(x, z, 2.5), STEEL, verts=10))

# A portal over each gate's door: two posts, a header the gate's sign hangs on, lamps along its top,
# and a canopy reaching out over the apron side.
for name, gate in gates.items():
    dx = gate['door']['x']
    for e in (-1, 1):
        p.append(kit.box((0.36, 0.5, 3.4), g(dx + e * 1.7, north, 1.7), NAVY, bevel=0.06))
        p.append(kit.box((0.5, 0.64, 0.16), g(dx + e * 1.7, north, 0.08), STEEL, bevel=0.03))
    p.append(kit.box((3.9, 0.5, 0.95), g(dx, north, 3.35), NAVY, bevel=0.07))
    p.append(kit.box((4.0, 0.56, 0.14), g(dx, north, 3.86), AQUA, bevel=0.04))
    for k in range(5):
        p.append(kit.sphere(0.07, g(dx - 1.6 + k * 0.8, north - 0.3, 3.86), BULB, segments=6))
    p.append(kit.box((3.6, 1.6, 0.1), g(dx, north - 0.8, 2.9), WHITE, bevel=0.03))
    p.append(kit.box((3.64, 0.08, 0.16), g(dx, north - 1.6, 2.88), AQUA, bevel=0.0))
    # Boarding lights either side of the door, at eye height.
    for e in (-1, 1):
        p.append(kit.box((0.06, 0.2, 0.5), g(dx + e * 1.5, north + 0.26, 1.6), DARK, bevel=0.02))
    m.marker(name, g(dx, north + 0.26, 3.35))

# The entrance: a frame over the doorway, its header in the airport's colour, the doors sliding in it.
ex = entrance['x']
for e in (-1, 1):
    p.append(kit.box((0.4, 0.5, 3.0), g(ex + e * 2.7, south, 1.5), WHITE, bevel=0.08))
    p.append(kit.box((0.5, 0.6, 0.18), g(ex + e * 2.7, south, 3.05), AQUA, bevel=0.04))
p.append(kit.box((5.8, 0.5, 0.75), g(ex, south, 3.4), NAVY, bevel=0.07))
p.append(kit.box((5.9, 0.56, 0.14), g(ex, south, 3.84), AQUA, bevel=0.04))
for k in range(7):
    p.append(kit.sphere(0.07, g(ex - 2.4 + k * 0.8, south + 0.3, 3.84), BULB, segments=6))
# The doors' track, and a mat in the doorway.
p.append(kit.box((5.0, 0.2, 0.14), g(ex, south - 0.25, 2.62), STEEL, bevel=0.02))
m.marker('entry', g(ex, south + 0.26, 3.4))

# The hoarding along the east end, where the new terminal will be built: striped boards on posts.
length = south - north
n = round(length / 1.6)
for k in range(n):
    z = north + (k + 0.5) * length / n
    p.append(kit.box((0.22, length / n - 0.04, 2.1), g(east, z, 1.15), ORANGE if k % 2 else WHITE, bevel=0.02))
    p.append(kit.box((0.26, length / n, 0.12), g(east, z, 0.1), NAVY, bevel=0.0))
for k in range(n + 1):
    z = north + k * length / n
    p.append(kit.box((0.18, 0.18, 2.3), g(east + 0.15, z, 1.15), STEEL, bevel=0.02))
    p.append(blob((0.09, 0.09, 0.1), g(east + 0.15, z, 2.38), ORANGE, segments=8))
m.mesh(p)

# The sliding doors: glass in white frames, each sliding outwards from the middle.
for name, e in (('doorl', -1), ('doorr', 1)):
    cx = ex + e * 1.25
    d = [kit.box((2.4, 0.08, 2.5), g(cx, south - 0.32, 1.27), PANE, bevel=0.0)]
    d.append(kit.box((2.5, 0.12, 0.12), g(cx, south - 0.32, 2.52), FRAME, bevel=0.02))
    d.append(kit.box((2.5, 0.12, 0.12), g(cx, south - 0.32, 0.06), FRAME, bevel=0.02))
    for k in (-1, 1):
        d.append(kit.box((0.1, 0.12, 2.5), g(cx + k * 1.2, south - 0.32, 1.28), FRAME, bevel=0.02))
    d.append(kit.box((0.06, 0.14, 0.6), g(cx - e * 1.05, south - 0.32, 1.1), STEEL, bevel=0.01))
    m.part(name, g(cx, south - 0.32, 0), d)

# --- The name: SKYPORT in big raised letters on a plinth, a little plane circling over it. ---
SX = entrance['x'] - 9.4
SZ = south + 3.4
m = Model('sp_name', SX, -SZ)
p = [kit.box((7.6, 1.0, 0.5), g(SX, SZ, 0.25), WHITE, bevel=0.1)]
p.append(kit.box((7.7, 1.06, 0.12), g(SX, SZ, 0.36), AQUA, bevel=0.04))
for e in (-1, 1):
    p.append(blob((0.5, 0.45, 0.36), g(SX + e * 3.4, SZ + 0.1, 0.62), '#4fae5a', segments=10))


def letters(body, size, at, col, depth):
    """Raised letters standing up on their baseline's middle at `at`, facing -Y."""
    obj = kit.text(body, size, (0, 0, 0), col, depth=depth)
    obj.rotation_euler = (PI / 2, 0, 0)
    kit._apply_all(obj)
    obj.location = at
    kit.bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    return obj


p.append(letters('SKYPORT', 1.35, g(SX, SZ + 0.05, 1.2), AQUA, 0.14))
p.append(letters('SKYPORT', 1.35, g(SX + 0.07, SZ - 0.1, 1.13), NAVY, 0.14))
for k in range(9):
    p.append(kit.sphere(0.07, g(SX - 3.2 + k * 0.8, SZ + 0.53, 0.36), BULB, segments=6))
p.append(rod(g(SX + 3.2, SZ, 0.5), g(SX + 3.2, SZ, 2.6), 0.05, STEEL, verts=8))
m.mesh(p)
# The little plane on its stalk, nose round the circle.
PX, PY = SX + 3.2, 2.75
q = [rod(g(PX, SZ, PY - 0.15), g(PX, SZ, PY), 0.03, STEEL, verts=6)]
q.append(rod(g(PX, SZ, PY), g(PX + 0.9, SZ, PY), 0.025, STEEL, verts=6))
body = rig.loft([(-0.6, 0, PY, 0.02, 0.02), (-0.5, 0, PY, 0.14, 0.14), (0.3, 0, PY, 0.15, 0.15), (0.6, 0, PY + 0.06, 0.05, 0.05)], WHITE, verts=14)
body.rotation_euler = (0, 0, PI / 2)
kit._apply_all(body)
body.location = (PX + 0.9, -SZ, 0)
kit.bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
rig.paint(body, lambda c: AQUA if c.z < PY - 0.03 else WHITE)
q.append(body)
q.append(kit.box((0.18, 1.3, 0.04), (PX + 0.9, -SZ, PY + 0.08), WHITE, bevel=0.02))
q.append(kit.box((0.1, 0.5, 0.03), (PX + 0.38, -SZ, PY + 0.1), WHITE, bevel=0.01))
q.append(kit.box((0.18, 0.03, 0.24), (PX + 0.38, -SZ, PY + 0.2), AQUA, bevel=0.01))
m.part('plane', g(PX, SZ, PY), q)

out = Path(sys.argv[1] if len(sys.argv) > 1 else 'skyport-terminal.glb')
# The hall in one file, the name in another (each under a Playables file's 512 KiB).
rig.export_all(out, [b for b in rig.bases if b.name == 'sp_hall'])
rig.export_all(out.with_name(out.stem.replace('terminal', 'name') + out.suffix), [b for b in rig.bases if b.name == 'sp_name'])
if len(sys.argv) > 2:
    rig.contact_sheet(sys.argv[2], rig.bases, size=(1000, 700), cols=1)
