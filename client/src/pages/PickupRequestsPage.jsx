import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../api.js';
import StatusPill from '../components/StatusPill.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Modal from '../components/Modal.jsx';
import { formatDateTime, shortAddress } from '../lib/format.js';
import { geocodeInEdison } from '../lib/geocode.js';

const KIND_LABEL = { pickup: 'Pickup', dropoff: 'Drop-off' };

export default function PickupRequestsPage() {
  const { currentUser, refreshNotifications } = useApp();
  const [requests, setRequests] = useState([]);
  const [places, setPlaces] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!currentUser) return;
    Promise.all([api.getPickupRequests(), api.getPlaces()]).then(([reqs, pl]) => {
      setRequests(reqs);
      setPlaces(pl);
      setLoading(false);
    });
  };

  useEffect(load, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!currentUser) return null;

  const isKid = currentUser.role === 'kid';

  const handleDecision = async (id, status) => {
    await api.updatePickupRequest(id, { status });
    load();
    refreshNotifications();
  };

  // The server only returns requests you submitted, or ones involving a kid
  // in your family — so "not mine and still pending" is exactly what needs a
  // decision from me right now.
  const actionable = requests.filter((r) => r.status === 'pending' && r.requesterId !== currentUser.id);
  const rest = requests.filter((r) => !actionable.includes(r));

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pickup Requests</h1>
          <p className="page-subtitle">
            {isKid
              ? 'Ask your linked parent for a pickup or drop-off and track its status.'
              : 'Approve pickup and drop-off requests from your kids.'}
          </p>
        </div>
        {isKid && (
          <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
            + Request a pickup or drop-off
          </button>
        )}
      </div>

      {isKid && !currentUser.familyId && (
        <div className="card card-pad">
          <p className="muted">
            You're not linked to a family yet. Ask a parent for their family code and add it from your{' '}
            <Link to="/profile">Profile page</Link> before requesting a pickup.
          </p>
        </div>
      )}

      {loading ? (
        <p className="muted">Loading requests…</p>
      ) : requests.length === 0 ? (
        <div className="card">
          <EmptyState
            title="Nothing here yet"
            body={isKid ? "You haven't asked for anything yet. Create a request to get started." : 'Requests from your kids will show up here.'}
          />
        </div>
      ) : (
        <div className="stack">
          {actionable.length > 0 && (
            <Section title="Waiting on you">
              {actionable.map((r) => (
                <RequestCard key={r.id} request={r} canDecide onDecision={handleDecision} />
              ))}
            </Section>
          )}
          {rest.length > 0 && (
            <Section title={actionable.length > 0 ? 'Everything else' : 'Your requests'}>
              {rest.map((r) => (
                <RequestCard key={r.id} request={r} onDecision={handleDecision} />
              ))}
            </Section>
          )}
        </div>
      )}

      {createOpen && (
        <CreatePickupRequestModal
          places={places}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="stack">
      <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
        {title}
      </p>
      <div className="stack">{children}</div>
    </div>
  );
}

function RequestCard({ request, canDecide, onDecision }) {
  const kindLabel = KIND_LABEL[request.kind] || 'Pickup';
  return (
    <div className="card card-pad">
      <div className="row-between">
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {kindLabel} — {canDecide ? request.requester?.name : shortAddress(request.destination.address)}
          </div>
          <div className="muted" style={{ marginTop: 2 }}>
            {shortAddress(request.pickupLocation.address)} → {shortAddress(request.destination.address)}
          </div>
        </div>
        <StatusPill status={request.status} />
      </div>

      <div className="row" style={{ marginTop: 10, flexWrap: 'wrap', gap: 16 }}>
        {request.time && <div className="faint">Requested for {formatDateTime(request.time)}</div>}
        <div className="faint">Submitted {formatDateTime(request.createdAt)}</div>
      </div>

      {request.notes && (
        <p className="muted" style={{ marginTop: 8, fontStyle: 'italic' }}>
          “{request.notes}”
        </p>
      )}

      {canDecide && (
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => onDecision(request.id, 'declined')}>
            Decline
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => onDecision(request.id, 'approved')}>
            Approve {kindLabel.toLowerCase()}
          </button>
        </div>
      )}

      {request.status === 'approved' && (
        <p className="muted" style={{ marginTop: 10 }}>
          Route and live tracking are available in Messages and on the Map.
        </p>
      )}
    </div>
  );
}

function CreatePickupRequestModal({ places, onClose, onCreated }) {
  // "Pickup" = kid is at school, needs a ride home: pickup = school, drop-off
  // = their address. "Drop-off" = kid is at home, needs a ride to school:
  // pickup = their address, drop-off = school. Same request, mirrored.
  const [kind, setKind] = useState('pickup');
  const schoolIsPickup = kind === 'pickup';

  const [schoolPlaceId, setSchoolPlaceId] = useState(places[0]?.id || '');
  const [address, setAddress] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const school = places.find((p) => p.id === schoolPlaceId);
      const typed = await geocodeInEdison(address);
      const pickupLocation = schoolIsPickup ? school : typed;
      const destination = schoolIsPickup ? typed : school;
      await api.createPickupRequest({
        kind,
        pickupLocation,
        destination,
        notes,
        time: time ? new Date(time).toISOString() : null,
      });
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Request a pickup or drop-off" onClose={onClose}>
      {error && <div className="auth-error">{error}</div>}
      <form className="stack" onSubmit={handleSubmit} id="create-pickup-form">
        <div className="field">
          <label>What do you need?</label>
          <div className="role-picker" style={{ flexDirection: 'row' }}>
            <button
              type="button"
              className={`role-option ${kind === 'pickup' ? 'role-option-active' : ''}`}
              onClick={() => setKind('pickup')}
              style={{ flex: 1 }}
            >
              <span className="role-option-label">Pickup</span>
              <span className="faint">I'm at school, need a ride home</span>
            </button>
            <button
              type="button"
              className={`role-option ${kind === 'dropoff' ? 'role-option-active' : ''}`}
              onClick={() => setKind('dropoff')}
              style={{ flex: 1 }}
            >
              <span className="role-option-label">Drop-off</span>
              <span className="faint">I'm home, need a ride to school</span>
            </button>
          </div>
        </div>

        {schoolIsPickup ? (
          <>
            <div className="field">
              <label htmlFor="schoolPlace">Pickup school</label>
              <select id="schoolPlace" className="select" value={schoolPlaceId} onChange={(e) => setSchoolPlaceId(e.target.value)}>
                {places.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="address">Drop-off address</label>
              <input
                id="address"
                className="input"
                placeholder="e.g. 12 Oak Tree Rd"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
              />
            </div>
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="address">Pickup address</label>
              <input
                id="address"
                className="input"
                placeholder="e.g. 12 Oak Tree Rd"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="schoolPlace">Drop-off school</label>
              <select id="schoolPlace" className="select" value={schoolPlaceId} onChange={(e) => setSchoolPlaceId(e.target.value)}>
                {places.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        <div className="field">
          <label htmlFor="time">When do you need it?</label>
          <input id="time" type="datetime-local" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="notes">Notes (optional)</label>
          <textarea
            id="notes"
            className="textarea"
            placeholder="e.g. Wearing a red backpack, will be waiting by the front gate"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </form>
      <div className="modal-footer" style={{ margin: '0 -18px -18px', paddingTop: 14 }}>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" form="create-pickup-form" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Looking up address…' : 'Send request'}
        </button>
      </div>
    </Modal>
  );
}
