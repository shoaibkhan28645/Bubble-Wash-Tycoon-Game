"""The hero's mesh and skeleton (see hero.py).

The body (torso, arms, legs, neck) is one seamless mesh grown from a stick
figure with Blender's skin modifier and subdivided, so shoulders, hips,
knees and elbows bend as one smooth surface; it is painted by region (shirt,
overalls, sleeves, skin, trousers) and skinned with Blender's automatic
weights. Clothing details on the body (belt, collar, cuffs, pocket) take the
body's weights at their spot, so they move with it; the head, hands and
boots are solid parts on one bone each.
"""
import math

import bpy  # noqa: I001
from mathutils import Vector
from mathutils.kdtree import KDTree

import kit

SKIN = '#f6b98f'
NOSE = '#f0a07a'
CHEEK = '#f58f8a'
HAIR = '#5a3420'
EYE = '#1d2027'
MOUTH = '#7a2430'
RED = '#e3262f'
RED_DARK = '#b51d26'
WHITE = '#f8f9fb'
SHIRT = '#ffcf26'
DENIM = '#3f86e0'
DENIM_DARK = '#2b66b8'
BRASS = '#f5c542'
LEATHER = '#8e5a32'
LEATHER_DARK = '#66401f'
BOOT = '#86542d'
SOLE = '#3b2c22'
SPONGE = '#ffd84a'
BUBBLE = '#7fd8ff'

HZ = 0.592  # head centre
HEAD = (0.104, 0.097, 0.107)  # head radii

# Bones: name → (head, tail, parent, which way the bone's Z points).
BONES = {
    'hips': ((0, 0, 0.245), (0, 0, 0.31), None, (0, -1, 0)),
    'spine': ((0, 0, 0.31), (0, 0, 0.38), 'hips', (0, -1, 0)),
    'chest': ((0, 0, 0.38), (0, 0, 0.45), 'spine', (0, -1, 0)),
    'neck': ((0, 0, 0.45), (0, 0, 0.495), 'chest', (0, -1, 0)),
    'head': ((0, 0, 0.495), (0, 0, 0.7), 'neck', (0, -1, 0)),
}
for _side, _sx in (('left', 1), ('right', -1)):
    BONES[f'upperarm-{_side}'] = ((_sx * 0.098, 0.002, 0.442), (_sx * 0.13, 0.006, 0.352), 'chest', (0, 1, 0))
    BONES[f'forearm-{_side}'] = ((_sx * 0.13, 0.006, 0.352), (_sx * 0.142, -0.004, 0.272), f'upperarm-{_side}', (0, 1, 0))
    BONES[f'hand-{_side}'] = ((_sx * 0.142, -0.004, 0.272), (_sx * 0.146, -0.012, 0.205), f'forearm-{_side}', (0, 1, 0))
    BONES[f'thigh-{_side}'] = ((_sx * 0.054, 0, 0.245), (_sx * 0.057, -0.006, 0.158), 'hips', (0, 1, 0))
    BONES[f'shin-{_side}'] = ((_sx * 0.057, -0.006, 0.158), (_sx * 0.058, 0.004, 0.078), f'thigh-{_side}', (0, 1, 0))
    BONES[f'foot-{_side}'] = ((_sx * 0.058, 0.004, 0.078), (_sx * 0.058, -0.07, 0.03), f'shin-{_side}', (0, 0, -1))


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def build_rig():
    data = bpy.data.armatures.new('hero-rig')
    rig = bpy.data.objects.new('hero', data)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for name, (head, tail, _, roll) in BONES.items():
        bone = data.edit_bones.new(name)
        bone.head, bone.tail = head, tail
        bone.align_roll(Vector(roll))
    for name, (_, _, parent, _) in BONES.items():
        if parent:
            data.edit_bones[name].parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig


def bake(obj, *mods):
    """Applies the object's transform and then `mods` (kind, settings) to its mesh, smooth shaded."""
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for kind, settings in mods:
        mod = obj.modifiers.new(kind.lower(), kind)
        for key, value in settings.items():
            setattr(mod, key, value)
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.shade_smooth()
    return obj


