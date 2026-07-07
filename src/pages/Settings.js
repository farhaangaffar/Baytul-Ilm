// pages/Settings.js
import React, { useState } from 'react';
import Layout from '../components/Layout';
import { getSettings, updateSettings } from '../lib/store';
import { Save } from 'lucide-react';

export default function Settings() {
  const [form, setForm] = useState(getSettings);
  const [toast, setToast] = useState('');

  function save() {
    updateSettings(form);
    setToast('Settings saved — refreshing…');
    setTimeout(() => window.location.reload(), 800);
  }

  return (
    <Layout title="Settings" subtitle="Madrasah name and defaults">
      <div className="card" style={{ maxWidth: 560 }}>
        <div className="card-title" style={{ marginBottom: 18 }}>School details</div>
        <div className="form-grid">
          <div className="form-group">
            <label>Madrasah name (English)</label>
            <input value={form.schoolName} onChange={e => setForm({ ...form, schoolName: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Madrasah name (Arabic, optional)</label>
            <input value={form.schoolNameArabic} onChange={e => setForm({ ...form, schoolNameArabic: e.target.value })} dir="rtl" style={{ fontFamily: "'Amiri', serif", fontSize: 16 }} />
          </div>
          <div className="form-group">
            <label>Default weekly fee (£)</label>
            <input type="number" min="0" step="0.50" value={form.defaultWeeklyFee} onChange={e => setForm({ ...form, defaultWeeklyFee: Number(e.target.value) })} style={{ maxWidth: 140 }} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Used as the default when enrolling new students. Individual student fees can still be changed per student.</span>
          </div>
        </div>
        <div style={{ marginTop: 20 }}>
          <button className="btn btn-rose" onClick={save}><Save size={14} />Save changes</button>
        </div>
      </div>
      {toast && <div className="toast">✓ {toast}</div>}
    </Layout>
  );
}
