import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

const DEMO_USERS = [
  { label: 'Super Admin',           email: 'owner@servtrack.in',        password: 'Owner@1234' },
  { label: 'Junior Engineer',       email: 'admin@propertyclient.in',       password: 'Admin@1234' },
  { label: 'Assistant Engineer',    email: 'assistant@propertyclient.in',   password: 'Admin@1234' },
  { label: 'Commandant Engineer',   email: 'commandant@propertyclient.in',  password: 'Admin@1234' },
  { label: 'Contractor',            email: 'manager@alphaserv.in',          password: 'Contractor@1234' },
  { label: 'Supervisor',            email: 'ramesh@alphaserv.in',           password: 'Super@1234' },
  { label: 'Workman',               email: 'suresh@alphaserv.in',           password: 'Work@1234' },
];

const API_BASE = process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';
const SHOW_DEMO_USERS = process.env.REACT_APP_SHOW_DEMO_USERS === 'true' || process.env.NODE_ENV === 'development';


const FEATURES = [
  {
    icon: '🔧',
    title: 'End-to-end service requests',
    desc: 'Raise, assign, track and close maintenance jobs across all facilities from one dashboard.',
  },
  {
    icon: '👥',
    title: 'Multi-role workforce',
    desc: 'Engineers, contractors, supervisors, workmen and end users — each with their own tailored view.',
  },
  {
    icon: '📸',
    title: 'Photo-verified completions',
    desc: 'Workmen must upload completion photos before marking a job done. No more unverified closures.',
  },
  {
    icon: '🔔',
    title: 'Real-time notifications',
    desc: 'Instant alerts on assignments, escalations, approvals and SLA breaches.',
  },
];

