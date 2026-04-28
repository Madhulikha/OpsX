import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

const DEMO_USERS = [
  { label: 'Client Admin', email: 'admin@propertyclient.in', password: 'Admin@1234' },
  { label: 'Contractor', email: 'manager@alphaserv.in', password: 'Contractor@1234' },
  { label: 'Supervisor', email: 'ramesh@alphaserv.in', password: 'Super@1234' },
  { label: 'Workman', email: 'suresh@alphaserv.in', password: 'Work@1234' },
  { label: 'End User', email: 'security@property.in', password: 'User@1234' },
];

export default function Login() {
  const navigate = useNavigate();
  const { login, showToast } = useApp();
  const [email, setEmail] = useState(DEMO_USERS[0].email);
  const [password, setPassword] = useState(DEMO_USERS[0].password);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
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

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">Serv<span>Track</span></div>
        <h1 className="login-title">Connect frontend to live backend</h1>
        <p className="login-sub">
          Sign in with one of the seeded backend users to load real work orders, notifications,
          and role-based access from FastAPI.
        </p>

        <div className="login-demo-users">
          {DEMO_USERS.map(user => (
            <button
              key={user.email}
              className="login-demo-btn"
              type="button"
              onClick={() => {
                setEmail(user.email);
                setPassword(user.password);
              }}
            >
              {user.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
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
      </div>
    </div>
  );
}
