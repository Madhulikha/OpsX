import React from 'react';
import { useApp } from '../context/AppContext';

export default function Contractors() {
  const { contractors, workOrders } = useApp();

  const activeCountByContractor = workOrders.reduce((acc, wo) => {
    if (!wo.contractorId || wo.status === 'closed') return acc;
    acc[wo.contractorId] = (acc[wo.contractorId] || 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Contractors</div>
          <div className="page-sub">Approved service partners</div>
        </div>
        <button className="btn btn-primary">+ Add Contractor</button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:14 }}>
        {contractors.map(c => (
          <div className="card" key={c.id} style={{ marginBottom:0 }}>
            <div className="card-body">
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                <div style={{
                  width:44, height:44, borderRadius:'50%', background:'var(--accent-bg)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontWeight:700, fontSize:14, color:'var(--accent)',
                }}>
                  {c.name.slice(0,2).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight:700, fontSize:15 }}>{c.name}</div>
                  <div style={{ fontSize:12, color:'var(--text-2)' }}>{c.speciality}</div>
                </div>
                <div style={{ marginLeft:'auto', textAlign:'right' }}>
                  <div style={{ fontWeight:700, color:'var(--success)', fontSize:14 }}>★ {c.rating}</div>
                  <div style={{ fontSize:11, color:'var(--text-3)' }}>rating</div>
                </div>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderTop:'1px solid var(--border)', fontSize:13 }}>
                <span style={{ color:'var(--text-2)' }}>Active Work Orders</span>
                <span style={{ fontWeight:600 }}>{activeCountByContractor[c.id] || 0}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
