"""The player: the tycoon, a smooth toy figure with a big round head.

A swept-up ginger quiff of layered locks, square black glasses over big
brown eyes, thick brows and rosy cheeks; a royal-navy suit with lapels, a
white shirt, a red tie, a light-blue pocket square and a bubble pin on the
left lapel (the car wash he started with), white cuffs, a gold watch on the
left wrist, and chunky black shoes.

His own skeleton (short legs under a long jacket, arms held a little out)
and his own animations with planted feet (tycoon_anim.py). Each gait's
ground speed is printed; the game keeps them in src/data/characters.json
(playerGaits) to play each gait at the matching rate.

About 0.78 tall, shown at twice that; front faces -Y, his left is +X. The
right hand bone is `hand-right`: the game puts the sponge there.

Usage: python art/blender/tycoon.py <out.glb> [preview-dir]
Then: npx @gltf-transform/cli@4.2.1 quantize <out.glb> public/models/people/character-tycoon.glb
"""
import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import kit  # noqa: E402
import shapes  # noqa: E402
from shapes import arc, ball, bake, blob, drape, facing, flare, mix, on_surface, paint_faces, shade, smoothstep  # noqa: E402
import person_body as pb  # noqa: E402 (its weight helpers)

bpy = kit.bpy
from mathutils import Vector  # noqa: E402
from mathutils.kdtree import KDTree  # noqa: E402

# ---- Colours ---------------------------------------------------------------
SKIN = '#ffcfa6'
BLUSH = '#ff9d8c'
HAIR = '#f6731f'
HAIR_DARK = '#e25a12'
HAIR_LIGHT = '#ff9240'
BROW = '#7a3b1e'
FRAMES = '#17171c'
EYE_WHITE = '#ffffff'
IRIS = '#6b3a1f'
PUPIL = '#1a0f0a'
SUIT = '#2444b4'
SUIT_LIGHT = '#3158d0'
SUIT_DARK = '#1b3490'
SHIRT = '#ffffff'
TIE = '#e0202a'
TIE_DARK = '#b8141f'
POCKET = '#7fd2f4'
GOLD = '#e8a72a'
SHOE = '#1b1b20'
SOLE = '#2c2c33'

# ---- Skeleton --------------------------------------------------------------
HIP, KNEE, ANKLE, LEG_X = 0.2, 0.135, 0.07, 0.06
HZ = 0.565  # head centre
HEAD = (0.148, 0.135, 0.132)  # head radii
SHOULDER, ELBOW, WRIST, HAND_END = (0.084, 0.39), (0.125, 0.328), (0.158, 0.278), (0.185, 0.238)

# Bones: name → (head, tail, parent, which way the bone's Z points).
BONES = {
    'hips': ((0, 0, HIP), (0, 0, 0.27), None, (0, -1, 0)),
    'spine': ((0, 0, 0.27), (0, 0, 0.335), 'hips', (0, -1, 0)),
    'chest': ((0, 0, 0.335), (0, 0, 0.4), 'spine', (0, -1, 0)),
    'neck': ((0, 0, 0.4), (0, 0, 0.432), 'chest', (0, -1, 0)),
    'head': ((0, 0, 0.432), (0, 0, 0.75), 'neck', (0, -1, 0)),
}
for _side, _sx in (('left', 1), ('right', -1)):
    BONES[f'upperarm-{_side}'] = ((_sx * SHOULDER[0], 0, SHOULDER[1]), (_sx * ELBOW[0], 0, ELBOW[1]), 'chest', (0, 1, 0))
    BONES[f'forearm-{_side}'] = ((_sx * ELBOW[0], 0, ELBOW[1]), (_sx * WRIST[0], 0, WRIST[1]), f'upperarm-{_side}', (0, 1, 0))
    BONES[f'hand-{_side}'] = ((_sx * WRIST[0], 0, WRIST[1]), (_sx * HAND_END[0], 0, HAND_END[1]), f'forearm-{_side}', (0, 1, 0))
    BONES[f'thigh-{_side}'] = ((_sx * LEG_X, 0, HIP), (_sx * LEG_X, 0, KNEE), 'hips', (0, 1, 0))
    BONES[f'shin-{_side}'] = ((_sx * LEG_X, 0, KNEE), (_sx * LEG_X, 0, ANKLE), f'thigh-{_side}', (0, 1, 0))
    BONES[f'foot-{_side}'] = ((_sx * LEG_X, 0, ANKLE), (_sx * LEG_X, -0.075, 0.02), f'shin-{_side}', (0, 0, -1))


