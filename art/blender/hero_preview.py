"""Stills of the hero for checking the look and the poses (not exported)."""
import math

import bpy  # noqa: I001
from mathutils import Vector

import kit

SHOTS = [
    ('idle', 0.0, (0.35, -1, 0.25)),
    ('idle', 0.0, (-1, -0.1, 0.15)),
    ('idle', 0.0, (0.0, -1, 0.05), 'face'),
    ('walk', 0.0, (1, -0.25, 0.15)),
    ('walk', 0.25, (1, -0.25, 0.15)),
    ('walk', 0.5, (0.5, -1, 0.3)),
    ('sprint', 0.0, (1, -0.25, 0.15)),
    ('sprint', 0.25, (0.5, -1, 0.3)),
    ('interact-right', 0.25, (0.3, -1, 0.35)),
    ('interact-right', 0.75, (-0.6, -1, 0.35)),
    ('pick-up', 0.5, (1, -0.6, 0.3)),
    ('idle', 0.0, (0.0, -0.75, 1.4), 'game'),
]


def stills(out, rig, lengths, fps):
    out.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    plane = bpy.context.object
    kit._paint(plane, '#d9d2c4')
    kit.use_material(plane, kit.toy_material('ground'))
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 480, 600
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
    for i, shot in enumerate(SHOTS):
        name, phase, direction = shot[:3]
        kind = shot[3] if len(shot) > 3 else ''
        for track in rig.animation_data.nla_tracks:
            track.mute = track.name != name
        scene.frame_set(1 + round(phase * lengths[name] * fps))
        target = Vector((0, 0, 0.59 if kind == 'face' else 0.37))
        distance = 0.75 if kind == 'face' else 2.3
        cam.location = target + Vector(direction).normalized() * distance
        cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(out / f'{i:02d}-{name}-{phase}{"-" + kind if kind else ""}.png')
        bpy.ops.render.render(write_still=True)
