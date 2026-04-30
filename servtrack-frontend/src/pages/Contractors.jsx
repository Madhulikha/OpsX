import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import './Contractors.css';

export function activationLabel(contractor) {
  if (contractor.link_status === 'invited') return 'Invite sent';
  return contractor.has_login ? 'Active login' : 'Pending activation';
}

export async function copyInviteLink(inviteUrl, showToast) {
  if (!inviteUrl) return false;
  try {
    await navigator.clipboard.writeText(inviteUrl);
    showToast('Email is not configured. Invite link copied to clipboard.', 'warning');
    return true;
  } catch (error) {
    showToast(`Email is not configured. Invite link: ${inviteUrl}`, 'warning');
    return false;
  }
}

export function AddContractorModal({ onClose }) {
  const { createContractor, discoverContractors, linkContractor, showToast } = useApp();
  const [mode, setMode] = useState('existing');
  const [search, setSearch] = useState('');
  const [discoveries, setDiscoveries] = useState([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    speciality: '',
    email: '',
    phone: '',
    address: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [manualInviteUrl, setManualInviteUrl] = useState('');

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  useEffect(() => {
    let cancelled = false;
    if (mode !== 'existing') return undefined;

    async function loadDiscoveries() {
      setDiscoverLoading(true);
      try {
        const results = await discoverContractors(search);
        if (!cancelled) setDiscoveries(results);
      } catch (error) {
        if (!cancelled) showToast(error.message || 'Could not load contractor directory', 'danger');
      } finally {
        if (!cancelled) setDiscoverLoading(false);
      }
    }

    loadDiscoveries();
    return () => {
      cancelled = true;
    };
  }, [discoverContractors, mode, search, showToast]);

  async function handleLink(contractorId, contractorName) {
    setSubmitting(true);
    try {
      const linked = await linkContractor(contractorId);
      if (linked.invite_url) {
        setManualInviteUrl(linked.invite_url);
        await copyInviteLink(linked.invite_url, showToast);
        return;
      } else {
        showToast(
          linked.invite_sent ? `${contractorName} linked and invited` : `${contractorName} linked successfully`,
          'success'
        );
      }
      onClose();
    } catch (error) {
      showToast(error.message || 'Could not link contractor', 'danger');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreate() {
    if (!form.name.trim()) {
      showToast('Contractor name is required', 'danger');
      return;
    }
    if (!form.speciality.trim() || !form.email.trim() || !form.phone.trim() || !form.address.trim()) {
      showToast('All contractor fields are required', 'danger');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      showToast('Enter a valid contractor email address', 'danger');
      return;
    }

    setSubmitting(true);
    try {
      const created = await createContractor(form);
      if (created.invite_url) {
        setManualInviteUrl(created.invite_url);
        await copyInviteLink(created.invite_url, showToast);
        return;
      } else {
        showToast(
          created.invite_sent ? `${created.name} added and invited` : `${created.name} added successfully`,
          'success'
        );
      }
      onClose();
    } catch (error) {
      showToast(error.message || 'Could not add contractor', 'danger');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={event => event.target === event.currentTarget && onClose()}>
      <div className="modal contractor-modal">
        <div className="modal-header">
          <div>
            <span className="modal-title">Add Contractor</span>
            <div className="page-sub contractor-modal-sub">Link an existing vendor or create a fresh contractor entry.</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="tabs contractor-tabs">
            <div className={`tab${mode === 'existing' ? ' active' : ''}`} onClick={() => setMode('existing')}>Link Existing</div>
            <div className={`tab${mode === 'new' ? ' active' : ''}`} onClick={() => setMode('new')}>Create New</div>
          </div>

          {mode === 'existing' ? (
            <div className="contractor-discover">
              {manualInviteUrl && (
                <div className="alert alert-warning contractor-invite-alert">
                  <div>
                    Email is not configured or could not be sent. Share this invite link manually.
                    <input className="form-input" value={manualInviteUrl} readOnly />
                  </div>
                  <button className="btn btn-sm" onClick={() => copyInviteLink(manualInviteUrl, showToast)}>Copy Link</button>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Search Existing Contractors</label>
                <input
                  className="form-input"
                  placeholder="Search by company name or speciality"
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                />
              </div>

              {discoverLoading ? (
                <div className="empty-state contractor-discover-empty">
                  <div className="empty-title">Searching contractor directory...</div>
                </div>
              ) : discoveries.length === 0 ? (
                <div className="empty-state contractor-discover-empty">
                  <div className="empty-title">No matching contractors found</div>
                  <div className="empty-sub">Create a new contractor if this partner is not already available in the shared directory.</div>
                </div>
              ) : (
                <div className="contractor-discover-list">
                  {discoveries.map(contractor => (
                    <div key={contractor.id} className="contractor-discover-item">
                      <div className="contractor-discover-copy">
                        <div className="contractor-name-row">
                          <span className="contractor-name">{contractor.name}</span>
                          <span className={`contractor-status-pill${contractor.has_login ? ' active' : ' pending'}`}>
                            {activationLabel(contractor)}
                          </span>
                        </div>
                        <div className="contractor-speciality">{contractor.speciality || 'Speciality not added'}</div>
                        <div className="contractor-discover-meta">
                          <span>★ {contractor.rating}</span>
                          <span>{contractor.active_user_count} team members</span>
                          <span>{contractor.email || contractor.phone || 'No contact added'}</span>
                        </div>
                      </div>
                      <button className="btn btn-primary" disabled={submitting} onClick={() => handleLink(contractor.id, contractor.name)}>
                        Link
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {manualInviteUrl && (
                <div className="alert alert-warning contractor-invite-alert">
                  <div>
                    Email is not configured or could not be sent. Share this invite link manually.
                    <input className="form-input" value={manualInviteUrl} readOnly />
                  </div>
                  <button className="btn btn-sm" onClick={() => copyInviteLink(manualInviteUrl, showToast)}>Copy Link</button>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Contractor Name *</label>
                <input className="form-input" value={form.name} onChange={event => set('name', event.target.value)} required />
              </div>

              <div className="form-group">
                <label className="form-label">Speciality *</label>
                <input
                  className="form-input"
                  placeholder="Electrical, HVAC, Plumbing"
                  value={form.speciality}
                  onChange={event => set('speciality', event.target.value)}
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Email *</label>
                  <input className="form-input" type="email" value={form.email} onChange={event => set('email', event.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone *</label>
                  <input className="form-input" value={form.phone} onChange={event => set('phone', event.target.value)} required />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Address *</label>
                <textarea className="form-input" value={form.address} onChange={event => set('address', event.target.value)} required />
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          {mode === 'new' && (
            <button className="btn btn-primary" onClick={handleCreate} disabled={submitting}>
              {submitting ? 'Saving...' : 'Add Contractor'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ContractorDetailModal({ contractor, activeCount, onClose }) {
  if (!contractor) return null;

  return (
    <div className="modal-overlay" onClick={event => event.target === event.currentTarget && onClose()}>
      <div className="modal contractor-modal">
        <div className="modal-header">
          <div>
            <span className="modal-title">{contractor.name}</span>
            <div className="page-sub contractor-modal-sub">{activationLabel(contractor)}</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="stats-grid contractor-detail-stats">
            <div className="stat-card">
              <div className="stat-label">Rating</div>
              <div className="stat-value contractor-detail-kpi">★ {contractor.rating}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Active Work Orders</div>
              <div className="stat-value contractor-detail-kpi">{activeCount}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Team Logins</div>
              <div className="stat-value contractor-detail-status">{contractor.active_user_count || 0}</div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Speciality</label>
            <div className="text-2">{contractor.speciality || 'Not added yet'}</div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Email</label>
              <div className="text-2">{contractor.email || 'Not added yet'}</div>
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <div className="text-2">{contractor.phone || 'Not added yet'}</div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Address</label>
            <div className="text-2">{contractor.address || 'Not added yet'}</div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Linked On</label>
              <div className="text-2">
                {contractor.linked_at
                  ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(contractor.linked_at))
                  : 'Linked before tracking started'}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Created</label>
              <div className="text-2">
                {new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(contractor.created_at))}
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function Contractors() {
  const { contractors, workOrders, role } = useApp();
  const [selectedContractor, setSelectedContractor] = useState(null);

  const activeCountByContractor = useMemo(() => workOrders.reduce((acc, wo) => {
    if (!wo.contractorId || wo.status === 'closed') return acc;
    acc[wo.contractorId] = (acc[wo.contractorId] || 0) + 1;
    return acc;
  }, {}), [workOrders]);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Contractors</div>
          <div className="page-sub">Linked service partners available for assignment and maintenance delivery</div>
        </div>
      </div>

      {contractors.length === 0 ? (
        <div className="empty-state">
          <div className="empty-title">No linked contractors yet</div>
          <div className="empty-sub">Link an existing partner or create a new contractor to begin assigning work orders.</div>
        </div>
      ) : (
        <div className="contractor-grid">
          {contractors.map(contractor => (
            <button
              key={contractor.id}
              className="card contractor-card"
              onClick={() => setSelectedContractor(contractor)}
            >
              <div className="card-body">
                <div className="contractor-card-top">
                  <div className="contractor-avatar">
                    {contractor.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="contractor-card-copy">
                    <div className="contractor-name-row">
                      <div className="contractor-name">{contractor.name}</div>
                      <span className={`contractor-status-pill${contractor.has_login ? ' active' : ' pending'}`}>
                        {activationLabel(contractor)}
                      </span>
                    </div>
                    <div className="contractor-speciality">{contractor.speciality || 'Speciality not added'}</div>
                  </div>
                  <div className="contractor-rating">
                    <div className="contractor-rating-value">★ {contractor.rating}</div>
                    <div className="contractor-rating-label">rating</div>
                  </div>
                </div>

                <div className="contractor-meta-grid">
                  <div>
                    <div className="text-xs text-3">Active Work Orders</div>
                    <div className="font-semibold contractor-meta-value">{activeCountByContractor[contractor.id] || 0}</div>
                  </div>
                  <div>
                    <div className="text-xs text-3">Contact</div>
                    <div className="font-medium contractor-meta-value contractor-meta-contact">{contractor.email || contractor.phone || 'Not added'}</div>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedContractor && (
        <ContractorDetailModal
          contractor={selectedContractor}
          activeCount={activeCountByContractor[selectedContractor.id] || 0}
          onClose={() => setSelectedContractor(null)}
        />
      )}
    </div>
  );
}