def build_rig(name='rig'):
    data = bpy.data.armatures.new(f'{name}-bones')
    rig = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for bone_name, (head, tail, _, roll) in BONES.items():
        bone = data.edit_bones.new(bone_name)
        bone.head, bone.tail = head, tail
        bone.align_roll(Vector(roll))
    for bone_name, (_, _, parent, _) in BONES.items():
        if parent:
            data.edit_bones[bone_name].parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig


# ---- Body ------------------------------------------------------------------
def stick():
    """The stick figure the body is grown from: point → (position, radii); and its edges with their regions."""
    points = {
        'pelvis': ((0, 0.004, 0.222), (0.094, 0.074)),
        'waist': ((0, 0.002, 0.285), (0.09, 0.07)),
        'chest': ((0, -0.002, 0.345), (0.09, 0.07)),
        'yoke': ((0, 0.002, 0.392), (0.074, 0.058)),
        'neck': ((0, 0.004, 0.42), (0.036, 0.036)),
        'neck2': ((0, 0.004, 0.45), (0.032, 0.032)),
    }
    for side, sx in (('left', 1), ('right', -1)):
        points[f'hip-{side}'] = ((sx * LEG_X, 0.002, 0.2), (0.052, 0.054))
        points[f'knee-{side}'] = ((sx * LEG_X, 0, KNEE), (0.05, 0.052))
        points[f'ankle-{side}'] = ((sx * LEG_X, 0.002, 0.084), (0.05, 0.052))
        points[f'shoulder-{side}'] = ((sx * SHOULDER[0], 0.002, SHOULDER[1] - 0.004), (0.042, 0.042))
        points[f'elbow-{side}'] = ((sx * ELBOW[0], 0.002, ELBOW[1]), (0.038, 0.038))
        points[f'wrist-{side}'] = ((sx * (WRIST[0] + 0.004), 0.002, WRIST[1] - 0.006), (0.036, 0.036))
    edges = [('pelvis', 'waist', 'torso'), ('waist', 'chest', 'torso'), ('chest', 'yoke', 'torso'), ('yoke', 'neck', 'torso'), ('neck', 'neck2', 'neck')]
    for side in ('left', 'right'):
        edges += [('pelvis', f'hip-{side}', 'torso'), (f'hip-{side}', f'knee-{side}', 'leg'), (f'knee-{side}', f'ankle-{side}', 'leg')]
        edges += [('yoke', f'shoulder-{side}', 'torso'), (f'shoulder-{side}', f'elbow-{side}', 'upperarm'), (f'elbow-{side}', f'wrist-{side}', 'forearm')]
    return points, edges


def segments():
    points, edges = stick()
    return [(Vector(points[a][0]), Vector(points[b][0]), region) for a, b, region in edges]


def nearest(p, segs):
    best = None
    for a, b, region in segs:
        ab = b - a
        t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
        d = (a + ab * t - p).length
        if best is None or d < best[0]:
            best = (d, region, t)
    return best


def body_colour(c, segs):
    _, region, t = nearest(c, segs)
    if region == 'neck':
        # The shirt collar shows at the front; the jacket's collar covers it behind.
        return SHIRT if c.y < 0.004 else SUIT
    if region == 'forearm' and t > 0.8:
        # A white shirt cuff, then the wrist.
        return SHIRT if t < 0.95 else SKIN
    return SUIT


def build_body():
    points, edges = stick()
    names = list(points)
    mesh = bpy.data.meshes.new('body')
    mesh.from_pydata([points[n][0] for n in names], [(names.index(a), names.index(b)) for a, b, _ in edges], [])
    obj = bpy.data.objects.new('body', mesh)
    bpy.context.scene.collection.objects.link(obj)
    skin = obj.modifiers.new('skin', 'SKIN')
    skin.branch_smoothing = 0.6
    for i, n in enumerate(names):
        mesh.skin_vertices[0].data[i].radius = points[n][1]
    mesh.skin_vertices[0].data[0].use_root = True
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier='skin')
    bake(obj, ('SUBSURF', {'levels': 2, 'render_levels': 2}))
    segs = segments()
    paint_faces(obj, lambda c: body_colour(c, segs))
    return obj


