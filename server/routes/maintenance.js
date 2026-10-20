const { query } = require('../db');
const { requireAuth, isOwner, whoName } = require('../auth');

// A Darul Uloom's maintenance list (the Maintenance page, src/pages/Maintenance.js): things to fix around
// the school. The head adds them (what, where, urgent or not, a note); the head and the staff ticked
// Maintenance (teachers.maintenance_duty, on Classes & Staff) see the list, and either can mark a job done
// with a note — who did it and when is kept. A maktab gets 403. No photos (database space).
//
// GET                               → { head, jobs, places }  (every open job; done jobs from the last year)
// POST ?action=job {id?, what, place, urgent, note}        (head)  → add or change a job
// POST ?action=done {id, note}                                     → mark it done
// POST ?action=reopen {id}                                 (head)  → back on the list
// DELETE ?id=                                              (head)

let ready = false;
async function ensure() {
  if (ready) return;
  await require('./teachers').ensure(); // teachers.maintenance_duty
  await query(`CREATE TABLE IF NOT EXISTS du_maintenance (
    id          BIGSERIAL PRIMARY KEY,
    madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
    what        TEXT NOT NULL,
    place       TEXT NOT NULL DEFAULT '',
    urgent      BOOLEAN NOT NULL DEFAULT false,
    note        TEXT NOT NULL DEFAULT '',
    added_by    TEXT NOT NULL DEFAULT '',
    added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    done_at     TIMESTAMPTZ,
    done_by     TEXT NOT NULL DEFAULT '',
    done_note   TEXT NOT NULL DEFAULT ''
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_du_maintenance_madrasah ON du_maintenance (madrasah_id)');
  ready = true;
}

async function access(req) {
  const mid = req.user.madrasahId;
  const { rows: [m] } = await query('SELECT kind FROM madaaris WHERE id = $1', [mid]);
  if (m?.kind !== 'darul_uloom') return false;
  if (isOwner(req)) return true;
  if (!req.user.teacherId) return false;
  const { rows } = await query('SELECT maintenance_duty FROM teachers WHERE id = $1 AND madrasah_id = $2', [req.user.teacherId, mid]);
  return !!rows[0]?.maintenance_duty;
}

const str = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const COLS = `id::text AS id, what, place, urgent, note, added_by AS "addedBy", added_at AS "addedAt",
              done_at AS "doneAt", done_by AS "doneBy", done_note AS "doneNote"`;

const handler = requireAuth(async (req, res) => {
  await ensure();
  if (!(await access(req))) { res.status(403).json({ error: "You don't have access to this." }); return; }
  const mid = req.user.madrasahId;
  const head = isOwner(req);
  const action = req.query.action || '';
  const headOnly = () => { if (!head) res.status(403).json({ error: 'Only the head can change this.' }); return !head; };

  if (req.method === 'GET') {
    const [jobs, places] = await Promise.all([
      query(`SELECT ${COLS} FROM du_maintenance WHERE madrasah_id = $1 AND (done_at IS NULL OR done_at > now() - interval '1 year')
             ORDER BY done_at IS NOT NULL, urgent DESC, added_at`, [mid]),
      query(`SELECT place FROM du_maintenance WHERE madrasah_id = $1 AND place <> '' GROUP BY place ORDER BY max(added_at) DESC LIMIT 12`, [mid]),
    ]);
    res.status(200).json({ head, jobs: jobs.rows, places: places.rows.map(p => p.place) });
    return;
  }

  if (req.method === 'POST' && action === 'job') {
    if (headOnly()) return;
    const b = req.body || {};
    const what = str(b.what, 200), place = str(b.place, 80), note = str(b.note, 1000), urgent = !!b.urgent;
    if (!what) { res.status(400).json({ error: 'Write what needs fixing.' }); return; }
    if (b.id) {
      const { rowCount } = await query('UPDATE du_maintenance SET what = $1, place = $2, urgent = $3, note = $4 WHERE id = $5 AND madrasah_id = $6',
        [what, place, urgent, note, b.id, mid]);
      if (!rowCount) { res.status(404).json({ error: 'Job not found.' }); return; }
    } else {
      await query('INSERT INTO du_maintenance (madrasah_id, what, place, urgent, note, added_by) VALUES ($1,$2,$3,$4,$5,$6)',
        [mid, what, place, urgent, note, await whoName(req.user)]);
    }
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'POST' && action === 'done') {
    const b = req.body || {};
    const { rowCount } = await query('UPDATE du_maintenance SET done_at = now(), done_by = $1, done_note = $2 WHERE id = $3 AND madrasah_id = $4 AND done_at IS NULL',
      [await whoName(req.user), str(b.note, 1000), b.id, mid]);
    if (!rowCount) { res.status(404).json({ error: 'Job not found, or already done.' }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'POST' && action === 'reopen') {
    if (headOnly()) return;
    const { rowCount } = await query("UPDATE du_maintenance SET done_at = NULL, done_by = '', done_note = '' WHERE id = $1 AND madrasah_id = $2", [(req.body || {}).id, mid]);
    if (!rowCount) { res.status(404).json({ error: 'Job not found.' }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'DELETE') {
    if (headOnly()) return;
    await query('DELETE FROM du_maintenance WHERE id = $1 AND madrasah_id = $2', [req.query.id, mid]);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}, { teacher: true });

module.exports = handler;
module.exports.ensure = ensure;
