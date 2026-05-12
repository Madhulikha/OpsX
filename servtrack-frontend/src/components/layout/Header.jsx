import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { ROLES } from '../../data/mockData';
import './Header.css';

const PAGE_META = {
  '/dashboard':     { title: 'Dashboard',      sub: 'Overview — April 2026' },
  '/admin':         { title: 'Admin Dashboard', sub: 'Owner metrics and client onboarding' },
  '/work-orders':   { title: 'Work Orders',    sub: 'All maintenance requests' },
  '/sla':           { title: 'SLA Tracker',    sub: 'Monitor resolution timelines' },
  '/approvals':     { title: 'Approvals',      sub: 'Items pending your action' },
  '/notifications': { title: 'Notifications',  sub: '' },
  '/contractors':   { title: 'Contractors',    sub: 'Approved service partners' },
  '/contracts':     { title: 'Contracts',      sub: '' },
  '/assets':        { title: 'Assets',         sub: '' },
  '/analytics':     { title: 'Analytics',      sub: '' },
  '/workforce':     { title: 'Workforce',      sub: 'Your team members' },
  '/raise':         { title: 'Raise Request',  sub: 'Submit a new service request' },
};

export default function Header() {
  const { role, currentUser, unreadCount, logout } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const roleInfo = ROLES[role] || ROLES.client;
  const roleAwareMeta = (() => {
    if (role === 'enduser' && location.pathname === '/dashboard') {
      return { title: 'My Dashboard', sub: 'Track your requests and the latest updates' };
    }
    if (role === 'enduser' && location.pathname === '/work-orders') {
      return { title: 'My Requests', sub: 'Every request you have raised in one place' };
    }
    if (role === 'enduser' && location.pathname === '/notifications') {
      return { title: 'My Notifications', sub: 'Live updates about your maintenance requests' };
    }
    return PAGE_META[location.pathname] || { title: 'ServTrack', sub: '' };
  })();
  const initials = (currentUser?.full_name || roleInfo.label)
    .split(' ')
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase();

  return (
    <header className="app-header">
      <div className="header-left">
        <h1 className="header-title">{roleAwareMeta.title}</h1>
        {roleAwareMeta.sub && <span className="header-sub">{roleAwareMeta.sub}</span>}
      </div>

      <div className="header-right">
        <button
          className="header-notif-btn"
          onClick={() => navigate('/notifications')}
          aria-label="Notifications"
          style={{ display: role === 'superadmin' ? 'none' : undefined }}
        >
          <span>🔔</span>
          {unreadCount > 0 && (
            <span className="header-notif-dot">{unreadCount}</span>
          )}
        </button>

        <div
          className="header-avatar"
          style={{ background: roleInfo.color }}
          title={`${currentUser?.full_name || roleInfo.label} · ${roleInfo.label}`}
        >
          {initials}
        </div>

        <button className="btn btn-sm" onClick={logout}>Logout</button>
      </div>
    </header>
  );
}
