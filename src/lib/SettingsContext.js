import React, { createContext, useContext, useState, useEffect } from 'react';
import { getSettings } from './store';

const DEFAULT_SETTINGS = { schoolName: "Baytul 'Ilm Madrasah", schoolNameArabic: '' };
const SettingsContext = createContext(DEFAULT_SETTINGS);

// Fetched once here, above the router, instead of inside Layout — Layout renders fresh
// on every page navigation (each page mounts its own <Layout>), so fetching there meant
// every navigation briefly showed a hardcoded fallback name before the real one loaded.
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  useEffect(() => { getSettings().then(setSettings).catch(() => {}); }, []);
  return <SettingsContext.Provider value={settings}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  return useContext(SettingsContext);
}
