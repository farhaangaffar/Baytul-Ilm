import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, CheckSquare, Coins, FileText, GraduationCap, Settings as SettingsIcon, BookOpen } from 'lucide-react';
import { getSettings } from '../lib/store';

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
  const settings = getSettings();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
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
      </aside>
      <div className="main-content">
        <div className="mobile-topbar">
          <span className="mobile-topbar-arabic">{settings.schoolNameArabic}</span>
          <span className="mobile-topbar-title">{title}</span>
          <span style={{width:40}}/>
        </div>
        <div className="mobile-chips-wrap">
          <div className="mobile-chips">
            {navItems.map(item => {
              const Icon = item.icon;
              const active = pathname === item.path;
              return (
                <button key={item.path} className={`mobile-chip ${active?'active':''}`} onClick={() => navigate(item.path)}>
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