const STATS = [
  { value: '5', label: 'User Roles' },
  { value: '360°', label: 'Workflow View' },
  { value: 'OTP', label: 'End-User Login' },
  { value: 'SLA', label: 'Tracked' },
];


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
      if (data.success === false) {
        setDemoOtp('');
        setOtpCode('');
        setOtpStep('request');
        showToast(data.message || 'Please contact your facility administrator', 'danger');
        return;
      }
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
    <>
    <div className="lp-root">
      {/* ── Left panel — hero ── */}
      <div className="lp-hero">
        <div className="lp-hero-inner">
          <div className="lp-brand">Serv<span>Track</span></div>
          <div className="lp-tagline">Facility &amp; Maintenance<br />Management, done right.</div>
          <p className="lp-desc">
            A single platform for engineers, contractors, supervisors and workmen
            to raise, track and close every service request — with full accountability
            at every step.
          </p>

          <div className="lp-stats">
            {STATS.map(s => (
              <div key={s.label} className="lp-stat">
                <div className="lp-stat-value">{s.value}</div>
                <div className="lp-stat-label">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="lp-features">
            {FEATURES.map(f => (
              <div key={f.title} className="lp-feature">
                <div className="lp-feature-icon">{f.icon}</div>
                <div>
                  <div className="lp-feature-title">{f.title}</div>
                  <div className="lp-feature-desc">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lp-hero-footer">
          Built for property management teams &nbsp;·&nbsp; Secure &amp; role-based
        </div>
      </div>

      {/* ── Right panel — login form ── */}
      <div className="lp-form-panel">
        <div className="lp-form-wrap">
          <div className="lp-form-header">
            <div className="lp-form-title">Sign in</div>
            <div className="lp-form-sub">Welcome back. Select your login method below.</div>
          </div>

          {/* Tabs */}
          <div className="lp-tabs">
            <button
              className={`lp-tab${tab === 'password' ? ' active' : ''}`}
              onClick={() => setTab('password')}
            >
              Password Login
            </button>
            <button
              className={`lp-tab${tab === 'otp' ? ' active' : ''}`}
              onClick={() => { setTab('otp'); setOtpStep('request'); setDemoOtp(''); setOtpCode(''); }}
            >
              OTP Login
            </button>
          </div>

          {/* ── Password tab ── */}
          {tab === 'password' && (
            <div className="lp-tab-body">
              {SHOW_DEMO_USERS && (
                <div className="lp-demo-row">
                  <div className="lp-demo-label">Quick demo sign-in:</div>
                  <div className="lp-demo-chips">
                    {DEMO_USERS.map(u => (
                      <button
                        key={u.email}
                        className="lp-chip"
                        type="button"
                        onClick={() => { setEmail(u.email); setPassword(u.password); }}
                      >
                        {u.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <form onSubmit={handlePasswordSubmit}>
                <div className="form-group">
                  <label className="form-label">Email address</label>
                  <input
                    className="form-input"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@organisation.com"
                    autoComplete="username"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input
                    className="form-input"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                </div>
                <button className="btn btn-primary lp-submit" type="submit" disabled={submitting}>
                  {submitting ? 'Signing in…' : 'Sign In'}
                </button>
              </form>

              <p className="lp-hint">
                For engineers, contractors, supervisors &amp; workmen.
              </p>
            </div>
          )}

          {/* ── OTP tab ── */}
          {tab === 'otp' && (
            <div className="lp-tab-body">
              {otpStep === 'request' && (
                <form onSubmit={handleRequestOtp}>
                  <div className="lp-otp-intro">
                    <span className="lp-otp-icon">📱</span>
                    <span>We'll send a 6-digit code to your registered email or phone.</span>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email or Phone Number</label>
                    <input
                      className="form-input"
                      type="text"
                      placeholder="user@example.com or +91 9876543210"
                      value={otpIdentifier}
                      onChange={e => setOtpIdentifier(e.target.value)}
                      autoComplete="username"
                      required
                    />
                  </div>
                  <button className="btn btn-primary lp-submit" type="submit" disabled={otpSubmitting}>
                    {otpSubmitting ? 'Sending…' : 'Send OTP'}
                  </button>
                </form>
              )}

              {otpStep === 'verify' && (
                <form onSubmit={handleVerifyOtp}>
                  {demoOtp && (
                    <div className="lp-demo-otp-box">
                      <div className="lp-demo-otp-label">Demo Mode — OTP</div>
                      <div className="lp-demo-otp-code">{demoOtp}</div>
                      <div className="lp-demo-otp-note">Email not configured. In production this is sent to the user.</div>
                    </div>
                  )}
                  <div className="form-group">
                    <label className="form-label">6-digit OTP</label>
                    <input
                      className="form-input lp-otp-input"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      placeholder="000000"
                      value={otpCode}
                      onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                      autoComplete="one-time-code"
                      autoFocus
                    />
                    <div className="lp-otp-sent-to">Sent to: {otpIdentifier} · valid for 10 min</div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      className="btn lp-submit"
                      type="button"
                      style={{ flex: '0 0 auto', width: 'auto', padding: '0 20px' }}
                      onClick={() => { setOtpStep('request'); setDemoOtp(''); setOtpCode(''); }}
                    >
                      Back
                    </button>
                    <button
                      className="btn btn-primary lp-submit"
                      type="submit"
                      disabled={otpSubmitting || otpCode.length !== 6}
                      style={{ flex: 1 }}
                    >
                      {otpSubmitting ? 'Verifying…' : 'Verify & Sign In'}
                    </button>
                  </div>
                </form>
              )}

              <p className="lp-hint">For end users / residents only.</p>
            </div>
          )}
        </div>
      </div>
    </div>
    {/*<div className="login-screen">
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
            <p className="login-sub">Admins, engineers, contractors, supervisors, and workmen use email + password. End users use OTP only.</p>

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
            <p className="login-sub">End users can sign in using a one-time password sent to their registered email or phone. Try security@property.in or +919876543210.</p>

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
                </div>*/}
      </>
  );
}
