"""A self-service hand wash bay: a tiled floor with a drain and puddles,
half-height walls with bubble decals, an entrance header with lights and a
sign board (the game writes BAY 1 / BAY 2 on it), a swinging hose boom with
a spray wand, a coin-operated control panel, a foam brush in its holster,
soap bottles, a bucket with a sponge and a wet-floor sign.

Usage: python art/blender/wash_bay.py <out.glb> [preview.png]
Cars drive in at +Y (the road) and out at -Y (towards the camera).
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import kit  # noqa: E402

LENGTH = 5.0
WALL_X = 2.0
WALL_H = 1.25
IN_Y = 2.35

kit.reset()
parts = []

# Floor: pale blue tiles with grout lines, a drain down the middle, a couple of puddles.
parts.append(kit.box((3.9, LENGTH + 0.2, 0.06), (0, 0, 0.03), 'tile', bevel=0.02))
for i in range(1, 6):
    parts.append(kit.box((3.7, 0.04, 0.012), (0, -LENGTH / 2 + i * LENGTH / 6, 0.065), '#b6cbd8', bevel=0.0))
for x in (-1.25, 1.25):
    parts.append(kit.box((0.04, LENGTH, 0.012), (x, 0, 0.065), '#b6cbd8', bevel=0.0))
parts.append(kit.box((0.46, 3.2, 0.02), (0, 0, 0.07), 'dark', bevel=0.0))
for i in range(9):
    parts.append(kit.box((0.4, 0.06, 0.012), (0, -1.45 + i * 0.36, 0.085), 'steel', bevel=0.0))
for (x, y, r) in ((-0.9, -1.4, 0.45), (0.85, 0.9, 0.36), (-0.6, 1.5, 0.28)):
    puddle = kit.cylinder(r, 0.01, (x, y, 0.07), '#8cc8ee', verts=12)
    puddle.scale = (1.0, 0.7, 1.0)
    kit._apply_all(puddle)
    parts.append(puddle)

# Half-height walls: navy base, sky blue panel, white cap, white bubble decals on the outside.
for side in (-1, 1):
    x = side * WALL_X
    parts.append(kit.box((0.32, LENGTH - 0.1, 0.2), (x, -0.1, 0.1), 'deepblue', bevel=0.04))
    parts.append(kit.box((0.28, LENGTH - 0.2, WALL_H), (x, -0.1, WALL_H / 2), 'blue', bevel=0.06))
    parts.append(kit.box((0.38, LENGTH - 0.1, 0.12), (x, -0.1, WALL_H + 0.04), 'pink', bevel=0.05))
    for (y, z, r) in ((-1.4, 0.75, 0.2), (-0.75, 0.5, 0.12), (0.2, 0.8, 0.16), (1.1, 0.55, 0.22), (1.75, 0.9, 0.11)):
        parts.append(kit.cylinder(r, 0.03, (x + side * 0.15, y, z), 'white', verts=12, rot=(0, math.pi / 2, 0)))

# Entrance header: white posts, a pink beam with two lamps, the sign board.
for side in (-1, 1):
    parts.append(kit.box((0.3, 0.3, 2.95), (side * WALL_X, IN_Y, 1.47), 'white', bevel=0.06))
    parts.append(kit.box((0.4, 0.4, 0.16), (side * WALL_X, IN_Y, 0.08), 'pink', bevel=0.04))
parts.append(kit.box((4.4, 0.36, 0.32), (0, IN_Y, 3.0), 'pink', bevel=0.08))
for x in (-1.35, 1.35):
    parts.append(kit.sphere(0.12, (x, IN_Y - 0.2, 2.88), '#fff3b0', segments=10))
parts.append(kit.box((2.5, 0.2, 0.82), (0, IN_Y + 0.02, 3.55), 'deepblue', bevel=0.16, segments=3))
parts.append(kit.box((2.3, 0.22, 0.64), (0, IN_Y, 3.55), 'blue', bevel=0.12, segments=3))
# The words go on in the game: the board's front face is at Y = IN_Y - 0.11, centred at Z = 3.55.

# Hose boom: a post on the right wall, a swivel, an arm out over the car, the hose and spray wand hanging down.
BOOM = (WALL_X, 0.4)
parts.append(kit.cylinder(0.09, 2.05, (BOOM[0], BOOM[1], WALL_H + 1.05), 'steel', verts=10))
parts.append(kit.cylinder(0.16, 0.2, (BOOM[0], BOOM[1], WALL_H + 2.1), 'yellow', verts=12, bevel=0.03))
arm_len = 2.1
parts.append(kit.cylinder(0.07, arm_len, (BOOM[0] - arm_len / 2, BOOM[1], WALL_H + 2.12), 'yellow', verts=10, rot=(0, math.pi / 2, 0)))
parts.append(kit.sphere(0.1, (BOOM[0] - arm_len, BOOM[1], WALL_H + 2.12), 'yellow', segments=10))
parts.append(kit.cylinder(0.035, 1.2, (BOOM[0] - arm_len, BOOM[1], WALL_H + 1.5), 'black', verts=6))
parts.append(kit.box((0.1, 0.14, 0.28), (BOOM[0] - arm_len, BOOM[1], WALL_H + 0.82), 'red', bevel=0.03))
parts.append(kit.cylinder(0.03, 0.55, (BOOM[0] - arm_len - 0.13, BOOM[1], WALL_H + 0.48), 'steel', verts=6, rot=(0, math.radians(-30), 0)))
parts.append(kit.cylinder(0.05, 0.08, (BOOM[0] - arm_len - 0.27, BOOM[1], WALL_H + 0.24), 'dark', verts=8, rot=(0, math.radians(-30), 0)))

# Control panel on the left wall by the way out: a yellow box with a screen, coin slot and three big buttons.
PANEL = (-WALL_X + 0.05, -1.55)
parts.append(kit.box((0.42, 0.8, 1.05), (PANEL[0], PANEL[1], WALL_H + 0.5), 'yellow', bevel=0.08))
parts.append(kit.box((0.46, 0.84, 0.1), (PANEL[0], PANEL[1], WALL_H + 1.06), 'white', bevel=0.04))
parts.append(kit.box((0.04, 0.5, 0.26), (PANEL[0] + 0.22, PANEL[1], WALL_H + 0.78), 'dark', bevel=0.02))
parts.append(kit.box((0.04, 0.38, 0.14), (PANEL[0] + 0.23, PANEL[1], WALL_H + 0.8), '#7ee0c3', bevel=0.0))
for i, c in enumerate(('red', '#3fdc6a', 'deepblue')):
    parts.append(kit.cylinder(0.075, 0.06, (PANEL[0] + 0.23, PANEL[1] - 0.22 + i * 0.22, WALL_H + 0.45), c, verts=10, rot=(0, math.pi / 2, 0)))
parts.append(kit.box((0.04, 0.12, 0.04), (PANEL[0] + 0.23, PANEL[1], WALL_H + 0.22), 'black', bevel=0.0))

# Foam brush in its holster on the right wall; soap bottles on the left wall's cap.
parts.append(kit.box((0.16, 0.16, 0.3), (WALL_X - 0.2, -1.4, WALL_H - 0.1), 'white', bevel=0.03))
parts.append(kit.cylinder(0.035, 0.9, (WALL_X - 0.2, -1.4, WALL_H + 0.35), 'steel', verts=6))
parts.append(kit.box((0.22, 0.42, 0.18), (WALL_X - 0.2, -1.4, WALL_H + 0.86), 'pink', bevel=0.06))
for i, c in enumerate(('pink', 'mint', 'yellow', 'lilac')):
    y = 0.15 + i * 0.26
    parts.append(kit.cylinder(0.075, 0.26, (-WALL_X, y, WALL_H + 0.23), c, verts=10, bevel=0.02))
    parts.append(kit.cylinder(0.03, 0.08, (-WALL_X, y, WALL_H + 0.4), 'white', verts=6))

# Foam dispenser on the right wall's cap, and a yellow line where the car stops.
parts.append(kit.box((0.4, 0.55, 0.42), (WALL_X, 1.4, WALL_H + 0.3), 'mint', bevel=0.08))
parts.append(kit.box((0.44, 0.6, 0.08), (WALL_X, 1.4, WALL_H + 0.54), 'white', bevel=0.03))
parts.append(kit.cylinder(0.05, 0.16, (WALL_X - 0.24, 1.4, WALL_H + 0.25), 'pink', verts=8, rot=(0, math.pi / 2, 0)))
parts.append(kit.box((3.2, 0.14, 0.012), (0, -1.95, 0.075), 'yellow', bevel=0.0))

# Bucket with a sponge, and a yellow wet-floor sign, at the way out.
parts.append(kit.cylinder(0.22, 0.34, (1.45, -2.15, 0.2), 'yellow', verts=12, bevel=0.03))
parts.append(kit.cylinder(0.18, 0.04, (1.45, -2.15, 0.36), '#bfe9ff', verts=12))
parts.append(kit.box((0.26, 0.16, 0.12), (1.45, -2.13, 0.42), 'pink', bevel=0.04, rot=(0, 0, 0.4)))
for s in (-1, 1):
    parts.append(kit.box((0.36, 0.04, 0.55), (-1.45, -2.2 + s * 0.09, 0.27), 'yellow', bevel=0.02, rot=(s * 0.28, 0, 0)))
parts.append(kit.box((0.18, 0.02, 0.18), (-1.45, -2.33, 0.3), 'black', bevel=0.0, rot=(0.28, 0, math.pi / 4)))

bay = kit.join(parts, 'wash_bay')
kit.use_material(bay, kit.toy_material('toy'))
print('triangles', kit.triangles([bay]))
out = sys.argv[1] if len(sys.argv) > 1 else 'wash-bay.glb'
kit.export([bay], out)
if len(sys.argv) > 2:
    print(kit.preview(sys.argv[2], look_at=(0, 0.2, 1.4), distance=13, angles=((0, -1, 1.2), (1.1, -1, 0.9))))
