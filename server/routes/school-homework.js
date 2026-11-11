const { query, transaction } = require('../db');
const { requireAuth, isOwner, accessScope, whoName } = require('../auth');

// Setting homework (a school; teachers for their own classes, the head for any). Text only — what to do — with a due
// date, for the whole class or chosen pupils, usually on a surah, du'aa or practical (its links go with it for pupils).
//   GET ?class=NAME     the class's homework, newest first, each with who's ticked it done
//   POST {id?, className, itemId?, text, due?, studentIds?}   set or change one (studentIds: null/[] = the whole class)
//   DELETE ?id=         remove one
// A teacher changes or removes their own; the head any.
const str = (v, n) => String(v ?? '').trim().slice(0, n);
const dateOf = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);

module.exports = requireAuth(async (req, res) => {
  await require('./studies').ensure(); // is_items, is_links and the homework tables
  const mid = req.user.madrasahId;
  const { rows: [m] } = await query('SELECT kind FROM madaaris WHERE id = $1', [mid]);
  if (m?.kind !== 'school') { res.status(403).json({ error: 'This is only for a school.' }); return; }
  const scope = await accessScope(req);
  const mayClass = name => !scope.classNames || scope.classNames.includes(name);

  if (req.method === 'GET') {
    const cls = String(req.query.class || '');
    if (!mayClass(cls)) { res.status(403).json({ error: "You don't have access to this class." }); return; }
    const { rows: list } = await query(
      `SELECT h.id::text AS id, h.item_id::text AS "itemId", i.name AS "itemName", i.kind AS "itemKind", h.text, h.due, h.all_pupils AS "allPupils",
         h.set_by AS "setBy", h.set_by_user AS by, h.set_at AS "setAt",
         COALESCE((SELECT array_agg(p.student_id) FROM is_homework_pupils p WHERE p.homework_id = h.id), '{}') AS "studentIds",
         COALESCE((SELECT array_agg(d.student_id) FROM is_homework_done d WHERE d.homework_id = h.id), '{}') AS done
       FROM is_homework h JOIN classes c ON c.id = h.class_id AND c.madrasah_id = h.madrasah_id
       LEFT JOIN is_items i ON i.id = h.item_id AND i.madrasah_id = h.madrasah_id
       WHERE h.madrasah_id = $1 AND c.name = $2 ORDER BY h.set_at DESC, h.id DESC LIMIT 200`, [mid, cls]);
    res.status(200).json(list.map(({ by, ...h }) => ({ ...h, canEdit: isOwner(req) || by === req.user.id })));
    return;
  }

  if (req.method === 'POST') {
    const b = req.body || {};
    const cls = String(b.className || '');
    if (!mayClass(cls)) { res.status(403).json({ error: "You don't have access to this class." }); return; }
    const { rows: [c] } = await query('SELECT id FROM classes WHERE madrasah_id = $1 AND name = $2', [mid, cls]);
    if (!c) { res.status(404).json({ error: 'That class has been removed.' }); return; }
    const text = str(b.text, 2000);
    if (!text) { res.status(400).json({ error: 'Write what the pupils should do.' }); return; }
    let itemId = null;
    if (b.itemId) {
      const { rows: [it] } = await query('SELECT id FROM is_items WHERE id = $1 AND madrasah_id = $2', [String(b.itemId).replace(/\D/g, '') || '0', mid]);
      if (!it) { res.status(404).json({ error: 'That surah, du\'aa or practical has been removed.' }); return; }
      itemId = it.id;
    }
    const { rows: inClass } = await query(`SELECT id FROM students WHERE madrasah_id = $1 AND class = $2 AND status = 'Active'`, [mid, cls]);
    const classIds = new Set(inClass.map(r => r.id));
    const chosen = [...new Set((Array.isArray(b.studentIds) ? b.studentIds : []).map(String))];
    if (chosen.some(id => !classIds.has(id))) { res.status(403).json({ error: 'One of these pupils isn\'t in this class.' }); return; }
    const all = !chosen.length;
    const id = String(b.id || '').replace(/\D/g, '');
    if (id) {
      const { rows: [h] } = await query('SELECT set_by_user FROM is_homework WHERE id = $1 AND madrasah_id = $2 AND class_id = $3', [id, mid, c.id]);
      if (!h) { res.status(404).json({ error: 'That homework has been removed.' }); return; }
      if (!isOwner(req) && h.set_by_user !== req.user.id) { res.status(403).json({ error: 'Only the teacher who set this homework, or the head, can change it.' }); return; }
    }
    const who = await whoName(req.user);
    const saved = await transaction(async t => {
      let hid = id;
      if (id) {
        await t.query('UPDATE is_homework SET item_id = $1, text = $2, due = $3, all_pupils = $4 WHERE id = $5 AND madrasah_id = $6',
          [itemId, text, dateOf(b.due), all, id, mid]);
        await t.query('DELETE FROM is_homework_pupils WHERE homework_id = $1', [id]);
      } else {
        const { rows: [n] } = await t.query(
          `INSERT INTO is_homework (madrasah_id, class_id, item_id, text, due, all_pupils, set_by, set_by_user) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id::text AS id`,
          [mid, c.id, itemId, text, dateOf(b.due), all, who, req.user.id]);
        hid = n.id;
      }
      for (const sid of chosen) await t.query('INSERT INTO is_homework_pupils (homework_id, student_id, madrasah_id) VALUES ($1,$2,$3)', [hid, sid, mid]);
      return hid;
    });
    res.status(200).json({ ok: true, id: saved });
    return;
  }

  if (req.method === 'DELETE') {
    const id = String(req.query.id || '').replace(/\D/g, '') || '0';
    const { rows: [h] } = await query(
      `SELECT h.set_by_user, c.name FROM is_homework h JOIN classes c ON c.id = h.class_id AND c.madrasah_id = h.madrasah_id WHERE h.id = $1 AND h.madrasah_id = $2`, [id, mid]);
    if (!h) { res.status(404).json({ error: 'That homework has been removed.' }); return; }
    if (!mayClass(h.name) || (!isOwner(req) && h.set_by_user !== req.user.id)) { res.status(403).json({ error: 'Only the teacher who set this homework, or the head, can remove it.' }); return; }
    await query('DELETE FROM is_homework WHERE id = $1 AND madrasah_id = $2', [id, mid]);
    res.status(200).json({ ok: true });
    return;
  }
  res.status(405).json({ error: 'Method not allowed' });
}, { teacher: true });
