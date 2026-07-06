// pages/Timetable.js
import React from 'react';
import Layout from '../components/Layout';

const DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday'];
const TIMES = ['8:00 AM', '10:00 AM', '12:00 PM', '2:00 PM', '4:00 PM'];

const schedule = [
  [
    { subject: 'Hifz — Group A', teacher: 'Ustadh Ibrahim', cls: 'tt-quran' },
    { subject: 'Hifz — Group A', teacher: 'Ustadh Ibrahim', cls: 'tt-quran' },
    { subject: 'Hifz — Group A', teacher: 'Ustadh Ibrahim', cls: 'tt-quran' },
    { subject: 'Hifz — Group A', teacher: 'Ustadh Ibrahim', cls: 'tt-quran' },
    { subject: 'Hifz — Group A', teacher: 'Ustadh Ibrahim', cls: 'tt-quran' },
  ],
  [
    { subject: 'Arabic Language', teacher: 'Ustadha Maryam', cls: 'tt-arabic' },
    null,
    { subject: 'Arabic Language', teacher: 'Ustadha Maryam', cls: 'tt-arabic' },
    null,
    { subject: 'Arabic Language', teacher: 'Ustadha Maryam', cls: 'tt-arabic' },
  ],
  [
    null,
    { subject: 'Fiqh', teacher: 'Ustadh Bilal', cls: 'tt-fiqh' },
    null,
    { subject: 'Fiqh', teacher: 'Ustadh Bilal', cls: 'tt-fiqh' },
    null,
  ],
  [
    { subject: 'Islamic Studies', teacher: 'Ustadh Bilal', cls: 'tt-islamic' },
    { subject: 'Islamic Studies', teacher: 'Ustadh Bilal', cls: 'tt-islamic' },
    { subject: 'Islamic Studies', teacher: 'Ustadh Bilal', cls: 'tt-islamic' },
    { subject: 'Nazra — Group B', teacher: 'Ustadha Maryam', cls: 'tt-quran' },
    { subject: 'Islamic Studies', teacher: 'Ustadh Bilal', cls: 'tt-islamic' },
  ],
  [
    null,
    { subject: 'Tajweed', teacher: 'Ustadha Maryam', cls: 'tt-tajweed' },
    null,
    { subject: 'Tajweed', teacher: 'Ustadha Maryam', cls: 'tt-tajweed' },
    null,
  ],
];

export default function Timetable() {
  return (
    <Layout title="Timetable" subtitle="Weekly schedule — all classes">
      <div className="card">
        <div style={{ overflowX: 'auto' }}>
          <div className="timetable-grid" style={{ minWidth: 560 }}>
            <div className="tt-head" />
            {DAYS.map(d => <div key={d} className="tt-head">{d.slice(0,3)}</div>)}
            {TIMES.map((time, ti) => (
              <React.Fragment key={time}>
                <div className="tt-time">{time}</div>
                {schedule[ti].map((cell, di) =>
                  cell ? (
                    <div key={di} className={`tt-cell ${cell.cls}`}>
                      <div className="tt-subject">{cell.subject}</div>
                      <div className="tt-teacher">{cell.teacher}</div>
                    </div>
                  ) : (
                    <div key={di} className="tt-cell tt-empty" />
                  )
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
        <div className="legend">
          {[['tt-quran','Quran / Hifz / Nazra'],['tt-arabic','Arabic language'],['tt-islamic','Islamic studies'],['tt-fiqh','Fiqh'],['tt-tajweed','Tajweed']].map(([cls, label]) => (
            <div key={cls} className="legend-item">
              <div className={`legend-dot ${cls}`} />
              {label}
            </div>
          ))}
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        {[
          { name: 'Ustadh Ibrahim', subjects: ['Hifz Group A', 'Hifz Group B'], sessions: 10 },
          { name: 'Ustadha Maryam', subjects: ['Arabic Language', 'Nazra Group B', 'Tajweed'], sessions: 9 },
          { name: 'Ustadh Bilal', subjects: ['Islamic Studies', 'Fiqh'], sessions: 8 },
        ].map(t => (
          <div key={t.name} className="card" style={{ marginBottom: 0 }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="avatar">{t.name.split(' ').map(w=>w[0]).join('')}</div>
              <div>
                <div style={{ fontWeight: 600 }}>{t.name}</div>
                <div className="text-muted text-sm">{t.sessions} sessions / week</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {t.subjects.map(s => <span key={s} className="badge badge-blue">{s}</span>)}
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
