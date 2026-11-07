"""Willowbrook's farm and village (Chapter 2), all in one file, each piece
standing on its own named base so the game can place them one by one.
Fronts face -Y here (+Z in the game, towards the camera).

Buildings: fm_farmhouse (white clapboard, porch, rocking chair), fm_barn
(red, gambrel roof, big doors, hay loft, rooster weathervane), fm_stand
(the farm stand: crates of produce on a counter facing the camera, a
canopy over the back only, so whoever serves stays in view), fm_well,
fm_gate (the farm's sign over the track), fm_windmill (the old windmill,
sails broken until the landmark is built), fm_chapel (the village chapel).
Props: fm_scarecrow, fm_cart, fm_haybale, fm_fence (one 2 m rail section),
fm_sunflowers, fm_duck.
Crops, one plot each (2.6 x 2.8 m), three stages: fm_veg_1..3, fm_corn_1..3.

Usage: python art/blender/farm.py <out.glb> [preview.png]
(writes <out>.glb with the buildings, <out>-props.glb with the props and
crops, and <out>-poultry.glb with the poultry farm)
"""
import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import kit  # noqa: E402

kit.reset()
models = []
bases = []
rng = random.Random(7)


def finish(parts, name, x):
    # The mesh sits in a named empty at the model's base: quantizing moves
    # and scales the mesh's own node, so the game places the empty and
    # leaves the mesh's node as it is.
    obj = kit.join(parts, name + '_mesh')
    kit.set_origin(obj, (x, 0, 0))
    base = kit.bpy.data.objects.new(name, None)
    kit.bpy.context.scene.collection.objects.link(base)
    base.location = (x, 0, 0)
    obj.location = (0, 0, 0)
    obj.parent = base
    models.append(obj)
    bases.append(base)


def turn(obj, angle, pivot):
    # Spins a part about a vertical axis through `pivot` (for roofs whose ridge runs along Y).
    import mathutils
    m = (mathutils.Matrix.Translation(pivot) @ mathutils.Matrix.Rotation(angle, 4, 'Z') @
         mathutils.Matrix.Translation((-pivot[0], -pivot[1], -pivot[2])))
    obj.data.transform(m)
    return obj


def gable_roof(length, wall_length, half, wall_half, eave, rise, x, y, roof_col, wall_col, thick=0.28):
    # A roof shell (ridge along X, centred on (x, y)) over a filled-in gable wall.
    shell = [(y - half, eave), (y, eave + rise), (y + half, eave),
             (y + half - thick, eave), (y, eave + rise - thick * 1.2), (y - half + thick, eave)]
    k = (rise - thick * 1.2) / half
    gable = [(y - wall_half, eave), (y, eave + wall_half * k), (y + wall_half, eave)]
    return [kit.profile(shell, length, x, roof_col), kit.profile(gable, wall_length, x, wall_col)]


# The village palette: warm, sunny, a little faded.
CLAPBOARD = '#fbf6ea'
TRIM = '#ffffff'
BARN_RED = '#c94a3d'
BARN_DARK = '#9e3a30'
ROOF_GREEN = '#4e8f6a'
ROOF_SLATE = '#5d6b7a'
SHINGLE = '#a0673d'
PLANK = '#c08a55'
PLANK_DARK = '#8f6036'
STONE = '#b9b3a7'
STONE_DARK = '#9a9387'
STRAW = '#e8c35a'
STRAW_DARK = '#c9a03f'
LEAF = '#5fb84f'
LEAF_DARK = '#3f9a45'
SOIL = '#7a5236'
CARROT = '#ff8a2a'
CABBAGE = '#9bd36a'
TOMATO = '#ff4d3d'
CORN = '#ffd23f'
STALK = '#6fbf4a'

# --- The farmhouse: 6 m wide, a porch along the front, a green roof. -------
X = -40.0
p = [kit.box((6.6, 6.2, 0.3), (X, 0.3, 0.15), STONE, bevel=0.04)]
p.append(kit.box((6.0, 4.8, 3.2), (X, 0.9, 1.9), CLAPBOARD, bevel=0.05))
# Clapboard lines across the front and sides.
for i in range(7):
    z = 0.55 + i * 0.42
    p.append(kit.box((6.04, 0.04, 0.04), (X, -1.52, z), '#e9e1cc', bevel=0.0))
p += gable_roof(6.6, 6.0, 2.7, 2.4, 3.45, 2.0, X, 0.9, ROOF_GREEN, CLAPBOARD)
p.append(kit.box((6.7, 0.16, 0.16), (X, 0.9, 5.47), TRIM, bevel=0.03))
# A round attic window in the gable, a chimney of old brick.
p.append(kit.cylinder(0.32, 0.12, (X + 3.06, 0.9, 4.25), '#cfeeff', verts=14, rot=(0, math.pi / 2, 0)))
p.append(kit.torus(0.33, 0.05, (X + 3.08, 0.9, 4.25), TRIM, rot=(0, math.pi / 2, 0), major_segments=14, minor_segments=4))
p.append(kit.box((0.6, 0.6, 1.6), (X - 1.6, 1.6, 5.0), '#b0624a', bevel=0.04))
p.append(kit.box((0.72, 0.72, 0.14), (X - 1.6, 1.6, 5.82), STONE, bevel=0.03))
# Front door and windows with green shutters and flower boxes.
p.append(kit.box((1.0, 0.12, 2.0), (X, -1.56, 1.3), '#c94a3d', bevel=0.05))
p.append(kit.box((1.2, 0.1, 0.12), (X, -1.58, 2.36), TRIM, bevel=0.0))
p.append(kit.sphere(0.06, (X + 0.3, -1.64, 1.25), 'gold', segments=6))
for wx in (-2.0, 2.0):
    p.append(kit.box((0.95, 0.1, 1.05), (X + wx, -1.57, 1.75), '#cfeeff', bevel=0.0))
    p.append(kit.box((0.06, 0.12, 1.05), (X + wx, -1.6, 1.75), TRIM, bevel=0.0))
    p.append(kit.box((0.95, 0.12, 0.06), (X + wx, -1.6, 1.75), TRIM, bevel=0.0))
    for sx in (-1, 1):
        p.append(kit.box((0.26, 0.08, 1.1), (X + wx + sx * 0.64, -1.6, 1.75), ROOF_GREEN, bevel=0.0))
    p.append(kit.box((1.0, 0.3, 0.2), (X + wx, -1.72, 1.12), PLANK_DARK, bevel=0.03))
    for k, col in enumerate(('hotpink', 'yellow', 'red', 'white')):
        p.append(kit.sphere(0.1, (X + wx - 0.36 + k * 0.24, -1.74, 1.3), col, segments=6))
