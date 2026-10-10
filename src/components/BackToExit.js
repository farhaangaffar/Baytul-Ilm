import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isStandalone } from '../lib/installPrompt';

// The installed app's back button (Android): it closes any open card first (useBackToClose);
// with nothing open it goes to the home page (the Dashboard — Attendance for teachers); on the
// home page it asks "Close the app?" — a second back closes it, Stay keeps it open.
//
// How: history is kept as [base, home, the page you're on]. The base is the entry the app
// opened on; landing back on it means "leave". Moving between pages (appNavigate) replaces the
// page on top, so back from any page lands on home.
let appHome = null; // set while the installed app is running — appNavigate uses it

function useBackToExit(onBase, setup) {
  const onBaseRef = useRef(onBase);
  onBaseRef.current = onBase;
  const setupRef = useRef(setup);
  useEffect(() => {
    if (!isStandalone()) return undefined;
    window.history.replaceState({ ...(window.history.state || {}), __appBase: true }, '');
    setupRef.current();
    const onPop = e => { if (e.state && e.state.__appBase) onBaseRef.current(); };
    window.addEventListener('popstate', onPop);
    return () => { window.removeEventListener('popstate', onPop); appHome = null; };
  }, []);
}

function CloseAppPopup({ onStay }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onStay()}>
      <div className="modal" style={{ maxWidth: 340 }}>
        <div className="modal-body" style={{ textAlign: 'center', paddingTop: 26 }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Close the app?</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Press back again to close it.</div>
        </div>
        {/* No Close button: an app installed from the browser isn't allowed to close itself —
            only the phone's back button can, which is why it's "press back again". */}
        <div className="modal-footer" style={{ justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={onStay}>Stay in the app</button>
        </div>
      </div>
    </div>
  );
}

// Staff (inside the router).
export default function BackToExit({ home = '/' }) {
  const navigate = useNavigate();
  const [asking, setAsking] = useState(false);
  useBackToExit(() => setAsking(true), () => {
    appHome = home;
    const here = window.location.pathname + window.location.search;
    navigate(home);                                   // [base, home]
    const herePath = here.split('?')[0];
    if (herePath !== home && herePath !== '/') navigate(here); // [base, home, page] — '/' just leads home
  });
  if (!asking) return null;
  return <CloseAppPopup onStay={() => { setAsking(false); window.history.forward(); }} />;
}

// Parents have one page, so back (with nothing open) asks to close straight away.
export function ParentBackToExit() {
  const [asking, setAsking] = useState(false);
  useBackToExit(() => setAsking(true), () => window.history.pushState({ ...(window.history.state || {}), __appBase: false }, ''));
  if (!asking) return null;
  return <CloseAppPopup onStay={() => { setAsking(false); window.history.forward(); }} />;
}

// Moving between the app's pages. In the installed app: to home = back down to it; from home
// = one step up; page to page = replace — so back from any page is always home.
export function appNavigate(navigate, path) {
  if (!appHome) { navigate(path); return; }
  const here = window.location.pathname;
  if (path === here) return;
  if (path === appHome) window.history.back();
  else navigate(path, { replace: here !== appHome });
}
