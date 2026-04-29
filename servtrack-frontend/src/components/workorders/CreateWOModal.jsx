import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { CATEGORIES } from '../../data/mockData';

export default function CreateWOModal({ onClose }) {
  const { createWorkOrder, contractors, showToast } = useApp();

  const [form, setForm] = useState({
    title: '',
    category: 'Electrical',
    area: '',
    priority: 'Med',
    due: '',
    contractorId: contractors[0]?.id || '',
    description: '',
    slaHours: 24,
  });
  const [submitting, setSubmitting] = useState(false);

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  const selectedContractor = contractors.find(contractor => Number(contractor.id) === Number(form.contractorId));

  async function handleSubmit() {
    if (!form.title.trim()) return alert('Title is required');
    if (!form.area.trim())  return alert('Area is required');
    setSubmitting(true);
    try {
      const created = await createWorkOrder(form);
      showToast(`Work order ${created.ref_number} created successfully`, 'success');
      onClose();
    } catch (error) {
      showToast(error.message || 'Could not create work order', 'danger');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">

        <div className="modal-header">
          <span className="modal-title">New Work Order</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">

          <div className="form-group">
            <label className="form-label">Title *</label>
            <input
              className="form-input"
              placeholder="Describe the issue briefly"
              value={form.title}
              onChange={e => set('title', e.target.value)}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Category</label>
              <select className="form-input" value={form.category} onChange={e => set('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Priority</label>
              <select className="form-input" value={form.priority} onChange={e => set('priority', e.target.value)}>
                <option>High</option>
                <option>Med</option>
                <option>Low</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Area / Zone *</label>
            <input
              className="form-input"
              placeholder="e.g. Block B2 — Gate, Floor 3 — AHU Room"
              value={form.area}
              onChange={e => set('area', e.target.value)}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Assign Contractor</label>
              <select className="form-input" value={form.contractorId} onChange={e => set('contractorId', e.target.value)}>
                <option value="">Unassigned</option>
                {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {selectedContractor && !selectedContractor.has_login && (
                <div className="text-xs text-2" style={{ marginTop: 6 }}>
                  This contractor is linked but not activated yet. A contractor login is still needed before work can progress on their side.
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Due Date</label>
              <input
                className="form-input"
                type="date"
                value={form.due}
                onChange={e => set('due', e.target.value)}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">SLA Target (hours)</label>
              <select className="form-input" value={form.slaHours} onChange={e => set('slaHours', Number(e.target.value))}>
                <option value={2}>2 hours</option>
                <option value={4}>4 hours</option>
                <option value={6}>6 hours</option>
                <option value={8}>8 hours</option>
                <option value={12}>12 hours</option>
                <option value={24}>24 hours</option>
                <option value={48}>48 hours</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-input"
              placeholder="Full description of the issue, exact location, access requirements, any safety concerns..."
              value={form.description}
              onChange={e => set('description', e.target.value)}
            />
          </div>

        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Creating...' : 'Create Work Order'}
          </button>
        </div>

      </div>
    </div>
  );
}
