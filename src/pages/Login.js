import React, { useState } from 'react';
import { login } from '../lib/store';
import { LogIn } from 'lucide-react';

export default function Login({ onSuccess }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError('');
    try {
      await login(password);
      onSuccess();
    } catch (err) {
      setError(err.message || 'Something went wrong — try again.');
    }
    setLoading(false);
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--page)', padding: 20 }}>
      <div className="card" style={{ width: '100%', maxWidth: 360, textAlign: 'center' }}>
        <div style={{ fontFamily: "'Lalezar', cursive", fontSize: 32, color: 'var(--ink)', marginBottom: 4 }}>بيت العلم</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>Baytul 'Ilm Madrasah</div>
        <form onSubmit={submit}>
          <div className="form-group" style={{ textAlign: 'left', marginBottom: 16 }}>
            <label>Password</label>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              placeholder="Enter the school password"
            />
          </div>
          {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginBottom: 14, textAlign: 'left' }}>{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={loading || !password} style={{ width: '100%', justifyContent: 'center', padding: '10px' }}>
            <LogIn size={14} />{loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
