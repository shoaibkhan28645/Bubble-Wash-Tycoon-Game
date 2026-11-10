"""Starlight Fun Park (Chapter 3): the rides, stalls and props, each standing
on its own named base so the game can place them one by one. Fronts face -Y
here (+Z in the game, towards the camera).

Rides: pk_carousel (a turning platform under a striped canopy, eight horses
that bob on their poles), pk_teacups (a turning platter of four big cups that
spin on their own). Stalls: pk_booth (the ticket booth: a counter facing the
camera, a roof over the back only so whoever sells stays in view), pk_cart
(the candy floss cart: a spinning floss bowl under a striped umbrella).
Props: pk_gate (the park's arch, its star turning on top), pk_benches (two
benches and a bin), pk_lever (a ride's launch lever), pk_lamp, pk_rope (a
queue rope between two posts, 2 m), pk_flowers (a round flower bed).

Parts the game moves are their own meshes, each in an empty named
<model>_<part> at its pivot, nested where they ride on each other (a horse on
the carousel's platform). Empty spots named <model>_seat<n> mark where a
rider sits (the person's hips): they ride along with their part.

Usage: python art/blender/park.py <out.glb> [preview.png]
(writes <out>.glb with the first stalls and props, <out>-midway.glb with the Midway's stalls, the shed,
the truck and the bins, and a file per ride: <out>-carousel.glb, <out>-teacups.glb, <out>-bumper.glb)
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import kit  # noqa: E402

kit.reset()
# Round parts are smooth shaded: they look softer, and their corners are shared (a much smaller file).
_sphere, _torus, _cone = kit.sphere, kit.torus, kit.cone


def smooth(obj):
    obj.data.shade_smooth()
    return obj


kit.sphere = lambda *a, **k: smooth(_sphere(*a, **k))
kit.torus = lambda *a, **k: smooth(_torus(*a, **k))
models = []
bases = []

# The fairground palette: candy colours and gold trim.
PINK = '#ff8fc8'
HOTPINK = '#ff5fa8'
BLUSH = '#ffe1ef'
CREAM = '#fff6ea'
WHITE = '#fdfbf7'
MINT = '#7ee0c3'
TEAL = '#2fb8a8'
SKY = '#5bbcff'
DEEP = '#2f80d1'
SUN = '#ffd24a'
GOLD = '#ffbf3c'
GOLD_DARK = '#d99a1e'
LILAC = '#b79cff'
VIOLET = '#8a6bd8'
CORAL = '#ff7a6b'
NAVY = '#3b4a5e'
IRON = '#2f5d50'
WOOD = '#c98a52'
WOOD_DARK = '#8f6036'
STEEL = '#c9d2dc'
GLASS = '#cfeeff'
BULB = '#fff3a0'
INK = '#2d3440'


def empty(name, parent, at):
    node = kit.bpy.data.objects.new(name, None)
    kit.bpy.context.scene.collection.objects.link(node)
    node.parent = parent
    node.location = at
    return node


class Model:
    """A model on its own named base at x = `x`; its moving parts nest in empties at their pivots."""

    def __init__(self, name, x):
        self.name = name
        self.x = x
        self.base = empty(name, None, (x, 0, 0))
        bases.append(self.base)
        self.pivots = {None: (x, 0, 0)}
        self.holders = {None: self.base}

    def mesh(self, parts, part=None):
        """Joins `parts` into the static mesh, or into a moving part's mesh."""
        if not parts:
            return
        label = f'{self.name}_mesh' if part is None else f'{self.name}_{part}_mesh'
        obj = kit.join(parts, label)
        kit.set_origin(obj, self.pivots[part])
        obj.parent = self.holders[part]
        obj.location = (0, 0, 0)
        models.append(obj)

    def part(self, part, pivot, parts, on=None):
        """A moving part turning about `pivot` (absolute), riding on part `on` (or the base)."""
        parent = self.pivots[on]
        holder = empty(f'{self.name}_{part}', self.holders[on], tuple(p - q for p, q in zip(pivot, parent)))
        self.pivots[part] = tuple(pivot)
        self.holders[part] = holder
        self.mesh(parts, part)

    def marker(self, name, at, on=None):
        parent = self.pivots[on]
        empty(f'{self.name}_{name}', self.holders[on], tuple(p - q for p, q in zip(at, parent)))


