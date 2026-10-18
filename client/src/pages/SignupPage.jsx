import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../api.js';
import './AuthPage.css';

const ROLES = [
  { value: 'parent', label: 'Parent', desc: 'Drive carpools, approve pickups, and request rides from other parents.' },
  { value: 'kid', label: 'Kid', desc: 'Ask your linked parent for a pickup.' },
];

export default function SignupPage() {
  const { signup } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('parent');
  const [familyCode, setFamilyCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signup({ name: name.trim(), email: email.trim(), password, role });
      if (familyCode.trim()) {
        try {
          await api.joinFamily(familyCode.trim(), { parentApproved: role === 'kid' ? true : undefined });
        } catch {
          // Account is created either way; family linking can be retried from Profile.
        }
      }
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <div className="auth-brand">
          <span className="brand-mark">🚗</span>
          <span className="brand-name">FamilyRoute</span>
        </div>
        <h1 className="auth-title">Create an account</h1>
        <p className="muted">It takes less than a minute.</p>

        {error && <div className="auth-error">{error}</div>}

        <form className="stack" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="name">Full name</label>
            <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>

          <div className="field">
            <label>I am a…</label>
            <div className="role-picker">
              {ROLES.map((r) => (
                <button
                  type="button"
                  key={r.value}
                  className={`role-option ${role === r.value ? 'role-option-active' : ''}`}
                  onClick={() => setRole(r.value)}
                >
                  <span className="role-option-label">{r.label}</span>
                  <span className="faint">{r.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="familyCode">Family code (optional)</label>
            <input
              id="familyCode"
              className="input"
              placeholder="e.g. SUNNY12"
              value={familyCode}
              onChange={(e) => setFamilyCode(e.target.value.toUpperCase())}
            />
            <span className="faint">Got a code from a parent or family member? Enter it to link up right away.</span>
          </div>

          <button className="btn btn-primary" type="submit" disabled={submitting} style={{ marginTop: 4 }}>
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="muted" style={{ marginTop: 18, textAlign: 'center' }}>
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
