import React, { useState, useEffect, useLayoutEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { LoadingState, ErrorState } from '../components/DataState';
import {
  getFees, getStudents, markFeePaid, markFeeUnpaid, addFeeMonth, deleteFeeMonth,
  updateFeeAmount, deleteWeekFees, deleteFeeRecord, addStudentWeek, getMondayOf, getWeekStartsForMonth, getClassNames,
  getAcademicYears, currentSchoolYear, getCurrentSchoolMonth, academicYearStartISO, academicYearOfMonth, formatDayMonthGB, hasEnrolledBy,
  getFeePlan, skipFeePeriod,
} from '../lib/store';
import { useBackToClose } from '../lib/useBackToClose';
import { X, Pencil, Check, Calendar, ArrowLeft, Trash2 } from 'lucide-react';
import { money, currencySymbol, getBranding } from '../lib/branding';
import { useAuth } from '../lib/AuthContext';
import { feePer, feeFrequency, isDue } from '../lib/feePeriods';
import PeriodFees from '../components/PeriodFees';
import { FeeRowList, FeeTotals, shortDate } from '../components/FeeRows';

function isoToday() { return new Date().toISOString().split('T')[0]; }
function monthLabel(ym) {
  const [y,m]=ym.split('-').map(Number);
  return new Date(y,m-1,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'});
}
function plusDays(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function shiftMonth(ym, dir) {
  const [y,m]=ym.split('-').map(Number);
  const d=new Date(y,m-1+dir,1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
// "Add a month" must stay inside the tab's own Sept–Aug range — a month picked from the
// wrong side of the boundary would get tagged under this year but actually belong to the
// adjacent one (its true academicYearOfMonth), quietly inflating this year's totals with
// another year's fees.
function yearMonthBounds(yearLabel) {
  const startYear = 2000 + Number(yearLabel.slice(0, 2));
  return { min: `${startYear}-09`, max: `${startYear + 1}-08` };
}

// Weekly charging keeps this page as it was; monthly/termly use PeriodFees.
export default function Fees() {
  const frequency = feeFrequency();
  return frequency === 'weekly' ? <WeeklyFees /> : <PeriodFees frequency={frequency} />;
}

function WeeklyFees() {
  // Teachers can tick a week paid or untick it (a mistake) — no amounts, no starting,
  // adding or removing weeks. The server enforces the same rules.
  const { isOwner } = useAuth();
  // Anyone can tick an added fee paid or untick it (a mistake); only the head starts weeks.
  const canToggle = () => true;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [students, setStudents] = useState([]);
  const [classNames, setClassNames] = useState([]);
  const [years, setYears] = useState([]);
  const [year, setYear] = useState('');
  const [currentYear, setCurrentYear] = useState('');
  const [fees, setFees] = useState([]);
  const [activeClass, setActiveClass] = useState('');

  const [showAddMonth, setShowAddMonth] = useState(false);
  const [addMonthVal, setAddMonthVal] = useState(isoToday().slice(0,7));
  const [addingMonth, setAddingMonth] = useState(false);
  const [showDeleteMonth, setShowDeleteMonth] = useState(false);
  const [deleteMonthVal, setDeleteMonthVal] = useState(isoToday().slice(0,7));
  const [deletingMonth, setDeletingMonth] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [editCell, setEditCell] = useState(null);
  const [confirmDeleteWeek, setConfirmDeleteWeek] = useState(null);
  const [confirmToggle, setConfirmToggle] = useState(null);
  const [toggling, setToggling] = useState(false);
  // With "Add fees automatically" on, weeks are charged by themselves (Settings → Fee
  // weeks); a week not charged (switched off, or not here yet) shows as unmarked.
  const autoWeeks = getBranding().feeAuto !== false;
  // Head only: weeks switched off in Settings → Fee weeks (can't be added for a child),
  // and the week being added for one child (pop-up).
  const [offWeeks, setOffWeeks] = useState(new Set());
  const [addWeek, setAddWeek] = useState(null); // { studentId, week }
  const canAddWeek = w => isOwner && autoWeeks && !offWeeks.has(w);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const y = await currentSchoolYear();
      const [studentsData, classNamesData, yearsData, feesData] = await Promise.all([
        getStudents(), getClassNames(), getAcademicYears(), getFees(y),
      ]);
      setStudents(studentsData); setClassNames(classNamesData); setYears(yearsData); setYear(y); setCurrentYear(y); setFees(feesData);
      setActiveClass(prev => prev && classNamesData.includes(prev) ? prev : (classNamesData[0] || ''));
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  const closeStudent = useBackToClose(!!selectedId, () => setSelectedId(null));

  async function refresh(y2) { setFees(await getFees(y2||year)); }
  // Weeks switched off and weeks removed for a child or class, for the year on screen — so the
  // rest of the year can be shown before it's charged ("Not due yet").
  const [skips, setSkips] = useState([]);
  const [showRest, setShowRest] = useState(false);
  const loadPlan = useCallback(() => {
    if (!autoWeeks || !year) return;
    getFeePlan(year).then(r => { setOffWeeks(new Set(r.weeksOff)); setSkips(r.skips.filter(k => k.period === 'week')); }).catch(() => {});
  }, [autoWeeks, year]);
  useEffect(() => { loadPlan(); }, [loadPlan]);
  // On phones, a child's year opens at this month (earlier months are just above).
  useLayoutEffect(() => {
    if (!selectedId || window.innerWidth >= 900) return;
    const card = document.querySelector('.att-week[data-this-week="1"]');
    if (card && card.previousElementSibling) card.scrollIntoView({ block: 'start' });
  }, [selectedId, year]);
  async function confirmAddWeek(paid, wholeClass = false) {
    setToggling(true);
    try {
      const r = await addStudentWeek(addWeek.studentId, addWeek.week, paid, wholeClass);
      await refresh();
      setAddWeek(null);
      showToast(wholeClass ? `Week added for ${r.added} child${r.added===1?'':'ren'}` : paid ? 'Week added and marked paid' : 'Week added');
    } catch (err) { showToast(err.message || 'Could not add this week'); }
    setToggling(false);
  }
  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),2500); }

  async function switchYear(y) {
    setYear(y);
    try { await refresh(y); } catch (err) { showToast(err.message || 'Could not load that year'); }
  }

  async function confirmTogglePaid() {
    const fee = confirmToggle;
    if (fee.planned) {
      // A week not charged yet, paid ahead — it's recorded now, as paid.
      setToggling(true);
      try { await addStudentWeek(fee.studentId, fee.weekStarting, true); await refresh(); setConfirmToggle(null); }
      catch (err) { showToast(err.message || 'Could not record this payment'); }
      setToggling(false);
      return;
    }
    const wasPaid = fee.status === 'Paid';
    const nextStatus = wasPaid ? 'Pending' : 'Paid';
    const nextPaidDate = wasPaid ? null : isoToday();
    setToggling(true);
    setFees(prev => prev.map(f => f.id===fee.id ? { ...f, status: nextStatus, paidDate: nextPaidDate } : f));
    try {
      if (wasPaid) await markFeeUnpaid(fee.id,year);
      else await markFeePaid(fee.id,year);
      setConfirmToggle(null);
    } catch (err) {
      setFees(prev => prev.map(f => f.id===fee.id ? { ...f, status: fee.status, paidDate: fee.paidDate } : f));
      showToast(err.message || 'Could not update this record');
    }
    setToggling(false);
  }

  async function saveEdit(feeId) {
    const val=parseFloat(editCell.val);
    if (!isNaN(val)&&val>=0) {
      try { await updateFeeAmount(feeId,val,year); await refresh(); showToast('Amount updated'); }
      catch (err) { showToast(err.message || 'Could not update amount'); }
    }
    setEditCell(null);
  }

  async function addMonth() {
    if (academicYearOfMonth(addMonthVal) !== year) {
      showToast(`${monthLabel(addMonthVal)} belongs to ${academicYearOfMonth(addMonthVal)}, not ${year} — switch tabs first.`);
      return;
    }
    const weeks=getWeekStartsForMonth(addMonthVal);
    const classStudents=students.filter(s=>s.status==='Active'&&s.class===activeClass);
    setAddingMonth(true);
    try {
      const { created } = await addFeeMonth(year, weeks, classStudents);
      await refresh();
      setShowAddMonth(false);
      showToast(created>0?`${created} fee record${created!==1?'s':''} added for ${monthLabel(addMonthVal)}`:`All weeks already exist for ${monthLabel(addMonthVal)}`);
    } catch (err) {
      showToast(err.message || 'Could not add this month');
    }
    setAddingMonth(false);
  }

  async function deleteMonth() {
    if (academicYearOfMonth(deleteMonthVal) !== year) {
      showToast(`${monthLabel(deleteMonthVal)} belongs to ${academicYearOfMonth(deleteMonthVal)}, not ${year} — switch tabs first.`);
      return;
    }
    const classStudentIds = new Set(students.filter(s=>s.class===activeClass).map(s=>s.id));
    const weeks = getWeekStartsForMonth(deleteMonthVal).filter(w =>
      fees.some(f => f.weekStarting===w && classStudentIds.has(f.studentId))
    );
    if (!weeks.length) { showToast(`No fee records for ${activeClass} in ${monthLabel(deleteMonthVal)}`); return; }
    setDeletingMonth(true);
    try {
      const { deleted } = await deleteFeeMonth(year, weeks, activeClass);
      await refresh();
      setShowDeleteMonth(false);
      showToast(`${deleted} fee record${deleted!==1?'s':''} removed for ${monthLabel(deleteMonthVal)}`);
    } catch (err) {
      showToast(err.message || 'Could not delete this month');
    }
    setDeletingMonth(false);
  }

  function openStudent(id) { setSelectedId(id); setShowRest(false); }


  if (loading) return <Layout title="Fees"><LoadingState /></Layout>;
  if (error) return <Layout title="Fees"><ErrorState error={error} onRetry={load} /></Layout>;

  const isCurrentYear = year===currentYear;
  const referenceDate = isCurrentYear ? isoToday() : academicYearStartISO(year);
  // Excludes anyone whose enrollDate is still in the future (hasn't started yet) and
  // anyone marked Inactive (has left) — a left student's history stays fully visible
  // via their card in the Students page's "students who have left" section instead.
  const classStudents = students.filter(s=>s.class===activeClass && s.status==='Active' && hasEnrolledBy(s, isoToday()));
  const classFees = fees.filter(f=>classStudents.some(s=>s.id===f.studentId));
  const schoolMonth = getCurrentSchoolMonth(referenceDate);
  const classMonthFees = classFees.filter(f=>f.weekStarting>=schoolMonth.start && f.weekStarting<schoolMonth.endExclusive);
  const monthTotalPaid = classMonthFees.filter(f=>f.status==='Paid').reduce((s,f)=>s+Number(f.amount),0);
  const monthTotalOwed = classMonthFees.filter(f=>f.status!=='Paid'&&isDue(f)).reduce((s,f)=>s+Number(f.amount),0);
  const schoolMonthWeeks = getWeekStartsForMonth(schoolMonth.start.slice(0,7));
  const thisWeekMonday = getMondayOf(referenceDate);
  // schoolMonth.label follows the "first Monday" school-month boundary, which for a
  // September 1st that falls on a weekend can label itself the previous calendar month
  // (e.g. "August") — the browsing hint below uses the plain calendar month instead so
  // it doesn't contradict the per-student view, which is always a straight "September ...".
  const referenceMonthLabel = isCurrentYear ? schoolMonth.label : monthLabel(referenceDate.slice(0,7));

  const selected = students.find(s=>s.id===selectedId);
  const toggleStudent = confirmToggle && students.find(s=>s.id===confirmToggle.studentId);
  const willBePaid = confirmToggle?.status!=='Paid';
  const confirmToggleModal = confirmToggle&&(
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&!toggling&&setConfirmToggle(null)}>
      <div className="modal" style={{maxWidth:360}}>
        <div className="modal-body" style={{textAlign:'center',paddingTop:28}}>
          <div style={{width:48,height:48,borderRadius:'50%',background:willBePaid?'var(--green-light)':'var(--red-light)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'}}>
            {willBePaid?<Check size={22} color="var(--green-text)"/>:<X size={22} color="var(--red-text)"/>}
          </div>
          <div style={{fontSize:15,fontWeight:600,marginBottom:6}}>
            Mark week of {formatDayMonthGB(confirmToggle.weekStarting)} as {willBePaid?'paid':'unpaid'}?
          </div>
          <div style={{color:'var(--text-muted)',fontSize:12.5}}>
            {toggleStudent?`${toggleStudent.forename} ${toggleStudent.surname}`:''} — {money(Number(confirmToggle.amount))} for this week{confirmToggle.planned?', paid ahead':''}.
          </div>
        </div>
        <div className="modal-footer" style={{justifyContent:'center'}}>
          <button className="btn" onClick={()=>setConfirmToggle(null)} disabled={toggling}>Cancel</button>
          <button className={willBePaid?'btn btn-green':'btn btn-danger'} onClick={confirmTogglePaid} disabled={toggling}>
            {willBePaid?<Check size={13}/>:<X size={13}/>}{toggling?'Saving…':(willBePaid?'Mark paid':'Mark unpaid')}
          </button>
        </div>
      </div>
    </div>
  );

  const addWeekStudent = addWeek && students.find(s=>s.id===addWeek.studentId);
  // Others in the same class who don't have this week either (e.g. it was removed for the
  // whole class by mistake) — offer to put it back for all of them at once.
  const missingInClass = addWeek && addWeekStudent ? students.filter(s=>s.class===addWeekStudent.class && s.status==='Active'
    && !fees.some(f=>f.studentId===s.id && f.period==='week' && f.weekStarting===addWeek.week)).length : 0;
  const addWeekModal = addWeek&&(
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&!toggling&&setAddWeek(null)}>
      <div className="modal" style={{maxWidth:380}}>
        <div className="modal-body" style={{textAlign:'center',paddingTop:28}}>
          <div style={{fontSize:15,fontWeight:600,marginBottom:6}}>Add week of {formatDayMonthGB(addWeek.week)}?</div>
          <div style={{color:'var(--text-muted)',fontSize:12.5}}>
            For {addWeekStudent?`${addWeekStudent.forename} ${addWeekStudent.surname}`:'this child'} — {money(Number(addWeekStudent?.weeklyFee||0))}{missingInClass>1?`, or for everyone in ${addWeekStudent.class} who doesn't have it yet.`:'. Nobody else is charged.'}
          </div>
        </div>
        <div className="modal-footer" style={{justifyContent:'center',flexWrap:'wrap'}}>
          <button className="btn" onClick={()=>setAddWeek(null)} disabled={toggling}>Cancel</button>
          <button className="btn" onClick={()=>confirmAddWeek(false)} disabled={toggling}>Add as owed</button>
          <button className="btn btn-green" onClick={()=>confirmAddWeek(true)} disabled={toggling}><Check size={13}/>{toggling?'Saving…':'Add & mark paid'}</button>
          {missingInClass>1&&(
            <button className="btn btn-primary" style={{width:'100%',justifyContent:'center'}} onClick={()=>confirmAddWeek(false,true)} disabled={toggling}>
              Add as owed for all {missingInClass} in {addWeekStudent.class}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  if (selected) {
    const studentFees = fees.filter(f=>f.studentId===selected.id);
    const lookup = {};
    studentFees.forEach(f=>{ lookup[f.weekStarting]=f; });
    const thisMonday = getMondayOf(isoToday());
    const removedFor = w => skips.some(k => k.start === w && k.studentId === selected.id);
    const classRemoved = w => skips.some(k => k.start === w && !k.studentId && k.class === selected.class);
    // Will this child be charged this week when it comes? (switched on, not removed, at the madrasah then)
    const chargeable = w => selected.status === 'Active' && !offWeeks.has(w) && !classRemoved(w)
      && (!selected.enrollDate || selected.enrollDate < plusDays(w, 7)) && (!selected.leaveDate || selected.leaveDate >= w);
    const rowsFor = weeks => weeks.map(w => {
      const fee = lookup[w] || null;
      const future = w > thisMonday;
      const removed = !fee && removedFor(w);
      return { key: w, week: w, label: `Week of ${shortDate(w)}`, now: w === thisMonday, future, fee, removed,
        planned: !fee && !removed && autoWeeks && future && chargeable(w) ? { amount: selected.weeklyFee } : null,
        offNote: offWeeks.has(w) ? 'Week off' : classRemoved(w) ? 'Not charged for the class' : autoWeeks ? 'Not charged' : 'Not added',
        canAdd: canAddWeek(w) };
    });
    // The academic year, a card per school month; later months fold away until asked for.
    const start = academicYearStartISO(year).slice(0, 7);
    const nowMonth = getCurrentSchoolMonth(isoToday()).start.slice(0, 7);
    const allMonths = Array.from({ length: 12 }, (_, i) => shiftMonth(start, i));
    const months = isCurrentYear && !showRest ? allMonths.filter(m => m <= shiftMonth(nowMonth, 1)) : allMonths;
    const yearFees = studentFees.filter(f => f.period === 'week');
    const paidSum = yearFees.filter(f => f.status === 'Paid').reduce((t, f) => t + Number(f.amount), 0);
    const owedSum = yearFees.filter(f => f.status !== 'Paid' && isDue(f)).reduce((t, f) => t + Number(f.amount), 0);
    const rowHandlers = {
      isOwner, editCell, setEditCell, saveEdit, nowLabel: 'This week',
      onToggle: f => canToggle(f) && setConfirmToggle(f),
      onPayAhead: r => setConfirmToggle({ planned: true, studentId: selected.id, weekStarting: r.week, amount: r.planned.amount, status: 'Pending' }),
      onAdd: r => setAddWeek({ studentId: selected.id, week: r.week }),
      onRemove: r => setConfirmDeleteWeek(r.week),
      onPutBack: async r => {
        if (!r.future) { setAddWeek({ studentId: selected.id, week: r.week }); return; }
        try { await skipFeePeriod(selected.id, 'week', r.week, true); loadPlan(); showToast(`Week of ${shortDate(r.week)} put back`); }
        catch (err) { showToast(err.message || 'Could not put it back'); }
      },
    };

    return (
      <Layout title="Fees" subtitle={`${selected.forename} ${selected.surname} · ${selected.class}`}>
        <div className="card-header" style={{marginBottom:20}}>
          <div className="flex items-center gap-3">
            <button className="back-pill" onClick={closeStudent}><ArrowLeft size={14}/> All students</button>
            <div>
              <div style={{fontWeight:600,fontSize:16}}>{selected.forename} {selected.surname}</div>
              <div className="text-muted text-sm">{selected.class} · {currencySymbol()}{selected.weeklyFee}{feePer()} · {year}</div>
            </div>
          </div>
        </div>

        <FeeTotals paid={paidSum} owed={owedSum} label={isCurrentYear ? 'this year' : year} />
        <div className="att-weeks">
          {months.map(m => <FeeRowList key={m} title={monthLabel(m)} rows={rowsFor(getWeekStartsForMonth(m))} {...rowHandlers}
            cardProps={{ 'data-this-week': isCurrentYear && m === nowMonth ? '1' : undefined }} />)}
        </div>
        {months.length < allMonths.length && (
          <div className="fee-more"><button className="btn" onClick={() => setShowRest(true)}>Show the rest of the year</button></div>
        )}

        {confirmDeleteWeek&&(
          <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setConfirmDeleteWeek(null)}>
            <div className="modal" style={{maxWidth:400}}>
              <div className="modal-body" style={{textAlign:'center',paddingTop:28}}>
                <div style={{width:52,height:52,borderRadius:'50%',background:'var(--red-light)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'}}><Trash2 size={24} color="var(--red)"/></div>
                <div style={{fontSize:16,fontWeight:600,marginBottom:6}}>Remove week of {shortDate(confirmDeleteWeek)} for {selected.forename}?</div>
                <div style={{color:'var(--text-muted)',fontSize:13}}>
                  {selected.forename} won't be charged for it{lookup[confirmDeleteWeek]?.status==='Paid' ? ' — the payment recorded for it is removed too' : ''}. You can put it back later.
                  {autoWeeks && <><br/><span style={{fontSize:12}}>A holiday for everyone? Switch the week off in Settings → Fee weeks.</span></>}
                </div>
              </div>
              <div className="modal-footer" style={{justifyContent:'center',flexWrap:'wrap'}}>
                <button className="btn" onClick={()=>setConfirmDeleteWeek(null)}>Cancel</button>
                <button className="btn btn-danger" onClick={async ()=>{
                  try {
                    const mine = lookup[confirmDeleteWeek];
                    if (mine) await deleteFeeRecord(mine.id, year);
                    else await skipFeePeriod(selected.id, 'week', confirmDeleteWeek);
                    await refresh(); loadPlan();
                    setConfirmDeleteWeek(null);
                    showToast(`Week removed for ${selected.forename}`);
                  } catch (err) {
                    showToast(err.message || 'Could not remove week');
                  }
                }}><Trash2 size={13}/>Remove for {selected.forename}</button>
                {/* Fees added by hand (automatic fees off): a holiday week can still go for the whole class here. */}
                {!autoWeeks && <button className="btn btn-danger" onClick={async ()=>{
                  try {
                    await deleteWeekFees(confirmDeleteWeek, year, selected.class);
                    await refresh();
                    setConfirmDeleteWeek(null);
                    showToast(`Week removed for ${selected.class}`);
                  } catch (err) {
                    showToast(err.message || 'Could not remove week');
                  }
                }}><Trash2 size={13}/>Everyone in {selected.class}</button>}
              </div>
            </div>
          </div>
        )}
        {confirmToggleModal}
        {addWeekModal}
        {toast&&<div className="toast">✓ {toast}</div>}
      </Layout>
    );
  }

  return (
    <Layout title="Fees" subtitle={`${activeClass} · ${year}`}>
      <div className="pill-tabs">
        {classNames.map(c=>(
          <button key={c} className={`pill-tab ${activeClass===c?'active':''}`} onClick={()=>setActiveClass(c)}>{c}</button>
        ))}
        <div className="pill-divider"/>
        {years.map(y=>(
          <button key={y} className={`pill-tab ${year===y?'year-active':''}`} onClick={()=>switchYear(y)}>{y}</button>
        ))}
      </div>

      {/* This month only, for this class (the year's totals are on Stats). */}
      <div style={{fontSize:11.5,fontWeight:600,color:'var(--text-muted)',margin:'0 0 8px',textTransform:'uppercase',letterSpacing:'.03em'}}>{activeClass} · this month — {referenceMonthLabel}</div>
      <div className="stat-grid-v2" style={{gridTemplateColumns:'repeat(2,1fr)'}}>
        <div className="stat-card-v2"><div className="n" style={{color:'var(--green-text)'}}>{money(monthTotalPaid)}</div><div className="l">Collected</div></div>
        <div className="stat-card-v2"><div className="n" style={{color:'var(--red-text)'}}>{money(monthTotalOwed)}</div><div className="l">Outstanding</div></div>
        <div className="stat-card-v2"><div className="n">{classMonthFees.filter(f=>f.status!=='Paid'&&isDue(f)).length}</div><div className="l">Unpaid weeks</div></div>
        <div className="stat-card-v2"><div className="n">{classStudents.length}</div><div className="l">Active children</div></div>
      </div>

      <div className="flex items-center justify-between mb-5" style={{flexWrap:'wrap',gap:12}}>
        <div className="text-muted text-sm">
          {isCurrentYear ? 'Click a student’s card to view their full month' : `Browsing ${year} — showing ${referenceMonthLabel}. Click a student’s card to view their full month.`}
        </div>
        {isOwner && <div style={{display:'flex',gap:8}}>
          {/* With automatic weeks, Settings → Fee weeks switches whole weeks/months off instead. */}
          {!autoWeeks && <button className="btn" onClick={()=>{
            const { min, max } = yearMonthBounds(year);
            const todayYM = isoToday().slice(0,7);
            setDeleteMonthVal(todayYM>=min && todayYM<=max ? todayYM : min);
            setShowDeleteMonth(true);
          }}><Trash2 size={13}/> Delete a month</button>}
          {!autoWeeks && <button className="btn btn-primary" style={{background:'var(--blue)'}} onClick={()=>{
            const { min, max } = yearMonthBounds(year);
            const todayYM = isoToday().slice(0,7);
            setAddMonthVal(todayYM>=min && todayYM<=max ? todayYM : min);
            setShowAddMonth(true);
          }}><Calendar size={13}/> Add a month</button>}
        </div>}
      </div>

      <div className="entity-grid">
        {classStudents.map(s=>{
          const monthFees = fees.filter(f=>f.studentId===s.id && f.weekStarting>=schoolMonth.start && f.weekStarting<schoolMonth.endExclusive);
          const monthPaid = monthFees.filter(f=>f.status==='Paid').reduce((s,f)=>s+Number(f.amount),0);
          const monthOwed = monthFees.filter(f=>f.status!=='Paid'&&isDue(f)).reduce((s,f)=>s+Number(f.amount),0);
          return (
            <div className="entity-card" key={s.id} onClick={()=>openStudent(s.id)}>
              <div className="entity-card-name">{s.forename} {s.surname}</div>
              <div className="entity-card-sub" style={{marginBottom:14}}>{currencySymbol()}{s.weeklyFee}{feePer()}</div>
              {/* Only the week buttons themselves stop a tap; the rest of the card opens the student. */}
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
                <div className="week-pill-row" style={{justifyContent:'center'}}>
                  {schoolMonthWeeks.map(w=>{
                    const f = monthFees.find(fee=>fee.weekStarting===w);
                    const dayNum = new Date(w+'T12:00:00').getDate();
                    const dateLabel = formatDayMonthGB(w);
                    const isCurrent = w===thisWeekMonday;
                    if (!f) {
                      return (
                        <button key={w} className={`week-pill not-added ${isCurrent?'is-current':''}`} disabled={!canAddWeek(w)}
                          title={`Week of ${dateLabel} — ${offWeeks.has(w) ? 'switched off in Settings' : autoWeeks ? 'not charged' : 'not added'}${canAddWeek(w) ? ' (tap to add for this child)' : ''}`}
                          onClick={e=>{ e.stopPropagation(); if (canAddWeek(w)) setAddWeek({studentId:s.id, week:w}); }}>
                          <span className="d">{dayNum}</span><span className="dot"></span>
                        </button>
                      );
                    }
                    const paid = f.status==='Paid';
                    const notDue = !paid && !isDue(f);
                    return (
                      <button key={w} className={`week-pill ${paid?'paid':notDue?'not-due':'unpaid'} ${isCurrent?'is-current':''}`}
                        title={`Week of ${dateLabel} — ${paid?'Paid':notDue?'Not due yet':'Unpaid'}${canToggle(f)?' (click to toggle)':''}`}
                        onClick={e=>{ e.stopPropagation(); if (canToggle(f)) setConfirmToggle(f); }}>
                        <span className="d">{dayNum}</span><span className="dot"></span>
                      </button>
                    );
                  })}
                </div>
                <span style={{fontSize:11,color:'var(--text-soft)',textAlign:'center'}}>This month: {money(monthPaid)} paid · {money(monthOwed)} due</span>
              </div>
            </div>
          );
        })}
      </div>
      {classStudents.length===0&&(
        <div className="card" style={{textAlign:'center',padding:28,color:'var(--text-muted)'}}>No students in {activeClass}.</div>
      )}

      {/* Add month modal */}
      {showAddMonth&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowAddMonth(false)}>
          <div className="modal" style={{maxWidth:460}}>
            <div className="modal-header">
              <div className="modal-title">Add a month — {activeClass}</div>
              <button className="btn btn-icon" onClick={()=>setShowAddMonth(false)}><X size={16}/></button>
            </div>
            <div className="modal-body">
              <div className="form-group" style={{marginBottom:16}}>
                <label>Select month</label>
                <input type="month" value={addMonthVal} onChange={e=>setAddMonthVal(e.target.value)}
                  min={yearMonthBounds(year).min} max={yearMonthBounds(year).max}
                  style={{padding:'9px 14px',border:'1px solid var(--border)',borderRadius:'var(--r-md)',fontFamily:'var(--font)',fontSize:13}}/>
                <div style={{fontSize:11.5,color:'var(--text-muted)',marginTop:6}}>Must fall within {year} (September–August).</div>
              </div>
              {addMonthVal&&(()=>{
                const weeks=getWeekStartsForMonth(addMonthVal);
                return (
                  <div style={{background:'#f9fafb',borderRadius:'var(--r-md)',padding:'12px 16px',fontSize:13}}>
                    <div style={{fontWeight:600,marginBottom:8,color:'var(--ink)'}}>
                      {weeks.length} week{weeks.length!==1?'s':''} will be added for {monthLabel(addMonthVal)}:
                    </div>
                    {weeks.map(w=>(
                      <div key={w} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:'1px solid var(--border)',fontSize:12}}>
                        <span style={{color:'var(--text-muted)'}}>w/c {w}</span>
                        <span style={{fontWeight:500}}>
                          {classStudents.filter(s=>s.status==='Active').length} students
                        </span>
                      </div>
                    ))}
                    <div style={{marginTop:10,fontSize:12,color:'var(--text-muted)'}}>
                      Each student charged at their individual weekly rate. Weeks already added are skipped.
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={()=>setShowAddMonth(false)}>Cancel</button>
              <button className="btn btn-primary" style={{background:'var(--blue)'}} onClick={addMonth} disabled={addingMonth}>{addingMonth?'Adding…':'Add month'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete month modal */}
      {showDeleteMonth&&(()=>{
        const classStudentIds = new Set(classStudents.map(s=>s.id));
        const weeksInMonth = getWeekStartsForMonth(deleteMonthVal);
        const weeksWithRecords = weeksInMonth.filter(w => fees.some(f=>f.weekStarting===w && classStudentIds.has(f.studentId)));
        const recordCount = fees.filter(f=>weeksWithRecords.includes(f.weekStarting) && classStudentIds.has(f.studentId)).length;
        return (
          <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowDeleteMonth(false)}>
            <div className="modal" style={{maxWidth:460}}>
              <div className="modal-header">
                <div className="modal-title">Delete a month — {activeClass}</div>
                <button className="btn btn-icon" onClick={()=>setShowDeleteMonth(false)}><X size={16}/></button>
              </div>
              <div className="modal-body">
                <div className="form-group" style={{marginBottom:16}}>
                  <label>Select month</label>
                  <input type="month" value={deleteMonthVal} onChange={e=>setDeleteMonthVal(e.target.value)}
                    min={yearMonthBounds(year).min} max={yearMonthBounds(year).max}
                    style={{padding:'9px 14px',border:'1px solid var(--border)',borderRadius:'var(--r-md)',fontFamily:'var(--font)',fontSize:13}}/>
                  <div style={{fontSize:11.5,color:'var(--text-muted)',marginTop:6}}>Must fall within {year} (September–August).</div>
                </div>
                {weeksWithRecords.length ? (
                  <div style={{background:'var(--red-light)',borderRadius:'var(--r-md)',padding:'12px 16px',fontSize:13}}>
                    <div style={{fontWeight:600,marginBottom:8,color:'var(--ink)'}}>
                      {recordCount} fee record{recordCount!==1?'s':''} across {weeksWithRecords.length} week{weeksWithRecords.length!==1?'s':''} will be removed for {monthLabel(deleteMonthVal)}:
                    </div>
                    {weeksWithRecords.map(w=>(
                      <div key={w} style={{padding:'4px 0',borderBottom:'1px solid rgba(0,0,0,0.06)',fontSize:12,color:'var(--text-muted)'}}>w/c {w}</div>
                    ))}
                    <div style={{marginTop:10,fontSize:12,color:'var(--text-muted)'}}>This cannot be undone.</div>
                  </div>
                ) : (
                  <div style={{background:'#f9fafb',borderRadius:'var(--r-md)',padding:'12px 16px',fontSize:13,color:'var(--text-muted)'}}>
                    No fee records exist for {activeClass} in {monthLabel(deleteMonthVal)}.
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn" onClick={()=>setShowDeleteMonth(false)}>Cancel</button>
                <button className="btn btn-danger" onClick={deleteMonth} disabled={deletingMonth||!weeksWithRecords.length}>
                  <Trash2 size={13}/>{deletingMonth?'Deleting…':'Delete month'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {confirmToggleModal}
        {addWeekModal}
      {toast&&<div className="toast">✓ {toast}</div>}
    </Layout>
  );
}
