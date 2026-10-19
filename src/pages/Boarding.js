// pages/Boarding.js — a Darul Uloom's boarders (the head, and teachers on boarding duty): the night
// register, rooms and beds, going home and coming back (with the madrasah's home weekends), and a log of
// when a boarder was unwell or given medicine. Boarders are the children whose details say "Boarder".
// Server: server/routes/boarding.js.
import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { LoadingState, ErrorState } from '../components/DataState';
import BoxRow from '../components/BoxRow';
import { ChoiceBoxes, HealthDot, GrowingText } from '../components/StudentDetails';
import PickField from '../components/PickField';
import { sectionLabel, levelLabel, roomLabel, floorLabel, fullRoom, layout, floors, nextRoomName } from '../lib/boardingRooms';
import {
  getBoarding, saveRoom, deleteRoom, placeBoarders, markNight, signOutBoarders, signInBoarders, deleteLeave,
  saveHomeWeekend, deleteHomeWeekend, addHealthNote, deleteHealthNote, niceDate, addRooms, renameBoarding,
} from '../lib/store';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Plus, X, Save, Trash2, Pencil, LogOut, LogIn, Pill } from 'lucide-react';

const TABS = [['tonight', 'Tonight'], ['rooms', 'Rooms'], ['home', 'Going home'], ['health', 'Health']];
const MARKS = [['in', 'In', 'P'], ['away', 'Away', 'A'], ['sick', 'Sick', 'L']]; // status, label, colour (attendance's)
const STATUS = { in: 'In', away: 'Away — not here', sick: 'Sick' };
const REASONS = ['Home weekend', 'Appointment', 'Family', 'Other'];
const shift = (date, n) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const nameOf = s => `${s.forename} ${s.surname}`;
// "Sat 18 Oct, 16:05" from the server's 'YYYY-MM-DD HH:MM' (UK time).
const when = v => (v ? `${niceDate(v.slice(0, 10))}, ${v.slice(11, 16)}` : '');
const nowParts = () => { const d = new Date(); const p = n => String(n).padStart(2, '0'); return [`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, `${p(d.getHours())}:${p(d.getMinutes())}`]; };

function readTab() { try { const t = localStorage.getItem('boarding_tab'); return TABS.some(([k]) => k === t) ? t : 'tonight'; } catch { return 'tonight'; } }

export default function Boarding() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [date, setDate] = useState('');
  const [tab, setTabState] = useState(readTab);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');

  const load = useCallback(async (d) => {
    setError(null);
    try { const r = await getBoarding(d); setData(r); setDate(r.date); } catch (err) { setError(err); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const reload = () => load(date);
  const setTab = t => { setTabState(t); try { localStorage.setItem('boarding_tab', t); } catch { /* private mode */ } };
  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2800); }
  async function run(fn, msg) {
    try { await fn(); await reload(); if (msg) showToast(msg); return true; }
    catch (err) { showToast(err.message || 'Something went wrong'); return false; }
  }

  const title = 'Boarding';
  if (error) return <Layout title={title}><ErrorState error={error} onRetry={() => load(date)} /></Layout>;
  if (!data) return <Layout title={title}><LoadingState /></Layout>;

  const { boarders, rooms, teachers, register, leaves, homeWeekends, health, head, today } = data;
  const out = leaves.filter(l => !l.backAt);
  const outOf = Object.fromEntries(out.map(l => [l.studentId, l]));
  const mark = Object.fromEntries(register.map(r => [r.studentId, r]));
  const here = boarders.filter(b => !outOf[b.id]);
  const inTonight = here.filter(b => mark[b.id]?.status === 'in').length;
  const unwellWeek = new Set(health.filter(h => h.at.slice(0, 10) >= shift(today, -7)).map(h => h.studentId)).size;
  const teacherName = id => teachers.find(t => t.id === id)?.name || '';

  return (
    <Layout title={title} subtitle={`${boarders.length} boarder${boarders.length === 1 ? '' : 's'}`}>
      <div className="boarding-page">
        <BoxRow className="bd-figures" cells={[
          { text: boarders.length, sub: 'Boarders', className: 'ct-figure' },
          { text: `${inTonight} / ${here.length}`, sub: date === today ? 'In tonight' : 'In that night', className: 'ct-figure' },
          { text: out.length, sub: 'Home now', className: 'ct-figure', onClick: () => setTab('home') },
          { text: unwellWeek, sub: 'Sick this week', className: 'ct-figure', onClick: () => setTab('health') },
        ]} />
        <div className="pill-tabs bd-tabs">
          {TABS.map(([k, l]) => <button key={k} className={`pill-tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
        </div>

        {boarders.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>
            No boarders yet — on Students, open a child, tap Edit and choose "Boarder" in More details.
          </div>
        )}

        {boarders.length > 0 && tab === 'tonight' && (
          <Tonight data={data} date={date} outOf={outOf} mark={mark} onDate={d => load(d)}
            onMark={(ids, status) => run(() => markNight(date, ids, status))} />
        )}
        {tab === 'rooms' && (
          <Rooms data={data} teacherName={teacherName} head={head}
            onEdit={room => setModal({ kind: 'room', room })}
            onAdd={at => setModal({ kind: 'add-rooms', at })}
            onRename={r => setModal({ kind: 'rename', ...r })}
            onPlace={(ids, roomId, label) => run(() => placeBoarders(ids, roomId), `${ids.length} moved to ${label}`)} />
        )}
        {boarders.length > 0 && tab === 'home' && (
          <GoingHome data={data} outOf={outOf} head={head}
            onSignOut={ids => setModal({ kind: 'out', ids })}
            onSignIn={ids => run(() => signInBoarders(ids), `${ids.length} signed back in`)}
            onWeekend={w => setModal({ kind: 'weekend', weekend: w })}
            onLeave={l => setModal({ kind: 'leave', leave: l })} />
        )}
        {boarders.length > 0 && tab === 'health' && (
          <Health boarders={boarders} health={health} head={head}
            onAdd={() => setModal({ kind: 'health' })} onOpen={h => setModal({ kind: 'health-view', entry: h })} />
        )}
      </div>

      {modal?.kind === 'add-rooms' && (
        <AddRoomsModal at={modal.at} rooms={rooms} teachers={teachers} onClose={() => setModal(null)}
          onSave={async (f, list) => { if (await run(() => addRooms(f.block, f.level, f.teacherId, list), `${list.length} room${list.length === 1 ? '' : 's'} added`)) setModal(null); }} />
      )}
      {modal?.kind === 'rename' && (
        <RenameModal what={modal.what} name={modal.what === 'block' ? sectionLabel(modal.block) : levelLabel(modal.level)}
          current={modal.what === 'block' ? modal.block : modal.level} onClose={() => setModal(null)}
          onSave={async to => { if (await run(() => renameBoarding(modal.what, modal.block, modal.level, to), 'Renamed')) setModal(null); }} />
      )}
      {modal?.kind === 'room' && (
        <RoomModal room={modal.room} rooms={rooms} teachers={teachers} count={boarders.filter(b => b.roomId === modal.room.id).length} onClose={() => setModal(null)}
          onSave={async f => { if (await run(() => saveRoom(f), f.id ? 'Room saved' : 'Room added')) setModal(null); }}
          onDelete={async () => { if (await run(() => deleteRoom(modal.room.id), 'Room removed')) setModal(null); }} />
      )}
      {modal?.kind === 'out' && (
        <SignOutModal boarders={boarders.filter(b => modal.ids.includes(b.id))} homeWeekends={homeWeekends} today={today} onClose={() => setModal(null)}
          onSave={async f => { if (await run(() => signOutBoarders(modal.ids, f), `${modal.ids.length} signed out`)) setModal(null); }} />
      )}
      {modal?.kind === 'weekend' && (
        <WeekendModal weekend={modal.weekend} onClose={() => setModal(null)}
          onSave={async f => { if (await run(() => saveHomeWeekend(f), 'Saved')) setModal(null); }}
          onDelete={async () => { if (await run(() => deleteHomeWeekend(modal.weekend.id), 'Removed')) setModal(null); }} />
      )}
      {modal?.kind === 'leave' && (
        <LeaveModal leave={modal.leave} boarder={boarders.find(b => b.id === modal.leave.studentId)} head={head} onClose={() => setModal(null)}
          onBack={async () => { if (await run(() => signInBoarders([modal.leave.id]), 'Signed back in')) setModal(null); }}
          onDelete={async () => { if (await run(() => deleteLeave(modal.leave.id), 'Removed')) setModal(null); }} />
      )}
      {modal?.kind === 'health' && (
        <HealthModal boarders={boarders} onClose={() => setModal(null)}
          onSave={async f => { if (await run(() => addHealthNote(f), 'Written down')) setModal(null); }} />
      )}
      {modal?.kind === 'health-view' && (
        <Shell title={boarders.find(b => b.id === modal.entry.studentId) ? nameOf(boarders.find(b => b.id === modal.entry.studentId)) : 'Health note'} onClose={() => setModal(null)}
          footer={<>
            {head && <button className="btn" style={{ marginRight: 'auto', color: 'var(--red-text)' }} onClick={async () => { if (await run(() => deleteHealthNote(modal.entry.id), 'Removed')) setModal(null); }}><Trash2 size={13} />Remove</button>}
            <button className="btn btn-primary" onClick={() => setModal(null)}>Done</button>
          </>}>
          <HealthLines entry={modal.entry} />
        </Shell>
      )}
      {toast && <div className="toast">✓ {toast}</div>}
    </Layout>
  );
}

