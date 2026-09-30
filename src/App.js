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
import { getSession, setSessionRole } from './lib/store';
import { SettingsProvider } from './lib/SettingsContext';
import { AuthProvider } from './lib/AuthContext';

export default function App() {
  const [session, setSession] = useState(null); // null = still checking

  const refreshSession = useCallback(() => {
    return getSession().then(setSession).catch(() => setSession({ authenticated: false, setupRequired: false }));
  }, []);

  useEffect(() => { refreshSession(); }, [refreshSession]);

  if (session === null) {
    return <div style={{ minHeight: '100vh', background: 'var(--page)' }} />;
  }

  if (!session.authenticated) {
    return <Login setupRequired={session.setupRequired} onSuccess={refreshSession} />;
  }

  const isOwner = session.user.role === 'owner';
  setSessionRole(session.user.role);

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
