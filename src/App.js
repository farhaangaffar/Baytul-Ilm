import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard       from './pages/Dashboard';
import Students        from './pages/Students';
import Attendance      from './pages/Attendance';
import Fees            from './pages/Fees';
import DailyRecords    from './pages/DailyRecords';
import ClassesTeachers from './pages/ClassesTeachers';
import Reports         from './pages/Reports';
import Stats           from './pages/Stats';
import SettingsPage    from './pages/Settings';
import Login           from './pages/Login';
import Madaaris        from './pages/Madaaris';
import ParentPortal    from './pages/ParentPortal';
import { getSession, logout } from './lib/store';
import { LegalPage, AcceptTerms } from './components/Legal';
import Landing from './pages/Landing';
import { setMadrasahCode, getMadrasahCode } from './lib/madrasahCode';
import { SettingsProvider } from './lib/SettingsContext';
import { AuthProvider } from './lib/AuthContext';

export default function App() {
  const [session, setSession] = useState(null); // null = still checking

  const refreshSession = useCallback(() => {
    return getSession().then(setSession).catch(() => setSession({ authenticated: false, setupRequired: false }));
  }, []);

  useEffect(() => { refreshSession(); }, [refreshSession]);

  // Any request answered "not signed in" (see apiFetch) drops back to the sign-in
  // screen with a note, instead of leaving the page showing errors.
  const [signedOutNote, setSignedOutNote] = useState('');
  useEffect(() => {
    const onEnded = () => {
      setSignedOutNote("You've been signed out — please sign in again.");
      setSession(s => (s && s.authenticated ? { authenticated: false, setupRequired: false } : s));
    };
    window.addEventListener('session-ended', onEnded);
    return () => window.removeEventListener('session-ended', onEnded);
  }, []);

  // One browser holds one sign-in, shared by all its tabs. If someone else signs in
  // (or out) in another tab, this tab would otherwise keep showing the old person's
  // screens while the server answers as the new one. Re-check when the tab comes
  // back into view or a request is refused, and reload if the person has changed.
  const currentUserKey = session?.authenticated ? `${session.user.madrasah?.code}|${session.user.login}|${session.user.role}` : '';

  // Devices that were already signed in also learn which madrasah they belong to, so
  // the sign-in screen and installed app are that madrasah's from now on.
  const madrasahCode = session?.authenticated && !session.user.demo ? session.user.madrasah?.code : '';
  useEffect(() => { if (madrasahCode) setMadrasahCode(madrasahCode); }, [madrasahCode]);
  useEffect(() => {
    if (!currentUserKey) return;
    let checking = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        const s = await getSession();
        const key = s.authenticated ? `${s.user.madrasah?.code}|${s.user.login}|${s.user.role}` : '';
        if (key !== currentUserKey) window.location.reload();
      } catch { /* offline etc. — try again next time */ }
      checking = false;
    };
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);
    window.addEventListener('session-check', check);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
      window.removeEventListener('session-check', check);
    };
  }, [currentUserKey]);

  // The privacy policy and terms open for anyone, signed in or not.
  const legal = { '/privacy': 'privacy', '/terms': 'terms' }[window.location.pathname];
  if (legal) return <LegalPage kind={legal} />;

  // The front page: always at /about, and at / for someone who isn't signed in on a device
  // that doesn't belong to any madrasah yet (staff and parents arrive with ?m=<code>, or the
  // device remembers its code, so they go straight to sign-in). "Sign in" opens /?signin.
  const toSignIn = () => window.location.assign('/?signin');
  if (window.location.pathname === '/about') return <Landing onSignIn={toSignIn} />;
  const params = new URLSearchParams(window.location.search);
  const newVisitor = window.location.pathname === '/' && !getMadrasahCode() && !['m', 'demo', 'signin'].some(k => params.has(k));
  if (newVisitor && session && !session.authenticated && !session.setupRequired) return <Landing onSignIn={toSignIn} />;

  if (session === null) {
    return <div style={{ minHeight: '100vh', background: 'var(--page)' }} />;
  }

  if (!session.authenticated) {
    return <Login setupRequired={session.setupRequired} notice={signedOutNote} onSuccess={() => { setSignedOutNote(''); return refreshSession(); }} />;
  }

  const isOwner = session.user.role === 'owner';

  // A head agrees to the terms for their madrasah before using the app.
  if (session.user.termsNeeded) {
    return <AcceptTerms madrasahName={session.user.madrasah?.name} onAccepted={refreshSession}
      onSignOut={async () => { try { await logout(); } catch {} refreshSession(); }} />;
  }

  // Parents: their own children only, on one page of their own — none of the staff pages.
  if (session.user.role === 'parent') {
    return (
      <AuthProvider value={{ user: session.user }}>
        <SettingsProvider><ParentPortal /></SettingsProvider>
      </AuthProvider>
    );
  }

  return (
    <AuthProvider value={{ user: session.user }}>
      <SettingsProvider>
        <BrowserRouter>
          {isOwner ? (
            <Routes>
              <Route path="/"           element={<Dashboard />} />
              <Route path="/students"   element={<Students />} />
              <Route path="/attendance" element={<Attendance />} />
              <Route path="/fees"       element={<Fees />} />
              <Route path="/records"    element={<DailyRecords />} />
              <Route path="/classes"    element={<ClassesTeachers />} />
              <Route path="/reports"    element={<Reports />} />
              <Route path="/stats"      element={<Stats />} />
              <Route path="/settings"   element={<SettingsPage />} />
              {session.user.platformAdmin && <Route path="/madaaris" element={<Madaaris />} />}
            </Routes>
          ) : (
            // Teachers: their own classes' attendance, daily records and fees only.
            <Routes>
              <Route path="/attendance" element={<Attendance />} />
              <Route path="/fees"       element={<Fees />} />
              <Route path="/records"    element={<DailyRecords />} />
              <Route path="*"           element={<Navigate to="/attendance" replace />} />
            </Routes>
          )}
        </BrowserRouter>
      </SettingsProvider>
    </AuthProvider>
  );
}
