import React, { useState, useEffect} from 'react';
import { useApp } from '../../context/AppContext';
import { CATEGORIES } from '../../data/mockData';

const PRIORITY_DUE_HOURS = { High: 15 * 24, Med: 72, Low: 48 };

function computeDueDate(priority) {
  const hours = PRIORITY_DUE_HOURS[priority];
  if (!hours) return '';
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d.toISOString().slice(0, 10);
}

export default function CreateWOModal({ onClose }) {
  const { createWorkOrder, contractors, showToast } = useApp();

  const [form, setForm] = useState({
    title: '',
    category: 'Electrical',
    area: '',
    priority: 'Med',
    due: computeDueDate('Med'),
    contractorId: contractors[0]?.id || '',
    description: ''
  });
  const [submitting, setSubmitting] = useState(false);

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  useEffect(() => {
    if (form.priority !== 'Major') {
      set('due', computeDueDate(form.priority));
    }
  }, [form.priority]);

  const selectedContractor = contractors.find(contractor => Number(contractor.id) === Number(form.contractorId));

  async function handleSubmit() {
    if (!form.title.trim()) return showToast('Title is required', 'danger');
    if (!form.area.trim()) return showToast('Area is required', 'danger');
    if (form.priority === 'Major' && !form.due) return showToast('Please set a due date for Major priority', 'danger');
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        slaHours: 24,
      };
      const created = await createWorkOrder(payload);
      showToast(`Service request ${created.ref_number} created successfully`, 'success');
      onClose();
    } catch (error) {
      showToast(error.message || 'Could not create service request', 'danger');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">

        <div className="modal-header">
          <span className="modal-title">New Service Request</span>
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
                <option value="High">High — due in 15 days</option>
                <option value="Med">Medium — due in 72 hrs</option>
                <option value="Low">Low — due in 48 hrs</option>
                <option value="Major">Major — set date manually</option>
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
                   This contractor is linked but not activated yet.  
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">
                Due Date{form.priority !== 'Major' ? ' (auto-set from priority)' : ' *'}
              </label>
              <input
                className="form-input"
                type="date"
                value={form.due}
                onChange={e => set('due', e.target.value)}
                disabled={form.priority !== 'Major'}
              />
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
            {submitting ? 'Creating...' : 'Create Service Request'}
          </button>
        </div>

      </div>
    </div>
  );
}
