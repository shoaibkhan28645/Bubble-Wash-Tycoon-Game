"""The hero's mesh and skeleton (see hero.py).

The body (torso, arms, legs, neck) is one seamless mesh grown from a stick
figure with Blender's skin modifier and subdivided, so shoulders, hips,
knees and elbows bend as one smooth surface; it is painted by region (polo
shirt, sleeves, skin, work trousers, the boots' shafts) and
skinned with Blender's automatic weights. The head, hair, hands and boot
feet are solid parts on their bones; details on the body (collar, belt,
boot rims) are pinned to the bones under them.

The legs stand straight down from the hips (hip, knee and ankle in one
upright line), so the walk can place the feet exactly (see hero_anim.py).
"""

import bpy  # noqa: I001
from mathutils import Vector
from mathutils.kdtree import KDTree

import kit

SKIN = '#e9a77a'
SKIN_SHADE = '#d98e63'
CHEEK = '#ef8b7a'
HAIR = '#5b3320'
HAIR_LIGHT = '#7d4b2c'
EYE = '#1d2027'
MOUTH = '#6e2230'
WHITE = '#f6f8fb'
POLO = '#22c3c9'
POLO_DARK = '#139aa6'
TROUSERS = '#2f3e66'
TROUSERS_DARK = '#25304f'
RUBBER = '#ffc928'
RUBBER_DARK = '#e9a514'
SOLE = '#3a3f4a'
BELT = '#33363f'
STEEL = '#d5dbe3'
BUBBLE = '#8fe3ff'
BOTTLE = '#3f8ff0'
TOWEL = '#ff7fb0'

HZ = 0.664  # head centre
HEAD = (0.086, 0.082, 0.098)  # head radii
HIP, KNEE, ANKLE, LEG_X = 0.335, 0.2, 0.072, 0.056

# Bones: name → (head, tail, parent, which way the bone's Z points).
BONES = {
    'hips': ((0, 0, HIP), (0, 0, 0.4), None, (0, -1, 0)),
    'spine': ((0, 0, 0.4), (0, 0, 0.47), 'hips', (0, -1, 0)),
    'chest': ((0, 0, 0.47), (0, 0, 0.535), 'spine', (0, -1, 0)),
    'neck': ((0, 0, 0.535), (0, 0, 0.585), 'chest', (0, -1, 0)),
    'head': ((0, 0, 0.585), (0, 0, 0.78), 'neck', (0, -1, 0)),
}
for _side, _sx in (('left', 1), ('right', -1)):
    BONES[f'upperarm-{_side}'] = ((_sx * 0.1, 0.002, 0.518), (_sx * 0.13, 0.008, 0.43), 'chest', (0, 1, 0))
    BONES[f'forearm-{_side}'] = ((_sx * 0.13, 0.008, 0.43), (_sx * 0.144, -0.002, 0.35), f'upperarm-{_side}', (0, 1, 0))
    BONES[f'hand-{_side}'] = ((_sx * 0.144, -0.002, 0.35), (_sx * 0.148, -0.008, 0.29), f'forearm-{_side}', (0, 1, 0))
    BONES[f'thigh-{_side}'] = ((_sx * LEG_X, 0, HIP), (_sx * LEG_X, 0, KNEE), 'hips', (0, 1, 0))
    BONES[f'shin-{_side}'] = ((_sx * LEG_X, 0, KNEE), (_sx * LEG_X, 0, ANKLE), f'thigh-{_side}', (0, 1, 0))
    BONES[f'foot-{_side}'] = ((_sx * LEG_X, 0, ANKLE), (_sx * LEG_X, -0.07, 0.02), f'shin-{_side}', (0, 0, -1))


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
    'pelvis': ((0, 0.006, 0.352), (0.1, 0.09)),
    'waist': ((0, 0.0, 0.4), (0.096, 0.088)),
    'chest': ((0, -0.008, 0.468), (0.112, 0.096)),
    'yoke': ((0, 0.002, 0.52), (0.094, 0.08)),
    'neck': ((0, 0.004, 0.55), (0.036, 0.036)),
    'neck2': ((0, 0.004, 0.61), (0.034, 0.034)),
}
for _side, _sx in (('left', 1), ('right', -1)):
    STICK[f'hip-{_side}'] = ((_sx * LEG_X, 0.002, 0.326), (0.06, 0.06))
    STICK[f'thigh-{_side}'] = ((_sx * LEG_X, 0, 0.27), (0.056, 0.058))
    STICK[f'knee-{_side}'] = ((_sx * LEG_X, -0.003, KNEE), (0.048, 0.05))
    STICK[f'calf-{_side}'] = ((_sx * LEG_X, 0.002, 0.15), (0.05, 0.05))
    STICK[f'ankle-{_side}'] = ((_sx * LEG_X, 0.002, 0.088), (0.046, 0.046))
    STICK[f'shoulder-{_side}'] = ((_sx * 0.098, 0.002, 0.516), (0.048, 0.048))
    STICK[f'sleeve-{_side}'] = ((_sx * 0.117, 0.005, 0.468), (0.05, 0.05))
    STICK[f'elbow-{_side}'] = ((_sx * 0.13, 0.008, 0.43), (0.039, 0.039))
    STICK[f'wrist-{_side}'] = ((_sx * 0.144, -0.002, 0.356), (0.034, 0.034))
