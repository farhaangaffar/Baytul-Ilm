import React, { useState, useEffect } from 'react';
import BoxRow from './BoxRow';
import { getBoarderRecord, niceDate } from '../lib/store';

// A Darul Uloom boarder's profile (Students): their room, when they last went home, and the last
// few times they were unwell or given medicine (written on the Boarding page).
const when = v => (v ? `${niceDate(v.slice(0, 10))}, ${v.slice(11, 16)}` : '');

export default function BoarderRecord({ studentId }) {
  const [r, setR] = useState(null);
  useEffect(() => { getBoarderRecord(studentId).then(setR).catch(() => setR(null)); }, [studentId]);
  if (!r) return null;
  const last = r.leaves[0];
  return (
    <div>
      <div className="form-section-title" style={{ margin: '4px 0 8px' }}>Boarding</div>
      <BoxRow columns="repeat(2, minmax(0, 1fr))" cells={[
        { text: r.room || 'No room yet', sub: 'Room', label: true },
        last ? (last.backAt ? { text: when(last.outAt).split(',')[0], sub: 'Last went home', label: true } : { text: 'Home now', sub: last.backDue ? `Back ${niceDate(last.backDue)}` : 'Signed out', tone: 'amber' })
          : { text: '—', sub: 'Last went home', label: true },
      ]} />
      {r.health.slice(0, 5).map(h => (
        <div key={h.id} className="bd-detail" style={{ marginTop: 6, fontSize: 12.5 }}>
          <strong>{when(h.at)}</strong> · {h.kind === 'medicine' ? `${h.medicine}${h.dose ? ` ${h.dose}` : ''}${h.note ? ` — ${h.note}` : ''}` : h.note}
          <span className="text-muted"> · {h.by}</span>
        </div>
      ))}
    </div>
  );
}
