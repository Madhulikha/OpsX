import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';

const API_BASE = process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';
const TOKEN_KEY = 'servtrack_token';

const CSV_TEMPLATE = `name,email,phone
John Doe,john.doe@company.com,+91 9876543210
Jane Smith,jane.smith@company.com,+91 9123456789`;

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
  const { role, showToast, loadUsers, usersByQuery } = useApp();
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);
  const endUsers = usersByQuery['role=enduser'] || [];

  useEffect(() => {
    if (role === 'client') {
      loadUsers({ role: 'enduser' }).catch(() => {
        showToast('Could not load end users', 'danger');
      });
    }
  }, [loadUsers, role, showToast]);

  if (role !== 'client') {
    return (
      <div className="empty-state">
        <div className="empty-title">Access Restricted</div>
        <div className="empty-sub">Only engineers can manage end users.</div>
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

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Manage End Users</div>
          <div className="page-sub">Bulk-upload tenant, staff, or resident accounts. End users log in with OTP (no password required).</div>
        </div>
        <button className="btn" onClick={downloadTemplate}>Download CSV Template</button>
      </div>

      <div className="alert alert-info" style={{ display: 'block', marginBottom: 24 }}>
        <strong>How it works:</strong> Upload a CSV with columns <code>name</code>, <code>email</code>, and optionally <code>phone</code>.
        The system creates end-user accounts under your client. End users can then log in using their registered email or phone via OTP — no password needed.
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
          marginBottom: 24,
        }}
      >
        <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileChange} />
        <div style={{ fontSize: 32, marginBottom: 12 }}>📂</div>
        <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-1)' }}>
          {uploading ? 'Uploading...' : 'Drop CSV file here, or click to browse'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Supports .csv files up to 200 users</div>
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
            <>
              <div className="section-heading" style={{ marginBottom: 12 }}>Created Users</div>
              <div className="alert alert-info" style={{ display: 'block', marginBottom: 12 }}>
                These users are now stored under your client and can sign in through OTP.
              </div>
              <div style={{ overflowX: 'auto', marginBottom: 24 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-2)', fontWeight: 600 }}>Name</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-2)', fontWeight: 600 }}>Email</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-2)', fontWeight: 600 }}>Phone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.created.map((user, index) => (
                      <tr key={index} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 12px' }}>{user.name}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--text-2)' }}>{user.email}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--text-3)' }}>{user.phone || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {result.skipped.length > 0 && (
            <>
              <div className="section-heading" style={{ marginBottom: 12 }}>Skipped Rows</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-2)', fontWeight: 600 }}>Email</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-2)', fontWeight: 600 }}>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.skipped.map((item, index) => (
                      <tr key={index} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 12px', color: 'var(--text-2)' }}>{item.email || item.row?.email || '—'}</td>
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
          <span className="card-title">Registered End Users</span>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{endUsers.length} user{endUsers.length === 1 ? '' : 's'}</span>
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
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-2)', fontWeight: 600 }}>Name</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-2)', fontWeight: 600 }}>Email</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-2)', fontWeight: 600 }}>Phone</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-2)', fontWeight: 600 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {endUsers.map(user => (
                  <tr key={user.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px' }}>{user.full_name}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-2)' }}>{user.email}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-3)' }}>{user.phone || '—'}</td>
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
    </div>
  );
}
