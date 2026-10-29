import React, { useState, useEffect, useCallback } from 'react';
import { LegalLinks, MadeWith } from '../components/Legal';
import { getParentHome, getParentChild, reportAbsence, updateMyChildDetails, logout, formatDateGB } from '../lib/store';
import { TripBoxes } from '../components/BoarderRecord';
import { ParentInputs, DetailInputs, HealthNote } from '../components/StudentDetails';
import { periodForKey } from '../lib/reportPeriods';
import { buildReportBytes, downloadPdfBytes } from '../lib/reportPdf';
import { buildReportCards } from '../lib/reportCardPdf';
import { money } from '../lib/branding';
import { countedFees } from '../lib/feePeriods';
import { useSettings } from '../lib/SettingsContext';
import { QuranProgressCard } from '../components/QuranCards';
import ChangePasswordModal from '../components/ChangePasswordModal';
import InstallBanner from '../components/InstallBanner';
import InstallSteps from '../components/InstallSteps';
import { usePageHelp, PageHelpButton } from '../components/PageHelp';
import { DemoBar, leaveDemo } from '../components/Demo';
import { useAuth } from '../lib/AuthContext';
import BoxRow from '../components/BoxRow';
import { LogOut, KeyRound, Download, CalendarX, Check, ChevronDown, ChevronUp, Pencil, X } from 'lucide-react';

// The parent portal: one page, made for a phone. A family login sees each of their
// children's attendance, fees, finished reports and Qur'aan progress, and can tell the
// madrasah about an absence. Everything comes from /api/parent, which only ever
// returns this family's own children.

function isoToday() { return new Date().toISOString().split('T')[0]; }
const headerBtn = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, border: 'none', borderRadius: 8, background: 'transparent', color: '#fff', opacity: 0.85, cursor: 'pointer', flexShrink: 0 };

// A Darul Uloom boarder: the madrasah's next home weekends and their trips home, in boxes.
const niceDay = d => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
function GoingHome({ boarding }) {
  const { homeWeekends, leaves } = boarding;
  return (
    <Section title="Going home">
      {homeWeekends.length === 0 && <div className="text-muted text-sm" style={{ marginBottom: 8 }}>No home weekends set yet.</div>}
      {homeWeekends.map((w, i) => (
        <BoxRow key={w.id} columns="repeat(3, minmax(0, 1fr))" cells={[
          { label: true, text: w.name, sub: i === 0 ? 'Next' : undefined, wrap: 'words' },
          { text: niceDay(w.starts), sub: w.leaveTime ? `Home from ${w.leaveTime}` : 'Go home', tone: i === 0 ? 'blue' : undefined },
          { text: niceDay(w.ends), sub: w.returnTime ? `Back by ${w.returnTime}` : 'Come back', tone: i === 0 ? 'blue' : undefined },
        ]} />
      ))}
      {leaves.length > 0 && <div style={{ fontSize: 13, fontWeight: 600, margin: '12px 0 6px' }}>Trips home</div>}
      {leaves.slice(0, 4).map(l => <TripBoxes key={l.id} trip={l} />)}
    </Section>
  );
}

