"""TEMPLATE: the ice-cream kiosk. Replace this with what the building is:
its shape, its colours, and which parts the game moves (give those their
own object and origin, like the dryer's fan).

Usage: python art/blender/<business>.py <out.glb> [preview.png]
Customers come from +Y and leave at -Y (towards the camera).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import kit  # noqa: E402

kit.reset()
parts = []

# Counter: a rounded white box with a striped awning over it.
parts.append(kit.box((2.4, 1.2, 1.0), (0, 0, 0.5), 'white', bevel=0.08))
parts.append(kit.box((2.6, 1.4, 0.12), (0, 0, 1.06), 'pink', bevel=0.04))
for i, col in enumerate(('pink', 'white', 'pink', 'white', 'pink')):
    parts.append(kit.box((0.52, 1.5, 0.08), (-1.04 + i * 0.52, -0.1, 2.3), col, bevel=0.02, rot=(0.2, 0, 0)))
# Two posts holding the awning up.
for x in (-1.1, 1.1):
    parts.append(kit.cylinder(0.05, 1.3, (x, 0.5, 1.7), 'steel', verts=8))
# A giant cone on the roof, so it reads from far away.
parts.append(kit.cone(0.05, 0.3, 0.7, (0, 0.2, 2.75), 'yellow', verts=12))
parts.append(kit.sphere(0.32, (0, 0.2, 3.2), 'mint', segments=12))

kiosk = kit.join(parts, 'kiosk_body')
kit.use_material(kiosk, kit.toy_material('toy'))
print('triangles', kit.triangles([kiosk]))
kit.export([kiosk], sys.argv[1] if len(sys.argv) > 1 else 'kiosk.glb')
if len(sys.argv) > 2:
    print(kit.preview(sys.argv[2], look_at=(0, 0, 1.4), distance=9, angles=((0, -1, 1.0),)))
