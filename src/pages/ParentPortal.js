import React, { useState, useEffect, useCallback } from 'react';
import { getParentHome, getParentChild, reportAbsence, logout, formatDateGB } from '../lib/store';
import { periodForKey } from '../lib/reportPeriods';
import { buildReportBytes, downloadPdfBytes } from '../lib/reportPdf';
import { money } from '../lib/branding';
import { useSettings } from '../lib/SettingsContext';
import { QuranProgressCard } from '../components/QuranCards';
import ChangePasswordModal from '../components/ChangePasswordModal';
import InstallBanner from '../components/InstallBanner';
import InstallSteps from '../components/InstallSteps';
import { usePageHelp, PageHelpButton } from '../components/PageHelp';
import { DemoBar, leaveDemo } from '../components/Demo';
import { useAuth } from '../lib/AuthContext';
import BoxRow from '../components/BoxRow';
import { LogOut, KeyRound, Download, CalendarX, Check, ChevronDown, ChevronUp } from 'lucide-react';

// The parent portal: one page, made for a phone. A family login sees each of their
// children's attendance, fees, finished reports and Qur'an progress, and can tell the
// madrasah about an absence. Everything comes from /api/parent, which only ever
// returns this family's own children.

function isoToday() { return new Date().toISOString().split('T')[0]; }
const headerBtn = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, border: 'none', borderRadius: 8, background: 'transparent', color: '#fff', opacity: 0.85, cursor: 'pointer', flexShrink: 0 };

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

function ChildView({ child, reasons }) {
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

  const unpaid = data.fees.filter(f => f.status !== 'Paid');
  const owed = unpaid.reduce((t, f) => t + f.amount, 0);
  const paidTotal = data.fees.filter(f => f.status === 'Paid').reduce((t, f) => t + f.amount, 0);
  const feesByMonth = byMonth(data.fees, f => f.weekStarting);

  async function download(r) {
    setDownloading(r.month);
    try {
      const p = periodForKey(r.month, data.terms);
      const attendance = { [child.id]: Object.fromEntries(data.attendance.map(a => [a.date, a.status])) };
      const bytes = await buildReportBytes(data.student, attendance, data.fees, {
        summary: r.summary, behavior: r.behavior, reportDate: new Date(r.updatedAt), period: p, teacherName: data.teacherName,
      });
      downloadPdfBytes(bytes, `Report_${child.forename}_${child.surname}_${p.label.replace(/\s+/g, '_')}.pdf`);
    } catch (err) { setError(err.message || 'Could not make the report'); }
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

      <OpenableSection title="Fees" summary={
        <>
          <Tiles items={[[money(owed), 'Owed', owed > 0 ? 'var(--red)' : undefined], [unpaid.length, 'Unpaid'], [money(paidTotal), 'Paid', paidTotal > 0 ? 'var(--green)' : undefined], [data.fees.length - unpaid.length, 'Settled']]} />
          {data.fees.length > 0 && unpaid.length === 0 && <div style={{ fontSize: 13, color: 'var(--green-text)', marginBottom: 4 }}><Check size={13} style={{ verticalAlign: -2 }} /> All paid — thank you.</div>}
        </>
      } empty={data.fees.length === 0 && 'No fees yet.'}>
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
      </OpenableSection>

      {data.quranType && <QuranProgressCard student={data.student} type={data.quranType} data={data.quran} />}

      <Section title="Reports">
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
      </Section>

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
            <ChildView key={child.id} child={child} reasons={home.absenceReasons} />
          </>
        )}
      </div>
      {changingPassword && <ChangePasswordModal onClose={() => setChangingPassword(false)} />}
      <InstallSteps steps={pageHelp.open ? pageHelp.help : null} onClose={pageHelp.close} />
    </div>
  );
}
