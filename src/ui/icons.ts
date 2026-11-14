// The game's own icons, drawn in the Bubble Pop style (chunky shapes, a dark teal outline, candy
// fills), in place of the system's emoji wherever the interface itself speaks: the HUD, the side
// buttons, menus' headers and tabs, prices. Each is a 24×24 SVG as markup.

/** The outline every icon is drawn with (the theme's ink, base.css --ink). */
const INK = '#0e5f73';
const o = `stroke="${INK}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"`;

const SHAPES = {
  cash: `<g transform="rotate(-14 12 12)"><rect x="2.5" y="6" width="19" height="11.5" rx="2.4" fill="#3fb865" ${o}/></g><rect x="2" y="7.5" width="20" height="11.5" rx="2.4" fill="#6fd98a" ${o}/><rect x="4.3" y="9.6" width="15.4" height="7.3" rx="1.4" fill="none" stroke="#2f9e57" stroke-width="1.2"/><circle cx="12" cy="13.25" r="2.6" fill="#d9f8df" stroke="#2f9e57" stroke-width="1.2"/><circle cx="6.6" cy="13.25" r="0.95" fill="#2f9e57"/><circle cx="17.4" cy="13.25" r="0.95" fill="#2f9e57"/>`,
  gem: `<path d="M6 3.5h12l4 5.5-10 12-10-12z" fill="#5ad8ff" ${o}/><path d="M2 9h20M9 3.5L12 21l3-17.5" fill="none" stroke="${INK}" stroke-width="1.1"/><path d="M6.5 4.5L4 8.5h4z" fill="#c8f4ff"/>`,
  star: `<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" fill="#ffc21a" ${o}/>`,
  gift: `<rect x="3" y="10" width="18" height="11" rx="2" fill="#ff5fa8" ${o}/><rect x="2" y="7" width="20" height="4.5" rx="1.5" fill="#ff8fc8" ${o}/><path d="M12 7v14" stroke="#ffd24a" stroke-width="3"/><path d="M12 7c-2-4-6-4-6-1.6S10 7 12 7c2 0 6 .8 6-1.6S14 3 12 7z" fill="#ffd24a" stroke="${INK}" stroke-width="1.2"/>`,
  bag: `<path d="M4.5 8h15l-1.2 13H5.7z" fill="#7ee0c3" ${o}/><path d="M9 8V6.5a3 3 0 016 0V8" fill="none" stroke="${INK}" stroke-width="1.8"/><path d="M12 11.6l1.1 2.3 2.5.3-1.8 1.8.4 2.5-2.2-1.2-2.2 1.2.4-2.5-1.8-1.8 2.5-.3z" fill="#ffd24a"/>`,
  bolt: `<path d="M13.5 2L4 14h7l-2 8 9.5-12.5h-7z" fill="#ffd24a" ${o}/>`,
  crown: `<path d="M3.5 18.5h17l1.5-11-5 4L12 4.5 7 11.5l-5-4z" fill="#ffd24a" ${o}/><circle cx="12" cy="14.5" r="1.6" fill="#ff5fa8"/>`,
  bottle: `<rect x="6.5" y="9" width="11" height="12.5" rx="3" fill="#7ee0c3" ${o}/><path d="M10 9V5.5h4V9" fill="#ffffff" ${o}/><path d="M14 4h4v2.4" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="15.5" r="2.2" fill="#ffffff"/>`,
  crane: `<path d="M6 21V4h2.5v17z" fill="#ffd24a" ${o}/><path d="M3 21h9" stroke="${INK}" stroke-width="2" stroke-linecap="round"/><path d="M5 6h16l-3-3H8.5" fill="#ff8a3d" ${o}/><path d="M17.5 6v5" stroke="${INK}" stroke-width="1.4"/><rect x="15" y="11" width="5" height="4" rx="1" fill="#ff5fa8" ${o}/>`,
  cone: `<path d="M9.5 4h5l4 14h-13z" fill="#ff8a3d" ${o}/><path d="M8.6 9.5h6.8M7.4 14h9.2" stroke="#ffffff" stroke-width="2.2"/><rect x="3" y="18" width="18" height="3.5" rx="1.5" fill="#ff8a3d" ${o}/>`,
  wrench: `<path d="M20.5 6.5a5 5 0 01-6.8 5.6L6 19.8a2 2 0 01-2.8-2.8l7.7-7.7A5 5 0 0117.5 3.5l-3 3 .6 2.4 2.4.6z" fill="#c9d2dc" ${o}/>`,
  teddy: `<circle cx="6.5" cy="6" r="3" fill="#c9a27a" ${o}/><circle cx="17.5" cy="6" r="3" fill="#c9a27a" ${o}/><circle cx="12" cy="12.5" r="8" fill="#d9b48a" ${o}/><ellipse cx="12" cy="15" rx="3.4" ry="2.6" fill="#f2dcc0"/><circle cx="9" cy="10.5" r="1.1" fill="${INK}"/><circle cx="15" cy="10.5" r="1.1" fill="${INK}"/><circle cx="12" cy="14" r="1" fill="${INK}"/>`,
  clipboard: `<rect x="5" y="4" width="14" height="18" rx="2.5" fill="#ffffff" ${o}/><rect x="9" y="2" width="6" height="4" rx="1.2" fill="#ff5fa8" stroke="${INK}" stroke-width="1.2"/><path d="M8 11.5l2 2 4.5-4.5M8 17.5h8" fill="none" stroke="#22c3c9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  flag: `<path d="M5 21.5V3" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/><path d="M6 4h13l-3.2 4 3.2 4H6z" fill="#ffd24a" ${o}/>`,
  lock: `<path d="M8 11V8a4 4 0 018 0v3" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/><rect x="5" y="11" width="14" height="10" rx="3" fill="#ffd24a" ${o}/><circle cx="12" cy="16" r="1.8" fill="${INK}"/>`,
  tv: `<rect x="2.5" y="6" width="19" height="13" rx="3" fill="#ffffff" ${o}/><path d="M8 3l4 3 4-3" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/><path d="M10 9.5v6l5.5-3z" fill="#ff5fa8" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>`,
  map: `<path d="M3 6l6-2.5 6 2.5 6-2.5v15L15 21l-6-2.5L3 21z" fill="#bfeecb" ${o}/><path d="M9 3.5v15M15 6v15" stroke="${INK}" stroke-width="1.2"/><circle cx="16.5" cy="11" r="2.2" fill="#ff5fa8" stroke="${INK}" stroke-width="1.1"/>`,
  close: `<path d="M6 6l12 12M18 6L6 18" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>`,
  check: `<path d="M4.5 12.5l5 5 10-11" fill="none" stroke="#ffffff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  down: `<path d="M9 3h6v9h5l-8 9.5L4 12h5z" fill="#ff5fa8" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>`,
  shirt: `<path d="M8 3l4 3 4-3 5 3-2 5-2-1v11H7V10l-2 1-2-5z" fill="#2c62d6" ${o}/><path d="M10.4 5l1.6 4.5L13.6 5 12 6z" fill="#ff5fa8"/>`,
  hat: `<rect x="7" y="3" width="10" height="13" rx="1.5" fill="#1f2026" stroke="${INK}" stroke-width="1.4"/><rect x="2.5" y="15" width="19" height="4" rx="2" fill="#1f2026" stroke="${INK}" stroke-width="1.4"/><rect x="7" y="11.5" width="10" height="2.5" fill="#ff5fa8"/>`,
  sparkle: `<path d="M10 3l1.6 4.4L16 9l-4.4 1.6L10 15l-1.6-4.4L4 9l4.4-1.6z" fill="#ffd24a" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/><path d="M18 13l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="#ff5fa8" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>`,
  palette: `<path d="M12 3a9 9 0 100 18c1.5 0 2-1.2 1.4-2.3-.7-1.3.2-2.7 1.6-2.7H18a3 3 0 003-3c0-5.5-4-10-9-10z" fill="#ffe9c4" ${o}/><circle cx="8" cy="9" r="1.7" fill="#ff5fa8"/><circle cx="12" cy="7" r="1.7" fill="#22c3c9"/><circle cx="16" cy="9" r="1.7" fill="#ffd24a"/><circle cx="7.5" cy="13.5" r="1.7" fill="#2c62d6"/>`,
  flower: `<path d="M12 13v9" stroke="#3f9a45" stroke-width="2" stroke-linecap="round"/><path d="M12 18c-3 0-5-2-5-4 3 0 5 1.5 5 4z" fill="#5fb84f" stroke="${INK}" stroke-width="1.1"/><circle cx="12" cy="5.5" r="2.6" fill="#ff8fc8" stroke="${INK}" stroke-width="1.2"/><circle cx="8.5" cy="9" r="2.6" fill="#ff8fc8" stroke="${INK}" stroke-width="1.2"/><circle cx="15.5" cy="9" r="2.6" fill="#ff8fc8" stroke="${INK}" stroke-width="1.2"/><circle cx="12" cy="9" r="2" fill="#ffd24a"/>`,
  book: `<path d="M3 5.5c3-1.5 6-1.5 9 0v14c-3-1.5-6-1.5-9 0z" fill="#ffffff" ${o}/><path d="M21 5.5c-3-1.5-6-1.5-9 0v14c3-1.5 6-1.5 9 0z" fill="#ffe9c4" ${o}/><path d="M6 9h3M6 12h3M15 9h3M15 12h3" stroke="#22c3c9" stroke-width="1.6" stroke-linecap="round"/>`,
  medal: `<path d="M8 2l4 7 4-7" fill="none" stroke="#ff5fa8" stroke-width="3" stroke-linejoin="round"/><circle cx="12" cy="15" r="6.5" fill="#ffd24a" ${o}/><path d="M12 11.5l1.1 2.2 2.4.3-1.8 1.7.5 2.4-2.2-1.2-2.2 1.2.5-2.4-1.8-1.7 2.4-.3z" fill="#ffffff"/>`,
  cashpile: `<rect x="3" y="15" width="18" height="6.5" rx="1.8" fill="#3fb865" ${o}/><rect x="3.6" y="10.5" width="16.8" height="5.6" rx="1.6" fill="#6fd98a" ${o}/><rect x="9.6" y="10" width="4.8" height="6.6" fill="#ffd24a" stroke="${INK}" stroke-width="1.2"/><g transform="rotate(-10 12 7)"><rect x="4.5" y="3.5" width="15" height="7.5" rx="1.6" fill="#8be6a0" ${o}/><circle cx="12" cy="7.25" r="1.9" fill="#d9f8df" stroke="#2f9e57" stroke-width="1.1"/></g><path d="M5 18.3h14" stroke="#2f9e57" stroke-width="1.1"/>`,
  trophy: `<path d="M7 6H3.5c0 4 1.5 6 4.5 6.5M17 6h3.5c0 4-1.5 6-4.5 6.5" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/><path d="M6.5 3h11v6.5a5.5 5.5 0 01-11 0z" fill="#ffd24a" ${o}/><path d="M12 15v3.5" stroke="${INK}" stroke-width="2.4"/><rect x="7" y="18" width="10" height="3.5" rx="1.4" fill="#ff5fa8" ${o}/><path d="M9.5 5.5v3.5" stroke="#fff3c4" stroke-width="1.6" stroke-linecap="round"/>`,
  clock: `<circle cx="12" cy="13" r="8.5" fill="#ffffff" ${o}/><path d="M12 8.5V13l3 2" fill="none" stroke="#ff5fa8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 2.5h4" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`,
} as const;

