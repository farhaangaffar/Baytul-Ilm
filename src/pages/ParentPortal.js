import React, { useState, useEffect, useCallback } from 'react';
import { getParentHome, getParentChild, reportAbsence, logout, formatDateGB } from '../lib/store';
import { periodForKey } from '../lib/reportPeriods';
import { buildReportBytes, downloadPdfBytes } from '../lib/reportPdf';
import { money } from '../lib/branding';
import { useSettings } from '../lib/SettingsContext';
import { QuranProgressCard } from '../components/QuranCards';
import ChangePasswordModal from '../components/ChangePasswordModal';
import { LogOut, KeyRound, Download, CalendarX, Check, ChevronDown, ChevronUp } from 'lucide-react';

// The parent portal: one page, made for a phone. A family login sees each of their
// children's attendance, fees, finished reports and Qur'an progress, and can tell the
// madrasah about an absence. Everything comes from /api/parent, which only ever
// returns this family's own children.

function isoToday() { return new Date().toISOString().split('T')[0]; }
const headerBtn = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, border: 'none', borderRadius: 8, background: 'transparent', color: '#fff', opacity: 0.85, cursor: 'pointer', flexShrink: 0 };
const STATUS = { P: ['Present', 'var(--green)'], L: ['Late', 'var(--amber)'], A: ['Absent', 'var(--red)'] };

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

// One month inside an open section: its totals, tapped open for the details.
function MonthRow({ month, right, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: '1px solid var(--border)' }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', padding: '9px 0', cursor: 'pointer', fontFamily: 'var(--font)', color: 'var(--ink)', textAlign: 'left' }}>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        <span style={{ fontWeight: 600, fontSize: 13.5, flex: 1 }}>{monthName(month)}</span>
        {right}
      </button>
      {open && <div style={{ padding: '0 0 8px 22px' }}>{children}</div>}
    </div>
  );
}

function feeLabel(f, terms) {
  if (f.period === 'month') return new Date(f.weekStarting + 'T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  if (f.period === 'term') return terms.find(t => t.startDate === f.weekStarting)?.name || `Term from ${formatDateGB(f.weekStarting)}`;
  return `Week of ${formatDateGB(f.weekStarting)}`;
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
        <Tiles items={[[count('P'), 'Present', 'var(--green)'], [count('L'), 'Late', 'var(--amber)'], [count('A'), 'Absent', 'var(--red)'], [pct === null ? '—' : `${pct}%`, 'This year']]} />
      } empty={data.attendance.length === 0 && 'No attendance marked yet.'}>
        {attendanceByMonth.map(([month, days]) => {
          const n = s => days.filter(a => a.status === s).length;
          return (
            <MonthRow key={month} month={month}
              right={<span style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                {[['P', n('P')], ['L', n('L')], ['A', n('A')]].map(([s, v]) => (
                  <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS[s][1] }} />{v}</span>
                ))}
              </span>}>
              {days.map(a => (
                <div key={a.date} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13 }}>
                  <span>{new Date(a.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS[a.status]?.[1] }} />
                    {a.status === 'L' && a.lateTime ? `Late · ${a.lateTime}` : STATUS[a.status]?.[0]}
                  </span>
                </div>
              ))}
            </MonthRow>
          );
        })}
      </OpenableSection>

      <OpenableSection title="Fees" summary={
        <>
          <Tiles items={[[money(owed), 'Owed', owed > 0 ? 'var(--red)' : undefined], [unpaid.length, unpaid.length === 1 ? 'Unpaid period' : 'Unpaid periods']]} />
          {data.fees.length > 0 && unpaid.length === 0 && <div style={{ fontSize: 13, color: 'var(--green-text)', marginBottom: 4 }}><Check size={13} style={{ verticalAlign: -2 }} /> All paid — thank you.</div>}
        </>
      } empty={data.fees.length === 0 && 'No fees yet.'}>
        {feesByMonth.map(([month, items]) => {
          const monthOwed = items.filter(f => f.status !== 'Paid').reduce((t, f) => t + f.amount, 0);
          const monthPaid = items.filter(f => f.status === 'Paid').reduce((t, f) => t + f.amount, 0);
          return (
            <MonthRow key={month} month={month}
              right={<span style={{ fontSize: 12, fontWeight: 600, color: monthOwed > 0 ? 'var(--red-text)' : 'var(--green-text)' }}>
                {monthOwed > 0 ? `${money(monthOwed)} owed` : `${money(monthPaid)} paid`}
              </span>}>
              {items.map(f => (
                <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '5px 0', fontSize: 13 }}>
                  <span>{feeLabel(f, data.terms)}</span>
                  {f.status === 'Paid'
                    ? <span className="text-muted">{money(f.amount)} · paid{f.paidDate ? ` ${formatDateGB(f.paidDate)}` : ''}</span>
                    : <span style={{ fontWeight: 600, color: 'var(--red-text)' }}>{money(f.amount)} owed</span>}
                </div>
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
  const [home, setHome] = useState(null);
  const [error, setError] = useState('');
  const [active, setActive] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    getParentHome()
      .then(h => { setHome(h); setActive(h.children[0]?.id || ''); })
      .catch(err => setError(err.message || 'Could not load'));
  }, []);

  async function signOut() { await logout().catch(() => {}); window.location.reload(); }
  const child = home?.children.find(c => c.id === active);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--page)' }}>
      <div style={{ background: 'var(--ink)', color: '#fff', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {settings.schoolNameArabic && <div style={{ fontFamily: "'Amiri', serif", fontSize: 20, lineHeight: 1.2 }}>{settings.schoolNameArabic}</div>}
          <div style={{ fontSize: 12, opacity: 0.8 }}>{settings.schoolName} · Parents</div>
        </div>
        <button onClick={() => setChangingPassword(true)} aria-label="Change password" title="Change password" style={headerBtn}><KeyRound size={18} /></button>
        <button onClick={signOut} aria-label="Log out" title="Log out" style={headerBtn}><LogOut size={18} /></button>
      </div>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: 16 }}>
        {error && <div className="card" style={{ fontSize: 13.5 }}>{error}</div>}
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
    </div>
  );
}
