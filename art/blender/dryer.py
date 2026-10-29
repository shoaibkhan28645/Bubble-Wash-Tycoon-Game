"""The dryer: a drive-through blower arch. Two rounded blower towers with
big round air nozzles aimed at the car, a hood across the top with the
sign board on its front (the game writes DRYER on it), a big fan on top
(a separate object the game spins), warning lights, a drip-tray floor, and
a towel rack with a laundry basket by the way out.

Usage: python art/blender/dryer.py <out.glb> [preview.png]
Cars drive in at +Y and out at -Y (towards the camera).
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import kit  # noqa: E402

LENGTH = 3.8
TOWER_X = 1.95
HOOD_Z = 2.75
FAN_Z = 3.35
# The hood sits towards the way in, so the camera sees more of the car under it.
HOOD_Y = 0.45

kit.reset()
parts = []

# Floor: a grey-blue drip tray with a grate down the middle.
parts.append(kit.box((3.6, LENGTH, 0.06), (0, 0, 0.03), '#b8cfe0', bevel=0.02))
parts.append(kit.box((3.3, LENGTH - 0.3, 0.02), (0, 0, 0.065), '#d6e8f5', bevel=0.0))
parts.append(kit.box((0.6, LENGTH - 0.6, 0.02), (0, 0, 0.08), 'dark', bevel=0.0))
for i in range(8):
    parts.append(kit.box((0.52, 0.06, 0.012), (0, -1.4 + i * 0.4, 0.095), 'steel', bevel=0.0))

# Blower towers either side: navy foot, rounded sky blue tower, white panel facing the car, big round nozzles.
for side in (-1, 1):
    x = side * TOWER_X
    parts.append(kit.box((0.75, 1.7, 0.2), (x, 0, 0.1), 'deepblue', bevel=0.05))
    parts.append(kit.box((0.6, 1.5, 2.45), (x, 0, 1.4), 'blue', bevel=0.22, segments=2))
    parts.append(kit.box((0.6, 0.6, 0.5), (x, HOOD_Y + 0.45, 2.45), 'blue', bevel=0.1))
    parts.append(kit.box((0.08, 1.2, 2.0), (x - side * 0.29, 0, 1.35), 'white', bevel=0.04))
    for y in (-0.33, 0.33):
        for z in (0.75, 1.35, 1.95):
            parts.append(kit.cylinder(0.2, 0.12, (x - side * 0.36, y, z), 'white', verts=14, rot=(0, math.pi / 2, 0)))
            parts.append(kit.cylinder(0.14, 0.13, (x - side * 0.37, y, z), 'dark', verts=12, rot=(0, math.pi / 2, 0)))
    # A yellow warning lamp on top of each tower.
    parts.append(kit.cylinder(0.13, 0.12, (x, HOOD_Y - 0.55, HOOD_Z + 0.36), 'white', verts=10))
    parts.append(kit.sphere(0.12, (x, HOOD_Y - 0.55, HOOD_Z + 0.48), 'yellow', segments=10))

# The hood across the top: rounded, white trim, a dark air slot underneath, the sign board on its front.
parts.append(kit.box((4.6, 1.5, 0.62), (0, HOOD_Y, HOOD_Z), 'blue', bevel=0.22, segments=2))
parts.append(kit.box((4.66, 1.56, 0.12), (0, HOOD_Y, HOOD_Z - 0.2), 'white', bevel=0.04))
parts.append(kit.box((3.2, 0.24, 0.04), (0, HOOD_Y, HOOD_Z - 0.31), 'dark', bevel=0.0))
parts.append(kit.box((2.2, 0.16, 0.5), (0, HOOD_Y - 0.78, HOOD_Z + 0.04), 'deepblue', bevel=0.1, segments=2))
parts.append(kit.box((2.0, 0.18, 0.36), (0, HOOD_Y - 0.79, HOOD_Z + 0.04), 'white', bevel=0.08, segments=2))
# The words go on in the game: the board's front face is at Y = HOOD_Y - 0.88, centred at Z = HOOD_Z + 0.04.

# The fan's housing on top of the hood: a white drum with a grille ring.
parts.append(kit.cylinder(0.78, 0.3, (0, HOOD_Y, HOOD_Z + 0.45), 'white', verts=20, bevel=0.05))
parts.append(kit.torus(0.74, 0.06, (0, HOOD_Y, HOOD_Z + 0.62), 'deepblue', major_segments=24, minor_segments=6))

# Towel rack and laundry basket by the way out, on the worker's side.
RACK = (-2.65, -1.25)
for dy in (-0.32, 0.32):
    parts.append(kit.box((0.06, 0.06, 1.0), (RACK[0], RACK[1] + dy, 0.5), 'white', bevel=0.02))
for i, c in enumerate(('pink', 'mint', 'yellow', 'blue')):
    parts.append(kit.box((0.42, 0.66, 0.12), (RACK[0], RACK[1], 0.25 + i * 0.22), c, bevel=0.05))
parts.append(kit.cylinder(0.26, 0.38, (-2.65, -0.35, 0.2), 'yellow', verts=12, bevel=0.03))
parts.append(kit.sphere(0.2, (-2.65, -0.35, 0.42), 'white', segments=10))

dryer = kit.join(parts, 'dryer_body')

# The fan: a hub and five chunky blades, spun by the game round its own axis.
fan_parts = [kit.cylinder(0.14, 0.14, (0, HOOD_Y, FAN_Z), 'yellow', verts=12, bevel=0.03)]
for i in range(5):
    a = i * 2 * math.pi / 5
    fan_parts.append(kit.box((0.6, 0.2, 0.05), (0.38 * math.cos(a), HOOD_Y + 0.38 * math.sin(a), FAN_Z), 'steel', bevel=0.03, rot=(0.35, 0, a)))
fan = kit.join(fan_parts, 'dryer_fan')
kit.set_origin(fan, (0, HOOD_Y, FAN_Z))

toy = kit.toy_material('toy')
kit.use_material(dryer, toy)
kit.use_material(fan, toy)
print('triangles', kit.triangles([dryer, fan]))
kit.export([dryer, fan], sys.argv[1] if len(sys.argv) > 1 else 'dryer.glb')
if len(sys.argv) > 2:
    print(kit.preview(sys.argv[2], look_at=(-0.4, 0, 1.6), distance=12, angles=((0, -1, 1.2), (1.1, -1, 0.9))))
