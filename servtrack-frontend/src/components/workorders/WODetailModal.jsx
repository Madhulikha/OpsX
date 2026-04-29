import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { CATEGORIES, STATUS_FLOW, STATUS_CONFIG } from '../../data/mockData';
import StatusBadge from './StatusBadge';
import './WODetailModal.css';

const PRIORITIES = ['High', 'Med', 'Low'];

function dateInputValue(value) {
  if (!value || value === '—') return '';
  return new Date(value).toISOString().slice(0, 10);
}

function normalizePatch(form, liveWO, role) {
  const patch = {};

  const contractorId = form.contractorId ? Number(form.contractorId) : null;
  const supervisorId = form.supervisorId ? Number(form.supervisorId) : null;
  const workmanId = form.workmanId ? Number(form.workmanId) : null;
  const dueDate = form.dueDate ? `${form.dueDate}T00:00:00Z` : null;

  const allowedByRole = {
    client: ['title', 'description', 'category', 'area', 'priority', 'slaHours', 'dueDate', 'contractorId', 'supervisorId', 'workmanId'],
    contractor: ['title', 'description', 'category', 'area', 'priority', 'dueDate', 'supervisorId', 'workmanId'],
    supervisor: ['dueDate', 'workmanId'],
  };

  const allowed = allowedByRole[role] || [];

  if (allowed.includes('title') && form.title !== liveWO.title) patch.title = form.title;
  if (allowed.includes('description') && form.description !== liveWO.description) patch.description = form.description;
  if (allowed.includes('category') && form.category !== liveWO.category) patch.category = form.category;
  if (allowed.includes('area') && form.area !== liveWO.area) patch.area = form.area;
  if (allowed.includes('priority') && form.priority !== liveWO.priority) patch.priority = form.priority;
  if (allowed.includes('slaHours') && Number(form.slaHours) !== liveWO.slaHours) patch.sla_hours = Number(form.slaHours);
  if (allowed.includes('dueDate') && dueDate !== (liveWO.dueDate || null)) patch.due_date = dueDate;
  if (allowed.includes('contractorId') && contractorId !== (liveWO.contractorId || null)) patch.contractor_id = contractorId;
  if (allowed.includes('supervisorId') && supervisorId !== (liveWO.supervisorId || null)) patch.supervisor_id = supervisorId;
  if (allowed.includes('workmanId') && workmanId !== (liveWO.workmanId || null)) patch.workman_id = workmanId;

  return patch;
}

