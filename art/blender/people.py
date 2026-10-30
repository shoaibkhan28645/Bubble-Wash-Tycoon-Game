"""Bubble Wash Town's people: the car wash staff and the townspeople, in
the hero's style, all on one shared skeleton with the same animations.

Each person is built from a look (looks.py): a body (person_body.py), a
head and hair (person_head.py), hands, shoes and outfit details
(person_wear.py), joined into one skinned mesh named `person-<id>`. Several
people share one glb (looks.FILES), with the animations stored once. The
game splits them apart again (src/render/assets.ts).

Usage: python art/blender/people.py <out-dir> [preview-dir]
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import kit  # noqa: E402
import looks  # noqa: E402
import person_anim  # noqa: E402
import person_body as pb  # noqa: E402
import person_head  # noqa: E402
import person_wear  # noqa: E402
import shapes  # noqa: E402

bpy = kit.bpy
FPS = 30


def build_person(name, look, rig, material, fine=False):
    """One person as a skinned mesh named person-<name>, parented to the shared rig."""
    shapes.FINE = fine
    body = pb.build_body(look)
    pb.skin_to(body, rig, look)
    tree = pb.body_tree(body)
    parts = person_head.head(look) + person_wear.hands(look) + person_wear.feet(body, look) + person_wear.extras(body, look)
    for obj, bones in parts:
        if bones:
            pb.on_bone(obj, bones)
        else:
            pb.follow_body(obj, body, tree)
    body.parent = None
    for mod in list(body.modifiers):
        body.modifiers.remove(mod)
    person = kit.join([body] + [obj for obj, _ in parts], f'person-{name}')
    kit.use_material(person, material)
    person.parent = rig
    person.modifiers.new('rig', 'ARMATURE').object = rig
    print(f'{name}: {kit.triangles([person])} triangles')
    return person


def animate(rig):
    """Keys every clip (person_anim.CLIPS) on the rig, one NLA track each (one glTF animation each)."""
    bpy.context.scene.render.fps = FPS
    pose = rig.pose.bones
    for bone in pose:
        bone.rotation_mode = 'XYZ'
    lengths = {}
    rig.animation_data_create()
    for name, (seconds, posed, speed) in person_anim.CLIPS.items():
        lengths[name] = seconds
        action = bpy.data.actions.new(name)
        rig.animation_data.action = action
        frames = max(2, round(seconds * FPS))
        for f in range(frames + 1):
            p = posed(f / frames)
            for bone in pose:
                bone.rotation_euler = [math.radians(a) for a in p.get(bone.name, (0, 0, 0))]
                bone.keyframe_insert('rotation_euler', frame=f + 1)
            pose['hips'].location = (p.get('sway', 0), p.get('lift', 0), p.get('fwd', 0))
            pose['hips'].keyframe_insert('location', frame=f + 1)
        slot = rig.animation_data.action_slot
        rig.animation_data.action = None
        track = rig.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 1, action).action_slot = slot
        if speed:
            print(f'{name}: {speed:.2f} m/s in the game')
    for bone in pose:
        bone.rotation_euler = (0, 0, 0)
        bone.location = (0, 0, 0)
    return lengths


def export(rig, people, path):
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    for person in people:
        person.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format='GLB', use_selection=True, export_yup=True, export_texcoords=False,
        export_materials='EXPORT', export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
        export_def_bones=False, export_skins=True,
    )


if __name__ == '__main__':
    kit.reset()
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    rig = pb.build_rig()
    material = kit.toy_material('toy')
    people = {name: build_person(name, looks.LOOKS[name], rig, material) for names in looks.FILES.values() for name in names}
    lengths = animate(rig)
    for file, names in looks.FILES.items():
        export(rig, [people[n] for n in names], out / f'{file}.glb')
    if len(sys.argv) > 2:
        import person_preview
        person_preview.lineup(Path(sys.argv[2]), rig, people, lengths, FPS)