// ── Tonight: the night register, a card per floor (a block's level), each room's boarders together ──
function Tonight({ data, date, outOf, mark, onDate, onMark }) {
  const { boarders, rooms, today } = data;
  const label = new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const inRoom = r => boarders.filter(b => b.roomId === r.id);
  const cards = [
    ...floors(rooms).map(f => ({ key: `${f.block}|${f.level}`, title: floorLabel(f) || 'Rooms', rooms: f.rooms.filter(r => inRoom(r).length) })),
    { key: 'none', title: 'Not in a room', rooms: [{ id: '', name: '', loose: true }] },
  ].map(c => ({ ...c, list: c.rooms.flatMap(r => (r.loose ? boarders.filter(b => !rooms.some(x => x.id === b.roomId)) : inRoom(r))) }))
    .filter(c => c.list.length);
  const line = b => {
    const leave = outOf[b.id];
    if (leave) {
      return (
        <div className="att-day off" key={b.id}>
          <span className="att-stripe" />
          <div className="att-day-main">
            <div className="att-day-date">{nameOf(b)}</div>
            <div className="att-day-note">Home{leave.collectedBy ? ` · with ${leave.collectedBy}` : ''}{leave.backDue ? ` · back ${niceDate(leave.backDue)}` : ''}</div>
          </div>
        </div>
      );
    }
    const m = mark[b.id];
    const tone = MARKS.find(x => x[0] === m?.status)?.[2] || '';
    return (
      <div className={`att-day ${tone}`} key={b.id}>
        <span className="att-stripe" />
        <div className="att-day-main">
          <div className="att-day-date">{nameOf(b)}<HealthDot student={b} /></div>
          <div className="att-day-status">{m ? `${STATUS[m.status]} · ${m.by}, ${m.time}` : 'Not marked'}</div>
        </div>
        {MARKS.map(([k, l, c]) => (
          <button key={k} type="button" className={`att-mark bd-mark ${m?.status === k ? 'on ' + c : ''}`} aria-pressed={m?.status === k}
            onClick={() => onMark([b.id], m?.status === k ? null : k)}>{l}</button>
        ))}
      </div>
    );
  };
  return (
    <>
      <div className="card att-week">
        <div className="ta-day">
          <button type="button" className="btn btn-icon btn-sm" aria-label="Night before" onClick={() => onDate(shift(date, -1))}><ChevronLeft size={16} /></button>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontWeight: 700 }}>{label}{date === today && <span className="att-today">Tonight</span>}</div>
            <div className="att-day-status">In, Away or Sick for each boarder</div>
          </div>
          <button type="button" className="btn btn-icon btn-sm" aria-label="Night after" disabled={date >= today} onClick={() => onDate(shift(date, 1))}><ChevronRight size={16} /></button>
        </div>
      </div>
      {cards.map(c => {
        const present = c.list.filter(b => !outOf[b.id]);
        const unmarked = present.filter(b => !mark[b.id]);
        return (
          <div className="card att-week" key={c.key} style={{ marginTop: 12 }}>
            <div className="bd-room-head">
              <span className="bd-floor-title">{c.title}</span>
              <span className="bd-room-count">{present.filter(b => mark[b.id]?.status === 'in').length} of {present.length} in</span>
              {unmarked.length > 0 && <button type="button" className="btn btn-sm" onClick={() => onMark(unmarked.map(b => b.id), 'in')}>Rest are in</button>}
            </div>
            {c.rooms.map(r => (
              <React.Fragment key={r.id || 'loose'}>
                {!r.loose && <div className="att-week-title">{roomLabel(r.name)}</div>}
                {(r.loose ? c.list : inRoom(r)).map(line)}
              </React.Fragment>
            ))}
          </div>
        );
      })}
    </>
  );
}

