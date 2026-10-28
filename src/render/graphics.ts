/** Which of the heavier graphics features are on. */
export interface Graphics {
  /** Real sun shadows (an extra render pass and a shadow map). */
  shadows: boolean;
  /** The mud shader on cars (plain paint when off). */
  mud: boolean;
  /** The painted paved-lot texture (bare grass when off). */
  lot: boolean;
}

/**
 * All on, except what a dev URL turns off for testing on a phone, e.g.
 * `?gfx=noshadow,nomud,nolot`. Production builds ignore the URL.
 */
function read(): Graphics {
  const search = import.meta.env.DEV && typeof window !== 'undefined' ? window.location.search : '';
  const off = (new URLSearchParams(search).get('gfx') ?? '').split(',');
  return { shadows: !off.includes('noshadow'), mud: !off.includes('nomud'), lot: !off.includes('nolot') };
}

export const GRAPHICS: Graphics = read();
