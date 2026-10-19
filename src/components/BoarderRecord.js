import React, { useState, useEffect } from 'react';
import BoxRow from './BoxRow';
import { getBoarderRecord, niceDate } from '../lib/store';

// A Darul Uloom boarder's profile (Students): their room, where they are now, each trip home as a row of
// boxes, and the last few times they were unwell or given medicine (written on the Boarding page).

// One trip home, as boxes: why and who collected · when they left · when they came back. Also on the
// Boarding page's record of a boarder.
export function TripBoxes({ trip }) {
  return (
    <BoxRow columns="repeat(3, minmax(0, 1fr))" cells={[
      { text: trip.reason || 'Out', sub: trip.collectedBy || '—', label: true, wrap: 'words' },
      { text: trip.outAt ? niceDate(trip.outAt.slice(0, 10)) : '—', sub: trip.outAt ? `Left ${trip.outAt.slice(11, 16)}` : 'Left' },
      trip.backAt
        ? { text: niceDate(trip.backAt.slice(0, 10)), sub: `Back ${trip.backAt.slice(11, 16)}`, tone: 'green' }
        : { text: 'Not back yet', sub: trip.backDue ? `Due ${niceDate(trip.backDue)}` : '', tone: 'amber' },
    ]} />
  );
}

export default function BoarderRecord({ studentId }) {
  const [r, setR] = useState(null);
  useEffect(() => { getBoarderRecord(studentId).then(setR).catch(() => setR(null)); }, [studentId]);
  if (!r) return null;
  const out = r.leaves.find(l => !l.backAt);
  return (
    <div>
      <div className="form-section-title" style={{ margin: '4px 0 8px' }}>Boarding</div>
      <BoxRow columns="repeat(2, minmax(0, 1fr))" cells={[
        { text: r.room || 'No room yet', sub: 'Room', label: true, wrap: 'words' },
        out ? { text: 'Home now', sub: out.backDue ? `Back ${niceDate(out.backDue)}` : 'Signed out', tone: 'amber' } : { text: 'Here', sub: 'In the madrasah', tone: 'green' },
      ]} />
      {r.leaves.length > 0 && <div className="form-section-title" style={{ margin: '10px 0 6px', fontSize: 11 }}>Comings and goings</div>}
      {r.leaves.slice(0, 6).map(t => <TripBoxes key={t.id} trip={t} />)}
      {r.health.length > 0 && <div className="form-section-title" style={{ margin: '10px 0 6px', fontSize: 11 }}>Unwell &amp; medicine</div>}
      {r.health.slice(0, 5).map(h => (
        <BoxRow key={h.id} columns="minmax(0, 1fr) minmax(0, 2fr)" cells={[
          { text: niceDate(h.at.slice(0, 10)), sub: h.at.slice(11, 16), label: true },
          { text: h.kind === 'medicine' ? `${h.medicine}${h.dose ? ` ${h.dose}` : ''}` : 'Unwell', sub: [h.note, h.by].filter(Boolean).join(' · '), wrap: 'words' },
        ]} />
      ))}
    </div>
  );
}
