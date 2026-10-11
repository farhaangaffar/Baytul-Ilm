import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, X } from 'lucide-react';
import { getUsers } from '../lib/store';
import { useAuth } from '../lib/AuthContext';
import { appNavigate } from './BackToExit';

// "Getting started" on a new madrasah's Dashboard (one that signed itself up, or any head
// with steps left): classes → students → fees & days → teacher logins. Each ticks itself
// off from the madrasah's own data; the card goes once everything's done or it's hidden.
const key = (code, what) => `getting_started_${what}:${code}`;
const read = k => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

// Settings page calls this when it's opened, which ticks "Set your fees and days".
export function markSettingsVisited(code) { if (code) write(key(code, 'settings'), '1'); }

export default function GettingStarted({ students, classes }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const code = user?.madrasah?.code || '';
  const [hidden, setHidden] = useState(() => !!read(key(code, 'hidden')));
  const [teacherLogins, setTeacherLogins] = useState(null);
  useEffect(() => {
    if (hidden || user?.demo) return;
    getUsers().then(us => setTeacherLogins((us.users || us).some(u => u.role === 'teacher'))).catch(() => setTeacherLogins(false));
  }, [hidden, user]);
  if (hidden || user?.demo || teacherLogins === null) return null;

  const steps = [
    { label: 'Add your classes', sub: 'And who teaches each one', path: '/classes', done: classes.length > 0 },
    { label: 'Add your students', sub: 'Type them in, or paste from a spreadsheet (Students → Import)', path: '/students', done: students.length > 0 },
    { label: 'Set your fees and madrasah days', sub: 'How much, how often, and which days you\'re open', path: '/settings', done: !!read(key(code, 'settings')) },
    { label: 'Give your teachers their logins', sub: 'Classes & Teachers → tap Login on a teacher or a class', path: '/classes', done: teacherLogins },
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
        {steps.map((s, i) => (
          <button key={s.label} type="button" onClick={() => appNavigate(navigate, s.path)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 12,
              background: s.done ? '#f7fbf2' : '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)' }}>
            <span style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: s.done ? 'var(--green)' : '#f3f4f6', color: s.done ? '#fff' : 'var(--text-soft)', fontWeight: 700, fontSize: 12.5 }}>
              {s.done ? <Check size={14} /> : i + 1}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 600, fontSize: 13.5, color: 'var(--ink)', textDecoration: s.done ? 'line-through' : 'none' }}>{s.label}</span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>{s.sub}</span>
            </span>
            {!s.done && <ChevronRight size={16} color="var(--text-soft)" />}
          </button>
        ))}
      </div>
    </div>
  );
}
