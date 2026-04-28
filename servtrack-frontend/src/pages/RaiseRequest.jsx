import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { CATEGORIES } from '../data/mockData';

const REQUEST_TEMPLATES = [
  {
    title: 'Electrical issue',
    values: {
      title: 'Lighting fault',
      category: 'Electrical',
      area: 'Common Area',
      priority: 'Med',
      description: 'Lights are not working consistently and need inspection.',
      slaHours: 24,
    },
  },
  {
    title: 'HVAC complaint',
    values: {
      title: 'AC not cooling',
      category: 'HVAC',
      area: 'Office / Cabin',
      priority: 'High',
      description: 'Cooling has dropped significantly and the room is getting warm.',
      slaHours: 12,
    },
  },
  {
    title: 'Water leakage',
    values: {
      title: 'Leakage near ceiling',
      category: 'Plumbing',
      area: 'Restroom / Corridor',
      priority: 'High',
      description: 'Water seepage is visible and needs urgent attention.',
      slaHours: 6,
    },
  },
];

export default function RaiseRequest() {
  const navigate = useNavigate();
  const { createWorkOrder, showToast, dataLoading } = useApp();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: '',
    category: 'Electrical',
    area: '',
    priority: 'Med',
    due: '',
    description: '',
    slaHours: 24,
  });

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.title.trim()) {
      showToast('Please add a short request title', 'danger');
      return;
    }
    if (!form.area.trim()) {
      showToast('Please add the location or area', 'danger');
      return;
    }
    if (!form.description.trim()) {
      showToast('Please describe the issue so the team can act quickly', 'danger');
      return;
    }

    setSubmitting(true);
    try {
      const created = await createWorkOrder(form);
      showToast(`Request ${created.ref_number} submitted successfully`, 'success');
      navigate('/work-orders');
    } catch (error) {
      showToast(error.message || 'Could not submit request', 'danger');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Raise a Request</div>
          <div className="page-sub">Submit a real maintenance request to the backend and track it live.</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <div className="enduser-template-row">
            {REQUEST_TEMPLATES.map(template => (
              <button
                key={template.title}
                className="enduser-template-btn"
                type="button"
                onClick={() => setForm(prev => ({ ...prev, ...template.values }))}
              >
                {template.title}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Request Title *</label>
              <input
                className="form-input"
                placeholder="Short summary of the issue"
                value={form.title}
                onChange={event => set('title', event.target.value)}
                disabled={submitting || dataLoading}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Category</label>
                <select
                  className="form-input"
                  value={form.category}
                  onChange={event => set('category', event.target.value)}
                  disabled={submitting || dataLoading}
                >
                  {CATEGORIES.map(category => <option key={category}>{category}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Priority</label>
                <select
                  className="form-input"
                  value={form.priority}
                  onChange={event => set('priority', event.target.value)}
                  disabled={submitting || dataLoading}
                >
                  <option value="High">High</option>
                  <option value="Med">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Area / Location *</label>
                <input
                  className="form-input"
                  placeholder="For example: Block B2 gate, Reception desk, Pantry"
                  value={form.area}
                  onChange={event => set('area', event.target.value)}
                  disabled={submitting || dataLoading}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Preferred Due Date</label>
                <input
                  className="form-input"
                  type="date"
                  value={form.due}
                  onChange={event => set('due', event.target.value)}
                  disabled={submitting || dataLoading}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">SLA Expectation</label>
                <select
                  className="form-input"
                  value={form.slaHours}
                  onChange={event => set('slaHours', Number(event.target.value))}
                  disabled={submitting || dataLoading}
                >
                  <option value={4}>Urgent - 4 hours</option>
                  <option value={6}>Critical - 6 hours</option>
                  <option value={12}>High - 12 hours</option>
                  <option value={24}>Standard - 24 hours</option>
                  <option value={48}>Low - 48 hours</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Description *</label>
              <textarea
                className="form-input"
                placeholder="Explain the issue, what you observed, when it started, and anything that may help the maintenance team."
                value={form.description}
                onChange={event => set('description', event.target.value)}
                disabled={submitting || dataLoading}
              />
            </div>

            <div className="enduser-request-footer">
              <div className="text-2 text-sm">Your request will appear immediately under My Requests after submission.</div>
              <button className="btn btn-primary" type="submit" disabled={submitting || dataLoading}>
                {submitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
