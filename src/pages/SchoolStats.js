import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import BoxRow from '../components/BoxRow';
import { LoadingState, ErrorState } from '../components/DataState';
import { getSchoolStats } from '../lib/store';
import { yearLabel, STUDY_KINDS } from '../lib/studies';
import { buildSchoolStatsPdf } from '../lib/schoolStatsPdf';
import { downloadPdfBytes } from '../lib/reportPdf';
import { ChevronDown, ChevronUp, Download } from 'lucide-react';

// A school's Stats page (server/routes/school-stats.js; head only): the madrasah Stats page's comparisons — the whole school,
// class against class, through the year, year over year — for Surahs, Du'aas, Practicals and Homework. Everything is a
// percentage of what's been assessed (or set), so a 1-form year and a 3-form year compare fairly. A year group is all its
// forms together; tapping one with several forms compares them side by side (the owner's picked design, without form counts).

const TABS = [...STUDY_KINDS.map(([k, l]) => [k, l]), ['homework', 'Homework']];
const niceYear = y => `20${y.slice(0, 2)}–${y.slice(3)}`;
const show = n => (n === null || n === undefined ? '—' : `${n}%`);

// Achieved / with help / incomplete as a soft bar (of what's been assessed).
function MarkBar({ t }) {
  return (
    <span className="ss-bar">
      <i style={{ width: `${t.pct || 0}%`, background: 'var(--green-light)' }} />
      <i style={{ width: `${t.helpPct || 0}%`, background: 'var(--amber-light)' }} />
      <i style={{ width: `${t.incPct || 0}%`, background: 'var(--red-light)' }} />
    </span>
  );
}
const DoneBar = ({ t }) => (
  <span className="ss-bar">
    <i style={{ width: `${t.onTimePct || 0}%`, background: 'var(--green-light)' }} />
    <i style={{ width: `${t.latePct || 0}%`, background: 'var(--amber-light)' }} />
  </span>
);

// One year group (or form) as a line: name, its figure on the right, the bar underneath.
function GroupLine({ name, t, homework, open, onClick, canOpen, inner }) {
  const Tag = canOpen ? 'button' : 'div';
  return (
    <Tag type={canOpen ? 'button' : undefined} className={`line-row ss-line ${open ? 'on' : ''} ${inner ? 'ss-inner' : ''}`} onClick={canOpen ? onClick : undefined}>
      <span className="ss-line-main">
        <span className="ss-line-top">
          <span className="line-row-name">{name}</span>
          {homework
            ? <span className="ss-fig">{show(t.donePct)} done{t.quizAvg !== null && t.quizAvg !== undefined ? <span className="ss-quiz"> · quizzes {t.quizAvg}%</span> : ''}</span>
            : <span className="ss-fig">{show(t.pct)} achieved</span>}
        </span>
        {homework ? <DoneBar t={t} /> : <MarkBar t={t} />}
      </span>
      {canOpen ? (open ? <ChevronUp size={16} /> : <ChevronDown size={16} />) : !inner && <span className="ss-chev-space" />}
    </Tag>
  );
}