# Edges with the region they belong to.
EDGES = [('pelvis', 'waist', 'torso'), ('waist', 'chest', 'torso'), ('chest', 'yoke', 'torso'), ('yoke', 'neck', 'torso'), ('neck', 'neck2', 'neck')]
for _side in ('left', 'right'):
    EDGES += [('pelvis', f'hip-{_side}', 'torso'), (f'hip-{_side}', f'thigh-{_side}', 'leg'), (f'thigh-{_side}', f'knee-{_side}', 'leg'), (f'knee-{_side}', f'calf-{_side}', 'leg'), (f'calf-{_side}', f'ankle-{_side}', 'leg')]
    EDGES += [('yoke', f'shoulder-{_side}', 'torso'), (f'shoulder-{_side}', f'sleeve-{_side}', 'sleeve'), (f'sleeve-{_side}', f'elbow-{_side}', 'upperarm'), (f'elbow-{_side}', f'wrist-{_side}', 'forearm')]
BOOT_TOP = 0.15
WAIST = 0.392


def _segments():
    """Each stick edge as (a, b, region)."""
    return [(Vector(STICK[a][0]), Vector(STICK[b][0]), region) for a, b, region in EDGES]


def _nearest(p, segments):
    best = None
    for a, b, region in segments:
        ab = b - a
        t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
        d = (a + ab * t - p).length
        if best is None or d < best[0]:
            best = (d, region, t)
    return best


def _body_colour(c, segments):
    _, region, t = _nearest(c, segments)
    z = c.z
    if region == 'neck':
        return SKIN
    if region == 'sleeve':
        return POLO
    if region == 'upperarm':
        # The sleeve reaches a third of the way down, with a white trim.
        return POLO if t < 0.3 else WHITE if t < 0.42 else SKIN
    if region == 'forearm':
        return SKIN if t < 0.62 else RUBBER
    if region == 'leg':
        return RUBBER if z < BOOT_TOP else TROUSERS
    # Torso: work trousers up to the belt, the polo above.
    return TROUSERS if z < WAIST else POLO


def build_body():
    names = list(STICK)
    mesh = bpy.data.meshes.new('body')
    mesh.from_pydata([STICK[n][0] for n in names], [(names.index(a), names.index(b)) for a, b, _ in EDGES], [])
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
    _keep_arms_to_themselves(body)


def _keep_arms_to_themselves(body):
    """Bone heat lets a swinging arm drag the chest and hips along; only the shoulder may follow it."""
    names = {g.index: g.name for g in body.vertex_groups}
    groups = {g.name: g for g in body.vertex_groups}
    segments = _segments()
    arm = ('upperarm', 'forearm', 'hand')
    for v in body.data.vertices:
        _, region, _ = _nearest(v.co, segments)
        if region not in ('torso', 'neck', 'leg'):
            continue
        keep = smoothstep(0.072, 0.098, abs(v.co.x)) if region == 'torso' and v.co.z > 0.46 else 0.0
        weights = {names[g.group]: g.weight for g in v.groups}
        weights = {n: w * (keep if n.startswith(arm) else 1.0) for n, w in weights.items()}
        total = sum(weights.values()) or 1.0
        for n, w in weights.items():
            if w / total < 1e-3:
                groups[n].remove([v.index])
            else:
                groups[n].add([v.index], w / total, 'REPLACE')


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
