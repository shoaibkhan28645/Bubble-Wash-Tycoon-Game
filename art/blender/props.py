"""The small props, all in one file as separately named models (each with
its origin at its own base): the garden hose reel, the pay kiosk, the
supply shelf, the waiting bench, the vending machine, the roadside sign,
the moving truck to the next town and the contracts board. Fronts face -Y
(the camera); the truck drives towards +X. The game writes the signs' words.

Usage: python art/blender/props.py <out.glb> [preview.png]
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import kit  # noqa: E402

kit.reset()
props = []
bases = []


def finish(parts, name, x):
    # The mesh sits in a named empty at the prop's base: shrinking the file
    # (quantizing) moves and scales the mesh's own node, so the game places
    # the empty and leaves the mesh's node as it is.
    obj = kit.join(parts, name + '_mesh')
    kit.set_origin(obj, (x, 0, 0))
    base = kit.bpy.data.objects.new(name, None)
    kit.bpy.context.scene.collection.objects.link(base)
    base.location = (x, 0, 0)
    obj.location = (0, 0, 0)
    obj.parent = base
    props.append(obj)
    bases.append(base)


# Garden hose: a wheeled reel cart with a coiled yellow hose, a spray gun and a puddle.
X = -9.0
p = [kit.cylinder(0.5, 0.01, (X + 0.25, -0.3, 0.01), '#8cc8ee', verts=14)]
p.append(kit.box((0.8, 0.6, 0.14), (X, 0, 0.25), 'blue', bevel=0.04))
for sx in (-1, 1):
    p.append(kit.cylinder(0.16, 0.1, (X + sx * 0.42, 0.15, 0.16), 'dark', verts=12, rot=(0, math.pi / 2, 0)))
    p.append(kit.box((0.08, 0.12, 0.9), (X + sx * 0.32, 0, 0.75), 'white', bevel=0.03))
p.append(kit.cylinder(0.12, 0.66, (X, 0, 1.05), 'white', verts=10, rot=(0, math.pi / 2, 0)))
for i, dx in enumerate((-0.18, 0.0, 0.18)):
    p.append(kit.torus(0.27 - i * 0.02, 0.07, (X + dx, 0, 1.05), 'yellow', rot=(0, math.pi / 2, 0), major_segments=14, minor_segments=6))
p.append(kit.box((0.12, 0.16, 0.32), (X + 0.3, -0.32, 0.55), 'red', bevel=0.04))
p.append(kit.cylinder(0.025, 0.3, (X + 0.3, -0.45, 0.35), 'steel', verts=6, rot=(0.5, 0, 0)))
finish(p, 'prop_hose', X)

# Pay kiosk: a mint counter with a white top, the till, a card reader and a tip jar, a striped awning on two posts.
X = -6.2
p = [kit.box((2.0, 0.9, 1.0), (X, 0, 0.5), 'mint', bevel=0.1)]
p.append(kit.box((2.12, 1.02, 0.1), (X, 0, 1.05), 'white', bevel=0.04))
p.append(kit.box((0.7, 0.5, 0.34), (X - 0.3, 0.05, 1.27), 'dark', bevel=0.06))
p.append(kit.box((0.5, 0.06, 0.3), (X - 0.3, -0.12, 1.6), '#9fe3ff', bevel=0.02, rot=(0.35, 0, 0)))
p.append(kit.box((0.5, 0.3, 0.06), (X - 0.3, -0.12, 1.47), 'yellow', bevel=0.0))
p.append(kit.box((0.18, 0.28, 0.08), (X + 0.25, -0.1, 1.14), 'dark', bevel=0.02))
p.append(kit.cylinder(0.14, 0.3, (X + 0.62, 0, 1.25), '#cfeeff', verts=12))
p.append(kit.cylinder(0.1, 0.12, (X + 0.62, 0, 1.18), '#5cc45c', verts=10))
for sx in (-1, 1):
    p.append(kit.box((0.1, 0.1, 1.5), (X + sx * 0.95, 0.4, 1.8), 'white', bevel=0.03))
for i in range(6):
    p.append(kit.box((0.36, 0.9, 0.08), (X - 0.9 + i * 0.36, 0.0, 2.6), 'white' if i % 2 else 'pink', bevel=0.0, rot=(-0.25, 0, 0)))
finish(p, 'prop_register', X)

# Supply shelf: three white shelves between blue sides, a back panel; soap bottles, towel stacks, wax tins.
X = -3.0
p = []
for z in (0.08, 0.86, 1.64):
    p.append(kit.box((2.2, 0.8, 0.1), (X, 0, z), 'white', bevel=0.04))
for sx in (-1, 1):
    p.append(kit.box((0.12, 0.82, 1.8), (X + sx * 1.08, 0, 0.9), 'blue', bevel=0.05))
p.append(kit.box((2.2, 0.06, 1.6), (X, 0.38, 0.9), '#e3eef7', bevel=0.02))
for i in range(5):
    x = X - 0.8 + i * 0.4
    p.append(kit.box((0.24, 0.24, 0.5), (x, 0, 0.38), 'pink' if i % 2 else 'blue', bevel=0.08))
    p.append(kit.cylinder(0.06, 0.1, (x, 0, 0.68), 'white', verts=8))
for i in range(3):
    for j in range(3):
        p.append(kit.box((0.5, 0.5, 0.14), (X - 0.7 + i * 0.7, 0, 0.99 + j * 0.15), ('mint', 'yellow', 'pink')[(i + j) % 3], bevel=0.05))
for i in range(5):
    p.append(kit.cylinder(0.14, 0.18, (X - 0.8 + i * 0.4, 0, 1.8), 'gold' if i % 2 else 'yellow', verts=12, bevel=0.02))
finish(p, 'prop_shelf', X)

# Waiting bench: wooden slats on curly dark legs, a potted plant at the end.
X = 0.0
p = []
for i in range(3):
    p.append(kit.box((2.2, 0.17, 0.08), (X, -0.2 + i * 0.2, 0.52), 'wood', bevel=0.03))
for i in range(2):
    p.append(kit.box((2.2, 0.06, 0.15), (X, 0.33, 0.8 + i * 0.2), 'wood', bevel=0.03))
for sx in (-1, 1):
    p.append(kit.box((0.08, 0.5, 0.06), (X + sx * 0.95, 0.0, 0.46), 'dark', bevel=0.02))
    p.append(kit.box((0.08, 0.08, 0.5), (X + sx * 0.95, -0.2, 0.22), 'dark', bevel=0.02))
    p.append(kit.box((0.08, 0.08, 1.05), (X + sx * 0.95, 0.3, 0.52), 'dark', bevel=0.02))
    p.append(kit.torus(0.12, 0.03, (X + sx * 0.95, 0.38, 1.05), 'dark', rot=(0, math.pi / 2, 0), major_segments=10, minor_segments=4))
p.append(kit.cone(0.2, 0.27, 0.42, (X + 1.5, 0, 0.21), '#e07a5f', verts=12))
p.append(kit.sphere(0.34, (X + 1.5, 0, 0.62), '#6fc35a', segments=10))
p.append(kit.sphere(0.2, (X + 1.62, -0.05, 0.88), '#8fd46a', segments=8))
finish(p, 'prop_bench', X)

# Vending machine: a red body, a glass front of snacks, a coin panel, a pick-up flap, a lit sign on top.
X = 3.2
p = [kit.box((1.3, 0.9, 2.1), (X, 0, 1.05), 'red', bevel=0.14, segments=2)]
p.append(kit.box((0.9, 0.06, 1.3), (X - 0.15, -0.45, 1.25), '#cfeeff', bevel=0.03))
snacks = ('yellow', 'blue', 'mint', 'pink')
for row in range(3):
    p.append(kit.box((0.82, 0.04, 0.03), (X - 0.15, -0.47, 0.73 + row * 0.38), 'white', bevel=0.0))
    for col in range(3):
        p.append(kit.box((0.2, 0.08, 0.2), (X - 0.42 + col * 0.27, -0.48, 0.86 + row * 0.38), snacks[(row + col) % 4], bevel=0.04))
p.append(kit.box((0.26, 0.06, 0.5), (X + 0.45, -0.45, 1.45), 'dark', bevel=0.03))
for i in range(3):
    p.append(kit.box((0.14, 0.04, 0.07), (X + 0.45, -0.49, 1.6 - i * 0.12), 'yellow', bevel=0.0))
p.append(kit.box((0.6, 0.08, 0.18), (X - 0.15, -0.45, 0.4), 'dark', bevel=0.04))
p.append(kit.box((1.34, 0.94, 0.12), (X, 0, 2.16), 'white', bevel=0.04))
finish(p, 'prop_vending', X)

# Roadside sign: a striped pole on a base, a rounded board edged with light bulbs, bubbles round it.
X = 6.5
p = [kit.box((0.6, 0.6, 0.2), (X, 0, 0.1), 'kerb', bevel=0.06)]
for i in range(6):
    p.append(kit.cylinder(0.12, 0.6, (X, 0, 0.5 + i * 0.6), 'white' if i % 2 == 0 else 'pink', verts=10))
p.append(kit.box((2.2, 0.24, 1.7), (X, 0, 4.2), 'hotpink', bevel=0.3, segments=3))
p.append(kit.box((2.0, 0.26, 1.5), (X, 0, 4.2), 'pink', bevel=0.25, segments=2))
for i in range(10):
    a = i * 2 * math.pi / 10
    p.append(kit.sphere(0.07, (X + 1.08 * math.cos(a), -0.13, 4.2 + 0.83 * math.sin(a)), '#fff3b0', segments=8))
for (dx, dz, r, c) in ((1.05, 5.15, 0.3, 'white'), (1.4, 5.5, 0.18, 'glass'), (-1.05, 5.05, 0.24, 'white'), (-1.3, 5.4, 0.13, 'glass')):
    p.append(kit.sphere(r, (X + dx, 0, dz), c, segments=12))
finish(p, 'prop_sign', X)

# The moving truck to the next town: a blue cab with windows and lights, a pink box with bubble decals, chunky wheels.
X = 11.5
p = [kit.box((1.2, 1.9, 1.5), (X + 1.5, 0, 1.05), 'blue', bevel=0.2, segments=2)]
p.append(kit.box((0.06, 1.5, 0.6), (X + 2.11, 0, 1.45), '#9fd4f7', bevel=0.03))
for sy in (-1, 1):
    p.append(kit.box((0.7, 0.06, 0.5), (X + 1.55, sy * 0.96, 1.45), '#9fd4f7', bevel=0.03))
    p.append(kit.sphere(0.1, (X + 2.1, sy * 0.7, 0.7), '#fff3b0', segments=8))
p.append(kit.box((0.2, 1.7, 0.3), (X + 2.15, 0, 0.45), 'white', bevel=0.06))
p.append(kit.box((3.1, 2.0, 2.0), (X - 0.65, 0, 1.4), 'pink', bevel=0.16, segments=2))
p.append(kit.box((3.14, 2.04, 0.2), (X - 0.65, 0, 0.5), 'white', bevel=0.05))
for (dx, dz, r) in ((-1.3, 1.7, 0.32), (-0.75, 1.25, 0.2), (-0.2, 1.8, 0.24), (0.3, 1.3, 0.16)):
    for sy in (-1, 1):
        p.append(kit.cylinder(r, 0.03, (X + dx, sy * 1.02, dz), 'white', verts=14, rot=(math.pi / 2, 0, 0)))
for dx in (-1.6, -0.4, 1.5):
    for sy in (-1, 1):
        p.append(kit.cylinder(0.36, 0.3, (X + dx, sy * 0.9, 0.36), 'black', verts=14, rot=(math.pi / 2, 0, 0)))
        p.append(kit.cylinder(0.18, 0.32, (X + dx, sy * 0.9, 0.36), 'steel', verts=10, rot=(math.pi / 2, 0, 0)))
finish(p, 'prop_truck', X)

# Contracts board: a cork board in a wooden frame on two posts under a little
# pitched roof, three contracts pinned up, and a header for the name.
X = 16.0
p = []
for sx in (-1, 1):
    p.append(kit.box((0.36, 0.36, 0.1), (X + sx * 1.0, 0, 0.05), 'kerb', bevel=0.03))
    p.append(kit.box((0.14, 0.14, 2.75), (X + sx * 1.0, 0, 1.42), 'wood', bevel=0.03))
p.append(kit.box((2.1, 0.14, 1.3), (X, 0, 1.55), 'wood', bevel=0.04))
p.append(kit.box((1.9, 0.18, 1.1), (X, 0, 1.55), '#e0b07a', bevel=0.02))
for dx, tilt, paper, pin in ((-0.6, 0.07, 'white', 'red'), (0.0, -0.05, '#fff3b0', 'blue'), (0.6, 0.09, '#ffd6ec', 'mint')):
    p.append(kit.box((0.5, 0.02, 0.68), (X + dx, -0.1, 1.5), paper, bevel=0.0, rot=(0, tilt, 0)))
    for i in range(3):
        p.append(kit.box((0.3, 0.02, 0.04), (X + dx - 0.02, -0.115, 1.6 - i * 0.12), '#b8c2cf', bevel=0.0, rot=(0, tilt, 0)))
    p.append(kit.sphere(0.055, (X + dx, -0.13, 1.79), pin, segments=8))
p.append(kit.box((1.7, 0.12, 0.38), (X, -0.02, 2.42), 'deepblue', bevel=0.06))
for sy in (-1, 1):
    p.append(kit.box((2.5, 0.5, 0.08), (X, sy * 0.2, 2.8), 'hotpink', bevel=0.03, rot=(sy * 0.5, 0, 0)))
p.append(kit.cylinder(0.06, 2.55, (X, 0, 2.92), 'white', verts=8, rot=(0, math.pi / 2, 0)))
finish(p, 'prop_board', X)

toy = kit.toy_material('toy')
for obj in props:
    kit.use_material(obj, toy)
print('triangles', {o.name: kit.triangles([o]) for o in props})
kit.export(props + bases, sys.argv[1] if len(sys.argv) > 1 else 'props.glb')
if len(sys.argv) > 2:
    print(kit.preview(sys.argv[2], look_at=(4.5, 0, 1.5), distance=38, size=(1280, 640), angles=((0.4, -1, 0.9),)))
