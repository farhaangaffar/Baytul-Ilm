// A school's Islamic Studies reports (menu "Reports", head and teachers; server/routes/school-reports.js). The head
// takes an assessment point — Autumn / Spring / Summer, or End of year (Settings → Reports are made) — which saves
// where every pupil is on their surahs, du'aas and practicals. Open a point → Class ▾ → a line per pupil: their bar,
// "+N achieved" since the last point, and Excellent · Good · Needs to improve for effort (their teacher or the head).
// Tap a name for the report (just the stats) and its PDF; "Print the whole class"; head: "Send to parents" puts the
// reports in the parent portal. Report maths: src/lib/studiesReport.js; PDF: src/lib/studiesReportPdf.js.
import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { LoadingState, ErrorState } from '../components/DataState';
import ClassBar from '../components/ClassBar';
import BoxRow from '../components/BoxRow';
import { ChoiceBoxes } from '../components/StudentDetails';
import { getClasses, getSchoolReports, getSchoolReportClass, takeAssessment, retakeAssessment, setEffort, publishAssessment, deleteAssessment, formatDateGB } from '../lib/store';
import { useAuth } from '../lib/AuthContext';
import { useBackToClose } from '../lib/useBackToClose';
import { reportOf, EFFORTS } from '../lib/studiesReport';
import { buildStudiesReports } from '../lib/studiesReportPdf';
import { downloadPdfBytes } from '../lib/reportPdf';
import { LEVEL_NAME, LEVEL_TONE, LEVEL_COLOUR, yearLabel } from '../lib/studies';
import { ChevronDown, ChevronUp, Plus, X, FileDown, Send, RefreshCw, Trash2, Printer } from 'lucide-react';

const recall = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const remember = (k, v) => { try { localStorage.setItem(k, v); } catch { /* fine */ } };
const yearName = y => (y ? `20${y.replace('-', '–20')}` : '');
const fileName = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// The soft bar (as on Islamic Studies): achieved, with help, incomplete, grey for not assessed.
function Bar({ t }) {
  const w = n => `${t.total ? (n / t.total) * 100 : 0}%`;
  return (
    <span className="sd-bar">
      <span style={{ width: w(t.achieved), background: LEVEL_COLOUR[3] }} />
      <span style={{ width: w(t.withHelp), background: LEVEL_COLOUR[2] }} />
      <span style={{ width: w(t.incomplete), background: LEVEL_COLOUR[1] }} />
    </span>
  );
}

