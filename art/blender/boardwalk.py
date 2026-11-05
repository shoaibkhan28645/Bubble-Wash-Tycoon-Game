"""Beach Boardwalk's buildings and props (Chapter 2), all in one file, each
standing on its own named base so the game can place them one by one:

- bw_kiosk: the ice-cream stall. An open stall with its counter facing the
  camera (-Y here, +Z in the game), tubs of ice cream behind the glass, a
  freezer at the back under a striped canopy on two slim posts, and a
  giant cone on a pole that reads from far away.
- bw_parasols: two striped parasols over two sun loungers and a towel.
- bw_menu: an A-frame chalkboard with cones and prices.
- bw_palm: a palm tree with a curved trunk, drooping fronds and coconuts.
- bw_lifeguard: a lifeguard tower on stilts with a flag.
- bw_pier: the gate to the pier, a wooden arch with a sign board.

Usage: python art/blender/boardwalk.py <out.glb> [preview.png]
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import kit  # noqa: E402

kit.reset()
models = []
bases = []


def finish(parts, name, x):
    # The mesh sits in a named empty at the model's base: shrinking the file
    # (quantizing) moves and scales the mesh's own node, so the game places
    # the empty and leaves the mesh's node as it is.
    obj = kit.join(parts, name + '_mesh')
    kit.set_origin(obj, (x, 0, 0))
    base = kit.bpy.data.objects.new(name, None)
    kit.bpy.context.scene.collection.objects.link(base)
    base.location = (x, 0, 0)
    obj.location = (0, 0, 0)
    obj.parent = base
    models.append(obj)
    bases.append(base)


SAND = '#f3dcae'
CREAM = '#fff4dc'
SEA = '#36c5d6'

# The ice-cream stall: 2.8 wide, 2.0 deep, open on all sides so whoever
# works it and whoever is served both show. The counter faces the camera
# (-Y here, +Z in the game); the worker stands between it and the freezer
# at the back, and steps in from either side.
X = -14.0
p = []
# Floor.
p.append(kit.box((3.0, 2.2, 0.12), (X, 0, 0.06), 'kerb', bevel=0.03))
# The counter along the front: mint panel, white top, a glass case of ice-cream tubs.
p.append(kit.box((2.6, 0.5, 1.0), (X, -0.7, 0.6), 'mint', bevel=0.06))
p.append(kit.box((2.75, 0.62, 0.1), (X, -0.7, 1.13), 'white', bevel=0.03))
for i, col in enumerate(('pink', '#fff2b8', '#a8e6cf', '#c79f7f', '#ffd6ec')):
    p.append(kit.box((0.36, 0.3, 0.12), (X - 0.9 + i * 0.45, -0.66, 1.22), col, bevel=0.05))
    p.append(kit.sphere(0.13, (X - 0.9 + i * 0.45, -0.66, 1.31), col, segments=8))
p.append(kit.box((2.4, 0.04, 0.3), (X, -0.86, 1.34), 'glass', bevel=0.01))
p.append(kit.cylinder(0.1, 0.3, (X + 1.15, -0.7, 1.32), 'gold', verts=10))
p.append(kit.box((0.34, 0.26, 0.22), (X - 1.12, -0.74, 1.29), 'dark', bevel=0.04))
# A pink stripe along the counter's front.
p.append(kit.box((2.62, 0.04, 0.12), (X, -0.96, 0.75), 'hotpink', bevel=0.0))
# The freezer at the back, low enough to see over.
p.append(kit.box((2.4, 0.4, 0.85), (X, 0.85, 0.5), 'white', bevel=0.06))
p.append(kit.box((2.3, 0.36, 0.06), (X, 0.85, 0.95), 'glass', bevel=0.01))
# Two slim posts at the back holding a striped canopy over the freezer only: from the camera's
# side nothing covers whoever stands at the counter.
for sx in (-1, 1):
    p.append(kit.cylinder(0.06, 2.55, (X + sx * 1.35, 1.0, 1.33), 'white', verts=8))
for i in range(7):
    col = 'pink' if i % 2 == 0 else 'white'
    p.append(kit.box((0.42, 1.0, 0.06), (X - 1.26 + i * 0.42, 0.8, 2.62), col, bevel=0.0, rot=(-0.2, 0, 0)))
# A sign board along the canopy's front edge (the game writes on it).
p.append(kit.box((2.2, 0.1, 0.4), (X, 0.28, 2.66), 'deepblue', bevel=0.05))
p.append(kit.box((2.0, 0.12, 0.28), (X, 0.27, 2.66), 'white', bevel=0.03))
# The giant cone on a pole at a back corner, so it reads from far away without hiding the counter.
p.append(kit.cylinder(0.07, 1.4, (X - 1.35, 0.95, 3.25), 'white', verts=8))
p.append(kit.cone(0.04, 0.36, 0.9, (X - 1.35, 0.95, 4.05), 'gold', verts=14))
p.append(kit.sphere(0.4, (X - 1.35, 0.95, 4.6), '#ffd6ec', segments=14))
p.append(kit.sphere(0.3, (X - 1.28, 0.95, 4.95), '#a8e6cf', segments=12))
p.append(kit.sphere(0.1, (X - 1.26, 0.95, 5.25), 'red', segments=8))
finish(p, 'bw_kiosk', X)

# Parasols and sun loungers.
X = -7.0
p = []
for dx, col in ((-1.1, 'deepblue'), (1.1, 'hotpink')):
    p.append(kit.cylinder(0.05, 2.3, (X + dx, 0.2, 1.15), 'white', verts=8))
    for i in range(8):
        a = i * math.pi / 4
        p.append(kit.box((0.95, 0.5, 0.05), (X + dx + 0.42 * math.cos(a), 0.2 + 0.42 * math.sin(a), 2.22),
                         col if i % 2 == 0 else 'white', bevel=0.0, rot=(0.0, 0.32, a)))
    p.append(kit.sphere(0.08, (X + dx, 0.2, 2.42), 'white', segments=8))
    # A lounger under each: a slatted bed and a raised back.
    p.append(kit.box((0.7, 1.6, 0.08), (X + dx, -0.6, 0.32), 'white', bevel=0.02))
    p.append(kit.box((0.7, 0.6, 0.08), (X + dx, 0.15, 0.55), 'white', bevel=0.02, rot=(0.6, 0, 0)))
    for sy in (-1, 1):
        p.append(kit.box((0.6, 0.06, 0.3), (X + dx, -0.6 + sy * 0.7, 0.15), 'steel', bevel=0.01))
p.append(kit.box((0.6, 1.2, 0.02), (X, -1.4, 0.02), 'yellow', bevel=0.0))
finish(p, 'bw_parasols', X)

# A-frame menu board.
X = -3.0
p = []
for sy in (-1, 1):
    p.append(kit.box((0.9, 0.06, 1.25), (X, sy * 0.22, 0.62), 'wood', bevel=0.03, rot=(sy * 0.18, 0, 0)))
    p.append(kit.box((0.76, 0.02, 1.0), (X, sy * 0.26, 0.66), '#2f3b36', bevel=0.0, rot=(sy * 0.18, 0, 0)))
for i, col in enumerate(('#ffd6ec', '#a8e6cf', '#fff2b8')):
    z = 0.95 - i * 0.28
    p.append(kit.cone(0.02, 0.06, 0.14, (X - 0.22, 0.29, z - 0.04), 'gold', verts=8))
    p.append(kit.sphere(0.06, (X - 0.22, 0.29, z + 0.06), col, segments=8))
    p.append(kit.box((0.34, 0.01, 0.04), (X + 0.12, 0.3, z), 'white', bevel=0.0))
finish(p, 'bw_menu', X)

# Palm tree: a gently curving trunk of rings, drooping fronds, coconuts.
X = 1.0
p = []
top = (X, 0.0, 0.0)
for i in range(9):
    t = i / 8
    x = X + 0.55 * t * t
    z = 0.25 + i * 0.52
    p.append(kit.cylinder(0.24 - 0.07 * t, 0.5, (x, 0, z), '#a9784a' if i % 2 else '#b8875a', verts=10, bevel=0.03))
    top = (x, 0.0, z + 0.25)
for i in range(7):
    a = i * 2 * math.pi / 7
    for k in range(3):
        r = 0.45 + k * 0.5
        p.append(kit.box((0.62, 0.3, 0.05), (top[0] + r * math.cos(a), r * math.sin(a), top[2] + 0.12 - k * k * 0.16),
                         '#3fae5a' if k % 2 == 0 else '#5fcf6a', bevel=0.0, rot=(0, 0.25 + k * 0.3, a)))
for a in (0.3, 2.4, 4.4):
    p.append(kit.sphere(0.13, (top[0] + 0.2 * math.cos(a), 0.2 * math.sin(a), top[2] - 0.18), '#6b4a2b', segments=8))
finish(p, 'bw_palm', X)

# Lifeguard tower on stilts, with a ladder and a red flag.
X = 6.0
p = []
for sx in (-1, 1):
    for sy in (-1, 1):
        p.append(kit.box((0.14, 0.14, 2.2), (X + sx * 0.75, sy * 0.75, 1.1), 'white', bevel=0.03))
p.append(kit.box((1.9, 1.9, 0.14), (X, 0, 2.25), 'wood', bevel=0.03))
p.append(kit.box((1.6, 1.4, 1.2), (X, -0.15, 2.9), 'red', bevel=0.08))
p.append(kit.box((1.3, 0.04, 0.6), (X, 0.56, 3.0), 'glass', bevel=0.01))
p.append(kit.prism((1.9, 1.8, 0.6), (X, -0.15, 3.8), 'white'))
for i in range(6):
    p.append(kit.box((0.6, 0.08, 0.06), (X, 1.15 - i * 0.08, 0.3 + i * 0.36), 'white', bevel=0.0))
p.append(kit.cylinder(0.03, 1.4, (X + 0.9, 0.7, 3.6), 'steel', verts=6))
p.append(kit.box((0.5, 0.02, 0.32), (X + 1.16, 0.7, 4.1), 'red', bevel=0.0))
finish(p, 'bw_lifeguard', X)

# The gate to the pier: a wooden arch on two posts, a sign board across the top.
X = 12.0
p = []
for sx in (-1, 1):
    p.append(kit.box((0.36, 0.36, 3.4), (X + sx * 2.0, 0, 1.7), 'wood', bevel=0.05))
    p.append(kit.sphere(0.24, (X + sx * 2.0, 0, 3.55), 'white', segments=10))
    for i in range(3):
        p.append(kit.box((0.42, 0.42, 0.08), (X + sx * 2.0, 0, 0.6 + i * 1.1), 'white', bevel=0.02))
p.append(kit.box((4.4, 0.3, 0.8), (X, 0, 3.0), 'deepblue', bevel=0.08))
p.append(kit.box((4.0, 0.32, 0.56), (X, 0, 3.0), CREAM, bevel=0.06))
for i in range(9):
    p.append(kit.sphere(0.07, (X - 2.0 + i * 0.5, -0.17, 3.45), 'yellow' if i % 2 else 'pink', segments=6))
finish(p, 'bw_pier', X)

toy = kit.toy_material('toy')
for obj in models:
    kit.use_material(obj, toy)
print('triangles', {o.name: kit.triangles([o]) for o in models})
kit.export(models + bases, sys.argv[1] if len(sys.argv) > 1 else 'boardwalk.glb')
if len(sys.argv) > 2:
    print(kit.preview(sys.argv[2], look_at=(-1.0, 0, 1.6), distance=34, size=(1280, 640), ground=SAND, angles=((0.4, -1, 0.9),)))