def paint_faces(obj, rule):
    """Paints each face by `rule(centre)` → colour (corner colours, so the edges stay crisp)."""
    mesh = obj.data
    attr = mesh.color_attributes.get('Col') or mesh.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    cache = {}
    for poly in mesh.polygons:
        col = rule(poly.center)
        rgba = cache.get(col) or cache.setdefault(col, kit.colour(col))
        for li in poly.loop_indices:
            attr.data[li].color = rgba
    mesh.color_attributes.active_color = attr


# ---- Body ------------------------------------------------------------------
# The stick figure: point → (position, skin radii); edges join the points.
STICK = {
    'pelvis': ((0, 0.004, 0.262), (0.088, 0.074)),
    'waist': ((0, 0, 0.318), (0.094, 0.078)),
    'chest': ((0, -0.002, 0.392), (0.102, 0.082)),
    'yoke': ((0, 0, 0.44), (0.082, 0.066)),
    'neck': ((0, 0, 0.47), (0.036, 0.034)),
    'neck2': ((0, 0, 0.53), (0.032, 0.03)),
}
for _side, _sx in (('left', 1), ('right', -1)):
    STICK[f'hip-{_side}'] = ((_sx * 0.052, 0.002, 0.225), (0.05, 0.05))
    STICK[f'knee-{_side}'] = ((_sx * 0.057, -0.006, 0.158), (0.042, 0.043))
    STICK[f'calf-{_side}'] = ((_sx * 0.058, -0.002, 0.118), (0.042, 0.042))
    STICK[f'ankle-{_side}'] = ((_sx * 0.058, 0.002, 0.085), (0.046, 0.046))
    STICK[f'shoulder-{_side}'] = ((_sx * 0.098, 0.002, 0.442), (0.046, 0.046))
    STICK[f'sleeve-{_side}'] = ((_sx * 0.118, 0.004, 0.388), (0.044, 0.044))
    STICK[f'elbow-{_side}'] = ((_sx * 0.13, 0.006, 0.352), (0.03, 0.03))
    STICK[f'wrist-{_side}'] = ((_sx * 0.142, -0.004, 0.272), (0.026, 0.026))
EDGES = [('pelvis', 'waist'), ('waist', 'chest'), ('chest', 'yoke'), ('yoke', 'neck'), ('neck', 'neck2')]
for _side in ('left', 'right'):
    EDGES += [('pelvis', f'hip-{_side}'), (f'hip-{_side}', f'knee-{_side}'), (f'knee-{_side}', f'calf-{_side}'), (f'calf-{_side}', f'ankle-{_side}')]
    EDGES += [('yoke', f'shoulder-{_side}'), (f'shoulder-{_side}', f'sleeve-{_side}'), (f'sleeve-{_side}', f'elbow-{_side}'), (f'elbow-{_side}', f'wrist-{_side}')]


def _segments():
    """Each stick edge as (a, b, name of its region)."""
    out = []
    for a, b in EDGES:
        region = 'torso'
        for key in ('hip', 'knee', 'calf'):
            if b.startswith(key):
                region = 'leg'
        if b.startswith('shoulder'):
            region = 'torso'
        if b.startswith('sleeve') or b.startswith('elbow'):
            region = 'upperarm'
        if b.startswith('wrist'):
            region = 'forearm'
        if b.startswith('neck'):
            region = 'neck' if a == 'neck' else 'torso'
        out.append((Vector(STICK[a][0]), Vector(STICK[b][0]), region, b))
    return out


def _nearest(p, segments):
    best = None
    for a, b, region, end in segments:
        ab = b - a
        t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
        d = (a + ab * t - p).length
        if best is None or d < best[0]:
            best = (d, region, t, end)
    return best


