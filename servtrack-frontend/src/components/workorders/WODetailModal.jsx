import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { CATEGORIES, STATUS_FLOW, STATUS_CONFIG } from '../../data/mockData';
import StatusBadge from './StatusBadge';
import './WODetailModal.css';

const PRIORITIES = ['High', 'Med', 'Low', 'Major'];

const PRIORITY_DUE_HOURS = { High: 15 * 24, Med: 72, Low: 48 };

function autoDueDateFromPriority(priority) {
  const hours = PRIORITY_DUE_HOURS[priority];
  if (!hours) return '';
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d.toISOString().slice(0, 10);
}

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

  const supervisorCanReassign = role === 'supervisor' && ['assigned', 'inprogress'].includes(liveWO.status);
  const allowedByRole = {
    client: ['priority', 'dueDate', 'contractorId'],
    contractor: ['dueDate', 'supervisorId', 'workmanId'],
    supervisor: supervisorCanReassign ? ['dueDate', 'workmanId'] : [],
  };

  const allowed = allowedByRole[role] || [];

  if (allowed.includes('title') && form.title !== liveWO.title) patch.title = form.title;
  if (allowed.includes('description') && form.description !== liveWO.description) patch.description = form.description;
  if (allowed.includes('category') && form.category !== liveWO.category) patch.category = form.category;
  if (allowed.includes('area') && form.area !== liveWO.area) patch.area = form.area;
  if (allowed.includes('priority') && form.priority !== liveWO.priority) patch.priority = form.priority;
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
    completeWorkOrder,
    showToast,
  } = useApp();

  const [rejectNote, setRejectNote] = useState('');
  const [additionalDetails, setAdditionalDetails] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [showDetailsInput, setShowDetailsInput] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);

  const [workmanNote, setWorkmanNote] = useState('');
  const [completionPhotos, setCompletionPhotos] = useState([]);
  const photoInputRef = useRef(null);

  const liveWO = useMemo(
    () => (wo ? workOrders.find(item => item.id === wo.id) || wo : null),
    [wo, workOrders]
  );

  const currentIdx = STATUS_FLOW.indexOf(liveWO?.status);

  const selectedContractorId = useMemo(() => {
    if (role === 'contractor' || role === 'supervisor') return currentUser?.contractor_id || liveWO?.contractorId || null;
    return form?.contractorId ? Number(form.contractorId) : liveWO?.contractorId || null;
  }, [currentUser?.contractor_id, form?.contractorId, liveWO?.contractorId, role]);
  const selectedContractor = contractors.find(contractor => Number(contractor.id) === Number(selectedContractorId));

  const supervisorQueryKey = selectedContractorId ? `role=supervisor&contractor_id=${selectedContractorId}` : 'role=supervisor';
  const workmanQueryKey = selectedContractorId ? `role=workman&contractor_id=${selectedContractorId}` : 'role=workman';
  const supervisors = usersByQuery[supervisorQueryKey] || [];
  const workmen = usersByQuery[workmanQueryKey] || [];

  const supervisorCanReassign = role === 'supervisor' && ['assigned', 'inprogress'].includes(liveWO.status);
  const canEdit = (
    (role === 'client' && liveWO.status === 'open') ||
    (role === 'contractor' && ['open', 'assigned'].includes(liveWO.status)) ||
    supervisorCanReassign
  );
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
    setForm(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'priority' && role === 'client' && value !== 'Major') {
        next.dueDate = autoDueDateFromPriority(value);
      }
      return next;
    });
  }

  const patch = normalizePatch(form, liveWO, role);
  const hasUnsavedChanges = Object.keys(patch).length > 0;

  async function persistEdits({ quiet = false } = {}) {
    if (!hasUnsavedChanges) return liveWO;
    setSaving(true);
    try {
      const updated = await updateWorkOrder(liveWO.id, patch);
      if (!quiet) showToast('Service request details updated', 'success');
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
      setShowDetailsInput(false);
      setAdditionalDetails('');
    } catch (error) {
      showToast(error.message || 'Could not add details', 'danger');
    } finally {
      setSaving(false);
    }
  }

  async function handleCompleteWork() {
    if (completionPhotos.length === 0) {
      showToast('Please upload at least one completion photo before marking as done', 'danger');
      return;
    }
    setSaving(true);
    try {
      const note = workmanNote.trim() || 'Work completed by workman';
      await completeWorkOrder(liveWO.id, completionPhotos, note);
      showToast('Work completed — photos uploaded, pending QC', 'success');
      onClose();
    } catch (error) {
      showToast(error.message || 'Could not complete work', 'danger');
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
      if (liveWO.status === 'pending' && liveWO.raisedByUser?.role === 'enduser') {
        return (
          <div className="alert alert-info" style={{ display: 'block', margin: 0 }}>
            Waiting for the end user to approve the completed work.
          </div>
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

    if (role === 'contractor' && ['open', 'assigned'].includes(liveWO.status)) {
      return (
        <button
          className="btn btn-primary"
          disabled={saving || !form.supervisorId || !form.workmanId}
          onClick={async () => {
            setSaving(true);
            try {
              await persistEdits({ quiet: true });
              showToast('Team assigned. Waiting for the workman to start work', 'success');
              onClose();
            } catch (error) {
              showToast(error.message || 'Could not assign team', 'danger');
            } finally {
              setSaving(false);
            }
          }}
        >
          Save Team Assignment
        </button>
      );
    }

    if (role === 'supervisor') {
      if (liveWO.status === 'assigned') {
        return (
          <button
            className="btn btn-primary"
            disabled={saving || !form.workmanId}
            onClick={async () => {
              setSaving(true);
              try {
                await persistEdits({ quiet: true });
                showToast('Workman assigned. Waiting for work to start', 'success');
                onClose();
              } catch (error) {
                showToast(error.message || 'Could not assign workman', 'danger');
              } finally {
                setSaving(false);
              }
            }}
          >
            Save Workman Assignment
          </button>
        );
      }
      if (liveWO.status === 'inprogress') {
        return null;
      }
      if (liveWO.status === 'qc') {
        return showRejectInput ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1 }}>
            <input
              className="form-input"
              style={{ flex: 1, padding: '5px 10px', fontSize: 12 }}
              placeholder="Reason for QC rejection..."
              value={rejectNote}
              onChange={event => setRejectNote(event.target.value)}
            />
            <button
              className="btn btn-danger btn-sm"
              disabled={saving || !rejectNote.trim()}
              onClick={() => runTransition('inprogress', 'QC rejected and sent back for rework', rejectNote)}
            >
              Confirm Reject
            </button>
            <button className="btn btn-sm" onClick={() => setShowRejectInput(false)}>Cancel</button>
          </div>
        ) : (
          <>
            <button className="btn btn-primary" disabled={saving} onClick={() => runTransition('pending', 'Submitted for final approval', 'All checks passed')}>
              Pass QC
            </button>
            <button className="btn btn-danger" disabled={saving} onClick={() => setShowRejectInput(true)}>
              Reject QC
            </button>
          </>
        );
      }
    }

    if (role === 'workman' && liveWO.status === 'assigned') {
      return (
        <button
          className="btn btn-primary"
          disabled={saving}
          onClick={() => runTransition('inprogress', 'Work started')}
        >
          {saving ? 'Starting...' : 'Start Work'}
        </button>
      );
    }

    if (role === 'workman' && liveWO.status === 'inprogress') {
      return (
        <button
          className="btn btn-success"
          disabled={saving || completionPhotos.length === 0}
          onClick={handleCompleteWork}
          title={completionPhotos.length === 0 ? 'Upload at least 1 completion photo first' : ''}
        >
          {saving ? 'Submitting...' : `Complete Work${completionPhotos.length > 0 ? ` (${completionPhotos.length} photo${completionPhotos.length !== 1 ? 's' : ''})` : ''}`}
        </button>
      );
    }

    if (role === 'enduser' && liveWO.status === 'pending') {
      return showRejectInput ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1 }}>
          <input
            className="form-input"
            style={{ flex: 1, padding: '5px 10px', fontSize: 12 }}
            placeholder="Reason for rework..."
            value={rejectNote}
            onChange={event => setRejectNote(event.target.value)}
          />
          <button
            className="btn btn-danger btn-sm"
            disabled={saving || !rejectNote.trim()}
            onClick={() => runTransition('inprogress', 'Sent back for rework', rejectNote)}
          >
            Request Rework
          </button>
          <button className="btn btn-sm" onClick={() => setShowRejectInput(false)}>Cancel</button>
        </div>
      ) : (
        <>
          <button className="btn btn-success" disabled={saving} onClick={() => runTransition('closed', 'Request approved and closed')}>
            Approve &amp; Close
          </button>
          <button className="btn btn-danger" disabled={saving} onClick={() => setShowRejectInput(true)}>
            Request Rework
          </button>
        </>
      );
    }

    if (role === 'enduser' && liveWO.status !== 'closed') {
      return (
        <>
          {(liveWO.status === 'open' || liveWO.status === 'rejected') && (
            <button className="btn" disabled={saving} onClick={() => setShowDetailsInput(prev => !prev)}>
              {liveWO.status === 'rejected' ? 'Add Details & Re-open' : 'Update Description'}
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
              This request has been escalated and requires immediate attention.
            </div>
          )}

          {liveWO.status !== 'closed' && liveWO.status !== 'escalated' && liveWO.slaBreached && (
            <div className="alert alert-danger">
              This request is overdue — it has passed its due date.
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
              <div className="section-heading">
                {role === 'client' ? 'Prioritise & Assign' : role === 'contractor' ? 'Assign Team' : 'Assignments'}
              </div>
              <div style={{ display: 'grid', gap: 12, marginBottom: 18 }}>

                {role === 'client' && (
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Priority</label>
                      <select className="form-input" value={form.priority} onChange={event => set('priority', event.target.value)}>
                        {PRIORITIES.map(priority => <option key={priority}>{priority}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">
                        Due Date{form.priority !== 'Major' ? ' (auto)' : ' *'}
                      </label>
                      <input
                        className="form-input"
                        type="date"
                        value={form.dueDate}
                        onChange={event => set('dueDate', event.target.value)}
                        disabled={form.priority !== 'Major'}
                      />
                    </div>
                  </div>
                )}

                {role === 'client' && (
                  <div className="form-group">
                    <label className="form-label">Assign Contractor</label>
                    <select
                      className="form-input"
                      value={form.contractorId}
                      onChange={event => set('contractorId', event.target.value)}
                    >
                      <option value="">Select contractor</option>
                      {contractors.map(contractor => (
                        <option key={contractor.id} value={contractor.id}>{contractor.name}</option>
                      ))}
                    </select>
                    {selectedContractor && !selectedContractor.has_login && (
                      <div className="text-xs text-2" style={{ marginTop: 6 }}>
                        This contractor is linked but still pending activation.
                      </div>
                    )}
                  </div>
                )}

                {role === 'contractor' && selectedContractorId && (
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

                {(role === 'contractor' || role === 'supervisor') && (
                  <div className="form-group">
                    <label className="form-label">Due Date</label>
                    <input className="form-input" type="date" value={form.dueDate} onChange={event => set('dueDate', event.target.value)} />
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

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn" disabled={saving || !hasUnsavedChanges} onClick={() => persistEdits()}>
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </>
          )}

          {role === 'supervisor' && liveWO.status === 'qc' && (
            <div className="alert alert-info" style={{ display: 'block', marginBottom: 18 }}>
              Completion has been submitted by the workman. Review the completion photos and notes below, then pass QC or reject it for rework.
            </div>
          )}

          {role === 'workman' && liveWO.status === 'inprogress' && (
            <>
              <div className="section-heading">Complete Work</div>
              <div style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
                <div className="form-group">
                  <label className="form-label">Completion Notes <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(optional)</span></label>
                  <textarea
                    className="form-input"
                    placeholder="Describe what was done, materials used, any observations..."
                    value={workmanNote}
                    onChange={event => setWorkmanNote(event.target.value)}
                    rows={3}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Completion Photos <span style={{ color: 'var(--danger)', fontWeight: 500 }}>*</span>
                    <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 4 }}>(at least 1 required)</span>
                  </label>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    style={{ display: 'none' }}
                    onChange={event => {
                      const files = Array.from(event.target.files || []);
                      setCompletionPhotos(prev => [...prev, ...files].slice(0, 5));
                      event.target.value = '';
                    }}
                  />
                  <button
                    className="btn"
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    style={{ marginBottom: completionPhotos.length > 0 ? 10 : 0 }}
                  >
                    + Add Photos
                  </button>
                  {completionPhotos.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {completionPhotos.map((file, index) => (
                        <div key={index} style={{ position: 'relative', width: 70, height: 70 }}>
                          <img
                            src={URL.createObjectURL(file)}
                            alt={file.name}
                            style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }}
                          />
                          <button
                            onClick={() => setCompletionPhotos(prev => prev.filter((_, i) => i !== index))}
                            style={{
                              position: 'absolute', top: -6, right: -6, width: 20, height: 20,
                              borderRadius: '50%', background: 'var(--danger)', color: '#fff',
                              border: 'none', cursor: 'pointer', fontSize: 12, lineHeight: '20px', textAlign: 'center', padding: 0,
                            }}
                          >×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {completionPhotos.length === 0 && (
                    <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 6 }}>
                      You must upload at least one photo showing the completed work before submitting.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          <div className="section-heading">Due Date Status</div>
          <div style={{ marginBottom: 18 }}>
            {liveWO.dueDate ? (() => {
              const due = new Date(liveWO.dueDate);
              const now = new Date();
              const diffMs = due - now;
              const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
              const isOverdue = diffMs < 0 && liveWO.status !== 'closed';
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                  <span style={{ color: 'var(--text-2)' }}>
                    {due.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                  {liveWO.status !== 'closed' && (
                    <span style={{
                      fontWeight: 600,
                      color: isOverdue ? 'var(--danger)' : diffDays <= 2 ? 'var(--warning)' : 'var(--success)',
                      background: isOverdue ? 'var(--danger-bg)' : diffDays <= 2 ? '#fffbeb' : '#f0fdf4',
                      padding: '2px 10px',
                      borderRadius: 6,
                      fontSize: 12,
                      border: `1px solid ${isOverdue ? 'var(--danger-border)' : 'transparent'}`,
                    }}>
                      {isOverdue
                        ? `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''}`
                        : diffDays === 0 ? 'Due today'
                        : `${diffDays} day${diffDays !== 1 ? 's' : ''} remaining`}
                    </span>
                  )}
                  {liveWO.status === 'closed' && (
                    <span style={{ color: 'var(--success)', fontWeight: 600, fontSize: 12 }}>Closed</span>
                  )}
                </div>
              );
            })() : (
              <span style={{ color: 'var(--text-3)', fontSize: 13 }}>No due date set</span>
            )}
          </div>

          <div className="section-heading">Description</div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', padding: '10px 12px', background: 'var(--bg)', borderRadius: 'var(--radius)', marginBottom: 4, lineHeight: 1.6 }}>
            {liveWO.description}
          </div>

          {showDetailsInput && (
            <div className="alert alert-info" style={{ display: 'block' }}>
              <label className="form-label">
                {role === 'client' ? 'Add Engineer Note'
                  : role === 'supervisor' ? 'Add Supervisor Note'
                  : role === 'contractor' ? 'Add Contractor Note'
                  : 'Update Description / Add Details'}
              </label>
              <textarea
                className="form-input"
                value={additionalDetails}
                onChange={event => setAdditionalDetails(event.target.value)}
                placeholder={
                  role === 'client' ? 'Add a note or context — appended to description and logged in the activity trail...'
                  : role === 'supervisor' ? 'Add site observations, instructions, or progress notes...'
                  : role === 'contractor' ? 'Add operational notes, resource updates, or coordination details...'
                  : 'Update the issue description or add extra details to help the engineering team...'
                }
              />
              {role === 'enduser' && (
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                  Your original description is preserved. New content will be appended.
                  {liveWO.status === 'rejected' && ' Submitting will re-open the request for review.'}
                </div>
              )}
              {(role === 'client' || role === 'supervisor' || role === 'contractor') && (
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                  The end user's original description is preserved. Your note will be appended and logged in the activity trail.
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <button className="btn btn-sm" onClick={() => { setShowDetailsInput(false); setAdditionalDetails(''); }}>Cancel</button>
                <button className="btn btn-primary btn-sm" disabled={saving} onClick={handleAddDetails}>
                  Submit Note
                </button>
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
          {['client', 'supervisor', 'contractor'].includes(role) && liveWO.status !== 'closed' && (
            <button className="btn" disabled={saving} onClick={() => setShowDetailsInput(prev => !prev)}>
              {showDetailsInput ? 'Hide Note' : 'Add Note'}
            </button>
          )}
          {renderActions()}
        </div>
      </div>
    </div>
  );
}