// Tick some people (or a whole group) and do one thing with them all — the "Not in a class" pattern.
function TickList({ groups, picked, setPicked, sub, actions }) {
  const all = list => list.length > 0 && list.every(s => picked.includes(s.id));
  const toggle = id => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
  const toggleAll = list => setPicked(p => (all(list) ? p.filter(id => !list.some(s => s.id === id)) : [...new Set([...p, ...list.map(s => s.id)])]));
  return (
    <>
      {groups.filter(g => g.list.length).map(g => (
        <div key={g.label} className="no-class-group">
          {g.label && (
            <label className="no-class-head">
              <input type="checkbox" checked={all(g.list)} onChange={() => toggleAll(g.list)} />
              <span>{g.label}</span><span className="text-muted">{g.list.length}</span>
            </label>
          )}
          {g.list.map(s => (
            <div key={s.id} className={`no-class-row ${picked.includes(s.id) ? 'on' : ''}`} onClick={() => toggle(s.id)}>
              <input type="checkbox" checked={picked.includes(s.id)} onChange={() => toggle(s.id)} onClick={e => e.stopPropagation()} aria-label={`Select ${s.name || nameOf(s)}`} />
              <span className="no-class-name">{s.name || nameOf(s)}{s.forename && <HealthDot student={s} />}</span>
              {sub && <span className="bd-tick-sub">{sub(s)}</span>}
            </div>
          ))}
        </div>
      ))}
      {actions}
    </>
  );
}

