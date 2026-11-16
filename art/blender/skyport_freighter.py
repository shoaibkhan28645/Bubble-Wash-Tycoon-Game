"""Skyport International (Chapter 4, Part D): the freighter that uses the cargo stand.

It is the wide-body (art/blender/skyport_wide.py) without its cabin windows and with a big main-deck cargo
door on its left, hinged along its top; the jet's script draws it when run from here (WIDE and FREIGHT set).
See its notes for the moving parts.

Usage: python art/blender/skyport_freighter.py <out.glb> [preview.png]
"""
import runpy
from pathlib import Path

runpy.run_path(str(Path(__file__).with_name('skyport_jet.py')), init_globals={'WIDE': True, 'FREIGHT': True}, run_name='__main__')
