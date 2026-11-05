// A school's Islamic Studies trackers (server/routes/studies.js): its own lists of surahs, du'aas and practicals,
// each learnt in a year group, and where every pupil is with each — Incomplete · Completed with help · Achieved.
// Class ▾, then Surahs | Du'aas | Practicals | Pupils; this year's items are lines (tap one to mark the class underneath,
// one pupil at a time or everyone at once), earlier years' behind one closed line. Pupils is a line per child with their
// own progress — tap their name and this year's surahs, du'aas and practicals open underneath. Tap a pupil's name
// anywhere for all of theirs. The head changes the lists (a line's Edit, "Add a …").
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Layout from '../components/Layout';
import { LoadingState, ErrorState } from '../components/DataState';
import ClassBar from '../components/ClassBar';
import BoxRow from '../components/BoxRow';
import { ChoiceBoxes } from '../components/StudentDetails';
import { getClasses, getStudiesClass, getStudiesPupil, markStudies, saveStudiesItem, deleteStudiesItem } from '../lib/store';
import { useAuth } from '../lib/AuthContext';
import { markStudiesVisited } from '../components/GettingStarted';
import { useBackToClose } from '../lib/useBackToClose';
import { ChevronDown, ChevronUp, Plus, X, Save, Trash2, Pencil } from 'lucide-react';

export const yearLabel = y => (y === null || y === undefined ? 'No year group' : y === 0 ? 'Reception' : `Year ${y}`);
export const STUDY_KINDS = [['surah', 'Surahs', 'surah'], ['duaa', "Du'aas", "du'aa"], ['practical', 'Practicals', 'practical']];
export const LEVELS = [[0, 'Incomplete'], [1, 'Completed with help'], [2, 'Achieved']];
const TONE = { 1: 'amber', 2: 'green' };
const remember = (k, v) => { try { localStorage.setItem(k, v); } catch { /* fine */ } };
const recall = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };

// Three boxes for one pupil and one item; the one that applies is filled in. Tapping it again does nothing.
export function LevelBoxes({ level = 0, onPick, busy }) {
  return (
    <BoxRow fill columns="repeat(3, minmax(0, 1fr))" cells={LEVELS.map(([v, l]) => ({
      text: l, wrap: 'words', tone: level === v && v ? TONE[v] : undefined, label: level === v && !v,
      onClick: busy || !onPick || level === v ? undefined : () => onPick(v),
    }))} />
  );
}

