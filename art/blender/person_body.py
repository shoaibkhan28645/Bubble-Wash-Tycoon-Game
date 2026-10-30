"""The people's skeleton and bodies (see people.py).

Everyone shares one skeleton, so they share the animations. A body (torso,
arms, legs, neck) is one seamless mesh grown from a stick figure with
Blender's skin modifier and subdivided, so shoulders, hips, knees and
elbows bend as one smooth surface. It is painted by region from the
person's look (top, sleeves, skin, trousers or shorts or skirt, socks,
boot shafts) and skinned with Blender's automatic weights. The head, hair,
hands and shoes are solid parts on their bones; details on the body
(collar, belt, apron) are pinned to the bones under them.

The legs stand straight down from the hips (hip, knee and ankle in one
upright line), so the walk can place the feet exactly (see person_anim.py).
"""
import bpy  # noqa: I001
from mathutils import Vector
from mathutils.kdtree import KDTree

import shapes
from shapes import bake, paint_faces, smoothstep

HZ = 0.664  # head centre
HEAD = (0.086, 0.082, 0.098)  # head radii
HIP, KNEE, ANKLE, LEG_X = 0.335, 0.2, 0.072, 0.056
WAIST = 0.392
BOOT_TOP = 0.15
SHORTS = 0.255  # where shorts end
SOCKS = 0.1

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
# Torso radii for each build: (pelvis, waist, chest, yoke).
BUILDS = {
    'male': ((0.1, 0.09), (0.096, 0.088), (0.112, 0.096), (0.094, 0.08)),
    'female': ((0.106, 0.09), (0.084, 0.078), (0.102, 0.092), (0.086, 0.074)),
    'big': ((0.112, 0.102), (0.118, 0.112), (0.124, 0.11), (0.1, 0.086)),
}


def stick(look):
    """The stick figure for a look: point → (position, skin radii); and its edges with their regions."""
    pelvis, waist, chest, yoke = BUILDS[look['build']]
    arm = 1.08 if look['build'] == 'big' else 0.94 if look['build'] == 'female' else 1.0
    points = {
        'pelvis': ((0, 0.006, 0.352), pelvis),
        'waist': ((0, 0.0, 0.4), waist),
        'chest': ((0, -0.008, 0.468), chest),
        'yoke': ((0, 0.002, 0.52), yoke),
        'neck': ((0, 0.004, 0.55), (0.036, 0.036)),
        'neck2': ((0, 0.004, 0.61), (0.034, 0.034)),
    }
    for side, sx in (('left', 1), ('right', -1)):
        points[f'hip-{side}'] = ((sx * LEG_X, 0.002, 0.326), (0.06, 0.06))
        points[f'thigh-{side}'] = ((sx * LEG_X, 0, 0.27), (0.056, 0.058))
        points[f'knee-{side}'] = ((sx * LEG_X, -0.003, KNEE), (0.048, 0.05))
        points[f'calf-{side}'] = ((sx * LEG_X, 0.002, 0.15), (0.05, 0.05))
        points[f'ankle-{side}'] = ((sx * LEG_X, 0.002, 0.088), (0.046, 0.046))
        points[f'shoulder-{side}'] = ((sx * 0.098, 0.002, 0.516), (0.048 * arm, 0.048 * arm))
        points[f'sleeve-{side}'] = ((sx * 0.117, 0.005, 0.468), (0.05 * arm, 0.05 * arm))
        points[f'elbow-{side}'] = ((sx * 0.13, 0.008, 0.43), (0.039 * arm, 0.039 * arm))
        points[f'wrist-{side}'] = ((sx * 0.144, -0.002, 0.356), (0.034 * arm, 0.034 * arm))
    edges = [('pelvis', 'waist', 'torso'), ('waist', 'chest', 'torso'), ('chest', 'yoke', 'torso'), ('yoke', 'neck', 'torso'), ('neck', 'neck2', 'neck')]
    for side in ('left', 'right'):
        edges += [('pelvis', f'hip-{side}', 'torso'), (f'hip-{side}', f'thigh-{side}', 'leg'), (f'thigh-{side}', f'knee-{side}', 'leg'),
                  (f'knee-{side}', f'calf-{side}', 'leg'), (f'calf-{side}', f'ankle-{side}', 'leg')]
        edges += [('yoke', f'shoulder-{side}', 'torso'), (f'shoulder-{side}', f'sleeve-{side}', 'sleeve'),
                  (f'sleeve-{side}', f'elbow-{side}', 'upperarm'), (f'elbow-{side}', f'wrist-{side}', 'forearm')]
    return points, edges


