"""Every car in the game, all in one file as separately named models (each
with its origin on the ground under its middle, the front facing -Y, the
camera; the game drives them nose first). Bodies are side profiles pushed
out to the car's width, with tinted glass, body-coloured pillars and roof,
wheels with tyres, rims and arches, lights, grille, bumpers, mirrors and
door lines.

Parts in PAINT (magenta) are painted in the car's own colour by the game,
so one model comes in many real paint colours. The Car of the Day specials
(taxi, police car, ambulance, fire truck, ice-cream van) have their own
fixed colours.

Writes cars-small.glb and cars-large.glb (the customers' cars) and
cars-special.glb (the Car of the Day specials).

Usage: python art/blender/cars.py <out-dir> [preview.png]
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import kit  # noqa: E402

kit.reset()
models = []
bases = []

PAINT = '#ff00ff'
GLASS = '#26323f'
GLASS_HI = '#6e879d'
GLARE = '#3c4d5e'
TYRE = '#24272d'
RIM = '#cdd3da'
SPOKE = '#98a2ad'
TRIM = '#2b3038'
CHROME = '#e8edf2'
LIGHT = '#fff3cc'
TAIL = '#e3333e'
AMBER = '#ffa630'
PLATE = '#f2f4f7'
ARCH = '#15181d'


def finish(parts, name, x):
    # The mesh sits in a named empty at the car's base: quantizing moves and
    # scales the mesh's own node, so the game places the empty.
    obj = kit.join(parts, name + '_mesh')
    kit.set_origin(obj, (x, 0, 0))
    base = kit.bpy.data.objects.new(name, None)
    kit.bpy.context.scene.collection.objects.link(base)
    base.location = (x, 0, 0)
    obj.location = (0, 0, 0)
    obj.parent = base
    models.append(obj)
    bases.append(base)


def wheels(p, x, axles, half, r, width=0.26, rim=RIM, arches=True, out=0.06):
    """Four wheels: tyre, rim with five spokes and a hub, and a dark arch on the body behind each."""
    for y in axles:
        for sx in (-1, 1):
            wx = x + sx * (half - width / 2 + out)
            p.append(kit.cylinder(r, width, (wx, y, r), TYRE, verts=12, rot=(0, math.pi / 2, 0)))
            # Rim: a bright outer ring round a darker dished centre, and the hub.
            p.append(kit.cylinder(r * 0.62, width + 0.02, (wx, y, r), rim, verts=12, rot=(0, math.pi / 2, 0)))
            p.append(kit.cylinder(r * 0.46, width + 0.03, (wx, y, r), SPOKE, verts=10, rot=(0, math.pi / 2, 0)))
            if arches:
                p.append(kit.cylinder(r + 0.07, 0.012, (x + sx * (half + 0.004), y, r), ARCH, verts=10, rot=(0, math.pi / 2, 0)))


def glasshouse(p, x, w, base_f, roof_f, roof_r, base_r, body=PAINT, b_pillars=(), roof_t=0.07):
    """Tinted glass from the windscreen over the roof to the rear window, with
    body-coloured A, B and C pillars and roof, and a light streak on the screen."""
    (yf, zf), (yrf, zr), (yrr, zrr), (yr, zb) = base_f, roof_f, roof_r, base_r
    p.append(kit.profile([base_f, roof_f, roof_r, base_r], w * 0.86, x, GLASS, bevel=0.05, segments=1))
    # Roof panel.
    p.append(kit.profile([(yrf - 0.04, zr - roof_t), (yrf + 0.02, zr + 0.015), (yrr - 0.02, zrr + 0.015), (yrr + 0.04, zrr - roof_t)], w * 0.9, x, body, bevel=0.03, segments=2))
    for sx in (-1, 1):
        px = x + sx * w * 0.43
        # A pillar along the windscreen edge, C pillar along the rear window edge.
        p.append(kit.profile([(yf, zf), (yrf, zr), (yrf + 0.12, zr), (yf + 0.16, zf)], 0.07, px, body))
        p.append(kit.profile([(yrr - 0.14, zrr), (yrr, zrr), (yr, zb), (yr - 0.2, zb)], 0.07, px, body))
        for by in b_pillars:
            p.append(kit.box((0.07, 0.11, zr - zf), (px, by, (zr + zf) / 2), body, bevel=0.0))
    # A streak of sky on the windscreen.
    mid = ((yf + yrf) / 2, (zf + zr) / 2)
    p.append(kit.box((w * 0.3, 0.03, 0.12), (x - w * 0.18, mid[0] - 0.035, mid[1]), GLARE, bevel=0.0, rot=(math.atan2(zr - zf, yrf - yf) - math.pi / 2, 0, 0.6)))


def front_and_back(p, x, L, w, z_lamp, z_bumper, grille=TRIM, bumper=TRIM, plate=True):
    """Headlights, indicators, grille, bumper and plate at the front; tail lights, bumper and plate at the back."""
    f, r = -L / 2, L / 2
    for sx in (-1, 1):
        p.append(kit.box((0.34, 0.06, 0.13), (x + sx * (w / 2 - 0.27), f + 0.01, z_lamp), LIGHT, bevel=0.0))
        p.append(kit.box((0.1, 0.06, 0.08), (x + sx * (w / 2 - 0.08), f + 0.03, z_lamp - 0.01), AMBER, bevel=0.0))
        p.append(kit.box((0.3, 0.06, 0.12), (x + sx * (w / 2 - 0.22), r - 0.01, z_lamp + 0.02), TAIL, bevel=0.0))
    p.append(kit.box((w * 0.42, 0.06, 0.15), (x, f + 0.005, z_lamp - 0.02), grille, bevel=0.0))
    for i in range(3):
        p.append(kit.box((w * 0.38, 0.065, 0.018), (x, f - 0.01, z_lamp - 0.07 + i * 0.05), CHROME if grille != TRIM else '#3a414b', bevel=0.0))
    p.append(kit.box((w * 0.98, 0.16, 0.13), (x, f + 0.05, z_bumper), bumper, bevel=0.05))
    p.append(kit.box((w * 0.98, 0.16, 0.13), (x, r - 0.05, z_bumper), bumper, bevel=0.05))
    if plate:
        p.append(kit.box((0.36, 0.04, 0.11), (x, f - 0.04, z_bumper + 0.02), PLATE, bevel=0.0))
        p.append(kit.box((0.36, 0.04, 0.11), (x, r + 0.04, z_bumper + 0.1), PLATE, bevel=0.0))


def sides(p, x, w, doors, z_low, z_belt, handles=True, mirror_y=None, mirror_z=None, body=PAINT):
    """Door seams and handles on both sides, and the wing mirrors."""
    for sx in (-1, 1):
        sxp = x + sx * (w / 2 + 0.004)
        for y in doors:
            p.append(kit.box((0.012, 0.02, z_belt - z_low - 0.06), (sxp, y, (z_belt + z_low) / 2), TRIM, bevel=0.0))
            if handles:
                p.append(kit.box((0.03, 0.14, 0.03), (x + sx * (w / 2 + 0.012), y - 0.22, z_belt - 0.1), CHROME, bevel=0.0))
        if mirror_y is not None:
            p.append(kit.box((0.16, 0.08, 0.1), (x + sx * (w / 2 + 0.07), mirror_y, mirror_z), body, bevel=0.0))
            p.append(kit.box((0.02, 0.07, 0.08), (x + sx * (w / 2 + 0.15), mirror_y + 0.01, mirror_z), GLASS_HI, bevel=0.0))


def side_skirt(p, x, w, y0, y1, z, col=TRIM):
    for sx in (-1, 1):
        p.append(kit.box((0.03, y1 - y0, 0.08), (x + sx * (w / 2 + 0.006), (y0 + y1) / 2, z), col, bevel=0.0))


# ---- The customers' cars --------------------------------------------------

def sedan_body(X, body=PAINT, W=1.72, L=3.6):
    p = [kit.profile([(-1.8, 0.3), (-1.8, 0.55), (-1.72, 0.68), (-1.0, 0.8), (-0.55, 0.86), (1.0, 0.88), (1.55, 0.86), (1.8, 0.78), (1.8, 0.32), (1.65, 0.24), (-1.65, 0.24)], W, X, body, bevel=0.1, segments=2)]
    glasshouse(p, X, W, (-0.55, 0.86), (0.05, 1.34), (0.75, 1.33), (1.12, 0.88), body=body, b_pillars=(0.38,))
    wheels(p, X, (-1.12, 1.1), W / 2, 0.33)
    front_and_back(p, X, L, W, 0.62, 0.36)
    sides(p, X, W, (-0.5, 0.38, 1.1), 0.3, 0.86, mirror_y=-0.45, mirror_z=0.92, body=body)
    side_skirt(p, X, W, -0.75, 0.75, 0.3)
    return p


X = -24
finish(sedan_body(X), 'sedan', X)

X = -20
p = [kit.profile([(-1.65, 0.28), (-1.65, 0.52), (-1.58, 0.64), (-0.95, 0.78), (-0.45, 0.84), (1.35, 0.88), (1.62, 0.86), (1.66, 0.5), (1.62, 0.28), (1.5, 0.22), (-1.5, 0.22)], 1.62, X, PAINT, bevel=0.1, segments=2)]
glasshouse(p, X, 1.62, (-0.45, 0.84), (0.05, 1.4), (1.22, 1.38), (1.55, 0.88), b_pillars=(0.45,))
wheels(p, X, (-1.0, 1.02), 0.81, 0.31)
front_and_back(p, X, 3.3, 1.62, 0.6, 0.34)
p.append(kit.box((1.0, 0.05, 0.22), (X, 1.63, 1.12), GLASS, bevel=0.02))
sides(p, X, 1.62, (-0.4, 0.5), 0.28, 0.84, mirror_y=-0.36, mirror_z=0.9)
p.append(kit.box((1.3, 0.28, 0.05), (X, 1.2, 1.4), PAINT, bevel=0.02, rot=(0.15, 0, 0)))
finish(p, 'hatchback', X)

X = -16
p = [kit.profile([(-1.8, 0.38), (-1.8, 0.78), (-1.7, 0.92), (-0.85, 1.0), (-0.6, 1.04), (1.65, 1.06), (1.8, 1.0), (1.8, 0.38), (1.7, 0.32), (-1.7, 0.32)], 1.78, X, PAINT, bevel=0.12, segments=2)]
glasshouse(p, X, 1.78, (-0.6, 1.04), (-0.18, 1.64), (1.6, 1.64), (1.76, 1.06), b_pillars=(0.42, 1.12))
wheels(p, X, (-1.12, 1.12), 0.89, 0.38)
front_and_back(p, X, 3.6, 1.78, 0.82, 0.44, bumper=TRIM)
sides(p, X, 1.78, (-0.55, 0.42, 1.2), 0.42, 1.04, mirror_y=-0.5, mirror_z=1.1)
side_skirt(p, X, 1.78, -0.75, 0.75, 0.42)
for sx in (-1, 1):
    p.append(kit.box((0.06, 1.7, 0.06), (X + sx * 0.7, 0.72, 1.72), TRIM, bevel=0.02))
p.append(kit.cylinder(0.3, 0.16, (X, 1.86, 0.78), TYRE, verts=16, rot=(math.pi / 2, 0, 0)))
p.append(kit.cylinder(0.16, 0.18, (X, 1.87, 0.78), RIM, verts=12, rot=(math.pi / 2, 0, 0)))
finish(p, 'suv', X)

X = -12
p = [kit.profile([(-1.78, 0.3), (-1.78, 0.62), (-1.68, 0.78), (-1.25, 0.92), (-1.0, 0.98), (1.7, 1.0), (1.78, 0.95), (1.78, 0.3), (1.65, 0.26), (-1.65, 0.26)], 1.74, X, PAINT, bevel=0.12, segments=2)]
glasshouse(p, X, 1.74, (-1.0, 0.98), (-0.3, 1.7), (1.66, 1.7), (1.76, 1.0), b_pillars=(-0.05, 0.85))
wheels(p, X, (-1.15, 1.15), 0.87, 0.33)
front_and_back(p, X, 3.55, 1.74, 0.66, 0.36)
sides(p, X, 1.74, (-0.95, -0.02, 0.9), 0.3, 0.98, mirror_y=-0.92, mirror_z=1.04)
for sx in (-1, 1):
    p.append(kit.box((0.02, 0.9, 0.025), (X + sx * 0.875, 0.45, 0.92), TRIM, bevel=0.0))
finish(p, 'minivan', X)

X = -8
p = [kit.profile([(-1.83, 0.2), (-1.83, 0.42), (-1.7, 0.55), (-0.6, 0.7), (-0.2, 0.74), (1.3, 0.78), (1.8, 0.74), (1.83, 0.62), (1.83, 0.24), (1.7, 0.16), (-1.7, 0.16)], 1.78, X, PAINT, bevel=0.12, segments=2)]
glasshouse(p, X, 1.7, (-0.2, 0.74), (0.38, 1.14), (0.78, 1.14), (1.5, 0.78))
wheels(p, X, (-1.15, 1.18), 0.89, 0.33, width=0.3)
front_and_back(p, X, 3.65, 1.78, 0.5, 0.26, plate=False)
sides(p, X, 1.78, (0.15,), 0.24, 0.72, handles=False, mirror_y=-0.1, mirror_z=0.8)
for sx in (-1, 1):
    # Side air intake behind the door, and a hood vent.
    p.append(kit.box((0.02, 0.4, 0.14), (X + sx * 0.895, 0.75, 0.48), TRIM, bevel=0.02))
    p.append(kit.box((0.06, 0.08, 0.2), (X + sx * 0.7, 1.68, 0.86), TRIM, bevel=0.02))
p.append(kit.box((1.62, 0.32, 0.05), (X, 1.7, 0.98), PAINT, bevel=0.02))
p.append(kit.box((0.5, 0.24, 0.03), (X, -1.0, 0.68), TRIM, bevel=0.01, rot=(-0.12, 0, 0)))
for dx in (-0.25, 0.25):
    p.append(kit.cylinder(0.06, 0.12, (X + dx, 1.86, 0.24), CHROME, verts=10, rot=(math.pi / 2, 0, 0)))
finish(p, 'sports', X)

X = -4
p = [kit.profile([(-1.88, 0.4), (-1.88, 0.8), (-1.78, 0.95), (-0.75, 1.04), (-0.5, 1.06), (0.45, 1.08), (0.45, 0.72), (1.88, 0.72), (1.88, 0.4), (1.75, 0.36), (-1.75, 0.36)], 1.8, X, PAINT, bevel=0.1, segments=2)]
glasshouse(p, X, 1.8, (-0.5, 1.06), (-0.15, 1.64), (0.36, 1.64), (0.45, 1.08))
wheels(p, X, (-1.2, 1.15), 0.9, 0.38)
front_and_back(p, X, 3.75, 1.8, 0.86, 0.46, grille=CHROME)
sides(p, X, 1.8, (-0.48, 0.45), 0.42, 1.06, mirror_y=-0.42, mirror_z=1.12)
# The load bed: side walls, tailgate, a dark floor.
for sx in (-1, 1):
    p.append(kit.box((0.1, 1.42, 0.38), (X + sx * 0.85, 1.18, 0.9), PAINT, bevel=0.03))
p.append(kit.box((1.8, 0.1, 0.38), (X, 1.84, 0.9), PAINT, bevel=0.03))
p.append(kit.box((1.6, 1.3, 0.04), (X, 1.16, 0.74), TRIM, bevel=0.0))
p.append(kit.box((1.8, 0.06, 0.04), (X, 0.47, 1.1), CHROME, bevel=0.0))
finish(p, 'pickup', X)

X = 0.5
# Monster truck: a pickup high on giant tyres, with suspension and a roll bar of lights.
UP = 0.72
p = [kit.profile([(y, z + UP) for y, z in [(-1.88, 0.4), (-1.88, 0.8), (-1.78, 0.95), (-0.75, 1.04), (-0.5, 1.06), (0.45, 1.08), (0.45, 0.72), (1.88, 0.72), (1.88, 0.4), (1.75, 0.36), (-1.75, 0.36)]], 1.8, X, PAINT, bevel=0.1, segments=2)]
glasshouse(p, X, 1.8, (-0.5, 1.06 + UP), (-0.15, 1.64 + UP), (0.36, 1.64 + UP), (0.45, 1.08 + UP))
front_and_back(p, X, 3.75, 1.8, 0.86 + UP, 0.46 + UP, grille=CHROME)
for sx in (-1, 1):
    p.append(kit.box((0.1, 1.42, 0.38), (X + sx * 0.85, 1.18, 0.9 + UP), PAINT, bevel=0.03))
p.append(kit.box((1.8, 0.1, 0.38), (X, 1.84, 0.9 + UP), PAINT, bevel=0.03))
p.append(kit.box((1.6, 1.3, 0.04), (X, 1.16, 0.74 + UP), TRIM, bevel=0.0))
R = 0.72
for y in (-1.3, 1.3):
    for sx in (-1, 1):
        wx = X + sx * 1.0
        p.append(kit.cylinder(R, 0.55, (wx, y, R), TYRE, verts=16, rot=(0, math.pi / 2, 0)))
        for k in range(8):
            a = k * 2 * math.pi / 8
            p.append(kit.box((0.56, 0.14, 0.1), (wx, y + R * math.sin(a), R + R * math.cos(a)), '#1a1c21', bevel=0.0, rot=(-a, 0, 0)))
        p.append(kit.cylinder(R * 0.5, 0.57, (wx, y, R), RIM, verts=14, rot=(0, math.pi / 2, 0)))
        p.append(kit.cylinder(R * 0.15, 0.6, (wx, y, R), TRIM, verts=8, rot=(0, math.pi / 2, 0)))
        p.append(kit.box((0.12, 0.12, 0.5), (X + sx * 0.6, y, 1.05), '#ffd24a', bevel=0.03))
    p.append(kit.cylinder(0.08, 2.0, (X, y, R), TRIM, verts=8, rot=(0, math.pi / 2, 0)))
p.append(kit.box((1.5, 0.08, 0.08), (X, 0.3, 2.42), TRIM, bevel=0.02))
for dx in (-0.45, -0.15, 0.15, 0.45):
    p.append(kit.box((0.18, 0.1, 0.12), (X + dx, 0.26, 2.5), LIGHT, bevel=0.03))
finish(p, 'monster', X)

X = 5
# The golden VIP: a big luxury SUV with a chrome grille and trim (painted gold by the game).
p = [kit.profile([(-1.86, 0.38), (-1.86, 0.84), (-1.75, 0.98), (-0.85, 1.06), (-0.58, 1.1), (1.7, 1.12), (1.86, 1.04), (1.86, 0.38), (1.75, 0.32), (-1.75, 0.32)], 1.8, X, PAINT, bevel=0.12, segments=2)]
glasshouse(p, X, 1.8, (-0.58, 1.1), (-0.15, 1.7), (1.62, 1.7), (1.8, 1.12), b_pillars=(0.45, 1.12))
wheels(p, X, (-1.16, 1.16), 0.9, 0.39, rim=CHROME)
front_and_back(p, X, 3.72, 1.8, 0.86, 0.46, grille=CHROME, bumper=PAINT)
p.append(kit.box((0.8, 0.07, 0.36), (X, -1.86, 0.78), CHROME, bevel=0.04))
sides(p, X, 1.8, (-0.55, 0.45, 1.2), 0.42, 1.1, mirror_y=-0.52, mirror_z=1.16)
side_skirt(p, X, 1.8, -0.8, 0.8, 0.42, col=CHROME)
for sx in (-1, 1):
    p.append(kit.box((0.02, 2.2, 0.03), (X + sx * 0.905, 0.5, 1.1), CHROME, bevel=0.0))
finish(p, 'luxury', X)

# ---- Car of the Day specials, in their own colours --------------------------

X = 9.5
YELLOW = '#ffc61a'
p = sedan_body(X, body=YELLOW)
p.append(kit.box((0.7, 0.3, 0.2), (X, 0.4, 1.46), '#fffbe8', bevel=0.05))
p.append(kit.box((0.62, 0.32, 0.06), (X, 0.4, 1.38), '#2d3440', bevel=0.02))
for i in range(12):
    for sx in (-1, 1):
        p.append(kit.box((0.012, 0.18, 0.09), (X + sx * 0.865, -1.0 + i * 0.18, 0.66), '#1d2026' if i % 2 else '#ffffff', bevel=0.0))
finish(p, 'taxi', X)

X = 13.5
p = sedan_body(X, body='#22262d')
for sx in (-1, 1):
    p.append(kit.box((0.015, 1.5, 0.42), (X + sx * 0.866, 0.0, 0.6), '#f6f8fb', bevel=0.0))
p.append(kit.box((0.9, 0.26, 0.1), (X, 0.4, 1.4), TRIM, bevel=0.03))
for dx, col in ((-0.25, '#ff2e4c'), (0.25, '#2e7dff')):
    p.append(kit.box((0.36, 0.22, 0.12), (X + dx, 0.4, 1.48), col, bevel=0.04))
p.append(kit.box((1.0, 0.12, 0.3), (X, -1.9, 0.48), TRIM, bevel=0.04))
finish(p, 'police', X)

X = 17.5
WHITE = '#f4f6f9'
RED = '#e23a3a'
p = [kit.profile([(-1.85, 0.3), (-1.85, 0.66), (-1.74, 0.82), (-1.3, 0.96), (-1.05, 1.0), (-0.35, 1.0), (-0.35, 0.3), (-1.7, 0.26)], 1.8, X, WHITE, bevel=0.1, segments=2)]
glasshouse(p, X, 1.8, (-1.05, 1.0), (-0.65, 1.6), (-0.4, 1.62), (-0.35, 1.0), body=WHITE)
p.append(kit.box((1.84, 2.25, 1.75), (X, 0.75, 1.15), WHITE, bevel=0.1, segments=2))
for sx in (-1, 1):
    p.append(kit.box((0.02, 2.2, 0.16), (X + sx * 0.925, 0.75, 1.0), RED, bevel=0.0))
    p.append(kit.box((0.02, 0.62, 0.18), (X + sx * 0.93, 0.85, 1.5), RED, bevel=0.0))
    p.append(kit.box((0.02, 0.18, 0.62), (X + sx * 0.93, 0.85, 1.5), RED, bevel=0.0))
p.append(kit.box((1.2, 0.22, 0.1), (X, -0.55, 1.68), TRIM, bevel=0.03))
for dx, col in ((-0.3, '#ff2e4c'), (0.3, '#2e7dff')):
    p.append(kit.box((0.4, 0.2, 0.12), (X + dx, -0.55, 1.76), col, bevel=0.04))
p.append(kit.box((0.04, 0.03, 1.5), (X, 1.88, 1.15), TRIM, bevel=0.0))
wheels(p, X, (-1.2, 1.2), 0.9, 0.36)
front_and_back(p, X, 3.72, 1.8, 0.62, 0.36, bumper=TRIM)
finish(p, 'ambulance', X)

X = 22
FIRE = '#e0262e'
p = [kit.profile([(-2.1, 0.4), (-2.1, 0.9), (-2.02, 1.05), (-1.75, 1.1), (-0.95, 1.1), (-0.95, 0.4), (-1.95, 0.36)], 1.86, X, FIRE, bevel=0.1, segments=2)]
glasshouse(p, X, 1.86, (-1.75, 1.1), (-1.5, 1.8), (-1.0, 1.82), (-0.95, 1.1), body=FIRE)
p.append(kit.box((1.88, 3.05, 1.45), (X, 0.58, 1.12), FIRE, bevel=0.08, segments=2))
for sx in (-1, 1):
    for i in range(3):
        p.append(kit.box((0.02, 0.86, 1.0), (X + sx * 0.945, -0.35 + i * 0.95, 1.15), '#c41f26', bevel=0.0))
        p.append(kit.box((0.03, 0.4, 0.05), (X + sx * 0.955, -0.35 + i * 0.95, 1.12), CHROME, bevel=0.0))
    p.append(kit.box((0.025, 3.05, 0.1), (X + sx * 0.945, 0.58, 0.55), CHROME, bevel=0.0))
for sx in (-1, 1):
    p.append(kit.box((0.06, 2.9, 0.06), (X + sx * 0.32, 0.7, 2.0), CHROME, bevel=0.02))
for i in range(10):
    p.append(kit.box((0.64, 0.05, 0.05), (X, -0.6 + i * 0.3, 2.0), CHROME, bevel=0.0))
p.append(kit.box((1.2, 0.22, 0.1), (X, -1.3, 1.9), TRIM, bevel=0.03))
for dx in (-0.35, 0.0, 0.35):
    p.append(kit.box((0.3, 0.2, 0.12), (X + dx, -1.3, 1.98), '#ff2e4c', bevel=0.04))
wheels(p, X, (-1.45, 1.35), 0.93, 0.42)
front_and_back(p, X, 4.2, 1.86, 0.76, 0.46, grille=CHROME, bumper=CHROME)
finish(p, 'firetruck', X)

X = 26.5
PASTEL = '#ffb3d9'
p = [kit.profile([(-1.8, 0.3), (-1.8, 0.62), (-1.7, 0.8), (-1.25, 0.94), (-1.0, 0.98), (-0.3, 0.98), (-0.3, 0.3), (-1.65, 0.26)], 1.78, X, PASTEL, bevel=0.1, segments=2)]
glasshouse(p, X, 1.78, (-1.0, 0.98), (-0.62, 1.58), (-0.36, 1.6), (-0.3, 0.98), body=PASTEL)
p.append(kit.box((1.82, 2.2, 1.7), (X, 0.72, 1.12), PASTEL, bevel=0.1, segments=2))
for sx in (-1, 1):
    # Serving window with a striped awning, and a ripple of chocolate along the bottom.
    p.append(kit.box((0.02, 1.1, 0.6), (X + sx * 0.915, 0.7, 1.3), '#cfeeff', bevel=0.0))
    for i in range(6):
        p.append(kit.box((0.36, 0.2, 0.04), (X + sx * 1.06, 0.2 + i * 0.2, 1.68), 'white' if i % 2 else '#ff5fa8', bevel=0.0, rot=(0, sx * 0.4, 0)))
    for i in range(11):
        p.append(kit.sphere(0.1, (X + sx * 0.91, -0.3 + i * 0.2, 0.42), '#7a4a2e', segments=6))
p.append(kit.cone(0.3, 0.05, 0.7, (X, 0.7, 2.3), '#e8b26a', verts=12, rot=(math.pi, 0, 0)))
p.append(kit.sphere(0.36, (X, 0.7, 2.75), '#fff3f8', segments=12))
p.append(kit.sphere(0.25, (X, 0.7, 3.05), '#ff8fc8', segments=10))
p.append(kit.sphere(0.07, (X, 0.66, 3.3), '#e23a3a', segments=6))
wheels(p, X, (-1.15, 1.15), 0.89, 0.34)
front_and_back(p, X, 3.6, 1.78, 0.6, 0.36)
finish(p, 'icecream', X)

toy = kit.toy_material('toy')
for obj in models:
    kit.use_material(obj, toy)
print('triangles', {o.name: kit.triangles([o]) for o in models})
print('sizes', {b.name: [round(v, 2) for v in m.dimensions] for b, m in zip(bases, models)})
# Three files, so each stays small (the game finds a car by name in any of them).
FILES = {
    'cars-small.glb': ('hatchback', 'sedan', 'minivan', 'sports'),
    'cars-large.glb': ('suv', 'pickup', 'monster', 'luxury'),
    'cars-special.glb': ('taxi', 'police', 'ambulance', 'firetruck', 'icecream'),
}
out = Path(sys.argv[1] if len(sys.argv) > 1 else '.')
for file, names in FILES.items():
    pick = [i for i, b in enumerate(bases) if b.name in names]
    kit.export([models[i] for i in pick] + [bases[i] for i in pick], str(out / file))

# For the preview only: paint each car a real colour, as the game will.
PREVIEW_PAINT = {'sedan': '#c9ced6', 'hatchback': '#e23a3a', 'suv': '#24395c', 'minivan': '#f2f4f7', 'sports': '#ff7a1a', 'pickup': '#2f6b3f', 'monster': '#1f8fe0', 'luxury': '#ffcf3a'}
for base, obj in zip(bases, models):
    col = kit.colour(PREVIEW_PAINT.get(base.name, '#c9ced6'))
    for item in obj.data.color_attributes['Col'].data:
        c = item.color
        if c[0] > 0.9 and c[1] < 0.1 and c[2] > 0.9:
            item.color = col
if len(sys.argv) > 2:
    # Lined up in a grid for the picture, five to a row.
    for i, base in enumerate(bases):
        base.location = ((i % 5 - 2) * 3.3, (i // 5) * 5.2, 0)
    print(kit.preview(sys.argv[2], look_at=(0, 4.6, 0.6), distance=20, size=(1600, 1000), angles=((0.3, -1, 0.95),)))
