import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/workorders/StatusBadge';
import WODetailModal from '../components/workorders/WODetailModal';

const SUBROLE_LABELS = {
  junior_engineer: 'Junior Engineer',
  assistant_engineer: 'Assistant Engineer',
  commandant_engineer: 'Commandant Engineer',
};

const TIER_DESCRIPTIONS = {
  junior_engineer:
    'New requests raised by end users land here first. You have 1 day to approve or reject before they escalate to the Assistant Engineer.',
  assistant_engineer:
    'These requests were not addressed by the Junior Engineer within 1 day and have escalated to you. Act within 1 day before they escalate further.',
  commandant_engineer:
    'These requests have gone unaddressed for more than 2 days, or have been manually escalated. They require your immediate attention.',
};

function approvalStage(wo) {
  if (wo.status === 'escalated') return 'commandant_engineer';
  if (!['open', 'rejected'].includes(wo.status)) return 'none';
  const ageHours = (Date.now() - new Date(wo.createdAt).getTime()) / 3600000;
  if (ageHours >= 48) return 'commandant_engineer';
  if (ageHours >= 24) return 'assistant_engineer';
  return 'junior_engineer';
}

function ageLabel(createdAt) {
  const hours = (Date.now() - new Date(createdAt).getTime()) / 3600000;
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ${Math.floor(hours % 24)}h ago`;
}

function EscalationBadge({ wo, subrole }) {
  if (wo.status === 'pending') {
    const requesterLabel = wo.raisedByUser?.role === 'enduser' ? 'requester' : 'client';
    return (
      <span style={{
        fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
        background: '#f0fdf4', color: 'var(--success)', border: '1px solid var(--success)',
      }}>
        Work completed — awaiting {requesterLabel} sign-off
      </span>
    );
  }
  if (wo.status === 'escalated') {
    return (
      <span style={{
        fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
        background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger-border)',
      }}>
        Manually escalated
      </span>
    );
  }
  if (subrole === 'assistant_engineer') {
    return (
      <span style={{
        fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
        background: '#fffbeb', color: 'var(--warning)',
      }}>
        Escalated from Junior Engineer
      </span>
    );
  }
  if (subrole === 'commandant_engineer') {
    const ageHours = (Date.now() - new Date(wo.createdAt).getTime()) / 3600000;
    const fromTier = ageHours >= 48 ? 'Assistant Engineer' : 'Junior Engineer';
    return (
      <span style={{
        fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
        background: 'var(--danger-bg)', color: 'var(--danger)',
      }}>
        Escalated from {fromTier}
      </span>
    );
  }
  return null;
}

export default function Approvals() {
  const { currentUser, workOrders } = useApp();
  const [selectedWO, setSelectedWO] = useState(null);

  const subrole = currentUser?.client_subrole || 'junior_engineer';
  const subroleLabel = SUBROLE_LABELS[subrole] || 'Engineer';
  const tierDescription = TIER_DESCRIPTIONS[subrole] || '';

  const myItems = workOrders.filter(wo => {
    if (wo.status === 'pending') return wo.raisedByUser?.role !== 'enduser';
    return approvalStage(wo) === subrole;
  });

  const newRequests = myItems.filter(wo => wo.status === 'open' || wo.status === 'rejected');
  const pendingSignOff = myItems.filter(wo => wo.status === 'pending');
  const escalated = myItems.filter(wo => wo.status === 'escalated');

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Approvals</div>
          <div className="page-sub">{myItems.length} item{myItems.length !== 1 ? 's' : ''} awaiting your action as {subroleLabel}</div>
        </div>
      </div>

      <div className="alert alert-info" style={{ marginBottom: 20 }}>
        <strong>{subroleLabel}</strong> — {tierDescription}
      </div>

      {myItems.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">✓</div>
            <div className="empty-title">All clear!</div>
            <div className="empty-sub">No service requests are pending your action right now.</div>
          </div>
        </div>
      ) : (
        <>
          {newRequests.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div className="section-heading" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {subrole === 'junior_engineer' ? 'New Requests' : 'Escalated Requests'}
                <span style={{ marginLeft: 8, background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
                  {newRequests.length}
                </span>
              </div>
              <div className="card">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Service Request</th>
                      <th>Category</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Age</th>
                      <th>Escalation</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {newRequests.map(wo => (
                      <tr key={wo.id} onClick={() => setSelectedWO(wo)} style={{ cursor: 'pointer' }}>
                        <td>
                          <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'block' }}>{wo.refNumber}</span>
                          <span style={{ fontWeight: 500 }}>{wo.title}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'block' }}>{wo.area}</span>
                        </td>
                        <td style={{ color: 'var(--text-2)' }}>{wo.category}</td>
                        <td className={`priority-${wo.priority.toLowerCase()}`}>{wo.priority}</td>
                        <td><StatusBadge status={wo.status} /></td>
                        <td style={{ color: 'var(--text-2)', fontSize: 12, whiteSpace: 'nowrap' }}>
                          {ageLabel(wo.createdAt)}
                        </td>
                        <td>
                          <EscalationBadge wo={wo} subrole={subrole} />
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          <button className="btn btn-sm btn-primary" onClick={() => setSelectedWO(wo)}>
                            Review →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {escalated.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div className="section-heading" style={{ fontSize: 13, fontWeight: 600, color: 'var(--danger)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Manually Escalated
                <span style={{ marginLeft: 8, background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
                  {escalated.length}
                </span>
              </div>
              <div className="card">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Service Request</th>
                      <th>Category</th>
                      <th>Priority</th>
                      <th>Age</th>
                      <th>Escalation</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {escalated.map(wo => (
                      <tr key={wo.id} onClick={() => setSelectedWO(wo)} style={{ cursor: 'pointer' }}>
                        <td>
                          <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'block' }}>{wo.refNumber}</span>
                          <span style={{ fontWeight: 500 }}>{wo.title}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'block' }}>{wo.area}</span>
                        </td>
                        <td style={{ color: 'var(--text-2)' }}>{wo.category}</td>
                        <td className={`priority-${wo.priority.toLowerCase()}`}>{wo.priority}</td>
                        <td style={{ color: 'var(--text-2)', fontSize: 12, whiteSpace: 'nowrap' }}>
                          {ageLabel(wo.createdAt)}
                        </td>
                        <td>
                          <EscalationBadge wo={wo} subrole={subrole} />
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          <button className="btn btn-sm btn-primary" onClick={() => setSelectedWO(wo)}>
                            Review →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {pendingSignOff.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div className="section-heading" style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Pending Sign-off (Work Completed)
                <span style={{ marginLeft: 8, background: '#f0fdf4', color: 'var(--success)', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
                  {pendingSignOff.length}
                </span>
              </div>
              <div className="card">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Service Request</th>
                      <th>Contractor</th>
                      <th>Category</th>
                      <th>Priority</th>
                      <th>Age</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingSignOff.map(wo => (
                      <tr key={wo.id} onClick={() => setSelectedWO(wo)} style={{ cursor: 'pointer' }}>
                        <td>
                          <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'block' }}>{wo.refNumber}</span>
                          <span style={{ fontWeight: 500 }}>{wo.title}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'block' }}>{wo.area}</span>
                        </td>
                        <td>{wo.contractor}</td>
                        <td style={{ color: 'var(--text-2)' }}>{wo.category}</td>
                        <td className={`priority-${wo.priority.toLowerCase()}`}>{wo.priority}</td>
                        <td style={{ color: 'var(--text-2)', fontSize: 12, whiteSpace: 'nowrap' }}>
                          {ageLabel(wo.createdAt)}
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          <button className="btn btn-sm btn-success" onClick={() => setSelectedWO(wo)}>
                            Sign-off →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
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