export default function Studies() {
  const { isOwner, user } = useAuth();
  useEffect(() => { if (isOwner) markStudiesVisited(user?.madrasah?.code); }, [isOwner, user]);
  const [classes, setClasses] = useState(null);
  const [cls, setCls] = useState(() => recall('studies_class', ''));
  const [tab, setTab] = useState(() => recall('studies_tab', 'surah'));
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [openItem, setOpenItem] = useState(null);
  const [showEarlier, setShowEarlier] = useState(false);
  const [modal, setModal] = useState(null); // { kind: 'item', item? } | { kind: 'pupil', id }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getClasses().then(list => {
      const named = list.filter(c => c.name);
      setClasses(named);
      setCls(prev => (named.some(c => c.name === prev) ? prev : named[0]?.name || ''));
    }).catch(setError);
  }, []);

  const load = useCallback(async () => {
    if (!cls) { setData(null); return; }
    try { setData(await getStudiesClass(cls)); setError(null); } catch (e) { setError(e); }
  }, [cls]);
  useEffect(() => { load(); }, [load]);

  const pickClass = c => { setCls(c); setData(null); setOpenItem(null); remember('studies_class', c); };
  const pickTab = t => { setTab(t); setOpenItem(null); setShowEarlier(false); remember('studies_tab', t); };

  // level of [pupil][item]
  const levels = useMemo(() => {
    const m = {};
    for (const p of data?.progress || []) (m[p.studentId] = m[p.studentId] || {})[p.itemId] = p.level;
    return m;
  }, [data]);

  async function mark(itemId, studentIds, level) {
    // Shown at once; put right if saving fails.
    setData(d => ({ ...d, progress: [
      ...d.progress.filter(p => !(p.itemId === itemId && studentIds.includes(p.studentId))),
      ...(level ? studentIds.map(studentId => ({ studentId, itemId, level })) : []),
    ] }));
    setBusy(true);
    try { await markStudies(itemId, studentIds, level); } catch (e) { window.alert(e.message || 'Could not save'); await load(); }
    setBusy(false);
  }

  if (error) return <Layout title="Islamic Studies"><ErrorState error={error} onRetry={load} /></Layout>;
  if (!classes) return <Layout title="Islamic Studies"><LoadingState /></Layout>;
  if (!classes.length) {
    return (
      <Layout title="Islamic Studies">
        <div className="card" style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13.5 }}>
          {isOwner ? 'Add your classes on Classes & Teachers first, each with its year group.' : 'You have no classes yet — ask the head to give you one.'}
        </div>
      </Layout>
    );
  }

  const byPupil = tab === 'pupils';
  const [, tabLabel, oneWord] = STUDY_KINDS.find(k => k[0] === tab) || ['', 'Items', 'item'];
  const year = data?.yearGroup;
  const items = (data?.items || []).filter(i => byPupil || i.kind === tab);
  const now = items.filter(i => year === null || year === undefined || i.yearGroup === year);
  const earlier = year === null || year === undefined ? [] : items.filter(i => i.yearGroup < year);
  const pupils = data?.pupils || [];
  const achievedOf = it => pupils.filter(p => levels[p.id]?.[it.id] === 2).length;
  const workingOf = it => pupils.filter(p => levels[p.id]?.[it.id] === 1).length;
  const slots = now.length * pupils.length;
  const pct = n => (slots ? Math.round((n / slots) * 100) : 0);

  const itemLine = it => {
    const open = openItem === it.id;
    const a = achievedOf(it);
    return (
      <div key={it.id} style={{ display: 'grid', gap: 6 }}>
        <button type="button" className={`line-row ${open ? 'on' : ''}`} onClick={() => setOpenItem(open ? null : it.id)}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="line-row-name" style={{ display: 'block' }}>{it.name}</span>
            <span className="line-row-sub" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {it.detail ? `${it.detail} · ` : ''}{a} / {pupils.length} achieved
            </span>
          </span>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {open && (
          <div className="st-open">
            <div className="st-everyone">
              <span>Everyone</span>
              <BoxRow fill columns="repeat(3, minmax(0, 1fr))" cells={LEVELS.map(([v, l]) => ({
                text: l, wrap: 'words', onClick: busy || !pupils.length ? undefined : () => {
                  if (window.confirm(`Mark all ${pupils.length} ${`as ${l}`} for ${it.name}?`)) mark(it.id, pupils.map(p => p.id), v);
                },
              }))} />
            </div>
            {pupils.map(p => (
              <div key={p.id} className="st-pupil">
                <button type="button" className="st-name" onClick={() => setModal({ kind: 'pupil', id: p.id })}>{p.name}</button>
                <LevelBoxes level={levels[p.id]?.[it.id] || 0} busy={busy} onPick={v => mark(it.id, [p.id], v)} />
              </div>
            ))}
            {!pupils.length && <div className="text-muted" style={{ fontSize: 13 }}>No pupils in this class yet.</div>}
            {isOwner && (
              <button type="button" className="btn btn-sm" style={{ justifySelf: 'start' }} onClick={() => setModal({ kind: 'item', item: it })}>
                <Pencil size={12} /> Edit {oneWord}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Layout title="Islamic Studies" subtitle="Surahs, du'aas and practicals">
      <div className="student-page">
        <ClassBar classes={classes.map(c => c.name)} active={cls} onPick={pickClass}
          notes={Object.fromEntries(classes.map(c => [c.name, yearLabel(c.yearGroup)]))} />
        <div className="pill-tabs bd-tabs st-tabs">
          {[...STUDY_KINDS, ['pupils', 'Pupils']].map(([k, l]) => <button key={k} className={`pill-tab ${tab === k ? 'active' : ''}`} onClick={() => pickTab(k)}>{l}</button>)}
        </div>

        {!data ? <LoadingState /> : (
          <>
            {(year === null || year === undefined) && (
              <div className="card" style={{ background: 'var(--amber-light)', color: 'var(--amber-text)', fontSize: 13, padding: '10px 14px', marginBottom: 12 }}>
                {cls} has no year group, so every year's {tabLabel.toLowerCase()} are shown.{isOwner ? ' Set it on Classes & Teachers (tap the class → Edit).' : ''}
              </div>
            )}
            <BoxRow cells={[
              { text: pupils.length, sub: 'Pupils', className: 'ct-figure' },
              { text: now.length, sub: year === null || year === undefined ? tabLabel : 'This year', className: 'ct-figure' },
              { text: `${pct(now.reduce((t, it) => t + achievedOf(it), 0))}%`, sub: 'Achieved', tone: 'green' },
              { text: `${pct(now.reduce((t, it) => t + workingOf(it), 0))}%`, sub: 'With help', tone: 'amber' },
            ]} />

            {byPupil ? (
              <div className="card" style={{ display: 'grid', gap: 6 }}>
                <div className="card-title" style={{ marginBottom: 4 }}>Pupils{year === null || year === undefined ? '' : ` · ${yearLabel(year)}'s lists`}</div>
                {pupils.map(p => {
                  const open = openItem === `p:${p.id}`;
                  const lv = it => levels[p.id]?.[it.id] || 0;
                  const a = now.filter(it => lv(it) === 2).length, w = now.filter(it => lv(it) === 1).length;
                  const pc = n => (now.length ? Math.round((n / now.length) * 100) : 0);
                  return (
                    <div key={p.id} style={{ display: 'grid', gap: 6 }}>
                      <button type="button" className={`line-row ${open ? 'on' : ''}`} onClick={() => setOpenItem(open ? null : `p:${p.id}`)}>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span className="line-row-name" style={{ display: 'block' }}>{p.name}</span>
                          <span className="line-row-sub" style={{ display: 'block', whiteSpace: 'normal' }}>
                            {STUDY_KINDS.map(([k, l]) => { const list = now.filter(it => it.kind === k); return `${l} ${list.filter(it => lv(it) === 2).length}/${list.length}`; }).join(' · ')}
                          </span>
                          <span className="sd-bar"><span style={{ width: `${pc(a)}%`, background: 'var(--green)' }} /><span style={{ width: `${pc(w)}%`, background: 'var(--amber)' }} /></span>
                        </span>
                        <span className="line-row-sub" style={{ fontWeight: 700, color: open ? undefined : 'var(--green-text)' }}>{pc(a)}%</span>
                        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                      {open && (
                        <div className="st-open">
                          {STUDY_KINDS.map(([k, l]) => {
                            const list = now.filter(it => it.kind === k);
                            return list.length > 0 && (
                              <React.Fragment key={k}>
                                <div className="st-year">{l}</div>
                                {list.map(it => (
                                  <div key={it.id} className="st-pupil">
                                    <span className="st-name st-item">{it.name}</span>
                                    <LevelBoxes level={lv(it)} busy={busy} onPick={v => mark(it.id, [p.id], v)} />
                                  </div>
                                ))}
                              </React.Fragment>
                            );
                          })}
                          {earlier.length > 0 && (
                            <button type="button" className="line-row" onClick={() => setModal({ kind: 'pupil', id: p.id })}>
                              <span className="line-row-name">Earlier years</span>
                              <span className="line-row-sub">{earlier.filter(it => lv(it) === 2).length} / {earlier.length} achieved</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {!pupils.length && <div className="text-muted" style={{ fontSize: 13 }}>No pupils in this class yet.</div>}
              </div>
            ) : (
            <div className="card" style={{ display: 'grid', gap: 6 }}>
              <div className="card-title" style={{ marginBottom: 4 }}>{year === null || year === undefined ? tabLabel : `${yearLabel(year)} ${tabLabel.toLowerCase()}`}</div>
              {now.map(itemLine)}
              {!now.length && <div className="text-muted" style={{ fontSize: 13 }}>None for {yearLabel(year)} yet.</div>}
              {earlier.length > 0 && (
                <>
                  <button type="button" className="line-row" onClick={() => setShowEarlier(s => !s)} style={{ marginTop: 6 }}>
                    <span className="line-row-name">Earlier years</span>
                    <span className="line-row-sub">{earlier.length} · {earlier.reduce((t, it) => t + achievedOf(it), 0)} / {earlier.length * pupils.length} achieved</span>
                    {showEarlier ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {showEarlier && earlier.map(it => (
                    <React.Fragment key={it.id}>
                      {(earlier.find(x => x.yearGroup === it.yearGroup) === it) && <div className="st-year">{yearLabel(it.yearGroup)}</div>}
                      {itemLine(it)}
                    </React.Fragment>
                  ))}
                </>
              )}
              {isOwner && (
                <button type="button" className="line-row add" style={{ marginTop: 6 }} onClick={() => setModal({ kind: 'item', item: { kind: tab, yearGroup: year ?? 0 } })}>
                  <Plus size={13} /> Add a {oneWord}
                </button>
              )}
            </div>
            )}
          </>
        )}
      </div>

      {modal?.kind === 'item' && (
        <ItemModal item={modal.item} onClose={() => setModal(null)} onSaved={async () => { setModal(null); await load(); }} />
      )}
      {modal?.kind === 'pupil' && (
        <PupilSheet id={modal.id} onClose={() => setModal(null)} onChanged={load} />
      )}
    </Layout>
  );
}

const YEARS = Array.from({ length: 14 }, (_, i) => i);

// The head adds or changes a surah, du'aa or practical — its name, a short detail and the year group it's learnt in.
function ItemModal({ item, onClose, onSaved }) {
  const [f, setF] = useState({ kind: item.kind, name: item.name || '', detail: item.detail || '', yearGroup: item.yearGroup ?? 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const close = useBackToClose(true, onClose);
  const one = (STUDY_KINDS.find(k => k[0] === f.kind) || STUDY_KINDS[0])[2];
  async function save() {
    setBusy(true); setError('');
    try { await saveStudiesItem({ ...f, id: item.id }); await onSaved(); } catch (e) { setError(e.message || 'Could not save'); setBusy(false); }
  }
  async function remove() {
    if (!window.confirm(`Remove ${item.name}? Every pupil's mark for it goes too.`)) return;
    setBusy(true);
    try { await deleteStudiesItem(item.id); await onSaved(); } catch (e) { setError(e.message || 'Could not remove'); setBusy(false); }
  }
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && close()}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <div className="modal-title">{item.id ? `Edit ${one}` : `Add a ${one}`}</div>
          <button className="btn btn-icon" onClick={close}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-group"><label>What is it?</label>
              <ChoiceBoxes options={STUDY_KINDS.map(k => k[1])} value={(STUDY_KINDS.find(k => k[0] === f.kind) || STUDY_KINDS[0])[1]}
                onChange={v => setF(x => ({ ...x, kind: STUDY_KINDS.find(k => k[1] === v)[0] }))} /></div>
            <div className="form-group"><label>Name</label>
              <input value={f.name} maxLength={120} autoFocus onChange={e => setF(x => ({ ...x, name: e.target.value }))}
                placeholder={f.kind === 'surah' ? 'e.g. Al-Ikhlas' : f.kind === 'duaa' ? 'e.g. Before eating' : 'e.g. Wudhu'} /></div>
            <div className="form-group"><label>Detail (optional)</label>
              <input value={f.detail} maxLength={200} onChange={e => setF(x => ({ ...x, detail: e.target.value }))}
                placeholder={f.kind === 'surah' ? 'e.g. Surah 112' : 'A few words'} /></div>
            <div className="form-group"><label>Learnt in</label>
              <select value={f.yearGroup} onChange={e => setF(x => ({ ...x, yearGroup: Number(e.target.value) }))}>
                {YEARS.map(y => <option key={y} value={y}>{yearLabel(y)}</option>)}
              </select></div>
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 10 }}>{error}</div>}
        </div>
        <div className="modal-footer">
          {item.id && <button className="btn" style={{ marginRight: 'auto', color: 'var(--red-text)' }} disabled={busy} onClick={remove}><Trash2 size={13} />Remove</button>}
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !f.name.trim()} onClick={save}><Save size={13} />Save</button>
        </div>
      </div>
    </div>
  );
}

// One pupil: how far they are with each list (their year and earlier), and every item to mark.
export function PupilSheet({ id, onClose, onChanged }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('surah');
  const close = useBackToClose(true, onClose);
  const load = useCallback(() => getStudiesPupil(id).then(setD).catch(e => setError(e.message || 'Could not load')), [id]);
  useEffect(() => { load(); }, [load]);
  const level = itemId => d?.progress.find(p => p.itemId === itemId)?.level || 0;
  async function pick(itemId, v) {
    setD(x => ({ ...x, progress: [...x.progress.filter(p => p.itemId !== itemId), ...(v ? [{ itemId, level: v }] : [])] }));
    try { await markStudies(itemId, [id], v); onChanged?.(); } catch (e) { window.alert(e.message || 'Could not save'); load(); }
  }
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && close()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <div className="modal-title">{d ? d.pupil.name : 'Pupil'}{d && <span className="text-muted" style={{ fontWeight: 500, fontSize: 13, marginLeft: 8 }}>{d.pupil.class}</span>}</div>
          <button className="btn btn-icon" onClick={close}><X size={16} /></button>
        </div>
        <div className="modal-body">
          {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
          {!d && !error && <LoadingState />}
          {d && (
            <>
              <BoxRow columns="repeat(3, minmax(0, 1fr))" cells={STUDY_KINDS.map(([k, l]) => {
                const list = d.items.filter(i => i.kind === k);
                return { text: `${list.filter(i => level(i.id) === 2).length} / ${list.length}`, sub: l, wrap: 'words', onClick: () => setTab(k), tone: tab === k ? 'blue' : undefined, className: tab === k ? '' : 'ct-figure' };
              })} />
              <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                {d.items.filter(i => i.kind === tab).map((it, i, list) => (
                  <React.Fragment key={it.id}>
                    {(i === 0 || list[i - 1].yearGroup !== it.yearGroup) && <div className="st-year">{yearLabel(it.yearGroup)}</div>}
                    <div className="st-pupil">
                      <span className="st-name st-item">{it.name}</span>
                      <LevelBoxes level={level(it.id)} onPick={v => pick(it.id, v)} />
                    </div>
                  </React.Fragment>
                ))}
                {!d.items.some(i => i.kind === tab) && <div className="text-muted" style={{ fontSize: 13 }}>Nothing on this list for {yearLabel(d.pupil.yearGroup)}.</div>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
