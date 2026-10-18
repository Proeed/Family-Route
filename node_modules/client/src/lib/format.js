export function shortAddress(address) {
  if (!address) return '';
  return address.split(',')[0];
}

export function relativeTime(isoString) {
  if (!isoString) return '';
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

export function formatTime(isoString) {
  if (!isoString) return '';
  return new Date(isoString).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatDateTime(isoString) {
  if (!isoString) return '';
  return new Date(isoString).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Mirrors the server's rule: offers are created the day before the ride, by
// 8 PM; requests to join must land by 10 PM that same day.
export function carpoolDeadlines(rideTimeIso) {
  const rideDay = startOfDay(new Date(rideTimeIso));
  const creationDay = new Date(rideDay);
  creationDay.setDate(creationDay.getDate() - 1);
  const creationDeadline = new Date(creationDay);
  creationDeadline.setHours(20, 0, 0, 0);
  const requestDeadline = new Date(creationDay);
  requestDeadline.setHours(22, 0, 0, 0);
  return { creationDay, creationDeadline, requestDeadline };
}

export function googleMapsDirectionsUrl(origin, destination) {
  const params = new URLSearchParams({ api: '1' });
  if (origin) params.set('origin', `${origin.lat},${origin.lng}`);
  if (destination) params.set('destination', `${destination.lat},${destination.lng}`);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