function Section({ title, children, right }) {
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <div className="card-title" style={{ marginBottom: 0 }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

// A Darul Uloom's fee for the year (server/routes/du-fees.js forParent): paid / still to pay / next, each instalment
// as a box (green paid, red overdue), and each payment with its receipt number.
function DuFeesCard({ fees }) {
  const [open, setOpen] = useState(false);
  const short = d => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const TONE = { paid: 'green', part: 'amber', due: 'amber', overdue: 'red' };
  return (
    <Section title="Fees" right={(fees.items.length > 0 || fees.payments.length > 0) && (
      <button className="btn btn-sm" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}{open ? 'Hide' : 'Show all'}
      </button>
    )}>
      <Tiles items={[[money(fees.expected), 'This year'], [money(fees.paid), 'Paid', fees.paid > 0 ? 'var(--green)' : undefined], [money(fees.owed), fees.overdue > 0 ? `${money(fees.overdue)} overdue` : 'Still to pay', fees.overdue > 0 ? 'var(--red)' : undefined]]} />
      {fees.owed <= 0 && fees.expected > 0 && <div style={{ fontSize: 13, color: 'var(--green-text)', marginBottom: 4 }}><Check size={13} style={{ verticalAlign: -2 }} /> All paid — thank you.</div>}
      {fees.owed > 0 && fees.nextDue && <div style={{ fontSize: 13, marginBottom: 4 }}>Next: <b>{money(fees.nextDue.amount)}</b> by {short(fees.nextDue.due)}</div>}
      {open && (
        <div style={{ marginTop: 8 }}>
          <BoxRow columns="repeat(3, minmax(0, 1fr))" cells={fees.items.map(it => ({
            text: money(it.amount), wrap: 'words',
            sub: `${it.kind === 'extra' ? it.label : short(it.due)} · ${it.status === 'paid' ? 'Paid' : it.status === 'overdue' ? 'Overdue' : it.paid > 0 ? `${money(it.paid, 0)} paid` : 'Not due yet'}`,
            tone: TONE[it.status],
          }))} />
          {fees.payments.length > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-soft)', margin: '10px 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Payments</div>}
          {[...fees.payments].reverse().map(p => (
            <BoxRow key={p.id} columns="repeat(3, minmax(0, 1fr))" cells={[
              { label: true, text: money(p.amount) }, { text: short(p.paidOn), sub: p.method }, { text: `Receipt ${p.receiptNo}` },
            ]} />
          ))}
        </div>
      )}
    </Section>
  );
}

function Tiles({ items }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
      {items.map(([v, l, dot]) => (
        <div key={l} style={{ flex: 1, background: '#f3f4f6', borderRadius: 'var(--r-md)', padding: '8px 10px', textAlign: 'center', position: 'relative' }}>
          {dot && <div style={{ position: 'absolute', top: 7, right: 7, width: 7, height: 7, borderRadius: '50%', background: dot }} />}
          <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>{v}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l}</div>
        </div>
      ))}
    </div>
  );
}

// [['2026-09', [...items]], …], newest month first; items oldest first within a month.
function byMonth(items, dateOf) {
  const groups = {};
  items.forEach(it => { (groups[dateOf(it).slice(0, 7)] = groups[dateOf(it).slice(0, 7)] || []).push(it); });
  return Object.keys(groups).sort().reverse().map(m => [m, groups[m].sort((a, b) => dateOf(a).localeCompare(dateOf(b)))]);
}
const monthName = ym => new Date(ym + '-15T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

// A card showing totals, with the full history tucked behind "Show by month".
function OpenableSection({ title, summary, empty, children }) {
  const [open, setOpen] = useState(false);
  return (
    <Section title={title} right={!empty && (
      <button className="btn btn-sm" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}{open ? 'Hide' : 'By month'}
      </button>
    )}>
      {summary}
      {empty && <div className="text-muted text-sm">{empty}</div>}
      {open && <div style={{ marginTop: 6 }}>{children}</div>}
    </Section>
  );
}

// One month inside an open section: a row of four boxes (the month, then its totals),
// tapped open for a row per day or fee underneath.
function MonthRow({ month, cells, children }) {
  const [open, setOpen] = useState(false);
  const d = new Date(month + '-15T12:00:00');
  return (
    // Opened, the month and its days sit together in an outlined panel.
    <div style={open ? { border: '1px solid #dfe3e8', borderRadius: 12, background: '#fbfcfd', padding: '6px 6px 0', margin: '4px 0 12px' } : undefined}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label={monthName(month)}
        style={{ display: 'block', width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left' }}>
        <BoxRow cells={[{ header: true, open, text: d.toLocaleDateString('en-GB', { month: 'short' }), sub: String(d.getFullYear()) }, ...cells]} />
      </button>
      {open && <div style={{ borderTop: '1px dashed #d5dae0', paddingTop: 6, marginTop: 2 }}>{children}</div>}
    </div>
  );
}

// A short period name that fits in a box, with a second line: "4 Jan" / "Week",
// "Jan" / "2027", or the term's name.
function feeBoxLabel(f, terms) {
  const d = new Date(f.weekStarting + 'T12:00:00');
  if (f.period === 'month') return { text: d.toLocaleDateString('en-GB', { month: 'short' }), sub: String(d.getFullYear()) };
  if (f.period === 'term') return { text: terms.find(t => t.startDate === f.weekStarting)?.name || d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), sub: 'Term' };
  return { text: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), sub: 'Week' };
}


