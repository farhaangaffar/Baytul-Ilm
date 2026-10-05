import React, { createContext, useContext, useState, useEffect } from 'react';
import { getSettings } from './store';
import { getBranding, setBranding } from './branding';

const SettingsContext = createContext(getBranding());
let pushSettings = null;

// Updates the madrasah's name/logo everywhere straight away after Settings saves them
// (the sidebar and top bar read them from here).
export function applySettings(patch) {
  setBranding(patch);
  if (pushSettings) pushSettings(patch);
}

// Fetched once here, above the router, instead of inside Layout — Layout renders fresh
// on every page navigation (each page mounts its own <Layout>), so fetching there meant
// every navigation briefly showed a hardcoded fallback name before the real one loaded.
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(getBranding());
  pushSettings = patch => setSettings(s => ({ ...s, ...patch }));
  useEffect(() => {
    getSettings().then(s => { setBranding(s); setSettings(s); }).catch(() => {});
  }, []);
  // Keyed on the currency so a changed symbol re-renders pages that format money
  // through the non-React money() helper rather than this context.
  return (
    <SettingsContext.Provider value={settings}>
      <React.Fragment key={`${settings.currencySymbol}|${settings.feeFrequency}|${settings.reportPeriod}|${settings.schoolDays}|${settings.feeAuto}`}>{children}</React.Fragment>
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
