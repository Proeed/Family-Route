import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../api.js';
import StatusPill from '../components/StatusPill.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Modal from '../components/Modal.jsx';
import { carpoolDeadlines, formatDateTime, shortAddress } from '../lib/format.js';
import { geocodeInEdison } from '../lib/geocode.js';

const KIND_LABEL = { pickup: 'School Pickup', dropoff: 'School Drop-off' };

export default function CarpoolPage() {
  const { currentUser, refreshNotifications } = useApp();
  const [carpools, setCarpools] = useState([]);
  const [places, setPlaces] = useState([]);
  const [myRequests, setMyRequests] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [linkedKids, setLinkedKids] = useState([]);
  const [selectedKidId, setSelectedKidId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmCancelId, setConfirmCancelId] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    if (!currentUser) return;
    Promise.all([api.getCarpools(), api.getPlaces(), api.getCarpoolRequests(), api.getMyFamily()]).then(
      ([cp, pl, reqs, family]) => {
        setCarpools(cp);
        setPlaces(pl);
        const myCarpoolIds = cp.filter((c) => c.driverId === currentUser.id).map((c) => c.id);
        setPendingRequests(reqs.filter((r) => r.status === 'pending' && myCarpoolIds.includes(r.carpoolId)));
        setMyRequests(reqs.filter((r) => r.parentId === currentUser.id));
        const kids = family?.members?.filter((m) => m.role === 'kid') || [];
        setLinkedKids(kids);
        setSelectedKidId((prev) => (kids.some((k) => k.id === prev) ? prev : kids[0]?.id || ''));
        setLoading(false);
      }
    );
  };

  useEffect(load, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!currentUser) return null;

  const requestStatusFor = (carpoolId) =>
    myRequests.find((r) => r.carpoolId === carpoolId && r.kidId === selectedKidId)?.status || null;

  const handleJoin = async (carpoolId) => {
    setError('');
    try {
      await api.requestCarpool(carpoolId, selectedKidId, { parentApproved: true });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCancel = async (carpoolId) => {
    await api.cancelCarpool(carpoolId);
    setConfirmCancelId(null);
    load();
  };

  const handleDecision = async (requestId, status) => {
    await api.updateCarpoolRequest(requestId, status);
    load();
    refreshNotifications();
  };

  const selectedKid = linkedKids.find((k) => k.id === selectedKidId);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Carpool</h1>
          <p className="page-subtitle">Offer seats on rides you're driving, or request one for your kid.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          + Offer a carpool
        </button>
      </div>

      {error && <div className="auth-error">{error}</div>}

      {linkedKids.length === 0 && (
        <div className="card card-pad">
          <p className="muted">
            Link with your child through a family code before requesting a carpool seat for them — add one from your{' '}
            <Link to="/profile">Profile page</Link>.
          </p>
        </div>
      )}

      {linkedKids.length > 1 && (
        <div className="field" style={{ maxWidth: 260 }}>
          <label htmlFor="kidSelect">Requesting seats for</label>
          <select id="kidSelect" className="select" value={selectedKidId} onChange={(e) => setSelectedKidId(e.target.value)}>
            {linkedKids.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {pendingRequests.length > 0 && (
        <div className="card card-pad stack">
          <p style={{ fontWeight: 700, fontSize: 14 }}>Join requests waiting on you</p>
          {pendingRequests.map((r) => (
            <div key={r.id} className="row-between" style={{ padding: '8px 0', borderTop: '1px solid var(--color-border)' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {r.kid?.name} <span className="faint">(requested by {r.parent?.name})</span>
                </div>
                <div className="muted">wants a seat on your carpool to {shortAddress(r.carpool?.destination?.address)}</div>
              </div>
              <div className="row">
                <button className="btn btn-secondary btn-sm" onClick={() => handleDecision(r.id, 'declined')}>
                  Decline
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => handleDecision(r.id, 'approved')}>
                  Approve
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <p className="muted">Loading carpools…</p>
      ) : carpools.length === 0 ? (
        <div className="card">
          <EmptyState title="No active carpools yet" body="When someone creates a carpool, you'll see it here." />
        </div>
      ) : (
        <div className="stack">
          {carpools.map((c) => {
            const status = requestStatusFor(c.id);
            const isPassenger = selectedKidId && c.passengers.includes(selectedKidId);
            const isFull = c.passengers.length >= c.seatsTotal;
            const isExpired = c.effectiveStatus === 'expired';
            const deadlines = c.time ? carpoolDeadlines(c.time) : null;
            const pastRequestDeadline = deadlines ? Date.now() > deadlines.requestDeadline.getTime() : false;
            const canShowJoinArea = !isExpired && currentUser.id !== c.driverId && linkedKids.length > 0;

            return (
              <div key={c.id} className="card card-pad" style={isExpired ? { opacity: 0.6 } : undefined}>
                <div className="row-between">
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>
                      {KIND_LABEL[c.kind] || 'Carpool'} — {c.pickupArea}
                    </div>
                    <div className="muted" style={{ marginTop: 2 }}>
                      {shortAddress(c.pickupLocation.address)} → {shortAddress(c.destination.address)}
                    </div>
                  </div>
                  <StatusPill status={c.effectiveStatus} />
                </div>

                <div className="row" style={{ marginTop: 12, flexWrap: 'wrap', gap: 16 }}>
                  <InfoBit label="Driver" value={c.driver?.name} />
                  <InfoBit label="Ride time" value={c.time ? formatDateTime(c.time) : 'Flexible'} />
                  <InfoBit label="Seats" value={`${c.passengers.length} / ${c.seatsTotal}`} />
                </div>

                {c.passengerDetails.length > 0 && (
                  <div className="muted" style={{ marginTop: 10 }}>
                    Riding: {c.passengerDetails.map((p) => p.name).join(', ')}
                  </div>
                )}

                {canShowJoinArea && (
                  <div style={{ marginTop: 14 }}>
                    {isPassenger ? (
                      <span className="pill pill-approved">{selectedKid?.name} is confirmed</span>
                    ) : status === 'pending' ? (
                      <span className="pill pill-pending">Request pending</span>
                    ) : status === 'declined' ? (
                      <span className="pill pill-declined">Request declined</span>
                    ) : isFull ? (
                      <span className="pill pill-neutral">Carpool full</span>
                    ) : pastRequestDeadline ? (
                      <span className="pill pill-neutral">Request window closed</span>
                    ) : (
                      <>
                        <button className="btn btn-primary btn-sm" onClick={() => handleJoin(c.id)}>
                          Request seat for {selectedKid?.name}
                        </button>
                        {deadlines && (
                          <div className="faint" style={{ marginTop: 6 }}>
                            Accepting requests until 10:00 PM {deadlines.creationDay.toLocaleDateString()}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {currentUser.id === c.driverId && !isExpired && (
                  <div style={{ marginTop: 14 }}>
                    {confirmCancelId === c.id ? (
                      <div className="row" style={{ gap: 8 }}>
                        <span className="muted">Cancel this carpool? Riders will be notified.</span>
                        <button className="btn btn-secondary btn-sm" onClick={() => setConfirmCancelId(null)}>
                          Keep it
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleCancel(c.id)}>
                          Yes, cancel
                        </button>
                      </div>
                    ) : (
                      <button className="btn btn-ghost btn-sm" onClick={() => setConfirmCancelId(c.id)}>
                        Cancel carpool
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {createOpen && (
        <CreateCarpoolModal
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

function InfoBit({ label, value }) {
  return (
    <div>
      <div className="faint" style={{ textTransform: 'uppercase', letterSpacing: '0.03em' }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function CreateCarpoolModal({ places, onClose, onCreated }) {
  // "School Drop-off" = home -> school (morning). "School Pickup" = school ->
  // home (afternoon). Same shape as the pickup-request toggle, mirrored.
  const [kind, setKind] = useState('dropoff');
  const schoolIsPickup = kind === 'pickup';

  const [schoolPlaceId, setSchoolPlaceId] = useState(places[0]?.id || '');
  const [address, setAddress] = useState('');
  const [time, setTime] = useState('');
  const [seatsTotal, setSeatsTotal] = useState(3);
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
      await api.createCarpool({
        kind,
        pickupArea: address,
        pickupLocation,
        destination,
        time: time ? new Date(time).toISOString() : null,
        seatsTotal,
      });
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Offer a carpool" onClose={onClose}>
      {error && <div className="auth-error">{error}</div>}

      <div className="notice-callout">
        <strong>
          It is recommended to create your pass a day before you need the carpool, in case your kid doesn't have a
          phone — so they'll be aware of getting picked up by the driver.
        </strong>
      </div>

      <form className="stack" onSubmit={handleSubmit} id="create-carpool-form">
        <div className="field">
          <label>What kind of ride?</label>
          <div className="role-picker" style={{ flexDirection: 'row' }}>
            <button
              type="button"
              className={`role-option ${kind === 'dropoff' ? 'role-option-active' : ''}`}
              onClick={() => setKind('dropoff')}
              style={{ flex: 1 }}
            >
              <span className="role-option-label">School Drop-off</span>
              <span className="faint">Home → school</span>
            </button>
            <button
              type="button"
              className={`role-option ${kind === 'pickup' ? 'role-option-active' : ''}`}
              onClick={() => setKind('pickup')}
              style={{ flex: 1 }}
            >
              <span className="role-option-label">School Pickup</span>
              <span className="faint">School → home</span>
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
              <label htmlFor="address">Drop-off area</label>
              <input
                id="address"
                className="input"
                placeholder="e.g. Clara Barton neighborhood"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
              />
            </div>
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="address">Pickup area</label>
              <input
                id="address"
                className="input"
                placeholder="e.g. Clara Barton neighborhood"
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

        <div className="row" style={{ gap: 12 }}>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="time">Ride date &amp; time</label>
            <input id="time" type="datetime-local" className="input" value={time} onChange={(e) => setTime(e.target.value)} required />
            <span className="faint">Must be created the day before, by 8:00 PM.</span>
          </div>
          <div className="field" style={{ width: 100 }}>
            <label htmlFor="seats">Seats</label>
            <input
              id="seats"
              type="number"
              min="1"
              max="8"
              className="input"
              value={seatsTotal}
              onChange={(e) => setSeatsTotal(e.target.value)}
            />
          </div>
        </div>
      </form>
      <div className="modal-footer" style={{ margin: '0 -18px -18px', paddingTop: 14 }}>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" form="create-carpool-form" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Looking up address…' : 'Create carpool'}
        </button>
      </div>
    </Modal>
  );
}
