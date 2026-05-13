import React from 'react';
import { NavLink } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { ROLES } from '../../data/mockData';
import './Sidebar.css';

// ── Nav config per role ──────────────────────────────────────
const NAV_CONFIG = {
  superadmin: [
    {
      section: 'Owner',
      items: [
        { to: '/admin', label: 'Admin Dashboard', icon: '⊞', badge: null },
      ],
    },
  ],
  client: [
    {
      section: 'Overview',
      items: [
        { to: '/dashboard',      label: 'Dashboard',     icon: '⊞',  badge: null },
        { to: '/notifications',  label: 'Notifications', icon: '🔔', badgeKey: 'unread' },
      ],
    },
    {
      section: 'Maintenance',
      items: [
        { to: '/work-orders',    label: 'Service Requests',   icon: '🔧', badge: null },
        { to: '/approvals',      label: 'Approvals',          icon: '✓',  badge: null },
        { to: '/sla',            label: 'SLA Tracker',        icon: '🕐', badge: null },
      ],
    },
    {
      section: 'Management',
      items: [
        { to: '/contractors',    label: 'Contractors',   icon: '👥', badge: null },
        { to: '/contracts',      label: 'Contracts',     icon: '📄', badge: null },
        { to: '/end-users',      label: 'Users',         icon: '👤', badge: null },
        { to: '/assets',         label: 'Assets',        icon: '⚙',  badge: null, soon: true },
      ],
    },
    {
      section: 'Reports',
      items: [
        { to: '/analytics',      label: 'Analytics',     icon: '📊', badge: null, soon: true },
      ],
    },
  ],
  contractor: [
    {
      section: 'Overview',
      items: [
        { to: '/dashboard',      label: 'Dashboard',     icon: '⊞',  badge: null },
        { to: '/notifications',  label: 'Notifications',      icon: '🔔', badgeKey: 'unread' },
      ],
    },
    {
      section: 'My Work',
      items: [
        { to: '/work-orders',    label: 'Service Requests',   icon: '🔧', badge: null },
        { to: '/approvals',      label: 'Approvals',     icon: '✓',  badge: 1 },
      ],
    },
    {
      section: 'Management',
      items: [
        { to: '/workforce',      label: 'My Team',        icon: '👥', badge: null },
        { to: '/contracts',      label: 'Contracts',      icon: '📄', badge: null },
      ],
    },
  ],
  supervisor: [
    {
      section: 'Overview',
      items: [
        { to: '/dashboard',      label: 'Dashboard',   icon: '⊞',  badge: null },
      ],
    },
    {
      section: 'My Work',
      items: [
        { to: '/work-orders',    label: 'Service Requests', icon: '🔧', badge: null },
        { to: '/workforce',      label: 'Workforce',   icon: '👥', badge: null },
      ],
    },
  ],
  workman: [
    {
      section: 'Overview',
      items: [
        { to: '/dashboard',      label: 'Dashboard',   icon: '⊞',  badge: null },
      ],
    },
    {
      section: 'My Tasks',
      items: [
        { to: '/work-orders',    label: 'My Tasks',    icon: '🔧', badge: 2 },
      ],
    },
  ],
  enduser: [
    {
      section: 'Overview',
      items: [
        { to: '/dashboard',      label: 'Dashboard',      icon: '⊞', badge: null },
        { to: '/notifications',  label: 'Notifications',  icon: '🔔', badgeKey: 'unread' },
      ],
    },
    {
      section: 'Service',
      items: [
        { to: '/raise',          label: 'Raise Request',  icon: '＋', badge: null },
        { to: '/work-orders',    label: 'My Requests',    icon: '📋', badge: null },
      ],
    },
  ],
};

export default function Sidebar() {
  const { role, currentUser, unreadCount, workOrders, isCommandantEngineer } = useApp();
  const navItems = (NAV_CONFIG[role] || NAV_CONFIG.client).map(section => ({
    ...section,
    items: section.items.filter(item => {
      if (['/contracts', '/end-users'].includes(item.to)) return isCommandantEngineer;
      return true;
    }),
  })).filter(section => section.items.length > 0);
  function approvalStageFor(wo) {
    if (wo.status === 'escalated') return 'commandant_engineer';
    if (!['open', 'rejected'].includes(wo.status)) return 'none';
    const ageHours = (Date.now() - new Date(wo.createdAt).getTime()) / 3600000;
    if (ageHours >= 48) return 'commandant_engineer';
    if (ageHours >= 24) return 'assistant_engineer';
    return 'junior_engineer';
  }
  const mySubrole = currentUser?.client_subrole || 'junior_engineer';
  const approvalsCount = role === 'client'
    ? workOrders.filter(wo => (wo.status === 'pending' && wo.raisedByUser?.role !== 'enduser') || approvalStageFor(wo) === mySubrole).length
    : 0;
  const activeTaskCount = workOrders.filter(wo => wo.status !== 'closed').length;
  const roleInfo = ROLES[role] || ROLES.client;
  const clientSubroleLabels = {
    junior_engineer: 'Junior Engineer',
    assistant_engineer: 'Assistant Engineer',
    commandant_engineer: 'Commandant Engineer',
  };
  const displayRole = role === 'client'
    ? clientSubroleLabels[currentUser?.client_subrole] || 'Junior Engineer'
    : roleInfo.label;

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <span className="logo-text">Serv<span className="logo-accent">Track</span></span>
      </div>

      {/* Nav sections */}
      <nav className="sidebar-nav">
        {navItems.map(section => (
          <div key={section.section}>
            <div className="sidebar-section-label">{section.section}</div>
            {section.items.map(item => {
              let count = item.badgeKey === 'unread' ? unreadCount : item.badge;
              if (item.to === '/approvals') count = approvalsCount;
              if ((item.to === '/work-orders' || item.to === '/workforce') && role !== 'client') count = activeTaskCount;
              if (item.to === '/work-orders' && role === 'enduser') count = workOrders.length;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `sidebar-item${isActive ? ' active' : ''}${item.soon ? ' disabled' : ''}`
                  }
                  onClick={item.soon ? e => e.preventDefault() : undefined}
                >
                  <span className="sidebar-icon">{item.icon}</span>
                  <span className="sidebar-label">{item.label}</span>
                  {item.soon && <span className="sidebar-soon">soon</span>}
                  {count > 0 && <span className="sidebar-badge">{count}</span>}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Role switcher */}
      <div className="sidebar-footer">
        <div className="role-switcher-label">Signed in as</div>
        <div className="sidebar-user-card">
          <div className="sidebar-user-name">{currentUser?.full_name || 'Unknown User'}</div>
          <div className="sidebar-user-role">{displayRole}</div>
          <div className="sidebar-user-email">{currentUser?.email}</div>
        </div>
      </div>
    </aside>
  );
}
