// How a Darul Uloom's boarding rooms are named and ordered (the Boarding page). Each madrasah lays them out
// its own way: a section (whatever it calls it — "Block A", "East Wing", "Dorm 3" — shown as typed), a level,
// then the room's number or name. A short level or room gets its word in front — "1" → "Level 1", "101" →
// "Room 101"; anything longer ("Ground floor") is shown as written. server/routes/boarding.js does the same.
const short = s => /^[A-Za-z0-9-]{1,4}$/.test(s);
export const sectionLabel = section => section || '';
export const levelLabel = level => (!level ? '' : short(level) ? `Level ${level}` : level);
export const roomLabel = name => (short(name) ? `Room ${name}` : name);
export const floorLabel = r => [sectionLabel(r.block), levelLabel(r.level)].filter(Boolean).join(' · ');
export const fullRoom = r => [floorLabel(r), roomLabel(r.name)].filter(Boolean).join(' · ');

const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
// Ground (or basement) floors before Level 1.
const levelKey = l => (/^(basement|lower)/i.test(l) ? '-2' : /^(g|ground|0)\b/i.test(l) ? '-1' : l);
const byLevel = (a, b) => natural(levelKey(a), levelKey(b));

// Sections in order, each with its levels in order, each with its rooms in order:
// [{ block, levels: [{ level, rooms: [...] }] }]   (a section is stored as `block`)
export function layout(rooms) {
  const blocks = [...new Set(rooms.map(r => r.block))].sort(natural);
  return blocks.map(block => {
    const inBlock = rooms.filter(r => r.block === block);
    const levels = [...new Set(inBlock.map(r => r.level))].sort(byLevel);
    return { block, levels: levels.map(level => ({ level, rooms: inBlock.filter(r => r.level === level).sort((a, b) => natural(a.name, b.name)) })) };
  });
}
// Every floor (a section's level) in order — the night register's and Sign out's groups.
export const floors = rooms => layout(rooms).flatMap(b => b.levels.map(l => ({ block: b.block, level: l.level, rooms: l.rooms })));
// The next room number after the last one written, keeping its zeros: "101" → "102", "001" → "002",
// "A09" → "A10"; else ''.
export function nextRoomName(name) {
  const m = /^(.*?)(\d+)$/.exec(String(name || '').trim());
  return m ? `${m[1]}${String(Number(m[2]) + 1).padStart(m[2].length, '0')}` : '';
}
