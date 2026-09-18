import React, { useState } from 'react';
import { portalLogin } from '../../lib/portalApi';
import { LogIn } from 'lucide-react';

export default function PortalLogin({ onSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError('');
    try {
      const res = await portalLogin(email, password);
      onSuccess({ authenticated: true, role: res.role, masjidId: res.masjidId });
    } catch (err) {
      setError(err.message || 'Something went wrong — try again.');
    }
    setLoading(false);
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--page)', padding: 20 }}>
      <div className="card" style={{ width: '100%', maxWidth: 360, textAlign: 'center' }}>
        <div style={{ fontFamily: "'Amiri', serif", fontSize: 26, color: 'var(--ink)', marginBottom: 4 }}>بيت العلم</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>Masjid Portal</div>
        <form onSubmit={submit}>
          <div className="form-group" style={{ textAlign: 'left', marginBottom: 12 }}>
            <label>Email</label>
            <input
              type="email"
              autoFocus
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); }}
              placeholder="you@masjid.org"
            />
          </div>
          <div className="form-group" style={{ textAlign: 'left', marginBottom: 16 }}>
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              placeholder="Enter your password"
            />
          </div>
          {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginBottom: 14, textAlign: 'left' }}>{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={loading || !email || !password} style={{ width: '100%', justifyContent: 'center', padding: '10px' }}>
            <LogIn size={14} />{loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
