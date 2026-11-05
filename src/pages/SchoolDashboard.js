// A school's Dashboard (madaaris.kind 'school'): Getting started while it's new, the figures, then a line per class —
// how far it is with its own year's surahs, du'aas and practicals (server/routes/studies.js ?action=summary). Tapping
// a class opens it on Islamic Studies.
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { appNavigate } from '../components/BackToExit';
import Layout from '../components/Layout';
import GettingStarted from '../components/GettingStarted';
import Recommend from '../components/Recommend';
import BoxRow from '../components/BoxRow';
import { LoadingState, ErrorState } from '../components/DataState';
import { getStudents, getClasses, getStudiesSummary, formatDateGB } from '../lib/store';
import { useAuth } from '../lib/AuthContext';
import { yearLabel } from './Studies';
import { LEVEL_COLOUR } from '../lib/studies';
import { ChevronRight } from 'lucide-react';

export default function SchoolDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(async () => {
    try {
      const [students, classes, summary] = await Promise.all([getStudents(), getClasses(), getStudiesSummary()]);
      setData({ students, classes, summary }); setError(null);
    } catch (e) { setError(e); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return <Layout title="Dashboard"><ErrorState error={error} onRetry={load} /></Layout>;
  if (!data) return <Layout title="Dashboard"><LoadingState /></Layout>;

  const pupils = data.students.filter(s => s.status === 'Active').length;
  // Achieved, with help and incomplete as a share of what's been assessed (as the school's own sheets work it out).
  const sum = k => data.summary.reduce((t, c) => t + (c[k] || 0), 0);
  const achieved = sum('achieved'), withHelp = sum('withHelp'), incomplete = sum('incomplete');
  const assessed = achieved + withHelp + incomplete;
  const notAssessed = data.summary.reduce((t, c) => t + c.items * c.pupils, 0) - assessed;
  const pct = (n, of) => (of ? Math.round((n / of) * 100) : 0);
  const open = cls => { try { localStorage.setItem('studies_class', cls); } catch { /* fine */ } appNavigate(navigate, '/studies'); };
  const dateStr = `${new Date().toLocaleDateString('en-GB', { weekday: 'long' })} ${formatDateGB(new Date())}`;

  return (
    <Layout title="Dashboard" subtitle="Islamic Studies">
      <GettingStarted students={data.students} classes={data.classes} onChanged={load} />
      <div className="card hero">
        <div className="hero-arabic">السلام عليكم</div>
        <div className="hero-greeting">Assalamu Alaikum</div>
        <div className="hero-sub">{dateStr}</div>
      </div>

      <BoxRow cells={[
        { text: pupils, sub: 'Pupils', className: 'ct-figure', onClick: () => appNavigate(navigate, '/students') },
        { text: data.classes.length, sub: 'Classes', className: 'ct-figure', onClick: () => appNavigate(navigate, '/classes') },
      ]} />
      <BoxRow cells={[
        { text: `${pct(achieved, assessed)}%`, sub: 'Achieved', tone: 'green' },
        { text: `${pct(withHelp, assessed)}%`, sub: 'With help', tone: 'amber' },
        { text: `${pct(incomplete, assessed)}%`, sub: 'Incomplete', tone: 'red' },
        { text: notAssessed, sub: 'Not assessed', className: 'ct-figure' },
      ]} />

      <div className="card" style={{ display: 'grid', gap: 6, marginTop: 10 }}>
        <div className="card-title" style={{ marginBottom: 4 }}>This year's surahs, du'aas and practicals</div>
        {data.summary.map(c => {
          const of = c.items * c.pupils, done = (c.achieved || 0) + (c.withHelp || 0) + (c.incomplete || 0);
          const a = pct(c.achieved || 0, done);
          const w = n => `${pct(n || 0, of)}%`; // the bar: every pupil × item, grey for not assessed yet
          return (
            <button key={c.class} type="button" className="line-row" onClick={() => open(c.class)}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="line-row-name" style={{ display: 'block' }}>{c.class}</span>
                <span className="line-row-sub" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {[c.yearGroup === null ? 'No year group' : yearLabel(c.yearGroup) === c.class ? '' : yearLabel(c.yearGroup), `${c.pupils} pupils`, c.teacher].filter(Boolean).join(' · ')}
                </span>
                <span className="sd-bar" title={`${a}% of those assessed achieved`}>
                  <span style={{ width: w(c.achieved), background: LEVEL_COLOUR[3] }} /><span style={{ width: w(c.withHelp), background: LEVEL_COLOUR[2] }} /><span style={{ width: w(c.incomplete), background: LEVEL_COLOUR[1] }} />
                </span>
              </span>
              <span className="line-row-sub" style={{ fontWeight: 700, color: 'var(--green-text)' }}>{a}%</span>
              <ChevronRight size={16} />
            </button>
          );
        })}
        {!data.summary.length && <div className="text-muted" style={{ fontSize: 13 }}>No classes yet — add them on Classes &amp; Teachers.</div>}
      </div>

      {user?.role === 'owner' && !user.demo && !user.platformAdmin && <Recommend />}
    </Layout>
  );
}