export default function SchoolStats() {
  const [tab, setTab] = useState('surah');
  const [year, setYear] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null); // an opened year group
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState('');
  // Every list's stats for the year on screen, as one PDF (the owner's ask: every year group, all four sections).
  async function downloadPdf() {
    setPdfBusy(true); setPdfError('');
    try {
      const y = data?.year || year;
      const [surah, duaa, practical, homework] = await Promise.all(['surah', 'duaa', 'practical', 'homework'].map(k => getSchoolStats(k, y)));
      const made = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      const bytes = await buildSchoolStatsPdf({ year: surah.year, made, kinds: { surah, duaa, practical, homework } });
      downloadPdfBytes(bytes, `islamic-studies-stats-${surah.year}.pdf`);
    } catch (e) { setPdfError(e.message || 'Could not make the PDF'); }
    setPdfBusy(false);
  }
  const load = useCallback(() => {
    setData(null); setError(null);
    getSchoolStats(tab, year).then(setData).catch(setError);
  }, [tab, year]);
  useEffect(() => { load(); }, [load]);
  const homework = tab === 'homework';
  const list = (STUDY_KINDS.find(k => k[0] === tab) || [])[1] || '';

  return (
    <Layout title="Stats" subtitle={data ? `Academic year ${niceYear(data.year)}` : 'Islamic Studies across the school'}>
      <div className="pill-tabs bd-tabs ss-tabs">
        {TABS.map(([k, l]) => <button key={k} className={`pill-tab ${tab === k ? 'active' : ''}`} onClick={() => { setTab(k); setOpen(null); }}>{l}</button>)}
      </div>
      {data && data.years.length > 1 && (
        <div className="pill-tabs" style={{ marginTop: 10 }}>
          {[...data.years].reverse().map(y => <button key={y} className={`pill-tab ${data.year === y ? 'year-active' : ''}`} onClick={() => { setYear(y); setOpen(null); }}>{niceYear(y)}</button>)}
        </div>
      )}
      {data && (
        <button type="button" className="line-row add ss-pdf" disabled={pdfBusy} onClick={downloadPdf}>
          <Download size={14} /> {pdfBusy ? 'Making the PDF…' : `Download all stats as a PDF · ${niceYear(data.year)}`}
        </button>
      )}
      {pdfError && <div style={{ color: 'var(--red-text)', fontSize: 13, marginTop: 6 }}>{pdfError}</div>}
      {error ? <ErrorState error={error} onRetry={load} /> : !data || data.kind !== tab ? <LoadingState /> : (
        <div style={{ display: 'grid', gap: 14, marginTop: 14 }}>
          {homework ? (
            <BoxRow cells={[
              { text: data.school.set, sub: 'Set', className: 'ct-figure' },
              { text: show(data.school.onTimePct), sub: 'Done on time', tone: 'green' },
              { text: show(data.school.latePct), sub: 'Done late', tone: 'amber' },
              { text: show(data.school.quizAvg), sub: 'Quiz average', className: 'ct-figure' },
            ]} />
          ) : (
            <BoxRow cells={[
              { text: show(data.school.pct), sub: 'Achieved', tone: 'green' },
              { text: show(data.school.helpPct), sub: 'With help', tone: 'amber' },
              { text: show(data.school.incPct), sub: 'Incomplete', tone: 'red' },
              { text: data.school.notAssessed, sub: 'Not assessed', className: 'ct-figure' },
            ]} />
          )}
          {data.fromPoint && <div className="text-muted" style={{ fontSize: 12.5 }}>As at that year's {data.fromPoint} assessment.</div>}

          <div className="ss-grid">
            <div className="card" style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
              <div className="card-title">Year groups</div>
              <div className="card-sub" style={{ marginTop: -4 }}>{homework ? 'Homework done, and the quiz average' : `This year's ${list.toLowerCase()} · of what's been assessed`}{data.yearGroups.some(g => g.forms.length > 1) ? ' · tap one to compare its forms' : ''}</div>
              {!data.yearGroups.length && <div className="text-muted" style={{ fontSize: 13 }}>{homework ? 'No homework set this year yet.' : 'No marks yet.'}</div>}
              {data.yearGroups.map(g => (
                <React.Fragment key={g.yearGroup}>
                  <GroupLine name={yearLabel(g.yearGroup)} t={g} homework={homework} canOpen={g.forms.length > 1}
                    open={open === g.yearGroup} onClick={() => setOpen(open === g.yearGroup ? null : g.yearGroup)} />
                  {open === g.yearGroup && (
                    <div className="ss-forms">{g.forms.map(f => <GroupLine key={f.name} name={f.name} t={f} homework={homework} inner />)}</div>
                  )}
                </React.Fragment>
              ))}
              <div className="ss-legend">
                {homework
                  ? <><span><i style={{ background: 'var(--green-light)' }} />On time</span><span><i style={{ background: 'var(--amber-light)' }} />Late</span></>
                  : <><span><i style={{ background: 'var(--green-light)' }} />Achieved</span><span><i style={{ background: 'var(--amber-light)' }} />With help</span><span><i style={{ background: 'var(--red-light)' }} />Incomplete</span></>}
              </div>
            </div>

            {homework && (
              <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
                <div className="card" style={{ display: 'grid', gap: 6 }}>
                  <div className="card-title">By month</div>
                  <div className="card-sub" style={{ marginTop: -4 }}>Homework set each month, and how much was done</div>
                  {!data.months.length && <div className="text-muted" style={{ fontSize: 13 }}>Nothing set yet.</div>}
                  {data.months.map(r => (
                    <div key={r.month} className="line-row ss-line">
                      <span className="ss-line-main">
                        <span className="ss-line-top"><span className="line-row-name">{new Date(`${r.month}-01T12:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} <span className="ss-quiz">· {r.set} set</span></span><span className="ss-fig">{show(r.donePct)} done</span></span>
                        <DoneBar t={r} />
                      </span>
                    </div>
                  ))}
                </div>
                {data.quizzes.length > 0 && (
                  <div className="card" style={{ display: 'grid', gap: 6 }}>
                    <div className="card-title">Quizzes</div>
                    <div className="card-sub" style={{ marginTop: -4 }}>The latest, with each class's average</div>
                    {data.quizzes.map(q => (
                      <div key={q.id} className="line-row ss-line">
                        <span className="ct-two"><span className="line-row-name">{q.title}</span><span className="line-row-sub">{q.class} · {q.handedIn} of {q.assigned} handed in</span></span>
                        <span className={`qz-score ${q.avg === null ? 'grey' : q.avg >= 80 ? 'green' : q.avg >= 50 ? 'amber' : 'red'}`}>{show(q.avg)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {!homework && (
              <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
                <div className="card" style={{ display: 'grid', gap: 8 }}>
                  <div className="card-title">Through the year</div>
                  <div className="card-sub" style={{ marginTop: -4 }}>Achieved at each assessment point, by year group</div>
                  {data.through.length ? <PointsChart through={data.through} /> : <div className="text-muted" style={{ fontSize: 13 }}>Take an assessment point on the Reports page to see this.</div>}
                </div>
                <div className="card" style={{ display: 'grid', gap: 6 }}>
                  <div className="card-title">Year over year</div>
                  <div className="card-sub" style={{ marginTop: -4 }}>The whole school, achieved</div>
                  {data.overYears.map(r => (
                    <div key={r.year} className="line-row ss-line">
                      <span className="ss-line-main">
                        <span className="ss-line-top"><span className="line-row-name">{niceYear(r.year)}{r.soFar ? ' so far' : r.point ? ` · ${r.point}` : ''}</span><span className="ss-fig">{show(r.pct)}</span></span>
                        <span className="ss-bar"><i style={{ width: `${r.pct || 0}%`, background: 'var(--green-light)' }} /></span>
                      </span>
                    </div>
                  ))}
                </div>
                {data.hardest.length > 0 && (
                  <div className="card" style={{ display: 'grid', gap: 6 }}>
                    <div className="card-title">Hardest {data.year === data.current ? 'this year' : 'that year'}</div>
                    <div className="card-sub" style={{ marginTop: -4 }}>The {list.toLowerCase()} with the most pupils still incomplete</div>
                    {data.hardest.map(h => (
                      <div key={h.id} className="line-row ss-line">
                        <span className="ct-two"><span className="line-row-name">{h.name}</span><span className="line-row-sub">{yearLabel(h.yearGroup)}</span></span>
                        <span className="ss-counts"><b className="r">{h.incomplete}</b> incomplete · <b className="a">{h.withHelp}</b> with help</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}

// Each year group's achieved at each assessment point, as small columns side by side (a colour per point).
const POINT_COLOURS = ['var(--teal-mid)', 'var(--green)', 'var(--amber)', 'var(--red)'];
function PointsChart({ through }) {
  const groups = [...new Set(through.flatMap(p => p.yearGroups.map(g => g.yearGroup)))].sort((a, b) => a - b);
  return (
    <>
      <div className="ss-chart">
        {groups.map(yg => (
          <div key={yg} className="ss-col">
            <div className="ss-col-bars">
              {through.map((p, i) => {
                const v = p.yearGroups.find(g => g.yearGroup === yg)?.pct;
                return <i key={p.name} title={`${p.name}: ${show(v)}`} style={{ height: `${v || 0}%`, background: POINT_COLOURS[i % POINT_COLOURS.length] }} />;
              })}
            </div>
            <span>{yg === 0 ? 'Rec' : `Y${yg}`}</span>
          </div>
        ))}
      </div>
      <div className="ss-legend">{through.map((p, i) => <span key={p.name}><i style={{ background: POINT_COLOURS[i % POINT_COLOURS.length] }} />{p.name} · {show(p.school)}</span>)}</div>
    </>
  );
}