def skin_to(body, rig):
    """Blender's automatic (bone heat) weights; then the arms let go of the chest and hips."""
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    names = {g.index: g.name for g in body.vertex_groups}
    groups = {g.name: g for g in body.vertex_groups}
    segs = segments()
    arm = ('upperarm', 'forearm', 'hand')
    for v in body.data.vertices:
        _, region, _ = nearest(v.co, segs)
        if region not in ('torso', 'neck', 'leg'):
            continue
        keep = smoothstep(0.06, 0.086, abs(v.co.x)) if region == 'torso' and v.co.z > 0.35 else 0.0
        weights = {names[g.group]: g.weight for g in v.groups}
        weights = {n: w * (keep if n.startswith(arm) else 1.0) for n, w in weights.items()}
        total = sum(weights.values()) or 1.0
        for n, w in weights.items():
            if w / total < 1e-3:
                groups[n].remove([v.index])
            else:
                groups[n].add([v.index], w / total, 'REPLACE')


# ---- Small makers ----------------------------------------------------------
def flat(outline, at_y, col, cuts=3):
    """A thin flat piece facing -Y from an outline of (x, z) points, cut finer so it can be draped."""
    mesh = bpy.data.meshes.new('flat')
    mesh.from_pydata([(x, at_y, z) for x, z in outline], [], [list(range(len(outline)))])
    obj = bpy.data.objects.new('flat', mesh)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent()
    bpy.ops.mesh.quads_convert_to_tris()
    bpy.ops.mesh.subdivide(number_cuts=cuts)
    bpy.ops.object.mode_set(mode='OBJECT')
    # Its face must look out at -Y.
    if obj.data.polygons[0].normal.y > 0:
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.flip_normals()
        bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.shade_smooth()
    kit._paint(obj, col)
    return obj


def lay(part, body, depth):
    """Lays a thin part over the front of `body`, `depth` off it. A point beside the body is pulled in onto it."""
    ys = [v.co.y for v in part.data.vertices]
    middle = (max(ys) + min(ys)) / 2
    for v in part.data.vertices:
        x = v.co.x
        for _ in range(16):
            ok, hit, _, _ = body.ray_cast(Vector((x, -1.0, v.co.z)), Vector((0, 1, 0)))
            if ok:
                v.co.x = x
                v.co.y = hit.y - depth + (v.co.y - middle)
                break
            x *= 0.95
    return part


def rounded_frame(w, h, tube, depth, at, col, turn=0.0, power=4.0, segments=24):
    """A glasses frame: a ring bent into a rounded square (w × h, outer), lying in the XZ plane."""
    bpy.ops.mesh.primitive_torus_add(major_radius=1, minor_radius=tube, major_segments=segments, minor_segments=6, location=(0, 0, 0))
    obj = bpy.context.object
    for v in obj.data.vertices:
        d = Vector((v.co.x, v.co.y, 0))
        a = math.atan2(d.y, d.x)
        off = d.length - 1
        c, s = math.cos(a), math.sin(a)
        # A superellipse: nearly square, with round corners.
        r = (abs(c) ** power + abs(s) ** power) ** (-1 / power)
        v.co = Vector(((w / 2 - tube) * r * c + off * c, v.co.z * depth / tube, (h / 2 - tube) * r * s + off * s))
    obj.location = at
    obj.rotation_euler = (0, 0, turn)
    bake(obj)
    kit._paint(obj, col)
    return obj


