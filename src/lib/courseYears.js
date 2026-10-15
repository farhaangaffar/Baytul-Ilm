// A Darul Uloom's Aalim years (Aalim course page, Classes & Teachers): where a new year most likely
// goes, from its name — "1st year" / "Year 3" / "second year" → that place; anything else → last.
const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
export function guessPlace(name, count) {
  const n = String(name || '').toLowerCase();
  const m = n.match(/^\s*(\d+)\s*(st|nd|rd|th)?\b/) || n.match(/\byear\s*(\d+)/);
  const word = ORDINALS.findIndex(w => new RegExp(`\\b${w}\\b`).test(n));
  const at = m ? Number(m[1]) : word >= 0 ? word + 1 : null;
  if (at) return Math.max(1, Math.min(at, count + 1));
  return count + 1;
}
