"""Town 1's landmark, the Duck Fountain: a round plaza with a pink basin of
water, and a giant rubber duck in a gold crown on a pedestal in the middle,
with flower planters round it. The duck is its own node (`landmark_duck`,
origin on the pedestal) so the game can bob it; the game also adds rising
bubbles. Front faces -Y (the camera).

Usage: python art/blender/landmark.py <out.glb> [preview.png]
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import kit  # noqa: E402

kit.reset()

# The plaza, basin wall with white tiles, the water and the rim.
p = [kit.cylinder(3.3, 0.04, (0, 0, 0.02), '#e8dcc8', verts=40)]
p.append(kit.cylinder(3.0, 0.03, (0, 0, 0.045), '#d6c7ae', verts=40))
p.append(kit.cylinder(2.35, 0.45, (0, 0, 0.225), 'pink', verts=36))
for i in range(18):
    a = i * 2 * math.pi / 18
    p.append(kit.sphere(0.09, (2.36 * math.cos(a), 2.36 * math.sin(a), 0.24), 'white', segments=8))
p.append(kit.cylinder(2.15, 0.04, (0, 0, 0.44), '#6fcaf2', verts=36))
p.append(kit.torus(2.25, 0.13, (0, 0, 0.47), 'white', major_segments=36, minor_segments=6))
# Ripples on the water.
for r in (1.25, 1.75):
    p.append(kit.torus(r, 0.025, (0, 0, 0.465), '#bfe9ff', major_segments=28, minor_segments=4))
# The pedestal.
p.append(kit.cylinder(0.75, 0.5, (0, 0, 0.5), 'white', verts=20, bevel=0.04))
p.append(kit.cylinder(0.9, 0.14, (0, 0, 0.8), 'blue', verts=20, bevel=0.04))
# Flower planters on the diagonals.
for i in range(4):
    a = math.pi / 4 + i * math.pi / 2
    x, y = 2.85 * math.cos(a), 2.85 * math.sin(a)
    p.append(kit.box((0.62, 0.62, 0.36), (x, y, 0.18), 'wood', bevel=0.05))
    p.append(kit.sphere(0.32, (x, y, 0.45), '#6fc35a', segments=10))
    for j, col in enumerate(('hotpink', 'yellow', 'white')):
        b = j * 2.1
        p.append(kit.sphere(0.09, (x + 0.2 * math.cos(b), y + 0.2 * math.sin(b), 0.7), col, segments=8))
# A gold plaque at the front.
p.append(kit.box((0.18, 0.18, 0.5), (0, -2.75, 0.25), 'kerb', bevel=0.03))
p.append(kit.box((0.7, 0.08, 0.4), (0, -2.8, 0.58), 'gold', bevel=0.04, rot=(-0.3, 0, 0)))
base = kit.join(p, 'landmark_base')

# The giant rubber duck: a long body with a perky tail, wings, a round head,
# an orange beak, shiny eyes and a little gold crown.
D = 0.87
d = [
    kit.sphere(0.95, (0, -0.1, D + 0.75), 'yellow', segments=20),
    kit.sphere(0.82, (0, 0.5, D + 0.8), 'yellow', segments=18),
    kit.cone(0.42, 0.08, 0.6, (0, 1.15, D + 1.3), 'yellow', verts=12, rot=(-0.9, 0, 0)),
    kit.sphere(0.64, (0, -0.55, D + 1.95), 'yellow', segments=18),
    kit.box((0.6, 0.5, 0.2), (0, -1.15, D + 1.82), '#ff9f1c', bevel=0.09, segments=2),
    kit.box((0.5, 0.4, 0.12), (0, -1.1, D + 1.68), '#f08a10', bevel=0.05),
]
for sx in (-1, 1):
    d.append(kit.sphere(0.48, (sx * 0.8, 0.15, D + 0.9), 'gold', segments=14))
    d.append(kit.sphere(0.12, (sx * 0.27, -1.08, D + 2.12), 'black', segments=10))
    d.append(kit.sphere(0.045, (sx * 0.27 + 0.04, -1.18, D + 2.17), 'white', segments=6))
d.append(kit.cylinder(0.32, 0.22, (0, -0.5, D + 2.6), 'gold', verts=14))
for i in range(5):
    a = i * 2 * math.pi / 5
    d.append(kit.cone(0.09, 0.0, 0.22, (0.28 * math.cos(a), -0.5 + 0.28 * math.sin(a), D + 2.81), 'gold', verts=6))
d.append(kit.sphere(0.07, (0, -0.8, D + 2.62), 'red', segments=8))
duck = kit.join(d, 'landmark_duck')
kit.set_origin(duck, (0, 0, D))

toy = kit.toy_material('toy')
for obj in (base, duck):
    kit.use_material(obj, toy)
print('triangles', kit.triangles([base, duck]))
kit.export([base, duck], sys.argv[1] if len(sys.argv) > 1 else 'landmark.glb')
if len(sys.argv) > 2:
    print(kit.preview(sys.argv[2], look_at=(0, 0, 1.4), distance=14, angles=((0, -1, 1.2), (1, -0.6, 0.7))))
