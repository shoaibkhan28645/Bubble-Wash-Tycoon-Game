"""Every car in the game, all as separately named models (each with its
origin on the ground under its middle, the nose facing -Y, the camera; the
game drives them nose first). Each body follows a real car's cross-section
(flat sides with a waist crease, a rounded shoulder into the bonnet, square
ends with rounded corners), with wheel arches, a glasshouse with painted
pillars, big wheels, lamps set into the nose and tail, panel lines, door
handles and mirrors (see car_kit.py and car_make.py).

Parts in PAINT (magenta) are painted in the car's own colour by the game,
so one model comes in many real paint colours. The Car of the Day specials
(taxi, police car, ambulance, fire truck, ice-cream van) have their own
fixed colours (cars_special.py).

Writes the customers' cars in five files (cars-small, -family, -large, -big, -monster), and each
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
#: Each car's wheels, exported as their own meshes (<car>_wheel_<n>) so the game can turn them.
wheels = []


def finish(parts, name, x):
    # The mesh sits in a named empty at the car's base: quantizing moves and
    # scales the mesh's own node, so the game places the empty.
    rolling = [p for p in parts if p.get('wheel')]
    obj = ck.smooth(kit.join([p for p in parts if not p.get('wheel')], name + '_mesh'), angle=36)
    kit.set_origin(obj, (x, 0, 0))
    base = kit.bpy.data.objects.new(name, None)
    kit.bpy.context.scene.collection.objects.link(base)
    base.location = (x, 0, 0)
    obj.location = (0, 0, 0)
    obj.parent = base
    mine = []
    for i, w in enumerate(rolling):
        w.name = w.data.name = f'{name}_wheel_{i}'
        ck.smooth(w, angle=36)
        w.location = (w.location[0] - x, w.location[1], w.location[2])
        w.parent = base
        mine.append(w)
    models.append(obj)
    bases.append(base)
    wheels.append(mine)


SEDAN = dict(
    L=3.72, W=1.74, r=0.34, axles=(-1.2, 1.17), corner=(0.36, 0.3), rake=(0.12, 0.08),
    top=[(-1.86, 0.66), (-1.6, 0.74), (-1.0, 0.8), (-0.72, 0.84), (0.4, 0.88), (1.2, 0.9), (1.86, 0.86)],
    bottom=[(-1.86, 0.3), (-1.5, 0.24), (1.5, 0.24), (1.86, 0.32)],
    cabin=dict(y0=-0.74, y1=1.18, base=0.83, screen=-0.16, rear=0.8, b=(0.3,),
               roof=[(-0.74, 0.83), (-0.16, 1.32), (0.05, 1.36), (0.6, 1.36), (0.8, 1.31), (1.18, 0.9)]),
    head=0.66, tail=0.74, mirror=-0.55,
    doors=(-0.76, 0.3, 0.74), hood=-1.6, boot=1.65, fuel=1.05, strip=TRIM, sunroof=True,
)


def sedan(X, rule=None, **over):
    """The sedan, with any spec changes (`rule` paints parts of its body first)."""
    return cm.car(X, {**SEDAN, **over}, rule)


# ---- The customers' cars --------------------------------------------------

X = -24
finish(sedan(X), 'sedan', X)

X = -20
s = dict(
    L=3.36, W=1.66, r=0.33, axles=(-1.06, 1.06), corner=(0.34, 0.24), rake=(0.12, 0.05),
    top=[(-1.68, 0.64), (-1.4, 0.72), (-0.85, 0.8), (-0.62, 0.84), (1.2, 0.9), (1.68, 0.88)],
    bottom=[(-1.68, 0.3), (-1.35, 0.24), (1.35, 0.24), (1.68, 0.3)],
    cabin=dict(y0=-0.64, y1=1.6, base=0.83, screen=-0.08, rear=1.3, b=(0.5,),
               roof=[(-0.64, 0.83), (-0.08, 1.36), (0.15, 1.4), (1.25, 1.39), (1.45, 1.28), (1.6, 0.92)]),
    head=0.64, tail=0.78, mirror=-0.48,
    doors=(-0.68, 0.56), hood=-1.45, fuel=0.92, strip=TRIM,
)
p = cm.car(X, s)
p.append(ck.soft((1.1, 0.24, 0.05), (X, 1.48, 1.38), PAINT, rot=(0.15, 0, 0)))
finish(p, 'hatchback', X)

X = -16
s = dict(
    L=3.72, W=1.8, r=0.39, axles=(-1.18, 1.16), corner=(0.32, 0.26), rake=(0.1, 0.04), tyre=0.3, bumper=TRIM,
    top=[(-1.86, 0.86), (-1.6, 0.96), (-1.0, 1.02), (-0.66, 1.06), (1.4, 1.1), (1.86, 1.08)],
    bottom=[(-1.86, 0.44), (-1.5, 0.38), (1.5, 0.38), (1.86, 0.44)],
    cabin=dict(y0=-0.66, y1=1.82, base=1.04, screen=-0.12, rear=1.66, b=(0.42, 1.12),
               roof=[(-0.66, 1.04), (-0.12, 1.62), (0.1, 1.68), (1.6, 1.68), (1.76, 1.5), (1.82, 1.1)]),
    head=0.86, tail=0.96, mirror=-0.5,
    doors=(-0.74, 0.42, 0.7), hood=-1.6, fuel=1.3, flaps=True,
)
p = cm.car(X, s)
for sx in (-1, 1):
    p.append(ck.soft((0.05, 1.4, 0.05), (X + sx * 0.55, 0.75, 1.71), TRIM))
p.append(kit.cylinder(0.3, 0.16, (X, 1.95, 0.9), ck.TYRE, verts=20, rot=(math.pi / 2, 0, 0)))
p.append(kit.cylinder(0.17, 0.18, (X, 1.96, 0.9), ck.RIM, verts=14, rot=(math.pi / 2, 0, 0)))
finish(p, 'suv', X)

X = -12
s = dict(
    L=3.6, W=1.76, r=0.34, axles=(-1.18, 1.16), corner=(0.36, 0.24), rake=(0.16, 0.03),
    top=[(-1.8, 0.66), (-1.5, 0.8), (-1.2, 0.9), (-1.05, 0.94), (1.7, 1.0), (1.8, 0.98)],
    bottom=[(-1.8, 0.3), (-1.5, 0.25), (1.5, 0.25), (1.8, 0.3)],
    cabin=dict(y0=-1.08, y1=1.78, base=0.92, screen=-0.3, rear=1.62, b=(0.0, 0.85),
               roof=[(-1.08, 0.92), (-0.3, 1.68), (0.0, 1.74), (1.6, 1.74), (1.74, 1.5), (1.78, 1.0)]),
    head=0.68, tail=0.86, mirror=-0.95,
    doors=(-0.8, 0.0, 0.76), hood=-1.52, fuel=1.3, strip=TRIM,
)
finish(cm.car(X, s), 'minivan', X)

X = -8
s = dict(
    L=3.7, W=1.8, r=0.33, axles=(-1.2, 1.2), corner=(0.4, 0.32), rake=(0.2, 0.1), crown=0.02, tyre=0.3,
    top=[(-1.85, 0.5), (-1.5, 0.62), (-1.2, 0.7), (-0.7, 0.7), (-0.35, 0.72), (0.9, 0.78), (1.25, 0.8), (1.85, 0.74)],
    bottom=[(-1.85, 0.26), (-1.5, 0.18), (1.5, 0.18), (1.85, 0.26)],
    cabin=dict(y0=-0.36, y1=1.5, base=0.71, screen=0.25, rear=0.95, half=0.82, lean=0.8,
               roof=[(-0.36, 0.71), (0.25, 1.1), (0.55, 1.13), (0.95, 1.06), (1.5, 0.8)]),
    head=0.54, tail=0.66, mirror=-0.18, plates=False,
    doors=(-0.78, 0.6), hood=-1.66, boot=1.66, fuel=1.25,
)
p = cm.car(X, s)
for sx in (-1, 1):
    p.append(ck.soft((0.07, 0.1, 0.16), (X + sx * 0.6, 1.66, 0.88), TRIM))
p.append(ck.soft((1.4, 0.28, 0.05), (X, 1.7, 0.96), PAINT))
finish(p, 'sports', X)


PICKUP = dict(
    L=3.8, W=1.84, r=0.39, axles=(-1.22, 1.18), corner=(0.3, 0.2), rake=(0.1, 0.02), tyre=0.3,
    top=[(-1.9, 0.86), (-1.6, 0.98), (-0.9, 1.04), (-0.6, 1.08), (1.9, 1.1)],
    bottom=[(-1.9, 0.46), (-1.6, 0.4), (1.6, 0.4), (1.9, 0.46)],
    cabin=dict(y0=-0.6, y1=0.5, base=1.06, screen=-0.14, rear=0.38,
               roof=[(-0.6, 1.06), (-0.14, 1.64), (0.05, 1.68), (0.36, 1.68), (0.46, 1.52), (0.5, 1.1)]),
    head=0.88, tail=0.94, mirror=-0.5, grille=CHROME, bumper=TRIM,
    doors=(-0.8, 0.46), hood=-1.7, fuel=0.95, flaps=True, bed=True,
)


def pickup(X, s, up=0.0):
    """A pickup: the load bed is cut out of the body behind the cab."""
    p = cm.car(X, s)
    body = p[0]
    # The floor sits just above the rear wheel arch, which would cut a hole in it.
    bed = kit.box((s['W'] - 0.2, 1.2, 0.6), (X, 1.24, 1.17 + up), TRIM, bevel=0.0)
    mod = body.modifiers.new('bed', 'BOOLEAN')
    mod.operation, mod.solver, mod.object = 'DIFFERENCE', 'EXACT', bed
    kit.bpy.context.view_layer.objects.active = body
    kit.bpy.ops.object.modifier_apply(modifier=mod.name)
    kit.bpy.data.objects.remove(bed)
    floor = kit.colour(TRIM)
    attr = body.data.color_attributes['Col']
    for poly in body.data.polygons:
        c = poly.center
        if 0.62 < c.y < 1.86 and abs(c.x - X) < s['W'] / 2 - 0.08 and poly.normal.z > 0.7 and c.z < 1.0 + up:
            for li in poly.loop_indices:
                attr.data[li].color = floor
    return p


X = -4
finish(pickup(X, PICKUP), 'pickup', X)

X = 0.5
# Monster truck: a pickup high on giant tyres, with springs and a bar of lights.
UP = 0.72
R = 0.72
m = {**PICKUP, 'arches': False, 'wheels': False, 'flaps': False}
m['top'] = [(y, z + UP) for y, z in PICKUP['top']]
m['bottom'] = [(y, z + UP) for y, z in PICKUP['bottom']]
m['cabin'] = {**PICKUP['cabin'], 'base': 1.06 + UP, 'roof': [(y, z + UP) for y, z in PICKUP['cabin']['roof']]}
m.update(head=0.88 + UP, tail=0.94 + UP, axles=(-1.3, 1.3))
p = pickup(X, m, UP)
for y in (-1.3, 1.3):
    for sx in (-1, 1):
        p.append(ck.wheel((X + sx * 1.0, y, R), R, 0.55, sx, spokes=6, lugs=10))
        p.append(ck.soft((0.12, 0.12, 0.5), (X + sx * 0.6, y, 1.05), '#ffd24a'))
    p.append(kit.cylinder(0.08, 2.0, (X, y, R), TRIM, verts=10, rot=(0, math.pi / 2, 0)))
p.append(ck.soft((1.5, 0.08, 0.08), (X, 0.3, 2.46), TRIM))
for dx in (-0.45, -0.15, 0.15, 0.45):
    p.append(ck.soft((0.18, 0.1, 0.12), (X + dx, 0.26, 2.54), ck.LIGHT))
finish(p, 'monster', X)

X = 5
# The golden VIP: a big luxury SUV with a chrome grille and trim (painted gold by the game).
s = dict(
    L=3.8, W=1.82, r=0.4, axles=(-1.2, 1.18), corner=(0.3, 0.26), rake=(0.1, 0.04), tyre=0.3,
    rim=CHROME, dish='#c4ccd6', grille=CHROME, seal=CHROME,
    top=[(-1.9, 0.9), (-1.6, 1.0), (-0.95, 1.08), (-0.62, 1.12), (1.5, 1.14), (1.9, 1.1)],
    bottom=[(-1.9, 0.46), (-1.55, 0.4), (1.55, 0.4), (1.9, 0.46)],
    cabin=dict(y0=-0.62, y1=1.86, base=1.1, screen=-0.12, rear=1.66, b=(0.45, 1.14),
               roof=[(-0.62, 1.1), (-0.12, 1.68), (0.1, 1.74), (1.6, 1.74), (1.78, 1.5), (1.86, 1.14)]),
    head=0.9, tail=1.0, mirror=-0.48,
    doors=(-0.76, 0.45, 0.74), hood=-1.64, fuel=1.3, strip=CHROME, sunroof=True,
)
p = cm.car(X, s)
for sx in (-1, 1):
    p.append(ck.soft((0.05, 1.4, 0.05), (X + sx * 0.55, 0.8, 1.77), CHROME))
finish(p, 'luxury', X)

# ---- Car of the Day specials, in their own colours --------------------------

import cars_special  # noqa: E402

cars_special.build(sedan, finish, X=9.5)

toy = kit.toy_material('toy')
for obj in models + [w for ws in wheels for w in ws]:
    kit.use_material(obj, toy)
print('triangles', {o.name: kit.triangles([o]) for o in models})
print('sizes', {b.name: [round(v, 2) for v in m.dimensions] for b, m in zip(bases, models)})
# Several files, so each stays small (the game finds a car by name in any of them).
FILES = {
    'cars-small.glb': ('hatchback', 'sedan'),
    'cars-family.glb': ('minivan', 'sports'),
    'cars-large.glb': ('suv', 'pickup'),
    'cars-big.glb': ('luxury',),
    'cars-monster.glb': ('monster',),
    **{f'special-{name}.glb': (name,) for name in ('taxi', 'police', 'ambulance', 'firetruck', 'icecream')},
}
out = Path(sys.argv[1] if len(sys.argv) > 1 else '.')
for file, names in FILES.items():
    pick = [i for i, b in enumerate(bases) if b.name in names]
    kit.export([models[i] for i in pick] + [w for i in pick for w in wheels[i]] + [bases[i] for i in pick], str(out / file))

# For the preview only: paint each car a real colour, as the game will.
PREVIEW_PAINT = {'sedan': '#c9ced6', 'hatchback': '#e23a3a', 'suv': '#24395c', 'minivan': '#f2f4f7', 'sports': '#ff7a1a', 'pickup': '#2f6b3f', 'monster': '#1f8fe0', 'luxury': '#ffcf3a'}
for base, obj in zip(bases, models):
    cm.paint_preview(obj, PREVIEW_PAINT.get(base.name, '#c9ced6'))
print('wheels', {b.name: len(ws) for b, ws in zip(bases, wheels)})
if len(sys.argv) > 2:
    # Lined up in a grid for the picture, five to a row.
    for i, base in enumerate(bases):
        base.location = ((i % 5 - 2) * 3.3, (i // 5) * 5.2, 0)
    print(kit.preview(sys.argv[2], look_at=(0, 4.6, 0.6), distance=20, size=(1600, 1000), angles=((0.3, -1, 0.95),)))