# Upstairs windows.
for wx in (-1.6, 1.6):
    p.append(kit.box((0.8, 0.1, 0.8), (X + wx, -1.57, 3.05), '#cfeeff', bevel=0.0))
    p.append(kit.box((0.88, 0.12, 0.08), (X + wx, -1.6, 3.05), TRIM, bevel=0.0))
# The porch: a deck, posts, a railing, a sloping roof, steps, a rocking chair.
p.append(kit.box((6.2, 1.7, 0.2), (X, -2.35, 0.4), PLANK, bevel=0.03))
for i in range(5):
    px = X - 2.9 + i * 1.45
    p.append(kit.box((0.14, 0.14, 2.1), (px, -3.1, 1.5), TRIM, bevel=0.02))
    if abs(px - X) > 0.5 and i < 4:
        p.append(kit.box((1.3, 0.06, 0.08), (px + 0.72, -3.1, 0.95), TRIM, bevel=0.0))
for i in range(28):
    sx = X - 2.9 + i * 0.215
    if abs(sx - X) > 0.6 and sx < X + 2.95:
        p.append(kit.box((0.05, 0.05, 0.45), (sx, -3.1, 0.72), TRIM, bevel=0.0))
p.append(kit.box((6.5, 2.0, 0.12), (X, -2.3, 2.62), ROOF_GREEN, bevel=0.03, rot=(-0.22, 0, 0)))
for k in range(3):
    p.append(kit.box((1.3, 0.35, 0.16), (X, -3.35 - k * 0.32, 0.3 - k * 0.1), PLANK, bevel=0.02))
# Rocking chair and a little table with a lemonade jug.
p.append(kit.box((0.55, 0.5, 0.08), (X + 1.9, -2.3, 0.85), PLANK_DARK, bevel=0.02))
p.append(kit.box((0.55, 0.08, 0.6), (X + 1.9, -2.05, 1.15), PLANK_DARK, bevel=0.02))
p.append(kit.torus(0.3, 0.03, (X + 1.9, -2.3, 0.62), PLANK_DARK, rot=(0, math.pi / 2, 0), major_segments=12, minor_segments=4))
p.append(kit.cylinder(0.2, 0.55, (X + 2.6, -2.3, 0.78), PLANK, verts=10))
p.append(kit.cylinder(0.08, 0.22, (X + 2.6, -2.3, 1.16), '#fff3a0', verts=8))
finish(p, 'fm_farmhouse', X)

# --- The barn: red, a gambrel roof along X, big doors on the long front side. ---
X = -28.0
W = 8.0
D = 6.4
p = [kit.box((W + 0.4, D + 0.4, 0.25), (X, 0, 0.12), STONE, bevel=0.04)]
p.append(kit.box((W, D, 3.6), (X, 0, 2.05), BARN_RED, bevel=0.05))
# Vertical boards on the front.
for i in range(16):
    p.append(kit.box((0.05, 0.04, 3.5), (X - W / 2 + 0.25 + i * 0.5, -D / 2 - 0.01, 2.05), BARN_DARK, bevel=0.0))
# The gambrel roof: a side profile pushed out along the barn's length.
half = D / 2 + 0.35
roof = [(-half, 3.75), (-half * 0.62, 5.3), (0, 6.25), (half * 0.62, 5.3), (half, 3.75), (half - 0.25, 3.75),
        (half * 0.62 - 0.18, 5.12), (0, 6.0), (-half * 0.62 + 0.18, 5.12), (-half + 0.25, 3.75)]
p.append(kit.profile(roof, W + 0.5, X, '#7d8c9c', bevel=0.0))
# The gable ends filled in red.
inner = [(-D / 2, 3.8), (-D / 2 * 0.62, 5.2), (0, 6.0), (D / 2 * 0.62, 5.2), (D / 2, 3.8)]
p.append(kit.profile(inner, W - 0.02, X, BARN_RED, bevel=0.0))
# White trim round the big doors, with the X braces, and a hay loft door with hay.
for dx in (-1.25, 1.25):
    p.append(kit.box((2.4, 0.12, 2.9), (X + dx, -D / 2 - 0.06, 1.7), BARN_RED, bevel=0.02))
    p.append(kit.box((2.4, 0.14, 0.14), (X + dx, -D / 2 - 0.08, 3.12), TRIM, bevel=0.0))
    p.append(kit.box((2.4, 0.14, 0.14), (X + dx, -D / 2 - 0.08, 0.3), TRIM, bevel=0.0))
    for sx in (-1, 1):
        p.append(kit.box((0.14, 0.14, 2.9), (X + dx + sx * 1.13, -D / 2 - 0.08, 1.7), TRIM, bevel=0.0))
    for s in (-1, 1):
        p.append(kit.box((2.9, 0.12, 0.13), (X + dx, -D / 2 - 0.1, 1.7), TRIM, bevel=0.0, rot=(0, s * 0.86, 0)))
