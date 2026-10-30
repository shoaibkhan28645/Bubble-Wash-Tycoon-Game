"""The player: the car wash's own washer. A swept-up brown quiff and
fringe, a friendly face, an aqua work polo with a white collar, sleeve trim
and a bubble badge, navy work trousers with a belt, a spray bottle on the
hip and a pink towel in the back pocket, yellow rubber gloves and boots.

One smooth body mesh on a real skeleton (hips, spine, chest, neck, head,
upper arms, forearms, hands, thighs, shins, feet; see hero_model.py), with
the head, hair, gloves and boots on their bones (hero_parts.py).
Animations (hero_anim.py): idle, walk, jog and sprint with the feet planted
by leg IK, interact-right (scrubbing, the other fist on the hip) and
pick-up (a squat). Each gait's ground speed is printed; the game keeps them
in src/data/characters.json to play each gait at the matching rate.

About 0.78 tall, shown at twice that; front faces -Y. The right hand bone
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
import hero_anim  # noqa: E402
import hero_parts  # noqa: E402

bpy = kit.bpy

rig = m.build_rig()
body = m.build_body()
m.skin_to(body, rig)
tree = m.body_tree(body)
parts = hero_parts.head() + hero_parts.hands() + hero_parts.boots(body) + hero_parts.extras(body)
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

# ---- Animations (hero_anim.py) --------------------------------------------------
FPS = 30
bpy.context.scene.render.fps = FPS
pose = rig.pose.bones
for pb in pose:
    pb.rotation_mode = 'XYZ'
LENGTHS = {}


def animate(name, seconds, posed):
    """Keys `posed(t)` on every frame of one cycle into its own NLA track (one glTF animation)."""
    LENGTHS[name] = seconds
    action = bpy.data.actions.new(name)
    rig.animation_data_create()
    rig.animation_data.action = action
    frames = max(2, round(seconds * FPS))
    for f in range(frames + 1):
        p = posed(f / frames)
        for pb in pose:
            pb.rotation_euler = [math.radians(a) for a in p.get(pb.name, (0, 0, 0))]
            pb.keyframe_insert('rotation_euler', frame=f + 1)
        pose['hips'].location = (p.get('sway', 0), p.get('lift', 0), p.get('fwd', 0))
        pose['hips'].keyframe_insert('location', frame=f + 1)
    slot = rig.animation_data.action_slot
    rig.animation_data.action = None
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 1, action).action_slot = slot
    for pb in pose:
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)


for name, (seconds, posed, speed) in hero_anim.CLIPS.items():
    animate(name, seconds, posed)
    if speed:
        print(f'{name}: {speed:.2f} m/s in the game')

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