def lock(points, width, thick, centre, tone=0.0, sides=6, samples=7):
    """
    A lock of hair: a flattened tube along a smooth curve through `points`,
    full near its root and tapering to a tip, lying with its flat side to the
    head (`centre`). Its edges are a shade darker, so the locks read apart.
    """
    pts = [Vector(p) for p in points]
    pts = [pts[0] * 2 - pts[1]] + pts + [pts[-1] * 2 - pts[-2]]
    spans = len(pts) - 3

    def at(u):
        s = min(spans - 1, int(u * spans))
        t = u * spans - s
        p0, p1, p2, p3 = pts[s:s + 4]
        return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)

    path = [at(i / samples) for i in range(samples + 1)]
    verts, faces, shades = [], [], []
    for i, p in enumerate(path):
        t = i / samples
        tan = (path[min(i + 1, samples)] - path[max(i - 1, 0)]).normalized()
        n = (p - centre).normalized()
        n = (n - tan * n.dot(tan)).normalized()
        b = tan.cross(n)
        k = (0.6 + 0.4 * smoothstep(0, 0.3, t)) * (1 - smoothstep(0.4, 1.0, t)) ** 0.85
        # Flat locks (the light falls evenly on them, so the hair reads as smooth swept masses, not as spikes).
        w, h = width / 2 * k + 0.0015, thick * 0.3 * k + 0.001
        for j in range(sides):
            a = 2 * math.pi * (j + 0.5) / sides
            verts.append(p + b * (w * math.cos(a)) + n * (h * math.sin(a)))
            shades.append(abs(math.cos(a)))
    for i in range(samples):
        for j in range(sides):
            a, b_ = i * sides + j, i * sides + (j + 1) % sides
            faces.append((a, b_, b_ + sides, a + sides))
    root, tip = len(verts), len(verts) + 1
    verts += [path[0], path[-1]]
    shades += [0.5, 0.5]
    for j in range(sides):
        faces.append((root, (j + 1) % sides, j))
        last = samples * sides
        faces.append((tip, last + j, last + (j + 1) % sides))
    mesh = bpy.data.meshes.new('lock')
    mesh.from_pydata(verts, [], faces)
    obj = bpy.data.objects.new('lock', mesh)
    bpy.context.scene.collection.objects.link(obj)
    for poly in mesh.polygons:
        poly.use_smooth = True
    # Coloured by point (not by face), so the lock's points are shared and the file stays small.
    attr = mesh.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    base = mix(HAIR, HAIR_LIGHT, tone) if tone >= 0 else mix(HAIR, HAIR_DARK, -tone)
    tones = [kit.colour(mix(base, HAIR_DARK, 0.4 * smoothstep(0.6, 0.95, edge))) for edge in shades]
    for loop in mesh.loops:
        attr.data[loop.index].color = tones[loop.vertex_index]
    mesh.color_attributes.active_color = attr
    return obj


# ---- Head ------------------------------------------------------------------
C = Vector((0, 0.004, HZ))
HAIR_R = (HEAD[0] + 0.01, HEAD[1] + 0.012, HEAD[2] + 0.012)


M = Vector((-0.004, -0.012, HZ + 0.1))  # the quiff's mound
MR = (0.154, 0.13, 0.104)


def on_mound(az, el, lift=0.0):
    """A point over the quiff's mound, as on_head."""
    a, e = math.radians(az), math.radians(el)
    d = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    return M + Vector((d.x * MR[0], d.y * MR[1], d.z * MR[2])) + d * lift


def on_head(az, el, lift=0.0):
    """A point over the hair: `az` degrees round from the front (+ = towards his left), `el` up from level, `lift` off the hair."""
    a, e = math.radians(az), math.radians(el)
    d = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    p = Vector((d.x * HAIR_R[0], d.y * HAIR_R[1], d.z * HAIR_R[2]))
    return C + p + d * lift


def hairline(co):
    """The height the hair comes down to at a point of the head: high over the brow, down in front of the ears, low at the nape."""
    front = smoothstep(0.035, -0.075, co.y)
    return HZ - 0.092 + 0.186 * front


def tip_el(az):
    """How far down the hair reaches at `az`: to the nape at the back, only to the top of the ear at the sides."""
    side = abs((az % 360) - 180)  # 0 at the back, 90 at the sides
    return -44 + 42 * smoothstep(35, 92, side)


