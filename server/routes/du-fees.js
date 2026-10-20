const { query, transaction } = require('../db');
const { requireAuth, whoName } = require('../auth');

// A Darul Uloom's fees (the Fees page, src/pages/DuFees.js; a maktab keeps its own fees in `fees`). Each academic year
// ('26-27', from 1 September) the head sets a yearly fee for boarders and for day students, the ways to pay it (the whole
// year, termly, monthly… each a list of due dates — the fee is split equally between them) and, if the madrasah wants
// one, a sibling discount. A child's fee is worked out from these — nothing is stored per instalment ("show, don't
// store"), so changing a price changes every child's — unless the head gives the child their own amount (a bursary) or
// another way to pay. One-off extras (books, a trip) are added to children; payments (any amount, how they paid, a
// numbered receipt) go towards the oldest money owed first. "Paid before" is what a child had paid this year before
// the madrasah started using the app (brought in with Import). Head only — a Darul Uloom's office takes fees.
//
// GET ?year=                       → { year, years, setup, students, payments, today }
// POST ?action=setup {year, boarderFee, dayFee, plans, defaultPlan, siblingOn, sibling2, sibling3}
// POST ?action=account {year, studentId, planId, ownAmount, noDiscount}
// POST ?action=charge {year, studentIds, label, amount, due}      · DELETE ?action=charge&id=
// POST ?action=payment {year, studentId, amount, paidOn, method, note} → { receipt }   · DELETE ?action=payment&id=
// POST ?action=import {year, rows: [{name, paid, fee}]}            → { matched, unmatched }