export type IconName = keyof typeof SHAPES;

/** An icon as SVG markup, `size` CSS pixels square. */
export function icon(name: IconName, size = 24): string {
  return `<svg class="ic" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${SHAPES[name]}</svg>`;
}

/** The emoji the game's text uses for things there's a drawn icon for. */
const EMOJI: Record<string, IconName> = {
  '🎁': 'gift',
  '📋': 'clipboard',
  '⚡': 'bolt',
  '👑': 'crown',
  '🧴': 'bottle',
  '🏗️': 'crane',
  '🚧': 'cone',
  '🔧': 'wrench',
  '🧸': 'teddy',
  '🛍️': 'bag',
  '🏁': 'flag',
  '💎': 'gem',
  '⭐': 'star',
  '🌟': 'star',
  '🗺️': 'map',
  '📺': 'tv',
  '🔒': 'lock',
  '📖': 'book',
  '🏅': 'medal',
  '💰': 'cashpile',
  '💵': 'cash',
  '🏆': 'trophy',
  '⏱': 'clock',
};

/** The drawn icon for an emoji, if there is one. */
export function iconFor(emoji: string, size = 24): string | null {
  const name = EMOJI[emoji];
  return name ? icon(name, size) : null;
}

const KNOWN = new RegExp(
  Object.keys(EMOJI)
    .sort((a, b) => b.length - a.length)
    .join('|'),
  'g',
);
const escape = (text: string): string => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Text as markup, with each emoji there's a drawn icon for swapped for it (sized to the text). Everything
 * else is escaped, so names from data are safe to pass.
 */
export function rich(text: string): string {
  let out = '';
  let from = 0;
  for (const match of text.matchAll(KNOWN)) {
    out += escape(text.slice(from, match.index)) + `<svg class="ic ic-inline" viewBox="0 0 24 24" aria-hidden="true">${SHAPES[EMOJI[match[0]]!]}</svg>`;
    from = match.index + match[0].length;
  }
  return out + escape(text.slice(from));
}

/** Sets an element's words, with drawn icons in place of the emoji they stand for. */
export function setRich(el: HTMLElement, text: string): void {
  el.innerHTML = rich(text);
}