def hair():
    rnd = random.Random(7)
    parts = []
    # The scalp: a cap over the top, sides and back of the head.
    cap = blob((2 * HAIR_R[0], 2 * HAIR_R[1], 2 * HAIR_R[2]), tuple(C), HAIR, level_=3)
    bm = kit.bmesh.new()
    bm.from_mesh(cap.data)
    kit.bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < hairline(v.co) - 0.004], context='VERTS')
    bm.to_mesh(cap.data)
    bm.free()
    parts.append(cap)
    # The quiff's body: a smooth mound over the brow and crown, overhanging the forehead; the locks lie on it.
    mound = ball(1.0, tuple(M), HAIR, scale=MR, segments=18)
    bm = kit.bmesh.new()
    bm.from_mesh(mound.data)
    kit.bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < hairline(v.co)], context='VERTS')
    bm.to_mesh(mound.data)
    bm.free()
    parts.append(mound)

    def add(spec, width, thick, tone=None, place=on_head, centre=C):
        parts.append(lock([place(*p) for p in spec], width, thick, centre, rnd.uniform(-0.25, 0.5) if tone is None else tone))

    def quiff(spec, width, thick, tone=None):
        add(spec, width, thick, tone, on_mound, M)

    # The quiff: broad locks from the hairline up over the mound, swept round towards his left and back,
    # their tips lifting off it (the wavy outline along the top).
    for k in range(8):
        a0 = -80 + k * 22
        e0 = -5 if abs(a0) < 50 else -24
        big = 1 + 0.25 * math.cos(math.radians(a0 + 20))
        quiff([(a0, e0, 0.0), (a0 + 10, 18, 0.012), (a0 + 27, 42, 0.018 * big), (a0 + 50, 60, 0.022 * big), (a0 + 76, 70, 0.034 * big)], 0.074, 0.03)
    # Between them, shorter locks low over the brow.
    for k in range(7):
        a0 = -66 + k * 22
        quiff([(a0, -5, 0.0), (a0 + 7, 14, 0.01), (a0 + 20, 32, 0.016), (a0 + 36, 48, 0.026)], 0.05, 0.022)
    # The curl at the front on his right: up, over and back in towards the middle; and a wave along the top.
    quiff([(-52, -8, 0.004), (-64, 22, 0.03), (-56, 48, 0.052), (-34, 66, 0.056), (-10, 66, 0.04)], 0.056, 0.032, 0.6)
    quiff([(-20, 44, 0.026), (2, 62, 0.04), (30, 72, 0.04), (62, 66, 0.03)], 0.054, 0.028, 0.5)
    # The back of the mound: locks flowing down from the crown into the back of the head.
    for k in range(8):
        az = 96 + k * 24
        quiff([(az - 34, 70, 0.006), (az - 12, 40, 0.012), (az, 8, 0.01), (az + 5, -22, 0.008)], 0.07, 0.024)
    # The back and sides: two rows of leaf-shaped locks lying close, downwards, the upper row's tips over the lower.

    def leaf(az, el0, el1, tip, width):
        add([(az - 5, el0, 0.003), (az - 2, el0 * 0.62 + el1 * 0.38, 0.01), (az + 1, el0 * 0.25 + el1 * 0.75, 0.009), (az + 3, el1, tip)], width, 0.018)

    for k in range(10):
        az = 68 + k * 25
        leaf(az, 42, 26 + (tip_el(az) - 26) * 0.5, 0.008, 0.056)
    for k in range(11):
        az = 70 + k * 22
        low = tip_el(az)
        leaf(az, low + 34, low, 0.007, 0.052)
    # Over each ear: short locks swept back, their tips standing out sideways.
    for sx in (1, -1):
        add([(sx * 62, 38, 0.004), (sx * 76, 28, 0.014), (sx * 88, 18, 0.018), (sx * 98, 8, 0.024)], 0.05, 0.022)
        add([(sx * 64, 22, 0.003), (sx * 76, 14, 0.012), (sx * 86, 5, 0.015), (sx * 94, -4, 0.02)], 0.046, 0.02)
        # The sideburn, down in front of the ear.
        add([(sx * 60, 16, 0.002), (sx * 63, 2, 0.004), (sx * 64, -10, 0.003), (sx * 63, -20, 0.002)], 0.032, 0.014, -0.3)
    return parts


