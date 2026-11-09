"""Willowbrook's farm and village (Chapter 2), all in one file, each piece
standing on its own named base so the game can place them one by one.
Fronts face -Y here (+Z in the game, towards the camera).

Buildings: fm_farmhouse (white clapboard, shingled roof with dormers, porch,
rocking chair), fm_barn (red, gambrel roof, big doors, hay loft and hoist, a
cupola with a rooster weathervane), fm_stand (the farm stand: crates of
produce on a counter facing the camera, a canopy over the back only, so
whoever serves stays in view), fm_well, fm_gate (the farm's sign over the
track), fm_windmill (the old windmill, sails broken until the landmark is
built), fm_chapel (the village chapel, its bell in an open belfry).
Props: fm_scarecrow, fm_cart, fm_haybale, fm_fence (one 2 m rail section),
fm_sunflowers, fm_duck.
Crops, one plot each (2.6 x 2.8 m), three stages: fm_veg_1..3, fm_corn_1..3.
Then the poultry farm and its hens and rooster, the dairy and its cows, the
vehicles, and the valley's orchard, bakery, market and windmill.

Parts the game moves are their own meshes, each in an empty named
<model>_<part> standing at its pivot (see finish()): the animals' heads,
legs, wings and tails, every vehicle's wheels, the
weathervanes and the chapel bell. Empty spots named <model>_smoke mark
where chimneys and exhausts puff (render/farmMotion.ts).

Usage: python art/blender/farm.py <out.glb> [preview.png]
(writes <out>.glb with the farmhouse, barn and stand, <out>-village.glb with
the well, gate, old windmill and chapel, <out>-props.glb with the props and
crops, <out>-poultry.glb with the poultry farm, <out>-dairy.glb with the
dairy, <out>-vehicles.glb with the road vehicles and the farm's machines,
and <out>-valley.glb with the orchard, bakery, market and restored windmill)
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


def empty(name, parent, at):
    node = kit.bpy.data.objects.new(name, None)
    kit.bpy.context.scene.collection.objects.link(node)
    node.parent = parent
    node.location = at
    return node


def finish(parts, name, x, moving=None, markers=None):
    """Joins a model and stands it in a named empty at its base: quantizing
    moves and scales a mesh's own node, so the game places the empty and
    leaves the mesh's node as it is.

    `moving` holds the parts the game moves, {part: (parts, pivot)}: each is
    its own mesh in an empty named <name>_<part> standing at `pivot`, which
    the game turns (a hen's head, a wheel). `markers` are empty spots the game
    reads, {part: point}: where a chimney smokes, say. Points are absolute,
    like the parts'.
    """
    base = empty(name, None, (x, 0, 0))
    bases.append(base)
    if parts:
        obj = kit.join(parts, name + '_mesh')
        kit.set_origin(obj, (x, 0, 0))
        obj.parent = base
        obj.location = (0, 0, 0)
        models.append(obj)
    for part, (pieces, pivot) in (moving or {}).items():
        holder = empty(f'{name}_{part}', base, (pivot[0] - x, pivot[1], pivot[2]))
        obj = kit.join(pieces, f'{name}_{part}_mesh')
        kit.set_origin(obj, pivot)
        obj.parent = holder
        obj.location = (0, 0, 0)
        models.append(obj)
    for part, at in (markers or {}).items():
        empty(f'{name}_{part}', base, (at[0] - x, at[1], at[2]))


def blob(radii, at, col, segments=12, rot=(0, 0, 0)):
    """An ellipsoid: a sphere stretched to `radii` (x, y, z), then turned by `rot`."""
    kit.bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=max(4, segments // 2), radius=1, location=at)
    obj = kit.bpy.context.object
    obj.scale = radii
    kit.bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return kit._finish(obj, col, rot=rot)


def turn(obj, angle, pivot):
    # Spins a part about a vertical axis through `pivot` (for roofs whose ridge runs along Y). The
    # part's vertices are relative to its origin (a box's is where it was made), so the pivot is too.
    import mathutils
    local = mathutils.Vector(pivot) - obj.location
    m = (mathutils.Matrix.Translation(local) @ mathutils.Matrix.Rotation(angle, 4, 'Z') @
         mathutils.Matrix.Translation(-local))
    obj.data.transform(m)
    return obj


def gable_roof(length, wall_length, half, wall_half, eave, rise, x, y, roof_col, wall_col, thick=0.28):
    # A roof shell (ridge along X, centred on (x, y)) over a filled-in gable wall.
    shell = [(y - half, eave), (y, eave + rise), (y + half, eave),
             (y + half - thick, eave), (y, eave + rise - thick * 1.2), (y - half + thick, eave)]
    k = (rise - thick * 1.2) / half
    gable = [(y - wall_half, eave), (y, eave + wall_half * k), (y + wall_half, eave)]
    return [kit.profile(shell, length, x, roof_col), kit.profile(gable, wall_length, x, wall_col)]


def slope_rows(length, x, a, b, col, rows=5, start=1):
    """Shingle courses: thin strips along a roof slope, across X, between two
    points (y, z) on its outer surface (`a` at the eave, `b` higher up)."""
    q = []
    angle = math.atan2(b[1] - a[1], b[0] - a[0])
    n = (-math.sin(angle), math.cos(angle)) if b[0] > a[0] else (math.sin(angle), -math.cos(angle))
    tilt = angle if b[0] > a[0] else angle - math.pi
    for k in range(start, rows):
        t = k / rows
        yy = a[0] + (b[0] - a[0]) * t + n[0] * 0.03
        zz = a[1] + (b[1] - a[1]) * t + n[1] * 0.03
        q.append(kit.box((length, 0.1, 0.05), (x, yy, zz), col, bevel=0.0, rot=(tilt, 0, 0)))
    return q


def window(q, x, y, z, w, h, frame=None, shutters=None, box=None, panes=True, face=-1):
    """A window on a wall facing -Y at `y` (or +X/-X with face='x+'/'x-'):
    glass, a frame, cross bars, and optional shutters and a flower box."""
    frame = frame or TRIM
    if face in (-1, 1):
        sy = face
        q.append(kit.box((w, 0.08, h), (x, y + sy * 0.02, z), GLASS, bevel=0.0))
        for dz in (-h / 2, h / 2):
            q.append(kit.box((w + 0.16, 0.1, 0.08), (x, y + sy * 0.05, z + dz), frame, bevel=0.0))
        for dx in (-w / 2, w / 2):
            q.append(kit.box((0.08, 0.1, h + 0.08), (x + dx, y + sy * 0.05, z), frame, bevel=0.0))
        if panes:
            q.append(kit.box((0.05, 0.1, h), (x, y + sy * 0.05, z), frame, bevel=0.0))
            q.append(kit.box((w, 0.1, 0.05), (x, y + sy * 0.05, z), frame, bevel=0.0))
        q.append(kit.box((w + 0.26, 0.18, 0.07), (x, y + sy * 0.09, z - h / 2 - 0.06), frame, bevel=0.0))
        if shutters:
            for sx in (-1, 1):
                q.append(kit.box((w * 0.45, 0.06, h + 0.04), (x + sx * (w * 0.75 + 0.06), y + sy * 0.05, z), shutters, bevel=0.0))
                for k in range(3):
                    q.append(kit.box((w * 0.38, 0.08, 0.03), (x + sx * (w * 0.75 + 0.06), y + sy * 0.07, z - h / 3 + k * h / 3), '#2f5f45' if shutters == ROOF_GREEN else PLANK_DARK, bevel=0.0))
        if box:
            q.append(kit.box((w + 0.1, 0.26, 0.18), (x, y + sy * 0.16, z - h / 2 - 0.2), PLANK_DARK, bevel=0.03))
            for k, col in enumerate(box):
                q.append(kit.sphere(0.09, (x - w / 2 + 0.12 + k * (w - 0.24) / max(1, len(box) - 1), y + sy * 0.18, z - h / 2 - 0.06), col, segments=6))
                q.append(kit.sphere(0.07, (x - w / 2 + 0.2 + k * (w - 0.24) / max(1, len(box) - 1), y + sy * 0.12, z - h / 2 - 0.1), LEAF, segments=5))
    else:
        sx = 1 if face == 'x+' else -1
        q.append(kit.box((0.08, w, h), (x + sx * 0.02, y, z), GLASS, bevel=0.0))
        for dz in (-h / 2, h / 2):
            q.append(kit.box((0.1, w + 0.16, 0.08), (x + sx * 0.05, y, z + dz), frame, bevel=0.0))
        for dy in (-w / 2, w / 2):
            q.append(kit.box((0.1, 0.08, h + 0.08), (x + sx * 0.05, y + dy, z), frame, bevel=0.0))
        if panes:
            q.append(kit.box((0.1, 0.05, h), (x + sx * 0.05, y, z), frame, bevel=0.0))
            q.append(kit.box((0.1, w, 0.05), (x + sx * 0.05, y, z), frame, bevel=0.0))
        q.append(kit.box((0.18, w + 0.26, 0.07), (x + sx * 0.09, y, z - h / 2 - 0.06), frame, bevel=0.0))


def lantern(q, x, y, z, glow='#ffd86b'):
    """A little black lantern with a warm glass (hangs from `z`)."""
    q.append(kit.box((0.04, 0.04, 0.16), (x, y, z - 0.08), 'dark', bevel=0.0))
    q.append(kit.box((0.2, 0.2, 0.04), (x, y, z - 0.18), 'dark', bevel=0.0))
    q.append(kit.box((0.15, 0.15, 0.22), (x, y, z - 0.31), glow, bevel=0.02))
    q.append(kit.cone(0.14, 0.02, 0.12, (x, y, z - 0.14), 'dark', verts=4, rot=(0, 0, math.pi / 4)))
    q.append(kit.box((0.18, 0.18, 0.04), (x, y, z - 0.44), 'dark', bevel=0.0))


def flower_pot(q, x, y, col, z=0.0):
    q.append(kit.cone(0.16, 0.2, 0.28, (x, y, z + 0.14), '#c9643c', verts=10))
    q.append(kit.sphere(0.2, (x, y, z + 0.38), LEAF, segments=8))
    for k in range(4):
        a = k * math.pi / 2 + 0.4
        q.append(kit.sphere(0.07, (x + math.cos(a) * 0.13, y + math.sin(a) * 0.13, z + 0.47), col, segments=6))


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
GLASS = '#cfeeff'
CHROME = '#dfe6ec'
LAMP = '#fff3a0'
TAIL_LAMP = '#e8463a'
SACK = '#e6d3a8'

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
# Shingle courses on the roof, two dormer windows, crossbars in the upstairs windows.
p += slope_rows(6.6, X, (-1.8, 3.45), (0.9, 5.45), '#437c5c', rows=7)
for wx in (-1.6, 1.6):
    p.append(kit.box((0.95, 0.9, 0.85), (X + wx, -0.75, 4.35), CLAPBOARD, bevel=0.03))
    pts = [(-0.75 - 0.66, 4.72), (-0.75, 5.18), (-0.75 + 0.66, 4.72), (-0.75 + 0.54, 4.72), (-0.75, 5.04), (-0.75 - 0.54, 4.72)]
    p.append(turn(kit.profile(pts, 1.25, X + wx, ROOF_GREEN), math.pi / 2, (X + wx, -0.75, 0)))
    p.append(kit.box((0.86, 0.1, 0.32), (X + wx, -1.18, 4.88), CLAPBOARD, bevel=0.0))
    window(p, X + wx, -1.21, 4.32, 0.5, 0.5)
    p.append(kit.box((0.06, 0.1, 0.8), (X + wx, -1.6, 3.05), TRIM, bevel=0.0))
    p.append(kit.box((0.8, 0.1, 0.06), (X + wx, -1.6, 3.05), TRIM, bevel=0.0))
# Windows round the sides, a pane in the door and a hood over it, porch lanterns, potted flowers.
for sx, face in ((-1, 'x-'), (1, 'x+')):
    window(p, X + sx * 3.0, 0.2, 1.8, 0.8, 0.95, face=face)
    window(p, X + sx * 3.0, 2.0, 1.8, 0.8, 0.95, face=face)
p.append(kit.box((0.5, 0.1, 0.5), (X, -1.63, 1.75), GLASS, bevel=0.0))
p.append(kit.box((1.4, 0.4, 0.08), (X, -1.75, 2.48), TRIM, bevel=0.02))
for sx in (-1, 1):
    lantern(p, X + sx * 0.9, -3.0, 2.48)
for px, col in ((-0.95, 'hotpink'), (0.95, 'yellow')):
    flower_pot(p, X + px, -3.75, col)
p.append(kit.box((0.9, 0.5, 0.03), (X, -2.0, 0.51), '#c94a3d', bevel=0.0))
# Bricks on the chimney.
for k in range(4):
    p.append(kit.box((0.62, 0.62, 0.04), (X - 1.6, 1.6, 4.5 + k * 0.32), '#8f4c3a', bevel=0.0))
finish(p, 'fm_farmhouse', X, markers={'smoke': (X - 1.6, 1.6, 6.0)})

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
# Shingle courses and white trim along the roof's eaves and its break.
p += slope_rows(W + 0.5, X, (-half, 3.75), (-half * 0.62, 5.3), '#6e7c8b', rows=4)
p += slope_rows(W + 0.5, X, (-half * 0.62, 5.3), (0, 6.25), '#6e7c8b', rows=3)
for (yy, zz) in ((-half, 3.72), (-half * 0.62, 5.3), (0, 6.27)):
    p.append(kit.box((W + 0.6, 0.14, 0.12), (X, yy - 0.02, zz), TRIM, bevel=0.0))
for ex in (-1, 1):
    pts = ((-half, 3.75), (-half * 0.62, 5.3), (0, 6.25), (half * 0.62, 5.3), (half, 3.75))
    for (y0, z0), (y1, z1) in zip(pts, pts[1:]):
        length = math.hypot(y1 - y0, z1 - z0)
        p.append(kit.box((0.12, length, 0.14), (X + ex * (W / 2 + 0.26), (y0 + y1) / 2, (z0 + z1) / 2), TRIM, bevel=0.0, rot=(math.atan2(z1 - z0, y1 - y0), 0, 0)))
    for wy in (-1.6, 1.6):
        p.append(kit.box((0.12, 0.12, 3.5), (X + ex * (W / 2 + 0.01), wy * 0 + ex * 0 + (-D / 2 if wy < 0 else D / 2), 2.05), TRIM, bevel=0.0))
# X-braced windows either side of the doors, and one in each gable.
for wx in (-3.2, 3.2):
    p.append(kit.box((0.8, 0.1, 0.8), (X + wx, -D / 2 - 0.04, 2.3), '#5a3a22', bevel=0.0))
    for dz in (-0.42, 0.42):
        p.append(kit.box((0.96, 0.12, 0.1), (X + wx, -D / 2 - 0.07, 2.3 + dz), TRIM, bevel=0.0))
    for dx in (-0.42, 0.42):
        p.append(kit.box((0.1, 0.12, 0.94), (X + wx + dx, -D / 2 - 0.07, 2.3), TRIM, bevel=0.0))
    for sgn in (-1, 1):
        p.append(kit.box((1.05, 0.12, 0.08), (X + wx, -D / 2 - 0.08, 2.3), TRIM, bevel=0.0, rot=(0, sgn * 0.785, 0)))
for ex, face in ((-1, 'x-'), (1, 'x+')):
    window(p, X + ex * W / 2, 0, 4.6, 0.7, 0.7, face=face)
# The hay hoist: a beam out over the loft door, a rope and a hook.
p.append(kit.box((0.22, 1.1, 0.22), (X, -D / 2 - 0.45, 5.55), PLANK_DARK, bevel=0.02))
p.append(kit.cylinder(0.015, 0.9, (X, -D / 2 - 0.9, 5.0), STRAW_DARK, verts=4))
p.append(kit.torus(0.07, 0.02, (X, -D / 2 - 0.9, 4.5), '#3b3b42', rot=(math.pi / 2, 0, 0), major_segments=8, minor_segments=4))
# A cupola on the ridge with louvred sides and a little roof.
p.append(kit.box((1.0, 1.0, 0.75), (X, 0, 6.55), TRIM, bevel=0.03))
for k in range(4):
    p.append(kit.box((0.76, 1.04, 0.05), (X, 0, 6.35 + k * 0.13), '#cfc6b0', bevel=0.0))
    p.append(kit.box((1.04, 0.76, 0.05), (X, 0, 6.35 + k * 0.13), '#cfc6b0', bevel=0.0))
p.append(kit.cone(0.88, 0.0, 0.55, (X, 0, 7.2), '#6e7c8b', verts=4, rot=(0, 0, math.pi / 4)))
p.append(kit.cylinder(0.035, 0.6, (X, 0, 7.65), 'dark', verts=6))
for d in ((0.5, 0.05), (0.05, 0.5)):
    p.append(kit.box((d[0], d[1], 0.04), (X, 0, 7.75), 'dark', bevel=0.0))
vane = [kit.box((0.5, 0.06, 0.3), (X, 0, 8.1), 'dark', bevel=0.02)]
vane.append(kit.box((0.14, 0.06, 0.2), (X - 0.26, 0, 8.27), 'dark', bevel=0.02))
vane.append(kit.box((0.06, 0.06, 0.12), (X - 0.3, 0, 8.4), '#c94a3d', bevel=0.0))
vane.append(kit.box((0.2, 0.05, 0.24), (X + 0.3, 0, 8.18), 'dark', bevel=0.02, rot=(0, -0.5, 0)))
vane.append(kit.box((0.7, 0.03, 0.03), (X, 0, 7.92), 'dark', bevel=0.0))
vane.append(kit.cone(0.06, 0.0, 0.14, (X - 0.42, 0, 7.92), 'dark', verts=4, rot=(0, -math.pi / 2, 0)))
# A lantern by the doors, hay bales stacked on one side, milk cans on the other.
lantern(p, X + W / 2 - 0.35, -D / 2 - 0.2, 3.25)
for k, (bx, bz) in enumerate(((3.4, 0.35), (2.75, 0.35), (3.08, 0.95))):
    p.append(kit.box((0.62, 0.42, 0.55), (X + bx, -D / 2 - 0.45, bz), STRAW, bevel=0.06))
    p.append(kit.box((0.64, 0.44, 0.05), (X + bx, -D / 2 - 0.45, bz + 0.1), STRAW_DARK, bevel=0.0))
for k in range(2):
    cx = X - 3.4 + k * 0.42
    p.append(kit.cylinder(0.17, 0.5, (cx, -D / 2 - 0.35, 0.5), '#c9d3dc', verts=12))
    p.append(kit.cylinder(0.11, 0.12, (cx, -D / 2 - 0.35, 0.81), '#c9d3dc', verts=10))
    p.append(kit.cylinder(0.13, 0.05, (cx, -D / 2 - 0.35, 0.89), '#94a4b3', verts=10))
finish(p, 'fm_barn', X, moving={'vane': (vane, (X, 0, 7.9))})

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
# Bunting under the canopy's edge, and a price tag stuck in each crate.
p.append(kit.box((3.3, 0.02, 0.02), (X, 0.25, 2.42), '#ffffff', bevel=0.0))
for k in range(11):
    p.append(kit.cone(0.1, 0.0, 0.2, (X - 1.5 + k * 0.3, 0.25, 2.32), ('#d8432f', '#ffd23f', '#3f9a55', '#3a7fb0')[k % 4], verts=3, rot=(math.pi, 0, 0)))
for i in range(4):
    cx = X - 1.2 + i * 0.8
    p.append(kit.box((0.02, 0.02, 0.3), (cx + 0.25, -0.5, 1.05), PLANK_DARK, bevel=0.0))
    p.append(kit.box((0.2, 0.03, 0.13), (cx + 0.25, -0.52, 1.22), '#fffdf2', bevel=0.0))
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
p += slope_rows(1.9, X, (-0.7, 2.35), (0, 2.95), '#8a5532', rows=4)
p.append(kit.box((0.06, 0.06, 0.4), (X + 0.85, -0.3, 1.65), 'dark', bevel=0.0))
p.append(kit.cylinder(0.035, 0.22, (X + 0.95, -0.45, 1.5), PLANK, verts=6, rot=(0, math.pi / 2, 0)))
p.append(kit.torus(0.2, 0.025, (X + 0.25, 0, 1.38), '#3b3b42', major_segments=12, minor_segments=4))
p.append(kit.torus(0.2, 0.02, (X + 0.25, 0, 1.15), '#3b3b42', major_segments=12, minor_segments=4))
p.append(kit.torus(0.16, 0.015, (X + 0.25, 0, 1.45), '#3b3b42', rot=(math.pi / 2, 0, 0), major_segments=10, minor_segments=4))
for k, (a, col) in enumerate(((0.6, 'hotpink'), (2.2, 'yellow'), (3.6, 'white'), (5.0, 'red'))):
    for j in range(3):
        p.append(kit.sphere(0.08, (X + math.cos(a + j * 0.18) * 1.05, math.sin(a + j * 0.18) * 1.05, 0.12), col if j != 1 else LEAF, segments=6))
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
    p.append(kit.box((0.5, 0.08, 0.08), (X + sx * 2.4 - sx * 0.25, -0.22, 2.2), 'dark', bevel=0.0))
    lantern(p, X + sx * 2.4 - sx * 0.45, -0.22, 2.2)
    # A planter of flowers at the foot of each post.
    p.append(kit.box((0.9, 0.6, 0.35), (X + sx * 2.4, -0.35, 0.18), PLANK, bevel=0.03))
    for k in range(4):
        p.append(kit.sphere(0.12, (X + sx * 2.4 - 0.3 + k * 0.2, -0.35, 0.42), ('hotpink', 'yellow', 'white', 'red')[k], segments=6))
        p.append(kit.sphere(0.1, (X + sx * 2.4 - 0.2 + k * 0.2, -0.25, 0.36), LEAF, segments=5))
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
# The stub of a third sail, snapped short; boards nailed over the windows.
p.append(kit.box((0.5, 0.08, 0.9), (X + math.sin(4.0) * 0.45, -1.75, 6.9 + math.cos(4.0) * 0.45), PLANK, bevel=0.0, rot=(0, 4.0, 0)))
for wz in (3.3, 5.4):
    r = 2.0 - 0.75 * (wz - 0.5) / 6.4
    for k, tilt in enumerate((0.3, -0.25)):
        p.append(kit.box((0.75, 0.06, 0.12), (X, -r - 0.04, wz - 0.12 + k * 0.24), PLANK, bevel=0.0, rot=(0, tilt, 0)))
# Ivy climbing the tower, and fallen boards at its foot.
rng3 = random.Random(5)
for k in range(16):
    a = -math.pi / 2 + rng3.uniform(-1.1, 0.4)
    z = rng3.uniform(0.6, 3.6)
    r = 2.0 - 0.75 * (z - 0.5) / 6.4 + 0.02
    p.append(kit.sphere(rng3.uniform(0.14, 0.24), (X + math.cos(a) * r, math.sin(a) * r, z), LEAF_DARK if k % 2 else LEAF, segments=6))
for k, (bx, by, ang) in enumerate(((-1.6, -2.4, 0.4), (-1.2, -2.7, -0.3), (1.7, -2.3, 1.2))):
    p.append(kit.box((1.4, 0.18, 0.06), (X + bx, by, 0.05 + k * 0.02), PLANK, bevel=0.0, rot=(0, 0, ang)))
for k in range(3):
    p.append(kit.cylinder(1.5 - 0.42 * (k + 1), 0.06, (X, 0, 7.0 + 0.5 * (k + 1)), '#8a5532', verts=16))
finish(p, 'fm_windmill', X)

# --- The village chapel: white walls, a steeple with a bell. ----------------
X = 16.0
p = [kit.box((4.4, 7.0, 0.2), (X, 0.5, 0.1), STONE, bevel=0.03)]
p.append(kit.box((4.0, 6.4, 3.4), (X, 0.8, 1.9), CLAPBOARD, bevel=0.05))
# The ridge runs front to back: build it along X, then turn it.
for part in gable_roof(7.0, 6.4, 2.5, 2.0, 3.55, 2.0, X, 0.8, ROOF_SLATE, CLAPBOARD):
    p.append(turn(part, math.pi / 2, (X, 0.8, 0)))
rows = slope_rows(7.0, X, (0.8 - 2.5, 3.55), (0.8, 5.55), '#4f5c6a', rows=6) + slope_rows(7.0, X, (0.8 + 2.5, 3.55), (0.8, 5.55), '#4f5c6a', rows=6)
for part in rows:
    p.append(turn(part, math.pi / 2, (X, 0.8, 0)))
# The steeple over the front: a tower, an open belfry where the bell hangs, a spire.
p.append(kit.box((1.6, 1.6, 1.2), (X, -2.4, 3.7), CLAPBOARD, bevel=0.04))
for sx in (-1, 1):
    for sy in (-1, 1):
        p.append(kit.box((0.22, 0.22, 1.3), (X + sx * 0.69, -2.4 + sy * 0.69, 4.95), CLAPBOARD, bevel=0.02))
p.append(kit.box((1.7, 1.7, 0.3), (X, -2.4, 5.75), CLAPBOARD, bevel=0.03))
p.append(kit.box((1.66, 1.66, 0.08), (X, -2.4, 4.32), TRIM, bevel=0.0))
p.append(kit.box((0.08, 1.4, 0.08), (X, -2.4, 5.5), '#5a3a22', bevel=0.0))
bell = [kit.cone(0.36, 0.14, 0.5, (X, -2.4, 5.05), 'gold', verts=14)]
bell.append(kit.torus(0.34, 0.04, (X, -2.4, 4.82), '#e0b020', major_segments=14, minor_segments=4))
bell.append(kit.sphere(0.07, (X, -2.4, 4.78), '#c99a1a', segments=6))
bell.append(kit.cylinder(0.04, 0.2, (X, -2.4, 5.38), '#5a3a22', verts=6))
p.append(kit.cone(1.15, 0.0, 2.6, (X, -2.4, 7.2), ROOF_SLATE, verts=4, rot=(0, 0, math.pi / 4)))
p.append(kit.box((0.08, 0.08, 0.9), (X, -2.4, 8.8), 'gold', bevel=0.0))
p.append(kit.box((0.5, 0.08, 0.08), (X, -2.4, 8.95), 'gold', bevel=0.0))
# An arched door with steps, a round window over it.
p.append(kit.box((1.1, 0.12, 1.7), (X, -3.25, 1.05), '#8f6036', bevel=0.04))
p.append(kit.cylinder(0.55, 0.12, (X, -3.25, 1.9), '#8f6036', verts=14, rot=(math.pi / 2, 0, 0)))
p.append(kit.box((0.04, 0.14, 1.7), (X, -3.3, 1.05), '#5a3a22', bevel=0.0))
for k in range(2):
    p.append(kit.box((1.8 - k * 0.3, 0.4, 0.14), (X, -3.5 + k * 0.2, 0.27 + k * 0.14), STONE, bevel=0.02))
p.append(kit.cylinder(0.3, 0.1, (X, -3.22, 3.2), '#7fb6e8', verts=14, rot=(math.pi / 2, 0, 0)))
p.append(kit.torus(0.31, 0.05, (X, -3.26, 3.2), TRIM, rot=(math.pi / 2, 0, 0), major_segments=14, minor_segments=4))
# Tall arched windows of coloured glass down each side.
for wy in (-0.5, 1.4, 3.3):
    for side in (-1, 1):
        wx = X + side * 2.02
        for k, col in enumerate(('#7fb6e8', '#e8a0b8', '#ffe08a')):
            p.append(kit.box((0.1, 0.6, 0.45), (wx, wy, 1.65 + k * 0.45), col, bevel=0.0))
        p.append(kit.cylinder(0.3, 0.1, (wx, wy, 2.55), '#7fb6e8', verts=12, rot=(0, math.pi / 2, 0)))
        p.append(kit.box((0.12, 0.72, 0.07), (wx + side * 0.02, wy, 1.4), TRIM, bevel=0.0))
        for dy in (-0.33, 0.33):
            p.append(kit.box((0.12, 0.07, 1.2), (wx + side * 0.02, wy + dy, 2.0), TRIM, bevel=0.0))
# Flower beds along the front, and a lantern by the door.
for sx in (-1, 1):
    p.append(kit.box((1.2, 0.45, 0.15), (X + sx * 1.35, -2.75, 0.27), SOIL, bevel=0.02))
    for k in range(5):
        p.append(kit.sphere(0.11, (X + sx * 1.35 - 0.45 + k * 0.22, -2.75, 0.42), ('hotpink', 'white', 'yellow', 'red', 'white')[k], segments=6))
    lantern(p, X + sx * 0.85, -3.3, 2.3)
finish(p, 'fm_chapel', X, moving={'bell': (bell, (X, -2.4, 5.45))})

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
# Patches on his coat, a face, and a crow perched on his arm.
p.append(kit.box((0.2, 0.04, 0.2), (X + 0.18, -0.19, 1.6), '#e8c35a', bevel=0.0))
p.append(kit.box((0.16, 0.04, 0.14), (X - 0.2, -0.19, 1.3), '#c94a3d', bevel=0.0))
for sx in (-1, 1):
    p.append(kit.box((0.07, 0.04, 0.07), (X + sx * 0.1, -0.29, 2.18), 'dark', bevel=0.0))
p.append(kit.box((0.22, 0.04, 0.04), (X, -0.29, 2.02), 'dark', bevel=0.0))
p.append(blob((0.09, 0.15, 0.1), (X + 0.75, 0, 1.82), '#2d3440', segments=8))
p.append(kit.sphere(0.07, (X + 0.75, -0.13, 1.92), '#2d3440', segments=8))
p.append(kit.cone(0.03, 0.0, 0.08, (X + 0.75, -0.23, 1.91), '#ffb52e', verts=4, rot=(math.pi / 2, 0, 0)))
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
    disc = kit.star_disc(0.36, 0.2, 0.03, (X + dx, -0.04, h), '#ffb52e', points=10)
    disc.rotation_euler = (math.pi / 2 - 0.3, 0, 0)
    kit._apply_all(disc)
    p.append(disc)
    p.append(kit.box((0.3, 0.12, 0.04), (X + dx - 0.12, 0, h * 0.7), LEAF, bevel=0.0, rot=(0, -0.4, 0)))
finish(p, 'fm_sunflowers', X)

# A duck (paddles round the pond in the game, and dips its head).
X = 39.5
p = [blob((0.2, 0.28, 0.15), (X, 0.02, 0.15), TRIM, segments=12)]
p.append(kit.box((0.14, 0.14, 0.1), (X, 0.27, 0.26), TRIM, bevel=0.04, rot=(-0.7, 0, 0)))
for sx in (-1, 1):
    p.append(blob((0.04, 0.17, 0.08), (X + sx * 0.18, 0.06, 0.2), '#ece6d8', segments=8, rot=(0.15, 0, 0)))
head = [blob((0.08, 0.08, 0.13), (X, -0.18, 0.3), TRIM, segments=10)]
head.append(kit.sphere(0.12, (X, -0.2, 0.42), TRIM, segments=12))
head.append(kit.box((0.12, 0.16, 0.05), (X, -0.36, 0.39), '#ffa62b', bevel=0.02))
for sx in (-1, 1):
    head.append(kit.sphere(0.024, (X + sx * 0.08, -0.29, 0.45), 'black', segments=6))
finish(p, 'fm_duck', X, moving={'head': (head, (X, -0.16, 0.22))})

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
p += slope_rows(4.7, X, (-1.85, 2.45), (0, 3.6), '#8a5532', rows=5)
lantern(p, X + 2.1, -0.4, 2.2)
# A rooster weathervane on the ridge (it turns in the wind, in the game).
p.append(kit.cylinder(0.035, 0.7, (X + 1.2, 0, 3.95), 'dark', verts=6))
vane = [kit.box((0.4, 0.05, 0.26), (X + 1.2, 0, 4.36), 'dark', bevel=0.02)]
vane.append(kit.box((0.12, 0.05, 0.18), (X + 1.0, 0, 4.52), 'dark', bevel=0.02))
vane.append(kit.box((0.1, 0.05, 0.28), (X + 1.42, 0, 4.48), 'dark', bevel=0.02, rot=(0, -0.5, 0)))
vane.append(kit.box((0.05, 0.05, 0.08), (X + 0.98, 0, 4.64), '#c94a3d', bevel=0.0))
finish(p, 'fm_henhouse', X, moving={'vane': (vane, (X + 1.2, 0, 4.3))})

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


COMB = '#e8463a'
BEAK = '#ffb52e'


def hen(name, x, body, wing, tail, neck=None, rooster=False):
    """A hen (or the rooster): a round body, and moving parts the game
    animates: the head (pecks, and bobs as she walks), the wings (flap), the
    tail (wags) and the two legs (walk). Front is -Y; about 0.85 m to the comb."""
    still = [blob((0.2, 0.26, 0.19), (x, 0.03, 0.37), body, segments=14)]
    still.append(blob((0.16, 0.13, 0.15), (x, -0.13, 0.4), body, segments=12))
    if neck:
        still.append(blob((0.13, 0.11, 0.12), (x, -0.13, 0.5), neck, segments=10))
    # The head: on a short neck, with a comb, a beak, a wattle and bright eyes.
    head = [blob((0.09, 0.09, 0.12), (x, -0.17, 0.56), neck or body, segments=10)]
    head.append(blob((0.115, 0.12, 0.115), (x, -0.21, 0.69), neck or body, segments=12))
    for k in range(4 if rooster else 3):
        r = (0.06 if rooster else 0.045) - abs(k - 1.2) * 0.008
        head.append(kit.sphere(r, (x, -0.27 + k * 0.05, 0.8 + (0.02 if k in (1, 2) else 0)), COMB, segments=8))
    head.append(kit.cone(0.045, 0.0, 0.12, (x, -0.35, 0.68), BEAK, verts=8, rot=(math.pi / 2, 0, 0)))
    head.append(blob((0.03, 0.03, 0.06 if rooster else 0.045), (x, -0.3, 0.59), COMB, segments=8))
    for sx in (-1, 1):
        head.append(kit.sphere(0.026, (x + sx * 0.09, -0.28, 0.71), 'black', segments=8))
        head.append(kit.sphere(0.009, (x + sx * 0.1, -0.3, 0.725), '#ffffff', segments=4))
    # The tail: a fan of feathers (the rooster's long and curving).
    tails = []
    if rooster:
        # Long sickle feathers rising from the rump and arching back.
        for k, (dx, lean) in enumerate(((-0.06, 0.3), (0.0, 0.0), (0.06, -0.3))):
            tails.append(kit.box((0.055, 0.1, 0.3), (x + dx, 0.27, 0.58), tail if k != 1 else '#2d6a52', bevel=0.025, rot=(-0.35, 0, lean)))
            tails.append(kit.box((0.05, 0.18, 0.07), (x + dx * 1.6, 0.39, 0.72), '#2d6a52' if k != 1 else tail, bevel=0.02, rot=(0.5, 0, lean)))
    else:
        for dx, lean in ((-0.06, 0.3), (0.0, 0.0), (0.06, -0.3)):
            tails.append(kit.box((0.06, 0.12, 0.24), (x + dx, 0.27, 0.53), tail, bevel=0.03, rot=(-0.55, 0, lean)))
    # The wings, folded at her sides (they lift from the shoulder).
    wings = {}
    for side, sx in (('wing_l', -1), ('wing_r', 1)):
        piece = [blob((0.04, 0.17, 0.11), (x + sx * 0.19, 0.05, 0.38), wing, segments=10, rot=(0.25, 0, 0))]
        piece.append(blob((0.035, 0.07, 0.05), (x + sx * 0.2, 0.2, 0.34), tail, segments=8, rot=(0.4, 0, 0)))
        wings[side] = (piece, (x + sx * 0.17, -0.05, 0.46))
    # The legs, and three toes on each foot.
    legs = {}
    for side, sx in (('leg_l', -1), ('leg_r', 1)):
        piece = [kit.cylinder(0.022, 0.2, (x + sx * 0.08, 0.03, 0.1), BEAK, verts=6)]
        for t in (-0.45, 0.0, 0.45):
            piece.append(kit.box((0.022, 0.1, 0.016), (x + sx * 0.08 + math.sin(t) * 0.04, 0.03 - math.cos(t) * 0.05, 0.008), BEAK, bevel=0.0, rot=(0, 0, t)))
        legs[side] = (piece, (x + sx * 0.08, 0.03, 0.2))
    finish(still, name, x, moving={'head': (head, (x, -0.13, 0.5)), 'tail': (tails, (x, 0.2, 0.45)), **wings, **legs})


hen('fm_hen', 79.0, '#fbf6ea', '#efe5cf', '#e2d6bb')
hen('fm_hen_brown', 80.0, '#b8672e', '#9a5223', '#7a3d18')
hen('fm_rooster', 81.0, '#c9562c', '#a3401f', '#1f4a3a', neck='#f0a030', rooster=True)

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

# --- The dairy and the deliveries (Part C). ---------------------------------
# The cow barn: cream walls on a stone base, a terracotta roof, an open front
# showing three straw-bedded stalls and a hay rack, and a sign board over them
# (the game paints it).
X = 100.0
W = 6.6
D = 4.4
p = [kit.box((W + 0.4, D + 0.4, 0.2), (X, 0, 0.1), STONE, bevel=0.03)]
p.append(kit.box((W, 0.25, 2.7), (X, D / 2 - 0.12, 1.55), CLAPBOARD, bevel=0.04))
for sx in (-1, 1):
    p.append(kit.box((0.25, D, 2.7), (X + sx * (W / 2 - 0.12), 0, 1.55), CLAPBOARD, bevel=0.04))
    p.append(kit.box((0.3, 0.3, 2.8), (X + sx * (W / 2 - 0.1), -D / 2 + 0.1, 1.6), BARN_RED, bevel=0.03))
p.append(kit.box((W + 0.1, D + 0.1, 0.5), (X, 0, 0.45), BARN_RED, bevel=0.02))
p.append(kit.box((W - 0.4, D - 0.4, 0.06), (X, 0.1, 0.24), STRAW, bevel=0.0))
for i in range(4):
    sx = X - W / 2 + 0.3 + i * (W - 0.6) / 3
    p.append(kit.box((0.1, 2.2, 1.1), (sx, 0.6, 0.85), PLANK_DARK, bevel=0.02))
for i in range(3):
    sx = X - W / 2 + 0.3 + (i + 0.5) * (W - 0.6) / 3
    p.append(kit.box((1.5, 0.4, 0.5), (sx, D / 2 - 0.45, 1.5), PLANK, bevel=0.02))
    for k in range(4):
        p.append(kit.box((0.35, 0.3, 0.12), (sx - 0.5 + k * 0.33, D / 2 - 0.45, 1.8), STRAW, bevel=0.0, rot=(0.3, 0, k)))
    p.append(kit.box((1.6, 0.1, 0.12), (sx, -D / 2 + 0.6, 1.0), PLANK, bevel=0.0))
p.append(kit.box((W + 0.3, 0.3, 0.35), (X, -D / 2 + 0.1, 3.0), BARN_RED, bevel=0.03))
p += gable_roof(W + 0.8, W, D / 2 + 0.45, D / 2, 3.1, 1.6, X, 0, '#b0563f', CLAPBOARD)
p.append(kit.box((3.4, 0.12, 0.6), (X, -D / 2 - 0.05, 3.55), '#3f7a5a', bevel=0.04))
p.append(kit.box((W + 1.0, 0.16, 0.16), (X, 0, 4.72), '#8a4f2a', bevel=0.03))
p += slope_rows(W + 0.8, X, (-(D / 2 + 0.45), 3.1), (0, 4.7), '#984a36', rows=5)
for sx in (-1, 1):
    lantern(p, X + sx * 1.9, -D / 2 + 0.05, 2.85)
    for k in range(2):
        cx = X + sx * (W / 2 + 0.35)
        p.append(kit.cylinder(0.17, 0.5, (cx, -D / 2 + 0.4 + k * 0.4, 0.45), '#c9d3dc', verts=12))
        p.append(kit.cylinder(0.12, 0.08, (cx, -D / 2 + 0.4 + k * 0.4, 0.74), '#94a4b3', verts=10))
# A little cupola on the ridge, louvred, with a cow weathervane.
p.append(kit.box((0.8, 0.8, 0.6), (X, 0, 4.9), CLAPBOARD, bevel=0.03))
for k in range(3):
    p.append(kit.box((0.6, 0.84, 0.04), (X, 0, 4.75 + k * 0.13), '#cfc6b0', bevel=0.0))
    p.append(kit.box((0.84, 0.6, 0.04), (X, 0, 4.75 + k * 0.13), '#cfc6b0', bevel=0.0))
p.append(kit.cone(0.75, 0.0, 0.55, (X, 0, 5.47), '#b0563f', verts=4, rot=(0, 0, math.pi / 4)))
p.append(kit.cylinder(0.03, 0.5, (X, 0, 5.9), 'dark', verts=6))
vane = [kit.box((0.42, 0.05, 0.2), (X, 0, 6.22), 'dark', bevel=0.02)]
vane.append(kit.box((0.16, 0.05, 0.14), (X - 0.27, 0, 6.28), 'dark', bevel=0.02))
for lx in (-0.14, 0.14):
    vane.append(kit.box((0.05, 0.05, 0.12), (X + lx, 0, 6.08), 'dark', bevel=0.0))
vane.append(kit.box((0.6, 0.03, 0.03), (X, 0, 6.0), 'dark', bevel=0.0))
finish(p, 'fm_cowbarn', X, moving={'vane': (vane, (X, 0, 6.0))})


PINK = '#f2a7b0'
HOOF = '#3b2a1c'


def cow(name, x, coat, patch, bell=False):
    """A cow: a deep body (spotted, or plain with a bell on her collar), an
    udder, and moving parts the game animates: the head (grazes, chews),
    four legs (walk) and the tail (swishes). Front is -Y."""
    still = [kit.box((0.84, 1.6, 0.74), (x, 0.05, 1.07), coat, bevel=0.24, segments=3)]
    if patch:
        for (px, py, pz, rx, ry, rz) in ((0.41, 0.35, 1.08, 0.03, 0.33, 0.22), (-0.41, -0.2, 1.04, 0.03, 0.3, 0.24),
                                          (0.41, -0.45, 1.15, 0.03, 0.16, 0.14), (0.12, 0.45, 1.44, 0.24, 0.3, 0.03),
                                          (-0.14, -0.35, 1.44, 0.2, 0.22, 0.03), (-0.41, 0.55, 1.12, 0.03, 0.18, 0.16)):
            still.append(blob((rx, ry, rz), (x + px, py, pz), patch, segments=10))
    still.append(blob((0.18, 0.17, 0.12), (x, 0.42, 0.7), PINK, segments=12))
    for sx in (-1, 1):
        for sy in (-1, 1):
            still.append(kit.cylinder(0.025, 0.1, (x + sx * 0.07, 0.42 + sy * 0.07, 0.56), PINK, verts=6))
    # The head on a thick neck: a pink muzzle, nostrils, eyes, ears, horns, a forelock.
    head = [blob((0.25, 0.3, 0.27), (x, -0.78, 1.22), coat, segments=12)]
    head.append(kit.box((0.52, 0.56, 0.5), (x, -1.07, 1.32), coat, bevel=0.17, segments=2))
    head.append(kit.box((0.48, 0.26, 0.3), (x, -1.37, 1.17), PINK, bevel=0.11, segments=2))
    for sx in (-1, 1):
        head.append(kit.sphere(0.04, (x + sx * 0.1, -1.5, 1.2), '#c96f7c', segments=6))
        head.append(kit.sphere(0.05, (x + sx * 0.21, -1.27, 1.44), 'black', segments=8))
        head.append(kit.sphere(0.016, (x + sx * 0.23, -1.31, 1.47), '#ffffff', segments=4))
        head.append(kit.box((0.26, 0.09, 0.14), (x + sx * 0.38, -0.98, 1.47), coat, bevel=0.04, rot=(0, sx * 0.35, 0)))
        head.append(kit.box((0.14, 0.05, 0.08), (x + sx * 0.4, -1.02, 1.47), PINK, bevel=0.02, rot=(0, sx * 0.35, 0)))
        head.append(kit.cone(0.055, 0.015, 0.2, (x + sx * 0.19, -0.98, 1.62), '#efe6cf', verts=8, rot=(0, sx * 0.55, 0)))
    head.append(blob((0.14, 0.08, 0.06), (x, -1.15, 1.58), patch or '#9a6236', segments=8))
    if patch:
        head.append(blob((0.03, 0.16, 0.13), (x + 0.26, -1.05, 1.34), patch, segments=8))
    if bell:
        head.append(kit.torus(0.27, 0.035, (x, -0.8, 1.08), '#8f2f2a', rot=(math.pi / 2 - 0.5, 0, 0), major_segments=16, minor_segments=4))
        head.append(kit.cone(0.08, 0.04, 0.14, (x, -0.98, 0.84), '#ffd23f', verts=10))
        head.append(kit.sphere(0.03, (x, -0.98, 0.76), '#c99a1a', segments=6))
    # The legs, each with a dark hoof; the tail, ending in a tuft.
    legs = {}
    for side, sx, sy in (('leg_fl', -1, -1), ('leg_fr', 1, -1), ('leg_bl', -1, 1), ('leg_br', 1, 1)):
        ly = -0.5 if sy < 0 else 0.55
        piece = [kit.cylinder(0.105, 0.64, (x + sx * 0.25, ly, 0.42), coat, verts=10)]
        if patch and sy > 0:
            piece.append(kit.cylinder(0.108, 0.2, (x + sx * 0.25, ly, 0.55), patch, verts=10))
        piece.append(kit.cylinder(0.115, 0.13, (x + sx * 0.25, ly, 0.065), HOOF, verts=10))
        legs[side] = (piece, (x + sx * 0.25, ly, 0.78))
    tail = [kit.cylinder(0.03, 0.62, (x, 0.9, 1.0), coat, verts=6, rot=(0.12, 0, 0))]
    tail.append(blob((0.07, 0.07, 0.12), (x, 0.94, 0.66), HOOF if not patch else patch, segments=8))
    finish(still, name, x, moving={'head': (head, (x, -0.68, 1.2)), 'tail': (tail, (x, 0.86, 1.3)), **legs})


cow('fm_cow', 106.0, '#fbf6ea', '#2f2f35')
cow('fm_cow_brown', 108.0, '#c98b52', None, bell=True)

# The dairy: a stainless milk tank on legs, a bottling table and crates of bottles.
X = 112.0
STEEL = '#c9d3dc'
p = [kit.box((2.8, 1.5, 0.12), (X, 0, 0.06), STONE, bevel=0.03)]
p.append(kit.cylinder(0.55, 1.4, (X - 0.6, 0.25, 1.15), STEEL, verts=16, rot=(0, math.pi / 2, 0)))
for sx in (-1, 1):
    p.append(kit.sphere(0.55, (X - 0.6 + sx * 0.7, 0.25, 1.15), STEEL, segments=14))
    for sy in (-1, 1):
        p.append(kit.cylinder(0.05, 0.6, (X - 0.6 + sx * 0.5, 0.25 + sy * 0.3, 0.42), '#94a4b3', verts=6))
p.append(kit.cylinder(0.12, 0.12, (X - 0.6, 0.25, 1.75), '#94a4b3', verts=10))
p.append(kit.box((1.0, 0.08, 0.3), (X - 0.6, -0.33, 1.15), '#3a7fb0', bevel=0.0))
p.append(kit.box((1.2, 0.7, 0.08), (X + 0.75, -0.1, 0.8), PLANK, bevel=0.03))
for sx in (-1, 1):
    for sy in (-1, 1):
        p.append(kit.box((0.07, 0.07, 0.78), (X + 0.75 + sx * 0.52, -0.1 + sy * 0.28, 0.39), PLANK_DARK, bevel=0.0))
for k in range(4):
    bx = X + 0.4 + (k % 2) * 0.22
    by = -0.2 + (k // 2) * 0.2
    p.append(kit.cylinder(0.07, 0.24, (bx, by, 0.96), '#ffffff', verts=8))
    p.append(kit.cylinder(0.05, 0.04, (bx, by, 1.1), '#3a7fb0', verts=8))
p.append(kit.box((0.5, 0.36, 0.22), (X + 1.0, -0.05, 0.95), '#3a7fb0', bevel=0.03))
for sx in (-1, 1):
    p.append(kit.box((0.5, 0.36, 0.22), (X + 0.95 + sx * 0.05, 0.45, 0.2 + (sx + 1) * 0.12), '#3a7fb0', bevel=0.03))
finish(p, 'fm_dairy', X)

# Road vehicles' wheels turn in the game: each is its own part, about its axle.


def road_wheel(x, y, r, width=0.26):
    q = [kit.cylinder(r, width, (x, y, r), '#2b2b30', verts=16, rot=(0, math.pi / 2, 0))]
    q.append(kit.cylinder(r * 0.55, width + 0.02, (x, y, r), CHROME, verts=12, rot=(0, math.pi / 2, 0)))
    q.append(kit.cylinder(r * 0.2, width + 0.05, (x, y, r), '#9aa3ad', verts=8, rot=(0, math.pi / 2, 0)))
    # Spokes on the hub, so the eye sees it turn.
    for k in range(3):
        q.append(kit.box((width + 0.035, r * 0.95, 0.06), (x, y, r), '#9aa3ad', bevel=0.0, rot=(k * math.pi / 3, 0, 0)))
    return q


def road_wheels(x, length, width, r=0.36, front=None, back=None):
    """The four wheels of a road vehicle, by their game names (front is -Y)."""
    fy = -length * 0.32 if front is None else front
    by = length * 0.32 if back is None else back
    return {f'wheel_{end}{side}': (road_wheel(x + sx * width / 2, wy, r), (x + sx * width / 2, wy, r))
            for end, wy in (('f', fy), ('b', by)) for side, sx in (('l', -1), ('r', 1))}


def cab_front(q, x, y, width, z, grille='#3b3b42'):
    """A bumper, a grille and two round headlamps across a cab's front at `y`."""
    q.append(kit.box((width - 0.1, 0.14, 0.2), (x, y - 0.05, 0.55), CHROME, bevel=0.04))
    q.append(kit.box((width * 0.45, 0.06, 0.32), (x, y, z), grille, bevel=0.02))
    for k in range(3):
        q.append(kit.box((width * 0.42, 0.07, 0.03), (x, y - 0.01, z - 0.1 + k * 0.1), CHROME, bevel=0.0))
    for sx in (-1, 1):
        q.append(kit.cylinder(0.12, 0.07, (x + sx * width * 0.34, y, z), CHROME, verts=12, rot=(math.pi / 2, 0, 0)))
        q.append(kit.cylinder(0.09, 0.08, (x + sx * width * 0.34, y - 0.01, z), LAMP, verts=12, rot=(math.pi / 2, 0, 0)))


def mirrors(q, x, y, width, z):
    for sx in (-1, 1):
        q.append(kit.box((0.18, 0.04, 0.04), (x + sx * (width / 2 + 0.08), y, z), '#2b2b30', bevel=0.0))
        q.append(kit.box((0.06, 0.1, 0.2), (x + sx * (width / 2 + 0.18), y, z), '#2b2b30', bevel=0.02))


def tail_lamps(q, x, y, width, z):
    for sx in (-1, 1):
        q.append(kit.box((0.18, 0.06, 0.14), (x + sx * (width / 2 - 0.15), y, z), TAIL_LAMP, bevel=0.02))


# The farm van: a green cab and a cream box body with green bands, chrome bumpers.
X = 118.0
p = []
p.append(kit.box((1.8, 3.9, 0.45), (X, 0, 0.6), '#3f7a5a', bevel=0.06))
p.append(kit.box((1.78, 1.2, 1.0), (X, -1.35, 1.3), '#3f7a5a', bevel=0.12, segments=2))
p.append(kit.box((1.6, 0.1, 0.55), (X, -1.95, 1.45), GLASS, bevel=0.02, rot=(0.25, 0, 0)))
for sx in (-1, 1):
    p.append(kit.box((0.06, 0.7, 0.5), (X + sx * 0.9, -1.35, 1.45), GLASS, bevel=0.0))
    p.append(kit.box((0.04, 0.12, 0.03), (X + sx * 0.91, -1.05, 1.12), CHROME, bevel=0.0))
    for wy in (-1.25, 1.25):
        p.append(kit.box((0.06, 0.95, 0.12), (X + sx * 0.87, wy * 0.0 + (-1.25 if wy < 0 else 1.15), 0.95), '#2f5f45', bevel=0.03))
cab_front(p, X, -1.96, 1.8, 0.92)
mirrors(p, X, -1.6, 1.78, 1.55)
p.append(kit.box((1.86, 2.7, 1.75), (X, 0.6, 1.65), CLAPBOARD, bevel=0.08))
for z in (1.0, 2.35):
    p.append(kit.box((1.9, 2.72, 0.14), (X, 0.6, z), '#3f7a5a', bevel=0.0))
p.append(kit.box((1.9, 1.1, 0.5), (X, 0.6, 1.68), '#ffffff', bevel=0.04))
# A painted carrot on the side panel, the farm's mark.
for sx in (-1, 1):
    p.append(kit.cone(0.1, 0.0, 0.42, (X + sx * 0.96, 0.6, 1.68), CARROT, verts=8, rot=(0, math.pi / 2 * sx, 0)))
    p.append(kit.box((0.04, 0.08, 0.14), (X + sx * 0.97, 0.36, 1.68), LEAF, bevel=0.0))
p.append(kit.box((1.84, 0.06, 1.6), (X, 1.96, 1.65), '#f1e9d6', bevel=0.02))
p.append(kit.box((0.04, 0.06, 1.5), (X, 2.0, 1.65), '#d8cdb5', bevel=0.0))
tail_lamps(p, X, 1.98, 1.8, 0.9)
p.append(kit.box((1.6, 0.12, 0.2), (X, 2.02, 0.55), '#2b2b30', bevel=0.03))
finish(p, 'fm_van', X, moving=road_wheels(X, 3.9, 1.6))

# The milk tanker: a rounded blue cab-over with a white roof and an amber
# light bar, towing a white tank in black cow spots, lettered MILK down each
# side, with steel end rings, a hatch and catwalk on top, a ladder and a hose
# reel behind, and twin rear axles.
X = 124.0
DAIRY_BLUE = '#3a7fb0'
TANK = '#f7f4ee'
p = [kit.box((1.6, 5.0, 0.3), (X, 0.4, 0.66), '#2b2b30', bevel=0.04)]
p.append(kit.box((1.96, 1.55, 1.3), (X, -1.82, 1.38), DAIRY_BLUE, bevel=0.22, segments=3))
p.append(kit.box((1.9, 1.45, 0.36), (X, -1.78, 2.16), '#ffffff', bevel=0.16, segments=2))
p.append(kit.box((1.0, 0.2, 0.12), (X, -2.25, 2.4), '#ffb52e', bevel=0.04))
p.append(kit.box((1.66, 0.08, 0.56), (X, -2.6, 1.66), GLASS, bevel=0.03, rot=(0.12, 0, 0)))
for sx in (-1, 1):
    p.append(kit.box((0.06, 0.72, 0.5), (X + sx * 0.99, -1.72, 1.66), GLASS, bevel=0.0))
    p.append(kit.box((0.03, 1.5, 0.1), (X + sx * 0.99, -1.82, 1.08), '#ffffff', bevel=0.0))
    p.append(kit.box((0.04, 0.14, 0.04), (X + sx * 1.0, -1.35, 1.32), CHROME, bevel=0.0))
    # A step up to the cab, a chrome fuel tank, a fender over each rear axle.
    p.append(kit.box((0.25, 0.4, 0.06), (X + sx * 0.9, -1.25, 0.5), '#3b3b42', bevel=0.0))
    p.append(kit.cylinder(0.2, 0.6, (X + sx * 0.82, -0.55, 0.66), CHROME, verts=12, rot=(math.pi / 2, 0, 0)))
    p.append(kit.box((0.36, 1.45, 0.08), (X + sx * 0.84, 2.0, 0.98), '#2b2b30', bevel=0.03))
cab_front(p, X, -2.6, 1.96, 0.95)
mirrors(p, X, -2.25, 1.96, 1.8)
# The tank, with rounded ends and steel rings.
p.append(kit.cylinder(0.88, 3.0, (X, 0.95, 1.8), TANK, verts=22, rot=(math.pi / 2, 0, 0)))
for sy in (-1, 1):
    p.append(blob((0.88, 0.42, 0.88), (X, 0.95 + sy * 1.5, 1.8), TANK, segments=18))
    p.append(kit.cylinder(0.9, 0.12, (X, 0.95 + sy * 1.45, 1.8), '#c9d3dc', verts=22, rot=(math.pi / 2, 0, 0)))
# Black cow spots round the tank (each a flat patch lying on its curve).
for (a, y, sy, st) in ((0.35, 0.05, 0.34, 0.26), (1.05, 1.55, 0.3, 0.24), (2.1, 0.4, 0.32, 0.26), (2.75, 1.65, 0.3, 0.22),
                       (math.pi / 2, 0.95, 0.22, 0.2), (1.25, -0.05, 0.22, 0.18), (1.9, 1.75, 0.2, 0.18),
                       (-0.45, 1.7, 0.26, 0.22), (math.pi + 0.45, 0.2, 0.28, 0.24)):
    p.append(blob((0.05, sy, st), (X + math.cos(a) * 0.88, y, 1.8 + math.sin(a) * 0.88), '#2f2f35', segments=10, rot=(0, -a, 0)))
# MILK down each side.
for sx in (-1, 1):
    p.append(kit.box((0.04, 1.7, 0.6), (X + sx * 0.885, 0.95, 1.8), '#ffffff', bevel=0.02))
    # (kit.text's letters lie flat once made: stood up here, facing out.)
    letters = kit.text('MILK', 0.5, (X + sx * 0.92, 0.95, 1.8), DAIRY_BLUE, depth=0.05)
    letters.rotation_euler = (math.pi / 2, 0, sx * math.pi / 2)
    kit._apply_all(letters)
    p.append(letters)
# The hatch and catwalk on top, a ladder and a hose reel behind, tail lamps.
p.append(kit.cylinder(0.28, 0.14, (X, 0.55, 2.7), '#c9d3dc', verts=14))
p.append(kit.cylinder(0.2, 0.06, (X, 0.55, 2.79), '#94a4b3', verts=12))
p.append(kit.box((0.5, 2.4, 0.05), (X, 1.15, 2.69), '#94a4b3', bevel=0.0))
for k in range(5):
    p.append(kit.box((0.04, 0.04, 0.28), (X + 0.25, 0.1 + k * 0.5, 2.83), '#94a4b3', bevel=0.0))
p.append(kit.box((0.04, 2.0, 0.04), (X + 0.25, 1.1, 2.97), '#94a4b3', bevel=0.0))
for k in range(6):
    p.append(kit.box((0.42, 0.04, 0.04), (X - 0.4, 2.82, 0.95 + k * 0.28), CHROME, bevel=0.0))
for dx in (-0.6, -0.2):
    p.append(kit.box((0.04, 0.04, 1.6), (X + dx, 2.82, 1.65), CHROME, bevel=0.0))
p.append(kit.cylinder(0.26, 0.4, (X + 0.45, 2.75, 1.0), DAIRY_BLUE, verts=14, rot=(0, math.pi / 2, 0)))
p.append(kit.torus(0.19, 0.05, (X + 0.45, 2.75, 1.0), '#2b2b30', rot=(0, math.pi / 2, 0), major_segments=12, minor_segments=4))
tail_lamps(p, X, 2.92, 1.6, 0.72)
for sx in (-1, 1):
    p.append(kit.box((0.36, 0.04, 0.4), (X + sx * 0.84, 2.78, 0.45), '#2b2b30', bevel=0.0))
wheels = road_wheels(X, 5.0, 1.72, r=0.42, front=-1.7, back=1.55)
for side, sx in (('l', -1), ('r', 1)):
    wheels[f'wheel_c{side}'] = (road_wheel(X + sx * 0.86, 2.45, 0.42), (X + sx * 0.86, 2.45, 0.42))
finish(p, 'fm_tanker', X, moving=wheels)

# The orders board: a little roofed notice board on two posts, pinned with orders.
X = 130.0
p = []
for sx in (-1, 1):
    p.append(kit.box((0.16, 0.16, 2.4), (X + sx * 1.0, 0, 1.2), PLANK_DARK, bevel=0.02))
p.append(kit.box((2.1, 0.12, 1.2), (X, 0, 1.5), '#8f6036', bevel=0.04))
p.append(kit.box((1.9, 0.14, 1.0), (X, -0.01, 1.5), '#c9a36a', bevel=0.02))
for i, (nx, nz, col) in enumerate(((-0.6, 1.7, '#fffdf2'), (0.0, 1.75, '#ffe58a'), (0.6, 1.68, '#fffdf2'), (-0.35, 1.25, '#bfe3ff'), (0.4, 1.25, '#fffdf2'))):
    p.append(kit.box((0.45, 0.04, 0.38), (X + nx, -0.09, nz), col, bevel=0.0, rot=(0, 0.08 * (i - 2), 0)))
    p.append(kit.sphere(0.035, (X + nx, -0.12, nz + 0.15), 'red', segments=4))
p.append(kit.prism((2.5, 0.7, 0.4), (X, 0, 2.15), SHINGLE))
finish(p, 'fm_orders', X)

# --- The machines (Part D): the pickup and the feed truck. -----------------
# The farm pickup: a sky-blue cab and an open bed, parked by the fields to be loaded.
X = 160.0
p = [kit.box((1.7, 3.6, 0.4), (X, 0, 0.62), '#2b2b30', bevel=0.04)]
p.append(kit.box((1.7, 1.5, 0.55), (X, -1.05, 1.0), '#5aa9e0', bevel=0.1, segments=2))
p.append(kit.box((1.6, 1.1, 0.7), (X, -0.6, 1.55), '#5aa9e0', bevel=0.12, segments=2))
p.append(kit.box((1.5, 0.08, 0.45), (X, -1.17, 1.6), GLASS, bevel=0.02, rot=(0.3, 0, 0)))
p.append(kit.box((1.3, 0.06, 0.32), (X, -0.04, 1.6), GLASS, bevel=0.0))
for sx in (-1, 1):
    p.append(kit.box((0.06, 0.6, 0.4), (X + sx * 0.82, -0.55, 1.6), GLASS, bevel=0.0))
    p.append(kit.box((0.04, 0.12, 0.03), (X + sx * 0.83, -0.3, 1.25), CHROME, bevel=0.0))
cab_front(p, X, -1.81, 1.7, 0.98)
mirrors(p, X, -0.95, 1.6, 1.5)
p.append(kit.box((1.7, 1.9, 0.12), (X, 0.85, 0.88), '#4b8fc0', bevel=0.02))
for sx in (-1, 1):
    p.append(kit.box((0.08, 1.9, 0.4), (X + sx * 0.82, 0.85, 1.1), '#5aa9e0', bevel=0.02))
p.append(kit.box((1.7, 0.08, 0.4), (X, 1.78, 1.1), '#5aa9e0', bevel=0.02))
tail_lamps(p, X, 1.83, 1.7, 1.1)
p.append(kit.box((1.6, 0.12, 0.16), (X, 1.86, 0.6), CHROME, bevel=0.03))
# (Its bed is empty: the game stacks what's loaded in it.)
finish(p, 'fm_pickup', X, moving=road_wheels(X, 3.6, 1.6, r=0.34))

# The feed truck: a yellow cab and a green feed hopper body, its loading
# auger along the top, a sack of feed painted on the side.
X = 166.0
p = [kit.box((1.9, 4.8, 0.4), (X, 0.2, 0.62), '#2b2b30', bevel=0.04)]
p.append(kit.box((1.9, 1.5, 1.4), (X, -1.55, 1.45), '#ffc61a', bevel=0.14, segments=2))
p.append(kit.box((1.7, 0.1, 0.6), (X, -2.3, 1.65), GLASS, bevel=0.02, rot=(0.2, 0, 0)))
for sx in (-1, 1):
    p.append(kit.box((0.06, 0.8, 0.5), (X + sx * 0.96, -1.55, 1.7), GLASS, bevel=0.0))
cab_front(p, X, -2.31, 1.9, 0.98)
mirrors(p, X, -2.0, 1.9, 1.8)
p.append(kit.box((1.95, 3.0, 1.5), (X, 0.95, 1.6), '#3f7a5a', bevel=0.1))
p.append(kit.box((1.5, 2.6, 0.5), (X, 0.95, 2.55), '#3f7a5a', bevel=0.1))
p.append(kit.box((1.97, 1.2, 0.5), (X, 0.95, 1.75), '#fbf6ea', bevel=0.04))
for sx in (-1, 1):
    p.append(kit.box((0.04, 0.42, 0.34), (X + sx * 0.99, 0.95, 1.75), SACK, bevel=0.03))
    p.append(kit.box((0.04, 0.16, 0.1), (X + sx * 1.0, 0.95, 1.8), '#c94a3d', bevel=0.0))
# The loading auger, and a stack pipe behind the cab (it smokes).
p.append(kit.cylinder(0.12, 1.6, (X + 0.9, 0.2, 2.4), '#9aa3ad', verts=8, rot=(0.5, 0, 0)))
p.append(kit.cylinder(0.06, 1.2, (X - 0.8, -0.72, 2.1), '#3b3b42', verts=8))
p.append(kit.cylinder(0.08, 0.1, (X - 0.8, -0.72, 2.72), CHROME, verts=10))
tail_lamps(p, X, 2.48, 1.95, 0.9)
finish(p, 'fm_feedtruck', X, moving=road_wheels(X, 4.6, 1.7, r=0.4), markers={'smoke': (X - 0.8, -0.72, 2.8)})

# --- The valley's value (Part E). -----------------------------------------
# Apple trees, one per plot: the tree itself, which stays, and what comes and
# goes on it: blossom while the apples set, then ripe apples (picked, they go,
# and the blossom comes again).
CANOPY = '#4fae4a'
CANOPY_LIGHT = '#68c35a'
BARK = '#8a5a34'


APPLE_H = 1.5


def apple_spots(n=14):
    """Where blossom opens and apples hang, round the canopy (the same spots for both)."""
    rng2 = random.Random(41)
    spots = []
    for _ in range(n):
        a = rng2.uniform(0, 2 * math.pi)
        e = rng2.uniform(-0.2, 1.0)
        r = 0.9
        spots.append((math.cos(a) * r * math.cos(e * 0.6), math.sin(a) * r * math.cos(e * 0.6), APPLE_H + 0.5 + math.sin(e) * 0.55))
    return spots


def apple_tree(x):
    """An apple tree, which stays when its apples are picked: the trunk, two boughs and the canopy."""
    q = [kit.cylinder(0.13, APPLE_H, (x, 0, APPLE_H / 2), BARK, verts=8)]
    for sx in (-1, 1):
        q.append(kit.cylinder(0.06, 0.8, (x + sx * 0.25, 0, APPLE_H - 0.05), BARK, verts=6, rot=(0, sx * 0.7, 0)))
    blobs = ((0, 0, 0.55, 0.85), (-0.55, 0.2, 0.25, 0.6), (0.55, -0.15, 0.3, 0.62), (0.15, 0.5, 0.35, 0.55), (-0.2, -0.5, 0.3, 0.55), (0, 0, 0.95, 0.55))
    for i, (bx, by, bz, r) in enumerate(blobs):
        q.append(kit.sphere(r, (x + bx, by, APPLE_H + bz), CANOPY if i % 2 else CANOPY_LIGHT, segments=8))
    q.append(kit.cylinder(0.75, 0.04, (x, 0, 0.02), '#6aa84f', verts=12))
    finish(q, 'fm_apple_tree', x)


def apple_blossom(x):
    """Pink and white blossom over the canopy (shown on the tree while the apples set)."""
    q = [kit.sphere(0.075, (x + px, py, pz), '#fff0f4' if k % 2 else '#ffc2d6', segments=5) for k, (px, py, pz) in enumerate(apple_spots())]
    finish(q, 'fm_apple_blossom', x)


def apple_fruit(x):
    """Ripe apples on the tree, a basket of them at its foot and a few fallen: what's picked."""
    q = []
    for k, (px, py, pz) in enumerate(apple_spots()):
        q.append(kit.sphere(0.12, (x + px, py, pz), '#e53b30' if k % 3 else '#ff6a3d', segments=6))
        q.append(kit.box((0.02, 0.02, 0.07), (x + px, py, pz + 0.12), BARK, bevel=0.0))
    q.append(kit.cylinder(0.3, 0.28, (x + 0.55, -0.55, 0.14), PLANK, verts=12))
    for k in range(5):
        q.append(kit.sphere(0.1, (x + 0.45 + (k % 3) * 0.1, -0.6 + (k // 3) * 0.12, 0.32), '#e53b30', segments=6))
    for k in range(3):
        q.append(kit.sphere(0.1, (x - 0.4 + k * 0.35, 0.5 - k * 0.3, 0.08), '#e53b30', segments=6))
    finish(q, 'fm_apple_fruit', x)


apple_tree(190.0)
apple_blossom(193.2)
apple_fruit(196.4)

# The bakery: red brick, a cream-trimmed shop window full of loaves, a door, a
# chimney, a sign board over the window (the game paints it), and a bread
# table in front where the baking is picked up.
X = 202.0
BRICK = '#b8553f'
p = [kit.box((5.4, 4.4, 0.18), (X, 0.2, 0.09), STONE, bevel=0.03)]
p.append(kit.box((5.0, 4.0, 3.0), (X, 0.4, 1.65), BRICK, bevel=0.05))
for i in range(6):
    p.append(kit.box((5.04, 0.04, 0.04), (X, -1.62, 0.5 + i * 0.45), '#a04634', bevel=0.0))
p += gable_roof(5.6, 5.0, 2.5, 2.0, 3.1, 1.4, X, 0.4, '#5d6b7a', BRICK)
p.append(kit.box((0.8, 0.8, 2.2), (X + 1.6, 1.0, 4.0), BRICK, bevel=0.04))
p.append(kit.box((0.95, 0.95, 0.18), (X + 1.6, 1.0, 5.15), STONE, bevel=0.03))
p.append(kit.box((2.4, 0.12, 1.3), (X - 0.9, -1.62, 1.55), '#cfeeff', bevel=0.0))
p.append(kit.box((2.6, 0.16, 0.14), (X - 0.9, -1.66, 2.25), CLAPBOARD, bevel=0.02))
p.append(kit.box((2.6, 0.16, 0.14), (X - 0.9, -1.66, 0.87), CLAPBOARD, bevel=0.02))
for k in range(5):
    p.append(kit.box((0.36, 0.2, 0.18), (X - 1.8 + k * 0.45, -1.55, 1.1), '#d9a35c', bevel=0.07, segments=2))
p.append(kit.box((0.95, 0.14, 2.0), (X + 1.4, -1.63, 1.15), '#3f7a5a', bevel=0.04))
p.append(kit.sphere(0.06, (X + 1.15, -1.72, 1.15), 'gold', segments=6))
p.append(kit.box((3.6, 0.1, 0.55), (X - 0.4, -1.66, 2.75), '#3f7a5a', bevel=0.04))
p.append(kit.box((2.6, 0.9, 0.08), (X - 0.9, -2.15, 2.45), '#e9b35c', bevel=0.02, rot=(-0.4, 0, 0)))
# The bread table in front.
p.append(kit.box((2.2, 0.8, 0.08), (X - 0.9, -2.7, 0.82), PLANK, bevel=0.03))
for sx in (-1, 1):
    for sy in (-1, 1):
        p.append(kit.box((0.07, 0.07, 0.8), (X - 0.9 + sx * 1.0, -2.7 + sy * 0.32, 0.4), PLANK_DARK, bevel=0.0))
for k in range(4):
    p.append(kit.box((0.4, 0.22, 0.2), (X - 1.6 + k * 0.48, -2.75, 0.97), '#d9a35c', bevel=0.08, segments=2))
p.append(kit.cylinder(0.24, 0.1, (X + 0.0, -2.6, 0.91), '#e8b26a', verts=12))
# Shingles, bricks on the chimney (it smokes, in the game), mullions in the shop window.
p += slope_rows(5.6, X, (0.4 - 2.5, 3.1), (0.4, 4.5), '#4f5c6a', rows=5)
for k in range(4):
    p.append(kit.box((0.82, 0.82, 0.04), (X + 1.6, 1.0, 3.5 + k * 0.4), '#93412f', bevel=0.0))
for dx in (-0.4, 0.4):
    p.append(kit.box((0.07, 0.14, 1.3), (X - 0.9 + dx, -1.68, 1.55), CLAPBOARD, bevel=0.0))
# A striped awning over the window, a sign of a loaf on a bracket, a lantern, pots of flowers.
for k in range(6):
    p.append(kit.box((0.43, 0.92, 0.09), (X - 1.98 + k * 0.43, -2.15, 2.47), '#ffffff' if k % 2 else '#d8432f', bevel=0.0, rot=(-0.4, 0, 0)))
p.append(kit.box((0.06, 0.9, 0.06), (X + 2.4, -2.0, 2.6), 'dark', bevel=0.0))
p.append(kit.box((0.7, 0.06, 0.5), (X + 2.4, -2.3, 2.25), '#fffdf2', bevel=0.03))
p.append(kit.box((0.5, 0.1, 0.24), (X + 2.4, -2.35, 2.25), '#d9a35c', bevel=0.08, segments=2))
lantern(p, X + 2.0, -1.72, 2.4)
for px, col in ((-2.35, 'hotpink'), (2.0, 'yellow')):
    flower_pot(p, X + px, -1.95, col)
finish(p, 'fm_bakery', X, markers={'smoke': (X + 1.6, 1.0, 5.3)})

# The farmers' market: three stalls in a row under striped awnings, crates of
# everything the farm makes on their counters, a banner over the middle (the
# game paints it). Counters face -Y; whoever serves stands behind them.
X = 212.0
p = []
AWNINGS = (('#d8432f', '#ffffff'), ('#3f9a55', '#ffffff'), ('#3a7fb0', '#ffffff'))
GOODS_COLS = ((CARROT, CABBAGE, TOMATO), (CORN, '#fff8ec', '#e53b30'), ('#d9a35c', '#e53b30', '#ffffff'))
for i, (stripe_a, stripe_b) in enumerate(AWNINGS):
    sx = X - 2.4 + i * 2.4
    p.append(kit.box((2.2, 0.7, 0.8), (sx, -0.3, 0.45), PLANK, bevel=0.03))
    p.append(kit.box((2.24, 0.06, 0.12), (sx, -0.66, 0.7), PLANK_DARK, bevel=0.0))
    for k, col in enumerate(GOODS_COLS[i]):
        cx = sx - 0.65 + k * 0.65
        p.append(kit.box((0.55, 0.45, 0.16), (cx, -0.35, 0.92), PLANK_DARK, bevel=0.02))
        for j in range(3):
            p.append(kit.sphere(0.09, (cx - 0.15 + j * 0.15, -0.38, 1.04), col, segments=6))
    for px in (-1, 1):
        p.append(kit.box((0.1, 0.1, 2.6), (sx + px * 1.05, 1.75, 1.3), PLANK_DARK, bevel=0.0))
        p.append(kit.box((0.08, 0.08, 2.2), (sx + px * 1.05, 0.3, 1.1), PLANK_DARK, bevel=0.0))
    for k in range(6):
        p.append(kit.box((0.37, 1.6, 0.06), (sx - 0.93 + k * 0.37, 1.05, 2.45), stripe_a if k % 2 else stripe_b, bevel=0.0, rot=(-0.28, 0, 0)))
    for k in range(6):
        p.append(kit.cone(0.13, 0.0, 0.18, (sx - 0.93 + k * 0.37, 0.25, 2.12), stripe_a if k % 2 else stripe_b, verts=3, rot=(math.pi, 0, 0)))
    p.append(kit.box((2.0, 0.5, 0.75), (sx, 1.35, 0.38), PLANK_DARK, bevel=0.03))
# The banner on two tall poles over the middle stall.
for px in (-1, 1):
    p.append(kit.cylinder(0.06, 3.8, (X + px * 1.6, 1.9, 1.9), PLANK_DARK, verts=8))
p.append(kit.box((3.3, 0.06, 0.55), (X, 1.9, 3.45), '#fbf6ea', bevel=0.02))
for px in (-1, 1):
    for k in range(4):
        p.append(kit.cone(0.12, 0.0, 0.22, (X + px * (1.6 + 0.35 + k * 0.35), 1.9, 3.2 - k * 0.06), ('#ffd23f', '#d8432f', '#3f9a55', '#3a7fb0')[k], verts=3, rot=(math.pi, 0, 0)))
finish(p, 'fm_market', X)

# The windmill restored: fresh white plaster, a new red cap, a gallery and a
# door; its sails are their own model, turned by the game about the hub.
X = 222.0
p = []
p.append(kit.cylinder(2.25, 0.5, (X, 0, 0.25), STONE_DARK, verts=16))
p.append(kit.cone(2.0, 1.25, 6.4, (X, 0, 3.7), '#fbf6ea', verts=16))
for z in (2.2, 4.6):
    r = 2.0 - 0.75 * (z - 0.5) / 6.4
    p.append(kit.cylinder(r + 0.06, 0.16, (X, 0, z), '#d8432f', verts=16))
p.append(kit.cone(1.55, 0.0, 1.9, (X, 0, 7.85), '#c94a3d', verts=16))
p.append(kit.cylinder(1.6, 0.12, (X, 0, 6.85), PLANK_DARK, verts=16))
for k in range(16):
    a = k * math.pi / 8
    p.append(kit.box((0.06, 0.06, 0.45), (X + math.cos(a) * 1.55, math.sin(a) * 1.55, 7.1), PLANK, bevel=0.0))
p.append(kit.box((0.9, 0.12, 1.7), (X, -2.0, 1.35), '#3f7a5a', bevel=0.04))
for wz in (3.3, 5.4):
    r = 2.0 - 0.75 * (wz - 0.5) / 6.4
    p.append(kit.box((0.5, 0.12, 0.7), (X, -r + 0.02, wz), '#cfeeff', bevel=0.02))
    p.append(kit.box((0.6, 0.14, 0.08), (X, -r, wz + 0.4), TRIM, bevel=0.0))
p.append(kit.cylinder(0.22, 0.8, (X, -1.35, 6.9), PLANK_DARK, verts=8, rot=(math.pi / 2, 0, 0)))
# Flower boxes under the windows, a step at the door, a flag on the cap.
for wz in (3.3, 5.4):
    r = 2.0 - 0.75 * (wz - 0.5) / 6.4
    p.append(kit.box((0.7, 0.25, 0.16), (X, -r - 0.1, wz - 0.48), PLANK, bevel=0.02))
    for k in range(4):
        p.append(kit.sphere(0.08, (X - 0.24 + k * 0.16, -r - 0.14, wz - 0.36), ('hotpink', 'yellow', 'red', 'white')[k], segments=6))
p.append(kit.box((1.3, 0.5, 0.16), (X, -2.15, 0.3), STONE, bevel=0.02))
p.append(kit.cylinder(0.03, 1.0, (X, 0, 9.2), 'dark', verts=6))
p.append(kit.box((0.6, 0.03, 0.35), (X + 0.3, 0, 9.5), '#d8432f', bevel=0.0))
finish(p, 'fm_windmill_fixed', X)

# Its four sails, centred on the hub (the game spins them).
X = 230.0
p = [kit.cylinder(0.3, 0.3, (X, -1.75, 6.9), '#c94a3d', verts=10, rot=(math.pi / 2, 0, 0))]
for k in range(4):
    a = k * math.pi / 2 + 0.3
    length = 3.6
    p.append(kit.box((0.12, 0.08, length), (X + math.sin(a) * length / 2, -1.8, 6.9 + math.cos(a) * length / 2), PLANK_DARK, bevel=0.0, rot=(0, a, 0)))
    for j in range(5):
        d = 0.8 + j * 0.6
        p.append(kit.box((0.7, 0.04, 0.5), (X + math.sin(a) * d + math.cos(a) * 0.38, -1.82, 6.9 + math.cos(a) * d - math.sin(a) * 0.38), '#fbf6ea', bevel=0.0, rot=(0, a, 0)))
    # A frame along the sail's outer edge, and its end.
    p.append(kit.box((0.06, 0.07, 3.1), (X + math.sin(a) * 2.3 + math.cos(a) * 0.76, -1.83, 6.9 + math.cos(a) * 2.3 - math.sin(a) * 0.76), PLANK_DARK, bevel=0.0, rot=(0, a, 0)))
    p.append(kit.box((0.8, 0.07, 0.06), (X + math.sin(a) * 3.85 + math.cos(a) * 0.38, -1.83, 6.9 + math.cos(a) * 3.85 - math.sin(a) * 0.38), PLANK_DARK, bevel=0.0, rot=(0, a, 0)))
finish(p, 'fm_sails', X)

toy = kit.toy_material('toy')
for obj in models:
    kit.use_material(obj, toy)
print('triangles', {b.name: kit.triangles([d for d in b.children_recursive if d.type == 'MESH']) for b in bases})
BUILDINGS = {'fm_farmhouse', 'fm_barn', 'fm_stand'}
VILLAGE = {'fm_well', 'fm_gate', 'fm_windmill', 'fm_chapel'}
POULTRY = {'fm_henhouse', 'fm_eggtable', 'fm_hen', 'fm_hen_brown', 'fm_rooster', 'fm_trough', 'fm_feedstore'}
DAIRY = {'fm_cowbarn', 'fm_cow', 'fm_cow_brown', 'fm_dairy', 'fm_orders'}
VEHICLES = {'fm_van', 'fm_tanker', 'fm_pickup', 'fm_feedtruck'}
VALLEY = {'fm_apple_tree', 'fm_apple_blossom', 'fm_apple_fruit', 'fm_bakery', 'fm_market', 'fm_windmill_fixed', 'fm_sails'}
SETS = (('', BUILDINGS), ('-village', VILLAGE), ('-poultry', POULTRY), ('-dairy', DAIRY), ('-vehicles', VEHICLES), ('-valley', VALLEY))
glb = Path(sys.argv[1] if len(sys.argv) > 1 else 'farm.glb')
# Each file well under the 512 KiB a Playables file may weigh; the props and crops take whatever's left.
everything = set().union(*(names for _, names in SETS))
for suffix, keep in (*((suffix, lambda n, names=names: n in names) for suffix, names in SETS), ('-props', lambda n: n not in everything)):
    chosen = [b for b in bases if keep(b.name)]
    kit.export(chosen + [d for b in chosen for d in b.children_recursive], str(glb.with_name(glb.stem + suffix + glb.suffix)))
if len(sys.argv) > 2:
    out = Path(sys.argv[2])
    for i, (cx, dist) in enumerate(((-30, 34), (2, 30), (38, 26), (80, 22), (106, 20), (124, 20), (146, 22), (168, 22), (196, 18), (214, 22), (226, 22))):
        print(kit.preview(str(out.with_name(f'{out.stem}_{i}{out.suffix}')), look_at=(cx, 0, 1.5), distance=dist,
                          size=(1600, 800), ground='#8fd46a', angles=((0.0, -1, 0.75),)))
