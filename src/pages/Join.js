import React, { useState, useEffect } from 'react';
import { Plus, Send, CheckCircle, Trash2 } from 'lucide-react';
import { getJoinForm, sendApplication } from '../lib/store';
import { ChoiceBoxes, ParentInputs, DetailInputs, GrowingText } from '../components/StudentDetails';
import { LegalModal, MadeWith } from '../components/Legal';

// A madrasah's online application form (/join/<code>), for parents with the link: their
// child (or children), contacts, home, emergency contact, health and going home. Each child
// goes onto the madrasah's Waiting list (server/routes/join.js); the madrasah gets in touch.

const blankChild = () => ({ forename: '', surname: '', dob: '', gender: '', allergies: '', medical: '', medication: '', walksHome: '',
  boarding: '', schoolYear: '', previousSchool: '', hifdhCompleted: '' });

export default function Join({ code }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [children, setChildren] = useState([blankChild()]);
  const [family, setFamily] = useState({ website: '' });
  const [agree, setAgree] = useState(false);
  const [legal, setLegal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);

  useEffect(() => {
    getJoinForm(code).then(setInfo).catch(err => setError(err.message || 'We couldn\'t open this form.'));
  }, [code]);
  useEffect(() => { if (info?.name) document.title = `Apply — ${info.name}`; }, [info]);

  const du = info?.kind === 'darul_uloom';
  const setChild = (i, k, v) => { setChildren(cs => cs.map((c, j) => (j === i ? { ...c, [k]: v } : c))); setError(''); };
  const setFam = (k, v) => { setFamily(f => ({ ...f, [k]: v })); setError(''); };

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const { website, ...rest } = family;
      const r = await sendApplication({ m: code, children, family: rest, agree, website });
      setSent(r.count || children.length);
      window.scrollTo(0, 0);
    } catch (err) { setError(err.message || 'Something went wrong — please try again.'); }
    setBusy(false);
  }

  const page = { minHeight: '100vh', background: 'var(--page)', padding: '20px 16px 40px' };
  const column = { maxWidth: 560, margin: '0 auto' };
  const header = info && (
    <div className="card" style={{ textAlign: 'center', marginBottom: 14 }}>
      {info.hasLogo && <img src={`/api/settings?logo&m=${encodeURIComponent(code)}`} alt="" style={{ maxHeight: 64, maxWidth: 160, objectFit: 'contain', marginBottom: 8 }} />}
      {info.arabicName && <div style={{ fontFamily: "'Amiri', serif", fontSize: 22, color: 'var(--ink)' }}>{info.arabicName}</div>}
      <div style={{ fontWeight: 700, fontSize: 18 }}>{info.name}</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{sent ? 'Application sent' : 'Apply for a place'}</div>
    </div>
  );

  if (!info) {
    return <div style={page}><div style={column}><div className="card" style={{ fontSize: 13.5, color: error ? 'var(--red)' : 'var(--text-muted)' }}>{error || 'Loading…'}</div></div></div>;
  }

  if (sent) {
    return (
      <div style={page}><div style={column}>
        {header}
        <div className="card" style={{ textAlign: 'center', padding: '28px 20px' }}>
          <CheckCircle size={40} color="var(--green-text)" style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Thank you — your application has been sent</div>
          <div style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>
            {sent === 1 ? 'Your child is' : `Your ${sent} children are`} now on {info.name}'s waiting list. The madrasah will contact you about a place.
          </div>
        </div>
        <MadeWith style={{ marginTop: 18 }} />
      </div></div>
    );
  }

  return (
    <div style={page}>
      <form style={column} onSubmit={submit}>
        {header}
        {info.message && <div className="card" style={{ fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-wrap', marginBottom: 14 }}>{info.message}</div>}

        {children.map((c, i) => (
          <div className="card" key={i} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div className="card-title" style={{ marginBottom: 0 }}>{children.length > 1 ? `Child ${i + 1}` : 'Your child'}</div>
              {children.length > 1 && <button type="button" className="btn btn-sm" onClick={() => setChildren(cs => cs.filter((_, j) => j !== i))}><Trash2 size={12} />Remove</button>}
            </div>
            <div className="form-grid form-grid-2">
              <div className="form-group"><label>First name<span className="required">*</span></label><input value={c.forename} onChange={e => setChild(i, 'forename', e.target.value)} maxLength={80} /></div>
              <div className="form-group"><label>Surname<span className="required">*</span></label><input value={c.surname} onChange={e => setChild(i, 'surname', e.target.value)} maxLength={80} /></div>
              <div className="form-group"><label>Date of birth<span className="required">*</span></label><input type="date" value={c.dob} onChange={e => setChild(i, 'dob', e.target.value)} /></div>
              <div className="form-group"><label>Gender</label><ChoiceBoxes options={['Boy', 'Girl']} value={c.gender} onChange={v => setChild(i, 'gender', v)} /></div>
              {[['allergies', 'Allergies'], ['medical', 'Medical conditions'], ['medication', 'Medication']].map(([k, l]) => (
                <div className="form-group" key={k} style={{ gridColumn: '1 / -1' }}><label>{l}</label>
                  <GrowingText value={c[k]} onChange={e => setChild(i, k, e.target.value)} placeholder="None" maxLength={500} /></div>
              ))}
              {du ? <>
                <div className="form-group"><label>Boarder or day student</label><ChoiceBoxes options={['Boarder', 'Day student']} value={c.boarding} onChange={v => setChild(i, 'boarding', v)} /></div>
                <div className="form-group"><label>School year (if also at school)</label><input value={c.schoolYear} onChange={e => setChild(i, 'schoolYear', e.target.value)} maxLength={40} /></div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>Previous madrasah or school</label><input value={c.previousSchool} onChange={e => setChild(i, 'previousSchool', e.target.value)} maxLength={200} /></div>
                <div className="form-group"><label>Hifdh completed (year)</label><input value={c.hifdhCompleted} onChange={e => setChild(i, 'hifdhCompleted', e.target.value)} maxLength={40} /></div>
              </> : (
                <div className="form-group"><label>Can go home alone</label><ChoiceBoxes options={['Yes', 'No']} value={c.walksHome} onChange={v => setChild(i, 'walksHome', v)} /></div>
              )}
            </div>
          </div>
        ))}
        {children.length < 6 && (
          <button type="button" className="btn" style={{ width: '100%', justifyContent: 'center', marginBottom: 14 }} onClick={() => setChildren(cs => [...cs, { ...blankChild(), surname: cs[cs.length - 1].surname }])}>
            <Plus size={14} />Add a brother or sister
          </button>
        )}

        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-title" style={{ marginBottom: 12 }}>Contacts</div>
          <ParentInputs form={family} set={setFam} required />
          <DetailInputs form={family} set={setFam} isDarulUloom={false} only={['family', 'emergency']} />
          <div className="form-section-title" style={{ marginBottom: 12 }}>Going home</div>
          <div className="form-group"><label>Who else may collect them</label>
            <input value={family.collectors || ''} onChange={e => setFam('collectors', e.target.value)} maxLength={300} /></div>
        </div>
        {/* Only bots fill this in. */}
        <input value={family.website} onChange={e => setFam('website', e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true"
          style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} name="website" />

        <div className="card">
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, cursor: 'pointer', marginBottom: 12 }}>
            <input type="checkbox" checked={agree} onChange={e => { setAgree(e.target.checked); setError(''); }} style={{ marginTop: 3 }} />
            <span>These details are correct and I agree to the madrasah's rules.</span>
          </label>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            Your details go only to {info.name}, kept in Suhuf — see the <button type="button" onClick={() => setLegal(true)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--blue)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>privacy policy</button>.
          </div>
          {error && <div style={{ fontSize: 13, color: 'var(--red)', marginBottom: 12 }}>{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={busy || !agree} style={{ width: '100%', justifyContent: 'center' }}>
            {busy ? 'Sending…' : <><Send size={14} />Send application</>}
          </button>
        </div>
        <MadeWith style={{ marginTop: 18 }} />
      </form>
      {legal && <LegalModal kind="privacy" onClose={() => setLegal(false)} />}
    </div>
  );
}
