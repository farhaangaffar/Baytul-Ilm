import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, X } from 'lucide-react';
import { getUsers, getTeachers, addStudent, deleteStudent, getDefaultWeeklyFee } from '../lib/store';
import { useAuth } from '../lib/AuthContext';
import { appNavigate } from './BackToExit';

// "Getting started" on a new madrasah's Dashboard (one that signed itself up, or any head
// with steps left): teachers & classes → fees & days → children → teacher logins. A Darul Uloom
// gets its own order: Settings → teachers → classes (Hifz, Nazarah…) → Aalim years & books →
// students → logins. Each ticks itself off from the madrasah's own data; the card goes once
// everything's done or it's hidden. The students step can add a few made-up students to try
// things with (marked in their notes, MADE_UP) — they don't tick the step, and one tap removes them.
const key = (code, what) => `getting_started_${what}:${code}`;
const read = k => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

// Settings page calls this when it's opened, which ticks "Set your fees and days".
export function markSettingsVisited(code) { if (code) write(key(code, 'settings'), '1'); }

const MADE_UP = 'Made-up student to try the app';
const isMadeUp = s => (s.notes || '').startsWith(MADE_UP);
const PRETEND = [['Adam', 'Example'], ['Yusuf', 'Sample'], ['Maryam', 'Example'], ['Ibrahim', 'Test'], ['Aisha', 'Sample'], ['Zaid', 'Test']];
const PRETEND_DU = [['Adam', 'Example'], ['Yusuf', 'Sample'], ['Ibrahim', 'Test'], ['Zaid', 'Example'], ['Bilal', 'Sample'], ['Hamza', 'Test']];

