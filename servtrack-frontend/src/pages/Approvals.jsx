import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/workorders/StatusBadge';
import WODetailModal from '../components/workorders/WODetailModal';

export default function Approvals() {
  const { workOrders } = useApp();
  const [selectedWO, setSelectedWO] = useState(null);

  const pending = workOrders.filter(w => w.status === 'pending' || w.status === 'escalated');

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Approvals</div>
          <div className="page-sub">{pending.length} items pending your action</div>
        </div>
      </div>

      {pending.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">✓</div>
            <div className="empty-title">All clear!</div>
            <div className="empty-sub">No work orders are pending your approval right now.</div>
          </div>
        </div>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Work Order</th>
                <th>Contractor</th>
                <th>Category</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Due</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pending.map(wo => (
                <tr key={wo.id} onClick={() => setSelectedWO(wo)}>
                  <td>
                    <span style={{ fontSize:11, color:'var(--text-3)', display:'block' }}>{wo.refNumber}</span>
                    <span style={{ fontWeight:500 }}>{wo.title}</span>
                  </td>
                  <td>{wo.contractor}</td>
                  <td style={{ color:'var(--text-2)' }}>{wo.category}</td>
                  <td className={`priority-${wo.priority.toLowerCase()}`}>{wo.priority}</td>
                  <td><StatusBadge status={wo.status} /></td>
                  <td style={{ color: wo.slaBreached ? 'var(--danger)' : 'var(--text-2)' }}>{wo.due}</td>
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
