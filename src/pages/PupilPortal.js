import React, { useState, useEffect } from 'react';
import { LegalLinks, MadeWith } from '../components/Legal';
import { getPupilHome, logout } from '../lib/store';
import { useSettings } from '../lib/SettingsContext';
import { PupilDetail } from './Studies';
import InstallBanner from '../components/InstallBanner';
import InstallSteps from '../components/InstallSteps';
import { usePageHelp, PageHelpButton } from '../components/PageHelp';
import { DemoBar, leaveDemo } from '../components/Demo';
import { useAuth } from '../lib/AuthContext';
import { LogOut } from 'lucide-react';

// A pupil's own page (a school's pupil login — server/routes/pupil.js): their homework (the next step of stage 4) and
// their Islamic Studies marks, read only (the same card parents see). Nothing else of the school's.
const headerBtn = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, border: 'none', borderRadius: 8, background: 'transparent', color: '#fff', opacity: 0.85, cursor: 'pointer', flexShrink: 0 };

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
            <div className="card" style={{ marginBottom: 14 }}>
              <div className="card-title">My homework</div>
              <div className="text-muted" style={{ fontSize: 13.5 }}>No homework yet. When your teacher sets some, it will show here.</div>
            </div>
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