function AbsenceForm({ child, reasons, onSent }) {
  const [date, setDate] = useState(isoToday());
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function send() {
    setBusy(true); setError('');
    try { await reportAbsence({ studentId: child.id, date, reason, note }); setReason(''); setNote(''); await onSent(); }
    catch (err) { setError(err.message || 'Could not send'); }
    setBusy(false);
  }
  const field = { padding: '10px 12px', border: 'none', borderRadius: 'var(--r-md)', background: '#f9fafb', fontFamily: 'var(--font)', fontSize: 14, width: '100%', boxSizing: 'border-box' };
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <input type="date" value={date} min={isoToday()} onChange={e => setDate(e.target.value)} style={field} aria-label="Date of absence" />
      <select value={reason} onChange={e => setReason(e.target.value)} style={field} aria-label="Reason">
        <option value="">Reason…</option>
        {reasons.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      <input value={note} onChange={e => setNote(e.target.value)} placeholder="Anything else the teacher should know (optional)" style={field} />
      {error && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</div>}
      <button className="btn btn-primary" style={{ justifyContent: 'center', padding: 10 }} disabled={busy || !reason || !date} onClick={send}>
        <CalendarX size={14} />{busy ? 'Sending…' : `Tell the madrasah ${child.forename} will be absent`}
      </button>
    </div>
  );
}