export default function SchoolReports() {
  const { isOwner } = useAuth();
  const [list, setList] = useState(null);
  const [classes, setClasses] = useState([]);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(() => recall('sr_open', ''));
  const [taking, setTaking] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, cls] = await Promise.all([getSchoolReports(), getClasses()]);
      setList(d); setClasses(cls.filter(c => c.name)); setError(null);
    } catch (e) { setError(e); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return <Layout title="Reports"><ErrorState error={error} onRetry={load} /></Layout>;
  if (!list) return <Layout title="Reports"><LoadingState /></Layout>;

  const pick = id => { const next = openId === id ? '' : id; setOpenId(next); remember('sr_open', next); };
  const taken = new Set(list.assessments.filter(a => a.year === list.year).map(a => a.name.toLowerCase()));
  const suggestions = (list.period === 'year' ? ['End of year'] : ['Autumn', 'Spring', 'Summer']).filter(n => !taken.has(n.toLowerCase()));

  return (
    <Layout title="Reports" subtitle="Islamic Studies">
      <div className="card" style={{ display: 'grid', gap: 6 }}>
        <div className="card-title" style={{ marginBottom: 4 }}>Assessments</div>
        {list.assessments.map((a, i) => {
          const open = openId === a.id;
          return (
            <React.Fragment key={a.id}>
            {(i === 0 || list.assessments[i - 1].year !== a.year) && <div className="st-year">{yearName(a.year)}</div>}
            <div className={`st-pupil-wrap ${open ? 'open' : ''}`}>
              <button type="button" className={`line-row ${open ? 'on' : ''}`} onClick={() => pick(a.id)}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="line-row-name" style={{ display: 'block' }}>{a.name}</span>
                  <span className="line-row-sub" style={{ display: 'block' }}>
                    {a.publishedAt ? <span style={{ color: 'var(--green-text)', fontWeight: 600 }}>Sent</span> : 'Not sent'}
                  </span>
                </span>
                {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {open && <Assessment a={a} classes={classes} isOwner={isOwner} onChanged={load} onDeleted={() => { pick(a.id); load(); }} />}
            </div>
            </React.Fragment>
          );
        })}
        {!list.assessments.length && <div className="text-muted" style={{ fontSize: 13 }}>No assessments yet.{isOwner ? '' : ' The head takes them.'}</div>}
        {isOwner && (
          <button type="button" className="line-row add" style={{ marginTop: 4 }} onClick={() => setTaking(true)}>
            <Plus size={13} /> Take {suggestions[0] ? `the ${suggestions[0]} assessment` : 'an assessment'}
          </button>
        )}
      </div>
      {taking && <TakeModal suggestions={suggestions} year={list.year} onClose={() => setTaking(false)}
        onDone={async id => { setTaking(false); setOpenId(id); remember('sr_open', id); await load(); }} />}
    </Layout>
  );
}

function TakeModal({ suggestions, year, onClose, onDone }) {
  const close = useBackToClose(true, onClose);
  const [name, setName] = useState(suggestions[0] || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function go() {
    setBusy(true); setError('');
    try { const r = await takeAssessment(name.trim()); await onDone(r.id); }
    catch (e) { setError(e.message || 'Could not take it'); setBusy(false); }
  }
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !busy && close()}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <div className="modal-title">Take an assessment</div>
          <button className="btn btn-icon" onClick={close} disabled={busy}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
          <div className="text-muted" style={{ fontSize: 13 }}>
            This saves where every pupil is now on their surahs, du'aas and practicals ({yearName(year)}). Mark everyone first — you can update it until it's sent to parents.
          </div>
          {suggestions.length > 0 && <div className="form-group"><label>Which one</label>
            <ChoiceBoxes options={suggestions} value={suggestions.includes(name) ? name : ''} onChange={setName} /></div>}
          <div className="form-group"><label>Name</label>
            <input value={name} maxLength={40} placeholder="e.g. Autumn" onChange={e => setName(e.target.value)} /></div>
          {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={close} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={go} disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Take it now'}</button>
        </div>
      </div>
    </div>
  );
}

// One assessment opened: Class ▾, the head's buttons, then a line per pupil with their effort boxes.
function Assessment({ a, classes, isOwner, onChanged, onDeleted }) {
  const [cls, setCls] = useState(() => { const r = recall('sr_class', ''); return classes.some(c => c.name === r) ? r : classes[0]?.name || ''; });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [view, setView] = useState(null); // a pupil's report

  const load = useCallback(() => {
    if (!cls) return;
    getSchoolReportClass(a.id, cls).then(d => { setData(d); setError(''); }).catch(e => setError(e.message || 'Could not load'));
  }, [a.id, cls]);
  useEffect(() => { setData(null); load(); }, [load]);
  const pickClass = c => { setCls(c); remember('sr_class', c); };

  const one = p => ({
    name: p.name, className: cls, assessment: a, effort: p.effort,
    report: reportOf({ items: data.items, marks: p.marks, previous: data.previous?.[p.id] || null, yearGroup: p.yearGroup ?? data.yearGroup }),
  });
  async function rate(p, effort) {
    const next = p.effort === effort ? '' : effort; // tap the lit one again to clear
    setData(d => ({ ...d, pupils: d.pupils.map(x => (x.id === p.id ? { ...x, effort: next } : x)) }));
    try { await setEffort(a.id, p.id, next); onChanged(); } catch (e) { window.alert(e.message || 'Could not save'); load(); }
  }
  async function act(kind, fn) {
    setBusy(kind);
    try { await fn(); await onChanged(); load(); } catch (e) { window.alert(e.message || 'Could not do that'); }
    setBusy('');
  }
  async function printClass() {
    setBusy('print');
    try { downloadPdfBytes(await buildStudiesReports(data.pupils.map(one)), `islamic-studies-${fileName(a.name)}-${fileName(cls)}.pdf`); }
    catch (e) { window.alert(e.message || 'Could not make the PDF'); }
    setBusy('');
  }
  const rated = data ? data.pupils.filter(p => p.effort).length : 0;

  return (
    <div className="st-open">
      {classes.length > 1 && <ClassBar classes={classes.map(c => c.name)} active={cls} onPick={pickClass}
        notes={Object.fromEntries(classes.map(c => [c.name, yearLabel(c.yearGroup)]))} />}
      {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
      {!data && !error && <LoadingState />}
      {data && <>
        <BoxRow columns="repeat(3, minmax(0, 1fr))" cells={[
          { text: data.pupils.length, sub: 'Pupils' },
          { text: `${rated} / ${data.pupils.length}`, sub: 'Effort rated', tone: data.pupils.length && rated === data.pupils.length ? 'green' : undefined },
          { text: a.publishedAt ? 'Sent' : 'Not sent', sub: 'To parents', tone: a.publishedAt ? 'green' : undefined },
        ]} />
        {data.pupils.map(p => {
          const r = reportOf({ items: data.items, marks: p.marks, previous: data.previous?.[p.id] || null, yearGroup: p.yearGroup ?? data.yearGroup });
          return (
            <div key={p.id} className="sr-pupil">
              <button type="button" className="sr-name" onClick={() => setView(p)}>
                <span>{p.name}</span>
                <span className="text-muted" style={{ fontSize: 12 }}>{r.t.achieved} of {r.t.total} achieved{r.gained ? ` · +${r.gained} since last time` : ''}</span>
                <Bar t={r.t} />
              </button>
              <BoxRow fill columns="repeat(3, minmax(0, 1fr))" cells={EFFORTS.map(([e, tone]) => ({
                text: e, wrap: 'words', tone: p.effort === e ? tone : undefined, onClick: () => rate(p, e),
              }))} />
            </div>
          );
        })}
        {!data.pupils.length && <div className="text-muted" style={{ fontSize: 13 }}>No pupils from {cls} in this assessment.</div>}
        {data.pupils.length > 0 && (
          <button type="button" className="line-row" onClick={printClass} disabled={!!busy}>
            <Printer size={15} /><span className="line-row-name" style={{ flex: 1 }}>{busy === 'print' ? 'Making the PDF…' : `Print the whole class (${cls})`}</span>
          </button>
        )}
        {isOwner && <>
          <button type="button" className="line-row" disabled={!!busy}
            onClick={() => act('send', () => publishAssessment(a.id, !a.publishedAt))}>
            <Send size={15} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="line-row-name" style={{ display: 'block' }}>{a.publishedAt ? 'Take back from parents' : 'Send to parents'}</span>
              <span className="line-row-sub" style={{ display: 'block', whiteSpace: 'normal' }}>{a.publishedAt ? `Sent ${formatDateGB(String(a.publishedAt).slice(0, 10))} — every class` : 'Every class at once — shows in the parent portal with its PDF'}</span>
            </span>
          </button>
          {!a.publishedAt && (
            <button type="button" className="line-row" disabled={!!busy}
              onClick={() => window.confirm('Save everyone\'s marks again as they are now? Effort ratings stay.') && act('retake', () => retakeAssessment(a.id))}>
              <RefreshCw size={15} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="line-row-name" style={{ display: 'block' }}>Update marks</span>
                <span className="line-row-sub" style={{ display: 'block' }}>Marked more since {formatDateGB(a.takenAt)}? Save them into this assessment</span>
              </span>
            </button>
          )}
          <button type="button" className="btn btn-sm" style={{ justifySelf: 'start', color: 'var(--red)' }} disabled={!!busy}
            onClick={() => window.confirm(`Delete ${a.name} ${yearName(a.year)} and its reports? Pupils' marks on Islamic Studies stay as they are.`) && act('delete', async () => { await deleteAssessment(a.id); onDeleted(); })}>
            <Trash2 size={12} /> Delete this assessment
          </button>
        </>}
      </>}
      {view && <ReportModal one={one(view)} onClose={() => setView(null)} />}
    </div>
  );
}

// One pupil's report on screen, with its PDF. Also used by the parent portal.
export function ReportModal({ one, onClose }) {
  const close = useBackToClose(true, onClose);
  const [busy, setBusy] = useState(false);
  async function pdf() {
    setBusy(true);
    try { downloadPdfBytes(await buildStudiesReports([one]), `islamic-studies-${fileName(one.assessment.name)}-${fileName(one.name)}.pdf`); }
    catch (e) { window.alert(e.message || 'Could not make the PDF'); }
    setBusy(false);
  }
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && close()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <div className="modal-title">{one.name}<span className="text-muted" style={{ fontWeight: 500, fontSize: 13, marginLeft: 8 }}>{one.assessment.name} · {one.className}</span></div>
          <button className="btn btn-icon" onClick={close}><X size={16} /></button>
        </div>
        <div className="modal-body"><ReportBody one={one} /></div>
        <div className="modal-footer">
          <button className="btn" onClick={close}>Close</button>
          <button className="btn btn-primary" onClick={pdf} disabled={busy}><FileDown size={14} />{busy ? 'Making…' : 'PDF'}</button>
        </div>
      </div>
    </div>
  );
}

export function ReportBody({ one }) {
  const { report: r } = one;
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <BoxRow cells={[
        { text: `${r.t.pctAchieved}%`, sub: 'Achieved', tone: 'green' },
        { text: `${r.t.pctWithHelp}%`, sub: 'With help', tone: 'amber' },
        { text: `${r.t.pctIncomplete}%`, sub: 'Incomplete', tone: 'red' },
        { text: r.t.notAssessed, sub: 'Not assessed', className: 'ct-figure' },
      ]} />
      <BoxRow columns="repeat(3, minmax(0, 1fr))" cells={[
        { text: one.effort || '—', sub: 'Effort', wrap: 'words', tone: (EFFORTS.find(e => e[0] === one.effort) || [])[1] },
        { text: r.gained === null ? 'First' : `+${r.gained}`, sub: r.gained === null ? 'Report' : 'Since last time', wrap: 'words' },
        { text: r.earlier ? `${r.earlier.achieved} / ${r.earlier.total}` : '—', sub: 'Earlier years', wrap: 'words' },
      ]} />
      {r.kinds.map(k => (
        <div key={k.kind} style={{ display: 'grid', gap: 6 }}>
          <div className="st-year">{k.label}</div>
          <div className="st-chips">
            {k.list.map(it => <span key={it.id} className={`st-chip ${LEVEL_TONE[it.level] || ''}`} title={LEVEL_NAME[it.level]}>{it.name}</span>)}
          </div>
        </div>
      ))}
      <div className="st-key">
        {[3, 2, 1, 0].map(l => <span key={l}><i style={{ background: LEVEL_COLOUR[l] }} />{LEVEL_NAME[l]}</span>)}
      </div>
    </div>
  );
}