// ── Rooms: a line per wing / block (tap for its levels and rooms), a room opens to who sleeps there ──
function Rooms({ data, teacherName, head, onEdit, onAdd, onRename, onPlace }) {
  const { rooms, boarders } = data;
  const [openBlock, setOpenBlock] = useState(null);
  const [openId, setOpenId] = useState('');
  const [picked, setPicked] = useState([]);
  const unplaced = boarders.filter(b => !b.roomId || !rooms.some(r => r.id === b.roomId));
  const ids = new Set(boarders.map(b => b.id));
  const chosen = picked.filter(id => ids.has(id));
  const inRoom = r => boarders.filter(b => b.roomId === r.id);
  const lay = layout(rooms);
  const moveTo = async (value, from) => {
    const list = chosen.filter(id => from.some(b => b.id === id));
    if (!value || !list.length) return;
    const room = rooms.find(r => r.id === value);
    await onPlace(list, value === 'none' ? null : value, room ? fullRoom(room) : 'no room');
    setPicked([]);
  };
  const moveBar = (from, withNone) => {
    const n = chosen.filter(id => from.some(b => b.id === id)).length;
    return head && (
      <div className="no-class-move">
        <span>{n ? `${n} selected — move to:` : 'Tick boarders, then move them to:'}</span>
        {rooms.length ? (
          <div className="waiting-move">
            <select value="" disabled={!n} onChange={e => moveTo(e.target.value, from)} aria-label="Move the selected boarders">
              <option value="">Select room…</option>
              {floors(rooms).map(f => (
                <optgroup key={`${f.block}|${f.level}`} label={floorLabel(f) || 'Rooms'}>
                  {f.rooms.map(r => <option key={r.id} value={r.id}>{roomLabel(r.name)} ({inRoom(r).length}/{r.beds})</option>)}
                </optgroup>
              ))}
              {withNone && <option value="none">Out of this room</option>}
            </select>
          </div>
        ) : <span className="text-muted">Add a room first.</span>}
      </div>
    );
  };
  const count = list => {
    const beds = list.reduce((t, r) => t + r.beds, 0);
    const used = list.reduce((t, r) => t + inRoom(r).length, 0);
    return `${list.length} room${list.length === 1 ? '' : 's'} · ${used} of ${beds} beds`;
  };
  const roomLine = r => {
    const people = inRoom(r);
    const on = openId === r.id;
    return (
      <React.Fragment key={r.id}>
        <button type="button" className={`line-row ${on ? 'on' : ''}`} onClick={() => { setOpenId(on ? '' : r.id); setPicked([]); }}>
          <span className="ct-two">
            <span className="line-row-name">{roomLabel(r.name)}</span>
            <span className="line-row-sub">{people.length} of {r.beds} beds{teacherName(r.teacherId) ? ` · ${teacherName(r.teacherId)}` : ''}</span>
          </span>
          {on ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {on && (
          <div className="course-open">
            <BoxRow columns="repeat(3, minmax(0, 1fr))" cells={[
              { text: people.length, sub: 'Boarders', label: true },
              { text: Math.max(0, r.beds - people.length), sub: 'Free beds', label: true },
              { text: teacherName(r.teacherId) || '—', sub: 'In charge', label: true },
            ]} />
            {people.length === 0 && <div className="text-muted" style={{ fontSize: 13, padding: '4px 2px' }}>Nobody in this room yet.</div>}
            {head
              ? <TickList groups={[{ label: '', list: people }]} picked={picked} setPicked={setPicked} actions={people.length > 0 && moveBar(people, true)} />
              : people.map(b => <div key={b.id} className="no-class-row" style={{ cursor: 'default' }}><span className="no-class-name">{nameOf(b)}<HealthDot student={b} /></span><span className="bd-tick-sub">{b.class}</span></div>)}
            {head && <button type="button" className="line-row add" onClick={() => onEdit(r)}><Pencil size={13} /> Edit {roomLabel(r.name)}</button>}
          </div>
        )}
      </React.Fragment>
    );
  };
  const levelsOf = (b, nested) => b.levels.map(l => (
    <React.Fragment key={l.level || 'none'}>
      {(l.level || b.levels.length > 1) && (
        <div className="bd-level-head">
          <span>{levelLabel(l.level) || 'No level'}</span>
          <span className="text-muted">{count(l.rooms)}</span>
          {head && l.level && <button type="button" className="btn btn-icon btn-sm" aria-label={`Rename ${levelLabel(l.level)}`} onClick={() => onRename({ what: 'level', block: b.block, level: l.level })}><Pencil size={12} /></button>}
        </div>
      )}
      {l.rooms.map(roomLine)}
      {head && nested && <button type="button" className="line-row add" onClick={() => onAdd({ block: b.block, level: l.level })}><Plus size={13} /> Add rooms{l.level ? ` to ${levelLabel(l.level)}` : ''}</button>}
    </React.Fragment>
  ));
  const onlyLoose = lay.length === 1 && !lay[0].block;
  return (
    <>
      <div className="card">
        <div className="card-title" style={{ marginBottom: 2 }}>Rooms</div>
        <div className="card-sub" style={{ marginBottom: 12 }}>{onlyLoose || !rooms.length ? 'Tap a room to see who sleeps there' : 'Tap a section to see its levels and rooms'}</div>
        <div className="course-lines">
          {onlyLoose ? levelsOf(lay[0], true) : lay.map(b => {
            const all = b.levels.flatMap(l => l.rooms);
            const on = openBlock === b.block;
            const name = sectionLabel(b.block) || 'No section';
            return (
              <React.Fragment key={b.block || 'none'}>
                <button type="button" className={`line-row ${on ? 'on' : ''}`} onClick={() => { setOpenBlock(on ? null : b.block); setOpenId(''); setPicked([]); }}>
                  <span className="ct-two">
                    <span className="line-row-name">{name}</span>
                    <span className="line-row-sub">{b.levels.filter(l => l.level).length ? `${b.levels.length} level${b.levels.length === 1 ? '' : 's'} · ` : ''}{count(all)}</span>
                  </span>
                  {on ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                {on && (
                  <div className="course-open">
                    {levelsOf(b, true)}
                    {head && b.block && (
                      <div className="course-open-actions">
                        <button type="button" className="line-row add" onClick={() => onAdd({ block: b.block, level: '' })}><Plus size={13} /> Add a level</button>
                        <button type="button" className="line-row add" onClick={() => onRename({ what: 'block', block: b.block })}><Pencil size={13} /> Rename {name}</button>
                      </div>
                    )}
                  </div>
                )}
              </React.Fragment>
            );
          })}
          {rooms.length === 0 && <div className="text-muted" style={{ fontSize: 13 }}>No rooms yet{head ? ' — add a section, its levels, then each room and its beds.' : '.'}</div>}
          {head && <button type="button" className="line-row add" onClick={() => onAdd({ block: '', level: '' })}><Plus size={14} /> {rooms.length ? 'Add a section or rooms' : 'Add rooms'}</button>}
        </div>
      </div>
      {unplaced.length > 0 && (
        <div className="card no-class-card" style={{ marginTop: 14 }}>
          <div className="card-title">Not in a room ({unplaced.length})</div>
          <div className="card-sub" style={{ marginBottom: 12 }}>{head ? 'Tick the boarders for a room, then choose the room.' : 'The head puts boarders in rooms.'}</div>
          {head
            ? <TickList groups={groupByClass(unplaced)} picked={picked} setPicked={setPicked} actions={moveBar(unplaced, false)} />
            : unplaced.map(b => <div key={b.id} className="no-class-row" style={{ cursor: 'default' }}><span className="no-class-name">{nameOf(b)}</span><span className="bd-tick-sub">{b.class}</span></div>)}
        </div>
      )}
    </>
  );
}

function groupByClass(list) {
  const groups = [];
  list.forEach(b => {
    let g = groups.find(x => x.label === (b.class || 'No class'));
    if (!g) groups.push(g = { label: b.class || 'No class', list: [] });
    g.list.push(b);
  });
  return groups;
}

// ── Going home: home weekends, who's away now, signing out, the last month ──
function GoingHome({ data, outOf, head, onSignOut, onSignIn, onWeekend, onLeave }) {
  const { boarders, rooms, leaves, homeWeekends, today } = data;
  const [pickedIn, setPickedIn] = useState([]);
  const [pickedOut, setPickedOut] = useState([]);
  const byId = Object.fromEntries(boarders.map(b => [b.id, b]));
  const away = leaves.filter(l => !l.backAt && byId[l.studentId]);
  const back = leaves.filter(l => l.backAt && byId[l.studentId]);
  const here = boarders.filter(b => !outOf[b.id]);
  // Floor by floor (a block's level — tick one for everyone on it), then anyone not in a room.
  const hereGroups = [...floors(rooms).map(f => ({ label: floorLabel(f) || 'Rooms', list: here.filter(b => f.rooms.some(r => r.id === b.roomId)) })),
    { label: 'Not in a room', list: here.filter(b => !rooms.some(r => r.id === b.roomId)) }];
  const roomOf = b => rooms.find(r => r.id === b.roomId);
  const upcoming = homeWeekends.filter(w => w.ends >= today);
  const awayRows = away.map(l => ({ ...l, name: nameOf(byId[l.studentId]) }));
  const chosenOut = pickedOut.filter(id => awayRows.some(l => l.id === id));
  const chosenIn = pickedIn.filter(id => here.some(b => b.id === id));
  return (
    <>
      <div className="card">
        <div className="card-title" style={{ marginBottom: 2 }}>Home weekends</div>
        <div className="card-sub" style={{ marginBottom: 12 }}>Parents see these in the parent portal</div>
        <div className="course-lines">
          {upcoming.map((w, i) => (
            <button key={w.id} type="button" className="line-row" disabled={!head} onClick={() => onWeekend(w)}>
              <span className="ct-two">
                <span className="line-row-name">{w.name}{i === 0 && <span className="att-today">Next</span>}</span>
                <span className="line-row-sub">{niceDate(w.starts)}{w.leaveTime ? ` ${w.leaveTime}` : ''} → {niceDate(w.ends)}{w.returnTime ? ` ${w.returnTime}` : ''}</span>
              </span>
              {head && <Pencil size={13} />}
            </button>
          ))}
          {upcoming.length === 0 && <div className="text-muted" style={{ fontSize: 13 }}>None coming up.</div>}
          {head && <button type="button" className="line-row add" onClick={() => onWeekend({ name: 'Home weekend', starts: '', leaveTime: '16:00', ends: '', returnTime: '18:00' })}><Plus size={14} /> Add a home weekend</button>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-title">Away now ({awayRows.length})</div>
        <div className="card-sub" style={{ marginBottom: 12 }}>{awayRows.length ? 'Tick who has come back, then sign them in · tap a name for details' : 'Every boarder is here.'}</div>
        {awayRows.length > 0 && (
          <>
            {awayRows.map(l => {
              const late = l.backDue && l.backDue < today;
              return (
                <div key={l.id} className={`no-class-row ${chosenOut.includes(l.id) ? 'on' : ''}`} onClick={() => setPickedOut(p => (p.includes(l.id) ? p.filter(x => x !== l.id) : [...p, l.id]))}>
                  <input type="checkbox" checked={chosenOut.includes(l.id)} readOnly onClick={e => e.stopPropagation()} onChange={() => setPickedOut(p => (p.includes(l.id) ? p.filter(x => x !== l.id) : [...p, l.id]))} aria-label={`Select ${l.name}`} />
                  <span className="ct-two">
                    <span className="no-class-name">{l.name}{late && <span className="applied-tag check">Overdue</span>}</span>
                    <span className="bd-tick-sub">{l.reason || 'Out'} · {when(l.outAt)}{l.collectedBy ? ` · ${l.collectedBy}` : ''}{l.backDue ? ` · back ${niceDate(l.backDue)}` : ''}</span>
                  </span>
                  <button type="button" className="btn btn-sm" onClick={e => { e.stopPropagation(); onLeave(l); }}>Details</button>
                </div>
              );
            })}
            <div className="no-class-move">
              <span>{chosenOut.length ? `${chosenOut.length} selected` : 'Tick who is back'}</span>
              <button type="button" className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} disabled={!chosenOut.length}
                onClick={async () => { await onSignIn(chosenOut); setPickedOut([]); }}><LogIn size={13} />Signed back in</button>
            </div>
          </>
        )}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-title">Sign out</div>
        <div className="card-sub" style={{ marginBottom: 12 }}>Tick who is going (or a whole floor), then sign them out</div>
        <TickList groups={hereGroups} picked={pickedIn} setPicked={setPickedIn} sub={b => (roomOf(b) ? roomLabel(roomOf(b).name) : b.class)}
          actions={here.length > 0 && (
            <div className="no-class-move">
              <span>{chosenIn.length ? `${chosenIn.length} selected` : 'Tick who is going'}</span>
              <button type="button" className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} disabled={!chosenIn.length}
                onClick={() => { onSignOut(chosenIn); setPickedIn([]); }}><LogOut size={13} />Sign out</button>
            </div>
          )} />
      </div>

      {back.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-title" style={{ marginBottom: 10 }}>The last month</div>
          <div className="course-lines">
            {back.map(l => (
              <button key={l.id} type="button" className="line-row" onClick={() => onLeave(l)}>
                <span className="ct-two">
                  <span className="line-row-name">{nameOf(byId[l.studentId])}</span>
                  <span className="line-row-sub">{l.reason || 'Out'} · {when(l.outAt)} → {when(l.backAt)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ── Health: unwell and medicine given, the last month ──
function Health({ boarders, health, onAdd, onOpen }) {
  const byId = Object.fromEntries(boarders.map(b => [b.id, b]));
  const list = health.filter(h => byId[h.studentId]);
  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 2 }}>Unwell &amp; medicine</div>
      <div className="card-sub" style={{ marginBottom: 12 }}>The last month · tap one to see it all</div>
      <div className="course-lines">
        <button type="button" className="line-row add" onClick={onAdd}><Plus size={14} /> Write one down</button>
        {list.map(h => (
          <button key={h.id} type="button" className="line-row" onClick={() => onOpen(h)}>
            {h.kind === 'medicine' ? <Pill size={15} color="var(--blue)" /> : <span className="bd-dot" />}
            <span className="ct-two">
              <span className="line-row-name">{nameOf(byId[h.studentId])}</span>
              <span className="line-row-sub">{when(h.at)} · {h.kind === 'medicine' ? `${h.medicine}${h.dose ? ` ${h.dose}` : ''}` : h.note}</span>
            </span>
          </button>
        ))}
        {list.length === 0 && <div className="text-muted" style={{ fontSize: 13 }}>Nothing written down in the last month.</div>}
      </div>
    </div>
  );
}

export function HealthLines({ entry }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <BoxRow columns="repeat(2, minmax(0, 1fr))" cells={[
        { text: entry.kind === 'medicine' ? 'Medicine given' : 'Unwell', label: true },
        { text: when(entry.at), label: true },
      ]} />
      {entry.kind === 'medicine' && <div className="bd-detail"><strong>{entry.medicine}</strong>{entry.dose ? ` · ${entry.dose}` : ''}</div>}
      {entry.note && <div className="bd-detail">{entry.note}</div>}
      <div className="text-muted" style={{ fontSize: 12 }}>Written by {entry.by}</div>
    </div>
  );
}

// ── Pop-ups ──
function Shell({ title, onClose, children, footer, width = 460 }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: width }}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="btn btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">{footer}</div>
      </div>
    </div>
  );
}

function useBusy() {
  const [busy, setBusy] = useState(false);
  const wrap = fn => async (...a) => { setBusy(true); try { await fn(...a); } finally { setBusy(false); } };
  return [busy, wrap];
}

// Places to pick from: the blocks already written, and the levels already in a block.
const blocksOf = rooms => [...new Set(rooms.map(r => r.block).filter(Boolean))];
const levelsIn = (rooms, block) => [...new Set(rooms.filter(r => r.block === block).map(r => r.level).filter(Boolean))];

function RoomModal({ room, rooms, teachers, count, onClose, onSave, onDelete }) {
  const [f, setF] = useState({ id: room.id, block: room.block || '', level: room.level || '', name: room.name || '', beds: room.beds ?? 4, teacherId: room.teacherId || '' });
  const [sure, setSure] = useState(false);
  const [busy, wrap] = useBusy();
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  return (
    <Shell title={`Edit ${fullRoom(room)}`} onClose={onClose}
      footer={<>
        {sure
          ? <button className="btn" style={{ marginRight: 'auto', background: 'var(--red)', color: '#fff' }} disabled={busy} onClick={wrap(onDelete)}>Remove{count ? ` (${count} leave it)` : ''}</button>
          : <button className="btn" style={{ marginRight: 'auto', color: 'var(--red-text)' }} onClick={() => setSure(true)}><Trash2 size={13} />Remove</button>}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || !f.name.trim()} onClick={wrap(() => onSave(f))}><Save size={13} />Save</button>
      </>}>
      <div className="form-grid">
        <div className="form-grid form-grid-2">
          <div className="form-group"><label>Section</label><PickField value={f.block} onChange={v => set('block', v)} options={blocksOf(rooms)} placeholder="e.g. Block A, East Wing" /></div>
          <div className="form-group"><label>Level</label><PickField value={f.level} onChange={v => set('level', v)} options={levelsIn(rooms, f.block)} placeholder="e.g. Ground, 1" /></div>
          <div className="form-group"><label>Room number or name</label><input value={f.name} onChange={e => set('name', e.target.value)} maxLength={40} /></div>
          <div className="form-group"><label>Beds</label><input type="number" min={0} max={500} value={f.beds} onChange={e => set('beds', e.target.value)} /></div>
        </div>
        <div className="form-group"><label>Teacher in charge</label>
          <select value={f.teacherId} onChange={e => set('teacherId', e.target.value)}>
            <option value="">No one</option>
            {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>
    </Shell>
  );
}

// Adds a level's rooms in one go: the block, the level, then each room's number and beds.
function AddRoomsModal({ at, rooms, teachers, onClose, onSave }) {
  const [f, setF] = useState({ block: at.block || '', level: at.level || '', teacherId: '' });
  const [list, setList] = useState([{ name: '', beds: 4 }]);
  const [busy, wrap] = useBusy();
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const setRow = (i, k, v) => setList(l => l.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const filled = list.filter(r => r.name.trim());
  return (
    <Shell title={at.block ? `Add rooms to ${sectionLabel(at.block)}` : 'Add rooms'} onClose={onClose} width={500}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || !filled.length} onClick={wrap(() => onSave(f, filled))}>
          <Save size={13} />Add {filled.length || ''} room{filled.length === 1 ? '' : 's'}</button>
      </>}>
      <div className="form-grid">
        <div className="form-grid form-grid-2">
          <div className="form-group"><label>Section</label>
            <PickField value={f.block} onChange={v => set('block', v)} options={blocksOf(rooms)} placeholder="e.g. Block A, East Wing, Dorm 3" autoFocus={!at.block} /></div>
          <div className="form-group"><label>Level</label>
            <PickField value={f.level} onChange={v => set('level', v)} options={levelsIn(rooms, f.block)} placeholder="e.g. Ground, 1, 2" /></div>
        </div>
        <div className="form-group">
          <label>Rooms on this level</label>
          <div className="bd-room-rows">
            <span className="bd-room-rows-head">Room number or name</span><span className="bd-room-rows-head">Beds</span><span />
            {list.map((r, i) => (
              <React.Fragment key={i}>
                <input value={r.name} onChange={e => setRow(i, 'name', e.target.value)} placeholder={i === 0 ? 'e.g. 1, 12, A3' : ''} maxLength={40} aria-label={`Room ${i + 1}`} />
                <input type="number" min={0} max={500} value={r.beds} onChange={e => setRow(i, 'beds', e.target.value)} aria-label={`Beds in room ${i + 1}`} />
                <button type="button" className="btn btn-icon btn-sm" disabled={list.length === 1} aria-label="Take this room off" onClick={() => setList(l => l.filter((_, j) => j !== i))}><X size={14} /></button>
              </React.Fragment>
            ))}
          </div>
          <button type="button" className="line-row add" style={{ marginTop: 8 }}
            onClick={() => setList(l => [...l, { name: nextRoomName(l[l.length - 1].name), beds: l[l.length - 1].beds }])}><Plus size={13} /> Another room</button>
        </div>
        <div className="form-group"><label>Teacher in charge (of these rooms)</label>
          <select value={f.teacherId} onChange={e => set('teacherId', e.target.value)}>
            <option value="">No one</option>
            {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="text-muted" style={{ fontSize: 12 }}>No sections or levels? Leave them blank — just the rooms.</div>
      </div>
    </Shell>
  );
}

function RenameModal({ what, name, current, onClose, onSave }) {
  const [to, setTo] = useState(current || '');
  const [busy, wrap] = useBusy();
  return (
    <Shell title={`Rename ${name}`} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || !to.trim() || to.trim() === current} onClick={wrap(() => onSave(to.trim()))}><Save size={13} />Save</button>
      </>}>
      <div className="form-group"><label>{what === 'block' ? 'Section' : 'Level'}</label>
        <input value={to} onChange={e => setTo(e.target.value)} maxLength={40} autoFocus /></div>
    </Shell>
  );
}

