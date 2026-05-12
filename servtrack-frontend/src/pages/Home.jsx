import React from 'react';
import { Link } from 'react-router-dom';
import './Home.css';

const ROLE_STEPS = [
  ['End User', 'Raises a request with OTP-only access and receives final completion approval.'],
  ['Client Engineers', 'Junior, Assistant, and Commandant engineers review, assign, and govern service work.'],
  ['Contractor Team', 'Contractor managers assign supervisors and workmen, then execute and submit QC.'],
  ['Super Admin', 'Onboards clients and tracks platform-level health without handling tenant PII.'],
];

const SECURITY_POINTS = [
  'End-user names, email, phone, and address are encrypted at field level.',
  'OTP/password secrets are hashed and never stored as plain values.',
  'Client data is scoped by tenant, linked contractors, and assigned users.',
];

export default function Home() {
  return (
    <div className="home-page">
      <section className="home-hero" aria-label="ServTrack overview">
        <img className="home-hero-image" src="/servtrack-product-preview.png" alt="" />
        <div className="home-hero-shade" />
        <header className="home-nav">
          <div className="home-brand">Serv<span>Track</span></div>
          <Link className="btn btn-primary" to="/login">Sign In</Link>
        </header>
        <div className="home-hero-content">
          <div className="home-kicker">Facility service request management</div>
          <h1>One workflow from request to verified closure.</h1>
          <p>
            ServTrack connects end users, client engineers, contractors, supervisors, and workmen in a governed maintenance flow with OTP access and encrypted end-user PII.
          </p>
          <div className="home-actions">
            <Link className="btn btn-primary" to="/login">Open ServTrack</Link>
            <a className="btn home-secondary" href="#flow">View role flow</a>
          </div>
        </div>
      </section>

      <main>
        <section id="flow" className="home-section">
          <div className="home-section-heading">
            <div className="home-kicker">Operational Flow</div>
            <h2>Every role sees the work at the right moment.</h2>
          </div>
          <div className="home-flow">
            {ROLE_STEPS.map(([role, text], index) => (
              <div className="home-flow-step" key={role}>
                <div className="home-step-number">{String(index + 1).padStart(2, '0')}</div>
                <h3>{role}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="home-section home-split">
          <div>
            <div className="home-kicker">Implemented Controls</div>
            <h2>Built for tenant-safe Phase 1 demos.</h2>
            <p>
              The current system covers client onboarding, contractor linking, contract scoping, service request assignment, work execution, QC, requester approval, notifications, and dashboards.
            </p>
          </div>
          <div className="home-security-list">
            {SECURITY_POINTS.map(point => (
              <div className="home-security-item" key={point}>
                <span />
                <p>{point}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
