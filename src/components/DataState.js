import React from 'react';
import { RefreshCw, WifiOff, AlertTriangle } from 'lucide-react';
import { NetworkError } from '../lib/store';

export function LoadingState() {
  return (
    <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
      Loading…
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  const offline = error instanceof NetworkError;
  return (
    <div className="card" style={{ textAlign: 'center', padding: 48 }}>
      <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--red-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
        {offline ? <WifiOff size={22} color="var(--red)" /> : <AlertTriangle size={22} color="var(--red)" />}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
        {offline ? "Can't reach the server" : 'Something went wrong'}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, maxWidth: 340, marginLeft: 'auto', marginRight: 'auto' }}>
        {offline ? 'Check your internet connection and try again.' : (error?.message || 'Please try again.')}
      </div>
      {onRetry && (
        <button className="btn btn-primary" onClick={onRetry}><RefreshCw size={13} />Try again</button>
      )}
    </div>
  );
}