def segments(look):
    """Each stick edge as (a, b, region)."""
    points, edges = stick(look)
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


def body_colour(c, segs, look):
    _, region, t = nearest(c, segs)
    x, y, z = c
    skin, top, trim = look['skin'], look['top_colour'], look['trim'] or look['top_colour']
    long_sleeves = look['top'] in ('long', 'hoodie', 'shirt')
    if region == 'neck':
        return skin
    if region == 'sleeve':
        # A vest's shoulders reach a little way over the arm.
        return look['vest']['colour'] if look['vest'] and t < 0.2 else top
    if region == 'upperarm':
        if long_sleeves:
            return top
        # Short sleeves reach a third of the way down, with a trim.
        return top if t < 0.3 else trim if t < 0.42 else skin
    if region == 'forearm':
        if look['gloves'] and t >= 0.62:
            return look['gloves']
        if long_sleeves:
            return top if t < 0.8 else trim if t < 0.9 else skin
        return skin
    bottoms = look['bottoms_colour']
    if look['apron'] and region == 'torso' and y < -0.004 and abs(x) < 0.07 and 0.3 < z < 0.5:
        return look['apron']
    if region == 'leg':
        if look['shoes'] == 'boots' and z < BOOT_TOP:
            return look['shoe_colour']
        if look['bottoms'] in ('shorts', 'skirt'):
            if z < SOCKS and look['socks']:
                return look['socks']
            return bottoms if look['bottoms'] == 'shorts' and z > SHORTS else skin
        return bottoms
    if z < WAIST:
        return bottoms
    vest = look['vest']
    if vest:
        # A sleeveless vest, open in a V at the front, maybe with a reflective stripe.
        opening = y < 0 and z > 0.47 and abs(x) < 0.008 + (z - 0.47) * 0.4
        if not opening:
            return vest.get('stripe', vest['colour']) if 0.44 < z < 0.458 and 'stripe' in vest else vest['colour']
    return top


def build_body(look):
    points, edges = stick(look)
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
    # Painted once subdivided (so the colour edges follow its loops), then smoothed again (the hero only).
    bake(obj, ('SUBSURF', {'levels': 1, 'render_levels': 1}))
    segs = segments(look)
    paint_faces(obj, lambda c: body_colour(c, segs, look))
    if shapes.FINE:
        bake(obj, ('SUBSURF', {'levels': 1, 'render_levels': 1}))
    return obj


def skin_to(body, rig, look):
    """Blender's automatic (bone heat) weights."""
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    _keep_arms_to_themselves(body, look)


def _keep_arms_to_themselves(body, look):
    """Bone heat lets a swinging arm drag the chest and hips along; only the shoulder may follow it."""
    names = {g.index: g.name for g in body.vertex_groups}
    groups = {g.name: g for g in body.vertex_groups}
    segs = segments(look)
    arm = ('upperarm', 'forearm', 'hand')
    for v in body.data.vertices:
        _, region, _ = nearest(v.co, segs)
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
    """For follow_body: the trunk only, so a part never swings with the hands."""
    keep = trunk(body)
    tree = KDTree(len(keep))
    for v in keep:
        tree.insert(v.co, v.index)
    tree.balance()
    return tree


def section(body, z, band=0.006, xmin=None, xmax=None):
    """Half-width, half-depth and centre of the trunk around height z (only points with xmin ≤ x ≤ xmax)."""
    keep = [v.co for v in trunk(body) if (xmin is None or v.co.x >= xmin) and (xmax is None or v.co.x <= xmax)]
    pts = []
    while not pts:
        pts = [p for p in keep if abs(p.z - z) < band]
        band *= 1.5
    xs = [p.x for p in pts]
    ys = [p.y for p in pts]
    return (max(xs) - min(xs)) / 2, (max(ys) - min(ys)) / 2, (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
