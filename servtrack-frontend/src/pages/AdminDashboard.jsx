import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';

const EMPTY_FORM = {
  clientName: '',
  adminFullName: '',
  adminEmail: '',
  adminPhone: '',
};

function MetricCard({ label, value, sub, tone = '' }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className={`stat-sub ${tone}`}>{sub}</div>}
    </div>
  );
}

export default function AdminDashboard() {
  const { adminOverview, adminClients, loadAdminData, createClient, showToast, dataLoading, dataReady } = useApp();
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [createdInvite, setCreatedInvite] = useState(null);

  useEffect(() => {
    loadAdminData().catch(error => {
      showToast(error.message || 'Could not load admin dashboard', 'danger');
    });
  }, [loadAdminData, showToast]);

  const conversion = useMemo(() => {
    const total = adminOverview?.total_clients || 0;
    const linked = adminOverview?.linked_contractors || 0;
    return total ? `${(linked / total).toFixed(1)} avg links/client` : 'No clients yet';
  }, [adminOverview]);

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.clientName.trim() || !form.adminFullName.trim() || !form.adminEmail.trim()) {
      showToast('Client name, admin name, and admin email are required', 'danger');
      return;
    }
    setSubmitting(true);
    setCreatedInvite(null);
    try {
      const created = await createClient(form);
      setForm(EMPTY_FORM);
      setCreatedInvite(created.invite_url ? {
        email: created.admin_email,
        inviteUrl: created.invite_url,
      } : null);
      showToast(
        created.invite_sent ? `${created.client.name} invite sent` : `${created.client.name} created. Copy the invite link.`,
        created.invite_sent ? 'success' : 'warning'
      );
    } catch (error) {
      showToast(error.message || 'Could not onboard client', 'danger');
    } finally {
      setSubmitting(false);
    }
  }

  const isInitialLoading = !dataReady || !adminOverview;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Admin Dashboard</div>
          <div className="page-sub">App-level health, tenant onboarding, and non-PII operational metrics.</div>
        </div>
        <button className="btn" onClick={() => loadAdminData().catch(() => showToast('Refresh failed', 'danger'))} disabled={dataLoading}>
          Refresh
        </button>
      </div>

      {isInitialLoading ? (
        <div className="page-loading">
          <div className="loading-dots" aria-label="Loading">
            <span />
            <span />
            <span />
          </div>
        </div>
      ) : (
        <>
          <div className="stats-grid">
            <MetricCard label="Clients" value={adminOverview.total_clients} sub="Active tenant accounts" />
            <MetricCard label="Users" value={adminOverview.total_users} sub="Excludes super admins" />
            <MetricCard label="Contractors" value={adminOverview.active_contractors} sub={`${adminOverview.total_contractors} total in directory`} />
            <MetricCard label="SLA Breaches" value={adminOverview.sla_breaches} sub="Across all clients" tone={adminOverview.sla_breaches ? 'danger' : ''} />
          </div>

          <div className="stats-grid">
            <MetricCard label="Work Orders" value={adminOverview.total_work_orders} sub="All-time aggregate" />
            <MetricCard label="Open" value={adminOverview.open_work_orders} sub="Awaiting assignment" />
            <MetricCard label="In Progress" value={adminOverview.inprogress_work_orders} sub="Currently active" />
            <MetricCard label="Closed" value={adminOverview.closed_work_orders} sub={conversion} />
          </div>
        </>
      )}

      {!isInitialLoading && <div className="form-row" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Add New Client</span>
          </div>
          <div className="card-body">
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Client Name</label>
                <input className="form-input" value={form.clientName} onChange={event => set('clientName', event.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Primary Engineer Name</label>
                <input className="form-input" value={form.adminFullName} onChange={event => set('adminFullName', event.target.value)} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Primary Engineer Email</label>
                  <input className="form-input" type="email" value={form.adminEmail} onChange={event => set('adminEmail', event.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input className="form-input" value={form.adminPhone} onChange={event => set('adminPhone', event.target.value)} />
                </div>
              </div>
              <button className="btn btn-primary" type="submit" disabled={submitting}>
                {submitting ? 'Sending Invite...' : 'Create Client & Send Invite'}
              </button>
            </form>

            {createdInvite && (
              <div className="alert alert-warning" style={{ display: 'block', marginTop: 16 }}>
                <strong>Email could not be sent.</strong>
                <div className="text-sm" style={{ marginTop: 6 }}>{createdInvite.email}</div>
                <input className="form-input" style={{ marginTop: 8 }} value={createdInvite.inviteUrl} readOnly />
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Client Directory</span>
            <span className="text-xs text-3">{adminClients.length} client{adminClients.length === 1 ? '' : 's'}</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Engineers</th>
                  <th>End Users</th>
                  <th>Contractors</th>
                  <th>Active WOs</th>
                </tr>
              </thead>
              <tbody>
                {adminClients.map(client => (
                  <tr key={client.id}>
                    <td>
                      <div className="font-semibold">{client.name}</div>
                      <div className="text-xs text-3">
                        Added {new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(client.created_at))}
                      </div>
                    </td>
                    <td>{client.engineer_count}</td>
                    <td>{client.enduser_count}</td>
                    <td>{client.contractor_count}</td>
                    <td>{client.active_work_orders}</td>
                  </tr>
                ))}
                {adminClients.length === 0 && (
                  <tr>
                    <td colSpan="5">
                      <div className="empty-state" style={{ padding: 24 }}>
                        <div className="empty-title">No clients onboarded yet</div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>}
    </div>
  );
}
