import React from 'react';

export default function Placeholder({ title, phase, description }) {
  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{title}</div>
        </div>
        <span className="badge badge-open">{phase || 'Phase 2'}</span>
      </div>

      <div className="card">
        <div className="empty-state" style={{ padding:'72px 20px' }}>
          <div className="empty-icon">🔧</div>
          <div className="empty-title">{title} — Coming in {phase || 'Phase 2'}</div>
          <div className="empty-sub" style={{ maxWidth:400 }}>
            {description || 'This module is part of the next phase. The routing and sidebar are already wired up — connect your FastAPI endpoints to activate.'}
          </div>
        </div>
      </div>
    </div>
  );
}
