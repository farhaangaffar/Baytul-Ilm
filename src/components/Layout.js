import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, CheckSquare, Coins, FileText, GraduationCap, Settings as SettingsIcon, BookOpen, LogOut, BarChart3, Download, KeyRound, Building2 } from 'lucide-react';
import { logout } from '../lib/store';
import { useSettings } from '../lib/SettingsContext';
import { useInstallPrompt } from '../lib/installPrompt';
import { useAuth } from '../lib/AuthContext';
import ChangePasswordModal from './ChangePasswordModal';
import { DemoBar, leaveDemo } from './Demo';

const navItems = [
  { label:'Dashboard',          path:'/',           icon:LayoutDashboard },
  { label:'Students',           path:'/students',   icon:Users,         section:'Management' },
  { label:'Attendance',         path:'/attendance', icon:CheckSquare,   teacher:true },
  { label:'Fees',               path:'/fees',       icon:Coins,         teacher:true },
  { label:'Daily records',      path:'/records',    icon:BookOpen,      teacher:true },
  { label:'Reports',            path:'/reports',    icon:FileText,      section:'Setup' },
  { label:'Classes & Teachers', path:'/classes',    icon:GraduationCap },
  { label:'Stats',              path:'/stats',      icon:BarChart3 },
  { label:'Settings',           path:'/settings',   icon:SettingsIcon },
  // Only the platform owner (the person who runs this service for every madrasah).
  { label:'Madaaris',           path:'/madaaris',   icon:Building2,     section:'Platform', platform:true },
];

// Layout remounts fresh on every navigation (each page renders its own <Layout>), so the
// chip row itself is a brand new DOM node each time — its scroll position can't just
// "persist" like a normal element's would. Stashing it here (outside the component, so
// it survives the remount) and restoring it on mount is what actually keeps the row
// wherever the user left it, instead of resetting to 0 and re-deriving a position.
let savedChipScroll = 0;

export default function Layout({ children, title, subtitle }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const settings = useSettings();
  const installPrompt = useInstallPrompt();
  const { user, isOwner, isPlatformAdmin } = useAuth();
  const [changingPassword, setChangingPassword] = useState(false);
  // Teachers only get their three pages (and no section headings).
  const visibleNav = isOwner
    ? navItems.filter(i => !i.platform || isPlatformAdmin)
    : navItems.filter(i => i.teacher).map(i => ({ ...i, section: undefined }));
  const activeChipRef = useRef(null);
  const chipsRowRef = useRef(null);

  // useLayoutEffect (not useEffect) so the restore happens before the browser paints —
  // otherwise the row would flash at scrollLeft 0 for a frame before jumping.
  useLayoutEffect(() => {
    if (chipsRowRef.current) chipsRowRef.current.scrollLeft = savedChipScroll;
  }, []);

  // Only for the case the restored position doesn't actually show the active chip (e.g.
  // a fresh tab / deep link where nothing was scrolled yet) — 'nearest' is a no-op when
  // it's already visible, so this doesn't fight the restore above.
  useEffect(() => {
    activeChipRef.current?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [pathname]);

  async function handleLogout() {
    if (user?.demo) { leaveDemo(); return; }
    await logout().catch(() => {});
    window.location.reload();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-arabic">{settings.schoolNameArabic}</div>
          <div className="sidebar-logo-en">{settings.schoolName}</div>
        </div>
        <nav className="sidebar-nav">
          {visibleNav.map(item => {
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
        {installPrompt.available && (
          <button className="nav-link" onClick={installPrompt.install}>
            <Download size={16}/><span>Install app</span>
          </button>
        )}
        {!user?.demo && (
          <button className="nav-link" onClick={() => setChangingPassword(true)}>
            <KeyRound size={16}/><span>Change password</span>
          </button>
        )}
        <button className="nav-link" onClick={handleLogout} style={{marginBottom:12}} title={user ? `Signed in as ${user.login}` : undefined}>
          <LogOut size={16}/><span>Log out</span>
        </button>
      </aside>
      <div className="main-content">
        <DemoBar user={user} />
        <div className="mobile-topbar">
          <div className="mobile-topbar-brand">
            <span className="mobile-topbar-arabic">{settings.schoolNameArabic}</span>
          </div>
          <span className="mobile-topbar-title">{title}</span>
          <div style={{display:'flex',alignItems:'center',gap:14}}>
            {installPrompt.available && (
              <button className="mobile-topbar-logout" onClick={installPrompt.install} aria-label="Install app" title="Install app">
                <Download size={18}/>
              </button>
            )}
            {!user?.demo && (
              <button className="mobile-topbar-logout" onClick={() => setChangingPassword(true)} aria-label="Change password" title="Change password">
                <KeyRound size={18}/>
              </button>
            )}
            <button className="mobile-topbar-logout" onClick={handleLogout} aria-label="Log out">
              <LogOut size={18}/>
            </button>
          </div>
        </div>
        <div className="mobile-chips-wrap">
          <div className="mobile-chips" ref={chipsRowRef} onScroll={e => { savedChipScroll = e.currentTarget.scrollLeft; }}>
            {visibleNav.map(item => {
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
        {changingPassword && <ChangePasswordModal onClose={() => setChangingPassword(false)} />}
      </div>
    </div>
  );
}
