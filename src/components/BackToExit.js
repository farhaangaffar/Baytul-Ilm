import React, { useEffect, useState } from 'react';
import { isStandalone } from '../lib/installPrompt';

// The installed app's back button (Android): it closes any open card first (useBackToClose),
// and switching pages doesn't add steps to go back through (see appNavigate below). Once
// nothing is open, back asks "Close the app?" — a second back closes it, Stay keeps it open.
//
// How: the entry the app opened on is marked as the "base", and one entry is kept above it.
// Backing down onto the base means the person is trying to leave.
export default function BackToExit() {
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (!isStandalone()) return undefined;
    window.history.replaceState({ ...(window.history.state || {}), __appBase: true }, '');
    window.history.pushState({ ...(window.history.state || {}), __appBase: false }, '');
    const onPop = e => { if (e.state && e.state.__appBase) setAsking(true); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  if (!asking) return null;
  const stay = () => { setAsking(false); window.history.forward(); };
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && stay()}>
      <div className="modal" style={{ maxWidth: 340 }}>
        <div className="modal-body" style={{ textAlign: 'center', paddingTop: 26 }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Close the app?</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Press back again to close it.</div>
        </div>
        <div className="modal-footer" style={{ justifyContent: 'center' }}>
          <button className="btn" onClick={() => window.close()}>Close</button>
          <button className="btn btn-primary" onClick={stay}>Stay</button>
        </div>
      </div>
    </div>
  );
}

// Moving between the app's pages: in the installed app each page replaces the last, so back
// doesn't walk through every page visited — it goes straight to "Close the app?".
export function appNavigate(navigate, path) {
  navigate(path, { replace: isStandalone() });
}
