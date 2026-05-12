import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';

export default function InviteSignup() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { acceptInvite, showToast } = useApp();
  const token = params.get('token') || '';
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(() => (
    token &&
    form.fullName.trim() &&
    form.password.length >= 8 &&
    form.password === form.confirmPassword
  ), [form, token]);

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!token) {
      showToast('Invite link is missing a token', 'danger');
      return;
    }
    if (form.password !== form.confirmPassword) {
      showToast('Passwords do not match', 'danger');
      return;
    }

    setSubmitting(true);
    try {
      await acceptInvite({
        token,
        fullName: form.fullName.trim(),
        password: form.password,
        phone: form.phone.trim(),
      });
      showToast('Account created successfully', 'success');
      navigate('/dashboard', { replace: true });
    } catch (error) {
      showToast(error.message || 'Could not accept invite', 'danger');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">Serv<span>Track</span></div>
        <h1 className="login-title">Create your ServTrack account</h1>
        <p className="login-sub">
          Finish your profile and set a password to activate your workspace access.
        </p>

        {!token && (
          <div className="alert alert-danger">
            This invite link is incomplete. Ask the client admin to resend the invitation.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input
              className="form-input"
              value={form.fullName}
              onChange={event => set('fullName', event.target.value)}
              autoComplete="name"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Phone</label>
            <input
              className="form-input"
              value={form.phone}
              onChange={event => set('phone', event.target.value)}
              autoComplete="tel"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              value={form.password}
              onChange={event => set('password', event.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Confirm Password</label>
            <input
              className="form-input"
              type="password"
              value={form.confirmPassword}
              onChange={event => set('confirmPassword', event.target.value)}
              autoComplete="new-password"
            />
          </div>

          <button className="btn btn-primary login-submit" type="submit" disabled={!canSubmit || submitting}>
            {submitting ? 'Creating account...' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