def head():
    a, b, c = HEAD

    def face(co):
        # Full cheeks low down, a soft wide chin, a slightly flatter face.
        low = smoothstep(HZ + 0.02, HZ - 0.07, co.z)
        co.x *= 1 + 0.08 * low
        if co.y < 0:
            co.y *= 0.96
        if co.z < HZ:
            co.z = HZ + (co.z - HZ) * 0.97
        return co

    skull = blob((2 * a, 2 * b, 2 * c), (0, 0, HZ), SKIN, level_=3, shape=face)
    parts = [skull]
    eye_z, eye_x = HZ - 0.022, 0.058
    for sx in (1, -1):
        eye, n = on_surface(skull, sx * eye_x, eye_z, 0.006)
        rot = facing(n)
        # A dark rim shows round the top of the eye (the lashes); then the white, the iris, the pupil and two glints.
        parts.append(ball(0.0325, eye + Vector((0, 0.002, 0.0035)), BROW, scale=(0.95, 0.42, 1.12), rot=rot, segments=14))
        parts.append(ball(0.031, eye, EYE_WHITE, scale=(0.92, 0.45, 1.12), rot=rot, segments=16))
        look = eye + Vector((-sx * 0.003, 0, -0.002))
        parts.append(ball(0.0205, look + n * 0.0078, IRIS, scale=(1, 0.45, 1.12), rot=rot, segments=14))
        parts.append(ball(0.0115, look + n * 0.0126, PUPIL, scale=(1, 0.45, 1.15), rot=rot, segments=12))
        parts.append(ball(0.006, look + n * 0.0168 + Vector((-0.006, 0, 0.008)), EYE_WHITE, scale=(1, 0.5, 1), segments=8))
        parts.append(ball(0.003, look + n * 0.0168 + Vector((0.007, 0, -0.009)), EYE_WHITE, scale=(1, 0.5, 1), segments=6))
        # A thick brow above the glasses.
        at, n = on_surface(skull, sx * 0.06, HZ + 0.04, -0.002)
        parts.append(blob((0.07, 0.014, 0.022), at, BROW, rot=(0, sx * 0.12, 0), level_=2))
        # A rosy cheek.
        at, n = on_surface(skull, sx * 0.094, HZ - 0.072, 0.004)
        parts.append(ball(0.02, at, mix(SKIN, BLUSH, 0.6), scale=(1.15, 0.3, 0.8), rot=facing(n), segments=12))
        # The ear.
        parts.append(ball(0.036, (sx * (a + 0.012), 0.012, HZ - 0.03), SKIN, scale=(0.55, 0.8, 1.1), segments=14))
        parts.append(ball(0.02, (sx * (a + 0.022), 0.004, HZ - 0.03), shade(SKIN, 0.9), scale=(0.4, 0.7, 1.15), segments=10))
    # A small nose and a smile.
    at, n = on_surface(skull, 0, HZ - 0.056, 0.008)
    parts.append(ball(0.016, at, mix(SKIN, BLUSH, 0.25), scale=(1.15, 0.9, 0.85), segments=12))
    at, n = on_surface(skull, 0, HZ - 0.085, 0.0)
    grin = arc(0.046, 0.0046, (0, at.y, HZ - 0.047), '#a8483a', -math.pi + 0.86, -0.86, segments=40)
    parts.append(drape(grin, skull, -0.0012))
    parts += glasses(skull, eye_x, eye_z)
    parts += hair()
    return [(p, 'head') for p in parts]


def glasses(skull, eye_x, eye_z):
    """Square black frames with round corners, wrapped a little round the face, a bridge, and arms back to the ears."""
    parts = []
    front, _ = on_surface(skull, eye_x, eye_z, -0.013)
    w, h, tube = 0.106, 0.086, 0.0085
    wrap = 0.2
    for sx in (1, -1):
        cx = sx * (eye_x + 0.004)
        parts.append(rounded_frame(w, h, tube, 0.007, (cx, front.y, eye_z), FRAMES, turn=sx * wrap))
        # The arm, from the frame's outer edge back over the ear.
        x0 = cx + sx * (w / 2 - 0.006) * math.cos(wrap)
        y0 = front.y + (w / 2 - 0.006) * math.sin(wrap)
        x1, y1 = sx * (HEAD[0] + 0.008), 0.03
        parts.append(blob((0.008, math.hypot(x1 - x0, y1 - y0) * 1.25, 0.011), ((x0 + x1) / 2, (y0 + y1) / 2, eye_z + 0.02), FRAMES,
                          rot=(0, 0, -math.atan2(x1 - x0, y1 - y0)), level_=1))
    parts.append(blob((0.03, 0.014, 0.017), (0, front.y - 0.004, eye_z + 0.012), FRAMES, level_=1))
    return parts