export default function GettingStarted({ students, classes, onChanged }) {
  const navigate = useNavigate();
  const { user, isDarulUloom } = useAuth();
  const code = user?.madrasah?.code || '';
  const [hidden, setHidden] = useState(() => !!read(key(code, 'hidden')));
  const [teacherLogins, setTeacherLogins] = useState(null);
  const [teacherCount, setTeacherCount] = useState(null);
  const [noOthers, setNoOthers] = useState(() => !!read(key(code, 'no_other_classes')));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (hidden || user?.demo) return;
    getUsers().then(us => setTeacherLogins((us.users || us).some(u => u.role === 'teacher'))).catch(() => setTeacherLogins(false));
    if (isDarulUloom) getTeachers().then(t => setTeacherCount(t.length)).catch(() => setTeacherCount(0));
  }, [hidden, user, isDarulUloom]);
  if (hidden || user?.demo || teacherLogins === null || (isDarulUloom && teacherCount === null)) return null;

  // A few made-up students, spread over the classes, to try attendance, fees and records with.
  const madeUp = students.filter(isMadeUp);
  const real = students.length - madeUp.length;
  const addPretend = async () => {
    setBusy(true);
    try {
      const fee = await getDefaultWeeklyFee().catch(() => undefined);
      const names = classes.map(c => c.name);
      const enrollDate = new Date().toISOString().slice(0, 10);
      const list = isDarulUloom ? PRETEND_DU : PRETEND;
      for (let i = 0; i < list.length; i++) {
        await addStudent({ forename: list[i][0], surname: list[i][1], class: names[i % names.length], enrollDate, status: 'Active',
          ...(fee ? { weeklyFee: Number(fee) } : {}), notes: `${MADE_UP} — delete before adding your real students.` });
      }
    } catch {}
    setBusy(false); onChanged?.();
  };
  const removePretend = async () => {
    setBusy(true);
    for (const s of madeUp) { try { await deleteStudent(s.id); } catch {} }
    setBusy(false); onChanged?.();
  };
  const studentsStep = { label: 'Add your students', path: '/students', done: real > 0 && !madeUp.length,
    sub: madeUp.length
      ? `${madeUp.length} made-up students are in to try things with (surnames Example, Sample, Test). Remove them before adding your real students.`
      : 'Type them in, or paste from a spreadsheet (Students → Import)',
    extra: madeUp.length ? { label: busy ? 'Removing…' : 'Remove the made-up students', onClick: removePretend }
      : classes.length ? { label: busy ? 'Adding…' : 'Try it with 6 made-up students', onClick: addPretend } : null };
  const settingsStep = { label: 'Set your fees, days and reports', sub: 'Fee, how often you charge, which days you\'re open, and how often reports are made', path: '/settings', done: !!read(key(code, 'settings')) };
  const loginsStep = { label: 'Give your teachers logins', sub: 'One for each teacher, or one shared login for each class — whichever suits you', done: teacherLogins,
    choices: [{ label: 'Teacher logins', path: '/classes?tab=teachers' }, { label: 'Class logins', path: '/classes?tab=classes' }] };
  const steps = isDarulUloom ? [
    settingsStep,
    { label: 'Add your teachers', sub: 'First, so each class, year and book can be given its teacher', path: '/classes?tab=teachers', done: teacherCount > 0 },
    { label: 'Add your classes', sub: 'Hifz, Nazarah, Qaa\'idah… — any class that isn\'t an Aalim year', path: '/classes?tab=classes', done: noOthers || classes.some(c => !c.courseOrder),
      extra: { label: "We don't have any", onClick: () => { write(key(code, 'no_other_classes'), '1'); setNoOthers(true); } } },
    { label: 'Set up your Aalim years and books', sub: 'Your own year names and books — or start from the usual Dars-e-Nizami list and change it', path: '/course', done: classes.some(c => c.courseOrder) },
    studentsStep, loginsStep,
  ] : [
    { label: 'Add your teachers, then your classes', sub: 'Teachers first, so each new class can be given its teacher', path: '/classes?tab=teachers', done: classes.length > 0 },
    { label: 'Set your fees and madrasah days', sub: 'Default fee, how often you charge, and which days you\'re open', path: '/settings', done: !!read(key(code, 'settings')) },
    { ...studentsStep, label: 'Add your children' },
    loginsStep,
  ];
  const left = steps.filter(s => !s.done).length;
  if (!left) return null;
  const hide = () => { write(key(code, 'hidden'), '1'); setHidden(true); };

  return (
    <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--blue)' }}>
      <div className="card-header" style={{ marginBottom: 4 }}>
        <div className="card-title">Getting started</div>
        <button className="btn btn-icon btn-sm" onClick={hide} title="Hide this" aria-label="Hide getting started"><X size={14} /></button>
      </div>
      <div className="card-sub" style={{ marginBottom: 12 }}>{left} step{left === 1 ? '' : 's'} left to get everything ready.</div>
      <div style={{ display: 'grid', gap: 8 }}>
        {steps.map((s, i) => {
          const Row = s.choices ? 'div' : 'button';
          return (
          <Row key={s.label} {...(s.choices ? {} : { type: 'button', onClick: () => appNavigate(navigate, s.path) })}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 12,
              background: s.done ? '#f7fbf2' : '#fff', cursor: s.choices ? 'default' : 'pointer', textAlign: 'left', fontFamily: 'var(--font)' }}>
            <span style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: s.done ? 'var(--green)' : '#f3f4f6', color: s.done ? '#fff' : 'var(--text-soft)', fontWeight: 700, fontSize: 12.5 }}>
              {s.done ? <Check size={14} /> : i + 1}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 600, fontSize: 13.5, color: 'var(--ink)', textDecoration: s.done ? 'line-through' : 'none' }}>{s.label}</span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>{s.sub}</span>
              {s.extra && !s.done && (
                <span style={{ display: 'flex', marginTop: 8 }}>
                  <span role="button" tabIndex={0} className="btn btn-sm" onClick={e => { e.stopPropagation(); if (!busy) s.extra.onClick(); }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); if (!busy) s.extra.onClick(); } }}>{s.extra.label}</span>
                </span>
              )}
              {s.choices && (
                <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  {s.choices.map(c => <button key={c.label} type="button" className="btn btn-sm" onClick={() => appNavigate(navigate, c.path)}>{c.label}<ChevronRight size={13} /></button>)}
                </span>
              )}
            </span>
            {!s.done && !s.choices && <ChevronRight size={16} color="var(--text-soft)" />}
          </Row>
          );
        })}
      </div>
    </div>
  );
}