function SignOutModal({ boarders, homeWeekends, today, onClose, onSave }) {
  const weekend = homeWeekends.find(w => w.starts <= shift(today, 2) && w.ends >= today);
  const [f, setF] = useState({ reason: weekend ? 'Home weekend' : '', collectedBy: '', backDue: weekend ? weekend.ends : '' });
  const [busy, wrap] = useBusy();
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const one = boarders.length === 1;
  return (
    <Shell title={one ? `Sign out ${nameOf(boarders[0])}` : `Sign out ${boarders.length} boarders`} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy} onClick={wrap(() => onSave(f))}><LogOut size={13} />Sign out now</button>
      </>}>
      {!one && <div className="text-muted" style={{ fontSize: 12.5, marginBottom: 10 }}>{boarders.map(nameOf).join(', ')}</div>}
      <div className="form-grid">
        <div className="form-group"><label>Why</label><ChoiceBoxes options={REASONS} value={f.reason} onChange={v => set('reason', v)} /></div>
        <div className="form-group"><label>Collected by</label>
          <input value={f.collectedBy} onChange={e => set('collectedBy', e.target.value)} placeholder={one ? 'e.g. Father, Uncle Yusuf' : 'e.g. Parents, the minibus'} maxLength={120} /></div>
        <div className="form-group"><label>Due back</label><input type="date" value={f.backDue} min={today} onChange={e => set('backDue', e.target.value)} /></div>
      </div>
    </Shell>
  );
}

