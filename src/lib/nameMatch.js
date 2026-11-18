// Finding a pupil from a name on a school's spreadsheet, when it isn't written exactly as on Suhuf. Spreadsheets shorten
// and spell names their own way: "M Husayn Al-Mawlawi" (Muhammad Husayn Al-Mawlawi), "Mahdiyah Kareem" (Karim),
// "Sabir Abukar" (Sabir Mohamed Abukar). Exact first (capitals, spaces and punctuation ignored); then a close match —
// the same first name (or its initial), the same last surname, and every other word on the sheet found in the pupil's
// name — spellings boiled down (ee = i, oo = u, aa = a, h at the end dropped). Only a match to exactly one pupil counts.

const exactKey = (first, last) => `${first} ${last}`.toLowerCase().replace(/[^a-z]/g, '');
const loose = w => w.toLowerCase().replace(/[^a-z]/g, '')
  .replace(/ee/g, 'i').replace(/ii/g, 'i').replace(/oo/g, 'u').replace(/uu/g, 'u').replace(/aa/g, 'a')
  .replace(/ou/g, 'u').replace(/y/g, 'i').replace(/h$/, '');
const words = s => String(s || '').split(/[\s\-']+/).map(loose).filter(Boolean);
const same = (a, b) => a === b || (a.length === 1 && b[0] === a) || (b.length === 1 && a[0] === b);

export function pupilFinder(pupils) {
  const exact = {};
  pupils.forEach(p => { const k = exactKey(p.forename, p.surname); (exact[k] = exact[k] || []).push(p); });
  const people = pupils.map(p => ({ p, first: words(p.forename), last: words(p.surname) }));
  const found = new Map();
  // → { pupil, close } (close = matched by a near spelling, to show the head) or null.
  return (first, last) => {
    const key = `${first}|${last}`;
    if (found.has(key)) return found.get(key);
    let out = null;
    const hit = exact[exactKey(first, last)];
    if (hit?.length === 1) out = { pupil: hit[0], close: false };
    else if (!hit) {
      const f = words(first), l = words(last);
      if (f.length && l.length) {
        const cands = people.filter(({ first: pf, last: pl }) => {
          if (!pf.length || !pl.length || !same(f[0], pf[0]) || l[l.length - 1] !== pl[pl.length - 1]) return false;
          const all = [...pf, ...pl];
          return [...f.slice(1), ...l.slice(0, -1)].every(w => all.some(x => same(w, x)));
        });
        if (cands.length === 1) out = { pupil: cands[0].p, close: true };
      }
    }
    found.set(key, out);
    return out;
  };
}
