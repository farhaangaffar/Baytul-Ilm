import React, { useState, useEffect, useRef, useCallback } from 'react';
import Layout from '../components/Layout';
import { LoadingState, ErrorState } from '../components/DataState';
import { getSettings, updateSettings, getAcademicYears, exportAllData, importAllData, currentSchoolYear, getStudents } from '../lib/store';
import { studentsCsv, downloadText } from '../lib/studentSheet';
import TermsCard from '../components/TermsCard';
import FeeWeeksCard from '../components/FeeWeeksCard';
import FeeMonthsCard from '../components/FeeMonthsCard';
import DaysOffCard from '../components/DaysOffCard';
import { FREQUENCIES } from '../lib/feePeriods';
import { Trash2, Download, Upload, Check, Image as ImageIcon, FileSpreadsheet } from 'lucide-react';
import { setBranding } from '../lib/branding';
import { applySettings } from '../lib/SettingsContext';
import { useAuth } from '../lib/AuthContext';

const CURRENCY_OPTIONS = ['£', '$', '€', 'R', 'RM'];

// Builds both images from an uploaded logo, in the browser:
//  - logo: downsized (longest side ≤ 400px) — plenty for the PDF report's
//    34pt-high masthead, and a few hundred KB whatever size the original was;
//  - icon: a 512px square app icon (home screen, browser tab) with the logo on
//    white inside the central 76%, the safe zone phones keep when they crop
//    icons into circles/rounded squares.
function logoImages(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new window.Image();
    img.onload = () => {
      const scale = Math.min(1, 400 / Math.max(img.width, img.height));
      const logo = document.createElement('canvas');
      logo.width = Math.round(img.width * scale);
      logo.height = Math.round(img.height * scale);
      logo.getContext('2d').drawImage(img, 0, 0, logo.width, logo.height);

      const icon = document.createElement('canvas');
      icon.width = icon.height = 512;
      const ctx = icon.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 512, 512);
      const fit = (512 * 0.76) / Math.max(img.width, img.height);
      const w = img.width * fit, h = img.height * fit;
      ctx.drawImage(img, (512 - w) / 2, (512 - h) / 2, w, h);

      URL.revokeObjectURL(url);
      resolve({ logo: logo.toDataURL('image/png'), icon: icon.toDataURL('image/png') });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that image — try a PNG or JPG.")); };
    img.src = url;
  });
}

