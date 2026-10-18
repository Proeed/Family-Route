import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './MapView.css';
import { googleMapsDirectionsUrl, shortAddress } from '../lib/format.js';

const EDISON_CENTER = [40.5187, -74.4121];
// Keeps the map scoped to Edison, NJ — panning/zooming can't leave this box.
const EDISON_BOUNDS = [
  [40.44, -74.55],
  [40.6, -74.28],
];

function pinIcon(color, emoji) {
  return L.divIcon({
    className: 'pin-icon',
    html: `<div class="pin" style="--pin-color:${color}"><span>${emoji}</span></div>`,
    iconSize: [30, 38],
    iconAnchor: [15, 36],
    popupAnchor: [0, -34],
  });
}

const ICONS = {
  pickup: pinIcon('#2f6f5e', '🧍'),
  destination: pinIcon('#c97b3f', '🏁'),
  driver: pinIcon('#3d5a80', '🚗'),
};

async function fetchRoadRoute(a, b, signal) {
  const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error('routing failed');
  const data = await res.json();
  const coords = data?.routes?.[0]?.geometry?.coordinates;
  if (!coords || !coords.length) throw new Error('no route');
  return coords.map(([lng, lat]) => [lat, lng]);
}

function RouteLine({ route }) {
  const [path, setPath] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setPath(null);
    setFailed(false);
    fetchRoadRoute(route.pickupLocation, route.destination, controller.signal)
      .then(setPath)
      .catch(() => setFailed(true));
    return () => controller.abort();
  }, [route.id]);

  const straight = [
    [route.pickupLocation.lat, route.pickupLocation.lng],
    [route.destination.lat, route.destination.lng],
  ];

  if (path) {
    return <Polyline positions={path} pathOptions={{ color: route.color, weight: 4, opacity: 0.85 }} />;
  }
  if (failed) {
    return (
      <Polyline
        positions={straight}
        pathOptions={{ color: route.color, weight: 3, opacity: 0.6, dashArray: '6 8' }}
      />
    );
  }
  return null;
}

function FitBounds({ routes, requestId }) {
  const map = useMap();
  useEffect(() => {
    if (!routes.length) return;
    const points = routes.flatMap((r) => [
      [r.pickupLocation.lat, r.pickupLocation.lng],
      [r.destination.lat, r.destination.lng],
    ]);
    map.fitBounds(points, { padding: [60, 60], maxZoom: 15 });
  }, [routes, requestId, map]);
  return null;
}

function LocateControl() {
  const map = useMap();
  const [locating, setLocating] = useState(false);

  const handleLocate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.flyTo([pos.coords.latitude, pos.coords.longitude], 14, { duration: 0.8 });
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 6000 }
    );
  };

  return (
    <button className="map-control locate-control" onClick={handleLocate} title="My location">
      {locating ? '…' : '◎'}
    </button>
  );
}

export default function MapView({ routes = [], focusToken }) {
  const center = useMemo(() => {
    if (routes[0]) return [routes[0].pickupLocation.lat, routes[0].pickupLocation.lng];
    return EDISON_CENTER;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="map-wrap">
      <MapContainer
        center={center}
        zoom={13}
        minZoom={11}
        maxBounds={EDISON_BOUNDS}
        maxBoundsViscosity={1.0}
        className="leaflet-container-full"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {routes.map((route) => (
          <RouteLine key={route.id} route={route} />
        ))}
        {routes.map((route) => (
          <Marker
            key={`${route.id}-pickup`}
            position={[route.pickupLocation.lat, route.pickupLocation.lng]}
            icon={ICONS.pickup}
          />
        ))}
        {routes.map((route) => (
          <Marker
            key={`${route.id}-dest`}
            position={[route.destination.lat, route.destination.lng]}
            icon={ICONS.destination}
          />
        ))}
        {routes
          .filter((route) => route.driverLocation)
          .map((route) => (
            <Marker
              key={`${route.id}-live`}
              position={[route.driverLocation.lat, route.driverLocation.lng]}
              icon={ICONS.driver}
            />
          ))}
        <FitBounds routes={routes} requestId={focusToken} />
        <LocateControl />
      </MapContainer>

      {routes.length > 0 && (
        <div className="map-legend card">
          <div className="map-legend-title">Active routes</div>
          <div className="stack" style={{ gap: 8 }}>
            {routes.map((route) => (
              <div key={route.id} className="map-legend-row">
                <span className="legend-dot" style={{ background: route.color }} />
                <div className="legend-text">
                  <div className="legend-label">
                    {route.label}
                    {route.driverLocation && <span className="live-badge">● live</span>}
                  </div>
                  <div className="faint">
                    {shortAddress(route.pickupLocation.address)} → {shortAddress(route.destination.address)}
                  </div>
                </div>
                <a
                  className="btn btn-ghost btn-sm"
                  href={googleMapsDirectionsUrl(route.pickupLocation, route.destination)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in Google Maps
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
