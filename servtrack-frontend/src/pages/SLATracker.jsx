import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/workorders/StatusBadge';
import WODetailModal from '../components/workorders/WODetailModal';

export default function SLATracker() {
  const { workOrders } = useApp();
  const [selectedWO, setSelectedWO] = useState(null);

  const activeWOs = workOrders.filter(w => w.status !== 'closed');
  const breaches  = activeWOs.filter(w => w.elapsedHours >= w.slaHours || w.status === 'escalated');
  const atRisk    = activeWOs.filter(w => {
    const pct = w.elapsedHours / w.slaHours * 100;
    return pct >= 80 && pct < 100 && w.status !== 'escalated';
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">SLA Tracker</div>
          <div className="page-sub">Monitor resolution timelines across all active work orders</div>
        </div>
      </div>

      {breaches.length > 0 && (
        <div className="alert alert-danger">
          ⚠ {breaches.length} work order{breaches.length > 1 ? 's have' : ' has'} breached SLA.
          Immediate action required.
        </div>
      )}
      {atRisk.length > 0 && (
        <div className="alert alert-warning">
          ⚠ {atRisk.length} work order{atRisk.length > 1 ? 's are' : ' is'} approaching SLA deadline.
        </div>
      )}

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 240 }}>Work Order</th>
              <th>Status</th>
              <th>Contractor</th>
              <th>SLA Target</th>
              <th>Elapsed</th>
              <th style={{ width: 200 }}>Progress</th>
              <th>Due</th>
            </tr>
          </thead>
          <tbody>
            {activeWOs.map(wo => {
              const pct = Math.min(Math.round((wo.elapsedHours / wo.slaHours) * 100), 100);
              const color = pct >= 100 ? 'var(--danger)' : pct >= 80 ? 'var(--warning)' : 'var(--success)';
              return (
                <tr key={wo.id} onClick={() => setSelectedWO(wo)}>
                  <td>
                    <span style={{ fontSize:11, color:'var(--text-3)', display:'block' }}>{wo.refNumber}</span>
                    <span style={{ fontWeight:500 }}>{wo.title}</span>
                  </td>
                  <td><StatusBadge status={wo.status} /></td>
                  <td>{wo.contractor}</td>
                  <td style={{ color:'var(--text-2)' }}>{wo.slaHours}h</td>
                  <td style={{ color, fontWeight:600 }}>{wo.elapsedHours}h</td>
                  <td>
                    <div className="sla-bar-wrap">
                      <div className="sla-bar" style={{ width:`${pct}%`, background:color }} />
                    </div>
                    <div style={{ fontSize:11, color, fontWeight:600, marginTop:3 }}>
                      {pct}%{pct >= 100 ? ' — Breached' : ''}
                    </div>
                  </td>
                  <td style={{
                    color: pct >= 100 ? 'var(--danger)' : pct >= 80 ? 'var(--warning)' : 'var(--text-2)',
                    fontWeight: pct >= 80 ? 600 : 400,
                  }}>
                    {wo.due}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
