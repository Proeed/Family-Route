import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../api.js';

const ROLE_LABELS = { parent: 'Parent', kid: 'Kid' };

const ROLE_BLURB = {
  parent: 'You can drive: offer carpools, approve your kids’ pickup requests, and pick up requests from other parents.',
  kid: 'You can ask your linked parent for a pickup once you join their family.',
};

export default function ProfilePage() {
  const { currentUser } = useApp();
  const [family, setFamily] = useState(undefined);
  const [joinCode, setJoinCode] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [safetyStatus, setSafetyStatus] = useState(null);
  const [familyToken, setFamilyToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadFamily = () => api.getMyFamily().then(setFamily);
  const loadSafety = () => api.getSafetyStatus().then(setSafetyStatus).catch(() => setSafetyStatus(null));

  useEffect(() => {
    loadFamily();
    loadSafety();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!currentUser) return null;

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.createFamily(familyName.trim() || undefined);
      await loadFamily();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.joinFamily(joinCode.trim(), { parentApproved: currentUser.role === 'kid' ? true : undefined });
      await loadFamily();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    setBusy(true);
    try {
      await api.leaveFamily();
      await loadFamily();
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyParent = async () => {
    setBusy(true);
    try {
      await api.verifyParent('micro-payment-check', 'manual-review');
      await loadSafety();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyDriver = async () => {
    setBusy(true);
    try {
      await api.verifyDriver('valid', 'valid', 'FamilyRoute Verified Family Vehicle');
      await loadSafety();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateFamilyToken = async () => {
    setBusy(true);
    try {
      const result = await api.createFamilyAccessToken();
      setFamilyToken(`${result.token}`);
      await loadSafety();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSetBoardingPin = async () => {
    setBusy(true);
    try {
      const pin = window.prompt('Enter a 4-digit boarding PIN for the child account', '2468');
      if (!pin) return;
      await api.setBoardingPin(pin);
      await loadSafety();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Profile</h1>
          <p className="page-subtitle">Your account details in FamilyRoute.</p>
        </div>
      </div>

      <div className="card card-pad row" style={{ gap: 16 }}>
        <span className="avatar" style={{ width: 56, height: 56, fontSize: 22, background: currentUser.avatarColor }}>
          {currentUser.name[0]}
        </span>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{currentUser.name}</div>
          <div className="muted">{currentUser.email}</div>
          <span className="pill pill-neutral" style={{ marginTop: 4 }}>
            {ROLE_LABELS[currentUser.role]}
          </span>
        </div>
      </div>

      <div className="card card-pad">
        <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>What you can do</p>
        <p className="muted">{ROLE_BLURB[currentUser.role]}</p>
      </div>

      <div className="card card-pad stack">
        <p style={{ fontWeight: 700, fontSize: 14 }}>Safety & compliance</p>
        <div className="stack" style={{ gap: 10 }}>
          <div className="row-between">
            <span className="muted">Parental verification</span>
            <span className="pill pill-neutral">{safetyStatus?.parentVerified ? 'Verified' : 'Pending'}</span>
          </div>
          {currentUser.role === 'parent' && (
            <button className="btn btn-secondary btn-sm" onClick={handleVerifyParent} disabled={busy}>
              Complete verification
            </button>
          )}
          {currentUser.role === 'parent' && (
            <div className="row-between">
              <span className="muted">Driver credential check</span>
              <span className="pill pill-neutral">{safetyStatus?.driverVerified ? 'Approved' : 'Required'}</span>
            </div>
          )}
          {currentUser.role === 'parent' && (
            <button className="btn btn-secondary btn-sm" onClick={handleVerifyDriver} disabled={busy}>
              Submit driver documents
            </button>
          )}
          {family && currentUser.role === 'parent' && (
            <>
              <div className="row-between">
                <span className="muted">Family access token</span>
                <span className="pill pill-neutral">{familyToken || safetyStatus?.familyAccessToken?.token || 'Not created'}</span>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={handleGenerateFamilyToken} disabled={busy}>
                Generate short-lived family token
              </button>
            </>
          )}
          {currentUser.role === 'kid' && (
            <button className="btn btn-secondary btn-sm" onClick={handleSetBoardingPin} disabled={busy}>
              Set 4-digit boarding PIN
            </button>
          )}
        </div>
      </div>

      <div className="card card-pad stack">
        <p style={{ fontWeight: 700, fontSize: 14 }}>Family</p>

        {family === undefined ? (
          <p className="muted">Loading…</p>
        ) : family ? (
          <div className="stack">
            <div>
              <div className="faint" style={{ textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Family code
              </div>
              <div className="family-code">{family.code}</div>
              <p className="muted" style={{ marginTop: 4 }}>
                Share this code so a parent or kid can link their account to {family.name}.
              </p>
            </div>
            <div>
              <div className="faint" style={{ textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 6 }}>
                Members
              </div>
              <div className="stack" style={{ gap: 8 }}>
                {family.members.map((m) => (
                  <div key={m.id} className="row" style={{ gap: 8 }}>
                    <span className="avatar" style={{ width: 26, height: 26, fontSize: 12, background: m.avatarColor }}>
                      {m.name[0]}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</span>
                    <span className="pill pill-neutral">{ROLE_LABELS[m.role]}</span>
                  </div>
                ))}
              </div>
            </div>
            <button className="btn btn-danger btn-sm" style={{ alignSelf: 'flex-start' }} onClick={handleLeave} disabled={busy}>
              Leave family
            </button>
          </div>
        ) : (
          <div className="stack">
            <p className="muted">
              Link your account to a family so kids can request pickups from their linked parents, and parents get
              notified automatically.
            </p>
            {error && <div className="auth-error">{error}</div>}
            <form className="row" onSubmit={handleJoin}>
              <input
                className="input"
                placeholder="Enter a family code (e.g. SUNNY12)"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                style={{ flex: 1 }}
              />
              <button className="btn btn-primary" type="submit" disabled={busy || !joinCode.trim()}>
                Join
              </button>
            </form>
            {currentUser.role === 'parent' && (
              <form className="row" onSubmit={handleCreate}>
                <input
                  className="input"
                  placeholder="New family name (optional)"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button className="btn btn-secondary" type="submit" disabled={busy}>
                  Create family
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
