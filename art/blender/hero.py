"""The player: the car wash's star washer, a chunky cartoon mechanic. A red
cap with a white foam front and a bubble logo, a big round nose and a grin,
a yellow shirt with a red collar under blue denim overalls, a leather tool
belt with pouches and a sponge, big hands and chunky boots.

One smooth body mesh on a real skeleton (hips, spine, chest, neck, head,
upper arms, forearms, hands, thighs, shins, feet; see hero_model.py), with
the head, cap, hands and boots on their bones (hero_parts.py).
Animations: idle (breathing, weight shift, looking about), walk and sprint
(heel strike, toe-off, bounce, hip sway, arm swing), interact-right (a
whole-body scrub, the other hand on the hip) and pick-up (a squat).

About 0.73 tall, shown at twice that; front faces -Y. The right hand bone
is `hand-right`: the game puts the sponge there.

Usage: python art/blender/hero.py <out.glb> [preview-dir]
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import kit  # noqa: E402

kit.reset()
import hero_model as m  # noqa: E402
import hero_parts  # noqa: E402

bpy = kit.bpy

rig = m.build_rig()
body = m.build_body()
m.skin_to(body, rig)
tree = m.body_tree(body)
parts = hero_parts.head() + hero_parts.hands() + hero_parts.boots() + hero_parts.clothes(body)
for obj, bone in parts:
    if bone:
        m.on_bone(obj, bone)
    else:
        m.follow_body(obj, body, tree)
body.parent = None
for mod in list(body.modifiers):
    body.modifiers.remove(mod)
hero = kit.join([body] + [obj for obj, _ in parts], 'hero-body')
kit.use_material(hero, kit.toy_material('toy'))
hero.parent = rig
hero.modifiers.new('rig', 'ARMATURE').object = rig
print('triangles', kit.triangles([hero]), 'height', round(max(v.co.z for v in hero.data.vertices), 3))

# ---- Animations ----------------------------------------------------------------
FPS = 30
bpy.context.scene.render.fps = FPS
D = math.radians
pose = rig.pose.bones
for pb in pose:
    pb.rotation_mode = 'XYZ'
LENGTHS = {}


def bump(q, c, w):
    d = min(abs(q - c), abs(q - c + 1), abs(q - c - 1))
    return math.exp(-((d / w) ** 2))


def cyc(q):
    return 2 * math.pi * q


def animate(name, seconds, posed):
    """`posed(t)` → {bone: (x, y, z) degrees} plus 'lift' (hips up/down) and 'sway' (side to side).
    Bone X turns: legs and arms + swing back, knees and elbows bend with +shin / -forearm, feet + points the toe."""
    LENGTHS[name] = seconds
    action = bpy.data.actions.new(name)
    rig.animation_data_create()
    rig.animation_data.action = action
    frames = max(2, round(seconds * FPS))
    keys = list(range(0, frames, 2)) + [frames]
    for f in keys:
        p = posed(f / frames)
        for pb in pose:
            rx, ry, rz = p.get(pb.name, (0, 0, 0))
            pb.rotation_euler = (D(rx), D(ry), D(rz))
            pb.keyframe_insert('rotation_euler', frame=f + 1)
        pose['hips'].location = (p.get('sway', 0), p.get('lift', 0), 0)
        pose['hips'].keyframe_insert('location', frame=f + 1)
    slot = rig.animation_data.action_slot
    rig.animation_data.action = None
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 1, action).action_slot = slot
    for pb in pose:
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)


def legs(t, swing, knee_swing, knee_stance, toe, back=0.0, width=2):
    """Both legs through a stride: the thigh swings, the knee folds as the foot passes, heel strike then toe-off."""
    out = {}
    for side, sign, offset in (('left', 1, 0.0), ('right', -1, 0.5)):
        q = (t + offset) % 1
        out[f'thigh-{side}'] = (-swing * math.cos(cyc(q)) + back, 0, -sign * width)
        out[f'shin-{side}'] = (knee_stance * (1 + bump(q, 0.1, 0.09)) + knee_swing * bump(q, 0.7, 0.14), 0, 0)
        out[f'foot-{side}'] = (-toe * 0.7 * bump(q, 0.0, 0.07) + toe * bump(q, 0.45, 0.07) - toe * 0.4 * bump(q, 0.8, 0.1), 0, 0)
    return out


def arms(t, swing, elbow, out=8, pump=0.6):
    p = {}
    for side, sign, offset in (('left', 1, 0.0), ('right', -1, 0.5)):
        q = (t + offset) % 1
        c = math.cos(cyc(q))
        p[f'upperarm-{side}'] = (swing * c, 0, -sign * out)
        p[f'forearm-{side}'] = (-elbow - elbow * pump * max(0.0, -c), 0, 0)
        p[f'hand-{side}'] = (-8, 0, sign * 6)
    return p


def idle(t):
    s, s2 = math.sin(cyc(t)), math.sin(cyc(2 * t))
    p = {
        'hips': (0, 0, 2.5 * s),
        'spine': (2 * s2, 0, -2 * s),
        'chest': (-3 - 2.5 * s2, 0, 0),
        'neck': (1.5 * s2, 0, 0),
        'head': (3 * math.sin(cyc(2 * t + 0.2)), 14 * math.sin(cyc(t + 0.1)), 3 * s),
        'sway': 0.005 * s,
        'lift': 0.002 * s2,
    }
    for side, sign in (('left', 1), ('right', -1)):
        p[f'upperarm-{side}'] = (3 * s2, 0, -sign * 9)
        p[f'forearm-{side}'] = (-18 - 4 * s2, 0, 0)
        p[f'hand-{side}'] = (-10, 0, sign * 8)
        p[f'thigh-{side}'] = (-2, 0, -sign * (3 + 2 * sign * s))
        p[f'shin-{side}'] = (4 + 3 * max(0.0, sign * s), 0, 0)
        p[f'foot-{side}'] = (-2, 0, sign * 2 * s)
    return p


def walk(t):
    c, s = math.cos(cyc(t)), math.sin(cyc(t))
    p = legs(t, swing=28, knee_swing=58, knee_stance=10, toe=24, back=-3)
    p.update(arms(t, swing=30, elbow=18))
    p.update({
        'hips': (0, 10 * c, 4 * s),
        'spine': (5, -7 * c, -2 * s),
        'chest': (2, -8 * c, 0),
        'neck': (-3, 2 * c, 0),
        'head': (-2 + 3 * math.cos(cyc(2 * t)), 3 * c, -2 * s),
        'lift': -0.011 * math.cos(cyc(2 * t - 0.12)) + 0.004,
        'sway': 0.007 * s,
    })
    return p


def sprint(t):
    c, s = math.cos(cyc(t)), math.sin(cyc(t))
    p = legs(t, swing=44, knee_swing=105, knee_stance=24, toe=34, back=-10)
    for side, sign, offset in (('left', 1, 0.0), ('right', -1, 0.5)):
        q = (t + offset) % 1
        cq = math.cos(cyc(q))
        p[f'upperarm-{side}'] = (55 * cq - 6, 0, -sign * 12)
        p[f'forearm-{side}'] = (-86 - 16 * cq, 0, 0)
        p[f'hand-{side}'] = (-12, 0, 0)
    p.update({
        'hips': (0, 13 * c, 5 * s),
        'spine': (14, -9 * c, 0),
        'chest': (8, -11 * c, -2 * s),
        'neck': (-10, 0, 0),
        'head': (-8 + 3 * math.cos(cyc(2 * t)), 4 * c, 0),
        'lift': -0.02 * math.cos(cyc(2 * t - 0.1)) + 0.008,
    })
    return p


def scrub(t):
    c, s = math.cos(cyc(t)), math.sin(cyc(t))
    p = {
        'hips': (0, -8 + 5 * s, 0),
        'spine': (12, -6 + 7 * s, 3 * c),
        'chest': (6, -6 + 9 * s, 0),
        'neck': (-8, 0, 0),
        'head': (8, 10 * s, 0),
        'lift': -0.012 + 0.005 * math.sin(cyc(2 * t)),
        # The right arm reaches out and scrubs round and round.
        'upperarm-right': (-70 + 18 * s, 0, 14 + 16 * c),
        'forearm-right': (-38 + 20 * c, 0, 0),
        'hand-right': (-18 + 12 * s, 0, 0),
        # The left fist on the hip.
        'upperarm-left': (10, 0, -40),
        'forearm-left': (-100, 0, 0),
        'hand-left': (-14, 0, 24),
    }
    for side, sign in (('left', 1), ('right', -1)):
        p[f'thigh-{side}'] = (-16, 0, -sign * 8)
        p[f'shin-{side}'] = (26, 0, 0)
        p[f'foot-{side}'] = (-10, 0, sign * 6)
    return p


def pick_up(t):
    e = math.sin(math.pi * t) ** 2
    p = {
        'spine': (30 * e, 0, 0),
        'chest': (14 * e, 0, 0),
        'neck': (-10 * e, 0, 0),
        'head': (-8 * e, 0, 0),
        'lift': -0.07 * e,
    }
    for side, sign in (('left', 1), ('right', -1)):
        p[f'thigh-{side}'] = (-64 * e, 0, -sign * 10 * e)
        p[f'shin-{side}'] = (100 * e, 0, 0)
        p[f'foot-{side}'] = (-36 * e, 0, 0)
        p[f'upperarm-{side}'] = (-55 * e, 0, -sign * 12 * e)
        p[f'forearm-{side}'] = (-20 * e, 0, 0)
        p[f'hand-{side}'] = (-20 * e, 0, 0)
    return p


animate('idle', 2.4, idle)
animate('walk', 0.9, walk)
animate('sprint', 0.56, sprint)
animate('interact-right', 0.7, scrub)
animate('pick-up', 0.8, pick_up)

bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
hero.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=sys.argv[1] if len(sys.argv) > 1 else 'character-hero.glb',
    export_format='GLB', use_selection=True, export_yup=True, export_texcoords=False, export_materials='EXPORT',
    export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
    export_def_bones=False, export_skins=True,
)

if len(sys.argv) > 2:
    import hero_preview
    hero_preview.stills(Path(sys.argv[2]), rig, LENGTHS, FPS)