export default function WODetailModal({ wo, onClose }) {
  const {
    apiBaseUrl,
    role,
    currentUser,
    workOrders,
    contractors,
    usersByQuery,
    loadUsers,
    loadWorkOrderDetail,
    updateWorkOrder,
    updateWOStatus,
    escalateRequest,
    addRequestDetails,
    showToast,
  } = useApp();

  const [rejectNote, setRejectNote] = useState('');
  const [additionalDetails, setAdditionalDetails] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [showDetailsInput, setShowDetailsInput] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);

  const liveWO = useMemo(
    () => (wo ? workOrders.find(item => item.id === wo.id) || wo : null),
    [wo, workOrders]
  );

  const currentIdx = STATUS_FLOW.indexOf(liveWO?.status);
  const slaPct = liveWO ? Math.min(Math.round((liveWO.elapsedHours / liveWO.slaHours) * 100), 100) : 0;
  const slaColor = slaPct >= 100 ? 'var(--danger)' : slaPct >= 80 ? 'var(--warning)' : 'var(--success)';

  const selectedContractorId = useMemo(() => {
    if (role === 'contractor' || role === 'supervisor') return currentUser?.contractor_id || liveWO?.contractorId || null;
    return form?.contractorId ? Number(form.contractorId) : liveWO?.contractorId || null;
  }, [currentUser?.contractor_id, form?.contractorId, liveWO?.contractorId, role]);
  const selectedContractor = contractors.find(contractor => Number(contractor.id) === Number(selectedContractorId));

  const supervisorQueryKey = selectedContractorId ? `role=supervisor&contractor_id=${selectedContractorId}` : 'role=supervisor';
  const workmanQueryKey = selectedContractorId ? `role=workman&contractor_id=${selectedContractorId}` : 'role=workman';
  const supervisors = usersByQuery[supervisorQueryKey] || [];
  const workmen = usersByQuery[workmanQueryKey] || [];

  const canEdit = ['client', 'contractor', 'supervisor'].includes(role);
  const backendOrigin = apiBaseUrl.replace(/\/api\/v1\/?$/, '');

  useEffect(() => {
    if (liveWO && !liveWO.isDetailLoaded) {
      loadWorkOrderDetail(liveWO.id).catch(() => {});
    }
  }, [liveWO, loadWorkOrderDetail]);

  useEffect(() => {
    if (!liveWO) return;
    setForm({
      title: liveWO.title,
      description: liveWO.description,
      category: liveWO.category,
      subCategory: liveWO.subCategory || '',
      area: liveWO.area,
      preferredVisitTime: liveWO.preferredVisitTime || '',
      priority: liveWO.priority,
      slaHours: liveWO.slaHours,
      dueDate: dateInputValue(liveWO.dueDate),
      contractorId: liveWO.contractorId || '',
      supervisorId: liveWO.supervisorId || '',
      workmanId: liveWO.workmanId || '',
    });
  }, [liveWO]);

  useEffect(() => {
    if (!selectedContractorId || !canEdit) return;
    loadUsers({ role: 'supervisor', contractorId: selectedContractorId }).catch(() => {});
    loadUsers({ role: 'workman', contractorId: selectedContractorId }).catch(() => {});
  }, [canEdit, loadUsers, selectedContractorId]);

  if (!liveWO || !form) return null;

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  const patch = normalizePatch(form, liveWO, role);
  const hasUnsavedChanges = Object.keys(patch).length > 0;

  async function persistEdits({ quiet = false } = {}) {
    if (!hasUnsavedChanges) return liveWO;
    setSaving(true);
    try {
      const updated = await updateWorkOrder(liveWO.id, patch);
      if (!quiet) showToast('Work order details updated', 'success');
      return updated;
    } catch (error) {
      showToast(error.message || 'Could not update work order', 'danger');
      throw error;
    } finally {
      setSaving(false);
    }
  }

  async function runTransition(nextStatus, successMessage, note = '') {
    setSaving(true);
    try {
      await persistEdits({ quiet: true });
      await updateWOStatus(liveWO.id, nextStatus, note);
      showToast(successMessage, nextStatus === 'closed' ? 'success' : 'default');
      onClose();
    } catch (error) {
      showToast(error.message || 'Action failed', 'danger');
    } finally {
      setSaving(false);
    }
  }

  async function handleEscalate() {
    setSaving(true);
    try {
      await escalateRequest(liveWO.id);
      showToast('Request escalated to the engineering team', 'success');
      onClose();
    } catch (error) {
      showToast(error.message || 'Could not escalate request', 'danger');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddDetails() {
    if (!additionalDetails.trim()) {
      showToast('Add the extra details first', 'danger');
      return;
    }
    setSaving(true);
    try {
      await addRequestDetails(liveWO.id, additionalDetails.trim());
      showToast('Additional details added', 'success');
      onClose();
    } catch (error) {
      showToast(error.message || 'Could not add details', 'danger');
    } finally {
      setSaving(false);
    }
  }

  function renderActions() {
    if (liveWO.status === 'closed') return null;

    if (role === 'client') {
      if (liveWO.status === 'open') {
        return showRejectInput ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1 }}>
            <input
              className="form-input"
              style={{ flex: 1, padding: '5px 10px', fontSize: 12 }}
              placeholder="Reason for rejection..."
              value={rejectNote}
              onChange={event => setRejectNote(event.target.value)}
            />
            <button
              className="btn btn-danger btn-sm"
              disabled={saving || !rejectNote.trim()}
              onClick={() => runTransition('rejected', 'Request rejected', rejectNote)}
            >
              Confirm Reject
            </button>
            <button className="btn btn-sm" onClick={() => setShowRejectInput(false)}>Cancel</button>
          </div>
        ) : (
          <>
            <button
              className="btn btn-primary"
              disabled={saving || !selectedContractorId}
              onClick={() => runTransition('assigned', 'Request approved and contractor notified')}
            >
              Approve &amp; Assign
            </button>
            <button className="btn btn-danger" disabled={saving} onClick={() => setShowRejectInput(true)}>
              Reject
            </button>
          </>
        );
      }
      if (liveWO.status === 'escalated') {
        return (
          <button className="btn btn-primary" disabled={saving} onClick={() => runTransition('inprogress', 'Escalation acknowledged')}>
            Acknowledge Escalation
          </button>
        );
      }
      if (liveWO.status === 'pending') {
        return showRejectInput ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1 }}>
            <input
              className="form-input"
              style={{ flex: 1, padding: '5px 10px', fontSize: 12 }}
              placeholder="Reason for rejection..."
              value={rejectNote}
              onChange={event => setRejectNote(event.target.value)}
            />
            <button
              className="btn btn-danger btn-sm"
              disabled={saving}
              onClick={() => runTransition('inprogress', 'Work order rejected for rework', rejectNote || 'Sent back for rework')}
            >
              Confirm Reject
            </button>
            <button className="btn btn-sm" onClick={() => setShowRejectInput(false)}>Cancel</button>
          </div>
        ) : (
          <>
            <button className="btn btn-success" disabled={saving} onClick={() => runTransition('closed', 'Work order approved and closed')}>
              Approve &amp; Close
            </button>
            <button className="btn btn-danger" disabled={saving} onClick={() => setShowRejectInput(true)}>
              Reject
            </button>
          </>
        );
      }
    }

    if (role === 'contractor' && liveWO.status === 'assigned') {
      return (
        <button
          className="btn btn-primary"
          disabled={saving || !form.supervisorId}
          onClick={() => runTransition('inprogress', 'Contractor assigned team and started work')}
        >
          Assign Team &amp; Start Work
        </button>
      );
    }

    if (role === 'supervisor') {
      if (liveWO.status === 'assigned') {
        return (
          <button className="btn btn-primary" disabled={saving} onClick={() => runTransition('inprogress', 'Supervisor started work')}>
            Start Work
          </button>
        );
      }
      if (liveWO.status === 'inprogress') {
        return (
          <button className="btn btn-primary" disabled={saving} onClick={() => runTransition('qc', 'Submitted for QC review')}>
            Submit for QC
          </button>
        );
      }
      if (liveWO.status === 'qc') {
        return (
          <button className="btn btn-primary" disabled={saving} onClick={() => runTransition('pending', 'Submitted for client approval', 'All checks passed')}>
            Pass QC
          </button>
        );
      }
    }

    if (role === 'workman' && liveWO.status === 'inprogress') {
      return (
        <button className="btn btn-primary" disabled={saving} onClick={() => runTransition('qc', 'Work marked complete — pending QC')}>
          Mark as Done
        </button>
      );
    }

    if (role === 'enduser' && liveWO.status !== 'closed') {
      return (
        <>
          {(liveWO.status === 'rejected' || (liveWO.status === 'open' && liveWO.priority === 'Low')) && (
            <button className="btn" disabled={saving} onClick={() => setShowDetailsInput(true)}>
              Add Details
            </button>
          )}
          <button className="btn btn-danger" disabled={saving} onClick={handleEscalate}>
            Escalate
          </button>
        </>
      );
    }

    return null;
  }

  return (
    <div className="modal-overlay" onClick={event => event.target === event.currentTarget && onClose()}>
      <div className="modal wo-modal">
        <div className="modal-header">
          <div>
            <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>{liveWO.refNumber}</span>
            <div className="modal-title">{liveWO.title}</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {liveWO.status === 'escalated' && (
            <div className="alert alert-danger">
              This work order breached its {liveWO.slaHours}h SLA and has been auto-escalated.
            </div>
          )}

          {liveWO.status !== 'closed' && liveWO.status !== 'escalated' && slaPct >= 80 && (
            <div className="alert alert-warning">
              {slaPct}% of the {liveWO.slaHours}h SLA has elapsed. Act promptly.
            </div>
          )}

          <div className="status-flow">
            {STATUS_FLOW.map((status, index) => {
              let cls = '';
              if (liveWO.status === 'escalated') cls = index === 0 ? 'done' : '';
              else if (index < currentIdx) cls = 'done';
              else if (index === currentIdx) cls = 'current';
              return (
                <React.Fragment key={status}>
                  <span className={`sf-step ${cls}`}>{STATUS_CONFIG[status].label}</span>
                  {index < STATUS_FLOW.length - 1 && <span className="sf-arrow">›</span>}
                </React.Fragment>
              );
            })}
            {liveWO.status === 'escalated' && (
              <>
                <span className="sf-arrow">›</span>
                <span className="sf-step current" style={{ background: 'var(--danger-bg)', color: 'var(--danger)', borderColor: 'var(--danger-border)' }}>
                  Escalated
                </span>
              </>
            )}
          </div>

          <div className="detail-grid">
            <div className="detail-item"><div className="dl">Status</div><div className="dv"><StatusBadge status={liveWO.status} /></div></div>
            <div className="detail-item"><div className="dl">Priority</div><div className="dv" style={{ color: liveWO.priority === 'High' ? 'var(--danger)' : liveWO.priority === 'Med' ? 'var(--warning)' : 'var(--text-2)', fontWeight: 600 }}>{liveWO.priority}</div></div>
            <div className="detail-item"><div className="dl">Contractor</div><div className="dv">{liveWO.contractor}</div></div>
            <div className="detail-item"><div className="dl">Supervisor</div><div className="dv">{liveWO.supervisor}</div></div>
            <div className="detail-item"><div className="dl">Workman</div><div className="dv">{liveWO.workman}</div></div>
            <div className="detail-item"><div className="dl">Area / Zone</div><div className="dv">{liveWO.area}</div></div>
            <div className="detail-item"><div className="dl">Category</div><div className="dv">{liveWO.category}</div></div>
            <div className="detail-item"><div className="dl">Sub Category</div><div className="dv">{liveWO.subCategory || '—'}</div></div>
            <div className="detail-item"><div className="dl">Preferred Time</div><div className="dv">{liveWO.preferredVisitTime || '—'}</div></div>
            <div className="detail-item"><div className="dl">Raised By</div><div className="dv">{liveWO.raisedBy}</div></div>
            <div className="detail-item"><div className="dl">Raised On</div><div className="dv">{liveWO.raisedOn}</div></div>
            <div className="detail-item"><div className="dl">Due Date</div><div className="dv">{liveWO.due}</div></div>
          </div>

          {canEdit && (
            <>
              <div className="section-heading">Assignments & Details</div>
              <div style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
                {(role === 'client' || role === 'contractor') && (
                  <div className="form-group">
                    <label className="form-label">Title</label>
                    <input className="form-input" value={form.title} onChange={event => set('title', event.target.value)} />
                  </div>
                )}

                {(role === 'client' || role === 'contractor') && (
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Category</label>
                      <select className="form-input" value={form.category} onChange={event => set('category', event.target.value)}>
                        {CATEGORIES.map(category => <option key={category}>{category}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Priority</label>
                      <select className="form-input" value={form.priority} onChange={event => set('priority', event.target.value)}>
                        {PRIORITIES.map(priority => <option key={priority}>{priority}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {(role === 'client' || role === 'contractor') && (
                  <div className="form-group">
                    <label className="form-label">Area</label>
                    <input className="form-input" value={form.area} onChange={event => set('area', event.target.value)} />
                  </div>
                )}

                <div className="form-row">
                  {(role === 'client' || role === 'contractor' || role === 'supervisor') && (
                    <div className="form-group">
                      <label className="form-label">Due Date</label>
                      <input className="form-input" type="date" value={form.dueDate} onChange={event => set('dueDate', event.target.value)} />
                    </div>
                  )}

                  {role === 'client' && (
                    <div className="form-group">
                      <label className="form-label">SLA Target (hours)</label>
                      <input className="form-input" type="number" min="1" value={form.slaHours} onChange={event => set('slaHours', event.target.value)} />
                    </div>
                  )}
                </div>

                {role === 'client' && (
                  <div className="form-group">
                    <label className="form-label">Contractor</label>
                    <select
                      className="form-input"
                      value={form.contractorId}
                      onChange={event => {
                        set('contractorId', event.target.value);
                        set('supervisorId', '');
                        set('workmanId', '');
                      }}
                    >
                      <option value="">Select contractor</option>
                      {contractors.map(contractor => (
                        <option key={contractor.id} value={contractor.id}>{contractor.name}</option>
                      ))}
                    </select>
                    {selectedContractor && !selectedContractor.has_login && (
                      <div className="text-xs text-2" style={{ marginTop: 6 }}>
                        This contractor is linked but still pending activation. A contractor-side login is needed before they can start working here.
                      </div>
                    )}
                  </div>
                )}

                {(role === 'client' || role === 'contractor') && selectedContractorId && (
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Supervisor</label>
                      <select className="form-input" value={form.supervisorId} onChange={event => set('supervisorId', event.target.value)}>
                        <option value="">Unassigned</option>
                        {supervisors.map(user => (
                          <option key={user.id} value={user.id}>{user.full_name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Workman</label>
                      <select className="form-input" value={form.workmanId} onChange={event => set('workmanId', event.target.value)}>
                        <option value="">Unassigned</option>
                        {workmen.map(user => (
                          <option key={user.id} value={user.id}>{user.full_name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {role === 'supervisor' && (
                  <div className="form-group">
                    <label className="form-label">Workman</label>
                    <select className="form-input" value={form.workmanId} onChange={event => set('workmanId', event.target.value)}>
                      <option value="">Unassigned</option>
                      {workmen.map(user => (
                        <option key={user.id} value={user.id}>{user.full_name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {(role === 'client' || role === 'contractor') && (
                  <div className="form-group">
                    <label className="form-label">Description</label>
                    <textarea className="form-input" value={form.description} onChange={event => set('description', event.target.value)} />
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn" disabled={saving || !hasUnsavedChanges} onClick={() => persistEdits()}>
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="section-heading">SLA Progress</div>
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 12 }}>
              <span style={{ color: 'var(--text-2)' }}>Elapsed: <strong>{liveWO.elapsedHours}h</strong> of {liveWO.slaHours}h</span>
              <span style={{ color: slaColor, fontWeight: 600 }}>{slaPct}%{slaPct >= 100 ? ' — BREACHED' : ''}</span>
            </div>
            <div className="sla-bar-wrap">
              <div className="sla-bar" style={{ width: `${slaPct}%`, background: slaColor }} />
            </div>
          </div>

          <div className="section-heading">Description</div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', padding: '10px 12px', background: 'var(--bg)', borderRadius: 'var(--radius)', marginBottom: 4, lineHeight: 1.6 }}>
            {liveWO.description}
          </div>

          {showDetailsInput && (
            <div className="alert alert-info" style={{ display: 'block' }}>
              <label className="form-label">Additional Details</label>
              <textarea
                className="form-input"
                value={additionalDetails}
                onChange={event => setAdditionalDetails(event.target.value)}
                placeholder="Add extra context requested by the engineer..."
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <button className="btn btn-sm" onClick={() => setShowDetailsInput(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm" disabled={saving} onClick={handleAddDetails}>Submit Details</button>
              </div>
            </div>
          )}

          {liveWO.attachments?.length > 0 && (
            <>
              <div className="section-heading">Photos</div>
              <div className="wo-photo-grid">
                {liveWO.attachments.map(attachment => (
                  <a
                    key={attachment.id}
                    href={`${backendOrigin}${attachment.file_url}`}
                    target="_blank"
                    rel="noreferrer"
                    className="wo-photo-link"
                  >
                    <img src={`${backendOrigin}${attachment.file_url}`} alt={attachment.original_filename} />
                  </a>
                ))}
              </div>
            </>
          )}

          <div className="section-heading">Activity Log</div>
          <div className="timeline">
            {!liveWO.isDetailLoaded ? (
              <div style={{ color: 'var(--text-2)', fontSize: 12 }}>Loading activity...</div>
            ) : liveWO.activity.map((entry, index) => (
              <div className="timeline-item" key={entry.id}>
                <div className="tl-dot-wrap">
                  <div className={`tl-dot ${entry.type || 'default'}`} />
                  {index < liveWO.activity.length - 1 && <div className="tl-line" />}
                </div>
                <div className="tl-content">
                  <div className="tl-action">{entry.action}</div>
                  <div className="tl-meta">{entry.time} · {entry.by}</div>
                  {entry.note && <div className="tl-note">"{entry.note}"</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Close</button>
          {renderActions()}
        </div>
      </div>
    </div>
  );
}
