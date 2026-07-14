import React, { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, CheckSquare, Coins, FileText, GraduationCap, Settings as SettingsIcon, BookOpen, LogOut } from 'lucide-react';
import { logout } from '../lib/store';
import { useSettings } from '../lib/SettingsContext';

const navItems = [
  { label:'Dashboard',          path:'/',           icon:LayoutDashboard },
  { label:'Students',           path:'/students',   icon:Users,         section:'Management' },
  { label:'Attendance',         path:'/attendance', icon:CheckSquare },
  { label:'Fees',               path:'/fees',       icon:Coins },
  { label:'Daily records',      path:'/records',    icon:BookOpen },
  { label:'Classes & Teachers', path:'/classes',    icon:GraduationCap, section:'Setup' },
  { label:'Reports',            path:'/reports',    icon:FileText },
  { label:'Settings',           path:'/settings',   icon:SettingsIcon },
];

export default function Layout({ children, title, subtitle }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const settings = useSettings();
  const activeChipRef = useRef(null);

  // Layout remounts fresh on every navigation (each page renders its own <Layout>), so
  // the chip row's scroll position resets to 0 by default — re-center the active chip
  // every time instead of leaving the user to scroll back to find their place.
  useEffect(() => {
    activeChipRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [pathname]);

  async function handleLogout() {
    await logout().catch(() => {});
    window.location.reload();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <img src="/logo.png" alt="" className="sidebar-logo-img" />
          <div className="sidebar-logo-arabic">{settings.schoolNameArabic}</div>
          <div className="sidebar-logo-en">{settings.schoolName}</div>
        </div>
        <nav className="sidebar-nav">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = pathname === item.path;
            return (
              <React.Fragment key={item.path}>
                {item.section && <div className="sidebar-section-label">{item.section}</div>}
                <button className={`nav-link ${active?'active':''}`} onClick={() => navigate(item.path)}>
                  <Icon size={16}/><span>{item.label}</span>
                </button>
              </React.Fragment>
            );
          })}
        </nav>
        <button className="nav-link" onClick={handleLogout} style={{marginBottom:12}}>
          <LogOut size={16}/><span>Log out</span>
        </button>
      </aside>
      <div className="main-content">
        <div className="mobile-topbar">
          <div className="mobile-topbar-brand">
            <img src="/logo.png" alt="" className="mobile-topbar-logo-img" />
            <span className="mobile-topbar-arabic">{settings.schoolNameArabic}</span>
          </div>
          <span className="mobile-topbar-title">{title}</span>
          <button className="mobile-topbar-logout" onClick={handleLogout} aria-label="Log out">
            <LogOut size={18}/>
          </button>
        </div>
        <div className="mobile-chips-wrap">
          <div className="mobile-chips">
            {navItems.map(item => {
              const Icon = item.icon;
              const active = pathname === item.path;
              return (
                <button key={item.path} ref={active ? activeChipRef : null} className={`mobile-chip ${active?'active':''}`} onClick={() => navigate(item.path)}>
                  <Icon size={14}/>{item.label}
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
