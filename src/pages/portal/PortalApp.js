import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import PortalLogin from './PortalLogin';
import SalaahTimesPage from './SalaahTimesPage';
import TalksPage from './TalksPage';
import MasaajidAdmin from './MasaajidAdmin';
import { portalSession } from '../../lib/portalApi';

// Mounted at /portal/* — its own login and auth state, entirely separate from
// the madrasah admin dashboard mounted at "/".
export default function PortalApp() {
  const [session, setSession] = useState(null); // null = checking, false = signed out, else {role, masjidId}

  useEffect(() => {
    portalSession().then(s => setSession(s.authenticated ? s : false)).catch(() => setSession(false));
  }, []);

  if (session === null) return <div style={{ minHeight: '100vh', background: 'var(--page)' }} />;
  if (!session) return <PortalLogin onSuccess={setSession} />;

  return (
    <Routes>
      <Route path="/" element={<Navigate to="salaah-times" replace />} />
      <Route path="salaah-times" element={<SalaahTimesPage session={session} />} />
      <Route path="talks" element={<TalksPage session={session} />} />
      {session.role === 'super_admin' && <Route path="masaajid" element={<MasaajidAdmin session={session} />} />}
      <Route path="*" element={<Navigate to="salaah-times" replace />} />
    </Routes>
  );
}
