"""Preview renders of the tycoon (not part of the game): a turnaround in his
rest pose to hold against the design, and stills from each clip.

`shots(out, rig, lengths, which)`: `which` may name 'turn', 'clips' or 'face' (default: all).
"""
import math

import kit

bpy = kit.bpy
from mathutils import Vector  # noqa: E402

FPS = 30
# (clip, phase, camera direction)
CLIP_SHOTS = [
    ('idle', 0.0, (0.5, -1, 0.35)), ('walk', 0.0, (1, -0.15, 0.2)), ('walk', 0.25, (1, -0.15, 0.2)), ('walk', 0.5, (0.6, -1, 0.3)),
    ('jog', 0.1, (1, -0.15, 0.2)), ('sprint', 0.0, (1, -0.15, 0.2)), ('sprint', 0.3, (1, -0.15, 0.2)), ('sprint', 0.55, (0.7, -1, 0.3)),
    ('interact-right', 0.25, (0.7, -1, 0.3)), ('pick-up', 0.5, (1, -0.4, 0.25)),
]


def _stage(size, samples=24):
    scene = bpy.context.scene
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    plane = bpy.context.object
    kit._paint(plane, '#f4f1ec')
    kit.use_material(plane, kit.toy_material('ground'))
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.device = 'CPU'
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.view_settings.view_transform = 'Standard'
    world = bpy.data.worlds.new('sky')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = kit.colour('#ffffff')
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
    scene.world = world
    bpy.ops.object.light_add(type='SUN', location=(0, 0, 5))
    sun = bpy.context.object
    sun.data.energy = 2.6
    sun.data.angle = 0.3
    sun.rotation_euler = (math.radians(42), math.radians(-20), math.radians(25))
    bpy.ops.object.camera_add()
    cam = bpy.context.object
    cam.data.lens = 85
    scene.camera = cam
    return scene, cam


def _aim(cam, direction, target, distance):
    cam.location = Vector(target) + Vector(direction).normalized() * distance
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat('-Z', 'Y').to_euler()


def shots(out, rig, lengths, which=()):
    out.mkdir(parents=True, exist_ok=True)
    which = list(which) or ['turn', 'face', 'clips']
    scene, cam = _stage((420, 560))
    tracks = rig.animation_data.nla_tracks
    if 'turn' in which or 'face' in which:
        for track in tracks:
            track.mute = True
        scene.frame_set(1)
    if 'turn' in which:
        for name, direction in (('front', (0, -1, 0.04)), ('side', (-1, 0, 0.04)), ('back', (0, 1, 0.04)), ('quarter', (0.5, -1, 0.04)), ('game', (0, -1, 1.1))):
            _aim(cam, direction, (0, 0, 0.4), 2.15)
            scene.render.filepath = str(out / f'turn-{name}.png')
            bpy.ops.render.render(write_still=True)
    if 'face' in which:
        for name, direction in (('front', (0, -1, 0.05)), ('quarter', (0.6, -1, 0.15)), ('top', (0.3, -1, 0.9))):
            _aim(cam, direction, (0, 0, 0.59), 1.0)
            scene.render.filepath = str(out / f'face-{name}.png')
            bpy.ops.render.render(write_still=True)
    if 'clips' in which:
        scene.render.resolution_x, scene.render.resolution_y = 360, 480
        for i, (name, phase, direction) in enumerate(CLIP_SHOTS):
            for track in tracks:
                track.mute = track.name != name
            scene.frame_set(1 + round(phase * lengths[name] * FPS))
            _aim(cam, direction, (0, 0, 0.4), 2.4)
            scene.render.filepath = str(out / f'clip-{i:02d}-{name}-{phase}.png')
            bpy.ops.render.render(write_still=True)
