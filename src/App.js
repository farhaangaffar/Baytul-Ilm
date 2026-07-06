import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard       from './pages/Dashboard';
import Students        from './pages/Students';
import Attendance      from './pages/Attendance';
import Fees            from './pages/Fees';
import DailyRecords    from './pages/DailyRecords';
import ClassesTeachers from './pages/ClassesTeachers';
import Reports         from './pages/Reports';
import SettingsPage    from './pages/Settings';

export default function App() {
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
