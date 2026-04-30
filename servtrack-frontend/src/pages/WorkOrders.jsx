import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/workorders/StatusBadge';
import WODetailModal from '../components/workorders/WODetailModal';
import CreateWOModal from '../components/workorders/CreateWOModal';

const FILTERS = [
  { id: 'all',        label: 'All'             },
  { id: 'open',       label: 'Awaiting Assignment' },
  { id: 'assigned',   label: 'Assigned'        },
  { id: 'inprogress', label: 'In Progress'     },
  { id: 'qc',         label: 'Pending QC'      },
  { id: 'pending',    label: 'Pending Approval'},
  { id: 'escalated',  label: 'Escalated'       },
  { id: 'rejected',   label: 'Rejected'        },
  { id: 'closed',     label: 'Closed'          },
];

export default function WorkOrders() {
  const { role, workOrders } = useApp();
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch]             = useState('');
  const [selectedWO, setSelectedWO]     = useState(null);
  const [showCreate, setShowCreate]     = useState(false);

  const canCreate = ['client', 'contractor', 'supervisor'].includes(role);

  const visibleWOs = useMemo(() => {
    let list = workOrders;
    if (statusFilter !== 'all') list = list.filter(w => w.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(w =>
        w.refNumber.toLowerCase().includes(q) ||
        w.title.toLowerCase().includes(q) ||
        w.area.toLowerCase().includes(q) ||
        w.contractor.toLowerCase().includes(q)
      );
    }
    return list;
  }, [workOrders, role, statusFilter, search]);

  // Counts per status for filter chips
  const roleWOs = workOrders;
  const countByStatus = useMemo(() => {
    const counts = { all: roleWOs.length };
    roleWOs.forEach(w => { counts[w.status] = (counts[w.status] || 0) + 1; });
    return counts;
  }, [roleWOs]);

  const pageTitle = role === 'enduser' ? 'My Requests' : 'Service Requests';
  const pageSub = role === 'enduser'
    ? `${roleWOs.length} request${roleWOs.length === 1 ? '' : 's'} you have raised`
    : `${roleWOs.length} total in your scope`;
  const emptyTitle = role === 'enduser' ? 'No requests yet' : 'No service requests found';
  const emptySub = role === 'enduser'
    ? 'Raise your first maintenance request to start tracking it here.'
    : 'Try adjusting the filters or search term';

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{pageTitle}</div>
          <div className="page-sub">{pageSub}</div>
        </div>
        {canCreate && (
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + New Service Request
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div className="filter-bar">
        {FILTERS.map(f => (
          <button
            key={f.id}
            className={`filter-chip ${statusFilter === f.id ? 'active' : ''}`}
            onClick={() => setStatusFilter(f.id)}
          >
            {f.label}
            {countByStatus[f.id] > 0 && (
              <span style={{ marginLeft:4, opacity:0.65 }}>({countByStatus[f.id] || 0})</span>
            )}
          </button>
        ))}
        <input
          className="search-input"
          placeholder="Search by title, area, contractor..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="card">
        {visibleWOs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔧</div>
            <div className="empty-title">{emptyTitle}</div>
            <div className="empty-sub">{emptySub}</div>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 240 }}>Service Request</th>
                <th>Area</th>
                <th>Contractor</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Due In</th>
                <th>{role === 'enduser' ? 'Preferred Time' : 'Due'}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleWOs.map(wo => {
                const slaPct = Math.min(Math.round((wo.elapsedHours / wo.slaHours) * 100), 100);
                const slaColor = slaPct >= 100 ? 'var(--danger)' : slaPct >= 80 ? 'var(--warning)' : 'var(--success)';
                return (
                  <tr key={wo.id} onClick={() => setSelectedWO(wo)}>
                    <td>
                      <span style={{ fontSize:11, color:'var(--text-3)', display:'block' }}>{wo.refNumber}</span>
                      <span style={{ fontWeight:500 }}>{wo.title}</span>
                    </td>
                    <td style={{ color:'var(--text-2)', fontSize:12 }}>{wo.area}</td>
                    <td>{wo.contractor}</td>
                    <td className={`priority-${wo.priority.toLowerCase()}`}>{wo.priority}</td>
                    <td><StatusBadge status={wo.status} /></td>
                    <td>
                    {wo.dueDate && wo.status !== 'closed' ? (() => {
                        const diffDays = Math.ceil((new Date(wo.dueDate) - new Date()) / 86400000);
                        const isOverdue = diffDays < 0;
                        return (
                          <span style={{
                            fontSize: 11, fontWeight: 600,
                            color: isOverdue ? 'var(--danger)' : diffDays <= 2 ? 'var(--warning)' : 'var(--text-2)',
                          }}>
                            {isOverdue ? `${Math.abs(diffDays)}d overdue` : diffDays === 0 ? 'Today' : `${diffDays}d left`}
                          </span>
                        );
                      })() : (
                        <span style={{ color: 'var(--text-3)', fontSize: 11 }}>
                          {wo.status === 'closed' ? '—' : 'No due date'}
                        </span>
                      )}
                    </td>
                    <td style={{
                      color: wo.status === 'escalated' ? 'var(--danger)' : wo.slaBreached ? 'var(--warning)' : 'var(--text-2)',
                      fontWeight: (wo.status === 'escalated' || wo.slaBreached) ? 600 : 400,
                    }}>
                      {role === 'enduser' ? (wo.preferredVisitTime || '—') : wo.due}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <button className="btn btn-sm" onClick={() => setSelectedWO(wo)}>View</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {selectedWO && (
        <WODetailModal
          wo={workOrders.find(w => w.id === selectedWO.id)}
          onClose={() => setSelectedWO(null)}
        />
      )}
      {showCreate && <CreateWOModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
