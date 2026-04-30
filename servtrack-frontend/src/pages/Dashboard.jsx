import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/workorders/StatusBadge';
import WODetailModal from '../components/workorders/WODetailModal';
import './Dashboard.css';

export default function Dashboard() {
  const { role, currentUser, workOrders, dashboardStats, contractors, notifications } = useApp();
  const navigate = useNavigate();
  const [selectedWO, setSelectedWO] = useState(null);

  const recentWOs = workOrders.slice(0, 5);
  const topContractor = contractors.slice().sort((a, b) => b.rating - a.rating)[0];
  const unreadNotifications = notifications.filter(notification => !notification.read);

  const endUserStats = useMemo(() => ([
    {
      label: 'Open Requests',
      value: workOrders.filter(wo => ['open', 'assigned'].includes(wo.status)).length,
      sub: 'awaiting active resolution',
      subCls: '',
    },
    {
      label: 'In Progress',
      value: workOrders.filter(wo => ['inprogress', 'qc', 'pending'].includes(wo.status)).length,
      sub: 'currently being worked',
      subCls: '',
    },
    {
      label: 'Resolved',
      value: workOrders.filter(wo => wo.status === 'closed').length,
      sub: 'completed successfully',
      subCls: 'up',
    },
    {
      label: 'Unread Updates',
      value: unreadNotifications.length,
      sub: 'fresh notifications for you',
      subCls: unreadNotifications.length > 0 ? 'warn' : '',
    },
  ]), [unreadNotifications.length, workOrders]);

  function approvalStage(wo) {
    if (wo.status === 'escalated') return 'commandant_engineer';
    if (!['open', 'rejected'].includes(wo.status)) return 'none';
    const ageHours = (Date.now() - new Date(wo.createdAt).getTime()) / 3600000;
    if (ageHours >= 48) return 'commandant_engineer';
    if (ageHours >= 24) return 'assistant_engineer';
    return 'junior_engineer';
  }

  const clientSubrole = currentUser?.client_subrole || 'junior_engineer';

  const statsByRole = {
    client: [
      { label: 'Awaiting Assignment', value: dashboardStats?.total_open ?? 0, sub: 'needs engineer action', subCls: '' },
      { label: 'In Progress', value: dashboardStats?.total_inprogress ?? 0, sub: 'currently active', subCls: '' },
      { label: 'Closed', value: dashboardStats?.total_closed_this_month ?? 0, sub: 'this month', subCls: 'up' },
      { label: 'SLA Breaches', value: dashboardStats?.sla_breaches ?? 0, sub: 'needs action', subCls: 'danger' },
    ],
    contractor: [
      { label: 'Assigned', value: workOrders.filter(wo => wo.status === 'assigned').length, sub: 'to my company', subCls: '' },
      { label: 'In Progress', value: workOrders.filter(wo => wo.status === 'inprogress').length, sub: 'active jobs', subCls: '' },
      { label: 'Completed', value: workOrders.filter(wo => wo.status === 'closed').length, sub: 'visible to me', subCls: 'up' },
      { label: 'Pending Approval', value: workOrders.filter(wo => wo.status === 'pending').length, sub: 'awaiting client', subCls: '' },
    ],
    supervisor: [
      { label: 'Assigned', value: workOrders.filter(wo => wo.status === 'assigned').length, sub: 'ready to start', subCls: '' },
      { label: 'In Progress', value: workOrders.filter(wo => wo.status === 'inprogress').length, sub: 'site work active', subCls: '' },
      { label: 'Pending QC', value: workOrders.filter(wo => wo.status === 'qc').length, sub: 'review required', subCls: 'warn' },
      { label: 'Pending Approval', value: workOrders.filter(wo => wo.status === 'pending').length, sub: 'sent to client', subCls: '' },
    ],
    workman: [
      { label: 'My Active Tasks', value: workOrders.filter(wo => wo.status !== 'closed').length, sub: 'current assignments', subCls: '' },
      { label: 'In Progress', value: workOrders.filter(wo => wo.status === 'inprogress').length, sub: 'being worked now', subCls: '' },
    ],
    enduser: endUserStats,
  };

  const stats = statsByRole[role] || statsByRole.client;

  if (role === 'enduser') {
    const activeRequests = workOrders.filter(wo => wo.status !== 'closed').slice(0, 4);
    const closedRequests = workOrders.filter(wo => wo.status === 'closed').slice(0, 3);

    return (
      <div>
        <div className="stats-grid" style={{ gridTemplateColumns: `repeat(${stats.length}, 1fr)` }}>
          {stats.map(stat => (
            <div className="stat-card" key={stat.label}>
              <div className="stat-label">{stat.label}</div>
              <div className="stat-value">{stat.value}</div>
              <div className={`stat-sub ${stat.subCls}`}>{stat.sub}</div>
            </div>
          ))}
        </div>

        <div className="enduser-dashboard-grid">
          <div className="card">
            <div className="card-header">
              <span className="card-title">Raise or Track Requests</span>
            </div>
            <div className="card-body">
              <div className="enduser-hero">
                <div>
                  <div className="enduser-hero-title">Something needs attention?</div>
                  <div className="enduser-hero-sub">
                    Raise a new maintenance request and follow every update from assignment to closure.
                  </div>
                </div>
                <div className="enduser-hero-actions">
                  <button className="btn btn-primary" onClick={() => navigate('/raise')}>Raise New Request</button>
                  <button className="btn" onClick={() => navigate('/work-orders')}>View My Requests</button>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Latest Updates</span>
              <button className="btn btn-sm" onClick={() => navigate('/notifications')}>See all</button>
            </div>
            <div className="card-body">
              {notifications.length === 0 ? (
                <div className="empty-state" style={{ padding: '32px 12px' }}>
                  <div className="empty-title">No updates yet</div>
                  <div className="empty-sub">Notifications about your requests will appear here.</div>
                </div>
              ) : (
                <div className="enduser-notification-list">
                  {notifications.slice(0, 4).map(notification => (
                    <div key={notification.id} className={`enduser-notification-item${notification.read ? '' : ' unread'}`}>
                      <div className="enduser-notification-title">{notification.title}</div>
                      <div className="enduser-notification-body">{notification.body}</div>
                      <div className="enduser-notification-time">{notification.time}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="enduser-dashboard-grid">
          <div className="card">
            <div className="card-header">
              <span className="card-title">Active Requests</span>
            </div>
            <div className="card-body">
              {activeRequests.length === 0 ? (
                <div className="empty-state" style={{ padding: '32px 12px' }}>
                  <div className="empty-title">No active requests</div>
                  <div className="empty-sub">New requests will show up here while they are in progress.</div>
                </div>
              ) : (
                <div className="enduser-request-list">
                  {activeRequests.map(request => (
                    <button key={request.id} className="enduser-request-card" onClick={() => setSelectedWO(request)}>
                      <div className="enduser-request-top">
                        <span className="enduser-request-ref">{request.refNumber}</span>
                        <StatusBadge status={request.status} />
                      </div>
                      <div className="enduser-request-title">{request.title}</div>
                      <div className="enduser-request-meta">{request.area} · {request.category}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Recently Resolved</span>
            </div>
            <div className="card-body">
              {closedRequests.length === 0 ? (
                <div className="empty-state" style={{ padding: '32px 12px' }}>
                  <div className="empty-title">Nothing resolved yet</div>
                  <div className="empty-sub">Closed requests will appear here after completion.</div>
                </div>
              ) : (
                <div className="enduser-request-list">
                  {closedRequests.map(request => (
                    <button key={request.id} className="enduser-request-card" onClick={() => setSelectedWO(request)}>
                      <div className="enduser-request-top">
                        <span className="enduser-request-ref">{request.refNumber}</span>
                        <StatusBadge status={request.status} />
                      </div>
                      <div className="enduser-request-title">{request.title}</div>
                      <div className="enduser-request-meta">{request.area} · Closed request</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {selectedWO && (
          <WODetailModal
            wo={workOrders.find(request => request.id === selectedWO.id)}
            onClose={() => setSelectedWO(null)}
          />
        )}
      </div>
    );
  }

  if (role === 'client') {
    const newRequests = workOrders.filter(wo => approvalStage(wo) === clientSubrole).slice(0, 5);
    const attentionItems = workOrders.filter(wo => ['pending'].includes(wo.status) || approvalStage(wo) === clientSubrole).slice(0, 5);
    const recentNotifications = notifications.slice(0, 5);

    return (
      <div>
        <div className="stats-grid" style={{ gridTemplateColumns: `repeat(${stats.length}, 1fr)` }}>
          {stats.map(stat => (
            <div className="stat-card" key={stat.label}>
              <div className="stat-label">{stat.label}</div>
              <div className="stat-value">{stat.value}</div>
              <div className={`stat-sub ${stat.subCls}`}>{stat.sub}</div>
            </div>
          ))}
        </div>

        <div className="enduser-dashboard-grid">
          <div className="card">
            <div className="card-header">
              <span className="card-title">Incoming Requests</span>
              <button className="btn btn-sm" onClick={() => navigate('/work-orders')}>Open queue</button>
            </div>
            <div className="card-body">
              {newRequests.length === 0 ? (
                <div className="empty-state" style={{ padding: '32px 12px' }}>
                  <div className="empty-title">No new requests right now</div>
                  <div className="empty-sub">Fresh end-user requests will appear here as they come in.</div>
                </div>
              ) : (
                <div className="enduser-request-list">
                  {newRequests.map(request => (
                    <button key={request.id} className="enduser-request-card" onClick={() => setSelectedWO(request)}>
                      <div className="enduser-request-top">
                        <span className="enduser-request-ref">{request.refNumber}</span>
                        <StatusBadge status={request.status} />
                      </div>
                      <div className="enduser-request-title">{request.title}</div>
                      <div className="enduser-request-meta">{request.raisedBy} · {request.area}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Needs Attention</span>
              <button className="btn btn-sm" onClick={() => navigate('/approvals')}>Review</button>
            </div>
            <div className="card-body">
              {attentionItems.length === 0 ? (
                <div className="empty-state" style={{ padding: '32px 12px' }}>
                  <div className="empty-title">All clear</div>
                  <div className="empty-sub">No approvals or escalations need your action right now.</div>
                </div>
              ) : (
                <div className="enduser-request-list">
                  {attentionItems.map(item => (
                    <button key={item.id} className="enduser-request-card" onClick={() => setSelectedWO(item)}>
                      <div className="enduser-request-top">
                        <span className="enduser-request-ref">{item.refNumber}</span>
                        <StatusBadge status={item.status} />
                      </div>
                      <div className="enduser-request-title">{item.title}</div>
                      <div className="enduser-request-meta">{item.contractor} · {item.area}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="enduser-dashboard-grid">
          <div className="card">
            <div className="card-header">
              <span className="card-title">Recent Work Orders</span>
              <button className="btn btn-sm" onClick={() => navigate('/work-orders')}>View all</button>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Work Order</th>
                  <th>Raised By</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Due</th>
                </tr>
              </thead>
              <tbody>
                {recentWOs.map(wo => (
                  <tr key={wo.id} onClick={() => setSelectedWO(wo)}>
                    <td>
                      <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'block' }}>{wo.refNumber}</span>
                      <span style={{ fontWeight: 500 }}>{wo.title}</span>
                    </td>
                    <td style={{ color: 'var(--text-2)' }}>{wo.raisedBy}</td>
                    <td className={`priority-${wo.priority.toLowerCase()}`}>{wo.priority}</td>
                    <td><StatusBadge status={wo.status} /></td>
                    <td style={{ color: wo.slaBreached ? 'var(--danger)' : 'var(--text-2)', fontWeight: wo.slaBreached ? 600 : 400 }}>{wo.due}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Live Updates</span>
              <button className="btn btn-sm" onClick={() => navigate('/notifications')}>See all</button>
            </div>
            <div className="card-body">
              {recentNotifications.length === 0 ? (
                <div className="empty-state" style={{ padding: '32px 12px' }}>
                  <div className="empty-title">No notifications yet</div>
                  <div className="empty-sub">Client notifications about requests, approvals, and breaches will appear here.</div>
                </div>
              ) : (
                <div className="enduser-notification-list">
                  {recentNotifications.map(notification => (
                    <div key={notification.id} className={`enduser-notification-item${notification.read ? '' : ' unread'}`}>
                      <div className="enduser-notification-title">{notification.title}</div>
                      <div className="enduser-notification-body">{notification.body}</div>
                      <div className="enduser-notification-time">{notification.time}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">SLA Performance — April 2026</span>
          </div>
          <div className="card-body">
            <div className="sla-summary-grid">
              <div className="sla-kpi">
                <div className="sla-kpi-label">Within SLA</div>
                <div className="sla-kpi-value" style={{ color: 'var(--success)' }}>{dashboardStats?.sla_compliance_pct ?? 0}%</div>
                <div className="sla-kpi-sub">of closed work orders</div>
              </div>
              <div className="sla-kpi">
                <div className="sla-kpi-label">Avg Resolution</div>
                <div className="sla-kpi-value">{dashboardStats?.avg_resolution_hours ?? 0}h</div>
                <div className="sla-kpi-sub">average close time</div>
              </div>
              <div className="sla-kpi">
                <div className="sla-kpi-label">Breaches</div>
                <div className="sla-kpi-value" style={{ color: 'var(--danger)' }}>{dashboardStats?.sla_breaches ?? 0}</div>
                <div className="sla-kpi-sub">requires action</div>
              </div>
              <div className="sla-kpi">
                <div className="sla-kpi-label">Top Contractor</div>
                <div className="sla-kpi-value" style={{ fontSize: 18 }}>{topContractor?.name || '—'}</div>
                <div className="sla-kpi-sub">{topContractor ? `${topContractor.rating.toFixed(1)} ★ rating` : 'No contractor data'}</div>
              </div>
            </div>
          </div>
        </div>

        {selectedWO && (
          <WODetailModal
            wo={workOrders.find(w => w.id === selectedWO.id)}
            onClose={() => setSelectedWO(null)}
          />
        )}
      </div>
    );
  }

  if (role === 'supervisor') {
    const qcItems = workOrders.filter(wo => wo.status === 'qc').slice(0, 5);
    const activeSiteWork = workOrders.filter(wo => ['assigned', 'inprogress'].includes(wo.status)).slice(0, 5);

    return (
      <div>
        <div className="stats-grid" style={{ gridTemplateColumns: `repeat(${stats.length}, 1fr)` }}>
          {stats.map(stat => (
            <div className="stat-card" key={stat.label}>
              <div className="stat-label">{stat.label}</div>
              <div className="stat-value">{stat.value}</div>
              <div className={`stat-sub ${stat.subCls}`}>{stat.sub}</div>
            </div>
          ))}
        </div>

        <div className="enduser-dashboard-grid">
          <div className="card">
            <div className="card-header">
              <span className="card-title">QC Review Queue</span>
              <button className="btn btn-sm" onClick={() => navigate('/work-orders')}>Open queue</button>
            </div>
            <div className="card-body">
              {qcItems.length === 0 ? (
                <div className="empty-state" style={{ padding: '32px 12px' }}>
                  <div className="empty-title">No completion reviews</div>
                  <div className="empty-sub">Workman submissions will appear here for photo and note review.</div>
                </div>
              ) : (
                <div className="enduser-request-list">
                  {qcItems.map(item => (
                    <button key={item.id} className="enduser-request-card" onClick={() => setSelectedWO(item)}>
                      <div className="enduser-request-top">
                        <span className="enduser-request-ref">{item.refNumber}</span>
                        <StatusBadge status={item.status} />
                      </div>
                      <div className="enduser-request-title">{item.title}</div>
                      <div className="enduser-request-meta">{item.workman} · {item.area}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Active Site Work</span>
              <button className="btn btn-sm" onClick={() => navigate('/work-orders')}>View all</button>
            </div>
            <div className="card-body">
              {activeSiteWork.length === 0 ? (
                <div className="empty-state" style={{ padding: '32px 12px' }}>
                  <div className="empty-title">No active assignments</div>
                  <div className="empty-sub">Assigned and in-progress work will appear here.</div>
                </div>
              ) : (
                <div className="enduser-request-list">
                  {activeSiteWork.map(item => (
                    <button key={item.id} className="enduser-request-card" onClick={() => setSelectedWO(item)}>
                      <div className="enduser-request-top">
                        <span className="enduser-request-ref">{item.refNumber}</span>
                        <StatusBadge status={item.status} />
                      </div>
                      <div className="enduser-request-title">{item.title}</div>
                      <div className="enduser-request-meta">{item.workman} · Due {item.due}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {selectedWO && (
          <WODetailModal
            wo={workOrders.find(w => w.id === selectedWO.id)}
            onClose={() => setSelectedWO(null)}
          />
        )}
      </div>
    );
  }

  if (role === 'workman') {
    const inProgressTasks = workOrders.filter(wo => wo.status === 'inprogress').slice(0, 5);
    const queuedTasks = workOrders.filter(wo => wo.status === 'assigned').slice(0, 5);

    return (
      <div>
        <div className="stats-grid" style={{ gridTemplateColumns: `repeat(${stats.length}, 1fr)` }}>
          {stats.map(stat => (
            <div className="stat-card" key={stat.label}>
              <div className="stat-label">{stat.label}</div>
              <div className="stat-value">{stat.value}</div>
              <div className={`stat-sub ${stat.subCls}`}>{stat.sub}</div>
            </div>
          ))}
        </div>

        <div className="enduser-dashboard-grid">
          <div className="card">
            <div className="card-header">
              <span className="card-title">Ready To Complete</span>
              <button className="btn btn-sm" onClick={() => navigate('/work-orders')}>View tasks</button>
            </div>
            <div className="card-body">
              {inProgressTasks.length === 0 ? (
                <div className="empty-state" style={{ padding: '32px 12px' }}>
                  <div className="empty-title">No tasks in progress</div>
                  <div className="empty-sub">When work starts, completion photo upload will be available here.</div>
                </div>
              ) : (
                <div className="enduser-request-list">
                  {inProgressTasks.map(task => (
                    <button key={task.id} className="enduser-request-card" onClick={() => setSelectedWO(task)}>
                      <div className="enduser-request-top">
                        <span className="enduser-request-ref">{task.refNumber}</span>
                        <StatusBadge status={task.status} />
                      </div>
                      <div className="enduser-request-title">{task.title}</div>
                      <div className="enduser-request-meta">{task.area} · completion photos required</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Queued Tasks</span>
            </div>
            <div className="card-body">
              {queuedTasks.length === 0 ? (
                <div className="empty-state" style={{ padding: '32px 12px' }}>
                  <div className="empty-title">No queued tasks</div>
                  <div className="empty-sub">Assigned tasks waiting to start will show here.</div>
                </div>
              ) : (
                <div className="enduser-request-list">
                  {queuedTasks.map(task => (
                    <button key={task.id} className="enduser-request-card" onClick={() => setSelectedWO(task)}>
                      <div className="enduser-request-top">
                        <span className="enduser-request-ref">{task.refNumber}</span>
                        <StatusBadge status={task.status} />
                      </div>
                      <div className="enduser-request-title">{task.title}</div>
                      <div className="enduser-request-meta">{task.area} · Due {task.due}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {selectedWO && (
          <WODetailModal
            wo={workOrders.find(w => w.id === selectedWO.id)}
            onClose={() => setSelectedWO(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="stats-grid" style={{ gridTemplateColumns: `repeat(${stats.length}, 1fr)` }}>
        {stats.map(stat => (
          <div className="stat-card" key={stat.label}>
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value">{stat.value}</div>
            <div className={`stat-sub ${stat.subCls}`}>{stat.sub}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Recent work orders</span>
          <button className="btn btn-sm" onClick={() => navigate('/work-orders')}>View all</button>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Work Order</th>
              <th>Contractor</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Due</th>
            </tr>
          </thead>
          <tbody>
            {recentWOs.map(wo => (
              <tr key={wo.id} onClick={() => setSelectedWO(wo)}>
                <td>
                  <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'block' }}>{wo.refNumber}</span>
                  <span style={{ fontWeight: 500 }}>{wo.title}</span>
                </td>
                <td style={{ color: 'var(--text-2)' }}>{wo.contractor}</td>
                <td className={`priority-${wo.priority.toLowerCase()}`}>{wo.priority}</td>
                <td><StatusBadge status={wo.status} /></td>
                <td style={{ color: wo.slaBreached ? 'var(--danger)' : 'var(--text-2)', fontWeight: wo.slaBreached ? 600 : 400 }}>{wo.due}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {role === 'client' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">SLA Performance — April 2026</span>
          </div>
          <div className="card-body">
            <div className="sla-summary-grid">
              <div className="sla-kpi">
                <div className="sla-kpi-label">Within SLA</div>
                <div className="sla-kpi-value" style={{ color: 'var(--success)' }}>{dashboardStats?.sla_compliance_pct ?? 0}%</div>
                <div className="sla-kpi-sub">of closed work orders</div>
              </div>
              <div className="sla-kpi">
                <div className="sla-kpi-label">Avg Resolution</div>
                <div className="sla-kpi-value">{dashboardStats?.avg_resolution_hours ?? 0}h</div>
                <div className="sla-kpi-sub">average close time</div>
              </div>
              <div className="sla-kpi">
                <div className="sla-kpi-label">Breaches</div>
                <div className="sla-kpi-value" style={{ color: 'var(--danger)' }}>{dashboardStats?.sla_breaches ?? 0}</div>
                <div className="sla-kpi-sub">requires action</div>
              </div>
              <div className="sla-kpi">
                <div className="sla-kpi-label">Top Contractor</div>
                <div className="sla-kpi-value" style={{ fontSize: 18 }}>{topContractor?.name || '—'}</div>
                <div className="sla-kpi-sub">{topContractor ? `${topContractor.rating.toFixed(1)} ★ rating` : 'No contractor data'}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedWO && (
        <WODetailModal
          wo={workOrders.find(w => w.id === selectedWO.id)}
          onClose={() => setSelectedWO(null)}
        />
      )}
    </div>
  );
}
