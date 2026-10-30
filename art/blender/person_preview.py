"""Stills of the people for checking their looks and poses (not exported)."""
import math

import bpy  # noqa: I001
from mathutils import Vector

import kit

HERO_SHOTS = [
    ('idle', 0.0, (0.35, -1, 0.25)),
    ('idle', 0.0, (-1, -0.1, 0.15)),
    ('idle', 0.0, (0.0, -1, 0.05), 'face'),
    ('walk', 0.0, (1, -0.25, 0.15)),
    ('walk', 0.25, (1, -0.25, 0.15)),
    ('walk', 0.5, (0.5, -1, 0.3)),
    ('jog', 0.2, (1, -0.25, 0.15)),
    ('sprint', 0.0, (1, -0.25, 0.15)),
    ('sprint', 0.15, (1, -0.25, 0.15)),
    ('sprint', 0.4, (0.5, -1, 0.3)),
    ('interact-right', 0.25, (0.3, -1, 0.35)),
    ('interact-right', 0.75, (-0.6, -1, 0.35)),
    ('pick-up', 0.5, (1, -0.6, 0.3)),
    ('idle', 0.0, (0.0, -0.75, 1.4), 'game'),
]
CAST_SHOTS = [('idle', 0.0, (0.35, -1, 0.2)), ('walk', 0.3, (-0.8, -0.6, 0.2))]


def _stage(size):
    scene = bpy.context.scene
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    plane = bpy.context.object
    kit._paint(plane, '#d9d2c4')
    kit.use_material(plane, kit.toy_material('ground'))
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.view_settings.view_transform = 'Standard'
    world = bpy.data.worlds.new('sky')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = kit.colour('#bfe9ff')
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
    scene.world = world
    bpy.ops.object.light_add(type='SUN', location=(0, 0, 5))
    sun = bpy.context.object
    sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(40), math.radians(-25), math.radians(30))
    bpy.ops.object.camera_add()
    cam = bpy.context.object
    cam.data.lens = 50
    scene.camera = cam
    return scene, cam


def _shoot(scene, cam, rig, lengths, fps, shot, path):
    name, phase, direction = shot[:3]
    kind = shot[3] if len(shot) > 3 else ''
    for track in rig.animation_data.nla_tracks:
        track.mute = track.name != name
    scene.frame_set(1 + round(phase * lengths[name] * fps))
    target = Vector((0, 0, 0.67 if kind == 'face' else 0.4))
    distance = 0.7 if kind == 'face' else 1.7
    cam.location = target + Vector(direction).normalized() * distance
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def stills(out, rig, lengths, fps):
    """The hero from every side and in every clip."""
    out.mkdir(parents=True, exist_ok=True)
    scene, cam = _stage((480, 600))
    for i, shot in enumerate(HERO_SHOTS):
        kind = shot[3] if len(shot) > 3 else ''
        _shoot(scene, cam, rig, lengths, fps, shot, out / f'{i:02d}-{shot[0]}-{shot[1]}{"-" + kind if kind else ""}.png')


def lineup(out, rig, people, lengths, fps):
    """Each of the cast, standing and walking."""
    out.mkdir(parents=True, exist_ok=True)
    scene, cam = _stage((300, 420))
    for name, person in people.items():
        for other in people.values():
            other.hide_render = other is not person
        for j, shot in enumerate(CAST_SHOTS):
            _shoot(scene, cam, rig, lengths, fps, shot, out / f'{name}-{j}.png')
