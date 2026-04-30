import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

const DEMO_USERS = [
  { label: 'Junior Engineer',       email: 'admin@propertyclient.in',       password: 'Admin@1234' },
  { label: 'Assistant Engineer',    email: 'assistant@propertyclient.in',   password: 'Admin@1234' },
  { label: 'Commandant Engineer',   email: 'commandant@propertyclient.in',  password: 'Admin@1234' },
  { label: 'Contractor',            email: 'manager@alphaserv.in',          password: 'Contractor@1234' },
  { label: 'Supervisor',            email: 'ramesh@alphaserv.in',           password: 'Super@1234' },
  { label: 'Workman',               email: 'suresh@alphaserv.in',           password: 'Work@1234' },
  { label: 'End User',              email: 'security@property.in',          password: 'User@1234' },
];

const API_BASE = process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';
const SHOW_DEMO_USERS = process.env.REACT_APP_SHOW_DEMO_USERS === 'true' || process.env.NODE_ENV === 'development';


export default function Login() {
  const navigate = useNavigate();
  const { login, showToast } = useApp();
  const [tab, setTab] = useState('password');
  const [email, setEmail]       = useState(SHOW_DEMO_USERS ? DEMO_USERS[0].email : '');
  const [password, setPassword] = useState(SHOW_DEMO_USERS ? DEMO_USERS[0].password : '');
  const [submitting, setSubmitting] = useState(false);

  const [otpIdentifier, setOtpIdentifier] = useState('');
  const [otpCode, setOtpCode]             = useState('');
  const [demoOtp, setDemoOtp]             = useState('');
  const [otpStep, setOtpStep]             = useState('request');
  const [otpSubmitting, setOtpSubmitting] = useState(false);

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/dashboard', { replace: true });
      showToast('Signed in successfully', 'success');
    } catch (error) {
      showToast(error.message || 'Login failed', 'danger');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRequestOtp(event) {
    event.preventDefault();
    if (!otpIdentifier.trim()) {
      showToast('Enter your email or phone number', 'danger');
      return;
    }
    setOtpSubmitting(true);
    try {
      const resp = await fetch(`${API_BASE}/auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: otpIdentifier.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || 'Failed to send OTP');
      setDemoOtp(data.demo_otp || '');
      setOtpStep('verify');
      showToast(data.demo_otp ? 'OTP generated for local development' : 'OTP sent successfully', 'success');
    } catch (error) {
      showToast(error.message || 'Could not send OTP', 'danger');
    } finally {
      setOtpSubmitting(false);
    }
  }

  async function handleVerifyOtp(event) {
    event.preventDefault();
    if (!otpCode.trim()) {
      showToast('Enter the OTP code', 'danger');
      return;
    }
    setOtpSubmitting(true);
    try {
      const resp = await fetch(`${API_BASE}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: otpIdentifier.trim(), otp_code: otpCode.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || 'Invalid OTP');
      localStorage.setItem('servtrack_token', data.access_token);
      window.location.href = '/dashboard';
    } catch (error) {
      showToast(error.message || 'OTP verification failed', 'danger');
    } finally {
      setOtpSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">Serv<span>Track</span></div>
        <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid var(--border)', }}>
          <button
            style={{
              flex: 1, padding: '8px 0', background: 'none', border: 'none',
              borderBottom: tab === 'password' ? '2px solid var(--primary)' : '2px solid transparent',
              marginBottom: -2, cursor: 'pointer', fontWeight: 600, fontSize: 13,
              color: tab === 'password' ? 'var(--primary)' : 'var(--text-2)',
            }}
            onClick={() => setTab('password')}
          >
            Password Login
          </button>
          <button
            style={{
              flex: 1, padding: '8px 0', background: 'none', border: 'none',
              borderBottom: tab === 'otp' ? '2px solid var(--primary)' : '2px solid transparent',
              marginBottom: -2, cursor: 'pointer', fontWeight: 600, fontSize: 13,
              color: tab === 'otp' ? 'var(--primary)' : 'var(--text-2)',
            }}
            onClick={() => { setTab('otp'); setOtpStep('request'); setDemoOtp(''); setOtpCode(''); }}
          >
            OTP Login (End Users)
          </button>
        </div>

        {tab === 'password' && (
          <>
            <h1 className="login-title">Sign in to ServTrack</h1>
            <p className="login-sub">Engineers, contractors, supervisors, and workmen use email + password.</p>

            {SHOW_DEMO_USERS && (
              <div className="login-demo-users">
                {DEMO_USERS.map(user => (
                  <button
                    key={user.email}
                    className="login-demo-btn"
                    type="button"
                    onClick={() => { setEmail(user.email); setPassword(user.password); }}
                  >
                    {user.label}
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={handlePasswordSubmit}>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  className="form-input"
                  type="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  autoComplete="username"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  className="form-input"
                  type="password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <button className="btn btn-primary login-submit" type="submit" disabled={submitting}>
                {submitting ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          </>
        )}

        {tab === 'otp' && (
          <>
            <h1 className="login-title">OTP Login</h1>
            <p className="login-sub">End users can sign in using a one-time password sent to their registered email or phone.</p>

            {otpStep === 'request' && (
              <form onSubmit={handleRequestOtp}>
                <div className="form-group">
                  <label className="form-label">Email or Phone Number</label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="e.g. user@example.com or +91 9876543210"
                    value={otpIdentifier}
                    onChange={event => setOtpIdentifier(event.target.value)}
                    autoComplete="username"
                  />
                </div>
                <button className="btn btn-primary login-submit" type="submit" disabled={otpSubmitting}>
                  {otpSubmitting ? 'Sending OTP...' : 'Send OTP'}
                </button>
              </form>
            )}

            {otpStep === 'verify' && (
              <form onSubmit={handleVerifyOtp}>
                {demoOtp && (
                  <div className="alert alert-info" style={{ marginBottom: 16, display: 'block' }}>
                    <strong>Demo Mode:</strong> Email is not configured. Your OTP is: <strong style={{ fontSize: 20, letterSpacing: 4 }}>{demoOtp}</strong>
                    <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-2)' }}>In production, this would be sent to the user's email or phone.</div>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">OTP Code</label>
                  <input
                    className="form-input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="Enter 6-digit OTP"
                    value={otpCode}
                    onChange={event => setOtpCode(event.target.value.replace(/\D/g, ''))}
                    autoComplete="one-time-code"
                    autoFocus
                  />
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                    Sent to: {otpIdentifier} — valid for 10 minutes
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn login-submit" type="button" onClick={() => { setOtpStep('request'); setDemoOtp(''); setOtpCode(''); }}>
                    Back
                  </button>
                  <button className="btn btn-primary login-submit" type="submit" disabled={otpSubmitting || otpCode.length !== 6}>
                    {otpSubmitting ? 'Verifying...' : 'Verify & Sign In'}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
