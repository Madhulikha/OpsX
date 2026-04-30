import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { CATEGORIES, REQUEST_AREAS, REQUEST_CATEGORY_OPTIONS } from '../data/mockData';

const PREFERRED_TIME_SLOTS = [
  'Morning  8:00 AM – 10:00 AM',
  'Morning 10:00 AM – 12:00 PM',
  'Afternoon 12:00 PM – 2:00 PM',
  'Afternoon  2:00 PM – 4:00 PM',
  'Evening   4:00 PM – 6:00 PM',
  'Anytime during the day',
];

export default function RaiseRequest() {
  const navigate = useNavigate();
  const { createWorkOrder, showToast, dataLoading } = useApp();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    title: '',
    category: 'Electrical',
    subCategory: REQUEST_CATEGORY_OPTIONS.Electrical[0],
    area: '',
    priority: 'Med',
    preferredVisitTime: '',
    description: '',
    photos: [],
  });

  function set(field, value) {
    setForm(prev => ({
      ...prev,
      [field]: value,
      ...(field === 'category' ? { subCategory: REQUEST_CATEGORY_OPTIONS[value]?.[0] || '' } : {}),
    }));
  }

  function fieldError(field) {
    if (!submitted) return null;
    const v = form[field];
    if (field === 'photos') return form.photos.length === 0 ? 'Please upload at least one photo of the issue' : null;
    if (!v || (typeof v === 'string' && !v.trim())) {
      const labels = {
        title: 'Please add a short request title',
        area: 'Please select the area / location',
        subCategory: 'Please choose a sub category',
        preferredVisitTime: 'Please select a preferred visit time',
        description: 'Please describe the issue',
      };
      return labels[field] || 'This field is required';
    }
    return null;
  }

  function handlePhotoChange(event) {
    const selected = Array.from(event.target.files || []);
    const next = [...form.photos, ...selected].slice(0, 5);
    const invalid = next.find(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type));
    const oversized = next.find(file => file.size > 5 * 1024 * 1024);

    if (selected.length + form.photos.length > 5) {
      showToast('Upload up to 5 photos per request', 'danger');
    }
    if (invalid) {
      showToast('Only JPG, PNG, or WebP photos are allowed', 'danger');
      event.target.value = '';
      return;
    }
    if (oversized) {
      showToast('Each photo must be 5 MB or smaller', 'danger');
      event.target.value = '';
      return;
    }

    set('photos', next);
    event.target.value = '';
  }

  function removePhoto(index) {
    set('photos', form.photos.filter((_, photoIndex) => photoIndex !== index));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitted(true);

    if (!form.title.trim()) return;
    if (!form.area.trim()) return;
    if (!form.subCategory.trim()) return;
    if (!form.preferredVisitTime.trim()) return;
    if (!form.description.trim()) return;
    if (form.photos.length === 0) return;

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
          <div className="page-sub">Submit a maintenance request and track it live.</div>
        </div>
      </div>


      <div className="card">
        <div className="card-body">
          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label className="form-label">Request Title *</label>
              <input
                className={`form-input${fieldError('title') ? ' input-error' : ''}`}
                placeholder="Short summary of the issue"
                value={form.title}
                onChange={event => set('title', event.target.value)}
                disabled={submitting || dataLoading}
                />
              {fieldError('title') && <div className="field-error">{fieldError('title')}</div>}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Category *</label>
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
                <label className="form-label">Sub Category *</label>
                <select
                  className={`form-input${fieldError('subCategory') ? ' input-error' : ''}`}
                  value={form.subCategory}
                  onChange={event => set('subCategory', event.target.value)}
                  disabled={submitting || dataLoading}
                  required
                >
                  {(REQUEST_CATEGORY_OPTIONS[form.category] || []).map(subCategory => (
                    <option key={subCategory} value={subCategory}>{subCategory}</option>
                  ))}
                </select>
                {fieldError('subCategory') && <div className="field-error">{fieldError('subCategory')}</div>}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Area / Location *</label>
                <select
                  className={`form-input${fieldError('area') ? ' input-error' : ''}`}
                  value={form.area}
                  onChange={event => set('area', event.target.value)}
                  disabled={submitting || dataLoading}
                  required
                >
                  <option value="">Select area</option>
                  {REQUEST_AREAS.map(area => <option key={area} value={area}>{area}</option>)}
                </select>
                {fieldError('area') && <div className="field-error">{fieldError('area')}</div>}
              </div>

              <div className="form-group">
              <label className="form-label">Preferred Visit Time *</label>
                <select
                  className={`form-input${fieldError('preferredVisitTime') ? ' input-error' : ''}`}
                  value={form.preferredVisitTime}
                  onChange={event => set('preferredVisitTime', event.target.value)}
                  disabled={submitting || dataLoading}
                  >
                  <option value="">Select a time slot</option>
                  {PREFERRED_TIME_SLOTS.map(slot => (
                    <option key={slot} value={slot}>{slot}</option>
                  ))}
                </select>
                {fieldError('preferredVisitTime') && <div className="field-error">{fieldError('preferredVisitTime')}</div>}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Description *</label>
              <textarea
                className={`form-input${fieldError('description') ? ' input-error' : ''}`}
                placeholder="Explain the issue, what you observed, when it started, and anything that may help the maintenance team."
                value={form.description}
                onChange={event => set('description', event.target.value)}
                disabled={submitting || dataLoading}
                />
              {fieldError('description') && <div className="field-error">{fieldError('description')}</div>}
            </div>

            <div className="form-group">
              <label className="form-label">Photos *</label>
              <input
                className="form-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={handlePhotoChange}
                disabled={submitting || dataLoading}
              />
              <div className="text-xs text-2" style={{ marginTop: 6 }}>Upload up to 5 JPG, PNG, or WebP photos. Max 5 MB each.</div>
              {fieldError('photos') && <div className="field-error">{fieldError('photos')}</div>}
              {form.photos.length > 0 && (
                <div className="request-photo-grid">
                  {form.photos.map((photo, index) => (
                    <div key={`${photo.name}-${photo.lastModified}`} className="request-photo-preview">
                      <img src={URL.createObjectURL(photo)} alt={photo.name} />
                      <button className="btn btn-sm" type="button" onClick={() => removePhoto(index)}>Remove</button>
                    </div>
                  ))}
                </div>
              )}
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
