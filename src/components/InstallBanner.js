import React, { useState } from 'react';
import { Download, X } from 'lucide-react';
import { useInstallPrompt } from '../lib/installPrompt';
import InstallSteps from './InstallSteps';

// A slim bar at the top on phones when the app isn't installed yet: "Install" puts it on the
// home screen (Android/Chrome straight away; iPhone shows the Share → Add to Home Screen
// steps). Closing it hides it on this device for 30 days.
const KEY = 'install_banner_hidden_until';

export default function InstallBanner() {
  const { available, install, steps, closeSteps } = useInstallPrompt();
  const [hidden, setHidden] = useState(() => { try { return Number(localStorage.getItem(KEY) || 0) > Date.now(); } catch { return false; } });
  function hide() {
    setHidden(true);
    try { localStorage.setItem(KEY, String(Date.now() + 30 * 24 * 3600e3)); } catch { /* fine */ }
  }
  return (
    <>
      {available && !hidden && (
        <div className="only-narrow" style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--teal-light)', color: 'var(--teal-dark)', padding: '8px 12px 8px 16px', fontSize: 13 }}>
            <Download size={16} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>Get the app on your home screen</span>
            <button className="btn btn-sm btn-primary" style={{ background: 'var(--blue)' }} onClick={install}>Install</button>
            <button onClick={hide} aria-label="Not now" style={{ background: 'none', border: 'none', color: 'var(--teal-dark)', padding: 4, cursor: 'pointer', display: 'flex' }}><X size={16} /></button>
          </div>
        </div>
      )}
      <InstallSteps steps={steps} onClose={closeSteps} />
    </>
  );
}
