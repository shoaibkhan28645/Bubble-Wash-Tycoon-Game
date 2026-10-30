"""The people's animations (everyone shares them), with planted feet.

The legs are posed by two-bone IK: each gait says where each ankle is on
every frame (flat on the ground and sliding back at an even speed while the
foot carries weight, then lifted and swung forward), and the thigh and shin
turns are solved to put it there. So a foot never skids, provided the game
moves the person at the gait's ground speed (GAITS: the game plays each gait
faster or slower to match, see src/data/characters.json).

Bone X turns, in degrees: thighs, shins and upper arms + swing back,
forearms - bend the elbow, feet + point the toe, spine and chest + lean
forward. 'lift' moves the hips up, 'fwd' forward, 'sway' sideways.
"""
import math

import person_body as m

LT = m.HIP - m.KNEE
LS = m.KNEE - m.ANKLE
BALL = 0.055  # ankle to the ball of the foot, where the heel lifts from
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
            pitch = -self.heel * (1 - smooth(s / 0.2)) + self.toe_off * smooth((s - 0.62) / 0.38)
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
        """Hip height: lowest as a foot lands (walk) or at mid-stance (run)."""
        at = self.duty / 2 if self.run else 0.0
        return m.HIP - self.drop - self.bounce * math.cos(cyc(2 * (t - at)))


def plant(p, side, f, z, pitch, hip_f, hip_z, width=0.0):
    thigh, shin = leg_ik(f, z, hip_f, hip_z)
    sign = 1 if side == 'left' else -1
    p[f'thigh-{side}'] = (thigh, 0, -sign * width)
    p[f'shin-{side}'] = (shin, 0, 0)
    p[f'foot-{side}'] = (pitch - thigh - shin, 0, 0)


def gait_pose(g, arm_swing, elbow, lean, twist):
    def posed(t):
        c, s = math.cos(cyc(t)), math.sin(cyc(t))
        hip_z = g.hips(t)
        p = {'lift': hip_z - m.HIP, 'sway': 0.004 * s * (0.4 if g.run else 1)}
        # The hips turn with the stride; each hip joint moves with them.
        yaw = math.radians(twist * c)
        for side, sign, offset in (('left', 1, 0.0), ('right', -1, 0.5)):
            plant(p, side, *g.foot((t + offset) % 1), -sign * m.LEG_X * math.sin(yaw), hip_z)
        for side, sign in (('left', 1), ('right', -1)):
            swing = sign * c  # + = this arm back (its leg is forward)
            p[f'upperarm-{side}'] = (arm_swing * swing - (6 if g.run else 0), 0, -sign * (7 + 3 * abs(swing)))
            p[f'forearm-{side}'] = (-elbow - elbow * 0.5 * max(0.0, -swing), 0, 0)
            p[f'hand-{side}'] = (-10, 0, sign * 6)
        p['hips'] = (0, twist * c, 3 * s)
        p['spine'] = (lean * 0.6, -twist * 0.7 * c, -2 * s)
        p['chest'] = (lean * 0.4 + 2 * math.cos(cyc(2 * t)), -twist * 0.9 * c, 0)
        # The head stays level and looking ahead.
        p['neck'] = (-lean * 0.5, twist * 0.5 * c, 1 * s)
        p['head'] = (-lean * 0.4 - 2 * math.cos(cyc(2 * t)), twist * 0.5 * c, 0)
        return p
    return posed


WALK = Gait(stride=0.19, duty=0.6, seconds=0.56, lift=0.028, toe_off=26, heel=14, drop=0.02, bounce=0.005)
JOG = Gait(stride=0.19, duty=0.42, seconds=0.42, lift=0.06, toe_off=32, heel=8, drop=0.022, bounce=0.008, run=True)
SPRINT = Gait(stride=0.23, duty=0.3, seconds=0.31, lift=0.1, toe_off=40, heel=4, drop=0.032, bounce=0.011, run=True)
GAITS = {'walk': WALK, 'jog': JOG, 'sprint': SPRINT}


