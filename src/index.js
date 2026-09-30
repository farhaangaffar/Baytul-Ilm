import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import './lib/installPrompt';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);

// Installable-app support (see public/sw.js). Production only — in development a
// service worker would serve cached bundles over the hot-reloading dev server.
if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
