import React from 'react';
import { X, Share, PlusSquare } from 'lucide-react';

// The pop-up with a browser's own "add to home screen" steps (from lib/installPrompt.js).
export default function InstallSteps({ steps, onClose }) {
  if (!steps) return null;
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <div className="modal-title">{steps.title}</div>
          <button className="btn btn-icon" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="modal-body">
          <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
            {steps.steps.map((s, i) => (
              <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.45 }}>
                <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: 'var(--ink)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          {steps.title === 'Add to your Home Screen' && (
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', margin: '16px 0 4px', color: 'var(--text-muted)', fontSize: 12 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Share size={16} /> Share</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><PlusSquare size={16} /> Add to Home Screen</span>
            </div>
          )}
          {steps.note && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>{steps.note}</div>}
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 14 }} onClick={onClose}>Got it</button>
        </div>
      </div>
    </div>
  );
}
