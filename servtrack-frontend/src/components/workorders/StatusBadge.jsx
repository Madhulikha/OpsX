import React from 'react';
import { STATUS_CONFIG } from '../../data/mockData';

export default function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || { label: status, cls: 'badge-open' };
  return (
    <span className={`badge ${config.cls}`}>
      {config.label}
    </span>
  );
}
