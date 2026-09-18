import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Clock, Mic, Building2, LogOut } from 'lucide-react';
import { portalLogout } from '../../lib/portalApi';

export default function PortalLayout({ children, title, subtitle, session }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const navItems = [
    { label: 'Salaah times', path: '/portal/salaah-times', icon: Clock },
    { label: 'Talks', path: '/portal/talks', icon: Mic },
    ...(session.role === 'super_admin' ? [{ label: 'Masaajid', path: '/portal/masaajid', icon: Building2 }] : []),
  ];

  async function handleLogout() {
    await portalLogout().catch(() => {});
    window.location.reload();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-arabic">بيت العلم</div>
          <div className="sidebar-logo-en">Masjid Portal</div>
        </div>
        <nav className="sidebar-nav">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = pathname === item.path;
            return (
              <button key={item.path} className={`nav-link ${active ? 'active' : ''}`} onClick={() => navigate(item.path)}>
                <Icon size={16} /><span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <button className="nav-link" onClick={handleLogout} style={{ marginBottom: 12 }}>
          <LogOut size={16} /><span>Log out</span>
        </button>
      </aside>
      <div className="main-content">
        <div className="mobile-topbar">
          <div className="mobile-topbar-brand"><span className="mobile-topbar-arabic">بيت العلم</span></div>
          <span className="mobile-topbar-title">{title}</span>
          <button className="mobile-topbar-logout" onClick={handleLogout} aria-label="Log out"><LogOut size={18} /></button>
        </div>
        <div className="mobile-chips-wrap">
          <div className="mobile-chips">
            {navItems.map(item => {
              const Icon = item.icon;
              const active = pathname === item.path;
              return (
                <button key={item.path} className={`mobile-chip ${active ? 'active' : ''}`} onClick={() => navigate(item.path)}>
                  <Icon size={14} />{item.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="topbar">
          <div>
            <div className="topbar-title">{title}</div>
            {subtitle && <div className="topbar-sub">{subtitle}</div>}
          </div>
        </div>
        <div className="page-body">{children}</div>
      </div>
    </div>
  );
}
