// A school's Islamic Studies trackers (server/routes/studies.js): its own lists of surahs, du'aas and practicals, each
// learnt in a year group, and where every pupil is with each — the school's own 1-2-3: Incomplete · Completed with help ·
// Achieved, or Not assessed yet. Class ▾, then Surahs | Du'aas | Practicals | Pupils. Each item is a line (tap it to mark
// the class underneath, one pupil at a time or everyone at once); a surah also shows the class's weekly tracker — the
// aayahs covered so far. Earlier years' items sit behind one closed line. Pupils is a line per child; tap their name for
// everything of theirs (PupilDetail): figures, what to work on, each list as a soft coloured bar and the class's average. The
// head changes the lists (Edit inside a line, "Add a …") and can bring marks in from the school's spreadsheets (Import).
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Layout from '../components/Layout';
import { LoadingState, ErrorState } from '../components/DataState';
import ClassBar from '../components/ClassBar';
import BoxRow from '../components/BoxRow';
import { ChoiceBoxes } from '../components/StudentDetails';
import StudiesImport from '../components/StudiesImport';
import { getClasses, getStudiesClass, getStudiesPupil, getStudiesItems, markStudies, saveStudiesItem, deleteStudiesItem, saveClassAyahs } from '../lib/store';
import { useAuth } from '../lib/AuthContext';
import { markStudiesVisited } from '../components/GettingStarted';
import { useBackToClose } from '../lib/useBackToClose';
import { yearLabel, STUDY_KINDS, LEVELS, LEVEL_NAME, LEVEL_TONE, LEVEL_COLOUR, tally, surahNumber, surahAyahs } from '../lib/studies';
import { SURAHS } from '../lib/quran';
import { ChevronDown, ChevronUp, Plus, X, Save, Trash2, Pencil, FileSpreadsheet, ListTree } from 'lucide-react';

export { yearLabel, STUDY_KINDS };
const remember = (k, v) => { try { localStorage.setItem(k, v); } catch { /* fine */ } };
const recall = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };

// Three boxes for one pupil and one item; the one that applies is filled in its soft colour. Tapping it again takes the
// mark off (Not assessed yet).
export function LevelBoxes({ level = 0, onPick, busy }) {
  return (
    <BoxRow fill columns="repeat(3, minmax(0, 1fr))" cells={LEVELS.map(([v, l]) => ({
      text: l, wrap: 'words', tone: level === v ? LEVEL_TONE[v] : undefined,
      onClick: busy || !onPick ? undefined : () => onPick(level === v ? 0 : v),
    }))} />
  );
}

// A thin bar: achieved, with help, incomplete, and grey for not assessed yet.
function Bar({ t }) {
  const w = n => `${t.total ? (n / t.total) * 100 : 0}%`;
  return (
    <span className="sd-bar">
      <span style={{ width: w(t.achieved), background: LEVEL_COLOUR[3] }} />
      <span style={{ width: w(t.withHelp), background: LEVEL_COLOUR[2] }} />
      <span style={{ width: w(t.incomplete), background: LEVEL_COLOUR[1] }} />
    </span>
  );
}

// The four figures: achieved, with help and incomplete as a share of what's been assessed, and how many aren't yet.
function Figures({ t }) {
  return (
    <BoxRow cells={[
      { text: `${t.pctAchieved}%`, sub: 'Achieved', tone: 'green' },
      { text: `${t.pctWithHelp}%`, sub: 'With help', tone: 'amber' },
      { text: `${t.pctIncomplete}%`, sub: 'Incomplete', tone: 'red' },
      { text: t.notAssessed, sub: 'Not assessed', className: 'ct-figure' },
    ]} />
  );
}

