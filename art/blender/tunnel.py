"""The automatic brush tunnel: a candy-striped entrance arch with a sign
board (the game writes CAR WASH on it) and rubber curtains, low walls with glass above, an open top, a
conveyor, four fat side brushes and an overhead roller (separate objects,
spun by the game), a water tank and a control box outside.

Usage: python art/blender/tunnel.py <out.glb> [preview.png]
Cars drive in at +Y (the road) and out at -Y (towards the camera).
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import kit  # noqa: E402

LENGTH = 8.4
WALL_X = 1.85
BRUSH_X = 1.15
BRUSH_Y = 2.1
ROLLER_Z = 2.1

kit.reset()
body = []
glass = []

# Floor: tiles, a conveyor trench with rollers for the left wheels, a guide rail for the right, warning chevrons at the way in.
body.append(kit.box((4.2, LENGTH + 0.2, 0.08), (0, 0, 0.04), '#aab6c4', bevel=0.02))
body.append(kit.box((0.6, LENGTH - 0.2, 0.03), (-0.72, 0, 0.09), 'dark', bevel=0.01))
for i in range(15):
    y = -LENGTH / 2 + 0.6 + i * 0.52
    body.append(kit.cylinder(0.06, 0.52, (-0.72, y, 0.12), 'yellow', verts=8, rot=(0, math.pi / 2, 0)))
body.append(kit.box((0.12, LENGTH - 0.2, 0.08), (0.78, 0, 0.12), 'steel', bevel=0.02))
for i in range(8):
    body.append(kit.box((0.48, 0.4, 0.02), (-1.68 + i * 0.48, LENGTH / 2 - 0.15, 0.09), 'yellow' if i % 2 == 0 else 'black', bevel=0.0))

# Side walls: mint base, white wall, pink rail; posts with glass panels above, a blue rail on top.
for side in (-1, 1):
    x = side * WALL_X
    body.append(kit.box((0.34, 7.84, 0.22), (x, -0.1, 0.11), 'mint', bevel=0.04))
    body.append(kit.box((0.3, 7.8, 1.0), (x, -0.1, 0.55), 'white', bevel=0.06, segments=1))
    body.append(kit.box((0.4, 7.9, 0.14), (x, -0.1, 1.1), 'pink', bevel=0.05, segments=1))
    posts = (-3.7, -1.25, 1.25, 3.5)
    for y in posts:
        body.append(kit.box((0.16, 0.16, 1.45), (x, y, 1.88), 'white', bevel=0.04))
    body.append(kit.box((0.24, 7.5, 0.16), (x, -0.1, 2.62), 'blue', bevel=0.06, segments=1))
    for a, b in zip(posts, posts[1:]):
        glass.append(kit.box((0.05, b - a - 0.18, 1.38), (x, (a + b) / 2, 1.86), 'glass', bevel=0.0))

# Way in (+Y): blue pillars under a pink-and-white arch, rubber curtain strips, and the big CAR WASH sign with bubbles.
IN_Y = LENGTH / 2 - 0.15
for side in (-1, 1):
    body.append(kit.box((0.5, 0.62, 2.6), (side * 1.98, IN_Y, 1.3), 'blue', bevel=0.08, segments=1))
    body.append(kit.box((0.62, 0.74, 0.16), (side * 1.98, IN_Y, 2.64), 'white', bevel=0.05))
body += kit.arch_segments(1.98, 0.44, 0.62, (0, IN_Y, 2.72), ['pink', 'white'], segments=13)
strips = ['blue', 'pink', 'yellow', 'mint']
for i in range(15):
    x = -1.47 + i * 0.21
    body.append(kit.box((0.17, 0.04, 1.05), (x, IN_Y, 2.08), strips[i % 4], bevel=0.0))
body.append(kit.box((0.2, 0.2, 0.9), (0, IN_Y + 0.05, 4.95), 'white', bevel=0.04))
body.append(kit.box((3.9, 0.32, 1.12), (0, IN_Y + 0.12, 5.55), 'deepblue', bevel=0.22, segments=3))
body.append(kit.box((3.6, 0.34, 0.86), (0, IN_Y + 0.1, 5.55), 'blue', bevel=0.16, segments=3))
# The words go on in the game (crisp at any size): the board's front face is at Y = IN_Y - 0.07, centred at Z = 5.55.
for (x, z, r, c) in [(-2.05, 6.0, 0.3, 'glass'), (-1.75, 6.35, 0.18, 'white'), (2.0, 6.05, 0.26, 'glass'), (2.22, 5.62, 0.16, 'white'), (1.65, 6.38, 0.14, 'glass')]:
    body.append(kit.sphere(r, (x, IN_Y, z), c, segments=12))

# Way out (-Y, the camera side): pink pillars, a low striped beam (so it never hides the car), a traffic light.
OUT_Y = -LENGTH / 2 + 0.15
for side in (-1, 1):
    body.append(kit.box((0.46, 0.52, 2.7), (side * 1.98, OUT_Y, 1.35), 'pink', bevel=0.08, segments=1))
for i in range(9):
    x = -2.2 + i * 0.55
    body.append(kit.box((0.56, 0.5, 0.42), (x, OUT_Y, 2.92), 'white' if i % 2 == 0 else 'blue', bevel=0.03))
body.append(kit.box((0.26, 0.22, 0.62), (2.38, OUT_Y - 0.1, 2.0), 'black', bevel=0.05))
body.append(kit.sphere(0.075, (2.38, OUT_Y - 0.22, 2.17), 'red', segments=8))
body.append(kit.sphere(0.075, (2.38, OUT_Y - 0.22, 1.85), '#3fdc6a', segments=8))

# Gantries across the top: a yellow one carrying the roller, spray bars with nozzles front and back.
for y, beam, nozzle in ((0.0, 'yellow', None), (-2.6, 'steel', 'blue'), (2.75, 'steel', 'pink')):
    for side in (-1, 1):
        body.append(kit.box((0.2, 0.2, 1.8), (side * WALL_X, y, 2.05), 'white', bevel=0.04))
    body.append(kit.box((4.0, 0.28 if nozzle is None else 0.14, 0.24 if nozzle is None else 0.14), (0, y, 2.95), beam, bevel=0.05))
    if nozzle:
        for i in range(7):
            body.append(kit.sphere(0.075, (-1.5 + i * 0.5, y, 2.82), nozzle, segments=8))
# Roller bearings hanging from the yellow gantry.
for side in (-1, 1):
    body.append(kit.box((0.14, 0.18, 0.75), (side * 1.55, 0, 2.52), 'dark', bevel=0.03))

# Arms holding the side brushes from the walls.
for sx in (-1, 1):
    for sy in (-1, 1):
        body.append(kit.box((WALL_X - BRUSH_X, 0.12, 0.12), (sx * (WALL_X + BRUSH_X) / 2, sy * BRUSH_Y, 2.42), 'dark', bevel=0.03))

# Outside: a water tank with a pipe over the wall (right), a control box with lights and a gauge (left).
body.append(kit.cylinder(0.46, 1.7, (2.62, -2.6, 0.85), 'blue', verts=16, bevel=0.06))
body.append(kit.cylinder(0.5, 0.12, (2.62, -2.6, 1.74), 'white', verts=16, bevel=0.03))
body.append(kit.cylinder(0.07, 0.75, (2.3, -2.6, 1.95), 'steel', verts=8, rot=(0, math.pi / 2, 0)))
body.append(kit.box((0.55, 0.85, 1.15), (-2.42, 1.6, 0.58), 'mint', bevel=0.08, segments=1))
body.append(kit.box((0.6, 0.9, 0.1), (-2.42, 1.6, 1.2), 'white', bevel=0.03))
for i, c in enumerate(('red', 'yellow', '#3fdc6a')):
    body.append(kit.sphere(0.07, (-2.42, 1.35 + i * 0.25, 1.3), c, segments=8))
body.append(kit.cylinder(0.17, 0.04, (-2.42, 1.17, 0.8), 'white', verts=16, rot=(math.pi / 2, 0, 0)))

tunnel = kit.join(body, 'tunnel_body')
tunnel_glass = kit.join(glass, 'tunnel_glass')


def side_brush(index, x, y, colours):
    parts = [kit.cylinder(0.06, 2.3, (x, y, 1.25), 'steel', verts=8)]
    for i in range(7):
        parts.append(kit.star_disc(0.47, 0.39, 0.27, (x, y, 0.4 + i * 0.27), colours[(i // 2) % 2], points=11, twist=i * 0.45))
    parts.append(kit.cylinder(0.13, 0.16, (x, y, 2.42), 'dark', verts=12, bevel=0.03))
    brush = kit.join(parts, f'brush_side_{index}')
    kit.set_origin(brush, (x, y, 0))
    return brush


brushes = [
    side_brush(0, -BRUSH_X, BRUSH_Y, ('blue', 'pink')),
    side_brush(1, BRUSH_X, BRUSH_Y, ('pink', 'blue')),
    side_brush(2, -BRUSH_X, -BRUSH_Y, ('blue', 'pink')),
    side_brush(3, BRUSH_X, -BRUSH_Y, ('pink', 'blue')),
]
roller_parts = [kit.cylinder(0.06, 3.2, (0, 0, ROLLER_Z), 'steel', verts=8, rot=(0, math.pi / 2, 0))]
for i in range(7):
    roller_parts.append(kit.star_disc(0.42, 0.35, 0.36, (-1.2 + i * 0.4, 0, ROLLER_Z), 'mint' if (i // 2) % 2 == 0 else 'yellow', points=11, twist=i * 0.45))
for p in roller_parts[1:]:
    p.rotation_euler = (0, math.pi / 2, 0)
    kit._apply_all(p)
roller = kit.join(roller_parts, 'brush_roller')
kit.set_origin(roller, (0, 0, ROLLER_Z))

toy = kit.toy_material('toy')
for obj in [tunnel, *brushes, roller]:
    kit.use_material(obj, toy)
kit.use_material(tunnel_glass, kit.toy_material('glass', alpha=0.35))

objects = [tunnel, tunnel_glass, *brushes, roller]
print('triangles', kit.triangles(objects), {o.name: kit.triangles([o]) for o in objects})
out = sys.argv[1] if len(sys.argv) > 1 else 'tunnel.glb'
kit.export(objects, out)
if len(sys.argv) > 2:
    print(kit.preview(sys.argv[2], look_at=(0, 0.6, 2.3), distance=21, angles=((0, -1, 1.2), (1.1, -1, 0.9))))