def _body_colour(c, segments):
    _, region, t, end = _nearest(c, segments)
    x, y, z = c
    if region == 'leg':
        return DENIM
    if region == 'neck':
        return SKIN
    if region == 'forearm':
        return SKIN
    if region == 'upperarm':
        if end.startswith('elbow'):
            return RED if t < 0.3 else SKIN
        return SHIRT
    # Torso: overalls below the belt and on the bib, straps over the shoulders, shirt elsewhere.
    if z < 0.31:
        return DENIM
    ax = abs(x)
    if z < 0.418 and ((y < 0 and ax < 0.064) or (y > 0 and ax < 0.05 and z < 0.37)):
        return DENIM
    if 0.04 < ax < 0.068 and z >= 0.37:
        return DENIM
    return SHIRT


def build_body():
    names = list(STICK)
    mesh = bpy.data.meshes.new('body')
    mesh.from_pydata([STICK[n][0] for n in names], [(names.index(a), names.index(b)) for a, b in EDGES], [])
    obj = bpy.data.objects.new('body', mesh)
    bpy.context.scene.collection.objects.link(obj)
    skin = obj.modifiers.new('skin', 'SKIN')
    skin.branch_smoothing = 0.6
    for i, n in enumerate(names):
        mesh.skin_vertices[0].data[i].radius = STICK[n][1]
    mesh.skin_vertices[0].data[0].use_root = True
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier='skin')
    # Painted once subdivided (so the colour edges follow its loops), then smoothed again.
    bake(obj, ('SUBSURF', {'levels': 1, 'render_levels': 1}))
    segments = _segments()
    paint_faces(obj, lambda c: _body_colour(c, segments))
    bake(obj, ('SUBSURF', {'levels': 1, 'render_levels': 1}))
    return obj


def skin_to(body, rig):
    """Blender's automatic (bone heat) weights."""
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')


def follow_body(obj, body, tree):
    """Gives `obj` the body's weights at each of its vertices (averaged over the nearest body points)."""
    names = {g.index: g.name for g in body.vertex_groups}
    groups = {}
    for vert in obj.data.vertices:
        total = {}
        found = tree.find_n(vert.co, 4)
        norm = sum(1 / (d + 1e-4) for _, _, d in found)
        for _, index, d in found:
            for g in body.data.vertices[index].groups:
                name = names[g.group]
                total[name] = total.get(name, 0) + g.weight / (d + 1e-4) / norm
        for name, w in total.items():
            if w > 0.002:
                group = groups.get(name) or groups.setdefault(name, obj.vertex_groups.new(name=name))
                group.add([vert.index], w, 'REPLACE')
    return obj


def on_bone(obj, bones):
    """Pins `obj` to a bone, or to a blend of bones ({name: weight})."""
    for name, w in (bones.items() if isinstance(bones, dict) else [(bones, 1.0)]):
        obj.vertex_groups.new(name=name).add([v.index for v in obj.data.vertices], w, 'REPLACE')
    return obj


def trunk(body):
    """The body's points on the torso and legs (not the arms)."""
    names = {g.index: g.name for g in body.vertex_groups}
    arm = ('upperarm', 'forearm', 'hand')
    return [v for v in body.data.vertices if not any(names[g.group].startswith(arm) and g.weight > 0.05 for g in v.groups)]


def body_tree(body):
    """For follow_body: the trunk only, so a cuff or a boot never swings with the hands."""
    keep = trunk(body)
    tree = KDTree(len(keep))
    for v in keep:
        tree.insert(v.co, v.index)
    tree.balance()
    return tree


def section(body, z, band=0.006, xmin=None, xmax=None):
    """Half-width, half-depth and centre of the trunk around height z (only points with xmin ≤ x ≤ xmax)."""
    pts = [v.co for v in trunk(body) if abs(v.co.z - z) < band and (xmin is None or v.co.x >= xmin) and (xmax is None or v.co.x <= xmax)]
    xs = [p.x for p in pts]
    ys = [p.y for p in pts]
    return (max(xs) - min(xs)) / 2, (max(ys) - min(ys)) / 2, (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
