"""The town round the car wash, all in one file as separately named models
(each with its origin at its own base, fronts facing -Y, the camera):
six shops along Main Street, four styles of house with gardens, a street
lamp, a bus stop and a café table. The game writes the shop names on the
sign boards and places everything (src/data/location1.json, "town").

Two files, so each stays small: town-shops.glb (shops, lamp, bus stop,
café table) and town-homes.glb (the houses).

Usage: python art/blender/town.py <out-dir> [preview.png]
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
    # The mesh sits in a named empty at the model's base: quantizing moves
    # and scales the mesh's own node, so the game places the empty.
    obj = kit.join(parts, name + '_mesh')
    kit.set_origin(obj, (x, 0, 0))
    base = kit.bpy.data.objects.new(name, None)
    kit.bpy.context.scene.collection.objects.link(base)
    base.location = (x, 0, 0)
    obj.location = (0, 0, 0)
    obj.parent = base
    models.append(obj)
    bases.append(base)


# Shops: 5 m wide, 5 m deep, a flat roof with a parapet, a big window of
# goods, a door, a striped awning and a sign board above it (y = -2.55,
# z = 3.55 in Blender; the game writes the name there). `extra` adds the
# shop's own rooftop sign and bits out front.
SHOP_W, SHOP_D, SHOP_H = 5.0, 5.0, 3.4


def shop(name, x, wall, trim, awning, goods, extra):
    hw, hd = SHOP_W / 2, SHOP_D / 2
    p = [kit.box((SHOP_W + 0.6, SHOP_D + 1.6, 0.12), (x, -0.5, 0.06), 'concrete', bevel=0.04)]
    p.append(kit.box((SHOP_W, SHOP_D, SHOP_H), (x, 0, SHOP_H / 2), wall, bevel=0.08))
    p.append(kit.box((SHOP_W + 0.2, SHOP_D + 0.2, 0.35), (x, 0, SHOP_H + 0.1), trim, bevel=0.06))
    p.append(kit.box((SHOP_W, SHOP_D, 0.08), (x, 0, 0.42), trim, bevel=0.02))
    # Shop window full of goods, and the door.
    p.append(kit.box((3.0, 0.1, 1.5), (x - 0.7, -hd - 0.02, 1.35), '#cfeeff', bevel=0.03))
    p.append(kit.box((3.2, 0.14, 0.12), (x - 0.7, -hd - 0.04, 0.55), trim, bevel=0.02))
    p.append(kit.box((3.2, 0.14, 0.12), (x - 0.7, -hd - 0.04, 2.15), trim, bevel=0.02))
    for row in range(2):
        for col in range(5):
            p.append(kit.box((0.36, 0.08, 0.32), (x - 1.85 + col * 0.58, -hd - 0.06, 0.95 + row * 0.62), goods[(row + col) % len(goods)], bevel=0.0))
    p.append(kit.box((0.95, 0.12, 2.0), (x + 1.65, -hd - 0.03, 1.0), trim, bevel=0.04))
    p.append(kit.box((0.75, 0.14, 1.75), (x + 1.65, -hd - 0.04, 0.95), '#cfeeff', bevel=0.03))
    p.append(kit.sphere(0.06, (x + 1.35, -hd - 0.14, 1.0), 'gold', segments=6))
    # Upstairs windows.
    for wx in (-1.5, 0, 1.5):
        p.append(kit.box((0.8, 0.1, 0.6), (x + wx, -hd - 0.02, 2.75), '#cfeeff', bevel=0.0))
        p.append(kit.box((0.95, 0.14, 0.1), (x + wx, -hd - 0.05, 2.42), 'white', bevel=0.0))
    # Striped awning over the window and door.
    for i in range(10):
        p.append(kit.box((0.5, 0.95, 0.07), (x - 2.25 + i * 0.5, -hd - 0.42, 2.32), awning if i % 2 else 'white', bevel=0.0, rot=(-0.38, 0, 0)))
    p.append(kit.box((SHOP_W, 0.08, 0.16), (x, -hd - 0.86, 2.12), awning, bevel=0.02))
    # The sign board (the game writes the name).
    p.append(kit.box((3.6, 0.14, 0.72), (x, -hd - 0.07, 3.55), trim, bevel=0.08))
    p += extra(x)
    finish(p, name, x)


def cafe_extra(x):
    # A giant coffee cup with steam on the roof.
    return [kit.cone(0.55, 0.42, 0.9, (x + 1.2, 0.6, SHOP_H + 0.7), 'white', verts=16),
            kit.torus(0.22, 0.07, (x + 1.75, 0.6, SHOP_H + 0.75), 'white', rot=(math.pi / 2, 0, 0), major_segments=12, minor_segments=5),
            kit.cylinder(0.5, 0.05, (x + 1.2, 0.6, SHOP_H + 1.15), '#8a5a3c', verts=16),
            kit.sphere(0.18, (x + 1.1, 0.6, SHOP_H + 1.5), 'white', segments=8),
            kit.sphere(0.13, (x + 1.3, 0.55, SHOP_H + 1.8), 'white', segments=8)]


def bakery_extra(x):
    # A giant croissant on the roof, and a bread rack by the door.
    p = []
    for i, (dx, r) in enumerate(((-0.55, 0.3), (-0.25, 0.38), (0.1, 0.42), (0.45, 0.38), (0.75, 0.3))):
        p.append(kit.sphere(r, (x + 1.0 + dx, 0.6, SHOP_H + 0.55 + (0.12 if i == 2 else 0)), '#e8a24a', segments=10))
    p.append(kit.box((0.6, 0.4, 1.0), (x - 2.1, -3.0, 0.62), 'wood', bevel=0.04))
    for z in (0.5, 0.85):
        p.append(kit.cylinder(0.1, 0.5, (x - 2.1, -3.15, z + 0.2), '#e8a24a', verts=8, rot=(0, math.pi / 2, 0)))
    return p


def toys_extra(x):
    # A giant striped beach ball and a toy rocket on the roof.
    p = [kit.sphere(0.6, (x + 1.3, 0.6, SHOP_H + 0.85), 'red', segments=14),
         kit.torus(0.6, 0.05, (x + 1.3, 0.6, SHOP_H + 0.85), 'white', rot=(math.pi / 2, 0, 0), major_segments=18, minor_segments=4),
         kit.torus(0.6, 0.05, (x + 1.3, 0.6, SHOP_H + 0.85), 'yellow', rot=(0, math.pi / 2, 0), major_segments=18, minor_segments=4),
         kit.cylinder(0.25, 1.0, (x - 1.4, 0.8, SHOP_H + 0.8), 'white', verts=12),
         kit.cone(0.26, 0.0, 0.5, (x - 1.4, 0.8, SHOP_H + 1.55), 'red', verts=12)]
    for a in (0, 2.1, 4.2):
        p.append(kit.box((0.06, 0.4, 0.4), (x - 1.4 + 0.3 * math.cos(a), 0.8 + 0.3 * math.sin(a), SHOP_H + 0.45), 'blue', bevel=0.02, rot=(0, 0, a)))
    return p


def flowers_extra(x):
    # Flower buckets out front and a giant flower on the roof.
    p = []
    for i in range(4):
        bx = x - 2.0 + i * 0.5
        p.append(kit.cone(0.2, 0.16, 0.35, (bx, -3.0, 0.3), 'deepblue', verts=10))
        for j in range(3):
            p.append(kit.sphere(0.1, (bx + (j - 1) * 0.08, -3.0, 0.62 + (j % 2) * 0.08), ('hotpink', 'yellow', 'red', 'lilac')[(i + j) % 4], segments=6))
    p.append(kit.cylinder(0.06, 1.1, (x + 1.2, 0.6, SHOP_H + 0.75), '#3fae5a', verts=6))
    for k in range(6):
        a = k * math.pi / 3
        p.append(kit.sphere(0.28, (x + 1.2 + 0.36 * math.cos(a), 0.45, SHOP_H + 1.45 + 0.36 * math.sin(a)), 'hotpink', segments=8))
    p.append(kit.sphere(0.24, (x + 1.2, 0.38, SHOP_H + 1.45), 'yellow', segments=8))
    return p


def pizza_extra(x):
    # A giant pizza slice standing on the roof.
    p = [kit.cone(1.0, 0.0, 0.18, (x + 0.9, 0.6, SHOP_H + 1.0), '#ffd27a', verts=3, rot=(math.pi / 2, 0, math.pi))]
    p.append(kit.box((1.75, 0.22, 0.24), (x + 0.9, 0.6, SHOP_H + 1.5), '#c98a52', bevel=0.08))
    for dx, dz in ((-0.3, 0.2), (0.3, 0.25), (0.0, -0.15)):
        p.append(kit.cylinder(0.14, 0.05, (x + 0.9 + dx, 0.48, SHOP_H + 1.0 + dz), 'red', verts=10, rot=(math.pi / 2, 0, 0)))
    return p


def books_extra(x):
    # A stack of giant books on the roof.
    p = []
    for i, col in enumerate(('blue', 'red', 'mint', 'gold')):
        p.append(kit.box((1.5 - i * 0.12, 1.0, 0.24), (x + 1.1 + (i % 2) * 0.08, 0.6, SHOP_H + 0.42 + i * 0.25), col, bevel=0.04, rot=(0, 0, (i % 2) * 0.12)))
        p.append(kit.box((1.42 - i * 0.12, 0.94, 0.18), (x + 1.14 + (i % 2) * 0.08, 0.6, SHOP_H + 0.42 + i * 0.25), 'white', bevel=0.02, rot=(0, 0, (i % 2) * 0.12)))
    return p


shop('shop_cafe', -36, '#fff3c4', '#ff8a3c', '#ff8a3c', ('#8a5a3c', 'white', '#ffd24a'), cafe_extra)
shop('shop_bakery', -29, '#ffe3ef', 'hotpink', 'hotpink', ('#e8a24a', '#f2c27a', 'white'), bakery_extra)
shop('shop_toys', -22, '#e3f4ff', 'deepblue', 'blue', ('red', 'yellow', 'blue', 'mint'), toys_extra)
shop('shop_flowers', -15, '#e8ffe8', '#3fae5a', '#5fb84f', ('hotpink', 'yellow', 'lilac', '#ff5c6c'), flowers_extra)
shop('shop_pizza', -8, '#fff0e0', 'red', 'red', ('#ffd27a', 'red', '#3fae5a'), pizza_extra)
shop('shop_books', -1, '#f0e6ff', 'lilac', 'lilac', ('blue', 'red', 'mint', 'gold'), books_extra)


# Houses: a 4.4 m cottage with a gabled roof, chimney, windows with
# shutters, a porch, and a garden behind a picket fence with a path.
def house(name, x, wall, roof, door, shutter):
    p = [kit.box((6.0, 6.4, 0.06), (x, -0.6, 0.03), '#7ccf5e', bevel=0.0)]
    p.append(kit.box((1.0, 2.6, 0.07), (x + 0.6, -2.6, 0.05), 'concrete', bevel=0.0))
    # The picket fence round the front garden, open at the path.
    for i in range(13):
        fx = x - 2.9 + i * 0.48
        if abs(fx - (x + 0.6)) < 0.55:
            continue
        p.append(kit.box((0.12, 0.06, 0.65), (fx, -3.75, 0.33), 'white', bevel=0.0))
    for zz in (0.3, 0.55):
        p.append(kit.box((2.75, 0.05, 0.07), (x - 1.55 + 0.02, -3.73, zz), 'white', bevel=0.0))
        p.append(kit.box((1.85, 0.05, 0.07), (x + 2.05, -3.73, zz), 'white', bevel=0.0))
    # The house.
    p.append(kit.box((4.4, 4.0, 2.5), (x, 0.4, 1.3), wall, bevel=0.06))
    p.append(kit.box((4.5, 4.1, 0.25), (x, 0.4, 0.12), 'concrete', bevel=0.04))
    # A gabled roof with an overhang; the wall shows in the gable ends.
    p.append(kit.prism((4.3, 4.7, 1.6), (x, 0.4, 2.48), roof))
    p.append(kit.prism((4.42, 4.0, 1.32), (x, 0.4, 2.55), wall))
    p.append(kit.box((4.5, 0.16, 0.12), (x, 0.4, 4.08), 'white', bevel=0.03))
    p.append(kit.box((0.5, 0.5, 1.2), (x + 1.3, 1.2, 3.9), '#b0624a', bevel=0.04))
    p.append(kit.box((0.62, 0.62, 0.14), (x + 1.3, 1.2, 4.5), 'concrete', bevel=0.03))
    # Door with a little roof, and windows with shutters.
    p.append(kit.box((0.85, 0.12, 1.55), (x + 0.6, -1.6, 0.98), door, bevel=0.05))
    p.append(kit.sphere(0.05, (x + 0.85, -1.68, 0.95), 'gold', segments=6))
    p.append(kit.box((1.3, 0.7, 0.1), (x + 0.6, -1.85, 1.95), roof, bevel=0.03, rot=(-0.3, 0, 0)))
    for wx, wz in ((-1.2, 1.25), (-1.2, 2.1), (1.4, 2.1)):
        p.append(kit.box((0.75, 0.1, 0.6), (x + wx, -1.62, wz), '#cfeeff', bevel=0.0))
        p.append(kit.box((0.8, 0.12, 0.06), (x + wx, -1.64, wz), 'white', bevel=0.0))
        for sx in (-1, 1):
            p.append(kit.box((0.2, 0.08, 0.62), (x + wx + sx * 0.52, -1.64, wz), shutter, bevel=0.0))
    p.append(kit.box((0.85, 0.3, 0.2), (x - 1.2, -1.75, 0.88), 'wood', bevel=0.03))
    for j, col in enumerate(('hotpink', 'yellow', 'red')):
        p.append(kit.sphere(0.1, (x - 1.45 + j * 0.25, -1.75, 1.05), col, segments=6))
    # Garden bushes and flowers.
    for bx, bz, r in ((-2.2, -2.6, 0.45), (2.3, -2.9, 0.4), (-1.0, -3.1, 0.3)):
        p.append(kit.sphere(r, (x + bx, bz, r * 0.8), '#5fb84f', segments=6))
    for k in range(5):
        p.append(kit.sphere(0.09, (x - 2.5 + k * 0.3, -3.35, 0.15), ('hotpink', 'yellow', 'white', 'lilac', 'red')[k], segments=6))
    finish(p, name, x)


house('house_a', 6, '#fff8e6', '#ff8a3c', '#2f80d1', '#5bbcff')
house('house_b', 13, '#eaf6ff', '#2f80d1', '#ff5c6c', '#ffbf3c')
house('house_c', 20, '#fff0f6', 'hotpink', '#3fae5a', '#7ee0c3')
house('house_d', 27, '#f2ffe9', '#3fae5a', '#b79cff', '#ff8fc8')

# Street lamp: a dark pole with a curl and a lantern with a warm bulb.
X = 33
p = [kit.cylinder(0.22, 0.2, (X, 0, 0.1), 'dark', verts=10),
     kit.cylinder(0.08, 3.6, (X, 0, 1.9), 'dark', verts=8),
     kit.torus(0.25, 0.05, (X + 0.25, 0, 3.7), 'dark', rot=(math.pi / 2, 0, 0), major_segments=10, minor_segments=4),
     kit.box((0.36, 0.36, 0.42), (X + 0.5, 0, 3.6), '#fff3b0', bevel=0.05),
     kit.cone(0.32, 0.08, 0.22, (X + 0.5, 0, 3.92), 'dark', verts=4, rot=(0, 0, math.pi / 4))]
finish(p, 'lamp', X)

# Bus stop: a shelter with a blue roof, a glass back, a bench, and a sign on a pole.
X = 37
p = [kit.box((3.2, 1.4, 0.08), (X, 0.1, 2.35), 'blue', bevel=0.04)]
for sx in (-1, 1):
    p.append(kit.box((0.1, 0.1, 2.3), (X + sx * 1.5, 0.7, 1.15), 'dark', bevel=0.02))
    p.append(kit.box((0.1, 0.1, 2.3), (X + sx * 1.5, -0.4, 1.15), 'dark', bevel=0.02))
    p.append(kit.box((0.06, 1.1, 1.6), (X + sx * 1.5, 0.15, 1.2), '#cfeeff', bevel=0.0))
p.append(kit.box((3.0, 0.06, 1.6), (X, 0.72, 1.2), '#cfeeff', bevel=0.0))
p.append(kit.box((2.4, 0.4, 0.08), (X, 0.45, 0.5), 'wood', bevel=0.02))
for sx in (-1, 1):
    p.append(kit.box((0.08, 0.3, 0.45), (X + sx * 1.0, 0.45, 0.25), 'dark', bevel=0.02))
p.append(kit.cylinder(0.05, 2.6, (X + 2.0, -0.4, 1.3), 'dark', verts=6))
p.append(kit.cylinder(0.32, 0.08, (X + 2.0, -0.4, 2.55), 'red', verts=14, rot=(math.pi / 2, 0, 0)))
p.append(kit.cylinder(0.24, 0.1, (X + 2.0, -0.4, 2.55), 'white', verts=14, rot=(math.pi / 2, 0, 0)))
finish(p, 'busstop', X)

# Café table: a round table under a striped parasol, two chairs.
X = 41.5
p = [kit.cylinder(0.45, 0.06, (X, 0, 0.75), 'white', verts=14),
     kit.cylinder(0.05, 0.75, (X, 0, 0.38), 'dark', verts=6),
     kit.cylinder(0.25, 0.04, (X, 0, 0.02), 'dark', verts=10),
     kit.cylinder(0.03, 2.2, (X, 0, 1.4), 'white', verts=6)]
for i in range(8):
    a = i * math.pi / 4
    p.append(kit.cone(1.2, 0.0, 0.4, (X, 0, 2.35), 'hotpink' if i % 2 else 'white', verts=3, rot=(0, 0, a)))
for sx in (-1, 1):
    p.append(kit.box((0.4, 0.4, 0.05), (X + sx * 0.75, 0, 0.45), 'deepblue', bevel=0.02))
    p.append(kit.box((0.05, 0.4, 0.45), (X + sx * 0.95, 0, 0.68), 'deepblue', bevel=0.02))
    for dy in (-0.15, 0.15):
        p.append(kit.box((0.04, 0.04, 0.45), (X + sx * 0.75, dy, 0.22), 'dark', bevel=0.0))
finish(p, 'cafe_table', X)

toy = kit.toy_material('toy')
for obj in models:
    kit.use_material(obj, toy)
print('triangles', {o.name: kit.triangles([o]) for o in models})
out = Path(sys.argv[1] if len(sys.argv) > 1 else '.')
homes = [i for i, b in enumerate(bases) if b.name.startswith('house_')]
shops = [i for i in range(len(bases)) if i not in homes]
kit.export([models[i] for i in shops] + [bases[i] for i in shops], str(out / 'town-shops.glb'))
kit.export([models[i] for i in homes] + [bases[i] for i in homes], str(out / 'town-homes.glb'))
if len(sys.argv) > 2:
    print(kit.preview(sys.argv[2], look_at=(3, 0, 2), distance=58, size=(1600, 700), angles=((0.15, -1, 0.75),)))