def idle(t):
    s, s2 = math.sin(cyc(t)), math.sin(cyc(2 * t))
    hip_z = m.HIP - 0.006 + 0.002 * s2
    p = {'lift': hip_z - m.HIP, 'sway': 0.005 * s}
    for side in ('left', 'right'):
        plant(p, side, 0.004, m.ANKLE, 0, 0.0, hip_z, width=2)
    p.update({
        'hips': (0, 2 * s, 2.5 * s),
        'spine': (1 + 1.5 * s2, -1.5 * s, -2 * s),
        'chest': (-2 - 2 * s2, -1 * s, 0),
        'neck': (1.5 * s2, 0, 0),
        'head': (2 * math.sin(cyc(2 * t + 0.2)), 16 * math.sin(cyc(t + 0.1)), 2.5 * s),
    })
    for side, sign in (('left', 1), ('right', -1)):
        p[f'upperarm-{side}'] = (2 + 2 * s2, 0, -sign * 6)
        p[f'forearm-{side}'] = (-14 - 4 * s2, 0, 0)
        p[f'hand-{side}'] = (-10, 0, sign * 8)
    return p


def scrub(t):
    c, s = math.cos(cyc(t)), math.sin(cyc(t))
    # Feet set apart, one ahead; the body rocks into each stroke.
    hip_z = m.HIP - 0.024 + 0.003 * math.sin(cyc(2 * t))
    hip_f = 0.01 * s
    p = {'lift': hip_z - m.HIP, 'fwd': hip_f, 'sway': -0.006 * c}
    plant(p, 'left', 0.05, m.ANKLE, 0, hip_f, hip_z, width=5)
    plant(p, 'right', -0.045, m.ANKLE, 0, hip_f, hip_z, width=5)
    p.update({
        'hips': (0, -8 + 4 * s, 2 * c),
        'spine': (10 + 3 * s, -5 + 6 * s, 2 * c),
        'chest': (5, -6 + 8 * s, 0),
        'neck': (-6, 4 * s, 0),
        'head': (-2, 6 * s, 0),
        # The right arm scrubs round and round; the left fist rests on the hip.
        'upperarm-right': (-62 + 16 * s, 0, 16 + 14 * c),
        'forearm-right': (-40 + 18 * c, 0, 0),
        'hand-right': (-16 + 10 * s, 0, 0),
        'upperarm-left': (12, 0, -36),
        'forearm-left': (-96, 0, 0),
        'hand-left': (-12, 0, 22),
    })
    return p


def pick_up(t):
    e = math.sin(math.pi * t) ** 2
    hip_z = m.HIP - 0.12 * e
    hip_f = -0.03 * e
    p = {'lift': hip_z - m.HIP, 'fwd': hip_f}
    for side in ('left', 'right'):
        plant(p, side, 0.004, m.ANKLE, 0, hip_f, hip_z, width=2 + 10 * e)
    p.update({
        'spine': (32 * e, 0, 0),
        'chest': (14 * e, 0, 0),
        'neck': (-12 * e, 0, 0),
        'head': (-10 * e, 0, 0),
    })
    for side, sign in (('left', 1), ('right', -1)):
        p[f'upperarm-{side}'] = (-50 * e, 0, -sign * (6 + 8 * e))
        p[f'forearm-{side}'] = (-14 - 16 * e, 0, 0)
        p[f'hand-{side}'] = (-20 * e, 0, 0)
    return p


# name → (seconds, pose function, ground speed in the game or None)
CLIPS = {
    'idle': (2.4, idle, None),
    'walk': (WALK.seconds, gait_pose(WALK, arm_swing=24, elbow=14, lean=3, twist=6), WALK.speed),
    'jog': (JOG.seconds, gait_pose(JOG, arm_swing=40, elbow=60, lean=8, twist=8), JOG.speed),
    'sprint': (SPRINT.seconds, gait_pose(SPRINT, arm_swing=55, elbow=82, lean=14, twist=10), SPRINT.speed),
    'interact-right': (0.7, scrub, None),
    'pick-up': (0.8, pick_up, None),
}