def blob(radii, at, col, segments=8, rot=(0, 0, 0)):
    """An ellipsoid: a sphere stretched to `radii` (x, y, z), then turned by `rot`."""
    kit.bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=max(4, segments // 2), radius=1, location=at)
    obj = kit.bpy.context.object
    obj.scale = radii
    kit.bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return smooth(kit._finish(obj, col, rot=rot))


def stripes(obj, a, b, n, centre=(0, 0)):
    """Paints an object's faces in `n` alternating wedges round a vertical axis."""
    import shapes
    ox = obj.location.x
    oy = obj.location.y

    def rule(c):
        ang = math.atan2(c.y + oy - centre[1], c.x + ox - centre[0])
        return a if int((ang + math.pi) / (2 * math.pi) * n) % 2 == 0 else b
    shapes.paint_faces(obj, rule)
    return obj


def bands(obj, a, b, step, z0=0.0):
    """Paints an object's faces in horizontal bands `step` high (a striped pole)."""
    import shapes
    oz = obj.location.z
    shapes.paint_faces(obj, lambda c: a if int((c.z + oz - z0) / step) % 2 == 0 else b)
    return obj


def ring_of(n, radius, z, make, start=0.0, centre=None):
    """`n` parts round a circle about `centre` (the model being made, by default)."""
    centre = centre or (X, 0)
    out = []
    for i in range(n):
        a = start + i * 2 * math.pi / n
        out.append(make(centre[0] + radius * math.cos(a), centre[1] + radius * math.sin(a), z, a, i))
    return out


def bulb(x, y, z, r=0.06):
    return kit.sphere(r, (x, y, z), BULB, segments=4)


def star(at, radius, col, thick=0.12, rot=(math.pi / 2, 0, 0)):
    """A five-pointed star standing up, facing -Y (the camera)."""
    obj = kit.star_disc(radius, radius * 0.45, thick, at, col, points=5, twist=math.pi / 2)
    obj.rotation_euler = rot
    kit._apply_all(obj)
    return obj


def rod(a, b, r, col, verts=8):
    import mathutils
    A, B = mathutils.Vector(a), mathutils.Vector(b)
    d = B - A
    rot = mathutils.Vector((0, 0, 1)).rotation_difference(d.normalized()).to_euler()
    return kit.cylinder(r, d.length, tuple((A + B) / 2), col, verts=verts, rot=tuple(rot))


# --- The carousel: a platform 7.8 m across that turns under a striped canopy, eight horses bobbing on poles. ---
X = -40.0
m = Model('pk_carousel', X)
DECK = 0.34
p = [kit.cylinder(4.15, DECK, (X, 0, DECK / 2), CREAM, verts=40, bevel=0.06)]
p.append(kit.cylinder(4.18, 0.09, (X, 0, DECK - 0.1), HOTPINK, verts=40))
p.append(kit.torus(4.17, 0.03, (X, 0, DECK - 0.02), GOLD, major_segments=32, minor_segments=3))
# Steps up on the front, where riders get on, and gold lamps round the plinth's edge.
for k, (w, d) in enumerate(((2.4, 0.5), (2.0, 0.45))):
    p.append(kit.box((w, d, 0.12 + 0.11 * (1 - k)), (X, -4.25 - 0.25 * (1 - k), (0.12 + 0.11 * (1 - k)) / 2), CREAM if k else BLUSH, bevel=0.03))
p += ring_of(20, 4.19, DECK - 0.15, lambda x, y, z, a, i: bulb(x, y, z, 0.05))
m.mesh(p)

# The turning platform: the deck, the mirrored centre column, the canopy, the poles.
s = [kit.cylinder(3.95, 0.1, (X, 0, DECK + 0.05), WOOD, verts=40)]
s.append(kit.cylinder(3.9, 0.11, (X, 0, DECK + 0.05), BLUSH, verts=40))
s.append(kit.cylinder(2.2, 0.115, (X, 0, DECK + 0.05), CREAM, verts=32))
s.append(kit.torus(3.95, 0.04, (X, 0, DECK + 0.1), GOLD, major_segments=32, minor_segments=3))
s.append(kit.cylinder(0.72, 3.1, (X, 0, DECK + 1.6), CREAM, verts=16))
for cz in (DECK + 0.15, DECK + 3.05):
    s.append(kit.cylinder(0.8, 0.14, (X, 0, cz), GOLD, verts=16, bevel=0.03))
s += ring_of(8, 0.73, DECK + 1.65, lambda x, y, z, a, i: kit.box((0.06, 0.42, 2.2), (x, y, z), GOLD, bevel=0.0, rot=(0, 0, a)))
s += ring_of(8, 0.75, DECK + 1.65, lambda x, y, z, a, i: kit.box((0.03, 0.34, 2.05), (x, y, z), GLASS if i % 2 else '#e7f6ff', bevel=0.0, rot=(0, 0, a)))
TOP = DECK + 3.85
INNER = 2.6
OUTER = 4.0
# The canopy is open between a striped centre cone and the rim, so the riders show from above.
s.append(kit.cylinder(INNER - 0.05, 0.08, (X, 0, TOP - 0.04), BLUSH, verts=24))
s += ring_of(16, INNER, TOP + 0.12, lambda x, y, z, a, i: kit.box((1.04, 0.07, 0.36), (x, y, z), (WHITE, BLUSH)[i % 2], bevel=0.0, rot=(0, 0, a + math.pi / 2)), start=math.pi / 16)
s.append(kit.torus(INNER, 0.035, (X, 0, TOP + 0.31), GOLD, major_segments=24, minor_segments=3))
roof = kit.cone(INNER + 0.12, 0.22, 1.7, (X, 0, TOP + 0.3 + 0.85), PINK, verts=24)
stripes(roof, PINK, WHITE, 12, centre=(X, 0))
s.append(roof)
# The rim: rounding boards in pink and white with gold edges, scallops hanging under them, lamps all round.
s += ring_of(28, OUTER, TOP + 0.14, lambda x, y, z, a, i: kit.box((0.92, 0.07, 0.42), (x, y, z), (WHITE, BLUSH)[i % 2], bevel=0.0, rot=(0, 0, a + math.pi / 2)), start=math.pi / 28)
s.append(kit.torus(OUTER + 0.02, 0.04, (X, 0, TOP + 0.36), GOLD, major_segments=32, minor_segments=3))
s.append(kit.torus(OUTER + 0.02, 0.04, (X, 0, TOP - 0.08), GOLD, major_segments=32, minor_segments=3))
s += ring_of(20, OUTER + 0.04, TOP - 0.06, lambda x, y, z, a, i: kit.cylinder(0.3, 0.05, (x, y, z), (PINK, SKY, SUN, MINT)[i % 4], verts=10, rot=(math.pi / 2, 0, a + math.pi / 2)))
s += ring_of(28, OUTER + 0.05, TOP + 0.14, lambda x, y, z, a, i: bulb(x, y, z, 0.055))
# Gold spokes from the cone to the rim, over each pole, and a garland of pennants between them.
s += ring_of(8, 0, 0, lambda x, y, z, a, i: rod((X + INNER * math.cos(a), INNER * math.sin(a), TOP + 0.3), (X + OUTER * math.cos(a), OUTER * math.sin(a), TOP + 0.3), 0.05, GOLD, verts=6), start=math.pi / 8)
s += ring_of(8, 0, 0, lambda x, y, z, a, i: rod((X + INNER * math.cos(a), INNER * math.sin(a), TOP + 0.95), (X + OUTER * math.cos(a), OUTER * math.sin(a), TOP + 0.36), 0.04, GOLD, verts=6), start=math.pi / 8)
s.append(kit.cylinder(0.32, 0.28, (X, 0, TOP + 2.1), GOLD, verts=12))
s.append(kit.sphere(0.3, (X, 0, TOP + 2.35), GOLD, segments=12))
s.append(kit.cylinder(0.03, 0.75, (X, 0, TOP + 2.9), GOLD_DARK, verts=6))
s.append(star((X, 0, TOP + 3.35), 0.36, SUN))
# Little pennants round the top of the canopy.
s.append(kit.torus(3.3, 0.012, (X, 0, TOP + 0.66), WHITE, major_segments=24, minor_segments=3))
s += ring_of(16, 3.3, TOP + 0.53, lambda x, y, z, a, i: kit.cone(0.12, 0.0, 0.26, (x, y, z), (HOTPINK, SUN, SKY, MINT)[i % 4], verts=3, rot=(math.pi, 0, a)), start=math.pi / 16)
# The poles, candy-striped gold and white, one through each horse.
POLE_R = 2.85


def pole(x, y, z, a, i):
    return kit.cylinder(0.045, TOP - DECK - 0.05, (x, y, DECK + (TOP - DECK) / 2), GOLD, verts=8)


s += ring_of(8, POLE_R, 0, pole, start=math.pi / 8)
for h in (DECK + 0.5, DECK + 2.45, DECK + 3.2):
    s += ring_of(8, POLE_R, h, lambda x, y, z, a, i: kit.cylinder(0.06, 0.08, (x, y, z), WHITE, verts=8), start=math.pi / 8)
s += ring_of(8, POLE_R, TOP - 0.1, lambda x, y, z, a, i: kit.cylinder(0.09, 0.12, (x, y, z), GOLD_DARK, verts=10), start=math.pi / 8)
m.part('spin', (X, 0, DECK), s)

COATS = ((WHITE, PINK, '#ff5c6c'), ('#f3d9a4', '#fff1c9', DEEP), ('#dfe3ea', LILAC, HOTPINK), ('#ffd6e8', SUN, TEAL),
         ('#c7f0e2', '#ffffff', CORAL), ('#e9cfae', '#5c3a24', VIOLET), (WHITE, SKY, GOLD_DARK), ('#ffe9b0', HOTPINK, DEEP))
HORSE_Z = DECK + 1.05


def horse(cx, cy, cz, yaw, coat, mane, saddle):
    """A prancing carousel horse, nose along `yaw`, its middle at (cx, cy, cz)."""
    f = (math.cos(yaw), math.sin(yaw))
    sd = (-math.sin(yaw), math.cos(yaw))

    def at(fx, sx, z):
        return (cx + f[0] * fx + sd[0] * sx, cy + f[1] * fx + sd[1] * sx, cz + z)

    def orient(pitch=0.0, roll=0.0):
        return (roll, pitch, yaw)
    q = [blob((0.46, 0.19, 0.2), at(0, 0, 0), coat, 8, orient())]
    q.append(blob((0.22, 0.18, 0.2), at(0.3, 0, 0.04), coat, 6, orient()))
    q.append(blob((0.23, 0.185, 0.2), at(-0.3, 0, 0.02), coat, 6, orient()))
    q.append(blob((0.26, 0.11, 0.12), at(0.43, 0, 0.27), coat, 8, orient(-0.95)))
    q.append(blob((0.22, 0.1, 0.11), at(0.6, 0, 0.47), coat, 8, orient(0.45)))
    q.append(blob((0.1, 0.085, 0.085), at(0.75, 0, 0.38), coat, 6, orient(0.45)))
    q.append(blob((0.035, 0.06, 0.035), at(0.82, 0, 0.36), '#e8a0a0', 6, orient()))
    for side in (-1, 1):
        q.append(kit.cone(0.045, 0.0, 0.13, at(0.52, side * 0.055, 0.62), coat, verts=5, rot=orient(-0.2, side * 0.25)))
        q.append(kit.sphere(0.028, at(0.65, side * 0.085, 0.52), INK, segments=4))
    # The mane down the neck, and a forelock.
    for k in range(6):
        t = k / 5
        q.append(blob((0.07, 0.05, 0.08), at(0.3 + 0.24 * t, 0, 0.33 + 0.27 * t), mane, 6, orient(-0.6)))
    q.append(blob((0.06, 0.05, 0.05), at(0.62, 0, 0.6), mane, 6, orient()))
    # The tail, flowing back and down.
    q.append(blob((0.2, 0.06, 0.08), at(-0.6, 0, -0.02), mane, 6, orient(0.75)))
    q.append(blob((0.12, 0.05, 0.06), at(-0.72, 0, -0.18), mane, 6, orient(1.1)))
    # Legs: the front pair lifted in a prance, the back pair reaching down; gold hooves.
    for side in (-1, 1):
        q.append(kit.box((0.08, 0.08, 0.3), at(0.38, side * 0.09, -0.16), coat, bevel=0.0, rot=orient(-0.9)))
        q.append(kit.box((0.07, 0.07, 0.26), at(0.52, side * 0.09, -0.24), coat, bevel=0.0, rot=orient(0.6)))
        q.append(kit.cylinder(0.05, 0.06, at(0.46, side * 0.09, -0.36), GOLD, verts=6, rot=orient(0.6)))
        q.append(kit.box((0.09, 0.08, 0.36), at(-0.36, side * 0.09, -0.26), coat, bevel=0.0, rot=orient(-0.3)))
        q.append(kit.box((0.07, 0.07, 0.24), at(-0.27, side * 0.09, -0.52), coat, bevel=0.0, rot=orient(0.25)))
        q.append(kit.cylinder(0.05, 0.06, at(-0.23, side * 0.09, -0.65), GOLD, verts=6))
    # Saddle, blanket with a gold edge, bridle and reins.
    q.append(kit.box((0.42, 0.42, 0.04), at(-0.02, 0, 0.19), saddle, bevel=0.015, rot=orient()))
    q.append(kit.box((0.44, 0.44, 0.02), at(-0.02, 0, 0.175), GOLD, bevel=0.0, rot=orient()))
    q.append(blob((0.17, 0.15, 0.06), at(-0.04, 0, 0.23), '#7a3f22', 6, orient()))
    q.append(kit.box((0.05, 0.05, 0.1), at(0.11, 0, 0.27), '#7a3f22', bevel=0.01, rot=orient()))
    q.append(kit.torus(0.095, 0.015, at(0.72, 0, 0.4), GOLD, rot=(0, math.pi / 2 - 0.45, yaw), major_segments=8, minor_segments=3))
    for side in (-1, 1):
        q.append(rod(at(0.7, side * 0.09, 0.38), at(0.12, side * 0.12, 0.25), 0.012, GOLD, verts=4))
    return q


for i in range(8):
    a = math.pi / 8 + i * math.pi / 4
    hx, hy = X + POLE_R * math.cos(a), POLE_R * math.sin(a)
    # The platform turns anticlockwise seen from above, so each horse faces along the way it goes.
    yaw = a + math.pi / 2
    coat, mane, saddle = COATS[i]
    m.part(f'horse{i}', (hx, hy, HORSE_Z), horse(hx, hy, HORSE_Z, yaw, coat, mane, saddle), on='spin')
    # The rider's hips, on the saddle.
    m.marker(f'seat{i}', (hx - 0.03 * math.cos(yaw), hy - 0.03 * math.sin(yaw), HORSE_Z + 0.24), on=f'horse{i}')

# --- The teacups: a turning platter of four big cups, each spinning on its own, and a teapot in the middle. ---
X = -26.0
m = Model('pk_teacups', X)
p = [kit.cylinder(3.25, 0.22, (X, 0, 0.11), CREAM, verts=40, bevel=0.05)]
p.append(kit.cylinder(3.28, 0.07, (X, 0, 0.14), SKY, verts=40))
p += ring_of(24, 3.29, 0.08, lambda x, y, z, a, i: bulb(x, y, z, 0.045))
p.append(kit.box((1.8, 0.45, 0.12), (X, -3.42, 0.06), CREAM, bevel=0.03))
m.mesh(p)
PLAT = 0.24
s = [kit.cylinder(3.05, 0.1, (X, 0, PLAT + 0.05), '#a8e6ff', verts=40)]
plate = kit.cylinder(2.9, 0.105, (X, 0, PLAT + 0.05), '#a8e6ff', verts=24)
stripes(plate, '#a8e6ff', '#d8f4ff', 12, centre=(X, 0))
s.append(plate)
s.append(kit.torus(3.05, 0.035, (X, 0, PLAT + 0.1), GOLD, major_segments=32, minor_segments=3))
# The teapot: round, a spout, a handle, a lid and its knob.
s.append(blob((0.85, 0.85, 0.7), (X, 0, PLAT + 0.75), WHITE, 18))
s.append(kit.torus(0.84, 0.05, (X, 0, PLAT + 0.75), SKY, major_segments=24, minor_segments=4))
for k in range(8):
    a = k * math.pi / 4
    s.append(kit.sphere(0.12, (X + 0.82 * math.cos(a), 0.82 * math.sin(a), PLAT + 1.0), PINK, segments=8))
s.append(kit.cylinder(0.45, 0.12, (X, 0, PLAT + 1.4), SKY, verts=16, bevel=0.03))
s.append(kit.sphere(0.13, (X, 0, PLAT + 1.55), GOLD, segments=8))
s.append(rod((X + 0.7, 0, PLAT + 0.65), (X + 1.25, 0, PLAT + 1.15), 0.09, WHITE, verts=8))
s.append(kit.torus(0.3, 0.06, (X - 0.88, 0, PLAT + 0.85), WHITE, rot=(math.pi / 2, 0, 0), major_segments=12, minor_segments=6))
m.part('spin', (X, 0, PLAT), s)
CUP_R = 1.95
CUPS = ((PINK, WHITE), (SUN, '#ff9a3c'), (MINT, WHITE), (LILAC, SUN))
for i, (col, dots) in enumerate(CUPS):
    a = math.pi / 4 + i * math.pi / 2
    cx, cy = X + CUP_R * math.cos(a), CUP_R * math.sin(a)
    z0 = PLAT + 0.1
    c = [kit.cylinder(0.98, 0.08, (cx, cy, z0 + 0.04), WHITE, verts=24, bevel=0.02)]
    c.append(kit.torus(0.98, 0.03, (cx, cy, z0 + 0.08), GOLD, major_segments=24, minor_segments=4))
    c.append(kit.cylinder(0.12, 0.25, (cx, cy, z0 + 0.2), GOLD, verts=10))
    cup = kit.cone(0.55, 0.88, 0.8, (cx, cy, z0 + 0.72), col, verts=24)
    c.append(cup)
    c.append(kit.cylinder(0.8, 0.08, (cx, cy, z0 + 0.4), col, verts=24))
    c.append(kit.torus(0.88, 0.055, (cx, cy, z0 + 1.12), WHITE, major_segments=28, minor_segments=6))
    c.append(kit.cylinder(0.78, 0.04, (cx, cy, z0 + 0.6), BLUSH, verts=20))
    # Polka dots round the outside, and a handle.
    for k in range(10):
        b = k * 2 * math.pi / 10
        r = 0.74 + 0.05 * (k % 2)
        dz = 0.62 if k % 2 == 0 else 0.86
        c.append(blob((0.07, 0.07, 0.07), (cx + r * math.cos(b), cy + r * math.sin(b), z0 + dz), dots, 6))
    c.append(kit.torus(0.22, 0.05, (cx + 0.95, cy, z0 + 0.78), col, rot=(math.pi / 2, 0, 0), major_segments=12, minor_segments=6))
    # A bench seat round the inside and a little wheel in the middle that riders turn.
    c.append(kit.cylinder(0.7, 0.12, (cx, cy, z0 + 0.66), CREAM, verts=20))
    c.append(kit.cylinder(0.05, 0.4, (cx, cy, z0 + 0.85), GOLD, verts=6))
    c.append(kit.torus(0.18, 0.03, (cx, cy, z0 + 1.05), GOLD, major_segments=12, minor_segments=4))
    m.part(f'cup{i}', (cx, cy, z0), c, on='spin')
    for k in range(2):
        b = a + math.pi / 2 + k * math.pi
        m.marker(f'seat{i * 2 + k}', (cx + 0.42 * math.cos(b), cy + 0.42 * math.sin(b), z0 + 0.74), on=f'cup{i}')

# --- The ticket booth: a counter facing the camera, roofed over the back only, the TICKETS sign on top. ---
X = -14.0
m = Model('pk_booth', X)
p = [kit.box((3.7, 2.4, 0.12), (X, 0.05, 0.06), '#e8d9f2', bevel=0.03)]
# Walls round the back and sides, in lilac and white stripes.
for k in range(9):
    p.append(kit.box((0.38, 0.12, 2.5), (X - 1.52 + k * 0.38, 1.12, 1.37), LILAC if k % 2 == 0 else WHITE, bevel=0.0))
# The sides are walled at the back only: a doorway each side, so whoever sells walks in where the camera sees.
for sx in (-1, 1):
    for k in range(2):
        p.append(kit.box((0.12, 0.38, 2.5), (X + sx * 1.66, 0.97 - k * 0.38, 1.37), LILAC if k % 2 == 0 else WHITE, bevel=0.0))
    p.append(kit.box((0.18, 0.18, 2.65), (X + sx * 1.66, 0.38, 1.4), GOLD, bevel=0.04))
    p.append(kit.box((0.18, 0.18, 2.65), (X + sx * 1.66, -0.75, 1.4), GOLD, bevel=0.04))
# The counter: a low front with a pink band and a shelf, a till and a ticket roll on it.
p.append(kit.box((3.2, 0.5, 1.0), (X, -0.78, 0.55), WHITE, bevel=0.05))
p.append(kit.box((3.22, 0.04, 0.18), (X, -1.04, 0.72), HOTPINK, bevel=0.0))
for k in range(5):
    p.append(star((X - 1.2 + k * 0.6, -1.065, 0.4), 0.11, SUN, thick=0.03))
p.append(kit.box((3.45, 0.66, 0.07), (X, -0.8, 1.08), WOOD, bevel=0.02))
p.append(kit.box((0.5, 0.36, 0.26), (X + 0.9, -0.75, 1.25), NAVY, bevel=0.04))
p.append(kit.box((0.42, 0.04, 0.12), (X + 0.9, -0.94, 1.32), '#9fe0a0', bevel=0.0))
p.append(kit.cylinder(0.12, 0.2, (X - 0.8, -0.75, 1.24), '#ff5c6c', verts=12, rot=(0, math.pi / 2, 0)))
p.append(kit.box((0.18, 0.02, 0.22), (X - 0.62, -0.95, 1.18), '#ffe9a0', bevel=0.0))
# A poster on the back wall, and a stool.
p.append(kit.box((1.0, 0.04, 0.7), (X - 0.6, 1.04, 1.7), SKY, bevel=0.0))
p.append(star((X - 0.6, 1.0, 1.72), 0.22, SUN, thick=0.03))
p.append(kit.cylinder(0.2, 0.05, (X + 0.9, 0.5, 0.7), HOTPINK, verts=12))
p.append(kit.cylinder(0.04, 0.6, (X + 0.9, 0.5, 0.38), STEEL, verts=6))
# The roof over the back only, with scalloped edges and lamps, and the sign board standing on its front.
RZ = 2.72
p.append(kit.box((3.9, 1.95, 0.14), (X, 0.3, RZ), WHITE, bevel=0.05))
p.append(kit.box((3.95, 2.0, 0.06), (X, 0.3, RZ + 0.1), HOTPINK, bevel=0.02))
for k in range(9):
    p.append(kit.cylinder(0.22, 0.04, (X - 1.76 + k * 0.44, -0.67, RZ - 0.1), (PINK, SUN, SKY)[k % 3], verts=12, rot=(math.pi / 2, 0, 0)))
    p.append(bulb(X - 1.76 + k * 0.44, -0.7, RZ + 0.03, 0.045))
p.append(kit.box((2.5, 0.12, 0.62), (X, -0.45, RZ + 0.5), GOLD, bevel=0.05))
p.append(kit.box((2.32, 0.13, 0.48), (X, -0.45, RZ + 0.5), WHITE, bevel=0.04))
for sx in (-1, 1):
    p.append(kit.cylinder(0.025, 0.7, (X + sx * 1.85, 1.2, RZ + 0.45), NAVY, verts=6))
    p.append(kit.cone(0.2, 0.0, 0.32, (X + sx * 1.85 + 0.17, 1.2, RZ + 0.66), (HOTPINK, SKY)[sx > 0], verts=3, rot=(0, -math.pi / 2, 0)))
m.mesh(p)
m.part('star', (X, -0.45, RZ + 1.18), [star((X, -0.45, RZ + 1.18), 0.36, SUN, thick=0.14)])

# --- The candy floss cart: a striped cart, a spinning floss bowl, a umbrella; the seller stands behind it. ---
X = -6.0
m = Model('pk_cart', X)
p = [kit.box((1.7, 0.85, 0.7), (X, 0, 0.75), PINK, bevel=0.1, segments=2)]
for k in range(4):
    p.append(kit.box((0.1, 0.87, 0.6), (X - 0.6 + k * 0.4, 0, 0.75), WHITE, bevel=0.0))
p.append(kit.box((1.85, 0.95, 0.06), (X, 0, 1.13), WHITE, bevel=0.02))
p.append(kit.box((1.6, 0.06, 0.32), (X, -0.45, 0.72), WHITE, bevel=0.03))
for sx in (-1, 1):
    p.append(kit.cylinder(0.32, 0.07, (X - 0.45, sx * 0.48, 0.32), NAVY, verts=16, rot=(math.pi / 2, 0, 0)))
    p.append(kit.cylinder(0.2, 0.08, (X - 0.45, sx * 0.48, 0.32), SUN, verts=12, rot=(math.pi / 2, 0, 0)))
p.append(kit.box((0.08, 0.08, 0.42), (X + 0.65, 0, 0.2), NAVY, bevel=0.02))
p.append(rod((X + 0.85, -0.3, 0.95), (X + 1.15, -0.3, 0.95), 0.025, STEEL, verts=6))
p.append(rod((X + 0.85, 0.3, 0.95), (X + 1.15, 0.3, 0.95), 0.025, STEEL, verts=6))
p.append(rod((X + 1.15, -0.32, 0.95), (X + 1.15, 0.32, 0.95), 0.03, NAVY, verts=6))
# The floss machine's housing, a glass case of bagged floss, and floss on sticks.
p.append(kit.cylinder(0.36, 0.22, (X - 0.35, 0, 1.27), STEEL, verts=20))
p.append(kit.box((0.62, 0.45, 0.4), (X + 0.45, 0.05, 1.36), GLASS, bevel=0.02))
for k in range(3):
    p.append(blob((0.1, 0.1, 0.13), (X + 0.3 + k * 0.15, 0.05, 1.33), ('#ffb3d9', '#b3e0ff', '#ffb3d9')[k], 8))
for k, (dx, col) in enumerate(((-0.75, '#ffb3d9'), (-0.62, '#b3e0ff'))):
    p.append(kit.cylinder(0.012, 0.45, (X + dx, -0.35, 1.38), WHITE, verts=4))
    p.append(blob((0.12, 0.12, 0.15), (X + dx, -0.35, 1.68), col, 8))
# The umbrella.
p.append(kit.cylinder(0.03, 1.5, (X + 0.1, 0.25, 1.9), WHITE, verts=6))
umb = kit.cone(1.15, 0.05, 0.5, (X + 0.1, 0.25, 2.75), MINT, verts=16)
stripes(umb, MINT, WHITE, 16, centre=(X + 0.1, 0.25))
p.append(umb)
p += ring_of(16, 1.12, 2.46, lambda x, y, z, a, i: kit.cylinder(0.12, 0.02, (x, y, z), (MINT, WHITE)[i % 2], verts=8, rot=(math.pi / 2, 0, a + math.pi / 2)), centre=(X + 0.1, 0.25))
p.append(kit.sphere(0.07, (X + 0.1, 0.25, 3.03), HOTPINK, segments=8))
m.mesh(p)
# The bowl turns, spinning sugar into a pink cloud.
b = [kit.cylinder(0.33, 0.06, (X - 0.35, 0, 1.4), STEEL, verts=20)]
b.append(kit.torus(0.3, 0.06, (X - 0.35, 0, 1.46), STEEL, major_segments=20, minor_segments=4))
for k in range(6):
    a = k * math.pi / 3
    b.append(blob((0.13, 0.1, 0.07), (X - 0.35 + 0.18 * math.cos(a), 0.18 * math.sin(a), 1.47), '#ffc4e1', 6, rot=(0, 0, a)))
b.append(kit.cylinder(0.05, 0.12, (X - 0.35, 0, 1.47), STEEL, verts=8))
m.part('bowl', (X - 0.35, 0, 1.4), b)
# The seller's spot: where whoever serves stands (behind the cart).

# --- The park's arch: striped pillars, a sign board (the game writes STARLIGHT on it), a star turning on top. ---
X = 6.0
m = Model('pk_gate', X)
p = []
for sx in (-1, 1):
    px = X + sx * 5.0
    p.append(kit.cylinder(0.7, 0.4, (px, 0, 0.2), CREAM, verts=20, bevel=0.05))
    for k in range(7):
        p.append(kit.cylinder(0.5, 0.6, (px, 0, 0.7 + k * 0.6), (HOTPINK, WHITE)[k % 2], verts=20))
    p.append(kit.cylinder(0.62, 0.22, (px, 0, 4.7), GOLD, verts=20, bevel=0.04))
    p.append(kit.sphere(0.5, (px, 0, 5.2), GOLD, segments=14))
    p.append(kit.cylinder(0.02, 0.8, (px, 0, 5.95), NAVY, verts=6))
    p.append(kit.cone(0.3, 0.0, 0.5, (px + 0.26, 0, 6.15), (SKY, MINT)[sx > 0], verts=3, rot=(0, -math.pi / 2, 0)))
# The beam, curving up in the middle, with lamps along it.
for k in range(11):
    t = (k - 5) / 5
    bx = X + t * 4.6
    bz = 4.45 + 0.55 * (1 - t * t)
    p.append(kit.box((0.95, 0.6, 0.55), (bx, 0, bz), (HOTPINK, PINK)[k % 2], bevel=0.08))
    p.append(bulb(bx, -0.31, bz - 0.12, 0.07))
p.append(kit.box((7.4, 0.3, 1.25), (X, -0.12, 5.35), GOLD, bevel=0.12))
p.append(kit.box((7.1, 0.32, 1.0), (X, -0.13, 5.35), WHITE, bevel=0.1))
p += [bulb(X - 3.55 + k * 0.355, -0.3, 5.98, 0.055) for k in range(21)]
m.mesh(p)
m.part('star', (X, 0, 6.65), [star((X, 0, 6.65), 0.85, SUN, thick=0.24), kit.sphere(0.16, (X, -0.14, 6.65), GOLD, segments=8)])

# --- Two benches facing the camera, a bin between them, flower tubs at the ends. ---
X = 18.0
m = Model('pk_benches', X)
p = []
for i, sx in enumerate((-1.6, 1.6)):
    bx = X + sx
    for k in range(3):
        p.append(kit.box((1.6, 0.13, 0.05), (bx, -0.12 + k * 0.15, 0.47), WOOD, bevel=0.015))
    for k in range(3):
        p.append(kit.box((1.6, 0.05, 0.12), (bx, 0.24, 0.62 + k * 0.15), WOOD, bevel=0.015, rot=(-0.15, 0, 0)))
    for lx in (-0.68, 0.68):
        p.append(kit.box((0.06, 0.48, 0.06), (bx + lx, 0.03, 0.42), IRON, bevel=0.0))
        p.append(kit.box((0.06, 0.06, 0.45), (bx + lx, -0.17, 0.22), IRON, bevel=0.0))
        p.append(kit.box((0.06, 0.06, 0.95), (bx + lx, 0.22, 0.48), IRON, bevel=0.0, rot=(-0.15, 0, 0)))
        p.append(kit.box((0.07, 0.42, 0.05), (bx + lx, 0.0, 0.68), IRON, bevel=0.01))
    for k in range(2):
        m.marker(f'seat{i * 2 + k}', (bx - 0.4 + k * 0.8, -0.04, 0.47))
p.append(kit.cylinder(0.28, 0.75, (X, 0.05, 0.375), MINT, verts=14, bevel=0.03))
p.append(kit.cylinder(0.31, 0.08, (X, 0.05, 0.78), TEAL, verts=14, bevel=0.02))
for sx in (-1, 1):
    p.append(kit.cylinder(0.32, 0.45, (X + sx * 2.85, 0.05, 0.225), WOOD_DARK, verts=12, bevel=0.03))
    p.append(kit.cylinder(0.28, 0.06, (X + sx * 2.85, 0.05, 0.45), '#7a5236', verts=12))
    for k in range(6):
        a = k * math.pi / 3
        p.append(kit.sphere(0.1, (X + sx * 2.85 + 0.16 * math.cos(a), 0.05 + 0.16 * math.sin(a), 0.55), (HOTPINK, SUN, WHITE)[k % 3], segments=6))
    p.append(kit.sphere(0.14, (X + sx * 2.85, 0.05, 0.6), '#5fb84f', segments=8))
m.mesh(p)

# --- A ride's launch lever: a red-and-gold box, the lever on top (it swings forward to launch). ---
X = 26.0
m = Model('pk_lever', X)
p = [kit.box((0.7, 0.55, 0.08), (X, 0, 0.04), NAVY, bevel=0.02)]
p.append(kit.box((0.5, 0.36, 0.8), (X, 0, 0.48), '#ff5c6c', bevel=0.05))
p.append(kit.box((0.54, 0.4, 0.06), (X, 0, 0.9), GOLD, bevel=0.02))
p.append(kit.box((0.36, 0.02, 0.24), (X, -0.19, 0.6), WHITE, bevel=0.0))
p.append(kit.sphere(0.06, (X - 0.1, -0.2, 0.62), '#5fd16a', segments=6))
p.append(kit.sphere(0.06, (X + 0.1, -0.2, 0.62), SUN, segments=6))
p.append(kit.box((0.12, 0.2, 0.08), (X, 0, 0.97), STEEL, bevel=0.02))
m.mesh(p)
m.part('arm', (X, 0, 0.98), [rod((X, 0, 0.98), (X, 0, 1.55), 0.03, STEEL, verts=6), kit.sphere(0.08, (X, 0, 1.58), '#ff3b4a', segments=10)])

# --- A park lamp: a dark green post, a curl and a round glowing lamp. ---
X = 30.0
m = Model('pk_lamp', X)
p = [kit.cylinder(0.2, 0.3, (X, 0, 0.15), IRON, verts=10, bevel=0.04)]
p.append(kit.cylinder(0.07, 3.0, (X, 0, 1.75), IRON, verts=8))
p.append(kit.cylinder(0.12, 0.12, (X, 0, 3.2), GOLD_DARK, verts=10))
p.append(kit.sphere(0.25, (X, 0, 3.5), BULB, segments=12))
p.append(kit.cylinder(0.14, 0.1, (X, 0, 3.78), IRON, verts=10))
p.append(kit.torus(0.18, 0.025, (X, 0, 2.6), IRON, rot=(math.pi / 2, 0, 0), major_segments=12, minor_segments=4))
m.mesh(p)

# --- A queue rope: two brass posts and a red rope between them, 2 m along X. ---
X = 34.0
m = Model('pk_rope', X)
p = []
for sx in (-1, 1):
    p.append(kit.cylinder(0.14, 0.05, (X + sx, 0, 0.025), GOLD_DARK, verts=10))
    p.append(kit.cylinder(0.035, 0.85, (X + sx, 0, 0.45), GOLD, verts=8))
    p.append(kit.sphere(0.06, (X + sx, 0, 0.9), GOLD, segments=8))
for k in range(8):
    t = (k + 0.5) / 8
    p.append(kit.cylinder(0.025, 0.27, (X - 1 + 2 * t, 0, 0.8 - 0.18 * math.sin(math.pi * t)), '#d8323f', verts=5, rot=(0, math.pi / 2, 0)))
m.mesh(p)

# --- A round flower bed. ---
X = 38.0
m = Model('pk_flowers', X)
p = [kit.cylinder(1.0, 0.25, (X, 0, 0.125), CREAM, verts=20, bevel=0.04)]
p.append(kit.cylinder(0.9, 0.27, (X, 0, 0.13), '#7a5236', verts=20))
for k in range(16):
    a = k * 2 * math.pi / 16 + 0.2 * (k % 3)
    r = 0.3 + 0.45 * ((k * 7) % 5) / 4
    p.append(kit.sphere(0.12, (X + r * math.cos(a), r * math.sin(a), 0.34), (HOTPINK, SUN, WHITE, LILAC, CORAL)[k % 5], segments=6))
    p.append(kit.sphere(0.13, (X + r * 0.8 * math.cos(a + 0.3), r * 0.8 * math.sin(a + 0.3), 0.3), '#5fb84f', segments=6))
p.append(kit.sphere(0.25, (X, 0, 0.42), '#4fa84f', segments=8))
m.mesh(p)

# --- The bumper cars: an arena 9 x 6.5 m with padded rails, a frame overhead, six cars parked by the way in. ---
X = 50.0
m = Model('pk_bumper', X)
AW, AD = 9.0, 6.5
p = [kit.box((AW + 0.4, AD + 0.4, 0.12), (X, 0, 0.06), NAVY, bevel=0.03)]
floor = kit.box((AW, AD, 0.06), (X, 0, 0.15), '#7f8fa6', bevel=0.0)
p.append(floor)
for k in range(1, 9):
    p.append(kit.box((0.03, AD - 0.1, 0.005), (X - AW / 2 + k * AW / 9, 0, 0.183), '#94a3b8', bevel=0.0))
for k in range(1, 7):
    p.append(kit.box((AW - 0.1, 0.03, 0.005), (X, -AD / 2 + k * AD / 7, 0.183), '#94a3b8', bevel=0.0))
# Padded rails all round (a gap at the front middle, the way in), yellow with a red stripe.
GAP = 0.8
for (cx, cy, w, d) in [(X - (AW / 4 + GAP / 2), -AD / 2, AW / 2 - GAP, 0.32), (X + (AW / 4 + GAP / 2), -AD / 2, AW / 2 - GAP, 0.32),
                       (X, AD / 2, AW, 0.32), (X - AW / 2, 0, 0.32, AD), (X + AW / 2, 0, 0.32, AD)]:
    p.append(kit.box((w, d, 0.42), (cx, cy, 0.37), SUN, bevel=0.1, segments=2))
    p.append(kit.box((w + 0.02 if w > d else w + 0.01, d + 0.01 if w > d else d + 0.02, 0.08), (cx, cy, 0.42), '#ff5c6c', bevel=0.0))
# Corner posts, the frame and the grid the cars' poles run under, lamps along the front.
for sx in (-1, 1):
    for sy in (-1, 1):
        p.append(kit.cylinder(0.16, 3.6, (X + sx * AW / 2, sy * AD / 2, 1.95), HOTPINK, verts=12))
        p.append(kit.sphere(0.22, (X + sx * AW / 2, sy * AD / 2, 3.85), GOLD, segments=10))
for (cx, cy, w, d) in [(X, -AD / 2, AW, 0.3), (X, AD / 2, AW, 0.3), (X - AW / 2, 0, 0.3, AD), (X + AW / 2, 0, 0.3, AD)]:
    p.append(kit.box((w, d, 0.36), (cx, cy, 3.62), (HOTPINK if w > d else PINK), bevel=0.06))
for k in range(1, 6):
    p.append(kit.box((0.05, AD, 0.05), (X - AW / 2 + k * AW / 6, 0, 3.6), NAVY, bevel=0.0))
for k in range(1, 4):
    p.append(kit.box((AW, 0.05, 0.05), (X, -AD / 2 + k * AD / 4, 3.6), NAVY, bevel=0.0))
p += [bulb(X - AW / 2 + 0.3 + k * (AW - 0.6) / 16, -AD / 2 - 0.16, 3.62, 0.06) for k in range(17)]
# The sign board (the game writes on it).
# (On the back beam: from the camera's height a sign on the front one would hang over the cars.)
p.append(kit.box((4.4, 0.18, 0.95), (X, AD / 2 + 0.12, 4.25), GOLD, bevel=0.08))
p.append(kit.box((4.2, 0.2, 0.78), (X, AD / 2 + 0.11, 4.25), WHITE, bevel=0.06))
m.mesh(p)
CARS = (('#ff5c6c', WHITE), (SKY, SUN), (SUN, HOTPINK), (MINT, WHITE), (LILAC, SUN), ('#ff9a3c', WHITE))
PARK_AT = ((-3.3, -1.75), (-1.75, -1.75), (1.75, -1.75), (3.3, -1.75), (-1.0, 0.35), (1.0, 0.35))
for i, ((col, trim), (px, py)) in enumerate(zip(CARS, PARK_AT)):
    cx, cy = X + px, py
    c = [kit.box((1.42, 1.02, 0.24), (cx, cy, 0.34), '#2d3440', bevel=0.11, segments=2)]
    c.append(kit.box((1.26, 0.88, 0.36), (cx, cy, 0.56), col, bevel=0.16, segments=2))
    c.append(kit.box((1.28, 0.9, 0.05), (cx, cy, 0.62), trim, bevel=0.0))
    # A seat at the back, a dashboard and wheel at the front, lamps; a pole up to the grid.
    c.append(kit.box((0.5, 0.7, 0.42), (cx, cy + 0.26, 0.78), col, bevel=0.12))
    c.append(kit.box((0.5, 0.68, 0.08), (cx, cy - 0.02, 0.76), '#2d3440', bevel=0.02))
    c.append(kit.box((0.62, 0.22, 0.14), (cx, cy - 0.34, 0.8), trim, bevel=0.05))
    c.append(kit.torus(0.14, 0.025, (cx, cy - 0.2, 0.95), INK, rot=(0.9, 0, 0), major_segments=12, minor_segments=3))
    c.append(rod((cx, cy - 0.33, 0.82), (cx, cy - 0.2, 0.95), 0.02, INK, verts=4))
    for sx in (-1, 1):
        c.append(kit.sphere(0.06, (cx + sx * 0.38, cy - 0.47, 0.6), BULB, segments=6))
    c.append(kit.cylinder(0.025, 2.75, (cx, cy + 0.42, 2.2), STEEL, verts=6))
    c.append(kit.cylinder(0.08, 0.1, (cx, cy + 0.42, 3.55), GOLD, verts=8))
    c.append(star((cx, cy - 0.47, 0.42), 0.11, trim if trim != WHITE else SUN, thick=0.03))
    m.part(f'car{i}', (cx, cy, 0.18), c)
    m.marker(f'seat{i}', (cx, cy + 0.12, 0.78), on=f'car{i}')


def stall(x, w, d, wall, roof_a, roof_b):
    """A stall facing the camera: a counter at the front, walls round the back and the back half of the
    sides (a doorway each side for whoever serves), a striped canopy over the back only, a sign board on it."""
    q = [kit.box((w + 0.3, d + 0.2, 0.12), (x, 0.05, 0.06), '#efe3d0', bevel=0.03)]
    q.append(kit.box((w, 0.12, 2.5), (x, d / 2 - 0.06, 1.37), wall, bevel=0.0))
    for sx in (-1, 1):
        q.append(kit.box((0.12, d * 0.45, 2.5), (x + sx * (w / 2 - 0.06), d / 2 - d * 0.225, 1.37), wall, bevel=0.0))
        q.append(kit.box((0.16, 0.16, 2.7), (x + sx * (w / 2 - 0.06), -d / 2 + 0.25, 1.4), GOLD, bevel=0.04))
    q.append(kit.box((w - 0.3, 0.5, 1.0), (x, -d / 2 + 0.3, 0.55), WHITE, bevel=0.05))
    q.append(kit.box((w - 0.28, 0.04, 0.16), (x, -d / 2 + 0.04, 0.72), wall, bevel=0.0))
    q.append(kit.box((w - 0.1, 0.66, 0.07), (x, -d / 2 + 0.3, 1.08), WOOD, bevel=0.02))
    n = 8
    for k in range(n):
        q.append(kit.box((w / n + 0.01, d * 0.62, 0.1), (x - w / 2 + (k + 0.5) * w / n, d / 2 - d * 0.31, 2.78), (roof_a, roof_b)[k % 2], bevel=0.0, rot=(-0.12, 0, 0)))
    for k in range(n):
        q.append(kit.cylinder(w / n / 2, 0.04, (x - w / 2 + (k + 0.5) * w / n, d / 2 - d * 0.62, 2.7), (roof_a, roof_b)[k % 2], verts=12, rot=(math.pi / 2, 0, 0)))
        q.append(bulb(x - w / 2 + (k + 0.5) * w / n, d / 2 - d * 0.62 - 0.03, 2.86, 0.045))
    q.append(kit.box((w * 0.7, 0.12, 0.6), (x, d / 2 - d * 0.6, 3.3), GOLD, bevel=0.05))
    q.append(kit.box((w * 0.7 - 0.16, 0.13, 0.46), (x, d / 2 - d * 0.6, 3.3), WHITE, bevel=0.04))
    return q


# --- The ring-toss booth: bottles to ring on a table behind the counter, plush prizes on the back wall. ---
X = 62.0
m = Model('pk_ringtoss', X)
p = stall(X, 3.4, 2.2, SKY, SUN, WHITE)
p.append(kit.box((2.4, 0.5, 0.75), (X, 0.35, 0.45), WOOD_DARK, bevel=0.03))
for row in range(3):
    for k in range(4 - row):
        bx = X - 0.75 + row * 0.25 + k * 0.5
        p.append(kit.cylinder(0.07, 0.26, (bx, 0.35, 0.95 + row * 0.27), ('#7ee0c3', '#5bbcff', '#ffd24a')[row], verts=8))
        p.append(kit.cylinder(0.03, 0.1, (bx, 0.35, 1.13 + row * 0.27), WHITE, verts=6))
p.append(kit.box((3.0, 0.12, 0.06), (X, 1.0, 1.5), WOOD, bevel=0.0))
p.append(kit.box((3.0, 0.12, 0.06), (X, 1.0, 2.1), WOOD, bevel=0.0))
for row, z in enumerate((1.68, 2.28)):
    for k in range(5):
        px = X - 1.2 + k * 0.6
        col = (PINK, LILAC, '#c9a27a', MINT, SUN)[(k + row) % 5]
        p.append(kit.sphere(0.16, (px, 0.95, z), col, segments=8))
        p.append(kit.sphere(0.11, (px, 0.9, z + 0.2), col, segments=8))
        for e in (-1, 1):
            p.append(kit.sphere(0.045, (px + e * 0.08, 0.92, z + 0.3), col, segments=4))
for k in range(4):
    p.append(kit.torus(0.08, 0.02, (X + 1.0 + (k % 2) * 0.18, -0.85, 1.14 + k * 0.03), ('#ff5c6c', SUN, SKY, MINT)[k], major_segments=10, minor_segments=3))
m.mesh(p)

# --- The burger stand: a grill and a menu behind the counter, a giant burger turning on the roof. ---
X = 72.0
m = Model('pk_burger', X)
p = stall(X, 3.6, 2.4, '#ff6b6b', SUN, '#ff6b6b')
p.append(kit.box((1.6, 0.6, 0.85), (X - 0.6, 0.45, 0.5), STEEL, bevel=0.04))
p.append(kit.box((1.5, 0.5, 0.04), (X - 0.6, 0.45, 0.95), INK, bevel=0.0))
for k in range(4):
    p.append(kit.cylinder(0.13, 0.05, (X - 1.1 + k * 0.32, 0.45, 0.99), '#7a3f22', verts=10))
p.append(kit.box((1.2, 0.05, 0.75), (X + 0.9, 1.12, 1.75), INK, bevel=0.02))
for k in range(3):
    p.append(kit.box((0.9, 0.02, 0.06), (X + 0.9, 1.09, 1.95 - k * 0.2), WHITE, bevel=0.0))
for k in range(3):
    p.append(kit.cylinder(0.08, 0.2, (X + 0.9 + (k - 1) * 0.3, 0.35, 1.22), ('#ff5c6c', SUN, SKY)[k], verts=8))
m.mesh(p)
BZ = 3.55
b = [kit.cylinder(0.75, 0.24, (X, 0.0, BZ + 0.12), '#e0a25a', verts=20, bevel=0.08)]
b.append(kit.cylinder(0.8, 0.16, (X, 0.0, BZ + 0.32), '#7a3f22', verts=20, bevel=0.05))
b.append(kit.box((1.2, 1.2, 0.05), (X, 0.0, BZ + 0.42), SUN, bevel=0.0, rot=(0, 0, 0.4)))
b.append(kit.cylinder(0.84, 0.08, (X, 0.0, BZ + 0.48), '#6fd36a', verts=20))
b.append(blob((0.8, 0.8, 0.5), (X, 0.0, BZ + 0.56), '#f0b062', 16))
for k in range(9):
    a = k * 2 * math.pi / 9
    b.append(blob((0.05, 0.03, 0.025), (X + 0.45 * math.cos(a), 0.45 * math.sin(a), BZ + 0.98), '#fff6d8', 4, rot=(0, 0, a)))
m.part('burger', (X, 0.0, BZ), b)

# --- The supply shed: a wooden shed with a roller door on its east side, crates of sugar, buns and prizes. ---
X = 84.0
m = Model('pk_shed', X)
p = [kit.box((5.2, 4.2, 0.12), (X, 0, 0.06), '#cfd6de', bevel=0.03)]
for k in range(10):
    p.append(kit.box((0.5, 4.0, 2.6), (X - 2.25 + k * 0.5, 0, 1.4), WOOD if k % 2 else '#d59a62', bevel=0.0))
p.append(kit.box((0.06, 2.4, 2.1), (X + 2.52, 0.0, 1.17), '#5c4630', bevel=0.0))
for k in range(5):
    p.append(kit.box((0.04, 2.4, 0.05), (X + 2.56, 0.0, 2.15 - k * 0.12), STEEL, bevel=0.0))
p.append(kit.box((0.12, 2.6, 0.16), (X + 2.55, 0.0, 2.3), WHITE, bevel=0.02))
for sx in (-1, 1):
    p.append(kit.box((0.12, 0.12, 2.3), (X + 2.55, sx * 1.25, 1.15), WHITE, bevel=0.02))
roofp = kit.prism((5.6, 4.6, 1.3), (X, 0, 2.7), '#5b6f8f')
p.append(roofp)
p.append(kit.box((5.7, 0.18, 0.12), (X, 0, 4.0), WHITE, bevel=0.03))
p.append(kit.box((1.6, 0.06, 0.5), (X, -2.02, 2.1), WHITE, bevel=0.03))
p.append(star((X, -2.06, 2.1), 0.18, HOTPINK, thick=0.03))
# Crates inside the door and stacked outside: sugar (pink), buns (tan), prizes (blue with a ribbon).
for k, (dx, dy, dz, col) in enumerate(((1.7, -0.6, 0.0, '#ffb3d9'), (1.7, 0.2, 0.0, '#d9a866'), (1.7, 0.9, 0.0, SKY), (1.7, 0.2, 0.5, '#ffb3d9'))):
    p.append(kit.box((0.55, 0.55, 0.48), (X + dx, dy, 0.36 + dz), col, bevel=0.05))
for k, (dy, col) in enumerate(((-1.6, '#d9a866'), (-1.0, SKY), (1.5, '#ffb3d9'))):
    p.append(kit.box((0.6, 0.55, 0.5), (X + 3.0, dy, 0.37), col, bevel=0.05))
    p.append(kit.box((0.62, 0.08, 0.52), (X + 3.0, dy, 0.37), WHITE, bevel=0.0))
p.append(kit.box((0.6, 0.55, 0.5), (X + 3.0, -1.6, 0.87), '#ffb3d9', bevel=0.05))
p.append(kit.box((1.0, 0.8, 0.12), (X + 3.0, 0.2, 0.18), WOOD_DARK, bevel=0.02))
m.mesh(p)

# --- The delivery truck: a white box truck with the park's star, wheels that turn. ---
X = 96.0
m = Model('pk_truck', X)
p = [kit.box((2.2, 3.6, 2.3), (X, 0.7, 1.55), WHITE, bevel=0.12, segments=2)]
p.append(kit.box((2.22, 3.2, 0.36), (X, 0.7, 1.55), HOTPINK, bevel=0.0))
for sx in (-1, 1):
    p.append(star((X + sx * 1.13, 0.7, 2.2), 0.42, SUN, thick=0.04, rot=(math.pi / 2, 0, sx * math.pi / 2)))
p.append(kit.box((2.1, 1.5, 1.6), (X, -1.85, 1.2), SKY, bevel=0.22, segments=2))
p.append(kit.box((1.9, 0.08, 0.6), (X, -2.58, 1.55), GLASS, bevel=0.03, rot=(0.25, 0, 0)))
for sx in (-1, 1):
    p.append(kit.box((0.08, 0.8, 0.5), (X + sx * 1.06, -1.85, 1.55), GLASS, bevel=0.02))
    p.append(kit.sphere(0.12, (X + sx * 0.75, -2.6, 0.75), BULB, segments=6))
p.append(kit.box((2.2, 0.2, 0.3), (X, -2.62, 0.45), STEEL, bevel=0.05))
p.append(kit.box((2.3, 5.0, 0.3), (X, -0.2, 0.55), INK, bevel=0.05))
m.mesh(p)
for i, (wx, wy) in enumerate(((-1.0, -1.7), (1.0, -1.7), (-1.0, 1.6), (1.0, 1.6))):
    w = [kit.cylinder(0.45, 0.3, (X + wx, wy, 0.45), INK, verts=14, rot=(0, math.pi / 2, 0))]
    w.append(kit.cylinder(0.24, 0.32, (X + wx, wy, 0.45), STEEL, verts=10, rot=(0, math.pi / 2, 0)))
    m.part(f'wheel{i}', (X + wx, wy, 0.45), w)

# --- A litter bin: green, with a lid and a star. ---
X = 104.0
m = Model('pk_bin', X)
p = [kit.cylinder(0.3, 0.82, (X, 0, 0.41), MINT, verts=14, bevel=0.03)]
p.append(kit.cylinder(0.33, 0.1, (X, 0, 0.86), TEAL, verts=14, bevel=0.03))
p.append(kit.sphere(0.07, (X, 0, 0.95), TEAL, segments=6))
p.append(star((X, -0.3, 0.5), 0.12, WHITE, thick=0.02))
m.mesh(p)

toy = kit.toy_material('toy')
for obj in models:
    kit.use_material(obj, toy)
print('triangles', {b.name: kit.triangles([d for d in b.children_recursive if d.type == 'MESH']) for b in bases})
RIDES = {'pk_carousel': '-carousel', 'pk_teacups': '-teacups', 'pk_bumper': '-bumper'}
MIDWAY = {'pk_ringtoss', 'pk_burger', 'pk_shed', 'pk_truck', 'pk_bin'}
glb = Path(sys.argv[1] if len(sys.argv) > 1 else 'park.glb')
# Each ride in a file of its own (a Playables file may weigh 512 KiB at most), the stalls and props in the first.
for suffix, keep in (('', lambda n: n not in RIDES and n not in MIDWAY), ('-midway', lambda n: n in MIDWAY), *((f, lambda n, r=r: n == r) for r, f in RIDES.items())):
    chosen = [b for b in bases if keep(b.name)]
    kit.export(chosen + [d for b in chosen for d in b.children_recursive], str(glb.with_name(glb.stem + suffix + glb.suffix)))
if len(sys.argv) > 2:
    out = Path(sys.argv[2])
    for i, (cx, dist) in enumerate(((-40, 22), (-26, 16), (-14, 11), (-6, 7), (6, 20), (18, 11), (26, 6), (30, 8))):
        print(kit.preview(str(out.with_name(f'{out.stem}_{i}{out.suffix}')), look_at=(cx, 0, 1.6), distance=dist,
                          size=(1200, 800), ground='#8fd46a', angles=((0.0, -1, 0.95),)))
