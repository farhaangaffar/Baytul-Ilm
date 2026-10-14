// A Darul Uloom exam's results for one class (routes/exams.js for staff, routes/parent.js for a
// family): each child's total, percentage, grade, position and whether they passed or must resit.
//
// A paper's pass mark is its own when it has one (e.g. Hifdh heard aloud: out of 100, pass 60), else the
// exam's pass mark scaled to that paper (e.g. 17 out of 50 → 34 out of 100).
// A child passes when every paper is passed; an absent or failed paper is a resit. Percentage and
// grade come from the papers marked so far; the position is only given once every paper is marked.

const GRADES = [[80, 'Excellent'], [65, 'Very good'], [50, 'Good']]; // then 'Satisfactory' down to the pass mark, else 'Needs improvement'

function paperPass(exam, paper) {
  if (paper.ownPass !== null && paper.ownPass !== undefined) return Number(paper.ownPass);
  return Math.round((Number(exam.passMark) / Number(exam.outOf)) * Number(paper.outOf) * 10) / 10;
}

function gradeFor(pct, passPct) {
  if (pct === null) return '';
  for (const [min, name] of GRADES) if (pct >= min) return name;
  return pct >= passPct ? 'Satisfactory' : 'Needs improvement';
}

// exam: { outOf, passMark } · papers: one class's [{ id, subject, outOf, ownPass }]
// ('Satisfactory' runs down to the pass marks of the papers marked, added up.) · students: [{ id }]
// marks: [{ paperId, studentId, mark, absent }] → { [studentId]: { total, outOf, pct, grade, result, resits, complete, position } }
function classResults(exam, papers, students, marks) {
  const byKey = new Map(marks.map(m => [`${m.paperId}|${m.studentId}`, m]));
  const out = {};
  for (const s of students) {
    let total = 0, outOf = 0, passOf = 0, done = 0;
    const resits = [];
    for (const p of papers) {
      const m = byKey.get(`${p.id}|${s.id}`);
      if (!m || (m.mark === null && !m.absent)) continue;
      done++;
      outOf += Number(p.outOf);
      passOf += paperPass(exam, p);
      if (m.absent) { resits.push(p.subject); continue; }
      total += Number(m.mark);
      if (Number(m.mark) < paperPass(exam, p)) resits.push(p.subject);
    }
    const pct = outOf ? Math.round((total / outOf) * 1000) / 10 : null;
    const complete = papers.length > 0 && done === papers.length;
    out[s.id] = {
      total, outOf, pct, grade: gradeFor(pct, outOf ? Math.round((passOf / outOf) * 100) : 0), resits, complete, marked: done, papers: papers.length,
      result: !done ? '' : !complete ? 'Not finished' : resits.length ? 'Resit' : 'Passed', position: null,
    };
  }
  // Positions among those with every paper marked — equal percentages share a place.
  const ranked = students.map(s => out[s.id]).filter(r => r.complete).sort((a, b) => b.pct - a.pct);
  ranked.forEach((r, i) => { r.position = i > 0 && ranked[i - 1].pct === r.pct ? ranked[i - 1].position : i + 1; });
  const sat = ranked.length;
  for (const r of Object.values(out)) r.of = sat;
  return out;
}

module.exports = { classResults, paperPass, gradeFor, GRADES };