function WeekendModal({ weekend, onClose, onSave, onDelete }) {
  const [f, setF] = useState({ ...weekend });
  const [busy, wrap] = useBusy();
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  return (
    <Shell title={weekend.id ? 'Edit home weekend' : 'Add a home weekend'} onClose={onClose}
      footer={<>
        {weekend.id && <button className="btn" style={{ marginRight: 'auto', color: 'var(--red-text)' }} disabled={busy} onClick={wrap(onDelete)}><Trash2 size={13} />Remove</button>}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || !f.starts || !f.ends || f.ends < f.starts} onClick={wrap(() => onSave(f))}><Save size={13} />Save</button>
      </>}>
      <div className="form-grid">
      <div className="form-group"><label>Name</label><input value={f.name} onChange={e => set('name', e.target.value)} placeholder="Home weekend, Half term…" maxLength={80} /></div>
      <div className="form-grid form-grid-2">
        <div className="form-group"><label>Go home on</label><input type="date" value={f.starts} onChange={e => set('starts', e.target.value)} /></div>
        <div className="form-group"><label>From</label><input type="time" value={f.leaveTime} onChange={e => set('leaveTime', e.target.value)} /></div>
        <div className="form-group"><label>Come back on</label><input type="date" value={f.ends} min={f.starts || undefined} onChange={e => set('ends', e.target.value)} /></div>
        <div className="form-group"><label>By</label><input type="time" value={f.returnTime} onChange={e => set('returnTime', e.target.value)} /></div>
      </div>
      </div>
    </Shell>
  );
}