# ---- Suit, hands, shoes ----------------------------------------------------
ARM_TILT = math.atan2(ELBOW[0] - SHOULDER[0], SHOULDER[1] - ELBOW[1])  # the arms' angle out from straight down


def hands():
    out = []
    for side, sx in (('left', 1), ('right', -1)):
        cx, cz = sx * (WRIST[0] + 0.02), WRIST[1] - 0.03
        tilt = (0, -sx * ARM_TILT, 0)
        out.append((blob((0.054, 0.046, 0.074), (cx, -0.002, cz), SKIN, rot=tilt, level_=2), f'hand-{side}'))
        # The thumb, on the front of the hand.
        out.append((ball(0.016, (cx - sx * 0.012, -0.03, cz + 0.012), SKIN, scale=(0.9, 1.0, 1.4), rot=(0.35, -sx * ARM_TILT, 0), segments=12), f'hand-{side}'))
    return out


def watch():
    """A gold watch on his left wrist: the band round it, and the dark face on the back of the wrist."""
    out = []
    along = Vector((math.sin(ARM_TILT), 0, -math.cos(ARM_TILT)))
    at = Vector((WRIST[0], 0.002, WRIST[1])) - along * 0.012
    bpy.ops.mesh.primitive_torus_add(major_radius=0.032, minor_radius=0.006, major_segments=20, minor_segments=6, location=at, rotation=(0, -ARM_TILT, 0))
    band = bpy.context.object
    bake(band)
    kit._paint(band, GOLD)
    out.append((band, 'forearm-left'))
    # The face sits on the outside of the wrist (away from the body).
    outward = Vector((math.cos(ARM_TILT), 0, math.sin(ARM_TILT)))
    face_at = at + outward * 0.033
    out.append((kit.cylinder(0.017, 0.01, face_at, GOLD, verts=16, rot=(0, math.pi / 2 - ARM_TILT, 0)), 'forearm-left'))
    out.append((kit.cylinder(0.013, 0.004, face_at + outward * 0.005, '#22262e', verts=16, rot=(0, math.pi / 2 - ARM_TILT, 0)), 'forearm-left'))
    return out


def shoes():
    """Chunky black lace-up shoes: a round toe, a higher instep, a thick sole standing out all round."""
    out = []
    for side, sx in (('left', 1), ('right', -1)):
        x, foot = sx * LEG_X, f'foot-{side}'

        def last(co, x=x):
            front = smoothstep(0.0, -0.09, co.y)
            # Lower over the toes, flat underneath, a little wider at the toe.
            co.z = 0.012 + (co.z - 0.012) * (1 - 0.36 * front)
            if co.z < 0.022:
                co.z = 0.022 - (0.022 - co.z) * 0.25
            co.x = x + (co.x - x) * (1 + 0.08 * front)
            return co

        out.append((blob((0.108, 0.178, 0.092), (x, -0.03, 0.05), SHOE, level_=2, shape=last), foot))
        def tread(co):
            co.z = max(0.001, min(0.021, 0.011 + (co.z - 0.011) * 2.2))
            return co

        out.append((blob((0.1, 0.168, 0.03), (x, -0.03, 0.011), SOLE, level_=2, shape=tread), foot))
        for i in range(2):
            out.append((blob((0.04, 0.012, 0.008), (x, -0.04 - i * 0.02, 0.074 - i * 0.008), SOLE, rot=(0.35, 0, 0), level_=1), foot))
    return out


