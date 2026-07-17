import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { LoadingState, ErrorState } from '../components/DataState';
import { getStudents, getClassNames, getAcademicYears, currentSchoolYear, getAttendance, getFees, getSchoolMonthRange } from '../lib/store';
import { CheckSquare, Coins } from 'lucide-react';

// Same first-Monday school-month convention used everywhere else (Attendance/Fees month
// navigation) — Sept through Aug of the given "YY-YY" year, so these numbers never
// disagree with what's shown on those pages.
function monthsOfYear(yearLabel) {
  const startYear = 2000 + Number(yearLabel.slice(0, 2));
  const months = [];
  for (let i = 0; i < 12; i++) {
    const totalMonth = 8 + i; // 0-indexed, September = 8
    const y = startYear + Math.floor(totalMonth / 12);
    const m0 = totalMonth % 12;
    const ym = `${y}-${String(m0 + 1).padStart(2, '0')}`;
    const { start, endExclusive } = getSchoolMonthRange(ym);
    months.push({ ym, start, endExclusive, label: new Date(y, m0, 1).toLocaleDateString('en-GB', { month: 'short' }) });
  }
  return months;
}

function attendanceStatsForRange(attendance, studentIds, start, endExclusive) {
  let P = 0, L = 0, A = 0;
  for (const sid of studentIds) {
    const byDate = attendance[sid] || {};
    for (const [date, status] of Object.entries(byDate)) {
      if (date >= start && date < endExclusive) {
        if (status === 'P') P++; else if (status === 'L') L++; else if (status === 'A') A++;
      }
    }
  }
  const total = P + L + A;
  return { P, L, A, total, pct: total ? Math.round(((P + L) / total) * 100) : 0 };
}

function feeStatsForRange(fees, start, endExclusive) {
  const inRange = fees.filter(f => f.weekStarting >= start && f.weekStarting < endExclusive);
  const billed = inRange.reduce((s, f) => s + Number(f.amount), 0);
  const collected = inRange.filter(f => f.status === 'Paid').reduce((s, f) => s + Number(f.amount), 0);
  return { billed, collected, outstanding: billed - collected };
}

export default function Stats() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('attendance');
  const [students, setStudents] = useState([]);
  const [classNames, setClassNames] = useState([]);
  const [years, setYears] = useState([]);
  const [year, setYear] = useState('');
  const [dataByYear, setDataByYear] = useState({});

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const currentYear = await currentSchoolYear();
      const [studentsData, classNamesData, yearsData] = await Promise.all([getStudents(), getClassNames(), getAcademicYears()]);
      const entries = await Promise.all(yearsData.map(async y => {
        const [attendance, fees] = await Promise.all([getAttendance(y), getFees(y)]);
        return [y, { attendance, fees }];
      }));
      setStudents(studentsData); setClassNames(classNamesData); setYears(yearsData);
      setYear(currentYear); setDataByYear(Object.fromEntries(entries));
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Layout title="Stats"><LoadingState /></Layout>;
  if (error) return <Layout title="Stats"><ErrorState error={error} onRetry={load} /></Layout>;

  const { attendance, fees } = dataByYear[year] || { attendance: {}, fees: [] };
  const months = monthsOfYear(year);
  const allStudentIds = Object.keys(attendance);

  return (
    <Layout title="Stats" subtitle={`Academic year ${year}`}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button className={`btn ${tab === 'attendance' ? 'btn-primary' : ''}`} onClick={() => setTab('attendance')}>
          <CheckSquare size={14} /> Attendance
        </button>
        <button className={`btn ${tab === 'fees' ? 'btn-primary' : ''}`} onClick={() => setTab('fees')}>
          <Coins size={14} /> Fees
        </button>
      </div>
      <div className="pill-tabs">
        {years.map(y => (
          <button key={y} className={`pill-tab ${year === y ? 'year-active' : ''}`} onClick={() => setYear(y)}>{y}</button>
        ))}
      </div>

      {tab === 'attendance'
        ? <AttendanceStats months={months} attendance={attendance} allStudentIds={allStudentIds} students={students} classNames={classNames} years={years} dataByYear={dataByYear} />
        : <FeesStats months={months} fees={fees} students={students} classNames={classNames} years={years} dataByYear={dataByYear} />}
    </Layout>
  );
}

