import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';

const API_BASE = process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';
const TOKEN_KEY = 'servtrack_token';

const CSV_TEMPLATE = `id,name,email,phone,address_line1,address_line2,city,state,postal_code,country
EU-001,John Doe,john.doe@company.com,+91 9876543210,Flat 1203,Tower A,Hyderabad,Telangana,500081,India
EU-002,Jane Smith,jane.smith@company.com,+91 9123456789,Villa 18,Oak Street,Bengaluru,Karnataka,560001,India`;

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'endusers_template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function EndUsers() {
  const { role, isCommandantEngineer, showToast, loadUsers, usersByQuery, inviteClientEngineer } = useApp();
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [inviteForm, setInviteForm] = useState({ fullName: '', email: '', phone: '', clientSubrole: 'junior_engineer' });
  const [inviteUrl, setInviteUrl] = useState('');
  const [inviting, setInviting] = useState(false);
  const [activeTab, setActiveTab] = useState('endusers');
  const fileRef = useRef(null);
  const endUsers = usersByQuery['role=enduser'] || [];

  useEffect(() => {
    if (isCommandantEngineer) {
      loadUsers({ role: 'enduser' }).catch(() => {
        showToast('Could not load end users', 'danger');
      });
    }
  }, [isCommandantEngineer, loadUsers, showToast]);

  if (role !== 'client' || !isCommandantEngineer) {
    return (
      <div className="empty-state">
        <div className="empty-title">Access Restricted</div>
        <div className="empty-sub">Only commandant engineers can manage end users.</div>
      </div>
    );
  }

  async function uploadCsv(file) {
    if (!file) return;
    if (!file.name.endsWith('.csv')) {
      showToast('Please upload a .csv file', 'danger');
      return;
    }
    setUploading(true);
    setResult(null);
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const body = new FormData();
      body.append('file', file);
      const resp = await fetch(`${API_BASE}/users/bulk-endusers`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || 'Upload failed');
      setResult(data);
      await loadUsers({ role: 'enduser' });
      if (data.total_created > 0) {
        showToast(`${data.total_created} end user(s) created successfully`, 'success');
      } else {
        showToast('No new users were created — all emails may already be registered', 'warning');
      }
    } catch (error) {
      showToast(error.message || 'Upload failed', 'danger');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (file) uploadCsv(file);
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) uploadCsv(file);
  }

  function setInviteField(field, value) {
    setInviteForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleEngineerInvite(event) {
    event.preventDefault();
    if (!inviteForm.fullName.trim() || !inviteForm.email.trim()) {
      showToast('Engineer name and email are required', 'danger');
      return;
    }
    setInviting(true);
    setInviteUrl('');
    try {
      const result = await inviteClientEngineer(inviteForm);
      if (result.invite_url) setInviteUrl(result.invite_url);
      setInviteForm({ fullName: '', email: '', phone: '', clientSubrole: 'junior_engineer' });
      showToast(result.invite_sent ? 'Engineer invite sent' : 'Engineer invite link created', result.invite_sent ? 'success' : 'warning');
    } catch (error) {
      showToast(error.message || 'Could not invite engineer', 'danger');
    } finally {
      setInviting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">User Management</div>
          <div className="page-sub">Manage client engineers and end-user access without exposing end-user PII.</div>
        </div>
      </div>

      <div className="filter-bar" style={{ marginBottom: 20 }}>
        <button className={`filter-chip ${activeTab === 'endusers' ? 'active' : ''}`} onClick={() => setActiveTab('endusers')}>
          End-User Access
        </button>
        <button className={`filter-chip ${activeTab === 'engineers' ? 'active' : ''}`} onClick={() => setActiveTab('engineers')}>
          Client Engineers
        </button>
      </div>

      {activeTab === 'engineers' && <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="card-title">Invite Junior or Assistant Engineer</span>
        </div>
        <div className="card-body">
          <form onSubmit={handleEngineerInvite}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input className="form-input" value={inviteForm.fullName} onChange={event => setInviteField('fullName', event.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input className="form-input" type="email" value={inviteForm.email} onChange={event => setInviteField('email', event.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input className="form-input" value={inviteForm.phone} onChange={event => setInviteField('phone', event.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Role</label>
                <select className="form-input" value={inviteForm.clientSubrole} onChange={event => setInviteField('clientSubrole', event.target.value)}>
                  <option value="junior_engineer">Junior Engineer</option>
                  <option value="assistant_engineer">Assistant Engineer</option>
                </select>
              </div>
            </div>
            <button className="btn btn-primary" type="submit" disabled={inviting}>
              {inviting ? 'Sending Invite...' : 'Invite Engineer'}
            </button>
          </form>
          {inviteUrl && (
            <div className="alert alert-warning" style={{ display: 'block', marginTop: 16 }}>
              <strong>Email could not be sent.</strong>
              <input className="form-input" style={{ marginTop: 8 }} value={inviteUrl} readOnly />
            </div>
          )}
        </div>
      </div>}

      {activeTab === 'endusers' && <>
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <span className="card-title">Add End Users</span>
            <button className="btn btn-sm" onClick={downloadTemplate}>Download CSV Template</button>
          </div>
          <div className="card-body">
            <div className="text-sm text-2" style={{ marginBottom: 16 }}>
              Upload end-user records with <code>id</code>, <code>name</code>, <code>email</code>, optional <code>phone</code>, and address columns. Name, contact details, and address are encrypted at rest and not displayed back in this list.
            </div>
            <div
              onDragOver={event => { event.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: 'var(--radius)',
                padding: '48px 24px',
                textAlign: 'center',
                cursor: 'pointer',
                background: dragOver ? 'var(--primary-bg)' : 'var(--surface)',
                transition: 'all 0.15s',
              }}
            >
              <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileChange} />
              <div style={{ fontSize: 32, marginBottom: 12 }}>📂</div>
              <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-1)' }}>
                {uploading ? 'Uploading...' : 'Drop CSV file here, or click to browse'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Supports .csv files up to 200 users</div>
            </div>
          </div>
        </div>

        {result && (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <div className="stat-card" style={{ flex: 1 }}>
              <div className="stat-number" style={{ color: 'var(--success)' }}>{result.total_created}</div>
              <div className="stat-label">Users Created</div>
            </div>
            <div className="stat-card" style={{ flex: 1 }}>
              <div className="stat-number" style={{ color: result.total_skipped > 0 ? 'var(--warning)' : 'var(--text-3)' }}>{result.total_skipped}</div>
              <div className="stat-label">Skipped</div>
            </div>
          </div>

          {result.created.length > 0 && (
            <div className="alert alert-info" style={{ display: 'block', marginBottom: 24 }}>
              {result.total_created} end user{result.total_created === 1 ? '' : 's'} created. PII is encrypted and not shown here after upload.
            </div>
          )}

          {result.skipped.length > 0 && (
            <>
              <div className="section-heading" style={{ marginBottom: 12 }}>Skipped Rows</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-2)', fontWeight: 600 }}>Row</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-2)', fontWeight: 600 }}>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.skipped.map((item, index) => (
                      <tr key={index} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 12px', color: 'var(--text-2)' }}>{item.id || item.email || item.row?.id || item.row?.email || '—'}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--warning)' }}>{item.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
        )}

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header">
          <span className="card-title">End-User Access List</span>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{endUsers.length} account{endUsers.length === 1 ? '' : 's'}</span>
        </div>
        {endUsers.length === 0 ? (
          <div className="empty-state" style={{ padding: '32px 12px' }}>
            <div className="empty-title">No end users added yet</div>
            <div className="empty-sub">Upload a CSV to add end users for this client.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-2)', fontWeight: 600 }}>End User ID</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-2)', fontWeight: 600 }}>Privacy</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-2)', fontWeight: 600 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {endUsers.map(user => (
                  <tr key={user.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px', color: 'var(--text-2)' }}>{user.end_user_code || `EU-${user.id}`}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-3)' }}>Personal details hidden</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span className={`badge ${user.is_active ? 'badge-assigned' : 'badge-escalated'}`}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>}
    </div>
  );
}
