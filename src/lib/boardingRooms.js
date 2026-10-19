// How a Darul Uloom's boarding rooms are named and ordered (the Boarding page). Each madrasah lays them out
// its own way: a wing / block / section / dorm (it picks the word), a level, then the room's number or name.
// Short letters or numbers get their word in front — "A" → "Block A", "1" → "Level 1", "12" → "Room 12";
// anything longer ("East wing", "Ground floor") is shown as written. server/routes/boarding.js does the same.
export const BLOCK_WORDS = ['Wing', 'Block', 'Section', 'Dorm'];
const short = s => /^[A-Za-z0-9-]{1,4}$/.test(s);
export const blockLabel = (block, word = 'Block') => (!block ? '' : short(block) ? `${word} ${block}` : block);
export const levelLabel = level => (!level ? '' : short(level) ? `Level ${level}` : level);
export const roomLabel = name => (short(name) ? `Room ${name}` : name);
export const floorLabel = (r, word) => [blockLabel(r.block, word), levelLabel(r.level)].filter(Boolean).join(' · ');
export const fullRoom = (r, word) => [floorLabel(r, word), roomLabel(r.name)].filter(Boolean).join(' · ');

const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
// Ground (or basement) floors before Level 1.
const levelKey = l => (/^(basement|lower)/i.test(l) ? '-2' : /^(g|ground|0)\b/i.test(l) ? '-1' : l);
const byLevel = (a, b) => natural(levelKey(a), levelKey(b));

// Blocks in order, each with its levels in order, each with its rooms in order:
// [{ block, levels: [{ level, rooms: [...] }] }]
export function layout(rooms) {
  const blocks = [...new Set(rooms.map(r => r.block))].sort(natural);
  return blocks.map(block => {
    const inBlock = rooms.filter(r => r.block === block);
    const levels = [...new Set(inBlock.map(r => r.level))].sort(byLevel);
    return { block, levels: levels.map(level => ({ level, rooms: inBlock.filter(r => r.level === level).sort((a, b) => natural(a.name, b.name)) })) };
  });
}
// Every floor (a block's level) in order — the night register's and Sign out's groups.
export const floors = rooms => layout(rooms).flatMap(b => b.levels.map(l => ({ block: b.block, level: l.level, rooms: l.rooms })));
// The next room number after the last one written ("12" → "13", "A3" → "A4"), else ''.
export function nextRoomName(name) {
  const m = /^(.*?)(\d+)$/.exec(String(name || '').trim());
  return m ? `${m[1]}${Number(m[2]) + 1}` : '';
}
