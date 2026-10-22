import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import './lib/installPrompt';
import { rememberReferral } from './lib/referral';

rememberReferral(); // a "Recommend Suhuf" link (?ref=<code>) — kept for when they sign up

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);

// Installable-app support (see public/sw.js). Production only — in development a
// service worker would serve cached bundles over the hot-reloading dev server.
if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
  // Always fetch sw.js fresh, and check for a new one whenever the app comes back to the
  // front — an installed app is often resumed for days rather than reloaded.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(reg => {
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    }).catch(() => {});
  });
}