// The details the madrasah holds for this child that the family can keep up to date:
// contacts, home, emergency contact, health and going home (POST /api/parent?action=details).
function YourDetails({ child, details, onSaved, many }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const contact = n => [details[`parent${n}Name`], details[`parent${n}Phone`]].filter(Boolean).join(' · ');
  async function save() {
    setBusy(true); setError('');
    try { await updateMyChildDetails({ studentId: child.id, ...form }); setForm(null); setSaved(true); await onSaved(); }
    catch (err) { setError(err.message || 'Could not save'); }
    setBusy(false);
  }
  return (
    <Section title="Your details" right={<button className="btn btn-sm" onClick={() => { setForm({ ...details }); setSaved(false); }}><Pencil size={12} />Check &amp; update</button>}>
      {saved && <div style={{ fontSize: 13, color: 'var(--green-text)', marginBottom: 10 }}><Check size={13} style={{ verticalAlign: -2 }} /> Saved — the madrasah will see the changes.{many ? ' Contacts and address are the same for all your children.' : ''}</div>}
      <HealthNote student={details} />
      {[['Contact 1', contact(1)], ['Contact 2', contact(2)], ['Emergency', [details.emergencyName, details.emergencyPhone].filter(Boolean).join(' · ')], ['Address', [details.address, details.postcode].filter(Boolean).join(', ')]]
        .filter(([, v]) => v).map(([l, v]) => (
          <div key={l} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0', borderTop: '1px solid var(--border)', fontSize: 12.5 }}>
            <span className="text-muted">{l}</span><span style={{ textAlign: 'right', overflowWrap: 'anywhere' }}>{v}</span>
          </div>
        ))}
      {form && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !busy && setForm(null)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">{child.forename}'s details</div>
              <button className="btn btn-icon" onClick={() => setForm(null)} disabled={busy}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <ParentInputs form={form} set={(k, v) => setForm(f => ({ ...f, [k]: v }))} required />
              <DetailInputs form={form} set={(k, v) => setForm(f => ({ ...f, [k]: v }))} isDarulUloom={false} only={['family', 'emergency', 'health', 'home']} />
              {error && <div style={{ fontSize: 13, color: 'var(--red)' }}>{error}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setForm(null)} disabled={busy}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}

function ChildView({ child, reasons, many }) {
  const { isDarulUloom } = useAuth(); // a Darul Uloom's reports are its exam report cards
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState('');
  const [sent, setSent] = useState(false);

  const load = useCallback(async () => {
    try { setData(await getParentChild(child.id)); setError(''); }
    catch (err) { setError(err.message || 'Could not load'); }
  }, [child.id]);
  useEffect(() => { setData(null); load(); }, [load]);

  if (error) return <div className="card" style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>;
  if (!data) return <div className="card text-muted" style={{ fontSize: 13 }}>Loading…</div>;

  // Attendance: totals for this school year (from September); the days themselves are
  // tucked away by month.
  const now = new Date();
  const yearStart = `${now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1}-09-01`;
  const thisYear = data.attendance.filter(a => a.date >= yearStart);
  const count = s => thisYear.filter(a => a.status === s).length;
  const marked = thisYear.length;
  const pct = marked ? Math.round(((count('P') + count('L')) / marked) * 100) : null;
  const attendanceByMonth = byMonth(data.attendance, a => a.date);

  // Unpaid fees for weeks/months still to come aren't owed yet, so parents don't see them.
  const fees = countedFees(data.fees);
  const unpaid = fees.filter(f => f.status !== 'Paid');
  const owed = unpaid.reduce((t, f) => t + f.amount, 0);
  const paidTotal = fees.filter(f => f.status === 'Paid').reduce((t, f) => t + f.amount, 0);
  const feesByMonth = byMonth(fees, f => f.weekStarting);

  async function download(r) {
    setDownloading(r.month);
    try {
      const p = periodForKey(r.month, data.terms);
      const attendance = { [child.id]: Object.fromEntries(data.attendance.map(a => [a.date, a.status])) };
      const bytes = await buildReportBytes(data.student, attendance, fees, {
        summary: r.summary, behavior: r.behavior, reportDate: new Date(r.updatedAt), period: p, teacherName: data.teacherName,
      });
      downloadPdfBytes(bytes, `Report_${child.forename}_${child.surname}_${p.label.replace(/\s+/g, '_')}.pdf`);
    } catch (err) { setError(err.message || 'Could not make the report'); }
    setDownloading('');
  }

  async function downloadCard(e) {
    setDownloading(`exam-${e.id}`);
    try {
      const bytes = await buildReportCards([{ student: data.student, exam: e, papers: e.papers, result: e.result,
        teacherComment: e.teacherComment, headComment: e.headComment, behavior: e.behavior, attendance: e.attendance, teacherName: e.teacherName || data.teacherName }]);
      downloadPdfBytes(bytes, `Report_card_${child.forename}_${child.surname}_${e.name}.pdf`.replace(/\s+/g, '_'));
    } catch (err) { setError(err.message || 'Could not make the report card'); }
    setDownloading('');
  }

  return (
    <>
      <OpenableSection title="Attendance" summary={
        <Tiles items={[[count('P'), 'Present', 'var(--green)'], [count('L'), 'Late', 'var(--amber)'], [count('A'), 'Absent', 'var(--red)'], [pct === null ? '—' : `${pct}%`, 'Attended']]} />
      } empty={data.attendance.length === 0 && 'No attendance marked yet.'}>
        {attendanceByMonth.map(([month, days]) => {
          const n = s => days.filter(a => a.status === s).length;
          return (
            <MonthRow key={month} month={month} cells={[
              { text: n('P'), sub: 'Present', tone: n('P') > 0 && 'green' },
              { text: n('L'), sub: 'Late', tone: n('L') > 0 && 'amber' },
              { text: n('A'), sub: 'Absent', tone: n('A') > 0 && 'red' },
            ]}>
              {days.map(a => {
                const d = new Date(a.date + 'T12:00:00');
                return (
                  <BoxRow key={a.date} cells={[
                    { label: true, text: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), sub: d.toLocaleDateString('en-GB', { weekday: 'short' }) },
                    { text: 'Present', tone: a.status === 'P' && 'green' },
                    { text: 'Late', tone: a.status === 'L' && 'amber', sub: a.status === 'L' ? a.lateTime : undefined },
                    { text: 'Absent', tone: a.status === 'A' && 'red' },
                  ]} />
                );
              })}
            </MonthRow>
          );
        })}
      </OpenableSection>

      {data.boarding && <GoingHome boarding={data.boarding} />}

      {data.duFees ? <DuFeesCard fees={data.duFees} /> : isDarulUloom ? null : <OpenableSection title="Fees" summary={
        <>
          <Tiles items={[[money(owed), 'Owed', owed > 0 ? 'var(--red)' : undefined], [unpaid.length, 'Unpaid'], [money(paidTotal), 'Paid', paidTotal > 0 ? 'var(--green)' : undefined], [fees.length - unpaid.length, 'Settled']]} />
          {fees.length > 0 && unpaid.length === 0 && <div style={{ fontSize: 13, color: 'var(--green-text)', marginBottom: 4 }}><Check size={13} style={{ verticalAlign: -2 }} /> All paid — thank you.</div>}
        </>
      } empty={fees.length === 0 && 'No fees yet.'}>
        {feesByMonth.map(([month, items]) => {
          const monthOwed = items.filter(f => f.status !== 'Paid').reduce((t, f) => t + f.amount, 0);
          const monthPaid = items.filter(f => f.status === 'Paid').reduce((t, f) => t + f.amount, 0);
          return (
            <MonthRow key={month} month={month} cells={[
              { label: true, text: money(monthOwed + monthPaid), sub: 'Total' },
              { text: money(monthPaid), sub: 'Paid', tone: monthPaid > 0 && 'green' },
              { text: money(monthOwed), sub: 'Owed', tone: monthOwed > 0 && 'red' },
            ]}>
              {items.map(f => (
                <BoxRow key={f.id} cells={[
                  { label: true, ...feeBoxLabel(f, data.terms) },
                  { label: true, text: money(f.amount) },
                  { text: 'Paid', tone: f.status === 'Paid' && 'green', sub: f.status === 'Paid' && f.paidDate ? new Date(f.paidDate + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : undefined },
                  { text: 'Owed', tone: f.status !== 'Paid' && 'red' },
                ]} />
              ))}
            </MonthRow>
          );
        })}
      </OpenableSection>}

      {data.quranType && <QuranProgressCard student={data.student} type={data.quranType} data={data.quran} />}

      {data.homework?.length > 0 && (
        <Section title="Homework">
          {data.homework.map(h => (
            <div key={h.date} style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
              <div className="text-muted" style={{ fontSize: 12 }}>{formatDateGB(h.date)}</div>
              <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{h.text}</div>
            </div>
          ))}
        </Section>
      )}

      {(!isDarulUloom || data.reports.length > 0) && <Section title={isDarulUloom ? 'Earlier reports' : 'Reports'}>
        {data.reports.length === 0 && <div className="text-muted text-sm">No reports yet — they'll appear here once the madrasah has written one.</div>}
        {data.reports.map(r => {
          const p = periodForKey(r.month, data.terms);
          return (
            <div key={r.month} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{p.label}</div>
                {r.behavior && <div className="text-muted" style={{ fontSize: 12 }}>Behaviour: {r.behavior}</div>}
              </div>
              <button className="btn btn-sm" onClick={() => download(r)} disabled={!!downloading}>
                <Download size={13} />{downloading === r.month ? 'Preparing…' : 'PDF'}
              </button>
            </div>
          );
        })}
      </Section>}

      {(data.exams?.length > 0 || isDarulUloom) && (
        <Section title={isDarulUloom ? 'Reports' : 'Exam results'}>
          {!data.exams?.length && <div className="text-muted text-sm">No reports yet — they'll appear here after each exam, once the madrasah publishes them.</div>}
          {data.exams.map(e => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{e.name}</div>
                <div className="text-muted" style={{ fontSize: 12 }}>
                  {[e.result.pct !== null && `${e.result.pct}%`, e.result.grade, e.result.complete && e.result.position && `${e.result.position} of ${e.result.of} in class`,
                    e.result.result === 'Resit' ? `Resit: ${e.result.resits.join(', ')}` : e.result.result].filter(Boolean).join(' · ')}
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => downloadCard(e)} disabled={!!downloading}>
                <Download size={13} />{downloading === `exam-${e.id}` ? 'Preparing…' : 'PDF'}
              </button>
            </div>
          ))}
        </Section>
      )}

      <Section title="Report an absence">
        {sent && <div style={{ fontSize: 13, color: 'var(--green-text)', marginBottom: 10 }}><Check size={13} style={{ verticalAlign: -2 }} /> Sent — the teacher will see it when they take the register.</div>}
        <AbsenceForm child={child} reasons={reasons} onSent={async () => { setSent(true); await load(); }} />
        {data.absences.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {data.absences.map(a => (
              <div key={a.date} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderTop: '1px solid var(--border)', fontSize: 12.5 }}>
                <span>{formatDateGB(a.date)} · {a.reason}{a.note ? <span className="text-muted"> — {a.note}</span> : null}</span>
                <span className={a.seen ? '' : 'text-muted'} style={{ whiteSpace: 'nowrap', color: a.seen ? 'var(--green-text)' : undefined }}>{a.seen ? 'Seen ✓' : 'Sent'}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {data.details && <YourDetails child={child} details={data.details} onSaved={load} many={many} />}
    </>
  );
}

export default function ParentPortal() {
  const settings = useSettings();
  const { user } = useAuth();
  const pageHelp = usePageHelp('/', 'parent');
  const [home, setHome] = useState(null);
  const [error, setError] = useState('');
  const [active, setActive] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    getParentHome()
      .then(h => { setHome(h); setActive(h.children[0]?.id || ''); })
      .catch(err => setError(err.message || 'Could not load'));
  }, []);

  async function signOut() { if (user?.demo) { leaveDemo(); return; } await logout().catch(() => {}); window.location.reload(); }
  const child = home?.children.find(c => c.id === active);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--page)' }}>
      <DemoBar user={user} />
      <InstallBanner />
      <div style={{ background: 'var(--ink)', color: '#fff', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {settings.schoolNameArabic && <div style={{ fontFamily: "'Amiri', serif", fontSize: 20, lineHeight: 1.2 }}>{settings.schoolNameArabic}</div>}
          <div style={{ fontSize: 12, opacity: 0.8 }}>{settings.schoolName} · Parents</div>
        </div>
        {!user?.demo && <button onClick={() => setChangingPassword(true)} aria-label="Change password" title="Change password" style={headerBtn}><KeyRound size={18} /></button>}
        <button onClick={signOut} aria-label="Log out" title="Log out" style={headerBtn}><LogOut size={18} /></button>
      </div>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: 16 }}>
        {error && <div className="card" style={{ fontSize: 13.5 }}>{error}</div>}
        <div style={{ textAlign: 'right', marginBottom: 10 }}><PageHelpButton onClick={pageHelp.show} /></div>
        {home && home.children.length === 0 && <div className="card" style={{ fontSize: 13.5 }}>No children are linked to this login yet — please contact the madrasah office.</div>}
        {home && home.children.length > 1 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {home.children.map(c => (
              <button key={c.id} className={`pill-tab ${active === c.id ? 'active' : ''}`} onClick={() => setActive(c.id)}>{c.forename}</button>
            ))}
          </div>
        )}
        {child && (
          <>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{child.forename} {child.surname}</div>
              <div className="text-muted text-sm">{child.class}{child.status === 'Inactive' ? ' · has left' : ''}</div>
            </div>
            <ChildView key={child.id} child={child} reasons={home.absenceReasons} many={home.children.length > 1} />
          </>
        )}
        <LegalLinks style={{ margin: '20px 0 8px' }} />
        <MadeWith style={{ marginBottom: 8 }} />
      </div>
      {changingPassword && <ChangePasswordModal onClose={() => setChangingPassword(false)} />}
      <InstallSteps steps={pageHelp.open ? pageHelp.help : null} onClose={pageHelp.close} />
    </div>
  );
}