export default function Settings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(null);
  const [savedFrequency, setSavedFrequency] = useState('weekly');
  const [savedReportPeriod, setSavedReportPeriod] = useState('monthly');
  const [currentYear, setCurrentYear] = useState('');
  const [years, setYears] = useState([]);
  const [toast, setToast] = useState('');
  const [pendingRestore, setPendingRestore] = useState(null);
  // Everything saves by itself; a small "Saved" tick shows next to what just changed.
  const [savedKey, setSavedKey] = useState('');
  const savedTimer = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const fileInputRef = useRef(null);
  const logoInputRef = useRef(null);
  const [logoVersion, setLogoVersion] = useState(0);
  const [logoBusy, setLogoBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [settingsData, yearsData, cy] = await Promise.all([getSettings(), getAcademicYears(), currentSchoolYear()]);
      setForm(settingsData); setYears(yearsData); setCurrentYear(cy); setSavedFrequency(settingsData.feeFrequency || 'weekly'); setSavedReportPeriod(settingsData.reportPeriod || 'monthly');
      // Logos uploaded before app icons were generated from them — build the
      // missing icon once, quietly, so the installed app picks up the logo too.
      if (settingsData.hasLogo && !settingsData.hasIcon) {
        fetch('/api/settings?logo', { credentials: 'include' })
          .then(r => (r.ok ? r.blob() : Promise.reject()))
          .then(logoImages)
          .then(({ icon }) => updateSettings({ icon }))
          .catch(() => {});
      }
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),2500); }
  function markSaved(key) {
    setSavedKey(key); clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedKey(''), 2000);
  }
  // A field label with the "Saved" tick beside it.
  const Label = ({ k, children }) => (
    <label style={{display:'flex',alignItems:'center',gap:6}}>
      {children}
      {savedKey===k && <span style={{color:'var(--green-text)',fontWeight:600,textTransform:'none',letterSpacing:0,display:'inline-flex',alignItems:'center',gap:2}}><Check size={11}/>Saved</span>}
    </label>
  );
  // Name, Arabic name, currency and default fee: saved when you leave the box.
  async function saveField(key, patch) {
    try {
      await updateSettings(patch);
      if ('schoolName' in patch || 'schoolNameArabic' in patch) applySettings(patch); else setBranding(patch);
      markSaved(key);
    } catch (err) {
      showToast(err.message || 'Could not save');
    }
  }

  // The fee frequency saves straight away (after a confirm) instead of waiting for
  // "Save changes" — it changes how the Fees page works, and it was easy to pick it,
  // go off to add term dates (which save on their own) and never press Save.
  async function changeFrequency(next) {
    if (next === savedFrequency) return;
    const msg = `Switch to charging fees ${FREQUENCIES[next].adjective.toLowerCase()}?\n\n`
      + `Fees already added stay exactly as they are. From now on fees are added per ${FREQUENCIES[next].unit}. `
      + `Student fee amounts are not converted — check them after switching.`
      + (next === 'termly' ? '\n\nA Terms section will appear below for your term dates.' : '');
    if (!window.confirm(msg)) return;
    try {
      await updateSettings({ feeFrequency: next });
      setForm(f => ({ ...f, feeFrequency: next }));
      setSavedFrequency(next);
      setBranding({ feeFrequency: next });
      markSaved('frequency');
    } catch (err) {
      showToast(err.message || 'Could not change the fee frequency');
    }
  }

  // Saved straight away, like the fee frequency.
  async function changeReportPeriod(next) {
    if (next === savedReportPeriod) return;
    const msg = next === 'termly'
      ? 'Make reports termly?\n\nEach student gets one report (one AI summary and behaviour rating) per term, covering attendance and fees for the whole term. Monthly reports already saved stay as they are.\n\nA Terms section will appear below for your term dates.'
      : 'Make reports monthly?\n\nEach student gets one report per month. Termly reports already saved stay as they are.';
    if (!window.confirm(msg)) return;
    try {
      await updateSettings({ reportPeriod: next });
      setForm(f => ({ ...f, reportPeriod: next }));
      setSavedReportPeriod(next);
      setBranding({ reportPeriod: next });
      markSaved('reports');
    } catch (err) {
      showToast(err.message || 'Could not change the report period');
    }
  }

  // Saved straight away, like the fee and report choices.
  async function changeParentPortal(on) {
    try {
      await updateSettings({ parentPortal: on });
      setForm(f => ({ ...f, parentPortal: on }));
      markSaved('portal');
    } catch (err) {
      showToast(err.message || 'Could not change the parent portal');
    }
  }

  // School days and automatic fees — saved straight away too.
  async function changeSchoolDays(day) {
    const cur = form.schoolDays?.length ? form.schoolDays : [1, 2, 3, 4];
    const next = cur.includes(day) ? cur.filter(d => d !== day) : [...cur, day].sort();
    if (!next.length) { showToast('Choose at least one school day'); return; }
    try {
      await updateSettings({ schoolDays: next });
      setForm(f => ({ ...f, schoolDays: next }));
      setBranding({ schoolDays: next });
      markSaved('days');
    } catch (err) {
      showToast(err.message || 'Could not change the school days');
    }
  }
  async function changeFeeAuto(on) {
    try {
      await updateSettings({ feeAuto: on });
      setForm(f => ({ ...f, feeAuto: on }));
      setBranding({ feeAuto: on });
      markSaved('auto');
    } catch (err) {
      showToast(err.message || 'Could not change this');
    }
  }

  async function handleLogoSelect(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setLogoBusy(true);
    try {
      await updateSettings(await logoImages(file));
      setForm(f => ({ ...f, hasLogo: true }));
      setLogoVersion(v => v + 1);
      markSaved('logo');
    } catch (err) {
      showToast(err.message || 'Could not save logo');
    }
    setLogoBusy(false);
  }

  async function removeLogo() {
    setLogoBusy(true);
    try {
      await updateSettings({ logo: null, icon: null });
      setForm(f => ({ ...f, hasLogo: false }));
      markSaved('logo');
    } catch (err) {
      showToast(err.message || 'Could not remove logo');
    }
    setLogoBusy(false);
  }

  async function handleExport() {
    setExporting(true);
    try {
      const payload = await exportAllData();
      const blob = new Blob([JSON.stringify(payload,null,2)], { type:'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(form.schoolName || 'madrasah').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'madrasah'}-backup-${new Date().toISOString().slice(0,10)}.json`;
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

  async function downloadStudents() {
    setExporting(true);
    try {
      const list = await getStudents();
      const order = { Active: 0, 'Waiting list': 1, Inactive: 2 };
      list.sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3) || a.class.localeCompare(b.class) || a.forename.localeCompare(b.forename));
      downloadText(studentsCsv(list), `${(form.schoolName || 'madrasah').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'madrasah'}-students-${new Date().toISOString().slice(0,10)}.csv`);
      showToast('Spreadsheet downloaded');
    } catch (err) {
      showToast(err.message || 'Could not make the spreadsheet');
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

  const showTerms = years.length > 0 && (savedFrequency === 'termly' || savedReportPeriod === 'termly');

  return (
    <Layout title="Settings" subtitle="Your madrasah, fees, classes and backups">
      {/* Everything on this page saves by itself — no Save button. */}

      {/* Your madrasah */}
      <div className="card">
        <div className="card-title" style={{marginBottom: user?.madrasah?.code ? 4 : 16}}>Your madrasah</div>
        {user?.madrasah?.code && (
          <div className="card-sub" style={{marginBottom:16}}>
            Sign-in code <strong style={{color:'var(--ink)'}}>{user.madrasah.code}</strong> — staff type this the first time on a device.
          </div>
        )}
        <div className="form-grid school-grid">
          <div className="form-group">
            <Label k="name">Name (English)</Label>
            <input value={form.schoolName} onChange={e=>setForm({...form,schoolName:e.target.value})}
              onBlur={()=>form.schoolName.trim() && saveField('name', { schoolName: form.schoolName.trim() })}/>
          </div>
          <div className="form-group">
            <Label k="arabic">Name (Arabic)</Label>
            <input value={form.schoolNameArabic} onChange={e=>setForm({...form,schoolNameArabic:e.target.value})} dir="rtl" style={{fontFamily:"'Amiri',serif",fontSize:16}}
              onBlur={()=>saveField('arabic', { schoolNameArabic: form.schoolNameArabic })}/>
          </div>
          <div className="form-group">
            <Label k="logo">Logo</Label>
            <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
              <div style={{width:44,height:44,borderRadius:'var(--r-md)',border:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center',background:'#fff',overflow:'hidden',flexShrink:0}}>
                {form.hasLogo
                  ? <img src={`/api/settings?logo&v=${logoVersion}`} alt="School logo" style={{maxWidth:'100%',maxHeight:'100%'}}/>
                  : <ImageIcon size={18} style={{color:'var(--text-soft)'}}/>}
              </div>
              <button type="button" className="btn btn-sm" onClick={()=>logoInputRef.current?.click()} disabled={logoBusy}>
                <Upload size={13}/>{form.hasLogo ? 'Change' : 'Upload'}
              </button>
              {form.hasLogo && (
                <button type="button" className="btn btn-sm" style={{color:'var(--red)'}} onClick={removeLogo} disabled={logoBusy}>
                  <Trash2 size={13}/>Remove
                </button>
              )}
              <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoSelect} style={{display:'none'}}/>
            </div>
            <span style={{fontSize:12,color:'var(--text-muted)',marginTop:4}}>On reports and as the app icon.</span>
          </div>
        </div>
      </div>

      {/* Fees */}
      <div className="card" style={{marginTop:16}}>
        <div className="card-title" style={{marginBottom:16}}>Fees</div>
        <div className="form-grid fees-grid">
          <div className="form-group">
            <Label k="frequency">Fees are charged</Label>
            <select value={(savedFrequency || 'weekly')} onChange={e=>changeFrequency(e.target.value)}>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="termly">Termly</option>
            </select>
            {savedFrequency === 'termly' && <span style={{fontSize:12,color:'var(--text-muted)',marginTop:4}}>Add your term dates under Terms.</span>}
          </div>
          <div className="form-group">
            <Label k="currency">Currency</Label>
            <select value={CURRENCY_OPTIONS.includes(form.currencySymbol) ? form.currencySymbol : 'other'}
              onChange={e=>{ const v = e.target.value==='other' ? '' : e.target.value; setForm({...form,currencySymbol:v}); if (v) saveField('currency', { currencySymbol: v }); }}>
              {CURRENCY_OPTIONS.map(c=><option key={c} value={c}>{c}</option>)}
              <option value="other">Other…</option>
            </select>
            {!CURRENCY_OPTIONS.includes(form.currencySymbol) && (
              <input value={form.currencySymbol||''} maxLength={4} placeholder="e.g. Rs"
                onChange={e=>setForm({...form,currencySymbol:e.target.value})}
                onBlur={()=>form.currencySymbol && saveField('currency', { currencySymbol: form.currencySymbol })}
                style={{marginTop:6}}/>
            )}
          </div>
          <div className="form-group">
            <Label k="fee">Default fee per {FREQUENCIES[(savedFrequency || 'weekly')].unit}</Label>
            <input type="number" min="0" step="0.50" value={form.defaultWeeklyFee}
              onChange={e=>setForm({...form,defaultWeeklyFee:Number(e.target.value)})}
              onBlur={()=>saveField('fee', { defaultWeeklyFee: Number(form.defaultWeeklyFee) || 0 })}/>
            <span style={{fontSize:12,color:'var(--text-muted)',marginTop:4}}>For new students — each child's fee can be changed.</span>
          </div>
          <div className="form-group">
            <Label k="auto">Add fees automatically</Label>
            <select value={form.feeAuto === false ? 'off' : 'on'} onChange={e=>changeFeeAuto(e.target.value==='on')}>
              <option value="on">On</option>
              <option value="off">Off — add them by hand</option>
            </select>
            {form.feeAuto !== false && (
              <span style={{fontSize:12,color:'var(--text-muted)',marginTop:4}}>
                {(savedFrequency || 'weekly') === 'weekly' ? 'Choose the weeks under Fee weeks.' : `Each ${FREQUENCIES[savedFrequency].unit}'s fees are added when it starts.`}
              </span>
            )}
          </div>
        </div>
      </div>
      {/* Fee weeks — weekly fees added automatically: which weeks are charged */}
      {years.length > 0 && (savedFrequency || 'weekly') === 'weekly' && form.feeAuto !== false && <FeeWeeksCard years={years} defaultYear={currentYear} />}
      {/* Fee months — monthly fees added automatically: which months are charged */}
      {years.length > 0 && savedFrequency === 'monthly' && form.feeAuto !== false && <FeeMonthsCard years={years} defaultYear={currentYear} />}

      {/* Classes & parents */}
      <div className="card" style={{marginTop:16}}>
        <div className="card-title" style={{marginBottom:16}}>Classes &amp; parents</div>
        <div className="form-grid school-grid">
          <div className="form-group">
            <Label k="days">School days</Label>
            <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
              {[[1,'Mon'],[2,'Tue'],[3,'Wed'],[4,'Thu'],[5,'Fri'],[6,'Sat'],[0,'Sun']].map(([d,l])=>{
                const on = (form.schoolDays?.length ? form.schoolDays : [1,2,3,4]).includes(d);
                return (
                  <button key={d} type="button" onClick={()=>changeSchoolDays(d)} aria-pressed={on}
                    style={{flex:'1 1 0',minWidth:40,height:36,borderRadius:8,fontFamily:'var(--font)',fontSize:12.5,fontWeight:600,cursor:'pointer',
                      border:`1px solid ${on?'var(--green)':'#dfe3e8'}`,background:on?'var(--green-light)':'#fafbfc',color:on?'var(--green-text)':'var(--text-muted)'}}>
                    {l}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="form-group">
            <Label k="reports">Reports are made</Label>
            <select value={savedReportPeriod} onChange={e=>changeReportPeriod(e.target.value)}>
              <option value="monthly">Monthly</option>
              <option value="termly">Termly</option>
            </select>
          </div>
          <div className="form-group">
            <Label k="portal">Parent portal</Label>
            <select value={form.parentPortal ? 'on' : 'off'} onChange={e=>changeParentPortal(e.target.value==='on')}>
              <option value="off">Off</option>
              <option value="on">On — parents can sign in</option>
            </select>
            {form.parentPortal && <span style={{fontSize:12,color:'var(--text-muted)',marginTop:4}}>Set up each family's login from a student's profile.</span>}
          </div>
        </div>
      </div>

      {/* Days off — closed days (Eid etc.); Attendance shows them as closed */}
      <DaysOffCard />

      {/* Terms — only needed (and shown) when fees are charged or reports are made termly */}
      {showTerms && <TermsCard years={years} defaultYear={currentYear} />}

      {/* Backup & restore (not in the demo — its data is made up) */}
      {!user?.demo && <div className="card" style={{marginTop:16}}>
        <div className="card-title" style={{marginBottom:6}}>Backup &amp; restore</div>
        <div className="card-sub" style={{marginBottom:16}}>
          Download one regularly, and always before restoring. The spreadsheet lists every student and their parents' details.
        </div>
        <div className="flex items-center gap-2" style={{flexWrap:'wrap'}}>
          <button className="btn btn-primary" onClick={handleExport} disabled={exporting}><Download size={14}/>{exporting?'Preparing…':'Download backup'}</button>
          <button className="btn" onClick={downloadStudents} disabled={exporting}><FileSpreadsheet size={14}/>Students spreadsheet</button>
          <button className="btn" onClick={()=>fileInputRef.current?.click()}><Upload size={14}/>Restore from backup</button>
          <input ref={fileInputRef} type="file" accept="application/json" onChange={handleFileSelect} style={{display:'none'}}/>
        </div>
      </div>}

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
