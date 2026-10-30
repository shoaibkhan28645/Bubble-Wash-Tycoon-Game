"""Who's who: every person's look (see people.py). Staff wear the car
wash's team colours (a white polo with aqua trim and the bubble badge, or
their role's own kit); townspeople wear their own clothes.

FILES says which people go together in one glb (each under 512 KiB): the
staff come with the game, the townspeople load later.
"""
AQUA = '#22c3c9'
NAVY = '#2f3e66'
WHITE = '#f6f8fb'
RUBBER = '#ffc928'
DARK = '#2b2d33'

BASE = {
    'build': 'male', 'skin': '#e9a77a', 'lashes': False,
    'hair': 'short', 'hair_colour': '#5b3320', 'fringe': None, 'accent': None,
    'beard': False, 'glasses': None, 'cap': None,
    'top': 'tee', 'top_colour': WHITE, 'trim': None, 'badge': False, 'vest': None, 'apron': None, 'tie': None,
    'bottoms': 'trousers', 'bottoms_colour': NAVY, 'belt': None, 'socks': None,
    'shoes': 'sneakers', 'shoe_colour': WHITE, 'sole': '#d5dbe3',
    'gloves': None, 'gear': False,
}


def look(**kw):
    unknown = set(kw) - set(BASE)
    if unknown:
        raise KeyError(f'unknown look keys: {unknown}')
    return {**BASE, **kw}


def staff(**kw):
    """The team uniform: white polo, aqua collar and trim, the bubble badge, navy trousers."""
    return look(**{'top': 'polo', 'top_colour': WHITE, 'trim': AQUA, 'badge': True, 'belt': DARK, **kw})


HERO = look(skin='#e9a77a', hair='quiff', hair_colour='#5b3320', fringe='side',
            top='polo', top_colour=AQUA, trim=WHITE, badge=True, belt='#33363f',
            shoes='boots', shoe_colour=RUBBER, sole='#3a3f4a', gloves=RUBBER, gear=True)

FEMALE = {'build': 'female', 'lashes': True}

LOOKS = {
    # The staff, one per role (src/data/characters.json).
    'washer': staff(skin='#8d5a3b', hair='buzz', hair_colour='#1f1a17', cap=AQUA, shoes='boots', shoe_colour=RUBBER, sole='#3a3f4a', gloves=RUBBER),
    'runner': staff(**FEMALE, skin='#f1c3a0', hair='ponytail', hair_colour='#b5532d', accent=AQUA, bottoms='shorts', socks=WHITE,
                    shoe_colour=AQUA, sole=WHITE),
    'dryer': staff(**FEMALE, skin='#6b4129', hair='curly', hair_colour='#1d1715', shoe_colour=WHITE, sole=AQUA),
    'cashier': staff(**FEMALE, skin='#d9a27c', hair='bob', hair_colour='#2a211c', fringe='bangs', top='shirt', trim=WHITE,
                     vest={'colour': NAVY}, bottoms_colour='#3a3f4a', shoes='shoes', shoe_colour=DARK, sole='#1d1d22'),
    'valet': staff(skin='#f0c09b', hair='short', hair_colour='#d9b45a', fringe='side', top='shirt', trim=WHITE, badge=False,
                   vest={'colour': '#c8343a'}, bottoms_colour='#23262d', shoes='shoes', shoe_colour=DARK, sole='#1d1d22'),
    'manager': staff(build='big', skin='#5a3825', hair='short', hair_colour='#14110f', beard=True, glasses=DARK, top='shirt',
                     top_colour='#a9d4ff', trim='#a9d4ff', badge=False, tie=NAVY, bottoms_colour='#5b6270', belt='#5a3a22',
                     shoes='shoes', shoe_colour='#5a3a22', sole='#2e2016'),
    'detailer': staff(**FEMALE, skin='#e2b08a', hair='bun', hair_colour='#3b2418', top='tee', top_colour='#3a3f4a', trim=None,
                      apron=AQUA, bottoms_colour='#23262d', sole='#8d98a7'),
    'attendant': staff(skin='#c48a62', hair='short', hair_colour='#2a1d16', cap='#ff7a1a', top='tee', top_colour='#8d98a7', trim=None,
                       badge=False, vest={'colour': '#ff7a1a', 'stripe': '#e8edf2'}, shoes='boots', shoe_colour='#3b3f47', sole='#1d1d22'),
    'clerk': look(**FEMALE, skin='#a8724f', hair='long', hair_colour='#2b1b14', top='tee', top_colour=WHITE, apron='#e3434d',
                  bottoms_colour='#3f6fb0', shoe_colour='#e3434d', sole=WHITE),
    # Townspeople: shoppers and people out walking.
    'town-a': look(**FEMALE, skin='#f3c8a8', hair='long', hair_colour='#e2b84f', top_colour='#ff8fc8', bottoms_colour='#4a78c0'),
    'town-b': look(skin='#b37650', hair='curly', hair_colour='#4a2c1c', top='hoodie', top_colour='#4cb86b', bottoms='shorts',
                   bottoms_colour='#c9b48a', socks=WHITE, shoe_colour='#3b4a5e', sole=WHITE),
    'town-c': look(build='big', skin='#f0c4a2', hair='bald', hair_colour='#c9c9c9', beard=True, glasses='#5a3a22', top='long',
                   top_colour='#9a6a43', bottoms_colour='#6d7480', shoes='shoes', shoe_colour='#5a3a22', sole='#2e2016'),
    'town-d': look(**FEMALE, skin='#5e3a26', hair='bun', hair_colour='#141010', top='long', top_colour='#9b6be0', bottoms='skirt',
                   bottoms_colour='#ffcf3a'),
    'town-e': look(skin='#e9b48c', hair='short', hair_colour='#1f1a17', cap='#e3434d', top_colour='#3f86e0', bottoms_colour='#30476f'),
    'town-f': look(**FEMALE, skin='#d39a74', hair='bob', hair_colour='#9b3b22', fringe='bangs', top='hoodie', top_colour='#c8b6ff',
                   bottoms_colour='#2b2f3a', shoe_colour='#ff8fc8', sole=WHITE),
    'town-g': look(skin='#7a4a30', hair='short', hair_colour='#1a1412', top='polo', top_colour='#ff9d3a', trim=WHITE, bottoms='shorts',
                   bottoms_colour=NAVY, socks=WHITE),
}

FILES = {
    'people-staff-a': ['washer', 'runner', 'dryer'],
    'people-staff-b': ['cashier', 'valet', 'manager'],
    'people-staff-c': ['detailer', 'attendant', 'clerk'],
    'people-town-a': ['town-a', 'town-b', 'town-c', 'town-d'],
    'people-town-b': ['town-e', 'town-f', 'town-g'],
}