function LeaveModal({ leave, boarder, head, onClose, onBack, onDelete }) {
  const [busy, wrap] = useBusy();
  return (
    <Shell title={boarder ? nameOf(boarder) : 'Going home'} onClose={onClose}
      footer={<>
        {head && <button className="btn" style={{ marginRight: 'auto', color: 'var(--red-text)' }} disabled={busy} onClick={wrap(onDelete)}><Trash2 size={13} />Remove</button>}
        {!leave.backAt && <button className="btn btn-primary" disabled={busy} onClick={wrap(onBack)}><LogIn size={13} />Signed back in</button>}
        {leave.backAt && <button className="btn btn-primary" onClick={onClose}>Done</button>}
      </>}>
      <div style={{ display: 'grid', gap: 6 }}>
        <BoxRow columns="repeat(2, minmax(0, 1fr))" cells={[{ text: leave.reason || 'Out', sub: 'Why', label: true }, { text: leave.collectedBy || '—', sub: 'Collected by', label: true }]} />
        <BoxRow columns="repeat(2, minmax(0, 1fr))" cells={[
          { text: when(leave.outAt), sub: `Signed out · ${leave.outBy}`, label: true },
          leave.backAt ? { text: when(leave.backAt), sub: `Back · ${leave.backBy}`, tone: 'green' } : { text: leave.backDue ? niceDate(leave.backDue) : '—', sub: 'Due back', label: true },
        ]} />
        {head && <div className="text-muted" style={{ fontSize: 12 }}>Remove only a sign-out made by mistake.</div>}
      </div>
    </Shell>
  );
}

