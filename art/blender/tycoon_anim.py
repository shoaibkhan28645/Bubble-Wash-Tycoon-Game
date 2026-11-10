"""The tycoon's animations, with planted feet (see tycoon.py).

The legs are posed by two-bone IK: each gait says where each ankle is on
every frame (flat on the ground and sliding back at an even speed while the
foot carries weight, then lifted and swung forward), and the thigh and shin
turns are solved to put it there. So a foot never skids, provided the game
moves him at the gait's ground speed (the game plays each gait faster or
slower to match: playerGaits in src/data/characters.json). The body sinks
onto each landing foot and rises over it, the hips and shoulders counter-
turn, and the big head stays level, so he reads as carrying his weight.

Bone X turns, in degrees: thighs, shins and upper arms + swing back,
forearms - bend the elbow, feet + point the toe, spine and chest + lean
forward. The arms rest held out from the body: 'in' degrees bring them in.
'lift' moves the hips up, 'fwd' forward, 'sway' sideways.
"""
import math

import kit
import tycoon as m

bpy = kit.bpy
from mathutils import Matrix, Vector  # noqa: E402

FPS = 30
LT = m.HIP - m.KNEE
LS = m.KNEE - m.ANKLE
BALL = 0.06  # ankle to the ball of the foot, where the heel lifts from
PERSON_SCALE = 2  # the game shows people at twice the model's size


