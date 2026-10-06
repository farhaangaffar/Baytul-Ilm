import React, { useState, useEffect } from 'react';
import { Info } from 'lucide-react';
import { pageHelp } from '../lib/pageHelp';

// "Page instructions": the button, and the pop-up it opens (the same one as the install
// steps). The first time someone opens a page on a device it opens by itself; after that,
// only from the button.
export function usePageHelp(pathname, role) {
  const help = role ? pageHelp(pathname, role) : null;
  const [open, setOpen] = useState(false);
  const key = `help_seen:${role}:${pathname}`;
  useEffect(() => {
    if (!help) return;
    let seen = true;
    try { seen = !!localStorage.getItem(key); localStorage.setItem(key, '1'); } catch { /* fine */ }
    setOpen(!seen);
  }, [key, !!help]);
  return { help, open, show: () => setOpen(true), close: () => setOpen(false) };
}

export function PageHelpButton({ onClick, style }) {
  return (
    <button type="button" className="btn btn-sm" onClick={onClick} style={{ gap: 5, ...style }}>
      <Info size={13} /> Page instructions
    </button>
  );
}