p.append(kit.box((1.6, 0.12, 1.2), (X, -D / 2 - 0.07, 4.4), PLANK_DARK, bevel=0.02))
p.append(kit.box((1.8, 0.14, 0.12), (X, -D / 2 - 0.09, 5.04), TRIM, bevel=0.0))
for k in range(6):
    p.append(kit.box((0.3, 0.4, 0.12), (X - 0.6 + k * 0.24, -D / 2 - 0.2, 3.9 + (k % 2) * 0.08), STRAW, bevel=0.0, rot=(0.4, 0, k * 0.3)))
# A rooster weathervane on the ridge.
p.append(kit.cylinder(0.04, 1.0, (X, 0, 6.7), 'dark', verts=6))
p.append(kit.box((0.7, 0.05, 0.05), (X, 0, 6.85), 'dark', bevel=0.0))
p.append(kit.box((0.05, 0.7, 0.05), (X, 0, 6.85), 'dark', bevel=0.0))
p.append(kit.box((0.5, 0.06, 0.32), (X, 0, 7.25), 'dark', bevel=0.02))
p.append(kit.box((0.14, 0.06, 0.2), (X - 0.26, 0, 7.42), 'dark', bevel=0.02))
# A lantern by the doors.
p.append(kit.box((0.2, 0.2, 0.3), (X + W / 2 - 0.3, -D / 2 - 0.15, 3.0), 'gold', bevel=0.03))
finish(p, 'fm_barn', X)

# --- The farm stand: a wooden counter of produce facing the camera. ---------
X = -18.0
p = [kit.box((3.6, 2.2, 0.12), (X, 0.1, 0.06), PLANK_DARK, bevel=0.02)]
# The counter: a low plank front with a painted strip, so whoever serves shows over it, and a sloping display of crates.
p.append(kit.box((3.2, 0.6, 0.7), (X, -0.6, 0.43), PLANK, bevel=0.04))
for i in range(6):
    p.append(kit.box((0.04, 0.03, 0.65), (X - 1.45 + i * 0.58, -0.92, 0.43), PLANK_DARK, bevel=0.0))
