import React from 'react';
import { useApp } from '../context/AppContext';

const TYPE_ICON  = { danger:'⚠', warning:'⏱', info:'ℹ', success:'✓' };
const TYPE_COLOR = { danger:'var(--danger)', warning:'var(--warning)', info:'var(--info)', success:'var(--success)' };
const TYPE_BG    = { danger:'var(--danger-bg)', warning:'var(--warning-bg)', info:'var(--info-bg)', success:'var(--success-bg)' };

export default function Notifications() {
  const { notifications, markNotifRead, markAllNotificationsRead } = useApp();
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Notifications</div>
          <div className="page-sub">{unreadCount} unread</div>
        </div>
        {unreadCount > 0 && (
          <button className="btn" onClick={markAllNotificationsRead}>Clear All</button>
        )}
      </div>

      <div className="card">
        {notifications.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔔</div>
            <div className="empty-title">No notifications yet</div>
            <div className="empty-sub">New backend events will appear here as work orders move.</div>
          </div>
        ) : notifications.map(n => (
          <div
            key={n.id}
            onClick={() => markNotifRead(n.id)}
            style={{
              display:'flex', gap:14, padding:'16px 20px',
              borderBottom:'1px solid var(--border)',
              background: n.read ? 'transparent' : '#FAFAF8',
              cursor:'pointer', transition:'background 0.15s',
              alignItems:'flex-start',
            }}
          >
            <div style={{
              width:34, height:34, borderRadius:'50%',
              background: TYPE_BG[n.type],
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:15, flexShrink:0, color: TYPE_COLOR[n.type],
            }}>
              {TYPE_ICON[n.type]}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight: n.read ? 400 : 600, fontSize:13, color:'var(--text)', marginBottom:3 }}>
                {n.title}
              </div>
              <div style={{ fontSize:12, color:'var(--text-2)', lineHeight:1.5 }}>{n.body}</div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6, flexShrink:0 }}>
              <span style={{ fontSize:11, color:'var(--text-3)', whiteSpace:'nowrap' }}>{n.time}</span>
              {!n.read && (
                <span style={{
                  width:8, height:8, borderRadius:'50%',
                  background:'var(--accent)', display:'block',
                }} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
