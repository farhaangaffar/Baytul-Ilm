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
import { TripBoxes } from '../components/BoarderRecord';
import { sectionLabel, levelLabel, roomLabel, floorLabel, fullRoom, layout, floors, nextRoomName } from '../lib/boardingRooms';
import {
  getBoarding, saveRoom, deleteRoom, deleteRoomGroup, saveLevel, saveSection, placeBoarders, markNight, signOutBoarders, signInBoarders, deleteLeave,
  saveHomeWeekend, deleteHomeWeekend, addHealthNote, deleteHealthNote, niceDate, addRooms, renameBoarding,
  getBoarderRecord, weekendAnswer,
} from '../lib/store';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Plus, X, Save, Trash2, Pencil, LogOut, LogIn, Pill, Search } from 'lucide-react';

const TABS = [['tonight', 'Tonight'], ['rooms', 'Rooms'], ['home', 'Going home'], ['health', 'Health']];
const MARKS = [['in', 'In', 'P'], ['away', 'Missing', 'A'], ['sick', 'Sick', 'L']]; // status, label, colour (attendance's)
const STATUS = { in: 'In', away: 'Missing', sick: 'Sick' };
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
  const missing = here.filter(b => mark[b.id]?.status === 'away').length; // stored as 'away'; shown as Missing
  const unwellWeek = new Set(health.filter(h => h.at.slice(0, 10) >= shift(today, -7)).map(h => h.studentId)).size;
  const teacherName = id => teachers.find(t => t.id === id)?.name || '';

  return (
    <Layout title={title} subtitle={`${boarders.length} boarder${boarders.length === 1 ? '' : 's'}`}>
      <div className="boarding-page">
        <BoxRow className="bd-figures" cells={[
          { text: boarders.length, sub: 'Boarders', className: 'ct-figure' },
          missing
            ? { text: `${missing} missing`, sub: `${inTonight} / ${here.length} in`, tone: 'red', onClick: () => setTab('tonight') }
            : { text: `${inTonight} / ${here.length}`, sub: date === today ? 'In tonight' : 'In that night', className: 'ct-figure' },
          { text: out.length, sub: 'Not in', className: 'ct-figure', onClick: () => setTab('home') },
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
            onOpen={b => setModal({ kind: 'boarder', boarder: b })}
            onSign={mode => setModal({ kind: 'sign', mode })}
            onBack={ids => run(() => signInBoarders(ids), 'Signed in')}
            onWeekendOpen={w => setModal({ kind: 'weekend-view', id: w.id })}
            onWeekendAdd={() => setModal({ kind: 'weekend', weekend: { name: 'Home weekend', starts: '', leaveTime: '16:00', ends: '', returnTime: '18:00' } })} />
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
      {modal?.kind === 'rename' && modal.what === 'level' && (
        <LevelModal block={modal.block} level={modal.level} rooms={rooms} teachers={teachers} boarders={boarders} onClose={() => setModal(null)}
          onSave={async (to, list, teacherId) => { if (await run(() => saveLevel(modal.block, modal.level, to, list, teacherId), 'Level saved')) setModal(null); }}
          onDelete={async () => { if (await run(() => deleteRoomGroup('level', modal.block, modal.level), 'Level removed')) setModal(null); }} />
      )}
      {modal?.kind === 'rename' && modal.what === 'block' && (
        <SectionModal block={modal.block} rooms={rooms} boarders={boarders} onClose={() => setModal(null)}
          onSave={async (to, levels) => { if (await run(() => saveSection(modal.block, to, levels), 'Section saved')) setModal(null); }}
          onDelete={async () => { if (await run(() => deleteRoomGroup('block', modal.block), 'Section removed')) setModal(null); }} />
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
      {modal?.kind === 'boarder' && (
        <BoarderSheet boarder={modal.boarder} data={data} outOf={outOf} onClose={() => setModal(null)}
          onSignOut={ids => setModal({ kind: 'out', ids })}
          onBack={ids => run(() => signInBoarders(ids), 'Signed in')}
          onRemove={id => run(() => deleteLeave(id), 'Sign-out removed')} />
      )}
      {modal?.kind === 'sign' && (
        <SignPicker mode={modal.mode} data={data} outOf={outOf} onClose={() => setModal(null)}
          onPick={async b => {
            if (modal.mode === 'out') { setModal({ kind: 'out', ids: [b.id] }); return; }
            await run(() => signInBoarders([outOf[b.id].id]), `${nameOf(b)} signed in`);
          }} />
      )}
      {modal?.kind === 'weekend-view' && homeWeekends.find(w => w.id === modal.id) && (
        <WeekendSheet weekend={homeWeekends.find(w => w.id === modal.id)} data={data} head={head} onClose={() => setModal(null)}
          onEdit={() => setModal({ kind: 'weekend', weekend: homeWeekends.find(w => w.id === modal.id) })}
          onAdd={() => setModal({ kind: 'stay', id: modal.id })}
          onRemove={b => run(() => weekendAnswer(modal.id, [b.id], true), `${nameOf(b)} going home`)} />
      )}
      {modal?.kind === 'stay' && homeWeekends.find(w => w.id === modal.id) && (
        <StayPicker weekend={homeWeekends.find(w => w.id === modal.id)} boarders={boarders} onClose={() => setModal({ kind: 'weekend-view', id: modal.id })}
          onAdd={b => run(() => weekendAnswer(modal.id, [b.id], false), `${nameOf(b)} staying`)} />
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
  const [open, setOpen] = useState([]); // floors opened (each starts closed — one line per floor)
  const toggle = k => setOpen(o => (o.includes(k) ? o.filter(x => x !== k) : [...o, k]));
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
          {date === today && <button type="button" className="att-mark bd-mark" onClick={() => onMark([b.id], 'in')}>Back</button>}
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
            <div className="att-day-status">In, Missing or Sick for each boarder</div>
          </div>
          <button type="button" className="btn btn-icon btn-sm" aria-label="Night after" disabled={date >= today} onClick={() => onDate(shift(date, 1))}><ChevronRight size={16} /></button>
        </div>
      </div>
      {cards.map(c => {
        const present = c.list.filter(b => !outOf[b.id]);
        const unmarked = present.filter(b => !mark[b.id]);
        const missing = present.filter(b => mark[b.id]?.status === 'away').length;
        const isOpen = open.includes(c.key);
        return (
          <div className="card att-week" key={c.key} style={{ marginTop: 12 }}>
            <div className="bd-room-head">
              <button type="button" className="bd-floor-toggle" aria-expanded={isOpen} onClick={() => toggle(c.key)}>
                {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                <span className="bd-floor-title">{c.title}</span>
                <span className="bd-room-count">{present.filter(b => mark[b.id]?.status === 'in').length} of {present.length} in{missing ? <b className="bd-missing"> · {missing} missing</b> : ''}</span>
              </button>
              {unmarked.length > 0 && <button type="button" className="btn btn-sm" onClick={() => onMark(unmarked.map(b => b.id), 'in')}>Rest are in</button>}
            </div>
            {isOpen && c.rooms.map(r => (
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

// ── Rooms, as lists (the owner's preference): a line per section → tap → the section's card, its levels as closed
// lines → open a level for its room lines → tap a room → who's in it, put a boarder in, edit. Boarders not in a room
// are one amber line → tick and "Move to a room".
function Rooms({ data, teacherName, head, onEdit, onAdd, onRename, onPlace }) {
  const { rooms, boarders } = data;
  const [section, setSection] = useState(null);   // the section (its `block`) whose card is open
  const [roomId, setRoomId] = useState('');       // the room whose card is open
  const [placing, setPlacing] = useState(false);  // the "not in a room" card
  const inRoom = r => boarders.filter(b => b.roomId === r.id);
  const unplaced = boarders.filter(b => !b.roomId || !rooms.some(r => r.id === b.roomId));
  const lay = layout(rooms);
  const used = list => list.reduce((t, r) => t + inRoom(r).length, 0);
  const beds = list => list.reduce((t, r) => t + r.beds, 0);
  const room = rooms.find(r => r.id === roomId);
  const open = section !== null && lay.find(x => x.block === section);
  return (
    <>
      {unplaced.length > 0 && (
        <button type="button" className="line-row bd-amber" style={{ marginBottom: 12 }} onClick={() => setPlacing(true)}>
          <span className="line-row-name">{unplaced.length} boarder{unplaced.length === 1 ? '' : 's'} not in a room</span>
          <span className="line-row-sub">{head ? 'Place' : 'See'}</span><ChevronRight size={16} />
        </button>
      )}
      <div className="card">
        <div className="course-lines">
          {lay.map(x => {
            const all = x.levels.flatMap(l => l.rooms);
            return (
              <button key={x.block || 'none'} type="button" className="line-row" onClick={() => setSection(x.block)}>
                <span className="ct-two">
                  <span className="line-row-name">{x.block || 'Rooms'}</span>
                  <span className="line-row-sub">{x.levels.length} level{x.levels.length === 1 ? '' : 's'} · {all.length} room{all.length === 1 ? '' : 's'}</span>
                </span>
                <span className="line-row-sub">{used(all)} / {beds(all)} beds</span><ChevronRight size={16} />
              </button>
            );
          })}
          {!rooms.length && <div className="text-muted" style={{ fontSize: 13 }}>No rooms yet.</div>}
          {head && <button type="button" className="line-row add" onClick={() => onAdd({ block: '', level: '' })}><Plus size={14} /> {rooms.length ? 'Add a section' : 'Add rooms'}</button>}
        </div>
      </div>

      {open && !room && (
        <SectionSheet section={open} head={head} inRoom={inRoom} used={used} beds={beds} onClose={() => setSection(null)}
          onRoom={r => setRoomId(r.id)} onAdd={onAdd} onRename={onRename} />
      )}
      {room && (
        <RoomSheet room={room} people={inRoom(room)} boarders={boarders} rooms={rooms} head={head} teacherName={teacherName}
          onClose={() => setRoomId('')} onEdit={() => onEdit(room)}
          onOut={b => onPlace([b.id], null, 'no room')}
          onIn={b => onPlace([b.id], room.id, fullRoom(room))} />
      )}
      {placing && (
        <PlaceSheet unplaced={unplaced} rooms={rooms} inRoom={inRoom} head={head} onClose={() => setPlacing(false)} onPlace={onPlace} />
      )}
    </>
  );
}

const roomDots = (r, n) => r.beds <= 12 && <span className="bd-dots" aria-hidden="true">{Array.from({ length: r.beds }, (_, i) => <i key={i} className={i >= n ? 'free' : ''} />)}</span>;

// A section's card: its figures, then its levels as closed lines — open one for its rooms.
function SectionSheet({ section, head, inRoom, used, beds, onClose, onRoom, onAdd, onRename }) {
  const [openLevel, setOpenLevel] = useState(null);
  const all = section.levels.flatMap(l => l.rooms);
  return (
    <Shell title={section.block || 'Rooms'} onClose={onClose} width={480}
      footer={<>
        {head && <button className="btn" style={{ marginRight: 'auto' }} onClick={() => onRename({ what: 'block', block: section.block })}><Pencil size={13} />Edit section</button>}
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </>}>
      <BoxRow columns="repeat(3, minmax(0, 1fr))" cells={[
        { text: all.length, sub: 'Rooms', className: 'ct-figure' },
        { text: used(all), sub: 'Boarders', className: 'ct-figure' },
        { text: beds(all) - used(all), sub: 'Free beds', tone: beds(all) - used(all) ? 'green' : undefined },
      ]} />
      <div className="course-lines" style={{ marginTop: 6 }}>
        {section.levels.map(l => {
          const on = openLevel === l.level;
          return (
            <React.Fragment key={l.level || 'none'}>
              <button type="button" className={`line-row ${on ? 'on' : ''}`} onClick={() => setOpenLevel(on ? null : l.level)}>
                <span className="ct-two">
                  <span className="line-row-name">{levelLabel(l.level) || 'Rooms'}</span>
                  <span className="line-row-sub">{l.rooms.length} room{l.rooms.length === 1 ? '' : 's'}</span>
                </span>
                <span className="line-row-sub">{used(l.rooms)} / {beds(l.rooms)}</span>
                {on ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {on && (
                <div className="course-open">
                  {l.rooms.map(r => (
                    <button key={r.id} type="button" className="line-row bd-room-line" onClick={() => onRoom(r)}>
                      <span className="line-row-name">{roomLabel(r.name)}</span>
                      {roomDots(r, inRoom(r).length)}
                      <span className="bd-free">{inRoom(r).length}/{r.beds}</span>
                    </button>
                  ))}
                  {head && (
                    <div className="course-open-actions">
                      <button type="button" className="line-row add" onClick={() => onRename({ what: 'level', block: section.block, level: l.level })}><Pencil size={13} /> Edit level</button>
                    </div>
                  )}
                </div>
              )}
            </React.Fragment>
          );
        })}
        {head && <button type="button" className="line-row add" onClick={() => onAdd({ block: section.block, level: '' })}><Plus size={13} /> Add a level</button>}
      </div>
    </Shell>
  );
}

// A room's card: who sleeps there (✕ to take them out), put a boarder in (type a name), edit.
function RoomSheet({ room, people, boarders, rooms, head, teacherName, onClose, onEdit, onOut, onIn }) {
  const [adding, setAdding] = useState(false);
  const [find, setFind] = useState('');
  const [busy, wrap] = useBusy();
  const free = Math.max(0, room.beds - people.length);
  const q = find.trim().toLowerCase();
  const roomOf = b => rooms.find(r => r.id === b.roomId);
  const others = boarders.filter(b => b.roomId !== room.id && (!q || nameOf(b).toLowerCase().includes(q)))
    .sort((a, b) => (roomOf(a) ? 1 : 0) - (roomOf(b) ? 1 : 0)).slice(0, 30);
  return (
    <Shell title={fullRoom(room)} onClose={onClose} width={480}
      footer={<>
        {head && <button className="btn" style={{ marginRight: 'auto' }} onClick={onEdit}><Pencil size={13} />Edit room</button>}
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </>}>
      <BoxRow columns="repeat(3, minmax(0, 1fr))" cells={[
        { text: people.length, sub: 'In the room', className: 'ct-figure' },
        { text: free, sub: free === 1 ? 'Free bed' : 'Free beds', tone: free ? 'green' : undefined },
        { text: teacherName(room.teacherId) || '—', sub: 'In charge', className: 'ct-figure' },
      ]} />
      <div className="course-lines" style={{ marginTop: 6 }}>
        {people.map(b => (
          <div key={b.id} className="line-row" style={{ cursor: 'default' }}>
            <span className="line-row-name">{nameOf(b)}<HealthDot student={b} /></span>
            {head && <button type="button" className="btn btn-icon btn-sm" disabled={busy} aria-label={`Take ${nameOf(b)} out of this room`} onClick={wrap(() => onOut(b))}><X size={14} /></button>}
          </div>
        ))}
        {!people.length && <div className="text-muted" style={{ fontSize: 13 }}>Nobody in this room yet.</div>}
        {head && free > 0 && !adding && <button type="button" className="line-row add" onClick={() => setAdding(true)}><Plus size={13} /> Put a boarder in this room</button>}
      </div>
      {adding && (
        <>
          <div className="bd-search" style={{ margin: '10px 0' }}><Search size={15} /><input value={find} onChange={e => setFind(e.target.value)} placeholder="Type a name…" autoFocus /></div>
          <div className="course-lines">
            {others.map(b => (
              <button key={b.id} type="button" className="line-row" disabled={busy || free === 0} onClick={wrap(async () => { await onIn(b); setFind(''); })}>
                <span className="ct-two"><span className="line-row-name">{nameOf(b)}</span><span className="line-row-sub">{roomOf(b) ? `Now in ${fullRoom(roomOf(b))}` : 'Not in a room'}</span></span>
              </button>
            ))}
          </div>
        </>
      )}
    </Shell>
  );
}

// Boarders not in a room: tick them (or a whole class) and "Move to a room".
function PlaceSheet({ unplaced, rooms, inRoom, head, onClose, onPlace }) {
  const [picked, setPicked] = useState([]);
  const [choosing, setChoosing] = useState(false);
  const chosen = picked.filter(id => unplaced.some(b => b.id === id));
  return (
    <>
      <Shell title={`Not in a room (${unplaced.length})`} onClose={onClose} width={480}
        footer={<>
          <button className="btn" onClick={onClose}>Close</button>
          {head && <button className="btn btn-primary" disabled={!chosen.length || !rooms.length} onClick={() => setChoosing(true)}>Move {chosen.length || ''} to a room</button>}
        </>}>
        {head
          ? <TickList groups={groupByClass(unplaced)} picked={picked} setPicked={setPicked} />
          : unplaced.map(b => <div key={b.id} className="no-class-row" style={{ cursor: 'default' }}><span className="no-class-name">{nameOf(b)}</span><span className="bd-tick-sub">{b.class}</span></div>)}
      </Shell>
      {choosing && (
        <RoomChooser rooms={rooms} inRoom={inRoom} people={unplaced.filter(b => chosen.includes(b.id))} onClose={() => setChoosing(false)}
          onMove={async value => {
            const r = rooms.find(x => x.id === value);
            await onPlace(chosen, value, r ? fullRoom(r) : 'a room');
            setPicked([]); setChoosing(false);
            if (chosen.length >= unplaced.length) onClose();
          }} />
      )}
    </>
  );
}

// "Move to a room": a line per room under its section and level, its beds as dots (green = free), full
// rooms (or ones without a bed for everyone ticked) faded; tap one, then Move.
function RoomChooser({ rooms, inRoom, people, withNone, onClose, onMove }) {
  const [pick, setPick] = useState('');
  const [busy, wrap] = useBusy();
  const free = r => Math.max(0, r.beds - inRoom(r).filter(b => !people.some(p => p.id === b.id)).length);
  const chosenRoom = rooms.find(r => r.id === pick);
  // A room with some beds free can always be chosen; if it hasn't a bed for everyone ticked, say so.
  const short = chosenRoom && free(chosenRoom) < people.length;
  return (
    <Shell title={`Move ${people.length} boarder${people.length === 1 ? '' : 's'}`} onClose={onClose} width={480}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || !pick || short} onClick={wrap(() => onMove(pick))}>
          {pick === 'none' ? 'Take out of the room' : chosenRoom ? `Move to ${roomLabel(chosenRoom.name)}` : 'Choose a room'}</button>
      </>}>
      <div className="bd-who">{people.map(p => <span key={p.id}>{nameOf(p)}</span>)}</div>
      {floors(rooms).map(f => (
        <div key={`${f.block}|${f.level}`}>
          <div className="bd-pick-head">{f.block || 'Rooms'}{f.level && <small> · {levelLabel(f.level)}</small>}</div>
          {f.rooms.map(r => {
            const left = free(r);
            const full = left === 0;
            const taken = r.beds - left;
            return (
              <React.Fragment key={r.id}>
              <button type="button" className={`line-row bd-pick ${pick === r.id ? 'on' : ''} ${full ? 'full' : ''}`} disabled={full}
                onClick={() => setPick(r.id)}>
                <span className="line-row-name">{roomLabel(r.name)}</span>
                {r.beds <= 12 && <span className="bd-dots" aria-hidden="true">{Array.from({ length: r.beds }, (_, i) => <i key={i} className={i >= taken ? 'free' : ''} />)}</span>}
                <span className="bd-free">{left === 0 ? 'Full' : `${left} free`}</span>
              </button>
                {short && pick === r.id && (
                  <div className="bd-short">Only {left} bed{left === 1 ? '' : 's'} free here — you've ticked {people.length}. Untick some, or choose a room with more space.</div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      ))}
      {withNone && (
        <button type="button" className={`line-row bd-pick ${pick === 'none' ? 'on' : ''}`} style={{ marginTop: 12 }} onClick={() => setPick('none')}>
          <span className="line-row-name">Take out of the room</span>
        </button>
      )}
    </Shell>
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

// ── Going home, kept plain: Sign out / Sign in (type a name, tap it), Here · Not in · Late back, the list of who's
// not in (Back on each), and the home weekends — tap one for who's staying (everyone else goes home, signed out by
// itself at the leave time). Coming back can also be marked In on Tonight's register.
function GoingHome({ data, outOf, head, onOpen, onSign, onBack, onWeekendOpen, onWeekendAdd }) {
  const { boarders, rooms, leaves, homeWeekends, today } = data;
  const [openFloor, setOpenFloor] = useState('');
  const byId = Object.fromEntries(boarders.map(b => [b.id, b]));
  const out = leaves.filter(l => byId[l.studentId]);
  const late = l => l.backDue && l.backDue < today;
  const sorted = [...out].sort((a, b) => (late(a) ? 0 : 1) - (late(b) ? 0 : 1) || nameOf(byId[a.studentId]).localeCompare(nameOf(byId[b.studentId])));
  const line = l => {
    const b = byId[l.studentId];
    return (
      <div key={l.id} className={`line-row ${late(l) ? 'bd-amber' : ''}`} onClick={() => onOpen(b)}>
        <span className="ct-two">
          <span className="line-row-name">{nameOf(b)}</span>
          <span className="line-row-sub">{late(l) ? `Late · due ${niceDate(l.backDue)}` : l.backDue ? `Due ${niceDate(l.backDue)}` : l.reason || 'Out'}</span>
        </span>
        <button type="button" className="btn btn-primary btn-sm" onClick={e => { e.stopPropagation(); onBack([l.id]); }}>Back</button>
      </div>
    );
  };
  // A long list (a home weekend) goes floor by floor, each floor closed.
  const floorsOut = [...floors(rooms).map(f => ({ key: `${f.block}|${f.level}`, label: floorLabel(f) || 'Rooms', ids: new Set(f.rooms.map(r => r.id)) })), { key: 'none', label: 'Not in a room', ids: null }]
    .map(f => ({ ...f, list: sorted.filter(l => (f.ids ? f.ids.has(byId[l.studentId].roomId) : !rooms.some(r => r.id === byId[l.studentId].roomId))) }))
    .filter(f => f.list.length);
  const upcoming = homeWeekends.filter(w => w.ends >= today);
  return (
    <>
      <div className="bd-big">
        <button type="button" onClick={() => onSign('out')}>Sign out<small>going home</small></button>
        <button type="button" onClick={() => onSign('in')}>Sign in<small>{out.length} not in</small></button>
      </div>
      <BoxRow columns="repeat(3, minmax(0, 1fr))" cells={[
        { text: boarders.length - out.length, sub: 'Here', tone: 'green' },
        { text: out.length, sub: 'Not in', className: 'ct-figure' },
        { text: out.filter(late).length, sub: 'Late back', ...(out.some(late) ? { tone: 'red' } : { className: 'ct-figure' }) },
      ]} />

      {out.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-title" style={{ marginBottom: 10 }}>Not in</div>
          <div className="course-lines">
            {out.length <= 12 ? sorted.map(line) : floorsOut.map(f => (
              <React.Fragment key={f.key}>
                <button type="button" className={`line-row ${openFloor === f.key ? 'on' : ''}`} onClick={() => setOpenFloor(openFloor === f.key ? '' : f.key)}>
                  <span className="line-row-name">{f.label}</span><span className="line-row-sub">{f.list.length}{f.list.some(late) ? ` · ${f.list.filter(late).length} late` : ''}</span>
                  {openFloor === f.key ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                {openFloor === f.key && <div className="course-open">{f.list.map(line)}</div>}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-title" style={{ marginBottom: 10 }}>Home weekends</div>
        <div className="course-lines">
          {upcoming.map(w => (
            <button key={w.id} type="button" className="line-row" onClick={() => onWeekendOpen(w)}>
              <span className="ct-two">
                <span className="line-row-name">{niceDate(w.starts)} – {niceDate(w.ends)}</span>
                <span className="line-row-sub">{w.staying.length ? `${w.staying.length} staying` : w.name}</span>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
          {!upcoming.length && <div className="text-muted" style={{ fontSize: 13 }}>None coming up.</div>}
          {head && <button type="button" className="line-row add" onClick={onWeekendAdd}><Plus size={14} /> Add a home weekend</button>}
        </div>
      </div>
    </>
  );
}

// Sign out / Sign in: type a name, tap it. Signing in is done straight away; signing out asks who collected them.
function SignPicker({ mode, data, outOf, onClose, onPick }) {
  const [find, setFind] = useState('');
  const [busy, wrap] = useBusy();
  const q = find.trim().toLowerCase();
  const pool = data.boarders.filter(b => (mode === 'in' ? outOf[b.id] : !outOf[b.id]));
  const list = pool.filter(b => !q || nameOf(b).toLowerCase().includes(q)).slice(0, 40);
  return (
    <Shell title={mode === 'in' ? 'Sign in' : 'Sign out'} onClose={onClose} footer={<button className="btn" onClick={onClose}>Close</button>}>
      <div className="bd-search" style={{ margin: '0 0 10px' }}><Search size={15} /><input value={find} onChange={e => setFind(e.target.value)} placeholder="Type a name…" autoFocus /></div>
      <div className="course-lines">
        {list.map(b => (
          <button key={b.id} type="button" className="line-row" disabled={busy} onClick={wrap(async () => { await onPick(b); setFind(''); })}>
            <span className="ct-two"><span className="line-row-name">{nameOf(b)}</span><span className="line-row-sub">{b.class}</span></span>
          </button>
        ))}
        {!list.length && <div className="text-muted" style={{ fontSize: 13 }}>{pool.length ? 'No one by that name.' : mode === 'in' ? 'Everyone is in.' : 'Everyone is out.'}</div>}
      </div>
    </Shell>
  );
}

// A home weekend: going home / staying, who's staying (✕ to take them off), add someone staying.
function WeekendSheet({ weekend, data, head, onClose, onEdit, onAdd, onRemove }) {
  const byId = Object.fromEntries(data.boarders.map(b => [b.id, b]));
  const staying = weekend.staying.map(id => byId[id]).filter(Boolean);
  return (
    <Shell title={`${niceDate(weekend.starts)} – ${niceDate(weekend.ends)}`} onClose={onClose}
      footer={<>
        {head && <button className="btn" style={{ marginRight: 'auto' }} onClick={onEdit}><Pencil size={13} />Edit</button>}
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </>}>
      <div className="card-sub" style={{ marginBottom: 10 }}>{weekend.name} · home from {weekend.leaveTime || '16:00'} · back by {weekend.returnTime || '18:00'}</div>
      <BoxRow columns="repeat(2, minmax(0, 1fr))" cells={[
        { text: data.boarders.length - staying.length, sub: 'Going home', tone: 'green' },
        { text: staying.length, sub: 'Staying', label: true },
      ]} />
      <div className="bd-pick-head">Staying</div>
      <div className="course-lines">
        {staying.map(b => (
          <div key={b.id} className="line-row" style={{ cursor: 'default' }}>
            <span className="line-row-name">{nameOf(b)}</span>
            <button type="button" className="btn btn-icon btn-sm" aria-label={`${nameOf(b)} is going home`} onClick={() => onRemove(b)}><X size={14} /></button>
          </div>
        ))}
        <button type="button" className="line-row add" onClick={onAdd}><Plus size={13} /> Add someone staying</button>
      </div>
    </Shell>
  );
}

// A boarder's own record (tap their name on Going home): where they are, one button to sign out or back in,
// their home-weekend answer, and their comings and goings — everything in boxes.
function BoarderSheet({ boarder, data, outOf, onClose, onSignOut, onBack, onRemove }) {
  const [rec, setRec] = useState(null);
  const [busy, wrap] = useBusy();
  const leave = outOf[boarder.id];
  const room = data.rooms.find(r => r.id === boarder.roomId);
  useEffect(() => { getBoarderRecord(boarder.id).then(setRec).catch(() => setRec({ leaves: [] })); }, [boarder.id, leave?.id]);
  return (
    <Shell title={nameOf(boarder)} onClose={onClose} width={480} footer={<button className="btn" onClick={onClose}>Close</button>}>
      <div className="card-sub" style={{ marginBottom: 10 }}>{boarder.class}{room ? ` · ${fullRoom(room)}` : ''}</div>
      <BoxRow columns={leave ? 'repeat(3, minmax(0, 1fr))' : '1fr'} cells={leave ? [
        { text: 'Not in', sub: `since ${niceDate(leave.outAt.slice(0, 10))}`, tone: 'amber' },
        { text: leave.collectedBy || '—', sub: 'Collected by', label: true },
        { text: leave.backDue ? niceDate(leave.backDue) : '—', sub: 'Due back', label: true, tone: leave.backDue && leave.backDue < data.today ? 'red' : undefined },
      ] : [{ text: 'Here', sub: room ? roomLabel(room.name) : '', tone: 'green' }]} />
      <div className="bd-sheet-actions">
        {leave
          ? <button className="btn btn-primary" disabled={busy} onClick={wrap(() => onBack([leave.id]))}><LogIn size={14} />Sign in</button>
          : <button className="btn btn-primary" disabled={busy} onClick={() => onSignOut([boarder.id])}><LogOut size={14} />Sign out</button>}
        {leave && data.head && (
          <button className="btn" style={{ color: 'var(--red-text)' }} disabled={busy} onClick={wrap(() => onRemove(leave.id))}><Trash2 size={13} />Signed out by mistake</button>)}
      </div>
      <div className="bd-pick-head">Trips home</div>
      {!rec && <div className="text-muted" style={{ fontSize: 13 }}>Loading…</div>}
      {rec && !rec.leaves.length && <div className="text-muted" style={{ fontSize: 13 }}>None yet.</div>}
      {rec && rec.leaves.map(t => <TripBoxes key={t.id} trip={t} />)}
    </Shell>
  );
}

// "Add someone staying": find boarders by name and tap to add them.
function StayPicker({ weekend, boarders, onClose, onAdd }) {
  const [find, setFind] = useState('');
  const [busy, wrap] = useBusy();
  const q = find.trim().toLowerCase();
  const list = boarders.filter(b => !weekend.staying.includes(b.id) && (!q || nameOf(b).toLowerCase().includes(q))).slice(0, 30);
  return (
    <Shell title={`Staying · ${weekend.name}`} onClose={onClose} footer={<button className="btn" onClick={onClose}>Done</button>}>
      <div className="bd-search" style={{ marginBottom: 10 }}><Search size={15} /><input value={find} onChange={e => setFind(e.target.value)} placeholder="Find a boarder…" autoFocus /></div>
      <div className="course-lines">
        {list.map(b => (
          <button key={b.id} type="button" className="line-row" disabled={busy} onClick={wrap(() => onAdd(b))}>
            <span className="ct-two"><span className="line-row-name">{nameOf(b)}</span><span className="line-row-sub">{b.class}</span></span>
            <Plus size={14} />
          </button>
        ))}
      </div>
    </Shell>
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

// Edit a level: its name, every room's number and beds in one list (✕ removes a room, "Another room" adds one), who's in
// charge, or remove the whole level.
function LevelModal({ block, level, rooms, teachers, boarders, onClose, onSave, onDelete }) {
  const mine = rooms.filter(r => (r.block || '') === (block || '') && (r.level || '') === (level || ''));
  const inRoom = id => boarders.filter(b => b.roomId === id).length;
  const same = mine.every(r => (r.teacherId || '') === (mine[0]?.teacherId || ''));
  const [to, setTo] = useState(level || '');
  const [list, setList] = useState(() => mine.map(r => ({ id: r.id, name: r.name, beds: r.beds })));
  const [teacherId, setTeacherId] = useState(same ? (mine[0]?.teacherId || '') : 'keep');
  const [sure, setSure] = useState(false);
  const [busy, wrap] = useBusy();
  const setRow = (i, k, v) => setList(l => l.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const filled = list.filter(r => String(r.name).trim());
  const outOf = mine.filter(r => !list.some(x => x.id === r.id)).reduce((t, r) => t + inRoom(r.id), 0);
  const people = mine.reduce((t, r) => t + inRoom(r.id), 0);
  const last = list[list.length - 1];
  return (
    <Shell title={`Edit ${levelLabel(level) || 'rooms'}${block ? ` · ${block}` : ''}`} onClose={onClose} width={500}
      footer={<>
        {sure
          ? <button className="btn" style={{ marginRight: 'auto', background: 'var(--red)', color: '#fff' }} disabled={busy} onClick={wrap(onDelete)}>Remove it all</button>
          : <button className="btn" style={{ marginRight: 'auto', color: 'var(--red-text)' }} onClick={() => setSure(true)}><Trash2 size={13} />Remove level</button>}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || !filled.length}
          onClick={wrap(() => onSave(to.trim(), filled.map(r => ({ id: r.id, name: String(r.name).trim(), beds: r.beds })), teacherId === 'keep' ? undefined : teacherId))}><Save size={13} />Save</button>
      </>}>
      {sure && (
        <div className="bd-short" style={{ marginBottom: 12 }}>
          Remove this level and its {mine.length} room{mine.length === 1 ? '' : 's'}?
          {people ? ` The ${people} boarder${people === 1 ? '' : 's'} in them will be listed under "Not in a room".` : ''}
        </div>
      )}
      <div className="form-grid">
        <div className="form-group"><label>Level name</label>
          <input value={to} onChange={e => setTo(e.target.value)} maxLength={40} placeholder="e.g. Ground, 1, 2" /></div>
        <div className="form-group">
          <label>Rooms on this level</label>
          <div className="bd-room-rows">
            <span className="bd-room-rows-head">Room number or name</span><span className="bd-room-rows-head">Beds</span><span />
            {list.map((r, i) => (
              <React.Fragment key={r.id || `new${i}`}>
                <input value={r.name} onChange={e => setRow(i, 'name', e.target.value)} maxLength={40} aria-label={`Room ${i + 1}`} />
                <input type="number" min={r.id ? inRoom(r.id) : 0} max={500} value={r.beds} onChange={e => setRow(i, 'beds', e.target.value)} aria-label={`Beds in room ${i + 1}`} />
                <button type="button" className="btn btn-icon btn-sm" aria-label="Remove this room" onClick={() => setList(l => l.filter((_, j) => j !== i))}><X size={14} /></button>
              </React.Fragment>
            ))}
          </div>
          {outOf > 0 && <div className="bd-short" style={{ marginTop: 8 }}>{outOf} boarder{outOf === 1 ? '' : 's'} in the rooms you took off will go to "Not in a room".</div>}
          <button type="button" className="line-row add" style={{ marginTop: 8 }}
            onClick={() => setList(l => [...l, { name: last ? nextRoomName(String(last.name)) : '', beds: last ? last.beds : 4 }])}><Plus size={13} /> Another room</button>
        </div>
        <div className="form-group"><label>Teacher in charge (of these rooms)</label>
          <select value={teacherId} onChange={e => setTeacherId(e.target.value)}>
            {!same && <option value="keep">Leave as it is (different for each room)</option>}
            <option value="">No one</option>
            {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>
    </Shell>
  );
}

// Edit a section: its name and each level's name in one list (✕ removes a level with its rooms), or remove it all.
// A level's rooms are edited in Edit level.
function SectionModal({ block, rooms, boarders, onClose, onSave, onDelete }) {
  const mine = rooms.filter(r => (r.block || '') === (block || ''));
  const lay = layout(mine)[0];
  const inRooms = list => boarders.filter(b => list.some(r => r.id === b.roomId)).length;
  const [to, setTo] = useState(block || '');
  const [levels, setLevels] = useState(() => (lay ? lay.levels : []).map(l => ({ from: l.level || '', to: l.level || '', rooms: l.rooms })));
  const [sure, setSure] = useState(false);
  const [busy, wrap] = useBusy();
  const goneRooms = (lay ? lay.levels : []).filter(l => !levels.some(x => x.from === (l.level || ''))).flatMap(l => l.rooms);
  const out = inRooms(goneRooms);
  const people = inRooms(mine);
  return (
    <Shell title={`Edit ${block || 'rooms'}`} onClose={onClose} width={480}
      footer={<>
        {sure
          ? <button className="btn" style={{ marginRight: 'auto', background: 'var(--red)', color: '#fff' }} disabled={busy} onClick={wrap(onDelete)}>Remove it all</button>
          : <button className="btn" style={{ marginRight: 'auto', color: 'var(--red-text)' }} onClick={() => setSure(true)}><Trash2 size={13} />Remove section</button>}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || !levels.length}
          onClick={wrap(() => onSave(to.trim(), levels.map(l => ({ from: l.from, to: l.to.trim() }))))}><Save size={13} />Save</button>
      </>}>
      {sure && (
        <div className="bd-short" style={{ marginBottom: 12 }}>
          Remove this section and its {mine.length} room{mine.length === 1 ? '' : 's'}?
          {people ? ` The ${people} boarder${people === 1 ? '' : 's'} in them will be listed under "Not in a room".` : ''}
        </div>
      )}
      <div className="form-grid">
        <div className="form-group"><label>Section name</label>
          <input value={to} onChange={e => setTo(e.target.value)} maxLength={40} placeholder="e.g. Block A, East Wing" /></div>
        <div className="form-group">
          <label>Levels</label>
          <div className="bd-room-rows">
            <span className="bd-room-rows-head">Level name</span><span className="bd-room-rows-head">Rooms</span><span />
            {levels.map((l, i) => (
              <React.Fragment key={l.from || 'none'}>
                <input value={l.to} onChange={e => setLevels(ls => ls.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))} maxLength={40}
                  placeholder="e.g. Ground, 1" aria-label={`Level ${i + 1}`} />
                <span className="bd-level-count">{l.rooms.length}</span>
                <button type="button" className="btn btn-icon btn-sm" aria-label="Remove this level" onClick={() => setLevels(ls => ls.filter((_, j) => j !== i))}><X size={14} /></button>
              </React.Fragment>
            ))}
          </div>
          {out > 0 && <div className="bd-short" style={{ marginTop: 8 }}>{out} boarder{out === 1 ? '' : 's'} on the levels you took off will go to "Not in a room".</div>}
          {goneRooms.length > 0 && !out && <div className="bd-short" style={{ marginTop: 8 }}>{goneRooms.length} room{goneRooms.length === 1 ? '' : 's'} will be removed.</div>}
          <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>A level's rooms and beds: open the level → Edit level.</div>
        </div>
      </div>
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
