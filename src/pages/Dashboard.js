import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, X, Send } from 'lucide-react';
import Layout from '../components/Layout';
import { LoadingState, ErrorState } from '../components/DataState';
import { getStudents, getClasses, getFees, getAttendance, getWeekDates, getCurrentSchoolMonth, currentSchoolYear, askAi } from '../lib/store';

function isoToday() { return new Date().toISOString().split('T')[0]; }

export default function Dashboard() {
  const navigate = useNavigate();
  const [weekAnchor, setWeekAnchor] = useState(isoToday());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [year, setYear] = useState('');
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [fees, setFees] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [showAsk, setShowAsk] = useState(false);
  const [askQuestion, setAskQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState(null);
  const [askHistory, setAskHistory] = useState([]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const y = await currentSchoolYear();
      const [studentsData, classesData, feesData, attendanceData] = await Promise.all([
        getStudents(), getClasses(), getFees(y), getAttendance(y),
      ]);
      setYear(y); setStudents(studentsData); setClasses(classesData); setFees(feesData); setAttendance(attendanceData);
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const schoolMonth = getCurrentSchoolMonth();
  const weekDates = getWeekDates(weekAnchor);

  if (loading) return <Layout title="Dashboard"><LoadingState /></Layout>;
  if (error) return <Layout title="Dashboard"><ErrorState error={error} onRetry={load} /></Layout>;

  const active = students.filter(s => s.status === 'Active');

  // ── This week's attendance (Mon–Thu, both classes) ──
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
  const weekLabel = `${new Date(weekDates[0]+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – ${new Date(weekDates[3]+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`;
  function shiftWeek(dir) {
    const d = new Date(weekDates[0]+'T12:00:00'); d.setDate(d.getDate() + dir*7);
    setWeekAnchor(d.toISOString().split('T')[0]);
  }

  async function handleAsk(e) {
    e.preventDefault();
    const q = askQuestion.trim();
    if (!q || asking) return;
    setAsking(true); setAskError(null);
    try {
      const answer = await askAi(q, year);
      setAskHistory(h => [...h, { question: q, answer }]);
      setAskQuestion('');
    } catch (err) {
      setAskError(err);
    }
    setAsking(false);
  }

  function closeAsk() {
    setShowAsk(false); setAskQuestion(''); setAskError(null); setAskHistory([]);
  }

  // ── This school month's fees ──
  const monthFees = fees.filter(f => f.weekStarting >= schoolMonth.start && f.weekStarting < schoolMonth.endExclusive);
  const monthCollected = monthFees.filter(f => f.status === 'Paid').reduce((s, f) => s + Number(f.amount), 0);
  const monthOutstanding = monthFees.filter(f => f.status !== 'Paid').reduce((s, f) => s + Number(f.amount), 0);
  const monthBilled = monthCollected + monthOutstanding;
  const monthCollectedPct = monthBilled ? Math.round((monthCollected / monthBilled) * 100) : 0;

  const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const yMax = Math.max(5, Math.ceil(active.length / 5) * 5);
  const yTicks = [yMax, yMax*0.75, yMax*0.5, yMax*0.25, 0];

  return (
    <Layout title="Dashboard" subtitle={`Overview · ${year}`}>
      <div className="card hero">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,flexWrap:'wrap'}}>
          <div>
            <div className="hero-arabic">السلام عليكم</div>
            <div className="hero-greeting">Assalamu Alaikum</div>
            <div className="hero-sub">{dateStr} · {schoolMonth.label}</div>
          </div>
          <button className="btn btn-primary" style={{background:'var(--blue)',flexShrink:0}} onClick={()=>setShowAsk(true)}>
            <Sparkles size={15}/> Ask AI
          </button>
        </div>
      </div>

      <div className="stat-grid-v2">
        <div className="stat-card-v2">
          <div className="n">{active.length}</div>
          <div className="l">Students</div>
          <div className="view-all" style={{color:'var(--blue)',cursor:'pointer'}} onClick={()=>navigate('/students')}>View all →</div>
        </div>
        <div className="stat-card-v2">
          <div className="n">{classes.length}</div>
          <div className="l">Classes</div>
          <div className="view-all" style={{color:'var(--green-text)',cursor:'pointer'}} onClick={()=>navigate('/classes')}>View all →</div>
        </div>
        <div className="stat-card-v2">
          <div className="n">{weekAttPct}%</div>
          <div className="l">Attendance this week</div>
          <div className="view-all" style={{color:'var(--green-text)',cursor:'pointer'}} onClick={()=>navigate('/attendance')}>View all →</div>
        </div>
        <div className="stat-card-v2">
          <div className="n">£{monthOutstanding.toFixed(2)}</div>
          <div className="l">Outstanding this month</div>
          <div className="view-all" style={{color:'var(--blue)',cursor:'pointer'}} onClick={()=>navigate('/fees')}>View all →</div>
        </div>
      </div>

      <div className="ring-row">
        <div className="card ring-card">
          <div className="card-title">Attendance — this week</div>
          <div className="card-sub">Present or late, both classes</div>
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

        <div className="card ring-card">
          <div className="card-title">Fees — {schoolMonth.label}</div>
          <div className="card-sub">£{monthBilled.toFixed(2)} due this month</div>
          <div className="ring-wrap">
            <div className="ring" style={{background:`conic-gradient(var(--blue) 0% ${monthCollectedPct}%, #eef0f4 ${monthCollectedPct}% 100%)`}}/>
            <div className="ring-inner"><div className="n">{monthCollectedPct}%</div><div className="l">Collected</div></div>
          </div>
          <div className="ring-breakdown">
            <span><span className="dot" style={{background:'var(--blue)'}}/>Collected: £{monthCollected.toFixed(2)}</span>
            <span><span className="dot" style={{background:'var(--text-soft)'}}/>Outstanding: £{monthOutstanding.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{marginBottom:16}}>
          <div>
            <div className="card-title">Daily attendance</div>
            <div className="card-sub" style={{marginBottom:0}}>Present / late / absent per day, both classes</div>
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
                  <div className="stack-seg" style={{height:`${(dc.P/yMax)*100}%`, background:'var(--green)'}}/>
                  <div className="stack-seg" style={{height:`${(dc.L/yMax)*100}%`, background:'var(--amber)'}}/>
                  <div className="stack-seg" style={{height:`${(dc.A/yMax)*100}%`, background:'var(--red)'}}/>
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

      {showAsk && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&closeAsk()}>
          <div className="modal" style={{maxWidth:520}}>
            <div className="modal-header">
              <div className="modal-title"><Sparkles size={16} style={{verticalAlign:'-3px',marginRight:6}}/>Ask AI</div>
              <button className="btn btn-icon" onClick={closeAsk}><X size={16}/></button>
            </div>
            <div className="modal-body">
              <div className="card-sub" style={{marginBottom:14}}>
                Ask about fees or attendance across the school, e.g. "What's the total fees collected so far this year?" or "What's Ahmed's attendance like this year?"
              </div>

              {askHistory.length > 0 && (
                <div style={{display:'flex',flexDirection:'column',gap:14,marginBottom:16,maxHeight:320,overflowY:'auto'}}>
                  {askHistory.map((h, i) => (
                    <div key={i}>
                      <div style={{fontWeight:600,fontSize:13,marginBottom:4}}>{h.question}</div>
                      <div style={{fontSize:13,color:'var(--text)',whiteSpace:'pre-wrap',background:'#f9fafb',borderRadius:'var(--r-md)',padding:'10px 12px'}}>{h.answer}</div>
                    </div>
                  ))}
                </div>
              )}

              {askError && <div style={{color:'var(--red)',fontSize:12.5,marginBottom:10}}>{askError.message || 'Something went wrong — please try again.'}</div>}

              <form onSubmit={handleAsk} style={{display:'flex',gap:8}}>
                <input
                  autoFocus
                  value={askQuestion}
                  onChange={e=>setAskQuestion(e.target.value)}
                  placeholder="Ask a question…"
                  disabled={asking}
                  style={{flex:1,padding:'10px 14px',border:'1px solid var(--border)',borderRadius:'var(--r-md)',fontFamily:'var(--font)',fontSize:13}}
                />
                <button type="submit" className="btn btn-primary" style={{background:'var(--blue)'}} disabled={asking || !askQuestion.trim()}>
                  {asking ? '…' : <Send size={15}/>}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
