// The app's own "Are you sure?" and message pop-ups, in place of the browser's confirm()/alert() boxes (the owner's ask —
// those look like a website, not the app). askConfirm() resolves true/false; showAlert() resolves once closed.
// Each opens its own small React root on top of whatever is showing, styled like every other pop-up (.modal).
import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';

function Dialog({ title, message, ok, cancel, danger, onDone }) {
  useEffect(() => {
    const key = e => { if (e.key === 'Escape') onDone(false); if (e.key === 'Enter') onDone(true); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onDone]);
  return (
    <div className="modal-overlay" style={{ zIndex: 2000 }} onClick={e => e.target === e.currentTarget && onDone(false)}>
      <div className="modal" role="alertdialog" aria-modal="true" style={{ maxWidth: 420 }}>
        <div className="modal-body" style={{ display: 'grid', gap: 8, paddingBottom: 8 }}>
          {title && <div style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>}
          <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-line' }}>{message}</div>
        </div>
        <div className="modal-footer" style={{ borderTop: 'none', paddingTop: 10 }}>
          {cancel && <button type="button" className="btn" onClick={() => onDone(false)}>{cancel}</button>}
          <button type="button" autoFocus className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => onDone(true)}>{ok}</button>
        </div>
      </div>
    </div>
  );
}

function open(props) {
  return new Promise(resolve => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = ReactDOM.createRoot(host);
    const done = v => { root.unmount(); host.remove(); resolve(v); };
    root.render(<Dialog {...props} onDone={done} />);
  });
}

// askConfirm('Remove this?', { ok: 'Remove', danger: true }) → true when they press the button, false otherwise.
export function askConfirm(message, { title = '', ok = 'Yes', cancel = 'Cancel', danger = false } = {}) {
  return open({ title, message, ok, cancel, danger });
}

// showAlert('Could not save') — a message with one OK button.
export function showAlert(message, { title = '' } = {}) {
  return open({ title, message, ok: 'OK', cancel: null, danger: false }).then(() => undefined);
}
