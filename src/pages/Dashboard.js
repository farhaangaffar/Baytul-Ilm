import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { appNavigate } from '../components/BackToExit';
import Layout from '../components/Layout';
import GettingStarted from '../components/GettingStarted';
import { LoadingState, ErrorState } from '../components/DataState';
import { getDuFees, getStudents, getClasses, getFees, getAttendance, getWeekDates, getSpecialDays, getCurrentSchoolMonth, currentSchoolYear, formatDateGB, formatDayMonthGB, getTerms } from '../lib/store';
import { feeFrequency, currentFeePeriod, periodStarted } from '../lib/feePeriods';
import { money } from '../lib/branding';
import { useAuth } from '../lib/AuthContext';

function isoToday() { return new Date().toISOString().split('T')[0]; }

export default function Dashboard() {
  const navigate = useNavigate();
  const { isDarulUloom } = useAuth();
  const [du, setDu] = useState(null); // a Darul Uloom's fee totals for the year (src/pages/DuFees.js)
  const [weekAnchor, setWeekAnchor] = useState(isoToday());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [year, setYear] = useState('');
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [fees, setFees] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [terms, setTerms] = useState([]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const y = await currentSchoolYear();
      const [studentsData, classesData, feesData, attendanceData, termsData] = await Promise.all([
        getStudents(), getClasses(), isDarulUloom ? Promise.resolve([]) : getFees(y), getAttendance(y),
        feeFrequency() === 'termly' ? getTerms(y) : Promise.resolve([]),
        getSpecialDays().catch(() => null), // so this week's chart includes any extra days (e.g. a Ramadhaan Saturday)
      ]);
      if (isDarulUloom) {
        const d = await getDuFees().catch(() => null);
        const sum = k => (d ? d.students.reduce((t, s) => t + s[k], 0) : 0);
        setDu({ expected: sum('expected'), paid: sum('paid'), overdue: sum('overdue'), year: d?.year || '' });
      }
      setYear(y); setStudents(studentsData); setClasses(classesData); setFees(feesData); setAttendance(attendanceData); setTerms(termsData);
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  }, [isDarulUloom]);

  useEffect(() => { load(); }, [load]);

  const schoolMonth = getCurrentSchoolMonth();
  const weekDates = getWeekDates(weekAnchor);

  if (loading) return <Layout title="Dashboard"><LoadingState /></Layout>;
  if (error) return <Layout title="Dashboard"><ErrorState error={error} onRetry={load} /></Layout>;

  const active = students.filter(s => s.status === 'Active');

  // ── This week's attendance (the school days in Settings, every class) ──
  const dailyCounts = weekDates.map(date => ({
    date,
    P: active.filter(s => attendance[s.id]?.[date] === 'P').length,
    L: active.filter(s => attendance[s.id]?.[date] === 'L').length,
    A: active.filter(s => attendance[s.id]?.[date] === 'A').length,
  }));
  const weekPresent = dailyCounts.reduce((s, d) => s + d.P, 0);
  const weekLate = dailyCounts.reduce((s, d) => s + d.L, 0);
  const weekAbsent = dailyCounts.reduce((s, d) => s + d.A, 0);
  const weekMarked = weekPresent + weekLate + weekAbsent;
  const weekAttPct = weekMarked ? Math.round(((weekPresent + weekLate) / weekMarked) * 100) : 0;
  const weekLabel = `${formatDayMonthGB(weekDates[0])} – ${formatDayMonthGB(weekDates[weekDates.length - 1])}`;
  // ── The whole academic year so far (the cards on top; the charts below show this week / this month) ──
  let yearPL = 0, yearMarked = 0;
  for (const days of Object.values(attendance)) {
    for (const st of Object.values(days)) {
      if (st === 'P' || st === 'L') { yearPL++; yearMarked++; } else if (st === 'A') yearMarked++;
    }
  }
  const yearAttPct = yearMarked ? Math.round((yearPL / yearMarked) * 100) : 0;
  const yearOutstanding = du ? du.overdue : fees.filter(f => f.status !== 'Paid' && periodStarted(f)).reduce((s, f) => s + Number(f.amount), 0);
  function shiftWeek(dir) {
    const d = new Date(weekDates[0]+'T12:00:00'); d.setDate(d.getDate() + dir*7);
    setWeekAnchor(d.toISOString().split('T')[0]);
  }

  // ── This period's fees: the school month (weekly), calendar month (monthly) or
  // current term (termly), per Settings → fee frequency ──
  const frequency = feeFrequency();
  // Weekly fees are grouped by school month, so their period is a month too.
  const unit = frequency === 'termly' ? 'term' : 'month';
  const feePeriod = currentFeePeriod(frequency, terms) || { start: '9999-12-31', endExclusive: '9999-12-31', label: 'no term dates set' };
  const monthFees = fees.filter(f => f.weekStarting >= feePeriod.start && f.weekStarting < feePeriod.endExclusive);
  const monthCollected = monthFees.filter(f => f.status === 'Paid').reduce((s, f) => s + Number(f.amount), 0);
  const monthOutstanding = monthFees.filter(f => f.status !== 'Paid').reduce((s, f) => s + Number(f.amount), 0);
  const monthBilled = monthCollected + monthOutstanding;
  const monthCollectedPct = monthBilled ? Math.round((monthCollected / monthBilled) * 100) : 0;

  const dateStr = `${new Date().toLocaleDateString('en-GB', { weekday: 'long' })} ${formatDateGB(new Date())}`;

  const yMax = Math.max(5, Math.ceil(active.length / 5) * 5);
  const yTicks = [yMax, yMax*0.75, yMax*0.5, yMax*0.25, 0];

  return (
    <Layout title="Dashboard" subtitle={`Overview · ${year}`}>
      <GettingStarted students={students} classes={classes} onChanged={load} />
      <div className="card hero">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,flexWrap:'wrap'}}>
          <div>
            <div className="hero-arabic">السلام عليكم</div>
            <div className="hero-greeting">Assalamu Alaikum</div>
            <div className="hero-sub">{dateStr} · {schoolMonth.label}</div>
          </div>
        </div>
      </div>

      {(() => {
        // Children sent in through the online application form that the head hasn't opened yet.
        const fresh = students.filter(s => s.appliedNew).length;
        return fresh > 0 && (
          <div className="card line-row on" role="button" tabIndex={0} style={{marginBottom:14,cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center'}}
            onClick={()=>appNavigate(navigate, '/students?view=waiting')}>
            <span style={{fontWeight:600}}>{fresh} new application{fresh===1?'':'s'} online</span>
            <span style={{fontSize:13}}>Waiting list →</span>
          </div>
        );
      })()}

      <div className="stat-grid-v2">
        <div className="stat-card-v2">
          <div className="n">{active.length}</div>
          <div className="l">Students</div>
          <div className="view-all" style={{color:'var(--blue)',cursor:'pointer'}} onClick={()=>appNavigate(navigate, '/students')}>View all →</div>
        </div>
        <div className="stat-card-v2">
          <div className="n">{classes.length}</div>
          <div className="l">Classes</div>
          <div className="view-all" style={{color:'var(--green-text)',cursor:'pointer'}} onClick={()=>appNavigate(navigate, '/classes')}>View all →</div>
        </div>
        <div className="stat-card-v2">
          <div className="n">{yearAttPct}%</div>
          <div className="l">Attendance this year</div>
          <div className="view-all" style={{color:'var(--green-text)',cursor:'pointer'}} onClick={()=>appNavigate(navigate, '/attendance')}>View all →</div>
        </div>
        <div className="stat-card-v2">
          <div className="n">{money(yearOutstanding)}</div>
          <div className="l">{du ? 'Fees overdue' : 'Outstanding this year'}</div>
          <div className="view-all" style={{color:'var(--blue)',cursor:'pointer'}} onClick={()=>appNavigate(navigate, '/fees')}>View all →</div>
        </div>
      </div>

      <div className="ring-row">
        <div className="card ring-card">
          <div className="card-title">Attendance — this week</div>
          <div className="card-sub">Present or late, all classes</div>
          <div className="ring-wrap">
            <div className="ring" style={{background:`conic-gradient(var(--green) 0% ${weekAttPct}%, var(--red) ${weekAttPct}% 100%)`}}/>
            <div className="ring-inner"><div className="n">{weekAttPct}%</div><div className="l">Present/Late</div></div>
          </div>
          <div className="ring-breakdown">
            <span><span className="dot" style={{background:'var(--green)'}}/>Present: {weekPresent}</span>
            <span><span className="dot" style={{background:'var(--amber)'}}/>Late: {weekLate}</span>
            <span><span className="dot" style={{background:'var(--red)'}}/>Absent: {weekAbsent}</span>
          </div>
        </div>

        {du ? (
        <div className="card ring-card">
          <div className="card-title">Fees — {du.year ? `20${du.year.slice(0, 2)}–${du.year.slice(3)}` : 'this year'}</div>
          <div className="card-sub">{money(du.expected)} for the year</div>
          <div className="ring-wrap">
            <div className="ring" style={{background:`conic-gradient(var(--blue) 0% ${du.expected ? Math.round(du.paid / du.expected * 100) : 0}%, #eef0f4 ${du.expected ? Math.round(du.paid / du.expected * 100) : 0}% 100%)`}}/>
            <div className="ring-inner"><div className="n">{du.expected ? Math.round(du.paid / du.expected * 100) : 0}%</div><div className="l">Paid</div></div>
          </div>
          <div className="ring-breakdown">
            <span><span className="dot" style={{background:'var(--blue)'}}/>Paid: {money(du.paid)}</span>
            <span><span className="dot" style={{background:'var(--red)'}}/>Overdue: {money(du.overdue)}</span>
          </div>
        </div>
        ) : (
        <div className="card ring-card">
          <div className="card-title">Fees — {feePeriod.label}</div>
          <div className="card-sub">{money(monthBilled)} due this {unit}</div>
          <div className="ring-wrap">
            <div className="ring" style={{background:`conic-gradient(var(--blue) 0% ${monthCollectedPct}%, #eef0f4 ${monthCollectedPct}% 100%)`}}/>
            <div className="ring-inner"><div className="n">{monthCollectedPct}%</div><div className="l">Collected</div></div>
          </div>
          <div className="ring-breakdown">
            <span><span className="dot" style={{background:'var(--blue)'}}/>Collected: {money(monthCollected)}</span>
            <span><span className="dot" style={{background:'var(--text-soft)'}}/>Outstanding: {money(monthOutstanding)}</span>
          </div>
        </div>
        )}
      </div>

      <div className="card">
        <div className="card-header" style={{marginBottom:16}}>
          <div>
            <div className="card-title">Daily attendance</div>
            <div className="card-sub" style={{marginBottom:0}}>Present / late / absent per day, all classes</div>
          </div>
          <div className="nav-arrow-row">
            <button className="nav-arrow-btn" onClick={()=>shiftWeek(-1)}>‹</button>
            <span>{weekLabel}</span>
            <button className="nav-arrow-btn" onClick={()=>shiftWeek(1)}>›</button>
          </div>
        </div>

        <div className="axis-chart">
          <div className="axis-yaxis">{yTicks.map(t=><span key={t}>{Math.round(t)}</span>)}</div>
          <div className="axis-plot">
            <div className="axis-grid"><div/><div/><div/><div/><div/></div>
            <div className="axis-bars">
              {dailyCounts.map(dc=>(
                <div className="stack-bar-wrap" key={dc.date}>
                  {/* Only pieces with something in them, so the top one gets the rounded corners. */}
                  {[[dc.P,'var(--green)'],[dc.L,'var(--amber)'],[dc.A,'var(--red)']].filter(([n])=>n>0).map(([n,bg])=>(
                    <div key={bg} className="stack-seg" style={{height:`${(n/yMax)*100}%`, background:bg}}/>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="axis-xaxis">
          {weekDates.map(d=><span key={d}>{new Date(d+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short'})}</span>)}
        </div>
        <div className="chart-legend">
          <div className="chart-legend-item"><span className="chart-legend-dot" style={{background:'var(--green)'}}/>Present</div>
          <div className="chart-legend-item"><span className="chart-legend-dot" style={{background:'var(--amber)'}}/>Late</div>
          <div className="chart-legend-item"><span className="chart-legend-dot" style={{background:'var(--red)'}}/>Absent</div>
        </div>
      </div>

    </Layout>
  );
}
