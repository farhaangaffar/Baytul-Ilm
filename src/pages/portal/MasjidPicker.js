import React, { useState, useEffect } from 'react';
import { listMasaajid } from '../../lib/portalApi';

// Super_admin accounts aren't scoped to one masjid, so any page they use that
// operates on a single masjid (salaah times, talks) needs this to pick which one.
export default function MasjidPicker({ value, onChange }) {
  const [masaajid, setMasaajid] = useState(null);

  useEffect(() => { listMasaajid().then(setMasaajid).catch(() => setMasaajid([])); }, []);

  useEffect(() => {
    if (masaajid?.length && !value) onChange(masaajid[0].id);
  }, [masaajid, value, onChange]);

  if (!masaajid) return null;
  if (!masaajid.length) {
    return <div className="card" style={{ color: 'var(--text-muted)', fontSize: 13 }}>No masaajid have been added yet — add one under "Masaajid" first.</div>;
  }

  return (
    <div className="form-group" style={{ maxWidth: 320, marginBottom: 16 }}>
      <label>Masjid</label>
      <select value={value || ''} onChange={e => onChange(e.target.value)}>
        {masaajid.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
    </div>
  );
}