p.append(kit.box((3.22, 0.04, 0.14), (X, -0.93, 0.66), '#4e8f6a', bevel=0.0))
produce = ((CARROT, LEAF), (CABBAGE, LEAF_DARK), (TOMATO, LEAF), (CORN, STALK))
for i, (col, leaf) in enumerate(produce):
    cx = X - 1.2 + i * 0.8
    p.append(kit.box((0.7, 0.55, 0.2), (cx, -0.65, 0.86), PLANK_DARK, bevel=0.02, rot=(0.25, 0, 0)))
    for k in range(5):
        p.append(kit.sphere(0.1, (cx - 0.22 + (k % 3) * 0.22, -0.72 + (k // 3) * 0.2, 0.98 + (k // 3) * 0.05), col, segments=6))
    p.append(kit.sphere(0.06, (cx, -0.6, 1.08), leaf, segments=6))
# The back shelf with more crates and a scale.
p.append(kit.box((3.0, 0.5, 0.8), (X, 0.85, 0.45), PLANK_DARK, bevel=0.03))
for i in range(3):
    p.append(kit.box((0.75, 0.45, 0.32), (X - 0.9 + i * 0.9, 0.85, 1.02), PLANK, bevel=0.02))
p.append(kit.box((0.3, 0.25, 0.25), (X + 1.3, -0.6, 0.92), 'steel', bevel=0.03))
# Two posts at the back holding a shingled canopy over the back only.
for sx in (-1, 1):
    p.append(kit.box((0.16, 0.16, 2.7), (X + sx * 1.6, 1.0, 1.4), PLANK_DARK, bevel=0.02))
for i in range(5):
    p.append(kit.box((3.8, 0.34, 0.06), (X, 0.25 + i * 0.3, 2.62 + i * 0.07), SHINGLE if i % 2 else '#b9784a', bevel=0.0, rot=(-0.22, 0, 0)))
# A sign board on the canopy's front edge (the game writes on it), and a chalkboard on the ground.
p.append(kit.box((2.2, 0.08, 0.45), (X, 0.12, 2.75), '#4e8f6a', bevel=0.04))
p.append(kit.box((2.0, 0.1, 0.32), (X, 0.11, 2.75), CLAPBOARD, bevel=0.03))
for sy in (-1, 1):
    p.append(kit.box((0.6, 0.05, 0.75), (X - 2.2, -0.9 + sy * 0.15, 0.4), PLANK_DARK, bevel=0.02, rot=(sy * 0.2, 0, 0)))
    p.append(kit.box((0.5, 0.02, 0.6), (X - 2.2, -0.9 + sy * 0.18, 0.42), '#2f3b36', bevel=0.0, rot=(sy * 0.2, 0, 0)))
finish(p, 'fm_stand', X)

# --- The well: a ring of stones, two posts, a little roof, a crank and a bucket. ---
X = -11.0
p = []
for i in range(14):
    a = i * 2 * math.pi / 14
    for k in range(2):
        p.append(kit.box((0.42, 0.3, 0.34), (X + 0.75 * math.cos(a + k * 0.22), 0.75 * math.sin(a + k * 0.22), 0.2 + k * 0.33),
                         STONE if (i + k) % 2 else STONE_DARK, bevel=0.06, rot=(0, 0, a)))
p.append(kit.cylinder(0.62, 0.05, (X, 0, 0.62), '#3a7fb0', verts=16))
for sx in (-1, 1):
    p.append(kit.box((0.14, 0.14, 1.9), (X + sx * 0.75, 0, 1.45), PLANK_DARK, bevel=0.02))
p.append(kit.prism((1.9, 1.4, 0.6), (X, 0, 2.35), SHINGLE))
p.append(kit.cylinder(0.08, 1.6, (X, 0, 1.8), PLANK, verts=8, rot=(0, math.pi / 2, 0)))
p.append(kit.box((0.06, 0.3, 0.06), (X + 0.85, -0.15, 1.8), 'dark', bevel=0.0))
p.append(kit.cylinder(0.2, 0.26, (X + 0.25, 0, 1.25), PLANK, verts=10))
p.append(kit.cylinder(0.015, 0.4, (X + 0.25, 0, 1.6), 'dark', verts=4))
finish(p, 'fm_well', X)

# --- The farm gate: two posts and a board over the track with the farm's name. ---
X = -4.0
p = []
for sx in (-1, 1):
    p.append(kit.box((0.3, 0.3, 3.4), (X + sx * 2.4, 0, 1.7), PLANK_DARK, bevel=0.04))
    p.append(kit.sphere(0.2, (X + sx * 2.4, 0, 3.5), PLANK, segments=8))
p.append(kit.box((5.2, 0.2, 0.9), (X, 0, 2.9), '#3f7a5a', bevel=0.06))
p.append(kit.box((5.0, 0.22, 0.12), (X, 0, 3.3), PLANK_DARK, bevel=0.0))
p.append(kit.box((5.0, 0.22, 0.12), (X, 0, 2.5), PLANK_DARK, bevel=0.0))
# The farm's name is painted on the board in the game.
for sx in (-1, 1):
    p.append(kit.sphere(0.16, (X + sx * 2.4, -0.18, 2.9), 'red', segments=6))
finish(p, 'fm_gate', X)

# --- The old windmill: a stone tower, a cap, sails (broken until it's restored). ---
X = 6.0
p = []
p.append(kit.cylinder(2.25, 0.5, (X, 0, 0.25), STONE_DARK, verts=16))
p.append(kit.cone(2.0, 1.25, 6.4, (X, 0, 3.7), '#ece6d6', verts=16))
for z in (2.2, 4.6):
    r = 2.0 - 0.75 * (z - 0.5) / 6.4
    p.append(kit.cylinder(r + 0.06, 0.16, (X, 0, z), STONE, verts=16))
p.append(kit.cone(1.5, 0.0, 1.8, (X, 0, 7.8), SHINGLE, verts=16))
p.append(kit.box((0.9, 0.12, 1.7), (X, -2.0, 1.35), PLANK_DARK, bevel=0.04))
for wz in (3.3, 5.4):
    r = 2.0 - 0.75 * (wz - 0.5) / 6.4
    p.append(kit.box((0.5, 0.12, 0.7), (X, -r + 0.02, wz), '#3b4a5e', bevel=0.02))
p.append(kit.cylinder(0.22, 0.8, (X, -1.35, 6.9), PLANK_DARK, verts=8, rot=(math.pi / 2, 0, 0)))
# Two of four sails left, one hanging crooked.
for a, length in ((0.35, 3.6), (2.6, 2.2)):
    p.append(kit.box((0.5, 0.08, length), (X + math.sin(a) * length / 2, -1.75, 6.9 + math.cos(a) * length / 2), PLANK, bevel=0.0, rot=(0, a, 0)))
    for k in range(4):
        d = 0.5 + k * length / 5
        p.append(kit.box((0.9, 0.06, 0.05), (X + math.sin(a) * d, -1.77, 6.9 + math.cos(a) * d), PLANK_DARK, bevel=0.0, rot=(0, a, 0)))
finish(p, 'fm_windmill', X)

# --- The village chapel: white walls, a steeple with a bell. ----------------
X = 16.0
p = [kit.box((4.4, 7.0, 0.2), (X, 0.5, 0.1), STONE, bevel=0.03)]
p.append(kit.box((4.0, 6.4, 3.4), (X, 0.8, 1.9), CLAPBOARD, bevel=0.05))
# The ridge runs front to back: build it along X, then turn it.
for part in gable_roof(7.0, 6.4, 2.5, 2.0, 3.55, 2.0, X, 0.8, ROOF_SLATE, CLAPBOARD):
    p.append(turn(part, math.pi / 2, (X, 0.8, 0)))
# The steeple over the front.
p.append(kit.box((1.6, 1.6, 2.6), (X, -2.4, 4.4), CLAPBOARD, bevel=0.04))
p.append(kit.box((1.0, 0.1, 1.1), (X, -3.22, 4.7), '#3b4a5e', bevel=0.02))
p.append(kit.sphere(0.32, (X, -2.4, 4.6), 'gold', segments=10))
p.append(kit.cone(1.15, 0.0, 2.6, (X, -2.4, 7.0), ROOF_SLATE, verts=4, rot=(0, 0, math.pi / 4)))
p.append(kit.box((0.08, 0.08, 0.9), (X, -2.4, 8.6), 'gold', bevel=0.0))
p.append(kit.box((0.5, 0.08, 0.08), (X, -2.4, 8.75), 'gold', bevel=0.0))
p.append(kit.box((1.1, 0.12, 1.9), (X, -3.25, 1.15), '#8f6036', bevel=0.04))
for wy in (-0.5, 1.4, 3.3):
    for side in (-1, 1):
        p.append(kit.box((0.1, 0.6, 1.4), (X + side * 2.02, wy, 2.1), '#cfeeff', bevel=0.0))
finish(p, 'fm_chapel', X)

# --- Props. -------------------------------------------------------------
# Scarecrow.
X = 22.0
p = [kit.cylinder(0.06, 2.2, (X, 0, 1.1), PLANK_DARK, verts=6), kit.box((1.6, 0.08, 0.08), (X, 0, 1.6), PLANK_DARK, bevel=0.0)]
p.append(kit.box((0.75, 0.35, 0.8), (X, 0, 1.45), '#3a7fb0', bevel=0.08))
for sx in (-1, 1):
    p.append(kit.box((0.6, 0.3, 0.26), (X + sx * 0.6, 0, 1.6), '#c94a3d', bevel=0.06))
    p.append(kit.box((0.18, 0.2, 0.2), (X + sx * 0.95, 0, 1.56), STRAW, bevel=0.04))
p.append(kit.sphere(0.3, (X, 0, 2.12), '#f0d9a6', segments=10))
p.append(kit.cylinder(0.5, 0.06, (X, 0, 2.36), STRAW_DARK, verts=14))
p.append(kit.cone(0.3, 0.18, 0.32, (X, 0, 2.55), STRAW_DARK, verts=12))
for k in range(5):
    p.append(kit.box((0.04, 0.04, 0.3), (X - 0.2 + k * 0.1, -0.05, 1.0), STRAW, bevel=0.0, rot=(0, (k - 2) * 0.2, 0)))
finish(p, 'fm_scarecrow', X)

# Hay cart.
X = 27.0
p = [kit.box((2.4, 1.4, 0.15), (X, 0, 0.75), PLANK, bevel=0.03)]
for sy in (-1, 1):
    p.append(kit.box((2.4, 0.08, 0.45), (X, sy * 0.68, 1.0), PLANK_DARK, bevel=0.02))
    for sx in (-1, 1):
        p.append(kit.cylinder(0.5, 0.12, (X + sx * 0.7, sy * 0.78, 0.5), PLANK_DARK, verts=14, rot=(math.pi / 2, 0, 0)))
        p.append(kit.cylinder(0.12, 0.16, (X + sx * 0.7, sy * 0.8, 0.5), 'dark', verts=8, rot=(math.pi / 2, 0, 0)))
p.append(kit.box((2.2, 1.2, 0.7), (X, 0, 1.15), STRAW, bevel=0.25, segments=2))
p.append(kit.box((1.6, 0.06, 0.06), (X - 2.0, 0, 0.7), PLANK_DARK, bevel=0.0))
finish(p, 'fm_cart', X)

# Round hay bale.
X = 31.0
p = [kit.cylinder(0.7, 1.1, (X, 0, 0.7), STRAW, verts=16, bevel=0.12, rot=(math.pi / 2, 0, 0))]
for r in (0.5, 0.3):
    p.append(kit.torus(r, 0.03, (X, -0.56, 0.7), STRAW_DARK, rot=(math.pi / 2, 0, 0), major_segments=14, minor_segments=4))
finish(p, 'fm_haybale', X)

# One 2 m section of rail fence (posts at each end, two rails).
X = 34.0
p = []
for sx in (-1, 1):
    p.append(kit.box((0.14, 0.14, 1.0), (X + sx * 1.0, 0, 0.5), PLANK_DARK, bevel=0.02))
for z in (0.42, 0.78):
    p.append(kit.box((2.1, 0.08, 0.1), (X, 0, z), PLANK, bevel=0.0))
finish(p, 'fm_fence', X)

# Sunflowers: a clump of three.
X = 37.0
p = []
for dx, h in ((-0.3, 1.7), (0.15, 2.0), (0.4, 1.5)):
    p.append(kit.cylinder(0.035, h, (X + dx, 0, h / 2), STALK, verts=6))
    p.append(kit.box((0.3, 0.12, 0.04), (X + dx + 0.12, 0, h * 0.5), LEAF, bevel=0.0, rot=(0, 0.4, 0)))
    p.append(kit.cylinder(0.26, 0.05, (X + dx, -0.06, h), CORN, verts=12, rot=(math.pi / 2 - 0.3, 0, 0)))
    p.append(kit.cylinder(0.12, 0.07, (X + dx, -0.09, h), '#6b4a2b', verts=10, rot=(math.pi / 2 - 0.3, 0, 0)))
finish(p, 'fm_sunflowers', X)

# A duck (bobs on the pond in the game).
X = 39.5
p = [kit.sphere(0.22, (X, 0, 0.16), TRIM, segments=10), kit.sphere(0.13, (X, -0.18, 0.36), TRIM, segments=8)]
p.append(kit.cone(0.05, 0.0, 0.12, (X, -0.32, 0.34), 'gold', verts=6, rot=(math.pi / 2, 0, 0)))
p.append(kit.box((0.16, 0.12, 0.08), (X, 0.2, 0.24), TRIM, bevel=0.03, rot=(-0.6, 0, 0)))
for sx in (-1, 1):
    p.append(kit.sphere(0.025, (X + sx * 0.07, -0.26, 0.4), 'black', segments=4))
finish(p, 'fm_duck', X)

# --- Crops: one plot each, 2.6 x 2.8 m, three rows. -----------------------
def crop_plot(name, x, plant):
    parts = []
    for row in range(3):
        for k in range(4):
            px = x - 0.95 + k * 0.63 + rng.uniform(-0.05, 0.05)
            py = -0.9 + row * 0.9 + rng.uniform(-0.05, 0.05)
            parts.extend(plant(px, py))
    finish(parts, name, x)


def veg_1(px, py):
    return [kit.box((0.04, 0.12, 0.14), (px + s * 0.05, py, 0.07), LEAF, bevel=0.0, rot=(0, s * 0.5, 0)) for s in (-1, 1)]


def veg_2(px, py):
    return [kit.sphere(0.16, (px, py, 0.12), CABBAGE, segments=6)] + \
           [kit.box((0.22, 0.08, 0.03), (px + math.cos(a) * 0.12, py + math.sin(a) * 0.12, 0.08), LEAF_DARK, bevel=0.0, rot=(0, 0.3, a))
            for a in (0.3, 2.4, 4.4)]


def veg_3(px, py):
    if (round(px * 10) + round(py * 10)) % 2 == 0:
        # A cabbage.
        out = [kit.sphere(0.24, (px, py, 0.2), CABBAGE, segments=8)]
        out += [kit.box((0.3, 0.1, 0.04), (px + math.cos(a) * 0.2, py + math.sin(a) * 0.2, 0.1), LEAF_DARK, bevel=0.0, rot=(0, 0.35, a)) for a in (0.0, 1.6, 3.1, 4.7)]
        return out
    # A carrot: its orange shoulder and a tuft of leaves.
    return [kit.cylinder(0.08, 0.12, (px, py, 0.06), CARROT, verts=8)] + \
           [kit.box((0.04, 0.04, 0.38), (px + s * 0.05, py, 0.3), LEAF, bevel=0.0, rot=(0, s * 0.35, 0)) for s in (-1, 0, 1)]


def corn_1(px, py):
    return [kit.box((0.04, 0.16, 0.22), (px, py, 0.11), STALK, bevel=0.0, rot=(0, 0.3, 0))]


def corn_2(px, py):
    out = [kit.cylinder(0.04, 1.1, (px, py, 0.55), STALK, verts=6)]
    out += [kit.box((0.45, 0.1, 0.03), (px + 0.18 * s, py, 0.4 + k * 0.3), LEAF, bevel=0.0, rot=(0, -s * 0.5, 0)) for k, s in ((0, 1), (1, -1), (2, 1))]
    return out


def corn_3(px, py):
    out = [kit.cylinder(0.045, 1.8, (px, py, 0.9), STALK, verts=6)]
    out += [kit.box((0.5, 0.1, 0.03), (px + 0.2 * s, py, 0.5 + k * 0.35), LEAF, bevel=0.0, rot=(0, -s * 0.5, 0)) for k, s in ((0, 1), (1, -1), (2, 1), (3, -1))]
    out.append(kit.cylinder(0.08, 0.32, (px + 0.09, py - 0.04, 1.05), CORN, verts=8, rot=(0.3, 0.2, 0)))
    out.append(kit.box((0.05, 0.05, 0.22), (px, py, 1.9), STRAW, bevel=0.0))
    return out


X = 44.0
for i, (name, plant) in enumerate((('fm_veg_1', veg_1), ('fm_veg_2', veg_2), ('fm_veg_3', veg_3),
                                    ('fm_corn_1', corn_1), ('fm_corn_2', corn_2), ('fm_corn_3', corn_3))):
    crop_plot(name, X + i * 3.2, plant)

# --- The poultry farm (Part B). ----------------------------------------------
# The hen house: a red coop on short stilts, nest boxes along its front (the
# camera's side) with straw and eggs showing, a door and a ramp down to the
# run on its right, and a rooster weathervane.
X = 70.0
p = []
for sx in (-1, 1):
    for sy in (-1, 1):
        p.append(kit.box((0.14, 0.14, 0.55), (X + sx * 1.85, sy * 1.25, 0.27), PLANK_DARK, bevel=0.02))
p.append(kit.box((4.2, 3.0, 0.14), (X, 0, 0.55), PLANK_DARK, bevel=0.03))
p.append(kit.box((4.0, 2.8, 1.85), (X, 0, 1.52), BARN_RED, bevel=0.05))
for i in range(9):
    p.append(kit.box((0.04, 0.04, 1.8), (X - 1.8 + i * 0.45, -1.41, 1.52), BARN_DARK, bevel=0.0))
for z in (0.64, 2.42):
    p.append(kit.box((4.08, 2.88, 0.1), (X, 0, z), TRIM, bevel=0.02))
p += gable_roof(4.7, 4.0, 1.85, 1.4, 2.45, 1.15, X, 0, SHINGLE, BARN_RED)
p.append(kit.box((4.8, 0.14, 0.14), (X, 0, 3.6), '#8a4f2a', bevel=0.03))
# A round window high in the front, framed in white.
p.append(kit.cylinder(0.26, 0.1, (X - 0.9, -1.43, 2.0), '#cfeeff', verts=14, rot=(math.pi / 2, 0, 0)))
p.append(kit.torus(0.27, 0.05, (X - 0.9, -1.46, 2.0), TRIM, rot=(math.pi / 2, 0, 0), major_segments=14, minor_segments=4))
# The nest boxes: a shelf of four along the front, a sloping lid, straw and eggs in each.
p.append(kit.box((3.4, 0.7, 0.62), (X + 0.1, -1.75, 1.05), PLANK, bevel=0.03))
p.append(kit.box((3.5, 0.82, 0.07), (X + 0.1, -1.72, 1.42), SHINGLE, bevel=0.02, rot=(-0.28, 0, 0)))
for i in range(4):
    nx = X - 1.15 + i * 0.85
    p.append(kit.box((0.62, 0.06, 0.4), (nx, -2.11, 1.02), '#5a3a22', bevel=0.0))
    for k in range(3):
        p.append(kit.box((0.16, 0.1, 0.05), (nx - 0.18 + k * 0.18, -2.15, 0.85), STRAW, bevel=0.0, rot=(0, 0.3 * (k - 1), 0)))
    p.append(kit.sphere(0.075, (nx - 0.08 + (i % 2) * 0.16, -2.12, 0.95), '#fff8ec' if i % 2 else '#e9c9a0', segments=8))
for i in range(5):
    p.append(kit.box((0.05, 0.72, 0.62), (X - 1.58 + i * 0.85, -1.75, 1.05), PLANK_DARK, bevel=0.0))
# The hens' door and ramp on the right, down to the run.
p.append(kit.box((0.06, 0.6, 0.75), (X + 2.02, 0.3, 1.0), '#3b2a1c', bevel=0.0))
p.append(kit.box((0.08, 0.7, 0.08), (X + 2.04, 0.3, 1.42), TRIM, bevel=0.0))
p.append(kit.box((1.5, 0.5, 0.06), (X + 2.65, 0.3, 0.38), PLANK, bevel=0.0, rot=(0, 0.42, 0)))
for k in range(5):
    p.append(kit.box((0.05, 0.5, 0.04), (X + 2.15 + k * 0.26, 0.3, 0.6 - k * 0.11), PLANK_DARK, bevel=0.0))
# A rooster weathervane on the ridge.
p.append(kit.cylinder(0.035, 0.7, (X + 1.2, 0, 3.95), 'dark', verts=6))
p.append(kit.box((0.4, 0.05, 0.26), (X + 1.2, 0, 4.36), 'dark', bevel=0.02))
p.append(kit.box((0.12, 0.05, 0.18), (X + 1.0, 0, 4.52), 'dark', bevel=0.02))
p.append(kit.box((0.1, 0.05, 0.28), (X + 1.42, 0, 4.48), 'dark', bevel=0.02, rot=(0, -0.5, 0)))
finish(p, 'fm_henhouse', X)

# The egg table: where eggs are packed into cartons (the hen house's job spot).
X = 76.0
p = [kit.box((1.7, 0.8, 0.08), (X, 0, 0.82), PLANK, bevel=0.03)]
for sx in (-1, 1):
    for sy in (-1, 1):
        p.append(kit.box((0.08, 0.08, 0.8), (X + sx * 0.75, sy * 0.32, 0.4), PLANK_DARK, bevel=0.0))
p.append(kit.box((1.5, 0.6, 0.05), (X, 0, 0.25), PLANK_DARK, bevel=0.0))
CARTON = '#cdd8e4'
for i, (cx, cz) in enumerate(((-0.45, 0.9), (-0.45, 1.02), (0.05, 0.9))):
    p.append(kit.box((0.42, 0.28, 0.1), (X + cx, -0.05, cz), CARTON, bevel=0.03))
    for k in range(3):
        p.append(kit.sphere(0.045, (X + cx - 0.12 + k * 0.12, -0.05, cz + 0.07), '#fff8ec', segments=6))
# A basket of eggs, and cartons stacked on the shelf below.
p.append(kit.cylinder(0.22, 0.16, (X + 0.55, 0.05, 0.94), '#c08a55', verts=12))
p.append(kit.torus(0.22, 0.03, (X + 0.55, 0.05, 1.04), PLANK_DARK, major_segments=12, minor_segments=4))
for k in range(5):
    p.append(kit.sphere(0.06, (X + 0.45 + (k % 3) * 0.09, 0.0 + (k // 3) * 0.1, 1.05), '#fff8ec' if k % 2 else '#e9c9a0', segments=6))
for k in range(3):
    p.append(kit.box((0.42, 0.28, 0.1), (X - 0.3 + k * 0.32, 0, 0.36 + (k % 2) * 0.11), CARTON, bevel=0.03))
finish(p, 'fm_eggtable', X)


def hen(name, x, body, tail):
    q = [kit.box((0.34, 0.42, 0.3), (x, 0.02, 0.3), body, bevel=0.12, segments=2)]
    q.append(kit.sphere(0.12, (x, -0.2, 0.52), body, segments=10))
    q.append(kit.box((0.05, 0.12, 0.09), (x, -0.2, 0.67), '#e8463a', bevel=0.02))
    q.append(kit.cone(0.04, 0.0, 0.1, (x, -0.33, 0.51), '#ffb52e', verts=6, rot=(math.pi / 2, 0, 0)))
    q.append(kit.sphere(0.035, (x, -0.29, 0.44), '#e8463a', segments=6))
    for sx in (-1, 1):
        q.append(kit.sphere(0.02, (x + sx * 0.08, -0.29, 0.55), 'black', segments=4))
        q.append(kit.box((0.04, 0.24, 0.16), (x + sx * 0.17, 0.04, 0.32), tail, bevel=0.03))
        q.append(kit.cylinder(0.018, 0.16, (x + sx * 0.07, 0.02, 0.08), '#ffb52e', verts=5))
    q.append(kit.box((0.2, 0.1, 0.26), (x, 0.24, 0.45), tail, bevel=0.05, rot=(-0.6, 0, 0)))
    finish(q, name, x)


hen('fm_hen', 79.0, '#fbf6ea', '#ede3cc')
hen('fm_hen_brown', 80.0, '#b8672e', '#8f4a1f')

# A feeding trough for the run (the game fills it with corn when the hens are fed).
X = 82.0
p = [kit.box((1.3, 0.42, 0.08), (X, 0, 0.12), PLANK_DARK, bevel=0.0)]
for sy in (-1, 1):
    p.append(kit.box((1.3, 0.06, 0.24), (X, sy * 0.2, 0.22), PLANK, bevel=0.0))
for sx in (-1, 1):
    p.append(kit.box((0.06, 0.46, 0.3), (X + sx * 0.64, 0, 0.2), PLANK_DARK, bevel=0.0))
finish(p, 'fm_trough', X)

# The feed store: a little open-fronted shed of feed sacks, a tall feed silo
# behind it, and a hopper in front where corn is tipped in.
X = 88.0
p = [kit.box((2.8, 2.2, 0.16), (X, 0.2, 0.08), STONE, bevel=0.03)]
for sx in (-1, 1):
    p.append(kit.box((0.12, 2.0, 2.2), (X + sx * 1.3, 0.3, 1.2), PLANK, bevel=0.02))
p.append(kit.box((2.6, 0.12, 2.4), (X, 1.25, 1.3), PLANK_DARK, bevel=0.02))
for i in range(6):
    p.append(kit.box((0.04, 0.04, 2.3), (X - 1.1 + i * 0.44, 1.18, 1.3), '#7a5230', bevel=0.0))
p.append(kit.box((3.0, 2.5, 0.1), (X, 0.25, 2.55), ROOF_GREEN, bevel=0.03, rot=(0.16, 0, 0)))
SACK = '#e6d3a8'
for i, (sx, sy, sz) in enumerate(((-0.7, 0.7, 0.45), (0.0, 0.75, 0.45), (0.7, 0.7, 0.45), (-0.35, 0.72, 0.95), (0.35, 0.74, 0.95), (0.85, 0.2, 0.45))):
    p.append(kit.box((0.62, 0.44, 0.5), (X + sx, sy, sz), SACK, bevel=0.14, segments=2))
    p.append(kit.box((0.2, 0.02, 0.16), (X + sx, sy - 0.23, sz + 0.04), '#c94a3d', bevel=0.0))
# The silo behind, silver-blue with a cone cap and a ladder.
p.append(kit.cylinder(0.8, 3.6, (X + 1.9, 1.6, 1.8), '#b9c7d4', verts=16))
for z in (0.9, 1.8, 2.7):
    p.append(kit.cylinder(0.83, 0.08, (X + 1.9, 1.6, z), '#94a4b3', verts=16))
p.append(kit.cone(0.88, 0.0, 0.9, (X + 1.9, 1.6, 4.05), '#94a4b3', verts=16))
for k in range(9):
    p.append(kit.box((0.3, 0.04, 0.04), (X + 1.9, 0.8, 0.4 + k * 0.38), 'dark', bevel=0.0))
for sx in (-1, 1):
    p.append(kit.box((0.04, 0.04, 3.4), (X + 1.9 + sx * 0.15, 0.79, 1.8), 'dark', bevel=0.0))
# The hopper in front, half full of corn.
p.append(kit.box((1.5, 0.6, 0.5), (X, -1.15, 0.35), PLANK_DARK, bevel=0.03))
p.append(kit.box((1.36, 0.46, 0.06), (X, -1.15, 0.58), CORN, bevel=0.0))
for k in range(5):
    p.append(kit.sphere(0.07, (X - 0.5 + k * 0.25, -1.15, 0.62), '#ffc61a', segments=6))
p.append(kit.box((1.1, 0.06, 0.32), (X, -1.47, 0.42), '#3f7a5a', bevel=0.02))
finish(p, 'fm_feedstore', X)

toy = kit.toy_material('toy')
for obj in models:
    kit.use_material(obj, toy)
print('triangles', {o.name: kit.triangles([o]) for o in models})
# Three files, each well under the 512 KiB a Playables file may weigh: the
# buildings, the props and crops, and the poultry farm.
BUILDINGS = {'fm_farmhouse', 'fm_barn', 'fm_stand', 'fm_well', 'fm_gate', 'fm_windmill', 'fm_chapel'}
POULTRY = {'fm_henhouse', 'fm_eggtable', 'fm_hen', 'fm_hen_brown', 'fm_trough', 'fm_feedstore'}
glb = Path(sys.argv[1] if len(sys.argv) > 1 else 'farm.glb')
for suffix, keep in (('', lambda n: n in BUILDINGS), ('-props', lambda n: n not in BUILDINGS | POULTRY), ('-poultry', lambda n: n in POULTRY)):
    chosen = [b for b in bases if keep(b.name)]
    kit.export(chosen + [m for m in models if m.parent in chosen], str(glb.with_name(glb.stem + suffix + glb.suffix)))
if len(sys.argv) > 2:
    out = Path(sys.argv[2])
    for i, (cx, dist) in enumerate(((-30, 34), (2, 30), (38, 26), (80, 22))):
        print(kit.preview(str(out.with_name(f'{out.stem}_{i}{out.suffix}')), look_at=(cx, 0, 1.5), distance=dist,
                          size=(1600, 800), ground='#8fd46a', angles=((0.0, -1, 0.75),)))