def suit(body):
    """What the jacket is made of besides the body's navy: its skirt, lapels, shirt front, collar, tie, button, pockets, pocket square and pin."""
    out = []
    # The jacket's skirt: it stands off the hips and ends just above the legs.
    out.append((flare(0.084, 0.1, 0.3, 0.198, SUIT, centre=(0, 0.004), squash=0.8, thickness=0.006, verts=28), 'hips'))
    # The shirt front: a white V from the collar to the button.
    v = flat([(-0.036, 0.418), (0.036, 0.418), (0.0, 0.3)], -0.2, SHIRT)
    out.append((lay(v, body, 0.0015), None))
    # Lapels: a notched strip down each side of the V, standing a little proud.
    for sx in (1, -1):
        lapel = flat([(sx * 0.034, 0.424), (sx * 0.06, 0.408), (sx * 0.064, 0.378), (sx * 0.046, 0.366), (sx * 0.05, 0.352), (sx * 0.004, 0.292), (sx * 0.002, 0.306)], -0.2, SUIT_LIGHT)
        out.append((lay(lapel, body, 0.005), None))
        # The shirt collar's wing.
        wing = flat([(sx * 0.004, 0.416), (sx * 0.034, 0.43), (sx * 0.03, 0.4)], -0.2, SHIRT, cuts=2)
        out.append((lay(wing, body, 0.007), None))
    # The tie: a knot and a blade.
    knot, _ = on_surface(body, 0, 0.404, -0.006)
    out.append((blob((0.026, 0.016, 0.022), knot, TIE, level_=2), None))
    blade = flat([(-0.011, 0.396), (0.011, 0.396), (0.017, 0.33), (0.0, 0.31), (-0.017, 0.33)], -0.2, TIE)
    out.append((lay(blade, body, 0.0045), None))
    # One button, and a flap over each pocket.
    at, _ = on_surface(body, 0.004, 0.278, -0.002)
    out.append((ball(0.008, at, SUIT_DARK, scale=(1, 0.5, 1), segments=10), None))
    for sx in (1, -1):
        flap = flat([(sx * 0.03, 0.262), (sx * 0.072, 0.262), (sx * 0.072, 0.243), (sx * 0.03, 0.243)], -0.2, SUIT_LIGHT, cuts=2)
        out.append((lay(flap, body, 0.008), 'hips'))
    # The pocket square: three light-blue points at his left breast.
    square = flat([(0.034, 0.345), (0.04, 0.362), (0.047, 0.35), (0.053, 0.366), (0.06, 0.352), (0.066, 0.364), (0.07, 0.345)], -0.2, POCKET, cuts=2)
    out.append((lay(square, body, 0.006), None))
    # The bubble pin on his left lapel.
    for dx, dz, r in ((0.0, 0.0, 0.0085), (0.011, 0.007, 0.006), (0.009, -0.008, 0.0045)):
        at, _ = on_surface(body, 0.046 + dx, 0.388 + dz, -0.008)
        out.append((ball(r, at, POCKET, segments=10), None))
        out.append((ball(r * 0.35, at + Vector((-r * 0.35, -r * 0.75, r * 0.4)), '#ffffff', segments=6), None))
    return out


def build_tycoon(rig):
    shapes.FINE = True
    body = build_body()
    skin_to(body, rig)
    tree = pb.body_tree(body)
    parts = head() + hands() + watch() + shoes() + suit(body)
    for obj, bones in parts:
        if bones:
            pb.on_bone(obj, bones)
        else:
            pb.follow_body(obj, body, tree)
    body_tris = kit.triangles([body])
    body.parent = None
    for mod in list(body.modifiers):
        body.modifiers.remove(mod)
    person = kit.join([body] + [obj for obj, _ in parts], 'person-tycoon')
    kit.use_material(person, kit.toy_material('toy'))
    person.parent = rig
    person.modifiers.new('rig', 'ARMATURE').object = rig
    print(f'tycoon: {kit.triangles([person])} triangles (body {body_tris})')
    return person


if __name__ == '__main__':
    import tycoon_anim
    import tycoon_preview

    kit.reset()
    rig = build_rig()
    hero = build_tycoon(rig)
    lengths = tycoon_anim.animate(rig)
    out = sys.argv[1] if len(sys.argv) > 1 else 'character-tycoon.glb'
    tycoon_anim.export(rig, hero, out)
    if len(sys.argv) > 2:
        tycoon_preview.shots(Path(sys.argv[2]), rig, lengths, sys.argv[3:])
