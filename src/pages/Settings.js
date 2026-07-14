import React, { useState, useEffect, useRef, useCallback } from 'react';
import Layout from '../components/Layout';
import { LoadingState, ErrorState } from '../components/DataState';
import { getSettings, updateSettings, getAcademicYears, addAcademicYear, removeAcademicYear, exportAllData, importAllData } from '../lib/store';
import { Save, Plus, Trash2, X, Download, Upload } from 'lucide-react';

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(null);
  const [years, setYears] = useState([]);
  const [newYear, setNewYear] = useState('');
  const [yearError, setYearError] = useState('');
  const [toast, setToast] = useState('');
  const [confirmDel, setConfirmDel] = useState(null);
  const [pendingRestore, setPendingRestore] = useState(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [settingsData, yearsData] = await Promise.all([getSettings(), getAcademicYears()]);
      setForm(settingsData); setYears(yearsData);
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),2500); }

  async function saveSettings() {
    setSaving(true);
    try {
      await updateSettings(form);
      showToast('Settings saved');
      setTimeout(()=>window.location.reload(),600);
    } catch (err) {
      showToast(err.message || 'Could not save settings');
      setSaving(false);
    }
  }

  async function addYear() {
    const y = newYear.trim();
    // accept formats: 2026-27 or 26-27
    const match = y.match(/^(\d{2,4})-(\d{2})$/);
    if (!match) { setYearError('Format must be e.g. 2026-27 or 26-27'); return; }
    const short = match[1].length===4 ? match[1].slice(2)+'-'+match[2] : y;
    if (years.includes(short)) { setYearError('That year already exists'); return; }
    try {
      await addAcademicYear(short);
      setYears(await getAcademicYears());
      setNewYear('');
      setYearError('');
      showToast(`${short} added`);
    } catch (err) {
      setYearError(err.message || 'Could not add year');
    }
  }

  async function doDelete(y) {
    if (years.length<=1) { showToast('You must have at least one academic year'); return; }
    try {
      await removeAcademicYear(y);
      setYears(await getAcademicYears());
      setConfirmDel(null);
      showToast(`${y} removed`);
    } catch (err) {
      showToast(err.message || 'Could not remove year');
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const payload = await exportAllData();
      const blob = new Blob([JSON.stringify(payload,null,2)], { type:'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `baytul-ilm-backup-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Backup downloaded');
    } catch (err) {
      showToast(err.message || 'Could not create backup');
    }
    setExporting(false);
  }

  function handleFileSelect(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { setPendingRestore(JSON.parse(reader.result)); }
      catch { showToast("Could not read that file — is it a valid backup?"); }
    };
    reader.readAsText(file);
  }

  async function confirmRestore() {
    setRestoring(true);
    try {
      await importAllData(pendingRestore);
      setPendingRestore(null);
      showToast('Backup restored — reloading…');
      setTimeout(()=>window.location.reload(),800);
    } catch (err) {
      showToast(err.message || 'Restore failed');
      setPendingRestore(null);
      setRestoring(false);
    }
  }

  if (loading) return <Layout title="Settings"><LoadingState /></Layout>;
  if (error) return <Layout title="Settings"><ErrorState error={error} onRetry={load} /></Layout>;

  return (
    <Layout title="Settings" subtitle="School details, academic years and defaults">
      <div className="grid-2" style={{alignItems:'flex-start'}}>

        {/* School details */}
        <div className="card">
          <div className="card-title" style={{marginBottom:18}}>School details</div>
          <div className="form-grid">
            <div className="form-group">
              <label>Madrasah name (English)</label>
              <input value={form.schoolName} onChange={e=>setForm({...form,schoolName:e.target.value})}/>
            </div>
            <div className="form-group">
              <label>Madrasah name (Arabic)</label>
              <input value={form.schoolNameArabic} onChange={e=>setForm({...form,schoolNameArabic:e.target.value})} dir="rtl" style={{fontFamily:"'Amiri',serif",fontSize:16}}/>
            </div>
            <div className="form-group">
              <label>Default weekly fee (£)</label>
              <input type="number" min="0" step="0.50" value={form.defaultWeeklyFee}
                onChange={e=>setForm({...form,defaultWeeklyFee:Number(e.target.value)})}
                style={{maxWidth:160}}/>
              <span style={{fontSize:12,color:'var(--text-muted)',marginTop:4}}>
                Used when enrolling new students. Can be changed per student.
              </span>
            </div>
          </div>
          <div style={{marginTop:20}}>
            <button className="btn btn-primary" onClick={saveSettings} disabled={saving}><Save size={14}/>{saving?'Saving…':'Save changes'}</button>
          </div>
        </div>

        {/* Academic years */}
        <div className="card">
          <div className="card-title" style={{marginBottom:6}}>Academic years</div>
          <div className="card-sub" style={{marginBottom:16}}>
            Attendance and fee data is stored separately per year. Add new years here — they appear in the switcher on Attendance and Fees pages.
          </div>

          {/* Existing years */}
          <div style={{marginBottom:16}}>
            {years.map(y=>(
              <div key={y} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',borderRadius:'var(--r-md)',background:'#f9fafb',marginBottom:6,border:'1px solid var(--border)'}}>
                <div style={{fontWeight:600,fontSize:14}}>{y}</div>
                <button
                  className="btn btn-icon btn-sm"
                  style={{color:'var(--red)'}}
                  onClick={()=>years.length>1?setConfirmDel(y):showToast('Must have at least one year')}
                  title="Remove year"
                >
                  <Trash2 size={13}/>
                </button>
              </div>
            ))}
          </div>

          {/* Add new year */}
          <div className="form-section-title" style={{marginBottom:12}}><Plus size={13}/>Add academic year</div>
          <div className="flex items-center gap-2" style={{marginBottom:6,flexWrap:'wrap'}}>
            <input
              value={newYear}
              onChange={e=>{ setNewYear(e.target.value); setYearError(''); }}
              placeholder="e.g. 2026-27"
              onKeyDown={e=>e.key==='Enter'&&addYear()}
              style={{flex:1,padding:'8px 14px',border:'1px solid var(--border)',borderRadius:'var(--r-md)',fontFamily:'var(--font)',fontSize:13}}
            />
            <button className="btn btn-teal" onClick={addYear}><Plus size={13}/>Add</button>
          </div>
          {yearError&&<div style={{fontSize:12,color:'var(--red)',marginTop:2}}>{yearError}</div>}
          <div style={{fontSize:12,color:'var(--text-muted)',marginTop:6}}>
            Format: <strong>2026-27</strong> or <strong>26-27</strong>
          </div>
        </div>
      </div>

      {/* Backup & restore */}
      <div className="card" style={{marginTop:16}}>
        <div className="card-title" style={{marginBottom:6}}>Backup &amp; restore</div>
        <div className="card-sub" style={{marginBottom:16}}>
          Download a backup regularly as a safety net, and especially before restoring or migrating data.
        </div>
        <div className="flex items-center gap-2" style={{flexWrap:'wrap'}}>
          <button className="btn btn-primary" onClick={handleExport} disabled={exporting}><Download size={14}/>{exporting?'Preparing…':'Download backup'}</button>
          <button className="btn" onClick={()=>fileInputRef.current?.click()}><Upload size={14}/>Restore from backup</button>
          <input ref={fileInputRef} type="file" accept="application/json" onChange={handleFileSelect} style={{display:'none'}}/>
        </div>
      </div>

      {/* Delete year confirm */}
      {confirmDel&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setConfirmDel(null)}>
          <div className="modal" style={{maxWidth:400}}>
            <div className="modal-body" style={{textAlign:'center',paddingTop:28}}>
              <div style={{width:52,height:52,borderRadius:'50%',background:'var(--red-light)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'}}>
                <Trash2 size={24} color="var(--red)"/>
              </div>
              <div style={{fontSize:16,fontWeight:600,marginBottom:6}}>Remove {confirmDel}?</div>
              <div style={{color:'var(--text-muted)',fontSize:13}}>
                The attendance and fee data for {confirmDel} will remain in storage but the year will no longer appear in the switcher.
              </div>
            </div>
            <div className="modal-footer" style={{justifyContent:'center'}}>
              <button className="btn" onClick={()=>setConfirmDel(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={()=>doDelete(confirmDel)}><Trash2 size={13}/>Remove</button>
            </div>
          </div>
        </div>
      )}

      {pendingRestore&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setPendingRestore(null)}>
          <div className="modal" style={{maxWidth:420}}>
            <div className="modal-body" style={{textAlign:'center',paddingTop:28}}>
              <div style={{width:52,height:52,borderRadius:'50%',background:'var(--red-light)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'}}>
                <Upload size={24} color="var(--red)"/>
              </div>
              <div style={{fontSize:16,fontWeight:600,marginBottom:6}}>Restore this backup?</div>
              <div style={{color:'var(--text-muted)',fontSize:13}}>
                Everything currently stored — students, attendance, fees, daily records — will be replaced with the contents of
                {' '}{pendingRestore.exportedAt ? `the backup from ${new Date(pendingRestore.exportedAt).toLocaleString('en-GB')}` : 'this file'}.
                <br/><span style={{fontSize:12}}>This cannot be undone. The page will reload once it's done, and large backups may take a moment.</span>
              </div>
            </div>
            <div className="modal-footer" style={{justifyContent:'center'}}>
              <button className="btn" onClick={()=>setPendingRestore(null)} disabled={restoring}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmRestore} disabled={restoring}><Upload size={13}/>{restoring?'Restoring…':'Restore backup'}</button>
            </div>
          </div>
        </div>
      )}

      {toast&&<div className="toast">✓ {toast}</div>}
    </Layout>
  );
}
