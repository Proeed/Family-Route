import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import MapView from '../components/MapView.jsx';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../api.js';
import { shortAddress } from '../lib/format.js';

const ROUTE_COLORS = ['#2f6f5e', '#3d5a80', '#c97b3f', '#8e4162'];
const LOCATION_POST_INTERVAL_MS = 4000;

export default function MapPage() {
  const { currentUser, refreshNotifications } = useApp();
  const [carpools, setCarpools] = useState([]);
  const [trips, setTrips] = useState([]);
  const routerLocation = useLocation();
  const navigate = useNavigate();
  const focusRoute = routerLocation.state?.focusRoute || null;
  const watchIdRef = useRef(null);
  const lastPostRef = useRef(0);

  const loadTrips = () => api.getTrips().then(setTrips).catch(() => {});

  useEffect(() => {
    if (!currentUser) return;
    api.getCarpools().then(setCarpools).catch(() => {});
    loadTrips();
    const interval = setInterval(loadTrips, 3000);
    return () => clearInterval(interval);
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  const myActiveTrip = trips.find((t) => t.pickerId === currentUser?.id && t.status !== 'completed');

  useEffect(() => {
    const clearWatch = () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
    if (!myActiveTrip || myActiveTrip.status !== 'in_progress' || !navigator.geolocation) {
      clearWatch();
      return;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const nowMs = Date.now();
        if (nowMs - lastPostRef.current < LOCATION_POST_INTERVAL_MS) return;
        lastPostRef.current = nowMs;
        api
          .postTripLocation(myActiveTrip.id, pos.coords.latitude, pos.coords.longitude)
          .then(loadTrips)
          .catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 2000 }
    );
    return clearWatch;
  }, [myActiveTrip?.id, myActiveTrip?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!currentUser) return null;

  const handleStart = async () => {
    await api.updateTripStatus(myActiveTrip.id, 'in_progress');
    loadTrips();
    refreshNotifications();
  };

  const handleComplete = async () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    await api.updateTripStatus(myActiveTrip.id, 'completed');
    loadTrips();
    refreshNotifications();
  };

  const relevantCarpools = carpools.filter(
    (c) => c.driverId === currentUser.id || c.passengers.includes(currentUser.id)
  );

  const activeTrips = trips.filter((t) => t.status !== 'completed');

  const routes = focusRoute
    ? [focusRoute]
    : [
        ...activeTrips.map((t, i) => ({
          id: `trip-${t.id}`,
          label: `Pickup — ${shortAddress(t.destination.address)}`,
          pickupLocation: t.pickupLocation,
          destination: t.destination,
          driverLocation: t.status === 'in_progress' ? t.driverLocation : null,
          color: ROUTE_COLORS[i % ROUTE_COLORS.length],
        })),
        ...relevantCarpools.map((c, i) => ({
          id: `cp-${c.id}`,
          label: `Carpool — ${c.pickupArea}`,
          pickupLocation: c.pickupLocation,
          destination: c.destination,
          color: ROUTE_COLORS[(i + 1) % ROUTE_COLORS.length],
        })),
      ];

  return (
    <div style={{ height: '100%', position: 'relative' }}>
      {focusRoute && (
        <button
          className="btn btn-secondary btn-sm"
          style={{ position: 'absolute', top: 14, right: 14, zIndex: 500 }}
          onClick={() => navigate('/map', { replace: true, state: null })}
        >
          Show all routes
        </button>
      )}

      {myActiveTrip && (
        <div className="card trip-control-panel">
          <div style={{ fontWeight: 700, fontSize: 14 }}>
            {myActiveTrip.status === 'not_started' ? 'Ready for pickup' : 'Trip in progress'}
          </div>
          <div className="muted" style={{ marginTop: 2 }}>
            {shortAddress(myActiveTrip.pickupLocation.address)} → {shortAddress(myActiveTrip.destination.address)}
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            {myActiveTrip.status === 'not_started' ? (
              <button className="btn btn-primary btn-sm" onClick={handleStart}>
                Start trip &amp; share location
              </button>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={handleComplete}>
                Mark dropped off
              </button>
            )}
          </div>
          {myActiveTrip.status === 'in_progress' && (
            <p className="faint" style={{ marginTop: 8 }}>
              Your live location is being shared until you mark drop-off.
            </p>
          )}
        </div>
      )}

      <MapView routes={routes} focusToken={routes.map((r) => r.id).join(',')} />
      {routes.length === 0 && !myActiveTrip && (
        <div className="card map-empty-banner">
          <p style={{ fontWeight: 600, fontSize: 14 }}>No active routes yet</p>
          <p className="muted" style={{ marginTop: 4 }}>
            {currentUser.role === 'parent'
              ? 'Routes appear here once you approve a pickup request or start a carpool.'
              : 'Once a pickup request or carpool is approved, the route will show up here automatically.'}
          </p>
        </div>
      )}
    </div>
  );
}