let ready = false;
async function ensure() {
  if (ready) return;
  await query(`CREATE TABLE IF NOT EXISTS du_fee_setup (
    madrasah_id  INTEGER NOT NULL REFERENCES madaaris(id),
    year         TEXT NOT NULL,
    boarder_fee  NUMERIC(10,2) NOT NULL DEFAULT 0,
    day_fee      NUMERIC(10,2) NOT NULL DEFAULT 0,
    plans        JSONB NOT NULL DEFAULT '[]',
    default_plan TEXT NOT NULL DEFAULT '',
    sibling_on   BOOLEAN NOT NULL DEFAULT false,
    sibling_2    NUMERIC(5,2) NOT NULL DEFAULT 10,
    sibling_3    NUMERIC(5,2) NOT NULL DEFAULT 15,
    PRIMARY KEY (madrasah_id, year)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS du_fee_accounts (
    madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
    year        TEXT NOT NULL,
    student_id  TEXT NOT NULL,
    plan_id     TEXT NOT NULL DEFAULT '',
    own_amount  NUMERIC(10,2),
    no_discount BOOLEAN NOT NULL DEFAULT false,
    paid_before NUMERIC(10,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (madrasah_id, year, student_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS du_fee_charges (
    id          BIGSERIAL PRIMARY KEY,
    madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
    year        TEXT NOT NULL,
    student_id  TEXT NOT NULL,
    label       TEXT NOT NULL,
    amount      NUMERIC(10,2) NOT NULL,
    due         DATE NOT NULL,
    added_by    TEXT NOT NULL DEFAULT '',
    added_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS du_fee_payments (
    id          BIGSERIAL PRIMARY KEY,
    madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
    year        TEXT NOT NULL,
    student_id  TEXT NOT NULL,
    amount      NUMERIC(10,2) NOT NULL,
    paid_on     DATE NOT NULL,
    method      TEXT NOT NULL DEFAULT '',
    note        TEXT NOT NULL DEFAULT '',
    receipt_no  INTEGER NOT NULL,
    recorded_by TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_du_fee_charges ON du_fee_charges (madrasah_id, year)');
  await query('CREATE INDEX IF NOT EXISTS idx_du_fee_payments ON du_fee_payments (madrasah_id, year)');
  ready = true;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const YEAR = /^\d{2}-\d{2}$/;
const METHODS = ['Cash', 'Bank transfer', 'Card', 'Cheque', 'Other'];
const str = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const num = v => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN; };
const ukToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
// The academic year a date is in ('26-27'), from 1 September.
const yearOf = iso => { const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7)); const s = m >= 9 ? y : y - 1; return `${String(s).slice(2)}-${String(s + 1).slice(2)}`; };
const startYear = year => 2000 + Number(year.slice(0, 2));

// The usual ways to pay, for a year that hasn't been set up: the whole year on 1 September, three terms, or ten
// months (September to June). Each madrasah changes the dates, names and how many.
function starterPlans(year) {
  const y = startYear(year), d = (yy, m, day = 1) => `${yy}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return [
    { id: 'year', name: 'Whole year', dues: [d(y, 9)] },
    { id: 'terms', name: '3 terms', dues: [d(y, 9), d(y + 1, 1), d(y + 1, 4)] },
    { id: 'months', name: '10 months', dues: [9, 10, 11, 12, 1, 2, 3, 4, 5, 6].map(m => d(m >= 9 ? y : y + 1, m)) },
  ];
}

// This year's setup — or last year's carried over (its dates moved on a year), or the usual one.
async function setupFor(mid, year, q = query) {
  const { rows: [s] } = await q('SELECT * FROM du_fee_setup WHERE madrasah_id = $1 AND year = $2', [mid, year]);
  const shape = r => ({
    year, boarderFee: Number(r.boarder_fee), dayFee: Number(r.day_fee), plans: r.plans || [], defaultPlan: r.default_plan,
    siblingOn: !!r.sibling_on, sibling2: Number(r.sibling_2), sibling3: Number(r.sibling_3),
  });
  if (s) return { ...shape(s), saved: true };
  const { rows: [prev] } = await q('SELECT * FROM du_fee_setup WHERE madrasah_id = $1 AND year < $2 ORDER BY year DESC LIMIT 1', [mid, year]);
  if (prev) {
    const gap = startYear(year) - startYear(prev.year);
    const moved = (prev.plans || []).map(p => ({ ...p, dues: p.dues.map(d => `${Number(d.slice(0, 4)) + gap}${d.slice(4)}`) }));
    return { ...shape(prev), plans: moved, saved: false };
  }
  const plans = starterPlans(year);
  return { year, boarderFee: 0, dayFee: 0, plans, defaultPlan: 'months', siblingOn: false, sibling2: 10, sibling3: 15, saved: false };
}

const phoneKey = p => { const d = String(p || '').replace(/\D/g, ''); return d.length >= 9 ? d.slice(-10) : ''; };

// Every child's fee for the year, worked out in one pass: the yearly fee (own amount, or the boarder/day price less any
// sibling discount), its instalments by their way to pay (only those due from the month they joined, and not after
// they left), extras, and what's paid — paid before + payments, put towards the oldest first. `q` lets the demo
// work it out inside its own transaction.
async function compute(mid, year, onlyStudent = null, q = query) {
  const setup = await setupFor(mid, year, q);
  const today = ukToday();
  const [studentsQ, accountsQ, chargesQ, paymentsQ, linksQ] = await Promise.all([
    q(`SELECT id, forename, surname, class, status, boarding, dob, enroll_date, leave_date, parent1_phone, parent2_phone, sort_order
           FROM students WHERE madrasah_id = $1 ORDER BY sort_order NULLS LAST, forename, surname`, [mid]),
    q('SELECT * FROM du_fee_accounts WHERE madrasah_id = $1 AND year = $2', [mid, year]),
    q(`SELECT id::text AS id, student_id, label, amount, to_char(due, 'YYYY-MM-DD') AS due, added_by FROM du_fee_charges
           WHERE madrasah_id = $1 AND year = $2 ORDER BY due, id`, [mid, year]),
    q(`SELECT id::text AS id, student_id, amount, to_char(paid_on, 'YYYY-MM-DD') AS paid_on, method, note, receipt_no, recorded_by
           FROM du_fee_payments WHERE madrasah_id = $1 AND year = $2 ORDER BY paid_on, id`, [mid, year]),
    q('SELECT ps.user_id, ps.student_id FROM parent_students ps WHERE ps.madrasah_id = $1', [mid]).catch(() => ({ rows: [] })),
  ]);
  const accounts = Object.fromEntries(accountsQ.rows.map(a => [a.student_id, a]));
  const touched = new Set([...Object.keys(accounts), ...chargesQ.rows.map(c => c.student_id), ...paymentsQ.rows.map(p => p.student_id)]);
  const yStart = `${startYear(year)}-09-01`, yEnd = `${startYear(year) + 1}-08-31`;
  const iso = v => (v ? (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)) : '');
  // On the books this year: everyone Active, plus anyone who left during the year or already has fees here.
  const kids = studentsQ.rows.filter(s => s.status === 'Active' || touched.has(s.id)
    || (s.status === 'Inactive' && iso(s.leave_date) >= yStart && iso(s.leave_date) <= yEnd));

  // Families: children who share a parent's phone number or a parent login. The eldest pays in full; the second gets
  // the second-child discount, the third and more the other.
  const parentOf = {}, union = {};
  const find = x => (union[x] === x ? x : (union[x] = find(union[x])));
  const join = (a, b) => { union[find(a)] = find(b); };
  kids.forEach(k => { union[k.id] = k.id; });
  const byPhone = {};
  kids.forEach(k => [k.parent1_phone, k.parent2_phone].map(phoneKey).filter(Boolean).forEach(p => { if (byPhone[p]) join(k.id, byPhone[p]); else byPhone[p] = k.id; }));
  linksQ.rows.forEach(l => { if (!union[l.student_id]) return; if (parentOf[l.user_id]) join(l.student_id, parentOf[l.user_id]); else parentOf[l.user_id] = l.student_id; });
  const families = {};
  kids.filter(k => k.status === 'Active').forEach(k => { (families[find(k.id)] = families[find(k.id)] || []).push(k); });
  const place = {};
  Object.values(families).forEach(list => list
    .sort((a, b) => (iso(a.dob) || '9999').localeCompare(iso(b.dob) || '9999') || a.id.localeCompare(b.id))
    .forEach((k, i) => { place[k.id] = { n: i + 1, of: list.length }; }));

  const plansById = Object.fromEntries(setup.plans.map(p => [p.id, p]));
  const out = [];
  for (const s of kids) {
    if (onlyStudent && s.id !== onlyStudent) continue;
    const acc = accounts[s.id] || {};
    const base = s.boarding === 'Boarder' ? setup.boarderFee : setup.dayFee;
    const nth = place[s.id]?.n || 1;
    const discountPct = setup.siblingOn && !acc.no_discount && acc.own_amount == null && nth > 1 ? (nth === 2 ? setup.sibling2 : setup.sibling3) : 0;
    const yearly = acc.own_amount != null ? Number(acc.own_amount) : Math.round(base * (100 - discountPct)) / 100;
    const plan = plansById[acc.plan_id] || plansById[setup.defaultPlan] || setup.plans[0] || { id: '', name: '', dues: [] };
    const dues = [...plan.dues].sort();
    const per = dues.length ? Math.floor((yearly / dues.length) * 100) / 100 : 0;
    const joined = iso(s.enroll_date), left = s.status === 'Inactive' ? iso(s.leave_date) : '';
    const items = [];
    dues.forEach((due, i) => {
      if (joined && due < `${joined.slice(0, 7)}-01` && joined > yStart) return; // joined later in the year
      if (left && due > left) return;                                           // gone by then
      const amount = i === dues.length - 1 ? Math.round((yearly - per * (dues.length - 1)) * 100) / 100 : per;
      items.push({ kind: 'instalment', label: dues.length === 1 ? 'Year fee' : `Instalment ${i + 1} of ${dues.length}`, due, amount });
    });
    chargesQ.rows.filter(c => c.student_id === s.id)
      .forEach(c => items.push({ kind: 'extra', id: c.id, label: c.label, due: c.due, amount: Number(c.amount), addedBy: c.added_by }));
    items.sort((a, b) => a.due.localeCompare(b.due) || (a.kind === 'instalment' ? -1 : 1));
    const payments = paymentsQ.rows.filter(p => p.student_id === s.id)
      .map(p => ({ id: p.id, amount: Number(p.amount), paidOn: p.paid_on, method: p.method, note: p.note, receiptNo: p.receipt_no, recordedBy: p.recorded_by }));
    const paidBefore = Number(acc.paid_before || 0);
    const paid = Math.round((paidBefore + payments.reduce((t, p) => t + p.amount, 0)) * 100) / 100;
    let left2 = paid;
    items.forEach(it => {
      const covered = Math.min(it.amount, Math.max(0, left2));
      left2 = Math.round((left2 - covered) * 100) / 100;
      it.paid = Math.round(covered * 100) / 100;
      it.status = covered >= it.amount ? 'paid' : it.due < today ? 'overdue' : it.due === today ? 'due' : covered > 0 ? 'part' : 'upcoming';
    });
    const expected = Math.round(items.reduce((t, it) => t + it.amount, 0) * 100) / 100;
    const overdue = Math.round(items.filter(it => it.due < today).reduce((t, it) => t + it.amount - it.paid, 0) * 100) / 100;
    const next = items.find(it => it.status !== 'paid' && it.due >= today);
    out.push({
      id: s.id, forename: s.forename, surname: s.surname, class: s.class, status: s.status, boarding: s.boarding || '', phone: s.parent1_phone || '',
      family: place[s.id]?.of > 1 ? { n: place[s.id].n, of: place[s.id].of } : null,
      yearly, discountPct, ownAmount: acc.own_amount != null ? Number(acc.own_amount) : null, noDiscount: !!acc.no_discount,
      planId: plan.id, planName: plan.name, paidBefore, items, payments,
      expected, paid, owed: Math.max(0, Math.round((expected - paid) * 100) / 100), overdue: Math.max(0, overdue),
      credit: Math.max(0, Math.round((paid - expected) * 100) / 100),
      nextDue: next ? { due: next.due, amount: Math.round((next.amount - next.paid) * 100) / 100, label: next.label } : null,
    });
  }
  return { setup, students: out, today };
}