function AttendanceStats({ months, attendance, allStudentIds, students, classNames, years, dataByYear }) {
  const yearRange = attendanceStatsForRange(attendance, allStudentIds, months[0].start, months[11].endExclusive);
  const monthly = months.map(m => ({ ...m, ...attendanceStatsForRange(attendance, allStudentIds, m.start, m.endExclusive) }));
  const yMax = Math.max(5, ...monthly.map(m => m.P + m.L + m.A));

  const classRows = classNames.map(c => {
    const ids = students.filter(s => s.class === c).map(s => s.id);
    return { name: c, ...attendanceStatsForRange(attendance, ids, months[0].start, months[11].endExclusive) };
  });

  const yearRows = years.map(y => {
    const d = dataByYear[y] || { attendance: {} };
    const ids = Object.keys(d.attendance);
    const ms = monthsOfYear(y);
    return { year: y, ...attendanceStatsForRange(d.attendance, ids, ms[0].start, ms[11].endExclusive) };
  });
  const avgPct = yearRows.length ? Math.round(yearRows.reduce((s, r) => s + r.pct, 0) / yearRows.length) : 0;

  return (
    <>
      <div className="stat-grid-v2">
        <div className="stat-card-v2"><div className="n">{yearRange.pct}%</div><div className="l">Attendance this year</div></div>
        <div className="stat-card-v2"><div className="n" style={{ color: 'var(--green-text)' }}>{yearRange.P}</div><div className="l">Present (year)</div></div>
        <div className="stat-card-v2"><div className="n" style={{ color: 'var(--amber-text)' }}>{yearRange.L}</div><div className="l">Late (year)</div></div>
        <div className="stat-card-v2"><div className="n" style={{ color: 'var(--red-text)' }}>{yearRange.A}</div><div className="l">Absent (year)</div></div>
      </div>

      <div className="card">
        <div className="card-header" style={{ marginBottom: 16 }}>
          <div>
            <div className="card-title">Attendance trend</div>
            <div className="card-sub" style={{ marginBottom: 0 }}>Present / late / absent by month, both classes</div>
          </div>
        </div>
        <div className="axis-chart-scroll">
          <div className="axis-chart-scroll-inner">
            <div className="axis-chart">
              <div className="axis-yaxis">{[yMax, yMax * 0.75, yMax * 0.5, yMax * 0.25, 0].map(t => <span key={t}>{Math.round(t)}</span>)}</div>
              <div className="axis-plot">
                <div className="axis-grid"><div /><div /><div /><div /><div /></div>
                <div className="axis-bars">
                  {monthly.map(m => (
                    <div className="stack-bar-wrap" key={m.ym}>
                      <div className="stack-seg" style={{ height: `${(m.P / yMax) * 100}%`, background: 'var(--green)' }} />
                      <div className="stack-seg" style={{ height: `${(m.L / yMax) * 100}%`, background: 'var(--amber)' }} />
                      <div className="stack-seg" style={{ height: `${(m.A / yMax) * 100}%`, background: 'var(--red)' }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="axis-xaxis">{months.map(m => <span key={m.ym}>{m.label}</span>)}</div>
          </div>
        </div>
        <div className="chart-legend">
          <div className="chart-legend-item"><span className="chart-legend-dot" style={{ background: 'var(--green)' }} />Present</div>
          <div className="chart-legend-item"><span className="chart-legend-dot" style={{ background: 'var(--amber)' }} />Late</div>
          <div className="chart-legend-item"><span className="chart-legend-dot" style={{ background: 'var(--red)' }} />Absent</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 12 }}>Attendance by month</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Month</th><th>Present</th><th>Late</th><th>Absent</th><th>%</th></tr></thead>
            <tbody>
              {monthly.map(m => (
                <tr key={m.ym}>
                  <td style={{ fontWeight: 500 }}>{m.label}</td>
                  <td className="text-muted">{m.P}</td>
                  <td className="text-muted">{m.L}</td>
                  <td className="text-muted">{m.A}</td>
                  <td style={{ fontWeight: 600 }}>{m.total ? `${m.pct}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 12 }}>Class comparison</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Class</th><th>Present</th><th>Late</th><th>Absent</th><th>%</th></tr></thead>
            <tbody>
              {classRows.map(r => (
                <tr key={r.name}>
                  <td style={{ fontWeight: 500 }}>{r.name}</td>
                  <td className="text-muted">{r.P}</td>
                  <td className="text-muted">{r.L}</td>
                  <td className="text-muted">{r.A}</td>
                  <td style={{ fontWeight: 600 }}>{r.total ? `${r.pct}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 12 }}>Year over year</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Year</th><th>Present</th><th>Late</th><th>Absent</th><th>%</th></tr></thead>
            <tbody>
              {yearRows.map(r => (
                <tr key={r.year}>
                  <td style={{ fontWeight: 500 }}>{r.year}</td>
                  <td className="text-muted">{r.P}</td>
                  <td className="text-muted">{r.L}</td>
                  <td className="text-muted">{r.A}</td>
                  <td style={{ fontWeight: 600 }}>{r.total ? `${r.pct}%` : '—'}</td>
                </tr>
              ))}
              <tr>
                <td style={{ fontWeight: 600 }}>Average</td>
                <td></td><td></td><td></td>
                <td style={{ fontWeight: 700 }}>{avgPct}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function FeesStats({ months, fees, students, classNames, years, dataByYear }) {
  const yearRange = feeStatsForRange(fees, months[0].start, months[11].endExclusive);
  const monthly = months.map(m => ({ ...m, ...feeStatsForRange(fees, m.start, m.endExclusive) }));
  const yMax = Math.max(10, ...monthly.map(m => m.billed));

  const classRows = classNames.map(c => {
    const ids = new Set(students.filter(s => s.class === c).map(s => s.id));
    const classFees = fees.filter(f => ids.has(f.studentId) && f.weekStarting >= months[0].start && f.weekStarting < months[11].endExclusive);
    const billed = classFees.reduce((s, f) => s + Number(f.amount), 0);
    const collected = classFees.filter(f => f.status === 'Paid').reduce((s, f) => s + Number(f.amount), 0);
    return { name: c, billed, collected, outstanding: billed - collected };
  });

  const yearRows = years.map(y => {
    const d = dataByYear[y] || { fees: [] };
    const ms = monthsOfYear(y);
    return { year: y, ...feeStatsForRange(d.fees, ms[0].start, ms[11].endExclusive) };
  });
  const avgCollected = yearRows.length ? yearRows.reduce((s, r) => s + r.collected, 0) / yearRows.length : 0;
  const avgOutstanding = yearRows.length ? yearRows.reduce((s, r) => s + r.outstanding, 0) / yearRows.length : 0;

  return (
    <>
      <div className="stat-grid-v2">
        <div className="stat-card-v2"><div className="n">£{yearRange.billed.toFixed(2)}</div><div className="l">Billed this year</div></div>
        <div className="stat-card-v2"><div className="n" style={{ color: 'var(--green-text)' }}>£{yearRange.collected.toFixed(2)}</div><div className="l">Collected this year</div></div>
        <div className="stat-card-v2"><div className="n" style={{ color: 'var(--red-text)' }}>£{yearRange.outstanding.toFixed(2)}</div><div className="l">Outstanding this year</div></div>
        <div className="stat-card-v2"><div className="n">{yearRange.billed ? Math.round((yearRange.collected / yearRange.billed) * 100) : 0}%</div><div className="l">Collected rate</div></div>
      </div>

      <div className="card">
        <div className="card-header" style={{ marginBottom: 16 }}>
          <div>
            <div className="card-title">Fee collection trend</div>
            <div className="card-sub" style={{ marginBottom: 0 }}>Collected vs outstanding by month, both classes</div>
          </div>
        </div>
        <div className="axis-chart-scroll">
          <div className="axis-chart-scroll-inner">
            <div className="axis-chart">
              <div className="axis-yaxis">{[yMax, yMax * 0.75, yMax * 0.5, yMax * 0.25, 0].map(t => <span key={t}>£{Math.round(t)}</span>)}</div>
              <div className="axis-plot">
                <div className="axis-grid"><div /><div /><div /><div /><div /></div>
                <div className="axis-bars">
                  {monthly.map(m => (
                    <div className="stack-bar-wrap" key={m.ym}>
                      <div className="stack-seg" style={{ height: `${(m.collected / yMax) * 100}%`, background: 'var(--blue)' }} />
                      <div className="stack-seg" style={{ height: `${(m.outstanding / yMax) * 100}%`, background: '#eef0f4' }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="axis-xaxis">{months.map(m => <span key={m.ym}>{m.label}</span>)}</div>
          </div>
        </div>
        <div className="chart-legend">
          <div className="chart-legend-item"><span className="chart-legend-dot" style={{ background: 'var(--blue)' }} />Collected</div>
          <div className="chart-legend-item"><span className="chart-legend-dot" style={{ background: '#eef0f4', border: '1px solid #dfe3ea' }} />Outstanding</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 12 }}>Fees by month</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Month</th><th>Billed</th><th>Collected</th><th>Outstanding</th></tr></thead>
            <tbody>
              {monthly.map(m => (
                <tr key={m.ym}>
                  <td style={{ fontWeight: 500 }}>{m.label}</td>
                  <td className="text-muted">£{m.billed.toFixed(2)}</td>
                  <td className="text-muted">£{m.collected.toFixed(2)}</td>
                  <td style={{ fontWeight: 600 }}>£{m.outstanding.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 12 }}>Class comparison</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Class</th><th>Billed</th><th>Collected</th><th>Outstanding</th></tr></thead>
            <tbody>
              {classRows.map(r => (
                <tr key={r.name}>
                  <td style={{ fontWeight: 500 }}>{r.name}</td>
                  <td className="text-muted">£{r.billed.toFixed(2)}</td>
                  <td className="text-muted">£{r.collected.toFixed(2)}</td>
                  <td style={{ fontWeight: 600 }}>£{r.outstanding.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 12 }}>Year over year</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Year</th><th>Billed</th><th>Collected</th><th>Outstanding</th></tr></thead>
            <tbody>
              {yearRows.map(r => (
                <tr key={r.year}>
                  <td style={{ fontWeight: 500 }}>{r.year}</td>
                  <td className="text-muted">£{r.billed.toFixed(2)}</td>
                  <td className="text-muted">£{r.collected.toFixed(2)}</td>
                  <td style={{ fontWeight: 600 }}>£{r.outstanding.toFixed(2)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ fontWeight: 600 }}>Average</td>
                <td></td>
                <td style={{ fontWeight: 700 }}>£{avgCollected.toFixed(2)}</td>
                <td style={{ fontWeight: 700 }}>£{avgOutstanding.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
