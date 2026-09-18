import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
import PortalApp       from './pages/portal/PortalApp';
import { checkSession } from './lib/store';
import { SettingsProvider } from './lib/SettingsContext';

// The madrasah admin dashboard — gated behind the single shared madrasah
// password, same as before. Kept separate from the masjid portal below, which
// has its own per-masjid login and must stay reachable without this auth.
function MadrasahApp() {
  const [authed, setAuthed] = useState(null); // null = still checking

  useEffect(() => {
    checkSession().then(setAuthed).catch(() => setAuthed(false));
  }, []);

  if (authed === null) {
    return <div style={{ minHeight: '100vh', background: 'var(--page)' }} />;
  }

  if (!authed) {
    return <Login onSuccess={() => setAuthed(true)} />;
  }

  return (
    <SettingsProvider>
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
      </Routes>
    </SettingsProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/portal/*" element={<PortalApp />} />
        <Route path="/*" element={<MadrasahApp />} />
      </Routes>
    </BrowserRouter>
  );
}
