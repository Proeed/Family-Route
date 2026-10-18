import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';
import { useApp } from '../context/AppContext.jsx';

export default function SafetyDashboardPage() {
  const { currentUser } = useApp();
  const [dashboard, setDashboard] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sosOpen, setSosOpen] = useState(false);
  const [sosMessage, setSosMessage] = useState('');
  const [sosError, setSosError] = useState('');
  const [sosSent, setSosSent] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [dash, safety] = await Promise.all([api.getSafetyDashboard(), api.getSafetyStatus()]);
      setDashboard(dash);
      setStatus(safety);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleQuickAction = async (action) => {
    if (action === 'sos') {
      setSosError('');
      setSosSent(false);
      setSosMessage('');
      setSosOpen(true);
      return;
    }
    setBusy(true);
    try {
      if (action === 'verify-parent') {
        await api.verifyParent('micro-payment-check', 'manual-review');
      } else if (action === 'verify-driver') {
        await api.verifyDriver('valid', 'valid', 'FamilyRoute Verified Family Vehicle');
      } else if (action === 'family-token') {
        const result = await api.createFamilyAccessToken();
        alert(`Family token created: ${result.token}. It expires in 15 minutes.`);
      } else if (action === 'boarding-pin') {
        const pin = window.prompt('Set a 4-digit boarding PIN for the child.', '2468');
        if (!pin) return;
        await api.setBoardingPin(pin);
      }
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const sendSos = async (event) => {
    event.preventDefault();
    setBusy(true);
    setSosError('');
    try {
      await api.triggerSos({ message: sosMessage.trim() || 'Emergency SOS triggered from FamilyRoute.' });
      setSosSent(true);
      await load();
    } catch (err) {
      setSosError(err.message || 'Unable to send emergency alert right now.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="page"><div className="card card-pad"><p className="muted">Loading safety dashboard…</p></div></div>;
  if (error) return <div className="page"><div className="card card-pad"><div className="auth-error">{error}</div></div></div>;

  const events = dashboard?.safetyEvents || [];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Safety Dashboard</h1>
          <p className="page-subtitle">Guardian oversight, trip checks, and ride safety status.</p>
        </div>
      </div>

      <div className="stack">
        <div className="card card-pad">
          <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Overview</p>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <Badge label="Family members" value={dashboard?.familyMembers?.length || 0} />
            <Badge label="Trips tracked" value={dashboard?.rideHistory?.length || 0} />
            <Badge label="Friends connected" value={dashboard?.activeFriendList?.length || 0} />
            <Badge label="Safety events" value={events.length} />
          </div>
        </div>

        <div className="card card-pad">
          <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Quick safety actions</p>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            {currentUser?.role === 'kid' && (
              <button className="btn btn-danger btn-sm" onClick={() => handleQuickAction('sos')} disabled={busy}>Trigger SOS</button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={() => handleQuickAction('verify-parent')} disabled={busy}>Verify parent</button>
            <button className="btn btn-secondary btn-sm" onClick={() => handleQuickAction('verify-driver')} disabled={busy}>Verify driver</button>
            <button className="btn btn-secondary btn-sm" onClick={() => handleQuickAction('family-token')} disabled={busy}>Family token</button>
            <button className="btn btn-secondary btn-sm" onClick={() => handleQuickAction('boarding-pin')} disabled={busy}>Boarding PIN</button>
          </div>
          <div className="stack" style={{ marginTop: 12 }}>
            <InfoRow label="Parental verification" value={status?.parentVerified ? 'Verified' : 'Needs verification'} />
            <InfoRow label="Driver verification" value={status?.driverVerified ? 'Approved' : 'Required'} />
            <InfoRow label="Current family token" value={status?.familyAccessToken?.token || 'Not created'} />
            <InfoRow label="Boarding PIN" value={status?.boardingPin || 'Not set'} />
          </div>
        </div>

        <div className="card card-pad">
          <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Family members</p>
          <div className="stack">
            {(dashboard?.familyMembers || []).map((member) => (
              <div key={member.id} className="row-between" style={{ padding: '8px 0', borderTop: '1px solid var(--color-border)' }}>
                <div className="row" style={{ gap: 10 }}>
                  <span className="avatar" style={{ background: member.avatarColor }}>{member.name[0]}</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>{member.name}</div>
                    <div className="muted">{member.role}</div>
                  </div>
                </div>
                <span className="pill pill-neutral">{member.safety?.verifiedParent ? 'Verified adult' : member.role === 'kid' ? 'Child profile' : 'Standard user'}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card card-pad">
          <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Recent trip activity</p>
          <div className="stack">
            {(dashboard?.rideHistory || []).length === 0 ? (
              <p className="muted">No trip history yet.</p>
            ) : (
              dashboard.rideHistory.map((trip) => (
                <div key={trip.id} className="row-between" style={{ padding: '8px 0', borderTop: '1px solid var(--color-border)' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>Trip {trip.id.slice(0, 8)}</div>
                    <div className="muted">{trip.status}</div>
                  </div>
                  <div className="muted">{new Date(trip.createdAt).toLocaleString()}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card card-pad">
          <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Trusted friends</p>
          <div className="stack">
            {(dashboard?.activeFriendList || []).length === 0 ? (
              <p className="muted">No active trusted friends yet.</p>
            ) : (
              dashboard.activeFriendList.map((friend) => (
                <div key={friend.id} className="row-between" style={{ padding: '8px 0', borderTop: '1px solid var(--color-border)' }}>
                  <div className="row" style={{ gap: 8 }}>
                    <span className="avatar" style={{ background: friend.avatarColor }}>{friend.name[0]}</span>
                    <span style={{ fontWeight: 600 }}>{friend.name}</span>
                  </div>
                  <span className="pill pill-neutral">Connected</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card card-pad">
          <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Safety events log</p>
          <div className="stack">
            {events.length === 0 ? (
              <p className="muted">No safety events recorded yet.</p>
            ) : (
              events.map((event) => (
                <div key={event.id} className="row-between" style={{ padding: '8px 0', borderTop: '1px solid var(--color-border)' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{event.eventType}</div>
                    <div className="muted">{event.summary}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="pill pill-neutral" style={{ marginBottom: 4 }}>{event.severity}</div>
                    <div className="muted">{new Date(event.createdAt).toLocaleString()}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      {sosOpen && (
        <Modal title="Emergency SOS" onClose={() => setSosOpen(false)}>
          {sosSent ? (
            <div className="stack">
              <p role="status">Emergency alert sent to your family contacts.</p>
              <button className="btn btn-primary" onClick={() => setSosOpen(false)}>Close</button>
            </div>
          ) : (
            <form className="stack" onSubmit={sendSos}>
              <p className="muted">This sends an alert to your family contacts through FamilyRoute notifications. It does not contact emergency services.</p>
              <div className="field">
                <label htmlFor="sos-message">Message for your family (optional)</label>
                <textarea id="sos-message" className="input" rows="3" value={sosMessage} onChange={(event) => setSosMessage(event.target.value)} maxLength={300} />
              </div>
              {sosError && <div className="auth-error" role="alert">{sosError}</div>}
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setSosOpen(false)} disabled={busy}>Cancel</button>
                <button type="submit" className="btn btn-danger" disabled={busy}>{busy ? 'Sending…' : 'Send emergency alert'}</button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}

function Badge({ label, value }) {
  return (
    <div className="card card-pad" style={{ minWidth: 120 }}>
      <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="row-between" style={{ padding: '8px 0', borderTop: '1px solid var(--color-border)' }}>
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