def smooth(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def cyc(q):
    return 2 * math.pi * q


def leg_ik(f, z, hip_f, hip_z):
    """Thigh and shin turns that put the ankle `f` ahead of the hip line at height z."""
    ahead, down = f - hip_f, hip_z - z
    d = min(math.hypot(ahead, down), LT + LS - 1e-5)
    toward = math.atan2(-ahead, down)  # + = the foot is behind the hip
    hip = math.acos(max(-1.0, min(1.0, (LT * LT + d * d - LS * LS) / (2 * LT * d))))
    knee = math.acos(max(-1.0, min(1.0, (LT * LT + LS * LS - d * d) / (2 * LT * LS))))
    return math.degrees(toward - hip), math.degrees(math.pi - knee)


class Gait:
    """A walk or run: stride (ankle travel on the ground), duty (share of the cycle a foot is down),
    seconds per cycle, swing lift, toe-off and heel-strike pitch, hip drop and bounce."""

    def __init__(self, stride, duty, seconds, lift, toe_off, heel, drop, bounce, run=False):
        self.stride, self.duty, self.seconds = stride, duty, seconds
        self.lift, self.toe_off, self.heel = lift, toe_off, heel
        self.drop, self.bounce, self.run = drop, bounce, run

    @property
    def speed(self):
        """Ground speed in the game, metres a second."""
        return self.stride / (self.duty * self.seconds) * PERSON_SCALE

    def foot(self, q):
        """(forward, height, pitch) of one ankle at phase q (0 = heel strike)."""
        half = self.stride / 2
        if q < self.duty:
            s = q / self.duty
            pitch = -self.heel * (1 - smooth(s / 0.2)) + self.toe_off * smooth((s - 0.6) / 0.4)
            f, z = half - self.stride * s, m.ANKLE
        else:
            s = (q - self.duty) / (1 - self.duty)
            pitch = self.toe_off + (-self.heel - self.toe_off) * smooth(s)
            f = -half + self.stride * (1 - math.cos(math.pi * s)) / 2
            z = m.ANKLE + self.lift * math.sin(math.pi * s ** 0.75)
        if pitch > 0:
            # The heel peels up round the ball of the foot.
            p = math.radians(pitch)
            z += BALL * math.sin(p)
            f += BALL * (1 - math.cos(p))
        return f, z, pitch

    def hips(self, t):
        """Hip height: lowest just after a foot lands (walk: the weight settles onto it) or at mid-stance (run)."""
        at = self.duty / 2 if self.run else 0.06
        return m.HIP - self.drop - self.bounce * math.cos(cyc(2 * (t - at)))


def plant(p, side, f, z, pitch, hip_f, hip_z, width=0.0):
    thigh, shin = leg_ik(f, z, hip_f, hip_z)
    sign = 1 if side == 'left' else -1
    p[f'thigh-{side}'] = (thigh, 0, -sign * width)
    p[f'shin-{side}'] = (shin, 0, 0)
    p[f'foot-{side}'] = (pitch - thigh - shin, 0, 0)


def arm(p, side, swing, elbow, inward, hand=(-8, 0, 0)):
    """An arm: swung back `swing` degrees, the elbow bent, brought `inward` from its held-out rest."""
    sign = 1 if side == 'left' else -1
    p[f'upperarm-{side}'] = (swing, 0, sign * inward)
    p[f'forearm-{side}'] = (-elbow, 0, 0)
    p[f'hand-{side}'] = (hand[0], hand[1], sign * hand[2])


def rest(name):
    """A bone's rest frame (as build_rig makes it): Y along the bone, Z towards its roll direction."""
    head, tail, _, roll = m.BONES[name]
    y = (Vector(tail) - Vector(head)).normalized()
    z = Vector(roll)
    z = (z - y * z.dot(y)).normalized()
    return Matrix((y.cross(z), y, z)).transposed()


def aim(name, direction):
    """The turns (degrees) that point a bone along `direction` (his own axes: -Y is forward, +X his left), by the shortest way."""
    frame = rest(name).to_quaternion()
    turn = (frame @ Vector((0, 1, 0))).rotation_difference(Vector(direction).normalized())
    return tuple(math.degrees(a) for a in (frame.inverted() @ turn @ frame).to_euler('XYZ'))


def gait_pose(g, arm_swing, elbow, lean, twist, inward):
    def posed(t):
        c, s = math.cos(cyc(t)), math.sin(cyc(t))
        hip_z = g.hips(t)
        p = {'lift': hip_z - m.HIP, 'sway': 0.005 * s * (0.4 if g.run else 1)}
        # The hips turn with the stride; each hip joint moves with them.
        yaw = math.radians(twist * c)
        for side, sign, offset in (('left', 1, 0.0), ('right', -1, 0.5)):
            plant(p, side, *g.foot((t + offset) % 1), -sign * m.LEG_X * math.sin(yaw), hip_z)
        for side, sign in (('left', 1), ('right', -1)):
            swing = sign * c  # + = this arm back (its leg is forward)
            arm(p, side, arm_swing * swing - (8 if g.run else 0), elbow + elbow * 0.5 * max(0.0, -swing), inward - 3 * abs(swing))
        p['hips'] = (0, twist * c, 3 * s)
        p['spine'] = (lean * 0.6, -twist * 0.8 * c, -2.5 * s)
        p['chest'] = (lean * 0.4 + 1.5 * math.cos(cyc(2 * t)), -twist * 0.9 * c, 0)
        # The head stays level and looking ahead, with a small nod as each foot lands.
        p['neck'] = (-lean * 0.5, twist * 0.5 * c, 1.5 * s)
        p['head'] = (-lean * 0.4 - 2.5 * math.cos(cyc(2 * (t - 0.08))), twist * 0.5 * c, 1 * s)
        return p
    return posed


WALK = Gait(stride=0.12, duty=0.58, seconds=0.42, lift=0.022, toe_off=24, heel=12, drop=0.016, bounce=0.005)
JOG = Gait(stride=0.15, duty=0.38, seconds=0.34, lift=0.04, toe_off=30, heel=6, drop=0.026, bounce=0.008, run=True)
SPRINT = Gait(stride=0.16, duty=0.25, seconds=0.29, lift=0.055, toe_off=36, heel=2, drop=0.032, bounce=0.01, run=True)
GAITS = {'walk': WALK, 'jog': JOG, 'sprint': SPRINT}


def idle(t):
    s, s2 = math.sin(cyc(t)), math.sin(cyc(2 * t))
    # Standing easy: the weight drifts from foot to foot, the chest breathes, the head looks about a little.
    hip_z = m.HIP - 0.006 + 0.0025 * s2
    p = {'lift': hip_z - m.HIP, 'sway': 0.006 * s}
    for side in ('left', 'right'):
        plant(p, side, 0.004, m.ANKLE, 0, 0.0, hip_z, width=3)
    p.update({
        'hips': (0, 1.5 * s, 2 * s),
        'spine': (1 + 1.5 * s2, -1 * s, -1.5 * s),
        'chest': (-2 - 2.5 * s2, -1 * s, 0),
        'neck': (1.5 * s2, 0, 0),
        'head': (1.5 * math.sin(cyc(2 * t + 0.2)), 9 * math.sin(cyc(t + 0.1)), 2 * s),
    })
    for side in ('left', 'right'):
        arm(p, side, 3 + 2 * s2, 16 + 4 * s2, 15 + 1.5 * s2, hand=(-10, 0, 6))
    return p


def scrub(t):
    c, s = math.cos(cyc(t)), math.sin(cyc(t))
    # Feet set apart, one ahead; the body rocks into each stroke.
    hip_z = m.HIP - 0.02 + 0.003 * math.sin(cyc(2 * t))
    hip_f = 0.008 * s
    p = {'lift': hip_z - m.HIP, 'fwd': hip_f, 'sway': -0.005 * c}
    plant(p, 'left', 0.03, m.ANKLE, 0, hip_f, hip_z, width=5)
    plant(p, 'right', -0.028, m.ANKLE, 0, hip_f, hip_z, width=5)
    p.update({
        'hips': (0, -8 + 4 * s, 2 * c),
        'spine': (8 + 3 * s, -5 + 6 * s, 2 * c),
        'chest': (4, -6 + 8 * s, 0),
        'neck': (-5, 4 * s, 0),
        'head': (-2, 6 * s, 0),
    })
    # The right arm reaches forward and scrubs round and round; the left hangs easy by the hip.
    p['upperarm-right'] = aim('upperarm-right', (-0.2 + 0.2 * c, -0.85, -0.34 + 0.2 * s))
    p['forearm-right'] = (-(22 - 10 * c), 0, 0)
    p['hand-right'] = (-14 + 8 * s, 0, 0)
    arm(p, 'left', 8, 24, 15, hand=(-10, 0, 8))
    return p


def pick_up(t):
    e = math.sin(math.pi * t) ** 2
    # A bend at the knees and the waist, both hands down to the ground.
    hip_z = m.HIP - 0.05 * e
    hip_f = -0.02 * e
    p = {'lift': hip_z - m.HIP, 'fwd': hip_f}
    for side in ('left', 'right'):
        plant(p, side, 0.004, m.ANKLE, 0, hip_f, hip_z, width=3 + 8 * e)
    p.update({
        'spine': (30 * e, 0, 0),
        'chest': (16 * e, 0, 0),
        'neck': (-14 * e, 0, 0),
        'head': (-12 * e, 0, 0),
    })
    for side in ('left', 'right'):
        arm(p, side, -46 * e, 14 + 14 * e, 15 + 6 * e, hand=(-18 * e, 0, 0))
    return p


# name → (seconds, pose function, ground speed in the game or None)
CLIPS = {
    'idle': (2.6, idle, None),
    'walk': (WALK.seconds, gait_pose(WALK, arm_swing=22, elbow=14, lean=3, twist=7, inward=14), WALK.speed),
    'jog': (JOG.seconds, gait_pose(JOG, arm_swing=36, elbow=52, lean=7, twist=9, inward=16), JOG.speed),
    'sprint': (SPRINT.seconds, gait_pose(SPRINT, arm_swing=48, elbow=74, lean=12, twist=11, inward=18), SPRINT.speed),
    'interact-right': (0.7, scrub, None),
    'pick-up': (0.8, pick_up, None),
}


def animate(rig):
    """Keys every clip on the rig, one NLA track each (one glTF animation each)."""
    bpy.context.scene.render.fps = FPS
    pose = rig.pose.bones
    for bone in pose:
        bone.rotation_mode = 'XYZ'
    lengths = {}
    rig.animation_data_create()
    for name, (seconds, posed, speed) in CLIPS.items():
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


def export(rig, person, path):
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    person.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format='GLB', use_selection=True, export_yup=True, export_texcoords=False,
        export_materials='EXPORT', export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
        export_def_bones=False, export_skins=True,
    )
