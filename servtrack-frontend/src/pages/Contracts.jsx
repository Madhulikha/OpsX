import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { AddContractorModal } from './Contractors';
import './Contracts.css';

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'pending', label: 'Pending' },
  { id: 'paused', label: 'Paused' },
  { id: 'expired', label: 'Expired' },
];

const STATUS_LABELS = {
  active: 'Active',
  pending: 'Pending',
  paused: 'Paused',
  expired: 'Expired',
};

function formatMoney(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function daysUntil(value) {
  if (!value) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(value);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end - today) / 86400000);
}

function statusClass(status) {
  if (status === 'active') return 'badge-closed';
  if (status === 'pending') return 'badge-pending';
  if (status === 'paused') return 'badge-assigned';
  return 'badge-escalated';
}

function AddContractModal({ onClose }) {
  const { contractors, createContract, showToast } = useApp();
  const today = new Date().toISOString().slice(0, 10);
  const nextYear = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
  const [form, setForm] = useState({
    contractorId: contractors[0]?.id || '',
    title: '',
    value: '',
    scope: '',
    startDate: today,
    endDate: nextYear,
    defaultSlaHours: 24,
    status: 'active',
  });
  const [submitting, setSubmitting] = useState(false);

  const [showAddContractor, setShowAddContractor] = useState(false);
  const prevCountRef = useRef(contractors.length);

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  useEffect(() => {
    if (contractors.length > prevCountRef.current) {
      set('contractorId', contractors[0]?.id || '');
    }
    prevCountRef.current = contractors.length;
  }, [contractors]);

  async function handleSubmit() {
    if (!form.contractorId) {
      showToast('Please select or add a contractor', 'danger');
      return;
    }
    if (!form.title.trim()) {
      showToast('Contract title is required', 'danger');
      return;
    }
    if (!form.startDate || !form.endDate) {
      showToast('Start and end dates are required', 'danger');
      return;
    }
    if (new Date(form.endDate) < new Date(form.startDate)) {
      showToast('End date must be after start date', 'danger');
      return;
    }

    setSubmitting(true);
    try {
      await createContract(form);
      showToast('Contract added successfully', 'success');
      onClose();
    } catch (error) {
      showToast(error.message || 'Could not add contract', 'danger');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="modal-overlay" onClick={event => event.target === event.currentTarget && onClose()}>
        <div className="modal contracts-modal">
          <div className="modal-header">
            <div>
              <span className="modal-title">Add Contract</span>
              <div className="page-sub contracts-modal-sub">Set the agreement terms for this service partner.</div>
            </div>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
          <div className="modal-body">

            <div className="form-group">
              <label className="form-label">Contract Title *</label>
              <input
                className="form-input"
                placeholder="e.g. Annual Electrical Maintenance 2026"
                value={form.title}
                onChange={event => set('title', event.target.value)}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Value (₹)</label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  placeholder="Contract value in INR"
                  value={form.value}
                  onChange={event => set('value', event.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Default SLA Hours</label>
                <input
                  className="form-input"
                  type="number"
                  min="1"
                  value={form.defaultSlaHours}
                  onChange={event => set('defaultSlaHours', event.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Scope</label>
              <textarea
                className="form-input"
                placeholder="Describe the scope of work covered under this contract..."
                value={form.scope}
                onChange={event => set('scope', event.target.value)}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Start Date *</label>
                <input className="form-input" type="date" value={form.startDate} onChange={event => set('startDate', event.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">End Date *</label>
                <input className="form-input" type="date" value={form.endDate} onChange={event => set('endDate', event.target.value)} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Contractor *</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select
                  className="form-input"
                  style={{ flex: 1 }}
                  value={form.contractorId}
                  onChange={event => set('contractorId', event.target.value)}
                >
                  <option value="">Select a contractor</option>
                  {contractors.map(contractor => (
                    <option key={contractor.id} value={contractor.id}>{contractor.name}</option>
                  ))}
                </select>
                <button
                  className="btn btn-sm"
                  style={{ whiteSpace: 'nowrap' }}
                  onClick={() => setShowAddContractor(true)}
                  type="button"
                >
                  + Add Contractor
                </button>
              </div>
              {contractors.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
                  No contractors linked yet. Use "+ Add Contractor" to add and link your first one.
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-input" value={form.status} onChange={event => set('status', event.target.value)}>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="paused">Paused</option>
              </select>
            </div>

          </div>
          <div className="modal-footer">
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Saving...' : 'Add Contract'}
            </button>
          </div>
        </div>
      </div>

      {showAddContractor && (
        <AddContractorModal onClose={() => setShowAddContractor(false)} />
      )}
    </>
  );
}

function ContractDetailModal({ contract, relatedWorkOrders, onClose }) {
  if (!contract) return null;
  const remainingDays = daysUntil(contract.end_date);

  return (
    <div className="modal-overlay" onClick={event => event.target === event.currentTarget && onClose()}>
      <div className="modal contracts-modal">
        <div className="modal-header">
          <div>
            <span className="modal-title">{contract.title}</span>
            <div className="page-sub contracts-modal-sub">{contract.contractor?.name || 'Contractor not available'}</div>
          </div>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>
        <div className="modal-body">
          <div className="stats-grid contract-detail-stats">
            <div className="stat-card">
              <div className="stat-label">Value</div>
              <div className="stat-value contract-detail-value">{formatMoney(contract.value)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Default SLA</div>
              <div className="stat-value contract-detail-value">{contract.default_sla_hours}h</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Open Work</div>
              <div className="stat-value contract-detail-value">{relatedWorkOrders.length}</div>
            </div>
          </div>

          <div className="contract-detail-row">
            <div>
              <div className="form-label">Term</div>
              <div className="text-2">{formatDate(contract.start_date)} to {formatDate(contract.end_date)}</div>
            </div>
            <div>
              <div className="form-label">Renewal</div>
              <div className="text-2">
                {remainingDays < 0 ? 'Expired' : `${remainingDays} day${remainingDays === 1 ? '' : 's'} remaining`}
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Scope</label>
            <div className="text-2">{contract.scope || 'Scope not added yet'}</div>
          </div>

          <div className="form-group">
            <label className="form-label">Recent Open Work Orders</label>
            {relatedWorkOrders.length === 0 ? (
              <div className="empty-state contract-empty-inline">
                <div className="empty-title">No open work orders for this contractor</div>
              </div>
            ) : (
              <div className="contract-work-list">
                {relatedWorkOrders.slice(0, 5).map(wo => (
                  <div key={wo.id} className="contract-work-item">
                    <div>
                      <div className="font-semibold">{wo.title}</div>
                      <div className="text-xs text-3">{wo.refNumber} - {wo.area}</div>
                    </div>
                    <span className={`badge badge-${wo.status}`}>{wo.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function Contracts() {
  const { contracts, contractors, workOrders, role } = useApp();
  const [statusFilter, setStatusFilter] = useState('all');
  const [contractorFilter, setContractorFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedContract, setSelectedContract] = useState(null);

  const activeWorkByContractor = useMemo(() => workOrders.reduce((acc, wo) => {
    if (!wo.contractorId || wo.status === 'closed') return acc;
    acc[wo.contractorId] = (acc[wo.contractorId] || 0) + 1;
    return acc;
  }, {}), [workOrders]);

  const visibleContracts = useMemo(() => {
    let list = contracts;
    if (statusFilter !== 'all') list = list.filter(contract => contract.status === statusFilter);
    if (contractorFilter !== 'all') list = list.filter(contract => String(contract.contractor_id) === contractorFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(contract => (
        contract.title.toLowerCase().includes(q) ||
        (contract.scope || '').toLowerCase().includes(q) ||
        (contract.contractor?.name || '').toLowerCase().includes(q)
      ));
    }
    return [...list].sort((a, b) => new Date(a.end_date) - new Date(b.end_date));
  }, [contractorFilter, contracts, search, statusFilter]);

  const stats = useMemo(() => {
    const active = contracts.filter(contract => contract.status === 'active');
    const renewSoon = active.filter(contract => {
      const days = daysUntil(contract.end_date);
      return days !== null && days >= 0 && days <= 60;
    });
    return {
      total: contracts.length,
      active: active.length,
      renewSoon: renewSoon.length,
      value: active.reduce((sum, contract) => sum + Number(contract.value || 0), 0),
    };
  }, [contracts]);

  const selectedRelatedWorkOrders = useMemo(() => {
    if (!selectedContract) return [];
    return workOrders.filter(wo => wo.contractorId === selectedContract.contractor_id && wo.status !== 'closed');
  }, [selectedContract, workOrders]);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Contracts</div>
          <div className="page-sub">Agreement terms, renewal risk, SLA baselines, and live work impact</div>
        </div>
        {role === 'client' && contractors.length > 0 && (
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>+ Add Contract</button>
        )}
      </div>

      <div className="stats-grid contracts-stats">
        <div className="stat-card">
          <div className="stat-label">Total Contracts</div>
          <div className="stat-value">{stats.total}</div>
          <div className="stat-sub">Across linked contractors</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active</div>
          <div className="stat-value">{stats.active}</div>
          <div className="stat-sub up">Currently enforceable</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Renewal Watch</div>
          <div className="stat-value">{stats.renewSoon}</div>
          <div className="stat-sub warn">Ending within 60 days</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active Value</div>
          <div className="stat-value contracts-money">{formatMoney(stats.value)}</div>
          <div className="stat-sub">Current portfolio</div>
        </div>
      </div>

      <div className="filter-bar contracts-filter-bar">
        {STATUS_FILTERS.map(filter => (
          <button
            key={filter.id}
            className={`filter-chip ${statusFilter === filter.id ? 'active' : ''}`}
            onClick={() => setStatusFilter(filter.id)}
          >
            {filter.label}
          </button>
        ))}
        <select className="search-input contracts-select" value={contractorFilter} onChange={event => setContractorFilter(event.target.value)}>
          <option value="all">All contractors</option>
          {contractors.map(contractor => (
            <option key={contractor.id} value={contractor.id}>{contractor.name}</option>
          ))}
        </select>
        <input
          className="search-input"
          placeholder="Search title, scope, contractor..."
          value={search}
          onChange={event => setSearch(event.target.value)}
        />
      </div>

      <div className="card">
        {visibleContracts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-title">No contracts found</div>
            <div className="empty-sub">Adjust filters or add a contract for a linked contractor.</div>
          </div>
        ) : (
          <table className="data-table contracts-table">
            <thead>
              <tr>
                <th>Contract</th>
                <th>Contractor</th>
                <th>Status</th>
                <th>Term</th>
                <th>SLA</th>
                <th>Open Work</th>
                <th>Value</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleContracts.map(contract => {
                const remainingDays = daysUntil(contract.end_date);
                const renewalClass = remainingDays < 0 ? 'danger' : remainingDays <= 60 ? 'warn' : '';
                return (
                  <tr key={contract.id} onClick={() => setSelectedContract(contract)}>
                    <td>
                      <span className="contracts-title">{contract.title}</span>
                      <span className="contracts-scope">{contract.scope || 'Scope not added'}</span>
                    </td>
                    <td>{contract.contractor?.name || '-'}</td>
                    <td><span className={`badge ${statusClass(contract.status)}`}>{STATUS_LABELS[contract.status] || contract.status}</span></td>
                    <td>
                      <div>{formatDate(contract.start_date)} - {formatDate(contract.end_date)}</div>
                      <div className={`text-xs contracts-renewal ${renewalClass}`}>
                        {remainingDays < 0 ? 'Expired' : `${remainingDays}d remaining`}
                      </div>
                    </td>
                    <td>{contract.default_sla_hours}h</td>
                    <td>{activeWorkByContractor[contract.contractor_id] || 0}</td>
                    <td className="font-semibold">{formatMoney(contract.value)}</td>
                    <td onClick={event => event.stopPropagation()}>
                      <button className="btn btn-sm" onClick={() => setSelectedContract(contract)}>View</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showAddModal && <AddContractModal onClose={() => setShowAddModal(false)} />}
      {selectedContract && (
        <ContractDetailModal
          contract={selectedContract}
          relatedWorkOrders={selectedRelatedWorkOrders}
          onClose={() => setSelectedContract(null)}
        />
      )}
    </div>
  );
}