// The class's weekly tracker for one surah: a box per aayah. Tapping one marks it and every aayah before it covered
// (the class has reached it); tapping the last one covered again steps back one.
function AyahTracker({ surah, covered = [], onChange, busy }) {
  const n = surahAyahs(surah);
  const set = new Set(covered);
  const upTo = a => Array.from({ length: a }, (_, i) => i + 1);
  const toggle = a => onChange(set.size === a && set.has(a) && upTo(a).every(x => set.has(x)) ? upTo(a - 1) : upTo(a));
  return (
    <div className="st-ayahs">
      <div className="st-ayahs-head">
        <span>Aayahs covered · {set.size} of {n}</span>
        {onChange && <span style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => onChange(Array.from({ length: n }, (_, i) => i + 1))}>All</button>
          <button type="button" className="btn btn-sm" disabled={busy || !set.size} onClick={() => onChange([])}>Clear</button>
        </span>}
      </div>
      <div className="st-ayah-grid">
        {Array.from({ length: n }, (_, i) => i + 1).map(a => (
          <button key={a} type="button" className={`st-ayah ${set.has(a) ? 'on' : ''}`} disabled={busy || !onChange} onClick={() => toggle(a)}>{a}</button>
        ))}
      </div>
    </div>
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
  const [modal, setModal] = useState(null); // { kind: 'item', item? } | { kind: 'pupil', id } | { kind: 'import' }
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
  async function saveAyahs(itemId, ayahs) {
    setData(d => ({ ...d, ayahs: { ...d.ayahs, [itemId]: ayahs } }));
    try { await saveClassAyahs(cls, itemId, ayahs); } catch (e) { window.alert(e.message || 'Could not save'); await load(); }
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
  const noYear = year === null || year === undefined;
  const all = data?.items || [];
  const items = all.filter(i => byPupil || i.kind === tab);
  const now = items.filter(i => noYear || i.yearGroup === year);
  const earlier = noYear ? [] : items.filter(i => i.yearGroup < year);
  const pupils = data?.pupils || [];
  const levelOf = (p, it) => levels[p.id]?.[it.id] || 0;
  // This year's items × the class's pupils, for the figures.
  const classTally = tally(now.flatMap(it => pupils.map(p => ({ it, p }))), x => levelOf(x.p, x.it));
  // The class's average for each list (their year and earlier), to compare a child with.
  const classAverage = Object.fromEntries(STUDY_KINDS.map(([k]) => {
    const t = tally(all.filter(i => i.kind === k).flatMap(it => pupils.map(p => ({ it, p }))), x => levelOf(x.p, x.it));
    return [k, t.assessed ? t.pctAchieved : null];
  }));

  const itemLine = it => {
    const open = openItem === it.id;
    const t = tally(pupils, p => levelOf(p, it));
    const n = it.kind === 'surah' && it.surah ? surahAyahs(it.surah) : 0;
    const covered = data?.ayahs?.[it.id] || [];
    return (
      <div key={it.id} className={`st-pupil-wrap ${open ? 'open' : ''}`}>
        <button type="button" className={`line-row ${open ? 'on' : ''}`} onClick={() => setOpenItem(open ? null : it.id)}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="line-row-name" style={{ display: 'block' }}>{it.name}</span>
            <span className="line-row-sub" style={{ display: 'block', whiteSpace: 'normal' }}>
              {[it.detail, `${t.achieved} / ${pupils.length} achieved`, n ? `${covered.length} of ${n} aayahs covered` : ''].filter(Boolean).join(' · ')}
            </span>
            <Bar t={t} />
          </span>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {open && (
          <div className="st-open">
            {n > 0 && <AyahTracker surah={it.surah} covered={covered} onChange={a => saveAyahs(it.id, a)} />}
            <div className="st-everyone">
              <span>Everyone</span>
              <BoxRow fill columns="repeat(3, minmax(0, 1fr))" cells={LEVELS.map(([v, l]) => ({
                text: l, wrap: 'words', onClick: busy || !pupils.length ? undefined : () => {
                  if (window.confirm(`Mark all ${pupils.length} as ${l} for ${it.name}?`)) mark(it.id, pupils.map(p => p.id), v);
                },
              }))} />
            </div>
            {pupils.map(p => (
              <div key={p.id} className="st-pupil">
                <button type="button" className="st-name" onClick={() => setModal({ kind: 'pupil', id: p.id })}>{p.name}</button>
                <LevelBoxes level={levelOf(p, it)} busy={busy} onPick={v => mark(it.id, [p.id], v)} />
              </div>
            ))}
            {!pupils.length && <div className="text-muted" style={{ fontSize: 13 }}>No pupils in this class yet.</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: isOwner ? 'space-between' : 'center' }}>
              {isOwner && (
                <button type="button" className="btn btn-sm" onClick={() => setModal({ kind: 'item', item: it })}>
                  <Pencil size={12} /> Edit {oneWord}
                </button>
              )}
              <button type="button" className="btn btn-sm" onClick={() => setOpenItem(null)}><ChevronUp size={13} />Close {it.name}</button>
            </div>
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
            {noYear && (
              <div className="card" style={{ background: 'var(--amber-light)', color: 'var(--amber-text)', fontSize: 13, padding: '10px 14px', marginBottom: 12 }}>
                {cls} has no year group, so every year's {tabLabel.toLowerCase()} are shown.{isOwner ? ' Set it on Classes & Teachers (tap the class → Edit).' : ''}
              </div>
            )}
            <Figures t={classTally} />

            {byPupil ? (
              <div className="card" style={{ display: 'grid', gap: 6 }}>
                <div className="card-title" style={{ marginBottom: 4 }}>Pupils · tap a name for everything of theirs</div>
                {pupils.map(p => {
                  const open = openItem === `p:${p.id}`;
                  const t = tally(all, it => levelOf(p, it));
                  return (
                    <div key={p.id} className={`st-pupil-wrap ${open ? 'open' : ''}`}>
                      <button type="button" className={`line-row ${open ? 'on' : ''}`} onClick={() => setOpenItem(open ? null : `p:${p.id}`)}>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span className="line-row-name" style={{ display: 'block' }}>{p.name}</span>
                          <Bar t={t} />
                        </span>
                        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                      {open && (
                        <div className="st-open">
                          <PupilDetail items={all} levelOf={it => levelOf(p, it)} onPick={(it, v) => mark(it.id, [p.id], v)} busy={busy}
                            classAverage={classAverage} ayahs={data.ayahs} yearGroup={year} />
                          <button type="button" className="btn btn-sm" style={{ justifySelf: 'center' }} onClick={() => setOpenItem(null)}><ChevronUp size={13} />Close {p.name.split(' ')[0]}</button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {!pupils.length && <div className="text-muted" style={{ fontSize: 13 }}>No pupils in this class yet.</div>}
              </div>
            ) : (
            <div className="card" style={{ display: 'grid', gap: 6 }}>
              <div className="card-title" style={{ marginBottom: 4 }}>{noYear ? tabLabel : `${yearLabel(year)} ${tabLabel.toLowerCase()}`}</div>
              {now.map(itemLine)}
              {!now.length && <div className="text-muted" style={{ fontSize: 13 }}>None for {yearLabel(year)} yet.</div>}
              {earlier.length > 0 && (
                <>
                  <button type="button" className="line-row" onClick={() => setShowEarlier(s => !s)} style={{ marginTop: 6 }}>
                    <span className="line-row-name">Earlier years · revision</span>
                    <span className="line-row-sub">{earlier.length} · {tally(earlier.flatMap(it => pupils.map(p => ({ it, p }))), x => levelOf(x.p, x.it)).pctAchieved}% achieved</span>
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
            {isOwner && (
              <button type="button" className="line-row add" style={{ marginTop: 10 }} onClick={() => setModal({ kind: 'plan' })}>
                <ListTree size={13} /> Year by year — what each year learns
              </button>
            )}
            {isOwner && (
              <button type="button" className="line-row add" style={{ marginTop: 6 }} onClick={() => setModal({ kind: 'import' })}>
                <FileSpreadsheet size={13} /> Import marks from your spreadsheets
              </button>
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
      {modal?.kind === 'plan' && (
        <YearPlan onClose={() => setModal(null)} onChanged={load} classYears={classes.map(c => c.yearGroup)} />
      )}
      {modal?.kind === 'import' && (
        <StudiesImport onClose={() => setModal(null)} onDone={load} />
      )}
    </Layout>
  );
}

// Everything about one child: the four figures; what to work on (incomplete, then with help); each list as a line with
// its soft coloured bar and the class's average, opening to every item to
// mark; and the surah the class is on. Used under a name on the Pupils tab and in the pupil's pop-up.
export function PupilDetail({ items, levelOf, onPick, busy, classAverage = {}, ayahs = {}, yearGroup, readOnly }) {
  const [open, setOpen] = useState('');
  const [workOpen, setWorkOpen] = useState('');
  const [workAll, setWorkAll] = useState(false); // a long list shows its first few until "Show all"
  const FEW = 8;
  const t = tally(items, levelOf);
  const toWork = [...items.filter(it => levelOf(it) === 1), ...items.filter(it => levelOf(it) === 2)];
  // The surah the class is learning now: this year's first surah not fully covered.
  const learning = items.filter(it => it.kind === 'surah' && it.surah && (yearGroup === null || yearGroup === undefined || it.yearGroup === yearGroup))
    .find(it => (ayahs[it.id] || []).length < surahAyahs(it.surah));
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <Figures t={t} />
      {learning && (
        <div className="st-learning">
          <span>Class is learning <b>{learning.name}</b></span>
          <span>{(ayahs[learning.id] || []).length} of {surahAyahs(learning.surah)} aayahs</span>
        </div>
      )}
      {/* To work on: a closed line per list (surahs, du'aas, practicals), so a long list stays tidy; tap to see them. */}
      <div className="st-year">To work on{toWork.length ? ` · ${toWork.length}` : ''}</div>
      <div className="st-work">
        {STUDY_KINDS.map(([k, l]) => {
          const list = toWork.filter(it => it.kind === k);
          const inc = list.filter(it => levelOf(it) === 1).length, help = list.length - inc;
          const isOpen = workOpen === k && list.length > 0;
          return (
            <div key={k} className={`st-work-line ${isOpen ? 'open' : ''}`}>
              <button type="button" className={`line-row ${isOpen ? 'on' : ''}`} disabled={!list.length} onClick={() => { setWorkOpen(isOpen ? '' : k); setWorkAll(false); }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="line-row-name">{l}</span>
                  <span className="line-row-sub" style={{ display: 'block' }}>
                    {list.length ? [inc && `${inc} incomplete`, help && `${help} with help`].filter(Boolean).join(' · ') : 'Nothing to work on'}
                  </span>
                </span>
                {list.length > 0 && <span className="st-work-count">{list.length}</span>}
                {list.length > 0 && (isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
              </button>
              {isOpen && (
                <div className="st-chips">
                  {(workAll ? list : list.slice(0, FEW)).map(it => (
                    <span key={it.id} className={`st-chip ${LEVEL_TONE[levelOf(it)]}`} title={LEVEL_NAME[levelOf(it)]}>{it.name}</span>
                  ))}
                  {list.length > FEW && (
                    <button type="button" className="st-chip st-chip-more" onClick={() => setWorkAll(a => !a)}>
                      {workAll ? 'Show fewer' : `Show all ${list.length}`}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="st-year" style={{ marginTop: 6 }}>All their marks</div>
      {STUDY_KINDS.map(([k, l]) => {
        const list = items.filter(it => it.kind === k);
        if (!list.length) return null;
        const kt = tally(list, levelOf);
        const isOpen = open === k;
        return (
          <div key={k} style={{ display: 'grid', gap: 6 }}>
            <button type="button" className={`line-row ${isOpen ? 'on' : ''}`} onClick={() => setOpen(isOpen ? '' : k)}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="line-row-name" style={{ display: 'block' }}>{l} · {kt.achieved} of {kt.total} achieved</span>
                <span className="line-row-sub" style={{ display: 'block', whiteSpace: 'normal' }}>
                  {kt.assessed ? `${kt.pctAchieved}% of those assessed` : 'None assessed yet'}
                  {classAverage[k] !== null && classAverage[k] !== undefined ? ` · class average ${classAverage[k]}%` : ''}
                  {kt.notAssessed ? ` · ${kt.notAssessed} not assessed` : ''}
                </span>
                <Bar t={kt} />
              </span>
              {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {isOpen && list.map((it, i) => (
              <React.Fragment key={it.id}>
                {(i === 0 || list[i - 1].yearGroup !== it.yearGroup) && <div className="st-year">{yearLabel(it.yearGroup)}</div>}
                <div className="st-pupil">
                  <span className="st-name st-item">{it.name}</span>
                  {readOnly ? <BoxRow fill columns="1fr" cells={[{ text: LEVEL_NAME[levelOf(it)], tone: LEVEL_TONE[levelOf(it)] }]} />
                    : <LevelBoxes level={levelOf(it)} busy={busy} onPick={v => onPick(it, v)} />}
                </div>
              </React.Fragment>
            ))}
          </div>
        );
      })}
      <div className="st-key">
        {[3, 2, 1, 0].map(l => <span key={l}><i style={{ background: LEVEL_COLOUR[l] }} />{LEVEL_NAME[l]}</span>)}
      </div>
    </div>
  );
}

const YEARS = Array.from({ length: 14 }, (_, i) => i);

// The head's whole plan at a glance: a line per year group (Reception up) opening to that year's surahs, du'aas and
// practicals; tap one to change its year or remove it, or add one to that year (ItemModal over this pop-up).
function YearPlan({ onClose, onChanged, classYears = [] }) {
  const close = useBackToClose(true, onClose);
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(null);
  const [edit, setEdit] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => getStudiesItems().then(d => setItems(d.items)).catch(e => setError(e.message || 'Could not load')), []);
  useEffect(() => { load(); }, [load]);
  // Every year with something to learn, and every year a class is in (even if its list is empty so far).
  const years = [...new Set([...(items || []).map(i => i.yearGroup), ...classYears.filter(y => y !== null && y !== undefined)])]
    .filter(y => y !== null && y !== undefined).sort((a, b) => a - b);
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && close()}>
      <div className="modal" style={{ maxWidth: 600 }}>
        <div className="modal-header">
          <div className="modal-title">Year by year</div>
          <button className="btn btn-icon" onClick={close}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: 8 }}>
          <div className="text-muted" style={{ fontSize: 13 }}>What each year group learns. Tap one to move it to another year or remove it.</div>
          {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
          {!items && !error && <LoadingState />}
          {items && years.map(y => {
            const mine = items.filter(i => i.yearGroup === y);
            const isOpen = open === y;
            const count = k => mine.filter(i => i.kind === k).length;
            return (
              <div key={y} className={`st-pupil-wrap ${isOpen ? 'open' : ''}`}>
                <button type="button" className={`line-row ${isOpen ? 'on' : ''}`} onClick={() => setOpen(isOpen ? null : y)}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="line-row-name" style={{ display: 'block' }}>{yearLabel(y)}</span>
                    <span className="line-row-sub" style={{ display: 'block' }}>{STUDY_KINDS.map(([k, l, one]) => `${count(k)} ${count(k) === 1 ? one : l.toLowerCase()}`).join(' · ')}</span>
                  </span>
                  {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                {isOpen && (
                  <div className="st-open">
                    {STUDY_KINDS.map(([k, l, one]) => (
                      <div key={k} style={{ display: 'grid', gap: 6 }}>
                        <div className="st-year">{l}</div>
                        {mine.filter(i => i.kind === k).map(it => (
                          <button key={it.id} type="button" className="line-row" onClick={() => setEdit(it)}>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span className="line-row-name" style={{ display: 'block' }}>{it.name}</span>
                              {it.detail && <span className="line-row-sub" style={{ display: 'block' }}>{it.detail}</span>}
                            </span>
                            <Pencil size={13} />
                          </button>
                        ))}
                        <button type="button" className="line-row add" onClick={() => setEdit({ kind: k, yearGroup: y })}>
                          <Plus size={13} /> Add a {one} to {yearLabel(y)}
                        </button>
                      </div>
                    ))}
                    <button type="button" className="btn btn-sm" style={{ justifySelf: 'center' }} onClick={() => setOpen(null)}><ChevronUp size={13} />Close {yearLabel(y)}</button>
                  </div>
                )}
              </div>
            );
          })}
          {items && (
            <div className="field-hint" style={{ fontSize: 12.5 }}>Another year group: add an item and choose its year in "Learnt in".</div>
          )}
        </div>
      </div>
      {edit && <ItemModal item={edit} onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await load(); await onChanged?.(); }} />}
    </div>
  );
}

// The head adds or changes a surah, du'aa or practical — its name, a short detail, the year group it's learnt in, and for
// a whole surah which one it is (so the class's tracker shows its aayahs).
function ItemModal({ item, onClose, onSaved }) {
  const [f, setF] = useState({ kind: item.kind, name: item.name || '', detail: item.detail || '', yearGroup: item.yearGroup ?? 0, surah: item.surah || '' });
  const [surahPicked, setSurahPicked] = useState(!!item.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const close = useBackToClose(true, onClose);
  const one = (STUDY_KINDS.find(k => k[0] === f.kind) || STUDY_KINDS[0])[2];
  const setName = name => setF(x => ({ ...x, name, ...(x.kind === 'surah' && !surahPicked ? { surah: surahNumber(name) || '' } : {}) }));
  async function save() {
    setBusy(true); setError('');
    try { await saveStudiesItem({ ...f, id: item.id, surah: f.kind === 'surah' && f.surah ? Number(f.surah) : null }); await onSaved(); } catch (e) { setError(e.message || 'Could not save'); setBusy(false); }
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
              <input value={f.name} maxLength={120} autoFocus onChange={e => setName(e.target.value)}
                placeholder={f.kind === 'surah' ? 'e.g. Al-Ikhlas' : f.kind === 'duaa' ? 'e.g. Before eating' : 'e.g. Wudhu'} /></div>
            {f.kind === 'surah' && (
              <div className="form-group"><label>Which surah</label>
                <select value={f.surah} style={f.surah ? undefined : { color: 'var(--text-muted)', fontSize: 12, paddingLeft: 12 }} onChange={e => { setSurahPicked(true); setF(x => ({ ...x, surah: e.target.value })); }}>
                  <option value="">Select an entire surah or parts of a surah</option>
                  {SURAHS.map(([n, a], i) => <option key={n} value={i + 1} style={{ color: 'var(--ink)' }}>{i + 1}. {n} · {a} aayahs</option>)}
                </select></div>
            )}
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

// One pupil's pop-up (from a name on Islamic Studies or Pupils): PupilDetail, marked from here too.
export function PupilSheet({ id, onClose, onChanged }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const close = useBackToClose(true, onClose);
  const load = useCallback(() => getStudiesPupil(id).then(setD).catch(e => setError(e.message || 'Could not load')), [id]);
  useEffect(() => { load(); }, [load]);
  const level = it => d?.progress.find(p => p.itemId === it.id)?.level || 0;
  async function pick(it, v) {
    setD(x => ({ ...x, progress: [...x.progress.filter(p => p.itemId !== it.id), ...(v ? [{ itemId: it.id, level: v }] : [])] }));
    try { await markStudies(it.id, [id], v); onChanged?.(); } catch (e) { window.alert(e.message || 'Could not save'); load(); }
  }
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && close()}>
      <div className="modal" style={{ maxWidth: 600 }}>
        <div className="modal-header">
          <div className="modal-title">{d ? d.pupil.name : 'Pupil'}{d && <span className="text-muted" style={{ fontWeight: 500, fontSize: 13, marginLeft: 8 }}>{d.pupil.class}</span>}</div>
          <button className="btn btn-icon" onClick={close}><X size={16} /></button>
        </div>
        <div className="modal-body">
          {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
          {!d && !error && <LoadingState />}
          {d && <PupilDetail items={d.items} levelOf={level} onPick={pick} classAverage={d.classAverage} ayahs={d.ayahs} yearGroup={d.pupil.yearGroup} />}
        </div>
      </div>
    </div>
  );
}