async function isDu(mid) {
  const { rows } = await query('SELECT kind FROM madaaris WHERE id = $1', [mid]);
  return rows[0]?.kind === 'darul_uloom';
}

// The parent portal's part: one child's fee this year — what's paid, what's next, and their receipts.
async function forParent(mid, studentId) {
  if (!(await isDu(mid))) return null;
  await ensure();
  const year = yearOf(ukToday());
  const { setup, students } = await compute(mid, year, studentId);
  const s = students[0];
  if (!s || (!setup.saved && !s.items.length)) return null;
  const { rows: [m] } = await query('SELECT school_name AS name FROM settings WHERE madrasah_id = $1', [mid]).catch(() => ({ rows: [] }));
  return { year, madrasah: m?.name || '', expected: s.expected, paid: s.paid, owed: s.owed, overdue: s.overdue, nextDue: s.nextDue, items: s.items, payments: s.payments, planName: s.planName };
}

const handler = requireAuth(async (req, res) => {
  const mid = req.user.madrasahId;
  if (!(await isDu(mid))) { res.status(403).json({ error: 'Only for a Darul Uloom.' }); return; }
  await ensure();
  const action = req.query.action || '';
  const b = req.body || {};
  const year = YEAR.test(String(req.query.year || b.year || '')) ? String(req.query.year || b.year) : yearOf(ukToday());
  const inMadrasah = async ids => {
    const { rows } = await query('SELECT id FROM students WHERE madrasah_id = $1 AND id = ANY($2)', [mid, ids]);
    return rows.map(r => r.id);
  };

  if (req.method === 'GET') {
    const [{ setup, students, today }, years] = await Promise.all([
      compute(mid, year),
      query(`SELECT year FROM academic_years WHERE madrasah_id = $1 UNION SELECT year FROM du_fee_setup WHERE madrasah_id = $1 ORDER BY 1`, [mid]).catch(() => ({ rows: [] })),
    ]);
    res.status(200).json({ year, years: [...new Set([...years.rows.map(r => r.year), year])].sort(), setup, students, today, methods: METHODS });
    return;
  }

  if (req.method === 'POST' && action === 'setup') {
    const plans = (Array.isArray(b.plans) ? b.plans : []).slice(0, 8).map((p, i) => ({
      id: str(p.id, 20) || `p${i}`, name: str(p.name, 40) || `Way ${i + 1}`,
      dues: (Array.isArray(p.dues) ? p.dues : []).filter(d => ISO.test(String(d))).slice(0, 24).sort(),
    })).filter(p => p.dues.length);
    if (!plans.length) { res.status(400).json({ error: 'Keep at least one way to pay, with a date.' }); return; }
    const fee = v => { const n = num(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
    const pct = v => { const n = num(v); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0; };
    const defaultPlan = plans.some(p => p.id === b.defaultPlan) ? b.defaultPlan : plans[0].id;
    await query(`INSERT INTO du_fee_setup (madrasah_id, year, boarder_fee, day_fee, plans, default_plan, sibling_on, sibling_2, sibling_3)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                 ON CONFLICT (madrasah_id, year) DO UPDATE SET boarder_fee = $3, day_fee = $4, plans = $5, default_plan = $6, sibling_on = $7, sibling_2 = $8, sibling_3 = $9`,
      [mid, year, fee(b.boarderFee), fee(b.dayFee), JSON.stringify(plans), defaultPlan, !!b.siblingOn, pct(b.sibling2), pct(b.sibling3)]);
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'POST' && action === 'account') {
    const [sid] = await inMadrasah([String(b.studentId || '')]);
    if (!sid) { res.status(404).json({ error: 'Student not found.' }); return; }
    const own = b.ownAmount === null || b.ownAmount === '' || b.ownAmount === undefined ? null : num(b.ownAmount);
    if (own !== null && !(own >= 0)) { res.status(400).json({ error: 'Write the yearly fee as a number.' }); return; }
    await query(`INSERT INTO du_fee_accounts (madrasah_id, year, student_id, plan_id, own_amount, no_discount) VALUES ($1,$2,$3,$4,$5,$6)
                 ON CONFLICT (madrasah_id, year, student_id) DO UPDATE SET plan_id = $4, own_amount = $5, no_discount = $6`,
      [mid, year, sid, str(b.planId, 20), own, !!b.noDiscount]);
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'POST' && action === 'charge') {
    const ids = await inMadrasah((Array.isArray(b.studentIds) ? b.studentIds : []).map(String));
    const label = str(b.label, 80), amount = num(b.amount), due = ISO.test(String(b.due || '')) ? b.due : ukToday();
    if (!ids.length) { res.status(400).json({ error: 'Choose who it is for.' }); return; }
    if (!label) { res.status(400).json({ error: 'Say what it is for — e.g. Books.' }); return; }
    if (!(amount > 0)) { res.status(400).json({ error: 'Write the amount.' }); return; }
    const by = await whoName(req.user);
    await transaction(async c => {
      for (const id of ids) {
        await c.query('INSERT INTO du_fee_charges (madrasah_id, year, student_id, label, amount, due, added_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [mid, year, id, label, amount, due, by]);
      }
    });
    res.status(200).json({ ok: true, added: ids.length });
    return;
  }

  if (req.method === 'DELETE' && action === 'charge') {
    await query('DELETE FROM du_fee_charges WHERE id = $1 AND madrasah_id = $2', [req.query.id, mid]);
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'POST' && action === 'payment') {
    const [sid] = await inMadrasah([String(b.studentId || '')]);
    if (!sid) { res.status(404).json({ error: 'Student not found.' }); return; }
    const amount = num(b.amount);
    if (!(amount > 0)) { res.status(400).json({ error: 'Write how much was paid.' }); return; }
    const paidOn = ISO.test(String(b.paidOn || '')) && b.paidOn <= ukToday() ? b.paidOn : ukToday();
    const method = METHODS.includes(b.method) ? b.method : 'Other';
    const by = await whoName(req.user);
    // Receipt numbers run on from the madrasah's last one, every year.
    const row = await transaction(async c => {
      await c.query('SELECT pg_advisory_xact_lock($1)', [700000 + mid]);
      const { rows: [n] } = await c.query('SELECT COALESCE(max(receipt_no), 0) + 1 AS n FROM du_fee_payments WHERE madrasah_id = $1', [mid]);
      const { rows: [p] } = await c.query(`INSERT INTO du_fee_payments (madrasah_id, year, student_id, amount, paid_on, method, note, receipt_no, recorded_by)
                                           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id::text AS id, receipt_no`,
        [mid, year, sid, amount, paidOn, method, str(b.note, 300), n.n, by]);
      return p;
    });
    res.status(200).json({ ok: true, id: row.id, receiptNo: row.receipt_no });
    return;
  }

  if (req.method === 'DELETE' && action === 'payment') {
    await query('DELETE FROM du_fee_payments WHERE id = $1 AND madrasah_id = $2', [req.query.id, mid]);
    res.status(200).json({ ok: true });
    return;
  }

  // Import: each row a child's name and what they've paid so far this year (and, if given, their own yearly fee),
  // matched by name. Only "paid before" (and the own fee, when given) is written — nothing else about a child, and
  // payments recorded in the app stay as they are.
  if (req.method === 'POST' && action === 'import') {
    const rows = (Array.isArray(b.rows) ? b.rows : []).slice(0, 2000);
    const { rows: kids } = await query("SELECT id, forename, surname FROM students WHERE madrasah_id = $1 AND status <> 'Waiting'", [mid]);
    const norm = v => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const byName = {};
    kids.forEach(k => { const key = norm(`${k.forename} ${k.surname}`); (byName[key] = byName[key] || []).push(k.id); });
    const matched = [], unmatched = [];
    await transaction(async c => {
      for (const r of rows) {
        const ids = byName[norm(r.name)] || [];
        const blank = v => v === '' || v === undefined || v === null;
        const paid = blank(r.paid) ? NaN : num(r.paid), fee = blank(r.fee) ? null : num(r.fee);
        if (ids.length !== 1 || !(paid >= 0) || (fee !== null && !(fee >= 0))) { unmatched.push({ name: str(r.name, 80), why: ids.length > 1 ? 'Two children with this name' : ids.length ? 'Amount not a number' : 'Not found' }); continue; }
        await c.query(`INSERT INTO du_fee_accounts (madrasah_id, year, student_id, paid_before, own_amount) VALUES ($1,$2,$3,$4,$5)
                       ON CONFLICT (madrasah_id, year, student_id) DO UPDATE SET paid_before = $4, own_amount = COALESCE($5, du_fee_accounts.own_amount)`,
          [mid, year, ids[0], paid, fee]);
        matched.push(ids[0]);
      }
    });
    res.status(200).json({ ok: true, matched: matched.length, unmatched });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});

module.exports = handler;
module.exports.ensure = ensure;
module.exports.compute = compute;
module.exports.forParent = forParent;
module.exports.yearOf = yearOf;
