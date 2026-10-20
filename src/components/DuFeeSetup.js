// A Darul Uloom's fees for a year (server/routes/du-fees.js): the yearly fee for boarders and day students, the ways
// to pay it (each a name and its due dates — the fee is split equally between them; one is used unless a child is
// given another) and the sibling discount, which each madrasah switches on or off. Opened from the Fees page and
// Settings.
import React, { useState } from 'react';
import { X, Save, Plus } from 'lucide-react';
import { ChoiceBoxes } from './StudentDetails';
import { saveDuFeeSetup } from '../lib/store';
import { currencySymbol } from '../lib/branding';

const niceYear = y => `20${y.slice(0, 2)}–${y.slice(3)}`;

export default function DuFeeSetupModal({ setup, onClose, onSaved }) {
  const [f, setF] = useState(() => ({
    ...setup,
    boarderFee: setup.boarderFee || '', dayFee: setup.dayFee || '',
    plans: setup.plans.map(p => ({ ...p, dues: [...p.dues] })),
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const setPlan = (i, k, v) => setF(p => ({ ...p, plans: p.plans.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }));
  const setDue = (i, d, v) => setPlan(i, 'dues', f.plans[i].dues.map((x, j) => (j === d ? v : x)));
  const sym = currencySymbol();
  async function save() {
    setBusy(true); setError('');
    try {
      await saveDuFeeSetup({ ...f, plans: f.plans.map(p => ({ ...p, dues: p.dues.filter(Boolean) })) });
      await onSaved();
    } catch (err) { setError(err.message || 'Could not save'); setBusy(false); }
  }
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <div className="modal-title">Fees for {niceYear(setup.year)}</div>
          <button className="btn btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-grid form-grid-2">
              <div className="form-group"><label>Boarders — a year ({sym})</label>
                <input type="number" min={0} step="0.01" value={f.boarderFee} onChange={e => set('boarderFee', e.target.value)} placeholder="e.g. 3000" /></div>
              <div className="form-group"><label>Day students — a year ({sym})</label>
                <input type="number" min={0} step="0.01" value={f.dayFee} onChange={e => set('dayFee', e.target.value)} placeholder="e.g. 1500" /></div>
            </div>

            <div className="form-group">
              <label>Ways to pay</label>
              <div className="text-muted" style={{ fontSize: 12, marginBottom: 8 }}>The year's fee is split equally between the dates. Tap "Used for everyone" on the usual one.</div>
              {f.plans.map((p, i) => (
                <div key={p.id} className="df-plan">
                  <div className="df-plan-head">
                    <input value={p.name} onChange={e => setPlan(i, 'name', e.target.value)} maxLength={40} aria-label="Name of this way to pay" />
                    <button type="button" className={`df-default ${f.defaultPlan === p.id ? 'on' : ''}`} onClick={() => set('defaultPlan', p.id)}>
                      {f.defaultPlan === p.id ? 'Used for everyone' : 'Use for everyone'}
                    </button>
                    {f.plans.length > 1 && <button type="button" className="btn btn-icon btn-sm" aria-label="Remove this way to pay" onClick={() => setF(x => ({ ...x, plans: x.plans.filter((_, j) => j !== i), defaultPlan: x.defaultPlan === p.id ? x.plans.find((_, j) => j !== i).id : x.defaultPlan }))}><X size={14} /></button>}
                  </div>
                  <div className="df-dues">
                    {p.dues.map((d, di) => (
                      <span key={di} className="df-due">
                        <input type="date" value={d} onChange={e => setDue(i, di, e.target.value)} aria-label={`Date ${di + 1}`} />
                        {p.dues.length > 1 && <button type="button" aria-label="Remove this date" onClick={() => setPlan(i, 'dues', p.dues.filter((_, j) => j !== di))}><X size={12} /></button>}
                      </span>
                    ))}
                    <button type="button" className="df-add-date" onClick={() => setPlan(i, 'dues', [...p.dues, ''])}><Plus size={12} /> Date</button>
                  </div>
                  <div className="text-muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                    {p.dues.filter(Boolean).length} payment{p.dues.filter(Boolean).length === 1 ? '' : 's'}
                    {Number(f.boarderFee) > 0 && p.dues.filter(Boolean).length > 0 && ` · boarders ${sym}${(Number(f.boarderFee) / p.dues.filter(Boolean).length).toFixed(2)} each`}
                  </div>
                </div>
              ))}
              <button type="button" className="line-row add" style={{ marginTop: 6 }}
                onClick={() => setF(x => ({ ...x, plans: [...x.plans, { id: `p${Date.now()}`, name: 'Another way', dues: [x.plans[0]?.dues[0] || ''] }] }))}>
                <Plus size={13} /> Another way to pay
              </button>
            </div>

            <div className="form-group">
              <label>Sibling discount</label>
              <ChoiceBoxes options={['No', 'Yes']} value={f.siblingOn ? 'Yes' : 'No'} onChange={v => set('siblingOn', v === 'Yes')} />
              {f.siblingOn && (
                <div className="form-grid form-grid-2" style={{ marginTop: 8 }}>
                  <div className="form-group"><label>2nd child — % off</label>
                    <input type="number" min={0} max={100} value={f.sibling2} onChange={e => set('sibling2', e.target.value)} /></div>
                  <div className="form-group"><label>3rd child and more — % off</label>
                    <input type="number" min={0} max={100} value={f.sibling3} onChange={e => set('sibling3', e.target.value)} /></div>
                </div>
              )}
              {f.siblingOn && <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>Brothers and sisters are found by a shared parent phone number or parent login; the eldest pays in full.</div>}
            </div>
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 10 }}>{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}><Save size={13} />Save</button>
        </div>
      </div>
    </div>
  );
}