function HealthModal({ boarders, onClose, onSave }) {
  const [day, time] = nowParts();
  const [f, setF] = useState({ studentId: '', kind: 'medicine', note: '', medicine: '', dose: '', day, time });
  const [busy, wrap] = useBusy();
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const who = boarders.find(b => b.id === f.studentId);
  const ok = f.studentId && f.kind && (f.kind === 'medicine' ? f.medicine.trim() : f.note.trim());
  return (
    <Shell title="Unwell or medicine" onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || !ok}
          onClick={wrap(() => onSave({ studentId: f.studentId, kind: f.kind, note: f.note, medicine: f.kind === 'medicine' ? f.medicine : '', dose: f.kind === 'medicine' ? f.dose : '', at: f.day && f.time ? `${f.day} ${f.time}` : '' }))}>
          <Save size={13} />Save</button>
      </>}>
      <div className="form-grid">
      <div className="form-group"><label>Boarder</label>
        <select value={f.studentId} onChange={e => set('studentId', e.target.value)}>
          <option value="">Select boarder…</option>
          {boarders.map(b => <option key={b.id} value={b.id}>{nameOf(b)} · {b.class}</option>)}
        </select>
      </div>
      {who && (who.allergies || who.medical || who.medication) && (
        <div className="bd-health-note" style={{ marginBottom: 0 }}>{[who.allergies && `Allergies: ${who.allergies}`, who.medical && `Medical: ${who.medical}`, who.medication && `Medication: ${who.medication}`].filter(Boolean).join(' · ')}</div>
      )}
      <div className="form-group"><label>What happened</label><ChoiceBoxes options={['Medicine given', 'Unwell']} value={f.kind === 'medicine' ? 'Medicine given' : f.kind === 'unwell' ? 'Unwell' : ''}
        onChange={v => set('kind', v === 'Medicine given' ? 'medicine' : v === 'Unwell' ? 'unwell' : '')} /></div>
      {f.kind === 'medicine' && (
        <div className="form-grid form-grid-2">
          <div className="form-group"><label>Medicine</label><input value={f.medicine} onChange={e => set('medicine', e.target.value)} placeholder="e.g. Paracetamol" maxLength={120} /></div>
          <div className="form-group"><label>How much</label><input value={f.dose} onChange={e => set('dose', e.target.value)} placeholder="e.g. 500mg, 1 spoon" maxLength={80} /></div>
        </div>
      )}
      <div className="form-group"><label>{f.kind === 'unwell' ? "What's wrong" : 'Notes (if any)'}</label>
        <GrowingText value={f.note} onChange={e => set('note', e.target.value)} maxLength={500} placeholder={f.kind === 'unwell' ? 'e.g. Temperature, sent to rest' : ''} /></div>
      <div className="form-grid form-grid-2">
        <div className="form-group"><label>Day</label><input type="date" value={f.day} onChange={e => set('day', e.target.value)} /></div>
        <div className="form-group"><label>Time</label><input type="time" value={f.time} onChange={e => set('time', e.target.value)} /></div>
      </div>
      </div>
    </Shell>
  );
}
