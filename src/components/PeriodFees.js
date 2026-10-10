import React, { useState, useEffect, useCallback } from 'react';
import Layout from './Layout';
import { LoadingState, ErrorState } from './DataState';
import {
  getFees, getStudents, getClassNames, getAcademicYears, currentSchoolYear, getTerms,
  markFeePaid, markFeeUnpaid, updateFeeAmount, addFeePeriods, deleteFeePeriods, hasEnrolledBy, addStudentPeriod,
} from '../lib/store';
import { feePeriodsForYear, currentFeePeriod, feeTotals, FREQUENCIES, feePer } from '../lib/feePeriods';
import { money, getBranding } from '../lib/branding';
import { useAuth } from '../lib/AuthContext';
import { useBackToClose } from '../lib/useBackToClose';
import { Check, X, Pencil, Plus, Trash2, ArrowLeft } from 'lucide-react';
import { FeeRowList, FeeTiles } from './FeeRows';

function isoToday() { return new Date().toISOString().split('T')[0]; }

// The Fees page for madrasahs that charge monthly (calendar months) or termly (their
// own term dates, Settings → Terms). Weekly charging keeps the original Fees page.
// One fee record per student per period; same permissions as weekly — teachers can
// only mark a period as paid, everything else is owner-only (enforced server-side).
export default function PeriodFees({ frequency }) {
  const { isOwner } = useAuth();
  const freq = FREQUENCIES[frequency];
  const unit = freq.unit; // "month" | "term"
  // Anyone can tick a fee paid or untick it (a mistake); only the head adds or removes them.
  const canToggle = () => true;
  // Automatic fees: the head adds a month/term for one child (paying ahead, or put back) by
  // tapping their grey box — the Add/Remove a month/term buttons are only for manual fees.
  const auto = getBranding().feeAuto !== false;
  const [addOne, setAddOne] = useState(null); // { studentId, p }

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [students, setStudents] = useState([]);
  const [classNames, setClassNames] = useState([]);
  const [years, setYears] = useState([]);
  const [year, setYear] = useState('');
  const [currentYear, setCurrentYear] = useState('');
  const [fees, setFees] = useState([]);
  const [terms, setTerms] = useState([]);
  const [activeClass, setActiveClass] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [confirmToggle, setConfirmToggle] = useState(null);
  const [toggling, setToggling] = useState(false);
  const [editCell, setEditCell] = useState(null);
  const [periodModal, setPeriodModal] = useState(null); // { mode: 'add' | 'remove', key }
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const y = await currentSchoolYear();
      const [studentsData, classNamesData, yearsData, feesData, termsData] = await Promise.all([
        getStudents(), getClassNames(), getAcademicYears(), getFees(y), frequency === 'termly' ? getTerms() : Promise.resolve([]),
      ]);
      setStudents(studentsData); setClassNames(classNamesData); setYears(yearsData);
      setYear(y); setCurrentYear(y); setFees(feesData); setTerms(termsData);
      setActiveClass(prev => prev && classNamesData.includes(prev) ? prev : (classNamesData[0] || ''));
    } catch (err) { setError(err); }
    setLoading(false);
  }, [frequency]);
  useEffect(() => { load(); }, [load]);
  const closeStudent = useBackToClose(!!selectedId, () => setSelectedId(null));

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2500); }
  async function refresh(y) { setFees(await getFees(y || year)); }
  async function switchYear(y) {
    setYear(y);
    try { await refresh(y); } catch (err) { showToast(err.message || 'Could not load that year'); }
  }

  if (loading) return <Layout title="Fees"><LoadingState /></Layout>;
  if (error) return <Layout title="Fees"><ErrorState error={error} onRetry={load} /></Layout>;

  const periods = feePeriodsForYear(frequency, year, terms);
  const today = isoToday();
  const current = currentFeePeriod(frequency, terms.filter(t => t.year === year), year === currentYear ? today : periods[0]?.start);
  const classStudents = students.filter(s => s.class === activeClass && s.status === 'Active' && hasEnrolledBy(s, today));
  const ids = new Set(classStudents.map(s => s.id));
  // Only this frequency's records — weekly records from before a switch stay on their own.
  const periodFees = fees.filter(f => f.period === freq.period);
  const classFees = periodFees.filter(f => ids.has(f.studentId));
  const periodTotals = current ? feeTotals(classFees, current.start, current.endExclusive) : { collected: 0, outstanding: 0 };
  const feeFor = (sid, p) => periodFees.find(f => f.studentId === sid && f.weekStarting === p.start);

  async function confirmTogglePaid() {
    const fee = confirmToggle;
    const wasPaid = fee.status === 'Paid';
    setToggling(true);
    setFees(prev => prev.map(f => f.id === fee.id ? { ...f, status: wasPaid ? 'Pending' : 'Paid', paidDate: wasPaid ? null : today } : f));
    try {
      if (wasPaid) await markFeeUnpaid(fee.id, year); else await markFeePaid(fee.id, year);
      setConfirmToggle(null);
    } catch (err) {
      setFees(prev => prev.map(f => f.id === fee.id ? { ...f, status: fee.status, paidDate: fee.paidDate } : f));
      showToast(err.message || 'Could not update this record');
    }
    setToggling(false);
  }

  async function saveAmount(feeId) {
    const val = parseFloat(editCell.val);
    if (!isNaN(val) && val >= 0) {
      try { await updateFeeAmount(feeId, val, year); await refresh(); showToast('Amount updated'); }
      catch (err) { showToast(err.message || 'Could not update amount'); }
    }
    setEditCell(null);
  }

  async function confirmAddOne(paid, wholeClass = false) {
    setBusy(true);
    try {
      const r = await addStudentPeriod(addOne.studentId, freq.period, addOne.p.start, paid, wholeClass);
      await refresh();
      setAddOne(null);
      showToast(wholeClass ? `${addOne.p.label} added for ${r.added} child${r.added === 1 ? '' : 'ren'}` : paid ? `${addOne.p.label} added and marked paid` : `${addOne.p.label} added`);
    } catch (err) { showToast(err.message || `Could not add this ${unit}`); }
    setBusy(false);
  }

  async function runPeriodAction() {
    const p = periods.find(x => String(x.key) === String(periodModal.key));
    if (!p) return;
    setBusy(true);
    try {
      if (periodModal.mode === 'add') {
        const { created } = await addFeePeriods(year, freq.period, [{ start: p.start, endExclusive: p.endExclusive }],
          classStudents.map(s => ({ id: s.id, weeklyFee: s.weeklyFee, enrollDate: s.enrollDate })));
        showToast(created > 0 ? `${created} fee record${created !== 1 ? 's' : ''} added for ${p.label}` : `Everyone in ${activeClass} already has ${p.label}`);
      } else {
        const { deleted } = await deleteFeePeriods(year, freq.period, [p.start], activeClass);
        showToast(`${deleted} fee record${deleted !== 1 ? 's' : ''} removed for ${p.label}`);
      }
      setPeriodModal(null);
      await refresh();
    } catch (err) { showToast(err.message || 'Something went wrong'); }
    setBusy(false);
  }

  const pill = (s, p) => {
    const f = feeFor(s.id, p);
    const isCurrent = current && p.start === current.start;
    if (!f) {
      return (
        <button key={p.key} className={`week-pill not-added ${isCurrent ? 'is-current' : ''}`} disabled={!(isOwner && auto)}
          title={`${p.label} — not added${isOwner && auto ? ' (tap to add for this child)' : ''}`}
          onClick={e => { e.stopPropagation(); if (isOwner && auto) setAddOne({ studentId: s.id, p }); }}>
          <span className="d">{p.short}</span><span className="dot"></span>
        </button>
      );
    }
    const paid = f.status === 'Paid';
    return (
      <button key={p.key} className={`week-pill ${paid ? 'paid' : 'unpaid'} ${isCurrent ? 'is-current' : ''}`}
        title={`${p.label} — ${paid ? 'Paid' : 'Unpaid'} (${money(f.amount)})${canToggle(f) ? ' — click to change' : ''}`}
        onClick={e => { e.stopPropagation(); if (canToggle(f)) setConfirmToggle(f); }}>
        <span className="d">{p.short}</span><span className="dot"></span>
      </button>
    );
  };

  const pillGridClass = `period-pill-grid ${frequency === 'monthly' ? 'months' : ''}`;
  const pillGridStyle = frequency === 'monthly' ? undefined : { gridTemplateColumns: `repeat(${Math.min(Math.max(periods.length, 1), 4)}, 1fr)` };
  const selected = selectedId && classStudents.find(s => s.id === selectedId);
  const noTerms = frequency === 'termly' && periods.length === 0;

  const toggleStudent = confirmToggle && students.find(s => s.id === confirmToggle.studentId);
  const togglePeriod = confirmToggle && periods.find(p => p.start === confirmToggle.weekStarting);
  const willBePaid = confirmToggle?.status !== 'Paid';

  const mockStyle = (() => { try { return localStorage.getItem('fee_mock_p') || ''; } catch { return ''; } })();
  const childPage = selected && mockStyle && (() => {
    const rows = periods.map(p => ({ key: p.key, label: p.label, short: p.short, now: current && p.start === current.start, future: !!current && p.start > current.start, fee: feeFor(selected.id, p),
      offNote: 'Not charged', canAdd: isOwner && auto, p }));
    const sFees = rows.map(r => r.fee).filter(Boolean);
    const yp = sFees.filter(f => f.status === 'Paid').reduce((t, f) => t + Number(f.amount), 0);
    const yo = sFees.filter(f => f.status !== 'Paid' && (!current || f.weekStarting <= current.start)).reduce((t, f) => t + Number(f.amount), 0);
    const onToggle = f => canToggle(f) && setConfirmToggle(f);
    const onAdd = r => setAddOne({ studentId: selected.id, p: r.p });
    return (<>
      <div className="card-header" style={{ marginBottom: 20 }}>
        <div className="flex items-center gap-3">
          <button className="back-pill" onClick={closeStudent}><ArrowLeft size={14} /> All students</button>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{selected.forename} {selected.surname}</div>
            <div className="text-muted text-sm">{selected.class} · {money(selected.weeklyFee)}{feePer()} · {year}</div>
          </div>
        </div>
      </div>
      <div className="summary-row-v2" style={{ marginBottom: 14 }}>
        <div className="summary-box-v2" style={{ background: 'var(--green-light)' }}><div className="n">{money(yp)}</div><div className="l">Paid</div></div>
        <div className="summary-box-v2" style={{ background: 'var(--red-light)' }}><div className="n">{money(yo)}</div><div className="l">Owed</div></div>
        <div className="summary-box-v2" style={{ background: '#f0f2f6' }}><div className="n">{yp + yo ? Math.round(yp / (yp + yo) * 100) : 0}%</div><div className="l">Collected this year</div></div>
      </div>
      {mockStyle === 'p2'
        ? <div className="card" style={{ padding: 14 }}><FeeTiles rows={rows} onToggle={onToggle} onAdd={onAdd} /></div>
        : <div style={{ maxWidth: 560 }}><FeeRowList rows={rows} isOwner={isOwner} editCell={editCell} setEditCell={setEditCell} saveEdit={saveAmount}
            onToggle={onToggle} onAdd={onAdd} nowLabel={`This ${unit}`} laterLabel={`${unit}s`} /></div>}
    </>);
  })();

  return (
    <Layout title="Fees" subtitle={`${activeClass} · ${year} · charged ${freq.adjective.toLowerCase()}`}>
      {childPage || <>
      <div className="pill-tabs">
        {classNames.map(c => (
          <button key={c} className={`pill-tab ${activeClass === c ? 'active' : ''}`} onClick={() => setActiveClass(c)}>{c}</button>
        ))}
        <div className="pill-divider" />
        {years.map(y => (
          <button key={y} className={`pill-tab ${year === y ? 'year-active' : ''}`} onClick={() => switchYear(y)}>{y}</button>
        ))}
      </div>

      {noTerms ? (
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>No terms set for {year} yet</div>
          <div className="text-muted text-sm">
            {isOwner ? 'Add your term dates in Settings → Terms, then come back here to add term fees.' : 'Ask the madrasah office to add the term dates.'}
          </div>
        </div>
      ) : (
        <>
          {/* This month / term only, for this class (the year's totals are on Stats). */}
          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '.03em' }}>
            {activeClass} · this {unit} — {current ? current.label : '—'}
          </div>
          <div className="stat-grid-v2" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <div className="stat-card-v2"><div className="n" style={{ color: 'var(--green-text)' }}>{money(periodTotals.collected)}</div><div className="l">Collected</div></div>
            <div className="stat-card-v2"><div className="n" style={{ color: 'var(--red-text)' }}>{money(periodTotals.outstanding)}</div><div className="l">Outstanding</div></div>
            <div className="stat-card-v2"><div className="n">{current ? classFees.filter(f => f.status !== 'Paid' && f.weekStarting >= current.start && f.weekStarting < current.endExclusive).length : 0}</div><div className="l">Unpaid fees</div></div>
            <div className="stat-card-v2"><div className="n">{classStudents.length}</div><div className="l">Active children</div></div>
          </div>

          <div className="flex items-center justify-between mb-5" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div className="text-muted text-sm">Tap a {unit} to mark it paid · tap a student for their full year</div>
            {/* Fees added automatically: Settings → Fee months / Terms choose the periods; one child's is added from their grey box. */}
            {isOwner && !auto && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" onClick={() => setPeriodModal({ mode: 'remove', key: current?.key ?? periods[0]?.key })}><Trash2 size={13} /> Remove a {unit}</button>
                <button className="btn btn-primary" style={{ background: 'var(--blue)' }} onClick={() => setPeriodModal({ mode: 'add', key: current?.key ?? periods[0]?.key })}><Plus size={13} /> Add a {unit}</button>
              </div>
            )}
          </div>

          <div className="entity-grid">
            {classStudents.map(s => {
              const sFees = classFees.filter(f => f.studentId === s.id);
              const t = feeTotals(sFees, '0000-01-01', '9999-12-31');
              return (
                <div className="entity-card" key={s.id} onClick={() => setSelectedId(s.id)}>
                  <div className="entity-card-name">{s.forename} {s.surname}</div>
                  <div className="entity-card-sub" style={{ marginBottom: 14 }}>{money(s.weeklyFee)}{feePer()}</div>
                  <div className={pillGridClass} style={pillGridStyle}>{periods.map(p => pill(s, p))}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-soft)', textAlign: 'center', marginTop: 10 }}>{year}: {money(t.collected)} paid · {money(t.outstanding)} due</div>
                </div>
              );
            })}
            {classStudents.length === 0 && <div className="text-muted text-sm">No students in {activeClass || 'this class'}.</div>}
          </div>
        </>
      )}

      </>}
      {/* A student's whole year, one row per month/term */}
      {selected && !mockStyle && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeStudent()}>
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <div>
                <div className="modal-title">{selected.forename} {selected.surname}</div>
                <div className="text-muted text-sm">{selected.class} · {money(selected.weeklyFee)}{feePer()} · {year}</div>
              </div>
              <button className="btn btn-icon" onClick={closeStudent}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ paddingTop: 8 }}>
              {periods.map(p => {
                const f = feeFor(selected.id, p);
                const isEditing = f && editCell?.feeId === f.id;
                return (
                  <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ flex: 1, fontWeight: current && p.start === current.start ? 700 : 500, fontSize: 13.5 }}>{p.label}</div>
                    {!f ? <span className="text-muted text-sm">Not added</span> : (
                      <>
                        {isEditing ? (
                          <span className="flex items-center gap-2">
                            <input type="number" value={editCell.val} autoFocus onChange={e => setEditCell({ ...editCell, val: e.target.value })}
                              onKeyDown={e => { if (e.key === 'Enter') saveAmount(f.id); if (e.key === 'Escape') setEditCell(null); }}
                              style={{ width: 70, padding: '3px 6px', fontSize: 12, border: '1px solid var(--blue)', borderRadius: 4, fontFamily: 'var(--font)' }} />
                            <button className="btn btn-icon btn-sm" onClick={() => saveAmount(f.id)}><Check size={12} /></button>
                          </span>
                        ) : (
                          <span className="text-sm" style={{ cursor: isOwner ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 4 }}
                            onClick={() => isOwner && setEditCell({ feeId: f.id, val: String(f.amount) })}>
                            {money(f.amount)}{isOwner && <Pencil size={10} style={{ opacity: .5 }} />}
                          </span>
                        )}
                        <button className={`btn btn-sm ${f.status === 'Paid' ? 'btn-green' : ''}`} style={{ minWidth: 86, justifyContent: 'center' }}
                          disabled={!canToggle(f)} onClick={() => setConfirmToggle(f)}>
                          {f.status === 'Paid' ? <><Check size={12} />Paid</> : 'Unpaid'}
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Confirm marking paid / unpaid */}
      {confirmToggle && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !toggling && setConfirmToggle(null)}>
          <div className="modal" style={{ maxWidth: 360 }}>
            <div className="modal-body" style={{ textAlign: 'center', paddingTop: 28 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
                Mark {togglePeriod ? togglePeriod.label : `this ${unit}`} as {willBePaid ? 'paid' : 'unpaid'}?
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>
                {toggleStudent ? `${toggleStudent.forename} ${toggleStudent.surname}` : ''} — {money(Number(confirmToggle.amount))}
              </div>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'center' }}>
              <button className="btn" onClick={() => setConfirmToggle(null)} disabled={toggling}>Cancel</button>
              <button className={willBePaid ? 'btn btn-green' : 'btn btn-danger'} onClick={confirmTogglePaid} disabled={toggling}>
                {willBePaid ? <Check size={13} /> : <X size={13} />}{toggling ? 'Saving…' : (willBePaid ? 'Mark paid' : 'Mark unpaid')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add one month or term for one child (or everyone in the class missing it) */}
      {addOne && (() => {
        const st = students.find(x => x.id === addOne.studentId);
        const missing = st ? classStudents.filter(x => !feeFor(x.id, addOne.p)).length : 0;
        return (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !busy && setAddOne(null)}>
            <div className="modal" style={{ maxWidth: 380 }}>
              <div className="modal-body" style={{ textAlign: 'center', paddingTop: 28 }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Add {addOne.p.label}?</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>
                  For {st ? `${st.forename} ${st.surname}` : 'this child'} — {money(Number(st?.weeklyFee || 0))}{missing > 1 ? `, or for everyone in ${st.class} who doesn't have it yet.` : '. Nobody else is charged.'}
                </div>
              </div>
              <div className="modal-footer" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="btn" onClick={() => setAddOne(null)} disabled={busy}>Cancel</button>
                <button className="btn" onClick={() => confirmAddOne(false)} disabled={busy}>Add as owed</button>
                <button className="btn btn-green" onClick={() => confirmAddOne(true)} disabled={busy}><Check size={13} />{busy ? 'Saving…' : 'Add & mark paid'}</button>
                {missing > 1 && (
                  <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => confirmAddOne(false, true)} disabled={busy}>
                    Add as owed for all {missing} in {st.class}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add / remove a month or term for the whole class */}
      {periodModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !busy && setPeriodModal(null)}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <div className="modal-title">{periodModal.mode === 'add' ? `Add a ${unit}` : `Remove a ${unit}`} — {activeClass}</div>
              <button className="btn btn-icon" onClick={() => setPeriodModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group" style={{ marginBottom: 10 }}>
                <label>{unit === 'month' ? 'Month' : 'Term'}</label>
                <select value={periodModal.key ?? ''} onChange={e => setPeriodModal({ ...periodModal, key: e.target.value })}>
                  {periods.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </div>
              <div className="text-muted text-sm">
                {periodModal.mode === 'add'
                  ? `Adds this ${unit}'s fee for every current student in ${activeClass}, at each student's own fee. Anyone who already has it is skipped.`
                  : `Removes this ${unit}'s fee records for everyone in ${activeClass} — including any already marked paid.`}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setPeriodModal(null)} disabled={busy}>Cancel</button>
              <button className={periodModal.mode === 'add' ? 'btn btn-primary' : 'btn btn-danger'} onClick={runPeriodAction} disabled={busy || !periods.length}>
                {busy ? 'Working…' : (periodModal.mode === 'add' ? `Add ${unit}` : `Remove ${unit}`)}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">✓ {toast}</div>}
    </Layout>
  );
}
