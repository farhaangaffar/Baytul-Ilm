// "Recommend Suhuf" on the head's Dashboard: one line that opens a pop-up with the madrasah's own link to send to another
// madrasah (WhatsApp / Share / Copy) and the madaaris that have signed up through it — a month free for each
// (server/routes/referrals.js). Not in a demo or for the platform owner.
import React, { useState, useEffect } from 'react';
import { Gift, X, Copy, Share2, MessageCircle, Check } from 'lucide-react';
import { getReferrals, formatDateGB } from '../lib/store';
import { referralLink } from '../lib/referral';
import { useBackToClose } from '../lib/useBackToClose';

const message = link => `Assalamu alaikum! We use Suhuf to run our madrasah — registers, fees, Qur'aan progress and reports, with a portal for parents. It's free for 6 months. Have a look: ${link}`;

export default function Recommend() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => { getReferrals().then(setData).catch(() => {}); }, []);
  const close = useBackToClose(open, () => setOpen(false));
  if (!data) return null;
  const link = referralLink(data.code);
  const n = data.joined.length;
  const copy = async () => {
    try { await navigator.clipboard.writeText(message(link)); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* nothing to copy to */ }
  };
  return (
    <>
      <button type="button" className="card line-row" onClick={() => setOpen(true)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', marginTop: 14 }}>
        <Gift size={18} style={{ flexShrink: 0, color: 'var(--green-text)' }} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontWeight: 600 }}>Recommend Suhuf to another madrasah</span>
          <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-muted)' }}>
            {n ? `${n} joined through you · ${data.freeMonths} free month${data.freeMonths === 1 ? '' : 's'}` : 'Get a month free for each one that signs up'}
          </span>
        </span>
      </button>

      {open && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && close()}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <div className="modal-title">Recommend Suhuf</div>
              <button className="btn btn-icon" onClick={close}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p style={{ margin: '0 0 12px', fontSize: 14 }}>Send your link to another madrasah. When they sign up through it, you get <b>a month free</b> — for every one.</p>
              <div className="box-row-3" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 12 }}>
                <div className="info-box"><strong>{n}</strong><span className="info-box-label">Joined through you</span></div>
                <div className="info-box"><strong>{data.freeMonths}</strong><span className="info-box-label">Free months</span></div>
              </div>
              <div style={{ background: '#f3f4f6', borderRadius: 'var(--r-md)', padding: '9px 12px', fontSize: 13, wordBreak: 'break-all', marginBottom: 10 }}>{link}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a className="btn" style={{ flex: 1, justifyContent: 'center', textDecoration: 'none' }} href={`https://wa.me/?text=${encodeURIComponent(message(link))}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} /> WhatsApp</a>
                {typeof navigator !== 'undefined' && navigator.share && (
                  <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => navigator.share({ text: message(link) }).catch(() => {})}><Share2 size={14} /> Share</button>
                )}
                <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={copy}>{copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}</button>
              </div>
              {n > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div className="form-section-title" style={{ marginBottom: 6 }}>Joined through you</div>
                  {data.joined.map(j => (
                    <div key={j.name + j.joinedAt} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13.5, padding: '6px 0', borderTop: '1px solid var(--border)' }}>
                      <span>{j.name}</span>
                      <span className="text-muted" style={{ whiteSpace: 'nowrap' }}>{formatDateGB(j.joinedAt)}{j.rewarded ? ' · month free' : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
