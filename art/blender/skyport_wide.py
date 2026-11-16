"""Skyport International (Chapter 4, Part C): the wide-body that uses Gate 4.

It is the twin-engine jet (art/blender/skyport_jet.py) drawn half as big again, with a second engine further
out under each wing; that script draws it when run from here (WIDE set). See its notes for the moving parts.

Usage: python art/blender/skyport_wide.py <out.glb> [preview.png]
"""
import runpy
from pathlib import Path

runpy.run_path(str(Path(__file__).with_name('skyport_jet.py')), init_globals={'WIDE': True}, run_name='__main__')
