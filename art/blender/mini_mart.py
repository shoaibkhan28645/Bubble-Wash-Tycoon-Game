"""The Mini-Mart: a little white shop with a mint base, a big window of
snack shelves, a pink door with a round window and an OPEN light, a
scalloped pink-and-white awning, a sign board above it (the game writes
MINI MART on it), a giant soda cup on the roof, an ice-cream freezer,
drink crates and a bin outside, and the till out front under a parasol.

Usage: python art/blender/mini_mart.py <out.glb> [preview.png]
Centred on the shop; its front (and the till) face -Y, the camera.
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import kit  # noqa: E402

WIDTH = 4.6
DEPTH = 3.6
WALL = 2.6
# The till stands this far out in front of the shop's middle (src/render/models/mart.ts MART_TILL_Z).
TILL_Y = -3.6
FRONT_Y = -DEPTH / 2

kit.reset()
parts = []
hw = WIDTH / 2

# The shop: a kerb plinth, white walls with a mint base, a pink roof lip.
parts.append(kit.box((WIDTH + 0.3, DEPTH + 0.3, 0.12), (0, 0, 0.06), 'kerb', bevel=0.03))
parts.append(kit.box((WIDTH, DEPTH, WALL), (0, 0, WALL / 2 + 0.1), 'white', bevel=0.08))
parts.append(kit.box((WIDTH + 0.04, DEPTH + 0.04, 0.5), (0, 0, 0.35), 'mint', bevel=0.05))
parts.append(kit.box((WIDTH + 0.4, DEPTH + 0.4, 0.24), (0, 0, WALL + 0.2), 'pink', bevel=0.08))
parts.append(kit.box((WIDTH + 0.2, DEPTH + 0.2, 0.1), (0, 0, WALL + 0.36), '#ffd6ea', bevel=0.04))
# On the roof: an air-conditioning unit with a fan grille, and two vent pipes.
parts.append(kit.box((0.9, 0.7, 0.45), (-1.3, 0.6, WALL + 0.62), 'kerb', bevel=0.06))
parts.append(kit.cylinder(0.26, 0.04, (-1.3, 0.6, WALL + 0.86), 'dark', verts=14))
parts.append(kit.cylinder(0.22, 0.05, (-1.3, 0.6, WALL + 0.87), 'steel', verts=14))
for x in (-0.3, 0.0):
    parts.append(kit.cylinder(0.07, 0.4, (x, 1.2, WALL + 0.6), 'steel', verts=8))
    parts.append(kit.cylinder(0.1, 0.05, (x, 1.2, WALL + 0.82), 'dark', verts=8))

# Front: a pink door with a round window on the left, an OPEN light, a big window of snack shelves.
parts.append(kit.box((0.95, 0.1, 1.95), (-hw + 0.75, FRONT_Y - 0.02, 1.1), 'pink', bevel=0.05))
parts.append(kit.cylinder(0.2, 0.05, (-hw + 0.75, FRONT_Y - 0.08, 1.55), '#9fd4f7', verts=14, rot=(math.pi / 2, 0, 0)))
parts.append(kit.sphere(0.06, (-hw + 1.08, FRONT_Y - 0.1, 1.05), 'yellow', segments=8))
parts.append(kit.box((0.5, 0.06, 0.22), (-hw + 0.75, FRONT_Y - 0.06, 2.3), 'red', bevel=0.04))
parts.append(kit.box((0.4, 0.07, 0.12), (-hw + 0.75, FRONT_Y - 0.08, 2.3), '#fff3b0', bevel=0.02))
WINDOW_X = 0.55
parts.append(kit.box((3.1, 0.08, 1.55), (WINDOW_X, FRONT_Y - 0.01, 1.5), 'white', bevel=0.04))
parts.append(kit.box((2.9, 0.06, 1.38), (WINDOW_X, FRONT_Y - 0.03, 1.5), '#cfeefc', bevel=0.0))
colours = ['red', 'yellow', 'blue', 'mint', 'lilac', 'gold', 'hotpink']
for row in range(3):
    parts.append(kit.box((2.8, 0.22, 0.04), (WINDOW_X, FRONT_Y - 0.08, 0.98 + row * 0.42), 'white', bevel=0.0))
    for i in range(8):
        parts.append(kit.box((0.22, 0.12, 0.3), (WINDOW_X - 1.25 + i * 0.36, FRONT_Y - 0.12, 1.14 + row * 0.42), colours[(i + row * 3) % len(colours)], bevel=0.03))

# The sign board above the awning, facing the camera (the game writes MINI MART on it).
parts.append(kit.box((3.6, 0.16, 0.66), (0, FRONT_Y - 0.12, WALL - 0.08), 'hotpink', bevel=0.12, segments=2))
parts.append(kit.box((3.4, 0.18, 0.5), (0, FRONT_Y - 0.13, WALL - 0.08), 'white', bevel=0.08, segments=2))
# The words go on in the game: the board's front face is at Y = FRONT_Y - 0.22, centred at Z = WALL - 0.08.

# Scalloped pink-and-white awning sloping out over the shop front.
stripes = 8
for i in range(stripes):
    x = -hw + (WIDTH / stripes) * (i + 0.5)
    c = 'pink' if i % 2 == 0 else 'white'
    parts.append(kit.box((WIDTH / stripes + 0.01, 1.25, 0.06), (x, FRONT_Y - 0.6, 2.05), c, bevel=0.0, rot=(-0.38, 0, 0)))
parts.append(kit.box((WIDTH + 0.06, 0.06, 0.16), (0, FRONT_Y - 1.18, 1.77), 'hotpink', bevel=0.02))

# A giant soda cup on the roof: pink and white bands, a lid, a striped straw.
CUP = (0.9, 0.3, WALL + 0.42)
for i in range(4):
    r0 = 0.48 + i * 0.05
    parts.append(kit.cone(r0, r0 + 0.05, 0.3, (CUP[0], CUP[1], CUP[2] + 0.15 + i * 0.3), 'hotpink' if i % 2 == 0 else 'white', verts=16))
parts.append(kit.cylinder(0.72, 0.12, (CUP[0], CUP[1], CUP[2] + 1.28), 'white', verts=16, bevel=0.04))
parts.append(kit.cone(0.6, 0.3, 0.2, (CUP[0], CUP[1], CUP[2] + 1.44), 'white', verts=16))
for i in range(3):
    parts.append(kit.cylinder(0.07, 0.3, (CUP[0] + 0.12 + i * 0.07, CUP[1], CUP[2] + 1.65 + i * 0.27), 'red' if i % 2 == 0 else 'white', verts=8, rot=(0, 0.25, 0)))

# Down the right side (the left stays clear: it's the way round the shop): an ice-cream
# freezer chest, drink crates and a bin.
parts.append(kit.box((0.55, 0.9, 0.75), (hw + 0.4, FRONT_Y + 0.6, 0.38), 'blue', bevel=0.08))
parts.append(kit.box((0.59, 0.94, 0.1), (hw + 0.4, FRONT_Y + 0.6, 0.8), 'white', bevel=0.04))
parts.append(kit.box((0.22, 0.04, 0.22), (hw + 0.4, FRONT_Y + 0.13, 0.5), 'yellow', bevel=0.02))
for i, c in enumerate(('red', 'blue', 'red')):
    parts.append(kit.box((0.45, 0.5, 0.28), (hw + 0.35, FRONT_Y + 1.6, 0.14 + i * 0.29), c, bevel=0.03))
parts.append(kit.cylinder(0.2, 0.55, (hw + 0.32, FRONT_Y + 2.5, 0.28), '#3fae5a', verts=12, bevel=0.03))

# The till out front: a mint counter with a white top, register, lollipop jar and a rack of crisps, under a parasol.
parts.append(kit.box((2.2, 0.6, 0.9), (0, TILL_Y, 0.45), 'mint', bevel=0.08))
parts.append(kit.box((2.3, 0.7, 0.08), (0, TILL_Y, 0.94), 'white', bevel=0.03))
parts.append(kit.box((0.5, 0.36, 0.26), (0.45, TILL_Y + 0.05, 1.11), 'dark', bevel=0.05))
parts.append(kit.box((0.36, 0.04, 0.2), (0.45, TILL_Y + 0.18, 1.34), '#9fe3ff', bevel=0.0, rot=(0.3, 0, 0)))
parts.append(kit.cylinder(0.13, 0.26, (-0.15, TILL_Y, 1.11), '#cfeeff', verts=10))
for i, c in enumerate(('red', 'yellow', 'pink')):
    parts.append(kit.sphere(0.06, (-0.2 + i * 0.05, TILL_Y + 0.02, 1.3 + i * 0.03), c, segments=8))
for i in range(3):
    parts.append(kit.box((0.18, 0.1, 0.24), (-0.75 + i * 0.2, TILL_Y - 0.12, 1.1), colours[i], bevel=0.02))
parts.append(kit.cylinder(0.04, 1.6, (1.0, TILL_Y + 0.1, 1.7), 'white', verts=6))
parts.append(kit.cone(0.95, 0.06, 0.38, (1.0, TILL_Y + 0.1, 2.48), 'yellow', verts=8))
parts.append(kit.cone(0.97, 0.9, 0.06, (1.0, TILL_Y + 0.1, 2.27), 'white', verts=8))
parts.append(kit.sphere(0.07, (1.0, TILL_Y + 0.1, 2.7), 'white', segments=8))

mart = kit.join(parts, 'mini_mart')
kit.use_material(mart, kit.toy_material('toy'))
print('triangles', kit.triangles([mart]))
kit.export([mart], sys.argv[1] if len(sys.argv) > 1 else 'mini-mart.glb')
if len(sys.argv) > 2:
    print(kit.preview(sys.argv[2], look_at=(0, -1.2, 1.6), distance=13, angles=((0, -1, 1.2), (1.1, -1, 0.9))))
