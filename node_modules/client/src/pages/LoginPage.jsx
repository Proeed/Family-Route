import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import './AuthPage.css';

export default function LoginPage() {
  const { login } = useApp();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email.trim(), password);
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
        <h1 className="auth-title">Log in</h1>
        <p className="muted">Carpools, pickups, and messages — all in one place.</p>

        {error && <div className="auth-error">{error}</div>}

        <form className="stack" onSubmit={handleSubmit}>
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
              autoComplete="current-password"
              required
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={submitting} style={{ marginTop: 4 }}>
            {submitting ? 'Logging in…' : 'Log in'}
          </button>
        </form>

        <p className="muted" style={{ marginTop: 18, textAlign: 'center' }}>
          New here? <Link to="/signup">Create an account</Link>
        </p>

      </div>
    </div>
  );
}
