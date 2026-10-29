"""The wax and polish station: a golden tower each side holding two big
polishing pads against the car (separate objects the game spins), a low
foam bar across the middle with red, yellow and blue foam nozzles and the
sign board on its front (the game writes WAX on it), golden stars on the
towers, a cream floor with a gold border and sparkle tiles, and a cart of
wax tins and polish bottles by the way out. Kept low at the back so the
dryer behind it stays in view.

Usage: python art/blender/wax.py <out.glb> [preview.png]
Cars drive in at +Y and out at -Y (towards the camera).
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import kit  # noqa: E402

LENGTH = 3.8
TOWER_X = 1.95
BAR_Z = 2.2
PAD_X = 1.12
PAD_Z = 0.85

kit.reset()
parts = []

# Floor: cream tiles with a gold border and a few sparkle tiles.
parts.append(kit.box((3.6, LENGTH, 0.06), (0, 0, 0.03), 'gold', bevel=0.02))
parts.append(kit.box((3.3, LENGTH - 0.3, 0.02), (0, 0, 0.065), '#f4ead2', bevel=0.0))
for (x, y) in ((-1.1, 1.3), (1.0, -1.25), (-0.9, -0.6), (1.2, 0.8), (0.1, 1.55)):
    parts.append(kit.box((0.22, 0.22, 0.012), (x, y, 0.08), 'yellow', bevel=0.0, rot=(0, 0, math.pi / 4)))
    parts.append(kit.box((0.1, 0.1, 0.014), (x, y, 0.082), 'white', bevel=0.0, rot=(0, 0, math.pi / 4)))

# Golden towers either side: a white panel facing the car, a cap, and a star on top.
for side in (-1, 1):
    x = side * TOWER_X
    parts.append(kit.box((0.7, 1.3, 0.2), (x, 0, 0.1), '#e0a020', bevel=0.05))
    parts.append(kit.box((0.55, 1.1, 1.95), (x, 0, 1.15), 'gold', bevel=0.16, segments=2))
    parts.append(kit.box((0.06, 0.8, 1.4), (x - side * 0.27, 0, 1.1), 'white', bevel=0.03))
    parts.append(kit.box((0.62, 1.18, 0.12), (x, 0, 2.15), 'white', bevel=0.04))
    star = kit.star_disc(0.32, 0.14, 0.09, (x, 0, 2.6), 'yellow', points=5)
    star.rotation_euler = (math.pi / 2, 0, 0)
    kit._apply_all(star)
    parts.append(star)
    parts.append(kit.cylinder(0.04, 0.3, (x, 0, 2.3), 'white', verts=6))
    # Arms reaching in to the polishing pads.
    for y in (-0.48, 0.48):
        parts.append(kit.box((TOWER_X - PAD_X - 0.05, 0.14, 0.14), (side * (TOWER_X + PAD_X) / 2, y, PAD_Z), 'white', bevel=0.04))
        parts.append(kit.cylinder(0.08, 0.12, (side * (PAD_X + 0.18), y, PAD_Z), 'dark', verts=10, rot=(0, math.pi / 2, 0)))

# The foam bar across the middle, between the tower tops: three foam nozzles and the sign board.
parts.append(kit.box((4.3, 0.34, 0.3), (0, 0, BAR_Z + 0.05), 'white', bevel=0.1))
parts.append(kit.box((4.34, 0.38, 0.08), (0, 0, BAR_Z - 0.06), 'gold', bevel=0.03))
for x, c in ((-0.95, 'red'), (0.0, 'yellow'), (0.95, 'blue')):
    parts.append(kit.cylinder(0.16, 0.28, (x, 0, BAR_Z - 0.22), c, verts=12, bevel=0.03))
    parts.append(kit.cylinder(0.09, 0.12, (x, 0, BAR_Z - 0.4), 'white', verts=10))
parts.append(kit.box((1.5, 0.12, 0.5), (0, -0.22, BAR_Z + 0.42), '#e0a020', bevel=0.1, segments=2))
parts.append(kit.box((1.34, 0.14, 0.36), (0, -0.23, BAR_Z + 0.42), 'white', bevel=0.08, segments=2))
# The words go on in the game: the board's front face is at Y = -0.30, centred at Z = BAR_Z + 0.42.

# A cart of wax tins and polish bottles by the way out, on the worker's side.
CART = (-2.6, -1.2)
for z in (0.2, 0.62):
    parts.append(kit.box((0.6, 0.8, 0.08), (CART[0], CART[1], z), 'white', bevel=0.03))
for dy in (-0.35, 0.35):
    parts.append(kit.box((0.06, 0.06, 0.62), (CART[0], CART[1] + dy, 0.41), 'steel', bevel=0.02))
    parts.append(kit.cylinder(0.06, 0.04, (CART[0] - 0.22, CART[1] + dy, 0.06), 'dark', verts=8, rot=(0, math.pi / 2, 0)))
for i, c in enumerate(('gold', 'yellow', 'gold')):
    parts.append(kit.cylinder(0.11, 0.15, (CART[0], CART[1] - 0.25 + i * 0.25, 0.74), c, verts=12, bevel=0.02))
for i, c in enumerate(('pink', 'blue')):
    parts.append(kit.cylinder(0.06, 0.24, (CART[0] + 0.1, CART[1] - 0.15 + i * 0.3, 0.36), c, verts=8, bevel=0.02))

wax = kit.join(parts, 'wax_body')


def pad(index, x, y):
    """A fluffy polishing pad: a cream bristly disc on a gold backing plate, turning about X."""
    side = 1 if x > 0 else -1
    bits = [
        kit.cylinder(0.3, 0.06, (x + side * 0.07, y, PAD_Z), '#e0a020', verts=16, rot=(0, math.pi / 2, 0)),
        kit.star_disc(0.36, 0.31, 0.16, (x - side * 0.04, y, PAD_Z), '#fff3c4', points=12),
    ]
    bits[1].rotation_euler = (0, math.pi / 2, 0)
    kit._apply_all(bits[1])
    obj = kit.join(bits, f'wax_pad_{index}')
    kit.set_origin(obj, (x, y, PAD_Z))
    return obj


pads = [pad(i, sx * PAD_X, y) for i, (sx, y) in enumerate(((-1, -0.48), (-1, 0.48), (1, -0.48), (1, 0.48)))]

toy = kit.toy_material('toy')
for obj in (wax, *pads):
    kit.use_material(obj, toy)
print('triangles', kit.triangles([wax, *pads]))
kit.export([wax, *pads], sys.argv[1] if len(sys.argv) > 1 else 'wax.glb')
if len(sys.argv) > 2:
    print(kit.preview(sys.argv[2], look_at=(-0.4, 0, 1.2), distance=11, angles=((0, -1, 1.2), (1.1, -1, 0.9))))
