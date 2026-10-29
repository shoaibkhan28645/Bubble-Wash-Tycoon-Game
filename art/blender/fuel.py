"""The fuel forecourt: the pump island with its canopy (a thick red-and-white
band round an open roof, downlights, two striped columns, bollards, a bin and
a squeegee bucket) and a tall price sign by the road; and, as its own model,
one fuel pump (placed once per lane by the game).

Usage: python art/blender/fuel.py <canopy.glb> <pump.glb> [preview.png]
Centred on the island. The road is at -Y (the game's +Z, towards the
camera); the pump faces -Y, the lane nearer the road.
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import kit  # noqa: E402

WIDTH = 6.0
LENGTH = 6.4
HEIGHT = 3.6
HALF_ISLAND = 1.4
# The price sign, at the forecourt's corner by the road and the way out (game: x -5.9, z +4.6 from the island).
TOTEM = (-5.9, -4.6)

kit.reset()
canopy = []

# The island: a raised kerb with yellow-and-black ends, bollards, a bin and a squeegee bucket.
canopy.append(kit.box((HALF_ISLAND * 2, 0.9, 0.22), (0, 0, 0.11), 'concrete', bevel=0.05))
canopy.append(kit.box((HALF_ISLAND * 2 + 0.06, 0.96, 0.06), (0, 0, 0.03), 'kerb', bevel=0.02))
for sx in (-1, 1):
    for i in range(3):
        canopy.append(kit.box((0.12, 0.92, 0.23), (sx * (HALF_ISLAND - 0.08 - i * 0.13), 0, 0.12), 'yellow' if i % 2 == 0 else 'black', bevel=0.0))
    canopy.append(kit.cylinder(0.1, 0.85, (sx * (HALF_ISLAND + 0.22), 0, 0.43), 'yellow', verts=12, bevel=0.03))
    canopy.append(kit.cylinder(0.105, 0.12, (sx * (HALF_ISLAND + 0.22), 0, 0.62), 'red', verts=12))
    canopy.append(kit.sphere(0.1, (sx * (HALF_ISLAND + 0.22), 0, 0.87), 'yellow', segments=10))
canopy.append(kit.cylinder(0.14, 0.42, (-0.95, 0.28, 0.43), '#3fae5a', verts=12, bevel=0.03))
canopy.append(kit.cylinder(0.15, 0.05, (-0.95, 0.28, 0.65), 'dark', verts=12))
canopy.append(kit.cylinder(0.13, 0.3, (0.95, -0.28, 0.37), 'blue', verts=12, bevel=0.02))
canopy.append(kit.box((0.04, 0.04, 0.55), (0.95, -0.28, 0.65), 'steel', bevel=0.0, rot=(0.3, 0, 0)))

# Two columns on the island: blue tile base, white shaft with a red band, a cap.
for sx in (-1, 1):
    x = sx * 1.05
    canopy.append(kit.box((0.5, 0.5, 0.35), (x, 0, 0.4), 'deepblue', bevel=0.06))
    canopy.append(kit.box((0.36, 0.36, HEIGHT - 0.55), (x, 0, 0.55 + (HEIGHT - 0.55) / 2), 'white', bevel=0.07))
    canopy.append(kit.box((0.4, 0.4, 0.28), (x, 0, 1.3), 'red', bevel=0.05))
    canopy.append(kit.box((0.5, 0.5, 0.16), (x, 0, HEIGHT - 0.02), 'white', bevel=0.05))

# The canopy band: thick red, a white stripe round the middle, a dark lip underneath with downlights.
band = 0.55
for sy in (-1, 1):
    y = sy * (LENGTH / 2 - 0.15)
    canopy.append(kit.box((WIDTH, 0.3, band), (0, y, HEIGHT + band / 2), 'red', bevel=0.08))
    canopy.append(kit.box((WIDTH + 0.04, 0.34, 0.12), (0, y, HEIGHT + band / 2), 'white', bevel=0.03))
for sx in (-1, 1):
    x = sx * (WIDTH / 2 - 0.15)
    canopy.append(kit.box((0.3, LENGTH - 0.3, band), (x, 0, HEIGHT + band / 2), 'red', bevel=0.08))
    canopy.append(kit.box((0.34, LENGTH - 0.26, 0.12), (x, 0, HEIGHT + band / 2), 'white', bevel=0.03))
for sy in (-1, 1):
    for i in range(5):
        canopy.append(kit.cylinder(0.11, 0.04, (-2.2 + i * 1.1, sy * (LENGTH / 2 - 0.3), HEIGHT - 0.01), '#fff3b0', verts=10))
for sx in (-1, 1):
    for i in range(4):
        canopy.append(kit.cylinder(0.11, 0.04, (sx * (WIDTH / 2 - 0.3), -2.1 + i * 1.4, HEIGHT - 0.01), '#fff3b0', verts=10))
# The sign board on the far edge, facing the camera (the game writes FUEL on it).
for sx in (-1, 1):
    canopy.append(kit.box((0.12, 0.12, 0.5), (sx * 0.75, LENGTH / 2 - 0.15, HEIGHT + band + 0.25), 'white', bevel=0.03))
canopy.append(kit.box((2.3, 0.2, 0.82), (0, LENGTH / 2 - 0.12, HEIGHT + band + 0.82), 'white', bevel=0.16, segments=3))
canopy.append(kit.box((2.1, 0.22, 0.64), (0, LENGTH / 2 - 0.14, HEIGHT + band + 0.82), 'red', bevel=0.12, segments=3))
# The words go on in the game: the board's front face is at Y = LENGTH / 2 - 0.25, centred at Z = HEIGHT + band + 0.82.

# The price sign by the road: a tall pillar and a red panel with white price rows and a yellow drop.
tx, ty = TOTEM
canopy.append(kit.box((0.7, 0.5, 0.25), (tx, ty, 0.125), 'concrete', bevel=0.04))
canopy.append(kit.box((0.26, 0.26, 3.2), (tx, ty, 1.6), 'white', bevel=0.05))
canopy.append(kit.box((1.3, 0.24, 1.7), (tx, ty, 3.55), 'red', bevel=0.12, segments=2))
canopy.append(kit.box((1.36, 0.28, 0.12), (tx, ty, 2.72), 'white', bevel=0.03))
canopy.append(kit.sphere(0.24, (tx, ty - 0.12, 4.05), 'yellow', segments=12))
canopy.append(kit.box((0.24, 0.1, 0.24), (tx, ty - 0.12, 4.22), 'yellow', bevel=0.0, rot=(0, math.pi / 4, 0)))
for i in range(3):
    canopy.append(kit.box((0.9, 0.04, 0.2), (tx, ty - 0.13, 3.6 - i * 0.3), 'white', bevel=0.02))

island = kit.join(canopy, 'fuel_canopy')
# The roof: tinted glass inside the band, so it reads as a canopy but the cars underneath stay in sight.
roof = kit.box((WIDTH - 0.5, LENGTH - 0.5, 0.06), (0, 0, HEIGHT + 0.42), '#ffe6e6', bevel=0.0)
roof.name = 'fuel_canopy_glass'
roof.data.name = 'fuel_canopy_glass'

# One fuel pump, facing -Y: a plinth, a white body with a red stripe, a lit red header, a screen,
# buttons, and a green nozzle in its holster with the hose looping down.
pump = []
pump.append(kit.box((0.86, 0.5, 0.1), (0, 0, 0.27), 'kerb', bevel=0.03))
pump.append(kit.box((0.74, 0.44, 1.25), (0, 0, 0.95), 'white', bevel=0.08, segments=2))
pump.append(kit.box((0.78, 0.48, 0.12), (0, 0, 0.5), 'red', bevel=0.04))
pump.append(kit.box((0.84, 0.52, 0.34), (0, 0, 1.73), 'red', bevel=0.09, segments=2))
pump.append(kit.box((0.6, 0.04, 0.2), (0, -0.27, 1.74), '#fff3b0', bevel=0.02))
pump.append(kit.box((0.5, 0.04, 0.34), (0, -0.23, 1.25), 'dark', bevel=0.03))
pump.append(kit.box((0.4, 0.04, 0.14), (0, -0.25, 1.3), 'mint', bevel=0.0))
for i in range(3):
    pump.append(kit.cylinder(0.04, 0.04, (-0.12 + i * 0.12, -0.24, 1.0), 'yellow', verts=8, rot=(math.pi / 2, 0, 0)))
pump.append(kit.box((0.16, 0.1, 0.26), (0.22, -0.25, 0.85), 'dark', bevel=0.03))
pump.append(kit.box((0.12, 0.14, 0.24), (0.22, -0.3, 0.86), '#3fae5a', bevel=0.04))
pump.append(kit.cylinder(0.025, 0.12, (0.22, -0.4, 0.8), 'steel', verts=6, rot=(math.radians(60), 0, 0)))
pump.append(kit.torus(0.17, 0.03, (0.4, -0.12, 0.6), 'black', rot=(0, math.pi / 2, 0), major_segments=14, minor_segments=5))
dispenser = kit.join(pump, 'fuel_pump')

toy = kit.toy_material('toy')
kit.use_material(island, toy)
kit.use_material(roof, kit.toy_material('glass', alpha=0.3))
kit.use_material(dispenser, toy)
print('triangles', kit.triangles([island]), kit.triangles([dispenser]))
kit.export([island, roof], sys.argv[1] if len(sys.argv) > 1 else 'fuel-canopy.glb')
kit.export([dispenser], sys.argv[2] if len(sys.argv) > 2 else 'fuel-pump.glb')
if len(sys.argv) > 3:
    # Preview: a pump on each side of the island, like the game places them.
    import bpy
    for sy, name in ((-1, 'road'), (1, 'far')):
        copy = dispenser.copy()
        copy.data = dispenser.data
        copy.location = (sy * -0.45, sy * 0.0, 0)
        copy.rotation_euler = (0, 0, 0 if sy < 0 else math.pi)
        bpy.context.collection.objects.link(copy)
    dispenser.hide_render = True
    print(kit.preview(sys.argv[3], look_at=(-1.8, -1.6, 1.6), distance=22, angles=((0, -1, 1.2), (1.1, -1, 0.9))))
