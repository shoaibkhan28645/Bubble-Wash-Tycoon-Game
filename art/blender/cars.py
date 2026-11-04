"""Every car in the game, all as separately named models (each with its
origin on the ground under its middle, the nose facing -Y, the camera; the
game drives them nose first). Smooth, rounded toy cars: lofted bodies with
wheel arches, glasshouses with painted pillars, round tyres with spoked
rims, soft lights and bumpers (see car_kit.py and car_make.py).

Parts in PAINT (magenta) are painted in the car's own colour by the game,
so one model comes in many real paint colours. The Car of the Day specials
(taxi, police car, ambulance, fire truck, ice-cream van) have their own
fixed colours (cars_special.py).

Writes the customers' cars in cars-small.glb and cars-large.glb, and each
special in its own special-<name>.glb (only the day's one is loaded).

Usage: python art/blender/cars.py <out-dir> [preview.png]
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import kit  # noqa: E402
import car_kit as ck  # noqa: E402
import car_make as cm  # noqa: E402
from car_kit import CHROME, PAINT, TRIM  # noqa: E402

kit.reset()
models = []
bases = []


def finish(parts, name, x):
    # The mesh sits in a named empty at the car's base: quantizing moves and
    # scales the mesh's own node, so the game places the empty.
    obj = ck.smooth(kit.join(parts, name + '_mesh'))
    kit.set_origin(obj, (x, 0, 0))
    base = kit.bpy.data.objects.new(name, None)
    kit.bpy.context.scene.collection.objects.link(base)
    base.location = (x, 0, 0)
    obj.location = (0, 0, 0)
    obj.parent = base
    models.append(obj)
    bases.append(base)


SEDAN = dict(
    L=3.6, W=1.72, r=0.32, axles=(-1.12, 1.1),
    top=[(-1.8, 0.6), (-1.55, 0.72), (-0.9, 0.8), (-0.6, 0.84), (1.0, 0.88), (1.5, 0.86), (1.8, 0.74)],
    bottom=[(-1.8, 0.34), (-1.45, 0.26), (1.45, 0.26), (1.8, 0.36)],
    cabin=dict(y0=-0.7, y1=1.12, base=0.8, screen=-0.18, rear=0.82, b=(0.3,),
               roof=[(-0.7, 0.8), (-0.18, 1.3), (0.05, 1.35), (0.6, 1.35), (0.85, 1.28), (1.12, 0.84)]),
    head=0.6, tail=0.68, bumpers=(0.36, 0.38), mirror=(-0.6, 0.86),
)


def sedan(X, rule=None, **over):
    """The sedan, with any spec changes (`rule` paints parts of its body first)."""
    return cm.car(X, {**SEDAN, **over}, rule)


# ---- The customers' cars --------------------------------------------------

X = -24
finish(sedan(X), 'sedan', X)

X = -20
s = dict(
    L=3.3, W=1.64, r=0.31, axles=(-1.0, 1.02),
    top=[(-1.65, 0.58), (-1.4, 0.7), (-0.8, 0.8), (-0.5, 0.84), (1.3, 0.88), (1.65, 0.84)],
    bottom=[(-1.65, 0.32), (-1.35, 0.24), (1.35, 0.24), (1.65, 0.34)],
    cabin=dict(y0=-0.62, y1=1.62, base=0.82, screen=-0.1, rear=1.32, b=(0.5,),
               roof=[(-0.62, 0.82), (-0.1, 1.36), (0.15, 1.41), (1.2, 1.4), (1.45, 1.3), (1.62, 0.9)]),
    head=0.58, tail=0.72, bumpers=(0.34, 0.36), mirror=(-0.52, 0.86),
)
p = cm.car(X, s)
p.append(ck.soft((1.08, 0.26, 0.05), (X, 1.5, 1.37), PAINT, rot=(0.15, 0, 0)))
finish(p, 'hatchback', X)

X = -16
s = dict(
    L=3.62, W=1.8, r=0.38, axles=(-1.12, 1.12), tyre=0.3,
    top=[(-1.81, 0.78), (-1.55, 0.92), (-0.9, 1.0), (-0.6, 1.04), (1.6, 1.06), (1.81, 1.0)],
    bottom=[(-1.81, 0.46), (-1.5, 0.38), (1.5, 0.38), (1.81, 0.46)],
    cabin=dict(y0=-0.62, y1=1.74, base=1.0, screen=-0.15, rear=1.6, b=(0.42, 1.1),
               roof=[(-0.62, 1.0), (-0.15, 1.6), (0.1, 1.66), (1.55, 1.66), (1.7, 1.4), (1.74, 1.06)]),
    head=0.82, tail=0.86, bumpers=(0.46, 0.48), mirror=(-0.52, 1.06),
)
p = cm.car(X, s)
for sx in (-1, 1):
    p.append(ck.soft((0.05, 1.3, 0.05), (X + sx * 0.52, 0.75, 1.65), TRIM))
p.append(kit.cylinder(0.3, 0.16, (X, 1.9, 0.86), ck.TYRE, verts=20, rot=(math.pi / 2, 0, 0)))
p.append(kit.cylinder(0.17, 0.18, (X, 1.91, 0.86), ck.RIM, verts=14, rot=(math.pi / 2, 0, 0)))
finish(p, 'suv', X)

X = -12
s = dict(
    L=3.56, W=1.76, r=0.32, axles=(-1.15, 1.15),
    top=[(-1.78, 0.62), (-1.5, 0.8), (-1.2, 0.93), (1.7, 1.0), (1.78, 0.96)],
    bottom=[(-1.78, 0.32), (-1.5, 0.26), (1.5, 0.26), (1.78, 0.32)],
    cabin=dict(y0=-1.12, y1=1.74, base=0.92, screen=-0.36, rear=1.6, b=(0.0, 0.85),
               roof=[(-1.12, 0.92), (-0.36, 1.66), (0.0, 1.72), (1.55, 1.72), (1.7, 1.45), (1.74, 1.0)]),
    head=0.64, tail=0.78, bumpers=(0.36, 0.38), mirror=(-0.98, 0.98),
)
finish(cm.car(X, s), 'minivan', X)

X = -8
s = dict(
    L=3.66, W=1.8, r=0.31, axles=(-1.15, 1.18), tyre=0.32, end=0.3,
    top=[(-1.83, 0.5), (-1.55, 0.66), (-1.15, 0.73), (-0.7, 0.7), (-0.25, 0.72), (0.8, 0.76), (1.18, 0.8), (1.83, 0.72)],
    bottom=[(-1.83, 0.26), (-1.5, 0.18), (1.5, 0.18), (1.83, 0.28)],
    cabin=dict(y0=-0.32, y1=1.45, base=0.7, screen=0.3, rear=0.95, half=0.8, lean=0.78,
               roof=[(-0.32, 0.7), (0.3, 1.1), (0.6, 1.13), (0.95, 1.05), (1.45, 0.78)]),
    head=0.5, tail=0.6, bumpers=(0.26, 0.3), mirror=(-0.12, 0.76), plates=False,
)
p = cm.car(X, s)
for sx in (-1, 1):
    p.append(ck.soft((0.07, 0.1, 0.16), (X + sx * 0.6, 1.62, 0.86), TRIM))
p.append(ck.soft((1.4, 0.28, 0.05), (X, 1.66, 0.95), PAINT))
for dx in (-0.28, 0.28):
    p.append(kit.cylinder(0.065, 0.14, (X + dx, 1.86, 0.27), CHROME, verts=12, rot=(math.pi / 2, 0, 0)))
finish(p, 'sports', X)


PICKUP = dict(
    L=3.76, W=1.82, r=0.38, axles=(-1.2, 1.15), tyre=0.3,
    top=[(-1.88, 0.8), (-1.6, 0.95), (-0.75, 1.04), (-0.5, 1.06), (1.88, 1.07)],
    bottom=[(-1.88, 0.44), (-1.6, 0.38), (1.6, 0.38), (1.88, 0.44)],
    cabin=dict(y0=-0.55, y1=0.5, base=1.02, screen=-0.12, rear=0.36,
               roof=[(-0.55, 1.04), (-0.12, 1.62), (0.05, 1.66), (0.34, 1.66), (0.46, 1.5), (0.5, 1.06)]),
    head=0.84, tail=0.86, bumpers=(0.46, 0.48), mirror=(-0.45, 1.08), grille=CHROME,
)


def pickup(X, s):
    """A pickup: the load bed is cut out of the body behind the cab."""
    p = cm.car(X, s)
    up = s['bottom'][1][1] - 0.38
    body = p[0]
    bed = kit.box((s['W'] - 0.2, 1.2, 0.6), (X, 1.22, 1.07 + 0.25 + up - 0.0), TRIM, bevel=0.0)
    mod = body.modifiers.new('bed', 'BOOLEAN')
    mod.operation, mod.solver, mod.object = 'DIFFERENCE', 'EXACT', bed
    kit.bpy.context.view_layer.objects.active = body
    kit.bpy.ops.object.modifier_apply(modifier=mod.name)
    kit.bpy.data.objects.remove(bed)
    floor = kit.colour(TRIM)
    attr = body.data.color_attributes['Col']
    for poly in body.data.polygons:
        c = poly.center
        if 0.6 < c.y < 1.84 and abs(c.x - X) < s['W'] / 2 - 0.08 and poly.normal.z > 0.7 and c.z < 1.0 + up:
            for li in poly.loop_indices:
                attr.data[li].color = floor
    return p


X = -4
finish(pickup(X, PICKUP), 'pickup', X)

X = 0.5
# Monster truck: a pickup high on giant tyres, with springs and a bar of lights.
UP = 0.72
R = 0.72
m = {**PICKUP, 'arches': False, 'wheels': False}
m['top'] = [(y, z + UP) for y, z in PICKUP['top']]
m['bottom'] = [(y, z + UP) for y, z in PICKUP['bottom']]
m['cabin'] = {**PICKUP['cabin'], 'base': 1.02 + UP, 'roof': [(y, z + UP) for y, z in PICKUP['cabin']['roof']]}
m.update(head=0.84 + UP, tail=0.86 + UP, bumpers=(0.46 + UP, 0.48 + UP), mirror=(-0.45, 1.08 + UP), axles=(-1.3, 1.3))
p = pickup(X, m)
for y in (-1.3, 1.3):
    for sx in (-1, 1):
        p.append(ck.wheel((X + sx * 1.0, y, R), R, 0.55, sx, spokes=6))
        p.append(ck.soft((0.12, 0.12, 0.5), (X + sx * 0.6, y, 1.05), '#ffd24a'))
    p.append(kit.cylinder(0.08, 2.0, (X, y, R), TRIM, verts=10, rot=(0, math.pi / 2, 0)))
p += cm.tread(X, m, R, 0.55)
p.append(ck.soft((1.5, 0.08, 0.08), (X, 0.3, 2.42), TRIM))
for dx in (-0.45, -0.15, 0.15, 0.45):
    p.append(ck.soft((0.18, 0.1, 0.12), (X + dx, 0.26, 2.5), ck.LIGHT))
finish(p, 'monster', X)

X = 5
# The golden VIP: a big luxury SUV with a chrome grille and trim (painted gold by the game).
s = dict(
    L=3.72, W=1.8, r=0.39, axles=(-1.16, 1.16), tyre=0.3, rim=CHROME, dish='#c4ccd6',
    top=[(-1.86, 0.84), (-1.6, 0.98), (-0.85, 1.06), (-0.58, 1.1), (1.7, 1.12), (1.86, 1.04)],
    bottom=[(-1.86, 0.44), (-1.55, 0.38), (1.55, 0.38), (1.86, 0.44)],
    cabin=dict(y0=-0.6, y1=1.8, base=1.06, screen=-0.15, rear=1.62, b=(0.45, 1.12),
               roof=[(-0.6, 1.06), (-0.15, 1.66), (0.1, 1.71), (1.55, 1.71), (1.72, 1.45), (1.8, 1.12)]),
    head=0.88, tail=0.9, bumpers=(0.46, 0.48), mirror=(-0.5, 1.12), grille=CHROME, bumper=PAINT,
)
p = cm.car(X, s)
p.append(ck.soft((0.8, 0.08, 0.36), (X, -1.86, 0.74), CHROME))
for sx in (-1, 1):
    p.append(ck.soft((0.05, 1.3, 0.05), (X + sx * 0.52, 0.8, 1.7), CHROME))
finish(p, 'luxury', X)

# ---- Car of the Day specials, in their own colours --------------------------

import cars_special  # noqa: E402

cars_special.build(sedan, finish, X=9.5)

toy = kit.toy_material('toy')
for obj in models:
    kit.use_material(obj, toy)
print('triangles', {o.name: kit.triangles([o]) for o in models})
print('sizes', {b.name: [round(v, 2) for v in m.dimensions] for b, m in zip(bases, models)})
# Several files, so each stays small (the game finds a car by name in any of them).
FILES = {
    'cars-small.glb': ('hatchback', 'sedan', 'minivan', 'sports'),
    'cars-large.glb': ('suv', 'pickup', 'monster', 'luxury'),
    **{f'special-{name}.glb': (name,) for name in ('taxi', 'police', 'ambulance', 'firetruck', 'icecream')},
}
out = Path(sys.argv[1] if len(sys.argv) > 1 else '.')
for file, names in FILES.items():
    pick = [i for i, b in enumerate(bases) if b.name in names]
    kit.export([models[i] for i in pick] + [bases[i] for i in pick], str(out / file))

# For the preview only: paint each car a real colour, as the game will.
PREVIEW_PAINT = {'sedan': '#c9ced6', 'hatchback': '#e23a3a', 'suv': '#24395c', 'minivan': '#f2f4f7', 'sports': '#ff7a1a', 'pickup': '#2f6b3f', 'monster': '#1f8fe0', 'luxury': '#ffcf3a'}
for base, obj in zip(bases, models):
    cm.paint_preview(obj, PREVIEW_PAINT.get(base.name, '#c9ced6'))
if len(sys.argv) > 2:
    # Lined up in a grid for the picture, five to a row.
    for i, base in enumerate(bases):
        base.location = ((i % 5 - 2) * 3.3, (i // 5) * 5.2, 0)
    print(kit.preview(sys.argv[2], look_at=(0, 4.6, 0.6), distance=20, size=(1600, 1000), angles=((0.3, -1, 0.95),)))
