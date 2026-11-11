import React, { useState, useEffect } from 'react';
import { LegalLinks, MadeWith } from '../components/Legal';
import { getPupilHome, logout, markMyHomework } from '../lib/store';
import { niceDue } from '../components/SchoolHomework';
import { linkSite } from './Studies';
import { useSettings } from '../lib/SettingsContext';
import { PupilDetail } from './Studies';
import InstallBanner from '../components/InstallBanner';
import InstallSteps from '../components/InstallSteps';
import { usePageHelp, PageHelpButton } from '../components/PageHelp';
import { DemoBar, leaveDemo } from '../components/Demo';
import { useAuth } from '../lib/AuthContext';
import { LogOut, ChevronDown, ChevronUp, ExternalLink, Check } from 'lucide-react';

// A pupil's own page (a school's pupil login — server/routes/pupil.js): their homework (the next step of stage 4) and
// their Islamic Studies marks, read only (the same card parents see). Nothing else of the school's.
const headerBtn = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, border: 'none', borderRadius: 8, background: 'transparent', color: '#fff', opacity: 0.85, cursor: 'pointer', flexShrink: 0 };

// "My homework": a line per piece, newest first (not done yet first); tap one to see what to do, its links and
// "I've done it".
function MyHomework({ list, onChanged }) {
  const [open, setOpen] = useState(list.find(h => !h.doneAt)?.id || '');
  const [busy, setBusy] = useState('');
  const sorted = [...list.filter(h => !h.doneAt), ...list.filter(h => h.doneAt)];
  async function tick(h) {
    setBusy(h.id);
    try { await markMyHomework(h.id, !h.doneAt); await onChanged(); } catch { /* stays as it was */ }
    setBusy('');
  }
  return (
    <div className="card" style={{ marginBottom: 14, display: 'grid', gap: 6 }}>
      <div className="card-title" style={{ marginBottom: 4 }}>My homework</div>
      {!list.length && <div className="text-muted" style={{ fontSize: 13.5 }}>No homework yet. When your teacher sets some, it will show here.</div>}
      {sorted.map(h => {
        const isOpen = open === h.id;
        return (
          <div key={h.id} className={`st-pupil-wrap ${isOpen ? 'open' : ''}`}>
            <button type="button" className={`line-row ${isOpen ? 'on' : ''}`} onClick={() => setOpen(isOpen ? '' : h.id)}>
              <span className="ct-two">
                <span className="line-row-name">{h.itemName || 'Homework'}</span>
                <span className="line-row-sub">{h.doneAt ? 'Done' : niceDue(h.due) || 'To do'}</span>
              </span>
              {h.doneAt && <span className="hw-done"><Check size={13} /></span>}
              {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {isOpen && (
              <div style={{ display: 'grid', gap: 8, padding: '8px 2px 4px' }}>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 14.5 }}>{h.text}</div>
                {(h.links || []).map((l, i) => {
                  const site = linkSite(l.url);
                  return (
                    <a key={i} className="line-row" href={l.url} target="_blank" rel="noopener noreferrer" style={{ background: '#fff', textDecoration: 'none', color: 'inherit', gap: 10 }}>
                      <span className={`st-link-ic ${site.tone}`}><ExternalLink size={13} /></span>
                      <span className="ct-two"><span className="line-row-name">{l.name}</span><span className="line-row-sub">{site.label}</span></span>
                    </a>
                  );
                })}
                <button type="button" className={`btn ${h.doneAt ? '' : 'btn-primary'}`} style={{ justifySelf: 'stretch', justifyContent: 'center', ...(h.doneAt ? {} : { background: 'var(--blue)', borderColor: 'var(--blue)' }) }} disabled={busy === h.id} onClick={() => tick(h)}>
                  {h.doneAt ? 'Not done after all' : <><Check size={14} /> I've done it</>}
                </button>
                <div className="text-muted" style={{ fontSize: 12 }}>Set by {h.setBy}{h.due ? ` · ${niceDue(h.due)}` : ''}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function PupilPortal() {
  const settings = useSettings();
  const { user } = useAuth();
  const pageHelp = usePageHelp('/', 'pupil');
  const [home, setHome] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { getPupilHome().then(setHome).catch(err => setError(err.message || 'Could not load')); }, []);
  async function signOut() { if (user?.demo) { leaveDemo(); return; } await logout().catch(() => {}); window.location.reload(); }
  const studies = home?.studies;
  const level = it => studies?.progress.find(p => p.itemId === it.id)?.level || 0;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--page)' }}>
      <DemoBar user={user} />
      <InstallBanner />
      <div style={{ background: 'var(--ink)', color: '#fff', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {settings.schoolNameArabic && <div style={{ fontFamily: "'Amiri', serif", fontSize: 20, lineHeight: 1.2 }}>{settings.schoolNameArabic}</div>}
          <div style={{ fontSize: 12, opacity: 0.8 }}>{settings.schoolName} · Islamic Studies</div>
        </div>
        <button onClick={signOut} aria-label="Log out" title="Log out" style={headerBtn}><LogOut size={18} /></button>
      </div>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: 16 }}>
        {error && <div className="card" style={{ fontSize: 13.5 }}>{error}</div>}
        <div style={{ textAlign: 'right', marginBottom: 10 }}><PageHelpButton onClick={pageHelp.show} /></div>
        {home && (
          <>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 18 }}>Assalamu 'alaykum, {home.pupil.forename}</div>
              <div className="text-muted text-sm">{home.pupil.class}</div>
            </div>
            <MyHomework list={home.homework || []} onChanged={() => getPupilHome().then(setHome).catch(() => {})} />
            {studies && (
              <div className="card" style={{ marginBottom: 14 }}>
                <div className="card-title">My Islamic Studies</div>
                <PupilDetail name={home.pupil.forename} items={studies.items} levelOf={level} readOnly classAverage={studies.classAverage || {}} ayahs={studies.ayahs} yearGroup={studies.yearGroup} />
              </div>
            )}
          </>
        )}
        <LegalLinks style={{ margin: '20px 0 8px' }} />
        <MadeWith style={{ marginBottom: 8 }} />
      </div>
      <InstallSteps steps={pageHelp.open ? pageHelp.help : null} onClose={pageHelp.close} />
    </div>
  );
}
