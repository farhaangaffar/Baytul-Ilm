import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard       from './pages/Dashboard';
import Students        from './pages/Students';
import Attendance      from './pages/Attendance';
import Fees            from './pages/Fees';
import DailyRecords    from './pages/DailyRecords';
import ClassesTeachers from './pages/ClassesTeachers';
import Reports         from './pages/Reports';
import SettingsPage    from './pages/Settings';
import Login           from './pages/Login';
import { checkSession } from './lib/store';

export default function App() {
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
    <BrowserRouter>
      <Routes>
        <Route path="/"           element={<Dashboard />} />
        <Route path="/students"   element={<Students />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/fees"       element={<Fees />} />
        <Route path="/records"    element={<DailyRecords />} />
        <Route path="/classes"    element={<ClassesTeachers />} />
        <Route path="/reports"    element={<Reports />} />
        <Route path="/settings"   element={<SettingsPage />} />
      </Routes>
    </BrowserRouter>
  );
}
