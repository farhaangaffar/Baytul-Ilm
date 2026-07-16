// components/EnrollmentForm.js
import React, { useState, useEffect } from 'react';
import { X, User, Phone, BookOpen, ChevronRight, CheckCircle } from 'lucide-react';
import { addStudent, getClassNames, getDefaultWeeklyFee } from '../lib/store';

function emptyForm(defaultWeeklyFee) {
  return {
    forename: '', surname: '', dob: '',
    parent1Name: '', parent1Phone: '', parent2Name: '', parent2Phone: '',
    enrollDate: new Date().toISOString().split('T')[0],
    class: '', weeklyFee: defaultWeeklyFee,
    notes: '',
  };
}

const steps = ['Student details', 'Parent contacts', 'Class & fees'];

export default function EnrollmentForm({ onClose, onSaved }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(emptyForm(15));
  const [errors, setErrors] = useState({});
  const [done, setDone] = useState(false);
  const [saved, setSaved] = useState(null);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [classNames, setClassNames] = useState([]);

  useEffect(() => {
    getClassNames().then(setClassNames).catch(() => {});
    getDefaultWeeklyFee().then(fee => setForm(f => ({ ...f, weeklyFee: fee }))).catch(() => {});
  }, []);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  function validate() {
    const e = {};
    if (step === 0) {
      if (!form.forename.trim()) e.forename = 'Required';
      if (!form.surname.trim()) e.surname = 'Required';
      if (!form.dob) e.dob = 'Required';
    }
    if (step === 1) {
      if (!form.parent1Name.trim()) e.parent1Name = 'Required';
      if (!form.parent1Phone.trim()) e.parent1Phone = 'Required';
    }
    if (step === 2) {
      if (!form.class) e.class = 'Required';
      if (!form.weeklyFee || Number(form.weeklyFee) <= 0) e.weeklyFee = 'Required';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function next() { if (validate()) setStep(s => s + 1); }
  function back() { setStep(s => s - 1); }

  async function submit() {
    if (!validate()) return;
    setSaving(true);
    setSubmitError('');
    try {
      const s = await addStudent({ ...form, weeklyFee: Number(form.weeklyFee) });
      setSaved(s);
      setDone(true);
      onSaved && onSaved(s);
    } catch (err) {
      setSubmitError(err.message || 'Could not enroll this student — try again.');
    }
    setSaving(false);
  }

  const field = (label, key, type = 'text', required = false, opts = null) => (
    <div className="form-group">
      <label>{label}{required && <span className="required">*</span>}</label>
      {opts ? (
        <select value={form[key]} onChange={e => set(key, e.target.value)}>
          <option value="">Select…</option>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} value={form[key]} onChange={e => set(key, e.target.value)} />
      )}
      {errors[key] && <span style={{ fontSize: 11, color: 'var(--red)' }}>{errors[key]}</span>}
    </div>
  );

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div>
            <div className="modal-title">Enroll new student</div>
            {!done && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                {steps.map((s, i) => (
                  <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 600,
                      background: i < step ? 'var(--teal)' : i === step ? 'var(--ink)' : 'var(--border)',
                      color: i <= step ? '#fff' : 'var(--text-muted)',
                    }}>{i < step ? '✓' : i + 1}</div>
                    <span style={{ color: i === step ? 'var(--text)' : 'var(--text-muted)', fontWeight: i === step ? 600 : 400 }}>{s}</span>
                    {i < steps.length - 1 && <ChevronRight size={12} color="var(--text-soft)" />}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button className="btn btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="modal-body">
          {done ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--teal-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <CheckCircle size={28} color="var(--teal)" />
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                {saved?.class === 'Waiting list' ? 'Added to waiting list' : 'Student enrolled'}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
                {saved?.class === 'Waiting list' ? (
                  <>{saved?.forename} {saved?.surname} has been added to the <strong>waiting list</strong>.</>
                ) : (
                  <>{saved?.forename} {saved?.surname} has been added to <strong>{saved?.class}</strong> at £{saved?.weeklyFee}/week.</>
                )}
              </div>
              <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius-md)', padding: '12px 16px', textAlign: 'left', fontSize: 12, color: 'var(--text-muted)' }}>
                {saved?.class === 'Waiting list' ? (
                  <div>⏳ Move them to a class from the Waiting list tab on Students once a space opens up</div>
                ) : (
                  <>
                    <div>📋 Added to the {saved?.class} attendance register</div>
                    <div style={{ marginTop: 4 }}>💷 Use "Charge this week" on the Fees page to start billing</div>
                  </>
                )}
              </div>
            </div>
          ) : step === 0 ? (
            <div>
              <div className="form-section-title"><User size={14} />Student details</div>
              <div className="form-grid form-grid-2" style={{ marginTop: 14 }}>
                {field('Forename', 'forename', 'text', true)}
                {field('Surname', 'surname', 'text', true)}
                {field('Date of birth', 'dob', 'date', true)}
                {field('Enrolment date', 'enrollDate', 'date')}
              </div>
            </div>
          ) : step === 1 ? (
            <div>
              <div className="form-section-title"><Phone size={14} />Parent / guardian contacts</div>
              <div className="form-grid form-grid-2" style={{ marginTop: 14 }}>
                {field('Parent 1 name', 'parent1Name', 'text', true)}
                {field('Parent 1 phone', 'parent1Phone', 'tel', true)}
                {field('Parent 2 name (optional)', 'parent2Name')}
                {field('Parent 2 phone (optional)', 'parent2Phone', 'tel')}
              </div>
            </div>
          ) : (
            <div>
              <div className="form-section-title"><BookOpen size={14} />Class & fees</div>
              <div className="form-grid form-grid-2" style={{ marginTop: 14 }}>
                {field('Class', 'class', 'text', true, [...classNames, 'Waiting list'])}
                {field('Weekly fee (£)', 'weeklyFee', 'number', true)}
              </div>
              <div className="form-grid" style={{ marginTop: 14 }}>
                <div className="form-group">
                  <label>Notes (optional)</label>
                  <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any notes about this student…" style={{ resize: 'vertical' }} />
                </div>
              </div>
              {submitError && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 12 }}>{submitError}</div>}
            </div>
          )}
        </div>

        <div className="modal-footer">
          {!done && step > 0 && <button className="btn" onClick={back}>Back</button>}
          {!done && step < 2 && <button className="btn btn-primary" onClick={next}>Continue</button>}
          {!done && step === 2 && <button className="btn btn-gold" onClick={submit} disabled={saving}>{saving ? 'Enrolling…' : 'Enroll student'}</button>}
          {done && <button className="btn btn-primary" onClick={onClose}>Close</button>}
        </div>
      </div>
    </div>
  );
}
