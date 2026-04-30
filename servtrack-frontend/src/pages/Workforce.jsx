import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';

const ROLE_LABEL = { supervisor: 'Supervisor', workman: 'Workman' };

export default function Workforce() {
  const { role, currentUser, usersByQuery, loadUsers, workOrders, inviteContractorUser, showToast } = useApp();
  const [search, setSearch] = useState('');
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'supervisor' });
  const [inviteUrl, setInviteUrl] = useState('');
  const [inviting, setInviting] = useState(false);

  const contractorId = currentUser?.contractor_id;

  useEffect(() => {
    if (!contractorId) return;
    loadUsers({ role: 'supervisor', contractorId }).catch(() => {});
    loadUsers({ role: 'workman', contractorId }).catch(() => {});
  }, [contractorId, loadUsers]);

  const supervisorKey = contractorId ? `role=supervisor&contractor_id=${contractorId}` : 'role=supervisor';
  const workmanKey    = contractorId ? `role=workman&contractor_id=${contractorId}`    : 'role=workman';
  const supervisors   = usersByQuery[supervisorKey] || [];
  const workmen       = usersByQuery[workmanKey]    || [];

  const allMembers = useMemo(() => [
    ...supervisors.map(u => ({ ...u, roleLabel: 'Supervisor' })),
    ...workmen.map(u => ({ ...u, roleLabel: 'Workman' })),
  ], [supervisors, workmen]);

  const filtered = useMemo(() => {
    if (!search.trim()) return allMembers;
    const q = search.toLowerCase();
    return allMembers.filter(u =>
      u.full_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.roleLabel.toLowerCase().includes(q)
    );
  }, [allMembers, search]);

  const activeByMember = useMemo(() => {
    const map = {};
    workOrders.forEach(wo => {
      if (wo.status === 'closed') return;
      if (wo.supervisorId) map[wo.supervisorId] = (map[wo.supervisorId] || 0) + 1;
      if (wo.workmanId) map[wo.workmanId] = (map[wo.workmanId] || 0) + 1;
    });
    return map;
  }, [workOrders]);

  if (role !== 'contractor' && role !== 'supervisor') {
    return (
      <div className="empty-state">
        <div className="empty-title">Access Restricted</div>
        <div className="empty-sub">Only contractors and supervisors can view the team roster.</div>
      </div>
    );
  }

  async function copyInvite(url) {
    try {
      await navigator.clipboard.writeText(url);
      showToast('Invite link copied', 'success');
    } catch (error) {
      showToast(`Invite link: ${url}`, 'warning');
    }
  }

  async function handleInvite(event) {
    event.preventDefault();
    setInviting(true);
    setInviteUrl('');
    try {
      const result = await inviteContractorUser(inviteForm);
      if (result.invite_url) {
        setInviteUrl(result.invite_url);
        await copyInvite(result.invite_url);
      } else {
        showToast(`${ROLE_LABEL[inviteForm.role]} invite sent`, 'success');
      }
      setInviteForm(prev => ({ ...prev, email: '' }));
    } catch (error) {
      showToast(error.message || 'Could not send invite', 'danger');
    } finally {
      setInviting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">My Team</div>
          <div className="page-sub">Supervisors and workmen in your contractor group</div>
        </div>
      </div>

      <div className="alert alert-info" style={{ display: 'block', marginBottom: 20 }}>
        Contractors can invite supervisors and workmen.
      </div>

      {role === 'contractor' && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <span className="card-title">Invite Team Member</span>
          </div>
          <div className="card-body">
            <form className="form-row" onSubmit={handleInvite}>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  className="form-input"
                  type="email"
                  value={inviteForm.email}
                  onChange={event => setInviteForm(prev => ({ ...prev, email: event.target.value }))}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Role</label>
                <select
                  className="form-input"
                  value={inviteForm.role}
                  onChange={event => setInviteForm(prev => ({ ...prev, role: event.target.value }))}
                >
                  <option value="supervisor">Supervisor</option>
                  <option value="workman">Workman</option>
                </select>
              </div>
              <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button className="btn btn-primary" type="submit" disabled={inviting}>
                  {inviting ? 'Inviting...' : 'Send Invite'}
                </button>
              </div>
            </form>
            {inviteUrl && (
              <div className="alert alert-warning" style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span>Email is not configured. Share this invite link manually.</span>
                <button className="btn btn-sm" onClick={() => copyInvite(inviteUrl)}>Copy Link</button>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <input
          className="form-input"
          style={{ maxWidth: 320 }}
          placeholder="Search by name, email, or role..."
          value={search}
          onChange={event => setSearch(event.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-title">No team members found</div>
          <div className="empty-sub">
            {allMembers.length === 0
              ? 'No supervisors or workmen are linked to your contractor group yet.'
              : 'No team members match your search.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {filtered.map(member => {
            const activeCount = activeByMember[member.id] || 0;
            return (
              <div key={member.id} className="card" style={{ padding: '16px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{member.full_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>{member.email}</div>
                    <span className={`badge ${member.roleLabel === 'Supervisor' ? 'badge-assigned' : 'badge-inprogress'}`}>
                      {member.roleLabel}
                    </span>
                  </div>
                  {activeCount > 0 && (
                    <div style={{ textAlign: 'center', minWidth: 40 }}>
                      <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--primary)' }}>{activeCount}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)' }}>active</div>
                    </div>
                  )}
                </div>
                {member.phone && (
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>{member.phone}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
