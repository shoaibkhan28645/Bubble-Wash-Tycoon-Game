"""The player: the car wash's star washer, in the same toy style as everyone
else but made to stand out. A big friendly head with bright eyes and rosy
cheeks under a pink cap with a bubble logo, a white tee under turquoise
overalls with yellow buttons, yellow rubber gloves and boots, and a soap
tank on their back with bubbles floating off it.

Built like the Kenney Mini Characters the staff use, so the game treats it
the same way: parts named root, leg-left, leg-right, torso, arm-left,
arm-right and head, each one rigid piece hinged at its joint (the hand is
0.21 below the shoulder, where the game puts the sponge), about 0.82 tall
and shown at twice that size. Animations: idle, walk, sprint,
interact-right (scrubbing) and pick-up. Front faces -Y, the camera.

Usage: python art/blender/hero.py <out.glb> [preview.png]
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import kit  # noqa: E402

bpy = kit.bpy
kit.reset()

SKIN = '#ffcfa8'
CHEEK = '#ff9eaa'
HAIR = '#6b3f26'
CAP = '#ff4f9a'
CAP_DARK = '#e0367f'
TEE = '#f6f8fb'
OVERALLS = '#18b4c6'
OVERALLS_DARK = '#1196a6'
BUTTON = '#ffd24a'
RUBBER = '#ffd24a'
RUBBER_DARK = '#f2b51c'
EYE = '#2d3440'
TANK = '#8fe3ff'

# Joints, as in the Kenney characters: hips, shoulders, neck.
HIP_Z = 0.19
SHOULDER = (0.135, 0.0, 0.365)
NECK_Z = 0.405


def part(parts, name, pivot):
    obj = kit.join(parts, name)
    kit.set_origin(obj, pivot)
    return obj


def parent(child, to):
    child.parent = to
    child.matrix_parent_inverse = to.matrix_world.inverted()


# ---- Legs: overall legs over yellow rubber boots, toes forward. ----
legs = {}
for name, sx in (('leg-left', 1), ('leg-right', -1)):
    x = sx * 0.072
    p = [kit.box((0.1, 0.1, 0.13), (x, 0.0, 0.15), OVERALLS, bevel=0.03, segments=2)]
    p.append(kit.box((0.105, 0.105, 0.03), (x, 0.0, 0.095), OVERALLS_DARK, bevel=0.01))
    p.append(kit.box((0.1, 0.14, 0.085), (x, -0.018, 0.045), RUBBER, bevel=0.035, segments=2))
    p.append(kit.box((0.104, 0.15, 0.02), (x, -0.018, 0.01), RUBBER_DARK, bevel=0.008))
    legs[name] = part(p, name, (x, 0, HIP_Z))

# ---- Torso: tee, overalls with bib, straps and buttons, a pocket with a brush, the soap tank. ----
p = [kit.box((0.25, 0.17, 0.12), (0, 0.0, 0.33), TEE, bevel=0.05, segments=2)]
p.append(kit.box((0.26, 0.18, 0.15), (0, 0.0, 0.24), OVERALLS, bevel=0.05, segments=2))
p.append(kit.box((0.15, 0.03, 0.1), (0, -0.085, 0.33), OVERALLS, bevel=0.015))
for sx in (-1, 1):
    p.append(kit.box((0.035, 0.19, 0.03), (sx * 0.075, 0.0, 0.385), OVERALLS, bevel=0.01))
    p.append(kit.sphere(0.014, (sx * 0.06, -0.102, 0.375), BUTTON, segments=8))
p.append(kit.box((0.07, 0.02, 0.045), (0, -0.103, 0.325), OVERALLS_DARK, bevel=0.008))
p.append(kit.box((0.012, 0.012, 0.05), (0.02, -0.108, 0.36), '#ff8fc8', bevel=0.003))
p.append(kit.box((0.03, 0.02, 0.02), (0.02, -0.108, 0.386), BUTTON, bevel=0.005))
p.append(kit.box((0.27, 0.19, 0.03), (0, 0.0, 0.19), OVERALLS_DARK, bevel=0.012))
# The soap tank on their back, its pink cap and straps, bubbles floating off it.
p.append(kit.cylinder(0.068, 0.17, (0, 0.135, 0.3), TANK, verts=14, bevel=0.02))
p.append(kit.cylinder(0.075, 0.025, (0, 0.135, 0.24), CAP, verts=14, bevel=0.008))
p.append(kit.cylinder(0.075, 0.025, (0, 0.135, 0.36), CAP, verts=14, bevel=0.008))
p.append(kit.cylinder(0.03, 0.03, (0, 0.135, 0.395), CAP_DARK, verts=10))
p.append(kit.cylinder(0.045, 0.004, (0, 0.066, 0.3), 'white', verts=12, rot=(math.pi / 2, 0, 0)))
for (bx, by, bz, br) in ((0.05, 0.16, 0.44, 0.025), (0.02, 0.17, 0.49, 0.017), (0.065, 0.15, 0.51, 0.012)):
    p.append(kit.sphere(br, (bx, by, bz), '#dff6ff', segments=8))
torso = part(p, 'torso', (0, 0, HIP_Z))

# ---- Arms: short tee sleeves, skin, big yellow rubber gloves (the hand 0.21 below the shoulder). ----
arms = {}
for name, sx in (('arm-left', 1), ('arm-right', -1)):
    x, y, z = sx * SHOULDER[0], SHOULDER[1], SHOULDER[2]
    p = [kit.box((0.075, 0.08, 0.075), (x + sx * 0.01, y, z - 0.025), TEE, bevel=0.025, segments=2)]
    p.append(kit.box((0.055, 0.06, 0.09), (x + sx * 0.012, y, z - 0.1), SKIN, bevel=0.02, segments=2))
    p.append(kit.box((0.07, 0.075, 0.04), (x + sx * 0.012, y, z - 0.15), RUBBER_DARK, bevel=0.012))
    p.append(kit.box((0.072, 0.078, 0.075), (x + sx * 0.012, y - 0.005, z - 0.2), RUBBER, bevel=0.03, segments=2))
    p.append(kit.box((0.025, 0.03, 0.04), (x + sx * 0.012 - sx * 0.035, y - 0.02, z - 0.19), RUBBER, bevel=0.01))
    arms[name] = part(p, name, (x, y, z))

# ---- Head: big and round, bright eyes, eyebrows, a smile, rosy cheeks, ears, hair, the pink cap. ----
HC = (0, 0, NECK_Z + 0.17)
p = [kit.box((0.34, 0.31, 0.3), HC, SKIN, bevel=0.13, segments=4)]
p.append(kit.cylinder(0.05, 0.05, (0, 0, NECK_Z + 0.015), SKIN, verts=10))
for sx in (-1, 1):
    ex = sx * 0.075
    # Eyes painted on the round face: a white, a big dark iris, a shine.
    tilt = (math.pi / 2, 0, sx * 0.25)
    p.append(kit.cylinder(0.044, 0.012, (ex, -0.146, HC[2] - 0.005), 'white', verts=16, rot=tilt))
    p.append(kit.cylinder(0.031, 0.012, (ex, -0.151, HC[2] - 0.012), EYE, verts=14, rot=tilt))
    p.append(kit.cylinder(0.011, 0.012, (ex - 0.008, -0.156, HC[2] + 0.003), 'white', verts=8, rot=tilt))
    p.append(kit.box((0.05, 0.015, 0.012), (ex, -0.15, HC[2] + 0.058), HAIR, bevel=0.005, rot=(0, sx * 0.18, 0)))
    p.append(kit.sphere(0.024, (sx * 0.112, -0.135, HC[2] - 0.055), CHEEK, segments=8))
    p.append(kit.sphere(0.035, (sx * 0.172, 0.0, HC[2] - 0.01), SKIN, segments=8))
# The smile: a little curve.
for i, a in enumerate((-0.6, -0.3, 0.0, 0.3, 0.6)):
    p.append(kit.sphere(0.009, (0.04 * math.sin(a), -0.156, HC[2] - 0.075 + 0.025 * (1 - math.cos(a))), '#a3384b', segments=6))
# Hair showing under the cap: sides and back, and a tuft of fringe.
p.append(kit.box((0.35, 0.22, 0.12), (0, 0.06, HC[2] + 0.09), HAIR, bevel=0.06, segments=2))
p.append(kit.box((0.12, 0.05, 0.05), (-0.06, -0.14, HC[2] + 0.1), HAIR, bevel=0.02, rot=(0, 0.3, 0)))
# The cap: a dome with a seam and button, a brim over the eyes, a white bubble logo.
p.append(kit.sphere(0.185, (0, 0.005, HC[2] + 0.1), CAP, segments=16))
p.append(kit.cylinder(0.186, 0.03, (0, 0.005, HC[2] + 0.1), CAP_DARK, verts=24))
p.append(kit.sphere(0.022, (0, 0.005, HC[2] + 0.285), CAP_DARK, segments=8))
p.append(kit.box((0.25, 0.15, 0.025), (0, -0.2, HC[2] + 0.115), CAP_DARK, bevel=0.06, segments=2, rot=(0.12, 0, 0)))
p.append(kit.cylinder(0.045, 0.01, (0, -0.172, HC[2] + 0.19), 'white', verts=14, rot=(math.pi / 2 - 0.5, 0, 0)))
p.append(kit.cylinder(0.026, 0.012, (0.04, -0.158, HC[2] + 0.235), 'white', verts=12, rot=(math.pi / 2 - 0.65, 0, 0)))
head = part(p, 'head', (0, 0, NECK_Z))

# The hierarchy the game expects: root → legs, torso → arms, head.
root = bpy.data.objects.new('root', None)
bpy.context.scene.collection.objects.link(root)
for obj in legs.values():
    parent(obj, root)
parent(torso, root)
for obj in (*arms.values(), head):
    parent(obj, torso)
everyone = [root, *legs.values(), torso, *arms.values(), head]
rest = {obj.name: (obj.location.copy(), obj.rotation_euler.copy()) for obj in everyone}

# ---- Animations: every part keyed in every animation, so nothing is left over from the last one. ----
FPS = 30
bpy.context.scene.render.fps = FPS
D = math.radians


def animate(name, seconds, pose, steps=12):
    """`pose(t)` for t in 0..1 gives {part: (rotation x, y, z degrees, z offset)}."""
    action = bpy.data.actions.new(name)
    frames = [round(i * seconds * FPS / steps) + 1 for i in range(steps + 1)]
    for obj in everyone:
        obj.animation_data_create()
        obj.animation_data.action = action
    for i, frame in enumerate(frames):
        t = i / steps
        posed = pose(t)
        for obj in everyone:
            loc, rot = rest[obj.name]
            rx, ry, rz, dz = posed.get(obj.name, (0, 0, 0, 0))
            obj.rotation_euler = (rot.x + D(rx), rot.y + D(ry), rot.z + D(rz))
            obj.location = (loc.x, loc.y, loc.z + dz)
            obj.keyframe_insert('rotation_euler', frame=frame)
            obj.keyframe_insert('location', frame=frame)
    # Each part's keys go on a track named after the animation; the exporter
    # joins the same-named tracks into one animation.
    for obj in everyone:
        slot = obj.animation_data.action_slot
        obj.animation_data.action = None
        track = obj.animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, frames[0], action)
        strip.action_slot = slot
        obj.location, obj.rotation_euler = rest[obj.name]
    return action


s = lambda t, k=1: math.sin(2 * math.pi * k * t)  # noqa: E731

# Idle: breathing, a gentle sway, a look about.
animate('idle', 2.0, lambda t: {
    'torso': (0, 0, 0, 0.004 * s(t)),
    'head': (2 * s(t), 0, 4 * s(t, 0.5), 0),
    'arm-left': (3 * s(t), -3, 0, 0),
    'arm-right': (-3 * s(t), 3, 0, 0),
})
# Walk: legs and arms swinging opposite, a bounce at every step.
animate('walk', 0.8, lambda t: {
    'leg-left': (-30 * s(t), 0, 0, 0),
    'leg-right': (30 * s(t), 0, 0, 0),
    'arm-left': (28 * s(t), 0, 0, 0),
    'arm-right': (-28 * s(t), 0, 0, 0),
    'torso': (0, 0, 5 * s(t), 0.012 * abs(s(t))),
    'head': (0, 0, -4 * s(t), 0),
})
# Sprint: big strides, leaning in, arms pumping.
animate('sprint', 0.5, lambda t: {
    'leg-left': (-50 * s(t), 0, 0, 0),
    'leg-right': (50 * s(t), 0, 0, 0),
    'arm-left': (55 * s(t) - 10, 0, 0, 0),
    'arm-right': (-55 * s(t) - 10, 0, 0, 0),
    'torso': (-12, 0, 7 * s(t), 0.022 * abs(s(t))),
    'head': (10, 0, -5 * s(t), 0),
})
# Scrubbing: the right arm reaches out and scrubs in circles, the body sways with it.
animate('interact-right', 0.6, lambda t: {
    'arm-right': (-75 + 14 * s(t), 12 * math.cos(2 * math.pi * t), 0, 0),
    'arm-left': (-8, 8, 0, 0),
    'torso': (-6, 0, 5 * s(t), 0.004 * s(t, 2)),
    'head': (6, 0, -6 * s(t), 0),
})
# Pick-up: bend down, reach, and back up (played once).
animate('pick-up', 0.7, lambda t: {
    'torso': (-40 * math.sin(math.pi * t), 0, 0, -0.03 * math.sin(math.pi * t)),
    'arm-left': (-55 * math.sin(math.pi * t), 0, 0, 0),
    'arm-right': (-55 * math.sin(math.pi * t), 0, 0, 0),
    'head': (15 * math.sin(math.pi * t), 0, 0, 0),
    'leg-left': (18 * math.sin(math.pi * t), 0, 0, 0),
    'leg-right': (18 * math.sin(math.pi * t), 0, 0, 0),
})

toy = kit.toy_material('toy')
meshes = [obj for obj in everyone if obj.type == 'MESH']
for obj in meshes:
    kit.use_material(obj, toy)
print('triangles', kit.triangles(meshes), 'height', round(max((obj.matrix_world @ v.co).z for obj in meshes for v in obj.data.vertices), 3))

bpy.ops.object.select_all(action='DESELECT')
for obj in everyone:
    obj.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=sys.argv[1] if len(sys.argv) > 1 else 'character-hero.glb',
    export_format='GLB',
    use_selection=True,
    export_yup=True,
    export_texcoords=False,
    export_materials='EXPORT',
    export_animations=True,
    export_animation_mode='NLA_TRACKS',
    export_force_sampling=True,
)

if len(sys.argv) > 2:
    # The preview: walking, a quarter of the way through a step.
    for obj in everyone:
        for track in obj.animation_data.nla_tracks:
            track.mute = track.name != 'walk'
    bpy.context.scene.frame_set(7)
    print(kit.preview(sys.argv[2], look_at=(0, 0, 0.42), distance=2.4, size=(960, 960), ground='#d9d2c4', angles=((0, -1, 0.35), (0.9, -0.6, 0.35))))
