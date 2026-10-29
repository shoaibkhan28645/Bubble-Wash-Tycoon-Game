"""The detailing garage: lilac and white walls with windows, rolled-up doors
over both ends, a lilac glass roof (the car stays in sight), a two-post car
lift with yellow pads, a pegboard tool wall, a red tool chest, a shop
vacuum, a tyre stack, work lights, and a header over the way out with the
sign board (the game writes DETAILING on it).

Usage: python art/blender/detailing.py <out.glb> [preview.png]
Cars drive in at +Y and out at -Y (towards the camera).
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import kit  # noqa: E402

LENGTH = 4.2
WALL_X = 2.0
WALL_H = 2.5

kit.reset()
parts = []
glass = []

# Floor: pale lilac with a darker work bay, yellow lift rails and a drain.
parts.append(kit.box((4.3, LENGTH + 0.2, 0.06), (0, 0, 0.03), '#d6c9f2', bevel=0.02))
parts.append(kit.box((3.5, LENGTH - 0.2, 0.02), (0, 0, 0.065), '#ece4fb', bevel=0.0))
for x in (-0.62, 0.62):
    parts.append(kit.box((0.32, 2.6, 0.06), (x, 0.1, 0.1), 'yellow', bevel=0.02))
    for i in range(6):
        parts.append(kit.box((0.32, 0.12, 0.012), (x, -1.0 + i * 0.44, 0.135), 'black', bevel=0.0))

# Walls: lilac lower half, white upper half with blue windows, a lilac cap.
for side in (-1, 1):
    x = side * WALL_X
    parts.append(kit.box((0.24, LENGTH - 0.2, 1.1), (x, 0, 0.55), 'lilac', bevel=0.05))
    parts.append(kit.box((0.24, LENGTH - 0.2, 1.4), (x, 0, 1.8), 'white', bevel=0.05))
    parts.append(kit.box((0.3, LENGTH - 0.1, 0.12), (x, 0, WALL_H + 0.06), 'lilac', bevel=0.04))
    for y in (-1.05, 1.05):
        parts.append(kit.box((0.26, 1.3, 0.7), (x, y, 1.75), '#9fd4f7', bevel=0.02))
        parts.append(kit.box((0.28, 0.06, 0.72), (x, y, 1.75), 'white', bevel=0.0))

# Both ends: posts, a header, and the roll-up door rolled up under it.
for sy in (-1, 1):
    y = sy * (LENGTH / 2 - 0.1)
    for sx in (-1, 1):
        parts.append(kit.box((0.32, 0.32, WALL_H + 0.1), (sx * WALL_X, y, (WALL_H + 0.1) / 2), 'white', bevel=0.06))
    parts.append(kit.box((4.3, 0.3, 0.32), (0, y, WALL_H + 0.06), 'white', bevel=0.08))
    parts.append(kit.cylinder(0.2, 3.7, (0, y - sy * 0.12, WALL_H - 0.25), '#c3cad4', verts=12, rot=(0, math.pi / 2, 0)))
    for i in range(4):
        parts.append(kit.cylinder(0.205, 0.04, (-1.4 + i * 0.93, y - sy * 0.12, WALL_H - 0.25), 'steel', verts=12, rot=(0, math.pi / 2, 0)))
# The sign board over the way out, facing the camera (the game writes DETAILING on it).
OUT_Y = -(LENGTH / 2 - 0.1)
parts.append(kit.box((2.6, 0.16, 0.56), (0, OUT_Y - 0.22, WALL_H + 0.42), '#9a7cf0', bevel=0.12, segments=2))
parts.append(kit.box((2.4, 0.18, 0.4), (0, OUT_Y - 0.23, WALL_H + 0.42), 'white', bevel=0.08, segments=2))
# The words go on in the game: the board's front face is at Y = OUT_Y - 0.32, centred at Z = WALL_H + 0.42.

# Two-post lift: orange posts with yellow arms and pads under the car.
for side in (-1, 1):
    x = side * 1.45
    parts.append(kit.box((0.4, 0.4, 0.1), (x, 0.2, 0.08), 'dark', bevel=0.03))
    parts.append(kit.box((0.24, 0.3, 2.1), (x, 0.2, 1.1), '#ff8a3d', bevel=0.05))
    parts.append(kit.box((0.3, 0.36, 0.14), (x, 0.2, 2.2), 'dark', bevel=0.03))
    for dy in (-0.55, 0.95):
        parts.append(kit.box((0.75, 0.1, 0.08), (x - side * 0.4, dy, 0.26), 'yellow', bevel=0.02, rot=(0, 0, side * 0.2)))
        parts.append(kit.cylinder(0.1, 0.06, (x - side * 0.78, dy, 0.31), 'dark', verts=10))
# Work lights hanging from the roof frame.
for y in (-0.9, 0.9):
    parts.append(kit.box((1.6, 0.18, 0.08), (0, y, WALL_H - 0.05), '#fff3b0', bevel=0.02))

# Pegboard tool wall on the left wall's inside, with hanging tools.
parts.append(kit.box((0.04, 1.6, 0.9), (-WALL_X + 0.14, 0.9, 1.45), '#e8d2b0', bevel=0.0))
for i, (c, h) in enumerate((('red', 0.35), ('steel', 0.45), ('blue', 0.3), ('yellow', 0.4), ('steel', 0.3), ('red', 0.25))):
    parts.append(kit.box((0.05, 0.08, h), (-WALL_X + 0.18, 0.3 + i * 0.24, 1.55 - h / 2 + 0.2), c, bevel=0.01))

# Outside: a red rolling tool chest and a tyre stack on the left, a yellow shop vacuum on the right.
parts.append(kit.box((0.5, 0.8, 0.85), (-2.55, 0.5, 0.5), 'red', bevel=0.06))
for i in range(4):
    parts.append(kit.box((0.52, 0.7, 0.03), (-2.55, 0.5, 0.25 + i * 0.18), 'dark', bevel=0.0))
for dy in (-0.3, 0.3):
    parts.append(kit.cylinder(0.05, 0.04, (-2.55, 0.5 + dy, 0.05), 'black', verts=8, rot=(0, math.pi / 2, 0)))
for i in range(3):
    parts.append(kit.torus(0.27, 0.11, (-2.55, -1.3, 0.12 + i * 0.22), 'black', major_segments=14, minor_segments=6))
parts.append(kit.cylinder(0.28, 0.55, (2.55, -1.3, 0.3), 'yellow', verts=12, bevel=0.04))
parts.append(kit.cylinder(0.22, 0.14, (2.55, -1.3, 0.62), 'dark', verts=12, bevel=0.03))
parts.append(kit.torus(0.22, 0.04, (2.55, -0.85, 0.5), 'dark', rot=(math.pi / 2, 0, 0), major_segments=12, minor_segments=5))

garage = kit.join(parts, 'detailing_body')
roof = kit.box((4.0, LENGTH - 0.4, 0.05), (0, 0, WALL_H + 0.13), '#d9c8ff', bevel=0.0)
roof.name = 'detailing_glass'
roof.data.name = 'detailing_glass'

kit.use_material(garage, kit.toy_material('toy'))
kit.use_material(roof, kit.toy_material('glass', alpha=0.3))
print('triangles', kit.triangles([garage, roof]))
kit.export([garage, roof], sys.argv[1] if len(sys.argv) > 1 else 'detailing.glb')
if len(sys.argv) > 2:
    print(kit.preview(sys.argv[2], look_at=(0, -0.4, 1.2), distance=12, angles=((0, -1, 1.2), (1.1, -1, 0.9))))
